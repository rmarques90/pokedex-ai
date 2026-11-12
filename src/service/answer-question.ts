import {
  AskQuestionSchema,
  AskResultSchema,
  PokemonLookupSchema,
  ModelGenerationError,
  RetrievalError,
  RetrievedEvidenceSchema,
  type AskResult,
  type PokemonLookup,
  type RetrievedEvidence,
} from '../domain/ask.js';
import type { PokemonVectorStore } from '../store/lance-db-store.js';
import { embedQuery, type QueryEmbeddingClient } from './openrouter-embeddings.js';
import type { PokemonAnswerGenerator } from './openrouter-chat-model.js';
import type { PromptInjectionGuardrail } from './prompt-injection-guardrail.js';

export const INITIAL_RETRIEVAL_TOP_K = 5;
const INSUFFICIENT_EVIDENCE_ANSWER_PT = 'Os dados indexados não contêm informação suficiente para responder a esta pergunta.';
export const INSUFFICIENT_EVIDENCE_ANSWER = 'The indexed Pokémon data does not contain enough information to answer this question.';

export interface AnswerQuestionDependencies {
  collectionName: string;
  store: Pick<PokemonVectorStore, 'searchByVector' | 'lookup'>;
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
  const guardedQuestion = await dependencies.guardrail.checkQuestion(question);

  let retrieved: RetrievedEvidence[];
  const intent = classifyQuestion(question);
  if (intent) {
    try {
      retrieved = (await dependencies.store.lookup(dependencies.collectionName, intent.lookup))
        .map((item) => RetrievedEvidenceSchema.parse(item));
    } catch (error) {
      if (error instanceof RetrievalError) throw error;
      throw new RetrievalError('Pokemon evidence retrieval failed.', { cause: error });
    }
  } else {
    const vector = await embedQuery(dependencies.embeddings, question);
  try {
    retrieved = (await dependencies.store.searchByVector(dependencies.collectionName, vector, INITIAL_RETRIEVAL_TOP_K))
      .map((item) => RetrievedEvidenceSchema.parse(item));
  } catch (error) {
    if (error instanceof RetrievalError) throw error;
    throw new RetrievalError('Pokémon evidence retrieval failed.', { cause: error });
  }
  }

  if (retrieved.length === 0) {
    if (intent?.lookup.kind === 'id' || intent?.lookup.kind === 'name') {
      const answer = isPortuguese(question)
        ? 'Não há um registro correspondente na base indexada.'
        : 'No matching Pokémon record is available in the indexed data.';
      return AskResultSchema.parse({ answer, abstained: true, sources: [] });
    }
    return AskResultSchema.parse({
      answer: isPortuguese(question) ? INSUFFICIENT_EVIDENCE_ANSWER_PT : INSUFFICIENT_EVIDENCE_ANSWER,
      abstained: true,
      sources: [],
    });
  }

  const guardedEvidence = dependencies.guardrail.checkEvidence(retrieved);
  let generated: GeneratedAnswerResult;
  try {
    generated = await dependencies.generator.generate({ question: guardedQuestion, evidence: guardedEvidence });
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
  const sources = usedEvidence.flatMap((item) => item.sources);
  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  return AskResultSchema.parse({ answer: generated.answer, abstained: false, sources: uniqueSources });
}

type ClassifiedQuestion = { lookup: PokemonLookup };

const POKEMON_TYPE_ALIASES: Record<string, string[]> = {
  normal: ['normal'], fire: ['fire', 'fogo'], water: ['water', 'agua'], electric: ['electric', 'eletrico'],
  grass: ['grass', 'planta', 'grama'], ice: ['ice', 'gelo'], fighting: ['fighting', 'lutador'],
  poison: ['poison', 'veneno'], ground: ['ground', 'terra'], flying: ['flying', 'voador'],
  psychic: ['psychic', 'psiquico'], bug: ['bug', 'inseto'], rock: ['rock', 'pedra'],
  ghost: ['ghost', 'fantasma'], dragon: ['dragon', 'dragao'], dark: ['dark', 'noturno'],
  steel: ['steel', 'aco'], fairy: ['fairy', 'fada'],
};
const NON_POKEMON_NAME_WORDS = new Set([
  'a', 'an', 'the', 'your', 'my', 'this', 'that', 'pokemon', 'best', 'better', 'strongest', 'favorite', 'type', 'stats',
]);

function classifyQuestion(question: string): { lookup: PokemonLookup } | undefined {
  const id = extractNationalDexId(question);
  if (id !== undefined) return { lookup: PokemonLookupSchema.parse({ kind: 'id', id }) };

  const type = extractBestType(question);
  if (type) return { lookup: PokemonLookupSchema.parse({ kind: 'type', type }) };

  const name = extractCanonicalName(question);
  if (name) return { lookup: PokemonLookupSchema.parse({ kind: 'name', name }) };
  return undefined;
}

function extractNationalDexId(question: string): number | undefined {
  const patterns = [
    /#\s*(\d{1,6})\b/i,
    /\b(?:national\s+)?p(?:ok[eé])?dex\s+(?:number|no\.?)\s*(\d{1,6})\b/i,
    /\b(?:pokemon|pok[eé]mon)\s+(?:number|n[uú]mero|n[º°o])\s*(\d{1,6})\b/i,
    /\b(?:which|what)\s+(?:pokemon|pok[eé]mon)\s+is\s+number\s+(\d{1,6})\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(question);
    if (match?.[1]) return Number(match[1]);
  }
  return undefined;
}

function extractBestType(question: string): string | undefined {
  const normalized = normalizeText(question);
  const asksBest = /\b(best|strongest|most powerful|melhor|mais forte|maior total)\b/i.test(normalized);
  if (!asksBest || !/\bpokemon\b/i.test(normalized)) return undefined;
  const matches = Object.entries(POKEMON_TYPE_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => hasWord(normalized, alias)))
    .map(([canonical]) => canonical);
  return matches.length === 1 ? matches[0] : undefined;
}

function extractCanonicalName(question: string): string | undefined {
  const name = "([\\p{L}][\\p{L}\\p{M}'-]*)";
  const patterns = [
    new RegExp(`\\b(?:tell me about|describe|who is|what is|information about|stats for|types? for)\\s+(?:the\\s+)?(?:pokemon\\s+)?${name}`, 'iu'),
    new RegExp(`\\bwhat\\s+(?:types?|stats|description)\\s+(?:does|do|is|are)\\s+${name}`, 'iu'),
    new RegExp(`\\bwhat\\s+is\\s+(?:the\\s+)?(?:type|stats|description)\\s+of\\s+${name}`, 'iu'),
    new RegExp(`\\b(?:which|what)\\s+(?:pokemon|pok[eé]mon)\\s+is\\s+${name}`, 'iu'),
    new RegExp(`\\b(?:qual (?:e|é)|quem é)\\s+(?:o\\s+)?(?:pokemon\\s+)?${name}`, 'iu'),
    new RegExp(`\\b(?:type|stats|description|tipo|estatisticas|descricao)\\s+(?:of|for|do|da)\\s+${name}`, 'iu'),
  ];
  if (/\bmr\s+mime\b/i.test(question)) return 'mr-mime';
  for (const pattern of patterns) {
    const match = pattern.exec(question);
    if (match?.[1]) {
      const candidate = match[1].trim();
      if (!NON_POKEMON_NAME_WORDS.has(normalizeText(candidate))) return candidate.replaceAll(/\s+/g, '-');
    }
  }
  return undefined;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hasWord(value: string, word: string): boolean {
  return new RegExp(`(^|[^a-z])${word}($|[^a-z])`, 'i').test(value);
}

function isPortuguese(question: string): boolean {
  return /\b(qual|quem|como|planta|numero|melhor|sobre|quais|pelo)\b/i.test(normalizeText(question));
}
