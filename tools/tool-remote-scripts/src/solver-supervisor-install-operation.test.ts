import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { buildSolverSupervisorInstallOperation } from './lib/solver-supervisor-install-operation';

const roots: string[] = [];
const listeners: ReturnType<typeof Bun.listen>[] = [];
afterEach(async () => {
  for (const listener of listeners.splice(0)) listener.stop(true);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'solver-install-operation-'));
  roots.push(root);
  const state = join(root, 'state');
  const staging = join(root, 'stage');
  for (const directory of [state, staging, join(root, 'commands')]) await mkdir(directory);
  await writeFile(join(state, 'edge.lock'), '');
  await writeFile(join(root, 'foreign.lock'), '');
  const files = [0, 1, 2, 3].map((index) => ({
    local: '',
    remote: join(root, `installed-${String(index)}`),
  }));
  const runtime = `#!/bin/bash
set -eu
if [ "\${1:-}" = --version ]; then
  if [ "\${FAULT:-}" = sibling-runtime ] && [[ "$0" = *'.solver-'* ]]; then echo 1.2.20; else echo 1.4.2; fi
  exit 0
fi
if flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'replacement escaped lock' >&2; exit 91; fi
source_path="\${@: -2:1}"
destination_path="\${@: -1}"
if [ "$(stat -c %d "$source_path")" != "$(stat -c %d "$(dirname "$destination_path")")" ]; then echo 'cross-device publication would copy live bytes' >&2; exit 96; fi
if [ "\${FAULT:-}" = second-move ] && [[ "$destination_path" = *installed-1 ]]; then exit 92; fi
before=$(stat -c %i "$source_path")
${JSON.stringify(process.execPath)} "$@"
after=$(stat -c %i "$destination_path")
if [ "$before" != "$after" ]; then echo 'publication did not preserve the sibling inode' >&2; exit 97; fi
if [ "\${FAULT:-}" = readback ]; then printf corrupt > "$destination_path"; fi
`;
  const contents = [runtime, 'new bundle', 'new config', 'new unit'];
  const hashes = contents.map((contents) =>
    new Bun.CryptoHasher('sha256').update(contents).digest('hex'),
  );
  for (const [index, file] of files.entries()) {
    await writeFile(file.remote, `old ${String(index)}`);
    await writeFile(join(staging, String(index)), contents[index]);
  }
  await chmod(join(staging, '0'), 0o755);
  await chmod(join(staging, '3'), 0o600);
  const socket = join(root, 'ready.sock');
  listeners.push(
    Bun.listen({
      unix: socket,
      socket: {
        data(socket) {
          socket.end();
        },
      },
    }),
  );
  const commands = {
    install: `#!/bin/bash
set -eu
if [[ "$*" != *'.cache/wbs-solver'* ]] && flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'parent creation escaped lock' >&2; exit 98; fi
/usr/bin/install "$@"
`,
    rm: `#!/bin/bash
set -eu
if [ "\${FAULT:-}" = sibling-cleanup ] && [[ "$*" = *'.solver-stage-2'* ]]; then exit 101; fi
/bin/rm "$@"
`,
    cp: `#!/bin/bash
set -eu
if flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'sibling copy escaped lock' >&2; exit 99; fi
target="\${@: -1}"
test "$(stat -c %a "$(dirname "$target")")" = 700
if [ "\${FAULT:-}" = sibling-copy ] && [[ "$target" = *'.solver-stage-2/'* ]]; then exit 100; fi
/bin/cp "$@"
if [ "\${FAULT:-}" = sibling-hash ] && [[ "$target" = *'.solver-stage-2/'* ]]; then printf corrupt > "$target"; fi
`,
    mv: `#!/bin/bash
set -eu
if flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'replacement escaped lock' >&2; exit 91; fi
if [ "\${FAULT:-}" = second-move ] && [[ "$*" = *installed-1 ]]; then exit 92; fi
/bin/mv "$@"
if [ "\${FAULT:-}" = readback ]; then printf corrupt > "\${@: -1}"; fi
`,
    sha256sum: `#!/bin/bash
set -eu
if flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'hash verification escaped lock' >&2; exit 93; fi
/usr/bin/sha256sum "$@"
`,
    systemctl: `#!/bin/bash
set -eu
if flock -n "$WBS_EDGE_STATE/edge.lock" true; then echo 'service escaped lock' >&2; exit 94; fi
printf '%s\\n' "$*" >> "$HOST_ROOT/service"
if [ "\${FAULT:-}" = service ]; then exit 95; fi
if [ "\${FAULT:-}" = readiness ] && [[ "$*" = *is-active* ]]; then exit 1; fi
`,
    sleep: '#!/bin/sh\nexit 0\n',
  };
  for (const [name, script] of Object.entries(commands)) {
    await writeFile(join(root, 'commands', name), script);
    await chmod(join(root, 'commands', name), 0o755);
  }
  const shell = (local: boolean) =>
    buildSolverSupervisorInstallOperation(files, hashes, staging, socket, local)
      .replaceAll('/home/puni1/wbs/state', state)
      .replaceAll('/home/puni1/', `${root}/home/`);
  return {
    root,
    state,
    staging,
    files,
    hashes,
    socket,
    shell,
    async run(fault = '', localMode?: string) {
      const env = {
        ...process.env,
        WBS_EDGE_STATE: state,
        PATH: `${root}/commands:${process.env['PATH'] ?? ''}`,
        HOST_ROOT: root,
        FAULT: fault,
      };
      let argv = ['sh', '-c', shell(false)];
      if (localMode !== undefined) {
        const runner = new URL('./install-solver-supervisor.ts', import.meta.url).pathname;
        const outer = new URL('../../tool-devsync/src/solver-binding-runtime.ts', import.meta.url)
          .pathname;
        const child = join(root, 'child.ts');
        const launch = join(root, 'launch.ts');
        const innerFault =
          localMode === 'inner-missing' ? 'delete process.env.WBS_EDGE_LOCK_FD;' : '';
        await writeFile(
          child,
          `${innerFault} import {runSolverSupervisorInstallCommand} from ${JSON.stringify(runner)}; const attempt = await runSolverSupervisorInstallCommand(['sh', '-c', ${JSON.stringify(shell(true))}], true); if(attempt.code !== 0) throw new Error(attempt.stderr);`,
        );
        await writeFile(
          launch,
          `import {runSolverBindingCommand} from ${JSON.stringify(outer)}; const attempt = await runSolverBindingCommand({cwd: ${JSON.stringify(root)}, argv: [process.execPath, ${JSON.stringify(child)}], edgeLock: 'inherit'}); if(attempt.exitCode !== 0) throw new Error(attempt.stderr);`,
        );
        const setup =
          localMode === 'missing'
            ? 'unset WBS_EDGE_LOCK_FD;'
            : localMode === 'foreign'
              ? 'exec 8<"$HOST_ROOT/foreign.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8;'
              : 'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8;';
        argv = [
          'bash',
          '-c',
          `${setup} ${localMode === 'unreadable-lock' ? 'chmod 000 "$WBS_EDGE_STATE/edge.lock";' : ''} exec "$@"`,
          'launch',
          process.execPath,
          launch,
        ];
      }
      if (localMode === 'shell-foreign') {
        argv = [
          'bash',
          '-c',
          'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; exec 3<"$HOST_ROOT/foreign.lock"; export WBS_EDGE_LOCK_FD=3; exec sh -c "$1"',
          'launch',
          shell(true),
        ];
      }
      const child = Bun.spawn(argv, { env, stdout: 'pipe', stderr: 'pipe' });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, output: stdout + stderr };
    },
    async expectOriginal() {
      for (const [index, file] of files.entries())
        expect(await readFile(file.remote, 'utf8')).toBe(`old ${String(index)}`);
      expect(await Bun.file(join(root, 'service')).exists()).toBe(false);
    },
  };
}

test('all replacements, hash readback and service readiness hold canonical admission with exact modes', async () => {
  const host = await fixture();
  expect(await host.run()).toMatchObject({ code: 0 });
  for (const [index, mode] of [0o755, 0o755, 0o600, 0o644].entries())
    expect((await stat(host.files[index].remote)).mode & 0o777).toBe(mode);
  expect(await readFile(join(host.root, 'service'), 'utf8')).toContain('is-active');
  expect(await Bun.spawn(['flock', '-n', join(host.state, 'edge.lock'), 'true']).exited).toBe(0);
});

test('actual Bun runner to installer runner to shell retains the same description at FD3', async () => {
  const host = await fixture();
  expect(await host.run('', 'valid')).toMatchObject({ code: 0 });
  expect(await readFile(join(host.root, 'service'), 'utf8')).toContain('restart');
});

for (const mode of ['missing', 'foreign', 'inner-missing', 'shell-foreign'])
  test(`local ${mode} descriptor refuses without fallback acquisition`, async () => {
    const host = await fixture();
    expect((await host.run('', mode)).code).not.toBe(0);
    await host.expectOriginal();
  });

for (const marker of ['edge-owner.json', 'edge-owner.pending'])
  for (const shape of ['malformed', 'unreadable', 'directory', 'dangling'])
    test(`${marker} ${shape} closes host operation`, async () => {
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
      await host.expectOriginal();
    });

for (const fault of [
  'missing-state',
  'file-state',
  'missing-lock',
  'symlink-lock',
  'directory-lock',
  'symlink-state',
  'unreadable-state',
  'unreadable-lock',
])
  test(`${fault} refuses before replacement`, async () => {
    const host = await fixture();
    const path = join(host.state, 'edge.lock');
    if (fault === 'missing-state' || fault === 'file-state') {
      await rm(host.state, { recursive: true });
      if (fault === 'file-state') await writeFile(host.state, 'not a directory');
    } else if (fault === 'symlink-state') {
      await rename(host.state, `${host.state}-real`);
      await symlink(`${host.state}-real`, host.state);
    } else if (fault === 'unreadable-state') await chmod(host.state, 0o111);
    else if (fault === 'unreadable-lock') await chmod(path, 0);
    else {
      await rm(path);
      if (fault === 'directory-lock') await mkdir(path);
      if (fault === 'symlink-lock') await symlink(join(host.root, 'foreign.lock'), path);
    }
    try {
      const attempt = await host.run();
      expect(attempt.code).not.toBe(0);
      if (fault.includes('state') && fault !== 'unreadable-state')
        expect(attempt.output).toContain('invalid canonical edge state');
      if (['missing-lock', 'directory-lock', 'symlink-lock'].includes(fault))
        expect(attempt.output).toContain('invalid canonical edge lock');
      await host.expectOriginal();
    } finally {
      if (fault === 'unreadable-state') await chmod(host.state, 0o755);
      if (fault === 'unreadable-lock') await chmod(path, 0o644);
    }
  });

test('held canonical remote lock refuses', async () => {
  const host = await fixture();
  const child = Bun.spawn(
    ['flock', join(host.state, 'edge.lock'), 'sh', '-c', 'echo ready; read value'],
    { stdin: 'pipe', stdout: 'pipe' },
  );
  await child.stdout.getReader().read();
  try {
    expect((await host.run()).code).not.toBe(0);
    await host.expectOriginal();
  } finally {
    await child.stdin.end();
    await child.exited;
  }
});

for (const fault of ['staged', 'runtime'])
  test(`${fault} mismatch refuses before any replacement`, async () => {
    const host = await fixture();
    await writeFile(
      join(host.staging, fault === 'runtime' ? '0' : '2'),
      fault === 'runtime' ? '#!/bin/sh\necho 1.2.20\n' : 'corrupt',
    );
    // Runtime validation needs a valid hash so the independent version predicate is reached.
    if (fault === 'runtime')
      host.hashes[0] = new Bun.CryptoHasher('sha256')
        .update(await readFile(join(host.staging, '0')))
        .digest('hex');
    const attempt = await host.run();
    expect(attempt.code).not.toBe(0);
    expect(attempt.output).toContain(
      fault === 'runtime'
        ? 'staged solver Bun runtime is not supported'
        : `${host.staging}/2: FAILED`,
    );
    await host.expectOriginal();
  });

for (const fault of ['second-move', 'readback', 'service', 'readiness', 'no-socket'])
  test(`${fault} reports partial or uncertain publication without rollback`, async () => {
    const host = await fixture();
    if (fault === 'no-socket') await rm(host.socket);
    const attempt = await host.run(fault);
    expect(attempt.code).not.toBe(0);
    expect(attempt.output).toContain('partial or uncertain');
    expect(attempt.output).toContain(`attempt=${host.staging}`);
    for (const [index, hash] of host.hashes.entries())
      expect(attempt.output).toContain(`${hash}  ${host.files[index].remote}`);
    if (fault === 'readback')
      expect(await Bun.file(join(host.root, 'service')).exists()).toBe(false);
    expect(await readFile(host.files[0].remote, 'utf8')).not.toBe('old 0');
    if (fault === 'readiness' || fault === 'no-socket')
      expect((await readFile(join(host.root, 'service'), 'utf8')).match(/is-active/g)).toHaveLength(
        40,
      );
  });

for (const [local, fault] of [
  [false, ''],
  [false, 'staged-config'],
  [false, 'source-config'],
  [false, 'disconnect'],
  [false, 'upload'],
  [false, 'prepare'],
  [true, ''],
] as const)
  test(`real ${local ? 'local inherited' : 'remote'} CLI transport ${fault || 'positive'} retains captured hashes`, async () => {
    const host = await fixture();
    const root = host.root;
    for (const directory of ['dist/tool-remote-scripts', 'deploy/solver-supervisor'])
      await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, 'dist/tool-remote-scripts/solver-supervisor.js'), 'reviewed bundle');
    await writeFile(
      join(root, 'deploy/solver-supervisor/wbs-solver-supervisor.service'),
      'reviewed unit',
    );
    const config = join(root, 'config.json');
    await writeFile(
      config,
      JSON.stringify({
        socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
        maxSearchWorkers: 2,
        maxMemoryLimitMb: 512,
        pidsLimit: 128,
        maxManagedContainers: 16,
        devSourceSha: 'd'.repeat(40),
        images: [
          {
            callerName: 'be-01-blue',
            callerImage: `registry.example/wbs@sha256:${'a'.repeat(64)}`,
            solverImage: `registry.example/wbs@sha256:${'a'.repeat(64)}`,
          },
        ],
      }),
    );
    const expectedConfigHash = new Bun.CryptoHasher('sha256')
      .update(await readFile(config))
      .digest('hex');
    const scripts = {
      sh: `#!/bin/bash
set -eu
script="$2"
script="$(printf '%s' "$script" | sed "s|/home/puni1/|$HOST_ROOT/home/|g; s|/run/user/1000/wbs-solver/supervisor.sock|$HOST_ROOT/ready.sock|g")"
exec /bin/sh -c "$script"
`,
      cp: `#!/bin/bash
set -eu
remote="\${@: -1}"
remote="$(printf '%s' "$remote" | sed "s|/home/puni1/|$HOST_ROOT/home/|g")"
test "$(stat -c %a "$(dirname "$remote")")" = 700
/bin/cp -- "$2" "$remote"
if [[ "$remote" != *'.solver-'* ]]; then printf '%s\\n' "$remote" >> "$HOST_ROOT/uploads"; fi
`,
      ssh: `#!/bin/bash
set -eu
shift
script="$1"
script="$(printf '%s' "$script" | sed "s|/home/puni1/wbs/state|$WBS_EDGE_STATE|g; s|/home/puni1/|$HOST_ROOT/home/|g; s|/run/user/1000/wbs-solver/supervisor.sock|$HOST_ROOT/ready.sock|g")"
if [ "\${FAULT:-}" = prepare ]; then exit 78; fi
/bin/bash -c "$script"
if [ "\${FAULT:-}" = disconnect ] && [[ "$script" = *publishing=0* ]]; then exit 255; fi
`,
      scp: `#!/bin/bash
set -eu
remote="\${2#*:}"
remote="$(printf '%s' "$remote" | sed "s|/home/puni1/|$HOST_ROOT/home/|g")"
test "$(stat -c %a "$(dirname "$remote")")" = 700
if [ "\${FAULT:-}" = upload ]; then exit 79; fi
printf '%s\\n' "$remote" >> "$HOST_ROOT/uploads"
if [ "\${FAULT:-}" = source-config ] && [[ "$remote" = */2 ]]; then printf 'changed after capture' > "$1"; fi
/bin/cp "$1" "$remote"
if [ "\${FAULT:-}" = staged-config ] && [[ "$remote" = */2 ]]; then printf corrupt > "$remote"; fi
`,
    };
    for (const [name, script] of Object.entries(scripts)) {
      await writeFile(join(root, 'commands', name), script);
      await chmod(join(root, 'commands', name), 0o755);
    }
    const run = async () => {
      let argv = [
        process.execPath,
        new URL('./install-solver-supervisor.ts', import.meta.url).pathname,
        local ? '--local' : '--host=h2puni',
        `--config=${config}`,
        '--execute',
      ];
      if (local) {
        const launcher = join(root, 'cli-launch.ts');
        const outer = new URL('../../tool-devsync/src/solver-binding-runtime.ts', import.meta.url)
          .pathname;
        await writeFile(
          launcher,
          `import { runSolverBindingCommand } from ${JSON.stringify(outer)}; const attempt = await runSolverBindingCommand({cwd: ${JSON.stringify(root)}, argv: ${JSON.stringify(argv)}, edgeLock: 'inherit'}); if(attempt.exitCode !== 0) throw new Error(attempt.stderr);`,
        );
        argv = [
          'bash',
          '-c',
          'exec 8<"$WBS_EDGE_STATE/edge.lock"; flock -n 8; export WBS_EDGE_LOCK_FD=8; exec "$@"',
          'launch',
          process.execPath,
          launcher,
        ];
      }
      const child = Bun.spawn(argv, {
        cwd: root,
        env: {
          ...process.env,
          WBS_EDGE_STATE: host.state,
          HOST_ROOT: root,
          FAULT: fault,
          PATH: `${root}/commands:${process.env['PATH'] ?? ''}`,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, code };
    };
    const { stdout, stderr, code } = await run();
    if (fault !== '') {
      expect(stdout + stderr).toMatch(/attempt=\S*install-[a-f0-9-]+/);
      expect(stdout + stderr).toContain(expectedConfigHash);
      expect(stdout + stderr).toContain(
        new Bun.CryptoHasher('sha256').update('reviewed bundle').digest('hex'),
      );
      expect(stdout + stderr).toContain(
        new Bun.CryptoHasher('sha256').update('reviewed unit').digest('hex'),
      );
    }
    if (fault === '') {
      expect({ code, output: stdout + stderr }).toMatchObject({ code: 0 });
      expect(
        await readFile(join(root, 'home/.local/lib/wbs-solver/solver-supervisor.js'), 'utf8'),
      ).toBe('reviewed bundle');
      expect((await run()).code).toBe(0);
      const uploads = (await readFile(join(root, 'uploads'), 'utf8')).trim().split('\n');
      expect(uploads).toHaveLength(8);
      expect(new Set(uploads).size).toBe(8);
      expect(new Set(uploads.map((path) => path.slice(0, path.lastIndexOf('/')))).size).toBe(2);
      expect(
        (await readFile(join(root, 'service'), 'utf8')).trim().split('\n').slice(0, 4),
      ).toEqual([
        '--user daemon-reload',
        '--user enable wbs-solver-supervisor.service',
        '--user restart wbs-solver-supervisor.service',
        '--user is-active --quiet wbs-solver-supervisor.service',
      ]);
    } else if (fault === 'disconnect') {
      expect(code).not.toBe(0);
      expect(stdout + stderr).toContain('partial or uncertain');
      expect(stdout + stderr).toMatch(/attempt=\S*install-[a-f0-9-]+/);
      expect(stdout + stderr).toContain(
        new Bun.CryptoHasher('sha256').update('reviewed bundle').digest('hex'),
      );
      expect(stdout + stderr).not.toContain('installed, verified, and ready');
      expect(await Bun.file(join(root, 'service')).exists()).toBe(true);
    } else {
      expect(code).not.toBe(0);
      expect(stdout + stderr).toContain(
        fault === 'upload' || fault === 'prepare'
          ? 'partial or uncertain'
          : 'checksum did NOT match',
      );
      expect(stdout + stderr).toMatch(/attempt=\S*install-[a-f0-9-]+/);
      expect(stdout + stderr).toContain(
        new Bun.CryptoHasher('sha256').update('reviewed bundle').digest('hex'),
      );
      expect(await Bun.file(join(root, 'service')).exists()).toBe(false);
    }
  });

test('broken identity tool refuses the actual local installer shell', async () => {
  const host = await fixture();
  await writeFile(
    join(host.root, 'commands/stat'),
    '#!/bin/sh\nif [ "$1" = -Lc ]; then exit 127; fi\nexec /usr/bin/stat "$@"\n',
  );
  await chmod(join(host.root, 'commands/stat'), 0o755);
  expect((await host.run('', 'valid')).code).not.toBe(0);
  await host.expectOriginal();
});

test('unreadable canonical lock refuses even when the local description was acquired earlier', async () => {
  const host = await fixture();
  const attempt = await host.run('', 'unreadable-lock');
  expect(attempt.code).not.toBe(0);
  expect(attempt.output).toContain('edge lock: unreadable');
  await host.expectOriginal();
});

test('publication stages beside each destination across real filesystems before atomic replacement', async () => {
  const host = await fixture();
  const other = await mkdtemp('/dev/shm/solver-install-filesystem-');
  roots.push(other);
  expect((await stat(host.staging)).dev).not.toBe((await stat(other)).dev);
  for (const index of [2, 3]) {
    host.files[index].remote = join(other, `installed-${String(index)}`);
    await writeFile(host.files[index].remote, `old ${String(index)}`);
  }
  const script = join(host.root, 'commands/mv');
  await writeFile(
    script,
    (await readFile(script, 'utf8')).replace(
      '/bin/mv "$@"',
      `source_path="\${@: -2:1}"
destination_path="\${@: -1}"
source_identity=$(stat -c '%d:%i' "$source_path")
/bin/mv "$@"
destination_identity=$(stat -c '%d:%i' "$destination_path")
if [ "$source_identity" != "$destination_identity" ]; then echo 'cross-device publication copied into live bytes' >&2; exit 96; fi`,
    ),
  );
  expect(await host.run()).toMatchObject({ code: 0 });
  for (const [index, file] of host.files.entries())
    expect(await readFile(file.remote, 'utf8')).not.toBe(`old ${String(index)}`);
});

test('first installation creates destination parents inside admission before sibling preparation', async () => {
  const host = await fixture();
  for (const [index, file] of host.files.entries())
    file.remote = join(host.root, `new-parent-${String(index)}`, 'installed');
  expect(await host.run()).toMatchObject({ code: 0 });
  for (const [index, file] of host.files.entries()) {
    expect(await Bun.file(file.remote).exists()).toBe(true);
    expect((await stat(dirname(file.remote))).mode & 0o777).toBe(index === 2 ? 0o700 : 0o755);
  }
});

for (const fault of ['sibling-copy', 'sibling-hash', 'sibling-runtime'])
  test(`${fault} refuses before the first replacement and cleans owned staging`, async () => {
    const host = await fixture();
    const attempt = await host.run(fault);
    expect(attempt.code).not.toBe(0);
    expect(attempt.output).toContain(`attempt=${host.staging}`);
    if (fault === 'sibling-runtime')
      expect(attempt.output).toContain('sibling solver Bun runtime is not supported');
    await host.expectOriginal();
    expect((await readdir(host.root)).filter((name) => name.startsWith('.solver-stage-'))).toEqual(
      [],
    );
    expect(await Bun.file(join(host.staging, '0')).exists()).toBe(false);
  });

test('cleanup failure preserves evidence and refuses success after publication', async () => {
  const host = await fixture();
  const attempt = await host.run('sibling-cleanup');
  expect(attempt.code).not.toBe(0);
  expect(attempt.output).toContain('partial or uncertain solver supervisor staging cleanup');
  expect(attempt.output).toContain(`attempt=${host.staging}`);
  for (const hash of host.hashes) expect(attempt.output).toContain(hash);
  expect(await Bun.file(join(host.root, '.solver-stage-2/payload')).exists()).toBe(false);
  expect((await readdir(host.root)).filter((name) => name.startsWith('.solver-stage-'))).toEqual([
    '.solver-stage-2',
  ]);
  for (const [index, file] of host.files.entries())
    expect(await readFile(file.remote, 'utf8')).not.toBe(`old ${String(index)}`);
});

test('sibling collision preserves another attempt and cleans only created directories', async () => {
  const host = await fixture();
  const retained = join(host.root, '.solver-stage-2');
  await mkdir(retained);
  await writeFile(join(retained, 'retained'), 'other attempt');
  const attempt = await host.run();
  expect(attempt.code).not.toBe(0);
  expect(attempt.output).toContain(`attempt=${host.staging}`);
  await host.expectOriginal();
  expect(await readFile(join(retained, 'retained'), 'utf8')).toBe('other attempt');
  expect((await readdir(host.root)).filter((name) => name.startsWith('.solver-stage-'))).toEqual([
    '.solver-stage-2',
  ]);
});
