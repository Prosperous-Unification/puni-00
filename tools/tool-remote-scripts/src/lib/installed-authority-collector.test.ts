import { expect, test } from 'bun:test';

import {
  AUTHORITY_FIXTURE_PROGRAM,
  VIRTUAL_EXECUTABLE_FIXTURE,
} from '../../test/installed-authority-fixture';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';

async function python(program: string) {
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-'], {
    stdin: new TextEncoder().encode(
      `${AUTHORITY_COLLECTOR}\n${VIRTUAL_EXECUTABLE_FIXTURE}\n${program}`,
    ),
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
class Kernel(VirtualExecutable):
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
    def metadata(self,path,follow=True):
        if path.endswith('/exe'):return os.fstat(self.fixture_executable(path))
        return SimpleNamespace(st_dev=7,st_ino=9)
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
request={'nonce':'a'*64,'writerManifestSha256':'b'*64,'solver':None,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
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
class Complete(VirtualExecutable,Launch):
    def __init__(self): super().__init__(); self.fd_count=0; self.children=[]; self.internal_processes={}
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
        if path.startswith('/proc/') and path.endswith('/exe'):return os.fstat(self.fixture_executable(path))
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
request={'nonce':'a'*64,'writerManifestSha256':'b'*64,'solver':None,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[{'environment':environment,'host':'/home/puni1/'+root+'/data/main','directoryIdentity':'7:'+str(inode),'fileIdentity':'7:'+str(inode)} for environment,root,inode in [('prod','wbs',10),('dev','wbs-dev',20)]],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
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
class RaceKernel(VirtualExecutable):
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
    def metadata(self,path,follow=True):
        if path.endswith('/exe'):return os.fstat(self.fixture_executable(path))
        return SimpleNamespace(st_dev=7,st_ino=9)
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
REQUEST={'nonce':'a'*64,'writerManifestSha256':'b'*64,'solver':None,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[{'environment':environment,'host':'/home/puni1/'+root+'/data/main','directoryIdentity':'7:'+str(inode),'fileIdentity':'7:'+str(inode)} for environment,root,inode in [('prod','wbs',10),('dev','wbs-dev',20)]],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/private/needle/'+name} for index,name in enumerate(WRITER_NAMES)]}
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
REQUEST={'nonce':'a'*64,'writerManifestSha256':'b'*64,'solver':None,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'}}
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

test('real collector observes its unchanged own descriptors without phantom listing FD retries', async () => {
  const observed = await python(String.raw`
kernel=Host(time.monotonic()+2);kernel.fd_count=0
coordinator={'pid':os.getpid(),'startTime':process_start(kernel,os.getpid())[0],'cgroup':parse_cgroup(kernel.read('/proc/self/cgroup',1024*1024))}
identity_value,openers,relevant=observe_process(kernel,os.getpid(),[],[],coordinator)
assert identity_value['pid']==os.getpid() and openers==[]
import tempfile
with tempfile.NamedTemporaryFile() as selected:
    metadata=os.fstat(selected.fileno())
    families=[{'environment':'prod','suffix':'','path':'/fixture/selected','identity':identity(metadata)}]
    observed,openers,relevant=observe_process(kernel,os.getpid(),families,[],coordinator)
    assert len(openers)==1 and openers[0]['fd']==selected.fileno()
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('executable digests bind the opened inode in internal, relevant and late opener paths', async () => {
  const observed = await python(String.raw`
import builtins,tempfile,shutil
with tempfile.TemporaryDirectory(prefix='authority-exe-fd-') as directory:
    # Proof: h2's same-byte sleep-a probe exited 1 with "coreutils: unknown program 'sleep-a'".
    # Keep the multicall applet basename while retaining separate executable inodes.
    os.mkdir(directory+'/a');os.mkdir(directory+'/b')
    executable_a=directory+'/a/sleep';executable_b=directory+'/b/sleep';database=directory+'/database'
    shutil.copyfile('/bin/sleep',executable_a);shutil.copyfile('/bin/sleep',executable_b)
    os.chmod(executable_a,0o755);os.chmod(executable_b,0o755)
    assert os.stat(executable_a).st_ino!=os.stat(executable_b).st_ino
    with open(executable_a,'rb') as source_a,open(executable_b,'rb') as source_b:
        assert digest(source_a.read())==digest(source_b.read())
    with open(database,'wb+') as selected:
        child=subprocess.Popen([executable_a,'20'],pass_fds=(selected.fileno(),),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        try:
            base='/proc/'+str(child.pid);exe=base+'/exe'
            expected_command=os.fsencode(executable_a)+b'\x0020\x00'
            # Proof: exe-only readiness admitted empty-to-full cmdline drift in 6/300 real startups;
            # waiting for the exact argv yielded 900 unchanged production captures (2026-10-26).
            for attempt in range(100):
                try:
                    with open(base+'/cmdline','rb') as stream:command=stream.read()
                    executable=os.readlink(exe)
                except FileNotFoundError as failure:
                    status=child.poll()
                    assert child.stderr is not None
                    diagnostic=child.stderr.read(4096) if status is not None else b'<owned child still running; stderr not drained>'
                    raise AssertionError('owned child readiness failed: pid='+str(child.pid)+' executable='+executable_a+' exit='+str(status)+' stderr='+repr(diagnostic)) from failure
                if executable==executable_a and command==expected_command:break
                time.sleep(0.005)
            else:raise AssertionError('owned child did not start')
            assert identity(os.stat(exe))==identity(os.stat(executable_a))
            print('named='+identity(os.stat(exe))+' opened='+identity(os.stat(executable_b)))
            kernel=Host(time.monotonic()+10);kernel.fd_count=0
            baseline=capture_internal_process(kernel,child.pid)['identity']
            coordinator={key:baseline[key] for key in ['pid','startTime','cgroup']}
            family={'environment':'prod','suffix':'','path':database,'identity':identity(os.fstat(selected.fileno()))}
            import contextlib
            @contextlib.contextmanager
            def redirect_executable_open(wrong):
                original_open=builtins.open;original_os_open=os.open;original_read=os.read;opened=[];reads=[]
                def wrong_builtin(path,*args,**kwargs):
                    stream=original_open(executable_b if wrong and path==exe else path,*args,**kwargs)
                    if path==exe:opened.append(stream.fileno())
                    return stream
                def wrong_os(path,*args,**kwargs):
                    descriptor=original_os_open(executable_b if wrong and path==exe else path,*args,**kwargs)
                    if path==exe:opened.append(descriptor)
                    return descriptor
                def observed_read(descriptor,count):
                    if descriptor in opened:reads.append(descriptor)
                    return original_read(descriptor,count)
                builtins.open=wrong_builtin;os.open=wrong_os;os.read=observed_read
                try:yield opened,reads
                finally:builtins.open=original_open;os.open=original_os_open;os.read=original_read
            accepted=[];leaked_read_failures=[]
            for route in ['capture','relevant','opener']:
                kernel.internal_processes={child.pid:baseline} if route=='relevant' else {}
                with redirect_executable_open(False) as (healthy_opened,healthy_reads):
                    if route=='capture':healthy=capture_internal_process(kernel,child.pid)['identity']
                    elif route=='relevant':healthy=observe_process(kernel,child.pid,[],[executable_a],coordinator)[0]
                    else:
                        healthy,openers,_=observe_process(kernel,child.pid,[family],[],coordinator)
                        assert len(openers)==1 and openers[0]['fd']==selected.fileno()
                    assert healthy['executable']==baseline['executable']
                assert len(healthy_opened)==1,(route,healthy_opened)
                assert healthy_reads,(route,'healthy executable was not read')
                try:os.fstat(healthy_opened[0])
                except OSError as failure:assert failure.errno==errno.EBADF
                else:raise AssertionError('healthy executable descriptor leaked in '+route)
                with redirect_executable_open(False) as (failed_opened,failed_reads):
                    original_read=os.read;injected=[]
                    def fail_executable_read(descriptor,count):
                        if descriptor in failed_opened:
                            injected.append(descriptor)
                            raise OSError(errno.EIO,'injected executable read failure')
                        return original_read(descriptor,count)
                    os.read=fail_executable_read
                    try:
                        try:
                            if route=='capture':capture_internal_process(kernel,child.pid)
                            elif route=='relevant':observe_process(kernel,child.pid,[],[executable_a],coordinator)
                            else:observe_process(kernel,child.pid,[family],[],coordinator)
                        except OSError as failure:assert failure.errno==errno.EIO
                        else:raise AssertionError('accepted executable read failure in '+route)
                    finally:os.read=original_read
                    assert len(injected)==1 and injected[0]==failed_opened[0],(route,injected)
                    assert not failed_reads,(route,'read failure bypassed injection')
                assert len(failed_opened)==1,(route,failed_opened)
                try:os.fstat(failed_opened[0])
                except OSError as failure:assert failure.errno==errno.EBADF
                else:leaked_read_failures.append(route)
                with redirect_executable_open(True) as (opened,wrong_reads):
                    try:
                        if route=='capture':capture_internal_process(kernel,child.pid)
                        elif route=='relevant':observe_process(kernel,child.pid,[],[executable_a],coordinator)
                        else:observe_process(kernel,child.pid,[family],[],coordinator)
                    except Refusal:pass
                    else:accepted.append(route)
                assert len(opened)==1,(route,opened)
                assert not wrong_reads,(route,'wrong executable bytes were read before refusal')
                try:os.fstat(opened[0])
                except OSError as failure:assert failure.errno==errno.EBADF
                else:raise AssertionError('executable descriptor leaked in '+route)
            assert not accepted,'accepted wrong opened executable inode in '+','.join(accepted)
            assert not leaked_read_failures,'read failure leaked executable descriptor in '+','.join(leaked_read_failures)
            with redirect_executable_open(False) as (swapped_opened,swapped_reads):
                original_read=os.read;swapped=[]
                def swap_after_precheck(descriptor,count):
                    if descriptor in swapped_opened and not swapped:
                        donor=os.open(executable_b,os.O_RDONLY)
                        try:os.dup2(donor,descriptor)
                        finally:os.close(donor)
                        swapped.append(descriptor)
                    return original_read(descriptor,count)
                os.read=swap_after_precheck
                try:
                    try:capture_internal_process(kernel,child.pid)
                    except Refusal as failure:assert str(failure)=='process executable changed during read'
                    else:raise AssertionError('accepted descriptor switched after precheck')
                finally:os.read=original_read
                assert swapped and swapped_reads
            try:os.fstat(swapped_opened[0])
            except OSError as failure:assert failure.errno==errno.EBADF
            else:raise AssertionError('swapped executable descriptor leaked')
        finally:child.kill();child.wait(timeout=3)
print('ok')
`);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toMatch(/^named=\d+:\d+ opened=\d+:\d+\nok\n$/);
});

test('executable reader closes its raw descriptor on read, stat, deadline and bound refusal', async () => {
  const observed = await python(String.raw`
import tempfile
class TrackedHost(Host):
    def __init__(self):super().__init__(time.monotonic()+3);self.opened=[];self.change=False
    def open_executable(self,path):
        descriptor=super().open_executable(path);self.opened.append(descriptor);return descriptor
    def metadata(self,path,follow=True):
        observed=super().metadata(path,follow)
        if self.change and path=='/proc/'+str(os.getpid())+'/exe':
            from types import SimpleNamespace
            return SimpleNamespace(st_dev=observed.st_dev,st_ino=observed.st_ino+1,st_mode=observed.st_mode,st_size=observed.st_size,st_mtime_ns=observed.st_mtime_ns,st_ctime_ns=observed.st_ctime_ns)
        return observed
pid=os.getpid();path='/proc/'+str(pid)+'/exe';original=os.stat(path)
for fault in ['read','stat','named','deadline']:
    host=TrackedHost();host.change=fault=='named'
    if fault=='deadline':
        original_open=host.open_executable
        def expired_open(path):
            descriptor=original_open(path);host.deadline=time.monotonic()-1;return descriptor
        host.open_executable=expired_open
    original_read=os.read;original_fstat=os.fstat
    if fault=='read':
        def failed_read(descriptor,count):
            if descriptor in host.opened:raise OSError(errno.EIO,'injected executable read failure')
            return original_read(descriptor,count)
        os.read=failed_read
    if fault=='stat':
        def failed_stat(descriptor):
            if descriptor in host.opened:raise OSError(errno.EIO,'injected executable stat failure')
            return original_fstat(descriptor)
        os.fstat=failed_stat
    try:
        try:host.read_executable(pid,original)
        except OSError as failure:
            assert fault in ['read','stat'] and failure.errno==errno.EIO
        except Refusal as failure:
            assert (fault=='named' and str(failure)=='process executable changed during read') or (fault=='deadline' and str(failure)=='collector deadline exceeded')
        else:raise AssertionError('accepted '+fault)
    finally:os.read=original_read;os.fstat=original_fstat
    assert len(host.opened)==1
    try:os.fstat(host.opened[0])
    except OSError as failure:assert failure.errno==errno.EBADF
    else:raise AssertionError('leaked executable descriptor on '+fault)
with tempfile.TemporaryFile() as large:
    large.truncate(128*1024*1024+1);host=TrackedHost()
    host.open_executable=lambda path:(host.opened.append(os.dup(large.fileno())) or host.opened[-1])
    original_read=os.read;large_reads=[]
    def observed_large_read(descriptor,count):
        if descriptor in host.opened:large_reads.append(descriptor)
        return original_read(descriptor,count)
    os.read=observed_large_read
    try:
        try:host.read_executable(pid,os.fstat(large.fileno()))
        except Refusal:pass
        else:raise AssertionError('accepted oversized executable')
    finally:os.read=original_read
    assert not large_reads,'read oversized executable descriptor'
    try:os.fstat(host.opened[0])
    except OSError as failure:assert failure.errno==errno.EBADF
    else:raise AssertionError('leaked oversized executable descriptor')
reader,writer=os.pipe()
try:
    os.write(writer,b'fixture');os.close(writer);writer=None
    host=TrackedHost()
    host.open_executable=lambda path:(host.opened.append(os.dup(reader)) or host.opened[-1])
    original_read=os.read;pipe_reads=[]
    def observed_pipe_read(descriptor,count):
        if descriptor in host.opened:pipe_reads.append(descriptor)
        return original_read(descriptor,count)
    os.read=observed_pipe_read
    try:
        try:host.read_executable(pid,os.fstat(reader))
        except Refusal:pass
        else:raise AssertionError('accepted nonregular executable descriptor')
    finally:os.read=original_read
    assert not pipe_reads,'read nonregular executable descriptor'
    try:os.fstat(host.opened[0])
    except OSError as failure:assert failure.errno==errno.EBADF
    else:raise AssertionError('leaked nonregular executable descriptor')
finally:
    os.close(reader)
    if writer is not None:os.close(writer)
invalid=TrackedHost();invalid_paths=[]
def invalid_open(path):
    invalid_paths.append(path);raise AssertionError('invalid PID reached executable open')
invalid.open_executable=invalid_open
try:invalid.read_executable('../',original)
except Refusal as failure:assert str(failure)=='process identity malformed'
else:raise AssertionError('accepted invalid executable PID')
assert not invalid_paths
try:TrackedHost().read_executable(2147483647,original)
except FileNotFoundError:pass
else:raise AssertionError('accepted absent proc executable')
denied=TrackedHost()
def unreadable_open(path):raise PermissionError(errno.EACCES,'injected proc executable denial')
denied.open_executable=unreadable_open
try:denied.read_executable(pid,original)
except PermissionError as failure:assert failure.errno==errno.EACCES
else:raise AssertionError('accepted unreadable proc executable')
print('ok')
`);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('executable reader refuses an actual stream that grows beyond its admitted size', async () => {
  const observed = await python(String.raw`
import tempfile
with tempfile.TemporaryFile() as executable:
    executable.write(b'A');executable.flush();executable.seek(0)
    original=os.fstat(executable.fileno());host=Host(time.monotonic()+10);opened=[];grown=[]
    def open_owned(path):
        descriptor=os.dup(executable.fileno());opened.append(descriptor);return descriptor
    host.open_executable=open_owned
    original_read=os.read
    def grow_during_read(descriptor,count):
        if descriptor in opened and not grown:
            os.ftruncate(executable.fileno(),128*1024*1024+1)
            grown.append(True)
        return original_read(descriptor,count)
    os.read=grow_during_read
    try:
        try:host.read_executable(os.getpid(),original)
        except Refusal as failure:assert str(failure)=='collector read bound exceeded'
        else:raise AssertionError('accepted executable stream beyond 128 MiB')
    finally:os.read=original_read
    assert grown and len(opened)==1
    try:os.fstat(opened[0])
    except OSError as failure:assert failure.errno==errno.EBADF
    else:raise AssertionError('leaked grown executable descriptor')
print('ok')
`);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('native manually launched supervisor is refused when the effective unit is stopped', async () => {
  const observed = await python(String.raw`
import tempfile,shutil,signal
with tempfile.TemporaryDirectory(prefix='authority-unmanaged-solver-') as directory:
    interpreter=directory+'/bun';script=directory+'/solver-supervisor.js'
    shutil.copyfile('/bin/sh',interpreter);os.chmod(interpreter,0o755)
    with open(script,'w') as stream:stream.write('while :; do sleep 1; done\n')
    source=${JSON.stringify(AUTHORITY_COLLECTOR)}
    assert source.count('/home/puni1/.local/lib/wbs-solver/bun')>0 and source.count('/home/puni1/.local/lib/wbs-solver/solver-supervisor.js')>0
    namespace={};exec(source.replace('/home/puni1/.local/lib/wbs-solver/bun',interpreter).replace('/home/puni1/.local/lib/wbs-solver/solver-supervisor.js',script),namespace)
    child=subprocess.Popen([interpreter,script],start_new_session=True,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for attempt in range(100):
            if os.readlink('/proc/'+str(child.pid)+'/exe')==interpreter:break
            time.sleep(0.005)
        kernel=namespace['Host'](time.monotonic()+2);kernel.fd_count=0
        coordinator={'pid':os.getpid(),'startTime':process_start(kernel,os.getpid())[0],'cgroup':parse_cgroup(kernel.read('/proc/self/cgroup',1024*1024))}
        actual=namespace['capture_internal_process'](kernel,child.pid)['identity']
        expected={key:actual[key] for key in ['pid','startTime','uid','cgroup','executable','argvSha256']}
        for fault in ['stopped','pid','startTime','cgroup','executable','argvSha256','coordinator-alias']:
            selected=json.loads(json.dumps(expected))
            if fault=='stopped' or fault=='coordinator-alias':selected=None
            elif fault=='pid':selected['pid']+=1
            elif fault=='startTime':selected['startTime']=str(int(selected['startTime'])+1)
            elif fault=='cgroup':selected['cgroup']='/user.slice/foreign.service'
            elif fault=='executable':selected['executable']['inode']=str(int(selected['executable']['inode'])+1)
            elif fault=='argvSha256':selected['argvSha256']='0'*64
            kernel.solver_process=selected
            selected_coordinator={key:actual[key] for key in ['pid','startTime','cgroup']} if fault=='coordinator-alias' else coordinator
            try:namespace['observe_process'](kernel,child.pid,[],[interpreter,script],selected_coordinator)
            except namespace['Refusal']:pass
            else:raise AssertionError('accepted unmanaged supervisor with '+fault+' identity')
        kernel.solver_process=expected
        observed,opened,relevant=namespace['observe_process'](kernel,child.pid,[],[interpreter,script],coordinator)
        assert relevant and observed['pid']==child.pid and opened==[]
    finally:os.killpg(child.pid,signal.SIGKILL);child.wait()
print('ok')
`);
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('ok\n');
});

test('runtime fragment port retains actual opened bytes and closes descriptors on missing, symlink and class refusal', async () => {
  const observed = await python(String.raw`
import tempfile
with tempfile.TemporaryDirectory(prefix='runtime-fragment-') as directory:
    path=directory+'/scope';replacement=directory+'/replacement';parent=directory+'/linked'
    open(path,'wb').write(b'original');os.chmod(path,0o600)
    host=Host(time.monotonic()+5)
    before=len(os.listdir('/proc/self/fd'))
    opened=host.open_runtime_fragment(path)
    original=runtime_metadata(opened['file'].stat())
    open(replacement,'wb').write(b'replacement');os.replace(replacement,path)
    assert opened['file'].read(1024)==b'original'
    assert runtime_metadata(opened['file'].stat())!=runtime_metadata(host.metadata(path,False))
    opened['file'].close()
    for name,port in reversed(opened['parents']):port.close()
    for selected in [directory+'/missing']:
        try:host.open_runtime_fragment(selected)
        except FileNotFoundError:pass
        else:raise AssertionError('missing fragment accepted')
    os.symlink(directory,parent)
    try:host.open_runtime_fragment(parent+'/scope')
    except OSError:pass
    else:raise AssertionError('symlink parent accepted')
    os.chmod(path,0o600)
    fragments=RuntimeFragments(host,RuntimeBudget())
    try:fragments.capture(path)
    except Refusal as cause:assert str(cause)=='runtime fragment mode or size differs',cause
    else:raise AssertionError('private mode accepted for transient fragment')
    finally:fragments.close()
    assert len(os.listdir('/proc/self/fd'))==before
print('raw-runtime-fragment')
`);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(observed.stdout).toBe('raw-runtime-fragment\n');
});
