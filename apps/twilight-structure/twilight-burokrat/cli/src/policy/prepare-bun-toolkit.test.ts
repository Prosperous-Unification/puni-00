import * as synchronousFilesystem from 'node:fs';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import type { InstalledRequest } from '../cli-parser';
import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { lintControl } from '../lint-parent-control';
import { readLintRuntime } from '../lint-runtime';
import { verifyActivation } from './activation';
import { buildLintLauncher } from './build-lint-launcher';
import { planBunToolkit } from './bun-release';
import { writeCandidateCheckRuns } from './check-run-fixtures';
import { PreparationFailure, prepareBunToolkit } from './prepare-bun-toolkit';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
} from './relocation-fixtures';
import {
  buildValidatorBundle,
  copyTrustedModules,
  hashTrustedModules,
  trustedModuleNames,
} from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(
  report: unknown = {
    schemaVersion: 1,
    mode: 'enforce',
    trustProvenance: 'ci-preselected',
    accepted: true,
    certified: true,
  },
  waitForCancel = false,
) {
  const fixture = createRelocationCandidate({ reproducible: true });
  const root = mkdtempSync(join(tmpdir(), 'puni current preparer '));
  roots.push(root);
  const toolkit = join(root, 'toolkit'),
    runtime = join(root, 'runtime');
  mkdirSync(toolkit);
  mkdirSync(runtime);
  mkdirSync(join(toolkit, 'trusted-node-modules'));
  // This controlled peer proves preparer orchestration, not real validator certification.
  const launcher =
    'import{writeFileSync}from"node:fs";const c=' +
    JSON.stringify(lintControl) +
    ';let started=false;async function finish(status){await Bun.write(Bun.stdout,' +
    JSON.stringify(JSON.stringify(report)) +
    ');process.send(c.finished);process.disconnect();process.exitCode=status;}process.on("message",async m=>{if(m===c.start){await Bun.stdin.text();started=true;writeFileSync(' +
    JSON.stringify(join(root, 'peer.started')) +
    ',"ready");' +
    (waitForCancel ? '' : 'await finish(0);') +
    '}else if(m===c.SIGINT||m===c.SIGTERM){await finish(m===c.SIGINT?130:143);}});process.send(c.ready);';
  const roleBytes = {
    'launcher.mjs': Buffer.from(launcher),
    'snapshotter.ts': Buffer.from('export {};'),
    'validator.mjs': Buffer.from('export {};'),
    'prepare-activation.mjs': Buffer.from('export {};'),
    'prepare-relocation-activation.mjs': Buffer.from('export {};'),
  };
  for (const [name, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, name), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: [],
    trustedNodeModulesIdentity: hashTrustedModules(join(toolkit, 'trusted-node-modules')),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const strata = join(root, 'strata.json'),
    review = join(root, 'review.json'),
    checkRuns = join(root, 'check-runs');
  writeFileSync(
    strata,
    JSON.stringify({
      strata: [
        { stratumId: 'risk.public-admission', sampleRateBps: 10000, disagreementTriggerBps: 10000 },
      ],
      obligations: { 'review.fixture.module': 'risk.public-admission' },
    }),
  );
  writeFileSync(
    review,
    JSON.stringify(
      auditReview(
        'review.fixture.module',
        fixture.candidateRevision,
        candidateIdentityAt(fixture.repository, fixture.candidateRevision),
      ),
    ),
  );
  writeCandidateCheckRuns(checkRuns, {
    repository: fixture.repository,
    revision: fixture.candidateRevision,
    policyPath: 'docs/wiki-policy/policy.json',
  });
  const request: InstalledRequest<'prepare-activation'> = {
    command: 'prepare-activation',
    candidateRepository: fixture.repository,
    candidateSha: fixture.candidateRevision,
    toolkit,
    candidatePolicy: 'docs/wiki-policy/policy.json',
    candidateMapping: 'docs/wiki-policy/modules.json',
    reviewRecord: review,
    auditStrata: strata,
    destination: join(root, 'activation'),
    work: join(root, 'work'),
    resourceLane: 'lane.consumer-fixture',
    cwdIdentity: 'cwd.consumer-fixture',
    checkRuns,
  };
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  const interrupt = (signal: LintInterrupt) => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const context = {
    callerDirectory: root,
    toolkitDirectory: toolkit,
    expectedToolkitIdentity: hashBytes(plan.descriptor),
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    launch: (entrypoint: string) => createLaunch(process.execPath, entrypoint),
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { fixture, root, request, context, interrupt, listeners, toolkit };
}

it('returns prior preparation cancellation before reading absent source and leaves no outputs', async () => {
  const fixture = createFixture();
  fixture.interrupt('SIGINT');
  const request = {
    ...fixture.request,
    candidateRepository: join(fixture.root, 'absent'),
    reviewRecord: join(fixture.root, 'absent-review'),
  };
  expect(await prepareBunToolkit(request, fixture.context)).toEqual({
    kind: 'cancelled',
    status: 130,
    ownedDirectories: [],
    archive: undefined,
  });
  expect(existsSync(fixture.request.work)).toBe(false);
  expect(existsSync(fixture.request.destination)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});

it('prepares current activation and archives only after a complete peer certificate', async () => {
  const fixture = createFixture();
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected cancellation');
  const activation = verifyActivation(prepared.versionDirectory);
  expect(activation.manifest.schemaVersion).toBe(4);
  expect(activation.manifest.sourceRevision).toBe(fixture.fixture.candidateRevision);
  expect(readFileSync(join(fixture.request.destination, 'bootstrap-launcher.mjs'))).toEqual(
    readFileSync(join(fixture.toolkit, 'launcher.mjs')),
  );
  expect(readFileSync(join(fixture.request.destination, 'launcher-path'), 'utf8')).toBe(
    'bootstrap-launcher.mjs\n',
  );
  expect(prepared.archive.digest).toBe(hashBytes(readFileSync(prepared.archive.path)));
  expect(fixture.listeners.size).toBe(0);
  const archive = Bun.spawnSync(['tar', '--list', '--file', prepared.archive.path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(archive.exitCode, archive.stderr.toString()).toBe(0);
  expect(archive.stdout.toString()).toContain('./selected.json');
  expect(archive.stdout.toString()).not.toContain('launcher.sh');
  expect(archive.stdout.toString()).not.toContain('scratch');
}, 30000);

it('retains roots and original failed self-check and creates no archive', async () => {
  const fixture = createFixture({ certified: true });
  const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected retained preparation failure', { cause });
  expect(cause.ownedDirectories).toEqual([fixture.request.work, fixture.request.destination]);
  expect(cause.cause).toBeInstanceOf(Error);
  expect(cause.archive).toBeUndefined();
  expect(existsSync(join(fixture.request.destination, 'selected.json'))).toBe(true);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('refuses an occupied work directory without altering its sentinel', async () => {
  const fixture = createFixture();
  mkdirSync(fixture.request.work);
  writeFileSync(join(fixture.request.work, 'sentinel'), 'keep');
  const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  expect(readFileSync(join(fixture.request.work, 'sentinel'), 'utf8')).toBe('keep');
  expect(existsSync(fixture.request.destination)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('certifies the written activation through the real Bun launcher snapshotter and validator', async () => {
  const fixture = createFixture();
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const roleBytes = {
    'launcher.mjs': await buildLintLauncher(),
    'snapshotter.ts': readFileSync(join(import.meta.dir, 'snapshot-validator.ts')),
    'validator.mjs': await buildValidatorBundle(join(import.meta.dir, '../cli.ts')),
    'prepare-activation.mjs': Buffer.from('// preparer role not executed by this test\n'),
    'prepare-relocation-activation.mjs': Buffer.from(
      '// relocation role not executed by this test\n',
    ),
  };
  for (const [name, bytes] of Object.entries(roleBytes))
    writeFileSync(join(fixture.toolkit, name), bytes);
  const names = trustedModuleNames(join(workspace, 'node_modules'));
  copyTrustedModules(
    join(fixture.toolkit, 'trusted-node-modules'),
    join(workspace, 'node_modules'),
    names,
  );
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: names,
    trustedNodeModulesIdentity: hashTrustedModules(join(fixture.toolkit, 'trusted-node-modules')),
  });
  writeFileSync(join(fixture.toolkit, 'toolkit.json'), plan.descriptor);
  fixture.context.expectedToolkitIdentity = hashBytes(plan.descriptor);
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected real preparer cancellation');
  expect(JSON.parse(Buffer.from(prepared.report).toString())).toMatchObject({
    schemaVersion: 1,
    mode: 'enforce',
    trustProvenance: 'ci-preselected',
    accepted: true,
    certified: true,
  });
  expect(verifyActivation(prepared.versionDirectory).manifest.schemaVersion).toBe(4);
  expect(existsSync(prepared.archive.path)).toBe(true);
  expect(fixture.listeners.size).toBe(0);
}, 300000);

it('selects native check-run directory authority through alias parent components', async () => {
  const fixture = createFixture(),
    foreign = createFixture();
  const ledger = JSON.parse(
    readFileSync(join(foreign.request.checkRuns, 'check-runs.json'), 'utf8'),
  ) as { runs: { checkId: string }[] };
  writeCandidateCheckRuns(
    foreign.request.checkRuns,
    {
      repository: foreign.fixture.repository,
      revision: foreign.fixture.candidateRevision,
      policyPath: 'docs/wiki-policy/policy.json',
    },
    {
      outcomes: Object.fromEntries(
        ledger.runs.map((run) => [run.checkId, { stdout: 'LEXICAL FOREIGN LEDGER' }]),
      ),
    },
  );
  const native = join(fixture.root, 'native');
  mkdirSync(native);
  mkdirSync(join(native, 'child'));
  cpSync(fixture.request.checkRuns, join(native, 'check-runs'), { recursive: true });
  rmSync(fixture.request.checkRuns, { recursive: true });
  cpSync(foreign.request.checkRuns, fixture.request.checkRuns, { recursive: true });
  symlinkSync(join(native, 'child'), join(fixture.root, 'alias'));
  const request = { ...fixture.request, checkRuns: join(fixture.root, 'alias') + '/../check-runs' };
  expect((await prepareBunToolkit(request, fixture.context)).kind).toBe('prepared');
  expect(fixture.listeners.size).toBe(0);
  expect(
    readdirSync(join(fixture.request.work, 'checks'))
      .map((name) => readFileSync(join(fixture.request.work, 'checks', name), 'utf8'))
      .join('\n'),
  ).not.toContain('LEXICAL FOREIGN LEDGER');
}, 30000);

it('refuses a destination nested inside the owned work root before destination creation', async () => {
  const fixture = createFixture();
  const destination = join(fixture.request.work, 'activation');
  const cause: unknown = await prepareBunToolkit(
    { ...fixture.request, destination },
    fixture.context,
  ).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected disjoint-root refusal', { cause });
  expect(cause.ownedDirectories).toEqual([fixture.request.work]);
  expect(cause.cause).toBeInstanceOf(Error);
  expect(String(cause.cause)).toContain('physically disjoint');
  expect(existsSync(destination)).toBe(false);
}, 30000);

it('refuses a captured symlink nx configuration before output reservation', async () => {
  const fixture = createFixture();
  writeFileSync(
    join(fixture.fixture.repository, 'nx-source.json'),
    readFileSync(join(fixture.fixture.repository, 'nx.json')),
  );
  rmSync(join(fixture.fixture.repository, 'nx.json'));
  symlinkSync('nx-source.json', join(fixture.fixture.repository, 'nx.json'));
  const git = (...argv: string[]) => {
    const child = Bun.spawnSync(['git', '-C', fixture.fixture.repository, ...argv], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  };
  git('add', '--all');
  git('commit', '-m', 'symlink Nx config');
  const candidateSha = git('rev-parse', 'HEAD');
  writeFileSync(
    fixture.request.reviewRecord,
    JSON.stringify(
      auditReview(
        'review.fixture.module',
        candidateSha,
        candidateIdentityAt(fixture.fixture.repository, candidateSha),
      ),
    ),
  );
  const cause: unknown = await prepareBunToolkit(
    { ...fixture.request, candidateSha },
    fixture.context,
  ).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected regular-file refusal', { cause });
  expect(String(cause.cause)).toContain('captured regular file: nx.json');
  expect(cause.ownedDirectories).toEqual([]);
  expect(existsSync(fixture.request.work)).toBe(false);
}, 30000);

it('reports only the current PUNI archive namespace', async () => {
  const fixture = createFixture();
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected cancellation');
  expect(prepared.archive.path.split('/').at(-1)).toBe(
    'puni-activation-' + fixture.fixture.candidateRevision.slice(0, 8) + '.tar',
  );
}, 30000);

it('cancels the active self-check peer and creates no archive', async () => {
  const fixture = createFixture(undefined, true);
  const pending = prepareBunToolkit(fixture.request, fixture.context);
  try {
    for (
      let attempt = 0;
      attempt < 1000 && !existsSync(join(fixture.root, 'peer.started'));
      attempt++
    )
      await Bun.sleep(5);
    expect(existsSync(join(fixture.root, 'peer.started'))).toBe(true);
    fixture.interrupt('SIGTERM');
    expect(await pending).toEqual({
      kind: 'cancelled',
      status: 143,
      ownedDirectories: [fixture.request.work, fixture.request.destination],
      archive: undefined,
    });
    expect(fixture.listeners.size).toBe(0);
  } finally {
    fixture.interrupt('SIGTERM');
    await Promise.allSettled([pending]);
  }
}, 30000);

it('honors cancellation delivered during terminal subscription release after archive settlement', async () => {
  const fixture = createFixture();
  const subscribe = fixture.context.subscribeInterrupts;
  let isOuter = true;
  fixture.context.subscribeInterrupts = (listener) => {
    const outer = isOuter;
    isOuter = false;
    const release = subscribe(listener);
    return () => {
      if (outer) fixture.interrupt('SIGINT');
      release();
    };
  };
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled') throw new Error('expected terminal cancellation');
  expect(prepared.status).toBe(130);
  expect(prepared.archive).toBeDefined();
  if (prepared.archive === undefined) throw new Error('expected retained completed archive');
  expect(readFileSync(prepared.archive).length).toBeGreaterThan(0);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('preserves release failure after prior cancellation instead of reporting controlled success', async () => {
  const fixture = createFixture();
  fixture.interrupt('SIGINT');
  const failure = new Error('injected preparation release');
  const subscribe = fixture.context.subscribeInterrupts;
  fixture.context.subscribeInterrupts = (listener) => {
    const release = subscribe(listener);
    return () => {
      release();
      throw failure;
    };
  };
  const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected release refusal', { cause });
  expect(cause.cause).toBe(failure);
  expect(cause.ownedDirectories).toEqual([]);
  expect(fixture.listeners.size).toBe(0);
});

for (const stage of ['write', 'close', 'write-and-close'] as const) {
  it(
    'retains actual archive ownership and ' + stage + ' failure after descriptor settlement',
    async () => {
      const fixture = createFixture();
      const original = filesystem.open.bind(filesystem);
      let hasClosed = false;
      const writeFailure = new Error('injected archive write'),
        closeFailure = new Error('injected archive close');
      const probe = spyOn(filesystem, 'open').mockImplementation(async (...args) => {
        const descriptor = await original(...args);
        const close = descriptor.close.bind(descriptor);
        if (stage !== 'close') descriptor.writeFile = () => Promise.reject(writeFailure);
        descriptor.close = async () => {
          await close();
          hasClosed = true;
          if (stage !== 'write') throw closeFailure;
        };
        return descriptor;
      });
      let cause: unknown;
      try {
        cause = await prepareBunToolkit(fixture.request, fixture.context).then(
          () => undefined,
          (cause: unknown) => cause,
        );
      } finally {
        probe.mockRestore();
      }
      expect(hasClosed).toBe(true);
      expect(cause).toBeInstanceOf(PreparationFailure);
      if (!(cause instanceof PreparationFailure))
        throw new Error('expected archive failure', { cause });
      expect(cause.archive).toBeDefined();
      if (stage === 'write-and-close') {
        expect(cause.cause).toBeInstanceOf(AggregateError);
        if (!(cause.cause instanceof AggregateError))
          throw new Error('expected both archive failures');
        expect(cause.cause.errors).toEqual([writeFailure, closeFailure]);
      } else expect(cause.cause).toBe(stage === 'write' ? writeFailure : closeFailure);
      expect(fixture.listeners.size).toBe(0);
    },
    30000,
  );
}

for (const boundary of ['review', 'audit', 'ledger', 'stream'] as const) {
  it(
    'refuses a native FIFO ' + boundary + ' input within the bounded subprocess',
    async () => {
      const fixture = createFixture();
      let path: string;
      if (boundary === 'review') path = fixture.request.reviewRecord;
      else if (boundary === 'audit') path = fixture.request.auditStrata;
      else if (boundary === 'ledger') path = join(fixture.request.checkRuns, 'check-runs.json');
      else {
        const ledger = JSON.parse(
          readFileSync(join(fixture.request.checkRuns, 'check-runs.json'), 'utf8'),
        ) as { runs: { check: { stdout: string } }[] };
        const digest = ledger.runs.at(0)?.check.stdout;
        if (digest === undefined) throw new Error('missing fixture stream');
        path = join(fixture.request.checkRuns, 'streams', digest);
      }
      rmSync(path);
      const fifo = Bun.spawnSync(['/usr/bin/mkfifo', path], { stdout: 'pipe', stderr: 'pipe' });
      expect(fifo.exitCode, fifo.stderr.toString()).toBe(0);
      const script = join(fixture.root, 'fifo.mjs');
      writeFileSync(
        script,
        'import{prepareBunToolkit}from ' +
          JSON.stringify(join(import.meta.dir, 'prepare-bun-toolkit.ts')) +
          ';import{createLaunch}from ' +
          JSON.stringify(
            resolve(
              import.meta.dir,
              '../../../../../../libs/shared/adapters/bun-startup/src/index.ts',
            ),
          ) +
          ';const request=' +
          JSON.stringify(fixture.request) +
          ';const context=' +
          JSON.stringify({
            callerDirectory: fixture.context.callerDirectory,
            toolkitDirectory: fixture.context.toolkitDirectory,
            expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
            runtime: fixture.context.runtime,
          }) +
          ';try{await prepareBunToolkit(request,{...context,subscribeInterrupts:()=>()=>{},launch:(entry)=>createLaunch(process.execPath,entry)});throw new Error("FIFO unexpectedly prepared");}catch(cause){process.stdout.write(JSON.stringify({name:cause.name,message:String(cause.cause),reason:cause.cause?.reason}));}',
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
      }, 3000);
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      expect(hasTimedOut).toBe(false);
      expect(status, stderr).toBe(0);
      const refusal = JSON.parse(stdout) as { name: string; message: string; reason?: string };
      expect(refusal.name).toBe('PreparationFailure');
      if (boundary === 'ledger') expect(refusal.reason).toBe('unreadable');
      else if (boundary === 'stream') expect(refusal.reason).toBe('missing-stream');
      else expect(refusal.message).toContain('regular file');
      expect(existsSync(fixture.request.work)).toBe(false);
    },
    10000,
  );
}

for (const stage of [
  'source',
  'capture',
  'reviewed capture',
  'epoch',
  'self-check',
  'archive',
] as const) {
  it(
    'refuses ' + stage + ' dependency cancellation without the owning broker',
    async () => {
      const fixture = createFixture();
      const dependency =
        stage === 'source'
          ? { file: 'preparation-source.ts', symbol: 'readPreparationSource', condition: 'true' }
          : stage === 'capture' || stage === 'reviewed capture'
            ? {
                file: 'committed-source.ts',
                symbol: 'captureCommittedSource',
                condition: stage === 'capture' ? 'count===1' : 'count===2',
              }
            : stage === 'epoch'
              ? {
                  file: 'preparation-git.ts',
                  symbol: 'runPreparationGit',
                  condition: 'argv[0][0]==="show"',
                }
              : stage === 'self-check'
                ? {
                    file: 'prepared-self-check.ts',
                    symbol: 'checkPreparedActivation',
                    condition: 'true',
                  }
                : {
                    file: '../lint-child.ts',
                    symbol: 'runLintChild',
                    condition: 'argv[0].stage==="preparation archive"',
                  };
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
        ')return{kind:"cancelled",status:130,signal:"SIGINT",stdout:new Uint8Array(),report:{kind:"prefix",bytes:new Uint8Array()},diagnostics:{kind:"prefix",bytes:new Uint8Array()}};return await original(...argv);}}));const{prepareBunToolkit}=await import(' +
        JSON.stringify(join(import.meta.dir, 'prepare-bun-toolkit.ts')) +
        ');const request=' +
        JSON.stringify(fixture.request) +
        ';const context=' +
        JSON.stringify({
          callerDirectory: fixture.context.callerDirectory,
          toolkitDirectory: fixture.context.toolkitDirectory,
          expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
          runtime: fixture.context.runtime,
        }) +
        ';try{const prepared=await prepareBunToolkit(request,{...context,subscribeInterrupts:()=>()=>{},launch:(entry)=>createLaunch(process.execPath,entry)});process.stdout.write(JSON.stringify({kind:"unexpected-success",prepared}));}catch(cause){process.stdout.write(JSON.stringify({name:cause.name,message:String(cause.cause)}));}';
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
      expect(refusal.message).toContain(stage + ' cancellation missing from preparation broker');
    },
    10000,
  );
}

function installTar(fixture: ReturnType<typeof createFixture>, program: string) {
  const bin = join(fixture.root, 'bin');
  mkdirSync(bin);
  const path = join(bin, 'tar');
  writeFileSync(
    path,
    '#!/usr/bin/env -S ' + process.execPath + ' --no-env-file --config=/dev/null\n' + program,
  );
  chmodSync(path, 0o755);
  fixture.context.runtime = readLintRuntime(
    bin + ':/usr/bin:/bin',
    fixture.context.runtime.directory,
  );
}

it('retains failed native tar diagnostics and its closed empty archive', async () => {
  const fixture = createFixture();
  installTar(fixture, 'process.stderr.write("native tar refusal sentinel");process.exitCode=37;');
  const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('expected tar refusal', { cause });
  expect(String(cause.cause)).toContain('native tar refusal sentinel');
  expect(cause.archive).toBeDefined();
  if (cause.archive === undefined) throw new Error('expected retained archive');
  expect(readFileSync(cause.archive).length).toBe(0);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('cancels the actual tar group and closes the retained archive before returning first reason', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'tar.pid');
  installTar(
    fixture,
    'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>{});process.on("SIGTERM",()=>{});writeFileSync(' +
      JSON.stringify(marker) +
      ',String(process.pid));setInterval(()=>{},1000);',
  );
  const pending = prepareBunToolkit(fixture.request, fixture.context);
  try {
    for (let attempt = 0; attempt < 1000 && !existsSync(marker); attempt++) await Bun.sleep(5);
    expect(existsSync(marker)).toBe(true);
    const pid = Number(readFileSync(marker, 'utf8'));
    fixture.interrupt('SIGINT');
    fixture.interrupt('SIGTERM');
    const cancelled = await pending;
    expect(cancelled.kind).toBe('cancelled');
    if (cancelled.kind !== 'cancelled') throw new Error('expected tar cancellation');
    expect(cancelled.status).toBe(130);
    expect(cancelled.archive).toBeDefined();
    if (cancelled.archive === undefined) throw new Error('expected retained archive');
    expect(readFileSync(cancelled.archive).length).toBe(0);
    let absent = false;
    try {
      process.kill(-pid, 0);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') absent = true;
      else throw cause;
    }
    expect(absent).toBe(true);
    expect(fixture.listeners.size).toBe(0);
  } finally {
    fixture.interrupt('SIGTERM');
    await Promise.allSettled([pending]);
  }
}, 30000);

it('keeps preparation pending until the opened native archive descriptor closes', async () => {
  const fixture = createFixture(),
    gate = Promise.withResolvers<undefined>(),
    started = Promise.withResolvers<undefined>();
  const original = filesystem.open.bind(filesystem);
  const closures: Promise<void>[] = [];
  const probe = spyOn(filesystem, 'open').mockImplementation(async (...args) => {
    const descriptor = await original(...args),
      close = descriptor.close.bind(descriptor);
    descriptor.close = () => {
      started.resolve(undefined);
      const closing = gate.promise.then(() => close());
      closures.push(closing);
      return closing;
    };
    return descriptor;
  });
  let isSettled = false;
  const pending = prepareBunToolkit(fixture.request, fixture.context);
  void pending.then(
    () => {
      isSettled = true;
    },
    () => {
      isSettled = true;
    },
  );
  try {
    await started.promise;
    await Bun.sleep(5);
    expect(isSettled).toBe(false);
    gate.resolve(undefined);
    expect((await pending).kind).toBe('prepared');
  } finally {
    gate.resolve(undefined);
    await Promise.allSettled([pending, ...closures]);
    probe.mockRestore();
  }
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('refuses an occupied archive without replacing its sentinel', async () => {
  const fixture = createFixture(),
    original = filesystem.open.bind(filesystem);
  let target: string | undefined;
  const probe = spyOn(filesystem, 'open').mockImplementation(async (...args) => {
    const path = args[0];
    if (typeof path !== 'string') throw new Error('expected owned string archive');
    target = path;
    writeFileSync(path, 'archive collision sentinel');
    return original(...args);
  });
  let cause: unknown;
  try {
    cause = await prepareBunToolkit(fixture.request, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
  } finally {
    probe.mockRestore();
  }
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected archive collision', { cause });
  expect(cause.archive).toBeUndefined();
  if (target === undefined) throw new Error('archive collision not reached');
  expect(readFileSync(target, 'utf8')).toBe('archive collision sentinel');
  expect(fixture.listeners.size).toBe(0);
}, 30000);

for (const boundary of ['review', 'audit'] as const) {
  it(
    'preserves ' + boundary + ' fatal UTF8 decoding instead of replacement JSON parsing',
    async () => {
      const fixture = createFixture(),
        path = boundary === 'review' ? fixture.request.reviewRecord : fixture.request.auditStrata;
      writeFileSync(path, Uint8Array.from([0x22, 0xff, 0x22]));
      const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(cause).toBeInstanceOf(PreparationFailure);
      if (!(cause instanceof PreparationFailure))
        throw new Error('expected UTF8 refusal', { cause });
      expect(cause.cause).toBeInstanceOf(TypeError);
      expect(cause.ownedDirectories).toEqual([]);
    },
  );
  for (const fault of ['absent', 'unreadable'] as const) {
    it('preserves ' + fault + ' ' + boundary + ' input instead of a default', async () => {
      const fixture = createFixture(),
        path = boundary === 'review' ? fixture.request.reviewRecord : fixture.request.auditStrata;
      if (fault === 'absent') rmSync(path);
      else chmodSync(path, 0);
      let cause: unknown;
      try {
        cause = await prepareBunToolkit(fixture.request, fixture.context).then(
          () => undefined,
          (cause: unknown) => cause,
        );
      } finally {
        if (fault === 'unreadable') chmodSync(path, 0o600);
      }
      expect(cause).toBeInstanceOf(PreparationFailure);
      if (!(cause instanceof PreparationFailure))
        throw new Error('expected input refusal', { cause });
      expect(cause.cause).toBeInstanceOf(Error);
      if (!(cause.cause instanceof Error) || !('code' in cause.cause))
        throw new Error('expected native filesystem cause');
      expect(cause.cause.code).toBe(fault === 'absent' ? 'ENOENT' : 'EACCES');
      expect(cause.ownedDirectories).toEqual([]);
    });
  }
}

it('captures request and runtime authority before the first broker callback can mutate aliases', async () => {
  const fixture = createFixture(),
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
  const prepared = await prepareBunToolkit(request, context);
  expect(prepared.kind).toBe('prepared');
  if (prepared.kind !== 'prepared') throw new Error('unexpected captured-request cancellation');
  expect(prepared.versionDirectory.startsWith(expectedDestination + '/')).toBe(true);
  expect(existsSync(request.destination)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('captures review and audit bytes before source-selection subscriptions mutate their files', async () => {
  const fixture = createFixture(),
    subscribe = fixture.context.subscribeInterrupts;
  let count = 0;
  fixture.context.subscribeInterrupts = (listener) => {
    count++;
    if (count === 2) {
      writeFileSync(fixture.request.reviewRecord, '{}');
      writeFileSync(fixture.request.auditStrata, '{}');
    }
    return subscribe(listener);
  };
  expect((await prepareBunToolkit(fixture.request, fixture.context)).kind).toBe('prepared');
  expect(count).toBeGreaterThan(2);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('refuses changed written bootstrap bytes before launching self-certification', async () => {
  const fixture = createFixture(),
    original = synchronousFilesystem.writeFileSync.bind(synchronousFilesystem);
  let hasInjected = false;
  const probe = spyOn(synchronousFilesystem, 'writeFileSync').mockImplementation(
    (path, bytes, options) => {
      if (path === join(fixture.request.destination, 'bootstrap-launcher.mjs')) {
        hasInjected = true;
        original(
          path,
          Buffer.concat([
            Buffer.from(bytes as Uint8Array),
            Buffer.from('\n// injected bootstrap drift\n'),
          ]),
          options,
        );
        return;
      }
      original(path, bytes, options);
    },
  );
  let cause: unknown;
  try {
    cause = await prepareBunToolkit(fixture.request, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
  } finally {
    probe.mockRestore();
  }
  expect(hasInjected).toBe(true);
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected bootstrap drift', { cause });
  expect(String(cause.cause)).toContain('written bootstrap differs');
  expect(cause.archive).toBeUndefined();
  expect(existsSync(join(fixture.root, 'peer.started'))).toBe(false);
}, 30000);

it('refuses copied closure drift before launching self-certification', async () => {
  const fixture = createFixture(),
    original = synchronousFilesystem.mkdirSync.bind(synchronousFilesystem);
  let hasInjected = false;
  const closure = join(fixture.request.destination, 'trusted-node-modules');
  const probe = spyOn(synchronousFilesystem, 'mkdirSync').mockImplementation((path, options) => {
    const directory = original(path, options);
    if (path === closure) {
      hasInjected = true;
      writeFileSync(join(closure, 'injected.txt'), 'copied closure drift');
    }
    return directory;
  });
  let cause: unknown;
  try {
    cause = await prepareBunToolkit(fixture.request, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
  } finally {
    probe.mockRestore();
  }
  expect(hasInjected).toBe(true);
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('expected closure drift', { cause });
  expect(String(cause.cause)).toContain('copied activation closure differs');
  expect(cause.archive).toBeUndefined();
  expect(existsSync(join(fixture.root, 'peer.started'))).toBe(false);
}, 30000);

it('retains both preparation and terminal release causes without converting them to cancellation', async () => {
  const fixture = createFixture(),
    releaseFailure = new Error('preparation release failed');
  writeFileSync(fixture.request.reviewRecord, 'not JSON');
  const subscribe = fixture.context.subscribeInterrupts;
  fixture.context.subscribeInterrupts = (listener) => {
    const release = subscribe(listener);
    return () => {
      fixture.interrupt('SIGINT');
      release();
      throw releaseFailure;
    };
  };
  const cause: unknown = await prepareBunToolkit(fixture.request, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure) || !(cause.cause instanceof AggregateError))
    throw new Error('expected aggregate preparation failure', { cause });
  expect(cause.cause.errors.length).toBe(2);
  expect(cause.cause.errors.at(0)).toBeInstanceOf(SyntaxError);
  expect(cause.cause.errors.at(1)).toBe(releaseFailure);
  expect(fixture.listeners.size).toBe(0);
});

it('propagates preparation subscription-registration failure before filesystem reads or ownership', async () => {
  const fixture = createFixture(),
    failure = new Error('subscription registration failed');
  const cause: unknown = await prepareBunToolkit(
    { ...fixture.request, reviewRecord: join(fixture.root, 'absent-review') },
    {
      ...fixture.context,
      subscribeInterrupts: () => {
        throw failure;
      },
    },
  ).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBe(failure);
  expect(existsSync(fixture.request.work)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});

it('retains the prepared work root if native canonical refinement fails after reservation', async () => {
  const fixture = createFixture(),
    failure = new Error('native work refinement failed');
  const original = synchronousFilesystem.realpathSync.native.bind(
    synchronousFilesystem.realpathSync,
  );
  // Forward every native overload unchanged; only the exact owned-root operand injects a failure.
  const inject = ((
    ...args: Parameters<typeof synchronousFilesystem.realpathSync.native>
  ): unknown => {
    if (args[0] === fixture.request.work) throw failure;
    return Reflect.apply(original, undefined, args);
  }) as typeof synchronousFilesystem.realpathSync.native;
  const probe = spyOn(synchronousFilesystem.realpathSync, 'native').mockImplementation(inject);
  let cause: unknown;
  try {
    cause = await prepareBunToolkit(fixture.request, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
  } finally {
    probe.mockRestore();
  }
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure))
    throw new Error('expected native work failure', { cause });
  expect(cause.cause).toBe(failure);
  expect(cause.ownedDirectories).toEqual([fixture.request.work]);
  expect(existsSync(fixture.request.work)).toBe(true);
  expect(existsSync(fixture.request.destination)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

for (const fault of ['status', 'utf8', 'grammar', 'path'] as const) {
  it(
    'refuses invalid selected preparation ' + fault + ' authority before output reservation',
    async () => {
      const fixture = createFixture(),
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
          '}}));const{prepareBunToolkit}=await import(' +
          JSON.stringify(join(import.meta.dir, 'prepare-bun-toolkit.ts')) +
          ');const request=' +
          JSON.stringify(fixture.request) +
          ';const context=' +
          JSON.stringify({
            callerDirectory: fixture.context.callerDirectory,
            toolkitDirectory: fixture.context.toolkitDirectory,
            expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
            runtime: fixture.context.runtime,
          }) +
          ';try{const prepared=await prepareBunToolkit(request,{...context,subscribeInterrupts:()=>()=>{},launch:(entry)=>createLaunch(process.execPath,entry)});process.stdout.write(JSON.stringify({kind:"unexpected-success",prepared}));}catch(cause){process.stdout.write(JSON.stringify({name:cause.name,message:String(cause.cause),causeName:cause.cause?.name,owned:cause.ownedDirectories}));}',
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

for (const stage of ['work', 'destination'] as const) {
  it(
    'stops preparation immediately after cancellation during ' + stage + ' reservation',
    async () => {
      const fixture = createFixture(),
        target = stage === 'work' ? fixture.request.work : fixture.request.destination,
        original = filesystem.mkdir.bind(filesystem);
      // Preserve every mkdir overload and its return; inject only after the real call settles.
      const inject = (async (...args: Parameters<typeof filesystem.mkdir>): Promise<unknown> => {
        const directory: unknown = await Reflect.apply(original, undefined, args);
        if (args[0] === target) fixture.interrupt('SIGINT');
        return directory;
      }) as typeof filesystem.mkdir;
      const probe = spyOn(filesystem, 'mkdir').mockImplementation(inject);
      let prepared: Awaited<ReturnType<typeof prepareBunToolkit>>;
      try {
        prepared = await prepareBunToolkit(fixture.request, fixture.context);
      } finally {
        probe.mockRestore();
      }
      expect(prepared.kind).toBe('cancelled');
      if (prepared.kind !== 'cancelled') throw new Error('expected reservation cancellation');
      expect(prepared.status).toBe(130);
      expect(prepared.ownedDirectories).toEqual(
        stage === 'work'
          ? [fixture.request.work]
          : [fixture.request.work, fixture.request.destination],
      );
      expect(
        existsSync(
          stage === 'work'
            ? join(fixture.request.work, 'roles')
            : join(fixture.request.destination, 'selected.json'),
        ),
      ).toBe(false);
      expect(prepared.archive).toBeUndefined();
      expect(fixture.listeners.size).toBe(0);
    },
    30000,
  );
}

it('does not reserve an archive after cancellation during completed self-check release', async () => {
  const fixture = createFixture(),
    subscribe = fixture.context.subscribeInterrupts;
  let hasInjected = false;
  fixture.context.subscribeInterrupts = (listener) => {
    const release = subscribe(listener);
    return () => {
      release();
      if (!hasInjected && existsSync(join(fixture.root, 'peer.started'))) {
        hasInjected = true;
        fixture.interrupt('SIGINT');
      }
    };
  };
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(hasInjected).toBe(true);
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled') throw new Error('expected post-certificate cancellation');
  expect(prepared.archive).toBeUndefined();
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('skips archive payload writes after cancellation during settled tar subscription release', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'tar.finished');
  installTar(
    fixture,
    'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(marker) +
      ',"finished");process.stdout.write("captured tar bytes");',
  );
  const subscribe = fixture.context.subscribeInterrupts;
  let hasInjected = false;
  fixture.context.subscribeInterrupts = (listener) => {
    const release = subscribe(listener);
    return () => {
      release();
      if (!hasInjected && existsSync(marker)) {
        hasInjected = true;
        fixture.interrupt('SIGINT');
      }
    };
  };
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  expect(hasInjected).toBe(true);
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled' || prepared.archive === undefined)
    throw new Error('expected owned empty cancelled archive');
  expect(readFileSync(prepared.archive).length).toBe(0);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('returns cancellation after archive write and close without attempting a later unreadable hash', async () => {
  const fixture = createFixture(),
    original = filesystem.open.bind(filesystem);
  let archive: string | undefined;
  const probe = spyOn(filesystem, 'open').mockImplementation(async (...args) => {
    const descriptor = await original(...args),
      write = descriptor.writeFile.bind(descriptor);
    const path = args[0];
    if (typeof path !== 'string') throw new Error('expected archive path');
    archive = path;
    descriptor.writeFile = async (...args) => {
      await write(...args);
      chmodSync(path, 0);
      fixture.interrupt('SIGINT');
    };
    return descriptor;
  });
  let prepared: Awaited<ReturnType<typeof prepareBunToolkit>>;
  try {
    prepared = await prepareBunToolkit(fixture.request, fixture.context);
  } finally {
    probe.mockRestore();
    if (archive !== undefined) chmodSync(archive, 0o600);
  }
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled') throw new Error('expected settled archive cancellation');
  expect(prepared.status).toBe(130);
  expect(prepared.archive).toBe(archive);
  expect(fixture.listeners.size).toBe(0);
}, 30000);

it('settles cancellation delivered during archive open without starting native tar', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'unexpected-tar');
  installTar(
    fixture,
    'import{writeFileSync}from"node:fs";writeFileSync(' + JSON.stringify(marker) + ',"started");',
  );
  const original = filesystem.open.bind(filesystem);
  let hasClosed = false;
  const probe = spyOn(filesystem, 'open').mockImplementation(async (...args) => {
    const descriptor = await original(...args),
      close = descriptor.close.bind(descriptor);
    descriptor.close = async () => {
      await close();
      hasClosed = true;
    };
    fixture.interrupt('SIGINT');
    return descriptor;
  });
  let prepared: Awaited<ReturnType<typeof prepareBunToolkit>>;
  try {
    prepared = await prepareBunToolkit(fixture.request, fixture.context);
  } finally {
    probe.mockRestore();
  }
  expect(prepared.kind).toBe('cancelled');
  if (prepared.kind !== 'cancelled' || prepared.archive === undefined)
    throw new Error('expected cancelled open archive');
  expect(hasClosed).toBe(true);
  expect(readFileSync(prepared.archive).length).toBe(0);
  expect(existsSync(marker)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 30000);
