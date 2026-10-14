import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { openDatabase, openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import { digestSharedPeople } from '@wbs/store-sqlite/shared-people-backup';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from './testing/organization-harness';

let directory: string;
let database: string;
let backup: string;
let docker: string;
let approvalIds: string[];
let actorA: string;
let actorB: string;
let saved: ReturnType<typeof createBackup>;
const operationId = 'process-restore';
const tables = [
  'organization',
  'organization_membership',
  'project_rank',
  'shared_people_audit',
  'event_log',
  'event_sequencer',
  'shared_people_restore_operation',
  'shared_people_restore_approval',
  'shared_people_restore_receipt',
  'shared_people_restore_consumption',
];
function createBackup(author: string) {
  return {
    format: 'shared-people-save',
    version: 1,
    organizations: [
      { organizationId: 'org-b', mode: 'isolated' },
      { organizationId: 'org-a', mode: 'shared' },
    ],
    ranks: [
      {
        projectId: 'b1',
        organizationId: 'org-b',
        position: 7,
        createdAt: 2,
        updatedAt: 3,
        createdBy: author,
      },
    ],
  };
}
function query(statement: string) {
  const sqlite = openReadOnlyDatabase(database);
  try {
    return sqlite.query(statement).all();
  } finally {
    sqlite.close();
  }
}
function execute(statement: string) {
  const sqlite = openDatabase(database);
  try {
    sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}
function snapshot() {
  return tables.map((table) => ({ table, rows: query(`SELECT * FROM ${table} ORDER BY rowid`) }));
}
function container(name: string, running = false, source = dirname(database)) {
  return {
    Id: name,
    Name: '/' + name,
    State: {
      Running: running,
      Paused: false,
      Restarting: false,
      Status: running ? 'running' : 'exited',
    },
    Config: { Env: [`DB_PATH=/data/${basename(database)}`] },
    Mounts: [{ Type: 'bind', Source: source, Destination: '/data', RW: true }],
  };
}
function inventory(containers = [container('be-01-blue'), container('be-01-green')]) {
  writeFileSync(join(directory, 'inventory.json'), JSON.stringify(containers));
  writeFileSync(join(directory, 'ids'), containers.map((entry) => entry.Id).join('\n'));
}
function start(mode = 'shared') {
  const fixture = new URL('./testing/shared-people-host-restore-process.ts', import.meta.url)
    .pathname;
  return Bun.spawn([process.execPath, fixture, join(directory, 'request.json'), mode], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
}
async function collect(child: ReturnType<typeof start>) {
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}
async function recover(mode = 'shared') {
  return collect(start(mode));
}
async function refused(message: string, mode = 'shared') {
  const before = snapshot();
  const answer = await recover(mode);
  expect(answer.exit).not.toBe(0);
  expect(answer.stderr).toContain(message);
  expect(snapshot()).toEqual(before);
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-shared-process-'));
  const harness = OrganizationHarness.openComposed();
  try {
    await harness.register('alice');
    await harness.register('bob');
    actorA = harness.userId('alice');
    actorB = harness.userId('bob');
    for (const [org, username] of [
      ['org-a', 'alice'],
      ['org-b', 'bob'],
    ] as const) {
      harness.organization(org);
      harness.member(org, username, 'super_admin');
      harness.bind(username, org);
    }
    // Cross-org authority must never replace the locally recorded personal approver.
    harness.member('org-a', 'bob', 'super_admin');
    harness.member('org-b', 'alice', 'super_admin');
    harness.activate();
    for (const [project, org, owner] of [
      ['a1', 'org-a', actorA],
      ['a-unranked', 'org-a', actorA],
      ['b1', 'org-b', actorB],
    ]) {
      harness.sqlite.run(
        'INSERT INTO project (id, name, owner_id, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
        [project, project, owner, owner],
      );
      harness.sqlite.run(
        'INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)',
        [project, org],
      );
    }
    saved = createBackup(actorB);
    const canonical = {
      format: 'shared-people-save',
      version: 1,
      organizations: [
        { organizationId: 'org-a', mode: 'shared' },
        { organizationId: 'org-b', mode: 'isolated' },
      ],
      ranks: saved.ranks,
    };
    expect(digestSharedPeople(saved)).toBe(
      createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex'),
    );
    backup = join(directory, 'backup.json');
    writeFileSync(backup, JSON.stringify(saved));
    approvalIds = [];
    for (const username of ['alice', 'bob']) {
      const answer = await harness.call(
        username,
        'POST',
        '/api/organization/shared-people/restore-approvals',
        { operationId, backupDigest: digestSharedPeople(saved) },
      );
      expect(answer.status).toBe(200);
      const approval = (
        answer.body as { approval: { id: string; actorId: string; backupDigest: string } }
      ).approval;
      expect(approval.actorId).toBe(harness.userId(username));
      expect(approval.backupDigest).toBe(digestSharedPeople(saved));
      approvalIds.push(approval.id);
    }
    database = await harness.stopForRecovery();
  } catch (cause) {
    await harness.closeComposed();
    throw cause;
  }
  docker = join(directory, 'docker');
  inventory();
  writeFileSync(
    docker,
    `#!/bin/sh\ncase "$1" in\nps) cat '${directory}/ids';;\ninspect) cat '${directory}/inventory.json';;\n*) exit 99;;\nesac\n`,
  );
  chmodSync(docker, 0o700);
  writeFileSync(
    join(directory, 'request.json'),
    JSON.stringify({
      request: { backup, operationId, approvalIds },
      paths: { database, docker, lock: join(directory, 'deploy.lock') },
    }),
  );
});
afterEach(() => {
  rmSync(dirname(database), { recursive: true, force: true });
  rmSync(directory, { recursive: true, force: true });
});
// Proof: legacy dispatch failed lost-output exit/receipt; bypassed receipt retry failed cold retry after later edits.
it('recovers authenticated two-organization evidence in a cold host process and retries lost output without writes', async () => {
  const child = start('lost-output');
  const lost = await collect(child);
  expect(lost.exit).toBe(73);
  expect(lost.stdout).toBe('');
  const receipts = query('SELECT * FROM shared_people_restore_receipt');
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    operation_id: operationId,
    backup_digest: digestSharedPeople(saved),
    organizations: 2,
    ranks: 1,
    mode_changes: 1,
    events: 2,
  });
  const completedAt = (receipts[0] as { completed_at: number }).completed_at;
  expect(query('SELECT id, shared_people, updated_at FROM organization ORDER BY id')).toEqual([
    { id: 'org-a', shared_people: 1, updated_at: completedAt },
    { id: 'org-b', shared_people: 0, updated_at: null },
  ]);
  expect(query('SELECT created_at FROM shared_people_audit')).toEqual([
    { created_at: completedAt },
  ]);
  expect(query('SELECT created_at FROM event_log')).toEqual([
    { created_at: completedAt },
    { created_at: completedAt },
  ]);
  expect(query('SELECT organization_id, actor_id, shared_people FROM shared_people_audit')).toEqual(
    [{ organization_id: 'org-a', actor_id: actorA, shared_people: 1 }],
  );
  expect(
    query(
      'SELECT project_id, organization_id, position, created_at, updated_at, created_by FROM project_rank',
    ),
  ).toEqual([
    {
      project_id: 'b1',
      organization_id: 'org-b',
      position: 7,
      created_at: 2,
      updated_at: 3,
      created_by: actorB,
    },
  ]);
  expect(query('SELECT subscription, seq, message FROM event_log ORDER BY subscription')).toEqual(
    ['a-unranked', 'a1'].map((projectId) => ({
      subscription: 'project:' + projectId,
      seq: 0,
      message: JSON.stringify({ type: 'elsewhere_changed', projectId, causeProjectId: null }),
    })),
  );
  expect(query('SELECT subscription, next_seq FROM event_sequencer ORDER BY subscription')).toEqual(
    ['a-unranked', 'a1'].map((projectId) => ({
      subscription: 'project:' + projectId,
      next_seq: 1,
    })),
  );
  expect(
    query(
      'SELECT approval_id, operation_id, organization_id FROM shared_people_restore_consumption ORDER BY organization_id',
    ),
  ).toEqual(
    ['org-a', 'org-b'].map((organization_id, index) => ({
      approval_id: approvalIds[index],
      operation_id: operationId,
      organization_id,
    })),
  );
  execute('UPDATE project_rank SET position=999');
  execute('DELETE FROM organization_membership');
  const before = snapshot();
  const retry = await recover();
  expect(retry.exit).toBe(0);
  expect(JSON.parse(retry.stdout)).toMatchObject({
    operationId,
    backupDigest: digestSharedPeople(saved),
    ranks: 1,
    events: 2,
    approvalIds: [...approvalIds].sort(),
    completedAt: (receipts[0] as { completed_at: number }).completed_at,
  });
  expect(snapshot()).toEqual(before);
});
// Proof: independently dropping actor identity, organization identity or role admitted the demoted/deleted approver.
it('rechecks the recorded actor and local role after the app has stopped', async () => {
  for (const actor of [actorA, actorB]) {
    execute(
      `UPDATE organization_membership SET role='admin' WHERE user_id='${actor}' AND organization_id='${actor === actorA ? 'org-a' : 'org-b'}'`,
    );
    await refused('no longer a super-admin');
    execute(`UPDATE organization_membership SET role='super_admin' WHERE user_id='${actor}'`);
    const organization = actor === actorA ? 'org-a' : 'org-b';
    execute(
      `DELETE FROM organization_membership WHERE user_id='${actor}' AND organization_id='${organization}'`,
    );
    await refused('no longer a super-admin');
    execute(
      `INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('${organization}', '${actor}', 'super_admin', 1)`,
    );
  }
});
// Proof: removing the outer transaction changed the complete snapshot after SIGKILL; early flock release admitted its rival.
it('rolls back every shared WAL table on precommit process death and releases the host flock', async () => {
  execute(`CREATE TABLE restore_probe (bytes BLOB NOT NULL)`);
  execute(
    `CREATE TRIGGER block_restore BEFORE INSERT ON shared_people_restore_receipt BEGIN INSERT INTO restore_probe VALUES (randomblob(8000000)); SELECT sum(x) FROM (WITH RECURSIVE counter(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM counter WHERE x<100000000) SELECT x FROM counter); END`,
  );
  const sqlite = openDatabase(database);
  sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)');
  sqlite.run('PRAGMA busy_timeout=0');
  const before = snapshot();
  const owner = start();
  try {
    const deadline = Date.now() + 7000;
    let writing = false;
    while (Date.now() < deadline) {
      try {
        sqlite.run('BEGIN IMMEDIATE');
        sqlite.run('ROLLBACK');
      } catch (cause) {
        if (!(cause instanceof Error) || !cause.message.includes('locked')) throw cause;
        writing = true;
        break;
      }
      await Bun.sleep(5);
    }
    expect(writing).toBe(true);
    while (Date.now() < deadline && statSync(database + '-wal').size < 1000000) await Bun.sleep(5);
    expect(statSync(database + '-wal').size).toBeGreaterThan(1000000);
    expect(
      await Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']).exited,
    ).toBe(1);
    owner.kill('SIGKILL');
    expect((await collect(owner)).exit).not.toBe(0);
    expect(
      await Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']).exited,
    ).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(query('SELECT * FROM restore_probe')).toEqual([]);
    sqlite.run('DROP TRIGGER block_restore');
    expect((await recover()).exit).toBe(0);
  } finally {
    if (owner.exitCode === null) {
      owner.kill('SIGKILL');
      await owner.exited;
    }
    sqlite.close();
  }
}, 15000);
// Proof: capability widening failed the isolated-only declaration; bypassing the real host guard made the unchanged CLI return success.
it('keeps the production CLI capability isolated-only before a writable opener', async () => {
  execute('PRAGMA journal_mode=DELETE');
  expect(SUPPORTED_CAPACITY_MODES).toEqual(['isolated']);
  await refused('unsupported capacity mode shared', 'production-cli');
  expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
});
// Proof: rereading the backup during audited dispatch failed when inspection replaced its pathname with malformed JSON.
it('retains shared approval-bound bytes across inspection pathname replacement', async () => {
  writeFileSync(
    docker,
    `#!/bin/sh\ncase "$1" in\nps) cat '${directory}/ids';;\ninspect) printf '{' > '${backup}'; cat '${directory}/inventory.json';;\nesac\n`,
  );
  expect((await recover()).exit).toBe(0);
  expect(readFileSync(backup, 'utf8')).toBe('{');
  expect(query('SELECT * FROM shared_people_restore_receipt')).toHaveLength(1);
});
// Proof: bypassing colour shutdown admitted a running writer; substituting the DB for mount resolution admitted absent/unreadable sources.
it('refuses shared physical faults before opening the writable database', async () => {
  execute('PRAGMA journal_mode=DELETE');
  for (const name of ['be-01-blue', 'be-01-green', 'extra-writer']) {
    inventory([
      container('be-01-blue', name === 'be-01-blue'),
      container('be-01-green', name === 'be-01-green'),
      ...(name === 'extra-writer' ? [container(name, true)] : []),
    ]);
    await refused('writable container is not stopped');
    expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
  }
  const foreign = join(directory, 'foreign');
  mkdirSync(foreign);
  writeFileSync(join(foreign, basename(database)), 'foreign inode');
  inventory([container('be-01-blue'), container('be-01-green', false, foreign)]);
  await refused('database identity differs');
  inventory([
    container('be-01-blue'),
    container('be-01-green'),
    container('extra', false, join(directory, 'absent')),
  ]);
  await refused('ENOENT');
  const parent = join(directory, 'inaccessible');
  mkdirSync(parent);
  const source = join(parent, 'mount');
  mkdirSync(source);
  inventory([container('be-01-blue'), container('be-01-green'), container('extra', false, source)]);
  chmodSync(parent, 0o000);
  try {
    await refused('EACCES');
  } finally {
    chmodSync(parent, 0o700);
  }
  expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
  inventory();
  const holder = Bun.spawn(['flock', '--no-fork', join(directory, 'deploy.lock'), 'sleep', '30']);
  try {
    const deadline = Date.now() + 3000;
    while (
      (await Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']).exited) ===
      0
    ) {
      if (Date.now() > deadline) throw new Error('flock holder failed to acquire');
      await Bun.sleep(5);
    }
    await refused('deploy lock held');
  } finally {
    holder.kill('SIGKILL');
    await holder.exited;
  }
  expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
  expect((await recover()).exit).toBe(0);
});

const dockerProof = process.env['WBS_HOST_RESTORE_REAL_DOCKER'] === '1' ? it : it.skip;
dockerProof(
  'fences real shared blue/green and alias writers, then commits with all test-owned writers stopped',
  async () => {
    const image = process.env['WBS_HOST_RESTORE_PROOF_IMAGE'];
    if (image === undefined || image === '')
      throw new Error('WBS_HOST_RESTORE_PROOF_IMAGE is required');
    const proofImage = image;
    const label = `wbs-shared-process-proof=${String(process.pid)}`;
    const owned = new Set<string>();
    async function command(args: string[]) {
      const child = Bun.spawn(['/usr/bin/docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
      const answer = await collect(child);
      if (answer.exit !== 0) throw new Error(`Docker proof refused: ${answer.stderr}`);
      return answer.stdout.trim();
    }
    async function create(name: string, source: string) {
      const id = await command([
        'create',
        '--name',
        name,
        '--label',
        label,
        '--mount',
        `type=bind,source=${source},target=/data`,
        '--env',
        `DB_PATH=/data/${basename(database)}`,
        '--entrypoint',
        '/bin/sh',
        proofImage,
        '-c',
        'sleep 120',
      ]);
      owned.add(id);
      return id;
    }
    async function remove(id: string) {
      await command(['rm', '--force', id]);
      owned.delete(id);
    }
    execute('PRAGMA journal_mode=DELETE');
    const alias = join(directory, 'alias');
    mkdirSync(alias);
    linkSync(database, join(alias, basename(database)));
    const inaccessible = join(directory, 'inaccessible');
    mkdirSync(inaccessible);
    const source = join(inaccessible, 'mount');
    mkdirSync(source);
    try {
      const blue = await create('be-01-blue', dirname(database));
      let green = await create('be-01-green', alias);
      const writer = await create('wbs-shared-process-writer', alias);
      // Inventory scope is test-owned; every physical state and mount comes from the real daemon.
      writeFileSync(
        docker,
        `#!/bin/sh\ncase "$1" in\nps) exec /usr/bin/docker ps --all --quiet --no-trunc --filter 'label=${label}';;\ninspect) exec /usr/bin/docker "$@";;\n*) exit 99;;\nesac\n`,
      );
      for (const id of [blue, green, writer]) {
        await command(['start', id]);
        await refused('writable container is not stopped');
        expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
        await command(['stop', '--time', '0', id]);
      }
      const foreign = join(directory, 'foreign');
      mkdirSync(foreign);
      writeFileSync(join(foreign, basename(database)), 'foreign database inode');
      await remove(green);
      green = await create('be-01-green', foreign);
      await refused('database identity differs');
      await remove(green);
      green = await create('be-01-green', alias);
      const extra = await create('wbs-shared-process-source', source);
      rmSync(source, { recursive: true });
      await refused('ENOENT');
      mkdirSync(source);
      chmodSync(inaccessible, 0o000);
      try {
        await refused('EACCES');
      } finally {
        chmodSync(inaccessible, 0o700);
      }
      await remove(extra);
      expect(query('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
      const restored = await recover();
      expect(restored.stderr).toBe('');
      expect(restored.exit).toBe(0);
      expect(JSON.parse(restored.stdout)).toMatchObject({
        operationId,
        modeChanges: 1,
        events: 2,
        ranks: 1,
        approvalIds: [...approvalIds].sort(),
      });
      expect(query('SELECT * FROM shared_people_restore_consumption')).toHaveLength(2);
    } finally {
      chmodSync(inaccessible, 0o700);
      for (const id of [...owned].reverse()) await remove(id);
    }
  },
  30000,
);
