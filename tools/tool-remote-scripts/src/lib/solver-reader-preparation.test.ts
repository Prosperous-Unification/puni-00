import { rejects } from 'node:assert/strict';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { initializeOrdinaryEdgePolicy } from './edge-policy';
import { readClosed } from './managed-cohort';
import {
  prepareSolverReader,
  runSolverReaderTransport,
  type SolverReaderClock,
  type SolverReaderConstruction,
} from './solver-reader-preparation';
import { buildSolverReaderPreparationBundle } from './solver-supervisor-install-operation';

const initializer = resolve(import.meta.dir, '../initialize-edge-policy.ts');

async function preparationFixture() {
  const root = scratchSync('solver-reader-whole-');
  const state = join(root, 'state');
  const staging = join(root, 'stage');
  const installed = join(root, 'installed');
  for (const directory of [state, staging, installed]) await mkdir(directory, { mode: 0o700 });
  await link(process.execPath, join(staging, 'bun'));
  for (const [source, name] of [
    [resolve(import.meta.dir, '../solver-supervisor.ts'), 'reader.js'],
    [initializer, 'initializer.js'],
  ]) {
    const build = await Bun.build({
      entrypoints: [source],
      target: 'bun',
      plugins: [
        {
          name: 'fixed-reader-fixture',
          setup(build) {
            build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => ({
              contents: (await Bun.file(file.path).text()).replace(
                "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';",
                `export const SOLVER_READER_STATE = ${JSON.stringify(state)};`,
              ),
              loader: 'ts',
            }));
          },
        },
      ],
    });
    if (!build.success || build.outputs.length !== 1)
      throw new Error('fixture artifact build failed');
    await writeFile(join(staging, name), new Uint8Array(await build.outputs[0].arrayBuffer()), {
      mode: 0o755,
    });
  }
  const artifact = async (name: string) => {
    const path = join(staging, name);
    const bytes = await readFile(path);
    return {
      path,
      sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length,
    };
  };
  const account = userInfo();
  const selection = {
    target: {
      hostname: hostname(),
      account: { name: account.username, uid: account.uid, gid: account.gid },
      freshness: 'independently-designated-fresh' as const,
    },
    bun: await artifact('bun'),
    reader: await artifact('reader.js'),
    initializer: await artifact('initializer.js'),
  };
  const layout = {
    state,
    staging,
    bun: join(installed, 'bun'),
    reader: join(installed, 'solver-supervisor.js'),
  };
  return {
    root,
    state,
    staging,
    selection,
    layout,
    run: (observe?: (boundary: string) => Promise<void>, construction?: SolverReaderConstruction) =>
      prepareSolverReader(selection, layout, observe, construction),
  };
}

test('whole operation refuses original same-byte policy replacement after actual initializer join', async () => {
  const fixture = await preparationFixture();
  let initialized = 0;
  await rejects(
    fixture.run(async (boundary) => {
      if (boundary !== 'initialized') return;
      initialized++;
      const path = join(fixture.state, 'edge-policy.json');
      const contents = await readFile(path);
      await rename(path, join(fixture.root, 'retained-policy'));
      await writeFile(path, contents, { mode: 0o600 });
    }),
    /original identity changed/,
  );
  expect(initialized).toBe(1);
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
});

test('whole operation publishes only two files and executes installed required-policy consumer under real lock', async () => {
  const fixture = await preparationFixture();
  const observed: string[] = [];
  await fixture.run(async (boundary) => {
    observed.push(boundary);
    if (boundary === 'staged' || boundary === 'installed') {
      const contender = Bun.spawn(['flock', '-n', join(fixture.state, 'edge.lock'), 'true'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [code] = await Promise.all([
        contender.exited,
        new Response(contender.stdout).text(),
        new Response(contender.stderr).text(),
      ]);
      expect(code).toBe(1);
    }
  });
  expect(observed).toEqual([
    'initialized',
    'staged',
    'siblings',
    'published-bun',
    'published-reader',
    'installed',
  ]);
  for (const path of [fixture.layout.bun, fixture.layout.reader])
    expect((await lstat(path)).mode & 0o777).toBe(0o755);
  expect(await Bun.file(join(fixture.root, 'installed/config.json')).exists()).toBe(false);
  expect(await Bun.spawn(['flock', '-n', join(fixture.state, 'edge.lock'), 'true']).exited).toBe(0);
});

test('generated preparation bundle executes the same actual two-file operation in an owned root', async () => {
  const fixture = await preparationFixture();
  const operations = await import('./solver-supervisor-install-operation');
  const built = await buildSolverReaderPreparationBundle(fixture.selection, fixture.layout);
  const bytes = built.bytes;
  expect(
    built.inputs.some((input) => input.artifact.path.endsWith('/solver-reader-preparation.ts')),
  ).toBe(true);
  expect(built.bunVersion).toBe('1.4.4');
  const path = join(fixture.staging, 'operation.js');
  await writeFile(path, bytes, { mode: 0o600 });
  const execution = operations.buildSolverReaderPreparationExecution(fixture.selection, {
    path,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  });
  const child = Bun.spawn(['sh', '-c', execution], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, signal: child.signalCode, stderr }).toEqual({ code: 0, signal: null, stderr: '' });
  expect(stdout.split('OK').length).toBe(5);
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(true);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(true);
});

for (const retained of [
  'edge-policy.json',
  'edge-owner.json',
  'edge-owner.pending',
  'bun',
  'reader',
]) {
  test(`whole preparation refuses retained ${retained} before initialization and publication`, async () => {
    const fixture = await preparationFixture();
    const path =
      retained === 'bun'
        ? fixture.layout.bun
        : retained === 'reader'
          ? fixture.layout.reader
          : join(fixture.state, retained);
    await writeFile(path, 'retained');
    let entered = false;
    await rejects(
      fixture.run(() => {
        entered = true;
        return Promise.resolve();
      }),
      /existing state/,
    );
    expect(entered).toBe(false);
    expect(await readFile(path, 'utf8')).toBe('retained');
    if (retained !== 'edge-policy.json')
      expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
  });
}

for (const fault of [
  'missing-lock',
  'changed-lock',
  'changed-parent',
  'missing-receipt',
  'malformed-receipt',
  'extra-receipt-field',
  'public-receipt',
  'changed-receipt-attempt',
]) {
  test(`whole preparation refuses ${fault} after actual initializer without publication or lock recreation`, async () => {
    const fixture = await preparationFixture();
    await rejects(
      fixture.run(async (boundary) => {
        if (boundary !== 'initialized') return;
        if (fault === 'missing-lock') await unlink(join(fixture.state, 'edge.lock'));
        else if (fault === 'changed-lock') {
          await rename(join(fixture.state, 'edge.lock'), join(fixture.root, 'original-lock'));
          await writeFile(join(fixture.state, 'edge.lock'), 'replacement');
        } else if (fault === 'changed-parent') {
          await rename(fixture.state, join(fixture.root, 'original-state'));
          await mkdir(fixture.state, { mode: 0o700 });
          for (const name of ['edge.lock', 'edge-policy.json'])
            await link(join(fixture.root, 'original-state', name), join(fixture.state, name));
        } else {
          const name = (await readdir(fixture.staging)).find((name) => name.startsWith('origin-'));
          if (name === undefined) throw new Error('real initializer receipt absent');
          const path = join(fixture.staging, name);
          if (fault === 'missing-receipt') await unlink(path);
          else if (fault === 'malformed-receipt') await writeFile(path, '{');
          else if (fault === 'public-receipt') await chmod(path, 0o644);
          else {
            const receipt: unknown = JSON.parse(await readFile(path, 'utf8'));
            const fields = readClosed(receipt, [
              'format',
              'version',
              'attemptId',
              'edgeState',
              'parent',
              'lock',
              'policy',
            ]);
            if (fault === 'extra-receipt-field') fields['extra'] = 'unknown';
            else fields['attemptId'] = crypto.randomUUID();
            await writeFile(path, JSON.stringify(fields));
          }
        }
      }),
    );
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    if (fault === 'missing-lock')
      expect(await Bun.file(join(fixture.state, 'edge.lock')).exists()).toBe(false);
  });
}

for (const fault of [
  'destination-race',
  'sibling-corruption',
  'staged-corruption',
  'partial-publication',
  'installed-corruption',
  'installed-replacement',
]) {
  test(`whole exclusive publisher retains safe state on ${fault}`, async () => {
    const fixture = await preparationFixture();
    await rejects(
      fixture.run(async (boundary) => {
        if (fault === 'destination-race' && boundary === 'published-bun')
          await writeFile(fixture.layout.reader, 'racing reader');
        if (fault === 'staged-corruption' && boundary === 'staged') {
          const contents = await readFile(fixture.selection.reader.path, 'utf8');
          await writeFile(
            fixture.selection.reader.path,
            contents.replace('ordinary edge policy ok', 'ordinary edge policy NO'),
          );
        }
        if (fault === 'sibling-corruption' && boundary === 'siblings') {
          const name = (await readdir(join(fixture.root, 'installed'))).find((name) =>
            name.endsWith('-1'),
          );
          if (name === undefined) throw new Error('owned sibling absent');
          const path = join(fixture.root, 'installed', name);
          const contents = await readFile(path, 'utf8');
          await writeFile(
            path,
            contents.replace('ordinary edge policy ok', 'ordinary edge policy NO'),
          );
        }
        if (fault === 'partial-publication' && boundary === 'published-bun')
          throw new Error('attended interruption after Bun');
        if (fault === 'installed-corruption' && boundary === 'published-reader') {
          const contents = await readFile(fixture.layout.reader, 'utf8');
          await writeFile(
            fixture.layout.reader,
            contents.replace('ordinary edge policy ok', 'ordinary edge policy NO'),
          );
        }
        if (fault === 'installed-replacement' && boundary === 'published-reader') {
          const contents = await readFile(fixture.layout.reader);
          await rename(fixture.layout.reader, join(fixture.root, 'original-reader'));
          await writeFile(fixture.layout.reader, contents, { mode: 0o755 });
        }
      }),
    );
    expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
    if (fault === 'destination-race')
      expect(await readFile(fixture.layout.reader, 'utf8')).toBe('racing reader');
    if (fault === 'partial-publication') {
      expect(await Bun.file(fixture.layout.bun).exists()).toBe(true);
      expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    }
    if (fault === 'sibling-corruption' || fault === 'staged-corruption') {
      expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
      expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    }
  });
}

test('preparation refuses an account not independently designated as this fresh target before effects', async () => {
  const fixture = await preparationFixture();
  fixture.selection.target.account.name = 'foreign-account';
  await rejects(fixture.run(), /selected fresh target\/account differs/);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
});

test('preparation refuses canonical-state symlink before initializing', async () => {
  const fixture = await preparationFixture();
  await rename(fixture.state, join(fixture.root, 'real-state'));
  await symlink(join(fixture.root, 'real-state'), fixture.state);
  await rejects(fixture.run(), /ancestry/);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
});

test('explicit preparation establishes only missing canonical state and reader parents', async () => {
  const fixture = await preparationFixture();
  await rm(fixture.state, { recursive: true });
  await rm(join(fixture.root, 'installed'), { recursive: true });
  await fixture.run();
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
  expect((await readdir(join(fixture.root, 'installed'))).sort()).toEqual([
    'bun',
    'solver-supervisor.js',
  ]);
});

for (const failure of [
  'initializer-exit',
  'initializer-signal',
  'staged-strict-refusal',
] as const) {
  test(`required original child settlement refuses ${failure} without reader publication`, async () => {
    const fixture = await preparationFixture();
    const artifact =
      failure === 'staged-strict-refusal'
        ? fixture.selection.reader
        : fixture.selection.initializer;
    const original = await readFile(artifact.path, 'utf8');
    const contents =
      failure === 'initializer-exit'
        ? `${original}\nprocess.exitCode = 42;`
        : failure === 'initializer-signal'
          ? `${original}\nprocess.on('beforeExit', () => process.kill(process.pid, 'SIGTERM'));`
          : `if (process.argv[2] === '--check-edge-policy') throw new Error('staged strict policy refusal');\n${original}`;
    await writeFile(artifact.path, contents);
    artifact.byteLength = Buffer.byteLength(contents);
    artifact.sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex');
    const boundaries: string[] = [];
    await rejects(
      fixture.run((boundary) => {
        boundaries.push(boundary);
        return Promise.resolve();
      }),
      /first-reader child failed/,
    );
    expect(boundaries).toEqual(failure === 'staged-strict-refusal' ? ['initialized'] : []);
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
  });
}

test('existing original lock contention immediately refuses preparation without touching holder evidence', async () => {
  const fixture = await preparationFixture();
  let holder: Bun.PipedSubprocess | undefined;
  let stdout: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let retained = '';
  try {
    await rejects(
      fixture.run(async (boundary) => {
        if (boundary !== 'initialized') return;
        retained = await readFile(join(fixture.state, 'edge.lock'), 'utf8');
        holder = Bun.spawn(
          [
            'flock',
            '-n',
            join(fixture.state, 'edge.lock'),
            process.execPath,
            '-e',
            `console.log('held'); await new Response(Bun.stdin.stream()).text();`,
          ],
          { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
        );
        const reader = holder.stdout.getReader();
        stdout = reader;
        const first = await reader.read();
        expect(new TextDecoder().decode(first.value)).toBe('held\n');
      }),
      /existing canonical lock held/,
    );
    expect(await readFile(join(fixture.state, 'edge.lock'), 'utf8')).toBe(retained);
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  } finally {
    if (holder !== undefined && stdout !== undefined) {
      await holder.stdin.end();
      expect((await stdout.read()).done).toBe(true);
      stdout.releaseLock();
      const [code, stderr] = await Promise.all([holder.exited, new Response(holder.stderr).text()]);
      expect({ code, signal: holder.signalCode, stderr }).toEqual({
        code: 0,
        signal: null,
        stderr: '',
      });
    }
  }
});

for (const unreadable of ['state', 'reader', 'receipt'] as const) {
  test(`preparation refuses unreadable ${unreadable} independently of absence`, async () => {
    const fixture = await preparationFixture();
    let changed = '';
    try {
      if (unreadable !== 'receipt') {
        changed = unreadable === 'state' ? fixture.state : fixture.selection.reader.path;
        await chmod(changed, unreadable === 'state' ? 0o111 : 0o000);
      }
      await rejects(
        fixture.run(async (boundary) => {
          if (unreadable !== 'receipt' || boundary !== 'initialized') return;
          const name = (await readdir(fixture.staging)).find((name) => name.startsWith('origin-'));
          if (name === undefined) throw new Error('required real receipt absent');
          changed = join(fixture.staging, name);
          await chmod(changed, 0o000);
        }),
      );
      expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
      expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    } finally {
      if (changed !== '')
        await chmod(
          changed,
          unreadable === 'state' ? 0o700 : unreadable === 'receipt' ? 0o600 : 0o755,
        );
    }
  });
}

test('whole preparation joins execution of the actual installed pair after staged success', async () => {
  const fixture = await preparationFixture();
  const witness = join(fixture.root, 'installed-reader-executed');
  const contents = `import { writeFileSync as recordInstalledExecution } from 'node:fs';
${await readFile(fixture.selection.reader.path, 'utf8')}
process.on('beforeExit', () => { if (process.argv[2] === '--check-edge-policy-inherited') recordInstalledExecution(${JSON.stringify(witness)}, JSON.stringify([process.execPath, process.argv[1]])); });`;
  await writeFile(fixture.selection.reader.path, contents);
  fixture.selection.reader.byteLength = Buffer.byteLength(contents);
  fixture.selection.reader.sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex');
  await fixture.run();
  expect(JSON.parse(await readFile(witness, 'utf8'))).toEqual([
    fixture.layout.bun,
    fixture.layout.reader,
  ]);
});

test('existing installer generated first-reader transport reaches the genuine local operation without network or service effects', async () => {
  const fixture = await preparationFixture();
  const installer = await import('../install-solver-supervisor');
  const host = 'fixture-reader-target';
  const staging = join(fixture.root, 'transport');
  const selection = fixture.selection;
  const argv = [
    '--prepare-first-reader',
    '--execute',
    `--host=${host}`,
    `--target-hostname=${selection.target.hostname}`,
    `--account=${selection.target.account.name}`,
    `--uid=${String(selection.target.account.uid)}`,
    `--gid=${String(selection.target.account.gid)}`,
    '--fresh-target=independently-designated-fresh',
    ...(['bun', 'reader', 'initializer'] as const).flatMap((name) => [
      `--${name}=${selection[name].path}`,
      `--${name}-sha256=${selection[name].sha256}`,
      `--${name}-bytes=${String(selection[name].byteLength)}`,
    ]),
  ];
  let uploads = 0;
  const plan = await installer.runSolverSupervisorInstaller(
    argv,
    {
      read: () => Promise.reject(new Error('normal config path reached')),
      exists: () => Promise.reject(new Error('normal file path reached')),
      hash: () => Promise.reject(new Error('unrelated pathname hash reached')),
      command: () => Promise.reject(new Error('normal command path reached')),
      readerCommand: async (command, finalOperation) => {
        if (command[0] === 'scp') {
          if (!command[2].startsWith(`${host}:`)) throw new Error('transport target differs');
          await copyFile(command[1], command[2].slice(host.length + 1));
          uploads++;
          return { code: 0, signal: null, stdout: '', stderr: '' };
        }
        return runSolverReaderTransport(
          command[0] === 'ssh' ? ['sh', '-c', command[2]] : command,
          finalOperation,
        );
      },
    },
    { ...fixture.layout, staging },
  );
  expect(uploads).toBe(3);
  expect(plan.filter((step) => step.argv[0] === 'scp')).toHaveLength(3);
  expect((await readdir(join(fixture.root, 'installed'))).sort()).toEqual([
    'bun',
    'solver-supervisor.js',
  ]);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
});

test('late second-sibling corruption refuses before linking reader and retains published Bun', async () => {
  const fixture = await preparationFixture();
  await rejects(
    fixture.run(async (boundary) => {
      if (boundary !== 'published-bun') return;
      const name = (await readdir(join(fixture.root, 'installed'))).find((name) =>
        name.endsWith('-1'),
      );
      if (name === undefined) throw new Error('retained reader sibling absent');
      const path = join(fixture.root, 'installed', name);
      const contents = await readFile(path, 'utf8');
      await writeFile(path, contents.replace('ordinary edge policy ok', 'ordinary edge policy NO'));
    }),
    /artifact hash differs/,
  );
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(true);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
});

async function replaceFixtureArtifact(
  artifact: { path: string; sha256: string; byteLength: number },
  contents: string,
): Promise<void> {
  await writeFile(artifact.path, contents);
  artifact.byteLength = Buffer.byteLength(contents);
  artifact.sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex');
}

async function waitForFixture(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 3000;
  while (!(await predicate())) {
    if (performance.now() >= deadline)
      throw new Error('owned fixture did not reach its observed boundary');
    await Bun.sleep(5);
  }
}

test('valid retained ordinary policy refuses first preparation without replacing its bytes or identity', async () => {
  const fixture = await preparationFixture();
  await initializeOrdinaryEdgePolicy(fixture.state);
  const path = join(fixture.state, 'edge-policy.json');
  const before = await lstat(path, { bigint: true });
  const contents = await readFile(path);
  await rejects(fixture.run(), /first-reader preparation refuses existing state/);
  expect(await readFile(path)).toEqual(contents);
  expect((await lstat(path, { bigint: true })).ino).toBe(before.ino);
  expect((await readdir(fixture.staging)).some((name) => name.startsWith('origin-'))).toBe(false);
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
});

for (const cleanup of ['changed', 'missing'] as const) {
  test(`primary failure preserves ${cleanup} unpublished cleanup evidence and both errors`, async () => {
    const fixture = await preparationFixture();
    let retained = '';
    await rejects(
      fixture.run(async (boundary) => {
        if (boundary !== 'siblings') return;
        const name = (await readdir(join(fixture.root, 'installed'))).find((name) =>
          name.endsWith('-1'),
        );
        if (name === undefined) throw new Error('owned cleanup sibling absent');
        retained = join(fixture.root, 'installed', name);
        await rename(retained, join(fixture.root, 'owned-reader-retained'));
        if (cleanup === 'changed') await writeFile(retained, 'foreign cleanup evidence');
        throw new Error('primary fixture failure');
      }),
      (cause: unknown) => {
        if (!(cause instanceof AggregateError))
          throw new Error('primary and cleanup errors were not both preserved', { cause });
        expect(cause.message).toContain('primary fixture failure');
        expect(cause.message).toContain(
          cleanup === 'changed' ? 'owned unpublished sibling identity changed' : 'ENOENT',
        );
        const failures: unknown = cause.errors;
        expect(Array.isArray(failures) && failures.length === 2).toBe(true);
        return true;
      },
    );
    if (cleanup === 'changed')
      expect(await readFile(retained, 'utf8')).toBe('foreign cleanup evidence');
    expect(await Bun.file(join(fixture.root, 'owned-reader-retained')).exists()).toBe(true);
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  });
}

test('execution expiry keeps the actual initializer live and refuses even its later normal zero exit', async () => {
  const fixture = await preparationFixture();
  const ready = join(fixture.root, 'initializer-waiting');
  const release = join(fixture.root, 'initializer-release');
  const original = await readFile(fixture.selection.initializer.path, 'utf8');
  await replaceFixtureArtifact(
    fixture.selection.initializer,
    `${original}\nawait Bun.write(${JSON.stringify(ready)}, String(process.pid)); while (!(await Bun.file(${JSON.stringify(release)}).exists())) await Bun.sleep(5);`,
  );
  let now = 0;
  const clock: SolverReaderClock = { now: () => now, pause: () => Bun.sleep(2) };
  let settled = false;
  const attempt = fixture.run(undefined, { clock });
  const joined = attempt.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await waitForFixture(() => Bun.file(ready).exists());
    now = 30001;
    await Bun.sleep(30);
    expect(settled).toBe(false);
    await writeFile(release, 'attended fixture release');
    await rejects(attempt, /first-reader child failed: exit=0 signal=null expired=true/);
    await joined;
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  } finally {
    await writeFile(release, 'attended fixture release');
    await joined;
  }
});

test('original staged child exit with withheld EOF retains publication lock through expired observation', async () => {
  const fixture = await preparationFixture();
  const ready = join(fixture.root, 'writer-ready');
  const release = join(fixture.root, 'writer-release');
  const writer = `await Bun.write(${JSON.stringify(ready)}, String(process.pid)); while (!(await Bun.file(${JSON.stringify(release)}).exists())) await Bun.sleep(5);`;
  const original = await readFile(fixture.selection.reader.path, 'utf8');
  await replaceFixtureArtifact(
    fixture.selection.reader,
    `${original}\nlet fixtureWriterStarted = false; process.on('beforeExit', () => { if (process.argv[2] === '--check-edge-policy' && !fixtureWriterStarted) { fixtureWriterStarted = true; const writer = Bun.spawn([process.execPath, '-e', ${JSON.stringify(writer)}], { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }); writer.unref(); } });`,
  );
  let now = 0;
  const clock: SolverReaderClock = { now: () => now, pause: () => Bun.sleep(2) };
  let settled = false;
  const attempt = fixture.run(undefined, { clock });
  const joined = attempt.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await waitForFixture(() => Bun.file(ready).exists());
    await Bun.sleep(30);
    now = 16000;
    await Bun.sleep(30);
    expect(settled).toBe(false);
    const contender = Bun.spawn(['flock', '-n', join(fixture.state, 'edge.lock'), 'true'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code] = await Promise.all([
      contender.exited,
      new Response(contender.stdout).text(),
      new Response(contender.stderr).text(),
    ]);
    expect(code).toBe(1);
    await writeFile(release, 'attended fixture writer release');
    await rejects(attempt, /first-reader child failed: exit=0 signal=null expired=true/);
    await joined;
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  } finally {
    await writeFile(release, 'attended fixture writer release');
    await joined;
  }
});

test('overflow drains the real initializer streams to EOF and refuses retained success output', async () => {
  const fixture = await preparationFixture();
  const original = await readFile(fixture.selection.initializer.path, 'utf8');
  await replaceFixtureArtifact(
    fixture.selection.initializer,
    `${original}\nconsole.log('x'.repeat(1048577));`,
  );
  await rejects(fixture.run(), /stdoutTruncated=true/);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
});

test('one immutable operation deadline refuses a next child without its full reserve', async () => {
  const fixture = await preparationFixture();
  let now = 0;
  const clock: SolverReaderClock = { now: () => now, pause: () => Bun.sleep(2) };
  await rejects(
    fixture.run(
      (boundary) => {
        if (boundary === 'initialized') now = 140001;
        return Promise.resolve();
      },
      { clock },
    ),
    /required child settlement reserve/,
  );
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
});

test('EXDEV at the actual link boundary refuses with no copy fallback or fixed publication', async () => {
  const fixture = await preparationFixture();
  const source = new URL('./solver-reader-preparation.ts', import.meta.url).pathname;
  const program = `import * as fs from 'node:fs/promises'; import { mock } from 'bun:test'; const link = fs.link; mock.module('node:fs/promises', () => ({ ...fs, link: async (source, target) => { if (String(source).startsWith('/proc/self/fd/')) throw Object.assign(new Error('EXDEV injected at actual link boundary'), { code: 'EXDEV' }); return link(source, target); } })); const { prepareSolverReader } = await import(${JSON.stringify(source)}); try { await prepareSolverReader(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}); throw new Error('EXDEV unexpectedly admitted'); } catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('EXDEV injected')) throw cause; }`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
  });
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
});

test('terminal real-pipe observation error retains original operation lock until attended outer-fixture teardown', async () => {
  const fixture = await preparationFixture();
  const ready = join(fixture.root, 'staged-child-ready');
  const release = join(fixture.root, 'staged-child-release');
  const fault = join(fixture.root, 'observed-read-failure');
  const original = await readFile(fixture.selection.reader.path, 'utf8');
  await replaceFixtureArtifact(
    fixture.selection.reader,
    `${original}\nif (process.argv[2] === '--check-edge-policy') { await Bun.write(${JSON.stringify(ready)}, String(process.pid)); while (!(await Bun.file(${JSON.stringify(release)}).exists())) await Bun.sleep(5); }`,
  );
  const source = new URL('./solver-reader-preparation.ts', import.meta.url).pathname;
  const program = `import { writeFileSync, existsSync } from 'node:fs'; import { prepareSolverReader } from ${JSON.stringify(source)}; const attempt = prepareSolverReader(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}, undefined, { afterRead(stream) { if (stream === 'stdout' && existsSync(${JSON.stringify(ready)})) { writeFileSync(${JSON.stringify(fault)}, 'actual pipe read failed'); throw new Error('fixture terminal actual-pipe observation fault'); } } }); attempt.then(() => { throw new Error('unknown observation unexpectedly admitted'); }, (cause) => { throw new Error('unknown observation unwound original operation', { cause }); }); const attended = await new Response(Bun.stdin.stream()).text(); if (attended !== 'retire owned outer fixture') throw new Error('invalid attended fixture disposition'); process.exit(0);`;
  const outer = Bun.spawn([process.execPath, '-e', program], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = new Response(outer.stdout).text();
  const err = new Response(outer.stderr).text();
  try {
    await waitForFixture(() => Bun.file(fault).exists());
    const contender = async () => {
      const child = Bun.spawn(['flock', '-n', join(fixture.state, 'edge.lock'), 'true'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [code] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return code;
    };
    expect(await contender()).toBe(1);
    expect(outer.exitCode).toBe(null);
    const originalPid = (await readFile(ready, 'utf8')).trim();
    await writeFile(release, 'attended fixture child release');
    await waitForFixture(async () => !(await Bun.file(`/proc/${originalPid}/stat`).exists()));
    await Bun.sleep(30);
    expect(await contender()).toBe(1);
    expect(outer.exitCode).toBe(null);
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
  } finally {
    await writeFile(release, 'attended fixture child release');
    await outer.stdin.write('retire owned outer fixture');
    await outer.stdin.end();
    const [code, stdout, stderr] = await Promise.all([outer.exited, out, err]);
    expect(code).toBe(0);
    expect(outer.signalCode).toBe(null);
    expect(stdout).toBe('');
    expect(stderr).not.toContain('unwound original operation');
  }
  // Explicit outer-fixture exit releases its OS descriptors; it proves no production recovery or missing-EOF reconstruction.
});

test('compiler provenance binds actual executing bytes, metadata, virtual selection and every loaded file', async () => {
  const fixture = await preparationFixture();
  const built = await buildSolverReaderPreparationBundle(fixture.selection, fixture.layout);
  const bytes = await readFile(process.execPath);
  const status = await lstat(process.execPath, { bigint: true });
  expect(built.compiler.artifact).toEqual({
    path: process.execPath,
    sha256: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  });
  expect(built.compiler.inode).toBe(String(status.ino));
  expect(built.compiler.device).toBe(String(status.dev));
  expect(
    built.inputs.every(
      (input) => input.artifact.path.startsWith('/') && input.artifact.byteLength > 0,
    ),
  ).toBe(true);
  expect(built.externals.every((name) => name.startsWith('node:') || name === 'bun:ffi')).toBe(
    true,
  );
  const other = await buildSolverReaderPreparationBundle(fixture.selection, {
    ...fixture.layout,
    state: join(fixture.root, 'another-state'),
  });
  expect(other.virtualEntry.sha256).not.toBe(built.virtualEntry.sha256);
  expect(new Bun.CryptoHasher('sha256').update(other.bytes).digest('hex')).not.toBe(
    new Bun.CryptoHasher('sha256').update(built.bytes).digest('hex'),
  );
});

for (const fault of [
  'missing-target',
  'duplicate-target',
  'unknown-field',
  'wrong-freshness',
  'bad-artifact-size',
] as const) {
  test(`public first-reader dispatch refuses ${fault} before any transport command`, async () => {
    const fixture = await preparationFixture();
    const selection = fixture.selection;
    const argv = [
      '--prepare-first-reader',
      '--execute',
      '--host=fixture-reader-target',
      `--target-hostname=${selection.target.hostname}`,
      `--account=${selection.target.account.name}`,
      `--uid=${String(selection.target.account.uid)}`,
      `--gid=${String(selection.target.account.gid)}`,
      '--fresh-target=independently-designated-fresh',
      ...(['bun', 'reader', 'initializer'] as const).flatMap((name) => [
        `--${name}=${selection[name].path}`,
        `--${name}-sha256=${selection[name].sha256}`,
        `--${name}-bytes=${String(selection[name].byteLength)}`,
      ]),
    ];
    if (fault === 'missing-target') argv.splice(2, 1);
    if (fault === 'duplicate-target') argv.push('--host=another-target');
    if (fault === 'unknown-field') argv.push('--config=/unexpected/config');
    if (fault === 'wrong-freshness') argv[7] = '--fresh-target=ready';
    if (fault === 'bad-artifact-size') argv[10] = '--bun-bytes=NaN';
    const installer = await import('../install-solver-supervisor');
    let commands = 0;
    await rejects(
      installer.runSolverSupervisorInstaller(
        argv,
        {
          read: () => Promise.reject(new Error('unexpected config read')),
          exists: () => Promise.resolve(false),
          hash: () => Promise.reject(new Error('unexpected path hash')),
          command: () => Promise.reject(new Error('unexpected normal command')),
          readerCommand: () => {
            commands++;
            return Promise.reject(new Error('unexpected first-reader command'));
          },
        },
        fixture.layout,
      ),
      /first-reader|fresh target scope/,
    );
    expect(commands).toBe(0);
    expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
  });
}

for (const failed of ['exit', 'signal'] as const) {
  test(`public first-reader installer stops after actual transport ${failed} settlement`, async () => {
    const fixture = await preparationFixture();
    const installer = await import('../install-solver-supervisor');
    let commands = 0;
    await rejects(
      installer.prepareSolverReaderInstallation(
        { host: 'fixture-reader-target', execute: true, selection: fixture.selection },
        {
          read: () => Promise.reject(new Error('unexpected config read')),
          exists: () => Promise.resolve(false),
          hash: () => Promise.reject(new Error('unexpected path hash')),
          command: () => Promise.reject(new Error('unexpected normal command')),
          readerCommand: () => {
            commands++;
            return runSolverReaderTransport(
              [
                process.execPath,
                '-e',
                failed === 'exit' ? 'process.exit(42)' : "process.kill(process.pid, 'SIGTERM')",
              ],
              false,
            );
          },
        },
        { ...fixture.layout, staging: join(fixture.root, 'transport') },
      ),
      /first-reader transport failed; remote settlement is unknown/,
    );
    expect(commands).toBe(1);
    expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
  });
}

for (const boundary of ['parent-mkdir', 'artifact-read'] as const) {
  test(`expired settled ${boundary} starts no next forward filesystem effect`, async () => {
    const fixture = await preparationFixture();
    const layout =
      boundary === 'parent-mkdir'
        ? { ...fixture.layout, state: join(fixture.root, 'missing-parent', 'state') }
        : fixture.layout;
    const source = new URL('./solver-reader-preparation.ts', import.meta.url).pathname;
    const witness = join(fixture.root, 'forward-effect.json');
    const program = `
      import * as fs from 'node:fs/promises'; import { mock } from 'bun:test';
      let now = 0; let openedSibling = false; let writes = 0; let reached = false;
      const originalOpen = fs.open; const originalMkdir = fs.mkdir;
      mock.module('node:fs/promises', () => ({ ...fs,
        mkdir: async (path, options) => { const returned = await originalMkdir(path, options); if (path === ${JSON.stringify(join(fixture.root, 'missing-parent'))}) { reached = true; now = 180001; } return returned; },
        open: async (path, ...options) => {
          const file = await originalOpen(path, ...options);
          const sibling = String(path).includes('/.reader-'); if (sibling) openedSibling = true;
          return new Proxy(file, { get(target, name) {
            const member = Reflect.get(target, name, target);
            if (name === 'read' && path === ${JSON.stringify(fixture.selection.bun.path)}) return async (...arguments_) => { const returned = await target.read(...arguments_); if (openedSibling) { reached = true; now = 180001; } return returned; };
            if (name === 'writeFile' && sibling) return async (...arguments_) => { writes++; return target.writeFile(...arguments_); };
            return typeof member === 'function' ? member.bind(target) : member;
          }});
        }
      }));
      const { prepareSolverReader } = await import(${JSON.stringify(source)});
      let refusal = ''; try { await prepareSolverReader(${JSON.stringify(fixture.selection)}, ${JSON.stringify(layout)}, undefined, { clock: { now: () => now, pause: () => Bun.sleep(2) } }); } catch (cause) { refusal = cause instanceof Error ? cause.message : String(cause); }
      await fs.writeFile(${JSON.stringify(witness)}, JSON.stringify({ reached, writes, refusal }));
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
    const observation: unknown = JSON.parse(await readFile(witness, 'utf8'));
    const fields = readClosed(observation, ['reached', 'writes', 'refusal']);
    expect(fields['reached']).toBe(true);
    expect(fields['refusal']).toContain('first-reader operation deadline expired');
    expect(fields['writes']).toBe(0);
    if (boundary === 'parent-mkdir')
      expect(await Bun.file(join(layout.state, 'edge.lock')).exists()).toBe(false);
    if (boundary === 'parent-mkdir') await rejects(lstat(layout.state), /ENOENT/);
    expect(await Bun.file(layout.bun).exists()).toBe(false);
    expect(await Bun.file(layout.reader).exists()).toBe(false);
  });
}

test('valid JSON oversized origin receipt refuses at its bounded private consumer', async () => {
  const fixture = await preparationFixture();
  await rejects(
    fixture.run(async (boundary) => {
      if (boundary !== 'initialized') return;
      const name = (await readdir(fixture.staging)).find((name) => name.startsWith('origin-'));
      if (name === undefined) throw new Error('actual initializer receipt absent');
      const path = join(fixture.staging, name);
      const contents = await readFile(path, 'utf8');
      const valid: unknown = JSON.parse(contents + ' '.repeat(16385));
      expect(valid).toMatchObject({ format: 'edge-policy-origin-receipt' });
      await writeFile(path, contents + ' '.repeat(16385));
    }),
    /original receipt must be bounded private owned regular file/,
  );
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
});

for (const boundary of ['sibling-file', 'publication-directory'] as const) {
  test(`required ${boundary} synchronization error retains exact partial publication`, async () => {
    const fixture = await preparationFixture();
    const source = new URL('./solver-reader-preparation.ts', import.meta.url).pathname;
    const witness = join(fixture.root, 'sync-observed.json');
    const program = `
      import * as fs from 'node:fs/promises'; import { mock } from 'bun:test';
      const originalOpen = fs.open; let injected = false;
      mock.module('node:fs/promises', () => ({ ...fs, open: async (path, ...options) => {
        const file = await originalOpen(path, ...options);
        return new Proxy(file, { get(target, name) { const member = Reflect.get(target, name, target);
          if (name === 'sync') return async () => {
            const selected = ${JSON.stringify(boundary)} === 'sibling-file' ? String(path).includes('/.reader-') : path === ${JSON.stringify(join(fixture.root, 'installed'))};
            if (selected && !injected) { injected = true; throw new Error('selected actual ${boundary} sync failure'); }
            return target.sync();
          };
          return typeof member === 'function' ? member.bind(target) : member;
        }});
      }}));
      const { prepareSolverReader } = await import(${JSON.stringify(source)});
      let refusal = ''; try { await prepareSolverReader(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}); } catch (cause) { refusal = cause instanceof Error ? cause.message : String(cause); }
      await fs.writeFile(${JSON.stringify(witness)}, JSON.stringify({ injected, refusal }));
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
    });
    const observation: unknown = JSON.parse(await readFile(witness, 'utf8'));
    const fields = readClosed(observation, ['injected', 'refusal']);
    expect(fields['injected']).toBe(true);
    expect(fields['refusal']).toContain(`selected actual ${boundary} sync failure`);
    expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(true);
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(boundary === 'publication-directory');
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
  });
}

for (const change of ['named-parent', 'same-byte-sibling'] as const) {
  test(`retained publication continuity refuses changed ${change} before either fixed link`, async () => {
    const fixture = await preparationFixture();
    const parent = join(fixture.root, 'installed');
    let retained = '';
    await rejects(
      fixture.run(async (boundary) => {
        if (boundary !== 'siblings') return;
        if (change === 'named-parent') {
          retained = join(fixture.root, 'original-installed-parent');
          await rename(parent, retained);
          await mkdir(parent, { mode: 0o700 });
          await writeFile(join(parent, 'foreign-evidence'), 'foreign parent evidence');
        } else {
          const name = (await readdir(parent)).find((name) => name.endsWith('-1'));
          if (name === undefined) throw new Error('owned sibling absent');
          const path = join(parent, name);
          const contents = await readFile(path);
          retained = join(fixture.root, 'original-reader-sibling');
          await rename(path, retained);
          await writeFile(path, contents, { mode: 0o755 });
        }
      }),
      change === 'named-parent'
        ? /destination parent identity changed/
        : /artifact identity, mode or size differs/,
    );
    expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
    expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
    if (change === 'named-parent')
      expect(await readFile(join(parent, 'foreign-evidence'), 'utf8')).toBe(
        'foreign parent evidence',
      );
    else expect(await Bun.file(retained).exists()).toBe(true);
  });
}

test('transport hash refusal occurs before genuine target operation entry even with downstream artifact guards', async () => {
  const fixture = await preparationFixture();
  const operations = await import('./solver-supervisor-install-operation');
  const built = await buildSolverReaderPreparationBundle(fixture.selection, fixture.layout);
  const operation = join(fixture.staging, 'sealed-operation.js');
  const entered = join(fixture.root, 'target-operation-entered');
  const contents = `import { writeFileSync as recordTargetEntry } from 'node:fs'; recordTargetEntry(${JSON.stringify(entered)}, 'entered');\n${new TextDecoder().decode(built.bytes)}`;
  await writeFile(operation, contents);
  const script = operations.buildSolverReaderPreparationExecution(fixture.selection, {
    path: operation,
    sha256: new Bun.CryptoHasher('sha256').update(contents).digest('hex'),
    byteLength: Buffer.byteLength(contents),
  });
  const reader = await readFile(fixture.selection.reader.path, 'utf8');
  await writeFile(
    fixture.selection.reader.path,
    reader.replace('ordinary edge policy ok', 'ordinary edge policy NO'),
  );
  const child = Bun.spawn(['sh', '-c', script], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(1);
  expect(child.signalCode).toBe(null);
  expect(stdout).toContain(`${fixture.selection.reader.path}: FAILED`);
  expect(stderr).toContain('computed checksum did NOT match');
  expect(await Bun.file(entered).exists()).toBe(false);
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
});

test('actual captured owned source carrier change refuses across the shared compiler-input comparison', async () => {
  const fixture = await preparationFixture();
  const library = resolve(import.meta.dir);
  const carrier = join(fixture.root, 'solver-reader-preparation.ts');
  const operationCarrier = join(fixture.root, 'solver-supervisor-install-operation.ts');
  const absolutize = (contents: string) =>
    contents.replaceAll(
      /from '\.\/([^']+)'/g,
      (_match: string, relative: string) => `from ${JSON.stringify(join(library, relative))}`,
    );
  await writeFile(
    carrier,
    absolutize(await readFile(join(library, 'solver-reader-preparation.ts'), 'utf8')),
  );
  await writeFile(
    operationCarrier,
    absolutize(await readFile(join(library, 'solver-supervisor-install-operation.ts'), 'utf8')),
  );
  const witness = join(fixture.root, 'source-comparison.json');
  const helper = join(library, 'solver-reader-preparation.ts');
  const program = `
    import * as fs from 'node:fs/promises'; import { mock } from 'bun:test';
    const actual = await import(${JSON.stringify(helper)}); const readInput = actual.readSolverReaderBuildInput; let captured = false;
    mock.module(${JSON.stringify(helper)}, () => ({ ...actual, readSolverReaderBuildInput: async (path) => {
      const loaded = await readInput(path);
      if (path === ${JSON.stringify(carrier)} && !captured) { captured = true; await fs.appendFile(path, ' '); }
      return loaded;
    }}));
    const { buildSolverReaderPreparationBundle } = await import(${JSON.stringify(operationCarrier)});
    let refusal = ''; try { await buildSolverReaderPreparationBundle(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}); } catch (cause) { refusal = cause instanceof AggregateError ? cause.message + ': ' + cause.errors.map(String).join('; ') : cause instanceof Error ? cause.message : String(cause); }
    await fs.writeFile(${JSON.stringify(witness)}, JSON.stringify({ captured, refusal }));
  `;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
  });
  const observation: unknown = JSON.parse(await readFile(witness, 'utf8'));
  expect(observation).toMatchObject({
    captured: true,
    refusal: `first-reader compiler/build input changed: ${carrier}`,
  });
});

test('public first-reader preparation refuses mismatched selected local artifact before any observed transport', async () => {
  const fixture = await preparationFixture();
  const installer = await import('../install-solver-supervisor');
  const requested = {
    ...fixture.selection,
    reader: {
      ...fixture.selection.reader,
      sha256: fixture.selection.reader.sha256 === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64),
    },
  };
  let commands = 0;
  let refusal: unknown;
  try {
    await installer.prepareSolverReaderInstallation(
      { host: 'fixture-reader-target', execute: true, selection: requested },
      {
        read: () => Promise.reject(new Error('unexpected normal config read')),
        exists: () => Promise.reject(new Error('unexpected normal file query')),
        hash: () => Promise.reject(new Error('unexpected unrelated pathname hash')),
        command: () => Promise.reject(new Error('unexpected normal installer command')),
        readerCommand: (_argv, finalOperation) => {
          commands++;
          return runSolverReaderTransport(
            [process.execPath, '-e', 'process.exit(42)'],
            finalOperation,
          );
        },
      },
      fixture.layout,
    );
  } catch (cause) {
    refusal = cause;
  }
  expect(commands).toBe(0);
  expect(refusal instanceof Error && refusal.message).toBe(
    `preselected first-reader artifact differs: ${fixture.selection.reader.path}`,
  );
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
  expect(await Bun.file(fixture.layout.bun).exists()).toBe(false);
  expect(await Bun.file(fixture.layout.reader).exists()).toBe(false);
});

test('actual first-reader builder captures an owned unsupported text import then refuses its loader', async () => {
  const fixture = await preparationFixture();
  const library = resolve(import.meta.dir);
  const carrier = join(fixture.root, 'solver-reader-preparation.ts');
  const operationCarrier = join(fixture.root, 'solver-supervisor-install-operation.ts');
  const text = join(fixture.root, 'required-input.txt');
  const textBytes = 'actual owned first-reader text input';
  const control = join(fixture.root, 'text-control.ts');
  await writeFile(text, textBytes);
  await writeFile(
    control,
    `import contents from ${JSON.stringify(text)}; if (contents !== ${JSON.stringify(textBytes)}) throw new Error('actual text input differs'); console.log(contents);`,
  );
  const ordinary = await Bun.build({ entrypoints: [control], target: 'bun' });
  expect(ordinary.success).toBe(true);
  const output = ordinary.outputs.at(0);
  if (output === undefined || ordinary.outputs.length !== 1)
    throw new Error('owned text import control output absent');
  const controlBundle = join(fixture.root, 'text-control.js');
  await writeFile(controlBundle, new Uint8Array(await output.arrayBuffer()));
  const controlChild = Bun.spawn([process.execPath, controlBundle], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [controlCode, controlOut, controlErr] = await Promise.all([
    controlChild.exited,
    new Response(controlChild.stdout).text(),
    new Response(controlChild.stderr).text(),
  ]);
  expect({
    code: controlCode,
    signal: controlChild.signalCode,
    stdout: controlOut,
    stderr: controlErr,
  }).toEqual({ code: 0, signal: null, stdout: `${textBytes}\n`, stderr: '' });
  const absolutize = (contents: string) =>
    contents.replaceAll(
      /from '\.\/([^']+)'/g,
      (_match: string, relative: string) => `from ${JSON.stringify(join(library, relative))}`,
    );
  await writeFile(
    carrier,
    `import requiredText from ${JSON.stringify(text)}; if (requiredText !== ${JSON.stringify(textBytes)}) throw new Error('required actual source text differs');\n${absolutize(await readFile(join(library, 'solver-reader-preparation.ts'), 'utf8'))}`,
  );
  await writeFile(
    operationCarrier,
    absolutize(await readFile(join(library, 'solver-supervisor-install-operation.ts'), 'utf8')),
  );
  const helper = join(library, 'solver-reader-preparation.ts');
  const witness = join(fixture.root, 'unsupported-loader.json');
  const program = `
    import * as fs from 'node:fs/promises'; import { mock } from 'bun:test';
    const actual = await import(${JSON.stringify(helper)}); const readInput = actual.readSolverReaderBuildInput; let captured = false;
    mock.module(${JSON.stringify(helper)}, () => ({ ...actual, readSolverReaderBuildInput: async (path) => {
      const loaded = await readInput(path);
      if (path === ${JSON.stringify(text)}) {
        if (new TextDecoder().decode(loaded.bytes) !== ${JSON.stringify(textBytes)}) throw new Error('captured actual text bytes differ');
        captured = true;
      }
      return loaded;
    }}));
    const { buildSolverReaderPreparationBundle } = await import(${JSON.stringify(operationCarrier)});
    let refusal = ''; try { await buildSolverReaderPreparationBundle(${JSON.stringify(fixture.selection)}, ${JSON.stringify(fixture.layout)}); } catch (cause) { refusal = cause instanceof AggregateError ? cause.message + ': ' + cause.errors.map(String).join('; ') : cause instanceof Error ? cause.message : String(cause); }
    await fs.writeFile(${JSON.stringify(witness)}, JSON.stringify({ captured, refusal }));
  `;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
  });
  const observation: unknown = JSON.parse(await readFile(witness, 'utf8'));
  const fields = readClosed(observation, ['captured', 'refusal']);
  expect(fields['captured']).toBe(true);
  expect(fields['refusal']).toBe(
    `Bundle failed: BuildMessage: unsupported first-reader build file: ${text}`,
  );
  expect(await Bun.file(join(fixture.state, 'edge-policy.json')).exists()).toBe(false);
});
