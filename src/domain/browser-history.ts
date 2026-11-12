import { z } from 'zod';
import { AskResultSchema } from './ask.js';

export const MAX_HISTORY_ENTRIES = 100;

export const BrowserHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  createdAt: z.string().datetime(),
  question: z.string().trim().min(1),
  result: AskResultSchema,
}).strict();
export type BrowserHistoryEntry = z.infer<typeof BrowserHistoryEntrySchema>;

export const BrowserHistoryDocumentSchema = z.object({
  version: z.literal(1),
  activeConversationId: z.string().uuid(),
  entries: z.array(BrowserHistoryEntrySchema).max(MAX_HISTORY_ENTRIES),
}).strict().superRefine((document, context) => {
  const ids = new Set<string>();
  document.entries.forEach((entry, index) => {
    if (ids.has(entry.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'id'], message: 'History entry IDs must be unique.' });
    ids.add(entry.id);
  });
});
export type BrowserHistoryDocument = z.infer<typeof BrowserHistoryDocumentSchema>;
