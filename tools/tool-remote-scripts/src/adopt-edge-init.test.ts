import { copyFile, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { packetFixture } from '../test/edge-init-observer-fixture';
import { describeInitRefusal, parseInitArguments } from './adopt-edge-init';
import { InitRefusal } from './lib/edge-init';
import { InitObservationRefusal } from './lib/edge-init-observer';
import { withCanonicalLock } from './lib/lock';

async function prepareAdoptionLayout(root: string) {
  const directory = join(root, 'fixed');
  await mkdir(directory);
  const bun = join(directory, 'bun');
  const reader = join(directory, 'solver-supervisor.js');
  await copyFile(process.execPath, bun);
  await writeFile(
    join(root, 'edge-policy.json'),
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: root,
    }),
  );
  const contract = fileURLToPath(
    new URL('./lib/solver-supervisor-install-contract.ts', import.meta.url),
  );
  const original = await readFile(contract, 'utf8');
  const replacements = [
    ["'/home/puni1/wbs/state'", root],
    ["'/home/puni1/.local/lib/wbs-solver/bun'", bun],
    ["'/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'", reader],
  ] as const;
  for (const [before] of replacements)
    if (original.split(before).length !== 2)
      throw new Error('production fixed layout anchor differs');
  const plugin: Bun.BunPlugin = {
    name: 'owned-adoption-layout',
    setup(build) {
      build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, () => {
        let source = original;
        for (const [before, after] of replacements)
          source = source.replace(before, JSON.stringify(after));
        return { contents: source, loader: 'ts' };
      });
    },
  };
  const compilation = await Bun.build({
    entrypoints: [fileURLToPath(new URL('./solver-supervisor.ts', import.meta.url))],
    target: 'bun',
    plugins: [plugin],
  });
  const output = compilation.outputs.at(0);
  if (!compilation.success || compilation.outputs.length !== 1 || output === undefined)
    throw new Error('actual adoption reader build failed');
  await writeFile(reader, new Uint8Array(await output.arrayBuffer()), { mode: 0o755 });
  const preload = join(root, 'owned-layout-preload.ts');
  await writeFile(
    preload,
    `import {mock} from 'bun:test'; const original=await import(${JSON.stringify(contract)}); mock.module(${JSON.stringify(contract)},()=>({...original,SOLVER_READER_STATE:${JSON.stringify(root)},SOLVER_SUPERVISOR_BUN:${JSON.stringify(bun)},SOLVER_SUPERVISOR_BUNDLE:{...original.SOLVER_SUPERVISOR_BUNDLE,remote:${JSON.stringify(reader)}}}));`,
  );
  return { plugin, preload };
}

test.each([
  [['--packet=/private/operation.json'], 'prepare'],
  [['--packet=/private/operation.json', '--execute'], 'execute'],
  [['--inspect-recovery', '--packet=/private/operation.json'], 'inspect-recovery'],
] as const)('parses only the fixed production invocation %j', (arguments_, mode) => {
  expect(parseInitArguments(arguments_)).toEqual({ packet: '/private/operation.json', mode });
});

for (const arguments_ of [
  [],
  ['--packet=relative'],
  ['--packet=/private/../operation.json'],
  ['--packet=/private/a', '--packet=/private/b'],
  ['--packet=/private/a', '--execute', '--inspect-recovery'],
  ['--packet=/private/a', '--socket=/tmp/engine.sock'],
  ['--packet=/private/a', '--fixture'],
  ['--packet=/private/a', '--service=registry'],
  ['--packet=/private/a', '--host=h2puni'],
  ['--packet=/private/a', '--execute', '--execute'],
  ['--packet=/private/a\nb'],
  ['--packet=/private/a\u0000b'],
]) {
  test(`refuses an expanded production invocation ${JSON.stringify(arguments_)}`, () => {
    expect(() => parseInitArguments(arguments_)).toThrow(InitRefusal);
  });
}

test('real CLI requires an inherited edge lock and redacts trusted-state diagnostics', async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      'run',
      fileURLToPath(new URL('./adopt-edge-init.ts', import.meta.url)),
      '--packet=/private/operation.json',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WBS_EDGE_STATE: '/PRIVATE_TRUSTED_STATE_SENTINEL',
        WBS_EDGE_LOCK_FD: '3',
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(status).toBe(1);
  expect(stdout + stderr).not.toContain('PRIVATE_TRUSTED_STATE_SENTINEL');
  expect(stdout + stderr).toContain('admission-failed');
});

test('actual source CLI success emits one plain JSON line under FORCE_COLOR=1', async () => {
  const root = await mkdtemp('/tmp/adoption-output-');
  try {
    const layout = await prepareAdoptionLayout(root);
    const observer = fileURLToPath(new URL('./lib/edge-init-observer.ts', import.meta.url));
    await import('node:fs/promises').then((fs) =>
      fs.appendFile(
        layout.preload,
        `\nconst observer=await import(${JSON.stringify(observer)}); mock.module(${JSON.stringify(observer)},()=>({...observer,runProductionInitAdoption:async()=>({attempt:'synthetic-output-only',stage:'prepared',packetSha256:'a'.repeat(64),receiptDirectory:'/private/synthetic-output-only',receiptSha256:null})}));`,
      ),
    );
    const entry = fileURLToPath(new URL('./adopt-edge-init.ts', import.meta.url));
    await withCanonicalLock(join(root, 'edge.lock'), async (descriptor) => {
      const child = Bun.spawn(
        [
          process.execPath,
          '--preload=' + layout.preload,
          entry,
          '--packet=/private/synthetic-output-only',
        ],
        {
          env: { ...process.env, FORCE_COLOR: '1', WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
          stdio: ['ignore', 'pipe', 'pipe', descriptor],
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code, stderr).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toBe(
        JSON.stringify({
          attempt: 'synthetic-output-only',
          stage: 'prepared',
          packetSha256: 'a'.repeat(64),
          receiptDirectory: '/private/synthetic-output-only',
          receiptSha256: null,
        }) + '\n',
      );
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

test('failure projection exposes only validated private attempt metadata and fixed codes', () => {
  const summary = {
    attempt: 'synthetic',
    stage: 'operation-refused',
    packetSha256: 'a'.repeat(64),
    receiptDirectory: '/private/synthetic',
    receiptSha256: 'b'.repeat(64),
  };
  const refusal = new InitObservationRefusal({
    ...summary,
    ...{ privateCause: 'PRIVATE_PROJECTION_SENTINEL' },
  });
  expect(describeInitRefusal(refusal)).toEqual(summary);
  expect(describeInitRefusal(new Error('PRIVATE_PROJECTION_SENTINEL'))).toEqual({
    stage: 'admission-failed',
  });
  expect(describeInitRefusal(new InitRefusal('PRIVATE_PROJECTION_SENTINEL'))).toEqual({
    stage: 'admission-failed',
  });
  expect(describeInitRefusal(new InitRefusal('preparation-failed'))).toEqual({
    stage: 'preparation-failed',
  });
});

test('recovery projection retains ordered closed detail without nested private fields', () => {
  const target = {
    target: 'registry' as const,
    class: 'candidate-running-original-absent' as const,
    original: 'absent' as const,
    candidate: 'present' as const,
    health: 'healthy' as const,
    probeApplicability: 'applicable' as const,
  };
  const summary = {
    attempt: 'synthetic',
    stage: 'recovery-observed',
    packetSha256: 'a'.repeat(64),
    receiptDirectory: '/private/synthetic',
    receiptSha256: 'b'.repeat(64),
    recovery: {
      scope: 'read-only-recovery-observation' as const,
      window: 'expired' as const,
      targets: [target],
    },
  };
  expect(
    describeInitRefusal(
      new InitObservationRefusal({
        ...summary,
        recovery: {
          ...summary.recovery,
          ...{ privateHost: 'PRIVATE_RECOVERY_SENTINEL' },
          targets: [{ ...target, ...{ rawConfig: 'PRIVATE_RECOVERY_SENTINEL' } }],
        },
      }),
    ),
  ).toEqual(summary);
});

for (const bundled of [false, true]) {
  test(`real ${bundled ? 'bundled' : 'source'} CLI composes the production factory under the actual inherited lock`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'edge-init-cli-'));
    const packet = join(root, 'PRIVATE_PACKET.json');
    await writeFile(packet, '{"private":"PRIVATE_PACKET_SENTINEL"}', { mode: 0o600 });
    let entry = fileURLToPath(new URL('./adopt-edge-init.ts', import.meta.url));
    try {
      const layout = await prepareAdoptionLayout(root);
      if (bundled) {
        const build = await Bun.build({
          entrypoints: [entry],
          target: 'bun',
          plugins: [layout.plugin],
        });
        expect(build.success).toBe(true);
        const artifact = build.outputs.at(0);
        if (artifact === undefined || build.outputs.length !== 1)
          throw new Error('expected one owned CLI bundle');
        entry = join(root, 'adopt-edge-init.js');
        await writeFile(entry, await artifact.text());
      }
      await withCanonicalLock(join(root, 'edge.lock'), async (descriptor) => {
        for (const mode of [undefined, '--execute', '--inspect-recovery']) {
          const child = Bun.spawn(
            [
              process.execPath,
              '--preload=' + layout.preload,
              entry,
              `--packet=${packet}`,
              ...(mode === undefined ? [] : [mode]),
            ],
            {
              env: {
                ...process.env,
                WBS_EDGE_STATE: root,
                WBS_EDGE_LOCK_FD: '3',
                EDGE_INIT_SKIP: '1',
                EDGE_INIT_FIXTURE: '1',
                FORCE_COLOR: '1',
                DOCKER_HOST: 'tcp://PRIVATE_REMOTE_SENTINEL:2375',
              },
              stdio: ['ignore', 'pipe', 'pipe', descriptor],
            },
          );
          const [stdout, stderr, status] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
          ]);
          expect(status).toBe(1);
          expect(stdout).toBe('');
          const diagnostic: unknown = JSON.parse(stderr);
          expect(stderr).toBe(JSON.stringify(diagnostic) + '\n');
          expect(diagnostic).toMatchObject({
            stage: 'preparation-failed',
            recoveryInvocation: [
              process.execPath,
              entry,
              `--packet=${packet}`,
              '--inspect-recovery',
            ],
          });
          expect(stderr).not.toContain('PRIVATE_PACKET_SENTINEL');
          expect(stderr).not.toContain('PRIVATE_REMOTE_SENTINEL');
        }
        for (const override of ['fixture', 'socket', 'host']) {
          await writeFile(
            packet,
            JSON.stringify({
              ...packetFixture().packet,
              [override]: 'PRIVATE_PACKET_OVERRIDE_SENTINEL',
            }),
            { mode: 0o600 },
          );
          const child = Bun.spawn(
            [
              process.execPath,
              '--preload=' + layout.preload,
              entry,
              `--packet=${packet}`,
              '--execute',
            ],
            {
              env: { ...process.env, WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
              stdio: ['ignore', 'pipe', 'pipe', descriptor],
            },
          );
          const [stdout, stderr, status] = await Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
          ]);
          expect(status).toBe(1);
          expect(stdout).toBe('');
          const diagnostic: unknown = JSON.parse(stderr);
          expect(diagnostic).toMatchObject({ stage: 'preparation-failed' });
          expect(stderr).not.toContain('PRIVATE_PACKET_OVERRIDE_SENTINEL');
        }
        for (const name of ['foreign.lock', 'edge.lock']) {
          const independentlyOpened = await open(join(root, name), 'a+', 0o600);
          try {
            const child = Bun.spawn(
              [
                process.execPath,
                '--preload=' + layout.preload,
                entry,
                `--packet=${packet}`,
                '--execute',
              ],
              {
                env: { ...process.env, WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
                stdio: ['ignore', 'pipe', 'pipe', independentlyOpened.fd],
              },
            );
            const [stdout, stderr, status] = await Promise.all([
              new Response(child.stdout).text(),
              new Response(child.stderr).text(),
              child.exited,
            ]);
            expect(status).toBe(1);
            expect(stdout).toBe('');
            const diagnostic: unknown = JSON.parse(stderr);
            expect(diagnostic).toMatchObject({ stage: 'admission-failed' });
          } finally {
            await independentlyOpened.close();
          }
        }
        await writeFile(join(root, 'edge-owner.pending'), 'PRIVATE_OWNER_SENTINEL');
        const child = Bun.spawn(
          [
            process.execPath,
            '--preload=' + layout.preload,
            entry,
            `--packet=${packet}`,
            '--execute',
          ],
          {
            env: { ...process.env, WBS_EDGE_STATE: root, WBS_EDGE_LOCK_FD: '3' },
            stdio: ['ignore', 'pipe', 'pipe', descriptor],
          },
        );
        const [stdout, stderr, status] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(status).toBe(1);
        expect(stdout).toBe('');
        const diagnostic: unknown = JSON.parse(stderr);
        expect(diagnostic).toMatchObject({ stage: 'admission-failed' });
        expect(stderr).not.toContain('PRIVATE_OWNER_SENTINEL');
      });
    } finally {
      await rm(root, { recursive: true });
    }
  });
}
