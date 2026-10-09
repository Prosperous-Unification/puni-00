import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { expect, it } from 'bun:test';

import {
  assertBrowserCommand,
  assertBrowserInputs,
  assertClean,
  decodeBrowserText,
  parseJson,
  run,
  runBrowserLevel,
  runtimeEnvironment,
  validatedPortShift,
} from './browser-level';

async function expectRefusal(action: Promise<unknown>, phrase: string): Promise<void> {
  let cause: unknown;
  try {
    await action;
  } catch (error) {
    cause = error;
  }
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('expected an Error refusal');
  expect(cause.message).toContain(phrase);
}

it('clears stale Browser pointers and refuses a dirty candidate before execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-dirty-'));
  const call = (args: string[]) => {
    const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  };
  try {
    call(['init']);
    call(['config', 'user.name', 'Browser Fixture']);
    call(['config', 'user.email', 'browser.fixture@example.invalid']);
    await writeFile(join(root, 'README'), 'committed\n');
    call(['add', 'README']);
    call(['commit', '-m', 'fixture']);
    const report = join(root, 'tmp/junit/wbs-core.browser.portable.xml');
    await mkdir(join(root, 'tmp/junit'), { recursive: true });
    await writeFile(report, '<testsuite tests="1" failures="0"/>');
    await writeFile(`${report}.manifest.json`, '{}');
    await writeFile(join(root, 'README'), 'changed\n');
    await expectRefusal(
      runBrowserLevel(root, 'portable'),
      'Browser candidate or checkout is dirty',
    );
    expect(existsSync(report)).toBe(false);
    expect(existsSync(`${report}.manifest.json`)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses hidden Git inputs and revision movement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-index-'));
  const git = (args: string[]): string => {
    const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
    return call.stdout.toString().trim();
  };
  try {
    git(['init']);
    git(['config', 'user.name', 'Browser Fixture']);
    git(['config', 'user.email', 'browser.fixture@example.invalid']);
    await writeFile(join(root, 'README'), 'committed\n');
    git(['add', 'README']);
    git(['commit', '-m', 'fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    expect(assertClean(root, revision)).toBe(revision);
    git(['update-index', '--assume-unchanged', 'README']);
    expect(() => assertClean(root)).toThrow('hidden changes');
    git(['update-index', '--no-assume-unchanged', 'README']);
    expect(() => assertClean(root, '0'.repeat(40))).toThrow('revision changed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses changed config and build artifact bytes in the production input check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-inputs-'));
  const git = (args: string[]): string => {
    const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
    return call.stdout.toString().trim();
  };
  try {
    git(['init']);
    git(['config', 'user.name', 'Browser Fixture']);
    git(['config', 'user.email', 'browser.fixture@example.invalid']);
    await writeFile(join(root, '.gitignore'), 'config.ts\nartifact.bin\n');
    git(['add', '.gitignore']);
    git(['commit', '-m', 'fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    const original = Buffer.from('original');
    await writeFile(join(root, 'config.ts'), 'changed');
    await writeFile(join(root, 'artifact.bin'), 'original');
    const artifact = { path: 'artifact.bin', digest: digestEvidenceBytes(original) };
    await expectRefusal(
      assertBrowserInputs(root, revision, 'config.ts', original, artifact),
      'config bytes changed',
    );
    await writeFile(join(root, 'config.ts'), original);
    await writeFile(join(root, 'artifact.bin'), 'changed');
    await expectRefusal(
      assertBrowserInputs(root, revision, 'config.ts', original, artifact),
      'build artifact changed',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses malformed reporter bytes, command failure and unsafe Browser environment', () => {
  expect(() => parseJson(new Uint8Array([0xff]), 'discovery')).toThrow('not UTF-8');
  expect(() => decodeBrowserText(new Uint8Array([0xff]), 'raw JUnit')).toThrow('not UTF-8');
  expect(() => parseJson(Buffer.from('{'), 'discovery')).toThrow('malformed');
  expect(() => {
    assertBrowserCommand({ exitCode: 1, stdout: '', stderr: 'boom' }, 'discovery');
  }).toThrow('discovery failed');
  const priorShift = process.env['E2E_PORT_SHIFT'];
  const priorRegular = process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
  try {
    process.env['E2E_PORT_SHIFT'] = '-1';
    expect(() => validatedPortShift()).toThrow('E2E_PORT_SHIFT');
    process.env['E2E_PORT_SHIFT'] = '500';
    process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = 'yes';
    expect(() => runtimeEnvironment('ordinary', '/tmp/browser')).toThrow(
      'PLAYWRIGHT_CHROMIUM_REGULAR',
    );
    process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = '1';
    expect(runtimeEnvironment('ordinary', '/tmp/browser')['CI']).toBe('1');
    expect(runtimeEnvironment('ordinary', '/tmp/browser')['E2E_PORT_SHIFT']).toBe('500');
  } finally {
    if (priorShift === undefined) delete process.env['E2E_PORT_SHIFT'];
    else process.env['E2E_PORT_SHIFT'] = priorShift;
    if (priorRegular === undefined) delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
    else process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = priorRegular;
  }
});

it('bounds a hung Browser child before evidence publication', async () => {
  await expectRefusal(
    run(
      [process.execPath, '-e', 'await Bun.sleep(500)'],
      tmpdir(),
      { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
      10,
    ),
    'timed out',
  );
});
