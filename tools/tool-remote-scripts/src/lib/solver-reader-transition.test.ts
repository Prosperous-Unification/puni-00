import { rejects } from 'node:assert/strict';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

import { initializeOrdinaryEdgePolicy } from './edge-policy';
import { withExistingCanonicalLock } from './lock';
import { captureSolverReaderArtifact } from './solver-reader-preparation';
import { transitionSolverReader } from './solver-reader-transition';

const HISTORICAL_FIXTURE = resolve(
  import.meta.dir,
  '../../test/fixtures/pre-jc-reader-17cce118.json',
);
const HISTORICAL_CONTAINER_SHA = '722fc501dbf5cad8a5ce4cad2059f579d0154c1921883682c9a708cc6dad4d48';
const HISTORICAL_BUNDLE_SHA = 'c719ebe11a20687621a444ecc6e13be5064e273868ef416e59c5247741a6382a';
const HISTORICAL_TOKEN = Buffer.from('"/__puni_pre_jc_reader_17cce118_owned_state__"');
const HISTORICAL_TOKEN_OFFSET = 15234;
let originalEnvironment: string | undefined;
beforeEach(() => {
  originalEnvironment = process.env['WBS_ENV'];
  process.env['WBS_ENV'] = 'prod';
});
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env['WBS_ENV'];
  else process.env['WBS_ENV'] = originalEnvironment;
});

function digestHistoricalBytes(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

function decodeHistoricalBundle(container: Buffer): Buffer {
  if (digestHistoricalBytes(container) !== HISTORICAL_CONTAINER_SHA)
    throw new Error('historical fixture container hash differs');
  const fixture: unknown = JSON.parse(container.toString('utf8'));
  if (typeof fixture !== 'object' || fixture === null || !('bundle' in fixture))
    throw new Error('historical fixture bundle missing');
  const bundle = fixture.bundle;
  if (
    typeof bundle !== 'object' ||
    bundle === null ||
    !('base64' in bundle) ||
    typeof bundle.base64 !== 'string'
  )
    throw new Error('historical fixture bundle encoding missing');
  return Buffer.from(bundle.base64, 'base64');
}

/** Authenticates outside-container pins and changes only the independently reviewed quoted token span. */
function materializeHistoricalBundle(bundle: Buffer, state: string): Buffer {
  if (bundle.byteLength !== 445789 || digestHistoricalBytes(bundle) !== HISTORICAL_BUNDLE_SHA)
    throw new Error('historical fixture decoded bundle hash or size differs');
  if (
    HISTORICAL_TOKEN.byteLength !== 46 ||
    bundle.indexOf(HISTORICAL_TOKEN) !== HISTORICAL_TOKEN_OFFSET ||
    bundle.lastIndexOf(HISTORICAL_TOKEN) !== HISTORICAL_TOKEN_OFFSET
  )
    throw new Error('historical fixture unique quoted token differs');
  const prefix = bundle.subarray(0, HISTORICAL_TOKEN_OFFSET);
  const suffix = bundle.subarray(HISTORICAL_TOKEN_OFFSET + HISTORICAL_TOKEN.byteLength);
  const replacement = Buffer.from(JSON.stringify(state));
  const materialized = Buffer.concat([prefix, replacement, suffix]);
  if (
    !materialized.subarray(0, prefix.byteLength).equals(prefix) ||
    !materialized.subarray(prefix.byteLength + replacement.byteLength).equals(suffix)
  )
    throw new Error('historical fixture prefix or suffix differs');
  return materialized;
}

async function transitionFixture() {
  const root = scratchSync('reader-transition-');
  const state = join(root, 'state');
  const staging = join(root, 'stage');
  const installed = join(root, 'installed');
  for (const path of [state, staging, installed]) await mkdir(path, { mode: 0o700 });
  for (const path of [root, state, staging, installed]) {
    const metadata = await lstat(path);
    if (
      !metadata.isDirectory() ||
      metadata.uid !== userInfo().uid ||
      metadata.gid !== userInfo().gid ||
      (metadata.mode & 0o7777) !== 0o700 ||
      (await realpath(path)) !== path
    )
      throw new Error('historical fixture requires private canonical owned layout');
  }
  const layout = {
    state,
    staging,
    bun: join(installed, 'bun'),
    reader: join(installed, 'solver-supervisor.js'),
  };
  await copyFile(process.execPath, layout.bun);
  const buildReader = (minifyWhitespace: boolean) =>
    Bun.build({
      minify: { whitespace: minifyWhitespace },
      entrypoints: [resolve(import.meta.dir, '../solver-supervisor.ts')],
      target: 'bun',
      plugins: [
        {
          name: 'owned-transition-layout',
          setup(build) {
            build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => {
              const source = await Bun.file(file.path).text();
              const anchor = "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';";
              if (source.split(anchor).length !== 2)
                throw new Error('fixed production state anchor differs');
              return {
                contents: source.replace(
                  anchor,
                  `export const SOLVER_READER_STATE = ${JSON.stringify(state)};`,
                ),
                loader: 'ts',
              };
            });
          },
        },
      ],
    });
  const historical = materializeHistoricalBundle(
    decodeHistoricalBundle(await readFile(HISTORICAL_FIXTURE)),
    state,
  );
  await writeFile(layout.reader, historical, { mode: 0o755 });
  const derivedOldReader = {
    sha256: digestHistoricalBytes(historical),
    byteLength: historical.byteLength,
  };
  const reader = join(staging, 'reader');
  const selected = await buildReader(true);
  const selectedOutput = selected.outputs.at(0);
  if (!selected.success || selected.outputs.length !== 1 || selectedOutput === undefined)
    throw new Error('actual independently built selected reader failed');
  await writeFile(reader, new Uint8Array(await selectedOutput.arrayBuffer()), { mode: 0o755 });
  await initializeOrdinaryEdgePolicy(state);
  await writeFile(join(root, 'config'), 'configuration sentinel');
  await writeFile(join(root, 'unit'), 'service sentinel');
  const account = userInfo();
  const selection = {
    target: {
      hostname: hostname(),
      account: { name: account.username, uid: account.uid, gid: account.gid },
    },
    oldBun: (await captureSolverReaderArtifact(layout.bun)).artifact,
    oldReader: (await captureSolverReaderArtifact(layout.reader)).artifact,
    reader: (await captureSolverReaderArtifact(reader)).artifact,
  };
  const { path: bunPath, ...oldBun } = selection.oldBun;
  const { path: readerPath, ...oldReader } = selection.oldReader;
  expect(bunPath).toBe(layout.bun);
  expect(readerPath).toBe(layout.reader);
  expect(oldReader.sha256).not.toBe(selection.reader.sha256);
  expect(oldReader).toEqual(derivedOldReader);
  return { root, layout, selection: { ...selection, oldBun, oldReader } };
}

test('reader-only transition runs actual old authority then staged and installed checks on the original edge description', async () => {
  const fixture = await transitionFixture();
  const beforeBun = await captureSolverReaderArtifact(fixture.layout.bun);
  const beforeReader = await captureSolverReaderArtifact(fixture.layout.reader);
  console.log(
    '[historical reader tuple] ' +
      JSON.stringify({
        kind: 'old17-logical-closure-with-test-layout-transform',
        containerSHA256: HISTORICAL_CONTAINER_SHA,
        tokenizedBundleSHA256: HISTORICAL_BUNDLE_SHA,
        oldReader: fixture.selection.oldReader,
        selectedBun: beforeBun,
        executingBunVersion: Bun.version,
      }),
  );
  const beforePolicy = await readFile(join(fixture.layout.state, 'edge-policy.json'));
  const beforeLock = await readFile(join(fixture.layout.state, 'edge.lock'));
  const boundaries: string[] = [];
  const children: unknown[][] = [];
  const spawn = Bun.spawn;
  const tap = spyOn(Bun, 'spawn').mockImplementation(((...arguments_: unknown[]) => {
    const argv = arguments_[0];
    if (Array.isArray(argv) && argv[0] === fixture.layout.bun)
      children.push([...(argv as unknown[])]);
    return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
  }) as typeof Bun.spawn);
  try {
    await transitionSolverReader(fixture.selection, fixture.layout, {
      observe: async (boundary) => {
        boundaries.push(boundary);
        const contender = Bun.spawn(
          ['flock', '-n', join(fixture.layout.state, 'edge.lock'), 'sh', '-c', 'exit 0'],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        await new Response(contender.stdout).text();
        await new Response(contender.stderr).text();
        expect(await contender.exited).toBe(1);
      },
    });
  } finally {
    tap.mockRestore();
  }
  expect(children).toEqual([
    [fixture.layout.bun, fixture.layout.reader, '--check-edge-policy-inherited'],
    [
      fixture.layout.bun,
      fixture.selection.reader.path,
      '--check-controller-admission-inherited=legacy',
    ],
    [
      fixture.layout.bun,
      fixture.selection.reader.path,
      '--check-controller-admission-inherited=required',
    ],
    [fixture.layout.bun, fixture.layout.reader, '--check-controller-admission-inherited=legacy'],
    [fixture.layout.bun, fixture.layout.reader, '--check-controller-admission-inherited=required'],
  ]);
  expect((await captureSolverReaderArtifact(fixture.layout.reader)).artifact.sha256).toBe(
    fixture.selection.reader.sha256,
  );
  expect(boundaries).toEqual([
    'old-authority',
    'staged-legacy',
    'staged-required',
    'sibling-ready',
    'published',
    'installed-legacy',
    'installed-required',
  ]);
  const retained = await captureSolverReaderArtifact(
    join(fixture.layout.staging, 'original-reader'),
  );
  expect(retained.artifact.sha256).toBe(fixture.selection.oldReader.sha256);
  expect(retained.mode).toBe(0o600);
  const evidence: unknown = JSON.parse(
    await readFile(join(fixture.layout.staging, 'original-reader.json'), 'utf8'),
  );
  expect(evidence).toMatchObject({ oldReader: beforeReader, oldBun: beforeBun });
  expect(await captureSolverReaderArtifact(fixture.layout.bun)).toEqual(beforeBun);
  expect(await readFile(join(fixture.layout.state, 'edge-policy.json'))).toEqual(beforePolicy);
  expect(await readFile(join(fixture.layout.state, 'edge.lock'))).toEqual(beforeLock);
  expect(await Bun.file(join(fixture.layout.state, 'edge-owner.pending')).exists()).toBe(false);
  expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
  expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
  const contender = Bun.spawn([
    'flock',
    '-n',
    join(fixture.layout.state, 'edge.lock'),
    'sh',
    '-c',
    'exit 0',
  ]);
  expect(await contender.exited).toBe(0);
});

for (const fault of [
  'wrong-old-pin',
  'old-same-byte-replacement',
  'candidate-drift',
  'sibling-drift',
  'postpublication-marker',
] as const) {
  test(`reader-only transition refuses ${fault} without Bun/config/unit replacement`, async () => {
    const fixture = await transitionFixture();
    const beforeBun = await captureSolverReaderArtifact(fixture.layout.bun);
    const beforeReader = await captureSolverReaderArtifact(fixture.layout.reader);
    if (fault === 'wrong-old-pin') fixture.selection.oldReader.sha256 = '0'.repeat(64);
    let delivered = fault === 'wrong-old-pin';
    await rejects(
      transitionSolverReader(fixture.selection, fixture.layout, {
        observe: async (boundary) => {
          if (fault === 'old-same-byte-replacement' && boundary === 'old-authority') {
            const bytes = await readFile(fixture.layout.reader);
            await rename(fixture.layout.reader, join(fixture.root, 'old-reader'));
            await writeFile(fixture.layout.reader, bytes, { mode: 0o755 });
            delivered = true;
          }
          if (fault === 'candidate-drift' && boundary === 'staged-legacy') {
            await writeFile(fixture.selection.reader.path, 'corrupt candidate');
            delivered = true;
          }
          if (fault === 'sibling-drift' && boundary === 'sibling-ready') {
            const fs = await import('node:fs/promises');
            const siblings = (await fs.readdir(join(fixture.root, 'installed'))).filter((name) =>
              name.startsWith('.reader-transition-'),
            );
            expect(siblings.length).toBe(1);
            await writeFile(join(fixture.root, 'installed', siblings[0]), 'corrupt sibling');
            delivered = true;
          }
          if (fault === 'postpublication-marker' && boundary === 'published') {
            await writeFile(join(fixture.layout.state, 'edge-owner.pending'), 'retained marker');
            delivered = true;
          }
        },
      }),
      /reader transition|shared edge owner/,
    );
    expect(delivered).toBe(true);
    expect(await captureSolverReaderArtifact(fixture.layout.bun)).toEqual(beforeBun);
    const afterReader = await lstat(fixture.layout.reader);
    if (fault !== 'old-same-byte-replacement' && fault !== 'postpublication-marker')
      expect(String(afterReader.ino)).toBe(beforeReader.inode);
    if (fault === 'postpublication-marker')
      expect(String(afterReader.ino)).not.toBe(beforeReader.inode);
    expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
    expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
  });
}

test('actual generated transition transport executes pinned operation using unchanged fixed Bun', async () => {
  const fixture = await transitionFixture();
  const { transitionSolverReaderInstallation } = await import('../install-solver-supervisor');
  const { runSolverReaderTransport } = await import('./solver-reader-preparation');
  const before = await captureSolverReaderArtifact(fixture.layout.bun);
  const journal = join(fixture.root, 'generated-child-observations');
  const observer = join(fixture.root, 'observe-generated-children.ts');
  await writeFile(
    observer,
    `import{appendFileSync}from'node:fs';const spawn=Bun.spawn;const sync=Bun.spawnSync;Bun.spawn=function(...parameters){const argv=parameters[0];const selected=Array.isArray(argv)&&argv[0]===${JSON.stringify(fixture.layout.bun)};if(selected){const contender=Reflect.apply(sync,Bun,[['flock','-n',${JSON.stringify(join(fixture.layout.state, 'edge.lock'))},'sh','-c','exit 0'],{stdio:['ignore','pipe','pipe']}]);appendFileSync(${JSON.stringify(journal)},JSON.stringify({argv,contender:contender.exitCode})+'\\n');}const child=Reflect.apply(spawn,Bun,parameters);if(selected)child.exited.then(code=>appendFileSync(${JSON.stringify(journal)},JSON.stringify({code,signal:child.signalCode})+'\\n'));return child;};`,
  );
  const plan = await transitionSolverReaderInstallation(
    { host: 'owned-fixture', execute: true, selection: fixture.selection },
    {
      read: async () => {
        await Promise.resolve();
        throw new Error('configuration must not be read');
      },
      exists: async () => {
        await Promise.resolve();
        throw new Error('normal installer must not be entered');
      },
      hash: async () => {
        await Promise.resolve();
        throw new Error('normal installer must not hash');
      },
      command: async () => {
        await Promise.resolve();
        throw new Error('normal service transport must not run');
      },
      readerCommand: async (argv, finalOperation) => {
        if (argv[0] === 'ssh') {
          if (argv.length !== 3 || argv[1] !== 'owned-fixture')
            throw new Error('unexpected owned SSH transport');
          return runSolverReaderTransport(
            finalOperation
              ? ['env', 'BUN_OPTIONS=--preload=' + observer, 'sh', '-c', argv[2]]
              : ['sh', '-c', argv[2]],
            finalOperation,
          );
        }
        if (argv[0] === 'scp') {
          if (argv.length !== 3 || !argv[2]?.startsWith('owned-fixture:'))
            throw new Error('unexpected owned SCP transport');
          return runSolverReaderTransport(
            ['cp', '--', argv[1], argv[2].slice('owned-fixture:'.length)],
            finalOperation,
          );
        }
        throw new Error('unexpected transition transport');
      },
    },
    { ...fixture.layout, staging: join(fixture.root, 'uploaded') },
  );
  expect(plan).toHaveLength(4);
  const observations: unknown[] = (await readFile(journal, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown);
  expect(observations).toEqual([
    {
      argv: [fixture.layout.bun, fixture.layout.reader, '--check-edge-policy-inherited'],
      contender: 1,
    },
    { code: 0, signal: null },
    {
      argv: [
        fixture.layout.bun,
        join(fixture.root, 'uploaded/reader'),
        '--check-controller-admission-inherited=legacy',
      ],
      contender: 1,
    },
    { code: 0, signal: null },
    {
      argv: [
        fixture.layout.bun,
        join(fixture.root, 'uploaded/reader'),
        '--check-controller-admission-inherited=required',
      ],
      contender: 1,
    },
    { code: 0, signal: null },
    {
      argv: [
        fixture.layout.bun,
        fixture.layout.reader,
        '--check-controller-admission-inherited=legacy',
      ],
      contender: 1,
    },
    { code: 0, signal: null },
    {
      argv: [
        fixture.layout.bun,
        fixture.layout.reader,
        '--check-controller-admission-inherited=required',
      ],
      contender: 1,
    },
    { code: 0, signal: null },
  ]);
  const released = Bun.spawn(
    ['flock', '-n', join(fixture.layout.state, 'edge.lock'), 'sh', '-c', 'exit 0'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  expect((await observeCompatibilityChild(released)).code).toBe(0);
  expect(await captureSolverReaderArtifact(fixture.layout.bun)).toEqual(before);
  expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
  expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
});

test('unknown original reader read retains the real target edge interval until explicit fixture teardown', async () => {
  const fixture = await transitionFixture();
  const beforeReader = await captureSolverReaderArtifact(fixture.layout.reader);
  const program = `import { transitionSolverReader } from ${JSON.stringify(new URL('./solver-reader-transition.ts', import.meta.url).pathname)}; await transitionSolverReader(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}, { afterRead(stream) { if (stream === 'stdout') throw new Error('injected actual read observation failure'); } });`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  let stderr = '';
  const errorTask = (async () => {
    for await (const chunk of child.stderr) stderr += new TextDecoder().decode(chunk);
  })();
  const outputTask = new Response(child.stdout).text();
  let settled = false;
  const waitTask = child.exited.then((code) => {
    settled = true;
    return code;
  });
  try {
    for (let attempt = 0; attempt < 400 && !stderr.includes('HOLD:'); attempt++)
      await Bun.sleep(10);
    expect(stderr).toContain('HOLD: original child/read/EOF remains unknown');
    expect(settled).toBe(false);
    const contender = Bun.spawn([
      'flock',
      '-n',
      join(fixture.layout.state, 'edge.lock'),
      'sh',
      '-c',
      'exit 0',
    ]);
    expect(await contender.exited).toBe(1);
    expect(await captureSolverReaderArtifact(fixture.layout.reader)).toEqual(beforeReader);
    expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
  } finally {
    // This external fixture teardown is never interpreted as successful transition settlement.
    child.kill('SIGTERM');
    await waitTask;
    await outputTask;
    await errorTask;
  }
}, 10000);

test('actual sibling sync failure refuses before the sole reader publication', async () => {
  const fixture = await transitionFixture();
  const before = await captureSolverReaderArtifact(fixture.layout.reader);
  const program = `import * as fs from 'node:fs/promises';import{mock}from'bun:test';const open=fs.open;mock.module('node:fs/promises',()=>({...fs,open:async(path,...options)=>{const descriptor=await open(path,...options);if(String(path).includes('/.reader-transition-'))descriptor.sync=async()=>{await fs.writeFile(${JSON.stringify(join(fixture.root, 'sync-fault-delivered'))},'delivered');throw new Error('injected actual sibling sync failure');};return descriptor;}}));const{transitionSolverReader}=await import(${JSON.stringify(new URL('./solver-reader-transition.ts', import.meta.url).pathname)});let refused=false;try{await transitionSolverReader(${JSON.stringify(fixture.selection)},${JSON.stringify(fixture.layout)});}catch(cause){if(!String(cause).includes('injected actual sibling sync failure'))throw cause;refused=true;}if(!refused)throw new Error('sync failure was not refused');`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(stdout + stderr).toBe('');
  expect(await readFile(join(fixture.root, 'sync-fault-delivered'), 'utf8')).toBe('delivered');
  expect(await captureSolverReaderArtifact(fixture.layout.reader)).toEqual(before);
  expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
  expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
});

test('retained original reader evidence drift refuses before publication without rebasing its bytes', async () => {
  const fixture = await transitionFixture();
  const before = await captureSolverReaderArtifact(fixture.layout.reader);
  let delivered = false;
  await rejects(
    transitionSolverReader(fixture.selection, fixture.layout, {
      observe: async (boundary) => {
        if (boundary === 'sibling-ready') {
          await writeFile(
            join(fixture.layout.staging, 'original-reader'),
            'corrupt retained original',
          );
          delivered = true;
        }
      },
    }),
    /reader transition.*evidence/,
  );
  expect(delivered).toBe(true);
  expect(await captureSolverReaderArtifact(fixture.layout.reader)).toEqual(before);
});

test('actual fixed reader distinguishes legacy and required absence and rejects every non-singleton form before runtime effects', async () => {
  const fixture = await transitionFixture();
  await copyFile(fixture.selection.reader.path, fixture.layout.reader);
  const fs = await import('node:fs/promises');
  await fs.unlink(join(fixture.layout.state, 'edge-policy.json'));
  const { withExistingCanonicalLock } = await import('./lock');
  await withExistingCanonicalLock(join(fixture.layout.state, 'edge.lock'), async (descriptor) => {
    for (const mode of ['legacy', 'required'] as const) {
      const child = Bun.spawn(
        [
          fixture.layout.bun,
          fixture.layout.reader,
          `--check-controller-admission-inherited=${mode}`,
        ],
        {
          env: { ...process.env, WBS_EDGE_STATE: fixture.layout.state, WBS_EDGE_LOCK_FD: '3' },
          stdio: ['ignore', 'pipe', 'pipe', descriptor],
        },
      );
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      const code = await child.exited;
      expect(stdout).toBe('');
      expect(code === 0).toBe(mode === 'legacy');
      if (mode === 'required') expect(stderr).toContain('ordinary controller requires edge policy');
    }
    for (const argv of [
      ['--check-controller-admission-inherited=other'],
      [
        '--check-controller-admission-inherited=legacy',
        '--check-controller-admission-inherited=legacy',
      ],
      [
        '--check-controller-admission-inherited=legacy',
        '--check-controller-admission-inherited=required',
      ],
      ['--check-controller-admission-inherited=legacy', '--config=/PRIVATE_CONFIGURATION_SENTINEL'],
      [
        '--config=/PRIVATE_CONFIGURATION_SENTINEL',
        '--check-controller-admission-inherited=required',
      ],
      [
        '--check-controller-admission-inherited=required',
        '--preflight=dev',
        '--config=/PRIVATE_CONFIGURATION_SENTINEL',
        `--solver-image=registry/solver@sha256:${'a'.repeat(64)}`,
      ],
    ]) {
      const child = Bun.spawn([fixture.layout.bun, fixture.layout.reader, ...argv], {
        env: { ...process.env, WBS_EDGE_STATE: fixture.layout.state, WBS_EDGE_LOCK_FD: '3' },
        stdio: ['ignore', 'pipe', 'pipe', descriptor],
      });
      await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      expect(await child.exited).toBe(1);
      expect(stderr).toMatch(/expected exactly|unknown argument/);
      expect(stderr).not.toContain('ENOENT');
    }
    expect(await Bun.file(join(fixture.layout.state, 'solver-runtime.lock')).exists()).toBe(false);
    expect(await Bun.file(join(fixture.layout.state, 'edge-owner.pending')).exists()).toBe(false);
  });
});

for (const mode of ['legacy', 'required'] as const) {
  test(`actual fixed ${mode} reader refuses missing foreign independent and conflicting-state descriptions`, async () => {
    const fixture = await transitionFixture();
    await copyFile(fixture.selection.reader.path, fixture.layout.reader);
    const fs = await import('node:fs/promises');
    const { withExistingCanonicalLock } = await import('./lock');
    await withExistingCanonicalLock(join(fixture.layout.state, 'edge.lock'), async (descriptor) => {
      const foreign = await fs.open(join(fixture.root, 'foreign.lock'), 'w+', 0o600);
      const independent = await fs.open(join(fixture.layout.state, 'edge.lock'), 'r');
      try {
        for (const shape of ['missing', 'foreign', 'independent', 'conflicting-state'] as const) {
          const inherited =
            shape === 'foreign'
              ? foreign.fd
              : shape === 'independent'
                ? independent.fd
                : descriptor;
          const environment = {
            ...process.env,
            WBS_EDGE_STATE: shape === 'conflicting-state' ? fixture.root : fixture.layout.state,
            WBS_EDGE_LOCK_FD: shape === 'missing' ? undefined : '3',
          };
          const child = Bun.spawn(
            [
              fixture.layout.bun,
              fixture.layout.reader,
              `--check-controller-admission-inherited=${mode}`,
            ],
            { env: environment, stdio: ['ignore', 'pipe', 'pipe', inherited] },
          );
          await new Response(child.stdout).text();
          const stderr = await new Response(child.stderr).text();
          expect(await child.exited).not.toBe(0);
          expect(stderr).toMatch(
            /inherited shared edge descriptor|does not name|shared edge lock held|fixed canonical state/,
          );
        }
      } finally {
        await foreign.close();
        await independent.close();
      }
      expect(await Bun.file(join(fixture.layout.state, 'solver-runtime.lock')).exists()).toBe(
        false,
      );
    });
  });
}

for (const fault of [
  'old-unsupported',
  'new-unsupported',
  'parent-drift',
  'required-absent',
  'active',
  'restoring',
  'marker',
] as const) {
  test(`reader-only transition refuses ${fault} and retains installed or foreign bytes`, async () => {
    const fixture = await transitionFixture();
    const before = await captureSolverReaderArtifact(fixture.layout.reader);
    const beforeBun = await captureSolverReaderArtifact(fixture.layout.bun);
    const fs = await import('node:fs/promises');
    if (fault === 'old-unsupported') {
      await writeFile(
        fixture.layout.reader,
        'throw new Error("selected old reader does not support inherited flag");\n',
      );
      const selected = await captureSolverReaderArtifact(fixture.layout.reader);
      fixture.selection.oldReader = {
        sha256: selected.artifact.sha256,
        byteLength: selected.artifact.byteLength,
      };
    }
    if (fault === 'new-unsupported') {
      await writeFile(
        fixture.selection.reader.path,
        'throw new Error("selected new reader lacks controller capability");\n',
      );
      fixture.selection.reader = (
        await captureSolverReaderArtifact(fixture.selection.reader.path)
      ).artifact;
    }
    if (fault === 'required-absent')
      await fs.unlink(join(fixture.layout.state, 'edge-policy.json'));
    if (fault === 'active' || fault === 'restoring')
      await writeFile(
        join(fixture.layout.state, 'edge-policy.json'),
        JSON.stringify({
          format: 'dependency-edge-policy',
          version: 1,
          phase: fault,
          edgeState: fixture.layout.state,
          ownerPublicationSha256: 'a'.repeat(64),
          ...(fault === 'active'
            ? {
                handoff: {
                  name: 'edge-owner-123456-handoff-complete.json',
                  sha256: 'b'.repeat(64),
                },
              }
            : {
                restorationIntent: {
                  name: 'edge-owner-123456-solver-restore-intent.json',
                  sha256: 'b'.repeat(64),
                },
              }),
        }),
      );
    if (fault === 'marker')
      await writeFile(join(fixture.layout.state, 'edge-owner.pending'), 'retained marker');
    const boundaries: string[] = [];
    await rejects(
      transitionSolverReader(fixture.selection, fixture.layout, {
        observe: async (boundary) => {
          boundaries.push(boundary);
          if (fault === 'parent-drift' && boundary === 'old-authority') {
            await rename(join(fixture.root, 'installed'), join(fixture.root, 'retained-installed'));
            await mkdir(join(fixture.root, 'installed'), { mode: 0o700 });
            await writeFile(fixture.layout.reader, 'foreign reader sentinel', { mode: 0o755 });
            await writeFile(fixture.layout.bun, 'foreign Bun sentinel', { mode: 0o755 });
          }
        },
      }),
      fault === 'parent-drift'
        ? /original parent changed/
        : /reader transition child refused|ordinary controller|shared edge owner/,
    );
    expect(boundaries).toEqual(
      fault === 'new-unsupported' || fault === 'parent-drift' ? ['old-authority'] : [],
    );
    if (fault === 'parent-drift') {
      expect(await readFile(fixture.layout.reader, 'utf8')).toBe('foreign reader sentinel');
      expect(await readFile(fixture.layout.bun, 'utf8')).toBe('foreign Bun sentinel');
      expect(
        (
          await captureSolverReaderArtifact(
            join(fixture.root, 'retained-installed', 'solver-supervisor.js'),
          )
        ).artifact.sha256,
      ).toBe(before.artifact.sha256);
    } else {
      expect(await captureSolverReaderArtifact(fixture.layout.bun)).toEqual(beforeBun);
      expect((await captureSolverReaderArtifact(fixture.layout.reader)).artifact.sha256).toBe(
        fault === 'old-unsupported' ? fixture.selection.oldReader.sha256 : before.artifact.sha256,
      );
    }
    expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
    expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
    expect(await Bun.file(join(fixture.layout.state, 'solver-runtime.lock')).exists()).toBe(false);
  });
}

test('reader transition original operation deadline cannot renew after its actual old child settles', async () => {
  const fixture = await transitionFixture();
  let now = 0;
  const boundaries: string[] = [];
  await rejects(
    transitionSolverReader(fixture.selection, fixture.layout, {
      clock: { now: () => now, pause: (milliseconds) => Bun.sleep(milliseconds) },
      observe: async (boundary) => {
        await Promise.resolve();
        boundaries.push(boundary);
        if (boundary === 'old-authority') now = 180000;
      },
    }),
    /operation deadline expired/,
  );
  expect(boundaries).toEqual(['old-authority']);
  expect((await captureSolverReaderArtifact(fixture.layout.reader)).artifact.sha256).toBe(
    fixture.selection.oldReader.sha256,
  );
});

test('same-byte sibling replacement during actual sync refuses before reader publication', async () => {
  const fixture = await transitionFixture();
  const before = await captureSolverReaderArtifact(fixture.layout.reader);
  const fault = join(fixture.root, 'same-byte-sync-fault');
  const program = `import * as fs from 'node:fs/promises';import{mock}from'bun:test';const open=fs.open;mock.module('node:fs/promises',()=>({...fs,open:async(path,...options)=>{const descriptor=await open(path,...options);if(String(path).includes('/.reader-transition-')){const sync=descriptor.sync.bind(descriptor);descriptor.sync=async()=>{await sync();await fs.rename(path,String(path)+'.original');await fs.copyFile(${JSON.stringify(fixture.selection.reader.path)},path);await fs.chmod(path,0o755);await fs.writeFile(${JSON.stringify(fault)},'delivered');};}return descriptor;}}));const{transitionSolverReader}=await import(${JSON.stringify(new URL('./solver-reader-transition.ts', import.meta.url).pathname)});try{await transitionSolverReader(${JSON.stringify(fixture.selection)},${JSON.stringify(fixture.layout)});}catch(cause){console.error(String(cause));process.exitCode=1;}`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const observations = await Promise.allSettled([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  for (const observation of observations)
    if (observation.status === 'rejected') throw observation.reason;
  expect(await readFile(fault, 'utf8')).toBe('delivered');
  expect(child.exitCode).not.toBe(0);
  expect(await captureSolverReaderArtifact(fixture.layout.reader)).toEqual(before);
  expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
});

test('transition transport refuses invalid old runtime identity before executing it', async () => {
  const { transitionSolverReaderInstallation } = await import('../install-solver-supervisor');
  const { runSolverReaderTransport } = await import('./solver-reader-preparation');
  const outcomes: { fault: string; delivered: boolean; executed: boolean; refused: boolean }[] = [];
  for (const fault of ['mode', 'ancestor'] as const) {
    const fixture = await transitionFixture();
    const marker = join(fixture.root, 'old-runtime-executed');
    const preload = join(fixture.root, 'observe-runtime.ts');
    await writeFile(preload, `await Bun.write(${JSON.stringify(marker)}, 'executed');`);
    let delivered = false;
    let refused = false;
    try {
      await transitionSolverReaderInstallation(
        { host: 'owned-fixture', execute: true, selection: fixture.selection },
        {
          read: () => Promise.reject(new Error('unexpected service config read')),
          exists: () => Promise.reject(new Error('unexpected normal installer')),
          hash: () => Promise.reject(new Error('unexpected normal installer hash')),
          command: () => Promise.reject(new Error('unexpected service transport')),
          readerCommand: async (argv, finalOperation) => {
            if (argv[0] === 'ssh' && argv.length === 3 && argv[1] === 'owned-fixture') {
              if (finalOperation) {
                if (fault === 'mode') await chmod(fixture.layout.bun, 0o775);
                else {
                  const installed = join(fixture.root, 'installed');
                  await rename(installed, installed + '-original');
                  await symlink(installed + '-original', installed);
                }
                delivered = true;
              }
              return runSolverReaderTransport(
                ['env', 'BUN_OPTIONS=--preload=' + preload, 'sh', '-c', argv[2]],
                finalOperation,
              );
            }
            if (argv[0] === 'scp' && argv.length === 3 && argv[2]?.startsWith('owned-fixture:'))
              return runSolverReaderTransport(
                ['cp', '--', argv[1], argv[2].slice('owned-fixture:'.length)],
                finalOperation,
              );
            throw new Error('unexpected owned transport argv');
          },
        },
        { ...fixture.layout, staging: join(fixture.root, 'uploaded') },
      );
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      expect(String(cause.cause)).toMatch(
        /first-reader child failed: exit=1 signal=null expired=false/,
      );
      refused = true;
    }
    outcomes.push({ fault, delivered, executed: await Bun.file(marker).exists(), refused });
  }
  expect(outcomes).toEqual([
    { fault: 'mode', delivered: true, executed: false, refused: true },
    { fault: 'ancestor', delivered: true, executed: false, refused: true },
  ]);
});

async function observeCompatibilityChild(child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>) {
  const [stdout, stderr, code] = await Promise.allSettled([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ] as const);
  if (
    stdout.status !== 'fulfilled' ||
    stderr.status !== 'fulfilled' ||
    code.status !== 'fulfilled'
  ) {
    console.error('[historical fixture] HOLD: original child/read/EOF remains unknown');
    for (;;) await Bun.sleep(1000);
  }
  expect(child.signalCode).toBeNull();
  return { stdout: stdout.value, stderr: stderr.value, code: code.value };
}

test('historical reader accepts only its old inherited authority under the original edge description', async () => {
  const fixture = await transitionFixture();
  const opening = await captureSolverReaderArtifact(fixture.layout.reader);
  await withExistingCanonicalLock(join(fixture.layout.state, 'edge.lock'), async (descriptor) => {
    for (const [flag, admitted] of [
      ['--check-edge-policy-inherited', true],
      ['--check-controller-admission-inherited=legacy', false],
      ['--check-controller-admission-inherited=required', false],
    ] as const) {
      const child = Bun.spawn([fixture.layout.bun, fixture.layout.reader, flag], {
        env: {
          ...process.env,
          WBS_ENV: 'prod',
          WBS_EDGE_STATE: fixture.layout.state,
          WBS_EDGE_LOCK_FD: '3',
        },
        stdio: ['ignore', 'pipe', 'pipe', descriptor],
      });
      const observed = await observeCompatibilityChild(child);
      expect(observed.code === 0).toBe(admitted);
      if (!admitted)
        expect(observed.stderr).toContain(
          'solver supervisor: expected exactly --config=/absolute/path',
        );
      const contender = Bun.spawn(
        ['flock', '-n', join(fixture.layout.state, 'edge.lock'), 'sh', '-c', 'exit 0'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      expect((await observeCompatibilityChild(contender)).code).toBe(1);
    }
    const policy = join(fixture.layout.state, 'edge-policy.json');
    const ordinary = await readFile(policy);
    for (const fault of ['required-absent', 'active', 'restoring', 'marker'] as const) {
      if (fault === 'required-absent') await unlink(policy);
      if (fault === 'marker')
        await writeFile(join(fixture.layout.state, 'edge-owner.pending'), 'owned fault');
      if (fault === 'active' || fault === 'restoring')
        await writeFile(
          policy,
          JSON.stringify({
            format: 'dependency-edge-policy',
            version: 1,
            phase: fault,
            edgeState: fixture.layout.state,
            ownerPublicationSha256: 'a'.repeat(64),
            ...(fault === 'active'
              ? {
                  handoff: {
                    name: 'edge-owner-123456-handoff-complete.json',
                    sha256: 'b'.repeat(64),
                  },
                }
              : {
                  restorationIntent: {
                    name: 'edge-owner-123456-solver-restore-intent.json',
                    sha256: 'b'.repeat(64),
                  },
                }),
          }),
        );
      try {
        const child = Bun.spawn(
          [fixture.layout.bun, fixture.layout.reader, '--check-edge-policy-inherited'],
          {
            env: {
              ...process.env,
              WBS_ENV: 'prod',
              WBS_EDGE_STATE: fixture.layout.state,
              WBS_EDGE_LOCK_FD: '3',
            },
            stdio: ['ignore', 'pipe', 'pipe', descriptor],
          },
        );
        expect((await observeCompatibilityChild(child)).code).not.toBe(0);
        const contender = Bun.spawn(
          ['flock', '-n', join(fixture.layout.state, 'edge.lock'), 'sh', '-c', 'exit 0'],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        expect((await observeCompatibilityChild(contender)).code).toBe(1);
      } finally {
        await writeFile(policy, ordinary);
        if (fault === 'marker') await unlink(join(fixture.layout.state, 'edge-owner.pending'));
      }
    }
  });
  expect(await captureSolverReaderArtifact(fixture.layout.reader)).toEqual(opening);
  expect(await readFile(join(fixture.root, 'config'), 'utf8')).toBe('configuration sentinel');
  expect(await readFile(join(fixture.root, 'unit'), 'utf8')).toBe('service sentinel');
});

test('historical reader refuses missing foreign and independently opened descriptors under a real holder', async () => {
  const fixture = await transitionFixture();
  const foreign = join(fixture.root, 'foreign.lock');
  await writeFile(foreign, '');
  await withExistingCanonicalLock(join(fixture.layout.state, 'edge.lock'), async () => {
    for (const path of [undefined, foreign, join(fixture.layout.state, 'edge.lock')]) {
      const independentlyOpened = path === undefined ? undefined : await open(path, 'r');
      try {
        const child = Bun.spawn(
          [fixture.layout.bun, fixture.layout.reader, '--check-edge-policy-inherited'],
          {
            env: {
              ...process.env,
              WBS_ENV: 'prod',
              WBS_EDGE_STATE: fixture.layout.state,
              WBS_EDGE_LOCK_FD: independentlyOpened === undefined ? undefined : '3',
            },
            stdio: ['ignore', 'pipe', 'pipe', independentlyOpened?.fd ?? 'ignore'],
          },
        );
        const observed = await observeCompatibilityChild(child);
        expect(observed.code).not.toBe(0);
        expect(observed.stderr).toContain(
          path === undefined
            ? 'requires an inherited shared edge descriptor'
            : path === foreign
              ? 'inherited shared edge lock does not name'
              : 'shared edge lock held:',
        );
        const contender = Bun.spawn(
          ['flock', '-n', join(fixture.layout.state, 'edge.lock'), 'sh', '-c', 'exit 0'],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        expect((await observeCompatibilityChild(contender)).code).toBe(1);
      } finally {
        await independentlyOpened?.close();
      }
    }
  });
});

test('historical reader fixture corruption refuses before any child', async () => {
  const fixture = await transitionFixture();
  const container = await readFile(HISTORICAL_FIXTURE);
  const corruptContainer = Buffer.from(container);
  corruptContainer.writeUInt8(corruptContainer.readUInt8(0) ^ 1, 0);
  const corruptBundle = decodeHistoricalBundle(container);
  corruptBundle.writeUInt8(corruptBundle.readUInt8(0) ^ 1, 0);
  let children = 0;
  const spawn = Bun.spawn;
  const observer = spyOn(Bun, 'spawn').mockImplementation(((...argv: unknown[]) => {
    children++;
    return Reflect.apply(spawn, Bun, argv) as ReturnType<typeof Bun.spawn>;
  }) as typeof Bun.spawn);
  try {
    expect(() => decodeHistoricalBundle(corruptContainer)).toThrow('container hash differs');
    expect(() => materializeHistoricalBundle(corruptBundle, fixture.layout.state)).toThrow(
      'decoded bundle hash or size differs',
    );
    expect(children).toBe(0);
  } finally {
    observer.mockRestore();
  }
});
