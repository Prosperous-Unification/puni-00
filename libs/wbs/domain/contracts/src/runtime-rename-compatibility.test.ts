import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type {
  RuntimeAuthorityRequest,
  RuntimeClaimRequest,
  RuntimeOperation,
  RuntimeWriteRequest,
} from './runtime-command-values';
import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from './runtime-request';

interface Capture {
  scope: { organizationId: string; projectId: string; personId: string };
  authorityRequest: RuntimeAuthorityRequest & { personId: string };
  claimRequest: RuntimeClaimRequest & { personId: string };
  writeRequest: RuntimeWriteRequest & { personId: string };
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
}
const bytes = readFileSync(
  new URL(
    '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44'
)
  throw new Error('published runtime1 capture changed');
// The exact fixture hash pins the genuine outgoing HTTP/SQLite producer; casts stay in this fixture boundary.
const capture = JSON.parse(bytes) as Capture;
const scope = {
  organizationId: capture.scope.organizationId,
  workPackageId: capture.scope.projectId,
  personId: capture.scope.personId,
};
const operations: readonly [string, RuntimeOperation][] = [
  [
    'grant',
    {
      schemaVersion: 1,
      kind: 'authority',
      commandId: capture.authorityRequest.commandId,
      expectedLedgerId: capture.authorityRequest.expectedLedgerId,
      ownerId: capture.authorityRequest.ownerId,
      expectedGeneration: capture.authorityRequest.expectedGeneration,
    },
  ],
  [
    'claim',
    {
      schemaVersion: 1,
      commandId: capture.claimRequest.commandId,
      expectedLedgerId: capture.claimRequest.expectedLedgerId,
      authority: capture.claimRequest.authority,
      expectedBasis: capture.claimRequest.expectedBasis,
      action: capture.claimRequest.action,
    },
  ],
  [
    'write',
    {
      schemaVersion: 1,
      commandId: capture.writeRequest.commandId,
      expectedLedgerId: capture.writeRequest.expectedLedgerId,
      authority: capture.writeRequest.authority,
      expectedBasis: capture.writeRequest.expectedBasis,
      action: capture.writeRequest.action,
    },
  ],
];
for (const [commandId, operation] of operations) {
  test(
    'current runtime canonical2 writes renamed ' + commandId + ' scope with unchanged body1',
    () => {
      const current = canonicalRuntimeRequest(scope, operation);
      const envelope = JSON.parse(current) as { schemaVersion: number; scope: unknown };
      expect(envelope.schemaVersion).toBe(2);
      expect(envelope.scope).toEqual(scope);
      expect(parseCanonicalRuntimeRequest(current)).toEqual({ scope, operation });
      expect(() => parseCanonicalRuntimeRequest(current + '\n')).toThrow(
        'runtime request bytes are not canonical',
      );
    },
  );
  test(
    'published runtime canonical1 ' +
      commandId +
      ' reads current meaning without changing original bytes',
    () => {
      const row = capture.tables.runtime_command_receipt.find(
        (row) => row.command_id === commandId,
      );
      if (row === undefined) throw new Error('published acceptance absent');
      const accepted = JSON.parse(row.accepted) as {
        canonicalRequest: string;
        requestDigest: string;
      };
      const original = accepted.canonicalRequest;
      expect(createHash('sha256').update(original).digest('hex')).toBe(accepted.requestDigest);
      expect(parseCanonicalRuntimeRequest(original)).toEqual({ scope, operation });
      expect(() => parseCanonicalRuntimeRequest(original + '\n')).toThrow(
        'runtime request bytes are not canonical',
      );
      expect(accepted.canonicalRequest).toBe(original);
      expect(createHash('sha256').update(original).digest('hex')).toBe(accepted.requestDigest);
    },
  );
}
