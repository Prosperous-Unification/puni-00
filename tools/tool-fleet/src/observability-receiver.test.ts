import { access, chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseAllDocuments } from 'yaml';

const root = join(import.meta.dir, '../../..');
const manifest = join(root, 'infra/platform/observability/local/receiver.yaml');
const Container = type({
  command: 'string[]',
  'env?': type({ name: 'string', value: 'string' }).array(),
});
async function fixture() {
  if (process.getuid?.() === 0)
    throw new Error('Receiver permission tests require the intended nonroot boundary');
  const directory = await scratchAsync('receiver-');
  const sink = join(directory, 'mirror');
  const executable = join(directory, 'bin');
  await mkdir(executable);
  // Only the process launch is replaced: bootstrap and CGI bytes come from the owning manifest.
  await writeFile(join(executable, 'httpd'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const deployment = parseAllDocuments(await readFile(manifest, 'utf8'))[0];
  const container = type({
    spec: { template: { spec: { containers: Container.array() } } },
  }).assert(deployment.toJSON()).spec.template.spec.containers[0];
  const command = container.command[2]
    .replaceAll('/tmp', directory)
    .replaceAll('/proc/1/fd/1', sink);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...Object.fromEntries((container.env ?? []).map(({ name, value }) => [name, value])),
    PATH: `${executable}:${type('string').assert(process.env['PATH'])}`,
  };
  const bootstrap = () =>
    Bun.spawnSync(['sh', '-c', command], { env: environment, timeout: 2000, maxBuffer: 262144 });
  expect(bootstrap().exitCode).toBe(0);
  const invoke = (
    body: string | Uint8Array,
    length: string | undefined = String(Buffer.byteLength(body)),
  ) => {
    const supplied = { ...environment, CONTENT_LENGTH: length };
    return Bun.spawnSync(['sh', join(directory, 'www/cgi-bin/alert')], {
      env: supplied,
      stdin: Buffer.from(body),
      timeout: 12000,
      maxBuffer: 262144,
    });
  };
  return {
    directory,
    sink,
    executable,
    environment,
    bootstrap,
    invoke,
    log: join(directory, 'alerts.log'),
  };
}
function status(response: { stdout?: Uint8Array }, expected: number) {
  if (response.stdout === undefined) throw new Error('Receiver response pipe absent');
  const output = Buffer.from(response.stdout).toString();
  expect(output).toStartWith(`Status: ${String(expected)} `);
  if (expected !== 200) expect(output).not.toContain('\r\n\r\nok\n');
}

test('receiver retains opaque firing and resolved bytes including trailing newlines before acknowledging', async () => {
  const receiver = await fixture();
  for (const body of [
    '{"status":"firing","labels":{"environment":"dev"}}\n\n',
    '{"status":"resolved"}\n',
  ]) {
    status(receiver.invoke(body), 200);
    expect(await readFile(receiver.log, 'utf8')).toContain(` ${body}\n`);
    expect(await readFile(receiver.sink, 'utf8')).toBe(`alert-received ${body}\n`);
  }
  const history = await readFile(receiver.log, 'utf8');
  expect(history.indexOf('firing')).toBeLessThan(history.indexOf('resolved'));
  expect(receiver.bootstrap().exitCode).toBe(0);
  expect(await readFile(receiver.log, 'utf8')).toBe(history);
});

test.each([
  ['absent', undefined, 400],
  ['malformed', '-1', 400],
  ['fractional', '1.0', 400],
  ['oversized', '65537', 413],
  ['huge decimal', '999999999999999999999', 413],
  ['overlong zero', '000000000000', 413],
  ['short', '4', 400],
] as const)('receiver refuses %s length without recording', async (_name, length, expected) => {
  const receiver = await fixture();
  const response =
    length === undefined
      ? Bun.spawnSync(['sh', join(receiver.directory, 'www/cgi-bin/alert')], {
          env: receiver.environment,
          stdin: Buffer.from('x'),
          timeout: 2000,
          maxBuffer: 262144,
        })
      : receiver.invoke('x', length);
  status(response, expected);
  expect(await readFile(receiver.log, 'utf8')).toBe('');
});

test('receiver accepts its exact body boundary and opaque zero bytes without JSON parsing', async () => {
  const receiver = await fixture();
  const body = Buffer.alloc(65536, 0);
  status(receiver.invoke(body), 200);
  const recorded = await readFile(receiver.log);
  expect(recorded.subarray(36, -1)).toEqual(body);
  status(receiver.invoke('', '00000'), 200);
});

test('receiver refuses full history without deleting old firing or resolved evidence', async () => {
  const receiver = await fixture();
  const history = Buffer.alloc(8388608, 120);
  await writeFile(receiver.log, history);
  status(receiver.invoke('x'), 507);
  expect(await readFile(receiver.log)).toEqual(history);
});

test('receiver refuses a busy writer and interrupted startup without resetting history', async () => {
  const receiver = await fixture();
  await writeFile(receiver.log, 'prior firing\n');
  await mkdir(join(receiver.directory, 'receiver.lock'));
  status(receiver.invoke('resolved'), 503);
  expect(receiver.bootstrap().exitCode).not.toBe(0);
  expect(await readFile(receiver.log, 'utf8')).toBe('prior firing\n');
});

test.each(['missing', 'unreadable'] as const)(
  'receiver refuses %s established history on request and restart',
  async (fault) => {
    const receiver = await fixture();
    if (fault === 'missing') await rm(receiver.log);
    else await chmod(receiver.log, 0);
    try {
      status(receiver.invoke('x'), 500);
      expect(receiver.bootstrap().exitCode).not.toBe(0);
    } finally {
      if (fault === 'unreadable') await chmod(receiver.log, 0o600);
    }
  },
);

async function inject(
  receiver: Awaited<ReturnType<typeof fixture>>,
  applet: string,
  script: string,
) {
  await writeFile(join(receiver.executable, applet), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

test.each([
  [
    'failed write',
    'cat',
    'if [ "$1" = alerts.log ]; then printf partial; exit 1; fi; exec /bin/cat "$@"',
  ],
  [
    'short write',
    'cat',
    'if [ "$1" = alerts.log ]; then printf partial; exit 0; fi; exec /bin/cat "$@"',
  ],
  ['failed rename', 'mv', 'exit 1'],
  ['interrupted commit', 'mv', 'kill -TERM "$PPID"; exit 1'],
] as const)('receiver preserves prior history after %s', async (name, applet, script) => {
  const receiver = await fixture();
  await writeFile(receiver.log, 'prior firing\n');
  await inject(receiver, applet, script);
  const response = receiver.invoke('resolved');
  if (name === 'interrupted commit') expect(response.stdout.toString()).not.toContain('ok');
  else status(response, 500);
  expect(await readFile(receiver.log, 'utf8')).toBe('prior firing\n');
  expect(await access(join(receiver.directory, 'receiver.lock')).then(() => true)).toBe(true);
  expect(receiver.bootstrap().exitCode).not.toBe(0);
});

test.each([
  ['failed readback', 'exit 1'],
  ['changed readback', 'printf wrong'],
] as const)('receiver refuses %s after commit', async (_name, script) => {
  const receiver = await fixture();
  await inject(receiver, 'tail', script);
  status(receiver.invoke('resolved'), 500);
  expect(await readFile(receiver.log, 'utf8')).toContain(' resolved\n');
  expect(receiver.bootstrap().exitCode).not.toBe(0);
});

test('receiver refuses stdout failure after preserving the recorded body', async () => {
  const receiver = await fixture();
  await mkdir(receiver.sink);
  status(receiver.invoke('resolved'), 500);
  expect(await readFile(receiver.log, 'utf8')).toContain(' resolved\n');
  expect(receiver.bootstrap().exitCode).not.toBe(0);
});

test('receiver serializes concurrent body readers with a nonwaiting writer lock', async () => {
  const receiver = await fixture();
  const first = Bun.spawn(['sh', join(receiver.directory, 'www/cgi-bin/alert')], {
    env: { ...receiver.environment, CONTENT_LENGTH: '5' },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  try {
    let locked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      locked = await access(join(receiver.directory, 'receiver.lock')).then(
        () => true,
        () => false,
      );
      if (locked) break;
      await Bun.sleep(10);
    }
    expect(locked).toBe(true);
    status(receiver.invoke('second'), 503);
    await first.stdin.write('first');
    await first.stdin.end();
    expect(await new Response(first.stdout).text()).toStartWith('Status: 200 ');
    expect(await first.exited).toBe(0);
    expect(await readFile(receiver.log, 'utf8')).toContain(' first\n');
    expect(await readFile(receiver.log, 'utf8')).not.toContain('second');
  } finally {
    await first.stdin.end();
    await first.exited;
  }
});

test('receiver ends a stalled body at the declared ten-second deadline', async () => {
  const receiver = await fixture();
  const started = performance.now();
  const stalled = Bun.spawn(['sh', join(receiver.directory, 'www/cgi-bin/alert')], {
    env: { ...receiver.environment, CONTENT_LENGTH: '5' },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 12000,
  });
  try {
    expect(await new Response(stalled.stdout).text()).toStartWith('Status: 408 ');
    expect(await stalled.exited).toBe(0);
    expect(performance.now() - started).toBeLessThan(11500);
    expect(performance.now() - started).toBeGreaterThanOrEqual(9500);
    expect(await readFile(receiver.log, 'utf8')).toBe('');
  } finally {
    await stalled.stdin.end();
    await stalled.exited;
  }
});

test('receiver refuses an absent initialization marker without manufacturing established state', async () => {
  const receiver = await fixture();
  await writeFile(receiver.log, 'known firing\n');
  await rm(join(receiver.directory, 'receiver-state'), { recursive: true });
  expect(receiver.bootstrap().exitCode).not.toBe(0);
  expect(
    await access(join(receiver.directory, 'receiver-state')).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect(await readFile(receiver.log, 'utf8')).toBe('known firing\n');
});

test('receiver refuses malformed initialization state on restart', async () => {
  const receiver = await fixture();
  await rm(join(receiver.directory, 'receiver-state'), { recursive: true });
  await writeFile(join(receiver.directory, 'receiver-state'), 'malformed');
  expect(receiver.bootstrap().exitCode).not.toBe(0);
  status(receiver.invoke('x'), 500);
});

test('receiver accepts exact remaining history and refuses the next record without rotation', async () => {
  const receiver = await fixture();
  const history = Buffer.alloc(8388570, 120);
  await writeFile(receiver.log, history);
  status(receiver.invoke('x'), 200);
  const retained = await readFile(receiver.log);
  expect(retained.length).toBe(8388608);
  expect(retained.subarray(0, history.length)).toEqual(history);
  status(receiver.invoke('y'), 507);
  expect(await readFile(receiver.log)).toEqual(retained);
});

test.each([
  ['record write', 'cat', 'if [ "$1" = receiver.lock/body ]; then exit 1; fi; exec /bin/cat "$@"'],
  ['short record', 'cat', 'if [ "$1" = receiver.lock/body ]; then exit 0; fi; exec /bin/cat "$@"'],
  ['body dependency', 'head', 'exit 1'],
  [
    'changed retained size',
    'mv',
    `/bin/mv "$1" "$2"; printf x > corrupted; /bin/cat "$2" >> corrupted; /bin/mv corrupted "$2"`,
  ],
] as const)(
  'receiver refuses %s failure without acknowledgement',
  async (_name, applet, script) => {
    const receiver = await fixture();
    await inject(receiver, applet, script);
    status(receiver.invoke('resolved'), 500);
    expect(receiver.bootstrap().exitCode).not.toBe(0);
  },
);

test.each(['RECEIVER_BODY_BYTES', 'RECEIVER_HISTORY_BYTES', 'RECEIVER_READ_SECONDS'])(
  'receiver refuses missing runtime policy %s',
  async (name) => {
    const receiver = await fixture();
    Reflect.deleteProperty(receiver.environment, name);
    expect(receiver.bootstrap().exitCode).not.toBe(0);
    status(receiver.invoke('x'), 500);
  },
);

test('receiver refuses oversized established history without resetting it', async () => {
  const receiver = await fixture();
  const history = Buffer.alloc(8388609, 120);
  await writeFile(receiver.log, history);
  expect(receiver.bootstrap().exitCode).not.toBe(0);
  status(receiver.invoke('x'), 500);
  expect(await readFile(receiver.log)).toEqual(history);
});

test.each(['RECEIVER_BODY_BYTES', 'RECEIVER_HISTORY_BYTES', 'RECEIVER_READ_SECONDS'])(
  'receiver refuses changed runtime policy %s',
  async (name) => {
    const receiver = await fixture();
    receiver.environment[name] = String(Number(receiver.environment[name]) + 1);
    expect(receiver.bootstrap().exitCode).not.toBe(0);
    status(receiver.invoke('x'), 500);
  },
);

test.each([
  [
    'completed history write error',
    'cat',
    'if [ "$1" = alerts.log ]; then /bin/cat "$@"; exit 1; fi; exec /bin/cat "$@"',
  ],
  [
    'completed record write error',
    'cat',
    'if [ "$1" = receiver.lock/body ] && [ ! -e record-error ]; then touch record-error; /bin/cat "$@"; printf "\\n"; exit 1; fi; exec /bin/cat "$@"',
  ],
  ['completed rename error', 'mv', '/bin/mv "$@"; exit 1'],
  ['completed readback error', 'tail', '/usr/bin/tail "$@"; exit 1'],
] as const)(
  'receiver refuses %s instead of acknowledging uncertain persistence',
  async (_name, applet, script) => {
    const receiver = await fixture();
    await inject(receiver, applet, script);
    status(receiver.invoke('resolved'), 500);
    expect(receiver.bootstrap().exitCode).not.toBe(0);
  },
);

test.each(['body', 'history', 'record', 'next', 'retained'] as const)(
  'receiver refuses failed %s byte-count read even when output looks valid',
  async (stage) => {
    const receiver = await fixture();
    const ordinal = ['body', 'history', 'record', 'next', 'retained'].indexOf(stage) + 1;
    await inject(
      receiver,
      'wc',
      `count=0; if [ -f byte-count ]; then count=$(cat byte-count); fi; count=$((count + 1)); printf '%s' "$count" > byte-count; /usr/bin/wc "$@"; [ "$count" -ne ${String(ordinal)} ]`,
    );
    status(receiver.invoke('resolved'), 500);
  },
);

test('receiver refuses lock creation failure as storage failure', async () => {
  const receiver = await fixture();
  await chmod(receiver.directory, 0o500);
  try {
    status(receiver.invoke('resolved'), 500);
  } finally {
    await chmod(receiver.directory, 0o700);
  }
});

test('receiver refuses completed timestamp failure', async () => {
  const receiver = await fixture();
  await inject(receiver, 'date', '/bin/date "$@"; exit 1');
  status(receiver.invoke('resolved'), 500);
});

test('receiver refuses cleanup failure after retaining history', async () => {
  const receiver = await fixture();
  await inject(receiver, 'rmdir', 'exit 1');
  status(receiver.invoke('resolved'), 500);
  expect(await readFile(receiver.log, 'utf8')).toContain(' resolved\n');
  expect(receiver.bootstrap().exitCode).not.toBe(0);
});

test('receiver reports failed rejection cleanup as storage failure', async () => {
  const receiver = await fixture();
  await inject(receiver, 'rmdir', 'exit 1');
  status(receiver.invoke('x', 'malformed'), 500);
});

test('receiver refuses failed CGI publication before launching its server', async () => {
  const receiver = await fixture();
  await inject(receiver, 'cat', '/bin/cat "$@"; exit 1');
  expect(receiver.bootstrap().exitCode).not.toBe(0);
});
