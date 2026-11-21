import { ok, rejects } from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { testRegistryPressureRules } from './pressure-rules';

const entrypoint = fileURLToPath(new URL('./pressure-rules.ts', import.meta.url));

const pin = {
  role: 'prometheus',
  name: 'quay.io/prometheus/prometheus:v3.14.0-distroless',
  digest: 'sha256:50c707e96da5ade383cb1707790576480485e93de06aa60ad8802cb5f744bd0a',
};

describe('registry pressure native validation', () => {
  let root: string;
  let lock: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'registry-pressure-lock-'));
    const directory = join(root, 'infra', 'versions');
    await mkdir(directory, { recursive: true });
    lock = join(directory, 'toolchain.json');
  });
  afterEach(async () => {
    await rm(root, { recursive: true });
  });

  async function writePins(images: unknown) {
    await writeFile(lock, JSON.stringify({ charts: { kubePrometheusStack: { images } } }));
  }

  it('propagates an absent central lock', async () => {
    await rejects(testRegistryPressureRules(root), /ENOENT/);
  });

  it('propagates an unreadable central lock path', async () => {
    await mkdir(lock);
    await rejects(testRegistryPressureRules(root), /EISDIR/);
  });

  it('refuses malformed lock JSON', async () => {
    await writeFile(lock, '{"charts":');
    await rejects(testRegistryPressureRules(root), SyntaxError);
  });

  it('refuses a malformed central image inventory', async () => {
    await writePins({ prometheus: pin });
    await rejects(testRegistryPressureRules(root), /images must be an array/);
  });

  it.each([
    ['absent', []],
    ['duplicate', [pin, pin]],
  ])('refuses %s Prometheus image selection', async (_name, pins) => {
    await writePins(pins);
    await rejects(testRegistryPressureRules(root), /exactly one Prometheus image/);
  });

  it.each([
    ['unpinned version', { ...pin, name: 'quay.io/prometheus/prometheus:latest' }, /name/],
    ['unpinned digest', { ...pin, digest: 'latest' }, /digest/],
  ])('refuses an %s', async (_name, changedPin, diagnostic) => {
    await writePins([changedPin]);
    await rejects(testRegistryPressureRules(root), diagnostic);
  });

  function runCli(...arguments_: string[]) {
    return Bun.spawnSync([process.execPath, entrypoint, ...arguments_], {
      env: { ...process.env, PATH: root },
      timeout: 10_000,
    });
  }

  it('exits visibly when the Docker executable is missing', async () => {
    await writePins([pin]);
    const child = runCli(root);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toMatch(
      /docker.*(?:ENOENT|not found)|(?:ENOENT|not found).*docker/i,
    );
    expect(child.stdout.toString()).toBe('');
  });

  it('preserves subprocess output on a failed native validation', async () => {
    await writePins([pin]);
    await writeFile(
      join(root, 'docker'),
      '#!/bin/sh\necho native-stdout\necho native-stderr >&2\nexit 42\n',
      {
        mode: 0o700,
      },
    );
    const child = runCli(root);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain(
      'promtool check config /etc/puni/prometheus.yaml exited 42',
    );
    expect(child.stderr.toString()).toContain('native-stdout');
    expect(child.stderr.toString()).toContain('native-stderr');
    expect(child.stdout.toString()).toBe('');
  });

  it('invokes only the offline read-only container and returns both validation commands', async () => {
    await writePins([pin]);
    await writeFile(join(root, 'docker'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
    const child = runCli(root);
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
    const output = child.stdout.toString();
    const mount = /type=bind,source=.*registry-pressure-rules-\w+,target=\/etc\/puni,readonly/.exec(
      output,
    )?.[0];
    ok(mount);
    const options = [
      'run',
      '--rm',
      '--pull=never',
      '--network=none',
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--mount',
      mount,
      '--workdir',
      '/tmp',
      '--entrypoint',
      '/bin/promtool',
      `${pin.name}@${pin.digest}`,
    ];
    expect(output.split('\n')).toEqual([
      ...options,
      'check',
      'config',
      '/etc/puni/prometheus.yaml',
      ...options,
      'test',
      'rules',
      '/etc/puni/registry-pressure.test.yaml',
      '/etc/puni/registry-pressure.precision.test.yaml',
      '',
    ]);
  });

  it('stages every native input read-only under umask 077', async () => {
    await writePins([pin]);
    const names = [
      'prometheus.yaml',
      'rules.yaml',
      'registry-pressure.rules.yaml',
      'registry-pressure.test.yaml',
      'registry-pressure.precision.test.yaml',
    ];
    await writeFile(
      join(root, 'docker'),
      `#!/bin/sh
set -eu
for argument do
  case "$argument" in
    type=bind,source=*,target=/etc/puni,readonly)
      directory=\${argument#type=bind,source=}
      directory=\${directory%,target=/etc/puni,readonly}
      for name in ${names.join(' ')}; do
        printf '%s %s\\n' "$(/usr/bin/stat -c %a "$directory/$name")" "$name"
      done
      ;;
  esac
done
`,
      { mode: 0o700 },
    );
    const child = Bun.spawnSync(
      [
        '/bin/sh',
        '-c',
        'umask 077; exec "$@"',
        'registry-pressure-umask',
        process.execPath,
        entrypoint,
        root,
      ],
      { env: { ...process.env, PATH: root }, timeout: 10_000 },
    );
    expect(child.stderr.toString()).toBe('');
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString().trimEnd().split('\n')).toEqual(
      [...names, ...names].map((name) => `444 ${name}`),
    );
  });

  it.each([
    { name: 'absent', arguments_: [] },
    { name: 'blank', arguments_: [' '] },
    { name: 'extra', arguments_: ['.', 'extra'] },
  ])('requires one explicit root when it is $name', ({ arguments_ }) => {
    const child = runCli(...arguments_);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain('Usage: pressure-rules.ts <root>');
  });
});
