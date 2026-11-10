import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, it, spyOn } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { planBunToolkit } from './bun-release';
import { captureCommittedSource, type CommittedSource } from './committed-source';
import { MaterializationFailure, materializeSource } from './materialized-source';
import { readPreparationSource } from './preparation-source';
import { hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, ...args: string[]) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
interface FixtureFiles {
  readonly files?: readonly {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly executable?: boolean;
  }[];
  readonly links?: readonly { readonly path: string; readonly target: string }[];
  readonly externalClosure?: boolean;
}
async function createFixture(options: FixtureFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'puni materialized source '));
  roots.push(root);
  const repository = join(root, 'candidate'),
    runtime = join(root, 'runtime'),
    toolkit = join(root, 'toolkit'),
    closure =
      options.externalClosure === true
        ? join(root, 'external closure')
        : join(toolkit, 'trusted-node-modules');
  for (const path of [repository, runtime, toolkit, closure]) mkdirSync(path, { recursive: true });
  if (options.externalClosure === true) symlinkSync(closure, join(toolkit, 'trusted-node-modules'));
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.name', 'PUNI Materialization');
  git(repository, 'config', 'user.email', 'materialization@example.test');
  writeFileSync(join(repository, 'alpha.txt'), 'alpha\n');
  for (const file of options.files ?? []) {
    const path = join(repository, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.bytes);
    if (file.executable === true) chmodSync(path, 0o755);
  }
  for (const link of options.links ?? []) {
    const path = join(repository, link.path);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(link.target, path);
  }
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'source');
  const revision = git(repository, 'rev-parse', 'HEAD');
  // Inert authenticated roles exercise placement only; this is not a usable prepared toolkit.
  const roles = {
    'launcher.mjs': Buffer.from('launcher'),
    'snapshotter.ts': Buffer.from('snapshotter'),
    'validator.mjs': Buffer.from('validator'),
    'prepare-activation.mjs': Buffer.from('preparer'),
    'prepare-relocation-activation.mjs': Buffer.from('relocation'),
  };
  for (const [role, bytes] of Object.entries(roles)) writeFileSync(join(toolkit, role), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes: roles,
    trustedNodeModules: [],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  const interrupt = (signal: LintInterrupt) => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const subscribeInterrupts = (listener: (signal: LintInterrupt) => void) => {
    listeners.add(listener);
    if (first !== undefined) listener(first);
    return () => {
      listeners.delete(listener);
    };
  };
  const lookup = readLintRuntime('/usr/bin:/bin', runtime);
  const selected = await readPreparationSource(
    { candidateRepository: repository, candidateSha: revision },
    {
      callerDirectory: root,
      toolkitDirectory: toolkit,
      expectedToolkitIdentity: hashBytes(plan.descriptor),
      runtime: lookup,
      subscribeInterrupts,
    },
  );
  if (selected.kind !== 'ready') throw new Error('unexpected fixture selection cancellation');
  const captured = await captureCommittedSource(revision, {
    repository,
    runtime: lookup,
    subscribeInterrupts,
  });
  if (captured.kind !== 'captured') throw new Error('unexpected fixture capture cancellation');
  return {
    root,
    repository,
    runtime,
    toolkit,
    closure,
    revision,
    source: captured.source,
    context: { callerDirectory: root, selection: selected, subscribeInterrupts },
    interrupt,
    listeners,
  };
}
async function refusal(pending: Promise<unknown>): Promise<MaterializationFailure> {
  const cause: unknown = await pending.then(
    () => {
      throw new Error('materialization unexpectedly passed');
    },
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(MaterializationFailure);
  if (!(cause instanceof MaterializationFailure))
    throw new Error('wrong materialization failure', { cause });
  return cause;
}
function substitute(
  source: CommittedSource,
  path: string,
  bytes: Uint8Array,
  mode: '100644' | '120000' = '100644',
): CommittedSource {
  const snapshot = source.readSnapshot();
  return {
    readSnapshot: () => ({ ...snapshot, entries: [{ path, mode, blob: 'a'.repeat(40) }] }),
    readFile: () => new Uint8Array(bytes),
  };
}

it('materializes exact binary bytes, executable modes, Unicode BOM names and captured symlinks', async () => {
  const payload = Uint8Array.from([0, 10, 255, 13, 128]);
  const fixture = await createFixture({
    files: [
      { path: 'lib/raw.bin', bytes: payload },
      { path: 'run.ts', bytes: Buffer.from('executable'), executable: true },
      { path: '\uFEFFalpha.txt', bytes: Buffer.from('BOM target') },
      { path: '\u96EA space ', bytes: payload },
      { path: '.gitignore', bytes: Buffer.from('ignored\n') },
      { path: '.gitattributes', bytes: Buffer.from('*.txt -text\n') },
    ],
    links: [{ path: 'bom-link', target: '\uFEFFalpha.txt' }],
  });
  const outcome = await materializeSource(fixture.source, 'materialized', fixture.context);
  expect(outcome).toEqual({ kind: 'materialized', directory: join(fixture.root, 'materialized') });
  if (outcome.kind !== 'materialized') throw new Error('wrong materialization');
  expect(readFileSync(join(outcome.directory, 'lib/raw.bin'))).toEqual(Buffer.from(payload));
  expect(statSync(join(outcome.directory, 'run.ts')).mode & 0o777).toBe(0o755);
  expect(statSync(join(outcome.directory, 'alpha.txt')).mode & 0o777).toBe(0o644);
  expect(readFileSync(join(outcome.directory, '\u96EA space '))).toEqual(Buffer.from(payload));
  expect(readlinkSync(join(outcome.directory, 'bom-link'))).toBe('\uFEFFalpha.txt');
  expect(readFileSync(join(outcome.directory, 'bom-link'), 'utf8')).toBe('BOM target');
  expect(readFileSync(join(outcome.directory, '.gitignore'), 'utf8')).toBe('ignored\n');
  expect(fixture.listeners.size).toBe(0);
});
it('preserves native symlink-parent output placement', async () => {
  const fixture = await createFixture();
  mkdirSync(join(fixture.root, 'native/child'), { recursive: true });
  symlinkSync(join(fixture.root, 'native/child'), join(fixture.root, 'alias'));
  expect(await materializeSource(fixture.source, 'alias/../materialized', fixture.context)).toEqual(
    { kind: 'materialized', directory: join(fixture.root, 'native/materialized') },
  );
  expect(existsSync(join(fixture.root, 'materialized'))).toBe(false);
});
for (const existing of ['directory', 'file', 'dangling'] as const)
  it('refuses existing ' + existing + ' without replacement or output ownership', async () => {
    const fixture = await createFixture(),
      output = join(fixture.root, 'materialized');
    if (existing === 'directory') {
      mkdirSync(output);
      writeFileSync(join(output, 'sentinel'), 'retained');
    } else if (existing === 'file') writeFileSync(output, 'retained');
    else symlinkSync(join(fixture.root, 'absent'), output);
    const failure = await refusal(materializeSource(fixture.source, output, fixture.context));
    expect(failure.directory).toBeUndefined();
    if (existing === 'directory')
      expect(readFileSync(join(output, 'sentinel'), 'utf8')).toBe('retained');
    else if (existing === 'file') expect(readFileSync(output, 'utf8')).toBe('retained');
    else expect(readlinkSync(output)).toBe(join(fixture.root, 'absent'));
    expect(fixture.listeners.size).toBe(0);
  });
for (const authority of ['candidate', 'toolkit', 'runtime', 'closure'] as const)
  it(
    'refuses output beneath native protected ' + authority + ' authority before reservation',
    async () => {
      const fixture = await createFixture({ externalClosure: true }),
        parent =
          authority === 'candidate'
            ? fixture.repository
            : authority === 'toolkit'
              ? fixture.toolkit
              : authority === 'runtime'
                ? fixture.runtime
                : fixture.closure,
        output = join(parent, 'materialized'),
        before = hashTrustedModules(fixture.closure);
      const failure = await refusal(materializeSource(fixture.source, output, fixture.context));
      expect(failure.directory).toBeUndefined();
      expect(failure.message).toContain('protected');
      expect(existsSync(output)).toBe(false);
      expect(hashTrustedModules(fixture.closure)).toBe(before);
    },
  );
it('refuses absent existing parent instead of recursively creating authority', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'absent/materialized');
  const failure = await refusal(materializeSource(fixture.source, output, fixture.context));
  expect(failure.directory).toBeUndefined();
  expect(existsSync(join(fixture.root, 'absent'))).toBe(false);
});
it('refuses an unreadable parent without accepting it as absent', async () => {
  const fixture = await createFixture(),
    parent = join(fixture.root, 'unreadable');
  mkdirSync(parent);
  chmodSync(parent, 0);
  try {
    const failure = await refusal(
      materializeSource(fixture.source, join(parent, 'materialized'), fixture.context),
    );
    expect(failure.directory).toBeUndefined();
    expect(failure.cause).toMatchObject({ code: 'EACCES' });
  } finally {
    chmodSync(parent, 0o700);
  }
  expect(existsSync(join(parent, 'materialized'))).toBe(false);
});
for (const leaf of ['', '/', '.', '..'])
  it('refuses invalid fresh output leaf ' + JSON.stringify(leaf), async () => {
    const fixture = await createFixture();
    const failure = await refusal(materializeSource(fixture.source, leaf, fixture.context));
    expect(failure.directory).toBeUndefined();
    expect(failure.message).toContain('leaf');
  });
it('returns prior cancellation before reading malformed source or absent parent', async () => {
  const fixture = await createFixture();
  fixture.interrupt('SIGTERM');
  const broken: CommittedSource = {
    readSnapshot: () => {
      throw new Error('source must not be read');
    },
    readFile: () => {
      throw new Error('source must not be read');
    },
  };
  expect(await materializeSource(broken, 'absent/materialized', fixture.context)).toEqual({
    kind: 'cancelled',
    status: 143,
    directory: undefined,
  });
  expect(existsSync(join(fixture.root, 'absent'))).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});
for (const path of ['.git/config', 'folder/.GiT/HEAD', '\uFEFF.git/config', '.g\u200cit/config'])
  it('refuses Git metadata path ' + JSON.stringify(path) + ' before output writes', async () => {
    const fixture = await createFixture(),
      output = join(fixture.root, 'materialized');
    const failure = await refusal(
      materializeSource(
        substitute(fixture.source, path, Buffer.from('metadata')),
        output,
        fixture.context,
      ),
    );
    expect(failure.directory).toBeUndefined();
    expect(failure.message).toContain('Git metadata');
    expect(existsSync(output)).toBe(false);
  });
for (const point of [
  0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x206a, 0x206b, 0x206c,
  0x206d, 0x206e, 0x206f, 0xfeff,
])
  it('refuses declared Git HFS metadata equivalence ' + point.toString(16), async () => {
    const fixture = await createFixture(),
      path = '.g' + String.fromCodePoint(point) + 'it/value';
    const failure = await refusal(
      materializeSource(
        substitute(fixture.source, path, Buffer.from('metadata')),
        'materialized',
        fixture.context,
      ),
    );
    expect(failure.directory).toBeUndefined();
    expect(failure.message).toContain('Git metadata');
    expect(existsSync(join(fixture.root, 'materialized'))).toBe(false);
  });

for (const [label, bytes] of [
  ['empty', Buffer.alloc(0)],
  ['NUL', Buffer.from('bad\0target')],
  ['absolute', Buffer.from('/outside')],
  ['invalid UTF8', Uint8Array.from([255])],
] as const)
  it('refuses ' + label + ' link target before output reservation', async () => {
    const fixture = await createFixture(),
      output = join(fixture.root, 'materialized');
    const failure = await refusal(
      materializeSource(
        substitute(fixture.source, 'link', bytes, '120000'),
        output,
        fixture.context,
      ),
    );
    expect(failure.directory).toBeUndefined();
    expect(existsSync(output)).toBe(false);
  });
for (const [label, links] of [
  ['dangling', [{ path: 'link', target: 'missing' }]],
  [
    'cyclic',
    [
      { path: 'one', target: 'two' },
      { path: 'two', target: 'one' },
    ],
  ],
] as const)
  it('retains owned output when native ' + label + ' link validation fails', async () => {
    const fixture = await createFixture({ links }),
      output = join(fixture.root, 'materialized');
    const failure = await refusal(materializeSource(fixture.source, output, fixture.context));
    expect(failure.directory).toBe(output);
    expect(existsSync(output)).toBe(true);
    expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('alpha\n');
    expect(fixture.listeners.size).toBe(0);
  });
it('rejects an escaping native symlink chain after all regular writes without changing external bytes', async () => {
  const fixture = await createFixture({
    files: [
      { path: 'a/keep', bytes: Buffer.from('a') },
      { path: 'b/keep', bytes: Buffer.from('b') },
    ],
    links: [
      { path: 'a/link', target: '../b' },
      { path: 'escape', target: 'a/link/../../outside-marker' },
    ],
  });
  const outside = join(fixture.root, 'outside-marker');
  writeFileSync(outside, 'external sentinel');
  const output = join(fixture.root, 'materialized'),
    failure = await refusal(materializeSource(fixture.source, output, fixture.context));
  expect(failure.directory).toBe(output);
  expect(failure.message).toContain('outside');
  expect(readFileSync(outside, 'utf8')).toBe('external sentinel');
  expect(readFileSync(join(output, 'a/keep'), 'utf8')).toBe('a');
  expect(lstatSync(join(output, 'escape')).isSymbolicLink()).toBe(true);
});
it('accepts an internal multi-link chain without normalizing its recorded targets', async () => {
  const fixture = await createFixture({
    files: [{ path: 'dir/keep', bytes: Buffer.from('kept') }],
    links: [
      { path: 'alias', target: 'dir' },
      { path: 'link', target: 'alias/../alpha.txt' },
    ],
  });
  const output = join(fixture.root, 'materialized'),
    outcome = await materializeSource(fixture.source, output, fixture.context);
  expect(outcome).toEqual({ kind: 'materialized', directory: output });
  expect(readlinkSync(join(output, 'link'))).toBe('alias/../alpha.txt');
  expect(readFileSync(join(output, 'link'), 'utf8')).toBe('alpha\n');
});

async function runFsProbe(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  mode: string,
): Promise<unknown> {
  const output = join(fixture.root, 'materialized');
  const program = [
    'import{mock}from"bun:test";import*as fs from"node:fs/promises";import{join}from"node:path";',
    'const nativeMkdir=fs.mkdir,nativeOpen=fs.open,nativeSymlink=fs.symlink;const events=[];let closed=0;const listeners=new Set();let first;const interrupt=signal=>{first??=signal;for(const listener of listeners)listener(signal);};const subscribeInterrupts=listener=>{listeners.add(listener);if(first!==undefined)listener(first);return()=>{listeners.delete(listener);};};',
    'const{readPreparationSource}=await import(' +
      JSON.stringify(new URL('./preparation-source.ts', import.meta.url).href) +
      ');const{captureCommittedSource}=await import(' +
      JSON.stringify(new URL('./committed-source.ts', import.meta.url).href) +
      ');',
    'const selection=await readPreparationSource({candidateRepository:' +
      JSON.stringify(fixture.repository) +
      ',candidateSha:' +
      JSON.stringify(fixture.revision) +
      '},{callerDirectory:' +
      JSON.stringify(fixture.root) +
      ',toolkitDirectory:' +
      JSON.stringify(fixture.toolkit) +
      ',expectedToolkitIdentity:' +
      JSON.stringify(fixture.context.selection.toolkit.digest) +
      ',runtime:' +
      JSON.stringify(fixture.context.selection.runtime) +
      ',subscribeInterrupts});if(selection.kind!=="ready")throw new Error("probe selection cancelled");',
    'const capture=await captureCommittedSource(' +
      JSON.stringify(fixture.revision) +
      ',{repository:' +
      JSON.stringify(fixture.repository) +
      ',runtime:selection.runtime,subscribeInterrupts});if(capture.kind!=="captured")throw new Error("probe capture cancelled");const source=capture.source,context={callerDirectory:' +
      JSON.stringify(fixture.root) +
      ',selection,subscribeInterrupts},output=' +
      JSON.stringify(output) +
      ',mode=' +
      JSON.stringify(mode) +
      ';',
    'mock.module("node:fs/promises",()=>({...fs,mkdir:async(path,options)=>{events.push("mkdir:"+path);await nativeMkdir(path,options);if(path===output){if(mode==="root-realpath-failure")await fs.chmod(' +
      JSON.stringify(fixture.root) +
      ',0);if(mode==="cancel-root")interrupt("SIGINT");if(mode==="context-alias"){context.callerDirectory="/absent";context.selection.toolkit.directory="/absent";source.readFile=()=>Buffer.from("substituted");}if(mode==="directory-collision")await nativeMkdir(join(output,"dir"));}},open:async(path,flags,permissions)=>{events.push("open:"+path);if(mode==="open-failure")throw new Error("injected open failure");if(mode==="file-collision")await Bun.write(path,"collision sentinel");const descriptor=await nativeOpen(path,flags,permissions);if(mode==="cancel-open")interrupt("SIGINT");return{writeFile:async bytes=>{events.push("write:"+path);if(mode==="write-close-failure"||mode==="write-failure")throw new Error("injected write failure");await descriptor.writeFile(bytes);if(mode==="cancel-write"){interrupt("SIGINT");interrupt("SIGTERM");}},chmod:async bits=>{events.push("chmod:"+path);if(mode==="chmod-failure")throw new Error("injected chmod failure");await descriptor.chmod(bits);},close:async()=>{events.push("close:"+path);await descriptor.close();closed++;if(mode==="close-failure"||mode==="write-close-failure")throw new Error("injected close failure");}};},symlink:async(target,path)=>{events.push("link:"+path);if(mode==="link-failure")throw new Error("injected link failure");await nativeSymlink(target,path);if(mode==="cancel-link")interrupt("SIGINT");}}));',
    'const{materializeSource,MaterializationFailure}=await import(' +
      JSON.stringify(new URL('./materialized-source.ts', import.meta.url).href) +
      ');let observed;const describe=cause=>cause instanceof AggregateError?{name:cause.name,message:cause.message,errors:[...cause.errors].map(describe)}:cause instanceof Error?{name:cause.name,message:cause.message}:String(cause);try{const outcome=await materializeSource(source,output,context);observed={kind:"returned",outcome};}catch(cause){if(!(cause instanceof MaterializationFailure))throw cause;observed={kind:"failed",directory:cause.directory,cause:describe(cause.cause)};}process.stdout.write(JSON.stringify({observed,events,closed,listeners:listeners.size}));',
  ].join('\n');
  const child = Bun.spawn(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: import.meta.dir, env: { PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (mode === 'root-realpath-failure') chmodSync(fixture.root, 0o700);
  expect(status, stderr).toBe(0);
  return JSON.parse(stdout) as unknown;
}
it('records root ownership before honoring cancellation delivered during reservation', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'cancel-root')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 0,
    listeners: 0,
  });
  expect(existsSync(output)).toBe(true);
  expect(existsSync(join(output, 'alpha.txt'))).toBe(false);
});
it('awaits descriptor close without payload writes when cancellation arrives during open', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  const report = await runFsProbe(fixture, 'cancel-open');
  expect(report).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 1,
    listeners: 0,
  });
  expect(readFileSync(join(output, 'alpha.txt')).length).toBe(0);
  expect(statSync(join(output, 'alpha.txt')).mode & 0o777).toBe(0o600);
});
it('retains first cancellation after a completed write and closes before returning', async () => {
  const fixture = await createFixture({ files: [{ path: 'z-last', bytes: Buffer.from('last') }] }),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'cancel-write')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 1,
    listeners: 0,
  });
  expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('alpha\n');
  expect(existsSync(join(output, 'z-last'))).toBe(false);
  expect(statSync(join(output, 'alpha.txt')).mode & 0o777).toBe(0o600);
});
for (const mode of ['open-failure', 'write-failure', 'chmod-failure', 'close-failure'] as const)
  it(
    'retains partial root and original ' + mode + ' instead of returning cancellation or success',
    async () => {
      const fixture = await createFixture(),
        output = join(fixture.root, 'materialized');
      expect(await runFsProbe(fixture, mode)).toMatchObject({
        observed: {
          kind: 'failed',
          directory: output,
          cause: { message: 'injected ' + mode.replace('-failure', ' failure') },
        },
        closed: mode === 'open-failure' ? 0 : 1,
        listeners: 0,
      });
      expect(existsSync(output)).toBe(true);
    },
  );
it('preserves both write failure and later close failure after native descriptor settlement', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'write-close-failure')).toMatchObject({
    observed: {
      kind: 'failed',
      directory: output,
      cause: {
        name: 'AggregateError',
        errors: [{ message: 'injected write failure' }, { message: 'injected close failure' }],
      },
    },
    closed: 1,
    listeners: 0,
  });
});
it('refuses a newly occupied logical parent rather than merging directories', async () => {
  const fixture = await createFixture({
      files: [{ path: 'dir/payload', bytes: Buffer.from('bytes') }],
    }),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'directory-collision')).toMatchObject({
    observed: { kind: 'failed', directory: output },
    listeners: 0,
  });
  expect(existsSync(join(output, 'dir/payload'))).toBe(false);
});
it('exclusive file creation preserves a dependency-injected collision sentinel', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'file-collision')).toMatchObject({
    observed: { kind: 'failed', directory: output },
    closed: 0,
    listeners: 0,
  });
  expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('collision sentinel');
});
it('retains link failure after every regular descriptor has closed', async () => {
  const fixture = await createFixture({ links: [{ path: 'link', target: 'alpha.txt' }] }),
    output = join(fixture.root, 'materialized');
  const report = await runFsProbe(fixture, 'link-failure');
  expect(report).toMatchObject({
    observed: { kind: 'failed', directory: output, cause: { message: 'injected link failure' } },
    closed: 1,
    listeners: 0,
  });
  expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('alpha\n');
  expect(existsSync(join(output, 'link'))).toBe(false);
});
it('captures paths, selected authority and read capability before reservation awaits', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'context-alias')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'materialized', directory: output } },
    closed: 1,
    listeners: 0,
  });
  expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('alpha\n');
});

it('honors a recorded control delivered while releasing the subscription before terminal success', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized'),
    subscribe = fixture.context.subscribeInterrupts;
  const context = {
    ...fixture.context,
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      const release = subscribe(listener);
      return () => {
        fixture.interrupt('SIGINT');
        release();
      };
    },
  };
  expect(await materializeSource(fixture.source, output, context)).toEqual({
    kind: 'cancelled',
    status: 130,
    directory: output,
  });
  expect(fixture.listeners.size).toBe(0);
  expect(readFileSync(join(output, 'alpha.txt'), 'utf8')).toBe('alpha\n');
});
it('honors cancellation recorded by captured metadata before any output reservation', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  const source: CommittedSource = {
    readSnapshot: () => {
      const snapshot = fixture.source.readSnapshot();
      fixture.interrupt('SIGINT');
      return snapshot;
    },
    readFile: fixture.source.readFile.bind(fixture.source),
  };
  expect(await materializeSource(source, output, fixture.context)).toEqual({
    kind: 'cancelled',
    status: 130,
    directory: undefined,
  });
  expect(existsSync(output)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});
it('preserves an interruption release failure after otherwise successful materialization', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized'),
    subscribe = fixture.context.subscribeInterrupts,
    cause = new Error('injected release failure');
  const context = {
    ...fixture.context,
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      const release = subscribe(listener);
      return () => {
        release();
        throw cause;
      };
    },
  };
  const failure = await refusal(materializeSource(fixture.source, output, context));
  expect(failure.directory).toBe(output);
  expect(failure.cause).toBe(cause);
  expect(fixture.listeners.size).toBe(0);
});
it('preserves both operation and release failures without masking either cause', async () => {
  const fixture = await createFixture(),
    subscribe = fixture.context.subscribeInterrupts;
  const context = {
    ...fixture.context,
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      const release = subscribe(listener);
      return () => {
        release();
        throw new Error('injected release failure');
      };
    },
  };
  const failure = await refusal(
    materializeSource(
      substitute(fixture.source, '.git/HEAD', Buffer.from('metadata')),
      'materialized',
      context,
    ),
  );
  expect(failure.directory).toBeUndefined();
  expect(failure.cause).toMatchObject({
    name: 'AggregateError',
    errors: [
      { message: 'captured source path contains Git metadata: .git/HEAD' },
      { message: 'injected release failure' },
    ],
  });
  expect(fixture.listeners.size).toBe(0);
});
it('does not mask release failure as prior controlled cancellation', async () => {
  const fixture = await createFixture(),
    subscribe = fixture.context.subscribeInterrupts,
    cause = new Error('injected release failure');
  fixture.interrupt('SIGTERM');
  const context = {
    ...fixture.context,
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      const release = subscribe(listener);
      return () => {
        release();
        throw cause;
      };
    },
  };
  const failure = await refusal(materializeSource(fixture.source, 'materialized', context));
  expect(failure.directory).toBeUndefined();
  expect(failure.cause).toBe(cause);
  expect(fixture.listeners.size).toBe(0);
});
it('propagates registration failure before reading source or reserving output', async () => {
  const fixture = await createFixture(),
    cause = new Error('injected registration failure');
  let reads = 0;
  const source: CommittedSource = {
    readSnapshot: () => {
      reads++;
      return fixture.source.readSnapshot();
    },
    readFile: fixture.source.readFile.bind(fixture.source),
  };
  const caught: unknown = await materializeSource(source, 'materialized', {
    ...fixture.context,
    subscribeInterrupts: () => {
      throw cause;
    },
  }).then(
    () => {
      throw new Error('registration unexpectedly succeeded');
    },
    (caught: unknown) => caught,
  );
  expect(caught).toBe(cause);
  expect(reads).toBe(0);
  expect(existsSync(join(fixture.root, 'materialized'))).toBe(false);
});
it('refuses unsupported captured mode rather than silently omitting a trusted entry', async () => {
  const fixture = await createFixture(),
    snapshot = fixture.source.readSnapshot();
  const source: CommittedSource = {
    readSnapshot: () => ({
      ...snapshot,
      entries: [{ path: 'gitlink', mode: '160000', blob: 'a'.repeat(40) }],
    }),
    readFile: fixture.source.readFile.bind(fixture.source),
  };
  const failure = await refusal(materializeSource(source, 'materialized', fixture.context));
  expect(failure.directory).toBeUndefined();
  expect(failure.message).toContain('unsupported materialization mode');
  expect(existsSync(join(fixture.root, 'materialized'))).toBe(false);
});

it('keeps the API pending while an opened native descriptor close is gated', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized'),
    gate = Promise.withResolvers<undefined>(),
    started = Promise.withResolvers<undefined>(),
    nativeOpen = filesystem.open;
  const held: {
    isClosing: boolean;
    close: () => Promise<void>;
    done: ReturnType<typeof Promise.withResolvers<undefined>>;
  }[] = [];
  const spy = spyOn(filesystem, 'open').mockImplementation(async (path, flags, mode) => {
    const descriptor = await nativeOpen(path, flags, mode),
      close = descriptor.close.bind(descriptor),
      state = { isClosing: false, close, done: Promise.withResolvers<undefined>() };
    held.push(state);
    descriptor.close = async () => {
      state.isClosing = true;
      started.resolve(undefined);
      await gate.promise;
      try {
        await close();
      } finally {
        state.done.resolve(undefined);
      }
    };
    return descriptor;
  });
  let isSettled = false;
  const pending = materializeSource(fixture.source, output, fixture.context).then((outcome) => {
    isSettled = true;
    return outcome;
  });
  const failures: unknown[] = [];
  try {
    await Promise.race([
      started.promise,
      pending.then(() => {
        if (!held.some((descriptor) => descriptor.isClosing))
          throw new Error('API settled without starting descriptor close');
      }),
    ]);
    await Bun.sleep(0);
    expect(isSettled).toBe(false);
    gate.resolve(undefined);
    expect(await pending).toEqual({ kind: 'materialized', directory: output });
  } catch (cause) {
    failures.push(cause);
  } finally {
    gate.resolve(undefined);
    const outcomes = await Promise.allSettled([
      pending,
      ...held.map(async (descriptor) => {
        if (descriptor.isClosing) await descriptor.done.promise;
        else await descriptor.close();
      }),
    ]);
    spy.mockRestore();
    for (const outcome of outcomes)
      if (outcome.status === 'rejected') failures.push(outcome.reason as unknown);
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'materialization fixture did not settle');
  expect(fixture.listeners.size).toBe(0);
});

it('creates no captured parent directory after cancellation during root reservation', async () => {
  const fixture = await createFixture({
      files: [{ path: 'dir/payload', bytes: Buffer.from('bytes') }],
    }),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'cancel-root')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 0,
    listeners: 0,
  });
  expect(existsSync(join(output, 'dir'))).toBe(false);
});
it('creates no captured link after cancellation during the last regular write', async () => {
  const fixture = await createFixture({ links: [{ path: 'link', target: 'alpha.txt' }] }),
    output = join(fixture.root, 'materialized');
  expect(await runFsProbe(fixture, 'cancel-write')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 1,
    listeners: 0,
  });
  expect(existsSync(join(output, 'link'))).toBe(false);
});
it('returns cancellation after link creation before validating an incomplete retained view', async () => {
  const fixture = await createFixture({ links: [{ path: 'escape', target: '../outside-marker' }] }),
    output = join(fixture.root, 'materialized');
  writeFileSync(join(fixture.root, 'outside-marker'), 'outside');
  expect(await runFsProbe(fixture, 'cancel-link')).toMatchObject({
    observed: { kind: 'returned', outcome: { kind: 'cancelled', status: 130, directory: output } },
    closed: 1,
    listeners: 0,
  });
  expect(lstatSync(join(output, 'escape')).isSymbolicLink()).toBe(true);
  expect(readFileSync(join(fixture.root, 'outside-marker'), 'utf8')).toBe('outside');
});

it('retains created root identity when native canonicalization fails after successful mkdir', async () => {
  const fixture = await createFixture(),
    output = join(fixture.root, 'materialized');
  const report = await runFsProbe(fixture, 'root-realpath-failure');
  expect(report).toMatchObject({
    observed: { kind: 'failed', directory: output },
    closed: 0,
    listeners: 0,
  });
  expect(existsSync(output)).toBe(true);
  expect(existsSync(join(output, 'alpha.txt'))).toBe(false);
});

for (const authority of ['descriptor', 'role'] as const)
  it('refuses missing selected ' + authority + ' target before output ownership', async () => {
    const fixture = await createFixture(),
      selected = join(
        fixture.toolkit,
        authority === 'descriptor' ? 'toolkit.json' : 'validator.mjs',
      ),
      output = join(fixture.root, 'materialized');
    rmSync(selected);
    const failure = await refusal(materializeSource(fixture.source, output, fixture.context));
    expect(failure.directory).toBeUndefined();
    expect(failure.cause).toMatchObject({ code: 'ENOENT' });
    expect(existsSync(output)).toBe(false);
  });
