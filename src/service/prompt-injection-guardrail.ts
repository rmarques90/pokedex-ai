import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import { AskQuestionSchema, PromptGuardrailError, RetrievedEvidenceSchema } from '../domain/ask.js';

const GuardrailInputSchema = z.object({
  question: AskQuestionSchema,
  evidence: z.array(RetrievedEvidenceSchema),
}).strict();

export type GuardrailInput = z.infer<typeof GuardrailInputSchema>;

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|override|forget)\b.{0,80}\b(previous|prior|all|system|developer)\b.{0,30}\b(instructions|rules|prompts?)\b/i,
  /\b(reveal|show|print|expose|repeat)\b.{0,50}\b(system prompt|hidden instructions|api key|secret|credentials)\b/i,
  /\b(use|search|browse|consult)\b.{0,40}\b(the )?(internet|web|external knowledge|other sources)\b/i,
  /<\|(?:system|assistant|developer|im_start|im_sep)\|>/i,
];

export function containsPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateGuardrailInput(input: unknown): GuardrailInput {
  const parsed = GuardrailInputSchema.parse(input);
  if (containsPromptInjection(parsed.question)) {
    throw new PromptGuardrailError('The question contains instructions that conflict with safe, evidence-only answering.');
  }
  if (parsed.evidence.some(({ text }) => containsPromptInjection(text))) {
    throw new PromptGuardrailError('Retrieved Pokémon evidence contains unsafe instructions and cannot be used.');
  }
  return parsed;
}

export type PromptInjectionGuardrail = Pick<ReturnType<typeof createPromptInjectionGuardrail>, 'invoke'>;

export function createPromptInjectionGuardrail() {
  return RunnableLambda.from((input: GuardrailInput): GuardrailInput => validateGuardrailInput(input));
}
