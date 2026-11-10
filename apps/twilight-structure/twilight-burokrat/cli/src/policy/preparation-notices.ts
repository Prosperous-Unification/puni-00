import { join } from 'node:path';

import { prepareCompiler } from '../packaging/preparation-compiler';
import { readOperatorFile } from './preparation-inputs';
import type { PreparationNotice } from './prepared-activation';
import type { BunToolkit } from './toolkit';

/**
 * Derive legal notices from the already verified raw compiler closure and pinned transform.
 * Adjacent toolkit notice files are not descriptor authority and are never copied. The empty
 * compiler-free profile is explicit for controlled peers; partial selected compilers refuse.
 * @throws for missing/nonregular/unreadable or changed pinned compiler/license/notice bytes.
 */
export function readPreparationNotices(
  toolkit: Pick<BunToolkit, 'directory' | 'trustedNodeModules'>,
):
  | { readonly kind: 'compiler-free'; readonly notices: readonly [] }
  | { readonly kind: 'compiler'; readonly notices: readonly PreparationNotice[] } {
  const hasCompiler = toolkit.trustedNodeModules.includes('@typescript/old');
  if (!hasCompiler) {
    // Proof: c27-notices-partial-compiler; injected fault failed `models compiler-free toolkits explicitly while refusing an incomplete selected compiler roster`; restoration passed.
    if (toolkit.trustedNodeModules.includes('typescript'))
      throw new Error('preparation compiler roster is incomplete');
    return { kind: 'compiler-free', notices: [] };
  }
  const root = join(toolkit.directory, 'trusted-node-modules/@typescript/old');
  const prepared = prepareCompiler(
    new TextDecoder('utf-8', { fatal: true }).decode(
      readOperatorFile(join(root, 'lib/typescript.js')),
    ),
    readOperatorFile(join(root, 'LICENSE.txt')),
    readOperatorFile(join(root, 'ThirdPartyNoticeText.txt')),
  );
  return {
    kind: 'compiler',
    notices: [
      { path: 'licenses/typescript-preparation/LICENSE.txt', bytes: prepared.license },
      { path: 'licenses/typescript-preparation/NOTICE', bytes: prepared.notice },
    ],
  };
}
