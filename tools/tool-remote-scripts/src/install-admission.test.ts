import { constants } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createHost() {
  const root = await mkdtemp(join(tmpdir(), 'install-admission-'));
  roots.push(root);
  for (const directory of [
    'commands',
    'state',
    'bin',
    'dist/tool-remote-scripts',
    'dist/tool-smoke',
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  for (const name of ['swap', 'smoke']) {
    await writeFile(join(root, 'bin', `${name}.js`), `old ${name}`);
    await writeFile(
      join(root, 'dist', name === 'swap' ? 'tool-remote-scripts' : 'tool-smoke', `${name}.js`),
      `new ${name}`,
    );
  }
  await writeFile(join(root, 'state/edge.lock'), '');
  const scripts = {
    ssh: `#!/bin/bash
set -eu
shift
command_text="$1"
command_text="$(printf '%s' "$command_text" | sed "s|/home/puni1/wbs|$TEST_HOST|g")"
/bin/bash -c "$command_text"
`,
    scp: `#!/bin/bash
set -eu
remote="\${2#*:}"
remote="$(printf '%s' "$remote" | sed "s|/home/puni1/wbs|$TEST_HOST|g")"
printf '%s\\n' "$remote" >> "$TEST_HOST/uploads"
/bin/cp "$1" "$remote"
if [ "\${INSTALL_FAULT:-}" = staged ]; then printf corrupted > "$remote"; fi
`,
    sha256sum: `#!/bin/bash
set -eu
checks=$(cat)
if [[ "$checks" != *install-* ]] && /usr/bin/flock -n "$TEST_HOST/state/edge.lock" /bin/true; then
  printf 'readback escaped edge lock\\n' >&2
  exit 93
fi
printf '%s\\n' "$checks" | /usr/bin/sha256sum "$@"
`,
    mv: `#!/bin/bash
set -eu
if /usr/bin/flock -n "$TEST_HOST/state/edge.lock" /bin/true; then
  printf 'replacement escaped edge lock\\n' >&2
  exit 91
fi
if [ "\${INSTALL_FAULT:-}" = second-move ] && [[ "$*" = *smoke.js ]]; then exit 92; fi
/bin/mv "$@"
if [ "\${INSTALL_FAULT:-}" = readback ]; then printf corrupt > "\${@: -1}"; fi
`,
  };
  for (const [name, script] of Object.entries(scripts)) {
    await writeFile(join(root, 'commands', name), script);
    await chmod(join(root, 'commands', name), 0o755);
  }
  return {
    root,
    async install(fault = '') {
      const child = Bun.spawn(
        [process.execPath, new URL('./install.ts', import.meta.url).pathname, '--execute'],
        {
          cwd: root,
          env: {
            ...process.env,
            WBS_ENV: 'prod',
            PATH: `${root}/commands:${process.env['PATH'] ?? ''}`,
            TEST_HOST: root,
            INSTALL_FAULT: fault,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, output: stdout + stderr };
    },
    async expectOriginal() {
      expect(await readFile(join(root, 'bin/swap.js'), 'utf8')).toBe('old swap');
      expect(await readFile(join(root, 'bin/smoke.js'), 'utf8')).toBe('old smoke');
    },
  };
}

test('replacement and readback hold canonical edge lock; attempts own distinct staging', async () => {
  const host = await createHost();
  expect(await host.install()).toMatchObject({ code: 0 });
  expect(await readFile(join(host.root, 'bin/swap.js'), 'utf8')).toBe('new swap');
  expect(await readFile(join(host.root, 'bin/smoke.js'), 'utf8')).toBe('new smoke');
  expect(await host.install()).toMatchObject({ code: 0 });
  const paths = (await readFile(join(host.root, 'uploads'), 'utf8')).trim().split('\n');
  expect(new Set(paths).size).toBe(4);
});

for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
  for (const shape of ['malformed', 'unreadable', 'directory', 'dangling']) {
    test(`${marker} ${shape} closes replacement before effects`, async () => {
      const host = await createHost();
      const path = join(host.root, 'state', marker);
      if (shape === 'directory') await mkdir(path);
      else if (shape === 'dangling') await symlink('absent', path);
      else {
        await writeFile(path, '{malformed');
        if (shape === 'unreadable') await chmod(path, 0);
      }
      const attempt = await host.install();
      expect(attempt.code).not.toBe(0);
      expect(attempt.output).toContain('owner admission closed');
      await host.expectOriginal();
    });
  }
}

test('missing canonical lock refuses without creating a replacement lock', async () => {
  const host = await createHost();
  await rm(join(host.root, 'state/edge.lock'));
  expect((await host.install()).code).not.toBe(0);
  await host.expectOriginal();
  expect(await Bun.file(join(host.root, 'state/edge.lock')).exists()).toBe(false);
});

test('staged bytes are validated before either replacement', async () => {
  const host = await createHost();
  const attempt = await host.install('staged');
  expect(attempt.code).not.toBe(0);
  expect(attempt.output).toContain('FAILED');
  await host.expectOriginal();
});

for (const fault of ['second-move', 'readback']) {
  test(`${fault} loudly reports partial or uncertain replacement`, async () => {
    const host = await createHost();
    const attempt = await host.install(fault);
    expect(attempt.code).not.toBe(0);
    expect(attempt.output).toMatch(/partial|uncertain/);
  });
}

test('another holder excludes replacement until the canonical lock is available', async () => {
  const host = await createHost();
  const holder = Bun.spawn(
    ['flock', '-n', join(host.root, 'state/edge.lock'), 'sh', '-c', 'printf ready; cat'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  const reader = holder.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('ready');
  try {
    expect((await host.install()).code).not.toBe(0);
    await host.expectOriginal();
  } finally {
    await holder.stdin.end();
    expect(await holder.exited).toBe(0);
    reader.releaseLock();
  }
  expect((await host.install()).code).toBe(0);
});

test('unreadable canonical state refuses rather than treating markers as absent', async () => {
  const host = await createHost();
  await chmod(join(host.root, 'state'), 0);
  try {
    expect((await host.install()).code).not.toBe(0);
    await host.expectOriginal();
  } finally {
    await chmod(join(host.root, 'state'), 0o700);
  }
});

for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
  test(`documented durable recovery refuses ${marker} before interpreter or publication effects`, async () => {
    const host = await createHost();
    await writeFile(join(host.root, 'state', marker), '{malformed');
    const runbook = await Bun.file(
      new URL('../../../docs/runbook-dev-deploy.md', import.meta.url),
    ).text();
    const start = runbook.indexOf("ssh h2puni '", runbook.indexOf('### Durable poller recovery'));
    expect(start).toBeGreaterThan(-1);
    const end = runbook.indexOf("'\n```", start);
    expect(end).toBeGreaterThan(start);
    const command = runbook
      .slice(start, end + 1)
      .replaceAll('/home/puni1/wbs-dev', host.root)
      .replaceAll('/home/puni1/wbs', host.root);
    const child = Bun.spawn(['bash', '-c', command], {
      env: {
        ...process.env,
        TEST_HOST: host.root,
        PATH: `${host.root}/commands:${process.env['PATH'] ?? ''}`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('owner-admission-closed');
    await host.expectOriginal();
  });
}

for (const shape of ['directory', 'fifo', 'symlink', 'unreadable']) {
  test(`${shape} canonical lock refuses before replacement`, async () => {
    const host = await createHost();
    const path = join(host.root, 'state/edge.lock');
    await rm(path);
    let fifo;
    if (shape === 'directory') await mkdir(path);
    else if (shape === 'fifo') {
      expect(await Bun.spawn(['mkfifo', path]).exited).toBe(0);
      // Keep FIFO open without blocking so the broken guard can reach actual publication.
      fifo = await open(path, constants.O_RDWR | constants.O_NONBLOCK);
    } else if (shape === 'symlink') {
      await writeFile(join(host.root, 'state/real.lock'), '');
      await symlink('real.lock', path);
    } else {
      await writeFile(path, '');
      await chmod(path, 0);
    }
    try {
      expect((await host.install()).code).not.toBe(0);
      await host.expectOriginal();
    } finally {
      await fifo?.close();
    }
  });
}

for (const marker of ['edge-owner.json', 'edge-owner.pending']) {
  test(`symlink canonical state cannot hide ${marker} from installer`, async () => {
    const host = await createHost();
    await writeFile(join(host.root, 'state', marker), '{malformed');
    await rename(join(host.root, 'state'), join(host.root, 'state-real'));
    await symlink('state-real', join(host.root, 'state'));
    const attempt = await host.install();
    expect(attempt.code).not.toBe(0);
    expect(attempt.output).toContain('invalid canonical edge state');
    await host.expectOriginal();
  });

  test(`documented durable recovery rejects symlink state hiding ${marker}`, async () => {
    const host = await createHost();
    await writeFile(join(host.root, 'state', marker), '{malformed');
    await rename(join(host.root, 'state'), join(host.root, 'state-real'));
    await symlink('state-real', join(host.root, 'state'));
    const runbook = await Bun.file(
      new URL('../../../docs/runbook-dev-deploy.md', import.meta.url),
    ).text();
    const start = runbook.indexOf("ssh h2puni '", runbook.indexOf('### Durable poller recovery'));
    expect(start).toBeGreaterThan(-1);
    const end = runbook.indexOf("'\n```", start);
    expect(end).toBeGreaterThan(start);
    const command = runbook
      .slice(start, end + 1)
      .replaceAll('/home/puni1/wbs-dev', host.root)
      .replaceAll('/home/puni1/wbs', host.root);
    const child = Bun.spawn(['bash', '-c', command], {
      env: {
        ...process.env,
        TEST_HOST: host.root,
        PATH: `${host.root}/commands:${process.env['PATH'] ?? ''}`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('invalid canonical edge state');
    await host.expectOriginal();
  });
}
