import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const directory = new URL(
  '../../../openspec/changes/observability-environment-parity/evidence/',
  import.meta.url,
);
const builder = fileURLToPath(new URL('staging-native-prepare-draft.py', directory));
const bootstrap = fileURLToPath(new URL('staging-native-prepare-bootstrap.py', directory));

const fixture = String.raw`
import ast, builtins, hashlib, importlib.util, io, json, os, pathlib, signal, subprocess, sys, tempfile, time, types
builder_path, bootstrap_path, mode = sys.argv[1:]
source = pathlib.Path(builder_path).read_bytes()
root = pathlib.Path(builder_path).parents[4]
def load(payload=source):
    module = types.ModuleType('operator_component')
    module.BUILDER_SHA = 'e'*64
    module.OPERATOR_DEADLINE = time.monotonic()+45
    exec(payload if isinstance(payload,types.CodeType) else compile(payload, '<operator-component>', 'exec'), module.__dict__)
    return module
def control_module():
    path = pathlib.Path(builder_path).with_name('repair-native-control.py')
    module = types.ModuleType('operator_shared_fixture')
    module.__file__ = str(path)
    sys.modules[module.__name__] = module
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module
def remove_calls(payload, selected):
    tree = ast.parse(payload)
    class Remove(ast.NodeTransformer):
        def visit_Expr(self, node):
            call = node.value
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id in selected:
                return ast.copy_location(ast.Pass(), node)
            return self.generic_visit(node)
    tree = Remove().visit(tree)
    ast.fix_missing_locations(tree)
    return compile(tree, '<operator-watched-omission>', 'exec')
def omit_category(category):
    tree=ast.parse(source)
    class Remove(ast.NodeTransformer):
        def visit_Expr(self,node):
            if isinstance(node.value,ast.Call) and any(isinstance(argument,ast.Constant) and argument.value==category for argument in node.value.args):
                node.value.func=ast.Name(id='ignored_guard',ctx=ast.Load())
                return node
            return self.generic_visit(node)
    tree=Remove().visit(tree);ast.fix_missing_locations(tree)
    module=load(compile(tree,'<operator-category-omission>','exec'))
    module.ignored_guard=lambda *_:None
    return module
def composition(directory, selected=None):
    module=load() if selected is None else selected
    module.ROOT=str(directory);module.PLAN=str(directory/'.superpowers/sdd/observability-environment-parity')
    module.PACKET=module.PLAN+'/repair-native-controls';module.STATE=str(directory/'.puni/fleet-labs/observability-baseline')
    module.EXPECTED_SOURCE_COMMIT='a'*40
    for name in ('PREPARED','REVIEWED','APPROVED','LAUNCHED','CAPTURE'):
        setattr(module,name,str(directory/(name.lower()+'.json')))
    control=control_module()
    with control.select_purpose('staging-channel'):
        buffers={str(root/relative):(root/relative).read_bytes() for relative in control.select_sources()}
        with control.repository_loader(buffers):
            helpers=control.load_helpers();staging=control.load_staging()
    control.ROOT=directory;control.PURPOSE='staging-channel'
    control.authorize.__defaults__=(directory,);control.check_request.__defaults__=(directory,)
    pathlib.Path(module.PLAN).mkdir(parents=True,mode=0o700)
    packet=pathlib.Path(module.PACKET);packet.mkdir(mode=0o700)
    state=pathlib.Path(module.STATE);state.mkdir(parents=True,mode=0o700)
    old=packet/('fixtures-'+module.OLD_NONCE);old.mkdir(mode=0o700)
    snapshots={}
    for name,length in control.FIXTURES.items():
        if name=='allocation':length=4096
        if name=='truncate-fault':length=0
        path=old/name;path.write_bytes(b'x'*length);path.chmod(0o600)
        observed=path.stat()
        snapshots[name]=dict(device=observed.st_dev,inode=observed.st_ino,bytes=observed.st_size,
            allocatedBytes=observed.st_blocks*512,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    receipt=dict(fixtures=snapshots,fixtureAllocatedBytes=1544192,
        request='70112203211e480c759105ecc46b1da1d857684e540b0bfa9b27fbdf78ff16af')
    receipt_path=packet/('observation-'+module.OLD_NONCE+'-terminal.json')
    receipt_path.write_bytes(control.encode(receipt));receipt_path.chmod(0o600)
    module.OLD_TERMINAL_SHA=hashlib.sha256(receipt_path.read_bytes()).hexdigest()
    pins=[]
    for relative,limit,checksum in module.SOURCE_ROLES:
        path=directory/relative;path.parent.mkdir(parents=True,exist_ok=True)
        payload=(root/relative).read_bytes();path.write_bytes(payload);path.chmod(0o644)
        pins.append(dict(path=str(path),sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload),uid=os.geteuid(),mode=0o644))
    pins.extend(dict(path=path,sha256='d'*64,bytes=1,uid=0,mode=0o755) for path in module.TOOLS)
    snapshot=dict(allocatedBytes='8435834880',ctimeNs='1793841387709411042',device='66307',inode='21891946',
        links=1,logicalBytes='8589934592',mode='0600',mtimeNs='1793841387709411042',owner=os.geteuid())
    debt=helpers['repair'].make_reservation(module.DEBT_NONCE,
        '77160420ab64fbe534d3cdf5543a37ad10af4dbaaa0a4dba9ce1d7a67b20dd0e',
        '4f3c6c6c12da6a99c229650df34f495e81faec87bfbd30911948f89bcfb61de9',snapshot,154128384)
    def put_debt(record):
        attempt=state/('raw-repair-'+record['nonce']);attempt.mkdir(mode=0o700,exist_ok=True)
        for name,body in (('reservation.json',record),('request-binding.json',dict(requestDigest=record['requestDigest'],
                sourceDigest=record['sourceDigest'],initial={},unitBefore={}))):
            path=attempt/name;path.write_bytes(helpers['raw'].encode_json(body));path.chmod(0o600)
        return attempt
    put_debt(debt)
    lock=[helpers['raw'].acquire_staging(str(state))]
    module.ADMISSION=dict(pid=os.getpid(),start=helpers['raw'].process_start(os.getpid()),
        stagingFd=lock[0],staging=helpers['raw'].identity(os.fstat(lock[0])))
    module.runtime_pins=lambda _: [dict(path='/usr/lib/python3.12/encodings/ascii.py',sha256='d'*64,bytes=1,uid=0,mode=0o644)]
    profiles=[]
    def source_profile(request,deadline):
        profiles.append('source-profile')
        return control.digest(request['pins']+request['runtimePins']),types.MappingProxyType({})
    control.verify_environment=source_profile
    control.check_loaded_runtime=lambda *_:profiles.append('runtime-profile')
    original_getrlimit=control.resource.getrlimit
    effective={control.resource.RLIMIT_AS:134217728,control.resource.RLIMIT_FSIZE:65536,
        control.resource.RLIMIT_NOFILE:64,control.resource.RLIMIT_CORE:0,control.resource.RLIMIT_CPU:5}
    control.resource.getrlimit=lambda kind:(effective[kind],)*2
    original_uname=os.uname;original_statvfs=os.statvfs
    os.uname=lambda:types.SimpleNamespace(release='7.0.11-76070011-generic',version='fixture kernel',machine='x86_64')
    os.statvfs=lambda _:types.SimpleNamespace(f_bavail=78643200,f_frsize=4096)
    original_read_text=helpers['raw'].read_text
    helpers['raw'].read_text=lambda path,*args: 'MemAvailable: 67108864 kB\n' if path=='/proc/meminfo' else original_read_text(path,*args)
    helpers['raw'].observe_unit=lambda _:dict(LoadState='not-found',ActiveState='inactive',SubState='dead',
        MainPID='0',InvocationID='',ControlGroup='',Result='success',ExecMainStatus='0')
    def close():
        os.uname=original_uname;os.statvfs=original_statvfs;control.resource.getrlimit=original_getrlimit
        if lock[0] is not None:os.close(lock[0]);lock[0]=None
    return module,control,helpers,staging,pins,debt,put_debt,lock,profiles,close

def composed_ledger(scratch):
    for fault in ('missing','nonce','request','source','gross','other-gross','additional','omit-selection'):
        directory=scratch/fault;directory.mkdir(mode=0o700)
        module,control,helpers,staging,pins,debt,put,lock,profiles,close=composition(directory,
            omit_category('operator-original-g-missing-or-changed') if fault=='omit-selection' else None)
        try:
            request=dict(state=module.STATE)
            if fault=='missing':
                attempt=pathlib.Path(module.STATE)/('raw-repair-'+module.DEBT_NONCE)
                attempt.rename(directory/'old-debt-outside-state')
            elif fault in ('nonce','request','source','gross','other-gross','omit-selection'):
                if fault=='nonce':
                    (pathlib.Path(module.STATE)/('raw-repair-'+debt['nonce'])).rename(directory/'old-debt-outside-state')
                    debt['nonce']='f'*32
                elif fault in ('request','omit-selection'):debt['requestDigest']='f'*64
                elif fault=='source':debt['sourceDigest']='f'*64
                elif fault=='other-gross':debt=helpers['repair'].make_reservation(debt['nonce'],debt['requestDigest'],debt['sourceDigest'],debt['originalSnapshot'],154132480)
                else:debt['grossBytes']=str(int(debt['grossBytes'])+1)
                put(debt)
            else:
                additional=dict(debt,nonce='f'*32);put(additional)
            refused=False
            try:observed=module.ledger(control,helpers,request)
            except (RuntimeError,helpers['raw'].PreparationRefusal):refused=True
            if fault=='additional':
                assert not refused and observed['records']==2 and observed['grossBytes']==283509096448
                actual=helpers['repair'].read_reservations(module.STATE)
                assert observed['digest']==control.digest(actual)
            elif fault=='omit-selection':assert not refused and observed['grossBytes']==141754548224
            else:assert refused,'complete ledger accepted '+fault
        finally:close()
    print('actual full debt selection, provenance, gross and complete-sum guards; watched selection omission')

def composed_prepare(scratch):
    for fault in ('positive','pad-short','pad-fsync','final-short','final-fsync','inode','size','blocks','request-path',
                  'inventory','omit-final-write','omit-freeze','omit-final-inode'):
        directory=scratch/fault;directory.mkdir(mode=0o700)
        category={'omit-final-write':'operator-request-finalize','omit-freeze':'operator-freeze-changed',
                  'omit-final-inode':'operator-request-inode-allocation-changed'}.get(fault)
        module,control,helpers,staging,pins,debt,put,lock,profiles,close=composition(directory,
            omit_category(category) if category else None)
        original_open=os.open;original_write=os.write;original_pwrite=os.pwrite;original_fsync=os.fsync
        request_fds=[];request_names=[];durability=[];inventories=[];late_inventory=[]
        original_inventory=control.inventory_roots
        def inventory(request,*args,**kwargs):
            if len(inventories)>=2:late_inventory.append(True)
            observed=original_inventory(request,*args,**kwargs);inventories.append(observed)
            return observed
        control.inventory_roots=inventory
        def opening(path,flags,*args,**kwargs):
            descriptor=original_open(path,flags,*args,**kwargs)
            if str(path).startswith(module.PACKET+'/request-') and flags & os.O_CREAT:
                request_fds.append(descriptor);request_names.append(str(path))
            return descriptor
        def writing(descriptor,payload):
            if request_fds and descriptor==request_fds[0] and len(payload)==65536 and fault=='pad-short':
                return original_write(descriptor,payload[:-1])
            return original_write(descriptor,payload)
        def syncing(descriptor):
            if request_fds and descriptor==request_fds[0]:
                durability.append(True)
                if fault=='pad-fsync' or fault=='final-fsync' and len(durability)==2:
                    raise OSError('injected request fsync failure')
            return original_fsync(descriptor)
        def finalizing(descriptor,payload,offset):
            assert descriptor==request_fds[0] and offset==0,'finalization replaced original descriptor'
            if fault in ('final-short','omit-final-write'):
                return original_pwrite(descriptor,payload[:-1],offset)
            count=original_pwrite(descriptor,payload,offset)
            path=pathlib.Path(request_names[0])
            if fault in ('request-path','omit-freeze'):
                path.rename(directory/'frozen-request-original');path.write_bytes(payload);path.chmod(0o600)
            elif fault=='inventory':
                path=pathlib.Path(module.PLAN)/'moved.txt';path.write_bytes(b'x');path.chmod(0o600)
            elif fault=='size':os.ftruncate(descriptor,65535)
            elif fault=='blocks':os.ftruncate(descriptor,131072);original_pwrite(descriptor,b'x',131071)
            elif fault in ('inode','omit-final-inode'):
                foreign=directory/'foreign-request';foreign.write_bytes(payload);foreign.chmod(0o600)
                foreign_fd=original_open(foreign,os.O_RDWR)
                try:os.dup2(foreign_fd,descriptor)
                finally:os.close(foreign_fd)
            return count
        os.open=opening;os.write=writing;os.pwrite=finalizing;os.fsync=syncing
        refused=False;failure=None
        try:
            try:module.prepare(control,staging,helpers,pins,'e'*64)
            except (RuntimeError,OSError,control.Refusal,helpers['raw'].PreparationRefusal) as caught:
                refused=True;failure=str(caught)
            published=pathlib.Path(module.PREPARED).exists()
            if fault in ('positive','omit-final-write'):
                assert not refused and published,(fault,failure)
                preparation=json.loads(pathlib.Path(module.PREPARED).read_bytes())
                path=pathlib.Path(preparation['requestPath']);observed=path.stat()
                assert observed.st_size==65536 and observed.st_blocks*512==65536
                assert len(path.read_bytes())==65536
                assert hashlib.sha256(path.read_bytes()).hexdigest()==preparation['requestSha256']
                assert preparation['requestIdentity']['inode']==str(observed.st_ino)
                assert preparation['preflight']['capacity']['ledger']['grossBytes']==141754548224
            elif fault=='omit-freeze':
                assert refused and profiles,'omitted freeze guard failed to expose later profile authority'
            elif fault=='omit-final-inode':
                assert not refused and published,'omitted original-FD guard failed to expose foreign descriptor'
            else:
                assert refused and not published,(fault,failure)
                assert not profiles,'failed preparation crossed into later external profile admission'
            for descriptor in request_fds:
                try:os.fstat(descriptor)
                except OSError:pass
                else:raise AssertionError('failed/successful prepare leaked original request FD')
            if fault=='pad-short':assert not durability,'short padding was synced'
        finally:
            os.open=original_open;os.write=original_write;os.pwrite=original_pwrite;os.fsync=original_fsync
            close()
    print('real padded prepare/freeze/original-FD and failure publication boundaries with watched omissions')

def composed_bindings(scratch):
    cases=('prepared-malformed','prepared-source','prepared-sha','prepared-nonce','prepared-builder','prepared-inode',
        'review-malformed','review-source','review-sha','review-nonce','review-builder','approval-source','approval-sha','approval-nonce',
        'approval-builder','approval-malformed','approval-replay','marker-replay','marker-fsync',
        'omit-prepared','omit-inode','omit-review','omit-approval')
    for fault in cases:
        directory=scratch/fault;directory.mkdir(mode=0o700)
        category={'omit-prepared':'operator-preparation-binding','omit-inode':'operator-request-original-inode',
            'omit-review':'operator-reviewed-request-binding','omit-approval':'operator-independent-approval-required'}.get(fault)
        module,control,helpers,staging,pins,debt,put,lock,profiles,close=composition(directory,
            omit_category(category) if category else None)
        calls=[]
        try:
            module.prepare(control,staging,helpers,pins,'e'*64)
            module.review(control,staging,helpers)
            preparation=json.loads(pathlib.Path(module.PREPARED).read_bytes())
            approval=dict(schemaVersion=1,sourceCommit='a'*40,builderSha256='e'*64,nonce=preparation['nonce'],
                requestSha256=preparation['requestSha256'],approved=True)
            pathlib.Path(module.APPROVED).write_bytes(control.encode(approval));pathlib.Path(module.APPROVED).chmod(0o600)
            if fault.startswith('prepared-') or fault=='omit-prepared':
                path=pathlib.Path(module.PREPARED);record=json.loads(path.read_bytes())
                if fault=='prepared-malformed':path.write_bytes(b'{')
                elif fault=='prepared-inode':
                    original=pathlib.Path(record['requestPath']);contents=original.read_bytes()
                    original.rename(directory/'original-request');original.write_bytes(contents);original.chmod(0o600)
                else:
                    key={'prepared-source':'sourceCommit','prepared-sha':'requestSha256','prepared-nonce':'nonce',
                        'prepared-builder':'builderSha256','omit-prepared':'sourceCommit'}[fault]
                    record[key]='f'*(40 if key=='sourceCommit' else 32 if key=='nonce' else 64)
                    path.write_bytes(control.encode(record))
            elif fault=='omit-inode':
                path=pathlib.Path(module.PREPARED);record=json.loads(path.read_bytes())
                record['requestIdentity']['inode']='1';path.write_bytes(control.encode(record))
            elif fault.startswith('review-') or fault=='omit-review':
                path=pathlib.Path(module.REVIEWED);record=json.loads(path.read_bytes())
                if fault=='review-malformed':path.write_bytes(b'{')
                key={'review-malformed':None,'review-source':'sourceCommit','review-sha':'requestSha256','review-nonce':'nonce',
                    'review-builder':'builderSha256','omit-review':'sourceCommit'}[fault]
                if key is not None:
                    record[key]='f'*(40 if key=='sourceCommit' else 32 if key=='nonce' else 64)
                    path.write_bytes(control.encode(record))
            elif fault.startswith('approval-') or fault=='omit-approval':
                path=pathlib.Path(module.APPROVED)
                if fault=='approval-malformed':path.write_bytes(b'[]')
                else:
                    key={'approval-source':'sourceCommit','approval-sha':'requestSha256','approval-nonce':'nonce',
                        'approval-builder':'builderSha256','approval-replay':'nonce','omit-approval':'sourceCommit'}[fault]
                    approval[key]='f'*(40 if key=='sourceCommit' else 32 if key=='nonce' else 64)
                    path.write_bytes(control.encode(approval))
            elif fault=='marker-replay':
                pathlib.Path(module.LAUNCHED).write_bytes(b'original-marker');pathlib.Path(module.LAUNCHED).chmod(0o600)
            original_fsync=os.fsync;original_open=os.open;marker_fds=[]
            def marker_open(path,*arguments,**keywords):
                descriptor=original_open(path,*arguments,**keywords)
                if str(path)==module.LAUNCHED:marker_fds.append(descriptor)
                return descriptor
            os.open=marker_open
            if fault=='marker-fsync':
                def failed_marker_sync(descriptor):
                    observed=os.fstat(descriptor)
                    path=pathlib.Path(module.LAUNCHED)
                    if path.exists() and observed.st_ino==path.stat().st_ino:raise OSError('marker sync failed')
                    return original_fsync(descriptor)
                os.fsync=failed_marker_sync
            def forbidden_child(*arguments,**keywords):
                calls.append(True);raise RuntimeError('forbidden original CLI boundary reached')
            module.capture_child=forbidden_child
            profiles.clear();refused=False
            try:module.launch(control,staging,helpers,lock)
            except (RuntimeError,OSError,ValueError,KeyError,TypeError,control.Refusal,helpers['raw'].PreparationRefusal):refused=True
            finally:os.fsync=original_fsync;os.open=original_open
            for descriptor in marker_fds:
                try:os.fstat(descriptor)
                except OSError:pass
                else:raise AssertionError('failed/successful marker leaked descriptor')
            assert refused
            if fault.startswith('omit-'):
                assert calls,'watched binding omission did not reach forbidden CLI: '+fault
            else:
                assert not calls,'bad binding/marker launched original CLI: '+fault
                if fault.startswith('prepared-'):assert not profiles,'bad prepared binding crossed profile boundary'
            if fault=='marker-replay':assert pathlib.Path(module.LAUNCHED).read_bytes()==b'original-marker'
        finally:close()
    print('real prepared/review/approval/request-inode/marker refusals before CLI, with watched binding omissions')

with tempfile.TemporaryDirectory(prefix='puni-operator-component-') as temporary:
    scratch = pathlib.Path(temporary)
    module = load()
    if mode == 'ledger-composition':composed_ledger(scratch)
    elif mode == 'prepare-composition':composed_prepare(scratch)
    elif mode == 'binding-composition':composed_bindings(scratch)
    elif mode in ('lock', 'omit-lock', 'lock-before', 'lock-after'):
        control = control_module()
        buffers = {str(root/relative):(root/relative).read_bytes()
                   for relative in control.SOURCES}
        with control.repository_loader(buffers):
            helpers = control.load_helpers()
        state = scratch/'state'
        state.mkdir(mode=0o700)
        module.STATE = str(state)
        snapshot = dict(allocatedBytes='8435834880', ctimeNs='1793841387709411042', device='66307',
            inode='21891946', links=1, logicalBytes='8589934592', mode='0600',
            mtimeNs='1793841387709411042', owner=os.geteuid())
        record = helpers['repair'].make_reservation(module.DEBT_NONCE,
            '77160420ab64fbe534d3cdf5543a37ad10af4dbaaa0a4dba9ce1d7a67b20dd0e',
            '4f3c6c6c12da6a99c229650df34f495e81faec87bfbd30911948f89bcfb61de9', snapshot, 154128384)
        def populate(directory):
            attempt = directory/('raw-repair-'+module.DEBT_NONCE)
            attempt.mkdir(mode=0o700)
            for name, body in (('reservation.json', record), ('request-binding.json', dict(
                requestDigest=record['requestDigest'], sourceDigest=record['sourceDigest'], initial={}, unitBefore={}))):
                path = attempt/name
                path.write_bytes(helpers['raw'].encode_json(body));path.chmod(0o600)
        populate(state)
        descriptor = helpers['raw'].acquire_staging(str(state))
        binding = dict(pid=os.getpid(), start=helpers['raw'].process_start(os.getpid()),
            stagingFd=descriptor, staging=helpers['raw'].identity(os.fstat(descriptor)))
        module.ADMISSION = binding
        request = dict(state=str(state))
        if mode == 'omit-lock':
            mutated = load(remove_calls(source, {'check_admission'}))
            mutated.STATE = str(state);mutated.ADMISSION = binding
            module = mutated
        original_read = helpers['repair'].read_reservations
        def replace():
            state.rename(scratch/'original-state');state.mkdir(mode=0o700);populate(state)
        if mode in ('lock', 'omit-lock', 'lock-before'):
            replace()
        else:
            def read_then_replace(path):
                records = original_read(path)
                replace()
                return records
            helpers['repair'].read_reservations = read_then_replace
        refused = False
        try:
            try:
                observed = module.ledger(control, helpers, request)
                assert observed['grossBytes'] == 141754548224
            except helpers['raw'].PreparationRefusal as failure:
                assert str(failure) == 'repair-lock-invalid';refused = True
            competitor = helpers['raw'].acquire_staging(str(state));os.close(competitor)
            if mode == 'omit-lock':
                assert not refused, 'watched omission did not expose unlocked replacement'
                print('watched original-lock omission admits unchanged-ledger replacement')
            else:
                assert refused, 'builder admitted replacement state while locking old directory'
                print('actual original lock refused replaced root before/after ledger')
        finally:
            os.close(descriptor)
    elif mode in ('cleanup', 'wall-cleanup', 'positive-child', 'overflow', 'git', 'omit-output', 'real-wall', 'capture-failure', 'cleanup-close-fault', 'compound-all', 'omit-primary-failure', 'stalled-publication', 'omit-publication-watchdog', 'no-publication-budget'):
        control = control_module()
        original_popen = subprocess.Popen
        children = []
        marker = scratch/'after-overflow'
        if mode=='no-publication-budget':program='pass'
        elif mode in ('overflow','git','omit-output'):
            program = 'import os,time;os.write(1,b"x"*65537);time.sleep(.4);open('+repr(str(marker))+',"w").close()'
        elif mode == 'positive-child':
            program = 'import os;os.write(1,b"ok");os.write(2,b"err")'
        else:
            program = 'import time;time.sleep(10)'
        def spawn(_command, **keywords):
            child = original_popen(['/usr/bin/python3','-I','-B','-c',program], **keywords)
            children.append(child)
            if mode in ('stalled-publication','omit-publication-watchdog'):
                def real_work_alarm(_number,_frame):raise RuntimeError('injected-real-work-alarm')
                signal.signal(signal.SIGALRM,real_work_alarm);signal.setitimer(signal.ITIMER_REAL,.02)
            return child
        if mode == 'omit-output':
            tree=ast.parse(source)
            class RemoveOutput(ast.NodeTransformer):
                def visit_Expr(self,node):
                    if isinstance(node.value,ast.Call) and any(isinstance(part,ast.Constant) and part.value=='operator-child-output-bound' for part in node.value.args):
                        return ast.copy_location(ast.Pass(),node)
                    return self.generic_visit(node)
            tree=RemoveOutput().visit(tree);ast.fix_missing_locations(tree)
            module=load(compile(tree,'<omit-output>','exec'))
        if mode=='omit-primary-failure':
            tree=ast.parse(source)
            class LosePrimary(ast.NodeTransformer):
                def visit_Raise(self,node):
                    if isinstance(node.exc,ast.Call) and node.exc.args and isinstance(node.exc.args[0],ast.Constant) and node.exc.args[0].value=='operator-child-failures':
                        node.exc.args[1]=ast.Subscript(value=ast.Name(id='failures',ctx=ast.Load()),slice=ast.Slice(lower=ast.Constant(1)),ctx=ast.Load())
                    return self.generic_visit(node)
            tree=LosePrimary().visit(tree);ast.fix_missing_locations(tree)
            module=load(compile(tree,'<watched-primary-loss>','exec'))
        module.subprocess.Popen = spawn
        module.fixed_environment = lambda: {'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'}
        module.EXPECTED_SOURCE_COMMIT = 'a'*40
        nonce = 'b'*32;checksum = 'c'*64
        request = dict(nonce=nonce,inventory={},ledger={})
        preparation = dict(requestPath=str(scratch/'request.json'), requestSha256=checksum,
                           builderSha256='e'*64)
        module.CAPTURE = str(scratch/'capture.json')
        module.LAUNCHED = str(scratch/'attempt.json')
        module.REVIEWED = str(scratch/'review.json')
        module.APPROVED = str(scratch/'approved.json')
        module.read_prepared = lambda *_: (preparation,request,{})
        review = dict(sourceCommit='a'*40,nonce=nonce,requestSha256=checksum,inventory={},ledger={},builderSha256='e'*64)
        approval = dict(schemaVersion=1,sourceCommit='a'*40,nonce=nonce,requestSha256=checksum,approved=True)
        approval['builderSha256']='e'*64
        for path,body in ((module.REVIEWED,review),(module.APPROVED,approval)):
            pathlib.Path(path).write_bytes(control.encode(body));pathlib.Path(path).chmod(0o600)
        helper = dict(raw=types.SimpleNamespace(client_limits=lambda:None))
        descriptor = os.open(scratch,os.O_RDONLY|os.O_DIRECTORY)
        owned = [descriptor]
        selector_factory = control.selectors.DefaultSelector
        if mode in ('cleanup','wall-cleanup'):
            def fail_setup():
                if mode == 'wall-cleanup':
                    raise RuntimeError('operator-wall-timeout')
                raise OSError('injected selector creation failure')
            control.selectors.DefaultSelector = fail_setup
            # The new shared pump imports this same module, not a replacement provider.
            if hasattr(module,'selectors'):module.selectors.DefaultSelector=fail_setup
        if mode in ('capture-failure','compound-all','omit-primary-failure'):
            original_write=module.write_private
            def fail_capture(control,path,record,bound):
                if path == module.CAPTURE:raise OSError('injected capture persistence failure')
                return original_write(control,path,record,bound)
            module.write_private=fail_capture
            control.selectors.DefaultSelector=lambda:(_ for _ in ()).throw(OSError('setup'))
        if mode in ('cleanup-close-fault','compound-all','omit-primary-failure'):
            def broken_cleanup_selector():
                selector=selector_factory()
                original_close=selector.close
                def close_then_fail():
                    original_close();raise OSError('injected selector close failure')
                selector.close=close_then_fail
                selector.register=lambda *_:(_ for _ in ()).throw(OSError('registration failure'))
                return selector
            control.selectors.DefaultSelector=broken_cleanup_selector
        if mode=='no-publication-budget':
            def exhaust_budget():
                children[0].wait(timeout=1)
                module.OPERATOR_DEADLINE=time.monotonic()-1
                raise OSError('body exhausted hard budget')
            control.selectors.DefaultSelector=exhaust_budget
        missing_watchdog=[];publication_fds=[]
        original_fsync=os.fsync;original_open=os.open
        if mode in ('stalled-publication','omit-publication-watchdog'):
            if mode=='omit-publication-watchdog':
                module.arm_terminal_watchdog=lambda:None
            module.OPERATOR_DEADLINE=time.monotonic()+3.08
            def work_alarm(_number,_frame):raise RuntimeError('injected-real-work-alarm')
            signal.signal(signal.SIGALRM,work_alarm)
            signal.setitimer(signal.ITIMER_REAL,.08)
            def capture_open(path,*arguments,**keywords):
                descriptor=original_open(path,*arguments,**keywords)
                if str(path)==module.CAPTURE:publication_fds.append(descriptor)
                return descriptor
            def stalled_sync(descriptor):
                if descriptor in publication_fds:
                    assert children[0].poll() is not None and children[0].stdout.closed and children[0].stderr.closed
                    if signal.getitimer(signal.ITIMER_REAL)[0]<=0:
                        missing_watchdog.append(True)
                        def fixture_escape(_number,_frame):raise RuntimeError('fixture outer watch exposed missing publication watchdog')
                        signal.signal(signal.SIGALRM,fixture_escape);signal.setitimer(signal.ITIMER_REAL,.15)
                    while True:time.sleep(5)
                return original_fsync(descriptor)
            os.open=capture_open;os.fsync=stalled_sync
        if mode == 'real-wall':
            def wall(_number,_frame):raise RuntimeError('operator-wall-timeout')
            signal.signal(signal.SIGALRM,wall)
            module.OPERATOR_DEADLINE=time.monotonic()+3.05
            signal.setitimer(signal.ITIMER_REAL,.05)
        refused = False;surfaced=None;started=time.monotonic()
        try:
            try:
                if mode == 'git':
                    module.git(['status','--porcelain=v1','--untracked-files=no'])
                elif mode in ('positive-child','overflow','omit-output'):
                    streams, exit_code = module.capture_child(['fixed-test-command'], module.fixed_environment(),
                        time.monotonic()+3, 65536)
                    if mode == 'positive-child':
                        assert streams == {'stdout':b'ok','stderr':b'err'} and exit_code == 0
                else:
                    module.launch(control,None,helper,owned)
            except BaseException as failure:
                refused = True;surfaced=failure
            if mode == 'positive-child':
                assert not refused
            elif mode == 'omit-output':
                assert not refused and marker.exists(), 'watched live-bound omission did not pass forbidden marker'
            elif mode in ('git','overflow'):
                assert refused and not marker.exists(), 'postcapture bound allowed child past overflow'
            else:
                assert refused
                assert len(children)==1 and children[0].poll() is not None, 'original CLI was not killed/reaped on setup failure'
                assert children[0].stdout.closed and children[0].stderr.closed, 'original pipes leaked'
                if mode not in ('capture-failure','compound-all','omit-primary-failure','stalled-publication','omit-publication-watchdog','no-publication-budget'):
                    capture = json.loads(pathlib.Path(module.CAPTURE).read_bytes())
                    assert capture['transportComplete'] is False and capture['exitCode'] is not None
            def failure_graph(failure,seen=None):
                seen=set() if seen is None else seen
                if failure is None or id(failure) in seen:return ''
                seen.add(id(failure))
                nested=[getattr(failure,'__cause__',None),getattr(failure,'__context__',None),*getattr(failure,'exceptions',())]
                return str(failure)+' '+ ' '.join(failure_graph(part,seen) for part in nested)
            graph=failure_graph(surfaced)
            if mode=='capture-failure':
                assert 'setup' in graph and 'injected capture persistence failure' in graph,graph
            if mode in ('cleanup-close-fault','compound-all'):
                assert 'registration failure' in graph and 'injected selector close failure' in graph and 'operator-child-cleanup-uncertain' in graph,graph
                if mode=='compound-all':assert 'injected capture persistence failure' in graph,graph
            if mode=='omit-primary-failure':
                assert 'registration failure' not in graph and 'injected selector close failure' in graph and 'injected capture persistence failure' in graph,graph
            if mode in ('stalled-publication','omit-publication-watchdog'):
                assert time.monotonic()-started<4, 'publication exceeded functioning outer fixture watch'
                if mode=='stalled-publication':
                    assert not missing_watchdog and 'operator-hard-timeout' in graph and 'operator-capture-unavailable' in graph,graph
                    assert 'operator-work-timeout' in graph or 'injected-real-work-alarm' in graph,graph
                else:
                    assert missing_watchdog and 'fixture outer watch exposed' in graph,graph
                for descriptor in publication_fds:
                    try:os.fstat(descriptor)
                    except OSError:pass
                    else:raise AssertionError('stalled capture retained FD')
            if mode=='no-publication-budget':
                assert not pathlib.Path(module.CAPTURE).exists() and 'operator-capture-unavailable' in graph,graph
                assert 'body exhausted hard budget' in graph,graph
            print('owned child closed/reaped and live bounded capture:',mode)
        finally:
            signal.setitimer(signal.ITIMER_REAL,0)
            os.open=original_open;os.fsync=original_fsync
            control.selectors.DefaultSelector = selector_factory
            module.subprocess.Popen = original_popen
            if owned[0] is not None:os.close(owned[0])
            for child in children:
                if child.poll() is None:child.kill()
                child.wait(timeout=2)
                child.stdout.close();child.stderr.close()
    elif mode in ('hash','same-buffer','first-io-wall','bootstrap-unsafe','bootstrap-absent','bootstrap-over','bootstrap-exact','omit-hash','omit-wall','bootstrap-unreadable','bootstrap-symlink','bootstrap-hardlink','bootstrap-empty','bootstrap-read-fault','bootstrap-changed','omit-identity','omit-stable','omit-bound'):
        builder = scratch/'private-builder.py'
        payload = b'import sys\nassert "__file__" not in globals()\nprint("REVIEWED", globals().get("BUILDER_SHA", "absent"))\n'
        builder.write_bytes(payload);builder.chmod(0o600)
        expected = hashlib.sha256(payload).hexdigest()
        if mode in ('hash','omit-hash'):
            builder.write_bytes(b'print("UNREVIEWED")\n')
        if mode == 'bootstrap-unsafe':builder.chmod(0o644)
        if mode == 'bootstrap-absent':builder.unlink()
        if mode=='bootstrap-exact':
            payload+=b'\n#'+b'x'*(49152-len(payload)-2)
            builder.write_bytes(payload);expected=hashlib.sha256(payload).hexdigest()
        if mode in ('bootstrap-over','omit-bound'):builder.write_bytes(b'print("OVER")\n#'+b'x'*(49153-15))
        if mode == 'bootstrap-unreadable':builder.chmod(0)
        if mode == 'bootstrap-symlink':
            target=scratch/'target';builder.rename(target);builder.symlink_to(target)
        if mode == 'bootstrap-hardlink':os.link(builder,scratch/'alias')
        if mode == 'bootstrap-empty':builder.write_bytes(b'')
        if mode == 'omit-identity':builder.chmod(0o644)
        if mode in ('bootstrap-over','bootstrap-empty','omit-bound'):expected=hashlib.sha256(builder.read_bytes()).hexdigest()
        boot = pathlib.Path(bootstrap_path)
        exists = boot.exists()
        code = boot.read_bytes() if exists else b''
        if exists:
            tree = ast.parse(code)
            for statement in tree.body:
                if isinstance(statement,ast.Assign) and any(isinstance(target,ast.Name) and target.id=='BUILDER_PATH' for target in statement.targets):
                    statement.value=ast.Constant(str(builder))
            if mode in ('omit-hash','omit-wall','omit-identity','omit-stable','omit-bound'):
                class RemoveGuard(ast.NodeTransformer):
                    def visit_If(self,node):
                        return self.generic_visit(node)
                    def visit_Expr(self,node):
                        categories={'omit-hash':'operator-builder-sha','omit-identity':'operator-builder-identity','omit-stable':'operator-builder-changed','omit-bound':'operator-builder-identity'}
                        if isinstance(node.value,ast.Call) and mode in categories and any(isinstance(value,ast.Constant) and value.value==categories[mode] for value in node.value.args):
                            return ast.copy_location(ast.Pass(),node)
                        if mode=='omit-wall' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='setitimer':
                            return ast.copy_location(ast.Pass(),node)
                        return self.generic_visit(node)
                tree=RemoveGuard().visit(tree)
            ast.fix_missing_locations(tree)
            code=compile(tree,'<fixed-bootstrap-fixture>','exec')
        original_compile = builtins.compile
        original_open = os.open
        original_read = os.read
        opened=[]
        def guarded_open(path,*arguments,**keywords):
            if str(path)==str(builder) and mode in ('first-io-wall','omit-wall'):
                assert signal.getitimer(signal.ITIMER_REAL)[0]>0, 'no wall bound before first builder I/O'
            descriptor=original_open(path,*arguments,**keywords)
            if str(path)==str(builder):opened.append(descriptor)
            return descriptor
        def replace_after_hash(contents,filename,*arguments,**keywords):
            if filename=='<staging110-operator>' and mode=='same-buffer':
                builder.write_bytes(b'print("UNREVIEWED")\n')
            return original_compile(contents,filename,*arguments,**keywords)
        def injected_read(descriptor,count):
            if mode=='bootstrap-read-fault':raise OSError('injected builder read failure')
            payload=original_read(descriptor,count)
            if mode in ('bootstrap-changed','omit-stable'):
                builder.rename(scratch/'captured-original')
                builder.write_bytes(payload);builder.chmod(0o600)
            return payload
        builtins.compile=replace_after_hash;os.open=guarded_open;os.read=injected_read
        original_arguments=sys.argv
        sys.argv=['fixed-bootstrap',expected,'prepare']
        refused=False
        transcript=io.StringIO();original_stdout=sys.stdout
        try:
            try:
                sys.stdout=transcript
                if exists:
                    exec(code, {'__name__':'__main__','OPERATOR_DEADLINE':time.monotonic()+5})
                else:
                    # This is the exact legacy recipe boundary, not a substitute validator.
                    with open(builder,'rb') as stream:legacy=stream.read()
                    if mode=='first-io-wall':
                        assert signal.getitimer(signal.ITIMER_REAL)[0]>0,'no wall before legacy file read'
                    exec(original_compile(legacy,'<staging110-operator>','exec'),{'__name__':'__main__'})
            except (RuntimeError,ValueError,OSError,AssertionError) as failure:
                refused=True
            finally:
                sys.stdout=original_stdout
            for descriptor in opened:
                try:os.fstat(descriptor)
                except OSError:pass
                else:raise AssertionError('bootstrap retained owned descriptor')
            if mode in ('hash','bootstrap-unsafe','bootstrap-absent','bootstrap-over','bootstrap-unreadable','bootstrap-symlink','bootstrap-hardlink','bootstrap-empty','bootstrap-read-fault','bootstrap-changed'):
                assert refused, 'unreviewed/unsafe builder reached execution'
            elif mode in ('omit-hash','omit-wall','omit-identity','omit-stable','omit-bound'):
                if mode!='omit-wall':
                    assert not refused,'watched hash omission stayed protected'
                    if mode=='omit-hash':assert 'UNREVIEWED' in transcript.getvalue()
                    if mode=='omit-bound':assert 'OVER' in transcript.getvalue()
                else:assert refused,'watched absent timer failed to trip independent I/O assertion'
                print('watched bootstrap guard omission:',mode)
            else:
                assert not refused, 'reviewed same-buffer/first-I/O contract failed'
                assert 'REVIEWED '+expected in transcript.getvalue() and 'UNREVIEWED' not in transcript.getvalue()
            print('stable reviewed builder boundary:',mode)
        finally:
            signal.setitimer(signal.ITIMER_REAL,0)
            builtins.compile=original_compile;os.open=original_open;os.read=original_read;sys.argv=original_arguments
    elif mode == 'capture-boundaries':
        path=scratch/'source.py';payload=b'print(1)\n';path.write_bytes(payload);path.chmod(0o644)
        checksum=hashlib.sha256(payload).hexdigest()
        assert module.capture(str(path),len(payload),os.geteuid(),0o644,checksum)[0]==payload
        for fault,category in (('mode','operator-file-identity'),('bound','operator-file-identity'),('sha','operator-file-sha')):
            if fault=='mode':path.chmod(0o600)
            limit=len(payload)-1 if fault=='bound' else len(payload)
            expected='a'*64 if fault=='sha' else checksum
            refused=False
            try:module.capture(str(path),limit,os.geteuid(),0o644,expected)
            except RuntimeError:refused=True
            assert refused,'source capture accepted '+fault
            if fault!='bound':
                mutant=omit_category(category)
                assert mutant.capture(str(path),len(payload),os.geteuid(),0o644,expected)[0]==payload
            path.chmod(0o644)
        module.OPERATOR_DEADLINE=time.monotonic()-1
        try:module.capture(str(path),len(payload),os.geteuid(),0o644,checksum)
        except RuntimeError as failure:assert str(failure)=='operator-wall-timeout'
        else:raise AssertionError('read began after absolute deadline')
        mutant=omit_category('operator-wall-timeout');mutant.OPERATOR_DEADLINE=time.monotonic()-1
        assert mutant.capture(str(path),len(payload),os.geteuid(),0o644,checksum)[0]==payload
        module.OPERATOR_DEADLINE=time.monotonic()+45
        absent=scratch/'absent'
        try:module.capture(str(absent),32,os.geteuid(),0o644)
        except FileNotFoundError:pass
        else:raise AssertionError('absent capture accepted')
        path.chmod(0)
        try:module.capture(str(path),32,os.geteuid(),0o644)
        except RuntimeError:pass
        else:raise AssertionError('unreadable capture accepted')
        print('actual source capture identity/hash/bound negatives with watched omissions')
    elif mode == 'packet-budget':
        control=control_module()
        packet=scratch/'packet';packet.mkdir(mode=0o700);module.PACKET=str(packet)
        fixtures=packet/('fixtures-'+module.OLD_NONCE);fixtures.mkdir(mode=0o700)
        snapshots={}
        for name,length in control.FIXTURES.items():
            if name=='allocation':length=4096
            if name=='truncate-fault':length=0
            path=fixtures/name;path.write_bytes(b'x'*length);path.chmod(0o600)
            with path.open('rb') as stream:os.fsync(stream.fileno())
            observed=path.stat()
            snapshots[name]=dict(device=observed.st_dev,inode=observed.st_ino,bytes=observed.st_size,
                allocatedBytes=observed.st_blocks*512,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
        assert sum(snapshot['allocatedBytes'] for snapshot in snapshots.values())==1544192
        receipt=dict(fixtures=snapshots,fixtureAllocatedBytes=1544192,
            request='70112203211e480c759105ecc46b1da1d857684e540b0bfa9b27fbdf78ff16af')
        receipt_path=packet/('observation-'+module.OLD_NONCE+'-terminal.json')
        receipt_path.write_bytes(control.encode(receipt));receipt_path.chmod(0o600)
        module.OLD_TERMINAL_SHA=hashlib.sha256(receipt_path.read_bytes()).hexdigest()
        baseline=module.packet_budget(control)
        assert baseline['fixtureAllocatedBytes']==1544192
        extra=packet/'foreign';extra.write_bytes(b'f'*4096);extra.chmod(0o600)
        following=module.packet_budget(control)
        assert following['metadataAllocatedBytes']>=baseline['metadataAllocatedBytes']+4096
        module.FUTURE={'literalCapWitness':1048576-following['metadataAllocatedBytes']}
        assert module.packet_budget(control)['projectedMetadataBytes']==1048576
        module.FUTURE['literalCapWitness']+=1
        try:module.packet_budget(control)
        except RuntimeError as failure:assert str(failure)=='operator-metadata-budget'
        else:raise AssertionError('one-byte metadata excess accepted')
        mutant=omit_category('operator-metadata-budget');mutant.PACKET=str(packet)
        mutant.OLD_TERMINAL_SHA=module.OLD_TERMINAL_SHA;mutant.FUTURE=module.FUTURE
        assert mutant.packet_budget(control)['projectedMetadataBytes']==1048577
        module.FUTURE={}
        path=fixtures/'allocation';contents=path.read_bytes();path.rename(scratch/'frozen-allocation');path.write_bytes(contents);path.chmod(0o600)
        try:module.packet_budget(control)
        except RuntimeError as failure:assert str(failure)=='operator-old-fixture-identity'
        else:raise AssertionError('foreign fixture inode exempted')
        mutant=omit_category('operator-old-fixture-identity');mutant.PACKET=str(packet)
        mutant.OLD_TERMINAL_SHA=module.OLD_TERMINAL_SHA;mutant.FUTURE={}
        assert mutant.packet_budget(control)['fixtureAllocatedBytes']==1544192
        print('actual12-inode exemption and1MiB cap with watched omissions')
    elif mode == 'exclusive-marker':
        control=control_module();path=scratch/'one-use.json'
        module.write_private(control,str(path),{'first':True},4096)
        original=path.read_bytes()
        try:module.write_private(control,str(path),{'second':True},4096)
        except FileExistsError:pass
        else:raise AssertionError('exclusive marker reused')
        assert path.read_bytes()==original and path.stat().st_mode & 0o777==0o600
        original_open=os.open
        def omit_exclusive(path,flags,*arguments,**keywords):
            return original_open(path,flags & ~os.O_EXCL,*arguments,**keywords)
        os.open=omit_exclusive
        try:module.write_private(control,str(path),{'second':True},4096)
        finally:os.open=original_open
        assert path.read_bytes()!=original
        print('actual one-use marker unchanged on collision; removed O_EXCL overwrites it')
    else:
        raise AssertionError(mode)
`;

for (const mode of [
  'lock',
  'lock-after',
  'omit-lock',
  'cleanup',
  'wall-cleanup',
  'real-wall',
  'capture-failure',
  'cleanup-close-fault',
  'compound-all',
  'omit-primary-failure',
  'stalled-publication',
  'omit-publication-watchdog',
  'no-publication-budget',
  'positive-child',
  'overflow',
  'omit-output',
  'hash',
  'same-buffer',
  'first-io-wall',
  'git',
  'bootstrap-unsafe',
  'bootstrap-absent',
  'bootstrap-over',
  'bootstrap-exact',
  'bootstrap-unreadable',
  'bootstrap-symlink',
  'bootstrap-hardlink',
  'bootstrap-empty',
  'bootstrap-read-fault',
  'bootstrap-changed',
  'omit-hash',
  'omit-wall',
  'omit-identity',
  'omit-stable',
  'omit-bound',
  'capture-boundaries',
  'packet-budget',
  'exclusive-marker',
  'ledger-composition',
  'prepare-composition',
  'binding-composition',
]) {
  test(`operator component ${mode} exercises its real validation or ownership boundary`, () => {
    const child = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', fixture, builder, bootstrap, mode],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10000,
      },
    );
    expect(new TextDecoder().decode(child.stderr)).toBe('');
    expect(child.exitCode).toBe(0);
  });
}
