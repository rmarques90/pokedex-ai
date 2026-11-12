import { z } from 'zod';
import { AskResultSchema } from './ask.js';

export const AskStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal('replace'), reason: z.enum(['fallback', 'revision', 'retry']), text: z.string() }).strict(),
  z.object({ type: z.literal('complete'), result: AskResultSchema }).strict(),
  z.object({ type: z.literal('error'), error: z.string().min(1), retryable: z.boolean() }).strict(),
]);

export type AskStreamEvent = z.infer<typeof AskStreamEventSchema>;
export type AskStreamUpdate = Extract<AskStreamEvent, { type: 'delta' | 'replace' }>;
