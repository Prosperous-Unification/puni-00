import { join } from 'node:path';

import { createShebang } from '@shared/bun-startup';

/** Build one import-closed executable launcher pinned to the producing Bun runtime. */
export async function buildLintLauncher(): Promise<Uint8Array> {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, '../lint-cli.ts')],
    target: 'bun',
    format: 'esm',
    // Proof: launcher-build-pin; `standalone Bun lint boundary > runs optional inactive selection only after actual Git preflight` fails with this injected fault and passes after restoration.
    define: { __PUNI_LINT_BUN_VERSION__: JSON.stringify(Bun.version) },
  });
  // Proof: launcher-build-count; `refuses a launcher build that is empty` fails with this injected fault and passes after restoration.
  // Proof: launcher-build-success; `refuses a launcher build that is unsuccessful` fails with this injected fault and passes after restoration.
  if (!built.success || built.outputs.length !== 1)
    throw new Error('cannot build standalone Bun lint launcher');
  // Proof: launcher-shebang-delivery; `runs the actual generated shebang with candidate startup preload erased` fails with this injected fault and passes after restoration.
  return new TextEncoder().encode(createShebang() + '\n' + (await built.outputs[0].text()));
}
