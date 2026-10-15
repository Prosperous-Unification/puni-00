import { chmod, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readCreationAttempt } from './creation-journal';

const ROOT = join(import.meta.dir, '../../..');

async function fixture(failCreation: boolean) {
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
  'run '*) printf '%064d\\n' 1 ;;
  'rm '*) ;;
  'network rm '*) rm '${present}' ;;
  'network create '*)
    test -n "$(find '${attempts}' -name '*.json' -print -quit)" || { echo 'missing reservation' >&2; exit 89; }
    ${failCreation ? "echo 'injected create failure' >&2; exit 71" : `touch '${present}'; printf '%064d\\n' 2`} ;;
  *) echo 'unexpected command' >&2; exit 99 ;;
esac
`,
  );
  await writeFile(join(binaries, 'k3d'), '#!/bin/sh\nprintf "k3d version v5.9.0\\n"\n');
  await writeFile(join(binaries, 'kubectl'), '#!/bin/sh\nprintf "Client Version: v1.36.4\\n"\n');
  for (const name of ['docker', 'k3d', 'kubectl']) await chmod(join(binaries, name), 0o700);
  const invoke = (action: 'up' | 'down') =>
    Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import { runLab } from ${JSON.stringify(join(ROOT, 'tools/tool-fleet/src/k3d-lab.ts'))}; await runLab(${JSON.stringify([action, '--id', 'f9', '--profile', 'app', ...(action === 'up' ? ['--worktree-root', root] : [])])}, ${JSON.stringify(root)});`,
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
  return { root, calls, attempts, invoke };
}

it('reserves a journal before real up creates resources and records a creation failure', async () => {
  const { calls, attempts, invoke } = await fixture(true);
  const invocation = invoke('up');
  const stderr = await new Response(invocation.stderr).text();
  expect(await invocation.exited).not.toBe(0);
  expect(stderr).toContain('injected create failure');
  expect(stderr).not.toContain('missing reservation');
  expect(stderr).not.toContain('lab -- down');
  expect(stderr).toContain('not cleanup authority');
  const journals = await readdir(attempts);
  expect(journals).toHaveLength(1);
  const attemptId = journals.at(0)?.replace(/\.json$/, '');
  expect(typeof attemptId).toBe('string');
  if (attemptId === undefined) throw new Error('Missing journal filename');
  expect(
    (await readCreationAttempt(attempts, { labId: 'f9', daemonId: 'daemon-1', attemptId })).state,
  ).toBe('failed');
  const commands = await readFile(calls, 'utf8');
  expect(commands).not.toContain('delete');
  expect(commands).not.toMatch(/(^|\n)(network )?rm /);
});

it('keeps old attempt journals across ordinary up down up', async () => {
  const { attempts, invoke } = await fixture(false);
  for (const action of ['up', 'down', 'up'] as const) {
    const invocation = invoke(action);
    const stderr = await new Response(invocation.stderr).text();
    expect({ code: await invocation.exited, stderr }).toEqual({ code: 0, stderr: '' });
  }
  const journals = await readdir(attempts);
  expect(journals).toHaveLength(2);
  for (const name of journals) {
    const attemptId = name.replace(/\.json$/, '');
    expect(
      (await readCreationAttempt(attempts, { labId: 'f9', daemonId: 'daemon-1', attemptId })).state,
    ).toBe('ready');
  }
});
