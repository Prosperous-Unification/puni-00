import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { COMPOSED_IMAGE_FIXTURES, stageComposedImageFixtures } from './composed-image-fixtures';

const REPOSITORY = resolve(import.meta.dir, '../../../..');
const FIXTURES = 'apps/wbs/be-01/src/testing';
const DRIVER = join(REPOSITORY, FIXTURES, 'solver-composed-image-client.ts');
const roots: string[] = [];
function folder(): string {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-composed-fixtures-'));
  roots.push(directory);
  return directory;
}
function source(): string {
  const repository = folder();
  mkdirSync(join(repository, FIXTURES), { recursive: true });
  for (const name of COMPOSED_IMAGE_FIXTURES)
    copyFileSync(join(REPOSITORY, FIXTURES, name), join(repository, FIXTURES, name));
  return repository;
}
afterEach(() => {
  for (const directory of roots.splice(0)) rmSync(directory, { recursive: true });
});

test('stages only the exact regular fixture closure with byte identity', () => {
  const repository = source();
  writeFileSync(join(repository, FIXTURES, 'unrelated.ts'), 'unrelated legitimate fixture');
  const destination = join(folder(), 'delivered');
  const provenance = stageComposedImageFixtures(repository, destination);
  expect(readdirSync(destination).sort()).toEqual([...COMPOSED_IMAGE_FIXTURES]);
  expect(provenance.files).toHaveLength(22);
  expect(statSync(destination).mode & 0o777).toBe(0o755);
  expect(statSync(resolve(destination, '..')).mode & 0o777).toBe(0o700);
  for (const file of provenance.files) {
    const bytes = readFileSync(join(repository, FIXTURES, file.name));
    expect(readFileSync(join(destination, file.name))).toEqual(bytes);
    expect(statSync(join(destination, file.name)).mode & 0o777).toBe(0o444);
    expect(file.sha256).toBe(new Bun.CryptoHasher('sha256').update(bytes).digest('hex'));
  }
});

test.each(['missing', 'unreadable', 'symlink'] as const)(
  'refuses a %s required source fixture and removes only its failed stage',
  (fault) => {
    const repository = source();
    const path = join(repository, FIXTURES, 'app-fixture.ts');
    if (fault === 'unreadable') chmodSync(path, 0);
    else {
      rmSync(path);
      if (fault === 'symlink') symlinkSync(join(REPOSITORY, FIXTURES, 'app-fixture.ts'), path);
    }
    const destination = join(folder(), 'delivered');
    expect(() => stageComposedImageFixtures(repository, destination)).toThrow(
      fault === 'unreadable' ? 'fixture has no read permissions' : undefined,
    );
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(repository)).toBe(true);
  },
);

test.each(['corrupt', 'symlink', 'extra'] as const)(
  'refuses a %s copied stage and removes its owned files',
  (fault) => {
    const repository = source();
    const destination = join(folder(), 'delivered');
    expect(() =>
      stageComposedImageFixtures(repository, destination, (from, to) => {
        if (fault === 'symlink') symlinkSync(from, to);
        else {
          copyFileSync(from, to);
          if (fault === 'corrupt') writeFileSync(to, 'corrupt fixture');
          if (fault === 'extra') writeFileSync(join(destination, 'unlisted.ts'), 'unlisted');
        }
      }),
    ).toThrow();
    expect(existsSync(destination)).toBe(false);
  },
);

test('refuses an existing destination without removing its content', () => {
  const destination = folder();
  const sentinel = join(destination, 'owner');
  writeFileSync(sentinel, 'another owner');
  expect(() => stageComposedImageFixtures(REPOSITORY, destination)).toThrow();
  expect(readFileSync(sentinel, 'utf8')).toBe('another owner');
});

/** Loads only fixtures delivered to the isolated test context, through the actual Bun resolver. */
async function bundleWithFixtures(directory: string) {
  return Bun.build({
    entrypoints: [DRIVER],
    target: 'bun',
    metafile: true,
    plugins: [
      {
        name: 'isolated-external-fixtures',
        setup(build) {
          build.onLoad({ filter: /\/apps\/wbs\/be-01\/src\/testing\// }, (args) => ({
            contents: readFileSync(join(directory, basename(args.path))),
            loader: 'ts',
          }));
        },
      },
    ],
  });
}

/** Only the modeled Bun compilation failure is expected for absent delivered files. */
async function expectMissingFixtures(directory: string): Promise<void> {
  try {
    await bundleWithFixtures(directory);
  } catch (cause) {
    if (!(cause instanceof Error) || cause.message !== 'Bundle failed') throw cause;
    return;
  }
  throw new Error('Bun accepted a context without its required fixtures');
}

test('actual fifth-driver closure requires exactly the delivered fixtures', async () => {
  const destination = join(folder(), 'delivered');
  stageComposedImageFixtures(REPOSITORY, destination);
  const built = await bundleWithFixtures(destination);
  expect(built.success).toBe(true);
  if (built.metafile === undefined) throw new Error('Bun omitted the required import graph');
  const required = Object.keys(built.metafile.inputs)
    .filter((path) => path.includes(`${FIXTURES}/`))
    .map((path) => basename(path))
    .sort();
  expect(required).toEqual([...COMPOSED_IMAGE_FIXTURES]);
  const empty = folder();
  await expectMissingFixtures(empty);
  rmSync(join(destination, 'clock-fixture.ts'));
  await expectMissingFixtures(destination);
});

test.each([
  {
    args: [],
    hostname: 'a'.repeat(12),
    diagnostic: 'expects socket, connected-composed and inventory',
  },
  {
    args: ['/tmp/absent-composed.sock', 'wrong', '/tmp/inventory'],
    hostname: 'a'.repeat(12),
    diagnostic: 'expects socket, connected-composed and inventory',
  },
  {
    args: ['/tmp/absent-composed.sock', 'connected-composed', '/tmp/inventory', 'extra'],
    hostname: 'a'.repeat(12),
    diagnostic: 'expects socket, connected-composed and inventory',
  },
  {
    args: ['/tmp/absent-composed.sock', 'connected-composed', '/tmp/inventory'],
    hostname: 'wrong',
    diagnostic: 'requires a 12-hex Docker hostname',
  },
])(
  'the external driver refuses invalid input before scenario work: $diagnostic',
  ({ args, hostname, diagnostic }) => {
    const sandbox = folder();
    const invocation = args.map((value) =>
      value === '/tmp/absent-composed.sock'
        ? join(sandbox, 'absent.sock')
        : value === '/tmp/inventory'
          ? join(sandbox, 'inventory')
          : value,
    );
    const execution = Bun.spawnSync([process.execPath, DRIVER, ...invocation], {
      cwd: sandbox,
      env: { ...process.env, HOSTNAME: hostname, TMPDIR: sandbox },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10_000,
    });
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain(diagnostic);
  },
);

test.each([[], ['one'], ['one', 'two', 'extra']])(
  'the fixture CLI refuses malformed arguments %j',
  (...args) => {
    const execution = Bun.spawnSync(
      [process.execPath, join(import.meta.dir, 'composed-image-fixtures.ts'), ...args],
      {
        cwd: folder(),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stderr.toString()).toContain(
      'expected repository and fresh fixture directory',
    );
  },
);
