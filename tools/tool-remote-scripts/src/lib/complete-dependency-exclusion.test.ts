import { chmod, link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as activationStorage from '@wbs/store-sqlite/cross-project-dependency-activation';
import { inspectDependencyActivation } from '@wbs/store-sqlite/cross-project-dependency-activation';
import { openDatabase, openExistingConnection, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { roots } from '../fixtures/source-startup';
import { activateCompleteDependenciesUnderOwner } from './complete-dependency-exclusion';
import { withDependencyOwner } from './edge-ownership';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});
for (const selected of [['prod'], ['dev'], ['prod', 'dev']] as const)
  test(`real joint owner activation ${selected.join('+')} preserves nonselected authority and leaves all participants fenced after finalizers`, async () => {
    const fixture = await completeActivationFixture(selected);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const completion = await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        activateCompleteDependenciesUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          fixture.ports,
        ),
      fixture.root,
    );
    expect(completion.state).toBe('activation-committed-participants-fenced');
    for (const [environment, path] of [
      ['prod', fixture.prodPath],
      ['dev', fixture.devPath],
    ] as const) {
      const connection = openReadOnlyConnection(path);
      try {
        expect(inspectDependencyActivation(connection.db).state).toBe(
          selected.some((candidate) => candidate === environment) ? 'ENABLED' : 'DISABLED',
        );
      } finally {
        connection.close();
      }
    }
    expect(fixture.backend.State.Running).toBe(false);
    expect(fixture.source.State.Running).toBe(false);
    expect(fixture.gateway.State.Running).toBe(false);
    expect(fixture.commands.some((args) => ['start', 'rm', 'restart'].includes(args[0]))).toBe(
      false,
    );
  }, 300000);

for (const fault of [
  'missing-backend',
  'missing-source',
  'foreign-route',
  'foreign-source-route',
  'runtime-repodigest',
  'gateway-role',
  'empty-backend-capability',
  'native-image-format',
] as const)
  test(`refuses ${fault} before ingress mutation or SQLite dispatch`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    if (fault === 'missing-backend')
      fixture.inventory.splice(fixture.inventory.indexOf(fixture.backend), 1);
    if (fault === 'missing-source')
      fixture.inventory.splice(fixture.inventory.indexOf(fixture.source), 1);
    const docker: typeof fixture.ports.docker = async (args, signal) => {
      const response = await fixture.ports.docker(args, signal);
      if (args.includes('reload')) throw new Error('preflight fault reached ingress effects');
      if (
        fault === 'native-image-format' &&
        args[0] === 'image' &&
        args.includes('--format') &&
        args.includes(fixture.backend.Config.Image)
      )
        return response.replace('sha256:', '');
      if (
        fault === 'runtime-repodigest' &&
        args[0] === 'image' &&
        !args.includes('--format') &&
        args.includes(fixture.request.source.runtimeReference)
      )
        return JSON.stringify([{ Id: fixture.source.Image, RepoDigests: [] }]);
      if (
        (fault === 'foreign-route' || fault === 'foreign-source-route') &&
        args[0] === 'exec' &&
        (args.includes('adapt') || args.includes('wget'))
      )
        return response.replaceAll(
          fault === 'foreign-route' ? 'be-01-blue:3100' : 'wbs-dev-src:3300',
          'foreign:3100',
        );
      if (
        fault === 'gateway-role' &&
        args[0] === 'run' &&
        args.includes(fixture.gateway.Config.Image)
      )
        return JSON.stringify({
          protocol: 'wbs-dependency-runtime',
          version: 1,
          role: 'backend',
          semantics: ['cross-project-dependencies-v1'],
        });
      if (
        fault === 'empty-backend-capability' &&
        args[0] === 'run' &&
        args.includes(fixture.backend.Config.Image)
      )
        return JSON.stringify({
          protocol: 'wbs-dependency-runtime',
          version: 1,
          role: 'backend',
          semantics: [],
        });
      return response;
    };
    let refused = false;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          activateCompleteDependenciesUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            { ...fixture.ports, docker },
          ),
        fixture.root,
      );
    } catch (cause) {
      refused = true;
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw cause;
      expect(cause.message).not.toContain('PRIVATE');
      expect(cause.cause).toBeUndefined();
    }
    expect(refused).toBe(true);
    for (const path of [fixture.prodPath, fixture.devPath]) {
      const connection = openReadOnlyConnection(path);
      try {
        expect(inspectDependencyActivation(connection.db).state).toBe('DISABLED');
      } finally {
        connection.close();
      }
    }
    expect(fixture.source.State.Running).toBe(true);
    expect(
      fixture.commands.some(
        (args) => args.includes('reload') || ['stop', 'start', 'rm', 'restart'].includes(args[0]),
      ),
    ).toBe(false);
  }, 300000);

for (const fault of ['opener', 'prior', 'boot-drift'] as const)
  test(`fresh actual collector ${fault} prevents storage dispatch under the original exclusion`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    fixture.setAuthorityFault(fault);
    let refused = false;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          activateCompleteDependenciesUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            fixture.ports,
          ),
        fixture.root,
      );
    } catch (cause) {
      refused = true;
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw cause;
      expect(cause.message).not.toContain('PRIVATE');
      expect(cause.cause).toBeUndefined();
    }
    expect(refused).toBe(true);
    for (const path of [fixture.prodPath, fixture.devPath]) {
      const connection = openReadOnlyConnection(path);
      try {
        expect(inspectDependencyActivation(connection.db).state).toBe('DISABLED');
      } finally {
        connection.close();
      }
    }
    expect(fixture.collections()).toBe(fault === 'boot-drift' ? 2 : 1);
    expect(fixture.commands.some((args) => ['start', 'rm', 'restart'].includes(args[0]))).toBe(
      false,
    );
  }, 300000);

for (const environment of ['prod', 'dev'] as const)
  test(`${environment}-only hidden readonly namespace alias refuses before any activation evidence directory`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    await link(
      environment === 'prod' ? fixture.prodPath : fixture.devPath,
      join(fixture.namespace.root, `namespace/etc/caddy/hidden-${environment}.sqlite`),
    );
    const mounts = join(fixture.namespace.root, 'mountinfo');
    await writeFile(
      mounts,
      (await readFile(mounts, 'utf8')).replace('/etc/caddy rw ', '/etc/caddy ro '),
    );
    const docker: typeof fixture.ports.docker = async (args, signal) => {
      if (
        args[0] === 'ps' &&
        (await readdir(fixture.root)).some((name) => name.startsWith('dependency-activation-'))
      )
        throw new Error('native alias fault reached storage evidence');
      return fixture.ports.docker(args, signal);
    };
    let refused = false;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          activateCompleteDependenciesUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            { ...fixture.ports, docker },
          ),
        fixture.root,
      );
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    expect(
      (await readdir(fixture.root)).some((name) => name.startsWith('dependency-activation-')),
    ).toBe(false);
    for (const path of [fixture.prodPath, fixture.devPath]) {
      const connection = openReadOnlyConnection(path);
      try {
        expect(inspectDependencyActivation(connection.db).state).toBe('DISABLED');
      } finally {
        connection.close();
      }
    }
  }, 300000);

test('actual second-store SQL failure preserves the first real commit and private attended evidence', async () => {
  const fixture = await completeActivationFixture(['prod', 'dev']);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const failing = openExistingConnection(fixture.devPath);
  try {
    failing.db.run(
      "CREATE TRIGGER fail_activation BEFORE UPDATE ON cross_project_dependency_activation BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL_SENTINEL'); END",
    );
  } finally {
    failing.close();
  }
  let refusal: unknown;
  try {
    await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        activateCompleteDependenciesUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          fixture.ports,
        ),
      fixture.root,
    );
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('expected SQL refusal');
  expect(refusal.message).toContain('stage=dispatch-uncertain');
  expect(refusal.message).toContain('environment=dev');
  expect(refusal.message).toContain('"environment":"prod"');
  expect(refusal.message).not.toContain('PRIVATE_SQL_SENTINEL');
  expect(refusal.cause).toBeUndefined();
  for (const [environment, path] of [
    ['prod', fixture.prodPath],
    ['dev', fixture.devPath],
  ] as const) {
    const connection = openReadOnlyConnection(path);
    try {
      expect(inspectDependencyActivation(connection.db).state).toBe(
        environment === 'prod' ? 'ENABLED' : 'DISABLED',
      );
    } finally {
      connection.close();
    }
  }
  const names = await readdir(fixture.root);
  expect(names.filter((name) => name.endsWith('-activation-committed.json'))).toHaveLength(1);
  expect(names.filter((name) => name.endsWith('-activation-intent.json'))).toHaveLength(2);
  expect(names.some((name) => name.endsWith('-activation-fenced-complete.json'))).toBe(false);
  const attempt = names.find((name) => name.startsWith('dependency-activation-'));
  if (attempt === undefined) throw new Error('private recovery evidence missing');
  expect((await readdir(join(fixture.root, attempt))).sort()).toEqual([
    'dev.before.sqlite',
    'dev.capture.json',
    'prod.before.sqlite',
    'prod.capture.json',
  ]);
  expect(fixture.backend.State.Running).toBe(false);
  expect(fixture.source.State.Running).toBe(false);
  expect(fixture.gateway.State.Running).toBe(false);
  expect(fixture.commands.some((args) => ['start', 'rm', 'restart'].includes(args[0]))).toBe(false);
}, 300000);

for (const fault of ['receipt', 'ledger'] as const)
  test(`real post-commit ${fault} mutation requires independent SQLite readback before another observer`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const activate = activationStorage.activateDependencies;
    let calls = 0;
    let repair: (() => void) | undefined;
    // Executes the genuine atomic primitive and returns its unmodified response. Only actual on-disk bytes are faulted after its write connection closes.
    const dispatch = spyOn(activationStorage, 'activateDependencies').mockImplementation(
      (path, folder, receipt) => {
        const enabled = activate(path, folder, receipt);
        calls++;
        const database = openDatabase(path);
        try {
          if (fault === 'receipt') {
            database
              .query('UPDATE cross_project_dependency_activation_receipt SET receipt=? WHERE id=1')
              .run(JSON.stringify({ ...receipt, activationId: 'PRIVATE_RECEIPT_TAMPER' }));
            repair = () => {
              const reopened = openDatabase(fixture.prodPath);
              try {
                reopened
                  .query(
                    'UPDATE cross_project_dependency_activation_receipt SET receipt=? WHERE id=1',
                  )
                  .run(JSON.stringify(receipt));
              } finally {
                reopened.close();
              }
            };
          } else {
            const migration = database
              .query<{ name: string; hash: string }, []>(
                'SELECT name,hash FROM __drizzle_migrations ORDER BY name LIMIT 1',
              )
              .get();
            if (migration === null) throw new Error('actual ledger missing');
            database
              .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
              .run('0'.repeat(64), migration.name);
            repair = () => {
              const reopened = openDatabase(fixture.prodPath);
              try {
                reopened
                  .query('UPDATE __drizzle_migrations SET hash=? WHERE name=?')
                  .run(migration.hash, migration.name);
              } finally {
                reopened.close();
              }
            };
          }
        } finally {
          database.close();
        }
        return enabled;
      },
    );
    const docker: typeof fixture.ports.docker = (args, signal) => {
      // A later independent fault actor heals the bytes. Only the immediate new connection/ledger boundary can observe the injected corruption.
      if (repair !== undefined) {
        const restore = repair;
        repair = undefined;
        restore();
      }
      return fixture.ports.docker(args, signal);
    };
    let refusal: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          activateCompleteDependenciesUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            { ...fixture.ports, docker },
          ),
        fixture.root,
      );
    } catch (cause) {
      refusal = cause;
    } finally {
      dispatch.mockRestore();
    }
    expect(calls).toBe(1);
    expect(refusal).toBeInstanceOf(Error);
    if (!(refusal instanceof Error)) throw new Error('expected actual readback refusal');
    expect(refusal.message).toContain('stage=independent-readback');
    expect(refusal.message).not.toContain('PRIVATE_RECEIPT_TAMPER');
    expect(refusal.cause).toBeUndefined();
    const connection = openReadOnlyConnection(fixture.prodPath);
    try {
      expect(inspectDependencyActivation(connection.db).state).toBe('ENABLED');
    } finally {
      connection.close();
    }
    expect(
      (await readdir(fixture.root)).some(
        (name) =>
          name.endsWith('-activation-committed.json') ||
          name.endsWith('-activation-fenced-complete.json'),
      ),
    ).toBe(false);
    expect(fixture.source.State.Running).toBe(false);
    expect(fixture.commands.some((args) => ['start', 'rm', 'restart'].includes(args[0]))).toBe(
      false,
    );
  }, 300000);

for (const fault of [
  'capture-missing',
  'capture-mode',
  'capture-bytes',
  'capture-inode',
  'backup-missing',
  'backup-bytes',
  'attempt-child',
  'attempt-parent',
] as const)
  test(`storage evidence fault ${fault} refuses before the next protected SQLite action`, async () => {
    const fixture = await completeActivationFixture(['prod']);
    process.env['WBS_EDGE_STATE'] = fixture.root;
    let injected = false;
    let attempt: string | undefined;
    const docker: typeof fixture.ports.docker = async (args, signal) => {
      if (args[0] === 'ps') {
        const names = await readdir(fixture.root);
        const name = names.find((entry) => entry.startsWith('dependency-activation-'));
        if (name !== undefined) {
          attempt = join(fixture.root, name);
          if (
            !injected &&
            (fault === 'attempt-child' ||
              names.some((entry) =>
                entry.endsWith(
                  fault.startsWith('backup')
                    ? '-activation-backup.json'
                    : '-activation-capture.json',
                ),
              ))
          ) {
            injected = true;
            const capture = join(attempt, 'prod.capture.json');
            const backup = join(attempt, 'prod.before.sqlite');
            if (fault === 'capture-missing') await rm(capture);
            if (fault === 'capture-mode') await chmod(capture, 0);
            if (fault === 'capture-bytes') await writeFile(capture, 'PRIVATE_CAPTURE_SENTINEL');
            if (fault === 'capture-inode') {
              const bytes = await readFile(capture);
              await rename(capture, join(fixture.root, 'retained-original-capture'));
              await writeFile(capture, bytes, { mode: 0o600, flag: 'wx' });
            }
            if (fault === 'backup-missing') await rm(backup);
            if (fault === 'backup-bytes') await writeFile(backup, 'PRIVATE_BACKUP_SENTINEL');
            if (fault === 'attempt-child')
              await writeFile(join(attempt, 'unexpected.json'), 'PRIVATE_DIRECTORY_SENTINEL', {
                mode: 0o600,
              });
            if (fault === 'attempt-parent') {
              await rename(attempt, attempt + '.retained');
              await mkdir(attempt, { mode: 0o700 });
              for (const child of await readdir(attempt + '.retained'))
                await link(join(attempt + '.retained', child), join(attempt, child));
            }
          } else if (
            injected &&
            ((fault === 'attempt-child' &&
              (await readdir(attempt)).includes('prod.capture.json')) ||
              (fault === 'attempt-parent' &&
                (await readdir(attempt + '.retained')).includes('prod.before.sqlite')))
          ) {
            throw new Error('evidence guard omission reached another protected SQLite stage');
          }
        }
      }
      return fixture.ports.docker(args, signal);
    };
    let refusal: unknown;
    try {
      await withDependencyOwner(
        fixture.request.owner,
        (owner) =>
          activateCompleteDependenciesUnderOwner(
            owner,
            fixture.request,
            fixture.layouts,
            performance.now() + 300000,
            fixture.root,
            { ...fixture.ports, docker },
          ),
        fixture.root,
      );
    } catch (cause) {
      refusal = cause;
    }
    expect(injected).toBe(true);
    expect(refusal).toBeInstanceOf(Error);
    if (!(refusal instanceof Error)) throw new Error('expected retained evidence refusal');
    expect(refusal.message).not.toContain('PRIVATE_');
    expect(refusal.cause).toBeUndefined();
    for (const path of [fixture.prodPath, fixture.devPath]) {
      const connection = openReadOnlyConnection(path);
      try {
        expect(inspectDependencyActivation(connection.db).state).toBe('DISABLED');
      } finally {
        connection.close();
      }
    }
    if (attempt === undefined) throw new Error('attempt evidence missing');
    if (fault.startsWith('capture'))
      expect((await readdir(attempt)).includes('prod.before.sqlite')).toBe(false);
    if (fault === 'attempt-child')
      expect((await readdir(attempt)).includes('prod.capture.json')).toBe(false);
    if (fault === 'attempt-parent')
      expect((await readdir(attempt + '.retained')).includes('prod.before.sqlite')).toBe(false);
    expect(
      (await readdir(fixture.root)).some(
        (name) =>
          name.endsWith('-activation-intent.json') ||
          name.endsWith('-activation-fenced-complete.json'),
      ),
    ).toBe(false);
    expect(fixture.commands.some((args) => ['start', 'rm', 'restart'].includes(args[0]))).toBe(
      false,
    );
  }, 300000);

test('original installed source identity survives ingress and source fencing before storage', async () => {
  const fixture = await completeActivationFixture(['prod']);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  let replaced = false;
  const docker: typeof fixture.ports.docker = async (args, signal) => {
    if (
      replaced &&
      args[0] === 'ps' &&
      (await readdir(fixture.root)).some((name) => name.startsWith('dependency-activation-'))
    )
      throw new Error('source replacement reached protected storage');
    const response = await fixture.ports.docker(args, signal);
    if (!replaced && args.includes('reload')) {
      fixture.source.Id = 'f'.repeat(64);
      replaced = true;
    }
    return response;
  };
  let refused = false;
  try {
    await withDependencyOwner(
      fixture.request.owner,
      (owner) =>
        activateCompleteDependenciesUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          { ...fixture.ports, docker },
        ),
      fixture.root,
    );
  } catch {
    refused = true;
  }
  expect(replaced).toBe(true);
  expect(refused).toBe(true);
  expect(
    (await readdir(fixture.root)).some((name) => name.startsWith('dependency-activation-')),
  ).toBe(false);
  for (const path of [fixture.prodPath, fixture.devPath]) {
    const connection = openReadOnlyConnection(path);
    try {
      expect(inspectDependencyActivation(connection.db).state).toBe('DISABLED');
    } finally {
      connection.close();
    }
  }
}, 300000);
