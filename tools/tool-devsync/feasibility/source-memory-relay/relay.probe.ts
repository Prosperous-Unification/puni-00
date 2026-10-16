import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = import.meta.dir;
const scratch = mkdtempSync(join(tmpdir(), 'relay-build-'));
const executable = join(scratch, 'relay');
const source = process.env['RELAY_SOURCE'] ?? join(directory, 'relay.c');

function compileSource(selectedSource: string, selectedExecutable: string) {
  const compiled = Bun.spawnSync([
    'cc',
    '-std=c11',
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    selectedSource,
    '-o',
    selectedExecutable,
  ]);
  if (compiled.exitCode !== 0) throw new Error(new TextDecoder().decode(compiled.stderr));
}

beforeAll(async () => {
  compileSource(source, executable);
  const original = readFileSync(source, 'utf8');
  const start = original.indexOf('static int remaining_cleanup_ms(');
  const end = original.indexOf('static void remove_private(', start);
  for (const failureRead of [1, 2]) {
    const cleanup = original
      .slice(start, end)
      .replaceAll('read_clock()', `(++cleanup_clock_reads >= ${failureRead} ? -1 : read_clock())`);
    const selectedSource = join(scratch, `clock-${failureRead}.c`);
    await Bun.write(
      selectedSource,
      original.slice(0, start) +
        'static unsigned cleanup_clock_reads = 0;\n' +
        cleanup +
        original.slice(end),
    );
    compileSource(selectedSource, join(scratch, `clock-${failureRead}`));
  }
});
afterAll(() => rmSync(scratch, { recursive: true }));

async function observe(scenario: string, selectedExecutable = executable) {
  const child = Bun.spawn(
    ['/usr/bin/python3', '-I', join(directory, 'fixture.py'), 'run', selectedExecutable, scenario],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe('');
  expect(exitCode).toBe(0);
  return JSON.parse(stdout) as {
    exit: number;
    upstreamBytes: number;
    response: string;
    childAlive: boolean;
    privateExists: boolean;
    foreignPreserved: boolean;
    elapsedMs: number;
    error: string;
  };
}

test('forwards fragmented bytes through the captured peer and exact child', async () => {
  const observed = await observe('normal');
  expect(observed.exit).toBe(0);
  expect(observed.response).toBe('A');
  expect(observed.upstreamBytes).toBe(49152);
  expect(observed.childAlive).toBe(false);
  expect(observed.privateExists).toBe(false);
}, 8000);

test('rejects a foreign upstream before request bytes', async () => {
  const observed = await observe('foreign-upstream');
  expect(observed.exit).not.toBe(0);
  expect(observed.upstreamBytes).toBe(0);
  expect(observed.response).toBe('');
  expect(observed.privateExists).toBe(false);
}, 8000);

test('keeps the original connection after endpoint replacement', async () => {
  const observed = await observe('replace-path');
  expect(observed.exit).toBe(0);
  expect(observed.response).toBe('A');
  expect(observed.upstreamBytes).toBe(49152);
  expect(observed.privateExists).toBe(false);
}, 8000);

test('rejects a foreign same-UID listener connector before forwarding', async () => {
  const observed = await observe('foreign-child');
  expect(observed.upstreamBytes).toBe(0);
  expect(observed.exit).not.toBe(0);
  expect(observed.upstreamBytes).toBe(0);
  expect(observed.childAlive).toBe(false);
  expect(observed.privateExists).toBe(false);
}, 8000);

test('rejects a dead peer even while its descendant retains the connection', async () => {
  const observed = await observe('peer-death');
  expect(observed.exit).not.toBe(0);
  expect(observed.upstreamBytes).toBe(0);
  expect(observed.response).toBe('');
  expect(observed.privateExists).toBe(false);
}, 8000);

test('bounds aggregate forwarded bytes', async () => {
  const observed = await observe('overflow');
  expect(observed.exit).not.toBe(0);
  expect(observed.upstreamBytes).toBeLessThanOrEqual(131072);
  expect(observed.childAlive).toBe(false);
  expect(observed.privateExists).toBe(false);
}, 8000);

test('deadline terminates and reaps a stalled direct child', async () => {
  const observed = await observe('stall');
  expect(observed.childAlive).toBe(false);
  expect(observed.elapsedMs).toBeLessThan(3000);
  expect(observed.exit).not.toBe(0);
  expect(observed.childAlive).toBe(false);
  expect(observed.privateExists).toBe(false);
  expect(observed.elapsedMs).toBeLessThan(3000);
}, 8000);

for (const failureRead of [1, 2]) {
  test(`cleanup clock read ${failureRead} failure kills and reaps a child alive after EOF`, async () => {
    const observed = await observe('linger', join(scratch, `clock-${failureRead}`));
    expect(observed.upstreamBytes).toBe(49152);
    expect(observed.childAlive).toBe(false);
    expect(observed.privateExists).toBe(false);
    expect(observed.exit).not.toBe(0);
    expect(observed.error).toBe('relay:cleanup\n');
    expect(observed.elapsedMs).toBeLessThan(3000);
  }, 8000);
}

test('fixture code makes no installed or production authority claim', () => {
  expect(readFileSync(join(directory, 'README.md'), 'utf8')).toContain('nonauthoritative');
});

test('cleanup preserves a foreign replacement at its private socket path', async () => {
  const observed = await observe('replace-private');
  expect(observed.exit).not.toBe(0);
  expect(observed.foreignPreserved).toBe(true);
  expect(observed.childAlive).toBe(false);
  expect(observed.error).toBe('relay:cleanup\n');
}, 8000);

for (const spelling of ['', '0', '1', '-1', '12suffix', '999999999999999999999']) {
  test(`rejects malformed fixture peer PID ${JSON.stringify(spelling)}`, () => {
    const child = Bun.spawnSync([
      executable,
      '/absent',
      spelling,
      scratch,
      '/usr/bin/python3',
      join(directory, 'fixture.py'),
      'normal',
      '1',
    ]);
    expect(child.exitCode).toBe(64);
    expect(new TextDecoder().decode(child.stdout)).toBe('');
  });
}

const omissions = [
  {
    name: 'upstream peer',
    target: 'rejects a foreign upstream before request bytes',
    before: 'if (credentials.pid != expected || credentials.uid != geteuid())',
    after:
      'if (strcmp(failure, "upstream-peer") != 0 && (credentials.pid != expected || credentials.uid != geteuid()))',
  },
  {
    name: 'direct child',
    target: 'rejects a foreign same-UID listener connector before forwarding',
    before: 'if (credentials.pid != expected || credentials.uid != geteuid())',
    after:
      'if (strcmp(failure, "client-peer") != 0 && (credentials.pid != expected || credentials.uid != geteuid()))',
  },
  {
    name: 'peer liveness',
    target: 'rejects a dead peer even while its descendant retains the connection',
    before: 'if (channels[count].revents != 0)',
    after: 'if (false && channels[count].revents != 0)',
  },
  {
    name: 'byte cap',
    target: 'bounds aggregate forwarded bytes',
    before: 'if (*total > 131072)',
    after: 'if (false && *total > 131072)',
  },
  {
    name: 'deadline dependency',
    target: 'deadline terminates and reaps a stalled direct child',
    before: 'int remaining = remaining_ms(relay);',
    after: 'int remaining = (remaining_ms(relay), 60000);',
  },
  {
    name: 'child cleanup',
    target: 'deadline terminates and reaps a stalled direct child',
    before: 'reap_client(&relay);',
    after: '(void)reap_client;',
  },
  {
    name: 'cleanup budget initial clock',
    target: 'cleanup clock read 1 failure kills and reaps a child alive after EOF',
    before: 'if (remaining_cleanup_ms(started) < 0)',
    after: 'if ((void)remaining_cleanup_ms(started), false)',
  },
  {
    name: 'cleanup budget subsequent clock',
    target: 'cleanup clock read 2 failure kills and reaps a child alive after EOF',
    before: 'if (remaining_cleanup_ms(started) < 0)',
    after: 'if ((void)remaining_cleanup_ms(started), false)',
  },
  {
    name: 'private cleanup identity',
    target: 'cleanup preserves a foreign replacement at its private socket path',
    before:
      'if (fstatat(relay->directory_reference, "sock", &observed, AT_SYMLINK_NOFOLLOW) != 0 || observed.st_dev != relay->socket_identity.st_dev || observed.st_ino != relay->socket_identity.st_ino || !S_ISSOCK(observed.st_mode))',
    after:
      'if (false && (fstatat(relay->directory_reference, "sock", &observed, AT_SYMLINK_NOFOLLOW) != 0 || observed.st_dev != relay->socket_identity.st_dev || observed.st_ino != relay->socket_identity.st_ino || !S_ISSOCK(observed.st_mode)))',
  },
];

if (process.env['RELAY_SOURCE'] === undefined) {
  for (const omission of omissions) {
    test(`watched omission: ${omission.name}`, async () => {
      const original = readFileSync(source, 'utf8');
      expect(original.split(omission.before).length).toBe(2);
      const faultSource = join(scratch, omission.name.replaceAll(' ', '-') + '.c');
      await Bun.write(faultSource, original.replace(omission.before, omission.after));
      const child = Bun.spawn(
        [process.execPath, 'test', join(directory, 'relay.probe.ts'), '-t', omission.target],
        {
          env: { ...process.env, RELAY_SOURCE: faultSource },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exitCode).not.toBe(0);
      expect(stdout + stderr).toContain('(fail) ' + omission.target);
      expect(stdout + stderr).not.toContain('error: cc1:');
      process.stdout.write(
        JSON.stringify({
          omission: omission.name,
          expectedTestFailure: omission.target,
          exitCode,
        }) + '\n',
      );
      if (process.env['RELAY_PROOF_DIRECTORY'] !== undefined) {
        await Bun.write(
          join(
            process.env['RELAY_PROOF_DIRECTORY'],
            omission.name.replaceAll(' ', '-') + '.log.txt',
          ),
          stdout + stderr,
        );
      }
    }, 10000);
  }
}
