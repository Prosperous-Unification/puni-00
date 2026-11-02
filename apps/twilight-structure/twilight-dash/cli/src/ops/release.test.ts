import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

const entrypoint = join(import.meta.dir, '../entrypoint.ts');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dash-release-'));
  directories.push(directory);
  const receipt = join(directory, 'invocation.json');
  const adapter = join(directory, 'adapter.ts');
  const configuration = join(directory, 'website.json');
  const dispatch = join(directory, 'dispatch.json');
  writeFileSync(configuration, '{}', { mode: 0o600 });
  writeFileSync(
    adapter,
    `await Bun.write(${JSON.stringify(receipt)}, JSON.stringify(process.argv.slice(2)));\nconsole.log('adapter observed');\nprocess.exit(Number(process.env['RELEASE_TEST_EXIT'] ?? '0'));\n`,
  );
  writeFileSync(
    dispatch,
    JSON.stringify({ schemaVersion: 1, targets: { website: { adapter, configuration } } }),
    { mode: 0o600 },
  );
  return { directory, receipt, adapter, configuration, dispatch };
}

function invoke(arguments_: string[], exit = '0') {
  const execution = Bun.spawnSync({
    cmd: [process.execPath, entrypoint, 'ops', 'release', ...arguments_],
    env: { ...process.env, RELEASE_TEST_EXIT: exit },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: execution.exitCode,
    stdout: execution.stdout.toString(),
    stderr: execution.stderr.toString(),
  };
}

function argumentsFor(dispatch: string) {
  return [
    'plan',
    'website',
    '--config',
    dispatch,
    '--environment',
    'development',
    '--profile',
    'dev-fast',
  ];
}

test('a development branch plan reaches only the selected adapter with intact argument boundaries', () => {
  const files = fixture();
  const execution = invoke([
    ...argumentsFor(files.dispatch),
    '--ref',
    'feature/home',
    '--public-ref',
    'feature/app',
  ]);
  expect(execution.exitCode).toBe(0);
  expect(JSON.parse(readFileSync(files.receipt, 'utf8'))).toEqual([
    'plan',
    '--config',
    files.configuration,
    '--environment',
    'development',
    '--profile',
    'dev-fast',
    '--ref',
    'feature/home',
    '--public-ref',
    'feature/app',
  ]);
  expect(execution.stdout).toContain('DEV-FAST');
  expect(execution.stdout).toContain('adapter observed');
});

test('full run remains distinct and propagates a failed adapter exit without claiming deployment', () => {
  const files = fixture();
  const execution = invoke(
    [
      'run',
      'website',
      '--config',
      files.dispatch,
      '--environment',
      'production',
      '--profile',
      'full',
      '--ref',
      'main',
    ],
    '23',
  );
  expect(execution.exitCode).toBe(23);
  expect(execution.stdout).toContain('FULL');
  const invocation: unknown = JSON.parse(readFileSync(files.receipt, 'utf8'));
  expect(invocation).toEqual([
    'run',
    '--config',
    files.configuration,
    '--environment',
    'production',
    '--profile',
    'full',
    '--ref',
    'main',
  ]);
  expect(execution.stdout).not.toContain('deployed');
});

test('production dev-fast refuses before reading even an absent dispatch file', () => {
  const files = fixture();
  const arguments_ = argumentsFor(join(files.directory, 'absent.json'));
  arguments_[5] = 'production';
  const execution = invoke(arguments_);
  expect(execution.exitCode).toBe(1);
  expect(execution.stderr).toContain('dev-fast is development-only');
  expect(existsSync(files.receipt)).toBe(false);
});

for (const [name, mutate] of [
  ['missing profile', (words: string[]) => words.slice(0, -2)],
  ['unknown flag', (words: string[]) => [...words, '--force', 'yes']],
  ['duplicate flag', (words: string[]) => [...words, '--ref', 'main', '--ref', 'branch']],
  ['missing flag value', (words: string[]) => [...words, '--ref']],
  ['option as value', (words: string[]) => [...words, '--ref', '--force']],
  ['invalid action', (words: string[]) => ['deploy', ...words.slice(1)]],
  ['invalid target', (words: string[]) => ['plan', '../website', ...words.slice(2)]],
  [
    'invalid environment',
    (words: string[]) => [...words.slice(0, 5), 'unknown', ...words.slice(6)],
  ],
  ['invalid profile', (words: string[]) => [...words.slice(0, -1), 'unsafe']],
] as const) {
  test(`grammar refuses ${name} without invoking an adapter`, () => {
    const files = fixture();
    const execution = invoke(mutate(argumentsFor(files.dispatch)));
    expect(execution.exitCode).toBe(1);
    expect(existsSync(files.receipt)).toBe(false);
  });
}

for (const [name, prepare] of [
  [
    'missing',
    (path: string) => {
      rmSync(path);
    },
  ],
  [
    'unreadable',
    (path: string) => {
      chmodSync(path, 0);
    },
  ],
  [
    'exposed',
    (path: string) => {
      chmodSync(path, 0o640);
    },
  ],
  [
    'malformed JSON',
    (path: string) => {
      writeFileSync(path, '{');
    },
  ],
  [
    'malformed shape',
    (path: string) => {
      writeFileSync(
        path,
        JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), schemaVersion: 2 }),
      );
    },
  ],
  [
    'symlink',
    (path: string) => {
      const original = `${path}.original`;
      writeFileSync(original, readFileSync(path), { mode: 0o600 });
      rmSync(path);
      symlinkSync(original, path);
    },
  ],
] as const) {
  test(`configuration refuses ${name} state without invoking an adapter`, () => {
    const files = fixture();
    prepare(files.dispatch);
    const execution = invoke(argumentsFor(files.dispatch));
    expect(execution.exitCode).toBe(1);
    expect(existsSync(files.receipt)).toBe(false);
  });
}

test('an unknown configured target refuses without invoking another target', () => {
  const files = fixture();
  const words = argumentsFor(files.dispatch);
  words[1] = 'another';
  const execution = invoke(words);
  expect(execution.exitCode).toBe(1);
  expect(execution.stderr).toContain('Unknown release target');
  expect(existsSync(files.receipt)).toBe(false);
});

test('a relative adapter path is refused before execution', () => {
  const files = fixture();
  writeFileSync(
    files.dispatch,
    JSON.stringify({
      schemaVersion: 1,
      targets: { website: { adapter: 'relative.ts', configuration: files.configuration } },
    }),
  );
  const execution = invoke(argumentsFor(files.dispatch));
  expect(execution.exitCode).toBe(1);
  expect(existsSync(files.receipt)).toBe(false);
});

test('production dev-fast cannot execute a valid configured adapter', () => {
  const files = fixture();
  const words = argumentsFor(files.dispatch);
  words[5] = 'production';
  const execution = invoke(words);
  expect(execution.exitCode).toBe(1);
  expect(existsSync(files.receipt)).toBe(false);
});

test('release help describes the profiles without reading configuration', () => {
  const execution = invoke(['--help']);
  expect(execution.exitCode).toBe(0);
  expect(execution.stdout).toContain('--profile dev-fast|full');
});
