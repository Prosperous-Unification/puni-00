import type { RuntimeReceipt, RuntimeScope } from '@wbs/contracts';

/** Permanent installation identity and retained-row witnesses, never a cache of current claims. */
export type RuntimeLedger = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  authorityCount: number;
  bindingCount: number;
  receiptCount: number;
}>;

/** Trusted accepted-record storage; canonical bytes remain authoritative alongside their digest. */
export type StoredRuntimeAcceptance = Readonly<{
  schemaVersion: 1;
  scope: RuntimeScope;
  commandId: string;
  canonicalRequest: string;
  requestDigest: string;
  receipt: RuntimeReceipt;
}>;
