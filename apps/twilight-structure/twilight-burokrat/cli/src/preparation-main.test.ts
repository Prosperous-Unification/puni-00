import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch, createShebang } from '@shared/bun-startup';
import { afterAll, beforeAll, expect, it } from 'bun:test';

import { verifyActivation } from './policy/activation';
import { disposeRelocationFixtures } from './policy/relocation-fixtures';
import { createRelocationFixture, createToolkitFixture } from './testing/preparation-fixtures';
import { runExitSupervisor } from './testing/unconfirmed-lint-exit';

const roots: string[] = [];
let root: string;
const entries = new Map<string, string>();
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'puni preparation executable '));
  roots.push(root);
  for (const [command, file] of [
    ['prepare-activation', 'prepare-activation-entry.ts'],
    ['prepare-relocation-activation', 'prepare-relocation-entry.ts'],
  ]) {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, 'policy', file)],
      target: 'bun',
      format: 'esm',
      define: { __PUNI_PREPARATION_BUN_VERSION__: JSON.stringify(Bun.version) },
    });
    if (!built.success || built.outputs.length !== 1)
      throw new Error(
        'cannot build actual preparation entry: ' + built.logs.map(String).join('; '),
      );
    const path = join(root, command + '.mjs');
    writeFileSync(path, await built.outputs[0].text());
    entries.set(command, path);
  }
});
afterAll(() => {
  disposeRelocationFixtures();
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
function invoke(
  command: string,
  args: string[],
  bytes: Uint8Array,
  environment: Record<string, string> = { PATH: '/usr/bin:/bin' },
) {
  const entry = entries.get(command);
  if (entry === undefined) throw new Error('preparation executable fixture missing');
  return Bun.spawnSync([...createLaunch(process.execPath, entry), ...args], {
    cwd: root,
    env: environment,
    stdin: bytes,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

for (const command of ['prepare-activation', 'prepare-relocation-activation']) {
  for (const args of [[], ['--puni-preparation-v1', 'extra'], ['--unknown']]) {
    it('actual ' + command + ' refuses argv ' + JSON.stringify(args) + ' before input IO', () => {
      const child = invoke(command, args, Buffer.from('not JSON'));
      expect(child.exitCode, child.stderr.toString()).toBe(64);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toContain('expected --puni-preparation-v1');
      expect(child.stderr.toString()).not.toContain('    at ');
    });
  }
  it('actual ' + command + ' rejects malformed byte transport without source secrets', () => {
    const child = invoke(
      command,
      ['--puni-preparation-v1'],
      Buffer.from('{"secret":"source-secret-canary"}'),
    );
    expect(child.exitCode, child.stderr.toString()).toBe(64);
    expect(child.stderr.toString()).toContain('invalid installed preparation request');
    expect(child.stderr.toString()).not.toContain('source-secret-canary');
  });
}

it('contains a missing standalone preparation PATH inside the bounded native reporter', () => {
  const request = {
    version: 1,
    callerDirectory: root,
    toolkitDirectory: join(root, 'absent-toolkit'),
    expectedToolkitIdentity: 'b'.repeat(64),
    request: {
      command: 'prepare-relocation-activation',
      candidateRepository: join(root, 'absent-candidate'),
      candidateSha: 'a'.repeat(40),
      baseActivation: join(root, 'absent-base'),
      reviewRecord: join(root, 'absent-review'),
      destination: join(root, 'destination'),
      work: join(root, 'work'),
      resourceLane: 'lane.fixture',
      cwdIdentity: 'cwd.fixture',
      checkRuns: join(root, 'absent-runs'),
    },
  };
  const child = invoke(
    'prepare-relocation-activation',
    ['--puni-preparation-v1'],
    Buffer.from(JSON.stringify(request)),
    {},
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toContain('puni preparation:');
  expect(child.stderr.toString()).toContain('preparation requires an explicit PATH');
  expect(child.stderr.toString()).not.toContain('ENOENT');
  expect(existsSync(request.request.work)).toBe(false);
});

it('cancels preparation acquisition while stdin stays open and terminally exits', async () => {
  const marker = join(root, 'stdin.ready'),
    source = join(root, 'stdin-wrapper.ts');
  writeFileSync(
    source,
    'import{writeFileSync}from"node:fs";import{runPreparationExecutable}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-main.ts')) +
      ';const original=Bun.stdin.stream.bind(Bun.stdin);Bun.stdin.stream=()=>{writeFileSync(' +
      JSON.stringify(marker) +
      ',"ready");return original();};process.exit(await runPreparationExecutable("prepare-activation",["--puni-preparation-v1"],{directory:' +
      JSON.stringify(root) +
      ',runtime:process.execPath}));',
  );
  const built = await Bun.build({
    entrypoints: [source],
    target: 'bun',
    format: 'esm',
    define: { __PUNI_PREPARATION_BUN_VERSION__: JSON.stringify(Bun.version) },
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('cannot build preparation stdin wrapper');
  const executable = join(root, 'stdin-wrapper.mjs');
  writeFileSync(executable, await built.outputs[0].text());
  const child = Bun.spawn([...createLaunch(process.execPath, executable)], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text(),
    stderr = new Response(child.stderr).text();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 5000);
  try {
    for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt++) await Bun.sleep(10);
    expect(existsSync(marker)).toBe(true);
    child.kill('SIGINT');
    expect(await child.exited, await stderr).toBe(130);
    expect(timedOut).toBe(false);
    expect(await stdout).toBe('');
  } finally {
    clearTimeout(timer);
    await child.stdin.end();
    child.kill('SIGKILL');
    await child.exited;
  }
}, 15000);

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it(
    'actual ' + command + ' prepares and archives through the typed native entry',
    async () => {
      const fixture =
        command === 'prepare-activation'
          ? await createToolkitFixture(roots)
          : await createRelocationFixture(roots);
      const transport = Buffer.from(
        JSON.stringify({
          version: 1,
          callerDirectory: fixture.context.callerDirectory,
          toolkitDirectory: fixture.context.toolkitDirectory,
          expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
          request: fixture.request,
        }),
      );
      const child = invoke(command, ['--puni-preparation-v1'], transport);
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(child.stdout.toString()).toContain(fixture.revision);
      expect(child.stderr.length).toBe(0);
      expect(
        verifyActivation(join(fixture.request.destination, 'activation-' + fixture.revision))
          .manifest.schemaVersion,
      ).toBe(4);
      expect(
        existsSync(
          join(fixture.request.work, 'puni-activation-' + fixture.revision.slice(0, 8) + '.tar'),
        ),
      ).toBe(true);
    },
    60000,
  );
}

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it.skipIf(process.platform !== 'linux' || process.arch !== 'x64')(
    'actual ' + command + ' exits after unconfirmed Git cleanup before fixture reaping',
    async () => {
      const fixture =
        command === 'prepare-activation'
          ? await createToolkitFixture(roots)
          : await createRelocationFixture(roots);
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
      const entry = entries.get(command);
      if (entry === undefined) throw new Error('actual relocation entry missing');
      const instrument =
        'const fixtureFs=await import("node:fs");const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(pid<0&&fixtureFs.existsSync(' +
        JSON.stringify(stagePath) +
        ')&&-pid===Number(fixtureFs.readFileSync(' +
        JSON.stringify(stagePath) +
        ',"utf8")))return true;return nativeKill(pid,signal);};const fixtureSpawn=Bun.spawn.bind(Bun);Bun.spawn=(argv,options)=>{const owned=fixtureSpawn(argv,options);if(Array.isArray(argv)&&argv[0]==="git")fixtureFs.writeFileSync(' +
        JSON.stringify(bornPath) +
        ',String(owned.pid));return owned;};\n';
      const executable = join(fixture.root, 'unconfirmed-preparation.mjs');
      writeFileSync(executable, instrument + readFileSync(entry, 'utf8'));
      const transport = JSON.stringify({
        version: 1,
        callerDirectory: fixture.context.callerDirectory,
        toolkitDirectory: fixture.context.toolkitDirectory,
        expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
        request: fixture.request,
      });
      const observed = await runExitSupervisor(
        {
          entrypoint: executable,
          candidate: fixture.fixture.repository,
          scratch,
          stagePath,
          bornPath,
          args: ['--puni-preparation-v1'],
          environment: { PATH: bin + ':/usr/bin:/bin' },
          input: transport,
        },
        fixture.root,
      );
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

for (const pin of [undefined, '0.0.0']) {
  it(
    'actual preparation refuses ' +
      (pin === undefined ? 'absent' : 'different') +
      ' build runtime pin before request input',
    async () => {
      const built = await Bun.build({
        entrypoints: [join(import.meta.dir, 'policy/prepare-activation-entry.ts')],
        target: 'bun',
        format: 'esm',
        ...(pin === undefined
          ? {}
          : { define: { __PUNI_PREPARATION_BUN_VERSION__: JSON.stringify(pin) } }),
      });
      if (!built.success || built.outputs.length !== 1)
        throw new Error('cannot build pin-negative preparation fixture');
      const artifact = built.outputs.at(0);
      if (artifact === undefined) throw new Error('preparation pin fixture output missing');
      const entry = join(root, pin === undefined ? 'missing-pin.mjs' : 'wrong-pin.mjs');
      writeFileSync(entry, await artifact.text());
      const child = Bun.spawnSync(
        [...createLaunch(process.execPath, entry), '--puni-preparation-v1'],
        {
          cwd: root,
          env: { PATH: '/usr/bin:/bin' },
          stdin: Buffer.from('request-secret-canary'),
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 5000,
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(1);
      expect(child.stdout.length).toBe(0);
      expect(child.stderr.toString()).toContain(
        pin === undefined
          ? 'preparation executable has no build runtime pin'
          : 'preparation executable was built with another Bun',
      );
      expect(child.stderr.toString()).not.toContain('request-secret-canary');
      expect(child.stderr.toString()).not.toContain('    at ');
    },
  );
}
