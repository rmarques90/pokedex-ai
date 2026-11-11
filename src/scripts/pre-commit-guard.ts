import { pathToFileURL } from 'node:url';

const protectedPaths = new Set([
  '.githooks/pre-commit',
  'src/domain/pokemon-vector-document.ts',
  'src/store/lance-db-store.ts',
  'src/scripts/pre-commit-guard.ts',
]);
const requiredTestPath = 'src/domain/pokemon-vector-document.test.ts';

export function checkProtectedChanges(stagedPaths: string[], reviewConfirmed: boolean): string | undefined {
  if (!stagedPaths.some((path) => protectedPaths.has(path.replaceAll('\\', '/')))) return undefined;
  if (!reviewConfirmed) return 'Guardrail files changed. Re-stage the safeguard tests and set POKEDEX_GUARDRAIL_REVIEWED=1 after human review.';
  if (!stagedPaths.some((path) => path.replaceAll('\\', '/') === requiredTestPath)) {
    return `Guardrail changes require a staged safeguard test: ${requiredTestPath}`;
  }
  return undefined;
}

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const paths = input.split(/\r?\n/).filter(Boolean);
  const failure = checkProtectedChanges(paths, process.env.POKEDEX_GUARDRAIL_REVIEWED === '1');
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Pre-commit guard failed');
    process.exitCode = 1;
  });
}
