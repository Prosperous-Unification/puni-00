import type { RuntimeReceipt2, RuntimeScope } from '@wbs/contracts';

import type { StoredRuntimeAcceptance1 } from './runtime-command-history1';
export type { StoredRuntimeAcceptance1 } from './runtime-command-history1';

/** Permanent installation identity and retained-row witnesses, never a cache of current claims. */
export type RuntimeLedger = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  authorityCount: number;
  bindingCount: number;
  receiptCount: number;
}>;

/** Trusted accepted-record storage; canonical bytes remain authoritative alongside their digest. */
export type StoredRuntimeAcceptance2 = Readonly<{
  schemaVersion: 2;
  scope: RuntimeScope;
  commandId: string;
  canonicalRequest: string;
  requestDigest: string;
  receipt: RuntimeReceipt2;
}>;

/** Immutable raw historical read union; insertion accepts only version2. */
export type StoredRuntimeAcceptance = StoredRuntimeAcceptance1 | StoredRuntimeAcceptance2;
