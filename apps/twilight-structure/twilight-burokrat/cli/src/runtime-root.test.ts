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

import { buildLintLauncher } from './policy/build-lint-launcher';
import { buildValidatorBundle } from './policy/trusted-modules';
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
  const validator = await buildValidatorBundle(join(import.meta.dir, 'cli.ts'));
  const fixture = createInstalledLintFixture(launcher, Buffer.from(validator).toString());
  roots.push(fixture.root);
  fixture.writeValidator(validator);
  ordinary = fixture.installedDirectory;
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
      ' runs actual ordinary installed template requests through the built root with current PUNI toolkit2',
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

/** Real selected roles and trusted Git record entry before executing their unchanged behavior. */
function createRequiredSettingFixture() {
  const observations = createRoot();
  const gitStage = join(observations, 'git-stage');
  const launcherStage = join(observations, 'launcher-stage');
  const validatorStage = join(observations, 'validator-stage');
  const verdict = 'normal lint selected fixture verdict\n';
  const fixture = createLint(
    'import{appendFileSync}from"node:fs";appendFileSync(' +
      JSON.stringify(validatorStage) +
      ',"validator\\n");process.stdout.write(' +
      JSON.stringify(verdict) +
      ');process.exitCode=37;',
  );
  const launcherSource = readFileSync(join(fixture.toolkit, 'launcher.mjs'), 'utf8');
  const newline = launcherSource.indexOf('\n');
  if (newline < 0) throw new Error('selected fixture launcher has no shebang boundary');
  fixture.writeLauncher(
    Buffer.from(
      launcherSource.slice(0, newline + 1) +
        '{const requiredStageFs=await import("node:fs");requiredStageFs.appendFileSync(' +
        JSON.stringify(launcherStage) +
        ',"launcher\\n");}\n' +
        launcherSource.slice(newline + 1),
    ),
  );
  const bin = join(observations, 'trusted-bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'bun'));
  const git = join(bin, 'git');
  writeFileSync(
    git,
    createShebang() +
      '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
      JSON.stringify(gitStage) +
      ',"git\\n");const child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});if(child.signalCode!==undefined)throw new Error("owned required-setting Git signaled");process.exit(child.exitCode);',
  );
  chmodSync(git, 0o755);
  return {
    ...fixture,
    verdict,
    stages: [gitStage, launcherStage, validatorStage],
    environment: {
      PATH: bin + ':/usr/bin:/bin',
      TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
      TMPDIR: fixture.scratch,
    },
  };
}

for (const alias of ['b', 'bur', 'burokrat'] as const) {
  for (const setting of [
    { name: 'true', value: 'true' },
    { name: '2', value: '2' },
    { name: 'whitespace', value: ' 1 ' },
    { name: 'empty', value: '' },
  ] as const) {
    it(
      alias +
        ' refuses invalid normal lint required setting ' +
        setting.name +
        ' before any installed stage',
      () => {
        const fixture = createRequiredSettingFixture();
        const args = [alias, 'lint', 'working', fixture.candidate, 'HEAD'];
        const healthy = invoke(fixture.entrypoint, args, fixture.candidate, {
          ...fixture.environment,
          TOOL_WIKI_REQUIRE_CERTIFIED: '0',
        });
        expect(healthy.exitCode, healthy.stderr.toString()).toBe(37);
        expect(healthy.stdout.toString()).toBe(fixture.verdict);
        expect(healthy.stderr.length).toBe(0);
        for (const stage of fixture.stages) {
          expect(readFileSync(stage, 'utf8').length).toBeGreaterThan(0);
          rmSync(stage);
          expect(existsSync(stage)).toBe(false);
        }
        expect(readdirSync(fixture.scratch)).toEqual([]);
        const child = invoke(fixture.entrypoint, args, fixture.candidate, {
          ...fixture.environment,
          TOOL_WIKI_REQUIRE_CERTIFIED: setting.value,
        });
        expect(child.exitCode, child.stderr.toString()).toBe(64);
        expect(child.stdout.length).toBe(0);
        expect(child.stderr).toEqual(
          Buffer.from('tool-wiki lint: TOOL_WIKI_REQUIRE_CERTIFIED must be 0 or 1\n'),
        );
        for (const stage of fixture.stages) expect(existsSync(stage)).toBe(false);
        expect(readdirSync(fixture.scratch)).toEqual([]);
      },
    );
  }
}

it('the configured Nx working lint caller uses the current PUNI installation without Bash or Node', () => {
  const fixture = createInstalledLintFixture(
    launcher,
    (directory) =>
      'import{appendFileSync}from"node:fs";appendFileSync(' +
      JSON.stringify(join(directory, 'nx-validator-called')) +
      ',"validator\\n");process.stdout.write("Nx caller lint\\n");process.exitCode=37;',
  );
  roots.push(fixture.root);
  const installedEntrypoint = writeRoot(fixture.installedDirectory);
  const environment = {
    PATH: '/usr/bin:/bin',
    TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
    TOOL_WIKI_REQUIRE_CERTIFIED: '0',
    TMPDIR: fixture.scratch,
  };
  const healthy = invoke(
    installedEntrypoint,
    ['burokrat', 'lint', 'working', fixture.candidate, 'HEAD'],
    fixture.candidate,
    environment,
  );
  expect(healthy.exitCode, healthy.stderr.toString()).toBe(37);
  expect(healthy.stdout.toString()).toBe('Nx caller lint\n');
  expect(healthy.stderr.length).toBe(0);
  const validatorMarker = join(fixture.root, 'nx-validator-called');
  expect(readFileSync(validatorMarker, 'utf8')).toBe('validator\n');
  rmSync(validatorMarker);

  const configured = JSON.parse(
    readFileSync(fileURLToPath(new URL('../project.json', import.meta.url)), 'utf8'),
  ) as { targets: { lint: { cache: boolean; inputs: string[]; options: { command: string } } } };
  expect(configured.targets.lint.cache).toBe(false);
  expect(configured.targets.lint.inputs).toEqual(['{workspaceRoot}/**/*']);
  const words = configured.targets.lint.options.command.trim().split(/\s+/u);
  expect(words.slice(-3)).toEqual(['working', '.', 'HEAD']);
  // This owner consumes this actual literal Nx vector; it is not a general shell parser.
  if (words.some((word) => /[\s'";|&`$<>]/u.test(word)))
    throw new Error('Nx lint fixture requires a supported literal command vector');
  const entry = words.findIndex((word) => word.startsWith('bin/'));
  if (entry < 1) throw new Error('Nx lint fixture requires its explicit repository entrypoint');
  const workspace = fileURLToPath(new URL('../../../../../', import.meta.url));
  const entrypoint = words[entry];
  words[entry] = join(workspace, entrypoint);

  const forbiddenMarker = join(fixture.root, 'forbidden-caller-runtime');
  const tools = join(fixture.root, 'caller-tools');
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, 'bun'));
  const refusal =
    createShebang() +
    '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
    JSON.stringify(forbiddenMarker) +
    ',process.argv[1]+"\\n");process.exitCode=64;';
  for (const name of ['bash', 'sh', 'node']) {
    const path = join(tools, name);
    writeFileSync(path, refusal);
    chmodSync(path, 0o755);
  }
  const called = Bun.spawnSync(words, {
    cwd: fixture.candidate,
    env: {
      ...environment,
      PATH: tools + ':/usr/bin:/bin',
      // Proposed explicit delivered-entrypoint input; the current Bash caller ignores it.
      PUNI_EXECUTABLE: installedEntrypoint,
    },
    stdin: Buffer.from('caller must not reparse stdin'),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(called.signalCode).toBeUndefined();
  expect(existsSync(forbiddenMarker)).toBe(false);
  expect(called.exitCode, called.stderr.toString()).toBe(37);
  expect(called.stdout.toString()).toBe('Nx caller lint\n');
  expect(called.stderr.length).toBe(0);
  expect(readFileSync(validatorMarker, 'utf8')).toBe('validator\n');
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('the delivered PUNI main export imports without ambient dispatch and retains real lint bytes and completion', () => {
  const fixture = createLint(
    'process.stdout.write(Buffer.from([0,255,65,10]));process.stderr.write(Buffer.from([0,254,66,10]));process.exitCode=37;',
  );
  const harness = join(fixture.root, 'installed-main-contract.mjs');
  const completionPath = join(fixture.root, 'installed-main-completion.json');
  const script =
    'import{writeFileSync}from"node:fs";import{dirname}from"node:path";import{tmpdir}from"node:os";import{pathToFileURL}from"node:url";' +
    'process.argv=[process.execPath,process.argv[1],"--version"];const entrypoint=' +
    JSON.stringify(fixture.entrypoint) +
    ';const directory=dirname(entrypoint);const environment={...process.env};const imported=await import(pathToFileURL(entrypoint).href);' +
    'const completion=await imported.main(["bur","lint","working",' +
    JSON.stringify(fixture.candidate) +
    ',"HEAD"],{installation:{directory,entrypoint},lookup:{directory,path:environment.PATH},callerDirectory:process.cwd(),' +
    'runtime:process.execPath,temporaryDirectory:tmpdir(),environment,stdout:(chunk)=>{process.stdout.write(chunk)},stderr:(chunk)=>{process.stderr.write(chunk)}});' +
    'writeFileSync(' +
    JSON.stringify(completionPath) +
    ',JSON.stringify(completion));if(completion.kind==="exit")process.exit(completion.status);process.exitCode=completion.status;';
  writeFileSync(harness, script);
  const child = Bun.spawnSync([...createLaunch(process.execPath, harness)], {
    cwd: fixture.candidate,
    env: {
      PATH: '/usr/bin:/bin',
      TOOL_WIKI_ACTIVATION_ROOT: fixture.archive,
      TMPDIR: fixture.scratch,
    },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode).toBe(37);
  expect(child.stdout).toEqual(Buffer.from([0, 255, 65, 10]));
  expect(child.stderr).toEqual(Buffer.from([0, 254, 66, 10]));
  expect(JSON.parse(readFileSync(completionPath, 'utf8'))).toEqual({ kind: 'exit', status: 37 });
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

for (const [name, moduleText, instruction] of [
  [
    'missing main',
    'export const unrelated=true;',
    'selected PUNI must export callable main; provision the reviewed current PUNI artifact',
  ],
  [
    'invalid kind',
    'export function main(){return {kind:"unknown",status:0}}',
    'selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact',
  ],
  [
    'invalid status',
    'export function main(){return {kind:"drain",status:256}}',
    'selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact',
  ],
] as const)
  it('the repository lint adapter refuses delivered ' + name, () => {
    const root = createRoot();
    const selected = join(root, 'invalid-puni.mjs');
    writeFileSync(selected, moduleText);
    const adapter = fileURLToPath(new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url));
    const child = Bun.spawnSync(
      [...createLaunch(process.execPath, adapter), 'working', '.', 'HEAD'],
      {
        cwd: root,
        env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 12000,
      },
    );
    expect(child.signalCode).toBeUndefined();
    expect(child.exitCode).toBe(1);
    expect(child.stdout.length).toBe(0);
    expect(child.stderr.toString()).toBe('tool-wiki lint: ' + instruction + '\n');
  });

for (const selected of [undefined, './puni.mjs'])
  it(
    'the repository lint adapter refuses a nonabsolute installation selection: ' + String(selected),
    () => {
      const root = createRoot();
      const adapter = fileURLToPath(
        new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url),
      );
      const child = Bun.spawnSync(
        [...createLaunch(process.execPath, adapter), 'working', '.', 'HEAD'],
        {
          cwd: root,
          env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 12000,
        },
      );
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(1);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toBe(
        'tool-wiki lint: set PUNI_EXECUTABLE to the absolute entrypoint of a separately provisioned reviewed current PUNI installation\n',
      );
    },
  );

it('the repository lint adapter captures operands and caller context before the delivered import changes globals', () => {
  const root = createRoot();
  const caller = join(root, 'caller');
  const changed = join(root, 'changed');
  mkdirSync(caller);
  mkdirSync(changed);
  const selected = join(root, 'capture-puni.mjs');
  const observation = join(root, 'caller-context.json');
  writeFileSync(
    selected,
    'import{writeFileSync}from"node:fs";await Promise.resolve();process.chdir(' +
      JSON.stringify(changed) +
      ');process.env.PATH="changed-path";process.env.PUNI_EXECUTABLE="changed-entry";process.argv.splice(2,99,"changed-operand");' +
      'export function main(args,context){writeFileSync(' +
      JSON.stringify(observation) +
      ',JSON.stringify({args,installation:context.installation,lookup:context.lookup,callerDirectory:context.callerDirectory,' +
      'runtime:context.runtime,temporaryDirectory:context.temporaryDirectory,environment:{PATH:context.environment.PATH,PUNI_EXECUTABLE:context.environment.PUNI_EXECUTABLE,TMPDIR:context.environment.TMPDIR}}));return {kind:"drain",status:37}}',
  );
  const adapter = fileURLToPath(new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url));
  const child = Bun.spawnSync([...createLaunch(process.execPath, adapter), 'staged', '.', 'HEAD'], {
    cwd: caller,
    env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected, TMPDIR: root },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  expect(child.signalCode).toBeUndefined();
  expect(child.exitCode, child.stderr.toString()).toBe(37);
  expect(child.stdout.length).toBe(0);
  expect(child.stderr.length).toBe(0);
  const captured = JSON.parse(readFileSync(observation, 'utf8')) as {
    args: string[];
    installation: { directory: string; entrypoint: string };
    lookup: { directory: string; path: string };
    callerDirectory: string;
    runtime: string;
    temporaryDirectory: string;
    environment: { PATH: string; PUNI_EXECUTABLE: string; TMPDIR: string };
  };
  expect(captured).toEqual({
    args: ['bur', 'lint', 'staged', '.', 'HEAD'],
    installation: { directory: root, entrypoint: selected },
    lookup: { directory: root, path: '/usr/bin:/bin' },
    callerDirectory: caller,
    runtime: process.execPath,
    temporaryDirectory: root,
    environment: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected, TMPDIR: root },
  });
});

for (const boundary of ['import', 'completion'] as const)
  it(
    'the repository lint adapter terminates a retained timer after delivered ' +
      boundary +
      ' failure',
    () => {
      const root = createRoot();
      const selected = join(root, 'retained-puni.mjs');
      const ready = join(root, 'retained-boundary-reached');
      const retention =
        'setInterval(()=>{},1000);writeFileSync(' + JSON.stringify(ready) + ',"ready");';
      writeFileSync(
        selected,
        'import{writeFileSync}from"node:fs";' +
          (boundary === 'import'
            ? retention + 'throw new Error("private-module-error");'
            : 'export function main(){' + retention + 'return {kind:"unknown",status:0}}'),
      );
      const adapter = fileURLToPath(
        new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url),
      );
      const child = Bun.spawnSync(
        [...createLaunch(process.execPath, adapter), 'working', '.', 'HEAD'],
        {
          cwd: root,
          env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 5000,
        },
      );
      expect(readFileSync(ready, 'utf8')).toBe('ready');
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(1);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toBe(
        boundary === 'import'
          ? 'tool-wiki lint: selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE\n'
          : 'tool-wiki lint: selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact\n',
      );
    },
  );

for (const boundary of ['missing', 'unreadable'] as const)
  it(
    'the repository lint adapter refuses a ' +
      boundary +
      ' selected file before its module executes',
    () => {
      const root = createRoot();
      const selected = join(root, 'unavailable-puni.mjs');
      const marker = join(root, 'unavailable-module-called');
      if (boundary === 'unreadable') {
        writeFileSync(
          selected,
          'import{writeFileSync}from"node:fs";writeFileSync(' +
            JSON.stringify(marker) +
            ',"unexpected");export function main(){return {kind:"drain",status:0}}',
        );
        chmodSync(selected, 0);
      }
      try {
        const adapter = fileURLToPath(
          new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url),
        );
        const child = Bun.spawnSync(
          [...createLaunch(process.execPath, adapter), 'working', '.', 'HEAD'],
          {
            cwd: root,
            env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected },
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 5000,
          },
        );
        expect(child.signalCode).toBeUndefined();
        expect(child.exitCode).toBe(1);
        expect(child.stdout.length).toBe(0);
        expect(child.stderr.toString()).toBe(
          'tool-wiki lint: selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE\n',
        );
        expect(existsSync(marker)).toBe(false);
      } finally {
        if (boundary === 'unreadable') chmodSync(selected, 0o600);
      }
    },
  );

for (const boundary of ['import', 'completion'] as const)
  it(
    'the repository lint adapter retains native diagnostic sinks when delivered ' +
      boundary +
      ' failure replaces Bun outputs',
    () => {
      const root = createRoot();
      const selected = join(root, 'replace-output-puni.mjs');
      const ready = join(root, 'output-replacement-ready');
      const replacement = join(root, 'replacement-writer-called');
      const poison =
        'import{appendFileSync,writeFileSync}from"node:fs";' +
        'const factory=(channel)=>({writer(){appendFileSync(' +
        JSON.stringify(replacement) +
        ',channel+" writer\\n");return {write(bytes){appendFileSync(' +
        JSON.stringify(replacement) +
        ',channel+" write "+Buffer.from(bytes).toString("hex")+"\\n");return bytes.byteLength},flush(){return 0},unref(){}}}});' +
        'const stdout=factory("stdout"),stderr=factory("stderr");Object.defineProperty(Bun,"stdout",{value:stdout});' +
        'Object.defineProperty(Bun,"stderr",{value:stderr});if(Bun.stdout!==stdout||Bun.stderr!==stderr)throw new Error("fixture output replacement failed");';
      const witness =
        'writeFileSync(' + JSON.stringify(ready) + ',"stdout/stderr actually replaced");';
      writeFileSync(
        selected,
        poison +
          (boundary === 'import'
            ? witness + 'throw new Error("private-import-failure");'
            : 'export function main(){' + witness + 'return {kind:"drain",status:256}}'),
      );
      const adapter = fileURLToPath(
        new URL('../../../../../bin/tool-wiki-lint.ts', import.meta.url),
      );
      const child = Bun.spawnSync(
        [...createLaunch(process.execPath, adapter), 'working', '.', 'HEAD'],
        {
          cwd: root,
          env: { PATH: '/usr/bin:/bin', PUNI_EXECUTABLE: selected },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 5000,
        },
      );
      expect(readFileSync(ready, 'utf8')).toBe('stdout/stderr actually replaced');
      expect(child.signalCode).toBeUndefined();
      expect(child.exitCode).toBe(1);
      const diagnostic =
        boundary === 'import'
          ? 'tool-wiki lint: selected installed PUNI could not complete; verify its reviewed provisioning and PUNI_EXECUTABLE\n'
          : 'tool-wiki lint: selected PUNI returned an invalid completion; provision the reviewed current PUNI artifact\n';
      expect({
        stdout: [...child.stdout],
        stderr: [...child.stderr],
        replacement: existsSync(replacement) ? readFileSync(replacement, 'utf8') : null,
      }).toEqual({ stdout: [], stderr: [...Buffer.from(diagnostic)], replacement: null });
    },
  );
