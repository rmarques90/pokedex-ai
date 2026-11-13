import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '../..');

test('declares a self-contained SVG favicon served from the public root', async () => {
  const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
  const faviconPath = resolve(projectRoot, 'public/favicon.svg');

  assert.match(
    html,
    /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\btype=["']image\/svg\+xml["'])(?=[^>]*\bhref=["']\/favicon\.svg["'])[^>]*>/i,
  );

  const svg = await readFile(faviconPath, 'utf8');
  assert.match(svg, /<svg\b/i);
  assert.match(svg, /viewBox=["']0 0 64 64["']/i);
  assert.match(svg, /#f04438/i);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b/i);
  assert.doesNotMatch(svg, /(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i);
  assert.doesNotMatch(svg, /url\(\s*["']?(?:https?:|\/\/|data:)/i);
});
