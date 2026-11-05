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

test('source CLI preserves canonical JSON and private diagnostics under forced color', async () => {
  const environment: typeof process.env = { ...process.env, FORCE_COLOR: '1', CI: 'true' };
  delete environment['NO_COLOR'];
  const { path } = await createRaw();
  const positive = inspectCli(path, '2097152', [], environment);
  expect(positive.exitCode).toBe(0);
  expect(positive.stderr.toString()).toBe('');
  const receipt = JSON.parse(positive.stdout.toString()) as RawAllocation;
  expect(positive.stdout.toString()).toBe(`${JSON.stringify(receipt)}\n`);
  const refusal = inspectCli('/PRIVATE-FORMAT-INPUT', '2097152', [], environment);
  expect(refusal.exitCode).toBe(1);
  expect(refusal.stdout.toString()).toBe('');
  expect(refusal.stderr.toString()).toBe('raw allocation: input-absent\n');
  expect(refusal.stderr.toString()).not.toContain('PRIVATE-FORMAT-INPUT');
});

const initializedMap = String.raw`
import importlib.util,json,os,struct,sys,types
spec=importlib.util.spec_from_file_location('allocation',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
opened=types.SimpleNamespace(st_dev=1,st_ino=2,st_uid=os.geteuid(),st_mode=0o100600,st_nlink=1,st_size=4096,st_blocks=8,st_mtime_ns=1,st_ctime_ns=1)
p.os.lstat=lambda path:opened;p.os.fstat=lambda descriptor:opened
p.os.open=lambda *args:17;p.os.close=lambda descriptor:None
flags=0x801
def ioctl(descriptor,request,packet,mutate):
    struct.pack_into('=QQIIII',packet,0,0,4096,0,1,512,0)
    struct.pack_into('=QQQQQIIII',packet,32,0,4096,4096,0,0,flags,0,0,0)
p.fcntl.ioctl=ioctl
assert p.inspect_file('/controlled',4096)['coverageBytes']==4096,'legacy UNWRITTEN refused'
flags=1
assert p.inspect_file('/controlled',4096,require_initialized=True)['coverageBytes']==4096
for flags in (0x801,0x2001):
    try:p.inspect_file('/controlled',4096,require_initialized=True)
    except p.InspectionRefusal:pass
    else:raise AssertionError('uninitialized/shared map admitted')
print('verified initialized opt-in with unchanged legacy contract')
`;

test('initialized guest inspection refuses UNWRITTEN and shared maps while legacy remains valid', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', initializedMap, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified initialized opt-in with unchanged legacy contract\n',
  );
});

test('initialized guest inspection fault admits UNWRITTEN when its exact check is removed', () => {
  const changed = initializedMap.replace(
    'spec.loader.exec_module(p)',
    String.raw`spec.loader.exec_module(p)
import ast,pathlib
_tree=ast.parse(pathlib.Path(spec.origin).read_text())
_checks=[node for node in ast.walk(_tree) if isinstance(node,ast.If) and isinstance(node.test,ast.BoolOp) and any(isinstance(part,ast.Name) and part.id=='require_initialized' for part in ast.walk(node.test))]
assert len(_checks)==1
_checks[0].test=ast.Constant(value=False)
exec(compile(ast.fix_missing_locations(_tree),spec.origin,'exec'),p.__dict__)`,
  );
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', changed, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('uninitialized/shared map admitted');
});

const repairImport = String.raw`
import importlib.util,json,os,sys
spec=importlib.util.spec_from_file_location('allocation',sys.argv[1])
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
`;

test('repair observation measures real sparse holes without admitting or changing the file', async () => {
  const directory = await scratchAsync('lab-repair-observation-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o600 });
  expect(Bun.spawnSync(['truncate', '-s', '16384', path]).exitCode).toBe(0);
  const script = `${repairImport}
before=p.identify_file(os.lstat(sys.argv[2]))
receipt=p.observe_repair(sys.argv[2],16384)
assert receipt['mappedDataBytes']==0
assert receipt['missingDataBytes']==16384
assert receipt['unwrittenBytes']==0
assert receipt['residualAllocatedBytes']==0
assert receipt['admissionAuthorized'] is False and receipt['repairAuthorized'] is False
assert receipt['guestAuthorized'] is False and receipt['fullStackAuthorized'] is False
assert p.identify_file(os.lstat(sys.argv[2]))==before
try:p.inspect_file(sys.argv[2],16384)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-allocation-invalid'
else:raise AssertionError('strict inspection admitted sparse file')
print('verified real all-hole observation and strict refusal')
`;
  const invocation = Bun.spawnSync(['python3', '-I', '-B', '-c', script, helper, path]);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified real all-hole observation and strict refusal\n',
  );
});

// Only ioctl replies and native stat fields are controlled. The owned descriptor,
// private-file checks, packet decoder, walk and byte accounting remain production code.
const repairKernel = `${repairImport}${String.raw`
import ast,errno,pathlib,struct,time,types
case=sys.argv[3]
fault=sys.argv[4] if len(sys.argv)>4 else ''
if fault:
    tree=ast.parse(pathlib.Path(spec.origin).read_text())
    matches=[node for node in ast.walk(tree) if isinstance(node,ast.If) and any(isinstance(child,ast.Raise) and isinstance(child.exc,ast.Call) and child.exc.args and isinstance(child.exc.args[0],ast.Constant) and child.exc.args[0].value==fault for child in node.body)]
    assert len(matches)==1,(fault,len(matches))
    matches[0].test=ast.Constant(value=False)
    exec(compile(ast.fix_missing_locations(tree),spec.origin,'exec'),p.__dict__)
size=5*4096
rows=[(4096,4096,0),(12288,4096,0x801)]
blocks=24
# Models inode allocation beyond queried EOF without exposing it as queried extents.
if case=='residual-beyond-eof':rows=[(0,4096,1)];blocks=24
if case=='initialized':rows=[(0,size,1)];blocks=40
if case=='unwritten':rows=[(0,size,0x801)];blocks=40
if case in ('empty','empty-metadata','empty-over'):rows=[];blocks={'empty':0,'empty-metadata':16,'empty-over':2056}[case]
if case=='under':blocks=8
if case=='over':blocks=2080
if case=='alignment':blocks=25
if case=='negative':blocks=-8
if case=='overlap':rows=[(4096,8192,0),(8192,4096,1)]
if case=='logical-alignment':rows=[(1,4096,1)]
if case=='beyond':rows=[(16384,8192,1)]
if case=='last-row':rows=[(4096,4096,1),(12288,4096,1)]
if case in ('missing-last','empty-continuation'):rows=[(4096,4096,0)]
if case=='missing-last-eof':rows=[(0,size,0)];blocks=40
if case in ('shared','unknown','reserved','physical','length'):
    rows=[(4096,4096,{'shared':0x2001,'unknown':0x10001}.get(case,1))];blocks=8
if case in ('multipage','identity','pages','extents','metadata','timeout'):
    size=1027*4096;rows=[(index*8192,4096,1 if index==512 else 0x800) for index in range(513)];blocks=4120
if case=='pages':p.MAX_PAGES=1
if case=='extents':p.MAX_EXTENTS=512
if case=='metadata':p.MAX_METADATA_BYTES=32
if case=='timeout':p.MAX_SECONDS=0.001
wide=9007199254740993
for name in ('lstat','fstat'):
    original=getattr(p.os,name)
    def snapshot(*args,_read=original,**kwargs):
        observed=_read(*args,**kwargs)
        fields={field:getattr(observed,field) for field in ('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_blocks','st_mtime_ns','st_ctime_ns')}
        fields.update(st_size=size+(4096 if case=='size' else 0),st_blocks=blocks,st_dev=wide,st_ino=wide+2,st_mtime_ns=wide+4,st_ctime_ns=wide+6)
        if case=='identity' and calls>=2:fields['st_ctime_ns']+=1
        return types.SimpleNamespace(**fields)
    setattr(p.os,name,snapshot)
calls=0
def ioctl(descriptor,request,packet,mutate):
    global calls
    calls+=1
    start,length,flags,mapped,capacity,reserved=struct.unpack_from('=QQIIII',packet)
    assert request==p.FIEMAP and flags==0 and capacity==512
    page=[row for row in rows if row[0]>=start][:512]
    struct.pack_into('=QQIIII',packet,0,start,length,0,len(page),512,1 if case=='header' else 0)
    for index,(logical,length,flags) in enumerate(page):
        physical=0 if case=='physical' else 1048576+index*4096
        struct.pack_into('=QQQQQIIII',packet,32+index*56,logical,physical,0 if case=='length' else length,1 if case=='reserved' else 0,0,flags,0,0,0)
    if case=='truncated':del packet[-1:]
    if case=='timeout':time.sleep(.002)
p.fcntl.ioctl=ioctl
original_open=p.os.open
def open_readonly(path,flags):
    assert flags==os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK
    return original_open(path,flags)
p.os.open=open_readonly
def forbid(*args):raise AssertionError('content access or mutation attempted')
p.os.read=forbid;p.os.pread=forbid;p.os.write=forbid;p.os.pwrite=forbid;p.os.fsync=forbid
refusals={'under':'raw-map-accounting','over':'raw-map-accounting','empty-over':'raw-map-accounting','alignment':'raw-allocation-invalid','negative':'raw-allocation-invalid','size':'raw-allocation-invalid','overlap':'raw-map-coverage','logical-alignment':'raw-map-coverage','beyond':'raw-map-coverage','last-row':'raw-map-last','missing-last':'raw-map-completion','empty-continuation':'raw-map-completion','missing-last-eof':'raw-map-last','shared':'raw-map-extent','unknown':'raw-map-extent','reserved':'raw-map-extent','physical':'raw-map-extent','length':'raw-map-extent','header':'raw-map-header','truncated':'raw-map-truncated','identity':'raw-identity-changed','pages':'raw-inspection-bound','extents':'raw-map-bound','metadata':'raw-map-bound','timeout':'raw-inspection-bound'}
try:receipt=p.observe_repair(sys.argv[2],size)
except p.InspectionRefusal as refusal:
    assert case in refusals and str(refusal)==refusals[case],(case,str(refusal))
    print('refused '+case)
else:
    assert case not in refusals,'unsafe observation accepted: '+case
    expected={'residual-beyond-eof':(4096,16384,0,8192),'initialized':(20480,0,0,0),'unwritten':(20480,0,20480,0),'empty':(0,20480,0,0),'empty-metadata':(0,20480,0,8192),'multipage':(2101248,2105344,2097152,8192)}.get(case,(8192,12288,4096,4096))
    assert tuple(receipt[key] for key in ('mappedDataBytes','missingDataBytes','unwrittenBytes','residualAllocatedBytes'))==expected,receipt
    assert receipt['identity']['device']==str(wide) and receipt['identity']['inode']==str(wide+2)
    assert receipt['identity']['mtimeNs']==str(wide+4) and receipt['identity']['ctimeNs']==str(wide+6)
    assert 'allocatedMetadataBytes' not in receipt,receipt
    assert all(receipt[key] is False for key in ('admissionAuthorized','repairAuthorized','guestAuthorized','fullStackAuthorized'))
    if case=='multipage':assert receipt['pageCount']==2 and receipt['extentCount']==513 and receipt['metadataBytes']==28792
    print('observed '+case)
`}`;

async function inspectRepair(case_: string, fault = '') {
  const directory = await scratchAsync('lab-repair-kernel-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o600 });
  return Bun.spawnSync(['python3', '-I', '-B', '-c', repairKernel, helper, path, case_, fault], {
    timeout: 12000,
    maxBuffer: 65536,
  });
}

for (const case_ of [
  'holes',
  'initialized',
  'unwritten',
  'empty',
  'empty-metadata',
  'multipage',
  'residual-beyond-eof',
]) {
  test(`repair observation accounts exactly for ${case_}`, async () => {
    const invocation = await inspectRepair(case_);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`observed ${case_}\n`);
  });
}
for (const case_ of [
  'under',
  'over',
  'empty-over',
  'alignment',
  'negative',
  'size',
  'overlap',
  'logical-alignment',
  'beyond',
  'last-row',
  'missing-last',
  'empty-continuation',
  'missing-last-eof',
  'shared',
  'unknown',
  'reserved',
  'physical',
  'length',
  'header',
  'truncated',
  'identity',
  'pages',
  'extents',
  'metadata',
  'timeout',
]) {
  test(`repair observation refuses ${case_}`, async () => {
    const invocation = await inspectRepair(case_);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`refused ${case_}\n`);
  });
}
for (const [case_, fault] of [
  ['under', 'raw-map-accounting'],
  ['empty-continuation', 'raw-map-completion'],
  ['overlap', 'raw-map-coverage'],
  ['last-row', 'raw-map-last'],
  ['header', 'raw-map-header'],
  ['alignment', 'raw-allocation-invalid'],
]) {
  test(`repair observation fault ${fault} exposes unsafe acceptance of ${case_}`, async () => {
    const invocation = await inspectRepair(case_, fault);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain(`unsafe observation accepted: ${case_}`);
  });
}

test('repair observation separates real UNWRITTEN allocation from missing bytes and initialization', async () => {
  const directory = await scratchAsync('lab-repair-real-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o600 });
  expect(Bun.spawnSync(['truncate', '-s', '16384', path]).exitCode).toBe(0);
  expect(Bun.spawnSync(['fallocate', '-o', '4096', '-l', '4096', path]).exitCode).toBe(0);
  const script = `${repairImport}
for initialized in (False,True):
    if initialized:
        descriptor=os.open(sys.argv[2],os.O_WRONLY|os.O_NOFOLLOW)
        try:
            assert os.pwrite(descriptor,b'x'*4096,4096)==4096
            os.fsync(descriptor)
        finally:os.close(descriptor)
    before=p.identify_file(os.lstat(sys.argv[2]))
    receipt=p.observe_repair(sys.argv[2],16384)
    assert receipt['mappedDataBytes']==4096 and receipt['missingDataBytes']==12288,receipt
    assert receipt['unwrittenBytes']==(0 if initialized else 4096),receipt
    assert receipt['residualAllocatedBytes']==os.lstat(sys.argv[2]).st_blocks*512-4096
    assert p.identify_file(os.lstat(sys.argv[2]))==before
print('verified real unwritten and initialized sparse observations')
`;
  const invocation = Bun.spawnSync(['python3', '-I', '-B', '-c', script, helper, path]);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified real unwritten and initialized sparse observations\n',
  );
});

test('repair observation distinguishes real absence from unreadability', async () => {
  const directory = await scratchAsync('lab-repair-input-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o000 });
  const script = `${repairImport}
for path,category in ((sys.argv[2]+'-absent','raw-input-absent'),(sys.argv[2],'raw-input-unreadable')):
    try:p.observe_repair(path,4096)
    except p.InspectionRefusal as refusal:assert str(refusal)==category
    else:raise AssertionError('untrusted input accepted')
print('verified absence and unreadability')
`;
  try {
    const invocation = Bun.spawnSync(['python3', '-I', '-B', '-c', script, helper, path]);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe('verified absence and unreadability\n');
  } finally {
    await chmod(path, 0o600);
  }
});

// Range cases reuse the existing native reply fixture so identity, descriptor and
// canonical packet validation remain on the same production path.
const rangeKernel = repairKernel.slice(0, repairKernel.indexOf('refusals='));

async function inspectRanges(case_: string, assertions: string, fault = '') {
  const directory = await scratchAsync('lab-repair-range-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o600 });
  return Bun.spawnSync(
    ['python3', '-I', '-B', '-c', `${rangeKernel}\n${assertions}`, helper, path, case_, fault],
    { timeout: 12000, maxBuffer: 65536 },
  );
}

function expectRangePass(invocation: Bun.SyncSubprocess<'pipe', 'pipe'>) {
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
}

for (const [case_, intervals] of [
  ['holes', '[[0,4096],[8192,4096],[16384,4096]]'],
  ['empty', '[[0,20480]]'],
  ['initialized', '[]'],
  ['unwritten', '[]'],
  ['residual-beyond-eof', '[[4096,16384]]'],
  ['multipage', '[[4096+index*8192,4096] for index in range(512)]+[[4198400,8192]]'],
]) {
  test(`repair ranges report exact bounded intervals for ${case_}`, async () => {
    expectRangePass(
      await inspectRanges(
        case_,
        `
receipt=p.observe_repair_ranges(sys.argv[2],size)
assert set(receipt)=={'observation','missingRanges'},receipt
assert receipt['missingRanges']==${intervals},receipt['missingRanges']
aggregate=p.observe_repair(sys.argv[2],size)
assert receipt['observation']==aggregate
assert set(aggregate)=={'provider','inspectorVersion','observations','identity','expectedBytes','allocatedBytes','extentCount','pageCount','metadataBytes','mapDigest','observation','admissionAuthorized','repairAuthorized','guestAuthorized','fullStackAuthorized','mappedDataBytes','missingDataBytes','unwrittenBytes','residualAllocatedBytes'},aggregate
assert sum(length for offset,length in receipt['missingRanges'])==aggregate['missingDataBytes']
assert all(aggregate[key] is False for key in ('admissionAuthorized','repairAuthorized','guestAuthorized','fullStackAuthorized'))
`,
      ),
    );
  });
}

test('initialized range keeps full allocation and only certifies its explicit initialized scope', async () => {
  expectRangePass(
    await inspectRanges(
      'initialized',
      `
rows=[(0,4096,0x800),(4096,8192,0),(12288,8192,0x801)]
receipt=p.inspect_initialized_range(sys.argv[2],size,4096,8192)
assert set(receipt)=={'allocation','offsetBytes','rangeBytes','admissionAuthorized','repairAuthorized','guestAuthorized','fullStackAuthorized'},receipt
assert receipt['offsetBytes']==4096 and receipt['rangeBytes']==8192
assert receipt['allocation']==p.inspect_file(sys.argv[2],size)
assert all(receipt[key] is False for key in ('admissionAuthorized','repairAuthorized','guestAuthorized','fullStackAuthorized'))
try:p.inspect_file(sys.argv[2],size,require_initialized=True)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-map-uninitialized'
else:raise AssertionError('whole-file initialization widened')
`,
    ),
  );
});

for (const [offset, length] of [
  [0, 4096],
  [0, 8192],
  [8192, 8192],
  [12288, 4096],
]) {
  test(`initialized range refuses intersecting UNWRITTEN at ${String(offset)}:${String(length)}`, async () => {
    expectRangePass(
      await inspectRanges(
        'initialized',
        `
rows=[(0,4096,0x800),(4096,8192,0),(12288,8192,0x801)]
try:p.inspect_initialized_range(sys.argv[2],size,${String(offset)},${String(length)})
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-range-uninitialized',str(refusal)
else:raise AssertionError('intersecting UNWRITTEN accepted')
`,
      ),
    );
  });
}

const invalidRanges = String.raw`
for offset,length in ((True,4096),(0,True),(0.0,4096),(0,4096.0),(-4096,4096),(1,4096),(0,1),(0,0),(0,-4096),(size,4096),(16384,8192),(2**100,4096),(0,2**100)):
    try:p.inspect_initialized_range(sys.argv[2],size,offset,length)
    except p.InspectionRefusal as refusal:assert str(refusal)=='raw-invalid-range',str(refusal)
    else:raise AssertionError('invalid range accepted')
`;
test('initialized range refuses invalid bounds before any native inspection', async () => {
  expectRangePass(
    await inspectRanges(
      'initialized',
      `
p.os.lstat=lambda path:forbid()
${invalidRanges}
`,
    ),
  );
});

test('repair ranges count added intervals against the same finite projection cap', async () => {
  expectRangePass(
    await inspectRanges(
      'holes',
      `
p.MAX_METADATA_BYTES=160
try:p.observe_repair_ranges(sys.argv[2],size)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-range-projection-bound',str(refusal)
else:raise AssertionError('oversized range projection accepted')
assert p.observe_repair(sys.argv[2],size)['metadataBytes']==144
`,
    ),
  );
});

for (const [case_, category] of [
  ['header', 'raw-map-header'],
  ['identity', 'raw-identity-changed'],
  ['holes', 'raw-allocation-invalid'],
]) {
  test(`repair range APIs preserve canonical refusal for ${case_}`, async () => {
    expectRangePass(
      await inspectRanges(
        case_,
        `
if case=='header':rows=[(0,size,1)];blocks=size//512
if case=='identity':
    size=513*4096;blocks=size//512
    rows=[(index*4096,4096,1 if index==512 else 0) for index in range(513)]
for inspect,expected in ((lambda:p.observe_repair_ranges(sys.argv[2],size),None if case=='holes' else '${category}'),(lambda:p.inspect_initialized_range(sys.argv[2],size,0,4096),'${category}')):
    calls=0
    try:inspect()
    except p.InspectionRefusal as refusal:assert str(refusal)==expected,(str(refusal),expected)
    else:assert expected is None,'canonical invalid state accepted'
`,
      ),
    );
  });
}

for (const [fault, assertions, witness] of [
  [
    'raw-invalid-range',
    `p.os.lstat=lambda path:forbid()\n${invalidRanges}`,
    'content access or mutation attempted',
  ],
  [
    'raw-range-projection-bound',
    `p.MAX_METADATA_BYTES=160\np.observe_repair_ranges(sys.argv[2],size)\nraise AssertionError('oversized range projection accepted')`,
    'oversized range projection accepted',
  ],
  [
    'raw-range-uninitialized',
    `p.inspect_initialized_range(sys.argv[2],size,0,4096)\nraise AssertionError('intersecting UNWRITTEN accepted')`,
    'intersecting UNWRITTEN accepted',
  ],
]) {
  test(`repair range fault ${fault} exposes the removed production guard`, async () => {
    const invocation = await inspectRanges(
      fault === 'raw-range-projection-bound' ? 'holes' : 'unwritten',
      assertions,
      fault,
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain(witness);
  });
}

test('repair range APIs distinguish real absence and unreadability', async () => {
  const directory = await scratchAsync('lab-range-input-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o000 });
  try {
    const invocation = Bun.spawnSync([
      'python3',
      '-I',
      '-B',
      '-c',
      `${repairImport}
for path,category in ((sys.argv[2]+'-absent','raw-input-absent'),(sys.argv[2],'raw-input-unreadable')):
    for inspect in (lambda:p.observe_repair_ranges(path,4096),lambda:p.inspect_initialized_range(path,4096,0,4096)):
        try:inspect()
        except p.InspectionRefusal as refusal:assert str(refusal)==category,str(refusal)
        else:raise AssertionError('untrusted range input accepted')
`,
      helper,
      path,
    ]);
    expectRangePass(invocation);
  } finally {
    await chmod(path, 0o600);
  }
});

test('repair ranges and initialized range follow real sparse, UNWRITTEN and initialized allocation', async () => {
  const directory = await scratchAsync('lab-range-real-');
  const path = join(directory, 'disk.raw');
  await writeFile(path, '', { mode: 0o600 });
  expect(Bun.spawnSync(['truncate', '-s', '16384', path]).exitCode).toBe(0);
  const invocation = Bun.spawnSync([
    'python3',
    '-I',
    '-B',
    '-c',
    `${repairImport}
assert p.observe_repair_ranges(sys.argv[2],16384)['missingRanges']==[[0,16384]]
descriptor=os.open(sys.argv[2],os.O_WRONLY|os.O_NOFOLLOW)
try:os.posix_fallocate(descriptor,0,16384)
finally:os.close(descriptor)
assert p.observe_repair_ranges(sys.argv[2],16384)['missingRanges']==[]
try:p.inspect_initialized_range(sys.argv[2],16384,4096,4096)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-range-uninitialized',str(refusal)
else:raise AssertionError('real UNWRITTEN accepted')
descriptor=os.open(sys.argv[2],os.O_WRONLY|os.O_NOFOLLOW)
try:
    assert os.pwrite(descriptor,b'x'*4096,4096)==4096
    os.fsync(descriptor)
finally:os.close(descriptor)
before=p.identify_file(os.lstat(sys.argv[2]))
receipt=p.inspect_initialized_range(sys.argv[2],16384,4096,4096)
assert receipt['offsetBytes']==4096 and receipt['rangeBytes']==4096
assert p.identify_file(os.lstat(sys.argv[2]))==before
try:p.inspect_file(sys.argv[2],16384,require_initialized=True)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-map-uninitialized'
else:raise AssertionError('real whole-file initialization widened')
`,
    helper,
    path,
  ]);
  expectRangePass(invocation);
});

const pageRangeCap = String.raw`
rows=[(index*8192,4096,0) for index in range(512)]+[(4190208,16384,1)]
blocks=4128
p.MAX_METADATA_BYTES=36900
try:p.observe_repair_ranges(sys.argv[2],size)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-map-bound',str(refusal)
else:raise AssertionError('later page projection accepted')
`;
test('repair ranges carry interval charges across page boundaries', async () => {
  expectRangePass(await inspectRanges('multipage', pageRangeCap));
});
test('repair range fault raw-map-bound exposes omitted earlier interval charges', async () => {
  const invocation = await inspectRanges('multipage', pageRangeCap, 'raw-map-bound');
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('later page projection accepted');
});

// Inject a dropped final interval through the real decoder, then demonstrate the
// completeness guard is the boundary that prevents logically incomplete output.
const omitFinalRange = rangeKernel.replace(
  'spec.loader.exec_module(p)',
  String.raw`spec.loader.exec_module(p)
import ast,pathlib
changed=ast.parse(pathlib.Path(spec.origin).read_text())
final_intervals=[node for node in ast.walk(changed) if isinstance(node,ast.If) and any(isinstance(child,ast.Call) and isinstance(child.func,ast.Name) and child.func.id=='_record_missing_range' and isinstance(child.args[2],ast.BinOp) and isinstance(child.args[2].left,ast.Name) and child.args[2].left.id=='expected_bytes' for child in ast.walk(node))]
assert len(final_intervals)==1
final_intervals[0].body=[ast.Pass()]
exec(compile(ast.fix_missing_locations(changed),spec.origin,'exec'),p.__dict__)
`,
);
for (const fault of ['', 'raw-range-incomplete']) {
  test(`repair range completeness ${fault ? 'fault exposes incomplete logical acceptance' : 'refuses a dropped final interval'}`, async () => {
    const directory = await scratchAsync('lab-range-completeness-');
    const path = join(directory, 'disk.raw');
    await writeFile(path, '', { mode: 0o600 });
    const changed = omitFinalRange.replace(
      'tree=ast.parse(pathlib.Path(spec.origin).read_text())',
      'tree=changed',
    );
    const invocation = Bun.spawnSync([
      'python3',
      '-I',
      '-B',
      '-c',
      `${changed}
try:p.observe_repair_ranges(sys.argv[2],size)
except p.InspectionRefusal as refusal:assert str(refusal)=='raw-range-incomplete',str(refusal)
else:raise AssertionError('incomplete holes accepted')
`,
      helper,
      path,
      'holes',
      fault,
    ]);
    if (fault) {
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toContain('incomplete holes accepted');
    } else {
      expectRangePass(invocation);
    }
  });
}
