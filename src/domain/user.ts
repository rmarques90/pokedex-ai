import { z } from 'zod';

export const USER_NAME_MAX_LENGTH = 50;

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

export const UserNameSchema = z.string()
  .transform((value) => value.trim())
  .refine((value) => unicodeLength(value) >= 1, 'Name must not be empty.')
  .refine((value) => unicodeLength(value) <= USER_NAME_MAX_LENGTH, `Name must contain at most ${USER_NAME_MAX_LENGTH} characters.`);

export const LoginRequestSchema = z.object({ name: UserNameSchema }).strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  name: UserNameSchema,
}).strict();
export type PublicUser = z.infer<typeof PublicUserSchema>;

/** Produce a locale-independent key for name lookup and uniqueness. */
export function normalizeUserName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase();
}
