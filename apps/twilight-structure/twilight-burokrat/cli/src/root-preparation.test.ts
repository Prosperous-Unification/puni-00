import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterAll, beforeAll, expect, it } from 'bun:test';

import { createPuniManifest } from './packaging/puni-manifest';
import { disposeRelocationFixtures } from './policy/relocation-fixtures';
import { createRelocationFixture, createToolkitFixture } from './testing/preparation-fixtures';
import { runExitSupervisor } from './testing/unconfirmed-lint-exit';

const roots: string[] = [];
const retainedRoots = new Set<string>();
let rootBytes: string;
beforeAll(async () => {
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, '../../../../puni/cli/src/entrypoint.ts')],
    target: 'bun',
    format: 'esm',
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('cannot build actual PUNI root for owned preparation');
  const artifact = built.outputs.at(0);
  if (artifact === undefined) throw new Error('PUNI root fixture artifact absent');
  rootBytes = await artifact.text();
}, 60000);
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0))
    if (!retainedRoots.has(root)) rmSync(root, { recursive: true, force: true });
});
async function createFixture(
  command: 'prepare-activation' | 'prepare-relocation-activation',
  prefix = '',
) {
  const fixture =
    command === 'prepare-activation'
      ? await createToolkitFixture(roots)
      : await createRelocationFixture(roots);
  const directory = join(fixture.root, 'installed-entries');
  mkdirSync(directory);
  cpSync(fixture.context.toolkitDirectory, join(directory, 'toolkit'), { recursive: true });
  writeFileSync(
    join(directory, 'package-manifest.json'),
    createPuniManifest('a'.repeat(40), fixture.context.expectedToolkitIdentity),
  );
  const entry = join(directory, 'puni.mjs');
  writeFileSync(entry, createShebang() + '\n' + prefix + rootBytes);
  const request = fixture.request;
  const args = [
    'b',
    command,
    '--candidate-repository',
    request.candidateRepository,
    '--candidate-sha',
    request.candidateSha,
    '--review-record',
    request.reviewRecord,
    '--destination',
    request.destination,
    '--work',
    request.work,
    '--resource-lane',
    request.resourceLane,
    '--cwd-identity',
    request.cwdIdentity,
    '--check-runs',
    request.checkRuns,
  ];
  if (request.command === 'prepare-activation')
    args.push(
      '--candidate-policy',
      request.candidatePolicy,
      '--candidate-mapping',
      request.candidateMapping,
      '--audit-strata',
      request.auditStrata,
    );
  else {
    args.push('--base-activation', request.baseActivation);
    if (request.candidatePolicy !== undefined)
      args.push('--candidate-policy', request.candidatePolicy);
    if (request.candidateLauncher !== undefined)
      args.push('--candidate-launcher', request.candidateLauncher);
    if (request.validatorEntry !== undefined)
      args.push('--validator-entry', request.validatorEntry);
  }
  return { ...fixture, directory, entry, args };
}

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it(
    'actual root owns current ' + command + ' through archive completion',
    async () => {
      const fixture = await createFixture(command);
      const child = Bun.spawnSync(
        [...createLaunch(process.execPath, fixture.entry), ...fixture.args],
        {
          cwd: fixture.context.callerDirectory,
          env: { PATH: '/usr/bin:/bin' },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 20000,
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stdout.toString()).toContain(fixture.revision);
      expect(child.stderr.length).toBe(0);
      expect(
        existsSync(
          join(fixture.request.work, 'puni-activation-' + fixture.revision.slice(0, 8) + '.tar'),
        ),
      ).toBe(true);
    },
    60000,
  );
}

it('actual root enters the bounded preparation reporter before missing PATH under stalled stderr', async () => {
  const fixture = await createFixture('prepare-activation');
  const marker = join(fixture.root, 'owned-stderr-opened');
  writeFileSync(
    fixture.entry,
    'import{writeFileSync as recordOwnedSink}from"node:fs";Bun.stderr.writer=()=>{recordOwnedSink(' +
      JSON.stringify(marker) +
      ',"opened");return{write(){return new Promise(()=>{});},flush(){throw new Error("stalled write must not flush");},unref(){}};};\n' +
      rootBytes,
  );
  const child = Bun.spawnSync([...createLaunch(process.execPath, fixture.entry), ...fixture.args], {
    cwd: fixture.context.callerDirectory,
    env: {},
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(1);
  expect(existsSync(marker)).toBe(true);
  expect(child.stderr.length).toBe(0);
  expect(existsSync(fixture.request.work)).toBe(false);
});

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
    'actual root ' + command + ' exits after unconfirmed Git cleanup before fixture reaping',
    async () => {
      const fixture = await createFixture(command);
      const bin = join(fixture.root, 'preflight-bin'),
        scratch = join(fixture.root, 'observed-scratch');
      mkdirSync(bin);
      mkdirSync(scratch);
      symlinkSync(process.execPath, join(bin, 'bun'));
      const stagePath = join(fixture.root, 'preflight-stage.pid'),
        bornPath = join(fixture.root, 'preflight-born.pid');
      const git = join(bin, 'git');
      writeFileSync(
        git,
        createShebang() +
          '\nimport{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
          JSON.stringify(stagePath) +
          ',String(process.pid));setInterval(()=>undefined,1000);',
      );
      chmodSync(git, 0o755);
      const instrument =
        'const fixtureFs=await import("node:fs");const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(pid<0&&fixtureFs.existsSync(' +
        JSON.stringify(stagePath) +
        ')&&-pid===Number(fixtureFs.readFileSync(' +
        JSON.stringify(stagePath) +
        ',"utf8")))return true;return nativeKill(pid,signal);};const fixtureSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{const owned=fixtureSpawn(argv,options);if(Array.isArray(argv)&&argv[0]==="git")fixtureFs.writeFileSync(' +
        JSON.stringify(bornPath) +
        ',String(owned.pid));return owned;};\n';
      writeFileSync(fixture.entry, instrument + rootBytes);
      const observed = await runExitSupervisor(
        {
          entrypoint: fixture.entry,
          candidate: fixture.context.callerDirectory,
          scratch,
          stagePath,
          bornPath,
          args: fixture.args,
          environment: { PATH: bin + ':/usr/bin:/bin' },
          input: 'root must not read transport',
        },
        fixture.root,
      ).catch((cause: unknown) => {
        retainedRoots.add(fixture.root);
        throw new Error('root preparation native probe failed; retained ' + fixture.root, {
          cause,
        });
      });
      expect(observed).toMatchObject({
        settledBeforeCleanup: true,
        launcherStatus: 1,
        launcherSignal: null,
        stdout: '',
        retainedScratch: [],
        stageAliveBeforeCleanup: true,
        cleanup: { reaped: true, gone: true, priorRestored: true },
      });
      if (
        typeof observed !== 'object' ||
        observed === null ||
        !('stderr' in observed) ||
        typeof observed.stderr !== 'string' ||
        !('stagePid' in observed)
      )
        throw new Error('native preparation observation malformed');
      expect(observed.stderr).toContain('cleanup is unconfirmed');
      expect(observed.stderr).toContain(String(observed.stagePid));
      expect(observed.stderr).not.toContain('    at ');
    },
    20000,
  );
}

async function waitRootExit(
  child: { readonly exited: Promise<number> },
  milliseconds = 5000,
): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('root fixture did not settle'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
async function waitRootPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('root fixture marker absent: ' + path);
}

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const)
  for (const mode of ['closed', 'stalled'] as const)
    it.skipIf(process.platform !== 'linux')(
      'settles absent-PATH root ' + command + ' with ' + mode + ' stderr before fixture cleanup',
      async () => {
        const fixture = await createFixture(command);
        const scratch = join(fixture.root, 'observed-scratch');
        mkdirSync(scratch);
        const fifo = join(fixture.root, 'stderr.fifo'),
          readerReady = join(fixture.root, 'reader.ready'),
          rootReady = join(fixture.root, 'root.ready'),
          release = join(fixture.root, 'root.release'),
          gitMarker = join(fixture.root, 'git-unexpected');
        const created = Bun.spawnSync(['mkfifo', fifo], { stdout: 'pipe', stderr: 'pipe' });
        expect(created.exitCode, created.stderr.toString()).toBe(0);
        const readerPath = join(fixture.root, 'reader.mjs');
        writeFileSync(
          readerPath,
          'import{constants,openSync,writeSync,writeFileSync}from"node:fs";const fd=openSync(' +
            JSON.stringify(fifo) +
            ',constants.O_NONBLOCK|' +
            (mode === 'stalled' ? 'constants.O_RDWR' : 'constants.O_RDONLY') +
            ');' +
            (mode === 'stalled'
              ? 'for(;;){try{writeSync(fd,Buffer.alloc(4096,88));}catch(cause){if(cause?.code!=="EAGAIN")throw cause;break;}}'
              : '') +
            'writeFileSync(' +
            JSON.stringify(readerReady) +
            ',"ready");setInterval(()=>undefined,1000);',
        );
        const bytes = readFileSync(fixture.entry, 'utf8'),
          newline = bytes.indexOf('\n');
        if (newline < 0) throw new Error('root fixture header absent');
        const instrument =
          'const fixtureFs=await import("node:fs");fixtureFs.writeFileSync(' +
          JSON.stringify(rootReady) +
          ',"ready");while(!fixtureFs.existsSync(' +
          JSON.stringify(release) +
          '))await Bun.sleep(5);const fixtureSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{fixtureFs.writeFileSync(' +
          JSON.stringify(gitMarker) +
          ',"unexpected child");return fixtureSpawn(argv,options);};\n';
        writeFileSync(
          fixture.entry,
          bytes.slice(0, newline + 1) + instrument + bytes.slice(newline + 1),
        );
        const reader = Bun.spawn([...createLaunch(process.execPath, readerPath)], {
          stdin: 'ignore',
          stdout: 'ignore',
          stderr: 'pipe',
        });
        const readerError = new Response(reader.stderr).text();
        let child: Bun.Subprocess<'ignore', 'pipe', Bun.BunFile> | undefined;
        let captured: Promise<string> | undefined;
        let failure:
          { readonly kind: 'absent' } | { readonly kind: 'failed'; readonly cause: unknown } = {
          kind: 'absent',
        };
        try {
          await waitRootPath(readerReady);
          child = Bun.spawn([...createLaunch(process.execPath, fixture.entry), ...fixture.args], {
            cwd: fixture.context.callerDirectory,
            env: { TMPDIR: scratch },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: Bun.file(fifo),
          });
          captured = new Response(child.stdout).text();
          await waitRootPath(rootReady);
          if (mode === 'closed') {
            reader.kill('SIGKILL');
            await reader.exited;
          }
          writeFileSync(release, 'go');
          expect(await waitRootExit(child)).toBe(1);
          expect(child.signalCode).toBeNull();
          expect(await captured).toBe('');
          expect(existsSync(gitMarker)).toBe(false);
          expect(existsSync(fixture.request.work)).toBe(false);
        } catch (cause) {
          failure = { kind: 'failed', cause };
        }
        const cleanupFailures: unknown[] = [];
        try {
          if (child?.exitCode === null) {
            child.kill('SIGKILL');
            await waitRootExit(child);
          }
        } catch (cause) {
          cleanupFailures.push(cause);
        }
        try {
          if (reader.exitCode === null) {
            reader.kill('SIGKILL');
            await waitRootExit(reader);
          }
        } catch (cause) {
          cleanupFailures.push(cause);
        }
        try {
          if (captured !== undefined) await captured;
          const diagnostic = await readerError;
          if (diagnostic.length !== 0) throw new Error('owned FIFO reader failed: ' + diagnostic);
        } catch (cause) {
          cleanupFailures.push(cause);
        }
        if (cleanupFailures.length > 0) retainedRoots.add(fixture.root);
        if (failure.kind === 'failed' || cleanupFailures.length > 0)
          throw new AggregateError(
            [...(failure.kind === 'failed' ? [failure.cause] : []), ...cleanupFailures],
            'root output fixture failed',
          );
      },
      15000,
    );
