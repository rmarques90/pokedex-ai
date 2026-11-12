import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANGUAGE_STORAGE_KEY,
  UI_COPY,
  isLanguage,
  readLanguagePreference,
  saveLanguagePreference,
} from './i18n.js';

test('defaults to Portuguese when no preference is stored', () => {
  assert.equal(readLanguagePreference(null), 'pt');
  assert.equal(readLanguagePreference({ getItem: () => null }), 'pt');
});

test('restores a supported language preference', () => {
  assert.equal(readLanguagePreference({ getItem: () => 'en' }), 'en');
});

test('ignores an unsupported language preference', () => {
  assert.equal(readLanguagePreference({ getItem: () => 'fr' }), 'pt');
  assert.equal(isLanguage('pt'), true);
  assert.equal(isLanguage('en'), true);
  assert.equal(isLanguage('fr'), false);
});

test('saves the selected language under the project preference key', () => {
  let savedKey = '';
  let savedValue = '';
  saveLanguagePreference('en', {
    setItem(key, value) {
      savedKey = key;
      savedValue = value;
    },
  });
  assert.equal(savedKey, LANGUAGE_STORAGE_KEY);
  assert.equal(savedValue, 'en');
});

test('keeps localization keys aligned between Portuguese and English', () => {
  assert.deepEqual(Object.keys(UI_COPY.pt).sort(), Object.keys(UI_COPY.en).sort());
});

test('continues using the Portuguese default when local storage throws', () => {
  assert.equal(readLanguagePreference({ getItem: () => { throw new Error('storage unavailable'); } }), 'pt');
  assert.doesNotThrow(() => saveLanguagePreference('en', { setItem: () => { throw new Error('storage unavailable'); } }));
});
