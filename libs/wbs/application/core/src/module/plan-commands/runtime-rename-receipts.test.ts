import { rejects } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import {
  parseStoredRuntimeAcceptance,
  parseStoredRuntimeAcceptance2,
} from '../../ports/runtime-command-records';
import { verifyRuntimeAcceptance } from './runtime-authority';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(
  new URL(
    '../../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (hash(bytes) !== 'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44')
  throw new Error('published runtime1 capture changed');
// Fixture cast is pinned to the genuine capture; actual trusted parsers validate each retained record.
const capture = JSON.parse(bytes) as {
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
};
const digest = { sha256: (bytes: string) => Promise.resolve(hash(bytes)) };
for (const row of capture.tables.runtime_command_receipt) {
  const original = parseStoredRuntimeAcceptance(JSON.parse(row.accepted));
  if (original.schemaVersion !== 1) throw new Error('fixture must be original1');
  const semantic = parseCanonicalRuntimeRequest(original.canonicalRequest);
  const canonicalRequest = canonicalRuntimeRequest(semantic.scope, semantic.operation);
  const requestDigest = hash(canonicalRequest);
  const current = parseStoredRuntimeAcceptance2({
    ...original,
    schemaVersion: 2,
    scope: semantic.scope,
    canonicalRequest,
    requestDigest,
    receipt: { ...original.receipt, schemaVersion: 2, scope: semantic.scope, requestDigest },
  });
  test(
    'receiver verifies genuine runtime1 ' +
      row.command_id +
      ' using original bytes and original receipt',
    async () => {
      const before = JSON.stringify(original);
      await verifyRuntimeAcceptance(original, original.receipt.ledgerId, digest);
      expect(JSON.stringify(original)).toBe(before);
    },
  );
  test(
    'receiver verifies current runtime2 ' + row.command_id + ' using its own canonical format',
    async () => {
      await verifyRuntimeAcceptance(current, current.receipt.ledgerId, digest);
    },
  );
  test(
    'receiver refuses runtime2 ' +
      row.command_id +
      ' carrying canonical1 despite a matching original digest',
    async () => {
      const mismatch = parseStoredRuntimeAcceptance2({
        ...current,
        canonicalRequest: original.canonicalRequest,
        requestDigest: original.requestDigest,
        receipt: { ...current.receipt, requestDigest: original.requestDigest },
      });
      await rejects(verifyRuntimeAcceptance(mismatch, mismatch.receipt.ledgerId, digest), /format/);
    },
  );
  test(
    'receiver refuses runtime1 ' +
      row.command_id +
      ' carrying canonical2 before receipt projection',
    async () => {
      const mismatch = parseStoredRuntimeAcceptance({
        ...original,
        canonicalRequest,
        requestDigest,
        receipt: { ...original.receipt, requestDigest },
      });
      await rejects(verifyRuntimeAcceptance(mismatch, mismatch.receipt.ledgerId, digest), /format/);
    },
  );
  test(
    'receiver checks runtime1 ' + row.command_id + ' digest against the original string',
    async () => {
      const wrong = '0'.repeat(64);
      const mismatch = parseStoredRuntimeAcceptance({
        ...original,
        requestDigest: wrong,
        receipt: { ...original.receipt, requestDigest: wrong },
      });
      await rejects(
        verifyRuntimeAcceptance(mismatch, mismatch.receipt.ledgerId, digest),
        /runtime canonical request digest mismatch/,
      );
    },
  );
}
