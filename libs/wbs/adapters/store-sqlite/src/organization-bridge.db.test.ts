import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase, openDrizzle } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';
import { OrganizationActivationRefused } from './organization-activation';
import {
  CATALOG_ROOT_KINDS,
  LegacyBackfillRefused,
  OrganizationOwnershipRepository,
  OWNED_ROOT_KINDS,
} from './organization-ownership';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
/** The activation marker, the folder stamped just below the bridge. */
const ORGANIZATION_ACTIVATION = '20260927180000_add_organization_activation';
const ORGANIZATION_BRIDGE = '20260927190000_add_organization_bridge';
/**
 * The newest: the triggers that freeze organization ownership, stamped after
 * {@link ORGANIZATION_BRIDGE} and reversed before it.
 */
const ORGANIZATION_FROZEN = '20260927200000_freeze_organization_ownership';
/** Stamped after the bridge, so every rollback below the bridge reverses it first. */
const TYPED_DEPENDENCY = '20260927213000_add_typed_dependency';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-organization-bridge-'));
  path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  run(["INSERT INTO users (id, username, created_at) VALUES ('u1', 'u1', 1)"]);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(statements: readonly string[]): void {
  const db = openDatabase(path);
  try {
    for (const statement of statements) db.run(statement);
  } finally {
    db.close();
  }
}

function rows(query: string): unknown[] {
  const db = openDatabase(path);
  try {
    return db.query(query).all();
  } finally {
    db.close();
  }
}

/** One root of every kind, written the way the outgoing release writes them. */
function writeRoots(suffix: string): string[] {
  return [
    `INSERT INTO project (id, name, owner_id, created_at) VALUES ('p${suffix}', 'Plan ${suffix}', 'u1', 1)`,
    `INSERT INTO person (id, name) VALUES ('pe${suffix}', 'Ada ${suffix}')`,
    `INSERT INTO service_team (id, name) VALUES ('st${suffix}', 'Platform ${suffix}')`,
    `INSERT INTO service (id, name) VALUES ('s${suffix}', 'Billing ${suffix}')`,
    `INSERT INTO tag (id, name) VALUES ('t${suffix}', 'urgent ${suffix}')`,
    `INSERT INTO work_item_type (id, name) VALUES ('w${suffix}', 'Bug ${suffix}')`,
    `INSERT INTO external_system (id, name) VALUES ('e${suffix}', 'Jira ${suffix}')`,
    `INSERT INTO saved_plan (id, project_id, name, created_by, created_at, input_schema_version, input_bytes, input_sha256, schedule_absent_reason)
     VALUES ('sp${suffix}', 'p${suffix}', 'Baseline', 'u1', 1, 1, 0, 'x', 'not-scheduled')`,
  ];
}

const LEGACY =
  "INSERT INTO organization (id, name, legacy, created_at) VALUES ('legacy', 'Legacy', 1, 1)";
const ACTIVATE =
  "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1";

/** Unmapped roots this test wrote, ignoring the catalog rows migrations seed. */
async function unmappedWritten(): Promise<string[]> {
  return (await repository().findUnmappedRoots())
    .map((root) => root.id)
    .filter((id) => /\d$/.test(id))
    .sort();
}

/** The error `pending` rejects with; a resolution fails the test. */
async function readRefusal(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal, but it resolved');
}

function total(counts: ReadonlyMap<string, number>): number {
  return [...counts.values()].reduce((sum, n) => sum + n, 0);
}

function repository(): OrganizationOwnershipRepository {
  return new OrganizationOwnershipRepository(openDrizzle(path));
}

function owners(suffix: string): Record<string, unknown> {
  return Object.fromEntries(
    OWNED_ROOT_KINDS.map((kind) => [
      kind,
      rows(
        `SELECT organization_id${(CATALOG_ROOT_KINDS as readonly string[]).includes(kind) ? ', name' : ''}
          FROM ${kind}_organization WHERE resource_id LIKE '%${suffix}'`,
      ),
    ]),
  );
}

describe('the legacy bridge before activation', () => {
  it('maps nothing and refuses backfill while no legacy organization exists', async () => {
    run([
      ...writeRoots('1'),
      "UPDATE tag SET name = 'renamed' WHERE id = 't1'",
      "DELETE FROM tag WHERE id = 't1'",
    ]);
    for (const kind of OWNED_ROOT_KINDS)
      expect(rows(`SELECT * FROM ${kind}_organization`)).toEqual([]);
    expect(await unmappedWritten()).toEqual(['e1', 'p1', 'pe1', 's1', 'sp1', 'st1', 'w1']);
    expect(await readRefusal(repository().backfillLegacyOwnership())).toBeInstanceOf(
      LegacyBackfillRefused,
    );
  });

  it('maps every root either release writes to the legacy organization, with its name', () => {
    run([LEGACY, ...writeRoots('1')]);
    expect(owners('1')).toEqual({
      project: [{ organization_id: 'legacy' }],
      person: [{ organization_id: 'legacy', name: 'Ada 1' }],
      service_team: [{ organization_id: 'legacy', name: 'Platform 1' }],
      service: [{ organization_id: 'legacy', name: 'Billing 1' }],
      tag: [{ organization_id: 'legacy', name: 'urgent 1' }],
      work_item_type: [{ organization_id: 'legacy', name: 'Bug 1' }],
      external_system: [{ organization_id: 'legacy', name: 'Jira 1' }],
      saved_plan: [{ organization_id: 'legacy' }],
    });
  });

  it('backfills earlier roots idempotently while another connection keeps writing', async () => {
    run(writeRoots('1'));
    run([LEGACY]);
    const unmapped = (await repository().findUnmappedRoots()).length;
    expect(unmapped).toBeGreaterThanOrEqual(8);
    expect(total(await repository().backfillLegacyOwnership())).toBe(unmapped);
    // An old writer on its own connection, between two backfill passes.
    run(writeRoots('2'));
    expect(total(await repository().backfillLegacyOwnership())).toBe(0);
    expect(await repository().findUnmappedRoots()).toEqual([]);
    expect(owners('2')['tag']).toEqual([{ organization_id: 'legacy', name: 'urgent 2' }]);
  });

  it('refuses to backfill over a root another organization owns', async () => {
    run(writeRoots('1'));
    run([
      LEGACY,
      "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
      "INSERT INTO project_organization VALUES ('p1', 'org-b')",
    ]);
    expect(await readRefusal(repository().backfillLegacyOwnership())).toBeInstanceOf(
      LegacyBackfillRefused,
    );
    expect(owners('1')).toEqual({
      project: [{ organization_id: 'org-b' }],
      person: [],
      service_team: [],
      service: [],
      tag: [],
      work_item_type: [],
      external_system: [],
      saved_plan: [],
    });
  });

  it('maps late writes from a second connection without another backfill', async () => {
    run(writeRoots('1'));
    run([LEGACY]);
    await repository().backfillLegacyOwnership();
    const outgoing = openDatabase(path);
    try {
      for (const statement of writeRoots('2')) outgoing.run(statement);
    } finally {
      outgoing.close();
    }
    expect(await unmappedWritten()).toEqual([]);
  });

  it('keeps every catalog side name equal through renames', async () => {
    run([LEGACY, ...writeRoots('1')]);
    run(
      CATALOG_ROOT_KINDS.map(
        (kind) => `UPDATE ${kind} SET name = name || ' renamed' WHERE id LIKE '%1'`,
      ),
    );
    expect(await repository().findCatalogNameDrift()).toEqual([]);
    expect(owners('1')['service']).toEqual([
      { organization_id: 'legacy', name: 'Billing 1 renamed' },
    ]);
  });

  it('reports catalog name drift the bridge missed', async () => {
    run([
      LEGACY,
      ...writeRoots('1'),
      'DROP TRIGGER tag_organization_name_bridge',
      "UPDATE tag SET name = 'lost' WHERE id = 't1'",
    ]);
    expect(await repository().findCatalogNameDrift()).toEqual([{ kind: 'tag', id: 't1' }]);
  });

  it('refuses a root whose mapping cannot be written, leaving no partial root', () => {
    run([
      LEGACY,
      ...writeRoots('1'),
      'DROP TRIGGER tag_organization_name_bridge',
      "UPDATE tag SET name = 'moved' WHERE id = 't1'",
    ]);
    // The legacy side row still says `urgent 1`, so a new tag of that name cannot be mapped.
    // The ownership freeze refuses the name before the unique index would.
    expect(() => {
      run(["INSERT INTO tag (id, name) VALUES ('t9', 'urgent 1')"]);
    }).toThrow(
      'organization ownership is immutable: tag_organization already maps this root or name',
    );
    expect(rows("SELECT id FROM tag WHERE id = 't9'")).toEqual([]);
  });

  const BROKEN_MARKERS: readonly (readonly [string, string])[] = [
    ['a missing marker row', 'DELETE FROM organization_activation'],
    ['a malformed marker', 'UPDATE organization_activation SET activated_at = 5'],
    ['an absent marker table', 'DROP TABLE organization_activation'],
  ];

  /** Breaks the marker past its CHECKs and triggers, as damaged storage would. */
  function breakMarker(corruption: string): void {
    run([
      'DROP TRIGGER organization_activation_no_delete',
      'DROP TRIGGER organization_activation_no_revert',
    ]);
    const db = openDatabase(path);
    try {
      db.run('PRAGMA ignore_check_constraints = ON');
      db.run(corruption);
    } finally {
      db.close();
    }
  }

  for (const [label, corruption] of BROKEN_MARKERS) {
    // Each new root; the saved plan hangs off project `p1`, written before the marker broke.
    it.each(
      writeRoots('9').map((insert, index) => [
        OWNED_ROOT_KINDS[index],
        insert.replace("'p9', 'Baseline'", "'p1', 'Baseline'"),
      ]),
    )(`refuses a %s insert over ${label}`, (kind, insert) => {
      run([LEGACY, ...writeRoots('1')]);
      breakMarker(corruption);
      expect(() => {
        run([insert]);
      }).toThrow(/organization activation marker is absent or malformed|no such table/);
    });

    it.each(CATALOG_ROOT_KINDS.map((kind) => [kind]))(
      `refuses a %s rename over ${label}`,
      (kind) => {
        run([LEGACY, ...writeRoots('1')]);
        const before = owners('1')[kind];
        breakMarker(corruption);
        expect(() => {
          run([`UPDATE ${kind} SET name = 'renamed' WHERE id LIKE '%1'`]);
        }).toThrow(/organization activation marker is absent or malformed|no such table/);
        expect(owners('1')[kind]).toEqual(before);
      },
    );
  }

  it('refuses backfill over a broken marker', async () => {
    run([LEGACY, 'DELETE FROM organization_activation']);
    expect(await readRefusal(repository().backfillLegacyOwnership())).toBeInstanceOf(
      OrganizationActivationRefused,
    );
  });
});

describe('the legacy bridge after activation', () => {
  it("leaves a second organization's roots and names to explicit mappings", () => {
    run([
      LEGACY,
      "INSERT INTO organization (id, name, created_at) VALUES ('org-b', 'B', 1)",
      ACTIVATE,
      "INSERT INTO tag (id, name) VALUES ('tb', 'b-tag')",
      "INSERT INTO tag_organization VALUES ('tb', 'org-b', 'urgent')",
      "INSERT INTO project (id, name, owner_id, created_at) VALUES ('pb', 'B plan', 'u1', 1)",
      "INSERT INTO project_organization VALUES ('pb', 'org-b')",
      "UPDATE tag SET name = 'b-tag renamed' WHERE id = 'tb'",
    ]);
    expect(
      rows("SELECT organization_id, name FROM tag_organization WHERE resource_id = 'tb'"),
    ).toEqual([{ organization_id: 'org-b', name: 'urgent' }]);
    expect(
      rows("SELECT organization_id FROM project_organization WHERE resource_id = 'pb'"),
    ).toEqual([{ organization_id: 'org-b' }]);
  });

  it('stops mirroring legacy catalog renames into organization display names', () => {
    run([LEGACY, ...writeRoots('1'), ACTIVATE, "UPDATE tag SET name = 'compat' WHERE id = 't1'"]);
    expect(owners('1')['tag']).toEqual([{ organization_id: 'legacy', name: 'urgent 1' }]);
  });

  it('refuses to backfill after activation', async () => {
    run(writeRoots('1'));
    run([LEGACY, ACTIVATE]);
    expect(await readRefusal(repository().backfillLegacyOwnership())).toBeInstanceOf(
      LegacyBackfillRefused,
    );
    expect(await unmappedWritten()).toEqual(['e1', 'p1', 'pe1', 's1', 'sp1', 'st1', 't1', 'w1']);
  });
});

describe('20260927190000_add_organization_bridge', () => {
  it('rolls back to no triggers, keeping mappings and legacy writes working', async () => {
    run([LEGACY, ...writeRoots('1')]);
    expect(rollbackTo(path, FOLDER, ORGANIZATION_ACTIVATION)).toEqual([
      '20261005110000_add_shared_people',
      '20261001020000_add_browser_auth_lifecycle',
      '20261001010000_add_browser_credential_revocations',
      '20260929180000_add_project_rank',
      '20260929100000_add_spaces',
      '20260928200000_add_work_item_status_facts',
      '20260928040000_add_email_challenge',
      '20260928030000_add_delegation_use',
      '20260928020000_add_email_verification',
      '20260928010000_add_project_solution',
      '20260927220000_add_organization_audit',
      TYPED_DEPENDENCY,
      ORGANIZATION_FROZEN,
      ORGANIZATION_BRIDGE,
    ]);
    expect(
      rows("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_bridge'"),
    ).toEqual([]);
    run([...writeRoots('2'), "UPDATE tag SET name = 'renamed' WHERE id = 't1'"]);
    expect(owners('1')['tag']).toEqual([{ organization_id: 'legacy', name: 'urgent 1' }]);
    expect(await unmappedWritten()).toEqual(['e2', 'p2', 'pe2', 's2', 'sp2', 'st2', 't2', 'w2']);
  });
});
