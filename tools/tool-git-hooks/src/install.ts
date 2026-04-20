import { resolve } from 'node:path';

import { $ } from 'bun';

async function main(): Promise<void> {
  const root = resolve(import.meta.dir, '..', '..', '..');
  console.log('[tool-git-hooks] installing lefthook in', root);
  await $`bunx lefthook install`.cwd(root);
  console.log('[tool-git-hooks] hooks installed — pre-commit + commit-msg are active.');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[tool-git-hooks] install failed:', msg);
    console.error(
      '[tool-git-hooks] make sure lefthook is installed: bun add -d lefthook, then re-run.',
    );
    process.exit(1);
  });
}
