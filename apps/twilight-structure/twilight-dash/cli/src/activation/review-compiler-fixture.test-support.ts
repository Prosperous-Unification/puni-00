import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { CompilerDerivativeLimits, CompilerDerivativeMembers } from '@twilight-burokrat/judge';

import { members, names } from './review-compiler.test.fixture';

export function createMembers(): CompilerDerivativeMembers {
  return {
    'LICENSE.txt': Uint8Array.from(members['LICENSE.txt']),
    NOTICE: Uint8Array.from(members.NOTICE),
    'compiler.cjs': Uint8Array.from(members['compiler.cjs']),
    'manifest.json': Uint8Array.from(members['manifest.json']),
  };
}
export function createLimits(): CompilerDerivativeLimits {
  return {
    maximumMemberBytes: 20000000,
    maximumTotalBytes: 30000000,
    maximumOwnedBytes: 300000000,
    maximumLoadMilliseconds: 10000,
  };
}
export function readLibrary(name: string): string {
  return readFileSync(
    createRequire(import.meta.url).resolve(`@typescript/old/lib/${name}`),
    'utf8',
  );
}
export async function writeCompilerDerivative(directory: string): Promise<void> {
  await mkdir(directory);
  for (const name of names) await writeFile(join(directory, name), members[name]);
}
