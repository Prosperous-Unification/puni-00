import { expect, test } from 'bun:test';

import { AUTHORITY_FIXTURE_PROGRAM } from '../../test/installed-authority-fixture';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';

async function python(program: string) {
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-'], {
    stdin: new TextEncoder().encode(`${AUTHORITY_COLLECTOR}\n${program}`),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test('real collector parses the last stat parenthesis and exact v2 cgroup', async () => {
  const observed = await python(`
assert parse_stat(b'23 (argv ) with spaces) S 1 ' + b'0 ' * 17 + b'123 0')[0] == '123'
assert parse_cgroup(b'0::/user.slice/example\x2eservice\\n') == '/user.slice/example.service'
for broken in [b'0::/a\\n1:cpu:/b\\n', b'0::relative\\n', b'0::/a/../b\\n']:
    try: parse_cgroup(broken)
    except Refusal: pass
    else: raise AssertionError('accepted malformed cgroup')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real collector models only the exact no-crontab exit1 diagnostic', async () => {
  const observed = await python(`
assert read_crontab('root', lambda argv: (1,b'',b'no crontab for root\\n')) is None
assert read_crontab('puni1', lambda argv: (0,b'private secret\\n',b'')) == b'private secret\\n'
for code,out,err in [(1,b'',b'permission denied'), (0,b'',b'warning'),(2,b'',b'no crontab for root\\n')]:
    try: read_crontab('root', lambda argv: (code,out,err))
    except Refusal: pass
    else: raise AssertionError('accepted failed crontab')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
  expect(observed.stderr).not.toContain('private secret');
});

test('real collector refuses direct duplicate launch surfaces and preserves unrelated definitions', async () => {
  const observed = await python(`
paths=['/home/puni1/wbs-dev/bin/poll.sh','/home/puni1/wbs/bin/swap.js']
check_surface('unrelated','/usr/bin/true',paths,False)
check_surface('crontab:puni1','* * * * * /home/puni1/wbs-dev/bin/poll.sh',paths,True)
for source,text,allowed in [('root:other.service','/bin/sh -c /home/puni1/wbs/bin/swap.js',False),('crontab:puni1','* * * * * /home/puni1/wbs-dev/bin/poll.sh\\n* * * * * /home/puni1/wbs-dev/bin/poll.sh',True)]:
    try: check_surface(source,text,paths,allowed)
    except Refusal: pass
    else: raise AssertionError('accepted duplicate direct launch')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real collector rejects absent or changed database family identities', async () => {
  const observed = await python(`
assert callable(capture_database_family)
try: capture_database_family(Host(time.monotonic()+2), [{'environment':'prod','host':'/tmp/forbidden','directoryIdentity':'1:1','fileIdentity':'1:2'}])
except Refusal: pass
else: raise AssertionError('accepted forbidden database path')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real proc collector reports all database openers by inode and refuses unreadable or old interpreters', async () => {
  const observed = await python(`
from types import SimpleNamespace
class Kernel:
    def __init__(self): self.fd_count=0; self.children=[]; self.denied=False; self.old=False
    def check(self): pass
    def read(self,path,limit):
        if path.endswith('/stat'): return b'41 (command ) embedded) S 1 '+b'0 '*17+b'123 0'
        if path.endswith('/status'): return b'Uid:\\t1000\\t1000\\t1000\\t1000\\n'
        if path.endswith('/cgroup'): return b'0::/docker/fixture\\n'
        if path.endswith('/cmdline'): return b'/old/bun\\x00/home/puni1/wbs/bin/swap.js\\x00' if self.old else b'/src/backend\\x00'
        if path.endswith('/exe'): return b'executable bytes'
        raise AssertionError(path)
    def listing(self,path,limit):
        if self.denied: raise PermissionError('denied')
        if path=='/proc': return ['41']
        if path.endswith('/fd'): return ['7']
        raise AssertionError(path)
    def link(self,path):
        if path.endswith('/exe'): return '/usr/bin/bun'
        if path.endswith('/cwd'): return '/src'
        return '/unrelated-spelling'
    def metadata(self,path,follow=True): return SimpleNamespace(st_dev=7,st_ino=9)
kernel=Kernel()
families=[{'environment':'prod','suffix':'-wal','path':'/home/puni1/wbs/data/main-wal','identity':'7:9'}]
coordinator={'pid':77,'startTime':'456','cgroup':'/host'}
identity_value,openers,relevant=observe_process(kernel,41,families,[],coordinator)
assert len(openers)==1 and openers[0]['fd']==7 and openers[0]['uid']==1000
kernel.denied=True
try: observe_process(kernel,41,families,[],coordinator)
except PermissionError: pass
else: raise AssertionError('accepted denied process')
kernel.denied=False; kernel.old=True
try: observe_process(kernel,41,families,['/home/puni1/wbs/bin/swap.js'],coordinator)
except Refusal: pass
else: raise AssertionError('accepted old host executor')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

const launchFixture = String.raw`
from types import SimpleNamespace
class Launch:
    def __init__(self): self.fault=''; self.reads=[]; self.calls=[]; self.listings=0
    def regular(self,path,limit):
        self.reads.append(path)
        if path=='/etc/anacrontab': raise FileNotFoundError()
        return (b'private secret bytes' if path.endswith('fixture.service') else b'# unrelated\n'),(1,2,3)
    def exists(self,path): return False
    def metadata(self,path,follow=True): return SimpleNamespace(st_mode=stat.S_IFREG,st_dev=1,st_ino=2)
    def listing(self,path,limit): return []
    def query(self,argv):
        self.calls.append(argv)
        if '/usr/bin/crontab' in argv: return 1,b'',('no crontab for '+argv[-2]+'\n').encode()
        if self.fault=='bus' and '--user' in argv: return 1,b'',b'private secret error'
        if 'list-unit-files' in argv: return 0,b'fixture.service enabled enabled\n',b''
        if 'list-units' in argv: return 0,b'fixture.service loaded inactive dead description\n',b''
        if 'show' in argv:
            fields={'Id':'fixture.service','Names':'fixture.service','LoadState':'loaded','FragmentPath':'/etc/systemd/system/fixture.service','DropInPaths':'','Transient':'yes' if self.fault=='transient' else 'no','NeedDaemonReload':'yes' if self.fault=='reload' else 'no','Triggers':'','TriggeredBy':'','ActiveState':'inactive','SubState':'dead','MainPID':'0','ControlPID':'0','InvocationID':'','ControlGroup':'','Job':'0'}
            return 0,('\n'.join(key+'='+value for key,value in fields.items())+'\n').encode(),b''
        if 'call' in argv:
            return 0,encode({'type':'o','data':[unit_path('fixture.service')]}),b''
        if 'get-property' in argv:
            if argv[-2]=='org.freedesktop.systemd1.Unit':
                scalar={'Id':'fixture.service','LoadState':'loaded','FragmentPath':'/etc/systemd/system/fixture.service'}
                arrays={'Names':['fixture.service'],'DropInPaths':[],'Triggers':[],'TriggeredBy':[]}
                name=argv[-1]
                if name in scalar:return 0,encode({'type':'s','data':scalar[name]}),b''
                if name in arrays:return 0,encode({'type':'as','data':arrays[name]}),b''
                return 0,encode({'type':'b','data':self.fault=='transient' and name=='Transient'}),b''
            entries=[]
            if self.fault in ['duplicate','transient'] and argv[-1]=='ExecStart': entries=[['/bin/sh',['/bin/sh','-c','/home/puni1/wbs/bin/swap.js'],False,0,0,0,0,0,0,0]]
            return 0,encode({'type':'a(sasbttttuii)','data':entries}),b''
        raise AssertionError(argv)
`;
test('real launch collector hashes full inventories and private bytes, with fresh typed commands', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
host=Launch()
first=collect_launch(host,['/home/puni1/wbs/bin/swap.js'])
assert len(first)==64 and '/etc/crontab' in host.reads
assert any('get-property' in argv for argv in host.calls)
host.regular=lambda path,limit: (b'changed unrelated definition',(1,2,3))
assert collect_launch(host,['/home/puni1/wbs/bin/swap.js'])!=first
for fault in ['bus','transient','reload','duplicate']:
    host=Launch(); host.fault=fault
    try: collect_launch(host,['/home/puni1/wbs/bin/swap.js'])
    except Refusal: pass
    else: raise AssertionError('accepted '+fault)
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
  expect(observed.stderr).not.toContain('private secret');
});

test('real collector validates the finite private matching needles without using them as read selectors', async () => {
  const observed = await python(String.raw`
request={'nonce':'a'*64,'writerManifestSha256':'b'*64,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
assert '/private/needle/declared-manual-launcher' in validate_request(request)
for mutation in ['extra','missing','alias','relative','roster','fixed']:
    fault=json.loads(json.dumps(request))
    if mutation=='extra': fault['command']='private secret'
    if mutation=='missing': fault['writerPaths'].pop()
    if mutation=='alias': fault['writerPaths'][-1]['path']=fault['writerPaths'][-2]['path']
    if mutation=='relative': fault['writerPaths'][-1]['path']='relative'
    if mutation=='fixed': fault['writerPaths'][0]['path']='/private/needle/fixed'
    if mutation=='roster': fault['writerPaths'][-1]['member']='invented'
    try: validate_request(fault)
    except Refusal: pass
    else: raise AssertionError('accepted malformed needles')
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real collector completes a fresh kernel/query fixture and keeps private launch bytes off stdout', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
class Complete(Launch):
    def __init__(self): super().__init__(); self.fd_count=0; self.children=[]
    def check(self): pass
    def resolve(self,path): return path
    def read(self,path,limit):
        if path=='/etc/machine-id': return b'a'*32+b'\n'
        if path=='/proc/sys/kernel/random/boot_id': return b'12345678-1234-1234-1234-123456789abc\n'
        if path.endswith('/stat'): return b'41 (backend) S 1 '+b'0 '*17+b'123 0'
        if path.endswith('/status'): return b'Uid:\t1000\t1000\t1000\t1000\n'
        if path.endswith('/cgroup'): return b'0::/fixture\n'
        if path.endswith('/cmdline'): return b'/src/backend\x00'
        if path.endswith('/exe'): return b'executable'
        raise AssertionError(path)
    def metadata(self,path,follow=True):
        if path.endswith(('-wal','-shm','-journal')): raise FileNotFoundError()
        inode=20 if '/wbs-dev/' in path else 10
        return SimpleNamespace(st_mode=stat.S_IFDIR if path.endswith('/data') else stat.S_IFREG,st_dev=7,st_ino=inode,st_size=3,st_mtime_ns=4,st_ctime_ns=5)
    def listing(self,path,limit):
        if path=='/proc': return ['41']
        if path.endswith('/fd'): return ['7']
        return []
    def link(self,path):
        if path.endswith('/exe'): return '/usr/bin/bun'
        if path.endswith('/cwd'): return '/src'
        return '/different-spelling'
os.geteuid=lambda:0
pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=1000)
request={'nonce':'a'*64,'writerManifestSha256':'b'*64,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[{'environment':environment,'host':'/home/puni1/'+root+'/data/main','directoryIdentity':'7:'+str(inode),'fileIdentity':'7:'+str(inode)} for environment,root,inode in [('prod','wbs',10),('dev','wbs-dev',20)]],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
host=Complete()
observation=collect(request,host)
assert observation['complete'] and observation['nonce']==request['nonce']
assert len(observation['databaseOpeners'])==1 and observation['databaseOpeners'][0]['uid']==1000
assert not any(path.startswith('/private/needle') for path in host.reads)
assert b'private secret' not in encode(observation)
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
  expect(observed.stderr).not.toContain('private secret');
});

test('real proc collector distinguishes exit, unreadability, FD-close retry, deleted aliases and changed identities', async () => {
  const observed = await python(String.raw`
from types import SimpleNamespace
class RaceKernel:
    def __init__(self,fault): self.fault=fault; self.fd_count=0; self.children=[]; self.stats=0; self.links=0; self.rounds=0
    def check(self): pass
    def read(self,path,limit):
        if path.endswith('/stat'):
            self.stats+=1
            if self.fault=='exit' and self.stats>1: raise FileNotFoundError()
            if self.fault=='partial' and self.stats>1: raise FileNotFoundError()
            ticks=str(self.stats if self.fault=='reuse' else 123).encode()
            return b'41 (a ) b) S 1 '+b'0 '*17+ticks+b' 0'
        if path.endswith('/status'):
            if self.fault in ['exit','partial']: raise FileNotFoundError()
            return b'Uid:\t0\t0\t0\t0\n'
        if path.endswith('/cgroup'): return b'0::/fixture\n'
        if path.endswith('/cmdline'): return b'/src/backend\x00'
        if path.endswith('/exe'): return b'actual executable'
        raise AssertionError(path)
    def listing(self,path,limit):
        if path=='/proc': return [] if self.fault=='exit' else ['41']
        if self.fault=='denied': raise PermissionError('private secret')
        if self.fault=='closed' and self.links>0: return []
        return ['7']
    def link(self,path):
        if path.endswith('/exe'): return '/usr/bin/bun'
        if path.endswith('/cwd'): return '/src'
        self.links+=1
        if self.fault in ['closed','unknown-fd']: raise FileNotFoundError()
        if self.fault=='deleted': return '/home/puni1/wbs/data/main (deleted)'
        return '/unrelated-spelling'
    def metadata(self,path,follow=True): return SimpleNamespace(st_dev=7,st_ino=9)
families=[{'environment':'prod','suffix':'','path':'/home/puni1/wbs/data/main','identity':'7:9'}]
coordinator={'pid':77,'startTime':'456','cgroup':'/host'}
for fault in ['partial','denied','reuse','unknown-fd','deleted']:
    try: observe_process(RaceKernel(fault),41,families,[],coordinator)
    except (Refusal,PermissionError): pass
    else: raise AssertionError('accepted '+fault)
assert observe_process(RaceKernel('exit'),41,families,[],coordinator)==(None,[],False)
assert observe_process(RaceKernel('closed'),41,families,[],coordinator)[1]==[]
assert observe_process(RaceKernel('stable'),41,families,[],coordinator)[1][0]['uid']==0
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real systemd collector covers non-service commands and refuses changing installed membership', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
class OtherUnit(Launch):
    def __init__(self,kind): super().__init__(); self.kind=kind
    def query(self,argv):
        if 'get-property' in argv and argv[-2]!='org.freedesktop.systemd1.Unit':
            require(('Socket' if self.kind=='socket' else 'Mount' if self.kind=='mount' else 'Swap') in argv[-2],'wrong typed interface')
            return 0,encode({'type':'a(sasbttttuii)','data':[]}),b''
        code,out,err=super().query(argv)
        return code,out.replace(b'fixture.service',('fixture.'+self.kind).encode()).replace(unit_path('fixture.service').encode(),unit_path('fixture.'+self.kind).encode()),err
for kind in ['socket','mount','swap']:
    host=OtherUnit(kind); assert len(collect_launch(host,[]))==64
class AddedUnit(Launch):
    def __init__(self): super().__init__(); self.inventory=0
    def query(self,argv):
        code,out,err=super().query(argv)
        if 'list-unit-files' in argv and '--user' not in argv:
            self.inventory+=1
            if self.inventory>1: out+=b'added.timer enabled enabled\n'
        return code,out,err
try: collect_launch(AddedUnit(),[])
except Refusal: pass
else: raise AssertionError('accepted installed unit addition')
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real whole collector refuses coordinator, final host, database and launch drift', async () => {
  const observed = await python(
    AUTHORITY_FIXTURE_PROGRAM +
      String.raw`
REQUEST={'nonce':'a'*64,'writerManifestSha256':'b'*64,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[{'environment':environment,'host':'/home/puni1/'+root+'/data/main','directoryIdentity':'7:'+str(inode),'fileIdentity':'7:'+str(inode)} for environment,root,inode in [('prod','wbs',10),('dev','wbs-dev',20)]],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
class Drift(Complete):
    def __init__(self,fault): super().__init__();self.fault=fault;self.boot_reads=0;self.machine_reads=0;self.main_reads=0;self.inventories=0;self.proc_scans=0
    def read(self,path,limit):
        content=super().read(path,limit)
        if path.endswith('/stat') and self.fault=='coordinator': return b'41 (wrong) S 1 '+b'0 '*17+b'999 0'
        if path.endswith('/boot_id'):
            self.boot_reads+=1
            if self.boot_reads>1 and self.fault=='boot': return b'ffffffff-ffff-ffff-ffff-ffffffffffff\n'
        if path=='/etc/machine-id':
            self.machine_reads+=1
            if self.machine_reads>1 and self.fault=='machine': return b'b'*32+b'\n'
        return content
    def listing(self,path,limit):
        if path=='/proc':self.proc_scans+=1
        return super().listing(path,limit)
    def metadata(self,path,follow=True):
        if self.fault=='sidecar' and path=='/home/puni1/wbs/data/main-wal' and self.proc_scans>=4:
            return SimpleNamespace(st_mode=stat.S_IFREG,st_dev=7,st_ino=99,st_size=3,st_mtime_ns=4,st_ctime_ns=5)
        metadata=super().metadata(path,follow)
        if path=='/home/puni1/wbs/data/main':
            self.main_reads+=1
            if self.main_reads>2 and self.fault=='database': metadata.st_ino=99
        return metadata
    def query(self,argv):
        if 'list-unit-files' in argv:self.inventories+=1
        return super().query(argv)
    def regular(self,path,limit):
        content,key=super().regular(path,limit)
        if self.fault=='launch' and self.inventories>=5 and path.endswith('fixture.service'):content=b'changed unrelated definition'
        return content,key
for fault in ['coordinator','boot','machine','database','launch','sidecar']:
    try: collect(REQUEST,Drift(fault))
    except Refusal: pass
    else: raise AssertionError('accepted '+fault)
for field in ['fileIdentity','directoryIdentity']:
    wrong=json.loads(json.dumps(REQUEST));wrong['databases'][0][field]='7:999'
    try:collect(wrong,Complete())
    except Refusal:pass
    else:raise AssertionError('accepted wrong supplied '+field)
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real unit inventory preserves aliases, masks, templates and fully inspects late loaded additions', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
class UnitIdentity(Launch):
    def __init__(self,kind):super().__init__();self.kind=kind;self.loads=0
    def metadata(self,path,follow=True):
        metadata=super().metadata(path,follow)
        if self.kind=='mask' and path.endswith('fixture.service'):metadata.st_mode=stat.S_IFLNK
        return metadata
    def link(self,path):return '/dev/null'
    def resolve(self,path):return '/dev/null'
    def query(self,argv):
        code,out,err=super().query(argv)
        if self.kind=='alias':
            if 'list-unit-files' in argv:out+=b'alias.service alias enabled\n'
            elif 'show' in argv:out=out.replace(b'Names=fixture.service',b'Names=alias.service fixture.service')
            elif 'get-property' in argv and argv[-1]=='Names':out=encode({'type':'as','data':['alias.service','fixture.service']})
        if self.kind=='mask':
            if 'list-unit-files' in argv:out=b'fixture.service masked enabled\n'
            if 'show' in argv:out=out.replace(b'LoadState=loaded',b'LoadState=masked')
        if self.kind=='template':
            out=out.replace(b'fixture.service',b'fixture@.service')
            if 'list-units' in argv:out=b''
        return code,out,err
for kind in ['alias','mask','template']:assert len(collect_launch(UnitIdentity(kind),[]))==64
class LoadedAddition(Launch):
    def __init__(self):super().__init__();self.loaded_reads=0;self.current='fixture.service'
    def query(self,argv):
        if 'list-units' in argv:
            self.loaded_reads+=1
            return 0,b'fixture.service loaded inactive dead fixture\n'+(b'late.timer loaded inactive dead late\n' if self.loaded_reads>=2 else b''),b''
        if 'show' in argv:self.current=argv[argv.index('show')+1]
        code,out,err=super().query(argv)
        if 'show' in argv or 'get-property' in argv or 'call' in argv:
            out=out.replace(b'fixture.service',self.current.encode()).replace(unit_path('fixture.service').encode(),unit_path(self.current).encode())
        return code,out,err
assert collect_launch(LoadedAddition(),[])!=collect_launch(Launch(),[])
class WrongNativeShape(Launch):
    def __init__(self,signature):super().__init__();self.signature=signature
    def query(self,argv):
        if 'get-property' in argv and argv[-1]=='Id':return 0,encode({'type':'s','data':['fixture.service']}),b''
        return super().query(argv)
try:collect_launch(WrongNativeShape('s'),[])
except Refusal:pass
else:raise AssertionError('accepted scalar property wrapped as method return')
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real complete census converges unrelated arrivals and refuses late writers or silently omitted PIDs', async () => {
  const observed = await python(
    AUTHORITY_FIXTURE_PROGRAM +
      String.raw`
REQUEST={'nonce':'a'*64,'writerManifestSha256':'b'*64,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'}}
families=[{'environment':'prod','suffix':'','path':'/home/puni1/wbs/data/main','identity':'7:10'}]
class Churn(Complete):
    def __init__(self,fault):super().__init__();self.fault=fault;self.scans=0
    def listing(self,path,limit):
        if path=='/proc':
            self.scans+=1
            if self.fault=='omitted':return ['41'] if self.scans==1 else ['42']
            return ['41'] if self.scans==1 else ['41','42']
        if '/42/fd' in path:return ['7'] if self.fault=='opener' else []
        return super().listing(path,limit)
    def read(self,path,limit):
        if '/42/cmdline' in path and self.fault=='writer':return b'/usr/bin/bun\x00/home/puni1/wbs/bin/swap.js\x00'
        return super().read(path,limit)
for fault in ['writer','opener','omitted']:
    try:collect_processes(Churn(fault),families,['/home/puni1/wbs/bin/swap.js'],REQUEST['coordinator'])
    except Refusal:pass
    else:raise AssertionError('accepted '+fault)
assert len(collect_processes(Churn('unrelated'),families,[],REQUEST['coordinator'])[0])==1
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('real prior interpreter remains refused after identical on-disk replacement', async () => {
  const observed = await python(String.raw`
import tempfile,shutil,signal
with tempfile.TemporaryDirectory(prefix='authority-prior-') as directory:
    interpreter=directory+'/interpreter';replacement=directory+'/replacement'
    shutil.copyfile('/bin/sh',interpreter);os.chmod(interpreter,0o755)
    child=subprocess.Popen([interpreter,'-c','while :; do sleep 1; done'],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for attempt in range(100):
            if os.readlink('/proc/'+str(child.pid)+'/exe')==interpreter:break
            time.sleep(0.005)
        else:raise AssertionError('fixture interpreter did not start')
        shutil.copyfile('/bin/sh',replacement);os.chmod(replacement,0o755);os.replace(replacement,interpreter)
        assert os.readlink('/proc/'+str(child.pid)+'/exe').endswith(' (deleted)')
        kernel=Host(time.monotonic()+2);kernel.fd_count=0
        coordinator={'pid':os.getpid(),'startTime':process_start(kernel,os.getpid())[0],'cgroup':parse_cgroup(kernel.read('/proc/self/cgroup',1024*1024))}
        try:observe_process(kernel,child.pid,[],[interpreter],coordinator)
        except Refusal:pass
        else:raise AssertionError('adopted old interpreter through replacement bytes')
    finally:
        os.killpg(child.pid,signal.SIGKILL);child.wait()
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('native typed unit decoder rejects wrong object bindings, scalar wrappers and command nesting', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
class NativeFault(Launch):
    def __init__(self,fault):super().__init__();self.fault=fault
    def query(self,argv):
        code,out,err=super().query(argv)
        if self.fault=='object' and 'call' in argv:return 0,encode({'type':'o','data':['/wrong/object']}),b''
        if 'get-property' in argv:
            if self.fault=='scalar' and argv[-1]=='Id':out=encode({'type':'s','data':['fixture.service']})
            if self.fault=='boolean' and argv[-1]=='Transient':out=encode({'type':'b','data':[False]})
            if self.fault=='array' and argv[-1]=='Names':out=encode({'type':'as','data':'fixture.service'})
            if self.fault=='command' and argv[-1]=='ExecStart':out=encode({'type':'a(sasbttttuii)','data':[[['/bin/true',['/bin/true'],False,0,0,0,0,0,0,0]]]})
        return code,out,err
for fault in ['object','scalar','boolean','array','command']:
    try:collect_launch(NativeFault(fault),[])
    except Refusal:pass
    else:raise AssertionError('accepted native '+fault+' fault')
for name in WRITER_NAMES[7:]:
    try:check_surface('root:unknown.service','/private/needle/'+name,['/private/needle/'+name],False)
    except Refusal:pass
    else:raise AssertionError('missed declared launcher needle')
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('unrelated transient descriptors remain pinned while transient canonical WBS launchers refuse', async () => {
  const observed = await python(
    launchFixture +
      String.raw`
class TransientUnit(Launch):
    def __init__(self,solver):super().__init__();self.solver=solver
    def query(self,argv):
        code,out,err=super().query(argv)
        if 'show' in argv:out=out.replace(b'Transient=no',b'Transient=yes')
        if 'get-property' in argv and argv[-1]=='Transient':out=encode({'type':'b','data':True})
        if self.solver and '--user' in argv:
            if 'get-property' in argv and argv[-1]=='ExecStart':out=encode({'type':'a(sasbttttuii)','data':[['/home/puni1/.local/lib/wbs-solver/bun',['/home/puni1/.local/lib/wbs-solver/bun'],False,0,0,0,0,0,0,0]]})
            out=out.replace(b'fixture.service',b'wbs-solver-supervisor.service').replace(unit_path('fixture.service').encode(),unit_path('wbs-solver-supervisor.service').encode())
        return code,out,err
assert collect_launch(TransientUnit(False),[])!=collect_launch(Launch(),[])
try:collect_launch(TransientUnit(True),['/home/puni1/.local/lib/wbs-solver/bun'])
except Refusal:pass
else:raise AssertionError('accepted transient canonical WBS unit')
print('ok')
`,
  );
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});
