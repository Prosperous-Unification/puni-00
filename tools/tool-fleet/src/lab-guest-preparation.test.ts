import { join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import { providerStartup } from './lab-provider-startup.test-fixture';

const helper = join(import.meta.dir, 'lab-guest-preparation.py');
/** Logical provider identity only; native admission still requires the independently pinned3.12. */
const providerStat = String.raw`
_provider_stat=os.stat
def stat_provider_python(path,*arguments,**keywords):
    return _provider_stat('/proc/self/exe' if path=='/usr/bin/python3.12' else path,*arguments,**keywords)
os.stat=stat_provider_python
`;
const control = String.raw`
import copy,importlib.util,json,os,sys
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
def refused(operation):
    try:operation()
    except p.raw.PreparationRefusal:pass
    else:raise AssertionError('unsafe guest input accepted')
sample={'capabilities':{'engineVersion':'29.7.2','serverApi':'1.55','minimumApi':'1.40','daemonId':'selected-daemon','os':'linux','arch':'amd64','driver':'overlayfs','driverType':'io.containerd.snapshotter.v1','requestApi':'1.55'},'counts':dict.fromkeys(('containers','running','paused','stopped','images'),0),'filesystem':{'fragmentBytes':4096,'blocks':100,'freeBlocks':50,'files':100,'freeFiles':50},'generation':{}}
for unit,memory,tasks,executable in [('docker.service',536870912,64,'/usr/bin/dockerd'),('containerd.service',134217728,32,'/usr/bin/containerd')]:
    fields={'LoadState':'loaded','ActiveState':'active','SubState':'running','InvocationID':'a'*32,'MainPID':'12','ExecMainStartTimestampMonotonic':'123','ControlGroup':'/system.slice/'+unit,'MemoryMax':str(memory),'MemorySwapMax':'0','TasksMax':str(tasks),'NRestarts':'0','Restart':'no','KillMode':'control-group','TimeoutStopUSec':'30s'}
    sample['generation'][unit]={'unit':fields,'processStart':'123','executable':executable}
for path in ['/run/docker.sock','/run/containerd/containerd.sock']:sample['generation'][path]=[1,2,3,0,0,432]
sample['generation']['docker.socket']={'LoadState':'loaded','ActiveState':'active','SubState':'listening','Listen':'/run/docker.sock (Stream)','SocketMode':'0660','SocketUser':'root','SocketGroup':'root'}
for unit,memory,tasks in [('system.slice',805306368,256),('user.slice',67108864,32)]:sample['generation'][unit]={'MemoryMax':str(memory),'MemorySwapMax':'0','TasksMax':str(tasks)}
p.check_sample(sample)
for fault in ['extra','capability','boolean-count','float-count','geometry','generation','socket','integer','finite']:
    changed=copy.deepcopy(sample)
    if fault=='extra':changed['extra']=0
    if fault=='capability':changed['capabilities']['requestApi']='1.54'
    if fault=='boolean-count':changed['counts']['containers']=False
    if fault=='float-count':changed['counts']['containers']=0.0
    if fault=='geometry':changed['filesystem']['blocks']=2**40
    if fault=='generation':changed['generation']['docker.service']['unit']['MemoryMax']='max'
    if fault=='socket':changed['generation']['/run/docker.sock'][3]=1
    if fault=='integer':changed['filesystem']['blocks']=True
    if fault=='finite':changed['filesystem']['freeFiles']=float('nan')
    refused(lambda:p.check_sample(changed))
print('verified guest sample')
`;

test('guest host sample validator refuses foreign capabilities and unsafe sample fields', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', control, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest sample\n');
});

const serialControl =
  control.slice(0, control.indexOf('p.check_sample(sample)')) +
  String.raw`
import subprocess,time
request={'nonce':'a'*32,'bootstrapSha256':'b'*64}
measured={'schemaVersion':1,**request,'kind':'measured','elapsedSeconds':60,'samples':61,'first':sample,'last':copy.deepcopy(sample)}
final={'schemaVersion':1,**request,'kind':'final','poweroffRequested':True,'guestPoweroffVerified':False,'hostCleanupVerified':False}
def line(frame):return b'PUNI_BASELINE '+json.dumps(frame,separators=(',',':')).encode()+b'\n'
def check(frames,seconds=60):
    collector=p.SerialCollector(request,0)
    for frame in frames:collector.feed(line(frame),seconds)
    return collector.finish()
assert check([measured,final])['measured']==measured
for frames in [[dict(measured,kind='foreign'),final],[measured],[final,measured],[measured,final,final],[measured,final,dict(final,kind='failure')],[dict(measured,samples=True),final],[dict(measured,elapsedSeconds=float('inf')),final],[dict(measured,nonce='c'*32),final],[dict(measured,elapsedSeconds=59),final],[measured,dict(final,hostCleanupVerified=True)]]:refused(lambda:check(frames))
refused(lambda:check([measured,final],59))
refused(lambda:check([measured,final],661))
collector=p.SerialCollector(request,0);collector.feed(line(measured),60);refused(lambda:collector.feed(line(final),91))
collector=p.SerialCollector(request,0);collector.feed(line(measured)[:-1],60);refused(collector.finish)
collector=p.SerialCollector(request,0);refused(lambda:collector.feed(b'x'*65537,60))
collector=p.SerialCollector(request,0)
for _ in range(128):collector.feed(b'x'*65535+b'\n',60)
refused(lambda:collector.feed(b'\n',60))
collector=p.SerialCollector(request,0);refused(lambda:collector.feed(line(measured).replace(b'"containers":0',b'"containers":0,"containers":0'),60))
# Real pipes are drained through EOF, including a late failing frame and nonzero child.
command=['/usr/bin/python3','-I','-B','-c','import os;os.write(1,b"boot\\n");os.write(2,b"diagnostic");raise SystemExit(7)']
refused(lambda:p.drain_qemu(command,(),{},lambda:None,lambda *args:None,request,lambda:None))
print('verified guest serial')
`;

test('guest serial consumes EOF and refuses reordered, late, nonfinite or incomplete frames', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', serialControl, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest serial\n');
});

const confinement = String.raw`
import errno,importlib.util,os,subprocess,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
with tempfile.TemporaryDirectory() as directory:
    path=directory+'/raw';foreign=directory+'/protected'
    for name in (path,foreign):
        with open(name,'wb') as stream:stream.write(b'original')
        os.chmod(name,0o600)
    raw_fd=os.open(path,os.O_RDWR);tool_fd=os.open(os.path.realpath('/usr/bin/python3'),os.O_RDONLY)
    null_fd=os.open('/dev/null',os.O_RDWR);read_fd,write_fd=os.pipe()
    def prepare():
        # Native CPython preexec runs before close_fds: worker-only pipe is still open here.
        os.write(write_fd,b'preexec-before-close-fds\n')
        os.close(write_fd)
        p.confine_qemu(raw_fd,tool_fd,null_fd,null_fd)
    script='''import errno,os,sys
raw,foreign=sys.argv[1:]
with open(raw,'r+b') as stream:stream.write(b'allowed!')
with open('/dev/null','wb') as stream:stream.write(b'allowed')
for path,flags in [(foreign,os.O_WRONLY),(raw,os.O_WRONLY|os.O_TRUNC),(foreign+'.new',os.O_WRONLY|os.O_CREAT)]:
    try:fd=os.open(path,flags,0o600)
    except OSError as failure:assert failure.errno in (errno.EACCES,errno.EPERM),failure
    else:os.close(fd);raise AssertionError('foreign operation allowed')
print('confined')
'''
    child=subprocess.Popen(['/proc/self/fd/'+str(tool_fd),'-I','-B','-c',script,path,foreign],pass_fds=(tool_fd,raw_fd),stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=prepare)
    stdout,stderr=child.communicate(timeout=5)
    assert child.returncode==0,(child.returncode,stderr)
    assert stdout==b'confined\n' and stderr==b''
    # Parent retains its record writer; child close_fds did not close the worker copy.
    os.write(write_fd,b'worker-record-writer-retained\n');os.close(write_fd)
    assert os.read(read_fd,4096)==b'preexec-before-close-fds\nworker-record-writer-retained\n'
    assert open(path,'rb').read()==b'allowed!' and open(foreign,'rb').read()==b'original'
    for descriptor in (read_fd,raw_fd,tool_fd,null_fd):os.close(descriptor)
print('verified guest confinement')
`;

test('guest CPython handoff retains the worker writer and confines actual regular writes', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', confinement, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest confinement\n');
});

const boundaries = String.raw`
import copy,importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
def refused(operation):
    try:operation()
    except (p.raw.PreparationRefusal,OSError):pass
    else:raise AssertionError('unsafe production boundary accepted')
case=sys.argv[2]
if case=='capacity':
    for initial,memory,free in [(True,4160749568,50*1024**3),(False,2147483648,40*1024**3)]:
        allocated=10*1024**3-160*1024**2
        p.check_capacity(memory,free,allocated,initial,False)
        for values in [(float(memory),free,allocated),(memory-1,free,allocated),(memory,free-1,allocated),(memory,free,allocated+1),(None,free,allocated),(True,free,allocated)]:refused(lambda:p.check_capacity(*values,initial,False))
elif case=='request':
    root='/reviewed/root';state=root+'/.puni/fleet-labs/observability-baseline'
    pin={'path':state+'/request.json','sha256':'a'*64,'bytes':20,'uid':os.geteuid(),'mode':0o600}
    request={'schemaVersion':1,'root':root,'state':state,'nonce':'b'*32,'pins':[pin],'seedRequest':pin['path'],'seedReceipt':pin['path'],'seedProvenance':pin['path'],'bootstrapSha256':'c'*64,'kvm':{'identity':[1,2,0,432],'rdev':os.makedev(10,232)}}
    p.check_request(request)
    for fault in ['extra','version','pin','size','mode','device','unpin','traversal']:
        changed=copy.deepcopy(request)
        if fault=='extra':changed['memoryMax']=1
        if fault=='version':changed['schemaVersion']=True
        if fault=='pin':changed['pins'][0]['sha256']='foreign'
        if fault=='size':changed['pins'][0]['bytes']=True
        if fault=='mode':changed['pins'][0]['mode']=0o666
        if fault=='device':changed['kvm']['rdev']=os.makedev(1,3)
        if fault=='unpin':changed['seedReceipt']=state+'/absent'
        if fault=='traversal':changed['root']+='/../foreign'
        refused(lambda:p.check_request(changed))
    arguments=p.service_arguments(request,'/reviewed/request','c'*64)
    for value in ['MemoryMax=1610612736','TasksMax=128','RuntimeMaxSec=900s','LimitFSIZE=8589934592','MemorySwapMax=0','LimitNOFILE=64','Restart=no']:assert '--property='+value in arguments
    arguments=p.qemu_arguments(request,{'nonce':'b'*32},{'qemu':3,'bios':4,'raw':5,'iso':6})
    assert arguments[arguments.index('-smp')+1]=='1' and arguments[arguments.index('-m')+1]=='1024'
    assert arguments[arguments.index('-nic')+1]=='none' and '-daemonize' not in arguments
    assert 'file=/dev/fdset/2,if=ide,index=0,media=cdrom,format=raw,readonly=on,discard=ignore,detect-zeroes=off' in arguments
    assert any('file=/dev/fdset/1,if=virtio,format=raw' in value for value in arguments)
elif case=='evidence':
    with tempfile.TemporaryDirectory() as directory:
        evidence=p.Evidence(directory)
        evidence.append('serial',b'owned\n');evidence.durable()
        path=directory+'/raw-serial.bin'
        assert open(path,'rb').read()==b'owned\n'
        before=os.pwrite
        os.pwrite=lambda *args:1
        refused(lambda:evidence.append('serial',b'foreign'))
        os.pwrite=before
        assert open(path,'rb').read()==b'owned\n'
        sync=os.fsync
        os.fsync=lambda *args:(_ for _ in ()).throw(OSError('controlled fsync failure'))
        refused(evidence.durable);os.fsync=sync
        os.rename(path,path+'.retained');open(path,'wb').close();os.chmod(path,0o600)
        refused(lambda:evidence.append('serial',b'foreign'))
        assert open(path,'rb').read()==b'' and open(path+'.retained','rb').read()==b'owned\n'
        evidence.close()
    with tempfile.TemporaryDirectory() as directory:
        evidence=p.Evidence(directory)
        evidence.append('serial',b'x'*(8*1024**2))
        refused(lambda:evidence.append('serial',b'x'))
        assert os.stat(directory+'/raw-serial.bin').st_size==8*1024**2
        evidence.close()
elif case=='inputs':
    with tempfile.TemporaryDirectory() as directory:
        path=directory+'/selected';open(path,'wb').write(b'selected');os.chmod(path,0o600)
        pin={'path':path,'sha256':__import__('hashlib').sha256(b'selected').hexdigest(),'bytes':8,'uid':os.geteuid(),'mode':0o600}
        request={'pins':[pin],'state':directory}
        p.seed.verify_pin(request,pin)
        open(path,'wb').write(b'foreign!');refused(lambda:p.seed.verify_pin(request,pin))
        os.chmod(path,0);refused(lambda:p.raw.open_private(path))
        os.unlink(path);refused(lambda:p.raw.open_private(path))
print('verified guest '+case)
`;

for (const boundary of ['capacity', 'request', 'evidence', 'inputs']) {
  test(`guest ${boundary} keeps its fixed budget and original input boundaries`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', boundaries, helper, boundary],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified guest ${boundary}\n`);
  });
}

const lifecycle =
  control.slice(0, control.indexOf('p.check_sample(sample)')) +
  String.raw`
import base64,hashlib,subprocess,tempfile,time
fault=sys.argv[2]
sample['filesystem'].update(blocks=2,freeBlocks=1)
child_source=r'''
import base64,importlib.util,json,os,sys,time
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
request=json.loads(sys.argv[2]);sample=json.loads(sys.argv[3]);fault=sys.argv[4]
state=request['state'];directory=state+'/guest-'+request['nonce'];raw_fd=os.open(state+'/disk.raw',os.O_RDWR);kvm_fd=os.open('/dev/null',os.O_RDWR)
directory_fd=p.raw.open_private(directory,True);lock=p.raw.acquire_staging(state)
paths={'iso':state+'/seed-'+('b'*32)+'/seed.iso','qemu':state+'/tools-root/usr/bin/qemu-system-x86_64','bios':state+'/tools-root/usr/share/seabios/bios-256k.bin'}
inputs={}
for name,path in paths.items():
    descriptor=os.open(path,os.O_RDONLY);inputs[name]={'fd':descriptor,'identity':p.raw.stable_identity(os.fstat(descriptor))}
binding={'pid':os.getpid(),'start':p.raw.process_start(os.getpid()),'unit':'puni-guest-'+request['nonce']+'.service','invocation':'e'*32,'cgroup':'/fixture','nonce':request['nonce'],'creator':p.raw.identity(os.fstat(directory_fd)),'raw':p.raw.identity(os.fstat(raw_fd)),'rawFd':raw_fd,'rawPath':state+'/disk.raw','seedNonce':'b'*32,'python':p.raw.stable_identity(os.stat('/proc/self/exe')),'inputs':inputs,'source':'c'*64,'request':'d'*64,'kvmFd':kvm_fd}
if fault=='worker':binding['pid']+=1000000
if fault=='creator':binding['creator'][1]+=1
if fault=='inode':binding['raw'][1]+=1
if fault=='foreign-request':binding['request']='foreign'
p.raw.send_frame(1,{'phase':'ready','binding':binding,'observedNs':time.time_ns()})
try:
    ack=p.raw.receive_frame(0,.2);p.raw.check_ack(ack,binding,'d'*64)
    if fault=='source':raise p.raw.PreparationRefusal('changed-source')
    if fault=='raw-replace':
        os.rename(state+'/disk.raw',state+'/disk.raw.retained')
        replacement=os.open(state+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600);os.posix_fallocate(replacement,0,8192);os.write(replacement,b'\0'*8192);os.fsync(replacement);os.close(replacement)
    if fault=='iso-replace':
        os.rename(paths['iso'],paths['iso']+'.retained');open(paths['iso'],'wb').write(b'fixture');os.chmod(paths['iso'],0o600)
    os.pwrite(raw_fd,b'guest-write',0);os.fsync(raw_fd)
    measured={'schemaVersion':1,'nonce':'b'*32,'bootstrapSha256':'f'*64,'kind':'measured','elapsedSeconds':60,'samples':61,'first':sample,'last':sample}
    final={'schemaVersion':1,'nonce':'b'*32,'bootstrapSha256':'f'*64,'kind':'final','poweroffRequested':True,'guestPoweroffVerified':False,'hostCleanupVerified':False}
    for frame in [measured,final]:
        chunk=b'PUNI_BASELINE '+json.dumps(frame,separators=(',',':')).encode()+b'\n'
        p.raw.send_frame(1,{'phase':'output','stream':'serial','bytes':base64.b64encode(chunk).decode()})
    counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
    record={'binding':binding,'startedNs':time.time_ns(),'finishedNs':time.time_ns(),'caps':dict(p.CAPS),'counters':counters,'qemuExited':True,'qemuReaped':True,'measured':True}
    if fault=='caps':record['caps']['memory.max']='max'
    allocation=p.raw.load_inspector().inspect_file(state+'/disk.raw',8192)
    p.raw.send_frame(1,{'phase':'complete','record':record,'projection':{'measured':measured,'final':final},'allocation':allocation})
    if fault=='post-complete':p.raw.send_frame(1,{'phase':'output','stream':'serial','bytes':base64.b64encode(b'late\n').decode()})
    ack=p.raw.receive_frame(0,.5)
    if ack!={'durableDigest':p.raw.digest_json(record)}:raise p.raw.PreparationRefusal('wrong-durability')
except BaseException:sys.exit(1)
sys.exit(1 if fault=='client' else 0)
'''
with tempfile.TemporaryDirectory() as state:
    for relative in ('/tools-root/usr/bin','/tools-root/usr/share/seabios','/seed-'+('b'*32)):os.makedirs(state+relative,mode=0o700)
    for relative in ('/tools-root/usr/bin/qemu-system-x86_64','/tools-root/usr/share/seabios/bios-256k.bin','/seed-'+('b'*32)+'/seed.iso'):
        open(state+relative,'wb').write(b'fixture');os.chmod(state+relative,0o600)
    raw_fd=os.open(state+'/disk.raw',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600);os.posix_fallocate(raw_fd,0,8192);os.write(raw_fd,b'\0'*8192);os.fsync(raw_fd);os.close(raw_fd)
    iso=state+'/seed-'+('b'*32)+'/seed.iso'
    request={'state':state,'nonce':'a'*32,'seedReceipt':'reviewed-seed','bootstrapSha256':'f'*64,'kvm':{'identity':p.raw.identity(os.stat('/dev/null')),'rdev':os.stat('/dev/null').st_rdev},'pins':[{'path':iso,'sha256':hashlib.sha256(b'fixture').hexdigest(),'bytes':7,'uid':os.geteuid(),'mode':0o600}]}
    p.raw.RAW_BYTES=8192
    p.verify_inputs=lambda request:'c'*64
    p.verify_seed=lambda request:{'raw':state+'/disk.raw','rawIdentity':p.raw.identity(os.stat(state+'/disk.raw')),'nonce':'b'*32}
    p.observe_capacity=lambda *args,**kwargs:{}
    original_stat=os.stat
    def device_stat(path,*args,**kwargs):
        return original_stat('/dev/null' if path=='/dev/kvm' else path,*args,**kwargs)
    os.stat=device_stat
    original_lstat=os.lstat
    os.lstat=lambda path,*args,**kwargs:original_lstat('/dev/null' if path=='/dev/kvm' else path,*args,**kwargs)
    p.service_arguments=lambda request,path,digest:['/usr/bin/python3','-I','-B','-c',child_source,sys.argv[1],json.dumps(request),json.dumps(sample),fault]
    p.observe_active=lambda unit,pid:{'pid':pid,'start':p.raw.process_start(pid),'unit':unit,'invocation':'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}
    p.raw.read_caps=lambda cgroup:dict(p.CAPS)
    unloaded={'LoadState':'not-found','ActiveState':'inactive','SubState':'dead','MainPID':'0','InvocationID':'','ControlGroup':'','Result':'','ExecMainStatus':''}
    calls=0
    def observe(unit):
        global calls
        calls+=1
        return dict(unloaded,InvocationID='foreign') if fault=='terminal-identity' and calls>1 else dict(unloaded)
    p.raw.observe_unit=observe
    p.raw.group_events=lambda group:'populated 1\nfrozen 0\n' if fault=='group' else None
    cleaned=[]
    def stop(binding):
        if fault=='cleanup':raise p.raw.PreparationRefusal('raw-cleanup-uncertain')
        cleaned.append(binding['invocation'])
    p.raw.stop_owned=stop
    # Logical elapsed clock only; pipes, private files, process identities and fsync are native.
    consume=p.Evidence.consume
    def consume_elapsed(self,frame,binding,request):
        if self.collector is None:self.collector=p.SerialCollector({'nonce':'b'*32,'bootstrapSha256':'f'*64},time.monotonic()-60.1)
        consume(self,frame,binding,request)
    p.Evidence.consume=consume_elapsed
    original_send=p.raw.send_frame
    def send(descriptor,frame):
        if fault=='missing-ack' and 'bindingDigest' in frame:return
        if fault=='wrong-ack' and 'bindingDigest' in frame:frame['request']='foreign'
        if fault=='durable' and 'durableDigest' in frame:frame['durableDigest']='foreign'
        original_send(descriptor,frame)
    p.raw.send_frame=send
    publish=p.raw.persist
    def persist(directory,name,record,directory_fd=None):
        if name=='worker-counter.json':
            try:competing=p.raw.acquire_staging(state)
            except p.raw.PreparationRefusal:pass
            else:os.close(competing);raise AssertionError('original staging lock was released before durable ACK')
        return publish(directory,name,record,directory_fd=directory_fd)
    p.raw.persist=persist
    if fault=='short':os.pwrite=lambda *args:1
    if fault=='fsync':p.Evidence.durable=lambda self:(_ for _ in ()).throw(OSError('controlled fsync failure'))
    try:
        receipt=p.coordinator(request,'reviewed-request','d'*64)
        assert fault=='success',fault
        assert receipt['accepted'] is True and len(cleaned)==2
        directory=state+'/guest-'+request['nonce']
        assert len(os.listdir(directory))==8,os.listdir(directory)
        assert open(directory+'/raw-serial.bin','rb').read().count(b'PUNI_BASELINE ')==2
    except (p.raw.PreparationRefusal,OSError):
        assert fault!='success',open(state+'/guest-'+request['nonce']+'/client-stderr.bin','rb').read()
        directory=state+'/guest-'+request['nonce']
        assert not os.path.exists(directory+'/receipt.json')
        assert os.path.exists(directory+'/failure.json')
        failure=json.load(open(directory+'/failure.json'))
        expected={'foreign-request':'guest-ready-invalid','raw-replace':'guest-raw-changed','iso-replace':'guest-input-changed','worker':'raw-interrupted','creator':'guest-creator-invalid','inode':'guest-ready-invalid','missing-ack':'raw-protocol-incomplete','wrong-ack':'raw-protocol-incomplete','source':'raw-protocol-incomplete','durable':'raw-terminal-invalid','caps':'raw-counter-invalid','short':'guest-evidence-short-write','fsync':'raw-interrupted','client':'raw-terminal-invalid','group':'raw-terminal-invalid','terminal-identity':'guest-terminal-identity','cleanup':'raw-cleanup-uncertain','post-complete':'raw-protocol-invalid'}
        if fault=='iso-replace':assert not os.path.exists(directory+'/worker-counter.json'),'unsafe counter publication'
        assert failure['category']==expected[fault],(fault,failure)
        if fault in ('worker','creator','inode','foreign-request','missing-ack','wrong-ack','source'):assert open(state+'/disk.raw','rb').read(11)==b'\0'*11
print('verified guest lifecycle '+fault)
`;

for (const fault of [
  'success',
  'foreign-request',
  'raw-replace',
  'iso-replace',
  'worker',
  'creator',
  'inode',
  'missing-ack',
  'wrong-ack',
  'source',
  'durable',
  'caps',
  'short',
  'fsync',
  'client',
  'group',
  'terminal-identity',
  'cleanup',
  'post-complete',
]) {
  test(`guest coordinator ${fault} joins native pipes, original files and durable ACK`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', lifecycle, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified guest lifecycle ${fault}\n`);
  });
}

const draining =
  control.slice(0, control.indexOf('p.check_sample(sample)')) +
  String.raw`
import time
request={'nonce':'a'*32,'bootstrapSha256':'b'*64}
measured={'schemaVersion':1,**request,'kind':'measured','elapsedSeconds':60,'samples':61,'first':sample,'last':sample}
final={'schemaVersion':1,**request,'kind':'final','poweroffRequested':True,'guestPoweroffVerified':False,'hostCleanupVerified':False}
wire=b''.join(b'PUNI_BASELINE '+json.dumps(frame,separators=(',',':')).encode()+b'\n' for frame in [measured,final])
real_clock=time.monotonic
for fault in ['success','nonzero','late','flood','stderr','stall','cancel']:
    calls=0
    def clock():
        global calls
        calls+=1
        return 0 if calls==1 else (666 if fault=='stall' else 60)
    p.time.monotonic=clock
    script='import os,time;'
    if fault=='stall':script+='time.sleep(5)'
    elif fault=='flood':script+='os.write(1,b"x"*65537)'
    elif fault=='stderr':script+='os.write(2,b"x"*(1024*1024+1));os.write(1,'+repr(wire)+')'
    else:script+='os.write(1,'+repr(wire)+');os.write(2,b"bounded stderr");'
    if fault=='nonzero':script+='raise SystemExit(1)'
    if fault=='late':script+='os.write(1,b\'PUNI_BASELINE {"kind":"failure"}\\n\')'
    received=[]
    def monitor():
        if fault=='cancel':raise p.raw.PreparationRefusal('controlled-cancellation')
    def run():return p.drain_qemu(['/usr/bin/python3','-I','-B','-c',script],(),{},monitor,lambda stream,chunk:received.append((stream,chunk)),request,lambda:None)
    if fault=='success':
        projection=run();assert projection=={'measured':measured,'final':final}
        assert b''.join(chunk for stream,chunk in received if stream=='stderr')==b'bounded stderr'
    else:refused(run)
    p.time.monotonic=real_clock
print('verified guest child draining')
`;

test('guest drain reaps real success, failed, flooded, stalled and cancelled children', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', draining, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest child draining\n');
});

const predecessorControl = String.raw`
import copy,importlib.util,json,os,sys,tempfile,time
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
def refused(operation):
    try:operation()
    except p.raw.PreparationRefusal:pass
    else:raise AssertionError('foreign predecessor accepted')
receipts={}
for prefix in ['raw','seed']:
    nonce='a'*32;unit='puni-'+prefix+'-'+nonce+'.service'
    binding={'pid':123,'start':'456','unit':unit,'invocation':'e'*32,'cgroup':'/owned/'+unit,'nonce':nonce,'creator':[1,2,os.geteuid(),448],'python':[1,3,0,493,100,1,1,1],'source':'c'*64,'request':'d'*64}
    if prefix=='raw':binding.update(raw=[1,4,os.geteuid(),384],rawFd=5,image=[1,5,os.geteuid(),256,100,1,1,1],imageFd=6,tool=[1,6,os.geteuid(),493,100,1,1,1],toolFd=7)
    else:binding.update(iso=[1,4,os.geteuid(),384],isoFd=5,inputs={name:{'fd':offset+6,'identity':[1,offset+5,os.geteuid(),256,100,1,1,1]} for offset,name in enumerate([*p.seed.MEMBERS,'genisoimage','isoinfo'])})
    receipt={'schemaVersion':1,'scope':prefix+'-preparation','accepted':True,'guestAuthority':False,'fullRehearsalAuthority':False,'requestDigest':'d'*64,'sourceDigest':'c'*64,'binding':binding,'counterDigest':'f'*64,'measurementPhase':'after-converter-before-worker-exit' if prefix=='raw' else 'after-seed-before-worker-exit','counterPersistence':'coordinator-fsync-before-worker-durability-ack','terminal':{'LoadState':'not-found','ActiveState':'inactive','SubState':'dead','MainPID':'0','InvocationID':'','ControlGroup':'','Result':'success','ExecMainStatus':'0'},'groupEvents':None,'finalCapacity':{'availableMemoryBytes':2147483648,'freeBytes':40*1024**3,'allocatedBytes':9*1024**3,'observedNs':time.time_ns()},'finishedNs':time.time_ns(),'trust':'independently-selected-content-pins; signatures remain separate input provenance'}
    if prefix=='raw':receipt['rawBytes']=8*1024**3
    else:receipt.update(isoBytesLimit=80*1024**2,memberBytesLimit=64*1024**2,dependencyReport='/dependency',rawReceipt='/raw')
    p.check_receipt(receipt,prefix)
    receipts[prefix]=copy.deepcopy(receipt)
    for fault in ['extra','authority','version','source','request','future','pid','identity','terminal','capacity']:
        changed=copy.deepcopy(receipt)
        if fault=='extra':changed['extra']=False
        if fault=='authority':changed['fullRehearsalAuthority']=True
        if fault=='version':changed['schemaVersion']=True
        if fault=='source':changed['sourceDigest']='b'*64
        if fault=='request':changed['requestDigest']='b'*64
        if fault=='future':changed['finishedNs']=time.time_ns()+10**12
        if fault=='pid':changed['binding']['pid']=True
        if fault=='identity':changed['binding']['creator'][1]=True
        if fault=='terminal':changed['terminal']['InvocationID']='e'*32
        if fault=='capacity':changed['finalCapacity']['allocatedBytes']=False
        refused(lambda:p.check_receipt(changed,prefix))
print('verified guest predecessor schemas')
`;

test('guest historical receipts preserve closed schemas and exact authority/digest joins', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', predecessorControl, helper],
    {
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest predecessor schemas\n');
});

const shortWriteDiagnostic = String.raw`
import importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
with tempfile.TemporaryDirectory() as directory:
    evidence=p.Evidence(directory);os.pwrite=lambda *args:1
    try:evidence.append('serial',b'controlled')
    except p.raw.PreparationRefusal as failure:assert str(failure)=='guest-evidence-short-write','short-write diagnostic changed'
    else:raise AssertionError('short write accepted')
    evidence.close()
`;

const watchedGuards: readonly (readonly [string, string, string?])[] = [
  ['guest-sample-shape', control],
  ['guest-capabilities', control],
  ['guest-workload', control],
  ['guest-filesystem', control],
  ['guest-generation', control],
  ['guest-socket', control],
  ['guest-frame-binding', serialControl],
  ['guest-frame-order', serialControl],
  ['guest-measurement-time', serialControl],
  ['guest-shutdown-time', serialControl],
  ['guest-line-bound', serialControl],
  ['guest-serial-bound', serialControl],
  ['guest-capacity-malformed', boundaries, 'capacity'],
  ['guest-memory-floor', boundaries, 'capacity'],
  ['guest-disk-floor', boundaries, 'capacity'],
  ['guest-staging-bound', boundaries, 'capacity'],
  ['guest-request-invalid', boundaries, 'request'],
  ['guest-evidence-bound', boundaries, 'evidence'],
  ['guest-evidence-short-write', shortWriteDiagnostic],
  ['guest-qemu-failed', draining],
  ['guest-stderr-bound', draining],
  ['guest-predecessor-receipt', predecessorControl],
];

for (const [category, script, argument] of watchedGuards) {
  test(`guest guard proof ${category} ${category === 'guest-evidence-short-write' ? 'preserves its exact diagnostic' : 'catches unsafe acceptance when disabled'}`, () => {
    const changed = script.replace(
      'spec.loader.exec_module(p)',
      `spec.loader.exec_module(p)\n_original_require=p.require\np.require=lambda predicate,category:_original_require(predicate or category==${JSON.stringify(category)},category)`,
    );
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, ...(argument ? [argument] : [])],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toMatch(
      /unsafe guest input accepted|unsafe production boundary accepted|foreign predecessor accepted|short-write diagnostic changed/u,
    );
  });
}

for (const [category, fault] of [
  ['guest-ready-invalid', 'foreign-request'],
  ['guest-creator-invalid', 'creator'],
  ['guest-raw-changed', 'raw-replace'],
  ['guest-input-changed', 'iso-replace'],
  ['guest-terminal-identity', 'terminal-identity'],
  ['raw-protocol-invalid', 'post-complete'],
] as const) {
  test(`guest lifecycle guard proof ${category} prevents a durable foreign receipt`, () => {
    const target = category.startsWith('raw-') ? 'p.raw' : 'p';
    const changed = lifecycle.replace(
      'spec.loader.exec_module(p)',
      `spec.loader.exec_module(p)\n_original_require=${target}.require\n${target}.require=lambda predicate,category:_original_require(predicate or category==${JSON.stringify(category)},category)`,
    );
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(
      category === 'guest-input-changed'
        ? 'unsafe counter publication'
        : `AssertionError: ${fault}`,
    );
  });
}

for (const [name, before, after] of [
  ['landlock application', 'and syscall(446, descriptor, 0) == 0', 'and True'],
  [
    'raw truncate restriction',
    '(1 << 15)-1-(1 << 2)-(1 << 3)',
    '(1 << 15)-1-(1 << 2)-(1 << 3)-(1 << 14)',
  ],
] as const) {
  test(`guest confinement proof ${name} catches a real protected operation`, () => {
    const changed = confinement.replace(
      'spec.loader.exec_module(p)',
      `spec.loader.exec_module(p)\nimport inspect\n_source=inspect.getsource(p.confine_qemu)\nassert ${JSON.stringify(before)} in _source\nexec(_source.replace(${JSON.stringify(before)},${JSON.stringify(after)}),p.__dict__)`,
    );
    const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', changed, helper], {
      timeout: 10000,
      maxBuffer: 65536,
    });
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain('foreign operation allowed');
  });
}

const workerSource = String.raw`
import base64,importlib.util,json,os,resource,stat,sys,time
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
request=json.loads(sys.argv[2]);sample=json.loads(sys.argv[3]);fault=sys.argv[4]
p.raw.RAW_BYTES=8192
# Logical lifecycle fixtures qualify filesystem/kernel identity separately from native admission;
# retain the actual canonical initialized-map inspection and irreversible filter installation.
p.check_raw_geometry=lambda descriptor,path:p.raw.load_inspector().inspect_file(path,p.raw.RAW_BYTES,require_initialized=True)
_install_geometry=p.install_geometry_filter
def install_logical_geometry():
    import types
    uname=p.os.uname
    p.os.uname=lambda:types.SimpleNamespace(machine='x86_64',release='7.0.11-76070011-generic')
    try:_install_geometry()
    finally:p.os.uname=uname
p.install_geometry_filter=install_logical_geometry
# Small ordinary-file control only; the fixed production service limits have separate native evidence.
def limits():
    resource.setrlimit(resource.RLIMIT_AS,(128*1024**2,)*2);resource.setrlimit(resource.RLIMIT_CPU,(5,5));resource.setrlimit(resource.RLIMIT_FSIZE,(8192,8192));resource.setrlimit(resource.RLIMIT_NOFILE,(64,64));resource.setrlimit(resource.RLIMIT_CORE,(0,0))
p.raw.worker_limits=limits
original_open=os.open;original_lstat=os.lstat
os.open=lambda path,*args,**kwargs:original_open('/dev/null' if path=='/dev/kvm' else path,*args,**kwargs)
os.lstat=lambda path,*args,**kwargs:original_lstat('/dev/null' if path=='/dev/kvm' else path,*args,**kwargs)
p.check_kvm=lambda descriptor,expected:p.require(stat.S_ISCHR(os.fstat(descriptor).st_mode) and p.raw.identity(os.fstat(descriptor))==expected['identity'],'guest-kvm-changed')
state=request['state'];iso=state+'/seed-'+('b'*32)+'/seed.iso';calls=0
p.verify_seed=lambda request:{'nonce':'b'*32,'raw':state+'/disk.raw','rawIdentity':p.raw.identity(os.stat(state+'/disk.raw')),'iso':iso,'isoIdentity':p.raw.stable_identity(os.stat(iso)),'bootstrapSha256':'f'*64}
def verify(request):
    global calls
    calls+=1
    return 'changed' if fault=='source' and calls==2 else 'c'*64
p.verify_inputs=verify;p.observe_capacity=lambda *args,**kwargs:{}
p.observe_active=lambda unit,pid:{'pid':pid,'start':p.raw.process_start(pid),'unit':unit,'invocation':'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}
p.raw.read_caps=lambda group:dict(p.CAPS)
os.environ['INVOCATION_ID']='wrong' if fault=='invocation' else 'e'*32
counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
read=p.raw.read_text
p.raw.read_text=lambda path,*args:counters[path.rsplit('/',1)[1]] if path.startswith('/sys/fs/cgroup/fixture/') else read(path,*args)
receive=p.raw.receive_frame
p.raw.receive_frame=lambda descriptor,seconds=10:receive(descriptor,.3)
collector=p.SerialCollector
class ElapsedCollector(collector):
    def __init__(self,request,started):super().__init__(request,started-60.1)
p.SerialCollector=ElapsedCollector
drain=p.drain_qemu
def harmless(arguments,descriptors,environment,monitor,emit,request,prepare):
    measured={'schemaVersion':1,'nonce':'b'*32,'bootstrapSha256':'f'*64,'kind':'measured','elapsedSeconds':60,'samples':61,'first':sample,'last':sample}
    final={'schemaVersion':1,'nonce':'b'*32,'bootstrapSha256':'f'*64,'kind':'final','poweroffRequested':True,'guestPoweroffVerified':False,'hostCleanupVerified':False}
    wire=b''.join(b'PUNI_BASELINE '+json.dumps(frame,separators=(',',':')).encode()+b'\n' for frame in [measured,final])
    command=[arguments[0],'-s','-P','-B','-c','import os,sys;os.pwrite(int(sys.argv[1]),b"guest-write",0);os.write(1,'+repr(wire)+')',str(descriptors[0])]
    # Relocated standalone3.14 needs its existing stdlib prefix; this is only the harmless test executable.
    return drain(command,descriptors,dict(environment,PYTHONHOME=sys.base_prefix),monitor,emit,request,prepare)
p.drain_qemu=harmless
if fault=='descriptor':unexpected=os.open(iso,os.O_RDONLY)
try:p.worker(request,'d'*64)
except BaseException:__import__('traceback').print_exc();sys.exit(1)
`;
const workerLifecycle = lifecycle
  .replace(/child_source=r'''[\s\S]*?'''/u, `child_source=r'''${workerSource}'''`)
  .replace(
    "raw_fd=os.open(state+'/disk.raw'",
    "__import__('shutil').copyfile('/proc/self/exe',state+'/tools-root/usr/bin/qemu-system-x86_64');os.chmod(state+'/tools-root/usr/bin/qemu-system-x86_64',0o500)\n    raw_fd=os.open(state+'/disk.raw'",
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'descriptor':'raw-protocol-incomplete','invocation':'raw-protocol-incomplete','foreign-request'",
  );

for (const fault of [
  'success',
  'source',
  'missing-ack',
  'wrong-ack',
  'durable',
  'descriptor',
  'invocation',
]) {
  test(`guest production worker ${fault} confines an ordinary child and retains its record writer`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', workerLifecycle, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified guest lifecycle ${fault}\n`);
  });
}

const provenanceControl =
  predecessorControl.replace("print('verified guest predecessor schemas')", '') +
  String.raw`
import hashlib
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700)
    raw_directory=state+'/raw-'+('a'*32);seed_directory=state+'/seed-'+('a'*32)
    os.mkdir(raw_directory,0o700);os.mkdir(seed_directory,0o700);os.mkdir(state+'/inputs',0o700)
    pins=[]
    def write(path,payload,mode=0o600):
        descriptor=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,mode);os.write(descriptor,payload);os.close(descriptor)
        pin={'path':path,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'uid':os.geteuid(),'mode':mode};pins.append(pin);return pin
    def record(path,fields):return write(path,p.raw.encode_json(fields))
    raw_receipt=copy.deepcopy(receipts['raw']);raw_receipt['binding']['creator']=p.raw.identity(os.stat(raw_directory))
    raw_receipt_path=raw_directory+'/receipt.json';record(raw_receipt_path,raw_receipt)
    raw_request=state+'/raw-request.json';record(raw_request,{})
    raw_provenance=state+'/raw-provenance.json';record(raw_provenance,{})
    dependency=state+'/dependency.json';record(dependency,{'inputBindings':[],'tools':[]})
    image=state+'/inputs/image.img';write(image,b'image',0o400)
    os.makedirs(root+'/tools/tool-fleet/src',mode=0o700)
    bootstrap=root+'/tools/tool-fleet/src/lab-guest-bootstrap.py';bootstrap_pin=write(bootstrap,b'bootstrap')
    source=root+'/tools/tool-fleet/src/lab-seed-preparation.py';historical_pin=write(source,b'historical-source')
    members={}
    for name in p.seed.MEMBERS:
        payload=(json.dumps({'write_files':[{'path':'/opt/puni-baseline/bootstrap.py','content':'bootstrap'},{'path':'/opt/puni-baseline/request.json','content':json.dumps({'schemaVersion':1,'nonce':'a'*32,'bootstrapSha256':bootstrap_pin['sha256']})}]}).encode() if name=='user-data' else name.encode())
        if name=='user-data':payload=b'#cloud-config\n'+payload
        pin=write(state+'/inputs/'+name,payload,0o400);members[name]={key:pin[key] for key in ('path','sha256','bytes')}
    original={'schemaVersion':1,'root':root,'state':state,'nonce':'a'*32,'pins':list(pins),'members':members,'image':image,'dependencyReport':dependency,'rawReceipt':raw_receipt_path,'rawRequest':raw_request,'rawProvenance':raw_provenance,'provenance':[raw_provenance]}
    seed_request=state+'/seed-request.json';seed_request_pin=record(seed_request,original)
    iso=seed_directory+'/seed.iso';iso_pin=write(iso,b'fixture-iso')
    receipt=copy.deepcopy(receipts['seed']);receipt.update(requestDigest=seed_request_pin['sha256'],sourceDigest=p.raw.digest_json({pin['path']:pin['sha256'] for pin in original['pins']}),rawReceipt=raw_receipt_path,dependencyReport=dependency)
    receipt['binding'].update(request=receipt['requestDigest'],source=receipt['sourceDigest'],creator=p.raw.identity(os.stat(seed_directory)),iso=p.raw.identity(os.stat(iso)))
    seed_receipt=seed_directory+'/receipt.json';receipt_pin=record(seed_receipt,receipt)
    record(seed_directory+'/iso.json',{'bytes':iso_pin['bytes'],'sha256':iso_pin['sha256'],'memberBytes':sum(member['bytes'] for member in members.values()),'members':{name:{'bytes':member['bytes'],'sha256':member['sha256']} for name,member in members.items()},'namespaces':['iso9660','joliet','rock-ridge']})
    history=[pin for pin in original['pins'] if pin['path'].startswith(root+'/') and not pin['path'].startswith(state+'/')]
    provenance=state+'/seed-provenance.json';record(provenance,{'schemaVersion':1,'sourceRevision':'f'*40,'sourcePins':history,'requestDigest':receipt['requestDigest'],'receiptDigest':receipt_pin['sha256']})
    # A current guest pin may differ from historical seed source; immutable inputs still must match.
    pins.remove(historical_pin);os.unlink(source);write(source,b'current-changed-source')
    request={'root':root,'state':state,'pins':pins,'seedRequest':seed_request,'seedReceipt':seed_receipt,'seedProvenance':provenance,'bootstrapSha256':bootstrap_pin['sha256']}
    # Native raw allocation and dependency closure have separate accepted component evidence.
    p.seed.verify_raw=lambda request:None;p.seed.check_dependency=lambda *args:None
    selected=p.verify_seed(request)
    assert selected['raw']==raw_directory+'/disk.raw' and selected['nonce']=='a'*32
    read=p.seed.read_pinned_json
    for fault in ['provenance','source','iso','creator','bootstrap','raw-path','immutable']:
        def changed(request,path):
            fields=copy.deepcopy(read(request,path))
            if fault=='provenance' and path==provenance:fields['sourceRevision']='foreign'
            if fault=='source' and path==provenance:fields['sourcePins']=[]
            if fault=='iso' and path==seed_directory+'/iso.json':fields['sha256']='b'*64
            if fault=='creator' and path==seed_receipt:fields['binding']['creator'][1]+=1
            if fault=='bootstrap' and path==seed_request:fields['members']['user-data']['sha256']='b'*64
            if fault=='raw-path' and path==raw_receipt_path:fields['binding']['nonce']='b'*32;fields['binding']['unit']='puni-raw-'+('b'*32)+'.service';fields['binding']['cgroup']='/owned/'+fields['binding']['unit']
            if fault=='immutable' and path==seed_request:fields['pins'][0]['sha256']='b'*64
            return fields
        p.seed.read_pinned_json=changed
        refused(lambda:p.verify_seed(request))
    p.seed.read_pinned_json=read
print('verified guest seed provenance')
`;

test('guest consumes historical seed source independently while preserving immutable predecessors', () => {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', provenanceControl, helper],
    {
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified guest seed provenance\n');
});

test('guest public API rejects malformed arguments before any child invocation', async () => {
  const { prepareGuest, GuestPreparationRefusal } = await import('./lab-guest-preparation');
  const spawn = spyOn(Bun, 'spawnSync');
  try {
    expect(() => prepareGuest('', 'a'.repeat(64))).toThrow(GuestPreparationRefusal);
    expect(() => prepareGuest('/private/PRIVATE_GUEST', 'wrong')).toThrow('invalid-arguments');
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
  }
});

test('guest public API suppresses absent request paths and private child causes', async () => {
  const { prepareGuest, GuestPreparationRefusal } = await import('./lab-guest-preparation');
  try {
    prepareGuest('/private/PRIVATE_GUEST', 'a'.repeat(64));
    throw new Error('absent guest request accepted');
  } catch (failure) {
    expect(failure).toBeInstanceOf(GuestPreparationRefusal);
    expect(String(failure)).toBe('Error: guest preparation: producer-refused');
    expect(String(failure)).not.toContain('PRIVATE_GUEST');
  }
  const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw new Error('PRIVATE_CHILD_DIAGNOSTIC /private/PRIVATE_GUEST');
  });
  try {
    expect(() => prepareGuest('/private/PRIVATE_GUEST', 'a'.repeat(64))).toThrow(
      'guest preparation: dependency-unavailable',
    );
  } finally {
    spawn.mockRestore();
  }
});

test('guest source CLI emits literal machine-readable stderr with forced and disabled color', () => {
  const cli = join(import.meta.dir, 'lab-guest-preparation-cli.ts');
  for (const color of ['forced', 'disabled']) {
    const environment: typeof process.env = { ...process.env, CI: 'true' };
    delete environment['FORCE_COLOR'];
    delete environment['NO_COLOR'];
    environment[color === 'forced' ? 'FORCE_COLOR' : 'NO_COLOR'] = '1';
    for (const arguments_ of [
      [],
      ['/private/PRIVATE_GUEST', 'wrong'],
      ['/private/PRIVATE_GUEST', 'a'.repeat(64), 'extra'],
    ]) {
      const invocation = Bun.spawnSync([process.execPath, cli, ...arguments_], {
        env: environment,
        timeout: 3000,
        maxBuffer: 65536,
      });
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout.toString()).toBe('');
      expect(invocation.stderr.toString()).toBe('guest preparation: invalid-arguments\n');
    }
  }
});

for (const [category, fault] of [
  ['guest-mutation-binding', 'source'],
  ['guest-worker-invocation', 'invocation'],
  ['guest-durability-ack', 'durable'],
] as const) {
  test(`guest worker guard proof ${category} catches execution or acceptance after a foreign binding`, () => {
    const changed = workerLifecycle.replaceAll(
      'spec.loader.exec_module(p)',
      `spec.loader.exec_module(p)\n_original_require=p.require\np.require=lambda predicate,category:_original_require(predicate or category==${JSON.stringify(category)},category)`,
    );
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(`AssertionError: ${fault}`);
  });
}

const transportControl = lifecycle
  .replace(
    "p.raw.send_frame(1,{'phase':'ready','binding':binding,'observedNs':time.time_ns()})",
    "p.raw.send_frame(1,{'phase':'ready','binding':binding,'observedNs':time.time_ns()})\nif fault=='transport-stderr':os.write(2,b'bounded control stderr')",
  )
  .replace(
    "    try:\n        receipt=p.coordinator(request,'reviewed-request','d'*64)",
    String.raw`
    coordinate=p.raw.coordinate_attempt
    def small_transport(request,path,digest,adapter):
        assert adapter.stdout_limit==14*1024**2 and adapter.stderr_limit==1024**2
        if fault=='transport-stdout':adapter.stdout_limit=2048
        if fault=='transport-stderr':adapter.stderr_limit=1
        return coordinate(request,path,digest,adapter)
    p.raw.coordinate_attempt=small_transport
    try:
        receipt=p.coordinator(request,'reviewed-request','d'*64)`,
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'transport-stdout':'raw-child-output-bound','transport-stderr':'raw-child-output-bound','foreign-request'",
  );

for (const fault of ['transport-stdout', 'transport-stderr']) {
  test(`guest shared ${fault} bounds real pipes and fails when its guard is bypassed`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', transportControl, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const changed = transportControl.replace(
      'spec.loader.exec_module(p)',
      "spec.loader.exec_module(p)\n_original_require=p.raw.require\np.raw.require=lambda predicate,category:_original_require(predicate or category=='raw-child-output-bound',category)",
    );
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(`AssertionError: ${fault}`);
  });
}

const reviewEvidence = String.raw`
import importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
with tempfile.TemporaryDirectory() as directory:
    evidence=p.Evidence(directory);evidence.append('serial',b'original\n')
    path=directory+'/raw-serial.bin';os.rename(path,path+'.retained');open(path,'wb').write(b'foreign');os.chmod(path,0o600)
    try:evidence.durable()
    except p.raw.PreparationRefusal:pass
    else:raise AssertionError('substituted evidence was durable')
    assert open(path,'rb').read()==b'foreign' and open(path+'.retained','rb').read()==b'original\n'
    evidence.close()
print('verified original evidence durability')
`;

const reviewFailureBytes =
  control.slice(0, control.indexOf('p.check_sample(sample)')) +
  String.raw`
import base64,tempfile,time
request={'nonce':'a'*32,'bootstrapSha256':'b'*64}
wire=b'PUNI_BASELINE '+json.dumps({'schemaVersion':1,**request,'kind':'failure','reason':'controlled'},separators=(',',':')).encode()+b'\n'
received=[]
refused(lambda:p.drain_qemu(['/usr/bin/python3','-I','-B','-c','import os;os.write(1,'+repr(wire)+')'],(),{},lambda:None,lambda stream,chunk:received.append((stream,chunk)),request,lambda:None))
assert b''.join(chunk for stream,chunk in received if stream=='serial')==wire,'worker discarded bounded failure bytes'
with tempfile.TemporaryDirectory() as directory:
    evidence=p.Evidence(directory);evidence.ready_ns=time.time_ns()
    refused(lambda:evidence.consume({'phase':'output','stream':'serial','bytes':base64.b64encode(wire).decode()},{'seedNonce':'a'*32},request))
    assert open(directory+'/raw-serial.bin','rb').read()==wire,'parent discarded bounded failure bytes'
    assert not os.path.exists(directory+'/receipt.json')
    evidence.close()
print('verified bounded failure bytes retained')
`;

const counterTimingControl = workerLifecycle.replace(
  'p.drain_qemu=harmless',
  String.raw`
reaped_ns=None
counter_started=None
counter_finished=None
read_counter=p.raw.read_text
def timed_counter(path,*args):
    global counter_started,counter_finished
    if path.startswith('/sys/fs/cgroup/fixture/'):
        if counter_started is None:counter_started=time.time_ns()
        text=read_counter(path,*args);counter_finished=time.time_ns();return text
    return read_counter(path,*args)
p.raw.read_text=timed_counter
def timed_child(*args):
    global reaped_ns
    projection=harmless(*args);reaped_ns=time.time_ns();return projection
p.drain_qemu=timed_child
send=p.raw.send_frame
def interval(descriptor,frame):
    if frame.get('phase')=='complete':
        record=frame['record']
        assert reaped_ns<=record['startedNs']<=counter_started<=counter_finished<=record['finishedNs'],'counter interval started before reaped child'
    send(descriptor,frame)
p.raw.send_frame=interval`,
);

const reviewClosedPipes =
  control.slice(0, control.indexOf('p.check_sample(sample)')) +
  String.raw`
import tempfile,time
request={'nonce':'a'*32,'bootstrapSha256':'b'*64}
measured={'schemaVersion':1,**request,'kind':'measured','elapsedSeconds':60,'samples':61,'first':sample,'last':sample}
final={'schemaVersion':1,**request,'kind':'final','poweroffRequested':True,'guestPoweroffVerified':False,'hostCleanupVerified':False}
wire=b''.join(b'PUNI_BASELINE '+json.dumps(frame,separators=(',',':')).encode()+b'\n' for frame in [measured,final])
with tempfile.TemporaryDirectory() as directory:
    marker=directory+'/outlived-shutdown';tracked=set();eof=set();calls=0;post_eof_reads=0;post_eof_monitors=0
    popen=p.subprocess.Popen;read=p.os.read;clock=p.time.monotonic
    def track(*args,**kwargs):
        child=popen(*args,**kwargs);tracked.update([child.stdout.fileno(),child.stderr.fileno()]);return child
    def track_read(descriptor,*args):
        chunk=read(descriptor,*args)
        if descriptor in tracked and not chunk:eof.add(descriptor)
        return chunk
    def elapsed():
        global calls,post_eof_reads
        calls+=1
        if len(eof)==2:post_eof_reads+=1
        return 0 if calls==1 else (92 if post_eof_reads>2 else 60)
    def monitor_eof():
        global post_eof_monitors
        if len(eof)==2:post_eof_monitors+=1
    p.subprocess.Popen=track;p.os.read=track_read;p.time.monotonic=elapsed
    script='import os,time;os.write(1,'+repr(wire)+');os.close(1);os.close(2);time.sleep(.3);open('+repr(marker)+',"w").write("outlived")'
    try:refused(lambda:p.drain_qemu(['/usr/bin/python3','-I','-B','-c',script],(),{},monitor_eof,lambda *args:None,request,lambda:None))
    finally:p.subprocess.Popen=popen;p.os.read=read;p.time.monotonic=clock
    assert len(eof)==2,'control did not reach both pipe EOFs'
    assert not os.path.exists(marker),'child outlived shutdown deadline after EOF'
    assert post_eof_monitors>0,'capacity monitoring stopped at EOF'
print('verified post-EOF deadline')
`;

for (const [name, script, arguments_, expected] of [
  ['I1 original evidence at fsync', reviewEvidence, [], 'verified original evidence durability\n'],
  [
    'I2 bounded failure-byte retention',
    reviewFailureBytes,
    [],
    'verified bounded failure bytes retained\n',
  ],
  [
    'I3 actual post-reap counter interval',
    counterTimingControl,
    ['success'],
    'verified guest lifecycle success\n',
  ],
  ['I4 shutdown deadline after EOF', reviewClosedPipes, [], 'verified post-EOF deadline\n'],
] as const) {
  test(`guest review ${name}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, ...arguments_],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(expected);
  });
}

const requireSelectedRefusal = String.raw`
def refuse_selected(operation):
    try:operation()
    except p.raw.PreparationRefusal:pass
    else:raise AssertionError('unsafe selected guard')
`;

/** Disable one production require call, leaving every other guard and caller intact. */
function bypassSelectedGuard(
  script: string,
  functionName: string,
  category: string,
  ordinal: number,
  everyImport = false,
): string {
  const replacement = `spec.loader.exec_module(p)
import ast,pathlib
_guard_tree=ast.parse(pathlib.Path(spec.origin).read_text())
_guard_function=next(node for node in ast.walk(_guard_tree) if isinstance(node,ast.FunctionDef) and node.name==${JSON.stringify(functionName)})
_guard_calls=sorted((node for node in ast.walk(_guard_function) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='require' and isinstance(node.args[-1],ast.Constant) and node.args[-1].value==${JSON.stringify(category)}),key=lambda node:node.lineno)
_guard_calls[${String(ordinal)}].args[0]=ast.Constant(value=True)
exec(compile(ast.fix_missing_locations(_guard_tree),spec.origin,'exec'),p.__dict__)`;
  return everyImport
    ? script.replaceAll('spec.loader.exec_module(p)', replacement)
    : script.replace('spec.loader.exec_module(p)', replacement);
}

const samplePrefix = control.slice(0, control.indexOf('p.check_sample(sample)'));
const serialPrefix = serialControl.slice(
  0,
  serialControl.indexOf('assert check([measured,final])'),
);
const requestPrefix = boundaries.slice(0, boundaries.indexOf('    p.check_request(request)'));
const receiptPrefix = predecessorControl.slice(
  0,
  predecessorControl.indexOf('    p.check_receipt(receipt,prefix)'),
);
const selectedGuardCases: readonly (readonly [
  string,
  string,
  string,
  number,
  string,
  readonly string[],
])[] = [
  [
    'generation key set',
    'check_sample',
    'guest-generation',
    0,
    samplePrefix +
      "sample['generation']['foreign']={}\nrefuse_selected(lambda:p.check_sample(sample))",
    [],
  ],
  [
    'service executable',
    'check_sample',
    'guest-generation',
    1,
    samplePrefix +
      "sample['generation']['docker.service']['executable']='/usr/bin/foreign'\nrefuse_selected(lambda:p.check_sample(sample))",
    [],
  ],
  [
    'socket unit policy',
    'check_sample',
    'guest-socket',
    1,
    samplePrefix +
      "sample['generation']['docker.socket']['SocketUser']='foreign'\nrefuse_selected(lambda:p.check_sample(sample))",
    [],
  ],
  [
    'slice policy',
    'check_sample',
    'guest-slice',
    0,
    samplePrefix +
      "sample['generation']['system.slice']['MemoryMax']='max'\nrefuse_selected(lambda:p.check_sample(sample))",
    [],
  ],
  [
    'third protocol frame',
    'accept',
    'guest-frame-order',
    0,
    serialPrefix +
      'collector=p.SerialCollector(request,0)\ncollector.feed(line(measured)+line(final),60)\nrefuse_selected(lambda:collector.feed(line(final),60))',
    [],
  ],
  [
    'final authority',
    'accept',
    'guest-frame-order',
    2,
    serialPrefix + 'refuse_selected(lambda:check([measured,dict(final,hostCleanupVerified=True)]))',
    [],
  ],
  [
    'steady generation',
    'accept',
    'guest-steady-generation',
    0,
    serialPrefix +
      "changed=copy.deepcopy(measured);changed['last']['capabilities']['daemonId']='foreign-daemon'\nrefuse_selected(lambda:check([changed,final]))",
    [],
  ],
  [
    'unterminated trailing bytes',
    'finish',
    'guest-serial-incomplete',
    0,
    serialPrefix +
      "collector=p.SerialCollector(request,0)\ncollector.feed(line(measured)+line(final)+b'partial',60)\nrefuse_selected(collector.finish)",
    [],
  ],
  [
    'pin closed schema',
    'check_request',
    'guest-request-invalid',
    1,
    requestPrefix +
      "    request['pins'][0]['foreign']=True\n    refuse_selected(lambda:p.check_request(request))",
    ['request'],
  ],
  [
    'receipt pin membership',
    'check_request',
    'guest-request-invalid',
    2,
    requestPrefix +
      "    request['seedReceipt']=state+'/absent'\n    refuse_selected(lambda:p.check_request(request))",
    ['request'],
  ],
  [
    'request KVM identity',
    'check_request',
    'guest-request-invalid',
    3,
    requestPrefix +
      "    request['kvm']['rdev']=os.makedev(1,3)\n    refuse_selected(lambda:p.check_request(request))",
    ['request'],
  ],
  [
    'receipt terminal schema',
    'check_receipt',
    'guest-predecessor-receipt',
    1,
    receiptPrefix +
      "    receipt['terminal']['foreign']='value'\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt binding schema',
    'check_receipt',
    'guest-predecessor-receipt',
    2,
    receiptPrefix +
      "    receipt['binding']['foreign']='value'\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt exact inode',
    'check_receipt',
    'guest-predecessor-receipt',
    3,
    receiptPrefix +
      "    receipt['binding']['creator'][1]=True\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt raw size',
    'check_receipt',
    'guest-predecessor-receipt',
    4,
    receiptPrefix +
      "    if prefix!='raw':continue\n    receipt['rawBytes']=1\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt seed input set',
    'check_receipt',
    'guest-predecessor-receipt',
    5,
    receiptPrefix +
      "    if prefix!='seed':continue\n    receipt['binding']['inputs']['foreign']=copy.deepcopy(receipt['binding']['inputs']['user-data'])\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt seed member fd',
    'check_receipt',
    'guest-predecessor-receipt',
    6,
    receiptPrefix +
      "    if prefix!='seed':continue\n    receipt['binding']['inputs']['user-data']['fd']=True\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt capacity exact integers',
    'check_receipt',
    'guest-predecessor-receipt',
    7,
    receiptPrefix +
      "    receipt['finalCapacity']['allocatedBytes']=False\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt unloaded identity',
    'check_receipt',
    'guest-predecessor-receipt',
    8,
    receiptPrefix +
      "    receipt['terminal']['InvocationID']='f'*32\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
  [
    'receipt digest join',
    'check_receipt',
    'guest-predecessor-receipt',
    9,
    receiptPrefix +
      "    receipt['requestDigest']='b'*64\n    refuse_selected(lambda:p.check_receipt(receipt,prefix))",
    [],
  ],
];

for (const [name, functionName, category, ordinal, body, arguments_] of selectedGuardCases) {
  test(`guest single guard ${name} rejects its independent fault`, () => {
    const script = requireSelectedRefusal + body;
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, ...arguments_],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(script, functionName, category, ordinal),
        helper,
        ...arguments_,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain('unsafe selected guard');
  });
}

const closureControl =
  requireSelectedRefusal +
  String.raw`
import importlib.util,os,pathlib,sys,tempfile,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2]
with tempfile.TemporaryDirectory() as directory:
    root=directory+'/declared';state=root+'/.puni/fleet-labs/observability-baseline'
    p.HELPER=pathlib.Path(root+'/tools/tool-fleet/src/lab-guest-preparation.py')
    if fault=='source':p.HELPER=pathlib.Path(directory+'/foreign/lab-guest-preparation.py')
    required=[str(p.HELPER),str(p.HELPER.with_suffix('.ts')),str(p.HELPER.with_name('lab-guest-preparation-cli.ts')),str(p.HELPER.with_name('lab-raw-preparation.py')),str(p.HELPER.with_name('lab-raw-allocation.py')),str(p.HELPER.with_name('lab-seed-preparation.py')),str(p.HELPER.with_name('lab-guest-bootstrap.py')),root+'/infra/local/qemu-lab.lock.json','/usr/bin/python3.12','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',state+'/tools-root/usr/bin/qemu-system-x86_64',state+'/tools-root/usr/share/seabios/bios-256k.bin','/fixture/library.so']
    pins=[{'path':path,'sha256':'a'*64,'bytes':1,'uid':0,'mode':0o400} for path in required]
    for relative in ('usr/share/qemu','usr/share/seabios','usr/lib/x86_64-linux-gnu/qemu'):os.makedirs(state+'/tools-root/'+relative,mode=0o700)
    request={'root':root,'state':state,'pins':pins}
    # External pin/version/loader observations are controlled; directory traversal is real.
    p.seed.verify_pin=lambda *args:None;p.verify_seed=lambda request:None
    p.seed.read_pinned_json=lambda *args:{'qemu':{'systemVersionLine':'selected-version'}}
    p.raw.run_bounded=lambda command,*args:('foreign-version\n' if fault=='version' else 'selected-version\n').encode() if '--version' in command else b'/fixture/library.so (0x1)\n'
    realpath=os.path.realpath
    os.path.realpath=lambda path:('/usr/bin/python3.14' if fault=='python' else '/usr/bin/python3.12') if path=='/usr/bin/python3' else realpath(path)
    if fault=='pin':pins[:]=[pin for pin in pins if not pin['path'].endswith('lab-guest-preparation-cli.ts')]
    if fault=='library':pins[:]=[pin for pin in pins if pin['path']!='/fixture/library.so']
    if fault=='directory':os.rmdir(state+'/tools-root/usr/share/qemu')
    if fault=='symlink':os.symlink(directory,state+'/tools-root/usr/share/qemu/foreign')
    if fault=='firmware':open(state+'/tools-root/usr/share/qemu/unpinned.bin','wb').write(b'foreign')
    refuse_selected(lambda:p.verify_inputs(request))
`;

const deviceControl =
  requireSelectedRefusal +
  String.raw`
import importlib.util,os,stat,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
observed=types.SimpleNamespace(st_dev=1,st_ino=2,st_uid=0,st_mode=stat.S_IFCHR|0o660,st_rdev=os.makedev(10,232))
p.os.fstat=lambda descriptor:observed;p.os.lstat=lambda path:observed
expected={'identity':[1,2,0,0o660],'rdev':os.makedev(10,232)}
p.check_kvm(3,expected)
expected['identity'][1]=3
refuse_selected(lambda:p.check_kvm(3,expected))
`;

const outputControl =
  requireSelectedRefusal +
  String.raw`
import base64,importlib.util,os,sys,tempfile,time
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
with tempfile.TemporaryDirectory() as directory:
    evidence=p.Evidence(directory);evidence.ready_ns=time.time_ns()
    frame={'phase':'output','stream':'serial','bytes':base64.b64encode(b'boot\n').decode()}
    if sys.argv[2]=='shape':frame['foreign']=True
    else:frame['bytes']=base64.b64encode(b'x'*16385).decode()
    refuse_selected(lambda:evidence.consume(frame,{'seedNonce':'a'*32},{'bootstrapSha256':'b'*64}))
    evidence.close()
`;

for (const [name, script, functionName, category, ordinal, argument] of [
  ['source location', closureControl, 'verify_inputs', 'guest-source-binding', 0, 'source'],
  ['required source pins', closureControl, 'verify_inputs', 'guest-source-pins-missing', 0, 'pin'],
  ['qualified interpreter', closureControl, 'verify_inputs', 'guest-python-binding', 0, 'python'],
  ['tool version', closureControl, 'verify_inputs', 'guest-tool-version', 0, 'version'],
  ['loader closure', closureControl, 'verify_inputs', 'guest-tool-closure', 0, 'library'],
  [
    'closure directory absence',
    closureControl,
    'verify_inputs',
    'guest-tool-closure',
    1,
    'directory',
  ],
  [
    'closure symlink directory',
    closureControl,
    'verify_inputs',
    'guest-tool-closure',
    2,
    'symlink',
  ],
  ['unpinned firmware', closureControl, 'verify_inputs', 'guest-tool-closure', 3, 'firmware'],
  ['last-use KVM inode', deviceControl, 'check_kvm', 'guest-kvm-changed', 0, 'device'],
  ['output closed schema', outputControl, 'consume', 'guest-output-frame', 0, 'shape'],
  ['decoded output quota', outputControl, 'consume', 'guest-output-frame', 1, 'decoded'],
] as const) {
  test(`guest single guard ${name} refuses controlled external facts`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, argument],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(script, functionName, category, ordinal),
        helper,
        argument,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain('unsafe selected guard');
  });
}

const admissionGuardControl = lifecycle
  .replace(
    "raw_fd=os.open(state+'/disk.raw',os.O_RDWR)",
    "raw_fd=os.open(state+'/disk.raw',os.O_RDONLY if fault=='raw-access' else os.O_RDWR)",
  )
  .replace(
    'descriptor=os.open(path,os.O_RDONLY);inputs[name]',
    "descriptor=os.open(path,os.O_RDWR if fault=='writable-input' and name=='iso' else os.O_RDONLY);inputs[name]",
  )
  .replace(
    "if fault=='foreign-request':binding['request']='foreign'",
    String.raw`if fault=='foreign-request':binding['request']='foreign'
if fault=='inputs-set':binding['inputs']['foreign']=dict(binding['inputs']['iso'])
if fault=='input-schema':binding['inputs']['iso']['foreign']=True
if fault=='python-fd':binding['python'][1]+=1`,
  )
  .replace(
    "'observedNs':time.time_ns()})",
    "'observedNs':time.time_ns()+(10**9 if fault=='ready-future' else 0)})",
  )
  .replace(
    "    os.pwrite(raw_fd,b'guest-write',0)",
    "    if fault=='raw-access':open(state+'/admitted','wb').write(b'admitted')\n    os.pwrite(raw_fd,b'guest-write',0)",
  )
  .replace(
    "'nonce':'b'*32}\n    p.observe_capacity",
    "'nonce':'c'*32 if fault=='predecessor' else 'b'*32}\n    p.observe_capacity",
  )
  .replace(
    "'invocation':'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}\n    p.raw.read_caps",
    "'invocation':'f'*32 if fault=='native-join' else 'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}\n    p.raw.read_caps",
  )
  .replace(
    '    p.raw.RAW_BYTES=8192',
    "    if fault=='kvm-fd':request['kvm']['identity'][1]+=1\n    p.raw.RAW_BYTES=8192",
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'ready-future':'guest-ready-invalid','predecessor':'guest-ready-invalid','native-join':'guest-ready-invalid','inputs-set':'guest-input-changed','input-schema':'guest-input-changed','writable-input':'guest-input-writable','raw-access':'guest-raw-access','python-fd':'guest-python-binding','kvm-fd':'guest-kvm-changed','foreign-request'",
  )
  .replace(
    "        assert failure['category']==expected[fault],(fault,failure)",
    String.raw`        if fault in ('ready-future','native-join'):assert open(state+'/disk.raw','rb').read(11)==b'\0'*11,'unqualified ready frame allowed raw write'
        if fault=='raw-access':assert not os.path.exists(state+'/admitted'),'readonly raw worker admitted'
        assert failure['category']==expected[fault],(fault,failure)`,
  );

for (const [name, functionName, category, ordinal, fault, witness] of [
  [
    'ready freshness',
    'check_ready',
    'guest-ready-invalid',
    0,
    'ready-future',
    'unqualified ready frame allowed raw write',
  ],
  [
    'predecessor join',
    'check_ready',
    'guest-ready-invalid',
    2,
    'predecessor',
    'AssertionError: predecessor',
  ],
  [
    'native ready join',
    'check_ready',
    'guest-ready-invalid',
    3,
    'native-join',
    'unqualified ready frame allowed raw write',
  ],
  [
    'input key set',
    'check_input_descriptors',
    'guest-input-changed',
    0,
    'inputs-set',
    'AssertionError: inputs-set',
  ],
  [
    'input FD schema',
    'check_input_descriptors',
    'guest-input-changed',
    1,
    'input-schema',
    'AssertionError: input-schema',
  ],
  [
    'readonly inputs',
    'check_input_descriptors',
    'guest-input-writable',
    0,
    'writable-input',
    'AssertionError: writable-input',
  ],
  [
    'raw access mode',
    'check_input_descriptors',
    'guest-raw-access',
    0,
    'raw-access',
    'readonly raw worker admitted',
  ],
  [
    'worker interpreter FD',
    'check_input_descriptors',
    'guest-python-binding',
    0,
    'python-fd',
    'AssertionError: python-fd',
  ],
  [
    'worker KVM FD',
    'check_input_descriptors',
    'guest-kvm-changed',
    0,
    'kvm-fd',
    'AssertionError: kvm-fd',
  ],
] as const) {
  test(`guest single guard ${name} protects actual handoff`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', admissionGuardControl, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(admissionGuardControl, functionName, category, ordinal),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(witness);
  });
}

const failureDurabilityControl = workerLifecycle
  .replace(
    "    wire=b''.join",
    "    if fault=='failure-bytes':measured['kind']='failure'\n    wire=b''.join",
  )
  .replace("expected={'descriptor'", "expected={'failure-bytes':'guest-frame-order','descriptor'")
  .replace(
    '    try:\n        receipt=p.coordinator',
    String.raw`
    synced=set();sync=os.fsync
    def record_sync(descriptor):
        named=os.readlink('/proc/self/fd/'+str(descriptor))
        if named.endswith(('/raw-serial.bin','/client-stderr.bin')):synced.add(named.rsplit('/',1)[1])
        sync(descriptor)
    os.fsync=record_sync
    try:
        receipt=p.coordinator`,
  )
  .replace(
    "        assert failure['category']==expected[fault],(fault,failure)",
    String.raw`        if fault=='failure-bytes':
            assert b'"kind":"failure"' in open(directory+'/raw-serial.bin','rb').read(),'failure bytes missing'
            assert synced=={'raw-serial.bin','client-stderr.bin'},'failure bytes were not fsynced'
        assert failure['category']==expected[fault],(fault,failure)`,
  );

const finalEvidenceControl = lifecycle
  .replace(
    '        calls+=1\n        return dict(unloaded',
    String.raw`        calls+=1
        if fault=='final-evidence' and calls>1:
            path=state+'/guest-'+request['nonce']+'/raw-serial.bin';os.rename(path,path+'.retained');open(path,'wb').write(b'foreign');os.chmod(path,0o600)
        return dict(unloaded`,
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'final-evidence':'guest-evidence-changed','foreign-request'",
  );

for (const [name, script, fault] of [
  ['I1 final original evidence', finalEvidenceControl, 'final-evidence'],
  ['I2 failure evidence fsync', failureDurabilityControl, 'failure-bytes'],
] as const) {
  test(`guest review ${name}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
  });
}

function replaceProductionSource(
  script: string,
  before: string,
  after: string,
  everyImport = false,
): string {
  const replacement = `spec.loader.exec_module(p)
import pathlib
_original_source=pathlib.Path(spec.origin).read_text()
assert _original_source.count(${JSON.stringify(before)})==1
exec(compile(_original_source.replace(${JSON.stringify(before)},${JSON.stringify(after)},1),spec.origin,'exec'),p.__dict__)`;
  return everyImport
    ? script.replaceAll('spec.loader.exec_module(p)', replacement)
    : script.replace('spec.loader.exec_module(p)', replacement);
}

const reviewFaultCases: readonly (readonly [string, string, readonly string[], string])[] = [
  [
    'I1 original evidence validation',
    bypassSelectedGuard(reviewEvidence, 'validate_file', 'guest-evidence-changed', 0),
    [],
    'substituted evidence was durable',
  ],
  [
    'I1 final evidence validation',
    bypassSelectedGuard(finalEvidenceControl, 'validate_file', 'guest-evidence-changed', 0),
    ['final-evidence'],
    'AssertionError: final-evidence',
  ],
  [
    'I2 worker retains before parsing',
    replaceProductionSource(
      reviewFailureBytes,
      "                emit(event.data, chunk)\n                if event.data == 'serial':\n                    collector.feed(chunk, time.monotonic())",
      "                if event.data == 'serial':\n                    collector.feed(chunk, time.monotonic())\n                emit(event.data, chunk)",
    ),
    [],
    'worker discarded bounded failure bytes',
  ],
  [
    'I2 parent retains before parsing',
    replaceProductionSource(
      reviewFailureBytes,
      "        self.append(frame['stream'], chunk)\n        if frame['stream'] == 'serial':\n            self.collector.feed(chunk, time.monotonic())",
      "        if frame['stream'] == 'serial':\n            self.collector.feed(chunk, time.monotonic())\n        self.append(frame['stream'], chunk)",
    ),
    [],
    'parent discarded bounded failure bytes',
  ],
  [
    'I2 failure evidence flush',
    replaceProductionSource(
      failureDurabilityControl,
      '        if evidence is not None:\n            evidence.durable()\n        raise',
      '        raise',
    ),
    ['failure-bytes'],
    'failure bytes were not fsynced',
  ],
  [
    'I3 true read interval',
    replaceProductionSource(
      counterTimingControl,
      '        started_ns = time.time_ns()\n        counters =',
      '        started_ns = ready_ns\n        counters =',
      true,
    ),
    ['success'],
    'counter interval started before reaped child',
  ],
  [
    'I4 monitor after EOF',
    replaceProductionSource(
      reviewClosedPipes,
      '            stop_at = deadline()\n            monitor()',
      '            stop_at = deadline()',
    ),
    [],
    'capacity monitoring stopped at EOF',
  ],
];

for (const [name, script, arguments_, witness] of reviewFaultCases) {
  test(`guest review fault ${name}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, ...arguments_],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(witness);
  });
}

const finalArtifactControl =
  requireSelectedRefusal +
  String.raw`
import hashlib,importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
with tempfile.TemporaryDirectory() as state:
    p.raw.RAW_BYTES=8192
    path=state+'/disk.raw';descriptor=os.open(path,os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600);os.posix_fallocate(descriptor,0,8192);os.write(descriptor,b'\0'*8192);os.fsync(descriptor);os.close(descriptor)
    os.mkdir(state+'/seed-'+('a'*32),0o700);iso=state+'/seed-'+('a'*32)+'/seed.iso';open(iso,'wb').write(b'fixture');os.chmod(iso,0o600)
    request={'state':state,'pins':[{'path':iso,'sha256':hashlib.sha256(b'fixture').hexdigest(),'bytes':7,'uid':os.geteuid(),'mode':0o600}]}
    binding={'rawPath':path,'raw':p.raw.identity(os.stat(path)),'seedNonce':'a'*32,'inputs':{'iso':{'identity':p.raw.stable_identity(os.stat(iso))}}}
    p.check_final_artifact(request,binding)
    if sys.argv[2]=='coverage':
        inspector=p.raw.load_inspector();inspect=inspector.inspect_file
        inspector.inspect_file=lambda *args,**kwargs:dict(inspect(*args,**kwargs),coverageBytes=1)
        p.raw.load_inspector=lambda:inspector
    else:binding['inputs']['iso']['identity'][1]+=1
    refuse_selected(lambda:p.check_final_artifact(request,binding))
`;

const artifactJoinControl = lifecycle
  .replace(
    "    p.raw.send_frame(1,{'phase':'complete'",
    "    if fault=='projection':final=dict(final,hostCleanupVerified=True)\n    if fault=='allocation':allocation['mapDigest']='f'*64\n    p.raw.send_frame(1,{'phase':'complete'",
  )
  .replace(
    '    try:\n        receipt=p.coordinator',
    String.raw`
    inspect_final=p.check_final_artifact;final_calls=0
    def final(request,binding):
        global final_calls
        final_calls+=1
        allocation=inspect_final(request,binding)
        if fault=='final-allocation' and final_calls==2:allocation=dict(allocation,mapDigest='f'*64)
        return allocation
    p.check_final_artifact=final
    try:
        receipt=p.coordinator`,
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'projection':'guest-projection-binding','allocation':'guest-allocation-binding','final-allocation':'guest-final-artifact','foreign-request'",
  );

for (const [name, script, functionName, category, ordinal, fault, witness] of [
  [
    'final raw coverage',
    finalArtifactControl,
    'check_final_artifact',
    'guest-final-artifact',
    0,
    'coverage',
    'unsafe selected guard',
  ],
  [
    'final ISO identity',
    finalArtifactControl,
    'check_final_artifact',
    'guest-final-artifact',
    1,
    'iso',
    'unsafe selected guard',
  ],
  [
    'collector projection join',
    artifactJoinControl,
    'persist_artifact',
    'guest-projection-binding',
    0,
    'projection',
    'AssertionError: projection',
  ],
  [
    'live allocation join',
    artifactJoinControl,
    'persist_artifact',
    'guest-allocation-binding',
    0,
    'allocation',
    'AssertionError: allocation',
  ],
  [
    'terminal allocation join',
    artifactJoinControl,
    'finalize',
    'guest-final-artifact',
    1,
    'final-allocation',
    'AssertionError: final-allocation',
  ],
] as const) {
  test(`guest single guard ${name} preserves final artifact provenance`, () => {
    const ordinary = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', script, helper, fault], {
      timeout: 10000,
      maxBuffer: 65536,
    });
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(script, functionName, category, ordinal),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(witness);
  });
}

const workerGuardControl = workerLifecycle
  .replace(
    'with tempfile.TemporaryDirectory() as state:',
    "with tempfile.TemporaryDirectory() as container:\n    state=container+'/state';os.mkdir(state,0o700)",
  )
  .replace(
    "    calls+=1\n    return 'changed'",
    String.raw`    calls+=1
    if fault=='staging-root' and calls==2:
        os.rename(state,state+'.retained');os.mkdir(state,0o700)
        for name in os.listdir(state+'.retained'):os.rename(state+'.retained/'+name,state+'/'+name)
    return 'changed'`,
  )
  .replace(
    'p.raw.read_caps=lambda group:dict(p.CAPS)',
    String.raw`def live_caps(group):
    caps=dict(p.CAPS)
    if fault=='live-caps' and __import__('inspect').currentframe().f_back.f_code.co_name=='monitor':caps['memory.max']='max'
    return caps
p.raw.read_caps=live_caps`,
  )
  .replace(
    "original_open('/dev/null' if path=='/dev/kvm' else path,*args,**kwargs)",
    "original_open('/dev/null' if path=='/dev/kvm' else (request['state']+'/null-protected' if fault=='null-device' and path=='/dev/null' else path),*args,**kwargs)",
  )
  .replace(
    '    p.raw.RAW_BYTES=8192',
    "    open(state+'/null-protected','wb').write(b'original');os.chmod(state+'/null-protected',0o600)\n    p.raw.RAW_BYTES=8192",
  )
  .replace(
    'import os,sys;os.pwrite',
    'import os,sys;os.write(0,b"foreign!") if sys.argv[2]=="null-device" else None;os.pwrite',
  )
  .replace('str(descriptors[0])]', 'str(descriptors[0]),fault]')
  .replace(
    "        assert fault=='success',fault",
    "        if fault=='null-device':assert open(state+'/null-protected','rb').read()==b'original','null FD granted a foreign regular write'\n        assert fault=='success',fault",
  )
  .replace(
    "expected={'descriptor'",
    "expected={'staging-root':'raw-protocol-incomplete','live-caps':'raw-protocol-incomplete','null-device':'raw-protocol-incomplete','descriptor'",
  );

for (const [name, category, fault, witness] of [
  [
    'original staging root',
    'guest-staging-changed',
    'staging-root',
    'original staging lock was released before durable ACK',
  ],
  [
    'null device identity',
    'guest-null-changed',
    'null-device',
    'null FD granted a foreign regular write',
  ],
  ['live native caps', 'guest-native-caps', 'live-caps', 'AssertionError: live-caps'],
] as const) {
  test(`guest single guard ${name} protects the production worker`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', workerGuardControl, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(workerGuardControl, 'worker', category, 0, true),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(witness);
  });
}

const predecessorGuardControl =
  requireSelectedRefusal +
  provenanceControl.slice(0, provenanceControl.indexOf("    for fault in ['provenance'")) +
  String.raw`
    fault=sys.argv[2]
    if fault=='immutable':next(pin for pin in pins if pin['path']==image)['sha256']='b'*64
    if fault=='iso-pin':next(pin for pin in pins if pin['path']==iso)['mode']=0o400
    if fault=='raw-path':os.mkdir(state+'/raw-'+('b'*32),0o700)
    if fault=='root':p.seed.check_request=lambda request:None
    if fault in ('bootstrap-pin','prefix','embedded'):
        path=members['user-data']['path'];payload=open(path).read();config=json.loads(payload[len('#cloud-config\n'):])
        if fault=='bootstrap-pin':
            config['write_files'][0]['content']='foreign-bootstrap'
            request['bootstrapSha256']=hashlib.sha256(b'foreign-bootstrap').hexdigest()
            config['write_files'][1]['content']=json.dumps({'schemaVersion':1,'nonce':'a'*32,'bootstrapSha256':request['bootstrapSha256']})
        if fault=='embedded':config['write_files'][0]['content']='foreign-bootstrap'
        payload=('x'*len('#cloud-config\n') if fault=='prefix' else '#cloud-config\n')+json.dumps(config)
        os.chmod(path,0o600);open(path,'w').write(payload);os.chmod(path,0o400)
    def changed(request,path):
        fields=copy.deepcopy(read(request,path))
        if fault=='root' and path==seed_request:fields['root']+='/foreign'
        if fault=='seed-join' and path==seed_receipt:
            fields['binding']['nonce']='b'*32;fields['binding']['unit']='puni-seed-'+('b'*32)+'.service';fields['binding']['cgroup']='/owned/'+fields['binding']['unit']
        if fault=='history' and path==provenance:fields['sourcePins']=[]
        if fault=='raw-path' and path==raw_receipt_path:
            fields['binding']['nonce']='b'*32;fields['binding']['unit']='puni-raw-'+('b'*32)+'.service';fields['binding']['cgroup']='/owned/'+fields['binding']['unit'];fields['binding']['creator']=p.raw.identity(os.stat(state+'/raw-'+('b'*32)))
        if fault=='raw-creator' and path==raw_receipt_path:fields['binding']['creator'][1]+=1
        if fault=='dependency-input' and path==dependency:
            identity=p.raw.stable_identity(os.stat(image));identity[1]+=1;fields['inputBindings']=[{'path':image,'identity':identity}]
        if fault=='dependency-tool' and path==dependency:
            identity=p.raw.stable_identity(os.stat(source));identity[1]+=1;fields['tools']=[{'path':source,'resolved':source,'identity':identity}]
        if fault=='seed-creator' and path==seed_receipt:fields['binding']['creator'][1]+=1
        if fault=='iso-identity' and path==seed_receipt:fields['binding']['iso'][1]+=1
        if fault=='artifact' and path==seed_directory+'/iso.json':fields['bytes']=float(fields['bytes'])
        return fields
    p.seed.read_pinned_json=changed
    refuse_selected(lambda:p.verify_seed(request))
`;

for (const [name, category, ordinal, fault] of [
  ['predecessor namespace after broken request validator', 'guest-seed-binding', 0, 'root'],
  ['seed receipt nonce join', 'guest-seed-binding', 1, 'seed-join'],
  ['historical source provenance', 'guest-seed-provenance', 0, 'history'],
  ['immutable predecessor pin', 'guest-predecessor-input', 0, 'immutable'],
  ['canonical raw receipt path', 'guest-raw-binding', 0, 'raw-path'],
  ['original raw creator', 'guest-raw-binding', 1, 'raw-creator'],
  ['dependency input identity', 'guest-dependency-changed', 0, 'dependency-input'],
  ['dependency tool identity', 'guest-dependency-changed', 1, 'dependency-tool'],
  ['selected ISO private pin', 'guest-seed-binding', 2, 'iso-pin'],
  ['original seed creator', 'guest-seed-binding', 3, 'seed-creator'],
  ['original ISO identity', 'guest-seed-binding', 4, 'iso-identity'],
  ['exact ISO artifact record', 'guest-seed-binding', 5, 'artifact'],
  ['selected bootstrap pin', 'guest-bootstrap-binding', 0, 'bootstrap-pin'],
  ['cloud-config prefix', 'guest-bootstrap-binding', 1, 'prefix'],
  ['embedded bootstrap identity', 'guest-bootstrap-binding', 2, 'embedded'],
] as const) {
  test(`guest single guard ${name} rejects foreign predecessor evidence`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', predecessorGuardControl, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(predecessorGuardControl, 'verify_seed', category, ordinal),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain('unsafe selected guard');
  });
}

const originalRequestControl = String.raw`
import contextlib,hashlib,importlib.util,io,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2]
with tempfile.TemporaryDirectory() as directory:
    path=directory+'/request.json';payload=b'{}';open(path,'wb').write(payload);os.chmod(path,0o600)
    digest='a'*64 if fault=='digest' else hashlib.sha256(payload).hexdigest()
    if fault=='replacement':
        read=p.raw.read_fd
        def replace(descriptor):
            payload=read(descriptor);os.rename(path,path+'.retained');open(path,'wb').write(payload);os.chmod(path,0o600);return payload
        p.raw.read_fd=replace
    def admission(request):raise AssertionError('untrusted request reached admission')
    p.check_request=admission;sys.argv=[str(p.HELPER),path,digest]
    with contextlib.redirect_stderr(io.StringIO()):assert p.main()==1
`;

const capacityParserControl =
  requireSelectedRefusal +
  String.raw`
import importlib.util,os,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
p.raw.read_text=lambda path:'MemAvailable: 99999999 kB\nMemAvailable: 99999998 kB\n'
p.os.statvfs=lambda path:types.SimpleNamespace(f_bavail=50*1024**3,f_frsize=1)
p.raw.allocated_bytes=lambda state:0
refuse_selected(lambda:p.observe_capacity('/qualified-state',initial=True))
`;

const freshSourceControl = lifecycle
  .replace(
    "    p.verify_inputs=lambda request:'c'*64",
    String.raw`    source_checks=0
    def fresh_source(request):
        global source_checks
        source_checks+=1
        return 'c'*64 if source_checks==1 else 'f'*64
    p.verify_inputs=fresh_source`,
  )
  .replace(
    "expected={'foreign-request'",
    "expected={'source-ready':'guest-source-binding','foreign-request'",
  );

const workerPipeControl = String.raw`
import importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
with tempfile.TemporaryDirectory() as directory:
    descriptor=os.open(directory+'/regular-stdin',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600);os.dup2(descriptor,0);os.close(descriptor)
    acquire=p.raw.acquire_staging
    def entered(state):
        descriptor=acquire(state);os.close(descriptor);raise AssertionError('nonpipe worker acquired staging')
    p.raw.acquire_staging=entered
    try:p.worker({'state':directory},'a'*64)
    except p.raw.PreparationRefusal as failure:assert str(failure)=='guest-worker-pipes'
`;

const drainQuotaControl =
  requireSelectedRefusal +
  String.raw`
import importlib.util,os,sys
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
count=0
script='import os;block=b"x"*65535+b"\\n";[os.write(1,block) for _ in range(128)];os.write(1,b"\\n")'
def emit(stream,chunk):
    global count
    if stream=='serial':count+=len(chunk)
try:p.drain_qemu(['/usr/bin/python3','-I','-B','-c',script],(),{},lambda:None,emit,{'nonce':'a'*32,'bootstrapSha256':'b'*64},lambda:None)
except p.raw.PreparationRefusal:pass
else:raise AssertionError('oversized serial stream accepted')
assert count==8*1024**2,'worker emitted beyond serial transport quota'
`;

for (const [name, script, functionName, category, ordinal, argument, witness] of [
  [
    'original request digest',
    originalRequestControl,
    'main',
    'guest-request-changed',
    0,
    'digest',
    'untrusted request reached admission',
  ],
  [
    'original request pathname',
    originalRequestControl,
    'main',
    'guest-request-changed',
    0,
    'replacement',
    'untrusted request reached admission',
  ],
  [
    'unique MemAvailable',
    capacityParserControl,
    'observe_capacity',
    'guest-capacity-malformed',
    0,
    'duplicate',
    'unsafe selected guard',
  ],
  [
    'fresh ready source',
    freshSourceControl,
    'check_ready',
    'guest-source-binding',
    0,
    'source-ready',
    'AssertionError: source-ready',
  ],
  [
    'anonymous worker pipes',
    workerPipeControl,
    'worker',
    'guest-worker-pipes',
    0,
    'pipe',
    'nonpipe worker acquired staging',
  ],
  [
    'LF-terminated line quota',
    requireSelectedRefusal +
      serialPrefix +
      "collector=p.SerialCollector(request,0)\nrefuse_selected(lambda:collector.feed(b'x'*65536+b'\\n',60))",
    'feed',
    'guest-line-bound',
    0,
    'line',
    'unsafe selected guard',
  ],
  [
    'pre-emit serial quota',
    drainQuotaControl,
    'drain_qemu',
    'guest-serial-bound',
    0,
    'quota',
    'worker emitted beyond serial transport quota',
  ],
] as const) {
  test(`guest single guard ${name} protects its external boundary`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', script, helper, argument],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(script, functionName, category, ordinal),
        helper,
        argument,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(witness);
  });
}

const fdsetReopen = String.raw`
import errno,fcntl,importlib.util,os,resource,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
resource.setrlimit(resource.RLIMIT_AS,(128*1024**2,)*2)
resource.setrlimit(resource.RLIMIT_CPU,(5,5))
resource.setrlimit(resource.RLIMIT_FSIZE,(2*1024**2,)*2)
resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
with tempfile.TemporaryDirectory() as directory:
    path=directory+'/raw'
    raw_fd=os.open(path,os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
    os.posix_fallocate(raw_fd,0,8192);os.write(raw_fd,b'X'*8192);os.fsync(raw_fd)
    original=os.fstat(raw_fd)
    tool_fd=os.open('/proc/self/exe',os.O_RDONLY);null_fd=os.open('/dev/null',os.O_RDWR)
    metadata_read,metadata_write=os.pipe()
    pid=os.fork()
    if pid==0:
        try:
            p.confine_qemu(raw_fd,tool_fd,null_fd,null_fd)
            assert fcntl.fcntl(raw_fd,fcntl.F_GETFL)&os.O_ACCMODE==os.O_RDWR
            assert (os.fstat(raw_fd).st_dev,os.fstat(raw_fd).st_ino)==(original.st_dev,original.st_ino)
            assert os.pwrite(raw_fd,b'allowed!',0)==8
            try:os.ftruncate(raw_fd,4096)
            except OSError as failure:assert failure.errno in (errno.EACCES,errno.EPERM)
            else:raise AssertionError('inherited FD truncated original raw')
            assert os.fstat(raw_fd).st_size==8192
            # The original description is closed: no second descriptor may retain truncate authority.
            for name in os.listdir('/proc/self/fd'):
                descriptor=int(name)
                if descriptor in (raw_fd,):continue
                try:opened=os.fstat(descriptor)
                except OSError as failure:
                    assert failure.errno==errno.EBADF
                    continue
                assert (opened.st_dev,opened.st_ino)!=(original.st_dev,original.st_ino),'preconfinement description retained'
            assert os.write(metadata_write,b'kept')==4
            os._exit(0)
        except BaseException:
            import traceback;traceback.print_exc();os._exit(1)
    _,status=os.waitpid(pid,0)
    assert os.waitstatus_to_exitcode(status)==0,'confined child violated original raw authority'
    assert os.read(metadata_read,4)==b'kept'
    assert os.fstat(raw_fd).st_size==8192 and os.fstat(raw_fd).st_blocks==original.st_blocks
    # Parent's independently retained description is neither replaced nor closed by child dup2.
    assert os.pread(raw_fd,8,0)==b'allowed!'
    for descriptor in (raw_fd,tool_fd,null_fd,metadata_read,metadata_write):os.close(descriptor)
print('verified confined raw FD reopen')
`;

test('guest fdset reopen denies inherited FD truncation while retaining original writes', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', fdsetReopen, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified confined raw FD reopen\n');
});

const rawReopenBoundary = String.raw`
import errno,fcntl,importlib.util,os,sys,tempfile
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2]
with tempfile.TemporaryDirectory() as directory:
    path=directory+'/raw';foreign=directory+'/foreign'
    for name in (path,foreign):
        with open(name,'wb') as stream:stream.write(b'X'*8192)
        os.chmod(name,0o600)
    raw_fd=os.open(path,os.O_RDWR);foreign_fd=os.open(foreign,os.O_RDWR)
    original=os.fstat(raw_fd);open_file=os.open;duplicate=os.dup2
    def reopen(path,flags,*args,**kwargs):
        if path=='/proc/self/fd/'+str(raw_fd):
            if fault=='reopen-inode':return os.dup(foreign_fd)
            opened=open_file(path,os.O_RDONLY if fault=='reopen-access' else flags,*args,**kwargs)
            if fault=='original-fd':duplicate(foreign_fd,raw_fd)
            return opened
        return open_file(path,flags,*args,**kwargs)
    os.open=reopen
    rebind_calls=[]
    def rebind(source,target,**keywords):
        rebind_calls.append((source,target))
        return duplicate(foreign_fd if fault=='rebind-inode' else source,target,**keywords)
    os.dup2=rebind
    before=set(os.listdir('/proc/self/fd'))
    try:p.reopen_confined_raw(raw_fd,original)
    except p.raw.PreparationRefusal as failure:
        if fault in ('reopen-inode','reopen-access'):assert not rebind_calls,'unqualified raw descriptor rebound'
        assert str(failure)==('guest-raw-rebind-changed' if fault=='rebind-inode' else 'guest-raw-reopen-changed'),failure
    else:raise AssertionError('unsafe raw reopen accepted '+fault)
    assert set(os.listdir('/proc/self/fd'))==before,'temporary reopen FD leaked on refusal'
    for descriptor in (raw_fd,foreign_fd):os.close(descriptor)
print('verified raw reopen boundary '+fault)
`;

for (const fault of ['reopen-inode', 'reopen-access', 'original-fd', 'rebind-inode']) {
  test(`guest fdset guard ${fault} rejects a substituted raw description`, () => {
    const category =
      fault === 'rebind-inode' ? 'guest-raw-rebind-changed' : 'guest-raw-reopen-changed';
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', rawReopenBoundary, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const changed = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(rawReopenBoundary, 'reopen_confined_raw', category, 0),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(changed.exitCode).not.toBe(0);
    expect(Bun.stripANSI(changed.stderr.toString())).toContain(
      fault === 'reopen-inode' || fault === 'reopen-access'
        ? 'unqualified raw descriptor rebound'
        : 'unsafe raw reopen accepted ' + fault,
    );
  });
}

const confinedPath = workerLifecycle
  .replace(
    'p.drain_qemu=harmless',
    String.raw`p.drain_qemu=harmless
confine=p.confine_qemu
def replace_before_confine(*descriptors):
    os.rename(state+'/disk.raw',state+'/disk.raw.retained')
    replacement=os.open(state+'/disk.raw',os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
    os.posix_fallocate(replacement,0,8192);os.write(replacement,b'\0'*8192);os.fsync(replacement);os.close(replacement)
    confine(*descriptors)
p.confine_qemu=replace_before_confine`,
  )
  .replace(
    "expected={'descriptor'",
    "expected={'confined-path':'raw-protocol-incomplete','descriptor'",
  )
  .replace(
    "assert failure['category']==expected[fault],(fault,failure)",
    "assert failure['category'] in (expected[fault],'guest-raw-changed'),(fault,failure)",
  )
  .replace(
    "print('verified guest lifecycle '+fault)",
    "    assert open(state+'/disk.raw.retained','rb').read(11)==b'\\0'*11,'QEMU wrote after canonical raw path replacement'\nprint('verified guest lifecycle '+fault)",
  );

test('guest fdset caller revalidates canonical raw path after confinement', () => {
  const ordinary = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', confinedPath, helper, 'confined-path'],
    { timeout: 10000, maxBuffer: 65536 },
  );
  expect(ordinary.stderr.toString()).toBe('');
  expect(ordinary.exitCode).toBe(0);
  const changed = confinedPath.replaceAll(
    'spec.loader.exec_module(p)',
    `spec.loader.exec_module(p)
import ast,inspect
_worker=ast.parse(inspect.getsource(p.worker))
_preparations=[node for node in ast.walk(_worker) if isinstance(node,ast.FunctionDef) and node.name=='prepare']
assert len(_preparations)==1
_preparation=_preparations[0]
def named_call(statement,name):
    return isinstance(statement,ast.Expr) and isinstance(statement.value,ast.Call) and isinstance(statement.value.func,ast.Name) and statement.value.func.id==name
_sites=[index for index,statement in enumerate(_preparation.body) if index>0 and named_call(statement,'check_original_raw') and named_call(_preparation.body[index-1],'confine_qemu')]
assert len(_sites)==1,'expected exactly one canonical raw check immediately after confinement'
del _preparation.body[_sites[0]]
exec(compile(ast.fix_missing_locations(_worker),spec.origin,'exec'),p.__dict__)`,
  );
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, 'confined-path'],
    { timeout: 10000, maxBuffer: 65536 },
  );
  expect(invocation.exitCode).not.toBe(0);
  expect(Bun.stripANSI(invocation.stderr.toString())).toContain(
    'QEMU wrote after canonical raw path replacement',
  );
});

const geometryPolicy = String.raw`
import importlib.util,os,struct,sys
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
# Execute the production cBPF bytes against adversarial seccomp_data, not a duplicate policy.
def evaluate(number,arguments=(),architecture=0xc000003e):
    packet=struct.pack('<IIQ6Q',number,architecture,0,*(list(arguments)+[0]*(6-len(arguments))))
    accumulator=0;index=0
    instructions=p.geometry_filter()
    while index<len(instructions):
        code,yes,no,operand=instructions[index];index+=1
        if code==0x20:accumulator=struct.unpack_from('<I',packet,operand)[0]
        elif code==0x54:accumulator &= operand
        elif code==0x15:index += yes if accumulator==operand else no
        elif code==0x35:index += yes if accumulator>=operand else no
        elif code==0x06:return operand
        else:raise AssertionError(('unknown BPF instruction',code))
    raise AssertionError('filter fell through')
assert evaluate(18)==0x7fff0000,'ordinary pwrite denied'
assert evaluate(285,(3,0,0,4096))==0x50000|95,'fallocate allowed'
for number in (41,42,43,44,45,46,47,53,76,77,90,91,92,93,94,101,188,189,190,197,198,199,206,207,208,209,210,260,268,288,299,307,311,326,333,425,426,427,438,440,448,452,463,466,469):
    assert evaluate(number)==0x50001,('mutation/import allowed',number)
assert evaluate(28,(0,4096,9))==0x50001,'MADV_REMOVE allowed'
assert evaluate(28,(0,4096,4))==0x7fff0000,'ordinary anonymous advice denied'
assert evaluate(28,(0,4096,2**32+9))==0x50001,'truncated advice allowed'
for command in (0xae00,0x4008ae01,2**32+0xae00):
    assert evaluate(16,(3,command))==0x7fff0000,'KVM type denied'
for command in (0x40305829,0x40049409,0x40086602,0x1234):
    assert evaluate(16,(3,command))==0x50019,'filesystem ioctl allowed'
for number,architecture in ((18,0x40000003),(0x40000012,0xc000003e),(512,0xc000003e)):
    assert evaluate(number,architecture=architecture)==0x80000000,'unsupported ABI allowed'
print('verified fixed geometry filter')
`;

test('guest geometry policy closes alternate mutation and ABI dispatch paths', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', geometryPolicy, helper], {
    timeout: 10000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified fixed geometry filter\n');
});

const geometryAdmission = String.raw`
import ctypes,importlib.util,os,struct,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2]
if fault=='architecture':p.os.uname=lambda:types.SimpleNamespace(machine='arm64')
# Keep ctypes' own structure layout real while changing the provider's ABI observation.
p.ctypes=types.SimpleNamespace(**vars(p.ctypes))
original_sizeof=p.ctypes.sizeof
if fault=='word-size':p.ctypes.sizeof=lambda kind:4 if kind is p.ctypes.c_long else original_sizeof(kind)
class Native:
    def fstatfs(self,descriptor,pointer):
        fields=ctypes.cast(pointer,ctypes.POINTER(ctypes.c_long))
        fields[0]=0x9123683e if fault=='filesystem' else 0xef53
        fields[1]=512 if fault=='block-size' else 4096
        return -1 if fault=='statfs-failure' else 0
p.ctypes.CDLL=lambda *args,**kwargs:Native()
opened=types.SimpleNamespace(st_dev=os.makedev(8,1),st_ino=2,st_uid=os.geteuid(),st_mode=0o100600,st_nlink=1,st_size=4096,st_blocks=8,st_mtime_ns=1,st_ctime_ns=1)
reads=0
def snapshot(descriptor):
    global reads
    reads+=1
    return types.SimpleNamespace(**dict(vars(opened),st_blocks=16)) if fault=='allocation-change' and reads>1 else opened
p.os.fstat=snapshot
p.os.lstat=lambda path:types.SimpleNamespace(**dict(vars(opened),st_ino=3)) if fault=='raw-replace' else opened
mount='1 0 8:1 / / rw,noatime - ext4 /dev/test rw,errors=remount-ro\n'
if fault=='mount-type':mount=mount.replace('ext4','ext3')
if fault=='mount-options':mount=mount.replace('rw,noatime','rw,relatime')
if fault=='mount-duplicate':mount+=mount
if fault=='mount-missing':mount=''
def read_mount(path,limit):
    if fault=='mount-unreadable':raise PermissionError('controlled unreadable mountinfo')
    if fault=='mount-absent':raise FileNotFoundError('controlled absent mountinfo')
    return mount
p.raw.read_text=read_mount
flags=0x80000 | (0x100000 if fault=='inode-feature' else 0)
def ioctl(descriptor,command,packet,mutate):
    if fault=='inode-unreadable':raise PermissionError('controlled unreadable inode flags')
    assert command==0x80086601
    struct.pack_into('=Q',packet,0,flags)
p.fcntl.ioctl=ioctl
calls=[]
def inspect(path,length,**options):
    calls.append(path)
    assert options=={'require_initialized':True},'uninitialized inspection selected'
    if fault=='unwritten':raise RuntimeError('controlled uninitialized map')
    return {'coverageBytes':4096}
p.raw.load_inspector=lambda:types.SimpleNamespace(inspect_file=inspect)
try:
    projection=p.check_raw_geometry(17,'/controlled')
except (p.raw.PreparationRefusal,RuntimeError,OSError):
    assert fault!='valid','qualified initialized filesystem refused'
    if fault not in ('unwritten','raw-replace','allocation-change'):assert not calls,'unqualified filesystem reached inspector'
else:
    assert fault=='valid','unqualified raw geometry admitted '+fault
    assert projection=={'coverageBytes':4096}
print('verified geometry admission '+fault)
`;

for (const fault of [
  'valid',
  'filesystem',
  'block-size',
  'statfs-failure',
  'mount-type',
  'mount-options',
  'mount-duplicate',
  'mount-missing',
  'inode-feature',
  'unwritten',
  'architecture',
  'word-size',
  'raw-replace',
  'allocation-change',
  'mount-unreadable',
  'mount-absent',
  'inode-unreadable',
]) {
  test(`guest geometry admission ${fault} protects the QEMU input boundary`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', geometryAdmission, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified geometry admission ${fault}\n`);
  });
}

const geometryCaller = String.raw`
import ast,importlib.util,inspect,os,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2];calls=[]
worker=ast.parse(inspect.getsource(p.worker))
preparations=[node for node in ast.walk(worker) if isinstance(node,ast.FunctionDef) and node.name=='prepare']
assert len(preparations)==1
prepared=preparations[0]
# The original worker's preexec body is executed, not copied or matched as source text.
scope=dict(p.__dict__,descriptors={'raw':17,'qemu':18,'kvm':19,'null':20},predecessor={'raw':'/controlled','rawIdentity':[]},binding={},request={'kvm':{}},staging_fd=21,directory_fd=22)
for name in ('check_original_raw','check_input_descriptors','check_kvm'):
    scope[name]=lambda *args:None
scope['os']=types.SimpleNamespace(close=lambda descriptor:None)
def admit(*arguments):
    calls.append('admit')
    if fault=='admission':raise p.raw.PreparationRefusal('controlled admission refusal')
def confine(*arguments):calls.append('landlock')
def install():
    calls.append('filter')
    if fault=='installation':raise p.raw.PreparationRefusal('controlled installation refusal')
scope.update(check_raw_geometry=admit,confine_qemu=confine,install_geometry_filter=install)
exec(compile(ast.fix_missing_locations(ast.Module(body=[prepared],type_ignores=[])),spec.origin,'exec'),scope)
try:scope['prepare']()
except p.raw.PreparationRefusal:assert fault!='valid'
else:
    assert fault=='valid','untrusted exec reached after '+fault+' refusal'
    assert calls==['admit','landlock','filter'],'unqualified QEMU exec reached'
print('verified geometry caller '+fault)
`;
for (const fault of ['valid', 'admission', 'installation']) {
  test(`guest geometry caller ${fault} gates the original preexec body`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', geometryCaller, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
  });
}

for (const fault of [
  'architecture',
  'range',
  'ioctl',
  28,
  285,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  53,
  76,
  77,
  90,
  91,
  92,
  93,
  94,
  101,
  188,
  189,
  190,
  197,
  198,
  199,
  206,
  207,
  208,
  209,
  210,
  260,
  268,
  288,
  299,
  307,
  311,
  326,
  333,
  425,
  426,
  427,
  438,
  440,
  448,
  452,
  463,
  466,
  469,
]) {
  test(`guest geometry filter fault ${String(fault)} exposes unsafe syscall admission`, () => {
    const changed = geometryPolicy.replace(
      'complete_provider_import(fixture_import_descriptors)',
      String.raw`complete_provider_import(fixture_import_descriptors)
_original_filter=p.geometry_filter
_fault=${JSON.stringify(fault)}
def altered_filter():
    instructions=list(_original_filter())
    if _fault=='architecture':instructions[1]=(0x15,1,1,0xc000003e)
    elif _fault=='range':instructions[4]=(0x35,0,1,0xffffffff)
    elif _fault=='ioctl':
        position=instructions.index((6,0,0,0x50019));instructions[position]=(6,0,0,0x7fff0000)
    else:
        sites=[index for index,instruction in enumerate(instructions) if instruction[0]==0x15 and instruction[3]==_fault]
        assert len(sites)==1
        position=sites[0];del instructions[position:position+1+instructions[position][2]]
    return tuple(instructions)
p.geometry_filter=altered_filter`,
    );
    const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', changed, helper], {
      timeout: 10000,
      maxBuffer: 65536,
    });
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toMatch(/AssertionError:.*allowed/u);
  });
}

const geometryInstallation = String.raw`
import importlib.util,os,sys,types
${providerStartup}
spec=importlib.util.spec_from_file_location('guest',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
fault=sys.argv[2]
p.os.uname=lambda:types.SimpleNamespace(machine='arm64' if fault=='architecture' else 'x86_64',release='unknown' if fault=='kernel' else '7.0.11-76070011-generic')
# Keep ctypes' own structure layout real while changing the provider's ABI observation.
p.ctypes=types.SimpleNamespace(**vars(p.ctypes))
original_sizeof=p.ctypes.sizeof
if fault=='word-size':p.ctypes.sizeof=lambda kind:4 if kind is p.ctypes.c_long else original_sizeof(kind)
class Native:
    def prctl(self,operation,*arguments):return -1 if (operation==38 and fault=='no-new-privileges') or (operation==22 and fault=='installation') else 0
p.ctypes.CDLL=lambda *args,**kwargs:Native()
try:p.install_geometry_filter()
except p.raw.PreparationRefusal:pass
else:raise AssertionError('unconfined exec admitted '+fault)
print('verified geometry installation '+fault)
`;
for (const [fault, category, ordinal] of [
  ['architecture', 'guest-geometry-unsupported', 0],
  ['kernel', 'guest-geometry-unsupported', 0],
  ['word-size', 'guest-geometry-unsupported', 0],
  ['no-new-privileges', 'guest-geometry-install', 0],
  ['installation', 'guest-geometry-install', 1],
] as const) {
  test(`guest geometry installation ${fault} refuses before exec and catches guard removal`, () => {
    const ordinary = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', geometryInstallation, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(ordinary.stderr.toString()).toBe('');
    expect(ordinary.exitCode).toBe(0);
    const changed = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(geometryInstallation, 'install_geometry_filter', category, ordinal),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(changed.exitCode).not.toBe(0);
    expect(Bun.stripANSI(changed.stderr.toString())).toContain('unconfined exec admitted ' + fault);
  });
}

for (const [fault, category] of [
  ['architecture', 'guest-geometry-unsupported'],
  ['word-size', 'guest-geometry-unsupported'],
  ['raw-replace', 'guest-geometry-changed'],
  ['allocation-change', 'guest-geometry-changed'],
  ['filesystem', 'guest-geometry-filesystem'],
  ['block-size', 'guest-geometry-filesystem'],
  ['statfs-failure', 'guest-geometry-statfs'],
  ['mount-type', 'guest-geometry-mount'],
  ['mount-options', 'guest-geometry-mount'],
  ['mount-duplicate', 'guest-geometry-mount'],
  ['mount-missing', 'guest-geometry-mount'],
  ['inode-feature', 'guest-geometry-inode'],
] as const) {
  test(`guest geometry admission fault ${fault} exposes unsafe validator acceptance`, () => {
    const invocation = Bun.spawnSync(
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        '-c',
        bypassSelectedGuard(geometryAdmission, 'check_raw_geometry', category, 0),
        helper,
        fault,
      ],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(
      'unqualified raw geometry admitted ' + fault,
    );
  });
}

for (const [fault, call] of [
  ['admission', 'check_raw_geometry'],
  ['installation', 'install_geometry_filter'],
] as const) {
  test(`guest geometry caller fault ${fault} exposes completion of unqualified preexec`, () => {
    const changed = geometryCaller.replace(
      'prepared=preparations[0]',
      String.raw`prepared=preparations[0]
_sites=[index for index,statement in enumerate(prepared.body) if isinstance(statement,ast.Expr) and isinstance(statement.value,ast.Call) and isinstance(statement.value.func,ast.Name) and statement.value.func.id==${JSON.stringify(call)}]
assert len(_sites)==1
prepared.body.pop(_sites[0])`,
    );
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', changed, helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.exitCode).not.toBe(0);
    expect(Bun.stripANSI(invocation.stderr.toString())).toContain(
      'untrusted exec reached after ' + fault + ' refusal',
    );
  });
}
