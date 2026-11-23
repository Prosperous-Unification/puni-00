import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterEach, expect, it } from 'bun:test';
interface CapturedRecovery {
  artifacts: {
    name: string;
    path: string;
    sha256: string;
    uncompressedSha256: string;
    uncompressedBytes: number;
  }[];
  saved: {
    format: string;
    version: number;
    organizations: { organizationId: string; mode: string }[];
    ranks: {
      projectId: string;
      organizationId: string;
      position: number;
      createdAt: number;
      updatedAt: number | null;
      createdBy: string;
    }[];
  };
  ledger: { name: string; hash: string }[];
  digest: string;
  binding: { operationId: string; approvalIds: string[] };
  actorId: string;
  projects: string[];
  receipt: {
    operationId: string;
    backupDigest: string;
    completedAt: number;
    organizations: number;
    ranks: number;
    modeChanges: number;
    events: number;
    approvalIds: string[];
  };
  pendingTables: { table: string; rows: Record<string, unknown>[] }[];
  completedTables: { table: string; rows: Record<string, unknown>[] }[];
}
const evidence = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-shared-people-recovery1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as CapturedRecovery;
import { openConnection, openDatabase } from './db';
import { runMigrations } from './migrate';
import { digestSharedPeople } from './shared-people-backup';
import { restoreApprovedSharedPeople } from './shared-people-restore';
import { copyRecoveryPrefix, readRecoveryState } from './testing/recovery-state';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const identityTables = [
  'shared_people_restore_operation',
  'shared_people_restore_approval',
  'shared_people_restore_receipt',
  'shared_people_restore_consumption',
];
function query(path: string, sql: string) {
  const sqlite = openDatabase(path);
  try {
    return sqlite.query<Record<string, unknown>, []>(sql).all();
  } finally {
    sqlite.close();
  }
}
function execute(path: string, sql: string) {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(sql);
  } finally {
    sqlite.close();
  }
}
function identityRows(path: string) {
  return identityTables.map((table) => ({
    table,
    rows: query(path, 'SELECT * FROM ' + table + ' ORDER BY rowid'),
  }));
}
function prepare(name: 'pending' | 'completed') {
  const artifact = evidence.artifacts.find((candidate) => candidate.name === name);
  if (artifact === undefined) throw Error('required outgoing recovery artifact absent');
  const compressed = readFileSync(new URL('../../../../../' + artifact.path, import.meta.url));
  expect(sha(compressed)).toBe(artifact.sha256);
  const bytes = gunzipSync(compressed);
  expect(sha(bytes)).toBe(artifact.uncompressedSha256);
  expect(bytes.length).toBe(artifact.uncompressedBytes);
  const directory = mkdtempSync(join(tmpdir(), 'wbs-recovery-rename-'));
  directories.push(directory);
  const path = join(directory, 'fixture.sqlite');
  writeFileSync(path, bytes, { flag: 'wx' });
  const before = identityRows(path),
    ledger = query(path, 'SELECT * FROM __drizzle_migrations ORDER BY id');
  expect(ledger).toHaveLength(110);
  expect(query(path, 'SELECT name,hash FROM __drizzle_migrations ORDER BY id')).toEqual(
    evidence.ledger,
  );
  const original = name === 'pending' ? evidence.pendingTables : evidence.completedTables;
  expect(before).toEqual(original.filter((table) => identityTables.includes(table.table)));
  const immutableTransport = ['shared_people_audit', 'event_log', 'event_sequencer'].map(
    (table) => ({ table, rows: query(path, 'SELECT * FROM ' + table + ' ORDER BY rowid') }),
  );
  const rename = '20261110100000_rename_project_to_work_package';
  const migrations = copyRecoveryPrefix(directory, rename);
  runMigrations(path, migrations);
  const afterLedger = query(path, 'SELECT * FROM __drizzle_migrations ORDER BY id');
  expect(afterLedger).toHaveLength(111);
  expect(afterLedger.slice(0, 110)).toEqual(ledger);
  expect(afterLedger.at(-1)).toMatchObject({
    name: rename,
    hash: sha(readFileSync(join(migrations, rename, 'migration.sql'))),
  });
  expect(identityRows(path)).toEqual(before);
  expect(immutableTransport).toEqual(
    immutableTransport.map(({ table }) => ({
      table,
      rows: query(path, 'SELECT * FROM ' + table + ' ORDER BY rowid'),
    })),
  );
  const originalRanks = original.find((table) => table.table === 'project_rank');
  if (originalRanks === undefined)
    throw new Error('required historical project_rank capture absent');
  deepStrictEqual(
    query(
      path,
      'SELECT work_package_id AS project_id,organization_id,position,created_at,updated_at,created_by FROM work_package_rank ORDER BY rowid',
    ),
    originalRanks.rows,
  );
  return path;
}
async function restore(path: string, saved: unknown = evidence.saved, at = 200) {
  const connection = openConnection(path);
  try {
    return await restoreApprovedSharedPeople(connection.db, saved, evidence.binding, at);
  } finally {
    connection.close();
  }
}

it('actual111 preserves genuine outgoing pending approval rows and restores their original version1 digest', async () => {
  const path = prepare('pending');
  expect(digestSharedPeople(evidence.saved)).toBe(evidence.digest);
  const before = identityRows(path);
  const receipt = await restore(path);
  expect(receipt).toEqual({ ...evidence.receipt, completedAt: 200 });
  expect(identityRows(path).slice(0, 2)).toEqual(before.slice(0, 2));
  expect(
    query(
      path,
      'SELECT organization_id,actor_id,shared_people,created_at FROM shared_people_audit',
    ),
  ).toEqual([
    { organization_id: 'org-a', actor_id: evidence.actorId, shared_people: 1, created_at: 200 },
  ]);
  const events = query(path, 'SELECT message FROM event_log WHERE created_at=200');
  expect(events).toHaveLength(1);
  expect(JSON.parse(String(events[0]?.['message'])) as unknown).toEqual({
    type: 'elsewhere_changed',
    workPackageId: evidence.projects[0],
    causeWorkPackageId: null,
  });
  expect(evidence.saved.version).toBe(1);
  expect(evidence.saved.ranks[0]).toHaveProperty('projectId');
  expect(evidence.saved.ranks[0]).not.toHaveProperty('workPackageId');
});
it('equivalent current2 facts cannot retarget genuine version1 pending operation or personal approvals', async () => {
  const path = prepare('pending');
  const current = {
    format: evidence.saved.format,
    version: 2,
    organizations: evidence.saved.organizations,
    ranks: evidence.saved.ranks.map(({ projectId, ...facts }) => ({
      workPackageId: projectId,
      ...facts,
    })),
  };
  expect(digestSharedPeople(current)).not.toBe(evidence.digest);
  const before = readRecoveryState(path);
  const refusal = await restore(path, current).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain(
    'restore operation binding does not match canonical backup digest',
  );
  expect(readRecoveryState(path)).toEqual(before);
  expect((await restore(path)).backupDigest).toBe(evidence.digest);
});
it('actual111 returns original completed version1 cold receipt after later rank and membership edits without writes', async () => {
  const path = prepare('completed');
  execute(path, 'UPDATE work_package_rank SET position=position+99');
  execute(path, "DELETE FROM organization_membership WHERE organization_id='org-a'");
  const before = readRecoveryState(path);
  expect(await restore(path, evidence.saved, 999)).toEqual(evidence.receipt);
  expect(readRecoveryState(path)).toEqual(before);
  expect(identityRows(path)).toEqual(
    evidence.completedTables.filter((table) => identityTables.includes(table.table)),
  );
});
for (const loss of ['grant', 'membership'] as const)
  it(
    'genuine pending version1 restore rechecks current ' +
      loss +
      ' and preserves every migrated evidence row',
    async () => {
      const path = prepare('pending'),
        actor = evidence.actorId;
      const grants = query(
        path,
        "SELECT id FROM access_grant WHERE organization_id='org-a' AND scope_kind='organization' AND subject_kind='user' AND subject_id='" +
          actor +
          "' AND role_id='org-super-admin'",
      );
      const members = query(
        path,
        "SELECT user_id FROM organization_membership WHERE organization_id='org-a' AND user_id='" +
          actor +
          "'",
      );
      expect(grants).toHaveLength(1);
      expect(members).toHaveLength(1);
      if (loss === 'grant')
        execute(path, "DELETE FROM access_grant WHERE id='" + String(grants[0]?.['id']) + "'");
      else
        execute(
          path,
          "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='" +
            actor +
            "'",
        );
      const before = readRecoveryState(path);
      const refusal = await restore(path).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(refusal).toBeInstanceOf(Error);
      expect(String(refusal)).toContain('no longer holds organization.manage_security');
      expect(readRecoveryState(path)).toEqual(before);
      expect(identityRows(path)).toEqual(
        evidence.pendingTables.filter((table) => identityTables.includes(table.table)),
      );
      if (loss === 'grant')
        expect(
          query(
            path,
            "SELECT user_id FROM organization_membership WHERE organization_id='org-a' AND user_id='" +
              actor +
              "'",
          ),
        ).toEqual(members);
      else
        expect(
          query(
            path,
            "SELECT id FROM access_grant WHERE organization_id='org-a' AND scope_kind='organization' AND subject_kind='user' AND subject_id='" +
              actor +
              "' AND role_id='org-super-admin'",
          ),
        ).toEqual(grants);
    },
  );
