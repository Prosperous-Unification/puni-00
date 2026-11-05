import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { DockerImageCapabilities } from './docker-image-identity';
import { renderLabGuestNoCloud } from './lab-guest-bootstrap';

const helper =
  process.env['PUNI_GUEST_TEST_SOURCE'] ?? join(import.meta.dir, 'lab-guest-bootstrap.py');
const nonce = '1234567890abcdef1234567890abcdef';
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const harness = String.raw`
import importlib.util, io, json, os, pathlib, sys, tempfile, time
spec = importlib.util.spec_from_file_location('guest', sys.argv[1])
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
case = sys.argv[2]
request = {'schemaVersion': 1, 'nonce': '1234567890abcdef1234567890abcdef', 'bootstrapSha256': g.hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()}
version = {'engineVersion': '29.7.2', 'serverApi': '1.55', 'minimumApi': '1.40'}
info = {'daemonId': 'actual-daemon', 'os': 'linux', 'arch': 'x86_64', 'driver': 'overlayfs', 'driverStatus': [['driver-type', 'io.containerd.snapshotter.v1']]}
def query(command, **options):
    if command[-3:-1] == ['version', '--format']: return json.dumps(version)
    if command[-3:-1] == ['info', '--format']: return json.dumps(info)
    raise AssertionError(command)
if case.startswith('cap-'):
    fault = case[4:]
    if fault in version: version[fault] = 'foreign'
    if fault=='version-shape': version['foreign']=1
    if fault=='info-shape': info['foreign']=1
    if fault in info: info[fault] = '' if fault == 'daemonId' else 'foreign'
    if fault == 'missing-store': info['driverStatus'] = []
    if fault == 'duplicate-store': info['driverStatus'] *= 2
    if fault == 'foreign-store': info['driverStatus'][0][1] = 'foreign'
    if fault == 'wide-store': info['driverStatus'][0].append('foreign')
    if fault == 'malformed-row': info['driverStatus'] = [False,['driver-type','io.containerd.snapshotter.v1']]
    print(json.dumps(g.capture_capabilities(query)))
elif case.startswith('guard-'):
    fault=case[6:]
    values={'/sys/class/dmi/id/sys_vendor':'foreign' if fault=='vendor' else 'QEMU','/sys/class/dmi/id/product_name':'Puni bounded baseline','/sys/class/dmi/id/product_uuid':'12345678-90ab-cdef-1234-567890abcdef','/var/lib/cloud/data/instance-id':'puniq-'+request['nonce'],'/sys/class/block/vda/size':'16777216','/sys/class/block/sr0/device/type':'4' if fault=='cdrom' else '5'}
    g.read_text=lambda path,maximum=65536:values[str(path)]
    native_listdir=os.listdir;native_euid=os.geteuid
    os.listdir=lambda path:['lo'] if path=='/sys/class/net' else native_listdir(path)
    os.geteuid=lambda:0
    def execute(command,**options):
        if command[0]=='/usr/bin/cloud-id': return 'nocloud\n'
        if command[0]=='/usr/bin/findmnt': return ('xfs' if fault=='filesystem' else 'ext4') if command[-2]=='FSTYPE' else '/dev/vda1'
        if command[0]=='/usr/sbin/swapon': return '/dev/swap' if fault=='swap' else ''
        if command[0]=='/usr/bin/dpkg-query':
            name=command[-1];version,architecture=g.PREREQUISITES[name]
            return name+'\t'+version+'\t'+architecture+'\tinstall ok installed\n'
        raise AssertionError(command)
    g.run=execute;g.inspect_seed=lambda request:None
    try: g.guard_guest(request); print('accepted')
    finally: os.listdir=native_listdir;os.geteuid=native_euid
elif case.startswith('primitive-'):
    fault=case[10:]
    if fault=='arguments': g.main(['unused','--force'])
    elif fault=='readiness':
        g.read_text=lambda path: '600.001 0'
        g.require_readiness()
    elif fault=='mount': g.require_seed_mount('/dev/sr0 iso9660 rw,nosuid,nodev,noexec')
    elif fault=='short-read':
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'input';path.write_bytes(b'x')
            with open(path,'rb') as stream: g.pread_exact(stream.fileno(),10,0)
    elif fault=='stderr': g.run([sys.executable,'-c','import sys;sys.stderr.write("unexpected")'])
    elif fault=='read':
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'bounded';path.write_bytes(b'x'*65537);g.read_text(path)
    elif fault in ('duplicate-unit','missing-unit'):
        g.run=lambda command:'ActiveState=active\nActiveState=active\n' if fault=='duplicate-unit' else ''
        g.show_fields('docker.service',['ActiveState'])
    elif fault=='configuration':
        with tempfile.TemporaryDirectory() as directory: g.create_file(pathlib.Path(directory)/'config','x'*65537)
    elif fault=='short-policy':
        native_write=os.write
        def write(fd,content): return native_write(fd,content[:-1])
        g.os.write=write
        try:
            with tempfile.TemporaryDirectory() as directory:
                with g.suppress_starts(pathlib.Path(directory)/'policy',request['nonce']): pass
        finally: g.os.write=native_write
    elif fault=='missing-shutdown': g.measure(request,g.Protocol(request,io.StringIO()),shutdown=None)
    else: raise AssertionError(fault)
    print('accepted')
elif case.startswith('collector-'):
    fault=case[10:]
    fields={'MemoryMax':'134217728','MemorySwapMax':'0','TasksMax':'32','LimitFSIZE':'65536','RuntimeMaxUSec':'12min 30s','KillMode':'control-group','Restart':'no','TimeoutStopUSec':'30s','MainPID':str(os.getpid())}
    if fault in fields: fields[fault]='foreign'
    g.show_fields=lambda unit,properties:fields
    def read(path,maximum=65536):
        if path=='/proc/self/cgroup': return 'foreign' if fault=='cgroup' else '0::/system.slice/puni-baseline.service'
        if path.endswith('/memory.max'): return '0' if fault=='kernel' else '134217728'
        if path.endswith('/memory.swap.max'): return '0'
        if path.endswith('/pids.max'): return '32'
        raise AssertionError(path)
    g.read_text=read
    g.require_collector()
    print('accepted')
elif case.startswith('request-'):
    fault=case[8:]
    if fault=='version': request['schemaVersion']=True
    if fault=='nonce': request['nonce']='x'*32
    if fault=='source': request['bootstrapSha256']='0'*64
    if fault=='shape': request['command']='host-command'
    with tempfile.TemporaryDirectory() as directory:
        path=pathlib.Path(directory)/'request.json'
        path.write_text(json.dumps(request))
        if fault=='absent': path.unlink()
        if fault=='unreadable': path.unlink();path.mkdir()
        print(json.dumps(g.read_request(path)))
elif case.startswith('seed-'):
    fault = case[5:]
    with tempfile.TemporaryDirectory() as directory:
        seed = pathlib.Path(directory)/'seed.iso'
        sector = bytearray(2048)
        sector[:7] = b'\x01CD001\x01'
        # Exact volume identifier from accepted producer PVD SHA79b2fb6b614f7db80cad16c7a8ebf201a91eee061db44b6069eeab514e3854ae.
        sector[40:72] = bytes.fromhex('6369646174612020202020202020202020202020202020202020202020202020')
        if fault == 'uppercase-label': sector[40:72] = b'CIDATA'+b' '*26
        def record(name, location, count, flags=0):
            raw = bytearray(33+len(name)+(len(name)%2 == 0))
            raw[0] = len(raw); raw[2:6] = location.to_bytes(4,'little'); raw[10:14] = count.to_bytes(4,'little');raw[25] = flags;raw[32]=len(name);raw[33:33+len(name)] = name
            return raw
        names = {'user-data':b'#cloud-config\n{}', 'meta-data':json.dumps({'instance-id':'puniq-'+request['nonce'],'local-hostname':'puni-baseline'}).encode(), 'network-config':b'{"version":2,"ethernets":{}}', 'docker-ce.deb':b'ce', 'docker-ce-cli.deb':b'cli', 'containerd.io.deb':b'containerd'}
        g.PACKAGES = {name:(pin[0],pin[1],len(names[name+'.deb']),g.hashlib.sha256(names[name+'.deb']).hexdigest()) for name,pin in g.PACKAGES.items()}
        if fault == 'hash': names['docker-ce.deb'] = b'xx'
        if fault == 'package-size': names['docker-ce.deb'] = b'xxx'
        if fault == 'instance': names['meta-data'] = b'{}'
        if fault == 'extra': names['foreign'] = b'x'
        if fault == 'missing': del names['docker-ce.deb']
        image = bytearray(40*2048)
        image[16*2048:17*2048] = sector
        supplementary = bytearray(sector); supplementary[0]=2; supplementary[88:91]=b'%/E'; supplementary[156:190]=record(b'\0',19,2048,2)
        if fault=='joliet': supplementary[88:91]=b'bad'
        if fault=='root-size': supplementary[166:170]=(65537).to_bytes(4,'little')
        image[17*2048:18*2048] = supplementary
        image[18*2048:18*2048+7] = b'\xffCD001\x01'
        cursor = 19*2048
        for position,(name,content) in enumerate(names.items()):
            entry = record(name.encode('utf-16-be'),20+position,len(content),2 if fault=='directory' and name=='docker-ce.deb' else 0)
            if fault=='member-range' and name=='user-data': entry[10:14]=(0).to_bytes(4,'little')
            if fault=='input-size' and name=='user-data': entry[10:14]=(64*1024**2).to_bytes(4,'little')
            if fault=='directory-record' and name=='user-data': entry[0]=1
            image[cursor:cursor+len(entry)] = entry;cursor += len(entry)
            image[(20+position)*2048:(20+position)*2048+len(content)] = content
        if fault == 'label': image[16*2048+40] = ord('X')
        if fault == 'descriptor': image[18*2048+1] = ord('X')
        seed.write_bytes(image)
        native_open = os.open
        native_fstat = os.fstat
        def open_seed(path, flags, *args, **kwargs):
            if str(path) == '/dev/sr0':
                if fault == 'absent': raise FileNotFoundError('controlled-seed-absent')
                if fault == 'unreadable': raise PermissionError('controlled-seed-unreadable')
                return native_open(seed, flags, *args)
            return native_open(path, flags, *args, **kwargs)
        def fstat_seed(fd):
            native = native_fstat(fd)
            class Identity:
                st_mode = native.st_mode if fault=='type' else g.stat.S_IFBLK
                st_rdev = 123
            return Identity()
        def ioctl(fd, operation, packet):
            if operation == 0x125e: return g.struct.pack('I', 0 if fault=='writable' else 1)
            if operation == 0x80081272: return g.struct.pack('Q', 81*1024*1024 if fault=='size' else (80*1024**2 if fault=='input-size' else len(image)))
            raise AssertionError(operation)
        g.os.open = open_seed;g.os.fstat=fstat_seed;g.fcntl.ioctl=ioctl
        try: print(json.dumps(g.inspect_seed(request)))
        finally: g.os.open=native_open;g.os.fstat=native_fstat
elif case.startswith('installer-'):
    fault = case[10:]
    with tempfile.TemporaryDirectory() as directory:
        root = pathlib.Path(directory)
        g.SEED = root
        for name,pin in g.PACKAGES.items(): (root/(name+'.deb')).write_bytes(name.encode())
        g.PACKAGES = {name:(pin[0],pin[1],len(name),g.hashlib.sha256(name.encode()).hexdigest()) for name,pin in g.PACKAGES.items()}
        if fault=='hash': (root/'docker-ce.deb').write_bytes(b'x'*len('docker-ce'))
        if fault=='absent': (root/'docker-ce.deb').unlink()
        if fault=='symlink': (root/'docker-ce.deb').unlink();(root/'docker-ce.deb').symlink_to(root/'docker-ce-cli.deb')
        if fault=='guard':
            def guard(request): raise g.Refusal('guest-boundary')
        else:
            def guard(request): return None
        g.guard_guest=guard
        caps = {'MemoryMax':'536870912','MemorySwapMax':'0','TasksMax':'64','LimitFSIZE':'134217728','RuntimeMaxUSec':'3min','KillMode':'control-group','Restart':'no'}
        if fault=='limits': caps['MemoryMax']='infinity'
        g.show_fields=lambda unit,properties:caps
        def read(path,maximum=65536):
            if str(path)=='/proc/self/cgroup': return 'foreign' if fault=='cgroup' else '0::/system.slice/puni-offline-install.service'
            if str(path).endswith('/memory.max'): return '0' if fault=='kernel' else '536870912'
            if str(path).endswith('/memory.swap.max'): return '1' if fault=='swap' else '0'
            if str(path).endswith('/pids.max'): return '64'
            raise AssertionError(path)
        g.read_text=read
        native_policy=g.suppress_starts
        g.suppress_starts=lambda path,nonce:native_policy(root/'policy-rc.d',nonce)
        installs = [0]
        native_run=g.run
        def execute(command, **options):
            if command[0]=='/usr/bin/dpkg-deb':
                name=pathlib.Path(os.readlink('/proc/self/fd/'+str(options['pass_fds'][0]))).name.removesuffix('.deb')
                pin=g.PACKAGES[name]
                version='foreign' if fault=='metadata' else pin[0]
                if fault=='path-before' and name=='docker-ce':
                    replacement=root/'replacement';replacement.write_bytes(b'docker-ce');os.replace(replacement,root/'docker-ce.deb')
                return 'Package: '+name+'\nVersion: '+version+'\nArchitecture: '+pin[1]+'\n'
            if command[:2]==['/usr/bin/dpkg','--install']:
                installs[0]+=1
                if fault in ('expected-stderr','unexpected-stderr'):
                    if fault=='unexpected-stderr': return native_run([sys.executable,'-c',"import sys;sys.stderr.write('unexpected diagnostic\\n')"],**options)
                    return native_run([sys.executable,'-c',"import sys;sys.stderr.write(\"/usr/sbin/policy-rc.d returned 101, not running 'start containerd.service'\\n\")"],**options)
                if fault=='exit': raise g.Refusal('command-exit')
                if fault=='changed': (root/'docker-ce.deb').write_bytes(b'z'*len('docker-ce'))
                if fault=='path-changed':
                    replacement=root/'replacement';replacement.write_bytes(b'docker-ce');os.replace(replacement,root/'docker-ce.deb')
                return ''
            if command[0]=='/usr/bin/dpkg-query':
                name=command[-1]
                pin=(g.PACKAGES if name in g.PACKAGES else g.PREREQUISITES)[name]
                return name+'\t'+pin[0]+'\t'+pin[1]+'\t'+('install ok unpacked' if fault=='configured' else 'install ok installed')+'\n'
            if command[:2]==['/usr/bin/dpkg','--verify']: return 'changed' if fault=='verify' else ''
            raise AssertionError(command)
        g.run=execute
        native_write=os.write
        if fault=='policy-short-write':
            def short_write(fd,content): return native_write(fd,content[:-1])
            os.write=short_write
        try:
            g.install_packages(request)
            print('accepted')
        finally:
            os.write=native_write
            print('installCalls='+str(installs[0]))
elif case.startswith('json-'):
    texts = {'nested': '{"safe":{"n":1,"n":2}}', 'nan':'{"n":NaN}', 'large': '{"n":"'+'x'*65537+'"}', 'valid':'{"n":0}'}
    print(json.dumps(g.parse_json(texts[case[5:]])))
elif case.startswith('counts-'):
    counts = {'containers': 0, 'running': 0, 'paused': 0, 'stopped': 0, 'images': 0}
    fault = case[7:]
    if fault == 'boolean': counts['containers'] = False
    if fault == 'float': counts['containers'] = 0.0
    if fault == 'nonzero': counts['images'] = 1
    if fault == 'missing': del counts['running']
    g.require_empty(counts)
    print('accepted')
elif case.startswith('identity-'):
    facts = {'vendor':'QEMU', 'product':'Puni bounded baseline', 'uuid':'12345678-90ab-cdef-1234-567890abcdef', 'instance':'puniq-'+request['nonce'], 'cloud':'nocloud', 'rootSource':'/dev/vda1', 'rootSectors':16777216, 'network':['lo'], 'uid':0}
    fault = case[9:]
    if fault in facts: facts[fault] = 'foreign'
    g.require_guest_identity(facts, request)
    print('accepted')
elif case.startswith('packages-'):
    fault = case[9:]
    def package_query(command, **options):
        name = command[-1]
        version, arch = g.PREREQUISITES[name]
        status = 'install ok installed'
        if fault == 'status': status = 'install ok unpacked'
        if fault == 'version': version = '0'
        if fault == 'arch': arch = 'arm64'
        return name+'\t'+version+'\t'+arch+'\t'+status+'\n'
    g.require_configured(g.PREREQUISITES, package_query)
    print('accepted')
elif case.startswith('service-'):
    fields = {'LoadState':'loaded','ActiveState':'active','SubState':'running','InvocationID':'1'*32,'MainPID':'42','ExecMainStartTimestampMonotonic':'1234','ControlGroup':'/system.slice/docker.service','MemoryMax':'536870912','MemorySwapMax':'0','TasksMax':'64','NRestarts':'0','Restart':'no','KillMode':'control-group','TimeoutStopUSec':'30s'}
    fault = case[8:]
    if fault in fields: fields[fault] = '' if fault == 'InvocationID' else 'foreign'
    if fault=='shape': fields['foreign']='extra'
    print(json.dumps(g.require_service_fields('docker.service', fields)))
elif case.startswith('window-'):
    fault = case[7:]
    ticks = [100.0]
    serial = io.StringIO()
    protocol = g.Protocol(request, serial)
    clock_calls=[0]
    def clock():
        clock_calls[0] += 1
        if fault=='short' and clock_calls[0]==62: return 159.0
        if fault=='long' and clock_calls[0]==62: return 166.0
        return ticks[0]
    sleeps=[0]
    def sleep(seconds):
        sleeps[0] += 1
        if fault != 'stalled' and not (fault=='stutter' and sleeps[0]==1): ticks[0] += seconds
        if fault == 'jump': ticks[0] -= 2
    calls = [0]
    def sample():
        calls[0] += 1
        if fault == 'replacement' and calls[0] > 2: raise g.Refusal('service-generation')
        return {'capabilities':g.capture_capabilities(query),'generation':{'unit':'changed' if fault=='changed' and calls[0]>2 else 'unchanged'},'filesystem':{'blocks':1,'freeBlocks':1,'files':1,'freeFiles':1}}
    if fault == 'shutdown':
        def shutdown(): raise g.Refusal('poweroff-request')
    else:
        def shutdown(): return None
    try: g.measure(request, protocol, sample, shutdown, clock, sleep)
    finally: print(serial.getvalue(), end='')
elif case.startswith('generation-'):
    import types
    fault=case[11:]
    def fields(unit, properties):
        if properties==['Requires']: return {'Requires':'foreign' if fault=='requires' else 'docker.socket containerd.service'}
        if unit=='docker.socket':
            values={'LoadState':'loaded','ActiveState':'active','SubState':'listening','Listen':'/run/docker.sock (Stream)','SocketMode':'0660','SocketUser':'root','SocketGroup':'root'}
            if fault=='socket-unit': values['Listen']='/run/foreign.sock (Stream)'
            return values
        if unit in ('system.slice','user.slice'):
            return {'MemoryMax':'0' if fault=='slice' else ('805306368' if unit=='system.slice' else '67108864'),'MemorySwapMax':'0','TasksMax':'256' if unit=='system.slice' else '32'}
        return {'LoadState':'loaded','ActiveState':'active','SubState':'running','InvocationID':('1' if unit=='docker.service' else '2')*32,'MainPID':'42' if unit=='docker.service' else '43','ExecMainStartTimestampMonotonic':'1234','ControlGroup':'/system.slice/'+unit,'MemoryMax':'536870912' if unit=='docker.service' else '134217728','MemorySwapMax':'0','TasksMax':'64' if unit=='docker.service' else '32','NRestarts':'0','Restart':'no','KillMode':'control-group','TimeoutStopUSec':'30s'}
    g.show_fields=fields
    def read(path,maximum=65536):
        if path.endswith('/stat'): return '42 (daemon) S '+' '.join(['1']*18)+('' if fault=='stat' else ' 999')
        if path.endswith('/cgroup'): return 'foreign' if fault=='cgroup' else '0::/system.slice/'+('docker.service' if '/42/' in path else 'containerd.service')
        if path.endswith('/memory.max'): return '0' if fault=='memory' else ('536870912' if 'docker.service' in path else '134217728')
        if path.endswith('/pids.max'): return '64' if 'docker.service' in path else '32'
        if path.endswith('/memory.swap.max'): return '0'
        if path.endswith('/memory.events'): return 'oom 1\noom_kill 0' if fault=='oom' else 'oom 0\noom_kill 0'
        raise AssertionError(path)
    g.read_text=read
    native_readlink=os.readlink; native_lstat=os.lstat; native_bytes=pathlib.Path.read_bytes
    def readlink(path,*args,**kwargs):
        if str(path).startswith('/proc/'):
            return '/usr/bin/foreign' if fault=='executable' else ('/usr/bin/dockerd' if '/42/' in str(path) else '/usr/bin/containerd')
        return native_readlink(path,*args,**kwargs)
    def lstat(path,*args,**kwargs):
        if str(path) in ('/run/docker.sock','/run/containerd/containerd.sock'):
            if fault=='socket-absent': raise FileNotFoundError('controlled-socket-absent')
            if fault=='socket-unreadable': raise PermissionError('controlled-socket-unreadable')
            return types.SimpleNamespace(st_mode=g.stat.S_IFSOCK | (0o666 if fault=='socket-mode' else 0o660),st_uid=0,st_gid=0,st_dev=2,st_ino=3,st_ctime_ns=4)
        return native_lstat(path,*args,**kwargs)
    def read_bytes(path):
        if str(path).startswith('/proc/'):
            if fault=='command': return b'/usr/bin/foreign\0'
            return b'/usr/bin/dockerd\0-H\0fd://\0--containerd=/run/containerd/containerd.sock\0' if '/42/' in str(path) else b'/usr/bin/containerd\0'
        return native_bytes(path)
    g.os.readlink=readlink;g.os.lstat=lstat;g.pathlib.Path.read_bytes=read_bytes
    try: print(json.dumps(g.generation()))
    finally: g.os.readlink=native_readlink;g.os.lstat=native_lstat;g.pathlib.Path.read_bytes=native_bytes
elif case.startswith('sample-'):
    fault = case[7:]
    calls = [0]
    base = {'unit':'original'}
    def generation():
        calls[0] += 1
        if fault == 'before' and calls[0] == 2: return {'unit':'foreign'}
        if fault == 'after' and calls[0] == 3: return {'unit':'foreign'}
        if fault == 'last' and calls[0] == 8: return {'unit':'foreign'}
        return base
    g.generation=generation
    def execute(command, **options):
        if command[-3:-1] == ['version','--format']: return json.dumps(version)
        if command[-3:-1] == ['info','--format']:
            if 'containers' in command[-1]: return json.dumps({'containers':1 if fault=='workload' else 0,'running':0,'paused':0,'stopped':0,'images':0})
            return json.dumps(info)
        raise AssertionError(command)
    g.run=execute
    class Filesystem:
        f_frsize=4096;f_blocks=(8*1024**3)//4096+1 if fault=='disk' else 100;f_files=100;f_bavail=0 if fault=='filesystem' else 50;f_favail=50
    g.os.statvfs=lambda path: Filesystem()
    print(json.dumps(g.collect_sample()))
elif case.startswith('frame-'):
    serial = io.StringIO()
    protocol=g.Protocol(request,serial)
    if case=='frame-size': protocol.emit('measured',projection='x'*65536)
    elif case=='frame-count':
        for count in range(129): protocol.emit('failure',code='fixed')
    else: raise AssertionError(case)
elif case.startswith('install-stderr-'):
    fault=case[15:]
    allowed="/usr/sbin/policy-rc.d returned 101, not running 'start containerd.service'\n"
    if fault=='docker': allowed="/usr/sbin/policy-rc.d returned 101, not running 'start docker.service docker.socket'\n"
    if fault=='both': allowed+="/usr/sbin/policy-rc.d returned 101, not running 'start docker.service docker.socket'\n"
    if fault=='unknown': allowed='unexpected diagnostic\n'
    if fault=='unit-order': allowed="/usr/sbin/policy-rc.d returned 101, not running 'start docker.socket docker.service'\n"
    if fault=='newline': allowed=allowed.rstrip('\n')
    if fault=='carriage': allowed=allowed.replace('\n','\r\n')
    if fault=='duplicate': allowed*=2
    if fault=='flood': allowed='x'*65537
    code='import sys;sys.stderr.write('+repr(allowed)+');print("installed");raise SystemExit('+('4' if fault=='exit' else '0')+')'
    print(g.run([sys.executable,'-c',code],timeout=0.15,stderr_policy=g.require_install_stderr))
elif case.startswith('process-'):
    fault = case[8:]
    code = {'flood': 'import os;os.write(1,b"x"*70000)', 'stderr':'import os;os.write(2,b"x"*70000)', 'deadline':'import time;time.sleep(2)', 'exit':'raise SystemExit(4)', 'valid':'print("safe")'}[fault]
    print(g.run([sys.executable,'-c',code], timeout=0.15))
elif case.startswith('policy-'):
    with tempfile.TemporaryDirectory() as directory:
        path = pathlib.Path(directory)/'policy-rc.d'
        fault = case[7:]
        if fault == 'foreign': path.write_text('foreign')
        with g.suppress_starts(path, request['nonce']):
            if fault == 'replacement':
                path.unlink(); path.write_text('foreign')
            if fault == 'error': raise g.Refusal('injected-install-failure')
        print(json.dumps({'exists':path.exists()}))
else: raise AssertionError(case)
`;
function invoke(case_: string) {
  const controlled =
    'try:\n' +
    harness
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n') +
    '\nexcept Exception as failure:\n    print("PUNI_TEST_FAILURE:"+type(failure).__name__+":"+str(failure), file=sys.stderr)\n    raise SystemExit(1)\n';
  return Bun.spawnSync(['python3', '-c', controlled, helper, case_], {
    env: { PATH: '/usr/bin:/bin' },
  });
}
function accepts(case_: string) {
  const invocation = invoke(case_);
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  return invocation.stdout.toString();
}
function refuses(case_: string, reason?: string) {
  const invocation = invoke(case_);
  expect(invocation.exitCode).not.toBe(0);
  const reasons: Partial<Record<string, string>> = {
    'seed-absent': 'controlled-seed-absent',
    'seed-unreadable': 'controlled-seed-unreadable',
    'seed-type': 'seed-device',
    'seed-writable': 'seed-not-readonly',
    'seed-size': 'seed-size',
    'seed-label': 'seed-label',
    'seed-uppercase-label': 'seed-label',
    'seed-hash': 'seed-package-hash',
    'seed-instance': 'seed-instance',
    'seed-extra': 'seed-members',
    'seed-missing': 'seed-members',
    'seed-directory': 'seed-member-type',
    'seed-package-size': 'seed-package-size',
    'seed-joliet': 'seed-joliet',
    'seed-root-size': 'seed-root-size',
    'seed-member-range': 'seed-member-range',
    'seed-input-size': 'seed-input-size',
    'seed-directory-record': 'seed-directory',
    'seed-descriptor': 'seed-descriptor',
    'installer-guard': 'guest-boundary',
    'installer-limits': 'installer-policy',
    'installer-cgroup': 'installer-cgroup',
    'installer-swap': 'installer-kernel-swap',
    'installer-kernel': 'installer-kernel-caps',
    'installer-hash': 'archive-binding',
    'installer-absent': 'FileNotFoundError',
    'installer-symlink': 'OSError',
    'installer-metadata': 'archive-metadata',
    'installer-exit': 'command-exit',
    'installer-changed': 'archive-changed',
    'installer-path-changed': 'archive-changed',
    'installer-path-before': 'archive-before-install',
    'installer-configured': 'package-configured',
    'installer-verify': 'package-verification',
    'json-nested': 'json-duplicate',
    'json-nan': 'json-nonfinite',
    'json-large': 'json-size',
    'counts-boolean': 'workload-present',
    'counts-float': 'workload-present',
    'counts-nonzero': 'workload-present',
    'counts-missing': 'workload-shape',
    'process-flood': 'command-output',
    'process-stderr': 'command-output',
    'process-deadline': 'command-deadline',
    'process-exit': 'command-exit',
    'window-stalled': 'steady-clock',
    'window-stutter': 'steady-clock',
    'window-short': 'steady-interval',
    'window-long': 'steady-interval',
    'window-changed': 'steady-generation',
    'window-jump': 'steady-clock',
    'window-replacement': 'service-generation',
    'window-shutdown': 'poweroff-request',
    'policy-foreign': 'FileExistsError',
    'policy-replacement': 'policy-replaced',
  };
  const expected =
    reason ??
    reasons[case_] ??
    (case_.startsWith('cap-')
      ? 'capability-'
      : case_.startsWith('identity-')
        ? 'guest-boundary'
        : case_.startsWith('packages-')
          ? 'package-configured'
          : 'service-');
  expect(invocation.stderr.toString()).toContain(expected);
  return invocation.stdout.toString();
}

test('NoCloud renderer binds fixed Python bytes and nonce without keys, NICs or credentials', async () => {
  const seed = await renderLabGuestNoCloud(nonce);
  const config = JSON.parse(seed.userData.slice('#cloud-config\n'.length)) as {
    ssh_keys: unknown;
    ssh_genkeytypes?: unknown;
    users: unknown;
    disable_root: unknown;
    ssh_pwauth: unknown;
    package_update: unknown;
    package_upgrade: unknown;
    write_files: { path: string; content: string }[];
    runcmd: string[][];
  };
  expect(config.ssh_keys).toEqual({});
  expect(config.ssh_genkeytypes).toBeUndefined();
  expect(config.users).toEqual([]);
  expect(config.disable_root).toBe(true);
  expect(config.ssh_pwauth).toBe(false);
  expect(config.package_update).toBe(false);
  expect(config.package_upgrade).toBe(false);
  expect(JSON.parse(seed.networkConfig)).toEqual({ version: 2, ethernets: {} });
  expect(JSON.parse(seed.metaData)).toEqual({
    'instance-id': `puniq-${nonce}`,
    'local-hostname': 'puni-baseline',
  });
  expect(seed.smbios).toEqual({
    manufacturer: 'QEMU',
    product: 'Puni bounded baseline',
    uuid: '12345678-90ab-cdef-1234-567890abcdef',
  });
  const bootstrap = config.write_files.find(
    (entry) => entry.path === '/opt/puni-baseline/bootstrap.py',
  );
  const request = config.write_files.find(
    (entry) => entry.path === '/opt/puni-baseline/request.json',
  );
  if (bootstrap === undefined || request === undefined)
    throw new Error('Missing rendered bootstrap binding');
  expect(bootstrap.content).toBe(await readFile(helper, 'utf8'));
  expect(sha256(bootstrap.content)).toBe(seed.bootstrapSha256);
  expect(JSON.parse(request.content)).toEqual({
    schemaVersion: 1,
    nonce,
    bootstrapSha256: seed.bootstrapSha256,
  });
  expect(sha256(request.content)).toBe(seed.requestSha256);
  expect(config.runcmd).toHaveLength(1);
  expect(config.runcmd[0]).toContain('--property=StandardError=journal+console');
  expect(config.runcmd[0].slice(-3)).toEqual([
    '/usr/bin/python3',
    '/opt/puni-baseline/bootstrap.py',
    '/opt/puni-baseline/request.json',
  ]);
  for (const forbidden of ['ssh_authorized_keys', 'password', 'private_key', 'apt', 'packages'])
    expect(Object.hasOwn(config, forbidden)).toBe(false);
});
for (const invalid of ['', '0'.repeat(31), 'G'.repeat(32), `${nonce}\n`])
  test('renderer rejects malformed nonce before supplying a seed', () => {
    expect(renderLabGuestNoCloud(invalid)).rejects.toThrow();
  });

test('guest capabilities are accepted by existing strict host decoder', () => {
  expect(DockerImageCapabilities.assert(JSON.parse(accepts('cap-valid')))).toEqual({
    daemonId: 'actual-daemon',
    engineVersion: '29.7.2',
    serverApi: '1.55',
    minimumApi: '1.40',
    requestApi: '1.55',
    os: 'linux',
    arch: 'amd64',
    driver: 'overlayfs',
    driverType: 'io.containerd.snapshotter.v1',
  });
});
for (const fault of [
  'engineVersion',
  'serverApi',
  'minimumApi',
  'daemonId',
  'os',
  'arch',
  'driver',
  'missing-store',
  'duplicate-store',
  'foreign-store',
  'wide-store',
  'malformed-row',
  'version-shape',
  'info-shape',
])
  test(`capability projection refuses ${fault}`, () => {
    refuses(`cap-${fault}`);
  });
for (const fault of [
  'MemoryMax',
  'MemorySwapMax',
  'TasksMax',
  'LimitFSIZE',
  'RuntimeMaxUSec',
  'KillMode',
  'Restart',
  'TimeoutStopUSec',
  'MainPID',
  'cgroup',
  'kernel',
])
  test(`collector must actually be bounded before mutation: ${fault}`, () => {
    refuses(`collector-${fault}`, 'collector-');
  });
test('collector accepts its actual finite unit and kernel caps', () => {
  accepts('collector-valid');
});
for (const fault of ['version', 'nonce', 'source', 'shape', 'absent', 'unreadable'])
  test(`request boundary refuses ${fault}`, () => {
    refuses(
      `request-${fault}`,
      (
        {
          version: 'request-version',
          nonce: 'request-nonce',
          source: 'request-source',
          shape: 'request-shape',
          absent: 'FileNotFoundError',
          unreadable: 'IsADirectoryError',
        } as Record<string, string>
      )[fault],
    );
  });
test('request boundary accepts exact source-bound nonce input', () => {
  accepts('request-valid');
});
for (const fault of [
  'absent',
  'unreadable',
  'type',
  'writable',
  'size',
  'label',
  'uppercase-label',
  'hash',
  'instance',
  'extra',
  'missing',
  'directory',
  'package-size',
  'joliet',
  'root-size',
  'member-range',
  'input-size',
  'directory-record',
  'descriptor',
])
  test(`original read-only CD guard refuses ${fault}`, () => {
    refuses(`seed-${fault}`);
  });
test('original read-only CD guard accepts actual producer PVD label bytes and hashes extents', () => {
  accepts('seed-valid');
});
for (const fault of [
  'guard',
  'limits',
  'cgroup',
  'kernel',
  'swap',
  'hash',
  'absent',
  'symlink',
  'metadata',
  'path-before',
])
  test(`installer refuses ${fault} before dpkg writes`, () => {
    expect(refuses(`installer-${fault}`)).toContain('installCalls=0');
  });
for (const fault of ['exit', 'changed', 'path-changed', 'configured', 'verify'])
  test(`installer refuses post-start ${fault}`, () => {
    expect(refuses(`installer-${fault}`)).toContain('installCalls=1');
  });
test('configured installer refuses unknown real-child diagnostics after installation', () => {
  refuses('installer-unexpected-stderr', 'install-stderr');
});
test('configured installer accepts modeled suppression diagnostics from a real child', () => {
  expect(accepts('installer-expected-stderr')).toContain('accepted');
});
test('installer short policy write refuses before dpkg even when cleanup would detect it later', () => {
  const invocation = invoke('installer-policy-short-write');
  expect(invocation.stdout.toString()).toContain('installCalls=0');
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('PUNI_TEST_FAILURE:Refusal:policy-short-write');
});
test('installer validates bounded unit, original archive descriptors and configured status', () => {
  expect(accepts('installer-valid')).toContain('accepted');
});
for (const fault of ['nested', 'nan', 'large'])
  test(`strict guest JSON refuses ${fault}`, () => {
    refuses(`json-${fault}`);
  });
test('strict guest JSON accepts literal integer zero', () => {
  expect(JSON.parse(accepts('json-valid'))).toEqual({ n: 0 });
});
for (const fault of ['boolean', 'float', 'nonzero', 'missing'])
  test(`zero workload counts refuse ${fault}`, () => {
    refuses(`counts-${fault}`);
  });
test('zero workload counts accept all actual integer zero fields', () => {
  accepts('counts-valid');
});
for (const fault of [
  'vendor',
  'product',
  'uuid',
  'instance',
  'cloud',
  'rootSource',
  'rootSectors',
  'network',
  'uid',
])
  test(`guest mutation boundary refuses ${fault}`, () => {
    refuses(`identity-${fault}`);
  });
test('guest identity accepts exact selected QEMU facts', () => {
  accepts('identity-valid');
});
for (const fault of ['status', 'version', 'arch'])
  test(`configured prerequisite guard refuses ${fault}`, () => {
    refuses(`packages-${fault}`);
  });
test('configured prerequisite guard accepts exact status/version/architecture', () => {
  accepts('packages-valid');
});
for (const fault of [
  'LoadState',
  'ActiveState',
  'SubState',
  'InvocationID',
  'MainPID',
  'ExecMainStartTimestampMonotonic',
  'ControlGroup',
  'MemoryMax',
  'MemorySwapMax',
  'TasksMax',
  'NRestarts',
  'Restart',
  'KillMode',
  'TimeoutStopUSec',
  'shape',
])
  test(`service generation/cap guard refuses ${fault}`, () => {
    refuses(`service-${fault}`);
  });
test('merged service guard accepts exact finite observed limits', () => {
  accepts('service-valid');
});
for (const fault of [
  'stat',
  'cgroup',
  'memory',
  'oom',
  'executable',
  'command',
  'socket-absent',
  'socket-unreadable',
  'socket-mode',
  'requires',
  'socket-unit',
  'slice',
])
  test(`actual generation decoder refuses ${fault}`, () => {
    refuses(
      `generation-${fault}`,
      (
        {
          stat: 'process-stat',
          cgroup: 'service-cgroup',
          memory: 'service-kernel-caps',
          oom: 'service-oom',
          executable: 'service-executable',
          command: 'service-command',
          'socket-absent': 'controlled-socket-absent',
          'socket-unreadable': 'controlled-socket-unreadable',
          'socket-mode': 'service-socket',
          requires: 'docker-socket-dependency',
          'socket-unit': 'docker-socket-unit',
          slice: 'slice-policy',
        } as Record<string, string>
      )[fault],
    );
  });
test('actual generation decoder accepts merged units, kernel caps, process start and socket identities', () => {
  accepts('generation-valid');
});
for (const fault of ['vendor', 'filesystem', 'swap', 'cdrom'])
  test(`native guest entry checks refuse ${fault}`, () => {
    refuses(
      `guard-${fault}`,
      (
        {
          vendor: 'guest-boundary-vendor',
          filesystem: 'root-filesystem',
          swap: 'guest-swap',
          cdrom: 'seed-not-cdrom',
        } as Record<string, string>
      )[fault],
    );
  });
test('native guest entry checks accept exact prerequisite and selected machine facts', () => {
  accepts('guard-valid');
});
for (const fault of [
  'read',
  'stderr',
  'duplicate-unit',
  'missing-unit',
  'configuration',
  'short-policy',
  'missing-shutdown',
  'short-read',
  'arguments',
  'readiness',
  'mount',
])
  test(`bounded primitive refuses ${fault}`, () => {
    refuses(
      `primitive-${fault}`,
      (
        {
          read: 'read-size',
          stderr: 'command-stderr',
          'duplicate-unit': 'unit-fields',
          'missing-unit': 'unit-fields-missing',
          configuration: 'config-write',
          'short-policy': 'policy-short-write',
          'missing-shutdown': 'shutdown-missing',
          'short-read': 'seed-short-read',
          arguments: 'arguments',
          readiness: 'readiness-deadline',
          mount: 'seed-mount',
        } as Record<string, string>
      )[fault],
    );
  });
for (const fault of ['filesystem', 'disk'])
  test(`sample refuses invalid ${fault}`, () => {
    refuses(
      `sample-${fault}`,
      fault === 'filesystem' ? 'filesystem-geometry' : 'filesystem-boundary',
    );
  });
for (const fault of ['before', 'after', 'last', 'workload'])
  test(`sample refuses ${fault} across actual query fences`, () => {
    refuses(`sample-${fault}`, fault === 'workload' ? 'workload-present' : 'service-generation');
  });
test('sample accepts the stable generation and safe live filesystem projection', () => {
  expect(
    (JSON.parse(accepts('sample-valid')) as { filesystem: { freeFiles: number } }).filesystem
      .freeFiles,
  ).toBeGreaterThan(0);
});
for (const fault of ['size', 'count'])
  test(`serial protocol refuses frame ${fault}`, () => {
    refuses(`frame-${fault}`, `frame-${fault}`);
  });
for (const fault of ['containerd', 'docker', 'both'])
  test(`offline installer accepts only modeled policy stderr: ${fault}`, () => {
    expect(accepts(`install-stderr-${fault}`).trim()).toBe('installed');
  });
for (const fault of ['unknown', 'duplicate', 'unit-order', 'newline', 'carriage', 'exit', 'flood'])
  test(`offline installer still refuses stderr ${fault}`, () => {
    refuses(
      `install-stderr-${fault}`,
      fault === 'exit' ? 'command-exit' : fault === 'flood' ? 'command-output' : 'install-stderr',
    );
  });
for (const fault of ['flood', 'stderr', 'deadline', 'exit'])
  test(`real bounded child refuses ${fault}`, () => {
    refuses(`process-${fault}`);
  });
test('real bounded child accepts tiny successful output', () => {
  expect(accepts('process-valid').trim()).toBe('safe');
});
for (const fault of [
  'stalled',
  'stutter',
  'jump',
  'short',
  'long',
  'changed',
  'replacement',
  'shutdown',
])
  test(`measurement refuses ${fault} without final success`, () => {
    expect(refuses(`window-${fault}`)).not.toContain('"kind":"final"');
  });
test('measurement emits measured then final only after real interval and accepted shutdown request', () => {
  const frames = accepts('window-valid')
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line.slice('PUNI_BASELINE '.length)) as {
          kind: string;
          elapsedSeconds: number;
          samples: number;
          poweroffRequested: boolean;
          nonce: string;
          hostCleanupVerified: boolean;
        },
    );
  expect(frames.map((frame) => frame.kind)).toEqual(['measured', 'final']);
  expect(frames[0].elapsedSeconds).toBeGreaterThanOrEqual(60);
  expect(frames[0].samples).toBeGreaterThanOrEqual(2);
  expect(frames[1].poweroffRequested).toBe(true);
  expect(frames.every((frame) => frame.nonce === nonce)).toBe(true);
  expect(frames[1].hostCleanupVerified).toBe(false);
});
for (const fault of ['foreign', 'replacement'])
  test(`temporary start policy refuses ${fault}`, () => {
    refuses(`policy-${fault}`);
  });
test('temporary start policy removes only its original owned file', () => {
  expect(JSON.parse(accepts('policy-valid'))).toEqual({ exists: false });
});
test('real entrypoint refuses this host before guest mutations', async () => {
  const requestPath = '/tmp/puni-guest-bootstrap/host-refusal.json';
  await Bun.write(
    requestPath,
    JSON.stringify({ schemaVersion: 1, nonce, bootstrapSha256: sha256(await readFile(helper)) }),
  );
  const invocation = Bun.spawnSync(['python3', helper, requestPath], {
    env: { PATH: '/usr/bin:/bin' },
  });
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr.toString()).toContain('guest-boundary');
  expect(invocation.stdout.toString()).toBe('');
});

const bootstrapControl = String.raw`
import builtins,importlib.util,json,os,pathlib,sys,tempfile
spec=importlib.util.spec_from_file_location('bootstrap',sys.argv[1]);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
host_spec=importlib.util.spec_from_file_location('host',sys.argv[2]);host=importlib.util.module_from_spec(host_spec);host_spec.loader.exec_module(host)
fault=sys.argv[3]
request={'schemaVersion':1,'nonce':'1234567890abcdef1234567890abcdef','bootstrapSha256':g.hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest()}
values={'/sys/class/dmi/id/sys_vendor':'foreign' if fault=='host-vendor' else 'QEMU','/sys/class/dmi/id/product_name':'foreign' if fault=='host-product' else 'Puni bounded baseline','/sys/class/dmi/id/product_uuid':'12345678-90ab-cdef-1234-567890abcdef','/var/lib/cloud/data/instance-id':'puniq-'+request['nonce'],'/sys/class/block/vda/size':'16777216','/sys/class/block/sr0/device/type':'5','/proc/uptime':'601 0' if fault=='readiness' else '161 0','/proc/self/cgroup':'0::/system.slice/puni-baseline.service','/sys/fs/cgroup/system.slice/puni-baseline.service/memory.max':'134217728','/sys/fs/cgroup/system.slice/puni-baseline.service/memory.swap.max':'0','/sys/fs/cgroup/system.slice/puni-baseline.service/pids.max':'32'}
g.read_text=lambda path,maximum=65536:values[str(path)]
native_listdir=os.listdir;os.listdir=lambda path:['lo'] if path=='/sys/class/net' else native_listdir(path)
os.geteuid=lambda:0
fields={'MemoryMax':'0' if fault=='collector' else '134217728','MemorySwapMax':'0','TasksMax':'32','LimitFSIZE':'65536','RuntimeMaxUSec':'12min 30s','KillMode':'control-group','Restart':'no','TimeoutStopUSec':'30s','MainPID':str(os.getpid())}
g.show_fields=lambda unit,properties:fields
seed_checks=[]
def inspect(request):
    seed_checks.append(True)
    if fault=='seed':raise g.Refusal('seed-label')
g.inspect_seed=inspect
sample={'capabilities':{'engineVersion':'29.7.2','serverApi':'1.55','minimumApi':'1.40','daemonId':'selected-daemon','os':'linux','arch':'amd64','driver':'overlayfs','driverType':'io.containerd.snapshotter.v1','requestApi':'1.55'},'counts':dict.fromkeys(('containers','running','paused','stopped','images'),0),'filesystem':{'fragmentBytes':4096,'blocks':100,'freeBlocks':50,'files':100,'freeFiles':50},'generation':{}}
for unit,memory,tasks,executable in [('docker.service',536870912,64,'/usr/bin/dockerd'),('containerd.service',134217728,32,'/usr/bin/containerd')]:
    unit_fields={'LoadState':'loaded','ActiveState':'active','SubState':'running','InvocationID':'a'*32,'MainPID':'12','ExecMainStartTimestampMonotonic':'123','ControlGroup':'/system.slice/'+unit,'MemoryMax':str(memory),'MemorySwapMax':'0','TasksMax':str(tasks),'NRestarts':'0','Restart':'no','KillMode':'control-group','TimeoutStopUSec':'30s'}
    sample['generation'][unit]={'unit':unit_fields,'processStart':'123','executable':executable}
for path in ['/run/docker.sock','/run/containerd/containerd.sock']:sample['generation'][path]=[1,2,3,0,0,432]
sample['generation']['docker.socket']={'LoadState':'loaded','ActiveState':'active','SubState':'listening','Listen':'/run/docker.sock (Stream)','SocketMode':'0660','SocketUser':'root','SocketGroup':'root'}
for unit,memory,tasks in [('system.slice',805306368,256),('user.slice',67108864,32)]:sample['generation'][unit]={'MemoryMax':str(memory),'MemorySwapMax':'0','TasksMax':str(tasks)}
host.check_sample(sample)
native_measure=g.measure;ticks=[0]
def measure(request,protocol,shutdown):
    def sleep(seconds):ticks[0]+=seconds
    return native_measure(request,protocol,sample=lambda:sample,shutdown=shutdown,clock=lambda:ticks[0],sleep=sleep)
g.measure=measure
with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory);serial=root/'serial';serial.write_bytes(b'');marker=root/'mutation';marker.write_bytes(b'untouched')
    g.SEED=root/'seed';serial_opens=[];install_calls=[];poweroffs=[];mutations=[]
    native_open=builtins.open;native_mkdir=pathlib.Path.mkdir
    def opened(path,*arguments,**keywords):
        if str(path)=='/dev/ttyS0':serial_opens.append(True);return native_open(serial,*arguments,**keywords)
        return native_open(path,*arguments,**keywords)
    builtins.open=opened
    def mkdir(path,*arguments,**keywords):
        if str(path)=='/run/puni-baseline/docker-client':path=root/'client'
        mutations.append(str(path));return native_mkdir(path,*arguments,**keywords)
    pathlib.Path.mkdir=mkdir
    def policy():marker.write_bytes(b'policy');mutations.append('policy')
    g.write_policy=policy
    def execute(command,**options):
        if command[0]=='/usr/bin/cloud-id':return 'nocloud\n'
        if command[0]=='/usr/bin/findmnt':
            return '/dev/vda1' if command[-2]=='SOURCE' else ('ext4' if command[-2]=='FSTYPE' else '/dev/sr0 iso9660 ro,nosuid,nodev,noexec')
        if command[0]=='/usr/sbin/swapon':return ''
        if command[0]=='/usr/bin/dpkg-query':
            name=command[-1];version,architecture=(g.PREREQUISITES if name in g.PREREQUISITES else g.PACKAGES)[name][:2]
            return name+'\t'+version+'\t'+architecture+'\tinstall ok installed\n'
        if command[0]=='/usr/bin/mount':
            if fault=='mount':raise g.Refusal('controlled-mount-refusal')
            return ''
        if command[0]=='/usr/bin/cloud-init':
            if fault=='schema':raise g.Refusal('command-exit')
            return ''
        if command[0]=='/usr/bin/systemd-run':
            install_calls.append(True)
            if fault=='install':raise g.Refusal('controlled-install-refusal')
            return ''
        if command[0]=='/usr/bin/systemctl':
            if command[-1]=='poweroff':poweroffs.append(True)
            return ''
        raise AssertionError(command)
    g.run=execute
    failure=None
    try:g.bootstrap(request)
    except g.Refusal as refused:failure=str(refused)
    finally:builtins.open=native_open;pathlib.Path.mkdir=native_mkdir
    content=serial.read_bytes();collector=host.SerialCollector(request,0);host_refusal=None;finished=None
    try:
        collector.feed(content,60)
        finished=collector.finish()
    except host.raw.PreparationRefusal as refused:host_refusal=str(refused)
    frames=[json.loads(line[len('PUNI_BASELINE '):]) for line in content.decode().splitlines()]
    print(json.dumps({'failure':failure,'serialOpens':len(serial_opens),'serialBytes':len(content),'frames':frames,'mutation':marker.read_text(),'mutations':len(mutations),'installCalls':len(install_calls),'poweroffs':len(poweroffs),'hostRefusal':host_refusal,'hostFinished':finished is not None,'seedChecks':len(seed_checks)}))
`;
function bootstrapOutcome(fault: string) {
  const invocation = Bun.spawnSync(
    [
      'python3',
      '-I',
      '-B',
      '-c',
      bootstrapControl,
      helper,
      join(import.meta.dir, 'lab-guest-preparation.py'),
      fault,
    ],
    { env: { PATH: '/usr/bin:/bin' }, timeout: 10000, maxBuffer: 65536 },
  );
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  return JSON.parse(invocation.stdout.toString()) as {
    failure: string | null;
    serialOpens: number;
    serialBytes: number;
    frames: {
      schemaVersion: 1;
      kind: string;
      nonce: string;
      bootstrapSha256: string;
      code?: string;
    }[];
    mutation: string;
    mutations: number;
    installCalls: number;
    poweroffs: number;
    hostRefusal: string | null;
    hostFinished: boolean;
    seedChecks: number;
  };
}
for (const fault of ['seed', 'collector', 'readiness'])
  test(`admitted bootstrap ${fault} refusal emits one original Protocol frame before mutation`, async () => {
    const outcome = bootstrapOutcome(fault);
    expect(outcome.failure).toBe(
      (
        {
          seed: 'seed-label',
          collector: 'collector-policy',
          readiness: 'readiness-deadline',
        } as Record<string, string>
      )[fault],
    );
    expect(outcome.serialOpens).toBe(1);
    expect(outcome.frames).toEqual([
      {
        schemaVersion: 1,
        nonce,
        bootstrapSha256: sha256(await readFile(helper)),
        kind: 'failure',
        code: 'guest-baseline-refused',
      },
    ]);
    expect(outcome.serialBytes).toBeLessThanOrEqual(65536);
    expect(outcome.mutation).toBe('untouched');
    expect(outcome.mutations).toBe(0);
    expect(outcome.installCalls).toBe(0);
    expect(outcome.poweroffs).toBe(0);
    expect(outcome.hostRefusal).toBe('guest-frame-order');
    expect(outcome.hostFinished).toBe(false);
  });
for (const fault of ['mount', 'schema', 'install'])
  test(`admitted bootstrap ${fault} refusal emits exactly one failure frame`, () => {
    const outcome = bootstrapOutcome(fault);
    expect(outcome.failure).not.toBeNull();
    expect(outcome.frames.map((frame) => frame.kind)).toEqual(['failure']);
    expect(outcome.hostRefusal).toBe('guest-frame-order');
    expect(outcome.hostFinished).toBe(false);
    expect(outcome.poweroffs).toBe(0);
  });
for (const fault of ['vendor', 'product'])
  test(`bootstrap host ${fault} boundary refuses before serial or mutation`, () => {
    const outcome = bootstrapOutcome(`host-${fault}`);
    expect(outcome.failure).toBe(fault === 'vendor' ? 'guest-boundary-vendor' : 'guest-boundary');
    expect(outcome.serialOpens).toBe(0);
    expect(outcome.serialBytes).toBe(0);
    expect(outcome.frames).toEqual([]);
    expect(outcome.mutation).toBe('untouched');
    expect(outcome.mutations).toBe(0);
    expect(outcome.installCalls).toBe(0);
    expect(outcome.seedChecks).toBe(0);
  });
test('bootstrap success remains exactly measured/final through original host EOF consumer', () => {
  const outcome = bootstrapOutcome('valid');
  expect(outcome.failure).toBeNull();
  expect(outcome.frames.map((frame) => frame.kind)).toEqual(['measured', 'final']);
  expect(outcome.serialOpens).toBe(1);
  expect(outcome.installCalls).toBe(1);
  expect(outcome.poweroffs).toBe(1);
  expect(outcome.hostRefusal).toBeNull();
  expect(outcome.hostFinished).toBe(true);
});

test('console-routed bootstrap diagnostics keep arbitrary private paths out of stderr', () => {
  const invocation = Bun.spawnSync(
    ['python3', '-I', '-B', helper, '/controlled-private-secret/missing-bootstrap-request'],
    { env: { PATH: '/usr/bin:/bin' }, timeout: 10000, maxBuffer: 65536 },
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout.toString()).toBe('');
  expect(invocation.stderr.toString()).toBe('Puni guest bootstrap refused: FileNotFoundError\n');
});
