import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { providerStartup } from './lab-provider-startup.test-fixture';

const helper = join(import.meta.dir, 'lab-raw-preparation.py');
/** Logical provider fixture only: the supported3.12 path names the current process's real inode.
 * This models the fixed provider after native admission; it does not qualify the host interpreter.
 */
const providerStat = String.raw`
_modeled_stat = os.stat
def stat_provider_python(path,*arguments,**keywords):
    return _modeled_stat('/proc/self/exe' if path=='/usr/bin/python3.12' else path,*arguments,**keywords)
os.stat=stat_provider_python
`;

const absentPython312 = String.raw`
import os
_host_stat = os.stat
def stat_without_python312(path,*arguments,**keywords):
    if path=='/usr/bin/python3.12':raise FileNotFoundError('controlled absent provider interpreter')
    return _host_stat(path,*arguments,**keywords)
os.stat=stat_without_python312
`;

/** Remove the provider path from logical fixture observations, including their owned children. */
function hidePython312(source: string): string {
  const children = source.replace(
    /(child_source\s*=\s*r''')/gu,
    (opening) => `${opening}\n${absentPython312}\n`,
  );
  return `${absentPython312}\n${children}`;
}

const boundary = String.raw`
import importlib.util, json, os, stat, sys, tempfile, time
spec = importlib.util.spec_from_file_location('producer', sys.argv[1])
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)
case = sys.argv[2]
def refused(operation, category):
    try: operation()
    except producer.PreparationRefusal as failure:
        assert str(failure) == category, str(failure)
    else: raise AssertionError('unsafe input was accepted: '+case)
if case == 'capacity':
    producer.check_capacity(3623878656, 50*1024**3, 0, True, False)
    producer.check_capacity(2147483648, 40*1024**3, 2*1024**3-160*1024**2, False, False)
    producer.check_capacity(2147483648, 40*1024**3, 10*1024**3-160*1024**2, False, True)
    for memory,free,allocated,initial,after,category in [(3623878655,50*1024**3,0,True,False,'raw-memory-floor'),(2147483647,40*1024**3,0,False,False,'raw-memory-floor'),(3623878656,50*1024**3-1,0,True,False,'raw-disk-floor'),(2147483648,40*1024**3-1,0,False,False,'raw-disk-floor'),(3623878656,50*1024**3,2*1024**3-160*1024**2+1,True,False,'raw-staging-bound'),(None,50*1024**3,0,True,False,'raw-capacity-malformed')]:
        refused(lambda: producer.check_capacity(memory,free,allocated,initial,after),category)
elif case == 'traversal':
    with tempfile.TemporaryDirectory() as directory:
        nested=directory+'/nested';os.mkdir(nested,0o700)
        descriptor=os.open(nested+'/retained',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        os.posix_fallocate(descriptor,0,1048576);os.close(descriptor)
        assert producer.allocated_bytes(directory)>=1048576
        refused(lambda:producer.allocated_bytes(directory+'/absent'),'raw-state-absent')
        os.chmod(nested,0)
        refused(lambda:producer.allocated_bytes(directory),'raw-state-unreadable')
        os.chmod(nested,0o700)
        os.chmod(directory,0)
        refused(lambda:producer.allocated_bytes(directory),'raw-state-unreadable')
        os.chmod(directory,0o700)
        assert producer.allocated_bytes(directory)>=1048576
        raced=directory+'/raced';os.mkdir(raced,0o700)
        original_walk=os.walk
        def replaced_walk(*args,**kwargs):
            yield from original_walk(*args,**kwargs)
            os.rename(raced,raced+'-retained');os.mkdir(raced,0o700)
        os.walk=replaced_walk
        refused(lambda:producer.allocated_bytes(raced),'raw-staging-changed')
        os.walk=original_walk
elif case == 'caps':
    caps = {'memory.max':'1073741824','memory.swap.max':'0','pids.max':'128','cpu.max':'100000 100000'}
    producer.check_caps(caps)
    for key in caps:
        changed = dict(caps); changed[key] = 'max'
        refused(lambda: producer.check_caps(changed), 'raw-native-caps')
    refused(lambda: producer.check_caps({}), 'raw-native-caps')
elif case == 'service':
    limits={'RuntimeMaxUSec':'15min','TimeoutStopUSec':'5s','LimitAS':'8589934592','LimitFSIZE':'8589934592','KillMode':'control-group','NoNewPrivileges':'yes','UMask':'0077','SendSIGKILL':'yes'}
    producer.check_service_limits(limits)
    for name in limits:
        changed=dict(limits);changed[name]='unknown'
        refused(lambda:producer.check_service_limits(changed),'raw-service-limits')
elif case == 'counter':
    now = time.time_ns()
    binding = {'nonce':'a'*32,'pid':123,'start':'456','unit':'puni-raw-'+('a'*32)+'.service','invocation':'b'*32,'cgroup':'/owned','creator':[1,2,1000,448], 'raw':[1,3,1000,384], 'source':'c'*64,'request':'d'*64}
    caps = {'memory.max':'1073741824','memory.swap.max':'0','pids.max':'128','cpu.max':'100000 100000'}
    counters = {'memory.current':'1','memory.peak':'2','memory.events':'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1\nnr_periods 1\nnr_throttled 0\nthrottled_usec 0','pids.current':'1','pids.events':'max 0'}
    record = {'binding':binding,'startedNs':now-12000000000,'finishedNs':now,'caps':caps,'counters':counters,'converted':True,'compared':True}
    producer.check_counter(record, binding, now-20000000000, now)
    for fault in ['stale','future','binding','partial','oom','pids','caps','compare']:
        changed = json.loads(json.dumps(record))
        if fault == 'stale': changed['finishedNs'] = now-10000000001
        if fault == 'future': changed['finishedNs'] = now+1
        if fault == 'binding': changed['binding']['start'] = 'wrong'
        if fault == 'partial': del changed['counters']['memory.peak']
        if fault == 'oom': changed['counters']['memory.events'] = 'oom 1\noom_kill 0'
        if fault == 'pids': changed['counters']['pids.events'] = 'max 1'
        if fault == 'caps': changed['caps']['memory.max'] = 'max'
        if fault == 'compare': changed['compared'] = False
        refused(lambda: producer.check_counter(changed, binding, now-20000000000, now), 'raw-counter-invalid')
elif case == 'request':
    request = {'schemaVersion':1,'root':'/reviewed/repo','state':'/reviewed/repo/.puni/fleet-labs/observability-baseline','nonce':'a'*32,'pins':[{'path':'/reviewed/pinned','sha256':'b'*64,'bytes':1,'uid':0,'mode':420}], 'image':'/reviewed/repo/.puni/fleet-labs/observability-baseline/inputs/selected.img','imageBytes':621284352,'imageVirtualBytes':3758096384}
    producer.check_request(request)
    for fault in ['unknown','nonce','state','pin','override','image']:
        changed = json.loads(json.dumps(request))
        if fault == 'unknown': changed['foreign'] = True
        if fault == 'nonce': changed['nonce'] = '../foreign'
        if fault == 'state': changed['state'] = '/foreign'
        if fault == 'pin': changed['pins'][0]['sha256'] = 'unknown'
        if fault == 'override': changed['rawBytes'] = 1
        if fault == 'image': changed['image'] = '/foreign.img'
        refused(lambda: producer.check_request(changed), 'raw-request-invalid')
elif case == 'files':
    with tempfile.TemporaryDirectory() as directory:
        path = directory+'/private'; open(path,'w').write('selected'); os.chmod(path,0o600)
        descriptor = producer.open_private(path); os.close(descriptor)
        refused(lambda: producer.open_private(directory+'/absent'), 'raw-state-absent')
        os.chmod(path,0); refused(lambda: producer.open_private(path), 'raw-state-unreadable')
        os.chmod(path,0o640); refused(lambda: producer.open_private(path), 'raw-state-unsafe')
        os.chmod(path,0o600); os.symlink(path,directory+'/alias')
        refused(lambda: producer.open_private(directory+'/alias'), 'raw-state-unsafe')
        owned=directory+'/owned';os.mkdir(owned,0o700)
        original_fd=producer.open_private(owned,directory=True)
        os.rename(owned,owned+'-retained');os.mkdir(owned,0o700)
        refused(lambda:producer.persist(owned,'foreign',{},directory_fd=original_fd),'raw-state-changed')
        assert not os.path.exists(owned+'/foreign') and not os.path.exists(owned+'-retained/foreign')
        os.close(original_fd)
        producer.persist(directory,'receipt',{'accepted':True})
        refused(lambda: producer.persist(directory,'receipt',{}), 'raw-state-occupied')
        refused(lambda: producer.persist(directory,'oversize',{'padding':'x'*65536}), 'raw-record-bound')
elif case == 'pins':
    import hashlib
    with tempfile.TemporaryDirectory() as directory:
        path = directory+'/input'; open(path,'w').write('selected'); os.chmod(path,0o400)
        pin = {'path':path,'sha256':hashlib.sha256(b'selected').hexdigest(),'bytes':8,'uid':os.getuid(),'mode':256}
        producer.verify_pin(pin)
        os.chmod(path,0o600); open(path,'w').write('replaced'); os.chmod(path,0o400)
        refused(lambda: producer.verify_pin(pin), 'raw-pin-changed')
elif case == 'ack':
    binding = {'nonce':'a'*32,'pid':123,'raw':[1,2,1000,384]}
    ack = {'bindingDigest':producer.digest_json(binding),'request':'b'*64}
    producer.check_ack(ack,binding,'b'*64)
    refused(lambda: producer.check_ack({},binding,'b'*64), 'raw-ack-invalid')
    refused(lambda: producer.check_ack(ack,binding,'c'*64), 'raw-ack-invalid')
elif case == 'terminal':
    native = {'LoadState':'not-found','ActiveState':'inactive','SubState':'dead','MainPID':'0','InvocationID':'','ControlGroup':'','Result':'','ExecMainStatus':''}
    producer.check_terminal(native, None, 0)
    refused(lambda: producer.check_terminal(native,None,1), 'raw-terminal-invalid')
    changed = dict(native); changed['MainPID']='123'
    refused(lambda: producer.check_terminal(changed,None,0), 'raw-terminal-invalid')
    refused(lambda: producer.check_terminal(native,'populated 1\nfrozen 0',0), 'raw-terminal-invalid')
elif case == 'bounded':
    assert producer.run_bounded(['/usr/bin/python3','-I','-B','-c','print("owned")'],2).strip() == b'owned'
    refused(lambda: producer.run_bounded(['/usr/bin/python3','-I','-B','-c','print("x"*70000)'],2),'raw-child-output-bound')
    refused(lambda: producer.run_bounded(['/usr/bin/python3','-I','-B','-c','import time; time.sleep(2)'],.05),'raw-child-timeout')
    refused(lambda: producer.run_bounded(['/usr/bin/python3','-I','-B','-c','raise SystemExit(1)'],2),'raw-child-failed')
elif case == 'creator':
    with tempfile.TemporaryDirectory() as directory:
        os.chmod(directory,0o700)
        directory_fd = producer.open_private(directory,directory=True)
        raw_fd = os.open(directory+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        binding = {'pid':os.getpid(),'start':producer.process_start(os.getpid()),'creator':producer.identity(os.fstat(directory_fd)),'raw':producer.identity(os.fstat(raw_fd)),'rawFd':raw_fd}
        producer.check_creator(binding,directory,directory_fd)
        changed = dict(binding); changed['rawFd']=directory_fd
        refused(lambda: producer.check_creator(changed,directory,directory_fd),'raw-creator-invalid')
        changed = dict(binding); changed['start']='0'
        refused(lambda: producer.check_creator(changed,directory,directory_fd),'raw-creator-invalid')
        os.rename(directory+'/disk.raw',directory+'/retained.raw')
        replacement = os.open(directory+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        refused(lambda: producer.check_creator(binding,directory,directory_fd),'raw-creator-invalid')
        os.close(replacement); os.close(raw_fd); os.close(directory_fd)
elif case in ('sandbox','converter'):
    with tempfile.TemporaryDirectory() as directory:
        raw_fd = os.open(directory+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        foreign = directory+'/foreign'; open(foreign,'w').write('preserve')
        executable_path = '/usr/bin/true' if case == 'sandbox' else str(producer.HELPER.parents[3])+ '/.puni/fleet-labs/observability-baseline/tools-root/usr/bin/qemu-img'
        executable = os.open(executable_path,os.O_RDONLY)
        image_fd = None
        environment = producer.clean_environment(str(producer.HELPER.parents[3])+'/.puni/fleet-labs/observability-baseline')
        if case == 'converter':
            producer.worker_limits()
            producer.run_bounded([executable_path,'create','-q','-f','qcow2',directory+'/source.qcow2','1048576'],3,environment,converter=True)
            image_fd = os.open(directory+'/source.qcow2',os.O_RDONLY)
            os.posix_fallocate(raw_fd,0,2097152)
        child_pid = os.fork()
        if child_pid == 0:
            try:
                producer.confine_writer(raw_fd,executable)
                if case == 'sandbox':
                    os.write(raw_fd,b'owned')
                    for path in (foreign,directory+'/new'):
                        try: os.open(path,os.O_WRONLY|os.O_CREAT,0o600)
                        except PermissionError: pass
                        else: raise AssertionError('sandbox allowed foreign write')
                else:
                    producer.convert_image(executable,image_fd,raw_fd,environment,lambda:None)
                    assert os.fstat(raw_fd).st_size == 2097152
                    original_run = producer.run_bounded
                    def substitute(arguments,*args,**kwargs):
                        if arguments[1] == 'compare': os.pwrite(raw_fd,b'x',65536)
                        return original_run(arguments,*args,**kwargs)
                    producer.run_bounded = substitute
                    refused(lambda: producer.convert_image(executable,image_fd,raw_fd,environment,lambda:None),'raw-child-failed')
                os._exit(0)
            except BaseException:
                import traceback; traceback.print_exc(); os._exit(1)
        _,status = os.waitpid(child_pid,0)
        assert status == 0,status
        assert open(foreign).read() == 'preserve'
        os.close(executable); os.close(raw_fd)
        if image_fd is not None: os.close(image_fd)
elif case == 'native':
    unit='puni-raw-'+('a'*32)+'.service'
    native={'LoadState':'loaded','ActiveState':'active','SubState':'running','MainPID':'123','InvocationID':'b'*32,'ControlGroup':'/owned/'+unit,'Result':'success','ExecMainStatus':'0'}
    producer.observe_unit=lambda unit:dict(native)
    producer.process_cgroup=lambda pid:'/owned/'+unit
    producer.process_start=lambda pid:'456'
    producer.read_caps=lambda group:dict(producer.CAPS)
    producer.observe_service_limits=lambda unit:None
    binding=producer.observe_active(unit,123)
    for field in ['LoadState','ActiveState','SubState','MainPID','InvocationID','ControlGroup']:
        original=native[field];native[field]='foreign'
        refused(lambda:producer.observe_active(unit,123),'raw-unit-binding')
        native[field]=original
    signals=[]
    producer.run_bounded=lambda arguments,*args,**kwargs:signals.append(arguments)
    producer.group_events=lambda group:None
    producer.stop_owned(binding);assert len(signals)==1;signals.clear()
    native['InvocationID']='c'*32
    refused(lambda:producer.stop_owned(binding),'raw-cleanup-uncertain');assert not signals
    native['InvocationID']='b'*32;producer.process_start=lambda pid:'foreign'
    refused(lambda:producer.stop_owned(binding),'raw-cleanup-uncertain');assert not signals
    native['LoadState']='not-found';producer.group_events=lambda group:'populated 1\nfrozen 0'
    refused(lambda:producer.stop_owned(binding),'raw-cleanup-uncertain');assert not signals
elif case == 'frames':
    read_fd,write_fd = os.pipe()
    os.write(write_fd,b'{"bindingDigest":"foreign"}\n'); os.close(write_fd)
    refused(lambda: producer.receive_ack(read_fd,{'nonce':'owned'},'b'*64), 'raw-ack-invalid')
    os.close(read_fd)
    read_fd,write_fd = os.pipe(); os.close(write_fd)
    refused(lambda: producer.receive_ack(read_fd,{'nonce':'owned'},'b'*64),'raw-ack-missing')
    os.close(read_fd)
elif case == 'persistence':
    with tempfile.TemporaryDirectory() as directory:
        original_sync = os.fsync
        def broken_sync(descriptor):
            if stat.S_ISREG(os.fstat(descriptor).st_mode): raise OSError('PRIVATE fsync fault')
            return original_sync(descriptor)
        os.fsync = broken_sync
        try: producer.persist(directory,'counter',{'accepted':True})
        except OSError: pass
        else: raise AssertionError('failed sync accepted')
        os.fsync = original_sync
        assert os.path.isfile(directory+'/counter')
else: raise AssertionError(case)
print('verified '+case)
`;
for (const case_ of [
  'capacity',
  'traversal',
  'caps',
  'service',
  'counter',
  'request',
  'files',
  'pins',
  'ack',
  'terminal',
  'bounded',
  'creator',
  'sandbox',
  'native',
  'frames',
  'persistence',
]) {
  test(`raw producer ${case_} boundary`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', boundary, helper, case_],
      { timeout: 5000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified ${case_}\n`);
  });
}
const lifecycle = String.raw`
import importlib.util, json, os, subprocess, sys, tempfile, time, types
spec = importlib.util.spec_from_file_location('producer',sys.argv[1]); producer = importlib.util.module_from_spec(spec); spec.loader.exec_module(producer)
${providerStat}
fault = sys.argv[2]
child_source = r'''
import importlib.util,json,os,sys,time
${providerStartup}
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]); p=importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
state,nonce,digest,source,fault=sys.argv[2:]
directory=state+'/raw-'+nonce
creator=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
raw=os.open(directory+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
image=os.open(state+'/inputs/source.img',os.O_RDONLY)
tool=os.open(state+'/tools-root/usr/bin/qemu-img',os.O_RDONLY)
binding={'pid':os.getpid(),'start':p.process_start(os.getpid()),'unit':'puni-raw-'+nonce+'.service','invocation':'e'*32,'cgroup':'/fixture','nonce':nonce,'python':p.stable_identity(os.stat('/proc/self/exe')),'creator':p.identity(os.fstat(creator)),'raw':p.identity(os.fstat(raw)),'rawFd':raw,'imageFd':image,'toolFd':tool,'image':p.stable_identity(os.fstat(image)),'tool':p.stable_identity(os.fstat(tool)),'source':source,'request':digest}
if fault=='foreign': binding['creator'][1]+=1
ready=time.time_ns();p.send_frame(1,{'phase':'ready','binding':binding,'observedNs':ready});p.receive_ack(0,binding,digest)
open(directory+'/allocation-occurred','w').write('tiny fixture only')
counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
if fault=='oom': counters['memory.events']='oom 1\noom_kill 0'
if fault=='partial':del counters['memory.peak']
record={'binding':binding,'startedNs':ready,'finishedNs':time.time_ns(),'caps':p.CAPS,'counters':counters,'converted':True,'compared':True}
if fault=='stale':record['finishedNs']-=11000000000
if fault in ('compare','cleanup'):record['compared']=False
p.send_frame(1,{'phase':'complete','record':record,'allocationBefore':{},'allocationAfter':{}})
ack=p.receive_frame(0)
assert ack=={'durableDigest':p.digest_json(record)}
retained=json.load(open(directory+'/worker-counter.json'));assert retained==record
assert os.path.getsize(directory+'/worker-counter.json')<65536
sys.exit(1 if fault=='client' else 0)
'''
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state+'/inputs',mode=0o700);os.chmod(state,0o700);os.makedirs(state+'/tools-root/usr/bin')
    open(state+'/inputs/source.img','w').write('source');open(state+'/tools-root/usr/bin/qemu-img','w').write('tool')
    nonce='a'*32;digest='b'*64;source='c'*64
    request={'root':root,'state':state,'nonce':nonce,'image':state+'/inputs/source.img'}
    producer.verify_inputs=lambda request:source
    native={'LoadState':'not-found','ActiveState':'inactive','SubState':'dead','MainPID':'0','InvocationID':'','ControlGroup':'','Result':'','ExecMainStatus':''}
    producer.observe_unit=lambda unit:dict(native)
    producer.read_caps=lambda group:dict(producer.CAPS)
    producer.group_events=lambda group:None
    observations=0
    def capacity(*args,**kwargs):
        global observations
        observations+=1
        if fault=='cancel' and observations>=4:raise producer.PreparationRefusal('raw-cancelled')
        return {'observedNs':time.time_ns()}
    producer.observe_capacity=capacity
    def active(unit,pid):
        caps=dict(producer.CAPS)
        if fault=='caps' and os.path.isfile(state+'/raw-'+nonce+'/allocation-occurred'):caps['memory.max']='max'
        producer.check_caps(caps)
        return {'pid':pid,'start':producer.process_start(pid),'unit':unit,'invocation':'e'*32,'cgroup':'/fixture','caps':caps}
    producer.observe_active=active
    child=None;stopped=False
    def launch(*args):
        global child
        child=subprocess.Popen(['/usr/bin/python3','-I','-B','-c',child_source,sys.argv[1],state,nonce,digest,source,fault],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        return child
    producer.launch_service=launch
    def stop(binding):
        global stopped
        assert binding['pid']==child.pid
        stopped=True
        if fault=='cleanup':raise producer.PreparationRefusal('raw-cleanup-uncertain')
        if child.poll() is None:child.terminate()
    producer.stop_owned=stop
    if fault=='sync':
        original_persist=producer.persist
        def persist(directory,name,record,**keywords):
            if name=='worker-counter.json':raise OSError('PRIVATE fsync failure')
            return original_persist(directory,name,record,**keywords)
        producer.persist=persist
    directory=state+'/raw-'+nonce
    try:
        receipt=producer.coordinator(request,'/private/request.json',digest)
        assert fault=='success',fault
        assert receipt['accepted'] is True
        assert json.load(open(directory+'/receipt.json'))['fullRehearsalAuthority'] is False
    except (producer.PreparationRefusal,OSError):
        assert fault!='success'
        assert not os.path.exists(directory+'/receipt.json')
        assert os.path.exists(directory+'/request-binding.json')
        if fault=='foreign':assert not os.path.exists(directory+'/allocation-occurred')
        else:assert stopped
print('verified lifecycle '+fault)
`;
for (const fault of [
  'success',
  'foreign',
  'oom',
  'partial',
  'stale',
  'compare',
  'client',
  'caps',
  'cancel',
  'sync',
  'cleanup',
]) {
  test(`raw producer lifecycle ${fault}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', lifecycle, helper, fault],
      { timeout: 5000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified lifecycle ${fault}\n`);
  });
}

const mutation = String.raw`
import importlib.util,json,os,subprocess,sys,tempfile
child_source=r'''
import importlib.util,json,os,sys
${providerStartup}
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
state,nonce,fault=sys.argv[2:];source='c'*64;digest='b'*64;calls=0
request={'state':state,'nonce':nonce,'image':state+'/inputs/source.img'}
def verified(request):
    global calls
    calls+=1
    return 'changed' if fault=='source' and calls==2 else source
p.verify_inputs=verified;p.observe_capacity=lambda *args,**kwargs:None
native={'pid':os.getpid(),'start':p.process_start(os.getpid()),'unit':'puni-raw-'+nonce+'.service','invocation':'e'*32,'cgroup':'/fixture','caps':p.CAPS}
observations=0
def active(*args):
    global observations
    observations+=1
    return dict(native,invocation='foreign') if fault=='native' and observations==2 else native
p.observe_active=active;os.environ['INVOCATION_ID']='e'*32
p.load_inspector=lambda:None
if fault=='python':
    import types
    original_stat=os.stat
    def changed_stat(path,*args,**kwargs):
        observed=original_stat(path,*args,**kwargs)
        if path!='/usr/bin/python3.12':return observed
        fields={name:getattr(observed,name) for name in ('st_dev','st_ino','st_uid','st_mode','st_size','st_nlink','st_mtime_ns','st_ctime_ns')};fields['st_ino']+=1
        return types.SimpleNamespace(**fields)
    os.stat=changed_stat
if fault=='descriptor':foreign_fd=os.open(state+'/inputs/source.img',os.O_RDONLY)
def allocation(*args):raise p.PreparationRefusal('allocation-intercepted')
os.posix_fallocate=allocation
try:p.worker(request,digest)
except p.PreparationRefusal as failure:
    print(str(failure),file=sys.stderr)
    sys.exit(1)
'''
with tempfile.TemporaryDirectory() as directory:
    state=directory+'/state';os.makedirs(state+'/inputs');os.chmod(state,0o700);os.makedirs(state+'/tools-root/usr/bin');nonce='a'*32
    attempt=state+'/raw-'+nonce;os.mkdir(attempt,0o700)
    open(state+'/inputs/source.img','w').write('source');open(state+'/tools-root/usr/bin/qemu-img','w').write('tool')
    child=subprocess.Popen(['/usr/bin/python3','-I','-B','-c',child_source,sys.argv[1],state,nonce,sys.argv[2]],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    ready=json.loads(child.stdout.readline(65536))
    binding=ready['binding'];fault=sys.argv[2]
    if fault=='input':open(state+'/inputs/source.img','w').write('changed')
    if fault=='staging':
        os.rename(state,state+'-retained');os.mkdir(state,0o700)
        for name in os.listdir(state+'-retained'):os.rename(state+'-retained/'+name,state+'/'+name)
    if fault=='creator':os.rename(attempt,attempt+'-retained');os.mkdir(attempt,0o700)
    if fault!='missing':
        spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
        ack={'bindingDigest':p.digest_json(binding),'request':'x'*64 if fault=='foreign' else 'b'*64}
        child.stdin.write(json.dumps(ack).encode()+b'\n');child.stdin.flush()
    child.stdin.close();child.wait(timeout=3)
    diagnostics=child.stderr.read(65536).decode().strip()
    expected={'staging':'raw-staging-changed','python':'raw-python-binding','missing':'raw-ack-missing','foreign':'raw-ack-invalid','source':'raw-mutation-binding','native':'raw-mutation-binding','input':'raw-input-fd-changed','creator':'raw-creator-invalid','descriptor':'raw-unexpected-fd','valid':'allocation-intercepted'}
    assert diagnostics==expected[fault],diagnostics
    assert os.path.getsize((attempt+'-retained' if fault=='creator' else attempt)+'/disk.raw')==0
print('verified mutation '+fault)
`;
for (const fault of [
  'valid',
  'missing',
  'foreign',
  'source',
  'native',
  'input',
  'creator',
  'descriptor',
  'python',
  'staging',
]) {
  test(`raw producer mutation ${fault}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', mutation, helper, fault],
      {
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified mutation ${fault}\n`);
  });
}

test('raw preparation source CLI refuses malformed arguments and keeps trusted-state paths private', async () => {
  const { prepareRaw, RawPreparationRefusal } = await import('./lab-raw-preparation');
  expect(() => prepareRaw('', 'a'.repeat(64))).toThrow(RawPreparationRefusal);
  expect(() => prepareRaw('/private/PRIVATE_REQUEST', 'foreign')).toThrow('invalid-arguments');
  try {
    prepareRaw('/private/PRIVATE_REQUEST', 'a'.repeat(64));
    throw new Error('absent trusted request accepted');
  } catch (failure) {
    expect(failure).toBeInstanceOf(RawPreparationRefusal);
    expect(failure instanceof Error && failure.cause).toBeUndefined();
    expect(String(failure)).not.toContain('PRIVATE_REQUEST');
  }
  const cli = join(import.meta.dir, 'lab-raw-preparation-cli.ts');
  const environment: typeof process.env = { ...process.env, FORCE_COLOR: '1', CI: 'true' };
  delete environment['NO_COLOR'];
  for (const arguments_ of [
    [],
    ['/private/PRIVATE_REQUEST', 'foreign'],
    ['/private/PRIVATE_REQUEST', 'a'.repeat(64), 'extra'],
  ]) {
    const invocation = Bun.spawnSync([process.execPath, cli, ...arguments_], {
      env: environment,
      timeout: 3000,
      maxBuffer: 65536,
    });
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toBe('raw preparation: invalid-arguments\n');
  }
});

const stagingLock = String.raw`
import fcntl,importlib.util,os,sys,tempfile
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
def refused(operation,category):
    try:operation()
    except p.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('staging lock accepted unsafe state')
with tempfile.TemporaryDirectory() as directory:
    state=directory+'/state';os.mkdir(state,0o700)
    descriptor=p.acquire_staging(state)
    assert fcntl.fcntl(descriptor,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDONLY
    refused(lambda:p.acquire_staging(state),'raw-staging-occupied')
    os.close(descriptor)
    descriptor=p.acquire_staging(state);os.close(descriptor)
    refused(lambda:p.acquire_staging(state+'/absent'),'raw-state-absent')
    os.chmod(state,0)
    refused(lambda:p.acquire_staging(state),'raw-state-unreadable')
    os.chmod(state,0o700)
    original_flock=fcntl.flock
    def replaced_flock(descriptor,operation):
        original_flock(descriptor,operation)
        os.rename(state,state+'-retained');os.mkdir(state,0o700)
    fcntl.flock=replaced_flock
    refused(lambda:p.acquire_staging(state),'raw-staging-changed')
    fcntl.flock=original_flock
    released=p.acquire_staging(state+'-retained');os.close(released)
print('verified original staging lock')
`;

test('raw producer original staging lock refuses occupation and releases read-only ownership', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', stagingLock, helper], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified original staging lock\n');
});

const competition = String.raw`
import importlib.util,json,os,subprocess,sys,tempfile,types
${providerStartup}
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
child_source=r'''
import importlib.util,os,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
state,nonce,mode=sys.argv[2:]
request={'state':state,'nonce':nonce,'image':state+'/inputs/source.img'}
p.verify_inputs=lambda request:'c'*64
p.observe_capacity=lambda state,*args,**kwargs:p.check_capacity(3623878656,50*1024**3,p.allocated_bytes(state),False,False)
native={'pid':os.getpid(),'start':p.process_start(os.getpid()),'unit':'puni-raw-'+nonce+'.service','invocation':'e'*32,'cgroup':'/fixture','caps':p.CAPS}
p.observe_active=lambda *args:native;os.environ['INVOCATION_ID']='e'*32
p.load_inspector=lambda:types.SimpleNamespace(inspect_file=lambda *args:{})
p.convert_image=lambda *args:None;p.read_caps=lambda *args:dict(p.CAPS)
counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
original_text=p.read_text
p.read_text=lambda path,*args:counters[path.rsplit('/',1)[1]] if path.startswith('/sys/fs/cgroup/fixture/') else original_text(path,*args)
def intercept(descriptor,offset,length):
    assert length==p.RAW_BYTES and os.fstat(descriptor).st_size==0
    p.send_frame(1,{'phase':'allocation-intercepted','allocatedBytes':p.allocated_bytes(state)})
    if mode=='refuse':raise p.PreparationRefusal('fixture-refusal')
os.posix_fallocate=intercept
try:p.worker(request,'b'*64)
except p.PreparationRefusal as failure:
    if str(failure)=='fixture-refusal':
        released=p.acquire_staging(state);os.close(released);sys.exit(0)
    print(str(failure),file=sys.stderr);sys.exit(1)
released=p.acquire_staging(state);os.close(released)
'''
with tempfile.TemporaryDirectory() as state:
    os.makedirs(state+'/inputs');os.makedirs(state+'/tools-root/usr/bin')
    open(state+'/inputs/source.img','w').write('source');open(state+'/tools-root/usr/bin/qemu-img','w').write('tool')
    children=[]
    def start(nonce,mode):
        attempt=state+'/raw-'+nonce
        if not os.path.exists(attempt):os.mkdir(attempt,0o700)
        child=subprocess.Popen(['/usr/bin/python3','-I','-B','-c',child_source,sys.argv[1],state,nonce,mode],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        children.append(child);return child
    def blocked(nonce):
        child=start(nonce,'refuse')
        try:child.wait(timeout=.5)
        except subprocess.TimeoutExpired:raise AssertionError('competing worker was not refused before readiness')
        assert child.returncode==1
        assert child.stdout.read()==b''
        assert child.stderr.read().decode().strip()=='raw-staging-occupied'
        assert not os.path.exists(state+'/raw-'+nonce+'/disk.raw')
    def acknowledge(child,ready):
        p.send_frame(child.stdin.fileno(),{'bindingDigest':p.digest_json(ready['binding']),'request':'b'*64})
    try:
        first=start('a'*32,'success');ready=p.receive_frame(first.stdout.fileno(),3)
        blocked('f'*32)
        acknowledge(first,ready)
        assert p.receive_frame(first.stdout.fileno(),3)['phase']=='allocation-intercepted'
        complete=p.receive_frame(first.stdout.fileno(),3);assert complete['phase']=='complete'
        blocked('f'*32)
        p.persist(state+'/raw-'+('a'*32),'worker-counter.json',complete['record'])
        p.send_frame(first.stdin.fileno(),{'durableDigest':p.digest_json(complete['record'])})
        first.wait(timeout=3);assert first.returncode==0,first.stderr.read().decode()
        successor=start('f'*32,'refuse');ready=p.receive_frame(successor.stdout.fileno(),3);acknowledge(successor,ready)
        assert p.receive_frame(successor.stdout.fileno(),3)['phase']=='allocation-intercepted'
        successor.wait(timeout=3);assert successor.returncode==0,successor.stderr.read().decode()
        crashed=start('c'*32,'success');p.receive_frame(crashed.stdout.fileno(),3);crashed.kill();crashed.wait(timeout=3)
        final=start('d'*32,'refuse');ready=p.receive_frame(final.stdout.fileno(),3);acknowledge(final,ready)
        assert p.receive_frame(final.stdout.fileno(),3)['phase']=='allocation-intercepted'
        final.wait(timeout=3);assert final.returncode==0,final.stderr.read().decode()
        assert all(os.stat(state+'/raw-'+nonce+'/disk.raw').st_size==0 for nonce in ('a'*32,'f'*32,'c'*32,'d'*32))
    finally:
        for child in children:
            if child.poll() is None:child.kill()
            child.wait(timeout=3)
print('verified competing workers and success/refusal/crash release; all raw files zero bytes')
`;

test('raw producer shared staging excludes competing nonces through durability ACK and releases ownership', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', competition, helper], {
    timeout: 8000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified competing workers and success/refusal/crash release; all raw files zero bytes\n',
  );
});

test('raw producer capacity parser accepts native horizontal whitespace and refuses malformed fields', () => {
  const capacityRead = String.raw`
import importlib.util,os,sys,tempfile,types
spec=importlib.util.spec_from_file_location('producer',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
original_text=p.read_text
p.os.statvfs=lambda path:types.SimpleNamespace(f_bavail=50*1024**3//4096,f_frsize=4096)
with tempfile.TemporaryDirectory() as state:
    for line,expected in [('MemAvailable:   17850452 kB\n',17850452*1024),('MemAvailable:\t3538944\tkB\n',3623878656),('MemAvailable: \t 3538944 \t kB\n',3623878656),('MemAvailable: 3538944 kB\n',3623878656)]:
        p.read_text=lambda path,limit=65536:line if path=='/proc/meminfo' else original_text(path,limit)
        assert p.observe_capacity(state,initial=True)['availableMemoryBytes']==expected,line
    for line in ['MemTotal: 3538944 kB\n','MemAvailable: 3538944 kB\nMemAvailable: 3538944 kB\n','MemAvailable: 3538944.0 kB\n','MemAvailable: -3538944 kB\n','MemAvailable: unknown kB\n','MemAvailable: 3538944 MB\n','MemAvailable: 3538944 KB\n','MemAvailable:\n3538944 kB\n','MemAvailable: 3538944\nkB\n','MemAvailable: 3538944 kB extra\n','MemAvailable:3538944 kB\n']:
        p.read_text=lambda path,limit=65536:line if path=='/proc/meminfo' else original_text(path,limit)
        try:p.observe_capacity(state,initial=True)
        except p.PreparationRefusal as failure:assert str(failure)=='raw-capacity-malformed',(line,str(failure))
        else:raise AssertionError('malformed native capacity accepted: '+repr(line))
print('verified native capacity whitespace and strict fields')
`;
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', capacityRead, helper], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified native capacity whitespace and strict fields\n',
  );
});

for (const [label, script, fault] of [
  ['lifecycle', lifecycle, 'success'],
  ['mutation', mutation, 'valid'],
  ['mismatch', mutation, 'python'],
  ['competition', competition, ''],
] as const) {
  test(`logical raw ${label} works without host Python3.12`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', hidePython312(script), helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
  });
}

for (const scope of ['raw', 'seed']) {
  test(`production ${scope} provider still refuses unsupported and absent Python3.12`, () => {
    const provider = join(import.meta.dir, `lab-${scope}-preparation.py`);
    const script = String.raw`
import importlib.util,os,sys
spec=importlib.util.spec_from_file_location('provider',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
native=p.raw if hasattr(p,'raw') else p
root=str(p.HELPER.parents[3]);state=root+'/.puni/fleet-labs/observability-baseline';image=state+'/inputs/source.img'
required=[str(p.HELPER),str(p.HELPER.with_suffix('.ts')),str(p.HELPER.with_name('lab-'+sys.argv[2]+'-preparation-cli.ts')),str(p.HELPER.with_name('lab-raw-preparation.py')),str(p.HELPER.with_name('lab-raw-allocation.py')),root+'/infra/local/qemu-lab.lock.json',image,state+'/tools-root/usr/bin/qemu-img',state+'/tools-root/usr/bin/genisoimage',state+'/tools-root/usr/bin/isoinfo','/usr/bin/python3.12','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']
request={'root':root,'state':state,'image':image,'pins':[{'path':path} for path in required]}
original_realpath=os.path.realpath
os.path.realpath=lambda path:'/usr/bin/python3.14' if path=='/usr/bin/python3' else original_realpath(path)
try:p.verify_inputs(request)
except native.PreparationRefusal as failure:assert str(failure)==sys.argv[2]+'-python-binding'
else:raise AssertionError('unsupported interpreter qualified by production provider')
os.path.realpath=original_realpath
binding={'pid':os.getpid(),'python':native.stable_identity(os.stat('/proc/self/exe'))}
original_stat=os.stat
def missing_provider(path,*arguments,**keywords):
    if path=='/usr/bin/python3.12':raise FileNotFoundError('controlled absent supported interpreter')
    return original_stat(path,*arguments,**keywords)
os.stat=missing_provider
try:p.check_input_descriptors(binding,{})
except FileNotFoundError:pass
else:raise AssertionError('absent supported interpreter qualified by production provider')
print('verified production provider refuses unsupported and absent3.12')
`;
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, provider, scope],
      { timeout: 5000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.stdout.toString()).toBe(
      'verified production provider refuses unsupported and absent3.12\n',
    );
  });
}

const startupDescriptors = String.raw`
${providerStartup}
import tempfile
case=sys.argv[1]
with tempfile.TemporaryDirectory() as directory:
    retained=os.open(directory+'/retained',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
    before=fixture_descriptors()
    if case=='interpreter':added=os.open('/proc/self/exe',os.O_RDONLY)
    elif case=='path':added=os.open('/proc/self/exe',os.O_PATH)
    else:added=os.open(directory+'/foreign',os.O_CREAT|os.O_EXCL|(os.O_RDWR if case=='writable' else os.O_RDONLY),0o600)
    if case=='interpreter':
        complete_provider_import(before)
        try:os.fstat(added)
        except OSError as failure:assert failure.errno==errno.EBADF
        else:raise AssertionError('fixture import descriptor remained open')
    else:
        try:complete_provider_import(before)
        except AssertionError as failure:assert str(failure)==('fixture-import-access' if case in ('writable','path') else 'fixture-import-identity'),str(failure)
        else:raise AssertionError('fixture closed unowned descriptor')
        assert os.fstat(added).st_ino>0
        os.close(added)
    os.write(retained,b'retained')
    assert os.fstat(retained).st_size==8
    os.close(retained)
print('verified fixture import '+case)
`;

for (const boundary of ['interpreter', 'foreign', 'writable', 'path']) {
  test(`logical provider startup closes only import-owned read-only interpreter descriptors: ${boundary}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', startupDescriptors, boundary],
      { timeout: 3000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified fixture import ${boundary}\n`);
  });
}
