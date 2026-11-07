import { join } from 'node:path';

import { expect, test } from 'bun:test';

// Logical 16KiB disposable files; native profile/unit/cgroup replies are controlled seams.
const releaseControls = String.raw`
import importlib.util,hashlib,json,os,pathlib,stat,subprocess,sys,tempfile,time,types
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
fault=sys.argv[2]
scenario=fault
fault='success' if fault.startswith('ledger-') or fault in ('order','prior-failure') else fault
child_source=r'''
import importlib.util,hashlib,json,os,pathlib,sys,time
spec=importlib.util.spec_from_file_location('repair',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
state,nonce,fault=sys.argv[2:];p.raw.RAW_BYTES=16384
path=state+'/raw-'+'d'*32+'/disk.raw';directory=state+'/raw-repair-'+nonce
raw_fd=p.raw.open_private(path);creator=p.raw.open_private(directory,directory=True);original=p.raw.open_private(pathlib.Path(path).parent,directory=True);staging=p.raw.acquire_staging(state)
snapshot=p.snapshot_file(os.fstat(raw_fd));snapshot['logicalBytes']='8589934592'
reservation=p.make_reservation(nonce,'b'*64,'c'*64,snapshot,0)
binding=dict(pid=os.getpid(),start=p.raw.process_start(os.getpid()),unit='puni-raw-repair-'+nonce+'.service',invocation='e'*32,cgroup='/fixture',nonce=nonce,creator=p.raw.identity(os.fstat(creator)),originalCreator=p.raw.identity(os.fstat(original)),originalFd=original,raw=p.raw.identity(os.fstat(raw_fd)),rawFd=raw_fd,rawPath=path,staging=p.raw.identity(os.fstat(staging)),stagingFd=staging,python=p.raw.stable_identity(os.stat('/proc/self/exe')),inputs={},evidence={},source='c'*64,request='b'*64,reservationDigest=p.raw.digest_json(reservation))
if fault=='live-thread':
    import threading
    threading.Thread(target=lambda:time.sleep(10),daemon=True).start()
if fault=='source-change':
    current_source=pathlib.Path(state.split('/.puni/')[0])/'tools/tool-fleet/src/current.py';binding['inputs']={str(current_source):p.raw.stable_identity(current_source.stat())}
ready=time.time_ns();p.raw.send_frame(1,dict(phase='ready',binding=binding,observedNs=ready,reservation=reservation,snapshot=snapshot,mapDigest='f'*64));p.raw.receive_ack(0,binding,'b'*64)
assert json.load(open(directory+'/reservation.json'))==reservation
# Proof: success/order formerly refused the instrumentation file in the closed repair namespace.
(pathlib.Path(state).parents[2]/'ack-before-mutation').write_text('metadata-only fixture')
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
    current_source=pathlib.Path(root)/'tools/tool-fleet/src/current.py';current_source.parent.mkdir(parents=True);current_source.write_bytes(b'original source');current_source.chmod(0o644)
    if fault=='source-change':request['pins'].append(dict(path=str(current_source),sha256=hashlib.sha256(current_source.read_bytes()).hexdigest(),bytes=current_source.stat().st_size,uid=os.geteuid(),mode=0o644))
    p.verify_inputs=lambda selected:'c'*64;p.source_identities=lambda selected:{str(current_source):p.raw.stable_identity(current_source.stat())} if fault=='source-change' else {};p.evidence_paths=lambda selected:[]
    p.verify_history=lambda selected:dict(path=path,binding=dict(raw=p.raw.identity(os.lstat(path)),creator=p.raw.identity(os.lstat(original))))
    p.open_original=lambda path,expected:p.raw.open_private(path)
    profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,witnessRegular=True,rawRegular=True)
    def observed_profile(*arguments):
        changed=fault=='profile-change' and os.path.exists(state+'/raw-repair-'+'a'*32+'/worker-counter.json') or fault=='final-profile' and bool(stopped)
        return dict(profile,dataMode='journal') if changed else profile
    p.observe_profile=observed_profile
    def facts(state):
        if fault=='cancel' and os.path.exists(state+'/raw-repair-'+'a'*32+'/worker-ready.json'):raise p.raw.PreparationRefusal('raw-cancelled')
        return dict(availableMemoryBytes=3623878656,freeBytes=200*1024**3,retainedInodeBytes=16384,otherFutureReservations=0)
    p.observe_facts=facts
    allocation=dict(identity={key:snapshot[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},expectedBytes=16384,coverageBytes=16384,allocatedBytes=int(snapshot['allocatedBytes']),mapDigest='f'*64)
    p.raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=lambda *arguments:dict(observation=dict(missingDataBytes=0,mapDigest='f'*64),missingRanges=[]),inspect_file=lambda *arguments,**keywords:allocation)
    native_stat=os.stat;p.os.stat=lambda path,*arguments,**keywords:native_stat('/proc/self/exe' if path=='/usr/bin/python3.12' else path,*arguments,**keywords)
    p.raw.observe_active=lambda unit,pid:dict(pid=pid,start=p.raw.process_start(pid),unit=unit,invocation='e'*32,cgroup='/foreign' if fault=='native-change' and os.path.exists(state+'/raw-repair-'+'a'*32+'/worker-counter.json') else '/fixture',caps=p.raw.CAPS)
    terminal=dict(LoadState='not-found',MainPID='0',ActiveState='inactive',SubState='dead',Result='success',ExecMainStatus='0',InvocationID='',ControlGroup='')
    calls=0
    def observe_unit(unit):
        global calls;calls+=1
        return dict(terminal,LoadState='loaded',InvocationID='f'*32) if fault=='terminal' and calls>1 else terminal
    if fault=='foreign-fs':
        original_profile=p.RepairCoordinator.check_release_live
        def foreign_profile(self):
            if self.release_profile is not None:self.release_profile=dict(profile,rawDevice='0')
            return original_profile(self)
        p.RepairCoordinator.check_release_live=foreign_profile
    p.RepairCoordinator.observe_unit=staticmethod(observe_unit)
    p.RepairCoordinator.observe_active=staticmethod(p.raw.observe_active)
    native_text=p.raw.read_text
    def read_text(path,limit=65536):
        if fault=='live-child' and path.endswith('/children'):return '999999'
        if path in ('/sys/fs/cgroup/fixture/cgroup.procs','/sys/fs/cgroup/fixture/cgroup.threads'):
            return str(child.pid)+'\n'+('999999\n' if fault=='live-group' else '')
        return native_text(path,limit)
    p.raw.read_text=read_text
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
    trace=[];active=None;native_sync=os.fsync;native_open=os.open
    def watched_sync(descriptor):
        kind='dir' if stat.S_ISDIR(os.fstat(descriptor).st_mode) else 'file'
        trace.append((active,kind))
        if fault=='receipt-crash' and active=='receipt.json' and kind=='dir':raise OSError('injected receipt directory sync')
        if fault=='certificate-crash' and active=='release.json' and kind=='file':raise OSError('injected certificate file sync')
        if fault=='raw-drain' and active=='worker-ready.json' and kind=='file':raise OSError('injected original raw drain')
        if active is not None and fault==active+'-dir' and kind=='dir':raise OSError('injected directory sync')
        return native_sync(descriptor)
    def watched_open(path,flags,*arguments,**keywords):
        if path in ('worker-counter.json','repair.json','release.json'):
            trace.append((path,'create'))
            assert flags & os.O_EXCL,'publication reused a record'
            if path=='repair.json':assert ('worker-counter.json','dir') in trace,'artifact created before A'
            if path=='release.json':
                assert ('repair.json','dir') in trace,'certificate before C'
                assert stopped==[child.pid] and child.poll()==0,'certificate before ACK/cleanup'
        return native_open(path,flags,*arguments,**keywords)
    os.fsync=watched_sync;os.open=watched_open
    persist=p.raw.persist
    def publish(directory,name,record,**keywords):
        global active
        active=name
        if fault=='receipt-crash' and name=='failure.json':raise OSError('injected failure create before publication')
        if fault=='precreated' and name=='repair.json':
            descriptor=native_open(directory+'/'+name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(descriptor)
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
    notified=p.RepairCoordinator.persisted
    def notification(self,name,record,directory,descriptor):
        if fault=='counter-notification' and name=='worker-counter.json':return
        if fault=='artifact-notification' and name=='repair.json':return
        if fault=='source-change' and name=='worker-counter.json':current_source.write_bytes(b'changed source!')
        if fault=='substituted-directory' and name=='worker-counter.json':
            foreign=pathlib.Path(state)/'foreign';foreign.mkdir(mode=0o700);foreign_fd=p.raw.open_private(foreign,directory=True)
            try:return notified(self,name,record,str(foreign),foreign_fd)
            finally:os.close(foreign_fd)
        return notified(self,name,record,directory,descriptor)
    p.RepairCoordinator.persisted=notification
    if fault=='skip-finalize':p.RepairCoordinator.finalize_artifact=lambda *arguments:None
    directory=state+'/raw-repair-'+request['nonce']
    try:
        envelope=p.coordinator(request,'/private/request','b'*64)
        assert fault in ('success','order'),'unsafe durable receipt accepted '+fault
        assert envelope['scope']=='raw-repair-preparation' and envelope['guestAuthority'] is False
        receipt=json.load(open(directory+'/receipt.json'))
        assert receipt['grossDebtRetained'] is False,'completed current reservation remains charged'
        assert receipt['releaseDigest']==p.raw.digest_json(json.load(open(directory+'/release.json')))
        assert p.read_reservations(state)==[],'valid completed release did not clear own debt'
        assert stopped==[child.pid]
        assert trace.index(('worker-counter.json','dir')) < trace.index(('repair.json','create')) < trace.index(('repair.json','dir')) < trace.index(('release.json','create'))
        def replace_record(name,record):
            target=pathlib.Path(directory)/name;target.write_bytes(p.raw.encode_json(record));os.chmod(target,0o600)
        def refused_ledger(category=None):
            try:p.read_reservations(state)
            except p.raw.PreparationRefusal as failure:
                if category is not None:assert str(failure)==category,'wrong owning boundary: '+str(failure)
                return
            except (OSError,ValueError,KeyError,TypeError):
                assert category is None,'delegated comparison before owning boundary'
                return
            raise AssertionError('unsafe credit for '+scenario)
        if scenario.startswith('ledger-fix-ready-') or scenario.startswith('ledger-fix-receipt-'):
            ready_boundary=scenario.startswith('ledger-fix-ready-')
            name='worker-ready.json' if ready_boundary else 'receipt.json'
            field='observedNs' if ready_boundary else 'finishedNs'
            selected=json.load(open(directory+'/'+name))
            case=scenario.rsplit('-',1)[1]
            selected[field]={'bool':False,'float':1.0 if ready_boundary else float(receipt['finishedNs']),'zero':0,'negative':-1,'overflow':2**64}[case]
            replace_record(name,selected)
            refused_ledger('repair-release-ready-time' if ready_boundary else 'repair-release-receipt-time')
        elif scenario.startswith('ledger-fix-capacity-'):
            original=json.loads(json.dumps(receipt['finalCapacity']))
            case=scenario.removeprefix('ledger-fix-capacity-')
            if case=='shape':
                candidates=[None,dict(original,foreign=1),{field:value for field,value in original.items() if field!='observedNs'}]
            elif case=='quantities':
                candidates=[dict(original,**{field:value}) for field in ('availableMemoryBytes','freeBytes','retainedInodeBytes','otherFutureReservations') for value in (True,1.0,-1,2**64)]
            elif case=='observed':
                candidates=[dict(original,observedNs=value) for value in (False,1,'0','-1','01','1e3',str(2**64))]
            else:
                assert case=='retained'
                candidates=[dict(original,grossDebtRetained=value) for value in (False,1,'true',None)]
            for candidate in candidates:
                receipt['finalCapacity']=candidate;replace_record('receipt.json',receipt);refused_ledger('repair-release-capacity-invalid')
        elif scenario=='ledger-fix-trust':
            for candidate in (None,False,1,[],{},'independently-selected-content-pins'):
                receipt['trust']=candidate;replace_record('receipt.json',receipt);refused_ledger('repair-release-trust-invalid')
        elif scenario=='ledger-absent':
            os.unlink(directory+'/release.json');del receipt['releaseDigest'];receipt['grossDebtRetained']=True;replace_record('receipt.json',receipt);assert len(p.read_reservations(state))==1
        elif scenario=='ledger-unreadable':
            os.chmod(directory+'/release.json',0);refused_ledger()
        elif scenario=='ledger-partial':
            pathlib.Path(directory+'/release.json').write_bytes(b'{');refused_ledger()
        elif scenario=='ledger-receipt-absent':
            os.unlink(directory+'/receipt.json');refused_ledger()
        elif scenario in ('ledger-artifact-schema','ledger-receipt-schema','ledger-artifact-history'):
            certificate=json.load(open(directory+'/release.json'))
            if scenario=='ledger-receipt-schema':receipt['schemaVersion']=True
            else:
                artifact=json.load(open(directory+'/repair.json'))
                artifact['schemaVersion' if scenario=='ledger-artifact-schema' else 'originalReceiptDigest']=True
                replace_record('repair.json',artifact)
                certificate['repairDigest']=p.raw.digest_json(artifact);receipt['repairDigest']=p.raw.digest_json(artifact)
                replace_record('release.json',certificate);receipt['releaseDigest']=p.raw.digest_json(certificate)
            replace_record('receipt.json',receipt);refused_ledger()
        elif scenario=='ledger-replay':
            other=pathlib.Path(state)/('raw-repair-'+'f'*32);other.mkdir(mode=0o700)
            for name in ('release.json','receipt.json','worker-counter.json','repair.json','worker-ready.json','request-binding.json'):
                p.raw.persist(other,name,json.load(open(directory+'/'+name)))
            p.raw.persist(other,'reservation.json',p.make_reservation('f'*32,'b'*64,'c'*64,snapshot,0));refused_ledger()
        elif scenario=='ledger-failure':
            p.raw.persist(directory,'failure.json',dict(accepted=False));refused_ledger()
        elif scenario=='ledger-extra':
            certificate=json.load(open(directory+'/release.json'));certificate['foreign']=True
            replace_record('release.json',certificate);receipt['releaseDigest']=p.raw.digest_json(certificate);replace_record('receipt.json',receipt);refused_ledger()
        elif scenario.startswith('ledger-'):
            name,field={
                'ledger-source':('release.json','sourceDigest'),
                'ledger-directory':('release.json','directory'),
                'ledger-reservation':('release.json','reservationDigest'),
                'ledger-counter':('worker-counter.json','finishedNs'),
                'ledger-artifact':('repair.json','counterDigest'),
                'ledger-binding':('receipt.json','binding'),
                'ledger-receipt':('receipt.json','releaseDigest'),
                'ledger-premature':('release.json','issuedNs'),
                'ledger-profile':('release.json','profile'),
                'ledger-cleanup':('release.json','cleanup'),
                'ledger-terminal':('receipt.json','terminal'),
            }[scenario]
            record=json.load(open(directory+'/'+name))
            record[field]=record[field]+1 if scenario=='ledger-counter' else None
            if scenario=='ledger-terminal':
                record[field]=dict(receipt['terminal'],ActiveState='active')
                certificate=json.load(open(directory+'/release.json'));certificate['terminal']=record[field];replace_record('release.json',certificate)
                record['releaseDigest']=p.raw.digest_json(certificate)
            replace_record(name,record)
            if name=='release.json':
                receipt['releaseDigest']=p.raw.digest_json(record);replace_record('receipt.json',receipt)
            refused_ledger()
        elif scenario=='prior-failure':
            other=pathlib.Path(state)/('raw-repair-'+'f'*32);other.mkdir(mode=0o700)
            record=p.make_reservation('f'*32,'b'*64,'c'*64,snapshot,0)
            p.raw.persist(other,'request-binding.json',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={}))
            p.raw.persist(other,'reservation.json',record)
            assert p.read_reservations(state)==[record],'prior failed debt disappeared'
    except (p.raw.PreparationRefusal,OSError) as failure:
        expected={'skip-finalize':'repair-release-absent','live-group':'repair-release-writer-live','live-child':'repair-release-writer-live','live-thread':'repair-release-writer-live','native-change':'repair-release-native-changed','foreign-fs':'repair-release-profile-changed','source-change':'repair-source-changed','counter-notification':'repair-release-publication-invalid','artifact-notification':'repair-release-publication-invalid','substituted-directory':'repair-release-publication-invalid','profile-change':'repair-profile-invalid','final-profile':'repair-profile-invalid'}
        if fault in expected:assert str(failure)==expected[fault],str(failure)
        assert fault not in ('success','order')
        if fault=='receipt-crash':
            assert os.path.exists(directory+'/receipt.json') and not os.path.exists(directory+'/failure.json')
            assert p.read_reservations(state)==[],'canonical receipt failed to witness completed certificate publication'
        else:
            assert not os.path.exists(directory+'/receipt.json')
        if fault=='certificate-crash':
            assert p.read_record(pathlib.Path(directory)/'release.json')['nonce']=='a'*32
            try:p.read_reservations(state)
            except p.raw.PreparationRefusal as failure:assert str(failure)=='raw-state-absent'
            else:raise AssertionError('certificate credited without accepted receipt')
        assert os.path.exists(directory+'/reservation.json')
        if fault=='reservation-sync':assert not os.path.exists(root+'/ack-before-mutation'),'mutation sentinel before reservation fsync'
    assert child.poll() is not None,'original service client orphaned'
print('release '+scenario)
`;

for (const fault of [
  'order',
  'ledger-fix-ready-bool',
  'ledger-fix-ready-float',
  'ledger-fix-ready-zero',
  'ledger-fix-ready-negative',
  'ledger-fix-ready-overflow',
  'ledger-fix-receipt-bool',
  'ledger-fix-receipt-float',
  'ledger-fix-receipt-zero',
  'ledger-fix-receipt-negative',
  'ledger-fix-receipt-overflow',
  'ledger-fix-capacity-shape',
  'ledger-fix-capacity-quantities',
  'ledger-fix-capacity-observed',
  'ledger-fix-capacity-retained',
  'ledger-fix-trust',

  'skip-finalize',
  'receipt-crash',
  'certificate-crash',
  'worker-counter.json-dir',
  'repair.json-dir',
  'precreated',
  'counter-notification',
  'artifact-notification',
  'substituted-directory',
  'source-change',
  'native-change',
  'foreign-fs',
  'live-group',
  'live-child',
  'live-thread',
  'raw-drain',
  'profile-change',
  'final-profile',
  'client',
  'terminal',
  'populated',
  'cleanup',
  'final',
  'ledger-absent',
  'ledger-unreadable',
  'ledger-partial',
  'ledger-receipt-absent',
  'ledger-source',
  'ledger-artifact-schema',
  'ledger-receipt-schema',
  'ledger-artifact-history',
  'ledger-replay',
  'ledger-failure',
  'ledger-extra',
  'ledger-directory',
  'ledger-reservation',
  'ledger-counter',
  'ledger-artifact',
  'ledger-binding',
  'ledger-receipt',
  'ledger-premature',
  'ledger-profile',
  'ledger-cleanup',
  'ledger-terminal',
  'prior-failure',
]) {
  test(`repair release ${fault} preserves durable credit boundaries`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        releaseControls,
        join(import.meta.dir, 'lab-raw-repair.py'),
        fault,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`release ${fault}\n`);
  });
}
