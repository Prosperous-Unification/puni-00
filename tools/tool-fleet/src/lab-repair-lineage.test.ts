import { join } from 'node:path';

import { expect, test } from 'bun:test';

const controls = String.raw`
import copy,hashlib,importlib.util,json,os,pathlib,sys,tempfile,types,time
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
spec=importlib.util.spec_from_file_location('guest',pathlib.Path(sys.argv[1]).with_name('lab-guest-preparation.py'));g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
case=sys.argv[2]
def refused(operation):
    try:operation()
    except (s.raw.PreparationRefusal,g.raw.PreparationRefusal,OSError,ValueError,KeyError,TypeError):return
    raise AssertionError('unsafe continued authority '+case)
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700)
    pins=[]
    def pin(path,payload,mode=0o400):
        path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(payload);path.chmod(mode)
        selected=dict(path=str(path),sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload),uid=os.geteuid(),mode=mode)
        pins.append(selected);return str(path)
    def record(name,content):return pin(state+'/'+name,s.raw.encode_json(content),0o600)
    members={}
    for name in s.MEMBERS:
        path=pin(state+'/new/'+name,b'new member')
        members[name]={key:pins[-1][key] for key in ('path','sha256','bytes')}
    for name in ('image','dependency','raw-receipt','raw-request','raw-provenance','repair-request','repair-receipt','repair-provenance'):
        record(name,{})
    request=dict(schemaVersion=2,lineage='continued-guest',root=root,state=state,nonce='a'*32,pins=pins,members=members,image=state+'/image',dependencyReport=state+'/dependency',rawReceipt=state+'/raw-receipt',rawRequest=state+'/raw-request',rawProvenance=state+'/raw-provenance',provenance=[state+'/raw-provenance'],repairRequest=state+'/repair-request',repairReceipt=state+'/repair-receipt',repairProvenance=state+'/repair-provenance')
    if case=='requests':
        s.check_request(request)
        for changed in [dict(request,schemaVersion=True),dict(request,schemaVersion=2.0),dict(request,lineage='raw'),dict(request,schemaVersion=1),dict(request,repairReceipt=state+'/absent')]:refused(lambda:s.check_request(changed))
        legacy={key:value for key,value in request.items() if key not in ('lineage','repairRequest','repairReceipt','repairProvenance')};legacy['schemaVersion']=1;s.check_request(legacy)
        guest=dict(schemaVersion=2,lineage='continued-guest',root=root,state=state,nonce='b'*32,pins=pins,seedRequest=state+'/raw-request',seedReceipt=state+'/raw-receipt',seedProvenance=state+'/raw-provenance',bootstrapSha256='f'*64,kvm=dict(identity=[1,2,3,4],rdev=os.makedev(10,232)))
        g.check_request(guest)
        for changed in [dict(guest,schemaVersion=True),dict(guest,schemaVersion=2.0),dict(guest,lineage='raw'),dict(guest,schemaVersion=1)]:refused(lambda:g.check_request(changed))
    elif case=='roles':
        for component,prefix in ((s,'seed'),(g,'guest')):
            component.HELPER=pathlib.Path(root+'/tools/tool-fleet/src/lab-'+prefix+'-preparation.py')
            base=['lab-'+prefix+'-preparation.py','lab-'+prefix+'-preparation.ts','lab-'+prefix+'-preparation-cli.ts','lab-raw-preparation.py','lab-raw-allocation.py']
            if prefix=='guest':base+=['lab-seed-preparation.py','lab-guest-bootstrap.py']
            paths=[root+'/tools/tool-fleet/src/'+name for name in base]+[root+'/infra/local/qemu-lab.lock.json','/usr/bin/python3.12','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']
            paths += [state+'/tools-root/usr/bin/'+name for name in (('genisoimage','isoinfo') if prefix=='seed' else ('qemu-system-x86_64',))]
            if prefix=='guest':paths.append(state+'/tools-root/usr/share/seabios/bios-256k.bin')
            selected=dict(request,pins=[dict(path=path,sha256='a'*64,bytes=1,uid=os.geteuid(),mode=0o400) for path in paths])
            try:component.verify_inputs(selected)
            except component.raw.PreparationRefusal as failure:assert str(failure)==prefix+'-source-pins-missing',str(failure)
            else:raise AssertionError('continued source roles absent')
    elif case=='capacity':
        lineage=s.load_lineage()
        snapshot=dict(device='1',inode='2',owner=os.geteuid(),mode='0600',links=1,logicalBytes='8589934592',allocatedBytes='8589934592',mtimeNs='1793840000000000001',ctimeNs='1793840000000000002')
        repair=lineage.repair
        debt=repair.make_reservation('c'*32,'b'*64,'d'*64,snapshot,0)
        directory=state+'/raw-repair-'+'c'*32;os.mkdir(directory,0o700)
        repair.raw.persist(directory,'request-binding.json',dict(requestDigest='b'*64,sourceDigest='d'*64,initial={},unitBefore={}))
        repair.raw.persist(directory,'reservation.json',debt)
        repair.raw.persist(directory,'failure.json',dict(failed=True))
        for component in (s,g):
            for initial,after in ((True,False),(False,True),(False,False)):
                component.raw.read_text=lambda *args:'MemAvailable: 4063232 kB\n'
                component.raw.allocated_bytes=lambda *args:8*1024**3
                floor=(50 if initial else 40)*1024**3
                free=floor+128*1024**3+33554432
                native_vfs=os.statvfs
                os.statvfs=lambda *args:types.SimpleNamespace(f_bavail=free,f_frsize=1)
                try:
                    component.observe_capacity(state,initial=initial,after_allocation=after,request=request)
                    free-=1;refused(lambda:component.observe_capacity(state,initial=initial,after_allocation=after,request=request))
                    free+=1
                    def callback(selected,path,digest,adapter):
                        refused(lambda:adapter.observe_capacity(state,initial=initial,after_allocation=after))
                    coordinate=component.raw.coordinate_attempt;component.raw.coordinate_attempt=callback
                    free-=1
                    try:component.coordinator(request,'/controlled/request','a'*64)
                    finally:component.raw.coordinate_attempt=coordinate
                    free+=1
                    target=pathlib.Path(directory)/'reservation.json';payload=target.read_bytes();target.unlink()
                    refused(lambda:component.observe_capacity(state,initial=initial,after_allocation=after,request=request))
                    target.write_bytes(payload);target.chmod(0o600)
                finally:os.statvfs=native_vfs
    else:raise AssertionError(case)
print('continued '+case)
`;

for (const boundary of ['requests', 'capacity', 'roles']) {
  test(`continued lineage ${boundary} refuses unsafe production admission`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        controls,
        join(import.meta.dir, 'lab-seed-preparation.py'),
        boundary,
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`continued ${boundary}\n`);
  });
}

for (const fault of [
  'before-owner-float',
  'before-owner-bool',
  'before-links-bool',
  'before-links-float',
  'before-extra',
  'before-mtime-number',
  'before-mtime-precision',
  'typed-binding-extra',
  'typed-failure',
  'typed-post-boot',
  'seed-route',
  'runtime',
  'seed-runtime',
  'history-dependency',
  'receipt-path',
  'joined-history',
  'directory-change',
  'release-dependency',
  'creator-dependency',
  'original-pins',
  'original-history',
  'handoff',
  'typed-repeat',
  'guest-native-mixed',
  'guest-native-type',
  'guest-success',
  'guest-mixed',
  'guest-receipt-mixed',
  'guest-digest',
  'typed-fd',
  'typed-pid',
  'typed-owner',
  'typed-creator',
  'typed-allocation',
  'typed-allocation-extra',
  'typed-ready',
  'typed-ready-schema',
  'typed-terminal',
  'typed-rawBytes',
  'success',
  'provenance-absent',
  'provenance-unreadable',
  'provenance-malformed',
  'provenance-changed',
  'provenance-extra',
  'provenance-bool',
  'provenance-source',
  'provenance-request',
  'provenance-receipt',
  'envelope-absent',
  'envelope-null',
  'envelope-failed',
  'envelope-authority',
  'envelope-schema',
  'envelope-nonce',
  'envelope-receipt',
  'envelope-extra',
  'snapshot',
  'numeric',
  'map',
  'identity',
  'metadata',
  'record-worker-counter',
  'record-release',
  'record-repair',
  'record-reservation',
  'record-request-binding',
  'record-receipt',
  'record-worker-ready',
  'record-failure',
]) {
  test(`continued lineage ${fault} protects the original target before handoff`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        join(import.meta.dir, 'lab-repair-lineage.test-fixture.py'),
        join(import.meta.dir, 'lab-seed-preparation.py'),
        fault,
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`continued lineage ${fault}\n`);
  });
}
