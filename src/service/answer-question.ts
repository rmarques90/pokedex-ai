import {
  AskQuestionSchema,
  AskResultSchema,
  ModelGenerationError,
  RetrievalError,
  RetrievedEvidenceSchema,
  type AskResult,
  type RetrievedEvidence,
} from '../domain/ask.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';
import { embedQuery, type QueryEmbeddingClient } from './openrouter-embeddings.js';
import type { PokemonAnswerGenerator } from './openrouter-chat-model.js';
import type { PromptInjectionGuardrail } from './prompt-injection-guardrail.js';

export const INITIAL_RETRIEVAL_TOP_K = 5;
export const INSUFFICIENT_EVIDENCE_ANSWER = 'The indexed Pokémon data does not contain enough information to answer this question.';

export interface AnswerQuestionDependencies {
  collectionName: string;
  store: Pick<PokemonVectorStore, 'searchByVector'>;
  embeddings: QueryEmbeddingClient;
  generator: PokemonAnswerGenerator;
  guardrail: PromptInjectionGuardrail;
}

export interface GeneratedAnswerResult {
  answer: string;
  abstained: boolean;
  usedPokemonIds: number[];
}

export async function answerQuestion(questionInput: unknown, dependencies: AnswerQuestionDependencies): Promise<AskResult> {
  const question = AskQuestionSchema.parse(questionInput);
  await dependencies.guardrail.invoke({ question, evidence: [] });

  const vector = await embedQuery(dependencies.embeddings, question);
  let retrieved: RetrievedEvidence[];
  try {
    retrieved = (await dependencies.store.searchByVector(dependencies.collectionName, vector, INITIAL_RETRIEVAL_TOP_K))
      .map((item) => RetrievedEvidenceSchema.parse(item));
  } catch (error) {
    if (error instanceof RetrievalError) throw error;
    throw new RetrievalError('Pokémon evidence retrieval failed.', { cause: error });
  }

  if (retrieved.length === 0) {
    return AskResultSchema.parse({ answer: INSUFFICIENT_EVIDENCE_ANSWER, abstained: true, sources: [] });
  }

  const guarded = await dependencies.guardrail.invoke({ question, evidence: retrieved });
  let generated: GeneratedAnswerResult;
  try {
    generated = await dependencies.generator.generate({ question: guarded.question, evidence: guarded.evidence });
  } catch (error) {
    if (error instanceof ModelGenerationError) throw error;
    throw new ModelGenerationError('OpenRouter answer generation failed.', { cause: error });
  }

  if (generated.abstained) {
    return AskResultSchema.parse({ answer: generated.answer, abstained: true, sources: [] });
  }

  const retrievedById = new Map(retrieved.map((item) => [item.id, item]));
  const citedRecords = [...new Set(generated.usedPokemonIds)].map((id) => retrievedById.get(id));
  if (citedRecords.length === 0 || citedRecords.some((item) => item === undefined)) {
    throw new ModelGenerationError('The generated answer did not reference valid retrieved evidence.');
  }
  const usedEvidence = citedRecords.filter((item): item is RetrievedEvidence => item !== undefined);
  const sources = usedEvidence.flatMap((item) => item!.sources);
  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  return AskResultSchema.parse({ answer: generated.answer, abstained: false, sources: uniqueSources });
}
