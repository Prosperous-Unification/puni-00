import { createHash } from 'node:crypto';

import type { DependencyActivationReceipt } from '@wbs/contracts/dependency-runtime';

import type { EnvName } from './env';

/** Safe diagnostics only. Private SQL, configuration and subprocess causes are deliberately discarded. */
export class DependencyActivationFailure extends Error {
  constructor(
    attempt: string,
    stage: string,
    environment: EnvName | undefined,
    committed: ReadonlyMap<EnvName, DependencyActivationReceipt>,
  ) {
    super(
      `complete dependency activation refused; attempt=${attempt}; stage=${stage}; environment=${environment ?? 'none'}; committed=${JSON.stringify([...committed].map(([environment, receipt]) => ({ environment, receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') })))}`,
    );
    this.name = 'DependencyActivationFailure';
  }
}
