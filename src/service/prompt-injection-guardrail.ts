import { z } from 'zod';
import {
  AskQuestionSchema,
  PromptGuardrailError,
  RetrievedEvidenceSchema,
  type RetrievedEvidence,
} from '../domain/ask.js';
import type { PromptSafetyClassifier } from './openrouter-prompt-safety.js';

const GuardrailInputSchema = z.object({
  question: AskQuestionSchema,
  evidence: z.array(RetrievedEvidenceSchema),
}).strict();

export type GuardrailInput = z.infer<typeof GuardrailInputSchema>;
export interface PromptInjectionGuardrail {
  checkQuestion(question: unknown, signal?: AbortSignal): Promise<string>;
  checkEvidence(evidence: unknown): RetrievedEvidence[];
}

const INJECTION_PATTERNS = [
  /\b(ignore|disregard|override|forget)\b.{0,80}\b(previous|prior|all|system|developer)\b.{0,30}\b(instructions|rules|prompts?)\b/i,
  /\b(ignore|ignora|desconsidere|desconsidera|esque[cç]a)\b.{0,80}\b(all|everything|tudo|todas? as instru[cç][õo]es)\b/i,
  /\b(ignore|ignora|desconsidere|desconsidera|esque[cç]a)\b.{0,80}\b(and|e)\b.{0,30}\b(say|diga|responda|afirme)\b/i,
  /\b(reveal|show|print|expose|repeat)\b.{0,50}\b(system prompt|hidden instructions|api key|secret|credentials)\b/i,
  /\b(use|search|browse|consult)\b.{0,40}\b(the )?(internet|web|external knowledge|other sources)\b/i,
  /<\|(?:system|assistant|developer|im_start|im_sep)\|>/i,
];

export function containsPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function validateQuestionPattern(question: string): void {
  if (containsPromptInjection(question)) {
    throw new PromptGuardrailError('The question contains instructions that conflict with safe, evidence-only answering.');
  }
}

export function validateGuardrailInput(input: unknown): GuardrailInput {
  const parsed = GuardrailInputSchema.parse(input);
  validateQuestionPattern(parsed.question);
  if (parsed.evidence.some(({ text }) => containsPromptInjection(text))) {
    throw new PromptGuardrailError('Retrieved Pokémon evidence contains unsafe instructions and cannot be used.');
  }
  return parsed;
}

export function createPromptInjectionGuardrail(classifier: PromptSafetyClassifier): PromptInjectionGuardrail {
  return {
    async checkQuestion(input, signal) {
      const question = AskQuestionSchema.parse(input);
      validateQuestionPattern(question);
      const verdict = await classifier.assess(question, signal);
      if (!verdict.safe) throw new PromptGuardrailError();
      return question;
    },
    checkEvidence(input) {
      const evidence = z.array(RetrievedEvidenceSchema).parse(input);
      if (evidence.some(({ text }) => containsPromptInjection(text))) {
        throw new PromptGuardrailError('Retrieved Pokémon evidence contains unsafe instructions and cannot be used.');
      }
      return evidence;
    },
  };
}
