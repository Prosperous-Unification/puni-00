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
import { basename, join } from 'node:path';

import { openDatabase, openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import { digestSharedPeople } from '@wbs/store-sqlite/shared-people-backup';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, beforeEach, expect, it } from 'bun:test';

import { restoreSharedPeopleOnHost } from './shared-people-host-restore';

let directory: string;
let database: string;
let backup: string;
let docker: string;
let inventory: string;
let inventoryIds: string;
const saved = {
  format: 'shared-people-save',
  version: 1,
  organizations: [{ organizationId: 'org-a', mode: 'isolated' }],
  ranks: [
    {
      projectId: 'a1',
      organizationId: 'org-a',
      position: 0,
      createdAt: 1,
      updatedAt: 1,
      createdBy: 'ada',
    },
  ],
};
function container(name: string, running = false, source = directory) {
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
function writeInventory(
  containers: unknown[] = [container('be-01-blue'), container('be-01-green')],
) {
  writeFileSync(inventory, JSON.stringify(containers));
  writeFileSync(
    inventoryIds,
    containers
      .map((container) => {
        if (
          typeof container !== 'object' ||
          container === null ||
          !('Id' in container) ||
          typeof container.Id !== 'string'
        )
          return 'malformed';
        return container.Id;
      })
      .join('\n') + '\n',
  );
}
function invoke(operationId?: string, approvalIds: string[] = []) {
  return restoreSharedPeopleOnHost(
    { backup, operationId, approvalIds },
    { database, lock: join(directory, 'deploy.lock'), docker },
  );
}
async function refuses(invocation: Promise<unknown>, message?: string) {
  const failure: unknown = await invocation.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(failure)).toContain(message);
}
function rows() {
  const sqlite = openDatabase(database);
  try {
    return sqlite.query('SELECT project_id FROM project_rank').all();
  } finally {
    sqlite.close();
  }
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-host-restore-'));
  database = await openSpaceDatabase(directory);
  backup = join(directory, 'backup.json');
  inventory = join(directory, 'inventory.json');
  inventoryIds = join(directory, 'inventory-ids');
  docker = join(directory, 'docker');
  writeFileSync(backup, JSON.stringify(saved));
  writeInventory();
  writeFileSync(
    docker,
    `#!/bin/sh\ncase "$1" in\nps) cat '${inventoryIds}';;\ninspect) cat '${inventory}';;\n*) exit 99;;\nesac\n`,
  );
  chmodSync(docker, 0o700);
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('restores an isolated backup in the host owner after fencing all writers', async () => {
  expect(await invoke()).toEqual({ organizations: 1, ranks: 1 });
  expect(rows()).toEqual([{ project_id: 'a1' }]);
});
it('refuses either running colour and any other running writable container before writing', async () => {
  for (const name of ['be-01-blue', 'be-01-green', 'manual-writer']) {
    writeInventory([
      container('be-01-blue', name === 'be-01-blue'),
      container('be-01-green', name === 'be-01-green'),
      ...(name === 'manual-writer' ? [container(name, true)] : []),
    ]);
    await refuses(invoke(), 'writable container is not stopped');
    expect(rows()).toEqual([]);
  }
});
it('refuses missing colours, mismatched DB_PATH and a different database mount', async () => {
  const blue = container('be-01-blue');
  const green = container('be-01-green');
  const foreign = mkdtempSync(join(directory, 'foreign-'));
  writeFileSync(join(foreign, 'test.db'), 'different database inode');
  for (const containers of [
    [blue],
    [blue, { ...green, Config: { Env: ['DB_PATH=/data/other.db'] } }],
    [blue, container('be-01-green', false, foreign)],
  ]) {
    writeInventory(containers);
    await refuses(invoke());
    expect(rows()).toEqual([]);
  }
});
it('refuses malformed or failed Docker inspection without touching SQLite', async () => {
  for (const contents of ['{', '{}', '[]', JSON.stringify([{ Name: '/be-01-blue' }])]) {
    writeFileSync(inventory, contents);
    await refuses(invoke());
    expect(rows()).toEqual([]);
  }
  writeFileSync(docker, '#!/bin/sh\nexit 17\n');
  await refuses(invoke(), 'docker ps');
  expect(rows()).toEqual([]);
});
it('retains exactly one backup read even when Docker replaces its pathname', async () => {
  writeFileSync(
    docker,
    `#!/bin/sh\ncase "$1" in\nps) cat '${inventoryIds}';;\ninspect) printf '{' > '${backup}'; cat '${inventory}';;\nesac\n`,
  );
  expect(await invoke()).toEqual({ organizations: 1, ranks: 1 });
  expect(readFileSync(backup, 'utf8')).toBe('{');
  expect(rows()).toEqual([{ project_id: 'a1' }]);
});
it('refuses shared backups with absent, foreign or valid diagnostic consent without writing', async () => {
  const shared = { ...saved, organizations: [{ organizationId: 'org-a', mode: 'shared' }] };
  writeFileSync(backup, JSON.stringify(shared));
  await refuses(invoke(), 'operation and approval');
  await refuses(invoke('missing', ['missing']), 'operation binding');
  const sqlite = openDatabase(database);
  sqlite.run('INSERT INTO shared_people_restore_operation VALUES (?, ?, 1)', [
    'restore-1',
    digestSharedPeople(shared),
  ]);
  sqlite.run(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-1', 'restore-1', 'org-a', 'ada', 1)",
  );
  sqlite.run(
    "INSERT INTO shared_people_restore_approval VALUES ('foreign', 'restore-1', 'org-b', 'ada', 1)",
  );
  const clone = join(directory, 'clone.db');
  sqlite.run('VACUUM INTO ?', [clone]);
  sqlite.close();
  database = clone;
  const independent = openDatabase(database);
  independent.run('PRAGMA journal_mode = DELETE');
  independent.close();
  writeInventory();
  await refuses(
    invoke('restore-1', ['foreign']),
    'approval binding does not match operation/organization',
  );
  await refuses(invoke('restore-1', ['approval-1']), 'unsupported capacity mode shared');
  const untouched = openReadOnlyDatabase(database);
  try {
    expect(untouched.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
  } finally {
    untouched.close();
  }
  expect(rows()).toEqual([]);
});

it('holds the same-process flock until a killed SQLite restore rolls back and releases it', async () => {
  writeFileSync(
    backup,
    JSON.stringify({
      ...saved,
      organizations: [...saved.organizations, { organizationId: 'org-b', mode: 'isolated' }],
    }),
  );
  const sqlite = openDatabase(database);
  sqlite.run('CREATE TABLE restore_probe (bytes BLOB NOT NULL)');
  sqlite.run(`CREATE TRIGGER block_restore AFTER UPDATE ON organization WHEN NEW.id = 'org-b' BEGIN
    INSERT INTO restore_probe VALUES (randomblob(8000000));
    SELECT sum(x) FROM (WITH RECURSIVE counter(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM counter WHERE x<100000000) SELECT x FROM counter);
  END`);
  sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)');
  const initialWalBytes = statSync(database + '-wal').size;
  sqlite.run('PRAGMA busy_timeout = 0');
  const fixture = join(directory, 'owner.ts');
  const module = new URL('./shared-people-host-restore.ts', import.meta.url).pathname;
  writeFileSync(
    fixture,
    `import { restoreSharedPeopleOnHost } from ${JSON.stringify(module)}; await restoreSharedPeopleOnHost(${JSON.stringify({ backup, approvalIds: [] })}, ${JSON.stringify({ database, lock: join(directory, 'deploy.lock'), docker })});`,
  );
  const owner = Bun.spawn([process.execPath, fixture], { stdout: 'pipe', stderr: 'pipe' });
  try {
    const deadline = Date.now() + 5000;
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
    while (Date.now() < deadline && statSync(database + '-wal').size < initialWalBytes + 1000000)
      await Bun.sleep(5);
    expect(statSync(database + '-wal').size).toBeGreaterThan(initialWalBytes + 1000000);
    const contender = Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']);
    expect(await contender.exited).toBe(1);
    await refuses(invoke(), 'deploy lock held');
    owner.kill('SIGKILL');
    expect(await owner.exited).not.toBe(0);
    const successor = Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']);
    expect(await successor.exited).toBe(0);
    expect(rows()).toEqual([]);
    expect(sqlite.query('SELECT count(*) AS count FROM restore_probe').get()).toEqual({ count: 0 });
    expect(sqlite.query('SELECT updated_at FROM organization WHERE id = ?').get('org-a')).toEqual({
      updated_at: null,
    });
    sqlite.run('DROP TRIGGER block_restore');
    expect(await invoke()).toEqual({ organizations: 2, ranks: 1 });
  } finally {
    if (owner.exitCode === null) {
      owner.kill('SIGKILL');
      await owner.exited;
    }
    sqlite.close();
    await new Response(owner.stdout).text();
    await new Response(owner.stderr).text();
  }
}, 10000);

it('refuses absent, unreadable and malformed retained backups before Docker or SQLite writes', async () => {
  for (const path of [join(directory, 'absent'), directory, join(directory, 'malformed')]) {
    writeFileSync(join(directory, 'malformed'), '{');
    await refuses(
      restoreSharedPeopleOnHost(
        { backup: path, approvalIds: [] },
        { database, lock: join(directory, 'deploy.lock'), docker },
      ),
    );
    expect(rows()).toEqual([]);
  }
});

it('refuses invalid colour environments and obscured or readonly database mounts', async () => {
  const blue = container('be-01-blue');
  const green = container('be-01-green');
  for (const environment of [
    [],
    ['DB_PATH=relative'],
    ['DB_PATH=/data/../data/test.db'],
    ['DB_PATH=/data/test.db', 'DB_PATH=/data/test.db'],
  ]) {
    writeInventory([blue, { ...green, Config: { Env: environment } }]);
    await refuses(invoke(), 'invalid DB_PATH');
    expect(rows()).toEqual([]);
  }
  for (const mounts of [
    [],
    green.Mounts.map((mount) => ({ ...mount, RW: false })),
    [...green.Mounts, ...green.Mounts],
  ]) {
    writeInventory([blue, { ...green, Mounts: mounts }]);
    await refuses(invoke(), 'database writable mount');
    expect(rows()).toEqual([]);
  }
});
it('diagnoses digest, approval operation, duplicate and incomplete bindings read-only', async () => {
  const shared = {
    ...saved,
    organizations: [
      { organizationId: 'org-a', mode: 'shared' },
      { organizationId: 'org-b', mode: 'shared' },
    ],
  };
  writeFileSync(backup, JSON.stringify(shared));
  const sqlite = openDatabase(database);
  sqlite.run('INSERT INTO shared_people_restore_operation VALUES (?, ?, 1)', [
    'restore-1',
    digestSharedPeople(shared),
  ]);
  sqlite.run("INSERT INTO shared_people_restore_operation VALUES ('other', ?, 1)", [
    '0'.repeat(64),
  ]);
  sqlite.run(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-a', 'restore-1', 'org-a', 'ada', 1)",
  );
  sqlite.run(
    "INSERT INTO shared_people_restore_approval VALUES ('approval-b', 'restore-1', 'org-b', 'ada', 1)",
  );
  sqlite.run(
    "INSERT INTO shared_people_restore_approval VALUES ('wrong-operation', 'other', 'org-a', 'ada', 1)",
  );
  sqlite.close();
  await refuses(invoke('other', ['wrong-operation']), 'operation binding');
  await refuses(
    invoke('restore-1', ['wrong-operation']),
    'approval binding does not match operation/organization',
  );
  await refuses(
    invoke('restore-1', ['missing']),
    'approval binding does not match operation/organization',
  );
  await refuses(invoke('restore-1', ['approval-a', 'approval-a']), 'operation and approval');
  await refuses(invoke('restore-1', ['approval-a']), 'incomplete');
  await refuses(invoke('restore-1', ['approval-a', 'approval-b']), 'unsupported capacity mode');
  expect(rows()).toEqual([]);
});
it('holds flock during a live Docker inspection child and releases it when the owner dies', async () => {
  const marker = join(directory, 'inspection-pid');
  writeFileSync(
    docker,
    `#!/bin/sh\ncase "$1" in\nps) printf 'be-01-blue\\nbe-01-green\\n';;\ninspect) echo $$ > '${marker}'; exec sleep 30;;\nesac\n`,
  );
  const fixture = join(directory, 'inspection-owner.ts');
  const module = new URL('./shared-people-host-restore.ts', import.meta.url).pathname;
  writeFileSync(
    fixture,
    `import { restoreSharedPeopleOnHost } from ${JSON.stringify(module)}; await restoreSharedPeopleOnHost(${JSON.stringify({ backup, approvalIds: [] })}, ${JSON.stringify({ database, lock: join(directory, 'deploy.lock'), docker })});`,
  );
  const owner = Bun.spawn([process.execPath, fixture], { stdout: 'pipe', stderr: 'pipe' });
  let inspectionPid: number | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (!(await Bun.file(marker).exists()) && Date.now() < deadline) await Bun.sleep(5);
    inspectionPid = Number(await Bun.file(marker).text());
    expect(Number.isInteger(inspectionPid)).toBe(true);
    expect(
      await Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']).exited,
    ).toBe(1);
    owner.kill('SIGKILL');
    await owner.exited;
    // The inspector stays alive: it must not inherit the owner's flock descriptor.
    process.kill(inspectionPid, 0);
    expect(
      await Bun.spawn(['flock', '--nonblock', join(directory, 'deploy.lock'), 'true']).exited,
    ).toBe(0);
    expect(rows()).toEqual([]);
  } finally {
    if (owner.exitCode === null) {
      owner.kill('SIGKILL');
      await owner.exited;
    }
    if (inspectionPid !== undefined) process.kill(inspectionPid, 'SIGKILL');
    await new Response(owner.stdout).text();
    await new Response(owner.stderr).text();
  }
}, 10000);

const dockerProof = process.env['WBS_HOST_RESTORE_REAL_DOCKER'] === '1' ? it : it.skip;
dockerProof(
  'fences actual stopped blue/green containers and an extra running mounted writer',
  async () => {
    const image = process.env['WBS_HOST_RESTORE_PROOF_IMAGE'];
    if (image === undefined || image === '')
      throw new Error('WBS_HOST_RESTORE_PROOF_IMAGE must name an available image');
    const alias = prepareAlias();
    const label = 'wbs-host-restore-proof=' + String(process.pid);
    const created: string[] = [];
    async function command(args: string[]) {
      const child = Bun.spawn(['/usr/bin/docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (exit !== 0) throw new Error(`Docker proof command refused (${String(exit)}): ${stderr}`);
      return stdout.trim();
    }
    try {
      for (const name of ['be-01-blue', 'be-01-green', 'wbs-restore-proof-writer']) {
        created.push(
          await command([
            'create',
            '--name',
            name,
            '--label',
            label,
            '--mount',
            `type=bind,source=${name === 'be-01-blue' ? directory : alias},target=/data`,
            '--env',
            `DB_PATH=/data/${basename(database)}`,
            '--entrypoint',
            '/bin/sh',
            image,
            '-c',
            'sleep 120',
          ]),
        );
      }
      // Isolate this test's daemon inventory; state and mount facts still come from real Docker inspect.
      writeFileSync(
        docker,
        `#!/bin/sh\ncase "$1" in\nps) exec /usr/bin/docker ps --all --quiet --no-trunc --filter 'label=${label}';;\ninspect) exec /usr/bin/docker "$@";;\n*) exit 99;;\nesac\n`,
      );
      const writer = created.at(2);
      if (writer === undefined) throw new Error('Docker proof writer absent');
      const green = created.at(1);
      if (green === undefined) throw new Error('Docker proof green absent');
      await command(['start', green]);
      await refuses(invoke(), 'writable container is not stopped: /be-01-green');
      expectUnopenedRestore();
      await command(['stop', '--time', '0', green]);
      await command(['start', writer]);
      await refuses(invoke(), 'writable container is not stopped');
      expectUnopenedRestore();
      await command(['stop', '--time', '0', writer]);
      expect(await invoke()).toEqual({ organizations: 1, ranks: 1 });
      expect(rows()).toEqual([{ project_id: 'a1' }]);
    } finally {
      for (const id of created.reverse()) await command(['rm', '--force', id]);
    }
  },
  20000,
);
it('refuses incomplete, duplicated and invalid inspected inventory with named diagnostics', async () => {
  const blue = container('be-01-blue');
  const green = container('be-01-green');
  const cases: [unknown[], string][] = [
    [[], 'inspection is incomplete'],
    [[blue, blue], 'inspection is incomplete'],
    [[blue, { ...green, State: { Running: false } }], 'invalid Docker container state/environment'],
    [[blue, { ...green, Config: { Env: null } }], 'invalid Docker container state/environment'],
    [[blue, { ...green, Mounts: [{ Type: 'bind' }] }], 'invalid Docker mount inspection'],
  ];
  for (const [containers, message] of cases) {
    writeFileSync(inventory, JSON.stringify(containers));
    await refuses(invoke(), message);
    expect(rows()).toEqual([]);
  }
  writeInventory();
  for (const ids of ['', 'be-01-blue\nbe-01-blue\n']) {
    writeFileSync(inventoryIds, ids);
    await refuses(invoke(), 'inventory is empty or duplicated');
    expect(rows()).toEqual([]);
  }
});

it('rejects invalid host CLI arguments before attempting the canonical lock', async () => {
  const cli = new URL('./shared-people-host-restore-cli.ts', import.meta.url).pathname;
  for (const args of [
    [],
    [''],
    [backup, '--actor=ada'],
    [backup, '--operation='],
    [backup, '--operation=a', '--operation=b'],
  ]) {
    const child = Bun.spawn([process.execPath, cli, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('usage: shared-people-host-restore-cli.ts');
  }
});

it('reports malformed inspection boundaries and a missing required colour explicitly', async () => {
  for (const candidate of [{ Name: '/be-01-blue' }, null, { ...container('be-01-blue'), Id: 1 }]) {
    writeFileSync(inventory, JSON.stringify([candidate, container('be-01-green')]));
    await refuses(invoke(), 'invalid Docker container inspection');
    expect(rows()).toEqual([]);
  }
  writeFileSync(inventory, '{}');
  await refuses(invoke(), 'invalid Docker inventory inspection');
  writeInventory([container('be-01-blue')]);
  await refuses(invoke(), 'required colour is absent');
  await refuses(
    restoreSharedPeopleOnHost(
      { backup, approvalIds: [] },
      { database: directory, lock: join(directory, 'deploy.lock'), docker },
    ),
    'host restore database is not a file',
  );
});

function prepareAlias() {
  const clone = join(directory, 'alias-proof.db');
  const sqlite = openDatabase(database);
  try {
    sqlite.run('VACUUM INTO ?', [clone]);
  } finally {
    sqlite.close();
  }
  database = clone;
  const independent = openDatabase(database);
  try {
    independent.run('PRAGMA journal_mode = DELETE');
  } finally {
    independent.close();
  }
  const alias = join(directory, 'alias');
  mkdirSync(alias);
  linkSync(database, join(alias, basename(database)));
  expect(statSync(join(alias, basename(database))).ino).toBe(statSync(database).ino);
  return alias;
}
function expectUnopenedRestore() {
  const sqlite = openReadOnlyDatabase(database);
  try {
    expect(sqlite.query('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    expect(sqlite.query('SELECT project_id FROM project_rank').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
}
it('refuses a running verified green through a hardlinked database alias before the writer opener', async () => {
  const alias = prepareAlias();
  writeInventory([container('be-01-blue'), container('be-01-green', true, alias)]);
  await refuses(invoke(), 'writable container is not stopped: /be-01-green');
  expectUnopenedRestore();
});
it('refuses a third running writer through a hardlinked directory with both colours stopped', async () => {
  const alias = prepareAlias();
  writeInventory([
    container('be-01-blue'),
    container('be-01-green'),
    container('manual-writer', true, alias),
  ]);
  await refuses(invoke(), 'writable container is not stopped: /manual-writer');
  expectUnopenedRestore();
});

it('refuses an absent extra writable mount source before the database writer opener', async () => {
  prepareAlias();
  writeInventory([
    container('be-01-blue'),
    container('be-01-green'),
    container('stopped-extra', false, join(directory, 'absent-source')),
  ]);
  const failure: unknown = await invoke().then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toMatchObject({ code: 'ENOENT' });
  expectUnopenedRestore();
});
it('refuses a permission-denied extra writable mount source before the database writer opener', async () => {
  prepareAlias();
  const parent = join(directory, 'inaccessible-parent');
  const source = join(parent, 'mount');
  mkdirSync(parent);
  mkdirSync(source);
  writeInventory([
    container('be-01-blue'),
    container('be-01-green'),
    container('stopped-extra', false, source),
  ]);
  chmodSync(parent, 0o000);
  try {
    const failure: unknown = await invoke().then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toMatchObject({ code: 'EACCES' });
    expectUnopenedRestore();
  } finally {
    chmodSync(parent, 0o700);
  }
});
