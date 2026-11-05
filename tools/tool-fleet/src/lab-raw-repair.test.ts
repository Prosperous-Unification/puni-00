import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { parseRepairSnapshot, type RepairSnapshot } from './lab-raw-repair';

const snapshot: RepairSnapshot = {
  device: '66307',
  inode: '21891946',
  owner: 1000,
  mode: '0600',
  links: 1,
  logicalBytes: '8589934592',
  allocatedBytes: '8435806208',
  mtimeNs: '1793840000000000001',
  ctimeNs: '1793840000000000002',
};

test('snapshot preserves adjacent native nanoseconds and refuses lossy or open identities', () => {
  expect(parseRepairSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  for (const field of ['device', 'inode', 'logicalBytes', 'allocatedBytes', 'mtimeNs', 'ctimeNs']) {
    for (const value of [1, true, '-1', '+1', '01', '1e3', '18446744073709551616', null]) {
      expect(() => parseRepairSnapshot({ ...snapshot, [field]: value })).toThrow();
    }
    const absent = Object.fromEntries(Object.entries(snapshot).filter(([name]) => name !== field));
    expect(() => parseRepairSnapshot(absent)).toThrow();
  }
  for (const change of [
    { owner: true },
    { owner: 4294967296 },
    { mode: '0640' },
    { links: 2 },
    { logicalBytes: '4096' },
    { allocatedBytes: '4097' },
    { allocatedBytes: '8590987264' },
    { extra: 1 },
  ]) {
    expect(() => parseRepairSnapshot({ ...snapshot, ...change })).toThrow();
  }
  expect(() => parseRepairSnapshot(Object.values(snapshot))).toThrow();
});

const native = String.raw`
import importlib.util, json, os, pathlib, stat, sys, tempfile, types
spec = importlib.util.spec_from_file_location('repair', sys.argv[1])
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
case = sys.argv[2]
fault = os.environ.get('REPAIR_GUARD_FAULT')
if fault:
    original_require = repair.require
    def bypass(predicate, category):
        if category != fault: original_require(predicate, category)
    repair.require = bypass
snapshot = json.loads(sys.argv[3])
snapshot['owner'] = os.geteuid()
def refused(operation):
    try: operation()
    except Exception: return
    raise AssertionError('unsafe admission accepted')
profile = dict(filesystem='ext4', blockBytes=4096, clusterBytes=4096,
    inodeFlags=524288, delalloc=True, dioreadNolock=True, dataMode='ordered',
    kernelRelease='7.0.11-76070011-generic',
    kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',
    rawDevice=snapshot['device'], witnessDevice=snapshot['device'],
    witnessBytes=79, witnessAllocatedBytes=4096, witnessStable=True, witnessRegular=True, rawRegular=True)
record = repair.make_reservation('a'*32, 'b'*64, 'c'*64, snapshot, 154128384)
facts = dict(availableMemoryBytes=3623878656, freeBytes=195441639424,
             retainedInodeBytes=8589934592, otherFutureReservations=0)
step = dict(kind='preallocate', calls=256)
if case == 'snapshot':
    repair.check_snapshot(snapshot, json.loads(json.dumps(snapshot)))
    refused(lambda: repair.check_snapshot(snapshot, dict(snapshot, ctimeNs='1793840000000000001')))
    for key in snapshot:
        changed = dict(snapshot); del changed[key]
        refused(lambda: repair.check_snapshot(changed, snapshot))
    for value in [True, 1, '01', '-1', '1e3', '18446744073709551616']:
        refused(lambda: repair.check_snapshot(dict(snapshot, mtimeNs=value), dict(snapshot, mtimeNs=value)))
    refused(lambda: repair.check_snapshot(dict(snapshot, extra=1), dict(snapshot, extra=1)))
    for change in [dict(owner=True), dict(owner=-1), dict(owner=4294967296), dict(mode='0640'),
                   dict(links=True), dict(links=2), dict(logicalBytes='4096'),
                   dict(allocatedBytes='4097'), dict(allocatedBytes='8590987264')]:
        refused(lambda: repair.check_snapshot(dict(snapshot, **change), dict(snapshot, **change)))
elif case == 'capacity':
    assert record['grossBytes'] == '141754548224'
    repair.check_capacity(facts, profile, record, [], step, initial=True)
    repair.check_capacity(facts, profile, record, [record], step, initial=True)
    refused(lambda: repair.check_capacity(dict(facts, freeBytes=195441639423), profile, record, [], step, initial=True))
    live = dict(facts, availableMemoryBytes=2147483648, freeBytes=184704221184,
                retainedInodeBytes=10540285952)
    repair.check_capacity(live, profile, record, [], step)
    refused(lambda: repair.check_capacity(dict(live, retainedInodeBytes=10540285953), profile, record, [], step))
    rewrite = dict(kind='rewrite', bytes=1048576)
    repair.check_capacity(dict(live, retainedInodeBytes=10552868864), profile, record, [], rewrite)
    refused(lambda: repair.check_capacity(dict(live, retainedInodeBytes=10552868865), profile, record, [], rewrite))
    for key in facts:
        for value in [True, -1, None]:
            refused(lambda: repair.check_capacity(dict(facts, **{key:value}), profile, record, [], step, initial=True))
        absent = dict(facts); del absent[key]
        refused(lambda: repair.check_capacity(absent, profile, record, [], step, initial=True))
    for key in profile:
        absent = dict(profile); del absent[key]
        refused(lambda: repair.check_capacity(facts, absent, record, [], step, initial=True))
    for change in [dict(delalloc=False), dict(dioreadNolock=False), dict(dataMode='journal'),
                   dict(inodeFlags=524289), dict(blockBytes=1024), dict(witnessDevice='1'),
                   dict(witnessStable=False), dict(rawRegular=False), dict(kernelSourceCommit='d'*40), dict(extra=1)]:
        refused(lambda: repair.check_capacity(facts, dict(profile, **change), record, [], step, initial=True))
    for bad in [dict(kind='preallocate', calls=257), dict(kind='preallocate', calls=True),
                dict(kind='rewrite', bytes=4096), dict(kind='rewrite', bytes=1048576, cap=1)]:
        refused(lambda: repair.check_capacity(facts, profile, record, [], bad, initial=True))
    for missing in [True, -1, 1, 8589938688]:
        refused(lambda: repair.make_reservation('a'*32, 'b'*64, 'c'*64, snapshot, missing))
    assert repair.make_reservation('a'*32, 'b'*64, 'c'*64, snapshot, 0)['grossBytes'] == '137438953472'
    assert repair.make_reservation('a'*32, 'b'*64, 'c'*64, snapshot, 8589934592)['grossBytes'] == '377957122048'
    prior = dict(record, nonce='d'*32)
    refused(lambda: repair.check_capacity(facts, profile, record, [prior], step, initial=True))
    refused(lambda: repair.check_capacity(facts, profile, record, [record, record], step, initial=True))
    refused(lambda: repair.check_capacity(facts, profile, record, [dict(record, sourceDigest='e'*64)], step, initial=True))
    refused(lambda: repair.check_capacity(dict(facts, extra=0), profile, record, [], step, initial=True))
    refused(lambda: repair.check_capacity(facts, profile, record, [], step, initial=1))
    refused(lambda: repair.check_capacity(dict(facts, freeBytes=2**64-1), profile, record,
        [dict(record, nonce=format(index, '032x')) for index in range(1025)], step, initial=True))
    for change in [dict(schemaVersion=True), dict(schemaVersion=2), dict(missingBytes='1'),
                   dict(grossBytes='1'), dict(extra=1), dict(nonce='z'*32),
                   dict(requestDigest='b'*63), dict(sourceDigest=True)]:
        refused(lambda: repair.check_capacity(facts, profile, dict(record, **change), [], step, initial=True))
    refused(lambda: repair.check_capacity(dict(live, freeBytes=184704221183), profile, record, [], step))
    refused(lambda: repair.check_capacity(dict(live, availableMemoryBytes=2147483647), profile, record, [], step))
    repair.check_capacity(dict(live, retainedInodeBytes=10569531392), profile, record, [], dict(kind='preallocate', calls=1))
    refused(lambda: repair.check_capacity(dict(live, retainedInodeBytes=10569531393), profile, record, [], dict(kind='preallocate', calls=1)))
    refused(lambda: repair.check_capacity(dict(facts, otherFutureReservations=1), profile, record, [], step, initial=True))
    refused(lambda: repair.check_capacity(dict(facts, availableMemoryBytes=3623878655), profile, record, [], step, initial=True))
elif case.startswith('metadata'):
    with tempfile.TemporaryDirectory() as root:
        os.chmod(root, 0o700)
        def create_pending(nonce):
            directory = pathlib.Path(root) / ('raw-repair-' + nonce)
            os.mkdir(directory, 0o700)
            fd = repair.raw.open_private(directory, directory=True)
            repair.raw.persist(directory, 'request-binding.json', dict(requestDigest='b'*64,
                sourceDigest='c'*64, initial={}, unitBefore={}), directory_fd=fd)
            return repair.capture_pending(directory, fd, dict(record, nonce=nonce))
        pending = create_pending('a'*32)
        try:
            assert repair.read_reservations(root, pending) == []
            refused(lambda: repair.read_reservations(root))
            if case == 'metadata-bounds':
                class Entries:
                    def __enter__(self): return iter([types.SimpleNamespace(name='ignored')]*20001)
                    def __exit__(self, *arguments): pass
                original_scan = os.scandir
                os.scandir = lambda fd: Entries()
                try: refused(lambda: repair.read_reservations(root))
                finally: os.scandir = original_scan
                # The fixed ledger ceiling must refuse even though every record is valid.
                repair.publish_reservation(pending, record)
                for index in range(1, 1025):
                    nonce = format(index, '032x')
                    directory = pathlib.Path(root)/('raw-repair-'+nonce)
                    directory.mkdir(mode=0o700)
                    repair.raw.persist(directory, 'request-binding.json', dict(requestDigest='b'*64,
                        sourceDigest='c'*64, initial={}, unitBefore={}))
                    repair.raw.persist(directory, 'reservation.json', dict(record, nonce=nonce))
                refused(lambda: repair.read_reservations(root))
            elif case == 'metadata-boundaries':
                refused(lambda: repair.capture_pending(pending.directory, pending.descriptor, dict(record, nonce='d'*32)))
                other = pathlib.Path(root)/'other'; os.mkdir(other, 0o700)
                other_fd = repair.raw.open_private(other, directory=True)
                try: refused(lambda: repair.capture_pending(pending.directory, other_fd, record))
                finally: os.close(other_fd)
                for field in ['requestDigest', 'sourceDigest']:
                    refused(lambda: repair.capture_pending(pending.directory, pending.descriptor, dict(record, **{field:'e'*64})))
                refused(lambda: repair.read_reservations(root, object()))
                forged = types.SimpleNamespace(**pending.__dict__)
                refused(lambda: repair.read_reservations(root, forged))
                class EmptyEntries:
                    def __enter__(self): return iter([])
                    def __exit__(self, *arguments): pass
                original_scan = os.scandir
                os.scandir = lambda fd: EmptyEntries()
                try: refused(lambda: repair.read_reservations(root, pending))
                finally: os.scandir = original_scan
                refused(lambda: repair.read_reservations(other, pending))
                malformed = pathlib.Path(root)/'raw-repair-bad'; os.mkdir(malformed, 0o700)
                refused(lambda: repair.read_reservations(root, pending))
                repair.raw.persist(malformed, 'request-binding.json', dict(requestDigest='b'*64,
                    sourceDigest='c'*64, initial={}, unitBefore={}))
                repair.raw.persist(malformed, 'reservation.json', record)
                refused(lambda: repair.read_reservations(root, pending))
                (malformed/'request-binding.json').unlink(); (malformed/'reservation.json').unlink()
                malformed.rmdir()
                bad = pathlib.Path(root)/('raw-repair-'+'d'*32); bad.symlink_to(other)
                refused(lambda: repair.read_reservations(root, pending))
                bad.unlink()
                os.chmod(root, 0)
                refused(lambda: repair.read_reservations(root, pending))
                os.chmod(root, 0o700)
                refused(lambda: repair.read_reservations(pathlib.Path(root)/'absent'))
                alias = pathlib.Path(root)/'alias'; alias.symlink_to(root)
                refused(lambda: repair.read_reservations(alias))
                alias.unlink()
                repair.publish_reservation(pending, record)
                binding = pathlib.Path(pending.directory)/'request-binding.json'
                binding_bytes = binding.read_bytes()
                binding.unlink()
                refused(lambda: repair.read_reservations(root))
                binding.write_bytes(binding_bytes); os.chmod(binding, 0o600)
                path = pathlib.Path(pending.directory)/'reservation.json'
                for change in [dict(sourceDigest='e'*64), dict(requestDigest='e'*64),
                               dict(grossBytes='1'), dict(schemaVersion=2)]:
                    path.write_bytes(repair.raw.encode_json(dict(record, **change)))
                    refused(lambda: repair.read_reservations(root))
                path.write_bytes(repair.raw.encode_json(record))
            elif case == 'metadata-durable':
                repair.publish_reservation(pending, record)
                assert repair.read_reservations(root) == [record]
                refused(lambda: repair.publish_reservation(pending, record))
                refused(lambda: repair.read_reservations(root, pending))
                second = create_pending('d'*32)
                try:
                    assert repair.read_reservations(root, second) == [record]
                    repair.publish_reservation(second, dict(record, nonce='d'*32))
                    assert len(repair.read_reservations(root)) == 2
                finally: os.close(second.descriptor)
            elif case == 'metadata-duplicate':
                repair.publish_reservation(pending, record)
                path = pathlib.Path(pending.directory) / 'reservation.json'
                # Duplicate nonce has no whitespace or other schema defect; last wins is valid.
                payload = b'{"nonce":"discarded",' + repair.raw.encode_json(record)[1:]
                assert json.loads(payload) == record
                path.write_bytes(payload)
                try: repair.read_reservations(root)
                except repair.raw.PreparationRefusal as failure:
                    assert str(failure) == 'repair-json-noncanonical'
                else: raise AssertionError('duplicate reservation reached unsafe admission')
            elif case == 'metadata-negative':
                repair.publish_reservation(pending, record)
                path = pathlib.Path(pending.directory) / 'reservation.json'
                for payload in ['{}', 'x'*65537, json.dumps(record)]:
                    path.write_text(payload)
                    refused(lambda: repair.read_reservations(root))
                path.write_bytes(repair.raw.encode_json(record))
                os.chmod(path, 0)
                refused(lambda: repair.read_reservations(root))
                os.chmod(path, 0o600)
                path.unlink()
                refused(lambda: repair.read_reservations(root))
                path.symlink_to('/etc/passwd')
                refused(lambda: repair.read_reservations(root))
                path.unlink()
                path.write_bytes(repair.raw.encode_json(dict(record, nonce='d'*32)))
                os.chmod(path, 0o600)
                refused(lambda: repair.read_reservations(root))
            else:
                # Logical admission witness: an actual durable record must precede
                # an intercepted protected operation, not a native-writer claim.
                original_sync = os.fsync
                original_close = os.close
                original_read = os.read
                original_write = os.write
                failure = case.removeprefix('metadata-')
                if failure in ('file-sync', 'dir-sync'):
                    def broken_sync(fd):
                        selected = stat.S_ISDIR(os.fstat(fd).st_mode)
                        if selected == (failure == 'dir-sync'): raise OSError('injected fsync')
                        original_sync(fd)
                    os.fsync = broken_sync
                if failure == 'close':
                    def broken_close(fd):
                        original_close(fd)
                        raise OSError('injected close')
                    os.close = broken_close
                if failure == 'write':
                    def broken_write(fd, payload):
                        return original_write(fd, payload.replace(b'c'*64, b'e'*64))
                    os.write = broken_write
                if failure in ('read', 'changed'):
                    repair.publish_reservation(pending, record)
                    def broken_read(fd, count):
                        if failure == 'read': raise OSError('injected read')
                        payload = original_read(fd, count)
                        os.utime(pathlib.Path(pending.directory)/'reservation.json', ns=(1, 1))
                        return payload
                    os.read = broken_read
                protected = []
                try:
                    if failure in ('read', 'changed'): repair.read_reservations(root)
                    else: repair.publish_reservation(pending, record)
                    protected.append('next-authority')
                except Exception: pass
                finally:
                    os.fsync = original_sync; os.close = original_close; os.read = original_read; os.write = original_write
                assert protected == [], protected
        finally: os.close(pending.descriptor)
else: raise AssertionError(case)
print('accepted')
`;

for (const scenario of [
  'snapshot',
  'capacity',
  'metadata-durable',
  'metadata-negative',
  'metadata-duplicate',
  'metadata-boundaries',
  'metadata-bounds',
  'metadata-write',
  'metadata-file-sync',
  'metadata-dir-sync',
  'metadata-close',
  'metadata-read',
  'metadata-changed',
]) {
  test(`native repair ${scenario} guards protect logical admission`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        native,
        join(import.meta.dir, 'lab-raw-repair.py'),
        scenario,
        JSON.stringify(snapshot),
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe('accepted\n');
  });
}
