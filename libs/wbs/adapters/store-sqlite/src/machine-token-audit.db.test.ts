import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { MachineTokenAuditOutcome, MachineTokenIssuance } from '@wbs/core';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { openDatabase, openDrizzle } from './db';
import { WriteCoordinator } from './gate';
import { MachineTokenAuditRepository } from './machine-token-audit';

/** The SQLite error behind a rejected store call, which drizzle wraps as its `cause`. */
async function failureOf(attempt: Promise<unknown>): Promise<string> {
  const failure = await attempt.then(
    () => null,
    (cause: unknown) => cause,
  );
  if (!(failure instanceof Error)) throw new Error('the store call resolved');
  return failure.cause instanceof Error ? failure.cause.message : failure.message;
}
import { runMigrations } from './migrate';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
/** 2026-10-26T09:00:00Z: a real-epoch instant, because a small fake clock hides a day bug. */
const MORNING = Date.UTC(2026, 9, 26, 9, 0, 0);
const DAY_MS = 86_400_000;
const CREDENTIAL = '00000000-0000-4000-8000-000000000001';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-machine-token-audit-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  } finally {
    sqlite.close();
  }
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function issuance(runId: string | null, credentialId = CREDENTIAL): MachineTokenIssuance {
  return {
    credentialId,
    organizationId: 'org-a',
    accountId: 'dany',
    personId: 'claire',
    source: 'api_key',
    runId,
  };
}

/** The audit over a fresh connection and one process-wide write turn, as be-01 composes it. */
function openAudit() {
  const gate = new WriteCoordinator();
  return { audit: new MachineTokenAuditRepository(openDrizzle(path), gate), gate };
}

/** A clock that moves one millisecond per read, from `start`. */
function ticking(start: number): () => number {
  let at = start;
  return () => (at += 1);
}

let ids = 0;
const newId = () => `audit-${String((ids += 1))}`;

function rows(action = 'machine_token_issued'): { detail: string; created_at: number }[] {
  const sqlite = openDatabase(path);
  try {
    return sqlite
      .query<{ detail: string; created_at: number }, [string]>(
        'SELECT detail, created_at FROM organization_audit WHERE action = ? ORDER BY created_at, id',
      )
      .all(action);
  } finally {
    sqlite.close();
  }
}

describe('MachineTokenAuditRepository', () => {
  // The index and the shared key move together: changing the index alone makes
  // the targeted insert fail to prepare ("ON CONFLICT clause does not match").
  // Proof: with the coalesce dropped from both the run index (migration) and
  // `RUN_KEY` (machine-token-audit.ts), the second and third no-run
  // issuances answered 'recorded' instead of 'seen': three no-run rows; with
  // `created_at / 86400000` replaced by `date(created_at)` in both, all six
  // answered 'recorded'; watched 2026-10-26.
  it('writes one row per run and UTC day, a missing run being one run', async () => {
    const { audit } = openAudit();
    const clock = ticking(MORNING);
    const outcomes: MachineTokenAuditOutcome[] = [];
    for (const runId of ['run-a', 'run-a', 'run-a', null, null, null])
      outcomes.push(await audit.record(issuance(runId), clock, newId));
    expect(outcomes).toEqual(['recorded', 'seen', 'seen', 'recorded', 'seen', 'seen']);
    expect(rows().map((row) => JSON.parse(row.detail) as unknown)).toEqual([
      { credentialId: CREDENTIAL, personId: 'claire', source: 'api_key', runId: 'run-a' },
      { credentialId: CREDENTIAL, personId: 'claire', source: 'api_key' },
    ]);
  });

  it('starts a new key at the UTC midnight, and keeps credentials apart', async () => {
    const { audit } = openAudit();
    const midnight = Math.ceil(MORNING / DAY_MS) * DAY_MS;
    expect(await audit.record(issuance('run-a'), () => midnight - 1, newId)).toBe('recorded');
    expect(await audit.record(issuance('run-a'), () => midnight, newId)).toBe('recorded');
    expect(await audit.record(issuance('run-a', 'another'), () => midnight, newId)).toBe(
      'recorded',
    );
    expect(rows().map((row) => row.created_at)).toEqual([midnight - 1, midnight, midnight]);
  });

  // Proof: with the overflow stop removed (a run row written whatever the
  // count), 150 runs wrote 150 run rows ("Expected length: 100, Received
  // length: 150"); with the overflow index (migration) and `OVERFLOW_DAY_KEY`
  // both set to `created_at`, a key that never collides, every issuance past
  // 100 wrote another overflow row ("Expected length: 1, Received length:
  // 50"); watched 2026-10-26.
  it('writes 100 run rows and one overflow row for 150 runs in a day, refusing none', async () => {
    const { audit } = openAudit();
    const clock = ticking(MORNING);
    const outcomes: MachineTokenAuditOutcome[] = [];
    for (let run = 0; run < 150; run += 1)
      outcomes.push(await audit.record(issuance(`run-${String(run)}`), clock, newId));
    expect(rows()).toHaveLength(100);
    expect(rows('machine_token_issued_overflow')).toHaveLength(1);
    expect(outcomes.filter((each) => each === 'recorded')).toHaveLength(100);
    expect(outcomes.filter((each) => each === 'overflow_recorded')).toHaveLength(1);
    expect(outcomes.filter((each) => each === 'seen')).toHaveLength(49);
  });

  // The colliding id names a row of another key, so only the primary key
  // conflicts. Proof: with the run insert's conflict clause made untargeted
  // (`ON CONFLICT DO NOTHING`), the call resolved instead of throwing, the
  // collision swallowed; watched 2026-10-26.
  it('throws on a row-id collision under a different key, writing nothing', async () => {
    const { audit } = openAudit();
    expect(
      await audit.record(
        issuance('run-a'),
        () => MORNING,
        () => 'taken',
      ),
    ).toBe('recorded');
    expect(
      await failureOf(
        audit.record(
          issuance('run-b'),
          () => MORNING + 1,
          () => 'taken',
        ),
      ),
    ).toMatch(/UNIQUE constraint failed: organization_audit\.id/);
    expect(rows()).toHaveLength(1);
  });

  // The narrow CHECK stands in for any constraint the targeted conflict does
  // not name; an untargeted conflict clause still throws on a CHECK, so only
  // `INSERT OR IGNORE` is observed here. Proof: with the run insert written as
  // `INSERT OR IGNORE`, this call and the row-id collision above both
  // resolved instead of throwing; watched 2026-10-26.
  it('throws on a CHECK violation instead of skipping the row', async () => {
    narrowAuditVocabulary();
    const { audit } = openAudit();
    expect(await failureOf(audit.record(issuance('run-a'), () => MORNING, newId))).toMatch(
      /CHECK constraint failed/,
    );
  });

  it('refuses a run that looks like a secret, writing nothing', async () => {
    const { audit } = openAudit();
    for (const runId of ['wbs_mk_x', 'f'.repeat(64), 'issuer|subject'])
      expect(await failureOf(audit.record(issuance(runId), () => MORNING, newId))).toMatch(
        /secret/,
      );
    expect(rows()).toHaveLength(0);
  });

  // Proof: with the read-first early return removed from `record`, this
  // answered 'pending'; watched 2026-10-26.
  it('answers a seen run without taking the write turn', async () => {
    const { audit, gate } = openAudit();
    expect(await audit.record(issuance('run-a'), () => MORNING, newId)).toBe('recorded');
    const release = Promise.withResolvers<undefined>();
    const held = gate.enter(() => release.promise);
    try {
      const answer = await Promise.race([
        audit.record(issuance('run-a'), () => MORNING + 1, newId),
        Bun.sleep(300).then(() => 'pending' as const),
      ]);
      expect(answer).toBe('seen');
    } finally {
      release.resolve(undefined);
      await held;
    }
  });
});

/** The issuance audit as a model: per day, the set of runs written and whether overflow was. */
interface AuditModel {
  readonly runs: Set<string>;
  overflow: boolean;
}

interface AuditWorld {
  readonly audit: MachineTokenAuditRepository;
  readonly clock: () => number;
}

/** What the model expects one issuance of `run` to answer, applying it. */
function expectIssuance(model: AuditModel, run: string): MachineTokenAuditOutcome {
  if (model.runs.has(run) || model.overflow) return 'seen';
  if (model.runs.size < 100) {
    model.runs.add(run);
    return 'recorded';
  }
  model.overflow = true;
  return 'overflow_recorded';
}

function checkRows(model: AuditModel): void {
  expect(rows()).toHaveLength(model.runs.size);
  expect(rows('machine_token_issued_overflow')).toHaveLength(model.overflow ? 1 : 0);
  expect(model.runs.size).toBeLessThanOrEqual(100);
}

class IssueOne implements fc.AsyncCommand<AuditModel, AuditWorld> {
  constructor(readonly runId: string) {}
  check = () => true;
  async run(model: AuditModel, world: AuditWorld): Promise<void> {
    const answer = await world.audit.record(issuance(this.runId), world.clock, newId);
    expect(answer).toBe(expectIssuance(model, this.runId));
    checkRows(model);
  }
  toString = () => `IssueOne(${this.runId})`;
}

/**
 * Two issuances started together: both read outside the write turn before
 * either enters it, and the turn then serves them in arrival order.
 */
class IssueRacing implements fc.AsyncCommand<AuditModel, AuditWorld> {
  constructor(
    readonly first: string,
    readonly second: string,
  ) {}
  check = () => true;
  async run(model: AuditModel, world: AuditWorld): Promise<void> {
    const answers = await Promise.all([
      world.audit.record(issuance(this.first), world.clock, newId),
      world.audit.record(issuance(this.second), world.clock, newId),
    ]);
    expect(answers).toEqual([
      expectIssuance(model, this.first),
      expectIssuance(model, this.second),
    ]);
    checkRows(model);
  }
  toString = () => `IssueRacing(${this.first}, ${this.second})`;
}

describe('the issuance audit as a model invariant', () => {
  // The day starts with 98 runs written, so a race crosses row 99 and 100
  // within a few commands.
  // Proof: with the count read once outside the write turn and reused inside
  // it (no recount in the turn), seed 20261026 failed on `[IssueOne(r4),
  // IssueRacing(r0, r1)]`: both racers had read 99 and answered 'recorded'
  // where the model expected 'recorded' then 'overflow_recorded', the second
  // writing the 101st run row. The overflow-stop and overflow-key mutations
  // above also failed this property; all watched 2026-10-26.
  it('never writes more than 100 run rows or a second overflow row, however issuances race', async () => {
    const run = fc.constantFrom('r0', 'r1', 'r2', 'r3', 'r4', 'r5');
    const commands = fc.commands(
      [
        run.map((each) => new IssueOne(each)),
        fc.tuple(run, run).map(([first, second]) => new IssueRacing(first, second)),
      ],
      { maxCommands: 8 },
    );
    await fc.assert(
      fc.asyncProperty(commands, async (history) => {
        rmSync(path, { force: true });
        runMigrations(path, FOLDER);
        const sqlite = openDatabase(path);
        try {
          sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
        } finally {
          sqlite.close();
        }
        const world: AuditWorld = { audit: openAudit().audit, clock: ticking(MORNING) };
        const model: AuditModel = { runs: new Set(), overflow: false };
        for (let seeded = 0; seeded < 98; seeded += 1)
          expect(
            await world.audit.record(issuance(`seed-${String(seeded)}`), world.clock, newId),
          ).toBe(expectIssuance(model, `seed-${String(seeded)}`));
        await fc.asyncModelRun(() => ({ model, real: world }), history);
      }),
      { numRuns: 25, seed: 20261026 },
    );
  }, 180_000);
});

/**
 * Rebuilds `organization_audit` with an action CHECK that admits no machine
 * token, keeping both issuance indexes, so the targeted insert prepares and
 * then violates the CHECK.
 */
function narrowAuditVocabulary(): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('PRAGMA foreign_keys = OFF');
    sqlite.run('DROP TRIGGER organization_audit_no_update');
    sqlite.run('DROP TRIGGER organization_audit_no_delete');
    sqlite.run('ALTER TABLE organization_audit RENAME TO organization_audit_wide');
    sqlite.run(`CREATE TABLE organization_audit (
      id text PRIMARY KEY NOT NULL,
      organization_id text NOT NULL REFERENCES organization(id),
      actor_id text NOT NULL,
      action text NOT NULL CHECK (action IN ('machine_credential_created')),
      subject_kind text NOT NULL,
      subject_id text NOT NULL,
      detail text NOT NULL,
      created_at integer NOT NULL
    )`);
    sqlite.run('DROP TABLE organization_audit_wide');
    sqlite.run(`CREATE UNIQUE INDEX organization_audit_machine_token_issued_run ON organization_audit (
      json_extract(detail, '$.credentialId'), created_at / 86400000,
      coalesce(json_extract(detail, '$.runId'), '')
    ) WHERE action = 'machine_token_issued'`);
    sqlite.run(`CREATE UNIQUE INDEX organization_audit_machine_token_issued_overflow_day ON organization_audit (
      json_extract(detail, '$.credentialId'), created_at / 86400000
    ) WHERE action = 'machine_token_issued_overflow'`);
  } finally {
    sqlite.close();
  }
}
