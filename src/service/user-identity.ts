import { LoginRequestSchema, normalizeUserName, type PublicUser } from '../domain/user.js';
import type { UserStore } from '../store/sqlite-user-store.js';

export interface UserIdentityService {
  login(input: unknown): PublicUser;
}

export function createUserIdentityService(store: UserStore): UserIdentityService {
  return {
    login(input) {
      const { name } = LoginRequestSchema.parse(input);
      return store.findOrCreateByName(name, normalizeUserName(name));
    },
  };
}
