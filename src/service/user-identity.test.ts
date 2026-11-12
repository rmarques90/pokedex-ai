import assert from 'node:assert/strict';
import test from 'node:test';
import { createUserIdentityService } from './user-identity.js';

test('normalizes and validates names before delegating to the store', () => {
  const calls: Array<[string, string]> = [];
  const service = createUserIdentityService({
    findOrCreateByName(name, normalizedName) {
      calls.push([name, normalizedName]);
      return { id: '00000000-0000-4000-8000-000000000001', name };
    },
    close() {},
  });
  assert.deepEqual(service.login({ name: '  Érika ' }), { id: '00000000-0000-4000-8000-000000000001', name: 'Érika' });
  assert.deepEqual(calls, [['Érika', 'érika']]);
  assert.throws(() => service.login({ name: '  ' }));
  assert.equal(calls.length, 1);
});
