import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

// Conditional environment: reuse the actual settlement producer and complete strict reader.
// Only disposable fixtures are constructed; native qualification remains unavailable.
const settlementSource = readFileSync(
  new URL('./lab-failed-settlement.test.ts', import.meta.url),
  'utf8',
);
const extractedFixture = settlementSource
  .split('const integration = String.raw`')[1]
  ?.split('`;')[0];
if (!extractedFixture) throw new Error('settlement fixture unavailable');
const settlementFixture: string = extractedFixture;

const historical = String.raw`
    old_expected=dict(expected,allocatedBytes='0',mtimeNs='1',ctimeNs='1')
    inherited_terminal=dict(LoadState='not-found',ActiveState='inactive',SubState='dead',MainPID='0',InvocationID='',ControlGroup='',Result='success',ExecMainStatus='0')
    original_binding.update(pid=1,start='1',unit='puni-raw-'+'0'*32+'.service',invocation='c'*32,cgroup='/fixture/puni-raw-'+'0'*32+'.service',rawFd=4,image=[1]*8,imageFd=5,tool=[1]*8,toolFd=6,python=[1]*8)
    inherited_receipt=repair.read_record(original_receipt)
    inherited_receipt.update(binding=original_binding,counterDigest='e'*64,measurementPhase='after-converter-before-worker-exit',counterPersistence='coordinator-fsync-before-worker-durability-ack',
        terminal=inherited_terminal,groupEvents=None,finalCapacity=dict(availableMemoryBytes=4160749568,freeBytes=400*1024**3,allocatedBytes=8192,observedNs=1),finishedNs=1,
        trust='independently-selected-content-pins; signatures remain separate input provenance')
    put(original_receipt,inherited_receipt)
    inherited_provenance=repair.read_record(provenance);inherited_provenance['receiptDigest']=pin(original_receipt)['sha256'];put(provenance,inherited_provenance)

    guest_seed=state/'guest-seed.json';put(guest_seed,dict(nonce='8'*32,members={'user-data':dict(path=str(state/'old-user'),sha256='0'*64),'meta-data':dict(path=str(state/'old-meta'),sha256='0'*64)},image=str(image),rawRequest=str(first),rawReceipt=str(original_receipt),rawProvenance=str(provenance)))
    guest_request=state/'guest-request.json';put(guest_request,dict(nonce='7'*32,root=str(root),state=str(state),seedRequest=str(guest_seed),pins=[historic_source]))
    witness=guest_request.with_name('request.sha256');witness.write_bytes(b'x'*79);witness.chmod(0o600)
    guest_failure=state/'guest-failure.json'
    put(guest_failure,dict(schemaVersion=1,scope='independent-failed-guest-attempt-observation',accepted=False,acceptedReceiptAvailable=False,guestBootObserved=True,fullRehearsalAuthority=False,
        requestDigest=pin(guest_request)['sha256'],binding=dict(rawPath=str(raw_path),raw=original_binding['raw'],nonce='7'*32,request=pin(guest_request)['sha256'],source=raw.digest_json({historic_source['path']:historic_source['sha256']}),seedNonce='8'*32),
        terminal=dict(LoadState='not-found',ActiveState='inactive',SubState='dead',MainPID='0',InvocationID='',ControlGroup='',Result='success',ExecMainStatus='0'),groupEvents=None,failure=dict(cleanup='verified-original-unit-empty')))
    postboot=state/'postboot.json';put(postboot,dict(schemaVersion=1,scope='independent-read-only-repair-source',originalFailedGuest='7'*32,contentRead=False,rawWrite=False,repairAuthorized=False,
        observation=dict(identity={key:old_expected[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},allocatedBytes=int(old_expected['allocatedBytes']))))
    historical_paths=[image,witness,first,original_receipt,allocation,provenance,guest_seed,guest_request,guest_failure,postboot]
    if len(sys.argv)>4 and sys.argv[4]=='history-roles':historical_paths.append(unused)
`;

const consume = String.raw`
    failure=repair.read_record(old/'failure.json');ready=repair.read_record(old/'worker-ready.json')
    exact_path=root/'.superpowers/sdd/observability-environment-parity'/('repair-'+'a'*32+'-failure-exact.json');exact_path.parent.mkdir(parents=True)
    original_stat=original_path.stat()
    exact=dict(schemaVersion=1,scope='exact-normalized-original-repair-failure',accepted=False,nonce='a'*32,sourceCommit='c'*40,
        binding={key:binding[key] for key in ('cgroup','creator','invocation','originalCreator','pid','raw','rawFd','rawPath','request','source','staging','stagingFd','start','unit')},
        counterAvailable=False,releaseAvailable=False,logicalHashesAvailable=False,retryAllowed=False,finalCgroupCounters=None,
        failure=failure['category'],failureCleanup=failure['cleanup'],failureFinishedNs=str(failure['finishedNs']),readyObservedNs=str(ready['observedNs']),readyToFailureNs=str(failure['finishedNs']-ready['observedNs']),observedNs='3',
        originalCgroupAbsent=True,originalPidStartAbsent=True,originalCliExitCode=1,originalCliOutput='raw repair: producer-refused\n',originalToolSession=1,workerExitStatus='1',rawBefore=old_expected,rawAfter=expected,
        reservationGrossBytes=reservation['grossBytes'],terminalObservations=[old_terminal['properties']],
        request=dict(path=str(original_path),sha256=pin(original_path)['sha256'],inode=str(original_stat.st_ino),mtimeNs=str(original_stat.st_mtime_ns),ctimeNs=str(original_stat.st_ctime_ns)),
        originalArtifacts={name: {key:pin(old/name)[key] for key in ('path','sha256','bytes')} for name in ('request-binding.json','reservation.json','worker-ready.json','failure.json')},
        journal=dict(bytes=1,cpuUsageNanoseconds='1',emitterPid='1',emitterRole='user-manager',events=1,memoryPeakBytes='1',path='.superpowers/journal.jsonl',sha256='d'*64),
        legacyProjection=dict(authoritativeForNative64bitFields=False,path='.superpowers/legacy.json',reason='historical lossy projection',sha256='d'*64))
    put(exact_path,exact)
    observed=dict(provider='linux-fiemap',inspectorVersion=1,observations=dict(kernelRelease='historical',pythonVersion='3.12.3'),
        identity={key:expected[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},expectedBytes=8589934592,allocatedBytes=4096,
        extentCount=1,pageCount=1,metadataBytes=88,mapDigest='e'*64,observation='repair-source',admissionAuthorized=False,repairAuthorized=False,guestAuthorized=False,fullStackAuthorized=False,
        mappedDataBytes=4096,missingDataBytes=8589930496,unwrittenBytes=0,residualAllocatedBytes=0)
    after_path=state/'after-failure.json';put(after_path,dict(schemaVersion=1,scope='independent-read-only-repair-source',sourceRevision='c'*40,inspectorSha256='d'*64,recordedNs='4',elapsedSeconds=0.1,
        limits=dict(addressSpaceBytes=134217728,cpuSeconds=20,fileBytes=65536,fileDescriptors=64,wallSeconds=12),originalFailedGuest='7'*32,
        afterFailedRepair=dict(nonce='a'*32,requestDigest=pin(original_path)['sha256'],sourceDigest=old_source,failureDigest=pin(old/'failure.json')['sha256'],reservationDigest=pin(old/'reservation.json')['sha256'],exactCaptureDigest=pin(exact_path)['sha256']),
        originalStagingLockHeld=True,rawMetadataUnchangedDuringObservation=True,observation=observed,contentRead=False,rawWrite=False,syncRequested=False,logicalContentVerified=False,grossDebtReleased=False,repairAuthorized=False,guestAuthorized=False,fullRehearsalAuthorized=False))
    recovery=dict(original,schemaVersion=2,operation='repair-after-failed-repair',nonce='6'*32,expectedRaw=expected,
        originalRepairRequest=str(original_path),afterFailedRepairEvidence=str(after_path),originalFailureCapture=str(exact_path),settlementRequest=str(old/'settlement-request.json'),
        pins=[*request['pins'],*pins([exact_path,after_path,*sorted(old.glob('settlement-*.json'))])])
    fault=sys.argv[4] if len(sys.argv)>4 else 'relation'
    if fault=='relation':repair._source_payload(raw.encode_json(recovery),raw.digest_json(recovery))
    if fault.startswith('observation:'):
        changed=repair.read_record(after_path);name=fault.split(':')[1]
        if name=='claim':changed['repairAuthorized']=True
        elif name=='shape':changed['foreign']=False
        elif name=='map-bool':changed['observation']['extentCount']=True
        elif name=='map-accounting':changed['observation']['missingDataBytes']-=4096
        elif name=='join':changed['afterFailedRepair']['sourceDigest']='f'*64
        elif name=='time':changed['recordedNs']='1'
        else:raise AssertionError(fault)
        put(after_path,changed)
    if fault.startswith('capture:'):
        changed=repair.read_record(exact_path);name=fault.split(':')[1]
        if name=='availability':changed['counterAvailable']=True
        elif name=='shape':changed['foreign']=False
        elif name=='binding':changed['binding']['pid']+=1
        elif name=='reference':changed['originalArtifacts']['reservation.json']['sha256']='f'*64
        elif name=='terminal':changed['terminalObservations'][0]['MainPID']='1'
        elif name=='snapshot':changed['rawBefore']=dict(changed['rawBefore'],mtimeNs='2')
        else:raise AssertionError(fault)
        put(exact_path,changed)
        changed=repair.read_record(after_path);changed['afterFailedRepair']['exactCaptureDigest']=pin(exact_path)['sha256'];put(after_path,changed)
    recovery['pins']=[pin(pathlib.Path(entry['path'])) if entry['path'] in (str(after_path),str(exact_path)) else entry for entry in recovery['pins']]
    if fault=='semantic-depth':
        actual_check=repair.check_request;actual_metadata=repair.seed.read_pinned_json;historical_value=None
        def wrong_depth(value):
            global historical_value
            actual_check(value)
            if value.get('nonce')=='a'*32 and historical_value is None:
                historical_value=value;value['schemaVersion']=2
        def restore_history(*arguments):
            if historical_value is not None:historical_value['schemaVersion']=1
            return actual_metadata(*arguments)
        repair.check_request=wrong_depth;repair.seed.read_pinned_json=restore_history
    if fault=='semantic-path':
        recovery['afterFailedRepairEvidence']=recovery['originalRepairRequest']
        class ForbiddenMetadata(Exception):pass
        def forbidden_metadata(*arguments):raise ForbiddenMetadata()
        repair.seed.read_pinned_json=forbidden_metadata
        try:
            repair.check_request(recovery)
            repair.coordinator(recovery,str(state/'never-created'),raw.digest_json(recovery))
        except raw.PreparationRefusal:
            assert omission=='none';print('protected-before-metadata');sys.exit(0)
        except ForbiddenMetadata:
            assert omission!='none';print('unsafe-metadata');sys.exit(0)
        raise AssertionError('unexpected metadata admission')
    if fault=='nonce':recovery['nonce']='7'*32
    if fault=='existing-nonce':
        actual_ledger=repair.read_repair_accounting
        def reused_ledger(*arguments,**keywords):
            ledger=actual_ledger(*arguments,**keywords)
            ledger['namespaces'].append(dict(nonce=recovery['nonce']))
            return ledger
        repair.read_repair_accounting=reused_ledger
    if fault=='inheritance':recovery['witness']=str(guest_request)
    if fault=='capture-selection':
        changed=exact_path.with_name('repair-'+'d'*32+'-failure-exact.json');shutil.copyfile(exact_path,changed);changed.chmod(0o600)
        recovery['originalFailureCapture']=str(changed);recovery['pins']=[entry for entry in recovery['pins'] if entry['path']!=str(exact_path)]+[pin(changed)]
    if fault in ('missing','unreadable','malformed'):
        if fault=='missing':after_path.unlink()
        elif fault=='unreadable':after_path.chmod(0o200)
        else:after_path.write_bytes(b'{');after_path.chmod(0o600);recovery['pins']=[pin(after_path) if entry['path']==str(after_path) else entry for entry in recovery['pins']]
    if fault in ('unqualified','outside'):
        class RefuseOutside(ExternalModel):
            def outside_bytes(self,context):return 160*1024**2+1
        writer.SettlementPrerequisites=UnqualifiedPrerequisites if fault=='unqualified' else RefuseOutside
        class ForbiddenNative(Exception):pass
        def forbidden_native(*arguments):raise ForbiddenNative()
        raw.verify_pin=forbidden_native
        try:repair.coordinator(recovery,str(state/'never-created'),raw.digest_json(recovery))
        except raw.PreparationRefusal as failure:
            assert omission=='none' and str(failure)==('settlement-inputs-unqualified' if fault=='unqualified' else 'repair-recovery-outside-bound'),failure
            assert not (state/('raw-repair-'+recovery['nonce'])).exists()
            print('protected-before-native');sys.exit(0)
        except ForbiddenNative:
            assert omission!='none';print('unsafe-native-access');sys.exit(0)
        raise AssertionError('unexpected admission')
    if fault=='missing-K':
        # Break only the actual ledger's K assignment after its real settlement completed.
        import inspect,textwrap
        ledger_source=textwrap.dedent(inspect.getsource(repair.read_repair_accounting)).replace('settlement_debt = 33554432','settlement_debt = 0')
        assert 'settlement_debt = 0' in ledger_source
        exec(compile(ledger_source,'<watched-ledger-K>','exec'),repair.__dict__)
    try:
        repair.check_request(recovery)
        relation=writer.read_failed_source(repair,recovery)
    except (raw.PreparationRefusal,OSError,ValueError,KeyError,TypeError) as failure:
        if fault=='relation' or fault=='producer' or omission!='none':raise
        print('protected-relation:'+str(failure));sys.exit(0)
    if fault not in ('relation','producer'):
        assert omission!='none',('unsafe relation admitted',fault)
        print('unsafe-relation-credit');sys.exit(0)
    assert relation.history['path']==str(raw_path)
    assert relation.context.history==context.history
    print('conditional-recovery-relation')
`;

const producer = String.raw`
    phase_fault=sys.argv[5] if len(sys.argv)>5 else 'success'
    events_path=root/'recovery-events';events_path.write_text('')
    def event(name):
        with events_path.open('a') as stream:stream.write(name+'\n')
    observing=False;observations=0
    descriptor_log=root/'descriptor-peak.jsonl';descriptor_log.write_text('')
    actual_open=os.open;actual_pipe2=os.pipe2
    def record_descriptors():
        if not descriptor_log.exists():return # Fixture cleanup has removed its optional measurement sink.
        numbers=[int(name) for name in os.listdir('/proc/self/fd')]
        with descriptor_log.open('a') as stream:stream.write(json.dumps(dict(pid=os.getpid(),count=len(numbers),maximum=max(numbers)))+'\n')
    def measured_open(*arguments,**keywords):
        descriptor=actual_open(*arguments,**keywords)
        if str(arguments[0]).startswith('/proc/self/fd/') and arguments[1]&os.O_RDWR:event('writable-open')
        record_descriptors();return descriptor
    def measured_pipe(*arguments,**keywords):
        pair=actual_pipe2(*arguments,**keywords);record_descriptors();return pair
    os.open=measured_open;os.pipe2=measured_pipe
    native_namespace=repair.read_repair_namespace
    def current_namespace(*arguments,**keywords):
        namespace=native_namespace(*arguments,**keywords)
        if observing and phase_fault=='current-settlement':namespace.update(settled=False,state='failed')
        return namespace
    repair.read_repair_namespace=current_namespace
    native_observer=writer.observe_failed_source
    def observe_failed_source(*arguments):
        global observing,observations
        is_worker=os.getpid()==worker_pid;observations+=1
        event('observe-worker' if is_worker else 'observe-coordinator')
        if is_worker and observations==1 and phase_fault in ('capture-replacement','source-replacement'):
            selected=after_path if phase_fault=='capture-replacement' else helpers/'lab-raw-repair.py'
            payload=selected.read_bytes();selected.unlink();selected.write_bytes(payload);selected.chmod(0o600)
        if is_worker and observations==1 and phase_fault=='lock-released':
            import fcntl
            fcntl.flock(arguments[2]['stagingFd'],fcntl.LOCK_UN)
        observing=not is_worker if phase_fault=='coordinator-map' else is_worker if phase_fault=='worker-map' else True
        try:
            observed=native_observer(*arguments)
            if is_worker and observations==2 and phase_fault=='prewrite-relation-dependency':observed['historyDigest']='f'*64
            return observed
        finally:observing=False
    writer.observe_failed_source=observe_failed_source
    writer.SettlementContext.observe_terminal=native_observe_terminal
    # The actual pinned inspector observes the tiny inode; only native-size metadata is lifted.
    inspector=raw.load_inspector()
    def inspect_ranges(path,length):
        ranges=inspector.observe_repair_ranges(path,length)
        ranges['observation']['expectedBytes']=8589934592
        ranges['observation']['missingDataBytes']+=8589934592-length
        if observing and phase_fault in ('coordinator-map','worker-map'):ranges['observation']['mapDigest']='f'*64
        return ranges
    observed=inspect_ranges(str(raw_path),4096)['observation']
    if fault in ('relation','producer'):
        recorded=repair.read_record(after_path);recorded['observation']=observed;put(after_path,recorded)
        recovery['pins']=[pin(after_path) if entry['path']==str(after_path) else entry for entry in recovery['pins']]
    raw.load_inspector=lambda:types.SimpleNamespace(observe_repair_ranges=inspect_ranges,inspect_file=inspector.inspect_file,
        inspect_initialized_range=inspector.inspect_initialized_range)
    original_start=raw.process_start
    def process_start(pid):
        if observing and pid==99999999 and phase_fault in ('original-reused','original-live'):
            return '2' if phase_fault=='original-reused' else '1'
        return original_start(pid)
    raw.process_start=process_start
    capturing=False
    native_evidence=repair.open_evidence
    def capture_evidence(selected):
        global capturing
        capturing=True
        try:return native_evidence(selected)
        finally:capturing=False
    repair.open_evidence=capture_evidence
    current_verify=raw.verify_pin
    def verify_pin(entry):
        current_verify(entry)
        if capturing and entry['path']==str(after_path) and phase_fault=='capture-open-race':
            payload=after_path.read_bytes();after_path.unlink();after_path.write_bytes(payload);after_path.chmod(0o600)
    raw.verify_pin=verify_pin
    native_lstat=os.lstat;native_stat=os.stat
    os.lstat=lambda path,*args,**kwargs:native_stat('/proc/self/exe') if str(path) in native_paths else native_lstat(path,*args,**kwargs)
    os.stat=lambda path,*args,**kwargs:native_stat('/proc/self/exe' if str(path)=='/usr/bin/python3.12' else path,*args,**kwargs)
    native_make_reservation=repair.make_reservation
    def make_reservation(*arguments):
        logical_bytes=raw.RAW_BYTES;raw.RAW_BYTES=native_raw_bytes
        try:return native_make_reservation(*arguments)
        finally:raw.RAW_BYTES=logical_bytes
    repair.make_reservation=make_reservation
    native_facts=repair.observe_facts
    def observe_facts(state):
        facts=dict(native_facts(state),freeBytes=3000*1024**3)
        if phase_fault=='ready-capacity' and 'observe-coordinator' in events_path.read_text():facts['availableMemoryBytes']=2147483647
        return facts
    repair.observe_facts=observe_facts
    worker_pid=None;new_unit='puni-raw-repair-'+recovery['nonce']+'.service';new_group='/fixture/'+new_unit
    empty=dict(LoadState='not-found',ActiveState='inactive',SubState='dead',MainPID='0',InvocationID='',ControlGroup='',Result='success',ExecMainStatus='0')
    def repair_unit(unit):
        if unit==old_unit:
            return dict(old_terminal['properties'],LoadState='loaded',InvocationID='e'*32) if observing and phase_fault=='original-foreign' else old_terminal['properties']
        alive=worker_pid is not None and pathlib.Path('/proc/'+str(worker_pid)).exists()
        return dict(LoadState='loaded',ActiveState='active',SubState='running',MainPID=str(worker_pid),InvocationID='f'*32,ControlGroup=new_group,Result='success',ExecMainStatus='0') if alive else empty
    raw.observe_unit=repair_unit
    raw.group_events=lambda group:None
    repair.RepairCoordinator.observe_unit=staticmethod(repair_unit)
    repair.RepairCoordinator.observe_active=staticmethod(raw.observe_active)
    def stop_repair(binding):
        if latest_child.poll() is None:
            assert binding['pid']==latest_child.pid
            latest_child.kill();latest_child.wait(5)
    repair.RepairCoordinator.stop_owned=staticmethod(stop_repair)
    class TinyWriter:
        def __init__(self,descriptor):
            self.descriptor=descriptor
            input_read,input_write=os.pipe2(os.O_CLOEXEC);output_read,output_write=os.pipe2(os.O_CLOEXEC);error_read,error_write=os.pipe2(os.O_CLOEXEC)
            # Account the actual writer's six pre-fork pipe ends and pre-close raw reopen.
            reopened=os.open('/proc/self/fd/'+str(descriptor),os.O_RDWR|os.O_CLOEXEC);os.close(reopened)
            for selected in (input_read,output_write,error_write):os.close(selected)
            self.stdin=os.fdopen(input_write,'wb');self.stdout=os.fdopen(output_read,'rb');self.stderr=os.fdopen(error_read,'rb')
    writer.start_writer=lambda descriptor,*arguments:TinyWriter(descriptor)
    def rewrite(child,before,after,deadline):
        before(0)
        if phase_fault in ('failed-successor','failed-history'):raise raw.PreparationRefusal('modeled-successor-failure')
        event('write')
        os.pwrite(child.descriptor,os.pread(child.descriptor,4096,0),0)
        # Tiny-file environment has one actual initialized range, preserving the production callbacks.
        inspector.inspect_initialized_range(str(raw_path),4096,0,4096)
    writer.drive_writer=rewrite
    class RepairChild(OwnedChild):
        def __init__(self):
            global worker_pid
            in_read,in_write=os.pipe2(os.O_CLOEXEC);out_read,out_write=os.pipe2(os.O_CLOEXEC);err_read,err_write=os.pipe2(os.O_CLOEXEC)
            pid=os.fork()
            if pid==0:
                try:
                    os.dup2(in_read,0);os.dup2(out_write,1);os.dup2(err_write,2)
                    for name in os.listdir('/proc/self/fd'):
                        descriptor=int(name)
                        if descriptor>2:
                            try:os.close(descriptor)
                            except OSError as failure:
                                if failure.errno!=errno.EBADF:raise
                    worker_pid=os.getpid();os.environ['INVOCATION_ID']='f'*32
                    repair.worker(recovery,raw.digest_json(recovery));os._exit(0)
                except BaseException:
                    import traceback;traceback.print_exc();os._exit(1)
            worker_pid=pid;self.pid=pid;self.returncode=None
            for descriptor in (in_read,out_write,err_write):os.close(descriptor)
            self.stdin=os.fdopen(in_write,'wb',buffering=0);self.stdout=os.fdopen(out_read,'rb',buffering=0);self.stderr=os.fdopen(err_read,'rb',buffering=0)
    def launch_repair(*arguments):
        global latest_child
        latest_child=RepairChild();return latest_child
    repair.RepairCoordinator.launch_service=staticmethod(launch_repair)
    recovery_path=state/'recovery-request.json';put(recovery_path,recovery)
    accepted=repair.coordinator(recovery,str(recovery_path),raw.digest_json(recovery))
    assert accepted['accepted'] is True
    events=events_path.read_text().splitlines()
    assert events.count('observe-coordinator')>=1 and events.count('observe-worker')>=2,events
    assert events.index('observe-coordinator')<events.index('write'),events
    ledger=repair.read_repair_accounting(str(state))
    assert ledger['unresolvedGrossBytes']=='0' and ledger['settlementDebtBytes']=='33554432',ledger
    selected={entry['path']:entry for entry in recovery['pins']}
    held=repair.evidence_paths(recovery)
    samples=[json.loads(line) for line in descriptor_log.read_text().splitlines()]
    peak=max(sample['count'] for sample in samples);maximum=max(sample['maximum'] for sample in samples)
    assert peak<=64 and maximum<64,(peak,maximum)
    source_sizes={name:(helpers/name).stat().st_size for name in names[:6]}
    budget=dict(conditional=True,sourceBytes=source_sizes,aggregateSourceBytes=sum(source_sizes.values()),
        requestBytes=pin(recovery_path)['bytes'],heldEvidenceFiles=len(held),heldEvidenceBytes=sum(selected[path]['bytes'] for path in held),
        maximumEvidenceBytes=max(selected[path]['bytes'] for path in held),selectedMetadataFiles=len(writer.failed_source_paths(repair,recovery)),
        readyFrameBytes=(state/('raw-repair-'+recovery['nonce'])/'worker-ready.json').stat().st_size,
        peakDescriptorsIncludingMeasurement=peak,maximumDescriptorIncludingMeasurement=maximum,descriptorLimit=64,
        outsidePhysicalBytes=ExternalModel().outside_bytes(types.SimpleNamespace(request=recovery)))
    budget_path=state/'producer-budget.json';put(budget_path,budget)
    assert repair.read_record(budget_path)==budget
    print('recovery-budget:'+json.dumps(budget,separators=(',',':')))
    print('conditional-recovery-producer')
`;

const failedSuccessor = String.raw`
    try:accepted=repair.coordinator(recovery,str(recovery_path),raw.digest_json(recovery))
    except raw.PreparationRefusal:
        if phase_fault not in ('failed-successor','failed-history'):raise
    else:raise AssertionError('modeled failed successor accepted')
    directory=state/('raw-repair-'+recovery['nonce'])
    assert (directory/'failure.json').exists() and (directory/'worker-ready.json').exists()
    ledger=repair.read_repair_accounting(str(state))
    assert ledger['unresolvedGrossBytes']=='377957007360' and ledger['settlementDebtBytes']=='33554432',ledger
    ready=repair.read_record(directory/'worker-ready.json');failed=repair.read_record(directory/'failure.json');reserved=repair.read_record(directory/'reservation.json')
    second_capture=state/'successor-terminal.json';second_qualification=state/'successor-qualification.json'
    native_binding=ready['binding']
    successor_terminal=terminal(native_binding['unit'],native_binding['invocation'],native_binding['cgroup'],
        dict(pid=str(native_binding['pid']),start=native_binding['start'],uid=os.geteuid(),gid=os.getegid(),bootId=raw.read_text('/proc/sys/kernel/random/boot_id').strip()),True,'observation')
    put(second_capture,dict(schemaVersion=1,kind='failed-repair-terminal-capture',originalDirectory=str(directory),
        originalDirectoryIdentity=writer.SettlementContext.snapshot_directory(directory.stat()),rawPath=str(raw_path),
        originalRawIdentity={key:expected[key] for key in ('device','inode','owner','mode','links','logicalBytes')},
        requestDigest=pin(recovery_path)['sha256'],sourceDigest=reserved['sourceDigest'],reservationDigest=raw.digest_json(reserved),
        readyDigest=pin(directory/'worker-ready.json')['sha256'],failureDigest=pin(directory/'failure.json')['sha256'],terminal=successor_terminal))
    put(second_qualification,dict(provider='disposable-conditional-second-attempt'))
    second_pins={entry['path']:entry for entry in recovery['pins']}
    for path in [recovery_path,second_capture,second_qualification,*sorted(directory.glob('*.json'))]:second_pins[str(path)]=pin(path)
    second=dict(schemaVersion=2,operation='settle-failed-repair',root=str(root),state=str(state),nonce='4'*32,pins=list(second_pins.values()),
        originalRepairRequest=str(recovery_path),originalDirectory=str(directory),originalTerminalCapture=str(second_capture),qualification=str(second_qualification),expectedRaw=snapshot(raw_path.stat()),witness=str(witness))
    current_text=raw.read_text
    def absent_successor_group(path,*arguments):
        if path.startswith('/sys/fs/cgroup'+new_group+'/'):raise FileNotFoundError(path)
        return current_text(path,*arguments)
    raw.read_text=absent_successor_group
    second_context=writer.SettlementContext(repair,second,raw.digest_json(second))
    if phase_fault=='failed-history':
        after_path.write_bytes(b'{');after_path.chmod(0o600)
        try:second_context.read_history()
        except (raw.PreparationRefusal,ValueError):
            assert omission=='none';print('protected-failed-successor-history');sys.exit(0)
        assert omission!='none';print('unsafe-failed-history-credit');sys.exit(0)
    class ForbiddenConsume(Exception):pass
    class SecondAttempt(ExternalModel):
        def consume(self,context):raise ForbiddenConsume()
    second_context.prerequisites=SecondAttempt()
    try:writer.coordinate_settlement(second_context)
    except raw.PreparationRefusal as failure:
        assert omission=='none' and str(failure)=='settlement-global-consumed',failure
        assert set(path.name for path in directory.iterdir())=={'request-binding.json','reservation.json','worker-ready.json','failure.json'}
        print('failed-successor-G-plus-K-second-refused');sys.exit(0)
    except ForbiddenConsume:
        assert omission=='settlement-global-consumed';print('unsafe-second-consume');sys.exit(0)
    raise AssertionError('forbidden second settlement returned')
`;

const continuation = String.raw`
    seed=repair.seed
    shutil.copyfile(pathlib.Path(sys.argv[1])/'lab-repair-lineage.py',helpers/'lab-repair-lineage.py')
    lineage=seed.load_lineage();lineage.repair=repair
    seed.load_lineage=lambda:lineage
    directory=state/('raw-repair-'+recovery['nonce'])
    repair_provenance=state/'repair-provenance.json'
    historical_source=[entry for entry in recovery['pins'] if entry['path'].startswith(str(root)+'/') and not entry['path'].startswith(str(state)+'/') and entry['path']!=str(exact_path)]
    put(repair_provenance,dict(schemaVersion=1,sourceRevision='c'*40,sourcePins=historical_source,requestDigest=pin(recovery_path)['sha256'],receiptDigest=pin(directory/'receipt.json')['sha256'],envelope=accepted))
    continued_pins={entry['path']:entry for entry in recovery['pins']}
    for path in [recovery_path,repair_provenance,*sorted(directory.glob('*.json'))]:continued_pins[str(path)]=pin(path)
    members={}
    for name in seed.MEMBERS:
        path=state/('continued-'+name)
        put(path,{'instance-id':'puniq-'+'5'*32,'local-hostname':'puni-baseline'} if name=='meta-data' else {'member':name})
        continued_pins[str(path)]=pin(path);members[name]={key:pin(path)[key] for key in ('path','sha256','bytes')}
    continued=dict(schemaVersion=2,lineage='continued-guest',root=str(root),state=str(state),nonce='5'*32,
        pins=list(continued_pins.values()),members=members,image=str(image),rawRequest=str(first),rawReceipt=str(original_receipt),rawProvenance=str(provenance),
        repairRequest=str(recovery_path),repairReceipt=str(directory/'receipt.json'),repairProvenance=str(repair_provenance))
    admitted=seed.verify_raw(continued)
    assert admitted['receipt']['repairRequestDigest']==pin(recovery_path)['sha256']
    assert admitted['admission']['artifact']['before']==expected and old_expected!=expected
    # Conditional seed metadata only; no ISO builder, guest launch or native authority is supplied.
    guest=repair.geometry;guest.seed=seed
    bootstrap_path=helpers/'lab-guest-bootstrap.py';bootstrap_path.write_bytes(b'disposable bootstrap');bootstrap_path.chmod(0o600)
    continued_pins[str(bootstrap_path)]=pin(bootstrap_path)
    cloud=dict(write_files=[dict(path='/opt/puni-baseline/bootstrap.py',content=bootstrap_path.read_text()),
        dict(path='/opt/puni-baseline/request.json',content=json.dumps(dict(schemaVersion=1,nonce=continued['nonce'],bootstrapSha256=pin(bootstrap_path)['sha256'])))])
    user_path=pathlib.Path(members['user-data']['path']);user_path.write_bytes(b'#cloud-config\n'+raw.encode_json(cloud))
    for name,member in members.items():
        path=pathlib.Path(member['path']);path.chmod(0o400);continued_pins[str(path)]=pin(path)
        members[name]={key:pin(path)[key] for key in ('path','sha256','bytes')}
    dependency=state/'seed-dependency.json';put(dependency,dict(inputBindings=[],tools=[]));continued_pins[str(dependency)]=pin(dependency)
    continued.update(pins=list(continued_pins.values()),dependencyReport=str(dependency),provenance=[str(provenance)])
    seed_request_path=state/'continued-seed.json';put(seed_request_path,continued);continued_pins[str(seed_request_path)]=pin(seed_request_path)
    seed_directory=state/('seed-'+continued['nonce']);seed_directory.mkdir(mode=0o700)
    iso_path=seed_directory/'seed.iso';iso_path.write_bytes(b'disposable metadata fixture');iso_path.chmod(0o600);continued_pins[str(iso_path)]=pin(iso_path)
    seed_binding=dict(pid=1,start='1',unit='puni-seed-'+continued['nonce']+'.service',invocation='e'*32,cgroup='/fixture/puni-seed-'+continued['nonce']+'.service',
        nonce=continued['nonce'],creator=raw.identity(seed_directory.stat()),iso=raw.identity(iso_path.stat()),isoFd=4,python=[1]*8,
        source=raw.digest_json({entry['path']:entry['sha256'] for entry in continued['pins']}),request=pin(seed_request_path)['sha256'],
        inputs={name:dict(fd=5,identity=[1]*8) for name in (*seed.MEMBERS,'genisoimage','isoinfo')})
    lineage_fields=seed.read_lineage(continued)
    seed_receipt=dict(scope='seed-preparation',accepted=True,guestAuthority=False,fullRehearsalAuthority=False,
        requestDigest=pin(seed_request_path)['sha256'],sourceDigest=seed_binding['source'],binding=seed_binding,counterDigest='e'*64,
        measurementPhase='after-seed-before-worker-exit',counterPersistence='coordinator-fsync-before-worker-durability-ack',terminal=inherited_terminal,groupEvents=None,
        finalCapacity=inherited_receipt['finalCapacity'],finishedNs=1,trust=inherited_receipt['trust'],isoBytesLimit=seed.ISO_BYTES,memberBytesLimit=seed.MEMBER_BYTES,
        dependencyReport=str(dependency),rawReceipt=str(original_receipt),**lineage_fields)
    put(seed_directory/'receipt.json',seed_receipt);continued_pins[str(seed_directory/'receipt.json')]=pin(seed_directory/'receipt.json')
    put(seed_directory/'iso.json',dict(bytes=pin(iso_path)['bytes'],sha256=pin(iso_path)['sha256'],memberBytes=sum(member['bytes'] for member in members.values()),
        members={name:{key:member[key] for key in ('bytes','sha256')} for name,member in members.items()},namespaces=['iso9660','joliet','rock-ridge']))
    continued_pins[str(seed_directory/'iso.json')]=pin(seed_directory/'iso.json')
    seed_provenance=state/'continued-seed-provenance.json';put(seed_provenance,dict(schemaVersion=1,sourceRevision='e'*40,
        sourcePins=[entry for entry in continued['pins'] if entry['path'].startswith(str(root)+'/') and not entry['path'].startswith(str(state)+'/')],
        requestDigest=pin(seed_request_path)['sha256'],receiptDigest=pin(seed_directory/'receipt.json')['sha256']))
    continued_pins[str(seed_provenance)]=pin(seed_provenance)
    guest_request=dict(schemaVersion=2,lineage='continued-guest',root=str(root),state=str(state),nonce='3'*32,pins=list(continued_pins.values()),
        seedRequest=str(seed_request_path),seedReceipt=str(seed_directory/'receipt.json'),seedProvenance=str(seed_provenance),
        bootstrapSha256=pin(bootstrap_path)['sha256'],kvm=dict(identity=[1]*4,rdev=os.makedev(10,232)))
    seed.check_dependency=lambda *arguments:None
    assert guest.verify_seed(guest_request)['lineage']==lineage_fields
    os.utime(raw_path,ns=(raw_path.stat().st_atime_ns,raw_path.stat().st_mtime_ns+1))
    assert seed.read_lineage(continued)['repairRequestDigest']==pin(recovery_path)['sha256']
    assert guest.verify_seed(guest_request,current=False)['lineage']==lineage_fields
    print('conditional-recovery-continuation')
`;

const legacyRelabel = String.raw`
    legacy=dict(original,nonce='2'*32,expectedRaw=expected,postBootEvidence=str(after_path))
    if phase_fault!='v1-marked':
        relabeled=state/'relabeled-postboot.json';changed=repair.read_record(after_path);del changed['afterFailedRepair'];put(relabeled,changed)
        legacy['postBootEvidence']=str(relabeled)
    legacy_metadata={legacy[key] for key in ('image','rawRequest','rawReceipt','rawProvenance','priorGuestRequest','priorGuestFailure','postBootEvidence','witness')}
    legacy_metadata|={str(guest_seed),str(allocation)}
    legacy['pins']=[entry for entry in recovery['pins'] if entry['path'] in legacy_metadata or entry['path'] in native_paths or entry['path'].startswith(str(helpers)+'/')]
    if phase_fault!='v1-marked':legacy['pins'].append(pin(relabeled))
    class ForbiddenReadonly(Exception):pass
    admitted_history=False
    native_history=repair.verify_history
    def verify_history(selected):
        global admitted_history
        history=native_history(selected)
        if selected is legacy:admitted_history=True
        return history
    repair.verify_history=verify_history
    private=raw.open_private
    def open_private(path,*arguments,**keywords):
        if phase_fault=='v1-marked' and admitted_history and str(path)==str(state):raise ForbiddenReadonly()
        return private(path,*arguments,**keywords)
    raw.open_private=open_private
    original_open=repair.open_original
    def open_original(path,*arguments):
        if phase_fault!='v1-marked' and str(path)==str(raw_path):raise ForbiddenReadonly()
        return original_open(path,*arguments)
    repair.open_original=open_original
    try:
        repair.check_request(legacy)
        repair.coordinator(legacy,str(state/'never-published'),raw.digest_json(legacy))
    except raw.PreparationRefusal as failure:
        assert omission=='none' and str(failure)=='repair-recovery-required',failure
        assert not (state/('raw-repair-'+legacy['nonce'])).exists()
        print('protected-v1-relabel');sys.exit(0)
    except ForbiddenReadonly:
        assert omission!='none',('unsafe v1 relabel reached readonly admission',phase_fault)
        print('unsafe-v1-readonly');sys.exit(0)
    raise AssertionError('legacy relabel admitted')
`;

function recoveryFixture() {
  return settlementFixture
    .replace(
      '            def visit_Expr(self,node):',
      "            def visit_Expr(self,node):\n                if omission=='failed-history-dependency' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='read_failed_relation':\n                    changed.append(omission);return ast.Pass()\n                if omission=='recovery-qualification' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='qualify_failed_source':\n                    changed.append(omission);return ast.Pass()",
    )
    .replace(
      "dict(nonce='0'*32,image=str(image),pins=[historic_source])",
      "dict(nonce='0'*32,root=str(root),state=str(state),image=str(image),pins=[historic_source])",
    )
    .replace(
      '    original=dict(schemaVersion=1',
      `${historical}\n    original=dict(schemaVersion=1`,
    )
    .replace(
      'priorGuestRequest=str(unused),priorGuestFailure=str(unused),postBootEvidence=str(unused)',
      'priorGuestRequest=str(guest_request),priorGuestFailure=str(guest_failure),postBootEvidence=str(postboot)',
    )
    .replace(
      'witness=str(witness),expectedRaw=expected)',
      'witness=str(witness),expectedRaw=old_expected)',
    )
    .replace('old_source,expected,0)', 'old_source,old_expected,0)')
    .replace(
      "reservation=reservation,snapshot=expected,mapDigest='e'*64",
      "reservation=reservation,snapshot=old_expected,mapDigest='e'*64",
    )
    .replace("    print('accepted-G-only-K-retained')", consume);
}

test('repair recovery validates both captures through the complete conditional settlement reader', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-S', '-c', recoveryFixture(), import.meta.dir, 'complete'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toContain('conditional-recovery-relation');
});

function expectRecoveryBudget(stdout: string) {
  const line = stdout.split('\n').find((entry) => entry.startsWith('recovery-budget:'));
  if (!line) throw new Error('recovery budget absent');
  const budget: unknown = JSON.parse(line.slice('recovery-budget:'.length));
  if (typeof budget !== 'object' || budget === null) throw new Error('invalid recovery budget');
  expect(budget).toHaveProperty('conditional', true);
  expect(budget).toHaveProperty('descriptorLimit', 64);
  for (const name of [
    'aggregateSourceBytes',
    'requestBytes',
    'heldEvidenceFiles',
    'heldEvidenceBytes',
    'maximumEvidenceBytes',
    'selectedMetadataFiles',
    'readyFrameBytes',
    'outsidePhysicalBytes',
  ]) {
    const value: unknown = Reflect.get(budget, name);
    expect(value).toBeGreaterThan(0);
  }
  const peak: unknown = Reflect.get(budget, 'peakDescriptorsIncludingMeasurement');
  const maximum: unknown = Reflect.get(budget, 'maximumDescriptorIncludingMeasurement');
  expect(peak).toBeLessThanOrEqual(64);
  expect(maximum).toBeLessThan(64);
  console.info(line);
}

test('repair recovery traverses actual coordinator and worker observations before writing', () => {
  const script = recoveryFixture().replace("    print('conditional-recovery-relation')", producer);
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-S', '-c', script, import.meta.dir, 'complete'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toContain('conditional-recovery-producer');
  expectRecoveryBudget(invocation.stdout.toString());
});

// Proof: the old fixed scratch writer reaches FileNotFoundError with this owned missing parent.
test('repair recovery exports its budget with an absent prior scratch directory', () => {
  const script = recoveryFixture()
    .replace("    print('conditional-recovery-relation')", producer)
    .replace(
      '    accepted=repair.coordinator(',
      String.raw`
    write_text=pathlib.Path.write_text
    def owned_write(path,*arguments,**keywords):
        if not path.is_relative_to(root):
            path=root/'absent-prior-scratch'/'producer-budget.json'
        return write_text(path,*arguments,**keywords)
    pathlib.Path.write_text=owned_write
    print('EXERCISE owned budget interception installed')
    accepted=repair.coordinator(`,
    );
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-S', '-c', script, import.meta.dir, 'complete'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toContain('conditional-recovery-producer');
  // Proof: omitting interception plus marker leaves the component successful but fails this assertion.
  expect(invocation.stdout.toString()).toContain('EXERCISE owned budget interception installed');
  expectRecoveryBudget(invocation.stdout.toString());
});

function relationAdmissionFixture() {
  const beforeValidation = recoveryFixture().split(
    '    try:\n        repair.check_request(recovery)\n        relation=writer.read_failed_source(repair,recovery)',
  )[0];
  const beforeAdmission = producer.split('    accepted=repair.coordinator(')[0];
  if (!beforeValidation || !beforeAdmission)
    throw new Error('relation admission fixture boundary absent');
  return (
    beforeValidation +
    beforeAdmission +
    String.raw`
    class ForbiddenOriginalOpen(Exception):pass
    def forbidden_original(*arguments):raise ForbiddenOriginalOpen()
    repair.open_original=forbidden_original
    try:
        repair.check_request(recovery)
        repair.coordinator(recovery,str(recovery_path),raw.digest_json(recovery))
    except raw.PreparationRefusal:
        assert omission=='none'
        assert not (state/('raw-repair-'+recovery['nonce'])).exists()
        print('protected-admission');sys.exit(0)
    except ForbiddenOriginalOpen:
        assert omission!='none'
        print('unsafe-original-readonly');sys.exit(0)
    raise AssertionError('unobserved admission boundary')
`
  );
}

const relationFaults = [
  ['observation:shape', 'repair-shape-invalid'],
  ['observation:claim', 'repair-recovery-observation'],
  ['observation:map-bool', 'repair-recovery-map'],
  ['observation:map-accounting', 'repair-recovery-map'],
  ['observation:join', 'repair-recovery-history-join'],
  ['observation:time', 'repair-recovery-history-join'],
  ['capture:shape', 'repair-shape-invalid'],
  ['capture:availability', 'repair-recovery-capture'],
  ['capture:binding', 'repair-recovery-capture-join'],
  ['capture:reference', 'repair-recovery-capture-reference'],
  ['capture:terminal', 'repair-recovery-capture-terminal'],
  ['nonce', 'repair-recovery-nonce'],
  ['existing-nonce', 'repair-recovery-nonce'],
  ['semantic-depth', 'repair-recovery-depth'],
  ['semantic-path', 'repair-recovery-request'],
  ['inheritance', 'repair-recovery-inheritance'],
  ['capture-selection', 'repair-recovery-selection'],
  ['missing-K', 'repair-recovery-settlement'],
  ['history-roles', 'repair-recovery-history-roles'],
  ['unqualified', 'recovery-qualification'],
  ['outside', 'repair-recovery-outside-bound'],
] as const;

for (const [fault, guard] of relationFaults) {
  test(`repair recovery ${fault} refuses; watched ${guard} omission crosses its boundary`, () => {
    for (const omission of ['none', guard]) {
      const invocation = Bun.spawnSync(
        [
          '/usr/bin/python3',
          '-I',
          '-B',
          '-S',
          '-c',
          relationAdmissionFixture(),
          import.meta.dir,
          'complete',
          omission,
          fault,
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stdout.toString()).toContain(
        omission === 'none' ? 'protected-' : 'unsafe-',
      );
    }
  });
}
for (const fault of ['missing', 'unreadable', 'malformed', 'capture:snapshot']) {
  test(`repair recovery ${fault} preserves refusal before relation credit`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-S',
        '-c',
        recoveryFixture(),
        import.meta.dir,
        'complete',
        'none',
        fault,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toContain('protected-relation:');
  });
}

test('repair recovery continues through seed history after successful successor mutation', () => {
  const script = recoveryFixture().replace(
    "    print('conditional-recovery-relation')",
    producer.replace("    print('conditional-recovery-producer')", continuation),
  );
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-S', '-c', script, import.meta.dir, 'complete'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toContain('conditional-recovery-continuation');
  expectRecoveryBudget(invocation.stdout.toString());
});

function failureFixture() {
  const beforeAdmission = producer.split('    accepted=repair.coordinator(')[0];
  if (!beforeAdmission) throw new Error('producer fixture boundary absent');
  return recoveryFixture().replace(
    "    print('conditional-recovery-relation')",
    beforeAdmission + failedSuccessor,
  );
}

test('repair recovery failed successor retains new G plus K and refuses second settlement before consumption', () => {
  for (const omission of ['none', 'settlement-global-consumed']) {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-S',
        '-c',
        failureFixture(),
        import.meta.dir,
        'complete',
        omission,
        'producer',
        'failed-successor',
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toContain(
      omission === 'none' ? 'failed-successor-G-plus-K-second-refused' : 'unsafe-second-consume',
    );
  }
});

test('repair recovery failed successor history validates its one immutable predecessor', () => {
  for (const omission of ['none', 'failed-history-dependency']) {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-S',
        '-c',
        failureFixture(),
        import.meta.dir,
        'complete',
        omission,
        'producer',
        'failed-history',
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toContain(
      omission === 'none' ? 'protected-failed-successor-history' : 'unsafe-failed-history-credit',
    );
  }
});

const producerFaults = [
  ['coordinator-map', 'repair-recovery-current-map'],
  ['worker-map', 'repair-recovery-current-map'],
  ['current-settlement', 'repair-recovery-settlement'],
  ['original-reused', 'repair-recovery-original-live'],
  ['capture-replacement', 'repair-evidence-changed'],
  ['capture-open-race', 'repair-evidence-changed'],
  ['prewrite-relation-dependency', 'repair-recovery-observation-changed'],
  ['source-replacement', 'repair-source-changed'],
  ['lock-released', 'repair-lock-invalid'],
  ['ready-capacity', 'repair-memory-floor'],
] as const;
function guardedProducerFixture() {
  const beforeAdmission = producer.split('    accepted=repair.coordinator(')[0];
  if (!beforeAdmission) throw new Error('producer fixture boundary absent');
  return recoveryFixture().replace(
    "    print('conditional-recovery-relation')",
    beforeAdmission +
      String.raw`
    try:repair.coordinator(recovery,str(recovery_path),raw.digest_json(recovery))
    except raw.PreparationRefusal:
        assert omission=='none',events_path.read_text()
        assert 'write' not in events_path.read_text().splitlines()
        assert 'writable-open' not in events_path.read_text().splitlines()
        print('protected-producer');sys.exit(0)
    assert omission!='none' and 'write' in events_path.read_text().splitlines()
    assert 'writable-open' in events_path.read_text().splitlines()
    print('unsafe-producer-write')
`,
  );
}
for (const [fault, guard] of producerFaults) {
  test(`repair recovery ${fault} stops before write; watched ${guard} omission writes`, () => {
    for (const omission of ['none', guard]) {
      const invocation = Bun.spawnSync(
        [
          '/usr/bin/python3',
          '-I',
          '-B',
          '-S',
          '-c',
          guardedProducerFixture(),
          import.meta.dir,
          'complete',
          omission,
          'producer',
          fault,
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stdout.toString()).toContain(
        omission === 'none' ? 'protected-producer' : 'unsafe-producer-write',
      );
    }
  });
}
for (const fault of ['original-live', 'original-foreign']) {
  test(`repair recovery ${fault} refuses the actual current terminal observation`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-S',
        '-c',
        guardedProducerFixture(),
        import.meta.dir,
        'complete',
        'none',
        'producer',
        fault,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toContain('protected-producer');
  });
}

function legacyFixture(pending: boolean) {
  const beforeAdmission = producer.split('    accepted=repair.coordinator(')[0];
  const beforeSettlement = recoveryFixture().split(
    '    try:envelope=writer.coordinate_settlement(context)',
  )[0];
  const beforeRelation = consume.split('    fault=sys.argv[4]')[0];
  if (!beforeAdmission || !beforeSettlement || !beforeRelation)
    throw new Error('legacy fixture boundary absent');
  if (pending)
    return (
      beforeSettlement +
      beforeRelation +
      '\n    fault="producer"\n    descriptor=os.open(raw_path,os.O_RDONLY);os.fsync(descriptor);os.close(descriptor)\n' +
      beforeAdmission +
      legacyRelabel
    );
  return recoveryFixture().replace(
    "    print('conditional-recovery-relation')",
    beforeAdmission + legacyRelabel,
  );
}
for (const phase of ['v1-marked', 'v1-pending', 'v1-settled']) {
  test(`repair recovery ${phase} rejects relabel before readonly admission; watched omission crosses`, () => {
    for (const omission of ['none', 'repair-recovery-required']) {
      const invocation = Bun.spawnSync(
        [
          '/usr/bin/python3',
          '-I',
          '-B',
          '-S',
          '-c',
          legacyFixture(phase === 'v1-pending'),
          import.meta.dir,
          'complete',
          omission,
          'producer',
          phase,
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stdout.toString()).toContain(
        omission === 'none' ? 'protected-v1-relabel' : 'unsafe-v1-readonly',
      );
    }
  });
}
