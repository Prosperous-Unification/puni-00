import { expect, test } from 'bun:test';

const consumption = String.raw`
import importlib.util, json, os, pathlib, stat, sys, tempfile, types
spec=importlib.util.spec_from_file_location('repair',pathlib.Path(sys.argv[1])/'lab-raw-repair.py')
repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
writer=repair.writer
with tempfile.TemporaryDirectory(prefix='puni-consumption115-') as scratch:
    directory=pathlib.Path(scratch); directory.chmod(0o700)
    for name in ('request-binding','reservation','worker-ready','failure'):
        repair.raw.persist(directory,name+'.json',{'original':name})
    descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    context=writer.SettlementContext(repair,dict(originalDirectory=str(directory),nonce='b'*32,state=str(directory)), 'b'*64)
    context.directory_fd=descriptor;context.raw_fd=descriptor
    context.source='c'*64;context.history={};context.reservation={'nonce':'a'*32}
    context.directory_identity=context.snapshot_directory(os.fstat(descriptor))
    # Selected target/profile and full ledger admission are modeled here; original ioctl/fsync and publication remain native.
    context.check_live=lambda *args,**kwargs: ({'selected':'healthy-writable'}, {})
    context.check_physical_profile=lambda *args,**kwargs: {'selected':'healthy-writable'}
    context.repair=types.SimpleNamespace(**vars(repair))
    context.repair.verify_inputs=lambda request:'c'*64
    context.repair.read_repair_accounting=lambda *args,**kwargs:dict(namespaces=[dict(nonce='a'*32,state='legacy')])
    calls=[];native_call=writer.native_call
    def syscall(number,*arguments):
        returned=native_call(number,*arguments)
        if number in (16,74,257):calls.append([number,arguments[0].value,returned])
        return returned
    writer.native_call=syscall
    try:
        writer.SettlementPrerequisites().consume(context)
        context.publish_record('request',{})
        flags=bytearray(8)
        import fcntl
        fcntl.ioctl(descriptor,0x80086601,flags,True)
        assert int.from_bytes(flags,'little')==0x80080,flags
        child=os.open(directory/'settlement-request.json',os.O_RDONLY|os.O_CLOEXEC)
        try:
            fcntl.ioctl(child,0x80086601,flags,True)
            assert int.from_bytes(flags,'little')==0x80080,flags
        finally:os.close(child)
        assert (directory/'settlement-request.json').is_file()
        assert calls[:2]==[[16,descriptor,0],[74,descriptor,0]] and calls[2][:2]==[257,descriptor],calls
        assert stat.S_IMODE(os.fstat(descriptor).st_mode)==0o700
        for name in ('request-binding','reservation','worker-ready','failure'):
            original=os.open(directory/(name+'.json'),os.O_RDONLY|os.O_CLOEXEC)
            try:fcntl.ioctl(original,0x80086601,flags,True);assert int.from_bytes(flags,'little')==0x80000
            finally:os.close(original)
        print(json.dumps(dict(status='native-consumed-published',calls=calls,parentFlags=524416,newFlags=524416,originalFlags=524288,mode='0700')))
    finally:os.close(descriptor)
`;

test('native original directory consumption durably precedes inherited publication', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', consumption, import.meta.dir],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  const observation: unknown = JSON.parse(invocation.stdout.toString());
  expect(observation).toMatchObject({
    status: 'native-consumed-published',
    parentFlags: 524416,
    newFlags: 524416,
    originalFlags: 524288,
    mode: '0700',
  });
  console.info(invocation.stdout.toString().trim());
});

const accounting = String.raw`
import ctypes, importlib.util, os, pathlib, sys, tempfile
spec=importlib.util.spec_from_file_location('repair',pathlib.Path(sys.argv[1])/'lab-raw-repair.py')
repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
with tempfile.TemporaryDirectory(prefix='puni-consumed-ledger115-') as scratch:
    state=pathlib.Path(scratch);state.chmod(0o700)
    for nonce in ('a'*32,):
        directory=state/('raw-repair-'+nonce);directory.mkdir(mode=0o700)
        snapshot=dict(device='1',inode='2',owner=os.geteuid(),mode='0600',links=1,logicalBytes='8589934592',allocatedBytes='8435806208',mtimeNs='1',ctimeNs='2')
        reservation=repair.make_reservation(nonce,'b'*64,'c'*64,snapshot,154128384)
        for name,record in [('reservation',reservation),('request-binding',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={})),('worker-ready',dict(phase='ready')),('failure',dict(accepted=False))]:repair.raw.persist(directory,name+'.json',record)
        descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
        try:
            flags=ctypes.c_ulong(0x80080)
            assert repair.writer.native_call(16,ctypes.c_int(descriptor),ctypes.c_ulong(0x40086602),ctypes.byref(flags))==0
            assert repair.writer.native_call(74,ctypes.c_int(descriptor))==0
        finally:os.close(descriptor)
    if len(sys.argv)>2 and sys.argv[2]=='missing-history':
        (directory/'failure.json').unlink()
        omission=sys.argv[3] if len(sys.argv)>3 else 'none'
        if omission!='none':
            import ast
            tree=ast.parse((pathlib.Path(sys.argv[1])/'lab-repair-worker.py').read_text())
            function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='read_settlement_namespace')
            class Omit(ast.NodeTransformer):
                def visit_Call(self,node):
                    if isinstance(node.func,ast.Name) and node.func.id=='require' and len(node.args)==2 and isinstance(node.args[1],ast.Constant) and node.args[1].value==omission:
                        node.args[0]=ast.Subscript(value=ast.Tuple(elts=[node.args[0],ast.Constant(True)],ctx=ast.Load()),slice=ast.Constant(1),ctx=ast.Load())
                    return self.generic_visit(node)
            exec(compile(ast.fix_missing_locations(ast.Module(body=[Omit().visit(function)],type_ignores=[])),'watched namespace omission','exec'),vars(repair.writer))
        try:ledger=repair.read_repair_accounting(str(state))
        except repair.raw.PreparationRefusal:
            assert omission=='none';print('missing-original-refused');sys.exit(0)
        assert omission!='none', 'latched missing original became legacy'
        assert ledger['namespaces']==[dict(nonce='a'*32,state='consumed')] and ledger['settlementDebtBytes']=='33554432'
        print('watched-malformed-accounting');sys.exit(0)
    ledger=repair.read_repair_accounting(str(state))
    assert ledger['namespaces']==[dict(nonce='a'*32,state='consumed')],ledger
    assert ledger['unresolvedGrossBytes']=='141754548224' and ledger['settlementDebtBytes']=='33554432',ledger
    print('consumed-O-only-G-plus-K')
`;

test('native O-only consumed directory remains a globally counted attempt', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', accounting, import.meta.dir],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString().trim()).toBe('consumed-O-only-G-plus-K');
});

const faults = String.raw`
import ast, ctypes, errno, fcntl, importlib.util, os, pathlib, sys, tempfile, types
scenario=sys.argv[2]; omission=sys.argv[3]
base=pathlib.Path(sys.argv[1])
def load(name):
    path=base/name
    module=types.ModuleType(name);module.__file__=str(path)
    tree=ast.parse(path.read_text());changed=[]
    class Omit(ast.NodeTransformer):
        def visit_Expr(self,node):
            if omission=='omit-post-profile' and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='check_physical_profile':return ast.Pass()
            return self.generic_visit(node)
        def visit_Call(self,node):
            if isinstance(node.func,ast.Name) and node.func.id=='require' and len(node.args)==2 and isinstance(node.args[1],ast.Constant) and node.args[1].value in omission.split(','):
                node.args[0]=ast.Subscript(value=ast.Tuple(elts=[node.args[0],ast.Constant(True)],ctx=ast.Load()),slice=ast.Constant(1),ctx=ast.Load());changed.append(node.args[1].value)
            return self.generic_visit(node)
    tree=Omit().visit(tree)
    if name=='lab-repair-worker.py' and scenario.startswith('attempt-') and omission=='settlement-attempt-consumed':assert changed==['settlement-attempt-consumed']*2,changed
    exec(compile(ast.fix_missing_locations(tree),str(path),'exec'),vars(module))
    return module
repair=load('lab-raw-repair.py');writer=load('lab-repair-worker.py');repair.writer=writer
with tempfile.TemporaryDirectory(prefix='puni-consumption-fault115-') as scratch:
    state=pathlib.Path(scratch);state.chmod(0o700)
    snapshot=dict(device='1',inode='2',owner=os.geteuid(),mode='0600',links=1,logicalBytes='8589934592',allocatedBytes='8435806208',mtimeNs='1',ctimeNs='2')
    def original(nonce):
        directory=state/('raw-repair-'+nonce);directory.mkdir(mode=0o700)
        reservation=repair.make_reservation(nonce,'b'*64,'c'*64,snapshot,154128384)
        for name,record in [('reservation',reservation),('request-binding',dict(requestDigest='b'*64,sourceDigest='c'*64,initial={},unitBefore={})),('worker-ready',dict(phase='ready')),('failure',dict(accepted=False))]:repair.raw.persist(directory,name+'.json',record)
        return directory,reservation
    directory,reservation=original('a'*32)
    descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    unrelated=state/'unrelated';unrelated.touch(mode=0o600)
    other_fd=os.open(unrelated,os.O_RDWR|os.O_CLOEXEC)
    native_call=writer.native_call; calls=[];creates=0; loss_seen=False; actual_setters=[]; attempt_index=False; refused=None
    native_text=writer.raw.read_text
    # Only the selected target security/profile and directory one-block geometry are modeled.
    # No native setter, fsync, GETFLAGS, inherited flags, file publication or FIEMAP result is replaced positively.
    writer.raw.read_text=lambda path,*args: 'lockdown,capability,landlock,yama,apparmor,ima,evm' if path=='/sys/kernel/security/lsm' else 'fixture' if path=='/proc/cmdline' else native_text(path,*args)
    repair.observe_profile=lambda request,fd: {'selected':'healthy-writable'}
    repair.observe_facts=lambda state:dict(availableMemoryBytes=3623878656,freeBytes=500*1024**3,retainedInodeBytes=repair.raw.allocated_bytes(state),otherFutureReservations=0)
    native_fstat=os.fstat
    def fstat(fd):
        observed=native_fstat(fd)
        if fd!=descriptor:return observed
        quantities={name:getattr(observed,name) for name in dir(observed) if name.startswith('st_')}
        quantities.update(st_size=4096,st_blocks=8)
        return types.SimpleNamespace(**quantities)
    os.fstat=fstat
    native_ioctl=fcntl.ioctl
    def ioctl(fd,number,buffer,mutate=False):
        returned=native_ioctl(fd,number,buffer,mutate)
        if (scenario=='initial-index' or attempt_index) and fd==descriptor and number==0x80086601:buffer[:]=(int.from_bytes(buffer,'little')|0x1000).to_bytes(8,'little')
        return returned
    fcntl.ioctl=ioctl
    class External(writer.SettlementPrerequisites):
        def outside_bytes(self,context):return 0
    def make_context():
        context=writer.SettlementContext(repair,dict(originalDirectory=str(directory),nonce='b'*32,state=str(state)), 'b'*64)
        context.directory_fd=descriptor;context.raw_fd=other_fd;context.source='c'*64
        context.history={};context.reservation=reservation;context.directory_identity=context.snapshot_directory(os.fstat(descriptor));context.prerequisites=External()
        # Full canonical request/source/terminal joins are covered by the conditional integration fixture.
        context.repair=types.SimpleNamespace(**vars(repair));context.repair.verify_inputs=lambda request:'c'*64
        context.check_live=lambda raw_fd,directory_fd,initial=False:(context.check_physical_profile(raw_fd,directory_fd,initial),context.observe_capacity(initial))
        return context
    context=make_context()
    def set_flags(fd,flags):
        value=ctypes.c_ulong(flags)
        assert native_call(16,ctypes.c_int(fd),ctypes.c_ulong(0x40086602),ctypes.byref(value))==0
    def syscall(number,*arguments):
        global creates,loss_seen
        fd=arguments[0].value
        if number==16:
            calls.append(('set',fd))
            if scenario in ('setter-error','reserve-error') or scenario=='attempt-repeat-failed' and len(calls)==1:ctypes.set_errno(errno.ENOSPC);return -1
            if scenario=='setter-wrong-fd':return native_call(number,ctypes.c_int(other_fd),*arguments[1:])
        if number==74 and fd==descriptor and creates==0:
            calls.append(('sync',fd))
            if scenario=='process-before-sync':os._exit(73)
            if scenario=='loss-before-sync' and not loss_seen:loss_seen=True;raise RuntimeError('process lost before fullsync')
            if omission=='omit-native-fullsync':return 0
            if omission=='wrong-native-fullsync-fd':return native_call(number,ctypes.c_int(other_fd))
        returned=native_call(number,*arguments)
        if number==16:
            actual_setters.append((fd,returned))
            if scenario=='serialization-error':ctypes.set_errno(errno.EIO);return -1
            if scenario=='setter-unknown':raise RuntimeError('unknown setter completion')
            if scenario=='pair-mode':directory.chmod(0o750)
            if scenario=='pair-identity':
                directory.rename(state/'moved');directory.mkdir(mode=0o700)
                for original_path in (state/'moved').iterdir():repair.raw.persist(directory,original_path.name,repair.read_record(original_path))
            if scenario=='pair-source':context.source='d'*64
            if scenario=='pair-profile':
                context.repair.observe_profile=lambda *args:(_ for _ in ()).throw(repair.raw.PreparationRefusal('modeled profile became read-only'))
            if scenario=='pair-flags':set_flags(descriptor,0x80000)
            if scenario=='pair-extra':set_flags(descriptor,0x80088)
        if number==74 and fd==descriptor and creates==0:
            if scenario=='fullsync-error':ctypes.set_errno(errno.EIO);return -1
            if scenario=='post-sync-mode':directory.chmod(0o750)
            if scenario=='post-sync-profile':context.repair.observe_profile=lambda *args:(_ for _ in ()).throw(repair.raw.PreparationRefusal('modeled profile became read-only after sync'))
            if scenario=='process-after-sync':
                assert returned==0;os._exit(74)
            if scenario=='loss-after-sync' and not loss_seen:loss_seen=True;raise RuntimeError('process lost after fullsync')
        if number==257:
            creates+=1
            if scenario=='failed-create-no-name':
                assert returned>=0;os.posix_fallocate(returned,0,4096);os.close(returned);os.unlink(arguments[1].value,dir_fd=fd)
                return -1
            if scenario=='inherited-missing':set_flags(returned,0x80000)
            if scenario=='inherited-extra':set_flags(returned,0x80088)
        return returned
    writer.native_call=syscall
    try:
        if scenario.startswith('attempt-'):
            if scenario=='attempt-repeat-failed':
                try:writer.SettlementPrerequisites().consume(context)
                except writer.raw.PreparationRefusal as failure:assert str(failure)=='settlement-consumption-setflags'
                else:raise AssertionError('first modeled failed setter was accepted')
                assert context.consumption_attempted and not context.consuming
                assert writer.read_inode_flags(descriptor)==0x80000 and not actual_setters
            elif scenario=='attempt-foreign-context':
                class ForeignContext(writer.SettlementContext):pass
                context.__class__=ForeignContext
            else:
                native_check_live=context.check_live
                def qualify_then_change(*arguments,**keywords):
                    global attempt_index
                    observed=native_check_live(*arguments,**keywords)
                    if scenario=='attempt-flags':set_flags(descriptor,0x80008)
                    elif scenario=='attempt-index':attempt_index=True
                    elif scenario=='attempt-occupied':repair.raw.persist(directory,'unexpected.json',{'foreign':True})
                    else:raise AssertionError(('unknown attempt fault',scenario))
                    return observed
                context.check_live=qualify_then_change
            writer.SettlementPrerequisites().consume(context)
            raise RuntimeError('controlled exit after observed setter boundary')
        if scenario=='initial-extra':set_flags(descriptor,0x80008)
        if scenario in ('other-consumed','two-consumed'):
            other,_=original('9'*32);other_descriptor=os.open(other,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
            try:set_flags(other_descriptor,0x80080);assert native_call(74,ctypes.c_int(other_descriptor))==0
            finally:os.close(other_descriptor)
            if scenario=='two-consumed':set_flags(descriptor,0x80080)
        if scenario in ('process-before-sync','process-after-sync'):
            child=os.fork()
            if child==0:
                writer.SettlementPrerequisites().consume(context)
                os._exit(99)
            ended,status=os.waitpid(child,0)
            assert ended==child and os.waitstatus_to_exitcode(status)==(73 if scenario=='process-before-sync' else 74)
            ledger=repair.read_repair_accounting(str(state))
            assert ledger['namespaces']==[dict(nonce='a'*32,state='consumed')]
            assert ledger['unresolvedGrossBytes']=='141754548224' and ledger['settlementDebtBytes']=='33554432'
            context=make_context()
            try:writer.SettlementPrerequisites().consume(context);context.publish_record('request',{})
            except (writer.raw.PreparationRefusal,repair.raw.PreparationRefusal):pass
            assert not calls and creates==0,(calls,creates)
            raise RuntimeError('controlled parent exit after actual process loss')
        if scenario in ('missing-grant','forged-grant'):

            if scenario=='forged-grant':
                set_flags(descriptor,0x80080);context.consuming=True;context.consumption_attempted=True
        else:
            writer.SettlementPrerequisites().consume(context)
            if scenario=='repeat-consume':writer.SettlementPrerequisites().consume(context)
            if scenario=='forked-context':
                child=os.fork()
                if child==0:
                    try:context.publish_record('request',{})
                    except (writer.raw.PreparationRefusal,repair.raw.PreparationRefusal):os._exit(0)
                    os._exit(2)
                ended,status=os.waitpid(child,0)
                assert ended==child and os.waitstatus_to_exitcode(status)==(0 if omission=='none' else 2)
                creates=int((directory/'settlement-request.json').exists())
                raise RuntimeError('controlled parent exit after fork observation')
            if scenario=='changed-source':context.source='d'*64
            if scenario=='copied-context':
                clone=make_context();vars(clone).update(vars(context));context=clone
            if scenario=='changed-fd':context.directory_fd=other_fd
        context.publish_record('request',{})
    except (repair.raw.PreparationRefusal,writer.raw.PreparationRefusal,OSError,RuntimeError) as failure:refused=str(failure)
    if omission=='none' and scenario in ('loss-before-sync','loss-after-sync','setter-unknown','serialization-error','fullsync-error','failed-create-no-name'):
        assert set(os.listdir(descriptor))=={'request-binding.json','reservation.json','worker-ready.json','failure.json'}
        ledger=repair.read_repair_accounting(str(state));assert ledger['unresolvedGrossBytes']=='141754548224' and ledger['settlementDebtBytes']=='33554432'
        first_creates=creates;first_setters=sum(call[0]=='set' for call in calls)
        context=make_context()
        try:writer.SettlementPrerequisites().consume(context);context.publish_record('request',{})
        except (repair.raw.PreparationRefusal,writer.raw.PreparationRefusal):pass
        assert creates==first_creates and sum(call[0]=='set' for call in calls)==first_setters, (calls,creates)
        assert ledger['namespaces']==[dict(nonce='a'*32,state='consumed')],ledger
    if scenario.startswith('attempt-'):
        assert creates==0,(scenario,omission,calls,actual_setters)
        assert actual_setters==([] if omission=='none' else [(descriptor,0)]),(scenario,omission,calls,actual_setters,refused)
        if omission=='none':assert refused=='settlement-attempt-consumed',refused
        if scenario=='attempt-repeat-failed':assert len(calls)==(1 if omission=='none' else 3),(calls,refused)
        print(__import__('json').dumps(dict(status='protected-before-setter' if omission=='none' else 'watched-native-setter',scenario=scenario,actualSetters=actual_setters,creates=creates,refusal=refused)))
    elif scenario in ('inherited-missing','inherited-extra'):
        assert creates==1 and ((directory/'settlement-request.json').stat().st_blocks==0)==(omission=='none')
        print('inherited-refused-before-allocation' if omission=='none' else 'watched-forbidden-allocation')
    elif scenario=='failed-create-no-name':
        assert creates==1;print('no-name-restart-refused')
    elif omission!='none':
        assert creates==1 and ((state/'moved' if scenario=='pair-identity' else directory)/'settlement-request.json').exists(),(scenario,omission,calls,creates)
        print('watched-forbidden-create')
    else:
        assert creates==0,(scenario,calls,creates)
        if scenario in ('other-consumed','initial-index','initial-extra','two-consumed'):assert not calls,calls
        print('protected-before-create')
    os.close(descriptor);os.close(other_fd)
`;

const faultVectors = [
  ['missing-grant', 'settlement-consumption-grant,settlement-consumption-directory'],
  ['forged-grant', 'settlement-consumption-grant'],
  ['forked-context', 'settlement-consumption-grant'],
  ['copied-context', 'settlement-consumption-grant'],
  ['changed-source', 'settlement-consumption-grant'],
  [
    'setter-error',
    'settlement-consumption-setflags,settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory',
  ],
  [
    'reserve-error',
    'settlement-consumption-setflags,settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory',
  ],
  ['serialization-error', 'settlement-consumption-setflags'],
  ['pair-profile', 'omit-post-profile'],
  ['fullsync-error', 'settlement-consumption-sync'],
  ['pair-source', 'settlement-consumption-pair,settlement-consumption-grant'],
  [
    'pair-mode',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory,settlement-parent',
  ],
  [
    'pair-identity',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory,settlement-parent,settlement-file',
  ],
  [
    'setter-wrong-fd',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory',
  ],
  [
    'post-sync-mode',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory,settlement-parent',
  ],
  [
    'pair-flags',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory',
  ],
  [
    'pair-extra',
    'settlement-parent-profile,settlement-consumption-pair,settlement-consumption-directory,settlement-parent-flags',
  ],
  ['other-consumed', 'settlement-global-consumed'],
] as const;

for (const [scenario, guard] of faultVectors) {
  test(`native consumption watched refusal ${scenario}`, () => {
    for (const omission of ['none', guard]) {
      const invocation = Bun.spawnSync(
        ['/usr/bin/python3', '-I', '-B', '-c', faults, import.meta.dir, scenario, omission],
        { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stdout.toString().trim()).toBe(
        omission === 'none' ? 'protected-before-create' : 'watched-forbidden-create',
      );
    }
  });
}

for (const scenario of [
  'process-before-sync',
  'process-after-sync',
  'setter-unknown',
  'serialization-error',
  'loss-before-sync',
  'loss-after-sync',
  'failed-create-no-name',
  'pair-profile',
  'post-sync-profile',
  'changed-fd',
  'initial-index',
  'initial-extra',
  'two-consumed',
  'repeat-consume',
  'inherited-missing',
  'inherited-extra',
]) {
  test(`native consumption bounded failure ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', faults, import.meta.dir, scenario, 'none'],
      { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe(
      scenario.startsWith('inherited-')
        ? 'inherited-refused-before-allocation'
        : scenario === 'failed-create-no-name'
          ? 'no-name-restart-refused'
          : 'protected-before-create',
    );
  });
}

for (const omission of ['omit-native-fullsync', 'wrong-native-fullsync-fd']) {
  test(`native consumption watched fullsync dependency ${omission}`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        faults,
        import.meta.dir,
        'fullsync-dependency',
        omission,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('watched-forbidden-create');
  });
}

for (const scenario of ['inherited-missing', 'inherited-extra']) {
  test(`native inherited flags watched allocation ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        faults,
        import.meta.dir,
        scenario,
        'settlement-file-flags',
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('watched-forbidden-allocation');
  });
}

test('latched directory with missing original history cannot become legacy accounting', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', accounting, import.meta.dir, 'missing-history'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString().trim()).toBe('missing-original-refused');
});

test('missing original history watched omission reaches malformed accounting admission', () => {
  const invocation = Bun.spawnSync(
    [
      '/usr/bin/python3',
      '-I',
      '-B',
      '-c',
      accounting,
      import.meta.dir,
      'missing-history',
      'settlement-namespace-conflict',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString().trim()).toBe('watched-malformed-accounting');
});

for (const scenario of [
  'attempt-repeat-failed',
  'attempt-foreign-context',
  'attempt-flags',
  'attempt-index',
  'attempt-occupied',
]) {
  test(`attempt guard production omission reaches native setter ${scenario}`, () => {
    for (const omission of ['none', 'settlement-attempt-consumed']) {
      const invocation = Bun.spawnSync(
        ['/usr/bin/python3', '-I', '-B', '-c', faults, import.meta.dir, scenario, omission],
        { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
      );
      expect(invocation.stderr.toString()).toBe('');
      expect(invocation.exitCode).toBe(0);
      const observation: unknown = JSON.parse(invocation.stdout.toString());
      expect(observation).toMatchObject({
        status: omission === 'none' ? 'protected-before-setter' : 'watched-native-setter',
        scenario,
        creates: 0,
      });
      console.info(invocation.stdout.toString().trim());
    }
  });
}
