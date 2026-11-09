import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { buildCompilerDerivative } from '../packaging/compiler-derivative';
import type {
  CompilerDerivativeLimits,
  CompilerDerivativeMembers,
} from './compiler-derivative-artifact';

const resolve = createRequire(import.meta.url).resolve;
export function createMembers(): CompilerDerivativeMembers {
  const directory = dirname(resolve('@typescript/old/lib/typescript.js'));
  const built = buildCompilerDerivative(readFileSync(join(directory, 'typescript.js'), 'utf8'));
  return {
    'compiler.cjs': new TextEncoder().encode(built.source),
    'manifest.json': new TextEncoder().encode(`${JSON.stringify(built.manifest, null, 2)}\n`),
    'LICENSE.txt': new Uint8Array(readFileSync(join(directory, '../LICENSE.txt'))),
    NOTICE: new TextEncoder().encode(
      readFileSync(join(directory, '../ThirdPartyNoticeText.txt'), 'utf8') +
        'TypeScript 6.0.3, Copyright Microsoft Corporation. Apache License 2.0.\nModified by Prosperous Unification: compiler-options paths substitution observation.\n',
    ),
  };
}
export function createLimits(): CompilerDerivativeLimits {
  return {
    maximumMemberBytes: 20_000_000,
    maximumTotalBytes: 30_000_000,
    maximumOwnedBytes: 300_000_000,
    maximumLoadMilliseconds: 10000,
  };
}
export function readLibrary(name: string): string {
  return readFileSync(resolve(`@typescript/old/lib/${name}`), 'utf8');
}
