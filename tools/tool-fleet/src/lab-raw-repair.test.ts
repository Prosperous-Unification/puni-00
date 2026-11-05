import { join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import { parseRepairSnapshot, prepareRawRepair, type RepairSnapshot } from './lab-raw-repair';

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

const producer = String.raw`
import importlib.util, hashlib, json, os, pathlib, sys, tempfile, types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
case=sys.argv[2]
def refused(operation, category):
    try:operation()
    except p.raw.PreparationRefusal as failure:
        assert str(failure)==category,(str(failure),category);return
    raise AssertionError('unsafe operation reached: '+category)
snapshot=json.loads(sys.argv[3]);snapshot['owner']=os.geteuid()
if case=='request':
    root='/reviewed';state=root+'/.puni/fleet-labs/observability-baseline'
    names=['image','rawRequest','rawReceipt','rawProvenance','priorGuestRequest','priorGuestFailure','postBootEvidence','witness']
    request=dict(schemaVersion=1,root=root,state=state,nonce='a'*32,expectedRaw=snapshot,pins=[])
    for name in names:
        request[name]=state+'/'+name
        request['pins'].append(dict(path=request[name],sha256='b'*64,bytes=79,uid=os.geteuid(),mode=384))
    p.check_request(request)
    for change in [dict(extra=1),dict(schemaVersion=True),dict(expectedRaw=list(snapshot.values())),
                   dict(expectedRaw=dict(snapshot,mtimeNs=1793840000000000001)),dict(witness='/outside'),dict(nonce='a')]:
        refused(lambda:p.check_request(dict(request,**change)), ('repair-shape-invalid' if 'extra' in change else 'repair-request-invalid') if 'expectedRaw' not in change else ('repair-shape-invalid' if type(change['expectedRaw']) is list else 'repair-integer-invalid'))
    refused(lambda:p.check_request(dict(request,pins=request['pins']*2)),'repair-request-invalid')
elif case=='readonly':
    with tempfile.TemporaryDirectory() as root:
        path=pathlib.Path(root)/'raw';path.write_bytes(b'preserve');path.chmod(0o600)
        original=p.snapshot_file(os.stat(path));expected=dict(original,ctimeNs=str(int(original['ctimeNs'])+1))
        opens=[];native_open=os.open
        def observed(path,flags,*arguments,**keywords):
            opens.append(flags);return native_open(path,flags,*arguments,**keywords)
        p.os.open=observed
        # Snapshot test controls only the fixed 8GiB shape; real inode/ctime and the open flags remain actual.
        p.check_snapshot=lambda expected,actual:p.require(expected==actual,'repair-snapshot-changed')
        refused(lambda:p.open_original(str(path),expected),'repair-snapshot-changed')
        assert opens and all(flags&os.O_ACCMODE==os.O_RDONLY for flags in opens),'writable open before read-only snapshot'
        descriptor=p.open_original(str(path),original)
        try:assert os.read(descriptor,8)==b'preserve'
        finally:os.close(descriptor)
elif case=='preallocate':
    calls=[]
    p.check_original=lambda *arguments:None
    p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(observation=dict(missingDataBytes=0),missingRanges=[]),inspect_file=lambda *arguments,**keywords:dict(mapDigest='e'*64))
    p.writer.allocate_block=lambda descriptor,offset:calls.append(offset)
    p.writer.native_call=lambda *arguments:0
    ranges=[[0,4096],[8192,257*4096]]
    p.preallocate(9,'unused',ranges,lambda step:calls.append(('admit',step['calls'])))
    assert calls[:3]==[('admit',256),0,8192] and calls[257:]==[('admit',2),1052672,1056768],calls[-5:]
    calls.clear()
    def reject(step):raise p.raw.PreparationRefusal('capacity-injected')
    refused(lambda:p.preallocate(9,'unused',ranges,reject),'capacity-injected');assert not calls
elif case=='finish':
    before=dict(snapshot);after=dict(snapshot,mtimeNs='1793840000000000010',ctimeNs='1793840000000000010',allocatedBytes='8589934592')
    allocation=dict(identity={key:after[key] for key in ['device','inode','owner','mode','links','mtimeNs','ctimeNs']},expectedBytes=8589934592,coverageBytes=8589934592,allocatedBytes=8589934592,mapDigest='e'*64)
    artifact=dict(schemaVersion=1,lineage='continued-guest',before=before,after=after,logicalSha256Before='c'*64,logicalSha256After='c'*64,readBytes='8589934592',rewrittenBytes='8589934592',allocation=allocation)
    p.check_repair(artifact,before)
    for change in [dict(logicalSha256After='d'*64),dict(rewrittenBytes='4096'),dict(after=dict(after,inode='1')),dict(allocation=dict(allocation,coverageBytes=4096))]:
        refused(lambda:p.check_repair(dict(artifact,**change),before),'repair-artifact-invalid')
elif case=='lifecycle':
    assert callable(p.worker) and callable(p.coordinator)
    request=dict(nonce='a'*32,state='/private/state')
    arguments=p.service_arguments(request,'/private/request','b'*64)
    assert '--unit=puni-raw-repair-'+request['nonce']+'.service' in arguments
    original=p.raw.service_arguments(request,'/private/request','b'*64)
    position=original.index(str(p.raw.HELPER))
    expected=[('--unit=puni-raw-repair-'+request['nonce']+'.service' if value.startswith('--unit=') else value) for value in original[:position]]
    assert arguments[:position]==expected
    assert arguments[position]=='-c' and arguments[position+1].startswith(p._SOURCE_BOOTSTRAP)
    assert arguments[position+2:]==[str(p.HELPER),'/private/request','b'*64]
    assert '--property=MemoryMax=1073741824' in arguments and '--property=RuntimeMaxSec=900s' in arguments
    assert '--property=Restart=no' in arguments and '--property=LimitFSIZE=8589934592' in arguments
    events=[]
    p.raw.read_caps=lambda group:events.append('caps') or p.raw.CAPS
    p.raw.read_text=lambda *arguments:events.append('counter') or '0'
    p.raw.check_counter=lambda *arguments,**keywords:None
    p.capture_counter(dict(cgroup='/original'),1,2)
    assert events==['caps']+['counter']*6
elif case=='hash':
    with tempfile.TemporaryFile() as stream:
        stream.write(b'complete');stream.flush()
        p.raw.RAW_BYTES=8
        assert p.hash_logical(stream.fileno(),lambda:None)==hashlib.sha256(b'complete').hexdigest()
        stream.truncate(7)
        refused(lambda:p.hash_logical(stream.fileno(),lambda:None),'repair-hash-short')
elif case=='evidence':
    with tempfile.TemporaryDirectory() as root:
        request=dict(state=root,pins=[])
        for key in ['rawRequest','rawReceipt','rawProvenance','priorGuestRequest','priorGuestFailure','postBootEvidence','witness']:
            path=root+'/'+key;pathlib.Path(path).write_bytes(b'pinned');os.chmod(path,0o400)
            request[key]=path;request['pins'].append(dict(path=path,sha256=hashlib.sha256(b'pinned').hexdigest(),bytes=6,uid=os.geteuid(),mode=0o400))
        evidence=p.open_evidence(request)
        try:
            assert len(evidence)==7
            binding=dict(pid=os.getpid(),evidence=evidence)
            p.check_evidence(binding,request)
            pathlib.Path(request['witness']).rename(request['witness']+'.old')
            pathlib.Path(request['witness']).write_bytes(b'pinned');os.chmod(request['witness'],0o400)
            refused(lambda:p.check_evidence(binding,request),'repair-evidence-changed')
        finally:
            for held in evidence.values():os.close(held['fd'])
elif case=='lineage':
    with tempfile.TemporaryDirectory() as root:
        state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700)
        request=dict(root=root,state=state,pins=[],expectedRaw=snapshot)
        def publish(path,record):
            if os.path.exists(path):os.chmod(path,0o600)
            payload=(json.dumps(record,indent=2)+'\n').encode();pathlib.Path(path).write_bytes(payload);os.chmod(path,0o400)
            pin=dict(path=path,sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload),uid=os.geteuid(),mode=0o400)
            request['pins']=[entry for entry in request['pins'] if entry['path']!=path]+[pin]
            return pin
        nonce='d'*32;directory=state+'/raw-'+nonce;os.mkdir(directory,0o700)
        request.update(image=state+'/historical.img',rawRequest=state+'/raw-request.json',rawReceipt=directory+'/receipt.json',rawProvenance=state+'/historical-provenance.json',priorGuestRequest=state+'/guest-request.json',priorGuestFailure=state+'/failed.json',postBootEvidence=state+'/post.json',witness=state+'/request.sha256')
        historical=[dict(path=root+'/tools/tool-fleet/src/old.py',sha256='a'*64,bytes=17,uid=os.geteuid(),mode=0o644)]
        original=dict(root=root,state=state,pins=historical,nonce=nonce,image=request['image'])
        original_pin=publish(request['rawRequest'],original);source=p.raw.digest_json({entry['path']:entry['sha256'] for entry in historical})
        binding=dict(nonce=nonce,raw=[int(snapshot['device']),int(snapshot['inode']),snapshot['owner'],384],source=source,request=original_pin['sha256'])
        receipt=dict(schemaVersion=1,scope='raw-preparation',accepted=True,guestAuthority=False,fullRehearsalAuthority=False,rawBytes=8589934592,binding=binding,sourceDigest=source,requestDigest=original_pin['sha256'])
        receipt_pin=publish(request['rawReceipt'],receipt)
        publish(directory+'/allocation.json',dict(after=dict(identity={},mapDigest='a'*64)))
        provenance=dict(schemaVersion=1,sourceRevision='e'*40,sourcePins=historical,requestDigest=original_pin['sha256'],receiptDigest=receipt_pin['sha256'])
        publish(request['rawProvenance'],provenance)
        seed_path=state+'/seed-request.json';publish(seed_path,dict(nonce='8'*32,**{key:request[key] for key in ('image','rawRequest','rawReceipt','rawProvenance')}))
        guest=dict(nonce='7'*32,root=root,state=state,pins=historical,seedRequest=seed_path);guest_pin=publish(request['priorGuestRequest'],guest)
        terminal=dict(LoadState='not-found',MainPID='0',ActiveState='inactive',SubState='dead',Result='success',ExecMainStatus='0',InvocationID='',ControlGroup='')
        failure=dict(schemaVersion=1,scope='independent-failed-guest-attempt-observation',accepted=False,acceptedReceiptAvailable=False,guestBootObserved=True,fullRehearsalAuthority=False,requestDigest=guest_pin['sha256'],binding=dict(rawPath=directory+'/disk.raw',raw=binding['raw'],nonce=guest['nonce'],request=guest_pin['sha256'],source=source,seedNonce='8'*32),terminal=terminal,groupEvents=None,failure=dict(cleanup='verified-original-unit-empty'))
        publish(request['priorGuestFailure'],failure)
        post=dict(schemaVersion=1,scope='independent-read-only-repair-source',originalFailedGuest=guest['nonce'],contentRead=False,rawWrite=False,repairAuthorized=False,observation=dict(identity={key:snapshot[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},allocatedBytes=int(snapshot['allocatedBytes'])))
        publish(request['postBootEvidence'],post)
        assert p.verify_history(request)['path']==directory+'/disk.raw'
        for change in [dict(binding=dict(failure['binding'],rawPath='/foreign')),dict(binding=dict(failure['binding'],source='f'*64)),dict(requestDigest='f'*64)]:
            publish(request['priorGuestFailure'],dict(failure,**change));refused(lambda:p.verify_history(request),'repair-history-invalid')
        publish(request['priorGuestFailure'],failure)
        pathlib.Path(request['postBootEvidence']).chmod(0o600);pathlib.Path(request['postBootEvidence']).write_text('{}')
        refused(lambda:p.verify_history(request),'raw-pin-changed')
        publish(request['postBootEvidence'],post)
        payload=pathlib.Path(request['rawProvenance']).read_text();duplicate=payload.replace('"schemaVersion": 1','"schemaVersion": 1, "schemaVersion": 1')
        pathlib.Path(request['rawProvenance']).chmod(0o600);pathlib.Path(request['rawProvenance']).write_text(duplicate);pathlib.Path(request['rawProvenance']).chmod(0o400)
        pin=next(entry for entry in request['pins'] if entry['path']==request['rawProvenance']);pin['sha256']=hashlib.sha256(duplicate.encode()).hexdigest();pin['bytes']=len(duplicate.encode())
        refused(lambda:p.verify_history(request),'seed-json-duplicate')
elif case=='initial-capacity':
    with tempfile.TemporaryDirectory() as root:
        path=root+'/raw';pathlib.Path(path).write_bytes(b'x'*4096);os.chmod(path,0o600)
        request=dict(state=root,nonce='a'*32,expectedRaw=snapshot)
        p.verify_history=lambda selected:dict(path=path)
        p.open_original=lambda *arguments:p.raw.open_private(path)
        profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,witnessRegular=True,rawRegular=True)
        p.observe_profile=lambda *arguments:profile
        p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(observation=dict(missingDataBytes=4096)))
        p.observe_facts=lambda state:dict(availableMemoryBytes=3623878656,freeBytes=50*1024**3+128*1024**3+28*4096-1,retainedInodeBytes=4096,otherFutureReservations=0)
        adapter=p.RepairCoordinator(request,'b'*64);adapter.source='c'*64;adapter.request_digest='b'*64
        refused(lambda:adapter.observe_capacity(root,initial=True),'repair-backing-floor')
elif case=='history':
    assert callable(p.seed.verify_raw_history)
    import inspect
    source=inspect.getsource(p.seed.verify_raw)
    assert 'verify_raw_history(request)' in source and 'inspect_file' in source
else:raise AssertionError(case)
print('ok '+case)
`;

for (const boundary of [
  'request',
  'readonly',
  'preallocate',
  'finish',
  'history',
  'lifecycle',
  'hash',
  'evidence',
  'lineage',
  'initial-capacity',
]) {
  test(`repair producer ${boundary} refuses before the next authority`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        producer,
        join(import.meta.dir, 'lab-raw-repair.py'),
        boundary,
        JSON.stringify(snapshot),
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`ok ${boundary}\n`);
  });
}

test('repair source CLI uses literal closed diagnostics under terminal color modes', () => {
  for (const color of ['0', '1']) {
    const environment: Record<string, string | undefined> = {
      ...process.env,
      CI: 'true',
      FORCE_COLOR: color,
      TERM: 'xterm',
    };
    delete environment['NO_COLOR'];
    const invocation = Bun.spawnSync(
      ['bun', join(import.meta.dir, 'lab-raw-repair-cli.ts'), '/private/path'],
      {
        env: environment,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.length).toBe(0);
    expect(invocation.stderr.toString()).toBe('raw repair: invalid-arguments\n');
  }
});

const readyControls = String.raw`
import hashlib, importlib.util, json, os, pathlib, sys, tempfile, time, types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2]
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700);os.chmod(state,0o700)
    p.raw.RAW_BYTES=16384
    raw_directory=state+'/raw-'+'d'*32;os.mkdir(raw_directory,0o700)
    path=raw_directory+'/disk.raw';pathlib.Path(path).write_bytes(b'x'*16384);os.chmod(path,0o600)
    raw_fd=p.raw.open_private(path);original_fd=p.raw.open_private(raw_directory,directory=True)
    staging_fd=p.raw.acquire_staging(state)
    directory=state+'/raw-repair-'+'a'*32;os.mkdir(directory,0o700);directory_fd=p.raw.open_private(directory,directory=True)
    try:
        snapshot=p.snapshot_file(os.fstat(raw_fd));snapshot['logicalBytes']='8589934592'
        native_snapshot=p.snapshot_file;p.snapshot_file=lambda observed:dict(native_snapshot(observed),logicalBytes='8589934592')
        request=dict(root=root,state=state,nonce='a'*32,expectedRaw=snapshot,pins=[])
        record=p.make_reservation('a'*32,'b'*64,'c'*64,snapshot,4096)
        p.raw.persist(directory,'request-binding.json',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={}),directory_fd=directory_fd)
        history=dict(path=path,binding=dict(raw=p.raw.identity(os.fstat(raw_fd)),creator=p.raw.identity(os.fstat(original_fd))))
        p.verify_history=lambda selected:history
        p.open_original=lambda path,expected:p.raw.open_private(path)
        profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,witnessRegular=True,rawRegular=True)
        p.observe_profile=lambda *arguments:profile
        p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(observation=dict(missingDataBytes=4096,mapDigest='e'*64),missingRanges=[[0,4096]]))
        p.observe_facts=lambda state:dict(availableMemoryBytes=3623878656,freeBytes=200*1024**3,retainedInodeBytes=16384,otherFutureReservations=0)
        binding=dict(pid=os.getpid(),start=p.raw.process_start(os.getpid()),unit='puni-raw-repair-'+'a'*32+'.service',invocation='f'*32,cgroup='/fixture',nonce='a'*32,creator=p.raw.identity(os.fstat(directory_fd)),originalCreator=history['binding']['creator'],originalFd=original_fd,raw=history['binding']['raw'],rawFd=raw_fd,rawPath=path,staging=p.raw.identity(os.fstat(staging_fd)),stagingFd=staging_fd,python=p.raw.stable_identity(os.stat('/proc/self/exe')),inputs={},evidence={},source='c'*64,request='b'*64,reservationDigest=p.raw.digest_json(record))
        p.raw.observe_active=lambda *arguments:{key:binding[key] for key in ('pid','start','unit','invocation','cgroup')}
        native_stat=os.stat
        p.os.stat=lambda path,*arguments,**keywords:native_stat('/proc/self/exe' if path=='/usr/bin/python3.12' else path,*arguments,**keywords)
        p.evidence_paths=lambda selected:[]
        adapter=p.RepairCoordinator(request,'b'*64);adapter.inputs={};adapter.source='c'*64
        # Preliminary observation cannot publish debt or authorize a write.
        assert adapter.observe_capacity(state)['admissionAuthorized'] is False
        if fault=='live-memory':p.observe_facts=lambda state:dict(availableMemoryBytes=2147483648,freeBytes=200*1024**3,retainedInodeBytes=16384,otherFutureReservations=0)
        if fault in ('prior','unknown'):
            prior=state+'/raw-repair-'+'9'*32;os.mkdir(prior,0o700)
            if fault=='prior':
                prior_record=dict(record,nonce='9'*32)
                p.raw.persist(prior,'request-binding.json',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={}))
                p.raw.persist(prior,'reservation.json',prior_record)
        if fault=='lock':p.raw.fcntl.flock(staging_fd,p.raw.fcntl.LOCK_UN)
        if fault=='creator':binding['creator'][1]+=1
        if fault=='source':binding['source']='d'*64
        if fault=='snapshot':snapshot=dict(snapshot,mtimeNs=str(int(snapshot['mtimeNs'])+1))
        if fault=='map':map_digest='f'*64
        else:map_digest='e'*64
        if fault=='sync':
            original_sync=p.os.fsync
            p.os.fsync=lambda descriptor:(_ for _ in ()).throw(OSError('injected metadata fsync'))
        frame=dict(phase='ready',binding=binding,observedNs=time.time_ns(),reservation=record,snapshot=snapshot,mapDigest=map_digest)
        try:
            accepted=adapter.check_ready(frame,request,'b'*64,'c'*64,directory,directory_fd)
            assert fault in ('success','live-memory'),'unsafe mutation ACK reached '+fault
            assert accepted==binding
            assert p.read_reservations(state)==[record]
            assert json.loads(pathlib.Path(directory+'/reservation.json').read_bytes())==record
            assert adapter.observe_capacity(state)['grossDebtRetained'] is True
        except (p.raw.PreparationRefusal,OSError):
            assert fault!='success'
            assert not os.path.exists(directory+'/worker-ready.json')
    finally:
        for descriptor in (raw_fd,original_fd,staging_fd,directory_fd):os.close(descriptor)
print('ready '+fault)
`;

for (const fault of [
  'success',
  'live-memory',
  'prior',
  'unknown',
  'lock',
  'creator',
  'source',
  'snapshot',
  'map',
  'sync',
]) {
  test(`repair ready ${fault} binds the original durable reservation before ACK`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        readyControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`ready ${fault}\n`);
  });
}

const profileControls = String.raw`
import hashlib,importlib.util,os,pathlib,sys,tempfile,types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2]
with tempfile.TemporaryDirectory() as root:
    path=root+'/raw';witness_path=root+'/request.sha256'
    pathlib.Path(path).write_bytes(b'x'*4096);os.chmod(path,0o600)
    pathlib.Path(witness_path).write_bytes(b'w'*79);os.chmod(witness_path,0o600)
    request=dict(witness=witness_path,pins=[dict(path=witness_path,sha256=hashlib.sha256(b'w'*79).hexdigest(),bytes=79,uid=os.geteuid(),mode=0o600)])
    descriptor=p.raw.open_private(path)
    try:
        observed=os.fstat(descriptor);device=str(os.major(observed.st_dev))+':'+str(os.minor(observed.st_dev))
        def fstatfs(descriptor,pointer):
            pointer._obj[0]=0xef53 if fault!='filesystem' else 0x1234;pointer._obj[1]=4096
            return -1 if fault=='status' else 0
        p.ctypes.CDLL=lambda *arguments,**keywords:types.SimpleNamespace(fstatfs=fstatfs)
        mount='1 0 '+device+' / / rw,noatime - '+('xfs' if fault=='mount-type' else 'ext4')+' /dev/fixture rw,errors=remount-ro\n'
        def read_text(path,*arguments):
            if path=='/proc/self/mountinfo':return '' if fault=='mount-missing' else mount*2 if fault=='mount-duplicate' else mount
            if path=='/proc/fs/ext4/fixture/options':
                if fault=='options-unreadable':raise PermissionError('controlled proc absence')
                return 'rw\ndelalloc\ndioread_nolock\ndata=ordered\nnodiscard\nnoquota\n'+('data=journal\n' if fault=='journal' else 'delalloc\n' if fault=='options-duplicate' else '')
            raise AssertionError(path)
        p.raw.read_text=read_text
        def ioctl(opened_fd,command,flags,mutate):flags[:]=(524289 if fault=='flags' or (fault=='witness-flags' and opened_fd!=descriptor) else 524288).to_bytes(8,'little')
        p.fcntl.ioctl=ioctl
        p.os.uname=lambda:types.SimpleNamespace(release='7.0.11-76070011-generic' if fault!='kernel' else 'other')
        if fault=='witness-size':pathlib.Path(witness_path).write_bytes(b'w'*78)
        if fault=='witness-unreadable':os.chmod(witness_path,0)
        if fault=='witness-changed':
            verify=p.raw.verify_pin
            def changed(pin):
                verify(pin);os.rename(witness_path,witness_path+'.original');pathlib.Path(witness_path).write_bytes(b'w'*79);os.chmod(witness_path,0o600)
            p.raw.verify_pin=changed
        try:
            profile=p.observe_profile(request,descriptor)
            assert fault=='success','unsupported native profile admitted '+fault
            assert profile['clusterBytes']==4096 and profile['witnessStable'] is True
        except (p.raw.PreparationRefusal,OSError):assert fault!='success'
    finally:os.close(descriptor)
print('profile '+fault)
`;

for (const fault of [
  'success',
  'filesystem',
  'status',
  'mount-missing',
  'mount-duplicate',
  'mount-type',
  'options-unreadable',
  'journal',
  'options-duplicate',
  'flags',
  'kernel',
  'witness-size',
  'witness-flags',
  'witness-unreadable',
  'witness-changed',
]) {
  test(`repair native profile ${fault} stays read only before mutation`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        profileControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`profile ${fault}\n`);
  });
}

const workerControls = String.raw`
import hashlib,importlib.util,json,os,pathlib,sys,tempfile,time,types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2];events=[];frames=[]
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700);os.chmod(state,0o700)
    directory=state+'/raw-repair-'+'a'*32;os.mkdir(directory,0o700)
    original_directory=state+'/raw-'+'d'*32;os.mkdir(original_directory,0o700)
    path=original_directory+'/disk.raw';pathlib.Path(path).write_bytes(b'X'*(2*1048576));os.chmod(path,0o600)
    p.raw.RAW_BYTES=2*1048576
    native_snapshot=p.snapshot_file;p.snapshot_file=lambda observed:dict(native_snapshot(observed),logicalBytes='8589934592')
    snapshot=p.snapshot_file(os.lstat(path));request=dict(root=root,state=state,nonce='a'*32,expectedRaw=snapshot,pins=[])
    staging=p.raw.acquire_staging(state)
    p.verify_inputs=lambda selected:'c'*64
    p.verify_history=lambda selected:dict(path=path,binding=dict(creator=p.raw.identity(os.lstat(original_directory))))
    p.source_identities=lambda selected:{};p.open_evidence=lambda selected:{}
    p.check_input_descriptors=lambda binding,selected:p.check_lock(binding,state)
    native=dict(pid=os.getpid(),start=p.raw.process_start(os.getpid()),unit='puni-raw-repair-'+'a'*32+'.service',invocation='e'*32,cgroup='/fixture',caps=p.raw.CAPS)
    os.environ['INVOCATION_ID']=native['invocation']
    p.raw.observe_active=lambda *arguments:dict(native,invocation='f'*32) if fault=='native' and 'ack' in events else native
    profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,witnessRegular=True,rawRegular=True)
    p.observe_profile=lambda *arguments:profile
    p.observe_facts=lambda state:dict(availableMemoryBytes=3623878656,freeBytes=1 if fault=='capacity' else 200*1024**3,retainedInodeBytes=2*1048576,otherFutureReservations=0)
    ranges=dict(observation=dict(missingDataBytes=4096,mapDigest='b'*64),missingRanges=[[4096,4096]])
    def inspect(*arguments,**keywords):
        if fault=='dense' and not keywords.get('require_initialized'):raise p.raw.PreparationRefusal('injected-dense')
        if fault=='initialized' and keywords.get('require_initialized'):raise p.raw.PreparationRefusal('injected-initialized')
        after=p.snapshot_file(os.lstat(path))
        return dict(identity={key:after[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},expectedBytes=p.raw.RAW_BYTES,coverageBytes=p.raw.RAW_BYTES,allocatedBytes=int(after['allocatedBytes']),mapDigest='b'*64)
    def inspect_range(path,size,offset,count):
        events.append(('range',offset))
        if fault=='range':raise p.raw.PreparationRefusal('injected-range')
    p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(ranges,observation=dict(ranges['observation'],mapDigest='f'*64)) if fault=='map' and 'ack' in events else ranges,inspect_file=inspect,inspect_initialized_range=inspect_range)
    def send(descriptor,frame):frames.append(frame);events.append(frame['phase'])
    p.raw.send_frame=send
    def ack(*arguments):
        events.append('ack');p.raw.persist(directory,'reservation.json',frames[0]['reservation'])
        if fault=='snapshot':
            with open(path,'r+b') as stream:stream.write(b'Z')
    p.raw.receive_ack=ack
    original_hash=p.hash_logical
    def hashed(descriptor,monitor):
        events.append('posthash' if 'reaped' in events else 'prehash')
        return original_hash(descriptor,monitor)
    p.hash_logical=hashed
    p.raw.persist(directory,'request-binding.json',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={}))
    def allocate(descriptor,offset):
        assert 'prehash' in events,'unsafe allocation before complete prehash';events.append(('allocate',offset))
    p.writer.allocate_block=allocate;p.writer.native_call=lambda *arguments:0
    class Stream:
        def close(self):pass
    child=types.SimpleNamespace(stdin=Stream(),stdout=Stream(),stderr=Stream())
    p.writer.start_writer=lambda *arguments:events.append('child') or child
    def drive(child,before,after,deadline):
        for offset in (0,1048576):
            before(offset);events.append(('write',offset));after(offset)
        if fault=='hash':
            with open(path,'r+b') as stream:stream.write(b'Z')
        events.append('reaped')
    p.writer.drive_writer=drive
    original_text=p.raw.read_text
    def read_text(path,*arguments):
        if path.startswith('/sys/fs/cgroup/fixture/'):
            assert 'reaped' in events and 'posthash' in events,'counter before exact writer reap/posthash'
            events.append('counter')
            name=path.rsplit('/',1)[-1]
            return {'memory.current':'1','memory.peak':'2','memory.events':'oom 1\noom_kill 0' if fault=='counter' else 'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}[name]
        return original_text(path,*arguments)
    p.raw.read_text=read_text;p.raw.read_caps=lambda *arguments:p.raw.CAPS
    def durable(descriptor):
        assert 'complete' in events
        try:p.raw.acquire_staging(state)
        except p.raw.PreparationRefusal as failure:assert str(failure)=='raw-staging-occupied'
        else:raise AssertionError('original staging lock released before durability ACK')
        return dict(durableDigest='f'*64 if fault=='durable' else p.raw.digest_json(frames[-1]['record']))
    p.raw.receive_frame=durable
    try:
        try:
            p.produce_repair(request,'b'*64,staging)
            assert fault=='success','unsafe repair completed '+fault
            assert [frame['phase'] for frame in frames]==['ready','complete']
            assert events.index('prehash')<events.index(('allocate',4096))<events.index('child')<events.index('reaped')<events.index('posthash')<events.index('counter')<events.index('complete')
            assert frames[-1]['repair']['logicalSha256Before']==hashlib.sha256(b'X'*(2*1048576)).hexdigest()
        except p.raw.PreparationRefusal:
            assert fault!='success'
            if fault in ('native','snapshot','capacity','map'):assert not any(type(event) is tuple and event[0]=='allocate' for event in events)
            if fault=='range':assert ('write',1048576) not in events
            if fault in ('hash','initialized','counter'):assert 'complete' not in events
        assert os.path.isfile(directory+'/reservation.json'),'failed repair lost debt'
    finally:os.close(staging)
print('worker '+fault)
`;

for (const fault of [
  'success',
  'native',
  'snapshot',
  'capacity',
  'map',
  'dense',
  'range',
  'hash',
  'initialized',
  'counter',
  'durable',
]) {
  test(`repair trusted worker ${fault} preserves mutation and counter order`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        workerControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`worker ${fault}\n`);
  });
}

test('repair source envelope refuses extra authority and malformed producer outcomes', () => {
  const accepted = {
    schemaVersion: 1,
    scope: 'raw-repair-preparation',
    accepted: true,
    nonce: 'a'.repeat(32),
    receiptDigest: 'b'.repeat(64),
    guestAuthority: false,
    fullRehearsalAuthority: false,
  } as const;
  const spawn = spyOn(Bun, 'spawnSync');
  try {
    const response = (projection: unknown, change: object = {}) =>
      ({
        stdout: Buffer.from(JSON.stringify(projection)),
        stderr: Buffer.alloc(0),
        exitCode: 0,
        exitedDueToMaxBuffer: false,
        exitedDueToTimeout: false,
        ...change,
      }) as unknown as ReturnType<typeof Bun.spawnSync>;
    spawn.mockReturnValue(response(accepted));
    expect(prepareRawRepair('/private/request', 'c'.repeat(64))).toEqual(accepted);
    for (const projection of [
      { ...accepted, guestAuthority: true },
      { ...accepted, fullRehearsalAuthority: true },
      { ...accepted, repairAuthority: true },
      { ...accepted, scope: 'seed-preparation' },
      { ...accepted, receiptDigest: 'bad' },
    ]) {
      spawn.mockReturnValue(response(projection));
      expect(() => prepareRawRepair('/private/request', 'c'.repeat(64))).toThrow(
        'raw repair: producer-malformed',
      );
    }
    for (const [change, category] of [
      [{ stderr: Buffer.from('PRIVATE') }, 'producer-malformed'],
      [{ stdout: Buffer.from('PRIVATE') }, 'producer-malformed'],
      [{ exitCode: 1 }, 'producer-refused'],
      [{ exitedDueToMaxBuffer: true }, 'producer-output-bound'],
      [{ exitedDueToTimeout: true }, 'producer-timeout'],
    ] as const) {
      spawn.mockReturnValue(response(accepted, change));
      expect(() => prepareRawRepair('/private/request', 'c'.repeat(64))).toThrow(
        `raw repair: ${category}`,
      );
    }
    spawn.mockImplementation(() => {
      throw new Error('PRIVATE');
    });
    expect(() => prepareRawRepair('/private/request', 'c'.repeat(64))).toThrow(
      'raw repair: dependency-unavailable',
    );
    expect(() => prepareRawRepair('', 'c'.repeat(64))).toThrow('raw repair: invalid-arguments');
  } finally {
    spawn.mockRestore();
  }
});

const inputControls = String.raw`
import importlib.util,os,pathlib,sys,types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2]
root='/selected';state=root+'/.puni/fleet-labs/observability-baseline';p.HELPER=pathlib.Path(root+'/tools/tool-fleet/src/lab-raw-repair.py')
paths=[str(p.HELPER.with_name(name)) for name in ['lab-raw-repair.py','lab-raw-repair.ts','lab-raw-repair-cli.ts','lab-repair-worker.py','lab-raw-preparation.py','lab-raw-allocation.py','lab-seed-preparation.py','lab-guest-preparation.py']]
paths+=['/usr/bin/python3.12','/usr/bin/systemd-run','/usr/bin/systemctl','/usr/bin/dpkg-query','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2','/usr/lib/x86_64-linux-gnu/libfixture.so','/usr/share/doc/linux-image-7.0.11-76070011-generic/changelog.Debian.gz']
pins=[dict(path=path,sha256='a'*64,bytes=1,uid=os.geteuid(),mode=0o644) for path in paths]
pins[-1]['sha256']='5b40c328ae4ed4a56d36d73f37f5335136439db093be8033dc4c413f663c7569'
request=dict(root=root,state=state,pins=pins)
for key in ['image','rawRequest','rawReceipt','rawProvenance','priorGuestRequest','priorGuestFailure','postBootEvidence','witness']:
    request[key]=state+'/'+key
    pins.append(dict(path=request[key],sha256='a'*64,bytes=1,uid=os.geteuid(),mode=0o600))
for path in [state+'/seedRequest',state+'/allocation.json']:
    pins.append(dict(path=path,sha256='a'*64,bytes=1,uid=os.geteuid(),mode=0o600))
p.seed.read_pinned_json=lambda *arguments:dict(seedRequest=state+'/seedRequest')
p.platform.machine=lambda:'x86_64';p.sys.version_info=(3,12)
native_resolve=os.path.realpath;p.os.path.realpath=lambda path:'/usr/bin/python3.12' if path=='/usr/bin/python3' else native_resolve(path)
p.os.uname=lambda:types.SimpleNamespace(release='7.0.11-76070011-generic')
p.raw.read_text=lambda path:'Linux version 7.0.11-76070011-generic 4974880'
p.verify_history=lambda selected:None
calls=[]
p.raw.verify_pin=lambda pin:calls.append(pin['path'])
if fault=='credential':request['pins'].append(dict(path='/unselected/credential',sha256='a'*64,bytes=1,uid=os.geteuid(),mode=0o600))
version='linux 7.0.11-76070011.202606011647~1784215097~24.04~4974880\n'*2
def bounded(arguments,*rest):
    if arguments[0]=='/usr/bin/dpkg-query':return version.encode() if fault!='package' else b'foreign\n'
    return b' /usr/lib/x86_64-linux-gnu/libfixture.so (0x01)\n' if fault!='closure' else b' /foreign/lib.so (0x01)\n'
p.raw.run_bounded=bounded
if fault=='missing':request['pins']=pins[1:]
if fault=='runtime':p.sys.version_info=(3,14)
if fault=='source':p.HELPER=pathlib.Path('/foreign/lab-raw-repair.py')
if fault=='changelog':next(pin for pin in pins if pin['path'].endswith('changelog.Debian.gz'))['sha256']='b'*64
if fault=='pin':
    def changed(pin):raise p.raw.PreparationRefusal('injected-current-pin')
    p.raw.verify_pin=changed
try:
    digest=p.verify_inputs(request)
    assert fault=='success','unsafe current source launch admitted '+fault
    assert len(digest)==64
except p.raw.PreparationRefusal:
    assert fault!='success'
    if fault=='credential':assert not calls,'unsupported credential pin hashed before refusal'
print('inputs '+fault)
`;

for (const fault of [
  'success',
  'missing',
  'runtime',
  'source',
  'changelog',
  'pin',
  'package',
  'closure',
  'credential',
]) {
  test(`repair current inputs ${fault} refuse before service launch`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        inputControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`inputs ${fault}\n`);
  });
}

const outerControls = String.raw`
import importlib.util,hashlib,json,os,pathlib,stat,subprocess,sys,tempfile,time,types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2]
child_source=r'''
import importlib.util,hashlib,json,os,pathlib,sys,time
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
state,nonce,fault=sys.argv[2:];p.raw.RAW_BYTES=16384
path=state+'/raw-'+'d'*32+'/disk.raw';directory=state+'/raw-repair-'+nonce
raw_fd=p.raw.open_private(path);creator=p.raw.open_private(directory,directory=True);original=p.raw.open_private(pathlib.Path(path).parent,directory=True);staging=p.raw.acquire_staging(state)
snapshot=p.snapshot_file(os.fstat(raw_fd));snapshot['logicalBytes']='8589934592'
reservation=p.make_reservation(nonce,'b'*64,'c'*64,snapshot,0)
binding=dict(pid=os.getpid(),start=p.raw.process_start(os.getpid()),unit='puni-raw-repair-'+nonce+'.service',invocation='e'*32,cgroup='/fixture',nonce=nonce,creator=p.raw.identity(os.fstat(creator)),originalCreator=p.raw.identity(os.fstat(original)),originalFd=original,raw=p.raw.identity(os.fstat(raw_fd)),rawFd=raw_fd,rawPath=path,staging=p.raw.identity(os.fstat(staging)),stagingFd=staging,python=p.raw.stable_identity(os.stat('/proc/self/exe')),inputs={},evidence={},source='c'*64,request='b'*64,reservationDigest=p.raw.digest_json(reservation))
ready=time.time_ns();p.raw.send_frame(1,dict(phase='ready',binding=binding,observedNs=ready,reservation=reservation,snapshot=snapshot,mapDigest='f'*64));p.raw.receive_ack(0,binding,'b'*64)
assert json.load(open(directory+'/reservation.json'))==reservation
pathlib.Path(directory+'/ack-before-mutation').write_text('metadata-only fixture')
allocation=dict(identity={key:snapshot[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},expectedBytes=16384,coverageBytes=16384,allocatedBytes=int(snapshot['allocatedBytes']),mapDigest='f'*64)
sha=hashlib.sha256(os.pread(raw_fd,16384,0)).hexdigest()
artifact=dict(schemaVersion=1,lineage='continued-guest',before=snapshot,after=snapshot,logicalSha256Before=sha,logicalSha256After=sha,readBytes='16384',rewrittenBytes='16384',allocation=allocation)
counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 1\noom_kill 0' if fault=='counter' else 'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
record=dict(binding=binding,startedNs=ready,finishedNs=time.time_ns(),caps=p.raw.CAPS,counters=counters,rewritten=True,bytePreserved=True,initialized=True)
p.raw.send_frame(1,dict(phase='complete',record=record,repair=artifact))
ack=p.raw.receive_frame(0);assert ack==dict(durableDigest=p.raw.digest_json(record))
assert json.load(open(directory+'/worker-counter.json'))==record
assert json.load(open(directory+'/repair.json'))['counterDigest']==p.raw.digest_json(record)
try:p.raw.acquire_staging(state)
except p.raw.PreparationRefusal as failure:assert str(failure)=='raw-staging-occupied'
else:raise AssertionError('durability lock escaped')
sys.exit(1 if fault=='client' else 0)
'''
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700);os.chmod(state,0o700)
    original=state+'/raw-'+'d'*32;os.mkdir(original,0o700);path=original+'/disk.raw';pathlib.Path(path).write_bytes(b'X'*16384);os.chmod(path,0o600)
    p.raw.RAW_BYTES=16384
    native_snapshot=p.snapshot_file;p.snapshot_file=lambda observed:dict(native_snapshot(observed),logicalBytes='8589934592')
    snapshot=p.snapshot_file(os.lstat(path));request=dict(root=root,state=state,nonce='a'*32,expectedRaw=snapshot,rawReceipt=state+'/old-receipt',priorGuestFailure=state+'/old-failure',pins=[dict(path=state+'/old-receipt',sha256='9'*64),dict(path=state+'/old-failure',sha256='8'*64)])
    p.verify_inputs=lambda selected:'c'*64;p.source_identities=lambda selected:{};p.evidence_paths=lambda selected:[]
    p.verify_history=lambda selected:dict(path=path,binding=dict(raw=p.raw.identity(os.lstat(path)),creator=p.raw.identity(os.lstat(original))))
    p.open_original=lambda path,expected:p.raw.open_private(path)
    profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,witnessRegular=True,rawRegular=True)
    p.observe_profile=lambda *arguments:profile
    def facts(state):
        if fault=='cancel' and os.path.exists(state+'/raw-repair-'+'a'*32+'/worker-ready.json'):raise p.raw.PreparationRefusal('raw-cancelled')
        return dict(availableMemoryBytes=3623878656,freeBytes=200*1024**3,retainedInodeBytes=16384,otherFutureReservations=0)
    p.observe_facts=facts
    allocation=dict(identity={key:snapshot[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},expectedBytes=16384,coverageBytes=16384,allocatedBytes=int(snapshot['allocatedBytes']),mapDigest='f'*64)
    p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(observation=dict(missingDataBytes=0,mapDigest='f'*64),missingRanges=[]),inspect_file=lambda *arguments,**keywords:allocation)
    native_stat=os.stat;p.os.stat=lambda path,*arguments,**keywords:native_stat('/proc/self/exe' if path=='/usr/bin/python3.12' else path,*arguments,**keywords)
    p.raw.observe_active=lambda unit,pid:dict(pid=pid,start=p.raw.process_start(pid),unit=unit,invocation='e'*32,cgroup='/fixture',caps=p.raw.CAPS)
    terminal=dict(LoadState='not-found',MainPID='0',ActiveState='inactive',SubState='dead',Result='success',ExecMainStatus='0',InvocationID='',ControlGroup='')
    calls=0
    def observe_unit(unit):
        global calls;calls+=1
        return dict(terminal,LoadState='loaded',InvocationID='f'*32) if fault=='terminal' and calls>1 else terminal
    p.RepairCoordinator.observe_unit=staticmethod(observe_unit)
    p.RepairCoordinator.observe_active=staticmethod(p.raw.observe_active)
    native_text=p.raw.read_text
    p.raw.read_text=lambda path,limit=65536:str(child.pid)+'\n' if path in ('/sys/fs/cgroup/fixture/cgroup.procs','/sys/fs/cgroup/fixture/cgroup.threads') else native_text(path,limit)
    p.raw.read_caps=lambda group:p.raw.CAPS;p.raw.group_events=lambda group:'populated 1' if fault=='populated' else None
    child=None;stopped=[]
    def launch(selected,path_,digest):
        global child
        child=subprocess.Popen([sys.executable,'-I','-B','-c',child_source,sys.argv[1],state,request['nonce'],fault],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        return child
    p.RepairCoordinator.launch_service=staticmethod(launch)
    def stop(binding):
        assert binding['pid']==child.pid and binding['start']==p.raw.process_start(child.pid) if child.poll() is None else binding['pid']==child.pid
        stopped.append(binding['pid'])
        if child.poll() is None:child.terminate()
        if fault=='cleanup':raise p.raw.PreparationRefusal('raw-cleanup-uncertain')
        if fault=='final':os.utime(path,ns=(os.stat(path).st_atime_ns,os.stat(path).st_mtime_ns+1))
    p.RepairCoordinator.stop_owned=staticmethod(stop)
    persist=p.raw.persist
    def publish(directory,name,record,**keywords):
        if fault=='sync' and name=='worker-counter.json':raise OSError('controlled counter fsync')
        if fault=='reservation-sync' and name=='reservation.json':
            original_sync=os.fsync
            def broken(descriptor):
                if stat.S_ISREG(os.fstat(descriptor).st_mode):raise OSError('controlled reservation file fsync')
                return original_sync(descriptor)
            os.fsync=broken
            try:return persist(directory,name,record,**keywords)
            finally:os.fsync=original_sync
        return persist(directory,name,record,**keywords)
    p.raw.persist=publish
    directory=state+'/raw-repair-'+request['nonce']
    try:
        envelope=p.coordinator(request,'/private/request','b'*64)
        assert fault=='success','unsafe durable receipt accepted '+fault
        assert envelope['scope']=='raw-repair-preparation' and envelope['guestAuthority'] is False
        assert json.load(open(directory+'/receipt.json'))['grossDebtRetained'] is False
        assert stopped==[child.pid]
    except (p.raw.PreparationRefusal,OSError):
        assert fault!='success'
        assert not os.path.exists(directory+'/receipt.json')
        assert os.path.exists(directory+'/reservation.json')
        if fault=='reservation-sync':assert not os.path.exists(directory+'/ack-before-mutation'),'mutation sentinel before reservation fsync'
    assert child.poll() is not None,'original service client orphaned'
print('outer '+fault)
`;

for (const fault of [
  'success',
  'counter',
  'client',
  'terminal',
  'populated',
  'cancel',
  'sync',
  'reservation-sync',
  'cleanup',
  'final',
]) {
  test(`repair outer coordinator ${fault} preserves original durability and cleanup`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        outerControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`outer ${fault}\n`);
  });
}
