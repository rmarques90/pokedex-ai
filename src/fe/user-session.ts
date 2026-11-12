import { PublicUserSchema, type PublicUser } from '../domain/user.js';

export const USER_STORAGE_KEY = 'pokedex-ai.active-user';

export interface UserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readActiveUser(storage: Pick<UserStorage, 'getItem'> | null): PublicUser | null {
  try {
    const raw = storage?.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = PublicUserSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function saveActiveUser(user: PublicUser, storage: Pick<UserStorage, 'setItem'> | null): boolean {
  try { storage?.setItem(USER_STORAGE_KEY, JSON.stringify(PublicUserSchema.parse(user))); return storage !== null; }
  catch { return false; }
}

export function clearActiveUser(storage: Pick<UserStorage, 'removeItem'> | null): void {
  try { storage?.removeItem(USER_STORAGE_KEY); } catch { /* Keep in-memory logout effective when storage is unavailable. */ }
}
