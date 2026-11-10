import * as synchronousFilesystem from 'node:fs';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import type { InstalledRequest } from '../cli-parser';
import { hashBytes } from '../evidence/content-manifest';
import { readLintRuntime } from '../lint-runtime';
import { prepareBunActivation, verifyActivation } from './activation';
import { buildLintLauncher } from './build-lint-launcher';
import { planBunToolkit } from './bun-release';
import { writeCandidateCheckRuns } from './check-run-fixtures';
import { prepareBunRelocation } from './prepare-bun-relocation';
import { PreparationFailure } from './prepare-bun-toolkit';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
  prepareBaseActivation,
} from './relocation-fixtures';
import { hashTrustedModules } from './trusted-modules';

it('returns prior relocation cancellation before reading absent candidate base and operator inputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni relocation '));
  const request: InstalledRequest<'prepare-relocation-activation'> = {
    command: 'prepare-relocation-activation',
    candidateRepository: join(root, 'absent'),
    candidateSha: 'a'.repeat(40),
    baseActivation: join(root, 'absent-base'),
    reviewRecord: join(root, 'absent-review'),
    destination: join(root, 'activation'),
    work: join(root, 'work'),
    candidatePolicy: undefined,
    candidateLauncher: undefined,
    validatorEntry: undefined,
    resourceLane: 'lane.fixture',
    cwdIdentity: 'cwd.fixture',
    checkRuns: join(root, 'absent-runs'),
  };
  try {
    expect(
      await prepareBunRelocation(request, {
        callerDirectory: root,
        toolkitDirectory: join(root, 'absent-toolkit'),
        expectedToolkitIdentity: 'b'.repeat(64),
        runtime: readLintRuntime('/usr/bin:/bin', root),
        launch: (entry) => createLaunch(process.execPath, entry),
        subscribeInterrupts: (listener) => {
          listener('SIGINT');
          return () => undefined;
        },
      }),
    ).toEqual({ kind: 'cancelled', status: 130, ownedDirectories: [], archive: undefined });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function commitCandidate(repository: string): string {
  for (const args of [
    ['add', '--all'],
    ['commit', '-m', 'current Bun relocation roles'],
    ['rev-parse', 'HEAD'],
  ]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    if (args[0] === 'rev-parse') return child.stdout.toString().trim();
  }
  throw new Error('candidate revision was not read');
}
async function createRelocationFixture(
  options: {
    readonly compiler?: boolean;
    readonly baseVersion?: 3 | 4;
    readonly certified?: boolean;
  } = {},
) {
  const fixture = createRelocationCandidate({ reproducible: true });
  const root = mkdtempSync(join(tmpdir(), 'puni Bun relocation '));
  roots.push(root);
  const historicalSentinel = join(root, 'historical.executed');
  writeFileSync(
    join(fixture.repository, 'bin/tool-wiki-lint.sh'),
    '#!/usr/bin/env bash\nprintf executed > ' + JSON.stringify(historicalSentinel) + '\nexit 79\n',
  );
  let base = prepareBaseActivation(fixture);
  if (options.baseVersion === 4) {
    const previous = verifyActivation(base.directory);
    const launcher = join(root, 'historical.mjs');
    writeFileSync(launcher, 'throw new Error("historical Bun launcher must not run");');
    const roleSources = {
      ...Object.fromEntries(
        Object.entries(previous.manifest.roles).map(([role, path]) => [
          role,
          join(base.directory, path),
        ]),
      ),
      launcher,
    };
    // Object.fromEntries loses the fixed manifest keys at this test fixture boundary.
    const prepared = prepareBunActivation({
      candidateRepository: fixture.repository,
      destination: join(root, 'base4'),
      sourceRevision: previous.manifest.sourceRevision,
      policyIdentity: previous.manifest.policyIdentity,
      mappingIdentity: previous.manifest.mappingIdentity,
      validatorIdentity: previous.manifest.validatorIdentity,
      reviewReceiptIdentity: previous.manifest.reviewReceiptIdentity,
      roleSources: roleSources as Record<keyof typeof previous.manifest.roles, string>,
    });
    base = { root, directory: prepared.directory };
  }
  // The actual current launcher and snapshotter execute a controlled certificate peer. This
  // checks relocation orchestration and lineage isolation, not semantic validator coverage.
  writeFileSync(join(fixture.repository, 'src/new/launcher.ts'), await buildLintLauncher());
  writeFileSync(
    join(fixture.repository, 'src/new/policy/snapshot-validator.ts'),
    readFileSync(join(import.meta.dir, 'snapshot-validator.ts')),
  );
  writeFileSync(
    join(fixture.repository, 'src/new/cli.ts'),
    (options.compiler === true ? 'import ts from "typescript";' : '') +
      'process.stdout.write(JSON.stringify({schemaVersion:1,mode:"enforce",trustProvenance:"ci-preselected",accepted:true,certified:' +
      JSON.stringify(options.certified !== false) +
      ',source:"current-candidate"' +
      (options.compiler === true ? ',compiler:ts.version' : '') +
      '}));',
  );
  const revision = commitCandidate(fixture.repository);
  const toolkit = join(root, 'toolkit'),
    closure = join(toolkit, 'trusted-node-modules'),
    runtime = join(root, 'runtime');
  mkdirSync(closure, { recursive: true });
  mkdirSync(runtime);
  const workspace = resolve(import.meta.dir, '../../../../../..');
  cpSync(join(workspace, 'node_modules/typescript'), join(closure, 'typescript'), {
    recursive: true,
  });
  mkdirSync(join(closure, '@typescript'));
  cpSync(join(workspace, 'node_modules/@typescript/old'), join(closure, '@typescript/old'), {
    recursive: true,
  });
  for (const name of ['source-map-support', 'source-map', 'buffer-from'])
    cpSync(join(workspace, 'node_modules', name), join(closure, name), { recursive: true });
  const roleBytes = {
    'launcher.mjs': Buffer.from('throw new Error("toolkit launcher must not run");'),
    'snapshotter.ts': Buffer.from('throw new Error("toolkit snapshotter must not run");'),
    'validator.mjs': Buffer.from('throw new Error("toolkit validator must not run");'),
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [name, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, name), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: [
      'typescript',
      '@typescript/old',
      'source-map-support',
      'source-map',
      'buffer-from',
    ],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const review = join(root, 'review.json'),
    checkRuns = join(root, 'check-runs');
  writeFileSync(
    review,
    JSON.stringify(
      auditReview(
        'review.fixture.module',
        revision,
        candidateIdentityAt(fixture.repository, revision),
      ),
    ),
  );
  writeCandidateCheckRuns(checkRuns, {
    repository: fixture.repository,
    revision,
    policyPath: 'docs/wiki-policy/policy.json',
  });
  const request: InstalledRequest<'prepare-relocation-activation'> = {
    command: 'prepare-relocation-activation',
    candidateRepository: fixture.repository,
    candidateSha: revision,
    baseActivation: base.directory,
    reviewRecord: review,
    candidatePolicy: 'docs/wiki-policy/policy.json',
    candidateLauncher: 'src/new/launcher.ts',
    validatorEntry: 'src/new/cli.ts',
    checkRuns,
    destination: join(root, 'activation'),
    work: join(root, 'work'),
    resourceLane: 'lane.relocation-fixture',
    cwdIdentity: 'cwd.relocation-fixture',
  };
  const listeners = new Set<(signal: 'SIGINT' | 'SIGTERM') => void>();
  let first: 'SIGINT' | 'SIGTERM' | undefined;
  const interrupt = (signal: 'SIGINT' | 'SIGTERM') => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const context = {
    callerDirectory: root,
    toolkitDirectory: toolkit,
    expectedToolkitIdentity: hashBytes(plan.descriptor),
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    launch: (entry: string) => createLaunch(process.execPath, entry),
    subscribeInterrupts: (listener: (signal: 'SIGINT' | 'SIGTERM') => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    root,
    fixture,
    base,
    request,
    context,
    historicalSentinel,
    revision,
    interrupt,
    listeners,
  };
}

it('builds and certifies candidate Bun relocation without executing historical or toolkit roles', async () => {
  const fixture = await createRelocationFixture();
  const prepared = await prepareBunRelocation(fixture.request, fixture.context).catch(
    (cause: unknown) => {
      if (cause instanceof PreparationFailure) throw cause.cause;
      throw cause;
    },
  );
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected relocation cancellation');
  const activation = verifyActivation(prepared.versionDirectory);
  expect(activation.manifest.schemaVersion).toBe(4);
  expect(activation.manifest.sourceRevision).toBe(fixture.revision);
  expect(JSON.parse(Buffer.from(prepared.report).toString())).toMatchObject({
    certified: true,
    source: 'current-candidate',
  });
  expect(existsSync(fixture.historicalSentinel)).toBe(false);
  expect(prepared.archive.digest).toBe(hashBytes(readFileSync(prepared.archive.path)));
  const archive = Bun.spawnSync(['tar', '--list', '--file', prepared.archive.path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(archive.exitCode, archive.stderr.toString()).toBe(0);
  expect(archive.stdout.toString()).toContain('./bootstrap-launcher.mjs');
  expect(archive.stdout.toString()).not.toContain('launcher.sh');
}, 60000);

it('relocates a verified current Bun base using fresh candidate roles', async () => {
  const fixture = await createRelocationFixture({ baseVersion: 4 });
  const prepared = await prepareBunRelocation(fixture.request, fixture.context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected cancellation');
  expect(verifyActivation(prepared.versionDirectory).manifest.sourceRevision).toBe(
    fixture.revision,
  );
  expect(JSON.parse(Buffer.from(prepared.report).toString())).toMatchObject({
    certified: true,
    source: 'current-candidate',
  });
  expect(existsSync(fixture.historicalSentinel)).toBe(false);
}, 60000);

it('delivers the prepared compiler license and modification notice inside the relocation archive', async () => {
  const fixture = await createRelocationFixture({ compiler: true });
  const prepared = await prepareBunRelocation(fixture.request, fixture.context).catch(
    (cause: unknown) => {
      if (cause instanceof PreparationFailure) throw cause.cause;
      throw cause;
    },
  );
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected cancellation');
  expect(JSON.parse(Buffer.from(prepared.report).toString())).toMatchObject({
    certified: true,
    compiler: '6.0.3',
  });
  for (const path of [
    'licenses/typescript-preparation/LICENSE.txt',
    'licenses/typescript-preparation/NOTICE',
  ]) {
    const written = readFileSync(join(fixture.request.destination, path));
    const archived = Bun.spawnSync(
      ['tar', '--extract', '--to-stdout', '--file', prepared.archive.path, './' + path],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(archived.exitCode, archived.stderr.toString()).toBe(0);
    expect(archived.stdout).toEqual(written);
    if (path.endsWith('NOTICE')) expect(written.toString()).toContain('PUNI');
    else
      expect(hashBytes(written)).toBe(
        'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47',
      );
  }
}, 60000);

it('retains relocation outputs and refuses archive creation without a full certificate', async () => {
  const fixture = await createRelocationFixture({ certified: false });
  const cause: unknown = await prepareBunRelocation(fixture.request, fixture.context).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('missing preparation failure');
  expect(cause.ownedDirectories).toEqual([fixture.request.work, fixture.request.destination]);
  expect(cause.archive).toBeUndefined();
  expect(String(cause.cause)).toContain('prepared activation is not certified');
  expect(existsSync(fixture.request.work)).toBe(true);
  expect(existsSync(fixture.request.destination)).toBe(true);
}, 60000);

for (const stage of ['work', 'destination'] as const) {
  it(
    'retains relocation roots and stops after interrupted ' + stage + ' reservation',
    async () => {
      const fixture = await createRelocationFixture();
      const target = stage === 'work' ? fixture.request.work : fixture.request.destination;
      const original = filesystem.mkdir.bind(filesystem);
      // Preserve native mkdir overloads and inject only after the real directory exists.
      const inject = (async (...args: Parameters<typeof filesystem.mkdir>): Promise<unknown> => {
        const directory: unknown = await Reflect.apply(original, undefined, args);
        if (args[0] === target) fixture.interrupt('SIGINT');
        return directory;
      }) as typeof filesystem.mkdir;
      const mkdir = spyOn(filesystem, 'mkdir').mockImplementation(inject);
      try {
        const prepared = await prepareBunRelocation(fixture.request, fixture.context);
        expect(prepared.kind).toBe('cancelled');
        if (prepared.kind !== 'cancelled') throw new Error('expected relocation cancellation');
        expect(prepared.status).toBe(130);
        expect(prepared.ownedDirectories).toEqual(
          stage === 'work'
            ? [fixture.request.work]
            : [fixture.request.work, fixture.request.destination],
        );
        expect(prepared.archive).toBeUndefined();
        expect(
          existsSync(
            stage === 'work'
              ? join(fixture.request.work, 'candidate-source')
              : join(fixture.request.destination, 'selected.json'),
          ),
        ).toBe(false);
        expect(fixture.listeners.size).toBe(0);
      } finally {
        mkdir.mockRestore();
      }
    },
    60000,
  );
}

it('retains materialized relocation source and stops after interrupted role build', async () => {
  const fixture = await createRelocationFixture();
  const original = Bun.build.bind(Bun);
  let calls = 0;
  const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
    const built = await original(options);
    if (++calls === 1) fixture.interrupt('SIGTERM');
    return built;
  });
  try {
    const prepared = await prepareBunRelocation(fixture.request, fixture.context);
    expect(prepared.kind).toBe('cancelled');
    if (prepared.kind !== 'cancelled') throw new Error('expected build cancellation');
    expect(prepared.status).toBe(143);
    expect(prepared.ownedDirectories).toEqual([fixture.request.work]);
    expect(prepared.archive).toBeUndefined();
    expect(existsSync(join(fixture.request.work, 'candidate-source/src/new/cli.ts'))).toBe(true);
    expect(existsSync(fixture.request.destination)).toBe(false);
    expect(calls).toBe(1);
    expect(fixture.listeners.size).toBe(0);
  } finally {
    build.mockRestore();
  }
}, 60000);

it('preserves relocation subscription release failure after prior cancellation', async () => {
  const fixture = await createRelocationFixture();
  const release = new Error('injected relocation release failure');
  const cause: unknown = await prepareBunRelocation(fixture.request, {
    ...fixture.context,
    subscribeInterrupts: (listener) => {
      listener('SIGINT');
      return () => {
        throw release;
      };
    },
  }).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('missing release failure');
  expect(cause.cause).toBe(release);
  expect(cause.ownedDirectories).toEqual([]);
  expect(cause.archive).toBeUndefined();
}, 60000);

it('preserves relocation input and release failures together ahead of interruption', async () => {
  const fixture = await createRelocationFixture();
  const release = new Error('injected relocation release failure');
  const cause: unknown = await prepareBunRelocation(
    { ...fixture.request, reviewRecord: join(fixture.root, 'absent-review') },
    {
      ...fixture.context,
      subscribeInterrupts: (listener) => {
        return () => {
          listener('SIGINT');
          throw release;
        };
      },
    },
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('missing preparation failure');
  expect(cause.cause).toBeInstanceOf(AggregateError);
  if (!(cause.cause instanceof AggregateError)) throw new Error('missing combined failure');
  expect(String(cause.cause.errors[0])).toContain('ENOENT');
  expect(cause.cause.errors[1]).toBe(release);
  expect(cause.cause.cause).toBe(release);
}, 60000);

it('refuses written compiler notice drift before certification and archive reservation', async () => {
  const fixture = await createRelocationFixture({ compiler: true });
  const original = synchronousFilesystem.writeFileSync.bind(synchronousFilesystem);
  const target = join(fixture.request.destination, 'licenses/typescript-preparation/NOTICE');
  let injected = false;
  const inject = ((...args: Parameters<typeof synchronousFilesystem.writeFileSync>): void => {
    if (args[0] === target) {
      injected = true;
      original(args[0], 'changed preparation notice', args[2]);
    } else Reflect.apply(original, undefined, args);
  }) as typeof synchronousFilesystem.writeFileSync;
  const write = spyOn(synchronousFilesystem, 'writeFileSync').mockImplementation(inject);
  try {
    const cause: unknown = await prepareBunRelocation(fixture.request, fixture.context).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(injected).toBe(true);
    expect(cause).toBeInstanceOf(PreparationFailure);
    if (!(cause instanceof PreparationFailure)) throw new Error('missing notice refusal');
    expect(String(cause.cause)).toContain(
      'written preparation notice differs: licenses/typescript-preparation/NOTICE',
    );
    expect(cause.ownedDirectories).toEqual([fixture.request.work, fixture.request.destination]);
    expect(cause.archive).toBeUndefined();
    expect(fixture.listeners.size).toBe(0);
  } finally {
    write.mockRestore();
  }
}, 60000);

it('honors first relocation cancellation during outer release after archive settlement', async () => {
  const fixture = await createRelocationFixture();
  const original = fixture.context.subscribeInterrupts;
  let subscriptions = 0;
  const prepared = await prepareBunRelocation(fixture.request, {
    ...fixture.context,
    subscribeInterrupts: (listener) => {
      const outer = ++subscriptions === 1,
        unsubscribe = original(listener);
      return () => {
        unsubscribe();
        if (outer) {
          listener('SIGINT');
          listener('SIGTERM');
        }
      };
    },
  });
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled') throw new Error('expected terminal relocation cancellation');
  expect(prepared.status).toBe(130);
  expect(prepared.ownedDirectories).toEqual([fixture.request.work, fixture.request.destination]);
  expect(prepared.archive).toBeString();
  if (prepared.archive === undefined) throw new Error('completed archive ownership lost');
  expect(existsSync(prepared.archive)).toBe(true);
  expect(fixture.listeners.size).toBe(0);
}, 60000);

for (const fault of ['status', 'utf8', 'grammar', 'path'] as const) {
  it(
    'refuses invalid selected relocation ' + fault + ' authority before output reservation',
    async () => {
      const fixture = await createRelocationFixture(),
        modulePath = join(
          import.meta.dir,
          fault === 'path' ? 'preparation-source.ts' : 'preparation-git.ts',
        ),
        symbol = fault === 'path' ? 'readPreparationSource' : 'runPreparationGit';
      const script = join(fixture.root, 'authority.mjs');
      const injection =
        fault === 'path'
          ? 'const ready=await original(...argv);if(ready.kind==="ready")delete ready.runtime.environment.PATH;return ready;'
          : 'if(argv[0][0]==="show")return{kind:"exited",status:' +
            (fault === 'status' ? '37' : '0') +
            ',stdout:Uint8Array.from(' +
            JSON.stringify(
              fault === 'utf8'
                ? [255, 10]
                : [...Buffer.from(fault === 'grammar' ? 'not-an-epoch\n' : '12345\n')],
            ) +
            '),stderr:Buffer.from("epoch refusal sentinel")};return await original(...argv);';
      writeFileSync(
        script,
        'import{mock}from"bun:test";import{createLaunch}from ' +
          JSON.stringify(
            resolve(
              import.meta.dir,
              '../../../../../../libs/shared/adapters/bun-startup/src/index.ts',
            ),
          ) +
          ';const selected=await import(' +
          JSON.stringify(modulePath) +
          ');const original=selected[' +
          JSON.stringify(symbol) +
          '];mock.module(' +
          JSON.stringify(modulePath) +
          ',()=>({...selected,[' +
          JSON.stringify(symbol) +
          ']:async(...argv)=>{' +
          injection +
          '}}));const{prepareBunRelocation}=await import(' +
          JSON.stringify(join(import.meta.dir, 'prepare-bun-relocation.ts')) +
          ');const request=' +
          JSON.stringify(fixture.request) +
          ';const context=' +
          JSON.stringify({
            callerDirectory: fixture.context.callerDirectory,
            toolkitDirectory: fixture.context.toolkitDirectory,
            expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
            runtime: fixture.context.runtime,
          }) +
          ';try{const prepared=await prepareBunRelocation(request,{...context,subscribeInterrupts:()=>()=>{},launch:(entry)=>createLaunch(process.execPath,entry)});process.stdout.write(JSON.stringify({kind:"unexpected-success",prepared}));}catch(cause){process.stdout.write(JSON.stringify({name:cause.name,message:String(cause.cause),causeName:cause.cause?.name,owned:cause.ownedDirectories}));}',
      );
      const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', script], {
        cwd: fixture.root,
        env: { PATH: '/usr/bin:/bin' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      let hasTimedOut = false;
      const timer = setTimeout(() => {
        hasTimedOut = true;
        child.kill('SIGKILL');
      }, 5000);
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      expect(hasTimedOut).toBe(false);
      expect(status, stderr).toBe(0);
      const refusal = JSON.parse(stdout) as {
        name: string;
        message: string;
        causeName: string;
        owned: string[];
      };
      expect(refusal.name).toBe('PreparationFailure');
      expect(refusal.owned).toEqual([]);
      if (fault === 'status')
        expect(refusal.message).toContain(
          'cannot read candidate committer time: epoch refusal sentinel',
        );
      else if (fault === 'utf8') expect(refusal.causeName).toBe('TypeError');
      else if (fault === 'grammar')
        expect(refusal.message).toContain('candidate committer time is malformed');
      else expect(refusal.message).toContain('trusted preparation PATH is absent');
    },
    10000,
  );
}

it('captures request and runtime authority before the first broker callback can mutate aliases', async () => {
  const fixture = await createRelocationFixture(),
    request = { ...fixture.request },
    context = {
      ...fixture.context,
      runtime: {
        ...fixture.context.runtime,
        environment: { ...fixture.context.runtime.environment },
      },
    };
  const expectedDestination = request.destination,
    subscribe = context.subscribeInterrupts;
  let hasMutated = false;
  context.subscribeInterrupts = (listener) => {
    if (!hasMutated) {
      hasMutated = true;
      request.destination = join(fixture.root, 'wrong-output');
      request.candidateSha = 'f'.repeat(40);
      context.runtime.environment['PATH'] = '/absent/mutated';
    }
    return subscribe(listener);
  };
  const prepared = await prepareBunRelocation(request, context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected captured-request cancellation');
  expect(prepared.versionDirectory.startsWith(expectedDestination + '/')).toBe(true);
  expect(existsSync(request.destination)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('captures relocation review bytes before source-selection subscriptions mutate their files', async () => {
  const fixture = await createRelocationFixture(),
    subscribe = fixture.context.subscribeInterrupts;
  let count = 0;
  fixture.context.subscribeInterrupts = (listener) => {
    count++;
    if (count === 2) {
      writeFileSync(fixture.request.reviewRecord, '{}');
    }
    return subscribe(listener);
  };
  expect((await prepareBunRelocation(fixture.request, fixture.context)).kind).toBe('prepared');
  expect(count).toBeGreaterThan(2);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

for (const stage of [
  'source',
  'capture',
  'reviewed capture',
  'epoch',
  'materialization',
  'build',
] as const) {
  it(
    'refuses relocation ' + stage + ' dependency cancellation without the owning broker',
    async () => {
      const fixture = await createRelocationFixture();
      const dependency = {
        source: {
          file: 'preparation-source.ts',
          symbol: 'readPreparationSource',
          condition: 'true',
        },
        capture: {
          file: 'committed-source.ts',
          symbol: 'captureCommittedSource',
          condition: 'count===1',
        },
        'reviewed capture': {
          file: 'committed-source.ts',
          symbol: 'captureCommittedSource',
          condition: 'count===2',
        },
        epoch: {
          file: 'preparation-git.ts',
          symbol: 'runPreparationGit',
          condition: 'argv[0][0]==="show"',
        },
        materialization: {
          file: 'materialized-source.ts',
          symbol: 'materializeSource',
          condition: 'true',
        },
        build: { file: 'preparation-roles.ts', symbol: 'buildPreparationRoles', condition: 'true' },
      }[stage];
      const modulePath = join(import.meta.dir, dependency.file),
        script = join(fixture.root, 'dependency.mjs');
      const program =
        'import{mock}from"bun:test";import{createLaunch}from ' +
        JSON.stringify(
          resolve(
            import.meta.dir,
            '../../../../../../libs/shared/adapters/bun-startup/src/index.ts',
          ),
        ) +
        ';const selected=await import(' +
        JSON.stringify(modulePath) +
        ');const original=selected[' +
        JSON.stringify(dependency.symbol) +
        '];let count=0;mock.module(' +
        JSON.stringify(modulePath) +
        ',()=>({...selected,[' +
        JSON.stringify(dependency.symbol) +
        ']:async(...argv)=>{count++;if(' +
        dependency.condition +
        ')return{kind:"cancelled",status:130,signal:"SIGINT",stdout:new Uint8Array(),report:{kind:"prefix",bytes:new Uint8Array()},diagnostics:{kind:"prefix",bytes:new Uint8Array()}};return await original(...argv);}}));const{prepareBunRelocation}=await import(' +
        JSON.stringify(join(import.meta.dir, 'prepare-bun-relocation.ts')) +
        ');const request=' +
        JSON.stringify(fixture.request) +
        ';const context=' +
        JSON.stringify({
          callerDirectory: fixture.context.callerDirectory,
          toolkitDirectory: fixture.context.toolkitDirectory,
          expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
          runtime: fixture.context.runtime,
        }) +
        ';try{const prepared=await prepareBunRelocation(request,{...context,subscribeInterrupts:()=>()=>{},launch:(entry)=>createLaunch(process.execPath,entry)});process.stdout.write(JSON.stringify({kind:"unexpected-success",prepared}));}catch(cause){process.stdout.write(JSON.stringify({name:cause.name,message:String(cause.cause)}));}';
      writeFileSync(script, program);
      const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', script], {
        cwd: fixture.root,
        env: { PATH: '/usr/bin:/bin' },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      let hasTimedOut = false;
      const timer = setTimeout(() => {
        hasTimedOut = true;
        child.kill('SIGKILL');
      }, 5000);
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      expect(hasTimedOut).toBe(false);
      expect(status, stderr).toBe(0);
      const refusal = JSON.parse(stdout) as { name: string; message: string };
      expect(refusal.name).toBe('PreparationFailure');
      expect(refusal.message).toContain(
        'relocation ' + stage + ' cancellation missing from preparation broker',
      );
    },
    10000,
  );
}
