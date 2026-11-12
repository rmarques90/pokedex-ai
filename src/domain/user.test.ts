import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginRequestSchema, normalizeUserName, PublicUserSchema } from './user.js';

test('trims names and validates Unicode character limits', () => {
  assert.deepEqual(LoginRequestSchema.parse({ name: '  Ash Ketchum  ' }), { name: 'Ash Ketchum' });
  assert.equal(LoginRequestSchema.safeParse({ name: '   ' }).success, false);
  assert.equal(LoginRequestSchema.safeParse({ name: 'A'.repeat(51) }).success, false);
  assert.equal(LoginRequestSchema.safeParse({ name: '😀'.repeat(50) }).success, true);
  assert.equal(LoginRequestSchema.safeParse({ name: '😀'.repeat(51) }).success, false);
});

test('normalizes compatibility forms, whitespace, and letter casing consistently', () => {
  assert.equal(normalizeUserName('  ＡSH  '), normalizeUserName('ash'));
  assert.equal(normalizeUserName('  Érika '), normalizeUserName('e\u0301RIKA'));
});

test('validates public user identity without exposing store fields', () => {
  assert.deepEqual(PublicUserSchema.parse({ id: '00000000-0000-4000-8000-000000000001', name: 'Ash' }), {
    id: '00000000-0000-4000-8000-000000000001', name: 'Ash',
  });
  assert.equal(PublicUserSchema.safeParse({ id: 'bad', name: 'Ash', normalizedName: 'ash' }).success, false);
});
