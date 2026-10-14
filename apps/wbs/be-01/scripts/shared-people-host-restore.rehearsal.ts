import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { SUPPORTED_CAPACITY_MODES } from '@wbs/domain';
import { openDatabase, openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import { digestSharedPeople } from '@wbs/store-sqlite/shared-people-backup';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { OrganizationHarness } from '../src/testing/organization-harness';

const image =
  'oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895';
const host = '/home/puni1/wbs';
let directory: string;
let containerId: string | undefined;
let approval: string;
let sharedApproval: string;
let saved: ReturnType<typeof createBackup>;
let operationId = 'packaged-restore';
function createBackup(actor: string, mode = 'isolated') {
  return {
    format: 'shared-people-save',
    version: 1,
    organizations: [{ organizationId: 'org-a', mode }],
    ranks: [
      {
        projectId: 'a1',
        organizationId: 'org-a',
        position: 7,
        createdAt: 2,
        updatedAt: 3,
        createdBy: actor,
      },
    ],
  };
}
async function runDocker(args: string[]) {
  const child = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}
// Proof: unavailable Docker socket made the actual rehearsal fail at docker run, with no skipped test.
async function requireDocker(args: string[]) {
  const answer = await runDocker(args);
  if (answer.exit !== 0) throw new Error(`isolated Docker rehearsal failed: ${answer.stderr}`);
  return answer.stdout.trim();
}
function queryDatabase(statement: string) {
  const sqlite = openReadOnlyDatabase(join(directory, 'data/wbs.db'));
  try {
    return sqlite.query(statement).all();
  } finally {
    sqlite.close();
  }
}
function executeStatement(statement: string) {
  const sqlite = openDatabase(join(directory, 'data/wbs.db'));
  try {
    sqlite.run(statement);
  } finally {
    sqlite.close();
  }
}
function snapshotDatabase() {
  return queryDatabase(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((row) => {
    // The test-owned SQLite catalogue query projects only its required name column.
    const name = (row as { name: string }).name;
    return { name, rows: queryDatabase(`SELECT * FROM "${name}" ORDER BY rowid`) };
  });
}
function writeInventory(running = false, foreign = false) {
  const containers = ['blue', 'green'].map((colour) => ({
    Id: colour,
    Name: '/be-01-' + colour,
    State: {
      Running: running && colour === 'green',
      Paused: false,
      Restarting: false,
      Status: running && colour === 'green' ? 'running' : 'exited',
    },
    Config: { Env: ['DB_PATH=/data/wbs.db'] },
    Mounts: [
      {
        Type: 'bind',
        Source: host + (foreign && colour === 'green' ? '/foreign' : '/data'),
        Destination: '/data',
        RW: true,
      },
    ],
  }));
  writeFileSync(join(directory, 'inventory.json'), JSON.stringify(containers));
}
async function runRecovery(approved = true) {
  if (containerId === undefined) throw new Error('rehearsal container missing');
  return runDocker([
    'exec',
    containerId,
    'bun',
    host + '/shared-people-host-restore.js',
    host + '/backup.json',
    ...(approved ? ['--operation=' + operationId, '--approval=' + approval] : []),
  ]);
}
async function expectRefusal(message: string, approved = true) {
  const before = snapshotDatabase();
  const bytes = createHash('sha256')
    .update(readFileSync(join(directory, 'data/wbs.db')))
    .digest('hex');
  const answer = await runRecovery(approved);
  expect(queryDatabase('PRAGMA journal_mode')).toEqual([{ journal_mode: 'delete' }]);
  expect(answer.exit).not.toBe(0);
  expect(answer.stderr).toContain(message);
  expect(snapshotDatabase()).toEqual(before);
  expect(
    createHash('sha256')
      .update(readFileSync(join(directory, 'data/wbs.db')))
      .digest('hex'),
  ).toBe(bytes);
}
beforeEach(async () => {
  operationId = 'packaged-restore';
  directory = mkdtempSync(join(tmpdir(), 'wbs-packaged-host-'));
  for (const path of ['data', 'state', 'bin', 'foreign']) mkdirSync(join(directory, path));
  const harness = OrganizationHarness.openComposed();
  let source: string;
  try {
    await harness.register('alice');
    const actor = harness.userId('alice');
    harness.organization('org-a');
    harness.member('org-a', 'alice', 'super_admin');
    harness.bind('alice', 'org-a');
    harness.activate();
    harness.sqlite.run(
      'INSERT INTO project (id, name, owner_id, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
      ['a1', 'a1', actor, actor],
    );
    harness.sqlite.run(
      'INSERT INTO project_organization (resource_id, organization_id) VALUES (?, ?)',
      ['a1', 'org-a'],
    );
    saved = createBackup(actor);
    const answer = await harness.call(
      'alice',
      'POST',
      '/api/organization/shared-people/restore-approvals',
      { operationId, backupDigest: digestSharedPeople(saved) },
    );
    expect(answer.status).toBe(200);
    // The composed approval endpoint's successful response supplies this test-owned approval ID.
    approval = (answer.body as { approval: { id: string } }).approval.id;
    const shared = await harness.call(
      'alice',
      'POST',
      '/api/organization/shared-people/restore-approvals',
      {
        operationId: 'packaged-shared-restore',
        backupDigest: digestSharedPeople(createBackup(actor, 'shared')),
      },
    );
    expect(shared.status).toBe(200);
    // The separately issued composed shared approval binds its own operation and canonical backup.
    sharedApproval = (shared.body as { approval: { id: string } }).approval.id;
    source = await harness.stopForRecovery();
  } catch (cause) {
    await harness.closeComposed();
    throw cause;
  }
  try {
    copyFileSync(source, join(directory, 'data/wbs.db'));
  } finally {
    rmSync(dirname(source), { recursive: true, force: true });
  }
  executeStatement('PRAGMA journal_mode=DELETE');
  writeFileSync(join(directory, 'foreign/wbs.db'), 'foreign inode');
  copyFileSync(
    resolve('dist/apps/wbs/be-01-host/shared-people-host-restore.js'),
    join(directory, 'shared-people-host-restore.js'),
  );
  writeFileSync(join(directory, 'backup.json'), JSON.stringify(saved));
  writeInventory();
  writeFileSync(
    join(directory, 'bin/docker'),
    `#!/bin/sh\ncase "$1" in\nps) printf 'blue\\ngreen\\n';;\ninspect) cat ${host}/inventory.json;;\n*) exit 99;;\nesac\n`,
  );
  chmodSync(join(directory, 'bin/docker'), 0o755);
  // Only the scratch fixture is mounted. The unchanged artifact sees fixed production paths,
  // a test-owned inventory executable, no checkout, node_modules, Docker socket or live mounts.
  containerId = await requireDocker([
    'run',
    '--detach',
    '--rm',
    '--pull=never',
    '--network=none',
    '--read-only',
    '--user',
    `${String(statSync(directory).uid)}:${String(statSync(directory).gid)}`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--mount',
    `type=bind,source=${directory},target=${host}`,
    '--env',
    `PATH=${host}/bin:/usr/local/bin:/usr/bin:/bin`,
    '--workdir',
    host,
    '--entrypoint',
    '/bin/sh',
    image,
    '-c',
    'exec sleep 300',
  ]);
  expect(await requireDocker(['exec', containerId, 'bun', '--version'])).toBe('1.4.2');
  expect(
    await requireDocker([
      'exec',
      containerId,
      '/bin/sh',
      '-c',
      'test ! -e /var/run/docker.sock && test ! -e /app/node_modules && test ! -e /app/apps && test ! -e /home/bun/app/node_modules',
    ]),
  ).toBe('');
});
afterEach(async () => {
  if (containerId !== undefined) {
    await requireDocker(['rm', '--force', containerId]);
    containerId = undefined;
  }
  rmSync(directory, { recursive: true, force: true });
});
// Proof: legacy dispatch loses the receipt; bypassing receipt lookup replays or refuses the cold retry after edits.
it('recovers approved isolated ranks with the exact bundle and cold retries its receipt', async () => {
  const answer = await runRecovery();
  expect(answer.exit).toBe(0);
  expect(answer.stderr).toBe('');
  expect(answer.stdout).toContain('1 organizations, 1 ranks');
  expect(queryDatabase('SELECT position FROM project_rank')).toEqual([{ position: 7 }]);
  expect(
    queryDatabase(
      'SELECT organizations, ranks, mode_changes, events FROM shared_people_restore_receipt',
    ),
  ).toEqual([{ organizations: 1, ranks: 1, mode_changes: 0, events: 0 }]);
  expect(queryDatabase('SELECT approval_id FROM shared_people_restore_consumption')).toEqual([
    { approval_id: approval },
  ]);
  executeStatement('UPDATE project_rank SET position=999');
  executeStatement('DELETE FROM organization_membership');
  const before = snapshotDatabase();
  const retry = await runRecovery();
  expect(retry.exit).toBe(0);
  expect(retry.stdout).toBe(answer.stdout);
  expect(snapshotDatabase()).toEqual(before);
});
// Proof: widening release capability admits the valid approved shared backup; bypassing the pre-opener guard changes DELETE to WAL.
it('refuses an approved shared backup before its writable opener and preserves every table and database byte', async () => {
  const organization = saved.organizations.at(0);
  if (organization === undefined) throw new Error('saved organization missing');
  organization.mode = 'shared';
  operationId = 'packaged-shared-restore';
  approval = sharedApproval;
  writeFileSync(join(directory, 'backup.json'), JSON.stringify(saved));
  await expectRefusal('unsupported capacity mode shared');
  await expectRefusal('requires operation and approval IDs', false);
  expect(SUPPORTED_CAPACITY_MODES).toEqual(['isolated']);
});
// Proof: dropping flock admits a competing owner; dropping colour/identity guards admits running green or a foreign physical database.
it('holds fixed host flock and refuses running colours and foreign database identity', async () => {
  writeInventory(true);
  await expectRefusal('writable container is not stopped');
  writeInventory(false, true);
  await expectRefusal('database identity differs');
  writeInventory();
  if (containerId === undefined) throw new Error('rehearsal container missing');
  await requireDocker([
    'exec',
    '--detach',
    containerId,
    '/bin/sh',
    '-c',
    `flock ${host}/state/deploy.lock /bin/sh -c 'touch ${host}/locked; sleep 30'`,
  ]);
  for (let attempt = 0; !(await Bun.file(join(directory, 'locked')).exists()); attempt++) {
    if (attempt > 100) throw new Error('flock holder never acquired fixed lock');
    await Bun.sleep(20);
  }
  await expectRefusal('deploy lock held');
});
