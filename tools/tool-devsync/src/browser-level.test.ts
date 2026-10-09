import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { expect, it } from 'bun:test';

import {
  assertBrowserCommand,
  assertBrowserInputs,
  assertClean,
  browserServedFiles,
  decodeBrowserText,
  parseJson,
  publishBrowserBundle,
  readBrowserPublication,
  run,
  runBrowserLevel,
  runtimeEnvironment,
  validatedPortShift,
  withBrowserInvocation,
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
    const previousId = '11111111-1111-4111-8111-111111111111';
    await publishBrowserBundle(root, 'portable', previousId, {
      discovery: Buffer.from('{}'),
      execution: Buffer.from('{}'),
      playwright: Buffer.from('<testsuite/>'),
      report: '<testsuite tests="1" failures="0"/>',
      manifest: {
        invocationId: previousId,
        report: `tmp/junit/browser/${previousId}/report.xml`,
        reportDigest: digestEvidenceBytes('<testsuite tests="1" failures="0"/>'),
      },
    });
    expect((await readBrowserPublication(root, 'portable')).invocationId).toBe(previousId);
    await writeFile(join(root, 'README'), 'changed\n');
    await expectRefusal(
      runBrowserLevel(root, 'portable'),
      'Browser candidate or checkout is dirty',
    );
    expect(existsSync(report)).toBe(false);
    expect(existsSync(`${report}.manifest.json`)).toBe(false);
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps a failed newer invocation authoritative over an older concurrent publisher', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-owner-'));
  const firstEntered = Promise.withResolvers<undefined>();
  const releaseFirst = Promise.withResolvers<undefined>();
  const secondEntered = Promise.withResolvers<undefined>();
  const firstId = '11111111-1111-4111-8111-111111111111';
  try {
    const first = withBrowserInvocation(root, 'portable', async (publish) => {
      firstEntered.resolve(undefined);
      await releaseFirst.promise;
      await publish(firstId, {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite/>',
        manifest: {
          invocationId: firstId,
          report: `tmp/junit/browser/${firstId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite/>'),
        },
      });
    });
    await firstEntered.promise;
    const second = withBrowserInvocation(root, 'portable', async () => {
      secondEntered.resolve(undefined);
      await Promise.resolve();
      throw new Error('newer Browser attempt failed');
    });
    const secondRefusal = expectRefusal(second, 'newer Browser attempt failed');
    await secondEntered.promise;
    releaseFirst.resolve(undefined);
    await expectRefusal(first, 'ownership changed');
    await secondRefusal;
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
    await withBrowserInvocation(root, 'portable', async (publish) => {
      await publish(firstId, {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite/>',
        manifest: {
          invocationId: firstId,
          report: `tmp/junit/browser/${firstId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite/>'),
        },
      });
    });
    expect((await readBrowserPublication(root, 'portable')).invocationId).toBe(firstId);
  } finally {
    releaseFirst.resolve(undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses a stuck publication lock and clears prior success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-lock-'));
  const lock = join(root, 'tmp/junit/browser/portable.lock');
  try {
    const priorId = '22222222-2222-4222-8222-222222222222';
    await publishBrowserBundle(root, 'portable', priorId, {
      discovery: Buffer.from('{}'),
      execution: Buffer.from('{}'),
      playwright: Buffer.from('<testsuite/>'),
      report: '<testsuite/>',
      manifest: {
        invocationId: priorId,
        report: `tmp/junit/browser/${priorId}/report.xml`,
        reportDigest: digestEvidenceBytes('<testsuite/>'),
      },
    });
    await mkdir(lock);
    await expectRefusal(
      withBrowserInvocation(
        root,
        'portable',
        () => Promise.reject(new Error('stuck lock admitted an invocation')),
        50,
      ),
      'lock timed out',
    );
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('revokes an admitted Browser publisher when a newer attempt times out on the mode lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-lock-owner-'));
  const lock = join(root, 'tmp/junit/browser/portable.lock');
  const firstEntered = Promise.withResolvers<undefined>();
  const releaseFirst = Promise.withResolvers<undefined>();
  const firstId = '33333333-3333-4333-8333-333333333333';
  const lateId = '44444444-4444-4444-8444-444444444444';
  try {
    const first = withBrowserInvocation(root, 'portable', async (publish) => {
      firstEntered.resolve(undefined);
      await releaseFirst.promise;
      await publish(firstId, {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite/>',
        manifest: {
          invocationId: firstId,
          report: `tmp/junit/browser/${firstId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite/>'),
        },
      });
    });
    await firstEntered.promise;
    const admittedOwner = await readFile(join(root, 'tmp/junit/browser/portable.owner'), 'utf8');
    await mkdir(lock);
    await expectRefusal(
      withBrowserInvocation(
        root,
        'portable',
        () => Promise.reject(new Error('timed-out Browser attempt entered collection')),
        50,
      ),
      'lock timed out',
    );
    await rm(lock, { recursive: true });
    releaseFirst.resolve(undefined);
    await expectRefusal(first, 'ownership changed');
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
    // Model the in-flight publisher that passed its owner check before the timeout.
    await publishBrowserBundle(
      root,
      'portable',
      lateId,
      {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite/>',
        manifest: {
          invocationId: lateId,
          report: `tmp/junit/browser/${lateId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite/>'),
        },
      },
      admittedOwner,
    );
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ownership changed');
  } finally {
    releaseFirst.resolve(undefined);
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

it('kills descendant processes and returns before inherited output pipes can drain', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-group-'));
  const marker = join(root, 'descendant-marker');
  const command = `sleep 0.4; touch '${marker}'`;
  const started = Date.now();
  try {
    await expectRefusal(
      run(
        [
          process.execPath,
          '-e',
          `Bun.spawn(['sh','-c',${JSON.stringify(command)}],{stdout:'inherit',stderr:'inherit'}); await Bun.sleep(1000)`,
        ],
        root,
        { PATH: process.env['PATH'] ?? '/usr/bin:/bin' },
        50,
      ),
      'timed out',
    );
    expect(Date.now() - started).toBeLessThan(300);
    await Bun.sleep(500);
    expect(existsSync(marker)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('binds every served asset and refuses changed, inserted or symlinked files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-assets-'));
  const git = (args: string[]): string => {
    const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
    return call.stdout.toString().trim();
  };
  try {
    git(['init']);
    git(['config', 'user.name', 'Browser Fixture']);
    git(['config', 'user.email', 'browser.fixture@example.invalid']);
    await writeFile(join(root, '.gitignore'), 'config.ts\ndist/\n');
    git(['add', '.gitignore']);
    git(['commit', '-m', 'fixture']);
    const revision = git(['rev-parse', 'HEAD']);
    const configBytes = Buffer.from('config');
    await writeFile(join(root, 'config.ts'), configBytes);
    const servedRoot = 'dist/site';
    await mkdir(join(root, servedRoot), { recursive: true });
    await writeFile(join(root, servedRoot, 'index.html'), '<script src="app.js"></script>');
    await writeFile(join(root, servedRoot, 'app.js'), 'initial');
    await writeFile(join(root, servedRoot, 'app.css'), 'initial');
    const served = { root: servedRoot, files: await browserServedFiles(root, servedRoot) };
    await assertBrowserInputs(root, revision, 'config.ts', configBytes, undefined, served);
    await writeFile(join(root, servedRoot, 'app.js'), 'changed');
    await expectRefusal(
      assertBrowserInputs(root, revision, 'config.ts', configBytes, undefined, served),
      'served inventory changed',
    );
    await writeFile(join(root, servedRoot, 'app.js'), 'initial');
    await writeFile(join(root, servedRoot, 'app.css'), 'changed');
    await expectRefusal(
      assertBrowserInputs(root, revision, 'config.ts', configBytes, undefined, served),
      'served inventory changed',
    );
    await writeFile(join(root, servedRoot, 'app.css'), 'initial');
    await writeFile(join(root, servedRoot, 'foreign.js'), 'injected');
    await expectRefusal(
      assertBrowserInputs(root, revision, 'config.ts', configBytes, undefined, served),
      'served inventory changed',
    );
    await rm(join(root, servedRoot, 'foreign.js'));
    await symlink('app.js', join(root, servedRoot, 'alias.js'));
    await expectRefusal(browserServedFiles(root, servedRoot), 'contains a symlink');
    await rm(join(root, servedRoot, 'alias.js'));
    await symlink('site', join(root, 'dist/alias'));
    await expectRefusal(browserServedFiles(root, 'dist/alias'), 'regular directory');
    await rm(join(root, 'dist/alias'));
    const fifo = Bun.spawnSync(['mkfifo', join(root, servedRoot, 'unexpected.pipe')]);
    if (fifo.exitCode !== 0) throw new Error(fifo.stderr.toString());
    await expectRefusal(browserServedFiles(root, servedRoot), 'unknown file');
    await rm(join(root, servedRoot, 'unexpected.pipe'));
    await rm(join(root, servedRoot, 'app.js'));
    await rm(join(root, servedRoot, 'app.css'));
    await rm(join(root, servedRoot, 'index.html'));
    await expectRefusal(browserServedFiles(root, servedRoot), 'empty');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('publishes concurrent immutable Browser bundles through one complete pointer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-publish-'));
  try {
    const publish = async (invocationId: string) =>
      publishBrowserBundle(root, 'portable', invocationId, {
        discovery: Buffer.from(`discovery-${invocationId}`),
        execution: Buffer.from(`execution-${invocationId}`),
        playwright: Buffer.from(`raw-${invocationId}`),
        report: `<testsuite name="${invocationId}"/>`,
        manifest: {
          invocationId,
          report: `tmp/junit/browser/${invocationId}/report.xml`,
          reportDigest: digestEvidenceBytes(`<testsuite name="${invocationId}"/>`),
        },
      });
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    const pointers = await Promise.all([publish(first), publish(second)]);
    expect(pointers[0]).toBe(pointers[1]);
    const pointer = JSON.parse(await readFile(pointers[0], 'utf8')) as {
      invocationId: string;
      bundle: string;
    };
    const publication = await readBrowserPublication(root, 'portable');
    expect(publication.invocationId).toBe(pointer.invocationId);
    expect(publication.manifest['reportDigest']).toBe(digestEvidenceBytes(publication.report));
    await expectRefusal(publish(pointer.invocationId), 'EEXIST');
    const after = await readFile(pointers[0], 'utf8');
    expect((JSON.parse(after) as { invocationId: string }).invocationId).toBe(pointer.invocationId);
    await writeFile(join(root, pointer.bundle, 'report.xml'), 'mutated');
    await expectRefusal(readBrowserPublication(root, 'portable'), 'binding differs');
    await writeFile(
      pointers[0],
      JSON.stringify({
        schemaVersion: 1,
        invocationId: first,
        mode: 'portable',
        bundle: `tmp/junit/browser/${second}`,
      }),
    );
    await expectRefusal(readBrowserPublication(root, 'portable'), 'pointer identity');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('does not read a legacy shared report without a published pointer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-legacy-'));
  try {
    await mkdir(join(root, 'tmp/junit'), { recursive: true });
    await writeFile(join(root, 'tmp/junit/wbs-core.browser.portable.xml'), '<testsuite/>');
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
