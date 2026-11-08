import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

const Identity = type('0 < string <= 256');
const Timestamp = type(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/).narrow((value) =>
  Number.isFinite(Date.parse(value)),
);
const Bundle = type({
  operationId: Identity,
  references: type({ repository: Identity, digest: /^sha256:[0-9a-f]{64}$/, '+': 'reject' })
    .array()
    .atLeastLength(1),
  receipt: { state: "'promoted'", at: Timestamp, '+': 'reject' },
  '+': 'reject',
});
const Promotion = type({
  operationId: Identity,
  candidate: Identity,
  at: Timestamp,
  '+': 'reject',
});
const scope = { registryId: Identity, product: Identity, environment: Identity, target: Identity };
const Receipt = type({
  ...scope,
  authorityRevision: 'number.safe >= 0',
  releases: Bundle.array().atLeastLength(1),
  promotion: Promotion,
  '+': 'reject',
});
const History = type({
  ...scope,
  schemaVersion: '1',
  source: Identity.narrow(isAbsolute),
  genesis: { at: Timestamp, sourceRevision: Identity, '+': 'reject' },
  authorityRevision: 'number.safe >= 0',
  releases: Bundle.array(),
  promotion: Promotion.or('null'),
  'inheritance?': {
    source: Identity.narrow(isAbsolute),
    sha256: /^[0-9a-f]{64}$/,
    operationId: Identity,
    '+': 'reject',
  },
  '+': 'reject',
});
export type RegistryHistory = typeof History.infer;
export type RegistryPromotionReceipt = typeof Receipt.infer;

/** Bound the existing owner journal's history projection; absence or malformed evidence never initializes it. */
export function parseRegistryHistory(input: unknown, source: string): RegistryHistory {
  const history = History(input);
  if (
    history instanceof type.errors ||
    history.source !== source ||
    Buffer.byteLength(JSON.stringify(history)) > 1024 ** 2
  )
    throw new Error('Malformed, foreign or oversized registry history');
  if (
    new Set(history.releases.map((bundle) => bundle.operationId)).size !==
      history.releases.length ||
    (history.releases.length === 0
      ? history.promotion !== null
      : history.promotion?.candidate !== history.releases[0].operationId)
  )
    throw new Error('Incomplete or inconsistent registry history');
  return history;
}

/** Preserve complete prior evidence and immutable promotion receipts through rollback and lost-ack retry. */
export function advanceRegistryHistory(input: unknown, completion: unknown): RegistryHistory {
  const parsed = History(input);
  if (parsed instanceof type.errors)
    throw new Error('Missing or malformed initialized owner history');
  const prior = parseRegistryHistory(parsed, parsed.source);
  const receipt = Receipt(completion);
  if (
    receipt instanceof type.errors ||
    receipt.registryId !== prior.registryId ||
    receipt.product !== prior.product ||
    receipt.environment !== prior.environment ||
    receipt.target !== prior.target ||
    receipt.authorityRevision < prior.authorityRevision ||
    receipt.releases[0].operationId !== receipt.promotion.candidate
  )
    throw new Error('Foreign or stale registry promotion history receipt');
  const expected = [
    receipt.promotion.candidate,
    ...prior.releases
      .map((bundle) => bundle.operationId)
      .filter((operationId) => operationId !== receipt.promotion.candidate),
  ];
  if (
    JSON.stringify(expected) !==
    JSON.stringify(receipt.releases.map((bundle) => bundle.operationId))
  )
    throw new Error('Registry promotion lost or invented prior source history');
  for (const bundle of prior.releases) {
    const preserved = receipt.releases.find(
      (candidate) => candidate.operationId === bundle.operationId,
    );
    if (JSON.stringify(preserved) !== JSON.stringify(bundle))
      throw new Error('Original trusted promotion receipt changed');
  }
  if (prior.promotion?.operationId === receipt.promotion.operationId) {
    if (
      JSON.stringify(prior.promotion) !== JSON.stringify(receipt.promotion) ||
      JSON.stringify(prior.releases) !== JSON.stringify(receipt.releases)
    )
      throw new Error('Repeated promotion history differs');
    return prior;
  }
  return parseRegistryHistory({ ...prior, ...receipt }, prior.source);
}

/** Validate a complete authenticated authority promotion before an owning journal persists it. */
export function parseRegistryPromotionReceipt(input: unknown): RegistryPromotionReceipt {
  const receipt = Receipt(input);
  if (receipt instanceof type.errors)
    throw new Error('Malformed registry promotion history receipt');
  return receipt;
}

/** Hash complete ordered successful bundle evidence, canonicalizing only exact-reference order. */
export function registryHistorySha256(
  bundles: readonly {
    operationId: string;
    references: readonly { repository: string; digest: string }[];
    receipt: { state: string; at: string };
  }[],
): string {
  const canonical = bundles.map((bundle) => {
    if (bundle.receipt.state !== 'promoted')
      throw new Error('Historical evidence is not a promoted receipt');
    return {
      operationId: bundle.operationId,
      references: [...bundle.references].sort(
        (left, right) =>
          left.repository.localeCompare(right.repository) ||
          left.digest.localeCompare(right.digest),
      ),
      receipt: { state: 'promoted', at: bundle.receipt.at },
    };
  });
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
