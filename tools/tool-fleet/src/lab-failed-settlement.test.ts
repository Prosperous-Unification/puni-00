import { expect, test } from 'bun:test';

const accounting = String.raw`
import importlib.util, json, os, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location('repair', pathlib.Path(sys.argv[1])/'lab-raw-repair.py')
repair = importlib.util.module_from_spec(spec); spec.loader.exec_module(repair)
scenario = sys.argv[2]
with tempfile.TemporaryDirectory(prefix='puni-settlement113-') as scratch:
    state = pathlib.Path(scratch)/'state'; state.mkdir(mode=0o700)
    directory = state/('raw-repair-'+'a'*32); directory.mkdir(mode=0o700)
    snapshot = dict(device='1',inode='2',owner=os.geteuid(),mode='0600',links=1,
        logicalBytes='8589934592',allocatedBytes='8435806208',mtimeNs='1',ctimeNs='2')
    reservation=repair.make_reservation('a'*32,'b'*64,'c'*64,snapshot,154128384)
    def put(name, record): repair.raw.persist(directory,name,record)
    put('reservation.json',reservation)
    put('request-binding.json',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={}))
    put('worker-ready.json',dict(phase='ready',binding=dict(nonce='a'*32,request='b'*64,source='c'*64)))
    put('failure.json',dict(schemaVersion=1,scope='raw-repair-preparation',accepted=False))
    if scenario=='unknown': put('unknown.json',dict(unknown=True))
    if scenario=='partial':
        descriptor=os.open(directory/'settlement-request.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        os.write(descriptor,b'{');os.close(descriptor)
    if scenario in ('unknown','partial'):
        try: repair.read_repair_accounting(str(state))
        except (repair.raw.PreparationRefusal, ValueError): print('refused'); sys.exit(0)
        raise AssertionError('unsafe namespace admitted')
    ledger=repair.read_repair_accounting(str(state))
    assert ledger['unresolvedGrossBytes']=='141754548224',ledger
    assert ledger['settlementDebtBytes']=='33554432',ledger
    assert ledger['reservations']==[reservation] and ledger['settled']==[]
    assert (directory/'failure.json').exists()
    if scenario=='legacy':
        try: repair.read_reservations(str(state))
        except repair.raw.PreparationRefusal as failure:
            assert str(failure)=='repair-accounting-required'
        else: raise AssertionError('legacy projection hid K')
    print('charged')
`;

for (const scenario of ['original-only', 'unknown', 'partial', 'legacy']) {
  test(`failed settlement accounting ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', accounting, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      scenario === 'unknown' || scenario === 'partial' ? 'refused' : 'charged',
    );
  });
}

const integration = String.raw`
import ast, errno, hashlib, importlib.util, json, os, pathlib, select, shutil, signal, stat, subprocess, sys, tempfile, time, types
scenario = sys.argv[2]
omission = sys.argv[3] if len(sys.argv)>3 else 'none'
with tempfile.TemporaryDirectory(prefix='puni-settlement-chain113-') as scratch:
    root=pathlib.Path(scratch); helpers=root/'tools/tool-fleet/src';helpers.mkdir(parents=True)
    names=('lab-raw-repair.py','lab-raw-preparation.py','lab-repair-worker.py',
        'lab-seed-preparation.py','lab-guest-preparation.py','lab-raw-allocation.py',
        'lab-raw-repair.ts','lab-raw-repair-cli.ts')
    for name in names:shutil.copyfile(pathlib.Path(sys.argv[1])/name,helpers/name);(helpers/name).chmod(0o600)
    if omission!='none':
        changed=[]
        class Omit(ast.NodeTransformer):
            def visit_Assign(self,node):
                if omission=='parent-lock-lifetime' and any(isinstance(target,ast.Name) and target.id=='certificate' for target in node.targets) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='publish_record':
                    changed.append(omission);return [ast.parse('channel.close()').body[0],self.generic_visit(node)]
                return self.generic_visit(node)
            def visit_Expr(self,node):
                if omission=='qualify-dependency' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='qualify':
                    changed.append(omission);return ast.Pass()
                if omission=='consume-dependency' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='consume':
                    changed.append(omission);return ast.Pass()
                return self.generic_visit(node)
            def visit_Call(self,node):
                if isinstance(node.func,ast.Name) and node.func.id=='require' and len(node.args)==2 and isinstance(node.args[1],ast.Constant) and node.args[1].value==omission:
                    node.args[0]=ast.Subscript(value=ast.Tuple(elts=[node.args[0],ast.Constant(True)],ctx=ast.Load()),slice=ast.Constant(1),ctx=ast.Load());changed.append(omission)
                return self.generic_visit(node)
        for name in names[:6]:
            path=helpers/name;tree=Omit().visit(ast.parse(path.read_text()));path.write_text(ast.unparse(ast.fix_missing_locations(tree)))
        assert changed,('missing production guard',omission)
    spec=importlib.util.spec_from_file_location('repair',helpers/names[0]);repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
    writer=repair.writer;raw=repair.raw
    state=root/'.puni/fleet-labs/observability-baseline';state.mkdir(parents=True,mode=0o700)
    old=state/('raw-repair-'+'a'*32);old.mkdir(mode=0o700)
    raw_directory=state/('raw-'+'0'*32);raw_directory.mkdir(mode=0o700)
    raw_path=raw_directory/'disk.raw';raw_path.write_bytes(b'x'*4096);raw_path.chmod(0o600)
    def put(path,record):
        path.write_bytes(raw.encode_json(record));path.chmod(0o600)
    def pin(path):
        observation=path.stat();return dict(path=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            bytes=observation.st_size,uid=observation.st_uid,mode=stat.S_IMODE(observation.st_mode))
    def pins(paths):return [pin(path) for path in paths]
    # Only native-size metadata is modeled: real tiny inodes, open flags, syscalls, IPC, records and readers remain production.
    raw.RAW_BYTES=4096
    native_snapshot=repair.snapshot_file
    def snapshot(observation):return dict(native_snapshot(observation),logicalBytes='8589934592')
    repair.snapshot_file=snapshot
    expected=snapshot(raw_path.stat())
    image=state/'image';image.write_bytes(b'i');image.chmod(0o600)
    witness=state/'witness';witness.write_bytes(b'w'*79);witness.chmod(0o600)
    historic_source=dict(path=str(helpers/names[0]),sha256='c'*64,bytes=123,uid=os.geteuid(),mode=0o600)
    first=state/'raw-request.json';put(first,dict(nonce='0'*32,image=str(image),pins=[historic_source]))
    first_digest=pin(first)['sha256'];first_source=raw.digest_json({historic_source['path']:historic_source['sha256']})
    original_binding=dict(nonce='0'*32,request=first_digest,source=first_source,raw=raw.identity(raw_path.stat()),
        creator=raw.identity(raw_directory.stat()))
    allocation=raw_directory/'allocation.json';put(allocation,{})
    original_receipt=raw_directory/'receipt.json';put(original_receipt,dict(schemaVersion=1,scope='raw-preparation',accepted=True,
        guestAuthority=False,fullRehearsalAuthority=False,rawBytes=4096,binding=original_binding,
        requestDigest=first_digest,sourceDigest=first_source))
    provenance=state/'raw-provenance.json';put(provenance,dict(schemaVersion=1,sourceRevision='c'*40,
        sourcePins=[historic_source],requestDigest=first_digest,receiptDigest=pin(original_receipt)['sha256']))
    unused=state/'historical-guest.json';put(unused,{})
    historical_paths=[image,witness,first,original_receipt,allocation,provenance,unused]
    original=dict(schemaVersion=1,root=str(root),state=str(state),nonce='a'*32,pins=[historic_source,*pins(historical_paths)],
        image=str(image),rawRequest=str(first),rawReceipt=str(original_receipt),rawProvenance=str(provenance),
        priorGuestRequest=str(unused),priorGuestFailure=str(unused),postBootEvidence=str(unused),witness=str(witness),expectedRaw=expected)
    original_path=state/'original-repair.json';put(original_path,original)
    old_source=raw.digest_json({entry['path']:entry['sha256'] for entry in original['pins']})
    reservation=repair.make_reservation('a'*32,pin(original_path)['sha256'],old_source,expected,0)
    old_process=dict(pid='99999999',start='1',uid=os.geteuid(),gid=os.getegid(),bootId=raw.read_text('/proc/sys/kernel/random/boot_id').strip())
    old_unit='puni-raw-repair-'+'a'*32+'.service';old_invocation='d'*32;old_group='/fixture/'+old_unit
    binding=dict(pid=99999999,start='1',unit=old_unit,invocation=old_invocation,cgroup=old_group,nonce='a'*32,
        creator=raw.identity(old.stat()),originalCreator=raw.identity(raw_directory.stat()),originalFd=5,
        raw=raw.identity(raw_path.stat()),rawFd=4,rawPath=str(raw_path),staging=raw.identity(state.stat()),stagingFd=3,
        python=[1]*8,inputs={},evidence={},source=old_source,request=pin(original_path)['sha256'],reservationDigest=raw.digest_json(reservation))
    put(old/'request-binding.json',dict(requestDigest=binding['request'],sourceDigest=old_source,initial={},unitBefore={}))
    put(old/'reservation.json',reservation)
    put(old/'worker-ready.json',dict(phase='ready',binding=binding,observedNs=1,reservation=reservation,snapshot=expected,mapDigest='e'*64))
    put(old/'failure.json',dict(accepted=False,cleanup='unknown',category='raw-child-failed',finishedNs=2,guestAuthority=False,fullRehearsalAuthority=False))
    def terminal(unit,invocation,group,process,failed=False,boot_scope='process-birth'):
        return dict(unit=unit,invocation=invocation,cgroup=group,process=process,bootScope=boot_scope,
            properties=dict(LoadState='loaded',ActiveState='inactive',SubState='dead',MainPID='0',InvocationID=invocation,
                ControlGroup='',Result='exit-code' if failed else 'success',ExecMainStatus='1' if failed else '0'),
            processState=dict(state='absent-ENOENT',observedStart=None),group=dict(state='absent-ENOENT',events=None,procs='',threads=''))
    old_terminal=terminal(old_unit,old_invocation,old_group,old_process,True,'observation')
    capture=state/'capture.json';put(capture,dict(schemaVersion=1,kind='failed-repair-terminal-capture',
        originalDirectory=str(old),originalDirectoryIdentity=writer.SettlementContext.snapshot_directory(old.stat()),
        rawPath=str(raw_path),originalRawIdentity={key:expected[key] for key in ('device','inode','owner','mode','links','logicalBytes')},
        requestDigest=binding['request'],sourceDigest=old_source,reservationDigest=raw.digest_json(reservation),
        readyDigest=pin(old/'worker-ready.json')['sha256'],failureDigest=pin(old/'failure.json')['sha256'],terminal=old_terminal))
    qualification=state/'qualification.json';put(qualification,dict(provider='disposable-controlled-external-boundaries'))
    native_paths=['/usr/bin/python3.12','/usr/bin/systemd-run','/usr/bin/systemctl','/usr/bin/dpkg-query',
        '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2','/usr/share/doc/linux-image-7.0.11-76070011-generic/changelog.Debian.gz',
        '/usr/lib/x86_64-linux-gnu/libfixture.so.1']
    metadata=[*historical_paths,original_path,capture,qualification,*[old/name for name in ('request-binding.json','reservation.json','worker-ready.json','failure.json')]]
    selected=pins([helpers/name for name in names]+metadata)
    selected += [dict(path=path,sha256=('5b40c328ae4ed4a56d36d73f37f5335136439db093be8033dc4c413f663c7569' if path.endswith('.gz') else 'f'*64),
        bytes=1,uid=0,mode=0o644) for path in native_paths]
    request=dict(schemaVersion=2,operation='settle-failed-repair',root=str(root),state=str(state),nonce='b'*32,pins=selected,
        originalRepairRequest=str(original_path),originalDirectory=str(old),originalTerminalCapture=str(capture),
        qualification=str(qualification),expectedRaw=expected,witness=str(witness))
    # Installed native tool metadata is the controlled provider. Current repository/history pins still use real production hashing.
    native_verify_pin=raw.verify_pin
    def verify_pin(entry):
        if entry['path'] in native_paths:return
        native_verify_pin(entry)
    raw.verify_pin=verify_pin
    native_run_bounded=raw.run_bounded
    def run_bounded(arguments,*args,**kwargs):
        if arguments[0]==native_paths[4]:return b'libfixture => /usr/lib/x86_64-linux-gnu/libfixture.so.1 (0x1)\n'
        if arguments[:3]==['/usr/bin/systemctl','--user','stop']:
            assert arguments==['/usr/bin/systemctl','--user','stop',new_unit],arguments
            if latest_child.poll() is None:latest_child.kill();latest_child.wait(5)
            return b''
        if arguments[0]=='/usr/bin/dpkg-query':return ('linux 7.0.11-76070011.202606011647~1784215097~24.04~4974880\n'*2).encode()
        return native_run_bounded(arguments,*args,**kwargs)
    raw.run_bounded=run_bounded
    native_realpath=os.path.realpath
    os.path.realpath=lambda path,*args,**kwargs:'/usr/bin/python3.12' if path=='/usr/bin/python3' else native_realpath(path,*args,**kwargs)
    sys.version_info=(3,12)
    native_uname=os.uname
    os.uname=lambda:os.uname_result(('Linux','fixture','7.0.11-76070011-generic','fixture4974880','x86_64'))
    native_read_text=raw.read_text
    counters={'memory.current':'4096','memory.peak':'8192','memory.events':'oom 0\noom_kill 0',
        'cpu.stat':'usage_usec 1\nuser_usec 1\nsystem_usec 0','pids.current':'1','pids.events':'max 0'}
    worker_pid=None;worker_start=None;new_unit='puni-failed-settlement-'+'b'*32+'.service';new_group='/fixture/'+new_unit
    def read_text(path,*args):
        if path=='/proc/version':return 'fixture4974880'
        if path=='/sys/kernel/security/lsm':return 'unknown' if scenario=='foreign-lsm' else 'lockdown,capability,landlock,yama,apparmor,ima,evm'
        if path=='/proc/cmdline':return 'ima_appraise=fix' if scenario=='ima-fix' else 'fixture'
        if path.startswith('/sys/fs/cgroup'+new_group+'/'):
            name=path.rsplit('/',1)[-1]
            if name in ('cgroup.procs','cgroup.threads'):return str(worker_pid)
            if name=='cgroup.events':return 'populated 0\nfrozen 0\n'
            if name in counters:return counters[name]
        return native_read_text(path,*args)
    raw.read_text=read_text
    raw.read_caps=lambda group:dict(raw.CAPS)
    raw.process_cgroup=lambda pid:new_group
    def observe_unit(unit):
        if unit==old_unit:return old_terminal['properties']
        alive=worker_pid is not None and pathlib.Path('/proc/'+str(worker_pid)).exists()
        if alive:return dict(LoadState='loaded',ActiveState='active',SubState='running',MainPID=str(worker_pid),
            InvocationID='f'*32,ControlGroup=new_group,Result='success',ExecMainStatus='0')
        return terminal(new_unit,'f'*32,new_group,dict(old_process,pid=str(worker_pid)))['properties']
    raw.observe_unit=observe_unit;raw.observe_service_limits=lambda unit:None
    native_observe_terminal=writer.SettlementContext.observe_terminal
    def observe_terminal(self,selected):
        if selected['unit']==old_unit:return old_terminal
        return terminal(selected['unit'],selected['invocation'],selected['cgroup'],selected['process'],scenario=='new-terminal-failed')
    writer.SettlementContext.observe_terminal=observe_terminal
    def physical(self,raw_fd,directory_fd,initial=False):
        return dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,dioreadNolock=True,
            dataMode='ordered',kernelRelease='7.0.11-76070011-generic',kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',
            rawDevice=expected['device'],witnessDevice=expected['device'],witnessBytes=79,witnessAllocatedBytes=4096,
            witnessStable=True,witnessRegular=True,rawRegular=True)
    native_physical=writer.SettlementContext.check_physical_profile
    repair.observe_profile=lambda request,descriptor:physical(None,descriptor,None)
    def physical_boundary(self,raw_fd,directory_fd,initial=False):
        import fcntl
        native_fstat=os.fstat;native_ioctl=fcntl.ioctl;native_getxattr=os.getxattr
        def fstat(descriptor):
            observed=native_fstat(descriptor)
            if descriptor==directory_fd:
                quantities={name:getattr(observed,name) for name in dir(observed) if name.startswith('st_')}
                quantities.update(st_size=8192 if scenario=='parent-size' else 4096,st_blocks=8)
                if scenario=='parent-inode':quantities['st_ino']+=1
                return types.SimpleNamespace(**quantities)
            return observed
        def ioctl(descriptor,number,buffer,mutate=False):
            if descriptor==directory_fd and number==0x80086601:
                buffer[:]=((524288|4096) if scenario=='parent-flags' else 524288).to_bytes(8,'little');return 0
            return native_ioctl(descriptor,number,buffer,mutate)
        def getxattr(descriptor,name,*args,**kwargs):
            if descriptor==directory_fd and name=='system.posix_acl_default':
                if scenario=='acl-present':return b'present'
                if scenario=='acl-denied':raise OSError(errno.EACCES,'modeled denied ACL observation')
            return native_getxattr(descriptor,name,*args,**kwargs)
        os.fstat=fstat;fcntl.ioctl=ioctl;os.getxattr=getxattr
        try:return native_physical(self,raw_fd,directory_fd,initial)
        finally:os.fstat=native_fstat;fcntl.ioctl=native_ioctl;os.getxattr=native_getxattr
    writer.SettlementContext.check_physical_profile=physical_boundary
    repair.observe_facts=lambda state:dict(availableMemoryBytes=3623878656,freeBytes=500*1024**3,
        retainedInodeBytes=raw.allocated_bytes(state),otherFutureReservations=0)
    UnqualifiedPrerequisites=writer.SettlementPrerequisites
    class ExternalModel:
        def qualify(self,context):
            if scenario=='unqualified':return UnqualifiedPrerequisites.qualify(self,context)
        def consume(self,context):
            if scenario=='attempt-unqualified':return UnqualifiedPrerequisites.consume(self,context)
            descriptor=os.open(root/'external-consumption',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            try:os.write(descriptor,raw.encode_json(dict(directory=context.directory_identity,
                reservationDigest=raw.digest_json(context.reservation),requestDigest=context.request_digest,sourceDigest=context.source)));os.fsync(descriptor)
            finally:os.close(descriptor)
        def outside_bytes(self,context):
            return sum(path.stat().st_blocks*512 for path in root.rglob('*') if path!=state and state not in path.parents)
    writer.SettlementPrerequisites=ExternalModel
    class OwnedChild:
        def __init__(self,endpoint):
            nonlocal_placeholder=None
            global worker_pid
            out_read,out_write=os.pipe2(os.O_CLOEXEC);err_read,err_write=os.pipe2(os.O_CLOEXEC)
            pid=os.fork()
            if pid==0:
                try:
                    os.dup2(endpoint.fileno(),0);os.dup2(out_write,1);os.dup2(err_write,2)
                    for name in os.listdir('/proc/self/fd'):
                        descriptor=int(name)
                        if descriptor>2:
                            try:os.close(descriptor)
                            except OSError as failure:
                                if failure.errno!=errno.EBADF:raise
                    worker_pid=os.getpid();os.environ['INVOCATION_ID']='f'*32
                    if scenario=='live-thread':
                        import threading
                        threading.Thread(target=lambda:threading.Event().wait(30),daemon=True).start()
                    context=writer.SettlementContext(repair,request,raw.digest_json(request))
                    writer.run_settlement_worker(context)
                    os._exit(0)
                except BaseException:
                    import traceback;traceback.print_exc();os._exit(1)
            worker_pid=pid;self.pid=pid;self.returncode=None
            os.close(out_write);os.close(err_write)
            self.stdout=os.fdopen(out_read,'rb',buffering=0);self.stderr=os.fdopen(err_read,'rb',buffering=0)
        def poll(self):
            if self.returncode is None:
                ended,status=os.waitpid(self.pid,os.WNOHANG)
                if ended:self.returncode=os.waitstatus_to_exitcode(status)
            return self.returncode
        def wait(self,timeout):
            deadline=time.monotonic()+timeout
            while self.poll() is None:
                assert time.monotonic()<deadline,'owned child timeout'
                select.select([],[],[],.001)
            return self.returncode
        def kill(self):os.kill(self.pid,signal.SIGKILL)
    latest_child=None
    def launch(self,channel):
        global latest_child
        latest_child=OwnedChild(channel.recipient);return latest_child
    writer.SettlementContext.launch_worker=launch
    native_call=writer.native_call
    publishing=None
    lost_lifetime=False
    def syscall(number,*arguments):
        global creates
        descriptor=arguments[0].value if arguments and hasattr(arguments[0],'value') else arguments[0] if arguments else -1
        returned=native_call(number,*arguments)
        if number==257 and scenario=='first-create-loss' and arguments[1].value==b'settlement-request.json':
            creates+=1
            assert returned>=0
            os.posix_fallocate(returned,0,4096)
            os.close(returned)
            os.unlink('settlement-request.json',dir_fd=arguments[0].value)
            return -1
        if number==18 and scenario in ('partial-F','partial-refused-E') and publishing==('settlement-failure.json' if scenario=='partial-F' else 'settlement-execution.json'):return 0
        if number==74 and scenario=='original-sync' and os.readlink('/proc/self/fd/'+str(descriptor))==str(raw_path):return -1
        if number==74 and scenario in ('A-sync','C-sync') and publishing==('settlement-counter.json' if scenario=='A-sync' else 'settlement-barrier.json') and descriptor==context.directory_fd:return -1
        return returned
    writer.native_call=syscall
    native_publish=repair.publish_settlement_record
    class InjectedCrash(Exception):pass
    def publish(directory,descriptor,name,record):
        global publishing,lost_lifetime
        if scenario=='lock-lifetime':
            try:competing_fd=raw.acquire_staging(str(state))
            except raw.PreparationRefusal as failure:assert str(failure)=='raw-staging-occupied'
            else:os.close(competing_fd);lost_lifetime=True
        publishing=name
        native_publish(directory,descriptor,name,record)
        if scenario=='prefix:'+name:raise InjectedCrash(name)
    repair.publish_settlement_record=publish
    native_receive=writer.receive_settlement_control
    def receive(endpoint,context,phase,peer,expected):
        if phase=='consumed' and scenario in ('consumed-exited','consumed-reused','consumed-unreadable','consumed-unadopted'):
            latest_child.wait(5)
            if scenario=='consumed-unadopted':context.adopted=None
            native_start=raw.process_start
            def start(pid):
                if pid==int(peer['pid']):
                    if scenario=='consumed-reused':return peer['start']+'1'
                    if scenario=='consumed-unreadable':raise PermissionError(errno.EACCES,'modeled unreadable start')
                return native_start(pid)
            raw.process_start=start
            try:return native_receive(endpoint,context,phase,peer,expected)
            finally:raw.process_start=native_start
        return native_receive(endpoint,context,phase,peer,expected)
    writer.receive_settlement_control=receive
    native_send=writer.send_settlement_control
    def send(endpoint,context,phase,fields):
        if scenario=='ack-phase' and phase=='durable':phase='drain'
        return native_send(endpoint,context,phase,fields)
    writer.send_settlement_control=send
    if scenario=='counter-oom':counters['memory.events']='oom 1\noom_kill 0'
    native_frame=writer.write_settlement_frame
    def frame(descriptor,record):
        if scenario=='ready-stale' and record['phase']=='ready':record['observedNs']='1'
        native_frame(descriptor,record)
    writer.write_settlement_frame=frame
    creates=0
    context=writer.SettlementContext(repair,request,raw.digest_json(request))
    native_refresh=writer.SettlementContext.check_live
    fired=False
    def refresh(self,*arguments,**keywords):
        global fired
        target=scenario.split(':')[1] if scenario.startswith('failure-prefix:') else 'receipt' if scenario in ('partial-F','partial-refused-E') else None
        if self is context and self.phase==target and not fired:
            fired=True;raise raw.PreparationRefusal('modeled-protocol-failure')
        return native_refresh(self,*arguments,**keywords)
    writer.SettlementContext.check_live=refresh
    if scenario in ('unselected-debt','unselected-complete','nonce-reused'):
        other_nonce=('b' if scenario=='nonce-reused' else '9')*32
        other=state/('raw-repair-'+other_nonce);other.mkdir(mode=0o700)
        put(other/'reservation.json',dict(reservation,nonce=other_nonce))
        put(other/'request-binding.json',dict(requestDigest=binding['request'],sourceDigest=old_source,initial={},unitBefore={}))
        put(other/'failure.json',dict(accepted=False))
        ledger=repair.read_repair_accounting(str(state))
        assert ledger['unresolvedGrossBytes']==str(2*int(reservation['grossBytes'])) and ledger['settlementDebtBytes']=='33554432',ledger
        if scenario=='unselected-debt':print('all-debt-retained');sys.exit(0)
    if scenario=='first-create-loss':
        for attempt in range(2):
            try:writer.coordinate_settlement(writer.SettlementContext(repair,request,raw.digest_json(request)))
            except (OSError,raw.PreparationRefusal):pass
            else:raise AssertionError('failed allocator returned success')
        assert len(os.listdir(old))==4
        ledger=repair.read_repair_accounting(str(state))
        assert ledger['unresolvedGrossBytes']==reservation['grossBytes'] and ledger['settlementDebtBytes']=='33554432'
        assert creates==(1 if omission=='none' else 2),creates
        print('consumed-before-create' if omission=='none' else 'unsafe-repeat-create');sys.exit(0)
    if scenario.startswith('legacy-admission:'):
        native_statvfs=os.statvfs
        os.statvfs=lambda path:types.SimpleNamespace(f_bavail=600*1024**3//4096,f_frsize=4096)
        component=scenario.split(':')[1]
        try:
            if component=='raw':raw.observe_capacity(str(state))
            elif component=='seed':repair.seed.observe_capacity(str(state))
            else:repair.geometry.observe_capacity(str(state))
        except raw.PreparationRefusal as failure:
            assert omission=='none' and str(failure)=='raw-repair-accounting-required',failure
            print('protected');sys.exit(0)
        assert omission!='none';print('unsafe-admission');sys.exit(0)
    if scenario in ('history-creator','history-snapshot-float','history-reservation-float','history-raw-identity-float'):
        ready=repair.read_record(old/'worker-ready.json')
        captured=repair.read_record(capture)
        if scenario=='history-creator':ready['binding']['creator'][1]+=1
        if scenario=='history-snapshot-float':ready['snapshot']['owner']=float(ready['snapshot']['owner'])
        if scenario=='history-reservation-float':ready['reservation']['schemaVersion']=1.0
        if scenario=='history-raw-identity-float':captured['originalRawIdentity']['owner']=float(captured['originalRawIdentity']['owner'])
        put(old/'worker-ready.json',ready)
        captured['readyDigest']=pin(old/'worker-ready.json')['sha256'];put(capture,captured)
        for entry in request['pins']:
            if entry['path'] in (str(old/'worker-ready.json'),str(capture)):entry.update(pin(pathlib.Path(entry['path'])))
        context=writer.SettlementContext(repair,request,raw.digest_json(request))
    if scenario=='parent-xattr':os.setxattr(old,'user.settlement113',b'foreign')
    if scenario=='unknown-before':
        put(old/'unknown.json',dict(unknown=True))
        try:repair.read_repair_accounting(str(state))
        except raw.PreparationRefusal:
            assert omission=='none';print('protected');sys.exit(0)
        assert omission!='none';print('unsafe-admission');sys.exit(0)
    if scenario in ('unqualified','attempt-unqualified') and omission=='none':
        try:writer.coordinate_settlement(context)
        except raw.PreparationRefusal as failure:assert str(failure)=='settlement-'+('inputs' if scenario=='unqualified' else 'attempt')+'-unqualified'
        else:raise AssertionError('missing prerequisite admitted')
        assert len(os.listdir(old))==4
        print('refused-before-publication');sys.exit(0)
    try:envelope=writer.coordinate_settlement(context)
    except BaseException:
        if scenario.startswith('failure-prefix:'):
            ledger=repair.read_repair_accounting(str(state))
            assert ledger['unresolvedGrossBytes']==reservation['grossBytes'] and ledger['settlementDebtBytes']=='33554432'
            assert (old/'settlement-failure.json').exists() and (old/'settlement-execution.json').exists()
            assert repair.read_record(old/'settlement-execution.json')['outcome']=='refused'
            print('failed-prefix-accounted');sys.exit(0)
        if scenario in ('partial-F','partial-refused-E'):
            try:repair.read_repair_accounting(str(state))
            except (raw.PreparationRefusal,ValueError):print('malformed-blocked');sys.exit(0)
            raise AssertionError('partial failure proof admitted')
        if scenario.startswith('prefix:'):
            ledger=repair.read_repair_accounting(str(state))
            accepted=scenario=='prefix:settlement-execution.json'
            assert ledger['unresolvedGrossBytes']==('0' if accepted else reservation['grossBytes']),ledger
            assert ledger['settlementDebtBytes']=='33554432'
            print('crash-accounted');sys.exit(0)
        if scenario in ('original-sync','A-sync','C-sync','ack-phase','live-thread','counter-oom','new-terminal-failed','ready-stale','parent-inode','parent-size','parent-flags','parent-xattr','acl-present','acl-denied','foreign-lsm','ima-fix','consumed-reused','consumed-unreadable','consumed-unadopted','history-creator','nonce-reused','history-snapshot-float','history-reservation-float','history-raw-identity-float') and omission=='none':
            assert not (old/'settlement-certificate.json').exists(),'forbidden certificate publication'
            ledger=repair.read_repair_accounting(str(state))
            assert ledger['unresolvedGrossBytes']==str(int(reservation['grossBytes'])*(2 if scenario=='nonce-reused' else 1)) and ledger['settlementDebtBytes']=='33554432'
            print('protected');sys.exit(0)
        raise
    assert envelope['scope']=='failed-repair-settlement' and envelope['accepted'] is True,envelope
    assert envelope['retainedSettlementDebtBytes']=='33554432'
    if scenario.startswith('record:'):
        role,change=scenario.split(':')[1:]
        records={role:repair.read_record(old/('settlement-'+role+'.json')) for role in writer.SETTLEMENT_ORDER}
        changed=records[role]
        if change=='extra':changed['foreign']=True
        if change=='readyDigest':changed['readyDigest']='0'*64
        if change=='rawWrite':changed['rawWrite']=True
        if change=='amount':changed['releasedGrossBytes']='1'
        if change=='authority':changed['repairAuthority']=True
        if change=='workerExit':changed['workerClientExit']=1
        if change=='K':changed['retainedSettlementDebtBytes']='0'
        if change=='source':changed['sourceDigest']='0'*64
        if change=='readyTimeBool':changed['observedNs']=True
        if change=='bindingRequest':changed['binding']['requestDigest']='0'*64
        if change=='workerCaps':changed['binding']['worker']['caps']['memory.max']='max'
        if change=='workerLimits':changed['binding']['worker']['limits']['RuntimeMaxUSec']='unknown'
        if change=='workerUid':changed['binding']['worker']['process']['uid']=True
        if change=='workerBoot':changed['binding']['worker']['process']['bootId']='invalid'
        if change=='workerFd':changed['binding']['workerRawFd']=True
        if change in ('workerCaps','workerLimits','workerUid','workerBoot','workerFd'):
            bound=changed['binding']
            changed['adoption']['worker']=bound['worker']['process']
            records['certificate']['newTerminal']['process']=bound['worker']['process']
            records['certificate']['cleanup']['terminalDigest']=raw.digest_json(records['certificate']['newTerminal'])
            records['execution']['cleanup']=records['certificate']['cleanup']
            records['execution']['newTerminalDigest']=raw.digest_json(records['certificate']['newTerminal'])
            records['receipt']['terminalDigest']=raw.digest_json(records['certificate']['newTerminal'])

        if change=='adoption':changed['adoption']['requestDigest']='0'*64
        if change=='adoptionCoordinatorUid':changed['adoption']['coordinator']['uid']=float(changed['adoption']['coordinator']['uid'])
        if change=='adoptionCoordinatorGid':changed['adoption']['coordinator']['gid']=float(changed['adoption']['coordinator']['gid'])
        if change=='adoptionWorkerUid':changed['adoption']['worker']['uid']=float(changed['adoption']['worker']['uid'])
        if change=='adoptionWorkerGid':changed['adoption']['worker']['gid']=float(changed['adoption']['worker']['gid'])
        if change=='adoptionStagingOwner':changed['adoption']['stagingIdentity']['owner']=float(changed['adoption']['stagingIdentity']['owner'])
        if change=='certificateProfileBlock':changed['profile']['blockBytes']=4096.0
        if change=='certificateProfileBool':changed['profile']['delalloc']=1.0
        if change=='ledgerDigest':changed['initialCapacity']['ledgerDigest']='invalid'
        if change=='capacityTimeOverflow':changed['initialCapacity']['observedNs']='18446744073709551616'
        if change=='memory':changed['initialCapacity']['availableMemoryBytes']='3623878655'
        if change=='backing':changed['initialCapacity']['freeBytes']=str(50*1024**3+int(reservation['grossBytes'])+33554432-1)
        if change=='staging':changed['initialCapacity']['retainedInodeBytes']=str(10*1024**3-160*1024**2-33554432+1)
        if change=='outside':changed['initialCapacity']['outsideBytes']=str(160*1024**2+1)
        if change=='counterPhase':changed['measurementPhase']='before-original-drain'
        if change=='counterStart':changed['startedNs']=str(int(changed['startedNs'])+1)
        if change=='barrierOrder':changed['publication']='barrier-before-counter'
        if change=='certificateJoin':changed['barrierDigest']='0'*64
        if change=='ackConsumedInt':changed['durableAck']['consumed']=1
        if change=='ackConsumedFloat':changed['durableAck']['consumed']=1.0
        if change=='receiptAccepted':changed['accepted']=False
        if change=='captureBound':changed['stdout']['bytes']=65536
        if change=='cleanup':
            changed['cleanup']['state']='uncertain';records['execution']['cleanup']=changed['cleanup']
        if change=='terminalGroup':changed['newTerminal']['group']=dict(state='empty',events='populated 1',procs='',threads='')
        if change=='terminalUnit':changed['newTerminal']['properties']['MainPID']='123'
        if change=='terminalProcess':changed['newTerminal']['processState']=dict(state='reused',observedStart=changed['newTerminal']['process']['start'])
        if role=='certificate':
            changed['cleanup']['terminalDigest']=raw.digest_json(changed['newTerminal'])
            records['execution']['cleanup']=changed['cleanup']
            records['execution']['newTerminalDigest']=raw.digest_json(changed['newTerminal'])
            records['receipt']['terminalDigest']=raw.digest_json(changed['newTerminal'])
        if change in ('bindingRequest','workerCaps','workerLimits','workerUid','workerBoot','workerFd'):
            for later in ('drain','counter','barrier','certificate','execution'):
                records[later]['bindingDigest']=raw.digest_json(changed['binding'])
            records['certificate']['durableAck']['bindingDigest']=raw.digest_json(changed['binding'])

        # Recompute each descendant from its predecessors, preserving only the injected fault.
        if change=='oldTerminal':
            changed['oldTerminal']['process']['pid']='123'
            records['certificate']['oldTerminal']=changed['oldTerminal']
            records['drain']['oldTerminalDigest']=raw.digest_json(changed['oldTerminal'])
            records['barrier']['oldTerminalDigest']=raw.digest_json(changed['oldTerminal'])
        for later in writer.SETTLEMENT_ORDER[1:]:
            for prior in writer.SETTLEMENT_ORDER[:writer.SETTLEMENT_ORDER.index(later)]:
                if prior+'Digest' in records[later] and not (later==role and (change=='readyDigest' and prior=='ready' or change=='certificateJoin' and prior=='barrier')):
                    records[later][prior+'Digest']=raw.digest_json(records[prior])
            if later=='certificate':
                for prior in ('drain','counter','barrier'):
                    records[later]['durableAck'][prior+'Digest']=raw.digest_json(records[prior])
        if change=='oldTerminal':
            records['execution']['originalTerminalDigest']=raw.digest_json(records['certificate']['oldTerminal'])
        for role,record in records.items():put(old/('settlement-'+role+'.json'),record)
    if scenario=='lock-lifetime':
        assert lost_lifetime==(omission!='none')
        descriptor=raw.acquire_staging(str(state));os.close(descriptor)
        print('unsafe-unlocked-publication' if lost_lifetime else 'ownership-held-through-E');sys.exit(0)
    if scenario.startswith('namespace:'):
        fault,role=scenario.split(':')[1:]
        path=old/('settlement-'+role+'.json')
        if fault=='partial':path.write_bytes(b'{')
        if fault=='unreadable':path.chmod(0)
        if fault=='missing':path.unlink()
        if fault=='subdirectory':(old/'foreign').mkdir(mode=0o700)
        try:repair.read_repair_accounting(str(state))
        except (raw.PreparationRefusal,ValueError):print('protected');sys.exit(0)
        raise AssertionError('malformed namespace admitted')
    if scenario in ('accepted-and-failure','unknown-execution'):
        failure=writer.make_settlement_record(context,'failure',dict(phase='receipt',category='protocol-refused',
            cleanup='verified-original-unit-empty',observedNs=str(time.time_ns()),bindingDigest=raw.digest_json(context.binding),
            retainedGrossBytes=reservation['grossBytes'],retainedSettlementDebtBytes='33554432',accepted=False,**writer.SETTLEMENT_AUTHORITY))
        descriptor=raw.open_private(old,directory=True)
        try:repair.publish_settlement_record(str(old),descriptor,'settlement-failure.json',failure)
        finally:os.close(descriptor)
        if scenario=='unknown-execution':
            execution=repair.read_record(old/'settlement-execution.json');execution['outcome']='unknown';put(old/'settlement-execution.json',execution)
    if scenario=='mixed':put(old/'release.json',dict(foreign=True))
    if scenario=='xattr':os.setxattr(old/'settlement-ready.json','user.settlement113',b'foreign')
    if scenario=='noncanonical':
        path=old/'settlement-ready.json';path.write_bytes(path.read_bytes()+b'\n')
    if scenario.startswith('record:') or scenario in ('mixed','noncanonical','xattr','accepted-and-failure','unknown-execution'):
        try:repair.read_repair_accounting(str(state))
        except (raw.PreparationRefusal,ValueError):
            assert omission=='none';print('protected');sys.exit(0)
        assert omission!='none';print('unsafe-admission' if scenario=='unknown-execution' else 'unsafe-credit');sys.exit(0)
    ledger=repair.read_repair_accounting(str(state))
    assert ledger['unresolvedGrossBytes']==(reservation['grossBytes'] if scenario in ('unselected-complete','nonce-reused') else '0') and ledger['settlementDebtBytes']=='33554432',ledger
    if scenario in ('capacity-floors','unselected-complete'):
        spec=importlib.util.spec_from_file_location('lineage',pathlib.Path(sys.argv[1])/'lab-repair-lineage.py')
        lineage=importlib.util.module_from_spec(spec);spec.loader.exec_module(lineage)
        lineage.repair=repair;lineage.raw=raw;lineage.require=raw.require
        for initial in (False,True):
            floor=(50 if initial else 40)*1024**3+int(ledger['unresolvedGrossBytes'])+33554432
            lineage.check_backing(str(state),floor,initial)
            try:lineage.check_backing(str(state),floor-1,initial)
            except raw.PreparationRefusal as failure:assert str(failure)=='continued-backing-floor'
            else:raise AssertionError('one-byte-short K backing admitted')
        candidate=repair.make_reservation('c'*32,'d'*64,'e'*64,expected,0)
        profile=physical(None,None,None)
        for initial in (False,True):
            floor=(50 if initial else 40)*1024**3+int(ledger['unresolvedGrossBytes'])+int(candidate['grossBytes'])+33554432+1
            facts=dict(availableMemoryBytes=3623878656 if initial else 2147483648,freeBytes=floor,
                retainedInodeBytes=10*1024**3-160*1024**2-33554432-16*1024**2,otherFutureReservations=1)
            repair.check_capacity(facts,profile,candidate,ledger,dict(kind='rewrite',bytes=1048576),initial)
            for field in ('availableMemoryBytes','freeBytes','retainedInodeBytes'):
                changed=dict(facts);changed[field]+=1 if field=='retainedInodeBytes' else -1
                try:repair.check_capacity(changed,profile,candidate,ledger,dict(kind='rewrite',bytes=1048576),initial)
                except raw.PreparationRefusal:pass
                else:raise AssertionError(('one-byte capacity fault admitted',field))
        print('full-K-floor-arithmetic');sys.exit(0)
    assert len(os.listdir(old))==12 and (old/'failure.json').exists()
    assert not any(envelope[key] for key in ('repairAuthority','guestAuthority','fullRehearsalAuthority'))
    try:repair.read_reservations(str(state))
    except raw.PreparationRefusal as failure:assert str(failure)=='repair-accounting-required'
    else:raise AssertionError('legacy hid completed K')
    print('accepted-G-only-K-retained')
`;

for (const scenario of ['complete', 'consumed-exited', 'unqualified', 'attempt-unqualified']) {
  test(`conditional production settlement chain ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      scenario === 'complete' || scenario === 'consumed-exited'
        ? 'accepted-G-only-K-retained'
        : 'refused-before-publication',
    );
  }, 25000);
}

for (const role of [
  'request',
  'ready',
  'drain',
  'counter',
  'barrier',
  'certificate',
  'receipt',
  'execution',
]) {
  test(`settlement real publication crash prefix ${role}`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        integration,
        import.meta.dir,
        `prefix:settlement-${role}.json`,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('crash-accounted');
  }, 25000);
}

const protections = [
  ['nonce-reused', 'settlement-nonce-reused', 'accepted-G-only-K-retained'],
  ['unknown-before', 'settlement-namespace-invalid', 'unsafe-admission'],
  ['legacy-admission:raw', 'raw-repair-accounting-required', 'unsafe-admission'],
  ['legacy-admission:seed', 'raw-repair-accounting-required', 'unsafe-admission'],
  ['legacy-admission:guest', 'raw-repair-accounting-required', 'unsafe-admission'],
  ['ready-stale', 'settlement-ready-time', 'accepted-G-only-K-retained'],
  ['unqualified', 'qualify-dependency', 'accepted-G-only-K-retained'],
  ['consumed-unadopted', 'settlement-consumed-context', 'accepted-G-only-K-retained'],
  ['parent-inode', 'settlement-parent-profile', 'accepted-G-only-K-retained'],
  ['parent-size', 'settlement-parent-profile', 'accepted-G-only-K-retained'],
  ['parent-flags', 'settlement-parent-profile', 'accepted-G-only-K-retained'],
  ['parent-xattr', 'settlement-parent-profile', 'accepted-G-only-K-retained'],
  ['acl-present', 'settlement-parent-acl', 'accepted-G-only-K-retained'],
  ['acl-denied', 'settlement-parent-acl', 'accepted-G-only-K-retained'],
  ['foreign-lsm', 'settlement-security-profile', 'accepted-G-only-K-retained'],
  ['ima-fix', 'settlement-security-profile', 'accepted-G-only-K-retained'],
  ['mixed', 'settlement-namespace-conflict', 'unsafe-credit'],
  ['accepted-and-failure', 'settlement-namespace-conflict', 'unsafe-credit'],
  ['unknown-execution', 'settlement-execution-outcome', 'unsafe-admission'],
  ['history-creator', 'settlement-history-native', 'accepted-G-only-K-retained'],
  ['xattr', 'settlement-record-xattrs', 'unsafe-credit'],
  ['record:ready:oldTerminal', 'settlement-old-terminal-binding', 'unsafe-credit'],
  ['noncanonical', 'repair-json-noncanonical', 'unsafe-credit'],
  ['record:ready:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:drain:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:counter:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:barrier:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:certificate:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:receipt:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:execution:extra', 'settlement-shape', 'unsafe-credit'],
  ['record:drain:readyDigest', 'settlement-chain-ready', 'unsafe-credit'],
  ['record:drain:rawWrite', 'settlement-drain', 'unsafe-credit'],
  ['record:certificate:authority', 'settlement-authority', 'unsafe-credit'],
  ['record:receipt:amount', 'settlement-release-amount', 'unsafe-credit'],
  ['record:execution:workerExit', 'settlement-execution', 'unsafe-credit'],
  ['record:ready:source', 'settlement-provenance', 'unsafe-credit'],
  ['record:ready:readyTimeBool', 'settlement-unsigned', 'unsafe-credit'],
  ['record:ready:bindingRequest', 'settlement-binding', 'unsafe-credit'],
  ['record:ready:workerCaps', 'settlement-unit', 'unsafe-credit'],
  ['record:ready:workerLimits', 'settlement-unit', 'unsafe-credit'],
  ['record:ready:workerUid', 'settlement-process', 'unsafe-credit'],
  ['record:ready:workerBoot', 'settlement-process', 'unsafe-credit'],
  ['record:ready:workerFd', 'settlement-binding', 'unsafe-credit'],
  ['record:ready:adoption', 'settlement-adoption', 'unsafe-credit'],
  ['record:ready:ledgerDigest', 'settlement-digest', 'unsafe-credit'],
  ['record:ready:capacityTimeOverflow', 'settlement-unsigned', 'unsafe-credit'],
  ['record:ready:memory', 'settlement-capacity', 'unsafe-credit'],
  ['record:ready:backing', 'settlement-capacity', 'unsafe-credit'],
  ['record:ready:staging', 'settlement-capacity', 'unsafe-credit'],
  ['record:ready:outside', 'settlement-capacity', 'unsafe-credit'],
  ['record:counter:counterPhase', 'settlement-counter-phase', 'unsafe-credit'],
  ['record:counter:counterStart', 'settlement-chain-counter', 'unsafe-credit'],
  ['record:barrier:barrierOrder', 'settlement-chain-barrier', 'unsafe-credit'],
  ['record:certificate:certificateJoin', 'settlement-chain-certificate', 'unsafe-credit'],
  ['record:certificate:ackConsumedInt', 'settlement-ack-consumed-type', 'unsafe-credit'],
  ['record:certificate:ackConsumedFloat', 'settlement-ack-consumed-type', 'unsafe-credit'],
  ['record:ready:adoptionCoordinatorUid', 'settlement-adoption', 'unsafe-credit'],
  ['record:ready:adoptionCoordinatorGid', 'settlement-adoption', 'unsafe-credit'],
  ['record:ready:adoptionWorkerUid', 'settlement-adoption', 'unsafe-credit'],
  ['record:ready:adoptionWorkerGid', 'settlement-adoption', 'unsafe-credit'],
  ['record:ready:adoptionStagingOwner', 'settlement-adoption', 'unsafe-credit'],
  ['record:certificate:certificateProfileBlock', 'settlement-chain-certificate', 'unsafe-credit'],
  ['record:certificate:certificateProfileBool', 'settlement-chain-certificate', 'unsafe-credit'],
  ['history-snapshot-float', 'settlement-history-changed', 'accepted-G-only-K-retained'],
  ['history-reservation-float', 'settlement-history-changed', 'accepted-G-only-K-retained'],
  ['history-raw-identity-float', 'settlement-history-capture', 'accepted-G-only-K-retained'],
  ['record:certificate:cleanup', 'settlement-cleanup', 'unsafe-credit'],
  ['record:certificate:terminalGroup', 'settlement-terminal-group', 'unsafe-credit'],
  ['record:certificate:terminalUnit', 'settlement-terminal-unit', 'unsafe-credit'],
  ['record:certificate:terminalProcess', 'settlement-old-process-live', 'unsafe-credit'],
  ['record:receipt:receiptAccepted', 'settlement-chain-receipt', 'unsafe-credit'],
  ['record:execution:captureBound', 'settlement-capture', 'unsafe-credit'],
  ['original-sync', 'settlement-original-sync', 'accepted-G-only-K-retained'],
  ['A-sync', 'settlement-directory-sync', 'accepted-G-only-K-retained'],
  ['C-sync', 'settlement-directory-sync', 'accepted-G-only-K-retained'],
  ['ack-phase', 'settlement-control-phase', 'accepted-G-only-K-retained'],
  ['live-thread', 'settlement-worker-not-sole', 'accepted-G-only-K-retained'],
  ['counter-oom', 'raw-counter-invalid', 'accepted-G-only-K-retained'],
  ['new-terminal-failed', 'settlement-new-terminal-failed', 'accepted-G-only-K-retained'],
] as const;
for (const [scenario, guard, witness] of protections) {
  test(`settlement watched production guard ${scenario}`, () => {
    for (const omission of ['none', guard]) {
      const invocation = Bun.spawnSync(
        ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, scenario, omission],
        { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stdout.toString().trim()).toBe(
        omission === 'none'
          ? scenario === 'unqualified'
            ? 'refused-before-publication'
            : 'protected'
          : witness,
      );
    }
  }, 45000);
}

test('accounting retains every unselected old debt and one fixed K', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, 'unselected-debt'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString().trim()).toBe('all-debt-retained');
});

test('durable modeled consumption survives an allocating create that leaves only O', () => {
  for (const omission of ['none', 'consume-dependency']) {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        integration,
        import.meta.dir,
        'first-create-loss',
        omission,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      omission === 'none' ? 'consumed-before-create' : 'unsafe-repeat-create',
    );
  }
});

for (const scenario of ['consumed-reused', 'consumed-unreadable']) {
  test(`queued consumed receipt refuses ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('protected');
  });
}

for (const role of ['request', 'ready', 'drain', 'counter', 'barrier', 'certificate', 'receipt']) {
  test(`settlement actual failure prefix ${role}`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        integration,
        import.meta.dir,
        `failure-prefix:${role}`,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('failed-prefix-accounted');
  });
}
for (const scenario of [
  'partial-F',
  'partial-refused-E',
  ...[
    'request',
    'ready',
    'drain',
    'counter',
    'barrier',
    'certificate',
    'receipt',
    'execution',
  ].flatMap((role) => [`namespace:partial:${role}`, `namespace:unreadable:${role}`]),
  'namespace:missing:ready',
  'namespace:subdirectory:ready',
]) {
  test(`settlement complete namespace refuses ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      scenario.startsWith('partial-') ? 'malformed-blocked' : 'protected',
    );
  });
}

test('coordinator ownership spans actual publications after the drainer exits', () => {
  for (const omission of ['none', 'parent-lock-lifetime']) {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        integration,
        import.meta.dir,
        'lock-lifetime',
        omission,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      omission === 'none' ? 'ownership-held-through-E' : 'unsafe-unlocked-publication',
    );
  }
});

for (const scenario of ['capacity-floors', 'unselected-complete']) {
  test(`all active accounting floors ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', integration, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe', timeout: 20000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('full-K-floor-arithmetic');
  });
}
