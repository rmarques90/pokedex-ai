import { z } from 'zod';
import { AskResultSchema } from './ask.js';

export const ConversationIdSchema = z.string().uuid();
export const ConversationUserIdSchema = z.string().uuid();
export const ConversationCursorSchema = z.string().min(1).max(256);

export const ConversationInteractionSchema = z.object({
  id: z.string().uuid(),
  conversationId: ConversationIdSchema,
  createdAt: z.string().datetime(),
  question: z.string().trim().min(1).max(20_000),
  result: AskResultSchema,
}).strict();
export type ConversationInteraction = z.infer<typeof ConversationInteractionSchema>;

export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  latestQuestion: z.string().max(240).nullable(),
}).strict();
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const ConversationPageSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
  nextCursor: ConversationCursorSchema.nullable(),
}).strict();
export type ConversationPage = z.infer<typeof ConversationPageSchema>;

export const ConversationDetailSchema = z.object({
  id: ConversationIdSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  interactions: z.array(ConversationInteractionSchema).max(50),
}).strict();
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

export const MemoryCategorySchema = z.enum(['response_preference', 'knowledge_level', 'pokemon_interest']);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const MemoryCandidateSchema = z.object({
  fact: z.string().trim().min(1).max(240),
  category: MemoryCategorySchema,
}).strict();
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export const MemoryExtractionSchema = z.object({
  memories: z.array(MemoryCandidateSchema).max(5),
}).strict();
export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export const ConversationMemorySchema = MemoryCandidateSchema.extend({
  id: z.string().uuid(),
  userId: ConversationUserIdSchema,
  conversationId: ConversationIdSchema,
  sourceInteractionId: z.string().uuid(),
  createdAt: z.string().datetime(),
}).strict();
export type ConversationMemory = z.infer<typeof ConversationMemorySchema>;

export const MemoryExtractionJobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export const MemoryExtractionJobSchema = z.object({
  interactionId: z.string().uuid(),
  userId: ConversationUserIdSchema,
  conversationId: ConversationIdSchema,
  status: MemoryExtractionJobStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.string().datetime(),
  leaseExpiresAt: z.string().datetime().nullable(),
  lastErrorCategory: z.string().max(40).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type MemoryExtractionJob = z.infer<typeof MemoryExtractionJobSchema>;

export const ConversationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: ConversationCursorSchema.optional(),
}).strict();
export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

export const ConversationAskContextSchema = z.object({
  userId: ConversationUserIdSchema,
  conversationId: ConversationIdSchema,
}).strict();
export type ConversationAskContext = z.infer<typeof ConversationAskContextSchema>;

export const ConversationAskRequestSchema = z.object({
  question: z.string().trim().min(1),
  userId: ConversationUserIdSchema,
  conversationId: ConversationIdSchema,
}).strict();
export type ConversationAskRequest = z.infer<typeof ConversationAskRequestSchema>;
