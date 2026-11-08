import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types

spec = importlib.util.spec_from_file_location('seed', sys.argv[1])
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)
fault = sys.argv[2]
if fault in ('runtime', 'seed-runtime'):
    native_spec=importlib.util.spec_from_file_location
    absent='lab-raw-repair.py' if fault=='runtime' else 'lab-repair-lineage.py'
    importlib.util.spec_from_file_location=lambda name,path:None if str(path).endswith(absent) else native_spec(name,path)
    try:seed.load_lineage()
    except seed.raw.PreparationRefusal as failure:
        assert str(failure)==('continued-runtime-unavailable' if fault=='runtime' else 'seed-lineage-unavailable')
        print('continued lineage '+fault);sys.exit(0)
    raise AssertionError('missing runtime accepted')
lineage = seed.load_lineage()
repair = lineage.repair
raw = seed.raw
fault = sys.argv[2]
if os.environ.get('LINEAGE_GUARD_FAULT'):
    native_require = lineage.require
    def bypass(predicate, category):
        if category != os.environ['LINEAGE_GUARD_FAULT']:
            native_require(predicate, category)
    lineage.require = bypass
    repair.require = bypass

with tempfile.TemporaryDirectory() as root:
    state = root + '/.puni/fleet-labs/observability-baseline'
    os.makedirs(state, mode=0o700)
    pins = {}
    def write(path, content, mode=0o600):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.parent.chmod(0o700)
        payload = raw.encode_json(content)
        path.write_bytes(payload)
        path.chmod(mode)
        pins[str(path)] = dict(path=str(path), sha256=hashlib.sha256(payload).hexdigest(),
                               bytes=len(payload), uid=os.geteuid(), mode=mode)
        return str(path)
    def record(name, content):
        return write(state + '/' + name, content)
    def digest(path):
        return pins[path]['sha256']
    def rejected(operation):
        try:
            operation()
        except (raw.PreparationRefusal, OSError, ValueError, TypeError, KeyError):
            return
        raise AssertionError('unsafe continued handoff ' + fault)
    terminal = dict(LoadState='not-found', MainPID='0', ActiveState='inactive', SubState='dead',
                    Result='success', ExecMainStatus='0', InvocationID='', ControlGroup='')
    capacity = dict(availableMemoryBytes=4160749568, freeBytes=400*1024**3,
                    allocatedBytes=8*1024**3, observedNs=4)
    trust = 'independently-selected-content-pins; signatures remain separate input provenance'
    raw_nonce = 'd'*32
    raw_directory = state + '/raw-' + raw_nonce
    os.mkdir(raw_directory, 0o700)
    path = raw_directory + '/disk.raw'
    Path(path).write_bytes(b'original tiny contents')
    os.chmod(path, 0o600)
    snapshot = repair.snapshot_file(os.lstat(path))
    snapshot['logicalBytes'] = '8589934592'
    identity = raw.identity(os.lstat(path))
    creator = raw.identity(os.lstat(raw_directory))
    historical_source = dict(path=root+'/historical.py', sha256='7'*64, bytes=100, uid=os.geteuid(), mode=0o644)
    image = record('image', dict(selected=True))
    original_request = dict(root=root, state=state, nonce=raw_nonce, image=image, pins=[historical_source])
    raw_request = record('raw-request', original_request)
    raw_binding = dict(pid=123, start='1', unit='puni-raw-'+raw_nonce+'.service', invocation='e'*32,
                       cgroup='/system.slice/puni-raw-'+raw_nonce+'.service', nonce=raw_nonce,
                       creator=creator, raw=identity, rawFd=4, image=[1]*8, imageFd=5,
                       tool=[2]*8, toolFd=6, python=[3]*8,
                       source=raw.digest_json({historical_source['path']:'7'*64}), request=digest(raw_request))
    raw_receipt = record('raw-'+raw_nonce+'/receipt.json', dict(schemaVersion=1, scope='raw-preparation',
        accepted=True, guestAuthority=False, fullRehearsalAuthority=False, requestDigest=digest(raw_request),
        sourceDigest=raw_binding['source'], binding=raw_binding, counterDigest='6'*64,
        measurementPhase='after-converter-before-worker-exit', counterPersistence='coordinator-fsync-before-worker-durability-ack',
        terminal=terminal, groupEvents=None, finalCapacity=capacity, finishedNs=4, trust=trust, rawBytes=raw.RAW_BYTES))
    record('raw-'+raw_nonce+'/allocation.json', dict(after=dict(identity={},mapDigest='1'*64)))
    raw_provenance = record('raw-provenance', dict(schemaVersion=1, sourceRevision='9'*40,
        sourcePins=[historical_source], requestDigest=digest(raw_request), receiptDigest=digest(raw_receipt)))
    prior_seed = record('prior-seed', dict(nonce='1'*32, image=image, rawRequest=raw_request,
        rawReceipt=raw_receipt, rawProvenance=raw_provenance,
        members={'user-data':dict(path=state+'/old-user-data',sha256='0'*64), 'meta-data':dict(path=state+'/old-meta-data',sha256='0'*64)}))
    guest_nonce = '2'*32
    guest_request = dict(root=root, state=state, nonce=guest_nonce, pins=[historical_source], seedRequest=prior_seed)
    prior_guest = record('prior-guest', guest_request)
    prior_failure = record('prior-failure', dict(schemaVersion=1, scope='independent-failed-guest-attempt-observation',
        accepted=False, acceptedReceiptAvailable=False, guestBootObserved=True, fullRehearsalAuthority=False,
        requestDigest=digest(prior_guest), binding=dict(rawPath=path, raw=[float(value) for value in identity] if fault=='typed-failure' else identity, nonce=guest_nonce,
            request=digest(prior_guest), source=raw.digest_json({historical_source['path']:'7'*64}), seedNonce='1'*32),
        terminal=terminal, groupEvents=None, failure=dict(cleanup='verified-original-unit-empty')))
    post_boot = record('post-boot', dict(schemaVersion=1, scope='independent-read-only-repair-source',
        originalFailedGuest=guest_nonce, contentRead=False, rawWrite=False, repairAuthorized=False,
        observation=dict(identity={key:(float(snapshot[key]) if key=='owner' and fault=='typed-post-boot' else snapshot[key]) for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},
                         allocatedBytes=int(snapshot['allocatedBytes']))))
    witness = record('request.sha256', dict(witness=True))
    repair_request = dict(schemaVersion=1, root=root, state=state, nonce='a'*32, image=image,
        rawRequest=raw_request, rawReceipt=raw_receipt, rawProvenance=raw_provenance,
        priorGuestRequest=prior_guest, priorGuestFailure=prior_failure, postBootEvidence=post_boot,
        expectedRaw=snapshot, witness=witness, pins=[historical_source, *pins.values()])
    repair_request_path = record('repair-request', repair_request)
    source_digest = raw.digest_json({pin['path']:pin['sha256'] for pin in repair_request['pins']})
    directory = state+'/raw-repair-'+'a'*32
    os.mkdir(directory, 0o700)
    reservation = repair.make_reservation('a'*32, digest(repair_request_path), source_digest, snapshot, 0)
    binding = dict(pid=123,start='1',unit='puni-raw-repair-'+'a'*32+'.service',invocation='e'*32,
        cgroup='/system.slice/puni-raw-repair-'+'a'*32+'.service',nonce='a'*32,
        creator=raw.identity(os.lstat(directory)), originalCreator=creator, originalFd=4,
        raw=identity,rawFd=5,rawPath=path,staging=raw.identity(os.lstat(state)),stagingFd=6,
        python=[1]*8,inputs={},evidence={},source=source_digest,request=digest(repair_request_path),
        reservationDigest=raw.digest_json(reservation))
    allocation=dict(identity={key:snapshot[key] for key in ('device','inode','owner','mode','links','mtimeNs','ctimeNs')},
        expectedBytes=raw.RAW_BYTES,coverageBytes=raw.RAW_BYTES,allocatedBytes=int(snapshot['allocatedBytes']),mapDigest='f'*64,
        provider='linux-fiemap',inspectorVersion=1,observations=dict(kernelRelease='controlled',pythonVersion='controlled'),
        allocationOverheadBytes=int(snapshot['allocatedBytes'])-raw.RAW_BYTES,extentCount=1,pageCount=1,metadataBytes=88)
    repair_artifact = dict(schemaVersion=1,lineage='continued-guest',before=snapshot,after=snapshot,
        logicalSha256Before='4'*64,logicalSha256After='4'*64,readBytes=str(raw.RAW_BYTES),
        rewrittenBytes=str(raw.RAW_BYTES),allocation=allocation)
    counter=dict(binding=binding,startedNs=2,finishedNs=3,caps=raw.CAPS,
        counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0',
                  'cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'},
        rewritten=True,bytePreserved=True,initialized=True)
    artifact=dict(schemaVersion=1,repair=repair_artifact,originalReceiptDigest=digest(raw_receipt),
        failedGuestDigest=digest(prior_failure),requestDigest=binding['request'],sourceDigest=source_digest,
        reservationDigest=raw.digest_json(reservation),counterDigest=raw.digest_json(counter),
        guestAuthority=False,fullRehearsalAuthority=False,grossDebtRetained=True)
    profile=dict(filesystem='ext4',blockBytes=4096,clusterBytes=4096,inodeFlags=524288,delalloc=True,
        dioreadNolock=True,dataMode='ordered',kernelRelease='7.0.11-76070011-generic',
        kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',rawDevice=snapshot['device'],
        witnessDevice=snapshot['device'],witnessBytes=79,witnessAllocatedBytes=4096,witnessStable=True,
        witnessRegular=True,rawRegular=True)
    certificate=dict(schemaVersion=1,nonce='a'*32,requestDigest=binding['request'],sourceDigest=source_digest,
        reservationDigest=raw.digest_json(reservation),bindingDigest=raw.digest_json(binding),
        counterDigest=raw.digest_json(counter),repairDigest=raw.digest_json(artifact),directory=binding['creator'],
        profile=profile,publication='exclusive-counter-dir-before-exclusive-repair-dir',
        quiescence='sole-original-worker-reaped-child-original-fd-drained',cleanup='verified-original-unit-empty',
        terminal=terminal,groupEvents=None,finalSnapshot=snapshot,issuedNs=4)
    receipt=dict(schemaVersion=1,scope='raw-repair-preparation',accepted=True,guestAuthority=False,
        fullRehearsalAuthority=False,requestDigest=binding['request'],sourceDigest=source_digest,binding=binding,
        counterDigest=raw.digest_json(counter),measurementPhase=repair.RepairCoordinator.measurement_phase,
        counterPersistence='coordinator-fsync-before-worker-durability-ack',terminal=terminal,groupEvents=None,
        finalCapacity=dict(availableMemoryBytes=4160749568,freeBytes=400*1024**3,retainedInodeBytes=8192,
                           otherFutureReservations=0,observedNs='5',grossDebtRetained=True),
        finishedNs=5,repairDigest=raw.digest_json(artifact),releaseDigest=raw.digest_json(certificate),
        rawBytes=raw.RAW_BYTES,lineage='continued-guest',grossDebtRetained=False,trust=trust)
    records={'reservation.json':reservation,'worker-counter.json':counter,'repair.json':artifact,
        'release.json':certificate,'receipt.json':receipt,
        'worker-ready.json':dict(phase='ready',binding=binding,observedNs=1,reservation=reservation,
                                  snapshot=snapshot,mapDigest='3'*64),
        'request-binding.json':dict(requestDigest=binding['request'],sourceDigest=source_digest,initial={},unitBefore={})}
    for name,content in records.items():write(directory+'/'+name,content)
    envelope=dict(schemaVersion=1,scope='raw-repair-preparation',accepted=True,nonce='a'*32,
        receiptDigest=digest(directory+'/receipt.json'),guestAuthority=False,fullRehearsalAuthority=False)
    provenance=dict(schemaVersion=1,sourceRevision='8'*40,sourcePins=[historical_source],
        requestDigest=digest(repair_request_path),receiptDigest=envelope['receiptDigest'],envelope=envelope)
    provenance_path=record('repair-provenance',provenance)
    nonce='b'*32
    members={}
    for name in seed.MEMBERS:
        content={'instance-id':'puniq-'+nonce,'local-hostname':'puni-baseline'} if name=='meta-data' else {'member':name}
        member=record('new/'+name,content)
        members[name]={key:pins[member][key] for key in ('path','sha256','bytes')}
    request=dict(schemaVersion=2,lineage='continued-guest',root=root,state=state,nonce=nonce,pins=list(pins.values()),
        image=image,rawRequest=raw_request,rawReceipt=raw_receipt,rawProvenance=raw_provenance,
        repairRequest=repair_request_path,repairReceipt=directory+'/receipt.json',repairProvenance=provenance_path,
        members=members)
    history=seed.verify_raw_history(request)
    # Model only large metadata and FIEMAP; real trusted records and tiny target use production IO.
    native_snapshot=repair.snapshot_file
    repair.snapshot_file=lambda observed:dict(native_snapshot(observed),logicalBytes='8589934592')
    initialized=[]
    def inspect(path_,length,**options):
        assert path_==path and length==8589934592
        initialized.append(options)
        return copy.deepcopy(allocation)
    raw.load_inspector=lambda:types.SimpleNamespace(inspect_file=inspect)
    def refresh():request['pins']=list(pins.values())
    def publish(name,content):write(directory+'/'+name,content);refresh()
    def accept():return lineage.verify_lineage(request,history,seed.read_pinned_json)
    if fault in ('typed-failure','typed-post-boot'):
        rejected(accept);print('continued lineage '+fault);sys.exit(0)
    if fault.startswith('guest-'):

        guest_spec=importlib.util.spec_from_file_location('guest',Path(sys.argv[1]).with_name('lab-guest-preparation.py'))
        guest=importlib.util.module_from_spec(guest_spec);guest_spec.loader.exec_module(guest)
        guest.raw=raw;guest.require=raw.require;guest.seed=seed
        seed.load_lineage=lambda:lineage
        bootstrap=b'controlled corrected bootstrap'
        bootstrap_path=str(Path(root)/'tools/tool-fleet/src/lab-guest-bootstrap.py')
        Path(bootstrap_path).parent.mkdir(parents=True,exist_ok=True)
        Path(bootstrap_path).write_bytes(bootstrap);Path(bootstrap_path).chmod(0o644)
        pins[bootstrap_path]=dict(path=bootstrap_path,sha256=hashlib.sha256(bootstrap).hexdigest(),bytes=len(bootstrap),uid=os.geteuid(),mode=0o644)
        cloud={'write_files':[dict(path='/opt/puni-baseline/bootstrap.py',content=bootstrap.decode()),
            dict(path='/opt/puni-baseline/request.json',content=json.dumps(dict(schemaVersion=1,nonce=nonce,bootstrapSha256=pins[bootstrap_path]['sha256'])))]}
        user_path=members['user-data']['path'];payload=b'#cloud-config\n'+raw.encode_json(cloud)
        Path(user_path).write_bytes(payload)
        pins[user_path].update(sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload))
        for name,member in members.items():
            Path(member['path']).chmod(0o400);pins[member['path']]['mode']=0o400
            members[name]={key:pins[member['path']][key] for key in ('path','sha256','bytes')}
        request['members']=members
        dependency_path=record('dependency',dict(inputBindings=[],tools=[]))
        request.update(dependencyReport=dependency_path,provenance=[raw_provenance]);refresh()
        seed_request_path=record('new-seed-request',request)
        seed_directory=state+'/seed-'+nonce;os.mkdir(seed_directory,0o700)
        iso_path=write(seed_directory+'/seed.iso',dict(tiny=True))
        seed_binding=dict(pid=123,start='1',unit='puni-seed-'+nonce+'.service',invocation='e'*32,
            cgroup='/system.slice/puni-seed-'+nonce+'.service',nonce=nonce,creator=raw.identity(os.lstat(seed_directory)),
            iso=raw.identity(os.lstat(iso_path)),isoFd=4,python=[1]*8,source=raw.digest_json({pin['path']:pin['sha256'] for pin in request['pins']}),
            request=digest(seed_request_path),inputs={name:dict(fd=5,identity=[1]*8) for name in (*seed.MEMBERS,'genisoimage','isoinfo')})
        lineage_fields=seed.read_lineage(request)
        seed_receipt=dict(scope='seed-preparation',accepted=True,guestAuthority=False,
            fullRehearsalAuthority=False,requestDigest=digest(seed_request_path),sourceDigest=seed_binding['source'],
            binding=seed_binding,counterDigest='6'*64,measurementPhase='after-seed-before-worker-exit',
            counterPersistence='coordinator-fsync-before-worker-durability-ack',terminal=terminal,groupEvents=None,
            finalCapacity=capacity,finishedNs=5,trust=trust,isoBytesLimit=seed.ISO_BYTES,memberBytesLimit=seed.MEMBER_BYTES,
            dependencyReport=dependency_path,rawReceipt=raw_receipt,**lineage_fields)
        seed_receipt_path=write(seed_directory+'/receipt.json',seed_receipt)
        write(seed_directory+'/iso.json',dict(bytes=pins[iso_path]['bytes'],sha256=digest(iso_path),
            memberBytes=sum(member['bytes'] for member in members.values()),
            members={name:{key:member[key] for key in ('bytes','sha256')} for name,member in members.items()},
            namespaces=['iso9660','joliet','rock-ridge']))
        selected_source=[pin for pin in request['pins'] if pin['path'].startswith(root+'/') and not pin['path'].startswith(state+'/')]
        seed_provenance_path=record('seed-provenance',dict(schemaVersion=1,sourceRevision='5'*40,sourcePins=selected_source,
            requestDigest=digest(seed_request_path),receiptDigest=digest(seed_receipt_path)))
        guest_request=dict(schemaVersion=2,lineage='continued-guest',root=root,state=state,nonce='c'*32,pins=list(pins.values()),
            seedRequest=seed_request_path,seedReceipt=seed_receipt_path,seedProvenance=seed_provenance_path,
            bootstrapSha256=digest(bootstrap_path),kvm=dict(identity=[1]*4,rdev=os.makedev(10,232)))
        # Dependency report policy is separately covered by existing v1 tests; all lineage IO remains real.
        seed.check_dependency=lambda *args:None
        assert guest.verify_seed(guest_request)['lineage']==lineage_fields
        if fault=='guest-success':
            os.utime(path,ns=(os.lstat(path).st_atime_ns,os.lstat(path).st_mtime_ns+1))
            assert guest.verify_seed(guest_request,current=False)['lineage']==lineage_fields
            def coordinate(selected,path_,digest_,adapter):
                native=adapter.receipt_fields({})
                assert native['schemaVersion']==2 and native['repairReceiptDigest']==envelope['receiptDigest']
                assert native['guestPoweroffVerified'] is True and native['hostCleanupVerified'] is True
                return native
            raw.coordinate_attempt=coordinate
            guest.coordinator(guest_request,'/controlled/request','a'*64)
        elif fault=='guest-mixed':
            guest_request['schemaVersion']=1;del guest_request['lineage']
            read_seed=seed.read_pinned_json
            def read_after_version(selected,path_):
                if path_==seed_receipt_path:raise AssertionError('mixed request reached receipt read')
                return read_seed(selected,path_)
            seed.read_pinned_json=read_after_version
            rejected(lambda:guest.verify_seed(guest_request))
        elif fault=='guest-native-mixed':
            seed_receipt['schemaVersion']=1;rejected(lambda:guest.check_receipt(seed_receipt,'seed',2))
        elif fault=='guest-native-type':
            seed_receipt['repairArtifactDigest']=True;rejected(lambda:guest.check_receipt(seed_receipt,'seed',2))
        elif fault=='guest-receipt-mixed':
            seed_receipt['schemaVersion']=1;write(seed_receipt_path,seed_receipt);guest_request['pins']=list(pins.values())
            rejected(lambda:guest.verify_seed(guest_request))
        elif fault=='guest-digest':
            seed_receipt['repairArtifactDigest']='0'*64;write(seed_receipt_path,seed_receipt)
            seed_provenance=json.loads(Path(seed_provenance_path).read_bytes());seed_provenance['receiptDigest']=digest(seed_receipt_path)
            write(seed_provenance_path,seed_provenance);guest_request['pins']=list(pins.values())
            rejected(lambda:guest.verify_seed(guest_request))
        else:raise AssertionError(fault)
        print('continued lineage '+fault);sys.exit(0)
    accepted=accept()
    assert initialized==[{'require_initialized':True}]
    assert accepted['path']==path and accepted['receipt']['schemaVersion']==2
    assert accepted['receipt']['repairRequestDigest']==digest(repair_request_path)
    assert accepted['receipt']['repairReceiptDigest']==envelope['receiptDigest']
    assert accepted['receipt']['repairProvenanceDigest']==digest(provenance_path)
    assert accepted['receipt']['repairArtifactDigest']==digest(directory+'/repair.json')
    def rechain():
        artifact['counterDigest']=raw.digest_json(counter)
        certificate['bindingDigest']=raw.digest_json(binding)
        certificate['counterDigest']=receipt['counterDigest']=raw.digest_json(counter)
        certificate['repairDigest']=receipt['repairDigest']=raw.digest_json(artifact)
        receipt['releaseDigest']=raw.digest_json(certificate)
        for name,content in records.items():write(directory+'/'+name,content)
        envelope['receiptDigest']=provenance['receiptDigest']=digest(directory+'/receipt.json')
        write(provenance_path,provenance);refresh()
    if fault=='seed-route':
        seed.load_lineage=lambda:lineage
        assert seed.verify_raw(request)['receipt']==accepted['receipt']
    elif fault=='history-dependency':
        original_history=repair.verify_history
        repair.verify_history=lambda selected:dict(original_history(selected),path=path+'foreign')
        rejected(accept)
    elif fault=='receipt-path':
        alias=record('alias-repair-receipt',receipt);request['repairReceipt']=alias;refresh();rejected(accept)
    elif fault=='joined-history':
        artifact['originalReceiptDigest']='0'*64;rechain();rejected(accept)
    elif fault=='directory-change':
        reader=repair.read_release
        def moved(*args):
            accepted=reader(*args)
            os.rename(directory,directory+'-retained');os.mkdir(directory,0o700)
            return accepted
        repair.read_release=moved;rejected(accept)
    elif fault=='release-dependency':
        repair.read_release=lambda *args:False;rejected(accept)
    elif fault=='creator-dependency':
        history['binding']['creator']=[0]*4
        rejected(lambda:lineage.check_admission(history,artifact['repair']))
    elif fault=='original-pins':
        pins[witness]=dict(pins[witness],sha256='0'*64);refresh();rejected(accept)
    elif fault=='original-history':
        request['image']=state+'/foreign-image';rejected(accept)
    elif fault=='handoff':
        import ast
        guest_spec=importlib.util.spec_from_file_location('guest',Path(sys.argv[1]).with_name('lab-guest-preparation.py'))
        guest=importlib.util.module_from_spec(guest_spec);guest_spec.loader.exec_module(guest)
        tree=ast.parse(Path(guest.__file__).read_text())
        worker=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='worker')
        prepare=next(node for node in ast.walk(worker) if isinstance(node,ast.FunctionDef) and node.name=='prepare')
        handed=[]
        def noop(*args):pass
        namespace=dict(guest.__dict__,request=request,predecessor=dict(raw=path,rawIdentity=identity,
            admission=dict(history=history,artifact=artifact['repair'])),binding={},descriptors=dict(raw=4,qemu=5,kvm=6,null=7),
            staging_fd=8,directory_fd=9,check_original_raw=noop,check_input_descriptors=noop,check_kvm=noop,
            check_raw_geometry=noop,confine_qemu=lambda *args:handed.append(True),install_geometry_filter=noop,
            seed=types.SimpleNamespace(load_lineage=lambda:lineage))
        request['kvm']={}
        namespace['os']=types.SimpleNamespace(close=noop)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[prepare],type_ignores=[])),guest.__file__,'exec'),namespace)
        namespace['prepare']();assert handed==[True],'valid snapshot did not reach writable handoff'
        handed.clear()
        os.utime(path,ns=(os.lstat(path).st_atime_ns,os.lstat(path).st_mtime_ns+1))
        rejected(namespace['prepare']);assert handed==[],'writable handoff preceded snapshot validation'
    elif fault.startswith('before-'):
        selected=copy.deepcopy(artifact['repair']['before'])
        expected=raw.encode_json(repair_request['expectedRaw'])
        after=raw.encode_json(artifact['repair']['after'])
        change=fault.removeprefix('before-')
        if change=='owner-float':selected['owner']=float(selected['owner'])
        elif change=='owner-bool':selected['owner']=bool(selected['owner'])
        elif change=='links-bool':selected['links']=True
        elif change=='links-float':selected['links']=float(selected['links'])
        elif change=='extra':selected['foreign']=True
        elif change=='mtime-number':selected['mtimeNs']=int(selected['mtimeNs'])
        elif change=='mtime-precision':selected['mtimeNs']=str(int(selected['mtimeNs'])+1)
        else:raise AssertionError(fault)
        artifact['repair']['before']=selected
        rechain()
        assert raw.encode_json(repair_request['expectedRaw'])==expected
        assert raw.encode_json(artifact['repair']['after'])==after
        # Before validation must precede the audited release consumer, not rely on later equality.
        release_reads=[];read_release=repair.read_release
        def release_after_before(*args):
            release_reads.append(True)
            return read_release(*args)
        repair.read_release=release_after_before
        rejected(accept)
        assert release_reads==[],'malformed before snapshot reached audited release'
    elif fault.startswith('typed-'):

        change=fault.removeprefix('typed-')
        if change=='binding-extra':binding['foreign']=True
        if change=='repeat':records['worker-ready.json']['binding']=dict(binding,rawFd=5.0)
        if change=='fd':binding['rawFd']=5.0
        if change=='pid':binding['pid']=123.0
        if change=='owner':binding['raw'][2]=float(binding['raw'][2])
        if change=='creator':binding['creator'][2]=float(binding['creator'][2])
        if change=='allocation':allocation['coverageBytes']=float(raw.RAW_BYTES)
        if change=='allocation-extra':allocation['foreign']=True
        if change=='ready':records['worker-ready.json']['foreign']=True
        if change=='ready-schema':records['worker-ready.json']['phase']='foreign'
        if change=='terminal':terminal['foreign']='value'
        if change=='rawBytes':receipt['rawBytes']=float(raw.RAW_BYTES)
        rechain();rejected(accept)
    elif fault=='success':
        # Permitted guest write timestamps do not revoke immutable continued lineage.
        os.utime(path,ns=(os.lstat(path).st_atime_ns,os.lstat(path).st_mtime_ns+1))
        lineage.verify_lineage(request,history,seed.read_pinned_json,current=False)
    elif fault.startswith('provenance-'):
        change=fault.removeprefix('provenance-')
        if change=='absent':Path(provenance_path).unlink()
        elif change=='unreadable':Path(provenance_path).chmod(0)
        elif change=='malformed':Path(provenance_path).write_bytes(b'{')
        elif change=='changed':Path(provenance_path).write_bytes(b'changed bytes')
        else:
            if change=='extra':provenance['extra']=True
            if change=='bool':provenance['schemaVersion']=True
            if change=='source':provenance['sourcePins'][0]=dict(historical_source,sha256='0'*64)
            if change=='request':provenance['requestDigest']='0'*64
            if change=='receipt':provenance['receiptDigest']='0'*64
            write(provenance_path,provenance);refresh()
        rejected(accept)
    elif fault.startswith('envelope-'):
        change=fault.removeprefix('envelope-')
        if change=='absent':del provenance['envelope']
        elif change=='null':provenance['envelope']=None
        elif change=='failed':envelope['accepted']=False
        elif change=='authority':envelope['guestAuthority']=True
        elif change=='schema':envelope['schemaVersion']=True
        elif change=='nonce':envelope['nonce']='c'*32
        elif change=='receipt':envelope['receiptDigest']='0'*64
        elif change=='extra':envelope['extra']=True
        write(provenance_path,provenance);refresh();rejected(accept)
    elif fault=='snapshot':
        os.utime(path,ns=(os.lstat(path).st_atime_ns,os.lstat(path).st_mtime_ns+1));rejected(accept)
    elif fault=='numeric':
        artifact['repair']['after']['mtimeNs']=int(snapshot['mtimeNs']);publish('repair.json',artifact);rejected(accept)
    elif fault=='map':
        allocation['mapDigest']='0'*64;rejected(accept)
    elif fault=='identity':
        request['nonce']='1'*32;rejected(accept)
    elif fault=='metadata':
        write(members['meta-data']['path'],{'instance-id':'foreign','local-hostname':'puni-baseline'});refresh();rejected(accept)
    elif fault.startswith('record-'):
        name=fault.removeprefix('record-')
        if name=='failure':write(directory+'/failure.json',{'failed':True});refresh()
        else:
            selected=copy.deepcopy(records[name+'.json'])
            if name=='worker-counter':selected['counters']['memory.events']='oom 1\noom_kill 0'
            elif name=='release':selected['cleanup']='unknown'
            elif name=='repair':selected['originalReceiptDigest']='0'*64
            elif name=='reservation':selected['originalSnapshot']=dict(snapshot,ctimeNs='1')
            elif name=='request-binding':selected['sourceDigest']='0'*64
            elif name=='receipt':selected['binding']['rawPath']=path+'foreign'
            elif name=='worker-ready':selected['binding']['originalCreator']=[0]*4
            publish(name+'.json',selected)
        rejected(accept)
    else:raise AssertionError(fault)
print('continued lineage '+fault)
