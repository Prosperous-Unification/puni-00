import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterAll, beforeAll, expect, it } from 'bun:test';

import { buildPackage } from './packaging/build';
import { buildLintLauncher } from './policy/build-lint-launcher';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';
import { runExitSupervisor } from './testing/unconfirmed-lint-exit';

const roots: string[] = [];
const retainedRoots = new Set<string>();
let executable: Uint8Array, launcher: Uint8Array, ordinary: string;
function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'puni-root-provider-'));
  roots.push(root);
  return root;
}
function writeRoot(directory: string) {
  const path = join(directory, 'puni.mjs');
  writeFileSync(path, Buffer.concat([Buffer.from(createShebang() + '\n'), executable]));
  chmodSync(path, 0o755);
  return path;
}
beforeAll(async () => {
  // The root artifact is built as an external executable; no private root implementation is imported.
  const build = await Bun.build({
    entrypoints: [
      fileURLToPath(new URL('../../../../puni/cli/src/entrypoint.ts', import.meta.url)),
    ],
    target: 'bun',
    format: 'esm',
  });
  if (!build.success) throw new AggregateError(build.logs, 'root integration build failed');
  const artifact = build.outputs.find((output) => output.kind === 'entry-point');
  if (artifact === undefined) throw new Error('root build emitted no entrypoint');
  executable = new Uint8Array(await artifact.arrayBuffer());
  launcher = await buildLintLauncher();
  const packageRoot = createRoot();
  await buildPackage(packageRoot);
  ordinary = join(packageRoot, 'dist');
  writeRoot(ordinary);
}, 120000);
afterAll(() => {
  for (const root of roots.splice(0)) {
    if (!retainedRoots.has(root)) rmSync(root, { recursive: true, force: true });
  }
});
function invoke(
  entrypoint: string,
  args: readonly string[],
  directory: string,
  environment: Readonly<Record<string, string>> = { PATH: '/usr/bin:/bin' },
) {
  return Bun.spawnSync([...createLaunch(process.execPath, entrypoint), ...args], {
    cwd: directory,
    env: environment,
    stdin: Buffer.from('misleading stdin bytes'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
}
function createLint(validator: string) {
  const fixture = createInstalledLintFixture(launcher, validator);
  roots.push(fixture.root);
  return { ...fixture, entrypoint: writeRoot(fixture.installedDirectory) };
}

for (const alias of ['burokrat', 'bur', 'b'])
  it(
    alias +
      ' runs actual ordinary installed template requests through the built root with toolkit1',
    () => {
      const child = invoke(join(ordinary, 'puni.mjs'), [alias, 'template', 'list'], createRoot());
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stderr.length).toBe(0);
      expect(child.stdout.toString()).toContain('"id":"module"');
    },
  );

for (const alias of ['burokrat', 'bur', 'b'])
  it(alias + ' runs actual selected installed lint through the built root with toolkit2', () => {
    const fixture = createLint(
      'process.stdout.write(Buffer.from([0,255,65,10]));process.stderr.write(Buffer.from([0,254,66,10]));process.exitCode=37;',
    );
    const child = invoke(
      fixture.entrypoint,
      [alias, 'lint', 'working', fixture.candidate, 'HEAD'],
      fixture.candidate,
      {
        PATH: '/usr/bin:/bin',
        TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
        TMPDIR: fixture.scratch,
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(37);
    expect(child.stdout).toEqual(Buffer.from([0, 255, 65, 10]));
    expect(child.stderr).toEqual(Buffer.from([0, 254, 66, 10]));
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });

it('keeps required installed lint admission78 and caller-relative activation operands through the root', () => {
  const fixture = createLint('process.stdout.write("uncertified root report");');
  const child = invoke(
    fixture.entrypoint,
    ['b', 'lint', 'working', 'candidate', 'HEAD'],
    fixture.root,
    {
      PATH: '/usr/bin:/bin',
      TOOL_WIKI_ACTIVATION_ROOT: 'archive',
      TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      TMPDIR: 'scratch',
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(78);
  expect(child.stdout.toString()).toBe('uncertified root report');
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('freezes ordinary root Git lookup before candidate and toolkit cwd changes', () => {
  const candidate = createRoot(),
    observations = createRoot(),
    trustedMarker = join(observations, 'trusted-git'),
    candidateMarker = join(observations, 'candidate-git'),
    toolkitMarker = join(observations, 'toolkit-git');
  const init = Bun.spawnSync(['/usr/bin/git', 'init', '--initial-branch=main', candidate], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(init.exitCode, init.stderr.toString()).toBe(0);
  const commit = Bun.spawnSync(
    [
      '/usr/bin/git',
      '-C',
      candidate,
      '-c',
      'user.name=PUNI Root Fixture',
      '-c',
      'user.email=puni-root@example.test',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(commit.exitCode, commit.stderr.toString()).toBe(0);
  function writeGit(directory: string, marker: string) {
    const bin = join(directory, 'root-relative-bin');
    mkdirSync(bin, { recursive: true });
    symlinkSync(process.execPath, join(bin, 'bun'));
    const path = join(bin, 'git');
    writeFileSync(
      path,
      createShebang() +
        '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
        JSON.stringify(marker) +
        ',"git\\n");const child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});if(child.signalCode!==undefined)throw new Error("Git canary signaled");process.exit(child.exitCode);',
    );
    chmodSync(path, 0o755);
  }
  writeGit(ordinary, trustedMarker);
  writeGit(join(ordinary, 'toolkit'), toolkitMarker);
  writeGit(candidate, candidateMarker);
  const child = invoke(
    join(ordinary, 'puni.mjs'),
    ['bur', 'read-candidate', 'working', candidate, 'HEAD'],
    candidate,
    { PATH: 'root-relative-bin:/usr/bin:/bin' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(existsSync(trustedMarker)).toBe(true);
  expect(existsSync(candidateMarker)).toBe(false);
  expect(existsSync(toolkitMarker)).toBe(false);
});

it.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
  'exits the actual root after unconfirmed lint Git preflight before fixture cleanup',
  async () => {
    const fixture = createLint('throw new Error("preflight must not reach validator");');
    const stagePath = join(fixture.root, 'preflight-stage.pid'),
      bornPath = join(fixture.root, 'preflight-born.pid');
    const bin = join(fixture.installedDirectory, 'preflight-bin');
    mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, 'bun'));
    const git = join(bin, 'git');
    writeFileSync(
      git,
      createShebang() +
        '\nimport{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);writeFileSync(' +
        JSON.stringify(stagePath) +
        ',String(process.pid));setInterval(()=>undefined,1000);',
    );
    chmodSync(git, 0o755);
    const bytes = readFileSync(fixture.entrypoint, 'utf8'),
      newline = bytes.indexOf('\n');
    if (newline < 0) throw new Error('root artifact header absent');
    const instrument =
      'const fixtureFs=await import("node:fs");const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(pid<0&&fixtureFs.existsSync(' +
      JSON.stringify(stagePath) +
      ')&&-pid===Number(fixtureFs.readFileSync(' +
      JSON.stringify(stagePath) +
      ',"utf8")))return true;return nativeKill(pid,signal);};const fixtureSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{const owned=fixtureSpawn(argv,options);if(Array.isArray(argv)&&argv[0]==="git")fixtureFs.writeFileSync(' +
      JSON.stringify(bornPath) +
      ',String(owned.pid));return owned;};\n';
    writeFileSync(
      fixture.entrypoint,
      bytes.slice(0, newline + 1) + instrument + bytes.slice(newline + 1),
    );
    const report = await runExitSupervisor(
      {
        entrypoint: fixture.entrypoint,
        candidate: fixture.candidate,
        scratch: fixture.scratch,
        stagePath,
        bornPath,
        args: ['b', 'lint', 'working', fixture.candidate, 'HEAD'],
        environment: {
          PATH: 'preflight-bin:/usr/bin:/bin',
          TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
          TMPDIR: fixture.scratch,
        },
        input: 'root must not read this transport',
      },
      fixture.root,
    ).catch((cause: unknown) => {
      retainedRoots.add(fixture.root);
      throw new Error('native root ownership probe failed; retained fixture ' + fixture.root, {
        cause,
      });
    });
    expect(report).toMatchObject({
      settledBeforeCleanup: true,
      launcherStatus: 1,
      launcherSignal: null,
      stdout: '',
      retainedScratch: [],
      stageAliveBeforeCleanup: true,
      cleanup: { reaped: true, gone: true, priorRestored: true },
    });
    if (
      typeof report !== 'object' ||
      report === null ||
      !('stderr' in report) ||
      typeof report.stderr !== 'string'
    )
      throw new Error('root preflight report diagnostic absent');
    expect(report.stderr).toContain('cleanup is unconfirmed');
    expect(report.stderr).not.toContain('at runInstalledLint');
    if (!('stageParentBeforeCleanup' in report) || !('supervisorPid' in report))
      throw new Error('root adoption observation absent');
    expect(report.stageParentBeforeCleanup).toBe(report.supervisorPid);
  },
);

it('reports absent root lint PATH inside its bounded executable reporter', () => {
  const fixture = createLint('throw new Error("missing PATH must not execute validator");');
  const child = invoke(
    fixture.entrypoint,
    ['b', 'lint', 'working', fixture.candidate, 'HEAD'],
    fixture.candidate,
    { TMPDIR: fixture.scratch },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(1);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.toString()).toBe(
    'tool-wiki lint: trusted executable PATH is required for Burokrat\n',
  );
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('preserves explicitly empty root lint PATH as the selected trusted directory', () => {
  const fixture = createLint(
      'throw new Error("optional absent activation must not run validator");',
    ),
    marker = join(fixture.root, 'empty-path-git');
  symlinkSync(process.execPath, join(fixture.installedDirectory, 'bun'));
  const git = join(fixture.installedDirectory, 'git');
  writeFileSync(
    git,
    createShebang() +
      '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
      JSON.stringify(marker) +
      ',"git\\n");const child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});if(child.signalCode!==undefined)throw new Error("owned Git signaled");process.exit(child.exitCode);',
  );
  chmodSync(git, 0o755);
  const child = invoke(
    fixture.entrypoint,
    ['b', 'lint', 'working', fixture.candidate, 'HEAD'],
    fixture.candidate,
    { PATH: '', TMPDIR: fixture.scratch },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stderr.length).toBe(0);
  expect(child.stdout.toString()).toContain('"status":"inactive"');
  expect(existsSync(marker)).toBe(true);
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

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

for (const mode of ['closed', 'stalled'] as const)
  it.skipIf(process.platform !== 'linux')(
    'settles absent-PATH root lint with ' + mode + ' stderr before fixture cleanup',
    async () => {
      const fixture = createLint('throw new Error("missing PATH must not start validator");'),
        fifo = join(fixture.root, 'stderr.fifo'),
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
      const bytes = readFileSync(fixture.entrypoint, 'utf8'),
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
        fixture.entrypoint,
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
        child = Bun.spawn(
          [
            ...createLaunch(process.execPath, fixture.entrypoint),
            'b',
            'lint',
            'working',
            fixture.candidate,
            'HEAD',
          ],
          {
            cwd: fixture.candidate,
            env: { TMPDIR: fixture.scratch },
            stdin: 'ignore',
            stdout: 'pipe',
            stderr: Bun.file(fifo),
          },
        );
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
        expect(readdirSync(fixture.scratch)).toEqual([]);
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
