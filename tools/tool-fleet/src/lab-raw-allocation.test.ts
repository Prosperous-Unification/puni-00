import { chmod, link, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { inspectRawAllocation, type RawAllocation } from './lab-raw-allocation';

const cli = join(import.meta.dir, 'lab-raw-allocation-cli.ts');
const helper = join(import.meta.dir, 'lab-raw-allocation.py');

async function createRaw() {
  const directory = await scratchAsync('lab-raw-allocation-');
  const path = join(directory, 'disk.raw');
  expect(Bun.spawnSync(['fallocate', '-l', '2097152', path]).exitCode).toBe(0);
  await chmod(path, 0o600);
  return { path, directory };
}
function inspectCli(path: string, length = '2097152', extra: string[] = [], env = process.env) {
  return Bun.spawnSync([process.execPath, cli, path, length, ...extra], { env });
}

test('source CLI accepts owned allocated file without changing bytes', async () => {
  const { path } = await createRaw();
  const invocation = inspectCli(path);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  const receipt = JSON.parse(invocation.stdout.toString()) as RawAllocation;
  expect(receipt.provider).toBe('linux-fiemap');
  expect(receipt.coverageBytes).toBe(2097152);
  expect(receipt.extentCount).toBeGreaterThan(0);
  expect(receipt.identity.mode).toBe('0600');
  expect(receipt.mapDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(await Bun.file(path).arrayBuffer()).toEqual(new ArrayBuffer(2097152));
});
test('source CLI refuses absent, unreadable, sparse, symlink and wrong-size inputs', async () => {
  const { path, directory } = await createRaw();
  const absent = inspectCli(join(directory, 'absent'));
  expect(absent.exitCode).toBe(1);
  expect(absent.stderr.toString()).toContain('input-absent');
  await chmod(path, 0o000);
  const unreadable = inspectCli(path);
  expect(unreadable.exitCode).toBe(1);
  expect(unreadable.stderr.toString()).toContain('input-unreadable');
  await chmod(path, 0o600);
  const alias = join(directory, 'link');
  await symlink(path, alias);
  expect(inspectCli(alias).exitCode).toBe(1);
  await chmod(path, 0o640);
  expect(inspectCli(path).exitCode).toBe(1);
  await chmod(path, 0o600);
  expect(inspectCli(path, '4096').exitCode).toBe(1);
  const sparse = join(directory, 'sparse');
  await writeFile(sparse, '', { mode: 0o600 });
  expect(Bun.spawnSync(['truncate', '-s', '2097152', sparse]).exitCode).toBe(0);
  expect(inspectCli(sparse).exitCode).toBe(1);
  expect(inspectCli(path, '1').exitCode).toBe(1);
  expect(inspectCli(path, '2097152', ['unexpected']).exitCode).toBe(1);
  await link(path, join(directory, 'hardlink'));
  expect(inspectCli(path).exitCode).toBe(1);
});
// Controlled kernel replies are necessary for fragmentation and malformed ioctl responses;
// file checks, decoding and traversal still use the production inspector.
const kernel = String.raw`
import fcntl, importlib.util, json, os, struct, sys, time, types
spec = importlib.util.spec_from_file_location('raw_inspector', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
case = sys.argv[3]
size = 513 * 4096
calls = 0
def ioctl(fd, request, packet, mutate):
    global calls
    calls += 1
    start, length, flags, mapped, capacity, reserved = struct.unpack_from('=QQIIII', packet)
    assert request == 0xC020660B and flags == 0 and capacity == 512
    count = min(512, (size-start)//4096)
    header = [start, length, 0, count, 512, 0]
    if case == 'header': header[5] = 1
    if case == 'empty': header[3] = 0
    if case == 'count': header[3] = 513
    if case == 'start': header[0] += 4096
    struct.pack_into('=QQIIII', packet, 0, *header)
    for index in range(count):
        logical = start + index*4096
        physical = 1048576 + logical
        extent_length = 4096
        extent_flags = 1 if logical+4096 == size else 0x800
        if case == 'gap' and index == 0: logical += 4096
        if case == 'overlap' and index == 1: logical -= 4096
        if case == 'unsafe': extent_flags |= 0x2000
        if case == 'unwritten-last': extent_flags = 0x801 if logical+4096 == size else 0x800
        if case == 'early-last' and index == 0: extent_flags |= 1
        if case == 'missing-last': extent_flags &= ~1
        if case == 'physical': physical = 0
        if case == 'unaligned': physical += 1
        if case == 'length': extent_length = 0
        if case == 'beyond' and logical+4096 == size: extent_length += 4096
        reserved64 = 1 if case == 'extent-reserved' else 0
        struct.pack_into('=QQQQQIIII', packet, 32+index*56, logical, physical, extent_length, reserved64, 0, extent_flags, 0, 0, 0)
    if case == 'truncated': del packet[-1:]
    if case == 'identity': os.utime(sys.argv[2], ns=(1, 1))
    if case == 'timeout': time.sleep(0.02)
    return 0
fcntl.ioctl = ioctl
if case == 'open-identity':
    original_open = os.open
    def open_changed(*args, **kwargs):
        descriptor = original_open(*args, **kwargs)
        os.utime(sys.argv[2], ns=(1, 1))
        return descriptor
    os.open = open_changed
if case.startswith('allocation-') or case.startswith('private-'):
    def alter(read):
        def snapshot(*args, **kwargs):
            observed = read(*args, **kwargs)
            fields = {name: getattr(observed, name) for name in ('st_dev', 'st_ino', 'st_uid', 'st_mode', 'st_nlink', 'st_size', 'st_blocks', 'st_mtime_ns', 'st_ctime_ns')}
            if case == 'private-owner': fields['st_uid'] += 1
            if case == 'private-links': fields['st_nlink'] = 2
            if case == 'private-mode': fields['st_mode'] = 0o100640
            if case == 'private-kind': fields['st_mode'] = 0o040600
            if case == 'allocation-under': fields['st_blocks'] = 0
            if case == 'allocation-over': fields['st_blocks'] = (size + 1048576 + 4096)//512
            if case == 'allocation-alignment': fields['st_blocks'] += 1
            if case == 'allocation-size': fields['st_size'] += 4096
            return types.SimpleNamespace(**fields)
        return snapshot
    os.fstat = alter(os.fstat)
    os.lstat = alter(os.lstat)
if case == 'pages': module.MAX_PAGES = 1
if case == 'metadata': module.MAX_METADATA_BYTES = 32
if case == 'extents': module.MAX_EXTENTS = 512
if case == 'timeout': module.MAX_SECONDS = 0.001
try:
    print(json.dumps(module.inspect_file(sys.argv[2], 0 if case == 'invalid-size' else size)))
except module.InspectionRefusal as failure:
    print(str(failure), file=sys.stderr)
    sys.exit(1)
`;
async function inspectKernel(case_: string) {
  const { path } = await createRaw();
  expect(Bun.spawnSync(['fallocate', '-l', String(513 * 4096), path]).exitCode).toBe(0);
  return Bun.spawnSync(['python3', '-I', '-B', '-c', kernel, helper, path, case_]);
}
test('production inspector pages beyond 512 extents and accepts UNWRITTEN with LAST', async () => {
  for (const case_ of ['valid', 'unwritten-last']) {
    const invocation = await inspectKernel(case_);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    const receipt = JSON.parse(invocation.stdout.toString()) as RawAllocation;
    expect(receipt.extentCount).toBe(513);
    expect(receipt.pageCount).toBe(2);
    expect(receipt.coverageBytes).toBe(2101248);
    expect(receipt.metadataBytes).toBe(28792);
  }
});
for (const case_ of [
  'header',
  'start',
  'empty',
  'count',
  'gap',
  'overlap',
  'unsafe',
  'early-last',
  'missing-last',
  'physical',
  'unaligned',
  'length',
  'beyond',
  'extent-reserved',
  'truncated',
  'identity',
  'pages',
  'metadata',
  'extents',
  'timeout',
  'allocation-under',
  'allocation-over',
  'allocation-alignment',
  'allocation-size',
  'private-owner',
  'private-links',
  'private-mode',
  'private-kind',
  'invalid-size',
  'open-identity',
]) {
  test(`production inspector refuses ${case_}`, async () => {
    const invocation = await inspectKernel(case_);
    expect(invocation.exitCode).toBe(1);
    const categories: Record<string, string> = {
      'open-identity': 'raw-identity-changed',
      'invalid-size': 'raw-invalid-size',
      'private-owner': 'raw-private-file-required',
      'private-links': 'raw-private-file-required',
      'private-mode': 'raw-private-file-required',
      'private-kind': 'raw-private-file-required',
      'allocation-under': 'raw-allocation-invalid',
      'allocation-over': 'raw-allocation-invalid',
      'allocation-alignment': 'raw-allocation-invalid',
      'allocation-size': 'raw-allocation-invalid',
      header: 'raw-map-header',
      start: 'raw-map-header',
      empty: 'raw-map-header',
      count: 'raw-map-header',
      gap: 'raw-map-coverage',
      overlap: 'raw-map-coverage',
      beyond: 'raw-map-coverage',
      unsafe: 'raw-map-extent',
      physical: 'raw-map-extent',
      unaligned: 'raw-map-extent',
      length: 'raw-map-extent',
      'extent-reserved': 'raw-map-extent',
      'early-last': 'raw-map-last',
      'missing-last': 'raw-map-last',
      truncated: 'raw-map-truncated',
      identity: 'raw-identity-changed',
      pages: 'raw-inspection-bound',
      metadata: 'raw-map-bound',
      extents: 'raw-map-bound',
      timeout: 'raw-inspection-bound',
    };
    expect(invocation.stderr.toString().trim()).toBe(categories[case_]);
  });
}

test('source CLI blocks a missing required Python runtime', async () => {
  const { path, directory } = await createRaw();
  const invocation = inspectCli(path, '2097152', [], { ...process.env, PATH: directory });
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr.toString()).toContain('dependency-unavailable');
});

test('source CLI refuses malformed and foreign helper projections', async () => {
  const { path, directory } = await createRaw();
  const actual = inspectCli(path);
  expect(actual.exitCode).toBe(0);
  const valid = JSON.parse(actual.stdout.toString()) as RawAllocation;
  const projections = [
    'broken-json',
    { ...valid, foreign: true },
    { ...valid, coverageBytes: 4096 },
    { ...valid, identity: { ...valid.identity, inode: 9007199254740992 } },
    { ...valid, extentCount: 65536 },
    { ...valid, metadataBytes: 1 },
  ];
  for (const projection of projections) {
    const encoded = typeof projection === 'string' ? projection : JSON.stringify(projection);
    // The fixture controls only the external runtime response; production reader and CLI stay intact.
    await writeFile(join(directory, 'python3'), `#!/bin/sh\nprintf '%s' '${encoded}'\n`, {
      mode: 0o700,
    });
    const invocation = inspectCli(path, '2097152', [], { ...process.env, PATH: directory });
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stderr.toString()).toContain('helper-malformed');
  }
});

test('production consumer rejects invalid caller lengths before invoking the helper', async () => {
  for (const length of [0, -1, 1, 4096.5, Number.NaN, 8589938688]) {
    const refusal = await inspectRawAllocation('/unused', length).catch(
      (failure: unknown) => failure,
    );
    expect(refusal).toBeInstanceOf(Error);
    expect(refusal).toHaveProperty('category', 'invalid-arguments');
  }
});

test('source CLI bounds oversized helper projection and diagnostic output', async () => {
  const { path, directory } = await createRaw();
  const actual = inspectCli(path);
  expect(actual.exitCode).toBe(0);
  for (const channel of ['stdout', 'stderr']) {
    const padding = `/usr/bin/head -c 131072 /dev/zero | /usr/bin/tr '\\000' ' '${channel === 'stderr' ? ' >&2' : ''}`;
    await writeFile(
      join(directory, 'python3'),
      `#!/bin/sh\n${padding}\nprintf '%s' '${actual.stdout.toString().trim()}'\n`,
      { mode: 0o700 },
    );
    const invocation = inspectCli(path, '2097152', [], { ...process.env, PATH: directory });
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stderr.toString()).toContain('helper-output-bound');
  }
});

test('source helper ignores Python environment startup code', async () => {
  const { path, directory } = await createRaw();
  await writeFile(join(directory, 'sitecustomize.py'), "print('PRIVATE-STARTUP-CODE')\n");
  const invocation = inspectCli(path, '2097152', [], { ...process.env, PYTHONPATH: directory });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).not.toContain('PRIVATE-STARTUP-CODE');
});

test('source CLI terminates a stalled required helper', async () => {
  const { path, directory } = await createRaw();
  await writeFile(join(directory, 'python3'), '#!/bin/sh\nexec /bin/sleep 30\n', { mode: 0o700 });
  const invocation = inspectCli(path, '2097152', [], { ...process.env, PATH: directory });
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr.toString()).toContain('inspection-timeout');
}, 20000);

function inspectApiFailure(environment: NodeJS.ProcessEnv) {
  const script = `
    import { inspectRawAllocation } from ${JSON.stringify(join(import.meta.dir, 'lab-raw-allocation.ts'))};
    try {
      await inspectRawAllocation('/PRIVATE-INPUT-PATH/disk.raw', 4096);
      throw new Error('unexpected inspection success');
    } catch (failure) {
      console.log(JSON.stringify({ category: failure.category, inspection: Bun.inspect(failure, { depth: 10 }), hasCause: failure.cause !== undefined }));
    }
  `;
  // A fresh process supplies the real runtime's PATH boundary; no classification or API is mocked.
  const invocation = Bun.spawnSync([process.execPath, '--eval', script], { env: environment });
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  return JSON.parse(invocation.stdout.toString()) as {
    category: string;
    inspection: string;
    hasCause: boolean;
  };
}

test('production API excludes private child diagnostics from inspectable refusal causes', async () => {
  const directory = await scratchAsync('PRIVATE-DEPENDENCY-PATH-');
  const marker = 'PRIVATE_CHILD_DIAGNOSTIC';
  await writeFile(join(directory, 'python3'), `#!/bin/sh\nprintf '%s' '${marker}'\n`, {
    mode: 0o700,
  });
  const refusal = inspectApiFailure({ ...process.env, PATH: directory });
  expect(refusal.category).toBe('helper-malformed');
  expect(refusal.inspection).not.toContain(marker);
  expect(refusal.inspection).not.toContain('/PRIVATE-INPUT-PATH/');
  expect(refusal.hasCause).toBe(false);
});

test('production API excludes dependency failures from inspectable refusal causes', async () => {
  const directory = await scratchAsync('PRIVATE-DEPENDENCY-PATH-');
  const refusal = inspectApiFailure({ ...process.env, PATH: directory });
  expect(refusal.category).toBe('dependency-unavailable');
  expect(refusal.hasCause).toBe(false);
  expect(refusal.inspection).not.toContain(directory);
  expect(refusal.inspection).not.toContain('/PRIVATE-INPUT-PATH/');
});
