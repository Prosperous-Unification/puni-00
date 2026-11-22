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

async function seedBrowserOwner(root: string): Promise<string> {
  const browserRoot = join(root, 'tmp/junit/browser');
  const owner = '77777777-7777-4777-8777-777777777777';
  await mkdir(browserRoot, { recursive: true });
  await writeFile(join(browserRoot, 'portable.owner'), owner);
  await writeFile(join(browserRoot, 'portable.latest-request'), owner);
  return owner;
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
    const owner = await seedBrowserOwner(root);
    await publishBrowserBundle(
      root,
      'portable',
      previousId,
      {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite tests="1" failures="0"/>',
        manifest: {
          invocationId: previousId,
          report: `tmp/junit/browser/${previousId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite tests="1" failures="0"/>'),
        },
      },
      owner,
    );
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
    await expectRefusal(first, 'request changed');
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
    const owner = await seedBrowserOwner(root);
    await publishBrowserBundle(
      root,
      'portable',
      priorId,
      {
        discovery: Buffer.from('{}'),
        execution: Buffer.from('{}'),
        playwright: Buffer.from('<testsuite/>'),
        report: '<testsuite/>',
        manifest: {
          invocationId: priorId,
          report: `tmp/junit/browser/${priorId}/report.xml`,
          reportDigest: digestEvidenceBytes('<testsuite/>'),
        },
      },
      owner,
    );
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
    await expectRefusal(readBrowserPublication(root, 'portable'), 'request changed');
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
    await expectRefusal(first, 'request changed');
    expect(existsSync(join(root, 'tmp/junit/browser', firstId))).toBe(false);
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
    await expectRefusal(readBrowserPublication(root, 'portable'), 'request changed');
  } finally {
    releaseFirst.resolve(undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps a timed-out newer request authoritative while older admission is paused', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-admission-race-'));
  const firstLocked = Promise.withResolvers<undefined>();
  const releaseFirst = Promise.withResolvers<undefined>();
  const firstId = '55555555-5555-4555-8555-555555555555';
  let firstCollected = false;
  try {
    const first = withBrowserInvocation(
      root,
      'portable',
      async (publish) => {
        firstCollected = true;
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
      },
      5_000,
      {
        beforeOwnerRename: async () => {
          firstLocked.resolve(undefined);
          await releaseFirst.promise;
        },
      },
    );
    await firstLocked.promise;
    await expectRefusal(
      withBrowserInvocation(
        root,
        'portable',
        () => Promise.reject(new Error('timed-out request entered collection')),
        50,
      ),
      'lock timed out',
    );
    releaseFirst.resolve(undefined);
    await expectRefusal(first, 'request changed');
    expect(firstCollected).toBe(false);
    expect(existsSync(join(root, 'tmp/junit/browser/portable.owner'))).toBe(false);
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

it('refuses collection when a newer request arrives after the owner rename', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-owner-race-'));
  const ownerRenamed = Promise.withResolvers<undefined>();
  const releaseOwner = Promise.withResolvers<undefined>();
  let firstCollected = false;
  try {
    const first = withBrowserInvocation(
      root,
      'portable',
      () => {
        firstCollected = true;
        return Promise.resolve();
      },
      5_000,
      {
        afterOwnerRename: async () => {
          ownerRenamed.resolve(undefined);
          await releaseOwner.promise;
        },
      },
    );
    await ownerRenamed.promise;
    await expectRefusal(
      withBrowserInvocation(
        root,
        'portable',
        () => Promise.reject(new Error('timed-out request entered collection')),
        50,
      ),
      'lock timed out',
    );
    releaseOwner.resolve(undefined);
    await expectRefusal(first, 'request changed');
    expect(firstCollected).toBe(false);
  } finally {
    releaseOwner.resolve(undefined);
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses a publisher superseded while its pointer is staged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puni-browser-pointer-race-'));
  const pointerStaged = Promise.withResolvers<undefined>();
  const releasePointer = Promise.withResolvers<undefined>();
  const invocationId = '66666666-6666-4666-8666-666666666666';
  try {
    const first = withBrowserInvocation(
      root,
      'portable',
      async (publish) => {
        await publish(invocationId, {
          discovery: Buffer.from('{}'),
          execution: Buffer.from('{}'),
          playwright: Buffer.from('<testsuite/>'),
          report: '<testsuite/>',
          manifest: {
            invocationId,
            report: `tmp/junit/browser/${invocationId}/report.xml`,
            reportDigest: digestEvidenceBytes('<testsuite/>'),
          },
        });
      },
      5_000,
      {
        beforePointerRename: async () => {
          pointerStaged.resolve(undefined);
          await releasePointer.promise;
        },
      },
    );
    await pointerStaged.promise;
    await expectRefusal(
      withBrowserInvocation(
        root,
        'portable',
        () => Promise.reject(new Error('timed-out request entered collection')),
        50,
      ),
      'lock timed out',
    );
    releasePointer.resolve(undefined);
    await expectRefusal(first, 'request changed');
    await expectRefusal(readBrowserPublication(root, 'portable'), 'request changed');
  } finally {
    releasePointer.resolve(undefined);
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

it('re-raises SIGTERM received before a Browser deadline while the child still holds its pipes', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'puni-browser-first-signal-'));
  const observed = join(scratch, 'supervisor-signal');
  const childPid = join(scratch, 'child-pid');
  const childSignal = join(scratch, 'child-signal');
  const command = [
    'import { writeFileSync } from "node:fs";',
    'process.on("SIGTERM", () => writeFileSync(' + JSON.stringify(childSignal) + ', "TERM"));',
    'writeFileSync(' + JSON.stringify(childPid) + ', String(process.pid));',
    'process.kill(process.ppid, "SIGTERM");',
    'await Bun.sleep(3000);',
  ].join('\n');
  const supervisor = [
    'import { writeFileSync } from "node:fs";',
    'import { run } from ' + JSON.stringify(join(import.meta.dir, 'browser-level.ts')) + ';',
    'const started = Date.now();',
    'process.once("SIGTERM", () => writeFileSync(' +
      JSON.stringify(observed) +
      ', String(Date.now()-started)));',
    'try { await run([process.execPath, "-e", ' +
      JSON.stringify(command) +
      '], ' +
      JSON.stringify(scratch) +
      ', {PATH: "/usr/bin:/bin"}, 500); }',
    'catch (cause) { console.error(String(cause)); process.exitCode = 23; }',
  ].join('\n');
  let hasExited = false;
  try {
    const child = Bun.spawnSync([process.execPath, '-e', supervisor], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 12000,
    });
    const firstSignalAt = Number(await readFile(observed, 'utf8'));
    const pid = Number(await readFile(childPid, 'utf8'));
    const term = await readFile(childSignal, 'utf8');
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
    hasExited = !existsSync('/proc/' + String(pid));
    expect(firstSignalAt).toBeLessThan(500);
    expect(term).toBe('TERM');
    expect(hasExited).toBe(true);
    expect(child.signalCode).toBe('SIGTERM');
  } finally {
    if (hasExited) await rm(scratch, { recursive: true });
    else console.error('Browser signal fixture retained with unconfirmed child exit: ' + scratch);
  }
}, 15000);

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
    const owner = await seedBrowserOwner(root);
    const publish = async (invocationId: string) =>
      publishBrowserBundle(
        root,
        'portable',
        invocationId,
        {
          discovery: Buffer.from(`discovery-${invocationId}`),
          execution: Buffer.from(`execution-${invocationId}`),
          playwright: Buffer.from(`raw-${invocationId}`),
          report: `<testsuite name="${invocationId}"/>`,
          manifest: {
            invocationId,
            report: `tmp/junit/browser/${invocationId}/report.xml`,
            reportDigest: digestEvidenceBytes(`<testsuite name="${invocationId}"/>`),
          },
        },
        owner,
      );
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
    const latestRequest = join(root, 'tmp/junit/browser/portable.latest-request');
    await rm(latestRequest);
    await expectRefusal(readBrowserPublication(root, 'portable'), 'ENOENT');
    await mkdir(latestRequest);
    await expectRefusal(readBrowserPublication(root, 'portable'), 'EISDIR');
    await rm(latestRequest, { recursive: true });
    await writeFile(latestRequest, owner);
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

import { spyOn } from 'bun:test';

it('uses the selected Bun executable for real Browser discovery and execution', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'puni-browser-bun-dispatch-'));
  const candidate = join(parent, 'candidate');
  const previousPath = process.env['PATH'];
  const previousHome = process.env['HOME'];
  const previousGitGlobal = process.env['GIT_CONFIG_GLOBAL'];
  const previousGitSystem = process.env['GIT_CONFIG_SYSTEM'];
  const previousGitNoSystem = process.env['GIT_CONFIG_NOSYSTEM'];
  const nativeSpawn = Bun.spawn;
  let restoreSpawn: (() => void) | null = null;
  let primary: { cause: unknown } | null = null;
  const cleanupFailures: unknown[] = [];
  interface BrowserSpawn {
    argv: string[];
    cwd: string;
    selection: { CI: string | undefined; LANG: string | undefined };
  }
  const observed: BrowserSpawn[] = [];
  try {
    if (previousPath === undefined || previousPath === '')
      throw new Error('Browser dispatch observation requires the configured tool PATH');
    // The fixture and production collector's synchronous Git calls share this isolated basis.
    const home = join(parent, 'home');
    await mkdir(home);
    process.env['HOME'] = home;
    process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
    process.env['GIT_CONFIG_SYSTEM'] = '/dev/null';
    process.env['GIT_CONFIG_NOSYSTEM'] = '1';
    const aliases = join(parent, 'alias');
    await mkdir(aliases);
    // Observation-only baseline bridge, matching the accepted Performance vector control:
    // a node-named Bun alias lets the old vector reach its own assertion without installed Node.
    // It is not evidence of execution without a node name and changes no production lookup.
    await symlink(process.execPath, join(aliases, 'node'));
    process.env['PATH'] = aliases + ':' + previousPath;
    for (const executable of ['bun', 'git'])
      expect(Bun.which(executable)).toBe(Bun.which(executable, { PATH: previousPath }));
    await mkdir(join(candidate, 'libs/wbs/application/core/testing'), { recursive: true });
    await writeFile(
      join(candidate, '.gitignore'),
      'tmp/\nnode_modules\ndist/\ntest-results/\nplaywright-report/\n',
    );
    await writeFile(
      join(candidate, 'libs/wbs/application/core/testing/portable-composition.ts'),
      'export const browserDispatchFixture = "actual Bun build";\n',
    );
    await writeFile(
      join(candidate, 'libs/wbs/application/core/playwright.config.ts'),
      "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './testing', testMatch: '**/dispatch.spec.ts', projects: [{ name: 'chromium' }], workers: 1, retries: 0, timeout: 30000 });\n",
    );
    await writeFile(
      join(candidate, 'libs/wbs/application/core/testing/dispatch.spec.ts'),
      "import { expect, test } from '@playwright/test';\ntest('records a controlled Browser runner case', () => { expect(typeof process.versions.bun).toBe('string'); });\n",
    );
    const git = (args: string[]): void => {
      const invocation = Bun.spawnSync(['git', '-C', candidate, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (invocation.exitCode !== 0)
        throw new Error('Browser dispatch fixture Git failed: ' + invocation.stderr.toString());
    };
    git(['init']);
    git(['config', 'user.name', 'Browser Dispatch Fixture']);
    git(['config', 'user.email', 'browser.dispatch@example.invalid']);
    git(['add', '.']);
    git(['commit', '-m', 'controlled Browser dispatch fixture']);

    // Test-only controlled array launches: observe the real call, then forward it unchanged.
    const observeSpawn = ((...args: Parameters<typeof Bun.spawn>) => {
      const argv = args[0];
      const options = args[1];
      if (!Array.isArray(argv) || typeof options?.cwd !== 'string')
        throw new Error('Browser dispatch used an unexpected spawn form');
      observed.push({
        argv: [...argv],
        cwd: options.cwd,
        selection: { CI: options.env?.['CI'], LANG: options.env?.['LANG'] },
      });
      return nativeSpawn(...args);
    }) as typeof Bun.spawn;
    const observer = spyOn(Bun, 'spawn').mockImplementation(observeSpawn);
    restoreSpawn = () => {
      observer.mockRestore();
    };

    await runBrowserLevel(candidate, 'portable');
    const cli = join(import.meta.dir, '../../../node_modules/playwright/cli.js');
    const playwright = observed.filter((launch) => launch.argv[1] === cli);
    expect(playwright).toHaveLength(2);
    expect(playwright.map((launch) => launch.argv[0])).toEqual([
      process.execPath,
      process.execPath,
    ]);
    expect(playwright.map((launch) => launch.argv.slice(1))).toEqual([
      [
        cli,
        'test',
        '--config',
        'libs/wbs/application/core/playwright.config.ts',
        '--list',
        '--reporter=json',
      ],
      [
        cli,
        'test',
        '--config',
        'libs/wbs/application/core/playwright.config.ts',
        '--reporter=json,junit',
      ],
    ]);
    const discovery = playwright.at(0);
    const execution = playwright.at(1);
    if (discovery === undefined || execution === undefined)
      throw new Error('Actual Browser dispatch observations are absent');
    expect(discovery.cwd).toBe(execution.cwd);
    expect(discovery.cwd.startsWith(join(tmpdir(), 'puni-browser-portable-'))).toBe(true);
    expect(discovery.cwd.endsWith('/candidate')).toBe(true);
    expect(playwright.map((launch) => launch.selection)).toEqual([
      { CI: '1', LANG: 'C.UTF-8' },
      { CI: '1', LANG: 'C.UTF-8' },
    ]);
    const publication = await readBrowserPublication(candidate, 'portable');
    expect(publication.manifest['certifies']).toBe(false);
    expect(publication.manifest['coverage']).toEqual({ passingCases: 1, skippedDebt: 0 });
    expect(publication.report).toContain('tests="1" failures="0"');
  } catch (cause) {
    primary = { cause };
  }
  try {
    if (restoreSpawn !== null) restoreSpawn();
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (previousPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = previousPath;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (previousHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = previousHome;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (previousGitGlobal === undefined) delete process.env['GIT_CONFIG_GLOBAL'];
    else process.env['GIT_CONFIG_GLOBAL'] = previousGitGlobal;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (previousGitSystem === undefined) delete process.env['GIT_CONFIG_SYSTEM'];
    else process.env['GIT_CONFIG_SYSTEM'] = previousGitSystem;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    if (previousGitNoSystem === undefined) delete process.env['GIT_CONFIG_NOSYSTEM'];
    else process.env['GIT_CONFIG_NOSYSTEM'] = previousGitNoSystem;
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  try {
    await rm(parent, { recursive: true, force: true });
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  if (cleanupFailures.length > 0) {
    if (primary !== null)
      throw new AggregateError(
        [primary.cause, ...cleanupFailures],
        'Browser dispatch control and cleanup failed',
        { cause: primary.cause },
      );
    throw new AggregateError(cleanupFailures, 'Browser dispatch control cleanup failed');
  }
  if (primary !== null) throw primary.cause;
}, 30_000);
