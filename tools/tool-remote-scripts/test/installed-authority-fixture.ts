import { AUTHORITY_COLLECTOR } from '../src/lib/installed-authority-collector';
import { readAuthorityCollector } from '../src/lib/installed-authority-transport';

export const AUTHORITY_FIXTURE_PROGRAM = String.raw`
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
class Complete(Launch):
    def __init__(self): super().__init__(); self.fd_count=0; self.children=[]; self.internal_processes={}
    def check(self): pass
    def resolve(self,path): return path
    def read(self,path,limit):
        solver=REQUEST.get('solver')
        if solver is not None and path.startswith('/proc/'+str(solver['pid'])+'/'):
            if path.endswith('/stat'):return b'42 (solver) S 1 '+b'0 '*17+solver['startTime'].encode()+b' 0'
            if path.endswith('/cgroup'):return ('0::'+solver['cgroup']+'\n').encode()
            if path.endswith('/cmdline'):return b'/home/puni1/.local/lib/wbs-solver/bun\x00/home/puni1/.local/lib/wbs-solver/solver-supervisor.js\x00--config=/home/puni1/.config/wbs-solver/solver-supervisor.json\x00--admission=policy\x00'
            if path.endswith('/exe'):return b'fixture bun'
        if path=='/etc/machine-id': return b'a'*32+b'\n'
        if path=='/proc/sys/kernel/random/boot_id': return b'12345678-1234-1234-1234-123456789abc\n'
        if path.endswith('/stat'): return b'41 (backend) S 1 '+b'0 '*17+REQUEST['coordinator']['startTime'].encode()+b' 0'
        if path.endswith('/status'): return b'Uid:\t1000\t1000\t1000\t1000\n'
        if path.endswith('/cgroup'): return ('0::'+REQUEST['coordinator']['cgroup']+'\n').encode()
        if path.endswith('/cmdline'): return b'/src/backend\x00'
        if path.endswith('/exe'): return b'executable'
        raise AssertionError(path)
    def metadata(self,path,follow=True):
        solver=REQUEST.get('solver')
        if solver is not None and path=='/proc/'+str(solver['pid'])+'/exe':return SimpleNamespace(st_dev=int(solver['executable']['device']),st_ino=int(solver['executable']['inode']))
        if path.endswith(('-wal','-shm','-journal')): raise FileNotFoundError()
        inode=20 if '/wbs-dev/' in path else 10
        return SimpleNamespace(st_mode=stat.S_IFDIR if path.endswith('/data') else stat.S_IFREG,st_dev=7,st_ino=inode,st_size=3,st_mtime_ns=4,st_ctime_ns=5)
    def listing(self,path,limit):
        if path=='/proc': return [str(REQUEST['coordinator']['pid'])]+([str(REQUEST['solver']['pid'])] if REQUEST.get('solver') is not None else [])
        if REQUEST.get('solver') is not None and path=='/proc/'+str(REQUEST['solver']['pid'])+'/fd':return []
        if path.endswith('/fd'): return ['7']
        return []
    def link(self,path):
        solver=REQUEST.get('solver')
        if solver is not None and path=='/proc/'+str(solver['pid'])+'/exe':return '/home/puni1/.local/lib/wbs-solver/bun'
        if path.endswith('/exe'): return '/usr/bin/bun'
        if path.endswith('/cwd'): return '/src'
        return '/different-spelling'

os.geteuid=lambda:0
pwd.getpwnam=lambda name:SimpleNamespace(pw_uid=1000)
`;

export async function collectFixture(request: unknown, deadline: number): Promise<string> {
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    AUTHORITY_FIXTURE_PROGRAM +
    '\nREQUEST=json.loads(' +
    JSON.stringify(JSON.stringify(request)) +
    ')\nprint(encode(collect(REQUEST,Complete())).decode())\n';
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-'], {
    stdin: new TextEncoder().encode(program),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return readAuthorityCollector(child, deadline);
}
