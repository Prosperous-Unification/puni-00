import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, expect, test } from 'bun:test';

import {
  AuthorityOpenError,
  type AuthorityOpenFailure,
  bootstrapAuthority,
  openAuthority,
  resolveAuthorityDatabasePath,
} from './authority-store';
import { acquireClaims } from './claims';

const FIXED_CLOCK = { read: () => 1_000_000 };
const scratch: string[] = [];

afterAll(() => {
  for (const path of scratch) rmSync(path, { force: true, recursive: true });
});

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dash-authority-open-'));
  scratch.push(root);
  const init = Bun.spawnSync(['git', 'init', '--quiet', root], { stderr: 'pipe' });
  if (init.exitCode !== 0) throw new Error(init.stderr.toString('utf8'));
  return root;
}

function failureOf(operation: () => unknown): { failure: AuthorityOpenFailure; message: string } {
  try {
    operation();
  } catch (error) {
    if (error instanceof AuthorityOpenError) {
      return { failure: error.failure, message: error.message };
    }
    throw error;
  }
  throw new Error('the authority operation did not refuse');
}

function assertNotRoot(): void {
  // Root reads through mode bits, so these unreadability proofs would observe nothing.
  if (process.getuid?.() === 0)
    throw new Error('unreadable-authority proofs require a non-root uid');
}

test('refuses an absent authority instead of creating one', () => {
  const root = repository();
  const databasePath = join(root, '.git', 'module-wiki', 'authority.sqlite');
  // Proof: falling back to creation when `openAuthority` found no database made this case
  // receive a live store instead of the `absent` refusal (2026-10-11).
  const refusal = failureOf(() => openAuthority(root, { clock: FIXED_CLOCK }));
  expect(refusal.failure).toBe('absent');
  expect(refusal.message).toContain(join(root, '.git', 'module-wiki'));
  expect(refusal.message).toContain('twilight-dash bootstrap-authority <repository>');
  expect(existsSync(databasePath)).toBe(false);
  expect(existsSync(join(root, '.git', 'module-wiki'))).toBe(false);
});

test('distinguishes an unreadable authority from an absent one', () => {
  assertNotRoot();
  const unreadableFile = repository();
  bootstrapAuthority(unreadableFile, { clock: FIXED_CLOCK }).close();
  const databasePath = resolveAuthorityDatabasePath(unreadableFile);
  chmodSync(databasePath, 0o000);
  try {
    const refusal = failureOf(() => openAuthority(unreadableFile, { clock: FIXED_CLOCK }));
    expect(refusal.failure).toBe('unreadable');
    expect(refusal.message).toContain(databasePath);
  } finally {
    chmodSync(databasePath, 0o600);
  }

  const unsearchable = repository();
  const directory = join(unsearchable, '.git', 'module-wiki');
  mkdirSync(directory);
  writeFileSync(join(directory, 'authority.sqlite'), '');
  chmodSync(directory, 0o600);
  try {
    // Proof: mapping every lstat failure to `absent` made this half receive `absent` for the
    // search-denied directory instead of `unreadable` with EACCES (2026-10-11).
    const refusal = failureOf(() => openAuthority(unsearchable, { clock: FIXED_CLOCK }));
    expect(refusal).toEqual({
      failure: 'unreadable',
      message: `authority unreadable: ${join(directory, 'authority.sqlite')}: EACCES`,
    });
  } finally {
    chmodSync(directory, 0o700);
  }
});

test('bootstrap refuses an existing authority', () => {
  const root = repository();
  const store = bootstrapAuthority(root, { clock: FIXED_CLOCK });
  acquireClaims(store, {
    conflictGroups: [],
    owner: { sessionId: 'session-a', worktreePath: realpathSync(root) },
    paths: [{ access: 'write', path: 'src' }],
  });
  const before = store.inspect();
  store.close();
  // Proof: dropping the under-lock `exists` refusal made the second bootstrap reach SQLite
  // creation and fail `corrupt` on the already-present tables instead (2026-10-11).
  const refusal = failureOf(() => bootstrapAuthority(root, { clock: FIXED_CLOCK }));
  expect(refusal.failure).toBe('exists');
  expect(refusal.message).toContain(resolveAuthorityDatabasePath(root));
  const reopened = openAuthority(root, { clock: FIXED_CLOCK });
  expect(reopened.inspect()).toEqual(before);
  reopened.close();
});

const BOOTSTRAP_WORKER = `
const [{ AuthorityOpenError, bootstrapAuthority }] = await Promise.all([import(process.argv[2])]);
const [repository, readyPath, startPath] = process.argv.slice(3);
await Bun.write(readyPath, 'ready');
while (!(await Bun.file(startPath).exists())) Bun.sleepSync(1);
try {
  bootstrapAuthority(repository, { clock: { read: () => 1_000_000 }, busyDelayMilliseconds: 5 }).close();
  console.log('bootstrapped');
} catch (error) {
  console.log(error instanceof AuthorityOpenError ? error.failure : String(error));
}
`;

test('two bootstraps yield one creator and one exists refusal', async () => {
  const storeModule = pathToFileURL(join(import.meta.dir, 'authority-store.ts')).href;
  for (let round = 0; round < 8; round += 1) {
    const root = repository();
    const worker = join(root, '..', `${root.split('/').at(-1) ?? 'root'}-bootstrap-worker.ts`);
    scratch.push(worker);
    writeFileSync(worker, BOOTSTRAP_WORKER);
    const startPath = join(root, '.git', 'start');
    const children = [0, 1].map((index) => {
      const readyPath = join(root, '.git', `ready-${String(index)}`);
      return {
        process: Bun.spawn([process.execPath, worker, storeModule, root, readyPath, startPath], {
          stderr: 'pipe',
          stdout: 'pipe',
        }),
        readyPath,
      };
    });
    while (!children.every(({ readyPath }) => existsSync(readyPath))) Bun.sleepSync(1);
    writeFileSync(startPath, 'go');
    const outcomes = await Promise.all(
      children.map(async ({ process: child }) => {
        const [stdout, stderr] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(await child.exited, stderr).toBe(0);
        return stdout.trim();
      }),
    );
    expect(outcomes.sort()).toEqual(['bootstrapped', 'exists']);
    const store = openAuthority(root, { clock: FIXED_CLOCK });
    expect(store.inspect()).toEqual({ generations: [], integrations: [], nextGeneration: 1 });
    store.close();
  }
}, 60_000);

test('open creates no directory', () => {
  const root = repository();
  const directory = join(root, '.git', 'module-wiki');
  expect(resolveAuthorityDatabasePath(root)).toBe(join(directory, 'authority.sqlite'));
  expect(existsSync(directory)).toBe(false);
  expect(failureOf(() => openAuthority(root, { clock: FIXED_CLOCK })).failure).toBe('absent');
  expect(existsSync(directory)).toBe(false);
});

function fileIdentity(path: string): { readonly sha256: string; readonly mtimeMs: number } {
  return {
    mtimeMs: statSync(path).mtimeMs,
    sha256: new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex'),
  };
}

test('inspect writes nothing and works on a read-only authority', () => {
  assertNotRoot();
  const root = repository();
  const store = bootstrapAuthority(root, { clock: FIXED_CLOCK });
  acquireClaims(store, {
    conflictGroups: [],
    owner: { sessionId: 'session-a', worktreePath: realpathSync(root) },
    paths: [{ access: 'write', path: 'src' }],
  });
  const expected = store.inspect();
  store.close();
  const databasePath = resolveAuthorityDatabasePath(root);
  const before = fileIdentity(databasePath);
  Bun.sleepSync(20);
  const reader = openAuthority(root, { clock: FIXED_CLOCK });
  expect(reader.inspect()).toEqual(expected);
  reader.close();
  // Proof: inspecting through `transact` (BEGIN IMMEDIATE, rewrite every row, COMMIT) changed
  // this file's bytes and mtime, and failed the read-only half with `attempt to write a readonly
  // database` (2026-10-11).
  expect(fileIdentity(databasePath)).toEqual(before);

  const directory = join(databasePath, '..');
  chmodSync(databasePath, 0o444);
  chmodSync(directory, 0o555);
  try {
    const readOnly = openAuthority(root, { clock: FIXED_CLOCK });
    expect(readOnly.inspect()).toEqual(expected);
    readOnly.close();
  } finally {
    chmodSync(directory, 0o755);
    chmodSync(databasePath, 0o644);
  }
  expect(fileIdentity(databasePath)).toEqual(before);
});
