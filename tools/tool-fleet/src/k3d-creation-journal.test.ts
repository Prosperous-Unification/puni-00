import { chmod, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readCreationAttempt } from './creation-journal';
import type { HostCapacity } from './k3d-lab';

const ROOT = join(import.meta.dir, '../../..');

async function journalNames(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && /^[0-9a-f-]{36}\.json$/.test(entry.name)) names.push(entry.name);
    else if (!entry.isDirectory() || !/^[0-9a-f-]{36}\.operations$/.test(entry.name))
      throw new Error(`Unexpected attempt-history entry: ${entry.name}`);
  }
  return names;
}

async function fixture(
  failCreation:
    | 'none'
    | 'network'
    | 'cluster'
    | 'network-malformed'
    | 'registry'
    | 'registry-malformed'
    | 'foreign-race'
    | 'network-wrong-kind'
    | 'network-wrong-name'
    | 'registry-wrong-kind'
    | 'registry-wrong-name',
  capacity: HostCapacity = { availableMemoryMiB: 8192, freeDiskMiB: 16_384 },
) {
  const root = await scratchAsync('k3d-creation-caller-');
  const binaries = join(root, 'bin');
  await mkdir(binaries, { mode: 0o700 });
  for (const path of ['infra/versions', 'infra/local'])
    await mkdir(join(root, path), { recursive: true });
  for (const path of ['infra/versions/toolchain.json', 'infra/local/platform.k3d.yaml'])
    await copyFile(join(ROOT, path), join(root, path));
  expect(Bun.spawnSync(['git', 'init', '-q', root]).exitCode).toBe(0);
  await writeFile(join(root, '.gitignore'), '.puni/\n');
  const calls = join(root, 'calls');
  const present = join(root, 'present');
  const partial = join(root, 'partial-cluster');
  const attempts = join(root, '.puni/fleet-labs/k3d/.attempts/f9');
  await writeFile(
    join(binaries, 'docker'),
    `#!/bin/sh
printf '%s\\n' "$*" >> '${calls}'
case "$*" in
  'info --format {{.DockerRootDir}}') printf '%s\\n' '${root}' ;;
  'info --format {{.ID}}') printf '%s\\n' 'daemon-1' ;;
  'ps '*) if test -f '${present}'; then printf 'k3d-puni-f9-platform-server-0\\tf9\\tpuni-f9-platform\\npuni-f9-registry\\tf9\\t\\n'; fi ;;
  'network ls '*) if test -f '${present}'; then printf 'puni-f9\\tf9\\t\\n'; fi ;;
  'port '*) printf '5000/tcp -> 127.0.0.1:40000\\n' ;;
  'run '*)
    test "$4" = 'puni-f9-registry' || { echo 'wrong registry command name' >&2; exit 80; }
    grep -q '"kind":"container"' '${attempts}'/*.operations/registry.json || { echo 'missing registry kind binding' >&2; exit 85; }
    grep -q '"name":"puni-f9-registry"' '${attempts}'/*.operations/registry.json || { echo 'missing registry name binding' >&2; exit 84; }
    ${failCreation === 'registry-wrong-kind' ? `sed -i 's/"kind":"container"/"kind":"network"/' '${attempts}'/*.operations/registry.json` : failCreation === 'registry-wrong-name' ? `sed -i 's/"name":"puni-f9-registry"/"name":"puni-other"/' '${attempts}'/*.operations/registry.json` : ''}
    grep -q '"state":"created"' '${attempts}'/*.operations/network.json || { echo 'network receipt not durable' >&2; exit 88; }
    ${failCreation === 'registry' ? "echo 'injected registry failure' >&2; exit 73" : failCreation === 'registry-malformed' ? "printf 'not-an-id\\n'" : "printf '%064d\\n' 1"} ;;
  'rm '*) ;;
  'network rm '*) rm '${present}' ;;
  'network create '*)
    grep -q '"kind":"network"' '${attempts}'/*.operations/network.json || { echo 'missing network kind binding' >&2; exit 83; }
    grep -q '"name":"puni-f9"' '${attempts}'/*.operations/network.json || { echo 'missing network name binding' >&2; exit 82; }
    test "$5" = 'puni-f9' || { echo 'wrong network command name' >&2; exit 81; }
    ${failCreation === 'network-wrong-kind' ? `sed -i 's/"kind":"network"/"kind":"container"/' '${attempts}'/*.operations/network.json` : failCreation === 'network-wrong-name' ? `sed -i 's/"name":"puni-f9"/"name":"puni-other"/' '${attempts}'/*.operations/network.json` : ''}
    test -n "$(find '${attempts}' -name '*.json' -print -quit)" || { echo 'missing reservation' >&2; exit 89; }
    grep -q '"state":"pending"' '${attempts}'/*.operations/network.json || { echo 'missing pending operation' >&2; exit 87; }
    ${failCreation === 'network' ? "echo 'injected create failure' >&2; exit 71" : failCreation === 'foreign-race' ? `touch '${present}'; echo 'foreign name race' >&2; exit 74` : failCreation === 'network-malformed' ? `touch '${present}'; printf 'not-an-id\\n'` : `touch '${present}'; printf '%064d\\n' 2`} ;;
  *) echo 'unexpected command' >&2; exit 99 ;;
esac
`,
  );
  await writeFile(
    join(binaries, 'k3d'),
    `#!/bin/sh
printf 'k3d %s\\n' "$*" >> '${calls}'
case "$*" in
  version) printf 'k3d version v5.9.0\\n' ;;
  'cluster create '*)
    ${
      failCreation === 'cluster'
        ? `
    printf 'partially created cluster' > '${partial}'
    no_rollback=false
    for argument in "$@"; do
      if test "$argument" = '--no-rollback'; then no_rollback=true; fi
    done
    if test "$no_rollback" = false; then
      rm '${partial}'
      printf 'k3d internal rollback\\n' >> '${calls}'
    fi
    echo 'injected k3d cluster create failure' >&2
    exit 72`
        : "printf 'cluster created\\n'"
    } ;;
  'cluster delete '*) ;;
  'kubeconfig get '*) printf 'fixture kubeconfig\\n' ;;
  *) echo 'unexpected k3d command' >&2; exit 99 ;;
esac
`,
  );
  await writeFile(join(binaries, 'kubectl'), '#!/bin/sh\nprintf "Client Version: v1.36.4\\n"\n');
  for (const name of ['docker', 'k3d', 'kubectl']) await chmod(join(binaries, name), 0o700);
  const invoke = (action: 'up' | 'down') =>
    Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import { runLab } from ${JSON.stringify(join(ROOT, 'tools/tool-fleet/src/k3d-lab.ts'))}; await runLab(${JSON.stringify([action, '--id', 'f9', '--profile', 'app', ...(action === 'up' ? ['--worktree-root', root] : [])])}, ${JSON.stringify(root)}, async () => (${JSON.stringify(capacity)}));`,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binaries}:${process.env['PATH'] ?? ''}`,
          K3D: join(binaries, 'k3d'),
          KUBECTL: join(binaries, 'kubectl'),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
  return { root, calls, attempts, partial, invoke };
}

it('reserves a journal before real up creates resources and records a creation failure', async () => {
  const { calls, attempts, invoke } = await fixture('network');
  const invocation = invoke('up');
  const stderr = await new Response(invocation.stderr).text();
  expect(await invocation.exited).not.toBe(0);
  expect(stderr).toContain('injected create failure');
  expect(stderr).not.toContain('missing reservation');
  expect(stderr).not.toContain('lab -- down');
  expect(stderr).toContain('not cleanup authority');
  const journals = await journalNames(attempts);
  expect(journals).toHaveLength(1);
  const attemptId = journals.at(0)?.replace(/\.json$/, '');
  expect(typeof attemptId).toBe('string');
  if (attemptId === undefined) throw new Error('Missing journal filename');
  expect(
    (await readCreationAttempt(attempts, { labId: 'f9', daemonId: 'daemon-1', attemptId })).state,
  ).toBe('failed');
  const operation: unknown = JSON.parse(
    await readFile(join(attempts, `${attemptId}.operations`, 'network.json'), 'utf8'),
  );
  expect(operation).toMatchObject({ state: 'pending' });
  const commands = await readFile(calls, 'utf8');
  expect(commands).not.toContain('delete');
  expect(commands).not.toMatch(/(^|\n)(network )?rm /);
});

it('keeps old attempt journals across ordinary up down up', async () => {
  const { attempts, invoke } = await fixture('none');
  for (const action of ['up', 'down', 'up'] as const) {
    const invocation = invoke(action);
    const stderr = await new Response(invocation.stderr).text();
    expect({ code: await invocation.exited, stderr }).toEqual({ code: 0, stderr: '' });
  }
  const journals = await journalNames(attempts);
  expect(journals).toHaveLength(2);
  for (const name of journals) {
    const attemptId = name.replace(/\.json$/, '');
    expect(
      (await readCreationAttempt(attempts, { labId: 'f9', daemonId: 'daemon-1', attemptId })).state,
    ).toBe('ready');
  }
});

it('disables k3d rollback when cluster creation fails and leaves its partial fixture for manual inspection', async () => {
  const { calls, attempts, partial, invoke } = await fixture('cluster');
  const invocation = invoke('up');
  const stderr = await new Response(invocation.stderr).text();
  expect(await invocation.exited).not.toBe(0);
  expect(stderr).toContain('injected k3d cluster create failure');
  expect(stderr).toContain('not cleanup authority');
  expect(stderr).not.toContain('lab -- down');
  expect(await readFile(partial, 'utf8')).toBe('partially created cluster');
  expect(stderr).toContain('resource state is unknown');
  const commands = await readFile(calls, 'utf8');
  expect(commands).toContain('k3d cluster create');
  expect(commands).not.toContain('internal rollback');
  expect(commands).not.toContain('cluster delete');
  expect(commands).not.toMatch(/(^|\n)(network )?rm /);
  const journals = await journalNames(attempts);
  expect(journals).toHaveLength(1);
  const attemptId = journals.at(0)?.replace(/\.json$/, '');
  if (attemptId === undefined) throw new Error('Missing journal filename');
  expect(
    (await readCreationAttempt(attempts, { labId: 'f9', daemonId: 'daemon-1', attemptId })).state,
  ).toBe('failed');
});

for (const fault of [
  'network-malformed',
  'registry',
  'registry-malformed',
  'foreign-race',
] as const) {
  it(`leaves unresolved ${fault} evidence through real up without adoption or cleanup`, async () => {
    const { calls, attempts, invoke } = await fixture(fault);
    const invocation = invoke('up');
    const stderr = await new Response(invocation.stderr).text();
    expect(await invocation.exited).not.toBe(0);
    expect(stderr).toContain('not cleanup authority');
    const journals = await journalNames(attempts);
    expect(journals).toHaveLength(1);
    const attemptId = journals.at(0)?.replace(/\.json$/, '');
    if (attemptId === undefined) throw new Error('Missing attempt');
    const slot = fault.startsWith('registry') ? 'registry' : 'network';
    const operation: unknown = JSON.parse(
      await readFile(join(attempts, `${attemptId}.operations`, `${slot}.json`), 'utf8'),
    );
    expect(operation).toMatchObject({ state: 'pending' });
    const commands = await readFile(calls, 'utf8');
    expect(commands).not.toContain('cluster create');
    expect(commands).not.toContain('delete');
    expect(commands).not.toMatch(/(^|\n)(network )?rm /);
    if (slot === 'network') expect(commands).not.toMatch(/(^|\n)run /);
  });
}

for (const fault of [
  'network-wrong-kind',
  'network-wrong-name',
  'registry-wrong-kind',
  'registry-wrong-name',
] as const) {
  it(`refuses ${fault} after real Docker command without continuing creation`, async () => {
    const { calls, invoke } = await fixture(fault);
    const invocation = invoke('up');
    const stderr = await new Response(invocation.stderr).text();
    expect(await invocation.exited).not.toBe(0);
    expect(stderr).toContain(
      fault.endsWith('kind') ? 'operation kind mismatch' : 'operation name mismatch',
    );
    const commands = await readFile(calls, 'utf8');
    expect(commands).not.toContain('cluster create');
    expect(commands).not.toContain('delete');
    expect(commands).not.toMatch(/(^|\n)(network )?rm /);
    if (fault.startsWith('network')) expect(commands).not.toMatch(/(^|\n)run /);
  });
}

for (const capacity of [
  { availableMemoryMiB: 8192, freeDiskMiB: 7250 },
  { availableMemoryMiB: 4095, freeDiskMiB: 16_384 },
]) {
  it(`refuses insufficient app capacity ${JSON.stringify(capacity)} before resource creation`, async () => {
    const { calls, invoke } = await fixture('network', capacity);
    const invocation = invoke('up');
    const stderr = await new Response(invocation.stderr).text();
    expect(await invocation.exited).not.toBe(0);
    expect(stderr).toContain('k3d lab profile app refused');
    expect(stderr).toContain(
      capacity.freeDiskMiB === 7250
        ? '7250 MiB Docker disk free, 12288 MiB required'
        : '4095 MiB memory available, 4096 MiB required',
    );
    const commands = await readFile(calls, 'utf8');
    expect(commands).not.toContain('network create');
    expect(commands).not.toMatch(/(^|\n)run /);
    expect(commands).not.toContain('cluster create');
  });
}

it('admits exact app capacity and reaches resource creation', async () => {
  const { calls, invoke } = await fixture('network', {
    availableMemoryMiB: 4096,
    freeDiskMiB: 12_288,
  });
  const invocation = invoke('up');
  const stderr = await new Response(invocation.stderr).text();
  expect(await invocation.exited).not.toBe(0);
  expect(stderr).toContain('injected create failure');
  expect(stderr).not.toContain('k3d lab profile app refused');
  expect(await readFile(calls, 'utf8')).toContain('network create');
});
