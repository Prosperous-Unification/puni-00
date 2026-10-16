import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf, digestWithout, PlanReferenceRecord } from '@twilight-burokrat/contracts';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { runTwin, runTwinInProcess, scratchDirectory } from './testing/run-twin';

let scratch: ReturnType<typeof scratchDirectory>;
let producer: PlanReferenceRecord;
let accepted: PlanReferenceRecord;
let output: string;

const entry = {
  taskId: '00000000-0000-4000-8000-000000000007',
  stepCode: 'dev',
  status: 'done',
  observedAt: '2026-10-11T10:00:00.000Z',
  evidence: 'verify.md',
};

async function exportReference(label: string, blockedAt: number) {
  const document = JSON.parse(
    readFileSync(join(import.meta.dir, 'fixtures/plan-export.v9.json'), 'utf8'),
  ) as { stepBlockages: { blockedAt: number }[] };
  document.stepBlockages[0].blockedAt = blockedAt;
  const path = join(scratch.path, `${label}.json`);
  writeFileSync(path, JSON.stringify(document));
  const directory = join(scratch.path, label);
  mkdirSync(directory);
  const invocation = await runTwinInProcess([
    'plan-reference',
    '--export',
    path,
    '--repository',
    'repo',
    '--change',
    'progress-admission',
    '--planning-commit',
    '1'.repeat(40),
    '--source-base',
    '2'.repeat(40),
    '--requirements',
    join(scratch.path, 'spec.md'),
    '--output',
    directory,
  ]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  return PlanReferenceRecord.assert(
    JSON.parse(readFileSync(join(directory, 'plan-reference.json'), 'utf8')),
  );
}

beforeEach(async () => {
  scratch = scratchDirectory();
  writeFileSync(join(scratch.path, 'spec.md'), 'requirements');
  producer = await exportReference('a', -1);
  accepted = await exportReference('b', 0);
  output = join(scratch.path, 'batch.json');
  writeReceipt();
});
afterEach(() => {
  scratch.remove();
});

function writeReceipt(overrides: Record<string, unknown> = {}) {
  const body = {
    schemaVersion: 2,
    kind: 'progress-receipt',
    planRef: producer.planRef,
    referenceDigest: producer.referenceDigest,
    entries: [entry],
    ...overrides,
  };
  writeFileSync(
    join(scratch.path, 'receipt.json'),
    JSON.stringify({ ...body, receiptDigest: digestOf(body) }),
  );
}
function flags(acceptedPath = join(scratch.path, 'a/plan-reference.json')) {
  return [
    'admit-progress',
    '--receipt',
    join(scratch.path, 'receipt.json'),
    '--plan-reference',
    join(scratch.path, 'a/plan-reference.json'),
    '--tasks',
    join(scratch.path, 'a/tasks.json'),
    '--accepted-reference',
    acceptedPath,
    '--output',
    output,
  ];
}
async function refuse(acceptedPath: string, diagnostic: RegExp) {
  const invocation = await runTwinInProcess(flags(acceptedPath));
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  expect(invocation.stderr).toMatch(diagnostic);
  expect(invocation.stdout).toBe('');
  expect(existsSync(output)).toBe(false);
}

test('admits bound progress through real entrypoint', () => {
  const invocation = runTwin(flags());
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const batch = JSON.parse(readFileSync(output, 'utf8')) as { commands: unknown[] };
  expect(batch.commands).toHaveLength(1);
});
test('blockedAt-only exports preserve PlanRef/tasks and refuse A against selected B', async () => {
  expect(producer.planRef).toEqual(accepted.planRef);
  expect(producer.tasksDigest).toBe(accepted.tasksDigest);
  expect(producer.referenceDigest).not.toBe(accepted.referenceDigest);
  await refuse(join(scratch.path, 'b/plan-reference.json'), /selected accepted reference/);
});
test('redigested receipt substitution refuses producer mismatch', async () => {
  writeReceipt({ referenceDigest: accepted.referenceDigest });
  await refuse(join(scratch.path, 'a/plan-reference.json'), /does not bind the producer reference/);
});
test('legacy admission refuses while legacy conversion remains available', async () => {
  const body = {
    schemaVersion: 1,
    kind: 'progress-receipt',
    planRef: producer.planRef,
    entries: [entry],
  };
  writeFileSync(
    join(scratch.path, 'receipt.json'),
    JSON.stringify({ ...body, receiptDigest: digestOf(body) }),
  );
  await refuse(join(scratch.path, 'a/plan-reference.json'), /bound schema 2/);
  const invocation = await runTwinInProcess([
    'receipt-to-commands',
    ...flags().slice(1, -4),
    '--output',
    output,
  ]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
});
for (const fault of ['missing', 'unreadable', 'malformed', 'unknown-key'] as const) {
  test(`selected accepted reference ${fault} refuses without output`, async () => {
    const path = join(scratch.path, 'accepted.json');
    if (fault === 'unreadable') {
      expect(process.getuid?.()).not.toBe(0);
      writeFileSync(path, JSON.stringify(producer));
      chmodSync(path, 0);
    } else if (fault === 'malformed') writeFileSync(path, '{');
    else if (fault === 'unknown-key') {
      const extended = { ...producer, extra: true };
      writeFileSync(
        path,
        JSON.stringify({
          ...extended,
          referenceDigest: digestWithout(extended, 'referenceDigest'),
        }),
      );
    }
    try {
      await refuse(
        path,
        new RegExp(`accepted reference is ${fault === 'unknown-key' ? 'malformed' : fault}`),
      );
    } finally {
      if (fault === 'unreadable') chmodSync(path, 0o600);
    }
  });
}
test('occupied output remains untouched', async () => {
  writeFileSync(output, 'occupied');
  const invocation = await runTwinInProcess(flags());
  expect(invocation.exitCode, invocation.stderr).toBe(1);
  expect(readFileSync(output, 'utf8')).toBe('occupied');
});

for (const fault of [
  'unknown-key',
  'empty-entries',
  'future-version',
  'reference-shape',
  'missing-reference',
  'receipt-digest',
] as const) {
  test(`bound receipt ${fault} refuses before output`, async () => {
    if (fault === 'unknown-key') writeReceipt({ extra: true });
    if (fault === 'empty-entries') writeReceipt({ entries: [] });
    if (fault === 'future-version') writeReceipt({ schemaVersion: 3 });
    if (fault === 'reference-shape') writeReceipt({ referenceDigest: 'bad' });
    if (fault === 'missing-reference') {
      const path = join(scratch.path, 'receipt.json');
      const receipt = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      delete receipt['referenceDigest'];
      receipt['receiptDigest'] = digestWithout(receipt, 'receiptDigest');
      writeFileSync(path, JSON.stringify(receipt));
    }
    if (fault === 'receipt-digest') {
      const path = join(scratch.path, 'receipt.json');
      const receipt = JSON.parse(readFileSync(path, 'utf8')) as {
        entries: { observedAt: string }[];
      };
      receipt.entries[0].observedAt = '2026-10-12T10:00:00.000Z';
      writeFileSync(path, JSON.stringify(receipt));
    }
    await refuse(join(scratch.path, 'a/plan-reference.json'), /progress receipt is malformed/);
  });
}
test('admission retains existing task and entry consistency', async () => {
  writeReceipt({ entries: [{ ...entry, stepCode: 'unknown' }] });
  await refuse(join(scratch.path, 'a/plan-reference.json'), /absent from the plan/);
});
