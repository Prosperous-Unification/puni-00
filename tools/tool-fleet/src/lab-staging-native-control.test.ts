import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const source = fileURLToPath(
  new URL(
    '../../../openspec/changes/observability-environment-parity/evidence/staging-native-control.py',
    import.meta.url,
  ),
);

test('finite staging entry compiles before importing its native helpers', () => {
  const child = Bun.spawnSync(['/usr/bin/python3', '-I', '-S', '-B', source, 'ast-check'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect(new TextDecoder().decode(child.stderr)).toBe('');
  expect(child.exitCode).toBe(0);
  expect(new TextDecoder().decode(child.stdout)).toBe('staging-native-control: AST-valid\n');
});

const coldWorker = readFileSync(
  new URL('./lab-staging-native-cold-fixture.py', import.meta.url),
  'utf8',
);
const providerBoundary = '\n# Worker entry follows the runtime provider.\n';
const providerEnd = coldWorker.indexOf(providerBoundary);
// Proof: oversized/missing/duplicate prefix faults refuse; removing this guard admits oversized source.
if (
  Buffer.byteLength(coldWorker) > 8192 ||
  providerEnd <= 0 ||
  coldWorker.includes(providerBoundary, providerEnd + 1)
) {
  throw new Error('bounded cold fixture must contain exactly one runtime-provider boundary');
}
const runtimeProvider = coldWorker.slice(0, providerEnd);

const fixture = String.raw`${runtimeProvider}
import array, builtins, copy, ctypes, encodings.ascii, hashlib, importlib.util, json
import fcntl, resource, select, shutil, signal, socket, stat, subprocess, tempfile, time
def fault_metadata(path,fault):
    lstat,fstat=os.lstat,os.fstat
    def changed(selected,observed):
        if map_runtime_path(selected)!=path:return observed
        return change_stat(observed,**({'st_nlink':2} if fault=='links' else {'st_mode':observed.st_mode|0o020}))
    os.lstat=lambda selected,*args,**kwargs:changed(selected,lstat(selected,*args,**kwargs))
    os.fstat=lambda descriptor:changed(os.readlink('/proc/self/fd/'+str(descriptor)),fstat(descriptor))
source_path, mode = Path(sys.argv[1]), sys.argv[2]
omit=mode.startswith('omit-')
if omit:mode=mode.removeprefix('omit-')
source_root = source_path.parents[4]
real_lstat, real_fstat, real_statvfs = os.lstat, os.fstat, os.statvfs
real_popen = subprocess.Popen
real_setrlimit, real_getrlimit = resource.setrlimit, resource.getrlimit
fixture_parent = os.getpid()
with tempfile.TemporaryDirectory(prefix='staging-native-fixture-') as directory:
    root = Path(directory)
    relatives = ['openspec/changes/observability-environment-parity/evidence/' + name for name in ('repair-native-control.py','staging-native-control.py')]
    relatives += ['tools/tool-fleet/src/' + name for name in ('lab-repair-worker.py','lab-raw-preparation.py','lab-guest-preparation.py','lab-seed-preparation.py','lab-raw-allocation.py','lab-raw-repair.py')]
    for relative in relatives:
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((source_root / relative).read_bytes())
        target.chmod(0o644)
    specification = importlib.util.spec_from_file_location('fixture_staging_entry', root / relatives[1])
    staging = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(staging)
    nonce = 'a'*32
    packet = root / '.superpowers/sdd/observability-environment-parity/repair-native-controls'
    packet.mkdir(parents=True, mode=0o700)
    packet.chmod(0o700)
    state = root / '.puni/fleet-labs/observability-baseline'
    state.mkdir(parents=True, mode=0o700)
    state.chmod(0o700)
    request_path = packet / ('request-' + nonce + '.json')
    fixtures = {}
    for label in staging.LABELS:
        path = packet / ('staging-' + nonce + '-' + label)
        path.mkdir(mode=0o700)
        observed = path.stat()
        fixtures[label] = dict(path=str(path), device=str(observed.st_dev),
            inode=str(observed.st_ino), owner=os.geteuid(), mode='0700')
    def pin(path):
        path = Path(path)
        payload = path.read_bytes()
        observed = path.stat()
        return dict(path=str(path), sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload),
            uid=os.geteuid() if str(path).startswith(str(root)+'/') else 0, mode=stat.S_IMODE(observed.st_mode))
    native = os.uname()
    request = dict(schemaVersion=2, purpose='staging-channel', root=str(root), state=str(state),
        outside=str(packet.parent), packet=str(packet), nonce=nonce, commit='b'*40,
        fixtures=fixtures, pins=[pin(root / relatives[0])] + [pin(root / relative) for relative in relatives[2:]] + [pin(root / relatives[1])] + [pin(path) for path in tools],
        runtimePins=[pin('/usr/lib/locale/C.utf8/LC_IDENTIFICATION')],
        kernel=dict(release=native.release, version=native.version, machine=native.machine),
        inventory=dict(digest='d'*64, entries=2, retainedBytes=0, outsideBytes=0),
        ledger=dict(digest=hashlib.sha256(b'[]').hexdigest(), records=0, grossBytes=0))
    def write_request():
        payload = json.dumps(request, sort_keys=True, separators=(',', ':')).encode()
        assert len(payload) <= 65536
        request_path.write_bytes(payload + b' '*(65536-len(payload)))
        request_path.chmod(0o600)
        return hashlib.sha256(request_path.read_bytes()).hexdigest()
    request_sha = write_request()
    control, captured = staging.load_control(['run',str(request_path),request_sha,nonce]);observe_files(control)
    if mode == 'startup':
        import ast
        original_entry=(root/relatives[1]).read_bytes()
        original_control=(root/relatives[0]).read_bytes()
        def mutant(category):
            tree=ast.parse(original_entry)
            class Remove(ast.NodeTransformer):
                def visit_If(self,node):
                    if len(node.body)==1 and isinstance(node.body[0],ast.Raise):
                        raised=node.body[0].exc
                        if isinstance(raised,ast.Call) and raised.args and isinstance(raised.args[0],ast.Constant) and raised.args[0].value==category:
                            return ast.copy_location(ast.Pass(),node)
                    return self.generic_visit(node)
            tree=Remove().visit(tree);ast.fix_missing_locations(tree)
            module=types.ModuleType('mutated_staging_entry');module.__file__=str(root/relatives[1])
            exec(compile(tree,module.__file__,'exec'),module.__dict__)
            return module
        base=copy.deepcopy(request)
        args=['run',str(request_path),request_sha,nonce]
        def reset():
            request.clear();request.update(copy.deepcopy(base))
            (root/relatives[0]).write_bytes(original_control);(root/relatives[0]).chmod(0o644)
            (root/relatives[1]).write_bytes(original_entry);(root/relatives[1]).chmod(0o644)
            if hasattr(sys,'_task110_unverified_control'):del sys._task110_unverified_control
        marker=b'\nimport sys\nsys._task110_unverified_control=True\n'
        watched=[]
        for name in ('wrong-hash','unsafe-mode','control-over-cap','entry-over-cap','duplicate-role','foreign-path','bad-action'):
            reset()
            body=original_control+marker
            if name=='control-over-cap':body+=b'\n#'+b' '*(98305-len(body)-2)
            (root/relatives[0]).write_bytes(body)
            request['pins'][0]=pin(root/relatives[0])
            category='staging-source-binding'
            if name=='wrong-hash':request['pins'][0]['sha256']='f'*64
            if name=='unsafe-mode':(root/relatives[0]).chmod(0o600);category='staging-source-identity'
            if name=='control-over-cap':category='staging-source-identity'
            if name=='entry-over-cap':
                entry=original_entry+b'\n#'+b' '*(65537-len(original_entry)-2)
                (root/relatives[1]).write_bytes(entry);request['pins'][7]=pin(root/relatives[1]);category='staging-source-identity'
            if name=='duplicate-role':request['pins'].append(copy.deepcopy(request['pins'][0]));category='staging-source-role'
            supplied=write_request();selected=['run',str(request_path),supplied,nonce]
            if name=='foreign-path':selected[1]=str(packet/'foreign.json');category='staging-request-path'
            if name=='bad-action':selected[0]='foreign';category='staging-arguments'
            try:staging.load_control(selected)
            except ValueError as failure:assert str(failure)==category,(name,str(failure))
            else:raise AssertionError('unverified source admitted: '+name)
            assert not hasattr(sys,'_task110_unverified_control')
            mutant(category).load_control(selected)
            assert sys._task110_unverified_control is True,('removed guard did not execute bad role',name)
            watched.append(name)
        for relative,cap in ((relatives[0],98304),(relatives[1],65536)):
            reset();body=(root/relative).read_bytes();body+=b'\n#'+b' '*(cap-len(body)-2)
            (root/relative).write_bytes(body);request['pins'][0 if relative==relatives[0] else 7]=pin(root/relative)
            supplied=write_request();staging.load_control(['run',str(request_path),supplied,nonce])
        reset();supplied=write_request()
        for name in ('source-absent','source-unreadable','request-absent','request-unreadable','malformed-json'):
            reset();supplied=write_request()
            if name=='source-absent':(root/relatives[0]).unlink()
            if name=='source-unreadable':(root/relatives[0]).chmod(0o200)
            if name=='request-absent':request_path.unlink()
            if name=='request-unreadable':request_path.chmod(0o200)
            if name=='malformed-json':
                request_path.write_bytes(b'{');request_path.chmod(0o600);supplied=hashlib.sha256(b'{').hexdigest()
            try:staging.load_control(['run',str(request_path),supplied,nonce])
            except (ValueError,FileNotFoundError,PermissionError):pass
            else:raise AssertionError('unreadable/absent startup input admitted: '+name)
        reset();supplied=write_request()
        for suffix in ([],['x','1'],['0','1'],['1',str(2**64)]):
            try:staging.main(['worker',str(request_path),supplied,nonce,*suffix])
            except ValueError as failure:assert str(failure)=='staging-coordinator-arguments'
            else:raise AssertionError('invalid internal controller identity admitted')
        print('startup watched omissions:',','.join(watched),'; exact98304/65536 bounds; missing/unreadable and internal argv refused')
        sys.exit(0)
    if mode == 'packets':
        def reject(callback, category):
            try:callback()
            except control.Refusal as failure:assert str(failure)==category,(category,str(failure))
            else:raise AssertionError('missing packet refusal '+category)
        for fault in ('credentials','rights','truncated','empty','noncanonical'):
            sender,receiver=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET|socket.SOCK_CLOEXEC)
            if fault!='credentials':receiver.setsockopt(socket.SOL_SOCKET,socket.SO_PASSCRED,1)
            payload=b'' if fault=='empty' else b'{"phase": "test"}' if fault=='noncanonical' else control.encode({'phase':'test'})
            extra=[]
            if fault=='rights':
                descriptor=os.open(state,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
                extra=[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[descriptor]))]
            budget=4 if fault=='truncated' else 65536
            deadline=time.monotonic()+1
            try:
                sender.sendmsg([payload],extra,socket.MSG_DONTWAIT)
                reject(lambda:staging.receive_packet(control,receiver,deadline,budget),
                    'staging-packet-canonical' if fault=='noncanonical' else 'staging-packet-auth')
                sender.sendmsg([payload],extra,socket.MSG_DONTWAIT)
                original_require,original_decode=control.require,control.decode
                decoded=[]
                category='staging-packet-canonical' if fault=='noncanonical' else 'staging-packet-auth'
                control.require=lambda predicate,code:original_require(predicate,code) if code!=category else None
                def mark_decode(payload):
                    decoded.append(True)
                    return original_decode(payload)
                control.decode=mark_decode
                try:
                    try:staging.receive_packet(control,receiver,deadline,budget)
                    except (control.Refusal,IndexError):pass
                finally:control.require=original_require;control.decode=original_decode
                assert decoded==[True],('removed guard did not admit packet parsing',fault)
                print('watched packet guard removal reached parsing:',fault)
            finally:
                if fault=='rights':os.close(descriptor)
                sender.close();receiver.close()
        sender,receiver=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET|socket.SOCK_CLOEXEC)
        class ShortSend:
            def sendmsg(self,*arguments):return sender.sendmsg(*arguments)-1
        try:
            reject(lambda:staging.send_packet(control,ShortSend(),{'phase':'test'},time.monotonic()+1),'staging-packet-send')
            original=control.require
            control.require=lambda predicate,code:original(predicate,code) if code!='staging-packet-send' else None
            staging.send_packet(control,ShortSend(),{'phase':'test'},time.monotonic()+1)
            control.require=original
            reject(lambda:staging.send_packet(control,sender,{},time.monotonic()-1),'control-deadline')
        finally:sender.close();receiver.close()
        print('packet actual credentials/rights/truncation/canonical/send/deadline negatives and watched omissions')
        sys.exit(0)
    if mode == 'metadata':
        calls = []
        control.run_control = lambda *_: calls.append('launch')
        base = copy.deepcopy(request)
        categories = []
        def check(candidate, category, watched=True):
            request.clear(); request.update(copy.deepcopy(candidate))
            supplied = write_request()
            calls.clear()
            try: control.entry(['run',str(request_path),supplied,nonce])
            except control.Refusal as failure: assert str(failure)==category, (category,str(failure))
            else: raise AssertionError('unsafe metadata accepted: '+category)
            assert not calls
            if watched:
                original = control.require
                control.require = lambda predicate, code: original(predicate,code) if code!=category else None
                try: control.entry(['run',str(request_path),supplied,nonce])
                finally: control.require=original
                assert calls==['launch'], ('guard omission did not reach launch',category)
                categories.append(category)
        with control.select_purpose('staging-channel'):
            supplied=write_request()
            control.entry(['run',str(request_path),supplied,nonce]);assert calls==['launch']
            for field,value,category in [('schemaVersion',1,'request-schema'),('purpose','foreign','request-purpose')]:
                candidate=copy.deepcopy(base);candidate[field]=value;check(candidate,category)
            for label in ('live','dead'):
                for key,value in [('path',str(root/'foreign')),('device','01'),('inode',str(2**64)),('owner',True),('mode','0775')]:
                    candidate=copy.deepcopy(base);candidate['fixtures'][label][key]=value;check(candidate,'fixture-schema')
            candidate=copy.deepcopy(base);candidate['fixtures']['live']['creator']='123';check(candidate,'fixture-schema')
            for mode_bits,category in [(0o200,'request-unreadable'),(0o640,'request-owner-mode')]:
                request.clear();request.update(copy.deepcopy(base));supplied=write_request();request_path.chmod(mode_bits)
                try:control.entry(['run',str(request_path),supplied,nonce])
                except control.Refusal as failure:assert str(failure)==category
                else:raise AssertionError('unsafe request permissions accepted')
                request_path.chmod(0o600)
            request_path.unlink()
            try:control.entry(['run',str(request_path),'f'*64,nonce])
            except control.Refusal as failure:assert str(failure)=='request-absent'
            else:raise AssertionError('absent request accepted')
        # Default v1 request fields and fixed source roles remain unchanged.
        legacy=copy.deepcopy(base);legacy['schemaVersion']=1;del legacy['purpose'];del legacy['fixtures'];legacy['pins'].pop(7)
        control.check_request(legacy,nonce,root)
        assert control.select_sources()==control.SOURCES
        try:
            with control.select_purpose('foreign'):raise AssertionError('arbitrary purpose admitted')
        except control.Refusal as failure:assert str(failure)=='control-purpose'
        print('metadata watched omissions:',len(categories),'; default v1 unchanged; absent/unreadable refused')
        sys.exit(0)
    # These are machine resource providers, not admission decisions.
    os.statvfs = lambda path: types.SimpleNamespace(f_bavail=120*1024**3, f_frsize=1)
    def git(arguments, deadline):
        control.assert_deadline(deadline)
        if arguments == ['rev-parse','--verify','HEAD']:
            return (request['commit']+'\n').encode()
        assert arguments[:4] == ['ls-tree','-z',request['commit'],'--']
        rows = []
        for relative in arguments[4:]:
            payload = (root / relative).read_bytes()
            blob = hashlib.sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest()
            rows.append(('100644 blob '+blob+'\t'+relative).encode())
        return b'\0'.join(rows)+b'\0'
    control.fixed_git = git
    # The ordinary process runtime is deliberately generic; emulate only the selected native ABI provider.
    control.sys.version_info = (3,12,0)
    def set_limits(kind, limits):
        # Native manager forks independently; ordinary fork retains enough hard headroom for the service.
        if os.getpid()==fixture_parent and kind in (resource.RLIMIT_AS,resource.RLIMIT_FSIZE):
            real_setrlimit(kind,(limits[0],256*1024**2 if kind==resource.RLIMIT_AS else 2*1024**2))
        else:real_setrlimit(kind,limits)
    resource.setrlimit=set_limits
    resource.getrlimit=lambda kind: ((lambda pair:(pair[0],pair[0]))(real_getrlimit(kind)) if os.getpid()==fixture_parent and kind in (resource.RLIMIT_AS,resource.RLIMIT_FSIZE) else real_getrlimit(kind))
    replaced=False
    broken_competition=[]
    global_fds = []
    global_checks = []
    global_probe = []
    global_holder = None
    root_identity = (state.stat().st_dev,state.stat().st_ino,os.geteuid(),0o700)
    def watch_global(boundary):
        if os.getpid()!=fixture_parent or replaced:return
        try:competing=global_probe[0](str(state))
        except Exception as failure:assert str(failure)=='raw-staging-occupied',str(failure)
        else:
            os.close(competing)
            raise AssertionError('global staging lock absent:'+boundary)
        assert len(global_fds)==1,('global root acquisition count',boundary,global_fds)
        descriptor,identity=global_fds[0]
        held=os.fstat(descriptor);named=os.lstat(state)
        assert (held.st_dev,held.st_ino,held.st_uid,stat.S_IMODE(held.st_mode))==identity==root_identity
        assert (named.st_dev,named.st_ino,named.st_uid,stat.S_IMODE(named.st_mode))==identity
        assert descriptor<64 and fcntl.fcntl(descriptor,fcntl.F_GETFD)&fcntl.FD_CLOEXEC
        global_checks.append(boundary)
    original_capacity=control.observe_capacity
    def observe_locked(*arguments,**keywords):
        watch_global('capacity')
        facts=original_capacity(*arguments,**keywords)
        if replaced:
            assert facts['ledger']==request['ledger'] and not staging.is_occupied(control,helpers['raw'],str(state))
            raise AssertionError('unlocked later capacity')
        return facts
    control.observe_capacity=observe_locked
    native_close_authorities=control.close_authorities
    def close_inherited(target):
        native_close_authorities(target)
        if os.getpid()!=fixture_parent:
            for descriptor,identity in global_fds:
                try:os.fstat(descriptor)
                except OSError as failure:assert failure.errno==9
                else:raise AssertionError('owned child retained inherited global lock FD')
    control.close_authorities=close_inherited
    lifecycle = {}
    launched = []
    acks = []
    persisted = []
    native_load_helpers = control.load_helpers
    def helpers_with_provider():
        helpers = native_load_helpers()
        raw = helpers['raw']
        if mode=='state-replaced' and omit:helpers['repair'].check_lock=lambda *_:None
        original_acquire=raw.acquire_staging
        if not global_probe:global_probe.append(original_acquire)
        def acquire_staging(path):
            descriptor=(raw.open_private(path,directory=True) if mode=='global-dependency' and path==str(state)
                        else original_acquire(path))
            if path==str(state) and os.getpid()==fixture_parent:
                held=os.fstat(descriptor)
                global_fds.append((descriptor,(held.st_dev,held.st_ino,held.st_uid,stat.S_IMODE(held.st_mode))))
                if mode=='global-dependency':
                    competing=original_acquire(path);os.close(competing);broken_competition.append(True)
            return descriptor
        raw.acquire_staging=acquire_staging
        original_text = raw.read_text
        def read_text(path, limit=65536):
            if path == '/proc/meminfo': return 'MemAvailable: 4194304 kB\n'
            if path.startswith('/proc/') and path.endswith('/cgroup'):
                pid = int(path.split('/')[2])
                matches = [unit for unit,record in lifecycle.items() if record['pid'] == pid]
                assert len(matches)==1, ('missing fixture process',pid,lifecycle)
                return '0::/fixture/' + matches[0] + '\n'
            if path.startswith('/sys/fs/cgroup/fixture/'):
                name = path.rsplit('/',1)[1]
                if name in control.CAPS:
                    return 'max' if mode=='caps' and name=='memory.max' and os.getpid()==fixture_parent else control.CAPS[name]
                return {'memory.current':'1000', 'memory.peak':'2000', 'memory.events':'oom 0\noom_kill 0\n',
                    'cpu.stat':'usage_usec 10\nuser_usec 4\nsystem_usec 6\n','pids.current':'1', 'pids.events':'max 0\n',
                    'cgroup.events':'populated 0\nfrozen 0\n'}[name]
            return original_text(path, limit)
        raw.read_text = read_text
        def run_bounded(arguments, seconds, environment=None, descriptors=(), allowed=(0,), converter=False, monitor=None):
            if monitor: monitor()
            assert arguments[:3] == ['/usr/bin/systemctl','--user',arguments[2]]
            if arguments[2] == 'stop':
                watch_global('cleanup')
                unit = arguments[3]
                record = lifecycle[unit]
                if record['child'].poll() is None:
                    record['child'].kill()
                    record['child'].wait(timeout=1)
                return b''
            assert arguments[2] == 'show'
            unit = arguments[3]
            fields = arguments[4].removeprefix('--property=').split(',')
            record = lifecycle.get(unit)
            if fields == list(control.LIMITS):
                values = control.LIMITS
            elif record is None:
                values = dict(LoadState='not-found', ActiveState='inactive',SubState='dead',MainPID='0',
                    InvocationID='',ControlGroup='',Result='',ExecMainStatus='')
            else:
                active = record['child'].poll() is None
                values = dict(LoadState='loaded',ActiveState='active' if active else 'inactive',
                    SubState='running' if active else 'dead', MainPID=str(record['pid']) if active else '0',
                    InvocationID='c'*32, ControlGroup='/fixture/'+unit,Result='' if active else 'success',ExecMainStatus='' if active else '0')
                if mode=='identity' and active and os.getpid()==fixture_parent: values['MainPID'] = str(record['pid']+1)
                if mode=='cleanup' and not active: values['InvocationID'] = 'e'*32
            return ''.join(name+'='+values[name]+'\n' for name in fields).encode()
        raw.run_bounded = run_bounded
        if omit and mode=='cleanup':
            original_raw_require=raw.require
            raw.require=lambda predicate,code: original_raw_require(predicate,code) if code!='raw-cleanup-uncertain' else None
        if mode=='early-unlock':
            receive=helpers['repair'].receive_staging_channel
            def receive_then_close(*arguments):
                held=receive(*arguments);os.close(held);return None
            helpers['repair'].receive_staging_channel=receive_then_close
        if mode=='dead-foreign-enoent':
            receive=helpers['repair'].receive_staging_channel
            def foreign_enoent(endpoint,path,nonce,digest):
                try:return receive(endpoint,path,nonce,digest)
                except FileNotFoundError:
                    raise FileNotFoundError(2,'injected unrelated missing state','/unrelated/stat') from None
            helpers['repair'].receive_staging_channel=foreign_enoent
        return helpers
    control.load_helpers = helpers_with_provider
    with control.select_purpose('staging-channel'):
        # Prime the real helper/runtime closure before request binding, as native preparation does.
        captures = {str(root/relative):(root/relative).read_bytes() for relative in control.select_sources()}
        with control.repository_loader(captures): helpers = control.load_helpers()
        runtime = observed_runtime(control)
        request['runtimePins'] = [pin(path) for path in sorted(runtime)]
        request_sha = write_request()
        request['inventory'] = control.inventory_roots(request)
        request_sha = write_request()
        # Request timestamps are excluded; padding fixes allocated size before the final digest join.
        assert request['inventory'] == control.inventory_roots(request)
        if mode=='dead-start-cleanup':
            import ast
            def inspect_cleanup(factory,expected):
                descriptors=[];owned=[];pair=socket.socketpair;pipe=os.pipe2;fork=os.fork;start=helpers['raw'].process_start
                def open_pair(*args):
                    endpoints=pair(*args);descriptors.extend(endpoint.fileno() for endpoint in endpoints);return endpoints
                def open_pipe(*args):
                    opened=pipe(*args);descriptors.extend(opened);return opened
                def launch_owned():
                    pid=fork()
                    if pid:owned.append(pid)
                    return pid
                def fail_start(pid):
                    if os.getpid()==fixture_parent and pid in owned:raise OSError('parent-proc-fault')
                    return start(pid)
                socket.socketpair=open_pair;os.pipe2=open_pipe;os.fork=launch_owned;helpers['raw'].process_start=fail_start
                try:
                    try:factory(control,helpers,fixtures['dead']['path'],nonce,request_sha,time.monotonic()+2)
                    except OSError as failure:assert str(failure)=='parent-proc-fault'
                    else:raise AssertionError('parent observation fault suppressed')
                finally:socket.socketpair=pair;os.pipe2=pipe;os.fork=fork;helpers['raw'].process_start=start
                try:
                    ended,status=os.waitpid(owned[0],os.WNOHANG);reaped=False
                    if not ended:os.kill(owned[0],signal.SIGKILL);os.waitpid(owned[0],0)
                except ChildProcessError:reaped=True
                closed=True
                for descriptor in descriptors:
                    try:os.fstat(descriptor)
                    except OSError as failure:assert failure.errno==9
                    else:closed=False;os.close(descriptor)
                assert (reaped and closed)==expected,('unreaped child or leaked parent channel/pipe',reaped,closed)
            inspect_cleanup(staging.create_dead_channel,True)
            node=next(node for node in ast.parse((root/relatives[1]).read_bytes()).body if isinstance(node,ast.FunctionDef) and node.name=='create_dead_channel')
            scope=next(node for node in node.body if isinstance(node,ast.Try));observation=scope.body.pop(1)
            assert isinstance(observation,ast.Assign) and observation.targets[0].id=='child_start'
            node.body.insert(node.body.index(scope),observation);module=ast.Module(body=[node],type_ignores=[]);ast.fix_missing_locations(module)
            namespace=dict(staging.__dict__);exec(compile(module,'<removed-child-scope>','exec'),namespace)
            inspect_cleanup(namespace['create_dead_channel'],False)
            print('dead-start-cleanup GREEN original child reaped/all parent FDs closed; watched scope omission RED leaked child/FDs')
            sys.exit(0)
        if mode=='foreign-runtime':
            foreign=root/'sitecustomize.py';foreign.write_bytes(b'loaded=True\n');foreign.chmod(0o644)
            specification=importlib.util.spec_from_file_location('sitecustomize',foreign)
            module=importlib.util.module_from_spec(specification)
            previous=sys.modules.get('sitecustomize');sys.modules['sitecustomize']=module
            specification.loader.exec_module(module)
            original_require=control.require
            try:
                try:observed_runtime(control)
                except control.Refusal as failure:
                    assert str(failure)=='runtime-mapping'
                    assert any(str(foreign) in note for note in failure.__notes__)
                else:raise AssertionError('foreign startup hook entered native runtime')
                control.require=lambda predicate,code:original_require(predicate,code) if code!='runtime-mapping' else None
                assert str(foreign) in control.runtime_paths(),'omitted runtime guard failed to expose foreign hook'
            finally:
                control.require=original_require
                if previous is None:del sys.modules['sitecustomize']
                else:sys.modules['sitecustomize']=previous
            print('watched foreign startup-hook omission reached actual runtime closure')
            sys.exit(0)
        if mode=='runtime-provider':
            native_pin=request['pins'][8]
            assert native_pin['path']=='/usr/bin/python3.12' and native_pin['uid']==0
            assert native_pin['sha256']==hashlib.sha256(Path(physical_executable).read_bytes()).hexdigest()
            modeled_version=control.sys.version_info;modeled_samefile=control.os.path.samefile;modeled_uname=os.uname
            original_require=control.require;original_pin=copy.deepcopy(native_pin)
            before_lstat,before_fstat=os.lstat,os.fstat
            # Proof: owner/link/mode/kernel omissions hit source capture.
            for fault,category in (('version','runtime-binding'),('executable','runtime-binding'),('hash','pin-hash'),('owner','pin-identity'),('links','pin-identity'),('mode','pin-identity'),('kernel','kernel-binding')):
                try:
                    if fault=='version':control.sys.version_info=(3,14,0)
                    elif fault=='executable':control.os.path.samefile=lambda *_:False
                    elif fault=='hash':native_pin['sha256']='f'*64
                    elif fault in ('links','mode'):fault_metadata(native_pin['path'],fault)
                    elif fault=='kernel':os.uname=lambda:os.uname_result(('Linux','','foreign','fixture','x86_64'))
                    else:native_pin['uid']=1
                    try:control.verify_environment(request,time.monotonic()+3)
                    except control.Refusal as failure:assert str(failure)==category,(fault,str(failure))
                    else:raise AssertionError('unsafe modeled native provider admitted: '+fault)
                    control.require=lambda predicate,code:original_require(predicate,code) if code!=category else None
                    _,captured=control.verify_environment(request,time.monotonic()+3)
                    assert set(captured)=={str(root/relative) for relative in control.select_sources()}
                    print('watched native provider guard omission reached source capture:',fault)
                finally:
                    control.require=original_require;control.sys.version_info=modeled_version;control.os.path.samefile=modeled_samefile;os.uname=modeled_uname
                    os.lstat,os.fstat=before_lstat,before_fstat
                    native_pin.clear();native_pin.update(original_pin)
            print('runtime-provider modeled3.12 uses actual current bytes and guarded source capture')
            sys.exit(0)
        if mode=='cold-runtime':
            bootstrap=control.WORKER_BOOTSTRAP.replace('evidence/repair-native-control.py','evidence/staging-native-control.py').replace('98304','65536').replace('98305','65537')
            bootstrap=bootstrap.replace('root, expected, request, request_sha, nonce = sys.argv[1:]','root, expected, request, request_sha, nonce, coordinator_pid, coordinator_start = sys.argv[1:]')
            bootstrap=bootstrap.replace("sys.argv = [path, 'worker', request, request_sha, nonce]","sys.argv = [path, 'worker', request, request_sha, nonce, coordinator_pid, coordinator_start]")
            def service_limits():
                os.umask(0o077)
                for kind,value in ((resource.RLIMIT_AS,256*1024**2),(resource.RLIMIT_FSIZE,2*1024**2),(resource.RLIMIT_NOFILE,64),(resource.RLIMIT_CORE,0)):real_setrlimit(kind,(value,value))
                assert ctypes.CDLL(None).prctl(38,1,0,0,0)==0
            def cold(phase,omitted,endpoint=None,mapped='-'):
                arguments=[str(root),str(request_path),request_sha,nonce,phase,'yes' if omitted else 'no',mapped,bootstrap,str(root),request['pins'][7]['sha256'],str(request_path),request_sha,nonce,str(os.getpid()),helpers['raw'].process_start(os.getpid())]
                # Proof: omitting -S refused cold capture at runtime-mapping before started.
                return real_popen(['/usr/bin/python3','-I','-S','-B','-c',sys.argv[3],*arguments],stdin=subprocess.DEVNULL if endpoint is None else endpoint,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0,preexec_fn=service_limits)
            capture=cold('capture',False);output,errors=capture.communicate(timeout=3)
            assert capture.returncode==0 and errors==b'',errors
            closure=json.loads(output);platform_path='/usr/lib/python3.12/platform.py'
            assert platform_path not in closure['initial'] and platform_path in closure['complete']
            runtime_pins=[pin(path) for path in closure['complete']]
            copied_runtime=root/'changed-platform.py';original_runtime=Path(platform_path).read_bytes()
            copied_runtime.write_bytes(bytes([original_runtime[0]^1])+original_runtime[1:]);copied_runtime.chmod(stat.S_IMODE(Path(platform_path).stat().st_mode))
            for fault in ('baseline','unexpected','changed'):
                request['runtimePins']=copy.deepcopy(runtime_pins)
                if fault=='unexpected':request['runtimePins']=[entry for entry in request['runtimePins'] if entry['path']!=platform_path]
                request_sha=write_request()
                for omitted in ((False,) if fault=='baseline' else (False,True)):
                    channel=helpers['repair'].open_staging_channel(fixtures['live']['path'],nonce,request_sha)
                    channel.control.setsockopt(socket.SOL_SOCKET,socket.SO_PASSCRED,1)
                    child=cold('worker',omitted,channel.recipient,str(copied_runtime) if fault=='changed' else '-')
                    channel.close_recipient()
                    try:
                        assert select.select([child.stdout],[],[],3)[0]
                        marker=child.stdout.read(1)
                        if fault=='baseline' or omitted:
                            assert marker==b'!',(fault,omitted,marker)
                            frame,credentials,width=staging.receive_packet(control,channel.control,time.monotonic()+1,65536)
                            assert frame['phase']=='started' and credentials==(child.pid,os.geteuid(),os.getegid())
                            os.kill(child.pid,signal.SIGUSR2);output,errors=child.communicate(timeout=3)
                            assert child.returncode==0 and output==b'',errors
                            print('cold runtime '+fault+(': watched omission RED reached actual started' if omitted else ': GREEN complete runtime reached started'))
                        else:
                            assert marker!=b'!',('unexpected cold helper runtime reached started',fault)
                            output,errors=child.communicate(timeout=3)
                            assert child.returncode==1 and ('guard:'+('runtime-pin-set' if fault=='unexpected' else 'pin-hash')).encode() in errors,(fault,child.returncode,errors)
                            assert json.loads(marker+output)['phase']=='refused'
                            try:assert channel.control.recv(65536)==b''
                            except ConnectionResetError as failure:assert failure.errno==104
                            print('cold runtime '+fault+': GREEN refused before started')
                    finally:
                        if child.poll() is None:child.kill();child.wait(timeout=1)
                        channel.close()
                    assert not staging.is_occupied(control,helpers['raw'],fixtures['live']['path'])
            print('cold-runtime grouped regression and watched omissions')
            sys.exit(0)
        class Child:
            def __init__(self,pid,out,err):
                self.pid,self.stdout,self.stderr,self.returncode=pid,os.fdopen(out,'rb',buffering=0),os.fdopen(err,'rb',buffering=0),None
            def poll(self):
                if self.returncode is None:
                    ended,status=os.waitpid(self.pid,os.WNOHANG)
                    if ended:self.returncode=os.waitstatus_to_exitcode(status)
                return self.returncode
            def wait(self,timeout):
                end=time.monotonic()+timeout
                while self.poll() is None:
                    if time.monotonic()>=end:raise subprocess.TimeoutExpired('owned fixture',timeout)
                    select.select([],[],[],.001)
                return self.returncode
            def kill(self):
                if self.poll() is None:os.kill(self.pid,signal.SIGKILL)
        def launch(command, stdin, stdout, stderr, env, preexec_fn):
            watch_global('launch')
            unit=next(value.removeprefix('--unit=') for value in command if value.startswith('--unit='))
            assert command[:7] == ['/usr/bin/systemd-run','--user','--quiet','--pipe','--wait','--collect','--setenv=LANG=C']
            assert command[-2:]==[str(os.getpid()),helpers['raw'].process_start(os.getpid())]
            assert command[-7:-2] == [str(root), next(pin['sha256'] for pin in request['pins'] if pin['path']==str(root/relatives[1])),str(request_path),request_sha,nonce]
            if mode=='lost-handoff':
                payload,ancillary,flags,address=stdin.recvmsg(4097,socket.CMSG_SPACE(64)+socket.CMSG_SPACE(12),socket.MSG_CMSG_CLOEXEC)
                for level,kind,content in ancillary:
                    if kind==socket.SCM_RIGHTS:
                        rights=array.array('i');rights.frombytes(content)
                        for descriptor in rights:os.close(descriptor)
            out_read,out_write=os.pipe2(os.O_CLOEXEC)
            err_read,err_write=os.pipe2(os.O_CLOEXEC)
            pid=os.fork()
            if pid==0:
                try:
                    os.dup2(stdin.fileno(),0);os.dup2(out_write,1);os.dup2(err_write,2)
                    control.close_authorities(-1)
                    lifecycle[unit]={'pid':os.getpid(),'child':types.SimpleNamespace(poll=lambda:None)}
                    os.umask(0o077)
                    for kind,value in ((resource.RLIMIT_AS,256*1024**2),(resource.RLIMIT_FSIZE,2*1024**2),(resource.RLIMIT_NOFILE,64),(resource.RLIMIT_CORE,0)):
                        resource.setrlimit(kind,(value,value))
                    assert ctypes.CDLL(None).prctl(38,1,0,0,0)==0
                    native_exec=builtins.exec
                    def provider_exec(program,scope=None,local_scope=None):
                        if scope is None:scope=sys._getframe(1).f_globals
                        native_exec(program,scope,scope if local_scope is None else local_scope)
                        if scope.get('__name__')=='staging_shared_control':
                            fresh=sys.modules['staging_shared_control']
                            fresh.fixed_git=git;fresh.load_helpers=helpers_with_provider;fresh.load_staging=staging_with_faults
                            if omit:
                                fresh_require=fresh.require
                                fresh.require=lambda predicate,code:fresh_require(predicate,code) if code!=category else None
                    builtins.exec=provider_exec
                    bootstrap=command[command.index('-c')+1]
                    worker_arguments=command[command.index('-c')+2:]
                    if mode=='stale-controller':worker_arguments[-1]='0'
                    if mode=='wrong-controller':worker_arguments[-2]=str(os.getpid())
                    sys.argv=['-c',*worker_arguments]
                    native_exec(compile(bootstrap,'<native-bootstrap>','exec'),{'__name__':'__main__'})
                    if mode=='private-stderr':os.write(2,b'private-token')
                    if mode=='trailing-stdout':os.write(1,b'trailing')
                    if mode=='output-overflow':os.write(2,b'x'*65537)
                    os._exit(0)
                except BaseException as failure:
                    os.write(2,('fixture-worker:'+type(failure).__name__+':'+str(failure)+'\n').encode())
                    os._exit(1)
            os.close(out_write);os.close(err_write)
            child=Child(pid,out_read,err_read)
            lifecycle[unit]={'pid':pid,'child':child}
            launched.append(child)
            return child
        subprocess.Popen=launch
        original_persist=control.persist_projection
        def persist(packet,nonce,projection,budget,deadline):
            global replaced
            watch_global('publish:'+projection['phase'])
            if mode=='persistence' and projection['phase'].endswith('-durable'):
                original_fsync=os.fsync
                def fail_fsync(descriptor):
                    if os.readlink('/proc/self/fd/'+str(descriptor)).endswith('-live-durable.json'):raise OSError('injected fsync failure')
                    return original_fsync(descriptor)
                os.fsync=fail_fsync
            width=original_persist(packet,nonce,projection,budget,deadline)
            persisted.append(projection['phase'])
            if mode=='state-replaced' and projection['phase']=='live-terminal':
                state.rename(state.parent/'held-original');state.mkdir(mode=0o700);replaced=True
                assert control.digest(helpers['repair'].read_reservations(str(state)))==request['ledger']['digest']
            return width
        control.persist_projection=persist
        native_staging_loader=control.load_staging
        def staging_with_faults():
            module=native_staging_loader()
            original_send=module.send_packet
            original_receive=module.receive_packet
            original_release=module.release_worker
            def send(control_module, endpoint, frame, deadline):
                if os.getpid()!=fixture_parent and type(frame) is dict:
                    frame=copy.deepcopy(frame)
                    if mode=='stale-ready' and frame.get('phase')=='started':frame['observedNs']='0'
                    if mode=='forged-pid' and frame.get('phase')=='started':frame['binding']['pid']+=1
                    if mode=='forged-start' and frame.get('phase')=='started':frame['binding']['start']='0'
                    if mode=='case-outcome' and frame.get('phase')=='ready':frame['outcome']='foreign'
                    if mode=='complete-phase' and frame.get('phase')=='complete':frame['phase']='foreign'
                    if mode=='counter' and frame.get('phase')=='complete':frame['counter']['counters']['cpu.stat']='usage_usec bad'
                    if mode=='packet-oversize' and frame.get('phase')=='started':
                        endpoint.sendmsg([b'x'*65537],[],socket.MSG_DONTWAIT);return
                if os.getpid()==fixture_parent and type(frame) is dict and 'bindingDigest' in frame:
                    # The second ACK of each case must follow both actual fsync barriers.
                    case='live' if len(acks)<2 else 'dead'
                    if len(acks)%2==1:assert case+'-durable' in persisted,'premature durability ACK'
                    if mode=='foreign-ack' and len(acks)%2==0:
                        child=os.fork()
                        if child==0:
                            try:
                                os.dup2(endpoint.fileno(),0);control_module.close_authorities(-1)
                                forwarded=socket.socket(fileno=os.dup(0))
                                original_send(control_module,forwarded,frame,deadline)
                                forwarded.close();os._exit(0)
                            except BaseException:os._exit(1)
                        ended,status=os.waitpid(child,0)
                        assert ended==child and os.waitstatus_to_exitcode(status)==0
                        acks.append((case,list(persisted)));return
                    acks.append((case,list(persisted)))
                return original_send(control_module,endpoint,frame,deadline)
            def receive(*arguments):
                if os.getpid()==fixture_parent and mode in ('SIGINT','SIGTERM'):
                    os.kill(os.getpid(),getattr(signal,mode))
                return original_receive(*arguments)
            def release(control_module,raw,binding,deadline):
                if mode=='signal-timeout':return
                if mode=='foreign-signal':
                    pid=os.fork()
                    if pid==0:
                        try:
                            control_module.close_authorities(-1)
                            descriptor=os.pidfd_open(binding['pid'],0)
                            signal.pidfd_send_signal(descriptor,signal.SIGUSR1)
                            os.close(descriptor)
                            os._exit(0)
                        except BaseException:os._exit(1)
                    ended,status=os.waitpid(pid,0)
                    assert ended==pid and os.waitstatus_to_exitcode(status)==0
                    return
                if mode=='pidfd-start':
                    binding=dict(binding,start='0')
                return original_release(control_module,raw,binding,deadline)
            module.send_packet=send;module.receive_packet=receive;module.release_worker=release
            return module
        control.load_staging=staging_with_faults
        if omit:
            category={'state-replaced':'repair-lock-invalid','request-purpose':'request-purpose','request-version':'request-schema',
                'request-fixture':'staging-fixture-binding','fixture-nonempty':'staging-fixture-binding','stale-ready':'staging-ready-binding',
                'case-outcome':'staging-case-binding','complete-phase':'staging-complete-binding',
                'stale-controller':'staging-startup-signal','wrong-controller':'staging-startup-signal',
                'cleanup':'raw-cleanup-uncertain','foreign-ack':'staging-ack-credentials','dead-foreign-enoent':'staging-dead-refusal','pidfd-start':'staging-signal-binding'}[mode]
            original_require=control.require
            control.require=lambda predicate,code:original_require(predicate,code) if code!=category else None
        signal.signal(signal.SIGINT,control.cancel);signal.signal(signal.SIGTERM,control.cancel)
        if mode.startswith('request-'):
            if mode=='request-purpose':request['purpose']='foreign'
            elif mode=='request-version':request['schemaVersion']=1
            elif mode=='request-role':request['pins'].pop(7)
            elif mode=='request-fixture':request['fixtures']['live']['inode']='0'
            request_sha=write_request()
        if mode=='fixture-nonempty':
            (Path(fixtures['live']['path'])/'foreign').write_bytes(b'owned-fixture')
            request['inventory']=control.inventory_roots(request);request_sha=write_request()
        if mode=='global-holder':global_holder=global_probe[0](str(state))
        try:
            control.entry(['run',str(request_path),request_sha,nonce])
        except BaseException as failure:
            print('REFUSED',type(failure).__name__,str(failure))
            for child in launched:
                if child.poll() is not None and not child.stderr.closed: print(child.stderr.read().decode())
            if mode=='global-dependency':
                assert str(failure)=='helper-refused-unavailable' and broken_competition==[True]
                assert not launched and not persisted and len(global_fds)==1
                print('watched broken global acquire admitted real competition; original-lock join refused before capacity')
            expected={'state-replaced':'unlocked later capacity' if omit else 'helper-refused-unavailable','global-holder':'raw-staging-occupied','request-purpose':'request-purpose','request-version':'request-schema','request-role':'pin-set',
                'request-fixture':'staging-fixture-binding','fixture-nonempty':'staging-fixture-binding','identity':'raw-unit-binding','caps':'raw-native-caps',
                'forged-pid':'staging-ready-binding','forged-start':'staging-ready-native','stale-ready':'staging-ready-binding',
                'pidfd-start':'staging-signal-binding','case-outcome':'staging-case-binding','complete-phase':'staging-complete-binding',
                'counter':'raw-counter-invalid','early-unlock':'staging-adoption-exclusion','cleanup':'raw-cleanup-uncertain',
                'private-stderr':'service-trailing-output','trailing-stdout':'service-trailing-output','output-overflow':'service-trailing-output',
                'packet-oversize':'staging-packet-auth','SIGINT':'control-cancelled','SIGTERM':'control-cancelled'}
            if mode=='global-dependency':pass
            elif mode in expected:
                assert str(failure)==expected[mode],(mode,type(failure).__name__,str(failure))
            elif mode in ('foreign-signal','stale-controller','wrong-controller','signal-timeout','lost-handoff','foreign-ack','dead-foreign-enoent'):
                assert isinstance(failure,(ConnectionResetError,control.Refusal)),(mode,type(failure).__name__,str(failure))
            elif mode=='persistence':assert isinstance(failure,OSError)
            else:raise
            if omit and mode=='state-replaced':print('watched omission accepted unsafe dependency: state-replaced')
            if omit and mode!='state-replaced':raise AssertionError('watched omitted guard still refused: '+mode)
            assert not (packet/('observation-'+nonce+'-live-terminal.json')).exists() or mode in ('cleanup','dead-foreign-enoent','state-replaced')
            if mode=='persistence':assert len(acks)==1
            print('bounded actual-path negative:',mode,'ACKs',len(acks))
        else:
            assert mode in ('positive','global-lifetime') or omit, ('unsafe mode accepted',mode)
            assert len(launched)==2
            records=[json.loads(path.read_bytes()) for path in sorted(packet.glob('observation-*'))]
            assert [record['phase'] for record in records]==['dead-durable','dead-terminal','live-durable','live-terminal']
            for label in staging.LABELS:
                durable=json.loads((packet/('observation-'+nonce+'-'+label+'-durable.json')).read_bytes())
                assert durable['ready']['outcome']==('foreign' if mode=='case-outcome' else 'adopted' if label=='live' else 'dead-sender-refused')
                assert durable['complete']['counter']['counters']['cpu.stat']=='usage_usec 10\nuser_usec 4\nsystem_usec 6'
                assert durable['socketpairSeam']==(label=='dead')
            if mode=='global-lifetime':
                assert global_checks.count('launch')==2 and global_checks.count('cleanup')==4
                assert all('publish:'+label+'-'+phase in global_checks for label in staging.LABELS for phase in ('durable','terminal'))
                print('global original root FD/identity retained across both cases, durable publication and repeated cleanup')
            print('watched omission accepted unsafe dependency: '+mode if omit else 'REAL ordinary handoff live adopted/dead refused, durable counters and repeated original cleanup')
        finally:
            if global_holder is not None:os.close(global_holder)
            for descriptor,identity in global_fds:
                try:os.fstat(descriptor)
                except OSError as failure:assert failure.errno==9
                else:raise AssertionError('original global lock FD leaked after controller exit')
            competing=global_probe[0](str(state));os.close(competing)
            subprocess.Popen=real_popen
            for child in launched:
                if child.poll() is None:child.kill()
                child.wait(timeout=1)
                child.stdout.close();child.stderr.close()
            for label in staging.LABELS:
                assert not staging.is_occupied(control,helpers['raw'],fixtures[label]['path'])
    os.lstat,os.fstat,os.statvfs=real_lstat,real_fstat,real_statvfs
`;

for (const mode of [
  'state-replaced',
  'omit-state-replaced',
  'dead-start-cleanup',
  'cold-runtime',
  'runtime-provider',
  'foreign-runtime',
  'global-lifetime',
  'global-holder',
  'global-dependency',
  'startup',
  'metadata',
  'packets',
  'positive',
  'request-purpose',
  'request-version',
  'request-role',
  'request-fixture',
  'fixture-nonempty',
  'identity',
  'caps',
  'forged-pid',
  'forged-start',
  'stale-ready',
  'pidfd-start',
  'case-outcome',
  'complete-phase',
  'counter',
  'early-unlock',
  'lost-handoff',
  'cleanup',
  'private-stderr',
  'trailing-stdout',
  'output-overflow',
  'packet-oversize',
  'SIGINT',
  'SIGTERM',
  'foreign-signal',
  'stale-controller',
  'wrong-controller',
  'signal-timeout',
  'persistence',
  'foreign-ack',
  'dead-foreign-enoent',
  'omit-request-purpose',
  'omit-request-version',
  'omit-request-fixture',
  'omit-fixture-nonempty',
  'omit-stale-ready',
  'omit-case-outcome',
  'omit-complete-phase',
  'omit-stale-controller',
  'omit-wrong-controller',
  'omit-cleanup',
  'omit-foreign-ack',
  'omit-dead-foreign-enoent',
]) {
  test(`native staging source ${mode} uses bounded ordinary ownership`, () => {
    // Proof: omitting -S restored .pth auto-import and runtime-mapping in the positive fixture.
    // Proof: pre-model system link/mode faults RED at pin-identity; actual bytes still reach capture.
    const metadataFault =
      "\n    if str(path).startswith('/usr/'):observed=change_stat(observed,st_uid=1234,st_nlink=3,st_mode=observed.st_mode|0o022)\n";
    const provider = ['runtime-provider', 'cold-runtime'].includes(mode)
      ? runtimeProvider.replace(
          'def runtime_observation(observed,path):',
          'def runtime_observation(observed,path):' + metadataFault,
        )
      : runtimeProvider;
    const child = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-S',
        '-B',
        '-c',
        fixture.replace(runtimeProvider, provider),
        source,
        mode,
        coldWorker.replace(runtimeProvider, provider),
      ],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      },
    );
    expect(new TextDecoder().decode(child.stderr)).toBe('');
    expect(child.exitCode).toBe(0);
    const report = new TextDecoder().decode(child.stdout);
    if (mode === 'runtime-provider') {
      for (const fault of ['version', 'executable', 'hash', 'owner', 'links', 'mode', 'kernel']) {
        expect(report).toContain(
          'watched native provider guard omission reached source capture: ' + fault,
        );
      }
    }
    if (mode === 'positive' || mode === 'global-lifetime') {
      expect(report).toContain(
        'REAL ordinary handoff live adopted/dead refused, durable counters and repeated original cleanup',
      );
    } else if (mode.startsWith('omit-')) {
      expect(report).toContain('watched omission accepted unsafe dependency:');
    } else if (
      [
        'startup',
        'metadata',
        'packets',
        'cold-runtime',
        'runtime-provider',
        'foreign-runtime',
        'dead-start-cleanup',
      ].includes(mode)
    ) {
      expect(report).toContain('watched');
    } else {
      expect(report).toContain(`bounded actual-path negative: ${mode}`);
    }
  }, 25000);
}

const canonicalFixture = String.raw`
import errno, hashlib, importlib.util, os, shutil, stat, sys, tempfile
from pathlib import Path
source,fault,omission=sys.argv[1:]
# This exact existing role family is asserted against the imported production tuple below.
roles=['/usr/bin/'+name for name in ('python3.12','systemd-run','systemctl','git','true')]+['/usr/lib/x86_64-linux-gnu/'+name for name in ('ld-linux-x86-64.so.2','libc.so.6')]
with tempfile.TemporaryDirectory(prefix='task120-canonical-') as directory:
    root=Path(directory);selected={};payloads={};targets={}
    for index,role in enumerate(roles[1:]):
        target=root/('payload'+str(index));target.write_bytes(Path(role).read_bytes());target.chmod(0o755)
        link=root/('role'+str(index));link.symlink_to(target.name)
        selected[role]=str(link);payloads[role]=target.read_bytes();targets[role]=target
    role='/usr/bin/true';target=targets[role];link=Path(selected[role])
    if fault=='missing':link.unlink()
    if fault=='dangling':target.unlink()
    if fault=='nonregular':target.unlink();target.mkdir(mode=0o755)
    realpath=os.path.realpath
    os.path.realpath=lambda path,*args,**keywords:realpath(selected.get(str(path),path),*args,**keywords)
    provider=sys.argv[0]
    try:exec(compile(provider,'<selected-system-provider>','exec'))
    except FileNotFoundError:
        assert fault in ('missing','dangling') and omission=='none'
        print('protected strict canonical resolution');sys.exit(0)
    if fault in ('missing','dangling'):
        assert omission=='strict'
        try:os.open(role,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
        except FileNotFoundError:print('EXERCISE strict omission reached actual missing open');sys.exit(0)
        raise AssertionError('missing canonical tool opened')
    specification=importlib.util.spec_from_file_location('canonical_control',source)
    control=importlib.util.module_from_spec(specification);specification.loader.exec_module(control)
    assert tuple(tools)==control.TOOLS==tuple(roles)
    def pinned(selected):
        payload=payloads[selected] if selected in payloads else Path(physical_executable).read_bytes()
        return dict(path=selected,sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload),uid=0,mode=0o755)
    if fault=='all-roles':
        for selected in roles:
            pin=pinned(selected);captured=control.verify_file(pin,capture=True)[1]
            assert captured==(payloads[selected] if selected in payloads else Path(physical_executable).read_bytes())
            if selected in targets:
                observed=os.lstat(selected);physical=installed_lstat(targets[selected])
                assert (observed.st_dev,observed.st_ino,observed.st_size,observed.st_mtime_ns,observed.st_ctime_ns)==(physical.st_dev,physical.st_ino,physical.st_size,physical.st_mtime_ns,physical.st_ctime_ns)
        replacement=root/'foreign';replacement.write_bytes(b'foreign canonical selection')
        link.unlink();link.symlink_to(replacement.name)
        assert control.verify_file(pinned(role),capture=True)[1]==payloads[role]
        owned=root/'owned';owned.write_bytes(b'owned')
        assert os.lstat(owned).st_uid==installed_lstat(owned).st_uid
        print('EXERCISE all7 exact canonical roles captured; alias retarget preserves selected inode; owned path stays real');sys.exit(0)
    pin=pinned(role)
    if fault=='post-symlink':
        replacement=root/'replacement';replacement.write_bytes(payloads[role]);replacement.chmod(0o755)
        target.unlink();target.symlink_to(replacement.name)
    if fault=='post-type':target.unlink();target.mkdir(mode=0o755)
    if fault=='size':
        payload=payloads[role]+b'x';target.write_bytes(payload)
        pin['sha256']=hashlib.sha256(payload).hexdigest()
    if omission!='none':
        require=control.require
        control.require=lambda predicate,category:require(predicate,category) if category!='pin-identity' else None
    try:captured=control.verify_file(pin,capture=True)[1]
    except control.Refusal as failure:
        assert omission=='none' and str(failure)=='pin-identity'
        print('protected canonical '+fault);sys.exit(0)
    except OSError as failure:
        assert omission=='pin-identity'
        # Proof: actual EISDIR in size omission fails; omitting this guard falsely accepts it.
        if (fault,failure.errno) not in (('post-symlink',errno.ELOOP),('nonregular',errno.EISDIR),('post-type',errno.EISDIR)):raise
        print('EXERCISE identity omission reached actual '+('NOFOLLOW ELOOP' if fault=='post-symlink' else 'directory read EISDIR'));sys.exit(0)
    assert fault=='size' and omission=='pin-identity' and captured==payloads[role]+b'x'
    print('EXERCISE identity omission captured actual wrong-size bytes')
`;

for (const fault of [
  'all-roles',
  'missing',
  'dangling',
  'nonregular',
  'post-symlink',
  'post-type',
  'size',
]) {
  test(`selected fixed-tool canonical alias ${fault} preserves physical admission`, () => {
    // Proof: real canonical type/size faults refuse; omissions reach actual open/read/capture.
    for (const omission of fault === 'all-roles'
      ? ['none']
      : ['none', fault === 'missing' || fault === 'dangling' ? 'strict' : 'pin-identity']) {
      const provider =
        omission === 'strict'
          ? runtimeProvider.replace('os.path.realpath(path,strict=True)', 'os.path.realpath(path)')
          : runtimeProvider;
      if (omission === 'strict') expect(provider).not.toBe(runtimeProvider);
      const program = canonicalFixture.replace(
        'provider=sys.argv[0]',
        'provider=' + JSON.stringify(provider),
      );
      const child = Bun.spawnSync(
        [
          '/usr/bin/python3',
          '-I',
          '-S',
          '-B',
          '-c',
          program,
          source.replace('staging-native-control.py', 'repair-native-control.py'),
          fault,
          omission,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
      );
      expect(child.stderr.toString()).toBe('');
      expect(child.exitCode).toBe(0);
      expect(child.stdout.toString()).toContain(
        fault === 'all-roles' || omission !== 'none' ? 'EXERCISE' : 'protected',
      );
    }
  });
}

const directoryReadFault = String.raw`
    read=os.read
    def read_directory(descriptor,limit):
        if os.readlink('/proc/self/fd/'+str(descriptor))==str(target):
            directory=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
            try:
                print('EXERCISE injected actual directory read',flush=True)
                return read(directory,limit)
            finally:os.close(directory)
        return read(descriptor,limit)
    os.read=read_directory
`;

test('canonical size omission rejects an actual directory read before capture', () => {
  const boundary =
    "        if (fault,failure.errno) not in (('post-symlink',errno.ELOOP),('nonregular',errno.EISDIR),('post-type',errno.EISDIR)):raise\n";
  for (const omitted of [false, true]) {
    const program = canonicalFixture
      .replace('provider=sys.argv[0]', 'provider=' + JSON.stringify(runtimeProvider))
      .replace(
        '    try:captured=control.verify_file(pin,capture=True)[1]',
        directoryReadFault + '    try:captured=control.verify_file(pin,capture=True)[1]',
      );
    const selected = omitted ? program.replace(boundary, '') : program;
    if (omitted) expect(selected).not.toBe(program);
    const child = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-S',
        '-B',
        '-c',
        selected,
        source.replace('staging-native-control.py', 'repair-native-control.py'),
        'size',
        'pin-identity',
      ],
      { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
    );
    expect(child.stdout.toString()).toContain('EXERCISE injected actual directory read');
    expect(child.stdout.toString()).not.toContain('captured actual wrong-size bytes');
    if (omitted) {
      expect(child.exitCode).toBe(0);
      expect(child.stderr.toString()).toBe('');
      expect(child.stdout.toString()).toContain(
        'identity omission reached actual directory read EISDIR',
      );
    } else {
      expect(child.exitCode).not.toBe(0);
      expect(child.stderr.toString()).toContain('IsADirectoryError');
      expect(child.stdout.toString()).not.toContain(
        'identity omission reached actual directory read EISDIR',
      );
    }
    console.info(
      'size actual-directory dependency, boundary omitted=' +
        String(omitted) +
        ', child exit=' +
        String(child.exitCode),
    );
  }
});
