import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { parseStoredRuntimeAcceptance } from './runtime-command-records';

interface CapturedRecord {
  schemaVersion: 1;
  scope: { organizationId: string; projectId: string; personId: string };
  commandId: string;
  canonicalRequest: string;
  requestDigest: string;
  receipt: {
    schemaVersion: 1;
    scope: { organizationId: string; projectId: string; personId: string };
  } & Record<string, unknown>;
}
const bytes = readFileSync(
  new URL(
    '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44'
)
  throw new Error('published runtime1 capture changed');
// The exact source/output manifest pins these test-only trusted fixture casts.
const capture = JSON.parse(bytes) as {
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
};
for (const row of capture.tables.runtime_command_receipt) {
  const original = JSON.parse(row.accepted) as CapturedRecord;
  test(
    'raw runtime acceptance1 ' +
      row.command_id +
      ' retains original scope receipt and canonical strings',
    () => {
      const before = JSON.stringify(original);
      const parsed = parseStoredRuntimeAcceptance(original);
      expect(parsed.schemaVersion).toBe(1);
      deepStrictEqual(parsed, original);
      expect(JSON.stringify(original)).toBe(before);
    },
  );
  test(
    'raw runtime acceptance2 ' + row.command_id + ' admits only matching current receipt2',
    () => {
      const semantic = parseCanonicalRuntimeRequest(original.canonicalRequest);
      const canonicalRequest = canonicalRuntimeRequest(semantic.scope, semantic.operation);
      const requestDigest = createHash('sha256').update(canonicalRequest).digest('hex');
      const current = {
        ...original,
        schemaVersion: 2,
        scope: semantic.scope,
        canonicalRequest,
        requestDigest,
        receipt: { ...original.receipt, schemaVersion: 2, scope: semantic.scope, requestDigest },
      };
      const parsed = parseStoredRuntimeAcceptance(current);
      expect(parsed.schemaVersion).toBe(2);
      deepStrictEqual(parsed, current);
      expect(() =>
        parseStoredRuntimeAcceptance({
          ...current,
          receipt: { ...current.receipt, schemaVersion: 1 },
        }),
      ).toThrow(/schemaVersion/);
      expect(() =>
        parseStoredRuntimeAcceptance({
          ...original,
          receipt: { ...original.receipt, schemaVersion: 2 },
        }),
      ).toThrow(/schemaVersion/);
      expect(() => parseStoredRuntimeAcceptance({ ...current, schemaVersion: 3 })).toThrow(
        /schemaVersion/,
      );
    },
  );
}
