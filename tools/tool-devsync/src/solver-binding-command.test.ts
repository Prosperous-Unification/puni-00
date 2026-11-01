import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterEach, expect, test } from 'bun:test';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(preparedReader = true) {
  const root = await mkdtemp(join(tmpdir(), 'solver-edge-command-'));
  roots.push(root);
  const state = join(root, 'state');
  await mkdir(state);
  await writeFile(join(state, 'edge.lock'), '');
  await writeFile(join(root, 'foreign.lock'), '');
  const fixed = join(root, 'fixed');
  await mkdir(fixed);
  const bun = join(fixed, 'bun');
  const reader = join(fixed, 'solver-supervisor.js');
  if (preparedReader) await copyFile(process.execPath, bun);
  const runner = join(root, 'solver-binding-runtime.js');
  for (const [source, destination] of [
    [new URL('./solver-binding-runtime.ts', import.meta.url).pathname, runner],
    ...(preparedReader
      ? [
          [
            new URL('../../tool-remote-scripts/src/solver-supervisor.ts', import.meta.url).pathname,
            reader,
          ],
        ]
      : []),
  ]) {
    const compilation = await Bun.build({
      entrypoints: [source],
      target: 'bun',
      plugins: [
        {
          name: 'owned-binding-layout',
          setup(build) {
            build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => {
              let source = await Bun.file(file.path).text();
              for (const [before, after] of [
                ["'/home/puni1/wbs/state'", state],
                ["'/home/puni1/.local/lib/wbs-solver/bun'", bun],
                ["'/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'", reader],
              ]) {
                if (source.split(before).length !== 2)
                  throw new Error('production fixed layout anchor differs');
                source = source.replace(before, JSON.stringify(after));
              }
              return { contents: source, loader: 'ts' };
            });
          },
        },
      ],
    });
    const output = compilation.outputs.at(0);
    if (!compilation.success || compilation.outputs.length !== 1 || output === undefined)
      throw new Error('actual binding/reader build failed');
    await writeFile(destination, new Uint8Array(await output.arrayBuffer()), {
      mode: 0o755,
    });
  }
  const admission = new URL('../../tool-remote-scripts/src/lib/edge-admission.ts', import.meta.url)
    .pathname;
  const child = join(root, 'child.ts');
  const launcher = join(root, 'launcher.ts');
  await writeFile(
    child,
    `import { withEdgeAdmission } from ${JSON.stringify(admission)};
await Bun.write(${JSON.stringify(join(root, 'launched'))}, 'launched');
await withEdgeAdmission(async () => {
 if (process.env.WBS_EDGE_LOCK_FD !== '3') throw new Error('child descriptor was not remapped');
 const competitor = Bun.spawn(['flock', '-n', ${JSON.stringify(join(state, 'edge.lock'))}, 'true']);
 if (await competitor.exited === 0) throw new Error('child escaped edge lock');
 await Bun.write(${JSON.stringify(join(root, 'reached'))}, 'locked');
});`,
  );
  await writeFile(
    launcher,
    `import { runSolverBindingCommand } from ${JSON.stringify(runner)};
const outcome = await runSolverBindingCommand({ cwd: ${JSON.stringify(root)}, argv: [process.execPath, ${JSON.stringify(child)}], env: { WBS_EDGE_LOCK_FD: 'forged', WBS_EDGE_STATE: '/wrong' }, edgeLock: 'inherit' });
if (outcome.exitCode !== 0) throw new Error(outcome.stderr);`,
  );
  return {
    root,
    state,
    async run(mode = 'valid', afterLock = '') {
      const setup =
        mode === 'missing'
          ? 'unset WBS_EDGE_LOCK_FD;'
          : mode === 'invalid'
            ? 'export WBS_EDGE_LOCK_FD=bogus;'
            : mode === 'unsafe'
              ? 'export WBS_EDGE_LOCK_FD=9007199254740992;'
              : mode === 'foreign'
                ? 'exec 8<"$TEST_ROOT/foreign.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8;'
                : mode === 'independent'
                  ? 'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; exec 7<"$WBS_EDGE_STATE/edge.lock"; export WBS_EDGE_LOCK_FD=7;'
                  : 'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8;';
      const processChild = Bun.spawn(
        ['bash', '-c', `${setup} ${afterLock} exec "$@"`, 'launch', process.execPath, launcher],
        {
          env: { ...process.env, FORCE_COLOR: '1', TEST_ROOT: root, WBS_EDGE_STATE: state },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(processChild.stdout).text(),
        new Response(processChild.stderr).text(),
        processChild.exited,
      ]);
      // Proof: FORCE_COLOR=1 produced 10 error-line assertion failures without normalization.
      return { code, output: stripVTControlCharacters(stdout + stderr) };
    },
    async expectUnreached() {
      expect(await Bun.file(join(root, 'reached')).exists()).toBe(false);
      expect(await Bun.file(join(root, 'launched')).exists()).toBe(false);
    },
  };
}

test('solver command remaps the verified inherited lock to child FD3 through the real child path', async () => {
  const host = await fixture();
  expect(await host.run()).toMatchObject({ code: 0 });
  expect(await readFile(join(host.root, 'reached'), 'utf8')).toBe('locked');
  expect(await Bun.spawn(['flock', '-n', join(host.state, 'edge.lock'), 'true']).exited).toBe(0);
});

for (const mode of ['missing', 'invalid', 'foreign', 'independent', 'unsafe']) {
  test(`${mode} inherited descriptor refuses before launching solver command`, async () => {
    const host = await fixture();
    const attempt = await host.run(mode);
    expect(attempt.code).not.toBe(0);
    expect(attempt.output.split('\n').find((line) => line.startsWith('error: '))).toContain(
      mode === 'foreign'
        ? 'does not name'
        : mode === 'independent'
          ? 'shared edge lock held'
          : mode === 'unsafe'
            ? 'invalid inherited shared edge descriptor'
            : 'requires an inherited shared edge descriptor',
    );
    await host.expectUnreached();
  });
}

for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
  for (const shape of ['malformed', 'unreadable', 'directory', 'dangling']) {
    test(`${marker} ${shape} refuses inherited solver command`, async () => {
      const host = await fixture();
      const path = join(host.state, marker);
      if (shape === 'directory') await mkdir(path);
      else if (shape === 'dangling') await symlink('absent', path);
      else {
        await writeFile(path, '{bad');
        if (shape === 'unreadable') await chmod(path, 0);
      }
      const attempt = await host.run();
      expect(attempt.code).not.toBe(0);
      expect(attempt.output).toContain('owner admission closed');
      await host.expectUnreached();
    });
  }
}

test('symlink canonical state refuses verified solver command', async () => {
  const host = await fixture();
  await rename(host.state, `${host.state}-real`);
  await symlink(`${host.state}-real`, host.state);
  expect((await host.run()).code).not.toBe(0);
  await host.expectUnreached();
});

test('symlink canonical lock refuses verified solver command', async () => {
  const host = await fixture();
  await rename(join(host.state, 'edge.lock'), join(host.state, 'real.lock'));
  await symlink('real.lock', join(host.state, 'edge.lock'));
  expect((await host.run()).code).not.toBe(0);
  await host.expectUnreached();
});

for (const shape of ['missing', 'directory', 'unreadable']) {
  test(`${shape} canonical state refuses before child launch`, async () => {
    const host = await fixture();
    const fault =
      shape === 'missing'
        ? 'rm "$WBS_EDGE_STATE/edge.lock";'
        : shape === 'directory'
          ? 'rm "$WBS_EDGE_STATE/edge.lock"; mkdir "$WBS_EDGE_STATE/edge.lock";'
          : 'chmod 111 "$WBS_EDGE_STATE";';
    try {
      expect((await host.run('valid', fault)).code).not.toBe(0);
      await host.expectUnreached();
    } finally {
      await chmod(host.state, 0o700);
    }
  });
}

for (const suffix of ['/', '/.', '/..', '//']) {
  test(`noncanonical state spelling ${suffix} refuses before solver child launch`, async () => {
    const host = await fixture();
    await rename(host.state, `${host.state}-real`);
    await symlink(`${host.state}-real`, host.state);
    const attempt = await host.run('valid', `export WBS_EDGE_STATE="$WBS_EDGE_STATE${suffix}";`);
    expect(attempt.code).not.toBe(0);
    expect(attempt.output.split('\n').find((line) => line.startsWith('error: '))).toContain(
      'canonical edge state must be an absolute normalized path',
    );
    await host.expectUnreached();
  });
}

test('relative state spelling refuses before solver child launch', async () => {
  const host = await fixture();
  const attempt = await host.run('valid', `cd "$TEST_ROOT"; export WBS_EDGE_STATE=state;`);
  expect(attempt.code).not.toBe(0);
  expect(attempt.output.split('\n').find((line) => line.startsWith('error: '))).toContain(
    'canonical edge state must be an absolute normalized path',
  );
  await host.expectUnreached();
});

test('inherited candidate launcher refuses an unprepared fixed installed reader before candidate execution', async () => {
  const host = await fixture(false);
  const outcome = await host.run();
  expect(outcome.code).not.toBe(0);
  expect(await Bun.file(join(host.root, 'launched')).exists()).toBe(false);
  expect(outcome.output).toMatch(/fixed installed controller reader|reader preparation/);
});

test('failed original candidate stderr observation retains the real edge interval after actual child completion', async () => {
  const host = await fixture();
  const preload = join(host.root, 'read-fault.ts');
  await writeFile(
    preload,
    `const spawn=Bun.spawn.bind(Bun);const streams=new Set();Bun.spawn=(argv,options)=>{const child=spawn(argv,options);if(Array.isArray(argv)&&argv.includes(${JSON.stringify(join(host.root, 'child.ts'))}))streams.add(child.stderr);return child;};const Original=Response;globalThis.Response=class extends Original{constructor(body,init){super(body,init);this.inject=streams.has(body);}async text(){const text=await super.text();if(this.inject)throw new Error('injected observation failure after actual stderr read');return text;}};`,
  );
  const child = Bun.spawn(
    [
      'bash',
      '-c',
      'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8; exec "$@"',
      'owned',
      process.execPath,
      '--preload=' + preload,
      join(host.root, 'launcher.ts'),
    ],
    { env: { ...process.env, WBS_EDGE_STATE: host.state }, stdout: 'pipe', stderr: 'pipe' },
  );
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
    for (let attempt = 0; attempt < 400 && !stderr.includes('controller HOLD:'); attempt++)
      await Bun.sleep(10);
    expect(await Bun.file(join(host.root, 'reached')).text()).toBe('locked');
    expect(stderr).toContain('controller HOLD: original child/read/EOF remains unknown');
    expect(settled).toBe(false);
    expect(await Bun.spawn(['flock', '-n', join(host.state, 'edge.lock'), 'true']).exited).toBe(1);
  } finally {
    // Explicit external fixture teardown supplies no successful operation settlement.
    child.kill('SIGTERM');
    await waitTask;
    await outputTask;
    await errorTask;
  }
}, 10000);
