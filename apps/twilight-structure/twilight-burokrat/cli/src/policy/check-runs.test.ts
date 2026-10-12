import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import type { CheckRun, CheckRunLedger } from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { dashCheckRunAuthority } from './check-run-authority';
import { sealCheckRuns, writeCheckRunLedger } from './check-run-fixtures';
import {
  checkRunDigest,
  checkRunLayout,
  type CheckRunPlan,
  CheckRunRefusal,
  type CheckRunRefusalReason,
  readCheckRuns,
} from './check-runs';

const scratchRoots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'burokrat-check-runs-'));
  scratchRoots.push(root);
  return root;
}

afterAll(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const plan: CheckRunPlan = {
  candidate: { revision: 'a'.repeat(40), identity: 'b'.repeat(64) },
  checks: [
    { checkId: 'check.first', command: ['bunx', 'nx', 'run', 'one:check'], skipProbe: null },
    {
      checkId: 'check.second',
      command: ['bunx', 'nx', 'run', 'two:test'],
      skipProbe: { command: ['bash', '-c', 'bun test'], cwd: 'src/two', env: { CI: '1' } },
    },
  ],
};

function refusalOf(action: () => unknown): { reason: CheckRunRefusalReason; message: string } {
  try {
    action();
  } catch (cause) {
    if (cause instanceof CheckRunRefusal) return { reason: cause.reason, message: cause.message };
    throw cause;
  }
  throw new Error('expected a check-run refusal');
}

/** Writes the default ledger, lets `edit` change its parsed runs, and writes them back unsealed. */
function rewritten(edit: (ledger: CheckRunLedger) => unknown): string {
  const directory = scratch();
  const ledger = writeCheckRunLedger(directory, plan);
  writeFileSync(join(directory, checkRunLayout.ledger), serializeCanonical(edit(ledger)));
  return directory;
}

function withRuns(editRuns: (runs: CheckRun[]) => CheckRun[]): string {
  const directory = scratch();
  writeCheckRunLedger(directory, plan, { editRuns });
  return directory;
}

const shifted = (instant: string, milliseconds: number): string =>
  new Date(Date.parse(instant) + milliseconds).toISOString();

describe('check runs judged by the preparers', () => {
  test('accepts the ledger Dash writes and returns each run with its streams', () => {
    const directory = scratch();
    writeCheckRunLedger(directory, plan, {
      outcomes: {
        'check.second': { stdout: 'nx said\n', probe: { stdout: ' 1 pass\n 1 skip\n' } },
      },
    });
    const runs = readCheckRuns(directory, plan, dashCheckRunAuthority);
    expect(runs.map((run) => [run.checkId, run.exitCode, run.startedAt, run.endedAt])).toEqual([
      ['check.first', 0, '2026-10-12T08:00:00.000Z', '2026-10-12T08:00:01.000Z'],
      ['check.second', 0, '2026-10-12T08:00:01.000Z', '2026-10-12T08:00:02.000Z'],
    ]);
    expect(new TextDecoder().decode(runs[1].stdout)).toBe('nx said\n 1 pass\n 1 skip\n');
    expect(new TextDecoder().decode(runs[1].measured.stdout)).toBe(' 1 pass\n 1 skip\n');
    expect(new TextDecoder().decode(runs[0].measured.stdout)).toBe('fixture check passed\n');
  });

  test('a failed check needs no probe and reports its own exit code', () => {
    const directory = scratch();
    writeCheckRunLedger(directory, plan, { outcomes: { 'check.second': { exitCode: 3 } } });
    expect(readCheckRuns(directory, plan, dashCheckRunAuthority)[1].exitCode).toBe(3);
  });

  test('refuses an absent ledger and an unreadable one by name', () => {
    expect(refusalOf(() => readCheckRuns(scratch(), plan, dashCheckRunAuthority)).reason).toBe(
      'absent',
    );
    const unreadable = scratch();
    mkdirSync(join(unreadable, checkRunLayout.ledger));
    expect(refusalOf(() => readCheckRuns(unreadable, plan, dashCheckRunAuthority)).reason).toBe(
      'unreadable',
    );
  });

  test('refuses a ledger that is not JSON or not the schema', () => {
    const notJson = scratch();
    writeFileSync(join(notJson, checkRunLayout.ledger), '{"runs": [');
    expect(refusalOf(() => readCheckRuns(notJson, plan, dashCheckRunAuthority)).reason).toBe(
      'malformed',
    );
    const undeclared = withRuns((runs) => [{ ...runs[0], signature: 'trust me' } as CheckRun]);
    expect(refusalOf(() => readCheckRuns(undeclared, plan, dashCheckRunAuthority)).reason).toBe(
      'malformed',
    );
  });

  test('refuses a ledger whose chain or seal no longer covers its runs', () => {
    const renumbered = rewritten((ledger) => ({
      ...ledger,
      runs: ledger.runs.map((run) => ({ ...run, sequence: 0 })),
    }));
    expect(
      refusalOf(() => readCheckRuns(renumbered, plan, dashCheckRunAuthority)).message,
    ).toContain('numbered 0');
    const failed = scratch();
    const sealed = writeCheckRunLedger(failed, plan, {
      outcomes: { 'check.first': { exitCode: 3 } },
    });
    writeFileSync(
      join(failed, checkRunLayout.ledger),
      serializeCanonical({
        ...sealed,
        runs: [
          { ...sealed.runs[0], check: { ...sealed.runs[0].check, exitCode: 0 } },
          sealed.runs[1],
        ],
      }),
    );
    const link = refusalOf(() => readCheckRuns(failed, plan, dashCheckRunAuthority));
    expect(link.reason).toBe('broken-chain');
    expect(link.message).toContain('check.second links');
    const editedLast = rewritten((ledger) => ({
      ...ledger,
      runs: [
        ledger.runs[0],
        { ...ledger.runs[1], check: { ...ledger.runs[1].check, exitCode: 9 } },
      ],
    }));
    const seal = refusalOf(() => readCheckRuns(editedLast, plan, dashCheckRunAuthority));
    expect(seal.reason).toBe('broken-chain');
    expect(seal.message).toContain('does not seal its last run');
  });

  test('refuses runs another recorder wrote', () => {
    const foreign = withRuns((runs) =>
      runs.map((run) => ({ ...run, authority: { product: 'hand-written', command: 'printf' } })),
    );
    expect(refusalOf(() => readCheckRuns(foreign, plan, dashCheckRunAuthority)).reason).toBe(
      'foreign-authority',
    );
    const otherCommand = withRuns((runs) =>
      runs.map((run) => ({ ...run, authority: { ...run.authority, command: 'plan-enrollment' } })),
    );
    expect(refusalOf(() => readCheckRuns(otherCommand, plan, dashCheckRunAuthority)).reason).toBe(
      'foreign-authority',
    );
  });

  test('refuses runs of another revision or another tree', () => {
    const revision = withRuns((runs) =>
      runs.map((run) => ({ ...run, candidate: { ...run.candidate, revision: 'c'.repeat(40) } })),
    );
    expect(refusalOf(() => readCheckRuns(revision, plan, dashCheckRunAuthority)).reason).toBe(
      'mismatched-candidate',
    );
    const identity = withRuns((runs) =>
      runs.map((run) => ({ ...run, candidate: { ...run.candidate, identity: 'd'.repeat(64) } })),
    );
    expect(refusalOf(() => readCheckRuns(identity, plan, dashCheckRunAuthority)).reason).toBe(
      'mismatched-candidate',
    );
  });

  test('refuses a planned check with no run and runs that are not the planned ones', () => {
    const truncated = withRuns((runs) => runs.slice(0, 1));
    expect(refusalOf(() => readCheckRuns(truncated, plan, dashCheckRunAuthority))).toEqual({
      reason: 'missing-check',
      message: 'check runs refused (missing-check): no run of check.second',
    });
    const renamed = withRuns((runs) => [{ ...runs[0], checkId: 'check.other' }, runs[1]]);
    expect(refusalOf(() => readCheckRuns(renamed, plan, dashCheckRunAuthority)).reason).toBe(
      'mismatched-check',
    );
    const reordered = withRuns((runs) => [runs[1], runs[0]]);
    expect(refusalOf(() => readCheckRuns(reordered, plan, dashCheckRunAuthority)).reason).toBe(
      'mismatched-check',
    );
    const otherArgv = withRuns((runs) => [
      { ...runs[0], check: { ...runs[0].check, command: ['true'] } },
      runs[1],
    ]);
    expect(refusalOf(() => readCheckRuns(otherArgv, plan, dashCheckRunAuthority)).reason).toBe(
      'mismatched-check',
    );
    const extra = withRuns((runs) => [
      ...runs,
      { ...runs[0], checkId: 'check.extra', startedAt: runs[1].endedAt, endedAt: runs[1].endedAt },
    ]);
    expect(refusalOf(() => readCheckRuns(extra, plan, dashCheckRunAuthority)).message).toContain(
      'runs nobody planned: check.extra',
    );
  });

  test('refuses a passing check whose skip probe was skipped, unplanned or moved', () => {
    const directory = scratch();
    writeCheckRunLedger(directory, plan, { outcomes: { 'check.second': { probe: null } } });
    expect(
      refusalOf(() => readCheckRuns(directory, plan, dashCheckRunAuthority)).message,
    ).toContain('check.second passed without its skip probe');
    const unplanned = withRuns((runs) => [{ ...runs[0], skipProbe: runs[1].skipProbe }, runs[1]]);
    expect(
      refusalOf(() => readCheckRuns(unplanned, plan, dashCheckRunAuthority)).message,
    ).toContain('check.first ran a skip probe nobody planned');
    const moved = (edit: (probe: NonNullable<CheckRun['skipProbe']>) => object) =>
      withRuns((runs) => {
        const probe = runs[1].skipProbe;
        if (probe === null) throw new Error('fixture plans a probe for check.second');
        return [runs[0], { ...runs[1], skipProbe: { ...probe, ...edit(probe) } }];
      });
    for (const directoryWithMovedProbe of [
      moved(() => ({ cwd: '.' })),
      moved(() => ({ command: ['bash', '-c', 'true'] })),
      moved(() => ({ env: {} })),
    ]) {
      expect(
        refusalOf(() => readCheckRuns(directoryWithMovedProbe, plan, dashCheckRunAuthority))
          .message,
      ).toContain('check.second ran a skip probe other than the planned one');
    }
  });

  test('a run may end at the instant it starts, never before', () => {
    const instant = withRuns((runs) => [{ ...runs[0], endedAt: runs[0].startedAt }, runs[1]]);
    expect(readCheckRuns(instant, plan, dashCheckRunAuthority)).toHaveLength(2);
    const backwards = withRuns((runs) => [
      { ...runs[0], endedAt: shifted(runs[0].startedAt, -1) },
      runs[1],
    ]);
    expect(refusalOf(() => readCheckRuns(backwards, plan, dashCheckRunAuthority))).toEqual({
      reason: 'out-of-order',
      message:
        'check runs refused (out-of-order): check.first ended at 2026-10-12T07:59:59.999Z before it started at 2026-10-12T08:00:00.000Z',
    });
  });

  test('a run may start at the instant the previous one ended, never before', () => {
    const touching = withRuns((runs) => [runs[0], { ...runs[1], startedAt: runs[0].endedAt }]);
    expect(readCheckRuns(touching, plan, dashCheckRunAuthority)).toHaveLength(2);
    const overlapping = withRuns((runs) => [
      runs[0],
      { ...runs[1], startedAt: shifted(runs[0].endedAt, -1) },
    ]);
    expect(refusalOf(() => readCheckRuns(overlapping, plan, dashCheckRunAuthority))).toEqual({
      reason: 'overlapping',
      message:
        'check runs refused (overlapping): check.second started at 2026-10-12T08:00:00.999Z before check.first ended at 2026-10-12T08:00:01.000Z',
    });
  });

  test('refuses a stream that is absent or is not the bytes its digest names', () => {
    const absent = scratch();
    const ledger = writeCheckRunLedger(absent, plan);
    rmSync(join(absent, checkRunLayout.streams, ledger.runs[0].check.stdout));
    expect(refusalOf(() => readCheckRuns(absent, plan, dashCheckRunAuthority)).reason).toBe(
      'missing-stream',
    );
    const edited = scratch();
    const editedLedger = writeCheckRunLedger(edited, plan);
    const path = join(edited, checkRunLayout.streams, editedLedger.runs[0].check.stdout);
    writeFileSync(path, `${readFileSync(path, 'utf8')}and more\n`);
    expect(refusalOf(() => readCheckRuns(edited, plan, dashCheckRunAuthority)).reason).toBe(
      'stream-mismatch',
    );
  });

  test('the chain digest is the canonical JSON identity of the run', () => {
    const sealed = sealCheckRuns(writeCheckRunLedger(scratch(), plan).runs);
    expect(sealed.runs[1].previous).toBe(hashBytes(serializeCanonical(sealed.runs[0])));
    expect(sealed.head).toBe(checkRunDigest(sealed.runs[1]));
  });
});
