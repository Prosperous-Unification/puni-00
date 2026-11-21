import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '@wbs/store-sqlite/db';
import { runMigrations } from '@wbs/store-sqlite/migrate';
import { rollbackTo } from '@wbs/store-sqlite/migrate-down';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, it } from 'bun:test';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const BASELINE = '20261102130000_widen_organization_audit_access';
const MIGRATION = '20261103110000_add_initial_access_offers';
let directory: string;
let path: string;
let db: Database;

function insertLegacy(
  id: string,
  role: string,
  state: 'pending' | 'revoked' | 'consumed' = 'pending',
) {
  db.run(
    'INSERT INTO organization_invitation(id,organization_id,recipient_email,role,token_digest,expires_at,revoked_at,consumed_at,consumed_by,created_at,created_by) VALUES(?,?,?,?,?,1000,?,?,?,1,?)',
    [
      id,
      'org',
      id + '@example.test',
      role,
      'digest-' + id,
      state === 'revoked' ? 5 : null,
      state === 'consumed' ? 5 : null,
      state === 'consumed' ? 'recipient' : null,
      'issuer',
    ],
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-initial-access-offers-'));
  path = join(directory, 'test.db');
  const baseline = join(directory, 'baseline');
  cpSync(FOLDER, baseline, { recursive: true });
  for (const folder of readdirSync(baseline, { withFileTypes: true }))
    if (folder.isDirectory() && folder.name > BASELINE)
      rmSync(join(baseline, folder.name), { recursive: true, force: true });
  runMigrations(path, baseline);
  db = openDatabase(path);
  for (const user of ['issuer', 'recipient'])
    db.run('INSERT INTO users(id,username,created_at) VALUES(?,?,1)', [user, user]);
  db.run("INSERT INTO organization(id,name,created_at) VALUES('org','Organization',1)");
  for (const role of ['admin', 'member', 'viewer'])
    for (const state of ['pending', 'revoked', 'consumed'] as const)
      insertLegacy(role + '-' + state, role, state);
  db.close();
  runMigrations(path, FOLDER);
  db = openDatabase(path);
});
afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

it('preserves every historical offer and old-writer insert as explicit initial access', () => {
  const columns = db
    .query<{ name: string }, []>('PRAGMA table_info(organization_invitation)')
    .all()
    .map((column) => column.name);
  expect(columns).toContain('initial_access');
  for (const [legacy, roleId] of [
    ['admin', 'org-admin'],
    ['member', 'project-contributor'],
    ['viewer', 'project-viewer'],
  ] as const) {
    for (const state of ['pending', 'revoked', 'consumed']) {
      const held = db
        .query<{ initial_access: string }, [string]>(
          'SELECT initial_access FROM organization_invitation WHERE id=?',
        )
        .get(legacy + '-' + state);
      expect(held === null ? null : JSON.parse(held.initial_access)).toEqual({
        kind: 'role',
        roleId,
      });
    }
    insertLegacy('old-writer-' + legacy, legacy);
    const created = db
      .query<{ initial_access: string }, [string]>(
        'SELECT initial_access FROM organization_invitation WHERE id=?',
      )
      .get('old-writer-' + legacy);
    expect(created === null ? null : JSON.parse(created.initial_access)).toEqual({
      kind: 'role',
      roleId,
    });
  }
  db.run(
    "INSERT INTO organization_invitation(id,organization_id,recipient_email,role,initial_access,token_digest,expires_at,created_at,created_by) VALUES('explicit-none','org','none@example.test','viewer',?,'none',1000,1,'issuer')",
    [JSON.stringify({ kind: 'none' })],
  );
  expect(
    db
      .query<{ initial_access: string }, []>(
        "SELECT initial_access FROM organization_invitation WHERE id='explicit-none'",
      )
      .get()?.initial_access,
  ).toBe('{"kind":"none"}');
  expect(
    db
      .query<{ name: string }, []>(
        'SELECT name FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
      )
      .get(),
  ).toEqual({ name: MIGRATION });
});

function rollbackOfferMigration(): string[] {
  db.close();
  try {
    return rollbackTo(path, FOLDER, BASELINE);
  } finally {
    db = openDatabase(path);
  }
}
function snapshot() {
  return {
    schema: db
      .query(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      )
      .all(),
    offers: db.query('SELECT * FROM organization_invitation ORDER BY id').all(),
    ledger: db.query('SELECT * FROM __drizzle_migrations ORDER BY id').all(),
  };
}

for (const [name, selection, legacy] of [
  ['explicit-none', '{"kind":"none"}', 'viewer'],
  ['org-viewer', '{"kind":"role","roleId":"org-viewer"}', 'viewer'],
  ['unknown-role', '{"kind":"role","roleId":"org-super-admin"}', 'viewer'],
  ['unknown-kind', '{"kind":"other","roleId":"project-viewer"}', 'viewer'],
  ['missing-kind-extra', '{"roleId":"org-admin","extra":1}', 'admin'],
  ['malformed-json', '{', 'viewer'],
  ['missing-selection', null, 'viewer'],
  ['array-selection', '[]', 'viewer'],
  ['missing-role', '{"kind":"role"}', 'viewer'],
  ['extra-field', '{"kind":"role","roleId":"project-viewer","extra":true}', 'viewer'],
  ['inverse-mismatch', '{"kind":"role","roleId":"org-admin"}', 'viewer'],
  ['inverse-member-mismatch', '{"kind":"role","roleId":"project-contributor"}', 'viewer'],
  ['inverse-viewer-mismatch', '{"kind":"role","roleId":"project-viewer"}', 'admin'],
  ['nonstring-role', '{"kind":"role","roleId":1}', 'viewer'],
] as const) {
  it('refuses offer rollback before changing historical evidence at ' + name, () => {
    db.run(
      "UPDATE organization_invitation SET initial_access=?,role=? WHERE id='viewer-consumed'",
      [selection, legacy],
    );
    const before = snapshot();
    expect(rollbackOfferMigration).toThrow(
      'initial access offers cannot be represented by the previous binary',
    );
    expect(snapshot()).toEqual(before);
  });
}

it('reverses representable initial access while preserving all offer history', () => {
  for (const [legacy, roleId] of [
    ['admin', 'org-admin'],
    ['member', 'project-contributor'],
    ['viewer', 'project-viewer'],
  ] as const) {
    db.run(
      'INSERT INTO organization_invitation(id,organization_id,recipient_email,role,initial_access,token_digest,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,1000,1,?)',
      [
        'new-' + legacy,
        'org',
        legacy + '@new.test',
        legacy,
        JSON.stringify({ kind: 'role', roleId }),
        'new-digest-' + legacy,
        'issuer',
      ],
    );
  }
  const before = db
    .query(
      'SELECT id,role,token_digest,revoked_at,consumed_at,consumed_by,created_by FROM organization_invitation ORDER BY id',
    )
    .all();
  expect(rollbackOfferMigration()).toEqual([MIGRATION]);
  expect(
    db
      .query<{ name: string }, []>('PRAGMA table_info(organization_invitation)')
      .all()
      .map((column) => column.name),
  ).not.toContain('initial_access');
  expect(
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='organization_invitation_initial_access'",
      )
      .all(),
  ).toEqual([]);
  expect(
    db
      .query(
        'SELECT id,role,token_digest,revoked_at,consumed_at,consumed_by,created_by FROM organization_invitation ORDER BY id',
      )
      .all(),
  ).toEqual(before);
});
