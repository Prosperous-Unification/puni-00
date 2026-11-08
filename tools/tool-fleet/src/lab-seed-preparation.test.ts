import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { providerStartup } from './lab-provider-startup.test-fixture';

const helper = join(import.meta.dir, 'lab-seed-preparation.py');
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

const controls = String.raw`
import hashlib,importlib.util,json,os,stat,sys,tempfile
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
case=sys.argv[2]
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('seed accepted unsafe '+case)
if case=='capacity':
    p.check_capacity(4160749568,50*1024**3,8*1024**3,True,False)
    p.check_capacity(2147483648,40*1024**3,10*1024**3-160*1024**2,False,True)
    for memory,free,allocated,initial,after,category in [(4160749567,50*1024**3,0,True,False,'seed-memory-floor'),(2147483647,40*1024**3,0,False,False,'seed-memory-floor'),(4160749568,50*1024**3-1,0,True,False,'seed-disk-floor'),(2147483648,40*1024**3-1,0,False,True,'seed-disk-floor'),(4160749568,50*1024**3,10*1024**3-240*1024**2+1,True,False,'seed-staging-bound'),(None,50*1024**3,0,True,False,'seed-capacity-malformed')]:
        refused(lambda:p.check_capacity(memory,free,allocated,initial,after),category)
elif case=='listing':
    expected={'user-data':{'bytes':3},'meta-data':{'bytes':4},'network-config':{'bytes':5},'docker-ce.deb':{'bytes':6},'docker-ce-cli.deb':{'bytes':7},'containerd.io.deb':{'bytes':8}}
    def listing():
        return '\nDirectory listing of /\ndr-xr-xr-x   2    0    0            2048 Nov  4 2026 [     28 02]  . \ndr-xr-xr-x   2    0    0            2048 Nov  4 2026 [     28 02]  .. \n'+''.join('-r--r--r--   1    0    0              '+str(entry['bytes'])+' Nov  4 2026 [     '+str(31+offset)+' 00]  '+name+' \n' for offset,(name,entry) in enumerate(expected.items()))
    p.check_listing(listing(),expected,'rock-ridge',128)
    for content in [listing().replace('  user-data ','  user-data  '),listing().replace('  user-data ','  user-data/foreign '),listing().replace('-r--r--r--','lr--r--r--',1),listing().replace('[     32 00]','[     31 00]'),listing()+listing().splitlines()[-1]+'\n',listing().replace('              3 Nov','              9 Nov'),listing().replace('Directory listing of /','Directory listing of /foreign'),listing().replace('-r--r--r--','-r-xr-xr-x',1),listing().replace('-r--r--r--   1','-r--r--r--   2',1),listing().replace('[     31 00]','[    999 00]')]:
        refused(lambda:p.check_listing(content,expected,'rock-ridge',128),'seed-iso-namespace')
    overlap={name:dict(entry) for name,entry in expected.items()};overlap['user-data']['bytes']=4096
    refused(lambda:p.check_listing(listing().replace('              3 Nov','              4096 Nov'),overlap,'rock-ridge',128),'seed-iso-namespace')
elif case=='stream':
    with tempfile.TemporaryDirectory() as directory:
        path=directory+'/seed.iso';descriptor=os.open(path,os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        before=p.raw.identity(os.fstat(descriptor))
        command=['/usr/bin/python3','-I','-B','-c','import os;os.write(1,b"selected")']
        assert p.stream_command(command,(),{},8,lambda chunk:None,lambda:None)==hashlib.sha256(b'selected').hexdigest()
        refused(lambda:p.stream_command(command,(),{},7,lambda chunk:None,lambda:None),'seed-stream-bound')
        refused(lambda:p.stream_command(command,(),{},9,lambda chunk:None,lambda:None,exact=True),'seed-stream-length')
        refused(lambda:p.stream_command(['/usr/bin/python3','-I','-B','-c','raise SystemExit(1)'],(),{},8,lambda chunk:None,lambda:None),'seed-child-failed')
        refused(lambda:p.stream_command(['/usr/bin/python3','-I','-B','-c','import time;time.sleep(2)'],(),{},8,lambda chunk:None,lambda:None,seconds=.05),'seed-child-timeout')
        p.write_iso(descriptor,path,before,b'owned',0)
        original=os.pwrite;os.pwrite=lambda *args:1
        refused(lambda:p.write_iso(descriptor,path,before,b'owned',5),'seed-short-write')
        os.pwrite=original
        os.rename(path,path+'.retained');open(path,'wb').close();os.chmod(path,0o600)
        refused(lambda:p.write_iso(descriptor,path,before,b'foreign',5),'seed-iso-changed')
        assert os.fstat(descriptor).st_size==5 and os.path.getsize(path)==0
        os.close(descriptor)
print('verified seed '+case)
`;

for (const boundary of ['capacity', 'listing', 'stream']) {
  test(`seed builder ${boundary} refuses changed production inputs`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', controls, helper, boundary],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed ${boundary}\n`);
  });
}

const admission = String.raw`
import copy,hashlib,importlib.util,json,os,sys,tempfile
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
case=sys.argv[2]
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('unsafe admission accepted '+case)
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700)
    os.makedirs(state+'/inputs',mode=0o700)
    pins=[];members={}
    for name in ['user-data','meta-data','network-config','docker-ce.deb','docker-ce-cli.deb','containerd.io.deb']:
        path=state+'/inputs/'+name;payload=('selected '+name).encode();open(path,'wb').write(payload);os.chmod(path,0o400)
        pin={'path':path,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'uid':os.geteuid(),'mode':0o400};pins.append(pin)
        members[name]={'path':path,'sha256':pin['sha256'],'bytes':len(payload)}
    report=state+'/dependency.json';raw_receipt=state+'/raw-receipt.json'
    for path in [report,raw_receipt]:
        open(path,'wb').write(b'{}');os.chmod(path,0o400);pins.append({'path':path,'sha256':hashlib.sha256(b'{}').hexdigest(),'bytes':2,'uid':os.geteuid(),'mode':0o400})
    request={'schemaVersion':1,'root':root,'state':state,'nonce':'a'*32,'pins':pins,'members':members,'image':members['user-data']['path'],'dependencyReport':report,'rawReceipt':raw_receipt,'rawRequest':raw_receipt,'rawProvenance':raw_receipt,'provenance':[report,raw_receipt]}
    if case=='request':
        p.check_request(request)
        for fault in ['foreign','alias','traversal','size','hash','profile','bool','unpinned','provenance']:
            changed=copy.deepcopy(request)
            if fault=='foreign':changed['foreign']=True
            if fault=='alias':changed['members']['foreign']=changed['members'].pop('user-data')
            if fault=='traversal':changed['members']['user-data']['path']=state+'/inputs/../foreign'
            if fault=='size':changed['members']['user-data']['bytes']=64*1024**2;changed['pins'][0]['bytes']=64*1024**2
            if fault=='hash':changed['members']['user-data']['sha256']='foreign'
            if fault=='profile':changed['memoryMax']=1
            if fault=='bool':changed['members']['user-data']['bytes']=True
            if fault=='unpinned':changed['pins'].pop(0)
            if fault=='provenance':changed['provenance']=[]
            refused(lambda:p.check_request(changed),'seed-request-invalid')
    elif case=='profile':
        arguments=p.service_arguments(request,'/reviewed/request','b'*64)
        for value in ['MemoryMax=268435456','MemorySwapMax=0','CPUQuota=100%','CPUQuotaPeriodSec=100ms','TasksMax=64','RuntimeMaxSec=60s','TimeoutStopSec=5s','LimitAS=1073741824','LimitFSIZE=83886080','LimitNOFILE=64','LimitCORE=0','Restart=no']:
            assert '--property='+value in arguments,value
        caps={'memory.max':'268435456','memory.swap.max':'0','pids.max':'64','cpu.max':'100000 100000'}
        p.check_caps(caps)
        for name in caps:
            changed=dict(caps);changed[name]='max';refused(lambda:p.check_caps(changed),'seed-native-caps')
    elif case=='member-fds':
        altered=copy.deepcopy(request);altered['members']['user-data']['sha256']='f'*64
        refused(lambda:p.open_members(altered),'seed-input-changed')
        opened=p.open_members(request)
        try:
            p.check_members(opened)
            path=members['user-data']['path'];os.rename(path,path+'.retained');open(path,'wb').write(b'changed');os.chmod(path,0o400)
            refused(lambda:p.check_members(opened),'seed-input-changed')
        finally:
            for member in opened.values():os.close(member['fd'])
        os.unlink(members['user-data']['path'])
        refused(lambda:p.open_members(request),'seed-input-absent')
        os.rename(members['user-data']['path']+'.retained',members['user-data']['path']);os.chmod(members['user-data']['path'],0)
        refused(lambda:p.open_members(request),'seed-input-unreadable')
print('verified seed '+case)
`;
for (const boundary of ['request', 'profile', 'member-fds']) {
  test(`seed builder ${boundary} binds original finite inputs`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', admission, helper, boundary],
      {
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed ${boundary}\n`);
  });
}

const records = String.raw`
import copy,hashlib,importlib.util,json,os,sys,tempfile,time
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
case=sys.argv[2]
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('unsafe record accepted '+case)
if case=='counter':
    now=time.time_ns();binding={'pid':os.getpid(),'start':p.raw.process_start(os.getpid())}
    counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
    record={'binding':binding,'startedNs':now-12000000000,'finishedNs':now,'caps':dict(p.CAPS),'counters':counters,'generated':True,'verified':True}
    p.check_counter(record,binding,now-20000000000,now)
    for fault in ['old','future','pid','missing','oom','caps','generated','verified']:
        changed=copy.deepcopy(record)
        if fault=='old':changed['finishedNs']=now-11000000000
        if fault=='future':changed['finishedNs']=now+1
        if fault=='pid':changed['binding']['start']='foreign'
        if fault=='missing':del changed['counters']['memory.peak']
        if fault=='oom':changed['counters']['memory.events']='oom 1\noom_kill 0'
        if fault=='caps':changed['caps']['pids.max']='max'
        if fault in ('generated','verified'):changed[fault]=False
        refused(lambda:p.check_counter(changed,binding,now-20000000000,now),'raw-counter-invalid')
elif case=='creator':
    with tempfile.TemporaryDirectory() as directory:
        descriptor=os.open(directory+'/seed.iso',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600);directory_fd=p.raw.open_private(directory,directory=True)
        binding={'pid':os.getpid(),'start':p.raw.process_start(os.getpid()),'creator':p.raw.identity(os.fstat(directory_fd)),'iso':p.raw.identity(os.fstat(descriptor)),'isoFd':descriptor}
        p.check_creator(binding,directory,directory_fd)
        changed=dict(binding,start='foreign');refused(lambda:p.check_creator(changed,directory,directory_fd),'seed-creator-invalid')
        os.rename(directory+'/seed.iso',directory+'/retained.iso');replacement=os.open(directory+'/seed.iso',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        refused(lambda:p.check_creator(binding,directory,directory_fd),'seed-creator-invalid')
        for opened in [descriptor,directory_fd,replacement]:os.close(opened)
elif case=='dependency':
    with tempfile.TemporaryDirectory() as directory:
        members={};pins=[]
        for alias,package,version in [('docker-ce.deb','docker-ce','5:29.7.2-1~ubuntu.24.04~noble'),('docker-ce-cli.deb','docker-ce-cli','5:29.7.2-1~ubuntu.24.04~noble'),('containerd.io.deb','containerd.io','2.3.4-1~ubuntu.24.04~noble')]:
            path=directory+'/'+alias;members[alias]={'path':path,'sha256':'a'*64,'bytes':1};pins.append({'path':path,'sha256':'a'*64,'bytes':1})
        image=directory+'/source.img';pins.append({'path':image,'sha256':'b'*64,'bytes':2})
        tool_paths=['/usr/bin/python3.12','/usr/bin/dpkg-deb','/usr/lib/python3/dist-packages/apt_pkg.cpython-312-x86_64-linux-gnu.so']
        for path in tool_paths:pins.append({'path':path,'sha256':'d'*64,'bytes':1})
        request={'members':members,'image':image,'pins':pins}
        report={'schemaVersion':1,'artifactDependencyClosureVerified':True,'guestConfiguredInstallationVerified':False,'runtimeAuthority':False,'imageSha256':'b'*64,'requiredEdgeCount':10,'matchedEdgeCount':10,'unresolved':[],'receiptSignaturesReplayed':False,'selectedArtifacts':[{'alias':alias,'package':package,'version':version,'architecture':'amd64','sha256':'a'*64,'bytes':1} for alias,package,version in [('docker-ce.deb','docker-ce','5:29.7.2-1~ubuntu.24.04~noble'),('docker-ce-cli.deb','docker-ce-cli','5:29.7.2-1~ubuntu.24.04~noble'),('containerd.io.deb','containerd.io','2.3.4-1~ubuntu.24.04~noble')]],'inputBindings':[dict(pin,identity=[1,2,1000,256,pin['bytes'],1,3,4]) for pin in pins if pin['path'] not in tool_paths],'tools':[{'path':'/usr/bin/python3' if path=='/usr/bin/python3.12' else path,'resolved':path,'sha256':'d'*64,'bytes':1,'identity':[1,2,0,493,1,1,3,4]} for path in tool_paths],'edges':[{'status':'matched'}]*10}
        # Producer actual-report-final.json SHA2567c7c1db6749bb1cdff4da3e53883899f1c94465aba8ab49cc80e614ab65aef58 emits all five fields.
        report.update({'aptPkgVersion':'2.8.3','trustModel':'installed-host-and-operator-reviewed-retained-signatures',
            'limits':{'addressSpaceBytes':134217728,'cpuSeconds':20,'wallSeconds':60,'fileBytes':65536,'nofile':64,'coreBytes':0,'controlTarBytes':1048576,'controlBytes':65536,'childWallSeconds':10,'indexBytesEach':8388608},
            'limitations':['Retained independently reviewed signature receipts are consumed, not replayed.','Installed root-owned host tools are trusted independently of package provenance.','Only direct required edges of selected archives are checked.','Published image inventory is not actual configured package status.','Virtual Provides does not satisfy required edges.'],
            'conflictsAndBreaks':[{'package':package,'field':field,'name':name,'status':'absent'} for package,field,name in [('docker-ce','Conflicts','docker.io'),('docker-ce-cli','Conflicts','docker-cli'),('docker-ce-cli','Conflicts','docker.io'),('docker-ce-cli','Breaks','docker-ce'),('containerd.io','Conflicts','containerd'),('containerd.io','Conflicts','runc')]]})
        p.check_dependency(report,request)
        for field in ['aptPkgVersion','trustModel','limits','limitations','conflictsAndBreaks']:
            changed=copy.deepcopy(report);del changed[field]
            refused(lambda:p.check_dependency(changed,request),'seed-dependency-binding')
            changed=copy.deepcopy(report);changed[field]=None
            refused(lambda:p.check_dependency(changed,request),'seed-dependency-binding')
        changed=copy.deepcopy(report);changed['unknown']=True
        refused(lambda:p.check_dependency(changed,request),'seed-dependency-binding')
        for fault in ['apt-version','trust','limitations','limit-missing','limit-extra','limit-wrong','limit-bool','conflict','conflict-extra','conflict-missing','conflict-duplicate','conflict-field','conflict-name','conflict-type']:
            changed=copy.deepcopy(report)
            if fault=='apt-version':changed['aptPkgVersion']='2.8.3\nforeign'
            if fault=='trust':changed['trustModel']='unreviewed'
            if fault=='limitations':changed['limitations'][3]='configured package status verified'
            if fault=='limit-missing':del changed['limits']['wallSeconds']
            if fault=='limit-extra':changed['limits']['unbounded']=True
            if fault=='limit-wrong':changed['limits']['addressSpaceBytes']=268435456
            if fault=='limit-bool':changed['limits']['coreBytes']=False
            if fault=='conflict':changed['conflictsAndBreaks'][0]['status']='matched'
            if fault=='conflict-extra':changed['conflictsAndBreaks'][0]['matches']=[{'package':'docker.io','version':'1'}]
            if fault=='conflict-missing':changed['conflictsAndBreaks'].pop()
            if fault=='conflict-duplicate':changed['conflictsAndBreaks'][1]=changed['conflictsAndBreaks'][0]
            if fault=='conflict-field':changed['conflictsAndBreaks'][0]['field']='Depends'
            if fault=='conflict-name':changed['conflictsAndBreaks'][0]['name']='foreign'
            if fault=='conflict-type':changed['conflictsAndBreaks'][0]['package']=[]
            refused(lambda:p.check_dependency(changed,request),'seed-dependency-binding')
        for fault in ['closure','configured','runtime','image','count','bool','unresolved','hash','version','pin','duplicate','edge','tool']:
            changed=copy.deepcopy(report)
            if fault=='closure':changed['artifactDependencyClosureVerified']=False
            if fault=='configured':changed['guestConfiguredInstallationVerified']=True
            if fault=='runtime':changed['runtimeAuthority']=True
            if fault=='image':changed['imageSha256']='c'*64
            if fault=='count':changed['matchedEdgeCount']=9
            if fault=='bool':changed['requiredEdgeCount']=True
            if fault=='unresolved':changed['unresolved']=['unknown']
            if fault=='hash':changed['selectedArtifacts'][0]['sha256']='c'*64
            if fault=='version':changed['selectedArtifacts'][0]['version']='older'
            if fault=='pin':changed['inputBindings'][0]['path']='/foreign'
            if fault=='duplicate':changed['selectedArtifacts'][1]=changed['selectedArtifacts'][0]
            if fault=='edge':changed['edges'][0]['status']='unresolved'
            if fault=='tool':changed['tools']=[]
            refused(lambda:p.check_dependency(changed,request),'seed-dependency-binding')
print('verified seed '+case)
`;
for (const boundary of ['counter', 'creator', 'dependency']) {
  test(`seed builder ${boundary} refuses foreign acceptance`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', records, helper, boundary],
      {
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed ${boundary}\n`);
  });
}

const lifecycle = String.raw`
import hashlib,importlib.util,json,os,shutil,subprocess,sys,tempfile,types
${providerStartup}
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
fault=sys.argv[2]
child_source=r'''
import importlib.util,json,os,sys
${providerStartup}
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
request=json.loads(sys.argv[2]);fault=sys.argv[3]
calls=0
def verify(request):
    global calls
    calls+=1
    if fault=='staging' and calls==2:
        state=request['state'];os.rename(state,state+'.retained');os.mkdir(state,0o700)
        for name in os.listdir(state+'.retained'):os.rename(state+'.retained/'+name,state+'/'+name)
    return 'changed' if fault=='source' and calls==2 else 'c'*64
p.verify_inputs=verify;p.observe_capacity=lambda *args,**kwargs:{}
p.observe_active=lambda unit,pid:{'pid':pid,'start':p.raw.process_start(pid),'unit':unit,'invocation':'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}
os.environ['INVOCATION_ID']='foreign' if fault=='invocation' else 'e'*32
if fault=='descriptor':unexpected=os.open(request['members']['user-data']['path'],os.O_RDONLY)
if fault=='missing':
    original_receive=p.raw.receive_frame
    p.raw.receive_frame=lambda descriptor,seconds=10:original_receive(descriptor,.05)
original_send=p.raw.send_frame
def send(descriptor,frame):
    if fault=='foreign' and frame.get('phase')=='ready':frame['binding']['request']='foreign'
    if fault=='future' and frame.get('phase')=='ready':frame['observedNs']=__import__('time').time_ns()+10**9
    if fault=='duplicate' and frame.get('phase')=='ready':
        os.write(descriptor,p.raw.encode_json(frame)[:-1]+b',"phase":"ready"}\n');return
    original_send(descriptor,frame)
p.raw.send_frame=send
p.raw.read_caps=lambda cgroup:dict(p.CAPS)
counters={'memory.current':'1','memory.peak':'2','memory.events':'oom 0\noom_kill 0','cpu.stat':'usage_usec 2\nuser_usec 1\nsystem_usec 1','pids.current':'1','pids.events':'max 0'}
if fault=='oom':counters['memory.events']='oom 1\noom_kill 0';p.check_counter=lambda *args:None
original=p.raw.read_text
p.raw.read_text=lambda path,*args:counters[path.rsplit('/',1)[1]] if path.startswith('/sys/fs/cgroup/fixture/') else original(path,*args)
def fixture_generation(descriptor,path,original,members,tools,environment,monitor):
    payload=b'controlled external generation seam'
    p.write_iso(descriptor,path,original,payload,0);os.fsync(descriptor)
    artifact={'bytes':len(payload),'sha256':__import__('hashlib').sha256(payload).hexdigest(),'memberBytes':sum(member['bytes'] for member in members.values()),'members':{name:{'bytes':member['bytes'],'sha256':member['sha256']} for name,member in members.items()},'namespaces':['iso9660','joliet','rock-ridge']}
    if fault=='artifact':artifact['sha256']='f'*64
    if fault=='artifact-float':artifact['bytes']=float(artifact['bytes'])
    return artifact
p.generate_iso=fixture_generation
if fault=='short':os.pwrite=lambda *args:1
if fault=='sync':
    original_sync=os.fsync
    def sync(descriptor):
        import stat
        if stat.S_ISREG(os.fstat(descriptor).st_mode):raise OSError('fixture failed ISO fsync')
        original_sync(descriptor)
    os.fsync=sync
try:p.worker(request,'b'*64)
except BaseException:sys.exit(1)
sys.exit(1 if fault=='client' else 0)
'''
root=os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(sys.argv[1]))));tools=root+'/.puni/fleet-labs/observability-baseline/tools-root'
with tempfile.TemporaryDirectory() as state:
    os.makedirs(state+'/tools-root/usr/bin')
    for name,source in [('genisoimage','/usr/bin/true'),('isoinfo','/usr/bin/false')]:
        shutil.copyfile(source,state+'/tools-root/usr/bin/'+name);os.chmod(state+'/tools-root/usr/bin/'+name,0o500)
    members={};os.mkdir(state+'/inputs',0o700)
    for offset,name in enumerate(['user-data','meta-data','network-config','docker-ce.deb','docker-ce-cli.deb','containerd.io.deb']):
        path=state+'/inputs/'+name;payload=('fixture '+str(offset)+' '+name).encode();open(path,'wb').write(payload);os.chmod(path,0o400)
        members[name]={'path':path,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload)}
    request={'schemaVersion':1,'state':state,'nonce':'a'*32,'members':members,'dependencyReport':'reviewed-dependency','rawReceipt':'reviewed-raw'};children=[]
    p.verify_inputs=lambda request:'c'*64;p.observe_capacity=lambda *args,**kwargs:{}
    unit='puni-seed-'+request['nonce']+'.service'
    unloaded={'LoadState':'not-found','ActiveState':'inactive','SubState':'dead','MainPID':'0','InvocationID':'','ControlGroup':'','Result':'','ExecMainStatus':''}
    p.raw.observe_unit=lambda unit:dict(unloaded)
    p.raw.read_caps=lambda cgroup:dict(p.CAPS)
    p.observe_active=lambda unit,pid:{'pid':pid,'start':p.raw.process_start(pid),'unit':unit,'invocation':'e'*32,'cgroup':'/fixture','caps':dict(p.CAPS)}
    p.raw.group_events=lambda cgroup:None
    cleaned=[]
    def stop(binding):
        if fault=='cleanup':raise p.raw.PreparationRefusal('raw-cleanup-uncertain')
        cleaned.append(binding['invocation'])
    p.raw.stop_owned=stop
    def launch(request,path,digest):
        child=subprocess.Popen(['/usr/bin/python3','-I','-B','-c',child_source,sys.argv[1],json.dumps(request),fault],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        children.append(child);return child
    p.launch_service=launch
    original_send=p.raw.send_frame
    def send(descriptor,frame):
        if fault=='missing' and 'bindingDigest' in frame:return
        if fault=='durable' and 'durableDigest' in frame:frame['durableDigest']='foreign'
        original_send(descriptor,frame)
    p.raw.send_frame=send
    original_persist=p.raw.persist
    def locked_persist(directory,name,record,directory_fd=None):
        if name=='worker-counter.json':
            try:competing=p.raw.acquire_staging(state)
            except p.raw.PreparationRefusal as failure:assert str(failure)=='raw-staging-occupied'
            else:
                os.close(competing);raise AssertionError('seed released staging before durable ACK')
        return original_persist(directory,name,record,directory_fd)
    p.raw.persist=locked_persist
    if fault=='parent-sync':
        locked_publish=p.raw.persist
        def persist(directory,name,record,directory_fd=None):
            if name=='worker-counter.json':raise OSError('fixture parent fsync failed')
            return locked_publish(directory,name,record,directory_fd)
        p.raw.persist=persist
    try:
        receipt=p.coordinator(request,'/reviewed/request','b'*64)
        assert fault=='success',fault
        assert receipt['scope']=='seed-preparation' and receipt['accepted'] is True and receipt['guestAuthority'] is False
        assert len(cleaned)==1
        attempt=state+'/seed-'+request['nonce'];assert os.path.isfile(attempt+'/receipt.json')
        assert os.path.isfile(attempt+'/worker-counter.json') and os.path.isfile(attempt+'/iso.json')
    except (p.raw.PreparationRefusal,OSError):
        assert fault!='success'
        attempt=state+'/seed-'+request['nonce'];assert os.path.isfile(attempt+'/failure.json')
        assert not os.path.exists(attempt+'/receipt.json')
        failure=json.load(open(attempt+'/failure.json'))
        expected={'oom':'raw-counter-invalid','short':'raw-protocol-incomplete','sync':'raw-protocol-incomplete','parent-sync':'raw-interrupted','client':'raw-terminal-invalid','cleanup':'raw-cleanup-uncertain','source':'raw-protocol-incomplete','invocation':'raw-protocol-incomplete','descriptor':'raw-protocol-incomplete','missing':'raw-protocol-incomplete','foreign':'seed-ready-invalid','durable':'raw-terminal-invalid','artifact':'seed-artifact-binding','artifact-float':'seed-artifact-binding','duplicate':'seed-json-duplicate','future':'seed-ready-invalid','staging':'raw-protocol-incomplete'}
        assert failure['category']==expected[fault],failure
        if fault in ('source','descriptor','missing','foreign','duplicate','future','staging'):assert os.path.getsize(attempt+'/seed.iso')==0
        if fault=='invocation':assert not os.path.exists(attempt+'/seed.iso')
    finally:
        for child in children:
            if child.poll() is None:child.kill()
            child.wait(timeout=3)
        released=p.raw.acquire_staging(state);os.close(released)
print('verified seed lifecycle '+fault)
`;
for (const fault of [
  'success',
  'oom',
  'short',
  'sync',
  'parent-sync',
  'client',
  'cleanup',
  'source',
  'invocation',
  'descriptor',
  'missing',
  'foreign',
  'durable',
  'artifact',
  'artifact-float',
  'duplicate',
  'future',
  'staging',
]) {
  test(`seed lifecycle ${fault} preserves original pipes and durable acceptance`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', lifecycle, helper, fault],
      {
        timeout: 10000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed lifecycle ${fault}\n`);
  });
}

const nativeControls = String.raw`
import errno,hashlib,importlib.util,json,os,shutil,subprocess,sys,tempfile,time
${providerStartup}
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
complete_provider_import(fixture_import_descriptors)
${providerStat}
case=sys.argv[2]
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('unsafe native state accepted '+case)
if case=='native':
    unit='puni-seed-'+('a'*32)+'.service';pid=os.getpid();group='/fixture/'+unit
    observed={'LoadState':'loaded','ActiveState':'active','SubState':'running','MainPID':str(pid),'InvocationID':'b'*32,'ControlGroup':group,'Result':'success','ExecMainStatus':'0'}
    caps=dict(p.CAPS);limits=dict(p.SERVICE_LIMITS)
    p.raw.observe_unit=lambda unit:dict(observed);p.raw.process_cgroup=lambda pid:group;p.raw.read_caps=lambda group:dict(caps)
    def query(arguments,*args,**kwargs):
        assert arguments[:3]==['/usr/bin/systemctl','--user','show']
        return ''.join(name+'='+value+'\n' for name,value in limits.items()).encode()
    p.raw.run_bounded=query
    p.observe_active(unit,pid)
    for name in observed:
        if name in ('Result','ExecMainStatus'):continue
        previous=observed[name];observed[name]='foreign';refused(lambda:p.observe_active(unit,pid),'raw-unit-binding');observed[name]=previous
    for name in caps:
        previous=caps[name];caps[name]='max';refused(lambda:p.observe_active(unit,pid),'raw-native-caps');caps[name]=previous
    for name in limits:
        previous=limits[name];limits[name]='unknown';refused(lambda:p.observe_active(unit,pid),'raw-service-limits');limits[name]=previous
elif case=='sandbox':
    with tempfile.TemporaryDirectory() as directory:
        iso=os.open(directory+'/seed.iso',os.O_CREAT|os.O_EXCL|os.O_RDWR,0o600)
        for name,source in [('true','/usr/bin/true'),('false','/usr/bin/false'),('ungranted','/usr/bin/true')]:
            shutil.copyfile(source,directory+'/'+name);os.chmod(directory+'/'+name,0o500)
        anchors=[os.stat(directory+'/'+name) for name in ('true','false','ungranted')]
        assert len({(anchor.st_dev,anchor.st_ino) for anchor in anchors})==3,[(anchor.st_dev,anchor.st_ino,anchor.st_nlink) for anchor in anchors]
        first=os.open(directory+'/true',os.O_RDONLY);second=os.open(directory+'/false',os.O_RDONLY)
        foreign=directory+'/foreign';open(foreign,'w').write('retain')
        child=os.fork()
        if child==0:
            try:
                p.raw.confine_writer(iso,first,(second,))
                os.write(iso,b'owned')
                def execute(path,name):
                    read_fd,write_fd=os.pipe2(os.O_CLOEXEC)
                    process=os.fork()
                    if process==0:
                        os.close(read_fd)
                        try:os.execve(path,[name],{})
                        except OSError as failure:
                            os.write(write_fd,str(failure.errno).encode());os._exit(126)
                    os.close(write_fd)
                    try:failure=os.read(read_fd,128)
                    finally:os.close(read_fd)
                    _,status=os.waitpid(process,0)
                    return os.waitstatus_to_exitcode(status),failure
                for descriptor,name,exit_code in [(first,'true',0),(second,'false',1)]:
                    execution=execute('/proc/self/fd/'+str(descriptor),name)
                    assert execution==(exit_code,b''),('granted executable refused',name,execution)
                for path in [foreign,directory+'/unowned']:
                    try:os.open(path,os.O_CREAT|os.O_WRONLY,0o600)
                    except PermissionError:pass
                    else:raise AssertionError('foreign write allowed')
                # Proof: isolated raw copy without EXECUTE handling runs this ungranted true clone and fails here.
                # Omitting the second grant fails its positive above; the live producer source stays unchanged.
                execution=execute(directory+'/ungranted','true')
                assert execution==(126,str(errno.EACCES).encode()),('unrelated executable allowed',execution,[(anchor.st_dev,anchor.st_ino) for anchor in anchors])
                os._exit(0)
            except BaseException:
                import traceback;traceback.print_exc();os._exit(1)
        assert os.waitpid(child,0)[1]==0
        assert os.pread(iso,5,0)==b'owned'
        assert open(foreign).read()=='retain' and not os.path.exists(directory+'/unowned')
        for descriptor in [iso,first,second]:os.close(descriptor)
elif case=='original-inputs':
    with tempfile.TemporaryDirectory() as directory:
        members={};inputs={};descriptors=[];os.makedirs(directory+'/tools-root/usr/bin')
        for name in ['user-data','meta-data','network-config','docker-ce.deb','docker-ce-cli.deb','containerd.io.deb','genisoimage','isoinfo']:
            path=directory+('/tools-root/usr/bin/' if name in ('genisoimage','isoinfo') else '/')+name;open(path,'w').write('selected');os.chmod(path,0o400)
            descriptor=os.open(path,os.O_RDONLY);descriptors.append(descriptor)
            members[name]={'path':path};inputs[name]={'fd':descriptor,'identity':p.raw.stable_identity(os.fstat(descriptor))}
        request={'members':members,'state':directory}
        binding={'pid':os.getpid(),'python':p.raw.stable_identity(os.stat('/proc/self/exe')),'inputs':inputs}
        p.check_input_descriptors(binding,request)
        changed=dict(binding,python=list(binding['python']));changed['python'][1]+=1
        refused(lambda:p.check_input_descriptors(changed,request),'seed-python-binding')
        extra=os.open(directory+'/user-data',os.O_RDONLY);descriptors.append(extra)
        refused(lambda:p.require_descriptors({0,1,2,*descriptors[:-1]}),'seed-unexpected-fd')
        path=directory+'/user-data';os.chmod(path,0o600);writable=os.open(path,os.O_RDWR);descriptors.append(writable);os.chmod(path,0o400)
        inputs['user-data']={'fd':writable,'identity':p.raw.stable_identity(os.fstat(writable))}
        refused(lambda:p.check_input_descriptors(binding,request),'seed-input-writable')
        os.rename(path,path+'.retained');open(path,'w').write('selected');os.chmod(path,0o400)
        refused(lambda:p.check_input_descriptors(binding,request),'seed-input-changed')
        for descriptor in descriptors:os.close(descriptor)
print('verified seed '+case)
`;
for (const boundary of ['native', 'sandbox', 'original-inputs']) {
  test(`seed builder ${boundary} enforces actual native boundaries`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', nativeControls, helper, boundary],
      {
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed ${boundary}\n`);
  });
}

test('seed source CLI rejects malformed arguments and keeps private request paths out of diagnostics', async () => {
  const { prepareSeed, SeedPreparationRefusal } = await import('./lab-seed-preparation');
  expect(() => prepareSeed('', 'a'.repeat(64))).toThrow('invalid-arguments');
  expect(() => prepareSeed('/private/PRIVATE_SEED', 'wrong')).toThrow('invalid-arguments');
  try {
    prepareSeed('/private/PRIVATE_SEED', 'a'.repeat(64));
    throw new Error('absent seed request accepted');
  } catch (failure) {
    expect(failure).toBeInstanceOf(SeedPreparationRefusal);
    expect(String(failure)).not.toContain('PRIVATE_SEED');
  }
  const cli = join(import.meta.dir, 'lab-seed-preparation-cli.ts');
  const environment: typeof process.env = { ...process.env, FORCE_COLOR: '1', CI: 'true' };
  delete environment['NO_COLOR'];
  for (const arguments_ of [
    [],
    ['/private/PRIVATE_SEED', 'wrong'],
    ['/private/PRIVATE_SEED', 'a'.repeat(64), 'extra'],
  ]) {
    const invocation = Bun.spawnSync([process.execPath, cli, ...arguments_], {
      env: environment,
      timeout: 3000,
      maxBuffer: 65536,
    });
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toBe('seed preparation: invalid-arguments\n');
  }
});

const provenanceControls = String.raw`
import copy,hashlib,importlib.util,json,os,sys,tempfile,types
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
case=sys.argv[2]
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('unsafe provenance accepted '+case)
def pin(path,payload,mode=0o400):
    if os.path.exists(path):os.chmod(path,0o600)
    open(path,'wb').write(payload);os.chmod(path,mode)
    return {'path':path,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'uid':os.geteuid(),'mode':mode}
with tempfile.TemporaryDirectory() as root:
    state=root+'/.puni/fleet-labs/observability-baseline';os.makedirs(state,mode=0o700)
    if case=='raw-provenance':
        p.raw.RAW_BYTES=32;nonce='a'*32;directory=state+'/raw-'+nonce;os.mkdir(directory,0o700)
        path=directory+'/disk.raw';open(path,'wb').write(b'x'*32);os.chmod(path,0o600)
        image=state+'/image.img';request_path=state+'/original-request.json';receipt_path=directory+'/receipt.json';allocation_path=directory+'/allocation.json';history_path=state+'/historical-source.json'
        historical=[{'path':root+'/tools/tool-fleet/src/lab-raw-preparation.py','sha256':'a'*64,'bytes':50,'uid':os.geteuid(),'mode':0o644}]
        original={'pins':historical,'nonce':nonce,'image':image};original_pin=pin(request_path,json.dumps(original).encode())
        source=p.raw.digest_json({entry['path']:entry['sha256'] for entry in historical})
        receipt={'schemaVersion':1,'scope':'raw-preparation','accepted':True,'guestAuthority':False,'fullRehearsalAuthority':False,'rawBytes':32,'binding':{'nonce':nonce,'raw':p.raw.identity(os.lstat(path)),'source':source,'request':original_pin['sha256']},'sourceDigest':source,'requestDigest':original_pin['sha256']}
        receipt_pin=pin(receipt_path,json.dumps(receipt).encode())
        native={'identity':{'inode':str(os.lstat(path).st_ino)},'mapDigest':'c'*64,'coverageBytes':32}
        allocation_pin=pin(allocation_path,json.dumps({'after':native}).encode())
        history={'schemaVersion':1,'sourceRevision':'d'*40,'sourcePins':historical,'requestDigest':original_pin['sha256'],'receiptDigest':receipt_pin['sha256']}
        history_pin=pin(history_path,json.dumps(history).encode())
        request={'schemaVersion':1,'root':root,'state':state,'image':image,'rawReceipt':receipt_path,'rawRequest':request_path,'rawProvenance':history_path,'pins':[original_pin,receipt_pin,allocation_pin,history_pin]}
        p.raw.load_inspector=lambda:types.SimpleNamespace(inspect_file=lambda path,size:copy.deepcopy(native))
        accepted=p.verify_raw(request);assert accepted['sourceRevision']=='d'*40
        history_accepted=p.verify_raw_history(request);assert history_accepted['path']==path
        native['mapDigest']='f'*64
        assert p.verify_raw_history(request)==history_accepted
        refused(lambda:p.verify_raw(request),'seed-raw-changed')
        native['mapDigest']='c'*64
        for fault in ['source','request','allocation','receipt','history','path']:
            saved_receipt=copy.deepcopy(receipt);saved_history=copy.deepcopy(history);saved_native=copy.deepcopy(native)
            if fault=='source':receipt['sourceDigest']='f'*64
            if fault=='request':receipt['requestDigest']='f'*64
            if fault=='allocation':native['mapDigest']='f'*64
            if fault=='receipt':receipt['guestAuthority']=True
            if fault=='history':history['sourcePins'][0]['sha256']='f'*64
            if fault=='path':os.rename(path,path+'.retained');open(path,'wb').write(b'x'*32);os.chmod(path,0o600)
            request['pins'][1]=pin(receipt_path,json.dumps(receipt).encode());request['pins'][3]=pin(history_path,json.dumps(history).encode())
            refused(lambda:p.verify_raw(request),'seed-raw-provenance' if fault=='history' else ('seed-raw-changed' if fault=='allocation' else 'seed-raw-binding'))
            receipt=saved_receipt;history=saved_history;native=saved_native
            if fault=='path':os.unlink(path);os.rename(path+'.retained',path)
    elif case=='json':
        refused(lambda:p.decode_json(b'{"outer":{"name":1,"name":2}}'),'seed-json-duplicate')
        path=state+'/proof';selected=pin(path,b'{"selected":true}')
        request={'pins':[selected]};assert p.read_pinned_json(request,path)=={'selected':True}
        large=state+'/large';changed=pin(large,b' '*65534+b'{}');refused(lambda:p.read_pinned_json({'pins':[changed]},large),'seed-provenance-bound')
        refused(lambda:p.read_pinned_json({'pins':[]},path),'seed-provenance-bound')
        os.unlink(path)
        try:p.read_pinned_json(request,path)
        except FileNotFoundError:pass
        else:raise AssertionError('missing pinned receipt accepted')
        pin(path,b'{"selected":true}',mode=0)
        try:p.read_pinned_json(request,path)
        except PermissionError:pass
        else:raise AssertionError('unreadable pinned receipt accepted')
print('verified seed '+case)
`;
for (const boundary of ['raw-provenance', 'json']) {
  test(`seed builder ${boundary} preserves historical authority`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', provenanceControls, helper, boundary],
      {
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`verified seed ${boundary}\n`);
  });
}

const publicReceipt = String.raw`
import hashlib,importlib.util,os,sys,tempfile
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
with tempfile.TemporaryDirectory() as root:
    state=root+'/state';os.mkdir(state,0o700);path=state+'/cloud-image-signature.json';payload=b'{"selected":true}';open(path,'wb').write(payload);os.chmod(path,0o664)
    pin={'path':path,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'uid':os.geteuid(),'mode':0o664};request={'schemaVersion':1,'state':state,'pins':[pin]}
    p.verify_pin(request,pin)
    assert p.read_pinned_json(request,path)=={'selected':True}
    original_read=p.raw.read_fd
    def expose_parent(descriptor,*args):
        payload=original_read(descriptor,*args);os.chmod(state,0o755);return payload
    p.raw.read_fd=expose_parent
    try:p.read_pinned_json(request,path)
    except p.raw.PreparationRefusal as failure:assert str(failure)=='seed-provenance-root-changed'
    else:raise AssertionError('public receipt accepted after parent mode changed during read')
    p.raw.read_fd=original_read;os.chmod(state,0o700)
    os.chmod(state,0o755)
    try:p.verify_pin(request,pin)
    except p.raw.PreparationRefusal as failure:assert str(failure)=='raw-state-unsafe'
    else:raise AssertionError('public receipt accepted outside private parent')
    os.chmod(state,0o700)
    original=p.raw.verify_pin
    def replace(selected):
        original(selected);os.rename(state,state+'.retained');os.mkdir(state,0o700)
    p.raw.verify_pin=replace
    try:p.verify_pin(request,pin)
    except p.raw.PreparationRefusal as failure:assert str(failure)=='seed-provenance-root-changed'
    else:raise AssertionError('public receipt accepted after original parent replacement')
print('verified confined original public receipt')
`;
test('seed public signature receipt requires its original private parent', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', publicReceipt, helper], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified confined original public receipt\n');
});

const sourceControls = String.raw`
import importlib.util,os,sys,tempfile
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
root=str(p.HELPER.parents[3]);state='/reviewed/private/state'
def refused(operation,category):
    try:operation()
    except p.raw.PreparationRefusal as failure:assert str(failure)==category,str(failure)
    else:raise AssertionError('unsafe source accepted')
refused(lambda:p.verify_inputs({'schemaVersion':1,'root':'/foreign','state':state,'pins':[]}),'seed-source-binding')
refused(lambda:p.verify_inputs({'schemaVersion':1,'root':root,'state':state,'pins':[]}),'seed-source-pins-missing')
required=[str(p.HELPER),str(p.HELPER.with_suffix('.ts')),str(p.HELPER.with_name('lab-seed-preparation-cli.ts')),str(p.HELPER.with_name('lab-raw-preparation.py')),str(p.HELPER.with_name('lab-raw-allocation.py')),root+'/infra/local/qemu-lab.lock.json','/usr/bin/python3.12','/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',state+'/tools-root/usr/bin/genisoimage',state+'/tools-root/usr/bin/isoinfo']
request={'schemaVersion':1,'root':root,'state':state,'dependencyReport':'/reviewed/dependency','pins':[{'path':path,'sha256':'a'*64,'bytes':1,'uid':os.geteuid(),'mode':0o400} for path in required]}
p.os.path.realpath=lambda path:'/foreign'
refused(lambda:p.verify_inputs(request),'seed-python-binding')
p.os.path.realpath=lambda path:'/usr/bin/python3.12' if path=='/usr/bin/python3' else path
p.verify_pin=lambda request,pin:None
def proof(request,path):
    if path.endswith('qemu-lab.lock.json'):return {'qemu':{'isoToolVersionLine':'genisoimage 1.1.11 (Linux)'}}
    raise AssertionError('unsafe tool closure reached downstream dependency boundary')
p.read_pinned_json=proof
p.raw.run_bounded=lambda *args,**kwargs:b'foreign\n'
refused(lambda:p.verify_inputs(request),'seed-tool-version')
def query(arguments,*args,**kwargs):
    if arguments[0].endswith('genisoimage'):return b'genisoimage 1.1.11 (Linux)\n'
    if arguments[0].endswith('isoinfo'):return b'isoinfo 1.1.11 (Linux)\n'
    return b'libmissing => /foreign/libmissing.so (0x123)\n'
p.raw.run_bounded=query
refused(lambda:p.verify_inputs(request),'seed-tool-closure')
print('verified seed current-source and tool-closure refusal')
`;
test('seed source pins and locked tool closure refuse before service launch', () => {
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', sourceControls, helper], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe(
    'verified seed current-source and tool-closure refusal\n',
  );
});

test('seed capacity parser uses native available-memory fields and refuses unknown readings', () => {
  const script = String.raw`
import importlib.util,os,sys,tempfile,types
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
p.os.statvfs=lambda path:types.SimpleNamespace(f_bavail=50*1024**3//4096,f_frsize=4096)
with tempfile.TemporaryDirectory() as state:
    p.raw.read_text=lambda path:'MemAvailable: \t 4063232 \t kB\n'
    assert p.observe_capacity(state,initial=True)['availableMemoryBytes']==4160749568
    for reading in ['MemTotal: 4063232 kB\n','MemAvailable: unknown kB\n','MemAvailable: 4063232 kB\nMemAvailable: 4063232 kB\n']:
        p.raw.read_text=lambda path:reading
        try:p.observe_capacity(state,initial=True)
        except p.raw.PreparationRefusal as failure:assert str(failure)=='seed-capacity-malformed'
        else:raise AssertionError('unknown native memory admitted')
print('verified native seed capacity parser')
`;
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', script, helper], {
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified native seed capacity parser\n');
});

test('seed worker refuses nonpipe standard descriptors before staging admission', () => {
  const script = String.raw`
import importlib.util,sys,tempfile
spec=importlib.util.spec_from_file_location('seed',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
def producer(*args):raise AssertionError('nonpipe worker reached production')
p.produce_seed=producer
with tempfile.TemporaryDirectory() as state:
    try:p.worker({'state':state},'b'*64)
    except p.raw.PreparationRefusal as failure:assert str(failure)=='seed-worker-pipes'
    else:raise AssertionError('nonpipe worker descriptors accepted')
print('verified worker standard-pipe refusal')
`;
  const invocation = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-c', script, helper], {
    stdin: 'ignore',
    timeout: 5000,
    maxBuffer: 65536,
  });
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stdout.toString()).toBe('verified worker standard-pipe refusal\n');
});

for (const [label, script, fault] of [
  ['lifecycle', lifecycle, 'success'],
  ['original-inputs', nativeControls, 'original-inputs'],
] as const) {
  test(`logical seed ${label} works without host Python3.12`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', hidePython312(script), helper, fault],
      { timeout: 10000, maxBuffer: 65536 },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
  });
}
