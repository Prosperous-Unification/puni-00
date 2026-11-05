import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const harness = fileURLToPath(
  new URL(
    '../../../openspec/changes/observability-environment-parity/evidence/repair-native-control.py',
    import.meta.url,
  ),
);

const metadataSelfcheck = String.raw`
import importlib.util, sys, tempfile
specification = importlib.util.spec_from_file_location('repair_control', sys.argv[1])
control = importlib.util.module_from_spec(specification)
specification.loader.exec_module(control)
control.tempfile = tempfile
selfcheck_source = r'''
def selfcheck():
    """Metadata only: intercept actual CLI launch; watched faults never create native authority."""
    namespace = globals()
    original_root,original_run,original_require = ROOT,run_control,require
    with tempfile.TemporaryDirectory(prefix='repair-metadata-') as directory:
        root = Path(directory)
        packet = root / PLAN / 'repair-native-controls'
        packet.mkdir(parents=True,mode=0o700)
        nonce = 'a' * 32
        path = packet / ('request-' + nonce + '.json')
        pin_paths = [str(root / relative) for relative in SOURCES] + list(TOOLS)
        valid = {'schemaVersion':1,'root':str(root),
            'state':str(root / '.puni/fleet-labs/observability-baseline'),
            'outside':str(root / PLAN),'packet':str(packet),'nonce':nonce,
            'commit':'b' * 40,
            'runtimePins':[dict(path=p,sha256='f'*64,bytes=0 if p.endswith('__init__.py') else 1,uid=0,mode=0o644) for p in ('/etc/python3.12/sitecustomize.py','/usr/lib/python3/dist-packages/apport_python_hook.py','/usr/lib/python3.12/urllib/__init__.py')],
            'pins':[{'path':name,'sha256':'c'*64,'bytes':1,'uid':os.geteuid(),'mode':0o644}
                     for name in pin_paths],
            'kernel':{'release':'7.0.11-76070011-generic','version':'fixture','machine':'x86_64'},
            'inventory':{'digest':'d'*64,'entries':2,'retainedBytes':0,'outsideBytes':0},
            'ledger':{'digest':'e'*64,'records':0,'grossBytes':0}}
        intercepted = []
        namespace['run_control'] = lambda *_:intercepted.append('first-launch')
        namespace['ROOT'] = root
        original_authorize = authorize
        namespace['authorize'] = lambda path,sha,nonce:original_authorize(path,sha,nonce,root)
        try:
            def write_request(record):
                payload = encode(record)
                path.write_bytes(payload)
                path.chmod(0o600)
                return hashlib.sha256(payload).hexdigest()
            request_sha = write_request(valid)
            entry(['run',str(path),request_sha,nonce])
            require(intercepted == ['first-launch'],'selfcheck-positive')
            cases = []
            def changed(key,value):
                record = decode(encode(valid))
                record[key] = value
                return record
            cases.extend((('schema',changed('bounds',{}),'request-schema'),
                ('nonce',changed('nonce','f'*32),'request-nonce'),
                ('paths',changed('outside',str(root)),'request-paths'),
                ('commit',changed('commit','wrong'),'source-commit'),
                ('pins',changed('pins',[]),'pin-set'),
                ('runtime-pins',changed('runtimePins',[]),'runtime-pin-set'),
                ('kernel',changed('kernel',{'release':'wrong','version':'fixture','machine':'x86_64'}),'kernel-schema'),
                ('inventory',changed('inventory',{'digest':'d'*64,'entries':20001,'retainedBytes':0,'outsideBytes':0}),'inventory-schema'),
                ('ledger',changed('ledger',{'digest':'e'*64,'records':0,'grossBytes':False}),'ledger-schema')))
            for name,request,category in cases:
                request_sha = write_request(request)
                intercepted.clear()
                try:
                    entry(['run',str(path),request_sha,nonce])
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-category')
                else:
                    raise AssertionError('missing refusal: ' + name)
                require(not intercepted,'selfcheck-protected-launch')
                def omit_category(predicate,code):
                    if code != category:
                        original_require(predicate,code)
                namespace['require'] = omit_category
                try:
                    entry(['run',str(path),request_sha,nonce])
                    if not intercepted:
                        raise AssertionError('fault did not reach intercepted launch: ' + name)
                finally:
                    namespace['require'] = original_require
                print('metadata-guard ' + name + ': GREEN refusal; watched removed-check RED reached launch sentinel')
            for name,request,category in (
                ('pin-schema',changed('pins',[dict(valid['pins'][0],mode=0o666),*valid['pins'][1:]]),'pin-schema'),
            ):
                request_sha = write_request(request)
                intercepted.clear()
                try:
                    entry(['run',str(path),request_sha,nonce])
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-category')
                else:
                    raise AssertionError('missing refusal: ' + name)
                require(not intercepted,'selfcheck-protected-launch')
                namespace['require'] = lambda predicate,code:original_require(predicate,code) if code != category else None
                try:
                    entry(['run',str(path),request_sha,nonce])
                    require(bool(intercepted),'selfcheck-fault-not-observed')
                finally:
                    namespace['require'] = original_require
                print('metadata-guard ' + name + ': GREEN refusal; watched removed-check RED reached launch sentinel')
            valid_payload = encode(valid)
            for name,payload,supplied_sha,selected_path,category in (
                ('digest',valid_payload,'0'*64,path,'request-digest'),
                ('path',valid_payload,hashlib.sha256(valid_payload).hexdigest(),packet / 'unexpected.json','request-path'),
                ('duplicate',b'{"schemaVersion":1,' + valid_payload[1:],None,path,'request-json'),
                ('bound',valid_payload + b' '*(OUTPUT_LIMIT+1-len(valid_payload)),None,path,'request-bound')):
                selected_path.write_bytes(payload)
                selected_path.chmod(0o600)
                supplied_sha = supplied_sha if supplied_sha is not None else hashlib.sha256(payload).hexdigest()
                intercepted.clear()
                try:
                    entry(['run',str(selected_path),supplied_sha,nonce])
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-category')
                else:
                    raise AssertionError('missing refusal: ' + name)
                require(not intercepted,'selfcheck-protected-launch')
                namespace['require'] = lambda predicate,code:original_require(predicate,code) if code != category else None
                try:
                    entry(['run',str(selected_path),supplied_sha,nonce])
                    require(bool(intercepted),'selfcheck-fault-not-observed')
                finally:
                    namespace['require'] = original_require
                print('metadata-boundary ' + name + ': GREEN refusal; watched removed-check RED reached launch sentinel')
            request_sha = write_request(valid)
            for name,change,category in (
                ('unreadable',lambda:path.chmod(0o200),'request-unreadable'),
                ('mode',lambda:path.chmod(0o640),'request-owner-mode')):
                path.chmod(0o600)
                readable = os.open(path,os.O_RDONLY)
                actual_open = os.open
                os.open = lambda selected,flags,*more,**keys:os.dup(readable) if str(selected) == str(path) else actual_open(selected,flags,*more,**keys)
                change()
                intercepted.clear()
                try:
                    entry(['run',str(path),request_sha,nonce])
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-category')
                else:
                    raise AssertionError('missing refusal: ' + name)
                require(not intercepted,'selfcheck-protected-launch')
                namespace['require'] = lambda predicate,code:original_require(predicate,code) if code != category else None
                try:
                    entry(['run',str(path),request_sha,nonce])
                    require(bool(intercepted),'selfcheck-fault-not-observed')
                finally:
                    namespace['require'] = original_require
                os.open = actual_open
                os.close(readable)
                print('metadata-file ' + name + ': GREEN refusal; watched removed-check RED reached launch sentinel')
            path.chmod(0o600)
            path.unlink()
            try:
                entry(['run',str(path),request_sha,nonce])
            except Refusal as refusal:
                require(str(refusal) == 'request-absent','selfcheck-category')
            else:
                raise AssertionError('absence guard missing')
            pin_path = root / 'pinned'
            pin_path.write_bytes(b'X')
            pin_path.chmod(0o644)
            pin = {'path':str(pin_path),'bytes':1,'sha256':hashlib.sha256(b'X').hexdigest(),
                   'uid':os.geteuid(),'mode':0o644}
            verify_file(pin)
            for key,wrong,category in (('bytes',2,'pin-identity'),('mode',0o600,'pin-identity'),
                                         ('sha256','f'*64,'pin-hash')):
                damaged = dict(pin,**{key:wrong})
                try:
                    verify_file(damaged)
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-pin-category')
                else:
                    raise AssertionError('pin guard missing')
                namespace['require'] = lambda predicate,code:original_require(predicate,code) if code != category else None
                try:
                    verify_file(damaged)
                finally:
                    namespace['require'] = original_require
                print('metadata-pin ' + key + ': GREEN refusal; watched removed-check RED accepted bad metadata')
            facts = {'inventory':{'outsideBytes':0,'retainedBytes':0},
                     'ledger':{'grossBytes':0},'freeBytes':100*GIB,
                     'availableMemoryBytes':2*GIB+640*MIB,'initial':True}
            check_capacity(facts)
            for category in ('capacity-memory','capacity-backing','capacity-outside','capacity-staging'):
                broken = decode(encode(facts))
                if category == 'capacity-memory':
                    broken['availableMemoryBytes'] -= 1
                elif category == 'capacity-backing':
                    broken['freeBytes'] = 50*GIB + FUTURE_GUEST + FIXTURE_LIMIT + METADATA_LIMIT - 1
                elif category == 'capacity-outside':
                    broken['inventory']['outsideBytes'] = 160*MIB - FUTURE_GUEST - FIXTURE_LIMIT - METADATA_LIMIT + 1
                else:
                    broken['inventory']['retainedBytes'] = 10*GIB - 160*MIB + 1
                try:
                    check_capacity(broken)
                except Refusal as refusal:
                    require(str(refusal) == category,'selfcheck-capacity-category')
                else:
                    raise AssertionError('capacity guard missing')
                namespace['require'] = lambda predicate,code:original_require(predicate,code) if code != category else None
                try:
                    check_capacity(broken)
                finally:
                    namespace['require'] = original_require
                print('metadata-capacity ' + category + ': GREEN refusal; watched removed-check RED accepted one-byte-short metadata')
        finally:
            namespace['ROOT'],namespace['run_control'],namespace['require'] = original_root,original_run,original_require
            namespace['authorize'] = original_authorize
    print('selfcheck: metadata-only; no native enforcement or lifecycle claim')

'''
exec(compile(selfcheck_source, 'metadata-selfcheck', 'exec'), control.__dict__)
control.selfcheck()
`;

function checkMetadata(mode: 'selfcheck' | 'ast-check') {
  const child = Bun.spawnSync(
    mode === 'ast-check'
      ? ['python3', '-I', '-B', harness, mode]
      : ['python3', '-I', '-B', '-c', metadataSelfcheck, harness],
    {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
  expect(new TextDecoder().decode(child.stderr)).toBe('');
  expect(child.exitCode).toBe(0);
  return new TextDecoder().decode(child.stdout);
}

test('finite native-control source compiles without importing its native helpers', () => {
  expect(checkMetadata('ast-check')).toBe('repair-native-control: AST-valid\n');
});

test('metadata guards protect the actual CLI launch and fail under watched check removal', () => {
  const report = checkMetadata('selfcheck');
  for (const name of [
    'schema',
    'nonce',
    'paths',
    'commit',
    'pins',
    'runtime-pins',
    'kernel',
    'inventory',
    'ledger',
    'pin-schema',
  ]) {
    expect(report).toContain(
      `metadata-guard ${name}: GREEN refusal; watched removed-check RED reached launch sentinel\n`,
    );
  }
  for (const name of ['digest', 'path', 'duplicate', 'bound']) {
    expect(report).toContain(
      `metadata-boundary ${name}: GREEN refusal; watched removed-check RED reached launch sentinel\n`,
    );
  }
  for (const name of ['unreadable', 'mode']) {
    expect(report).toContain(
      `metadata-file ${name}: GREEN refusal; watched removed-check RED reached launch sentinel\n`,
    );
  }
  for (const name of ['bytes', 'mode', 'sha256']) {
    expect(report).toContain(
      `metadata-pin ${name}: GREEN refusal; watched removed-check RED accepted bad metadata\n`,
    );
  }
  for (const name of ['memory', 'backing', 'outside', 'staging']) {
    expect(report).toContain(
      `metadata-capacity capacity-${name}: GREEN refusal; watched removed-check RED accepted one-byte-short metadata\n`,
    );
  }
  expect(report.match(/watched removed-check RED/g)).toHaveLength(23);
  expect(report).toEndWith('selfcheck: metadata-only; no native enforcement or lifecycle claim\n');
});

const repairFixes = String.raw`
import contextlib, hashlib, importlib.util, importlib.machinery, os, pathlib, stat, sys, tempfile, types
specification=importlib.util.spec_from_file_location('control',sys.argv[1])
control=importlib.util.module_from_spec(specification)
specification.loader.exec_module(control)
case=sys.argv[2]
def refused(operation, category):
    try: operation()
    except control.Refusal as failure:
        assert str(failure)==category
    else: raise AssertionError('unsafe '+category+' accepted')
source_pin={'path':str(control.ROOT/control.RELATIVE),'mode':0o644,'bytes':1,'uid':os.geteuid(),'sha256':'0'*64}
def facts(initial=True):
    return {'inventory':{'outsideBytes':0,'retainedBytes':0},'ledger':{'grossBytes':0},
            'freeBytes':100*control.GIB,'availableMemoryBytes':2*control.GIB+640*control.MIB,'initial':initial}
if case=='initial-memory':
    current=facts()
    control.check_capacity(current)
    current['availableMemoryBytes']-=1
    refused(lambda: control.check_capacity(current),'capacity-memory')
    original_require=control.require
    control.require=lambda predicate,category: original_require(predicate,category) if category!='capacity-memory' else None
    control.check_capacity(current)
    control.require=original_require
    print('watched initial-memory guard removed: RED accepted one byte short')
    current['initial']=False
    current['availableMemoryBytes']=2*control.GIB
    control.check_capacity(current)
    current['availableMemoryBytes']-=1
    refused(lambda:control.check_capacity(current),'capacity-memory')
    launched=[]
    original_popen=control.subprocess.Popen
    class LaunchReached(Exception):pass
    def launch(*arguments,**keywords):
        launched.append(True)
        raise LaunchReached()
    control.subprocess.Popen=launch
    control.check_loaded_runtime=lambda *arguments:None
    control.check_directory=lambda *arguments,**keywords:None
    short=facts();short['availableMemoryBytes']-=1
    control.observe_capacity=lambda *arguments,**keywords:control.check_capacity(short)
    helpers={'raw':types.SimpleNamespace(observe_unit=lambda _: {'LoadState':'not-found'},client_limits=lambda:None)}
    started=control.time.monotonic()
    try:
        refused(lambda:control.coordinate_controls({'packet':'/synthetic','pins':[source_pin]},'/request','sha','a'*32,'source',helpers,
                started,started+12,[started+12]),'capacity-memory')
        assert not launched
        control.require=lambda predicate,category: original_require(predicate,category) if category!='capacity-memory' else None
        try:control.coordinate_controls({'packet':'/synthetic','pins':[source_pin]},'/request','sha','a'*32,'source',helpers,started,started+12,[started+12])
        except LaunchReached:pass
        else:raise AssertionError('watched launch fault missing')
        assert launched==[True]
    finally:control.subprocess.Popen=original_popen
    print('initial headroom guard protects actual controller before launch sentinel')
elif case=='staging':
    current=facts()
    current['inventory']['retainedBytes']=10*control.GIB-160*control.MIB
    control.check_capacity(current)
    current['inventory']['retainedBytes']+=1
    refused(lambda:control.check_capacity(current),'capacity-staging')
    original_require=control.require
    control.require=lambda predicate,category: original_require(predicate,category) if category!='capacity-staging' else None
    control.check_capacity(current)
    control.require=original_require
    print('watched staging guard removed: RED accepted one byte short')
elif case=='inventory':
    with tempfile.TemporaryDirectory(prefix='repair-inventory-') as directory:
        root=pathlib.Path(directory)
        state=root/'state';outside=root/'outside';packet=outside/'repair-native-controls'
        for path in (state,outside,packet):path.mkdir(mode=0o700)
        nonce='a'*32
        request_path=packet/('request-'+nonce+'.json')
        request_path.write_bytes(b'X'*65536);request_path.chmod(0o600)
        legacy=state/'legacy';legacy.mkdir(mode=0o700);legacy.chmod(0o775);outside.chmod(0o775)
        unrelated=legacy/'owned';unrelated.write_bytes(b'A'*4096);unrelated.chmod(0o600)
        request={'state':str(state),'outside':str(outside),'packet':str(packet),'nonce':nonce}
        assert stat.S_IMODE(legacy.stat().st_mode)==stat.S_IMODE(outside.stat().st_mode)==0o775
        before=control.inventory_roots(request)
        for active in (state,packet):
            control.check_directory(active,private=True)
            active.chmod(0o775)
            refused(lambda:control.check_directory(active,private=True),'directory-identity')
            active.chmod(0o700)
        original_require=control.require
        def omit(code):
            control.require=lambda predicate,category:original_require(predicate,category) if category!=code else None
        for mode in (0o400,0o100,0o777):
            legacy.chmod(mode)
            refused(lambda:control.check_inventory_directory(legacy),'inventory-directory-identity')
            omit('inventory-directory-identity');control.check_inventory_directory(legacy);control.require=original_require
        legacy.chmod(0o775)
        excluded=root/'excluded';excluded.mkdir();hidden=excluded/'entry';hidden.write_bytes(b'A')
        alias=legacy/'alias';alias.symlink_to(excluded,target_is_directory=True)
        for wrong in (unrelated,alias):
            refused(lambda:control.check_inventory_directory(wrong),'inventory-directory-identity')
            omit('inventory-directory-identity');control.check_inventory_directory(wrong);control.require=original_require
        actual_lstat=os.lstat
        def copy_stat(observation):
            return types.SimpleNamespace(**{name:getattr(observation,name) for name in (
                'st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_blocks','st_mtime_ns','st_ctime_ns')})
        def foreign(path,*arguments,**keywords):
            observation=copy_stat(actual_lstat(path,*arguments,**keywords));observation.st_uid+=1;return observation
        os.lstat=foreign
        try:
            refused(lambda:control.check_inventory_directory(legacy),'inventory-directory-identity')
            omit('inventory-directory-identity');control.check_inventory_directory(legacy)
        finally:os.lstat=actual_lstat;control.require=original_require
        first=control.inventory_roots(request);hidden.write_bytes(b'B')
        assert control.inventory_roots(request)==first
        legacy.chmod(0o755);assert control.inventory_roots(request)['digest']!=first['digest'];legacy.chmod(0o775)
        count=[0]
        def changed(path,*arguments,**keywords):
            observation=actual_lstat(path,*arguments,**keywords)
            if str(path)==str(legacy):
                count[0]+=1
                if count[0]>1:observation=copy_stat(observation);observation.st_mtime_ns+=1
            return observation
        os.lstat=changed
        try:
            refused(lambda:control.inventory_roots(request),'inventory-changed')
            count[0]=0;omit('inventory-changed');control.inventory_roots(request)
        finally:os.lstat=actual_lstat;control.require=original_require
        print('watched passive shape/identity guards removed: RED accepted bad metadata; active0775 refused')
        before=control.inventory_roots(request)
        identity=os.stat(unrelated)
        unrelated.write_bytes(b'B'*4096)
        os.utime(unrelated,ns=(identity.st_atime_ns,identity.st_mtime_ns+1000000))
        after=control.inventory_roots(request)
        assert (identity.st_ino,identity.st_size,identity.st_blocks)==(unrelated.stat().st_ino,unrelated.stat().st_size,unrelated.stat().st_blocks)
        assert before['digest']!=after['digest'],'same-inode/size/block unrelated rewrite accepted'
        actual_lstat=os.lstat
        def frozen_timestamps(path,*arguments,**keywords):
            observation=actual_lstat(path,*arguments,**keywords)
            if str(path)==str(unrelated):
                observation=types.SimpleNamespace(**{name:getattr(observation,name) for name in (
                    'st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_blocks','st_mtime_ns','st_ctime_ns')})
                observation.st_mtime_ns=identity.st_mtime_ns
                observation.st_ctime_ns=identity.st_ctime_ns
            return observation
        os.lstat=frozen_timestamps
        try:assert control.inventory_roots(request)==before
        finally:os.lstat=actual_lstat
        print('watched inventory timestamp dependency frozen: RED accepted unrelated rewrite')
        before=after
        with request_path.open('r+b') as stream:stream.write(b'Y'*65536)
        assert control.inventory_roots(request)==before,'exact request-only rebind invalidated'
elif case=='source-cache':
    with tempfile.TemporaryDirectory(prefix='repair-loader-') as directory:
        root=pathlib.Path(directory)
        source_root=root/'tools/tool-fleet/src';source_root.mkdir(parents=True)
        originals={}
        for relative in control.SOURCES:
            path=root/relative;path.parent.mkdir(parents=True,exist_ok=True)
            payload=b'REVIEWED=True\nrequire=lambda *args:None\n'
            if path.name=='lab-repair-worker.py':
                payload+=b"import importlib.util\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('nested',Path(__file__).with_name('lab-raw-preparation.py'))\nnested=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(nested)\nassert nested.REVIEWED\ndef load_again():\n    spec=importlib.util.spec_from_file_location('late',Path(__file__).with_name('lab-raw-preparation.py'))\n    late=importlib.util.module_from_spec(spec)\n    spec.loader.exec_module(late)\n    return late.REVIEWED\n"
            path.write_bytes(payload);path.chmod(0o644)
            pin={'path':str(path),'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'mode':0o644,'uid':os.geteuid()}
            if hasattr(control,'repository_loader'):
                blob, captured=control.verify_file(pin,capture=True)
                originals[str(path)]=captured
            else:
                control.verify_file(pin);originals[str(path)]=payload
        control.ROOT=root
        def enter_missing():
            with control.repository_loader({}):pass
        refused(enter_missing,'source-buffer-set')
        original_require=control.require
        control.require=lambda predicate,category:original_require(predicate,category) if category!='source-buffer-set' else None
        enter_missing()
        control.require=original_require
        with control.repository_loader(originals):
            refused(lambda:control.importlib.util.spec_from_file_location('unselected',source_root/'unselected.py'),
                    'source-import-unpinned')
            control.require=lambda predicate,category:original_require(predicate,category) if category!='source-import-unpinned' else None
            assert control.importlib.util.spec_from_file_location('unselected',source_root/'unselected.py') is not None
            control.require=original_require
        print('watched source buffer/role guards removed: RED admitted missing buffers/unselected sibling')
        original_get_code=importlib.machinery.SourceFileLoader.get_code
        def cache_marker(loader, fullname):return compile('UNPINNED_CACHE=True\nrequire=lambda *args:None',loader.path,'exec')
        importlib.machinery.SourceFileLoader.get_code=cache_marker
        try:
            context=control.repository_loader(originals) if hasattr(control,'repository_loader') else contextlib.nullcontext()
            with context:
                loaded=control.load_helpers()
                assert all(getattr(helper,'REVIEWED',False) for helper in loaded.values()),'unverified repository cache executed'
                assert loaded['writer'].load_again()
            cached=control.load_helpers()
            assert all(helper.UNPINNED_CACHE for helper in cached.values())
            print('watched source loader omitted: RED executed substituted repository cache')
            for path in originals: pathlib.Path(path).write_text('CHANGED_AFTER_VERIFY=True\n')
            with control.repository_loader(originals):
                assert all(helper.REVIEWED for helper in control.load_helpers().values())
        finally:importlib.machinery.SourceFileLoader.get_code=original_get_code
elif case=='worker-bootstrap':
    with tempfile.TemporaryDirectory(prefix='repair-bootstrap-') as directory:
        root=pathlib.Path(directory)
        path=root/control.RELATIVE;path.parent.mkdir(parents=True)
        body=b"import sys\nsys._repair_bootstrap_marker=True\n"
        path.write_bytes(body);path.chmod(0o644)
        expected=hashlib.sha256(body).hexdigest()
        original_argv=sys.argv[:]
        actual_write,actual_read=os.write,os.read
        errors=[]
        os.write=lambda descriptor,payload:errors.append(payload) or len(payload)
        def execute(sha,code=None):
            sys.argv=['-c',str(root),sha,'/request','q'*64,'a'*32]
            scope={}
            exec(control.WORKER_BOOTSTRAP if code is None else code,scope)
            assert sys.argv==[str(path),'worker','/request','q'*64,'a'*32]
        try:
            execute(expected)
            assert sys._repair_bootstrap_marker is True
            del sys._repair_bootstrap_marker
            assert not errors
            try:execute('0'*64)
            except SystemExit as failure:assert failure.code==1
            else:raise AssertionError('wrong bootstrap hash executed')
            assert not hasattr(sys,'_repair_bootstrap_marker')
            assert errors==[b'repair-native-control: worker-source-refused\n'];errors.clear()
            replacement=root/'replacement';replacement.write_bytes(body);replacement.chmod(0o644)
            def substitute(descriptor,count):
                payload=actual_read(descriptor,count)
                os.replace(replacement,path)
                return payload
            os.read=substitute
            try:execute(expected)
            except SystemExit as failure:assert failure.code==1
            else:raise AssertionError('bootstrap path substitution executed')
            finally:os.read=actual_read
            assert not hasattr(sys,'_repair_bootstrap_marker')
            assert errors==[b'repair-native-control: worker-source-refused\n'];errors.clear()
            path.chmod(0o600)
            reads=[]
            os.read=lambda *arguments:reads.append('payload-read') or b''
            try:execute(expected)
            except SystemExit as failure:assert failure.code==1
            else:raise AssertionError('unsafe bootstrap source mode accepted')
            assert not reads;errors.clear()
            start=control.WORKER_BOOTSTRAP.index('        if not (stat.S_ISREG')
            end=control.WORKER_BOOTSTRAP.index('        mark =',start)
            weakened_mode=control.WORKER_BOOTSTRAP[:start]+control.WORKER_BOOTSTRAP[end:]
            try:execute(expected,weakened_mode)
            except SystemExit as failure:assert failure.code==1
            else:raise AssertionError('bad metadata should fail the later content gate')
            assert reads==['payload-read'];errors.clear()
            os.read=actual_read;path.chmod(0o644)
            print('watched bootstrap metadata gate removed: RED reached unsafe-mode payload read sentinel')
            weakened=control.WORKER_BOOTSTRAP.replace("if not valid: raise ValueError('worker-source-refused')",
                                                       "if False: raise ValueError('worker-source-refused')")
            assert weakened!=control.WORKER_BOOTSTRAP
            execute('0'*64,weakened)
            assert sys._repair_bootstrap_marker is True
            del sys._repair_bootstrap_marker
            assert not errors
            print('watched bootstrap valid guard removed: RED executed wrong-hash harmless body')
        finally:sys.argv=original_argv;os.write=actual_write;os.read=actual_read
    original_require=control.require
    control.check_loaded_runtime=lambda *arguments:None
    control.check_directory=lambda *arguments,**keywords:None
    control.observe_capacity=lambda *arguments,**keywords:None
    launches=[]
    class LaunchReached(Exception):pass
    def launch(*arguments,**keywords):launches.append(True);raise LaunchReached()
    control.subprocess.Popen=launch
    pin=dict(source_pin,bytes=65537)
    started=control.time.monotonic()
    helpers={'raw':types.SimpleNamespace(observe_unit=lambda _:{'LoadState':'not-found'},client_limits=lambda:None)}
    invoke=lambda:control.coordinate_controls({'packet':'/synthetic','pins':[pin]},'/request','sha','a'*32,'source',helpers,
                        started,started+12,[started+12])
    refused(invoke,'worker-source-pin')
    assert not launches
    control.require=lambda predicate,category:original_require(predicate,category) if category!='worker-source-pin' else None
    try:invoke()
    except LaunchReached:pass
    else:raise AssertionError('worker source pin fault not observed')
    assert launches==[True]
    print('watched worker-source pin guard removed: RED reached launch sentinel above64KiB source cap')
elif case=='runtime-closure':
    import io
    s,r=control.sys,control.Path.resolve;p='/usr/lib/python3.12/encodings/ascii.py';m={'b':types.SimpleNamespace(__file__=p+'x')}
    control.sys=types.SimpleNamespace(modules=m);control.Path.resolve=lambda p:p
    def maps(*a,**k):
        m.setdefault('a',types.SimpleNamespace(__file__=p));return io.StringIO('')
    control.open=maps
    try:
        assert control.runtime_paths()==control.runtime_paths()=={p,p+'x'}
        m.pop('a');control.open=lambda *a,**k:io.StringIO('')
        assert control.runtime_paths()=={p+'x'}
    finally:control.sys=s;control.Path.resolve=r;del control.open
    declared=[{'path':p} for p in ('/etc/python3.12/sitecustomize.py','/usr/lib/python3/dist-packages/apport_python_hook.py')]
    assert all(control.is_runtime_path(p['path']) for p in declared)
    for p in ('/etc/python3.12/sitecustomize.pyx','/usr/lib/python3/dist-packages/private.py','/root/key'):assert not control.is_runtime_path(p)
    request={'runtimePins':declared}
    actual={declared[0]['path']}
    control.runtime_paths=lambda:set(actual)
    hashed=[]
    verify_file=control.verify_file;control.verify_file=lambda pin,**keywords:hashed.append(pin['path'])
    assert control.verify_runtime_pins(request,control.time.monotonic()+1)==actual
    assert not hashed
    fixture=b'import base64\n'
    exec(compile(fixture,'metadata-runtime-fixture','exec'),{})
    assert 'base64' in sys.modules
    actual.add(declared[1]['path'])
    control.check_loaded_runtime(request,control.time.monotonic()+1)
    assert hashed==[pin['path'] for pin in declared]
    hashed.clear()
    actual.add('/usr/lib/python3.12/unexpected.py')
    refused(lambda:control.check_loaded_runtime(request,control.time.monotonic()+1),'runtime-pin-set')
    assert not hashed
    actual.remove('/usr/lib/python3.12/unexpected.py')
    actual.remove(declared[1]['path'])
    refused(lambda:control.check_loaded_runtime(request,control.time.monotonic()+1),'runtime-pin-set')
    assert not hashed
    original_require=control.require
    control.require=lambda predicate,category:original_require(predicate,category) if category!='runtime-pin-set' else None
    control.check_loaded_runtime(request,control.time.monotonic()+1)
    assert declared[1]['path'] not in hashed
    print('watched runtime closure guard removed: RED accepted unselected hook')
    control.require=original_require;request['runtimePins'].pop();hashed.clear()
    request['runtimePins'].append({'path':'/usr/lib/python3.12/urllib/__init__.py','bytes':0})
    refused(lambda:control.check_loaded_runtime(request,control.time.monotonic()+1),'runtime-pin-set');assert not hashed
    with tempfile.NamedTemporaryFile() as f:
        p=dict(path=f.name,bytes=0,sha256=hashlib.sha256(b'').hexdigest(),uid=os.geteuid(),mode=0o600)
        refused(lambda:control.check_pin(p,f.name),'pin-schema')
        refused(lambda:control.check_pin(dict(p,bytes=-1),f.name,is_runtime=True),'pin-schema')
        control.check_pin(p,f.name,is_runtime=True);verify_file(p)
        control.require=lambda ok,c:original_require(ok,c) if c!='pin-schema' else None;control.check_pin(p,f.name)
        control.require=original_require
    print('watched runtime role on source0: RED accepts zero; default refuses')
elif case=='deadline':
    clock=[0.]
    control.time.monotonic=lambda:clock[0]
    original_require=control.require
    sent=[]
    raw=types.SimpleNamespace(send_frame=lambda *arguments:sent.append('ACK'),digest_json=lambda _: 'digest')
    clock[0]=12.
    refused(lambda:control.send_ack(raw,1,{},'x',12.),'control-deadline')
    assert not sent
    control.require=lambda predicate,category: original_require(predicate,category) if category!='control-deadline' else None
    control.send_ack(raw,1,{},'x',12.)
    control.require=original_require
    assert sent==['ACK']
    print('watched ACK deadline guard removed: RED emitted ACK at cutoff')
    writes=[]
    actual_open,actual_mkdir=control.os.open,control.os.mkdir
    control.os.open=lambda *arguments,**keywords:writes.append('publication')
    control.os.mkdir=lambda *arguments,**keywords:writes.append('fixture')
    try:
        refused(lambda:control.persist_projection('/synthetic','a'*32,{'phase':'durable'},65536,12.),'control-deadline')
        refused(lambda:control.create_fixtures({'packet':'/synthetic','nonce':'a'*32},7.),'control-deadline')
        assert not writes
    finally:control.os.open,control.os.mkdir=actual_open,actual_mkdir
    budgets=[]
    def probe(arguments,seconds,*more):
        budgets.append(seconds)
        clock[0]=12.
        return b''
    probe_raw=types.SimpleNamespace(run_bounded=probe)
    clock[0]=11.75
    with control.bounded_observations(probe_raw,12.) as cutoff:
        refused(lambda:probe_raw.run_bounded(['metadata-probe'],3),'control-deadline')
        assert budgets==[.25]
        cutoff[0]=20.
        probe_raw.run_bounded(['owned-cleanup'],5)
        assert budgets[-1]==5
    original_run=control.subprocess.run
    git_calls=[]
    def git_probe(*arguments,**keywords):
        git_calls.append(keywords['timeout'])
        clock[0]=12.
        return types.SimpleNamespace(returncode=0,stdout=b'',stderr=b'')
    control.subprocess.run=git_probe
    try:
        refused(lambda:control.fixed_git(['metadata-only'],12.),'control-deadline')
        assert not git_calls
        clock[0]=11.75
        refused(lambda:control.fixed_git(['metadata-only'],12.),'control-deadline')
        assert git_calls==[.25]
    finally:control.subprocess.run=original_run
    calls=[]
    clock[0]=6.9
    def native(number):
        calls.append(number)
        clock[0]=7.
        return 1
    writer=types.SimpleNamespace(native_call=native)
    with control.bounded_native_calls(writer,7.):
        refused(lambda:writer.native_call(17),'control-deadline')
    assert calls==[17]
    calls.clear()
    control.require=lambda predicate,category:original_require(predicate,category) if category!='control-deadline' else None
    with control.bounded_native_calls(writer,7.):
        writer.native_call(17);writer.native_call(18)
    control.require=original_require
    assert calls==[17,18]
    print('watched native-step deadline guard removed: RED reached following write sentinel')
    class Pipe:
        closed=False
        def fileno(self):return 1
        def close(self):self.closed=True
        def read(self,*arguments):return b''
    class Process:
        def __init__(self):
            self.stdin,self.stdout,self.stderr=Pipe(),Pipe(),Pipe()
            self.returncode=None
        def poll(self):return self.returncode
        def kill(self):events.append('client-kill');self.returncode=-9
        def wait(self,timeout):events.append('client-reap');self.returncode=0;return 0
    nonce='a'*32
    binding={'pid':123,'start':'1','unit':'puni-repair-primitives-'+nonce+'.service',
             'invocation':'b'*32,'cgroup':'/owned','caps':control.CAPS}
    complete={'phase':'complete','binding':binding,'counter':{},'cases':[],
              'initialCapacity':{},'finalCapacity':{}}
    original_namespace=dict(control.__dict__)
    original_fstat,original_lstat,original_close=os.fstat,os.lstat,os.close
    actual_popen=control.subprocess.Popen
    for stage in ('source','active','durable'):
        clock[0]=0.
        events=[]
        raw=types.SimpleNamespace(
            PreparationRefusal=control.Refusal,run_bounded=lambda *arguments,**keywords:b'',
            observe_unit=lambda unit:{'LoadState':'not-found'},
            receive_frame=lambda *arguments,**keywords:complete,
            send_frame=lambda *arguments:events.append('ACK'),digest_json=lambda _: 'digest',
            check_counter=lambda *arguments:None,client_limits=lambda:None)
        def active(*arguments):
            if stage=='active':clock[0]=12.
            return {key:binding[key] for key in ('pid','start','unit','invocation','cgroup','caps')}
        raw.observe_active=active
        raw.stop_owned=lambda original:events.append('owned-cleanup')
        helpers={'raw':raw,'repair':types.SimpleNamespace(check_lock=lambda *arguments:None)}
        control.check_loaded_runtime=lambda *arguments:None
        control.check_directory=lambda *arguments,**keywords:None
        control.observe_capacity=lambda *arguments,**keywords:{}
        frames=iter([{'observedNs':1},complete])
        control.read_service=lambda *a,**k:None if k else next(frames)
        Process.pid=1
        control.check_ready=lambda *arguments,**keywords:binding
        def verify(*arguments):
            if stage=='source':clock[0]=12.
            return 'source',{}
        control.verify_environment=verify
        control.send_frame=lambda *arguments:events.append('admission-output')
        def persist(*arguments):
            events.append(arguments[2]['phase']+'-publication')
            if stage=='durable' and arguments[2]['phase']!='failure':clock[0]=12.
            return 1
        control.persist_projection=persist
        def launch(command,**keywords):
            assert all('--setenv='+p+'=C' in command for p in ('LANG','LC_ALL'))
            events.append(command);return Process()
        control.subprocess.Popen=launch
        try:
            with control.bounded_observations(raw,12.) as cutoff:
                refused(lambda:control.coordinate_controls({'packet':'/synthetic','state':'/owned','pins':[source_pin]},'/request','sha',nonce,
                         'source',helpers,0.,12.,cutoff),'control-deadline')
            assert events.count('ACK')==(0 if stage=='source' else 1)
            assert ('durable-publication' in events)==(stage=='durable')
            assert 'owned-cleanup' in events and 'client-reap' in events
        finally:
            control.__dict__.update(original_namespace)
            control.subprocess.Popen=actual_popen
            control.time.monotonic=lambda:clock[0]
    for flag in ('--setenv=LANG=C','--setenv=LC_ALL=C'):
        try:launch([v for v in events[0] if v!=flag])
        except AssertionError:pass
        else:raise AssertionError('locale omission accepted')
    clock[0]=0.
    worker_events=[]
    raw=types.SimpleNamespace(acquire_staging=lambda _:61,identity=lambda _:'staging',
        observe_active=lambda *arguments:{'pid':123},check_ack=lambda *arguments:None,
        check_counter=lambda *arguments:None)
    control.verify_environment=lambda *arguments:('source',{})
    control.check_loaded_runtime=lambda *arguments:None
    control.check_process_limits=lambda **keywords:None
    control.observe_process_limits=lambda pid:{}
    capacity_calls=[0]
    def worker_capacity(*arguments,**keywords):
        capacity_calls[0]+=1
        if capacity_calls[0]==2:clock[0]=7.
        return {}
    control.observe_capacity=worker_capacity
    control.receive_frame=lambda *arguments:{}
    control.send_frame=lambda *arguments:None
    control.os.fstat=lambda _:None
    control.os.lstat=lambda _:None
    control.os.close=lambda _:worker_events.append('staging-closed')
    class WriteReached(Exception):pass
    def fixture(*arguments):
        worker_events.append('fixture-write')
        raise WriteReached()
    control.create_fixtures=fixture
    helpers={'raw':raw}
    try:
        refused(lambda:control.worker_control({'state':'/owned','nonce':nonce},'sha',helpers,'source',7.),'control-deadline')
        assert worker_events==['staging-closed']
        clock[0]=0.;capacity_calls[0]=0;worker_events.clear()
        control.require=lambda predicate,category:original_require(predicate,category) if category!='control-deadline' else None
        try:control.worker_control({'state':'/owned','nonce':nonce},'sha',helpers,'source',7.)
        except WriteReached:pass
        else:raise AssertionError('watched fixture fault not observed')
        assert worker_events==['fixture-write','staging-closed']
        print('watched worker deadline guard removed: RED reached first-fixture write sentinel')
    finally:
        control.__dict__.update(original_namespace)
        control.os.fstat=os.fstat=original_fstat
        control.os.lstat=os.lstat=original_lstat
        control.os.close=os.close=original_close
    print('deadline controlled source/probe/fsync/worker crossings: no late ACK/write; owned cleanup entered')
elif case=='failure':
 import json,signal,subprocess,time
 c=control;raw=c.load_helpers()['raw'];P=subprocess.Popen
 c.check_loaded_runtime=lambda *a:None
 c.check_directory=lambda *a,**k:None
 c.observe_capacity=lambda *a,**k:{}
 raw.observe_unit=lambda _: {'LoadState':'not-found'}
 forbidden=[];raw.stop_owned=raw.send_frame=lambda *a:forbidden.append(1)
 req=c.require;sync=os.fsync
 codes={'overflow':'service-output-bound','join':'worker-refusal-provenance','code':'worker-refusal-cat','schema':'worker-refusal-schema','modeled':'raw-staging-occupied','unknown':'helper-refused-unavailable','deadline':'control-deadline','publication':'failure-publication','ready':'ready-schema'}
 for mode in ('eof','private','overflow','ready','modeled','unknown','join','code','schema','deadline','SIGINT','SIGTERM','publication','overflow-fault','join-fault','code-fault','schema-fault','SIGINT-fault','SIGTERM-fault'):
  base=mode.split('-')[0];fault='-' in mode
  want='control-cancelled' if base.startswith('SIG') else codes.get(base,'service-frame-eof')
  c.require=lambda p,k:req(p,k) if not fault or k!=want else None
  os.fsync=sync
  f={'phase':'refused','category':'raw-staging-occupied','request':'q'*64,'nonce':'a'*32,'source':'source'}
  if base=='join':f['request']='z'*64
  if base=='code':f['category']='private-token'
  if base=='schema':f['extra']=True
  body='pass'
  if base=='private':body="os.write(2,b'repair-native-control: private-token\\n')"
  if base=='overflow':body="os.write(2,b'X'*65537)"
  if base=='ready':body="print('{\"phase\":\"ready\",\"binding\":{\"pid\":2226}}',flush=True)"
  if base in ('join','code','schema'):body='print('+repr(json.dumps(f))+',flush=True)'
  if base in ('modeled','unknown'):
   code='raw-staging-occupied' if base=='modeled' else 'private-token'
   body="import contextlib,importlib.util as i;s=i.spec_from_file_location('c',"+repr(sys.argv[1])+");c=i.module_from_spec(s);s.loader.exec_module(c);c.authorize=c.verify_environment=lambda *a:('source',{});c.repository_loader=contextlib.nullcontext;c.worker_control=lambda *a:(_ for _ in ()).throw(a[2]['raw'].PreparationRefusal("+repr(code)+"));c.entry(['worker','unused','q'*64,'a'*32])"
  if base=='deadline':body='time.sleep(2)'
  if base.startswith('SIG'):
   # Actual production main runs with only work entry/alarm made inert.
   number=getattr(signal,base)
   signal.signal(number,lambda *a:(_ for _ in ()).throw(c.Refusal('omitted-handler')))
   text=pathlib.Path(sys.argv[1]).read_text()
   if fault:text=text.replace('signal.signal(signal.'+base+', cancel)','pass')
   alarm=signal.alarm;signal.alarm=lambda *a:0
   try:exec(compile(c.ast.Module(body=[c.ast.parse(text).body[-1]],type_ignores=[]),'production-main','exec'),dict(c.__dict__,__name__='__main__',entry=lambda *a:None))
   finally:signal.alarm=alarm
   body='os.kill(os.getppid(),'+str(number)+');time.sleep(2)'
  if base=='publication':os.fsync=lambda _:(_ for _ in ()).throw(OSError('private-token'))
  with tempfile.TemporaryDirectory() as d:
   ls=[]
   def launch(*a,**k):
    child=P([sys.executable,'-I','-B','-c','import os,signal,time;'+body+';raise SystemExit(23)'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    ls.append(child);return child
   c.subprocess.Popen=launch
   t0=time.monotonic();t1=t0+(.06 if base=='deadline' else 2)
   try:c.coordinate_controls({'packet':d,'state':'/unopened','pins':[source_pin]},'/request','q'*64,'a'*32,'source',{'raw':raw},t0,t1,[t1])
   except c.Refusal as failure:cat=str(failure)
   else:raise AssertionError('accepted')
   if fault and base in ('schema','SIGINT','SIGTERM'):assert cat==('raw-staging-occupied' if base=='schema' else 'omitted-handler')
   assert (cat!=want)==fault and ls[0].stdout.closed and ls[0].stderr.closed and ls[0].poll() is not None and not forbidden
   if base=='publication':continue
   e=pathlib.Path(d)/('observation-'+'a'*32+'-failure.json');r=json.loads(e.read_bytes())
   assert r['category']==cat and r['accepted'] is False and r['workerBinding']=='unavailable' and r['counter']=='unavailable'
   if not fault:assert 'private-token' not in e.read_text()
   if base in ('eof','private','ready'):assert r['client']['exitCode']==23
   if base=='private':assert r['streams']['stderr']==dict(bytes=37,sha256=hashlib.sha256(b'repair-native-control: private-token\n').hexdigest(),complete=True)
   if base=='ready':assert r['stage']=='ready-received'
   if fault:print('watched '+mode+': '+cat)
 print('watched failures')
else:raise AssertionError('unknown metadata case')
print('repair-fix '+case+': GREEN metadata boundary')
`;

for (const name of [
  'source-cache',
  'worker-bootstrap',
  'inventory',
  'initial-memory',
  'deadline',
  'staging',
  'runtime-closure',
  'failure',
]) {
  test(`repair fixes ${name} preserve reviewed metadata boundaries`, () => {
    const child = Bun.spawnSync(['python3', '-I', '-B', '-c', repairFixes, harness, name], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    expect(new TextDecoder().decode(child.stderr)).toBe('');
    expect(child.exitCode).toBe(0);
    const report = new TextDecoder().decode(child.stdout);
    expect(report).toContain('watched ');
    expect(report).toEndWith(`repair-fix ${name}: GREEN metadata boundary\n`);
  });
}
