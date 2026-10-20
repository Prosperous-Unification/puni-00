import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { digestOf } from './canonical';
import { decodeRecord, RecordKind } from './decode-record';

const COMMIT_A = '1'.repeat(40);
const COMMIT_B = '2'.repeat(40);
const SHA256_A = 'a'.repeat(64);
const SHA256_B = 'b'.repeat(64);

const planRef = {
  repository: 'https://github.com/Prosperous-Unification/puni-00',
  plan: '0b6e5c1e-4c1d-4f0e-9a51-6d1f3f0c2a10',
  change: 'twilight-navigator-plan-reference',
  planningCommit: COMMIT_A,
  sourceBaseCommit: COMMIT_B,
  requirementsDigest: SHA256_A,
};

function planReference(overrides: Readonly<Record<string, unknown>> = {}) {
  const body = {
    schemaVersion: 1,
    kind: 'plan-reference',
    planRef,
    planDocumentVersion: 6,
    exportDigest: SHA256_A,
    tasksDigest: SHA256_B,
    taskCount: 2,
    createdAt: '2026-10-11T09:00:00.000Z',
    ...overrides,
  };
  return { ...body, referenceDigest: digestOf(body) };
}

const entry = {
  taskId: '7c0d1f4a-0000-4000-8000-000000000001',
  stepCode: 'dev',
  status: 'done',
  measures: { token_actual: 1200, hours_actual: 1.5 },
  observedAt: '2026-10-11T10:00:00.000Z',
  evidence: 'docs/evidence/receipt.md',
};

function progressReceipt(overrides: Readonly<Record<string, unknown>> = {}) {
  const body = {
    schemaVersion: 1,
    kind: 'progress-receipt',
    planRef,
    entries: [
      entry,
      {
        ...entry,
        status: 'in_progress',
        measures: undefined,
        evidence: { kind: 'external', authority: 'ci' },
      },
    ].map((candidate) =>
      Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined)),
    ),
    ...overrides,
  };
  return { ...body, receiptDigest: digestOf(body) };
}

describe('Navigator record kinds', () => {
  test('decodes a plan reference and a progress receipt', () => {
    const decoded: unknown[] = [
      decodeRecord('plan-reference', planReference()),
      decodeRecord('progress-receipt', progressReceipt()),
    ];
    expect(decoded).toEqual([planReference(), progressReceipt()]);
  });

  test('the kind set is exactly the documented list', () => {
    const kinds = RecordKind.expression
      .split(' | ')
      .map((member) => JSON.parse(member) as unknown)
      .sort();
    expect(kinds).toEqual([
      'benchmark-corpus',
      'candidate-entry',
      'candidate-inventory',
      'check-receipt',
      'classification-policy',
      'elapsed-receipt',
      'experiment-manifest',
      'granularity-policy',
      'invocation-receipt',
      'module-mapping',
      'opaque-transcript',
      'plan-reference',
      'progress-receipt',
      'review-receipt',
    ]);
  });

  test('refuses an undeclared key on either record and inside planRef', () => {
    expect(() => decodeRecord('plan-reference', planReference({ extra: 1 }))).toThrow(/extra/);
    expect(() => decodeRecord('progress-receipt', progressReceipt({ extra: 1 }))).toThrow(/extra/);
    expect(() =>
      decodeRecord('plan-reference', planReference({ planRef: { ...planRef, branch: 'main' } })),
    ).toThrow(/branch/);
  });

  test('refuses a wrong schemaVersion or plan document version', () => {
    expect(() => decodeRecord('plan-reference', planReference({ schemaVersion: 2 }))).toThrow(
      /schemaVersion/,
    );
    // Proof: the literal left at '6' and this decode threw on `planDocumentVersion` (2026-10-12).
    expect(decodeRecord('plan-reference', planReference({ planDocumentVersion: 7 }))).toMatchObject(
      {
        planDocumentVersion: 7,
      },
    );
    expect(() => decodeRecord('plan-reference', planReference({ planDocumentVersion: 5 }))).toThrow(
      /planDocumentVersion/,
    );
    expect(() =>
      decodeRecord('plan-reference', planReference({ planDocumentVersion: 11 })),
    ).toThrow(/planDocumentVersion/);
  });

  test.each([6, 7, 8, 9, 10])(
    'decodes a version-%s plan reference without rewriting its digest',
    (version) => {
      const record = planReference({ planDocumentVersion: version });
      expect(record as unknown).toEqual(decodeRecord('plan-reference', record));
    },
  );

  test('refuses a non-hex digest and a short Git object id', () => {
    expect(() =>
      decodeRecord('plan-reference', planReference({ exportDigest: 'Z'.repeat(64) })),
    ).toThrow(/exportDigest/);
    expect(() =>
      decodeRecord(
        'plan-reference',
        planReference({ planRef: { ...planRef, planningCommit: 'abc123' } }),
      ),
    ).toThrow(/planningCommit/);
  });

  test('refuses an empty entries list and an unknown status', () => {
    expect(() => decodeRecord('progress-receipt', progressReceipt({ entries: [] }))).toThrow(
      /entries/,
    );
    expect(() =>
      decodeRecord(
        'progress-receipt',
        progressReceipt({ entries: [{ ...entry, status: 'blocked' }] }),
      ),
    ).toThrow(/status/);
  });

  test('refuses a record whose embedded digest does not match', () => {
    const tamperedReference = { ...planReference(), taskCount: 3 };
    const tamperedReceipt = { ...progressReceipt(), entries: [{ ...entry, stepCode: 'qa' }] };
    expect(() => decodeRecord('plan-reference', tamperedReference)).toThrow(/referenceDigest/);
    expect(() => decodeRecord('progress-receipt', tamperedReceipt)).toThrow(/receiptDigest/);
  });

  test('the production validate command accepts both kinds', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'navigator-records-'));
    try {
      const outputs = (['plan-reference', 'progress-receipt'] as const).map((kind) => {
        const path = join(scratch, `${kind}.json`);
        const record = kind === 'plan-reference' ? planReference() : progressReceipt();
        writeFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
        const child = Bun.spawnSync({
          cmd: [
            process.execPath,
            'run',
            join(import.meta.dir, '..', 'cli.ts'),
            'validate',
            kind,
            path,
          ],
          stdout: 'pipe',
          stderr: 'pipe',
        });
        return [child.exitCode, child.stdout.toString()];
      });
      expect(outputs).toEqual([
        [0, 'valid plan-reference\n'],
        [0, 'valid progress-receipt\n'],
      ]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
