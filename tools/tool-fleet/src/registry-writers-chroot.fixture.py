import ctypes,json,mmap,os,re,select,signal,sys,threading

mode,empty,store,ancestor=sys.argv[1:]
if os.geteuid()!=0 or mode not in ['safe','alias','retained-effective','retained-permitted','thread','virtual','root','cwd','directory','ancestor','descriptor','mapping','same-device']:raise RuntimeError('Invalid owned chroot fixture')
libc=ctypes.CDLL(None,use_errno=True)

class CapabilityHeader(ctypes.Structure):
    _fields_=[('version',ctypes.c_uint32),('pid',ctypes.c_int)]

class CapabilityWords(ctypes.Structure):
    _fields_=[('effective',ctypes.c_uint32),('permitted',ctypes.c_uint32),('inheritable',ctypes.c_uint32)]

def set_chroot_capability(effective):
    if ctypes.sizeof(CapabilityHeader)!=8 or ctypes.sizeof(CapabilityWords)!=12:raise RuntimeError('Unsupported owned capability ABI')
    libc.capset.argtypes=[ctypes.POINTER(CapabilityHeader),ctypes.POINTER(CapabilityWords)]
    libc.capget.argtypes=[ctypes.POINTER(CapabilityHeader),ctypes.POINTER(CapabilityWords)]
    header=CapabilityHeader(0x20080522,0);words=(CapabilityWords*2)()
    words[0].permitted=1<<18;words[0].effective=(1<<18) if effective else 0
    if libc.capset(ctypes.byref(header),words)!=0:raise OSError(ctypes.get_errno(),'Owned CAP_SYS_CHROOT retention unavailable')
    observed=(CapabilityWords*2)()
    if libc.capget(ctypes.byref(header),observed)!=0:raise OSError(ctypes.get_errno(),'Owned capability ABI observation unavailable')
    if header.version!=0x20080522 or any((actual.effective,actual.permitted,actual.inheritable)!=(expected.effective,expected.permitted,expected.inheritable) for actual,expected in zip(observed,words)):raise RuntimeError('Owned capability ABI receipt mismatch')

def set_dumpable():
    if libc.prctl(4,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'Owned dumpable process unavailable')

def drop_uid():
    os.setgroups([]);os.setgid(59001);os.setuid(59001)

def read_path_receipt(pid,name):
    opened=os.open('/proc/'+str(pid)+'/'+name,os.O_PATH|os.O_DIRECTORY)
    try:
        identity=os.fstat(opened)
        with open('/proc/self/fdinfo/'+str(opened),'r') as receipt:information=receipt.read(8193)
        mounts=re.findall(r'^mnt_id:[ \t]+([1-9][0-9]*)$',information,re.M)
        if len(information)>8192 or len(mounts)!=1:raise RuntimeError('Missing bounded owned path mount identity')
        return {'device':str(identity.st_dev),'inode':str(identity.st_ino),'mount':mounts[0]}
    finally:os.close(opened)

def read_status_receipt(pid):
    with open('/proc/'+str(pid)+'/status','r') as receipt:status=receipt.read(16385)
    if len(status)>16384:raise RuntimeError('Oversized owned process status')
    observed={}
    for name in ['Uid','CapEff','CapPrm','CapInh','CapAmb','CapBnd','NoNewPrivs']:
        matches=re.findall(r'^'+name+r':[ \t]+([^\n]+)$',status,re.M)
        if len(matches)!=1:raise RuntimeError('Missing owned process '+name)
        observed[name]=' '.join(matches[0].split())
    if re.fullmatch(r'[0-9]+( [0-9]+){3}',observed['Uid']) is None:raise RuntimeError('Invalid owned process Uid')
    if any(re.fullmatch(r'[0-9a-f]{16}',observed[name]) is None for name in ['CapEff','CapPrm','CapInh','CapAmb','CapBnd']):raise RuntimeError('Invalid owned process capabilities')
    if observed['NoNewPrivs'] not in ['0','1']:raise RuntimeError('Invalid owned process NoNewPrivs')
    return observed

if mode=='virtual':os.chdir(ancestor)
control_read,control_write=os.pipe();ack_read,ack_write=os.pipe();owner=os.getpid()
child=os.fork()
if child==0:
    os.close(control_write);os.close(ack_read)
    try:
        descriptor=None;shared=None
        if mode in ['directory','ancestor']:descriptor=os.open(store if mode=='directory' else ancestor,os.O_RDONLY|os.O_DIRECTORY)
        if mode in ['descriptor','mapping']:
            descriptor=os.open(store+'/content',os.O_RDWR)
            if mode=='mapping':shared=mmap.mmap(descriptor,4096,flags=mmap.MAP_SHARED,prot=mmap.PROT_WRITE|mmap.PROT_READ,trackfd=False);os.close(descriptor);descriptor=None
        if mode=='thread':
            thread_ready=threading.Event();thread_continue=threading.Event();thread_done=threading.Event();thread_stop=threading.Event();thread_failures=[]
            def write_from_thread():
                try:
                    if libc.unshare(0x200)!=0:raise OSError(ctypes.get_errno(),'Owned thread CLONE_FS unavailable')
                    os.chdir(store)
                    if libc.prctl(38,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'Owned thread NoNewPrivs unavailable')
                    thread_ready.set();thread_continue.wait()
                    if thread_stop.is_set():return
                    opened=os.open('sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                    try:
                        if os.write(opened,b'held')!=4:raise RuntimeError('Incomplete owned thread write')
                    finally:os.close(opened)
                    thread_done.set();thread_stop.wait()
                except BaseException as failure:thread_failures.append(failure);thread_ready.set();thread_done.set()
            worker=threading.Thread(target=write_from_thread);worker.start()
            if not thread_ready.wait(5):raise RuntimeError('Owned thread setup expired')
            if thread_failures:raise RuntimeError('Owned thread setup failed') from thread_failures[0]
        if mode=='cwd':os.chdir(store)
        if mode=='alias':os.chdir(empty)
        os.chroot(empty.replace('/access/empty/','/aliases/',1) if mode=='alias' else '/proc/'+str(owner) if mode=='virtual' else store if mode in ['root','same-device'] else empty)
        if mode not in ['cwd','alias']:os.chdir('/')
        if mode in ['retained-effective','retained-permitted'] and libc.prctl(8,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'Owned KEEPCAPS unavailable')
        drop_uid()
        if mode in ['retained-effective','retained-permitted']:set_chroot_capability(mode=='retained-effective')
        if libc.prctl(38,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'Owned NoNewPrivs unavailable')
        set_dumpable()
        if mode=='virtual':
            os.write(ack_write,b'{"kind":"rooted"}\n')
            if os.read(control_read,1)!=b'p':raise RuntimeError('Owned proc parent profile not acknowledged')
        if libc.prctl(1,signal.SIGKILL,0,0,0)!=0 or os.getppid()!=owner:raise RuntimeError('Owned chroot lifetime unavailable')
        for standard in [0,1,2]:os.close(standard)
        os.write(ack_write,b'{"kind":"ready"}\n')
        while True:
            command=os.read(control_read,1)
            if command==b'':break
            if command!=b'w':raise RuntimeError('Unknown owned chroot command')
            if mode=='alias':opened=os.open('../../store/alias/sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            elif mode in ['retained-effective','retained-permitted']:
                if mode=='retained-permitted':set_chroot_capability(True)
                os.mkdir('inner',0o700);os.chroot('inner');os.chdir('../..')
                opened=os.open('store/'+mode+'/sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            elif mode=='thread':
                thread_continue.set()
                if not thread_done.wait(5):raise RuntimeError('Owned thread write expired')
                if thread_failures:raise RuntimeError('Owned thread write failed') from thread_failures[0]
                opened=None
            elif mode=='virtual':opened=os.open('/cwd/store/virtual/sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            elif mode in ['root','cwd','same-device']:opened=os.open('/sentinel' if mode in ['root','same-device'] else 'sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            elif mode in ['directory','ancestor']:opened=os.open('sentinel' if mode=='directory' else 'store/ancestor/sentinel',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600,dir_fd=descriptor)
            elif mode=='descriptor':opened=descriptor
            elif mode=='mapping':
                shared[:4]=b'held';shared.flush();opened=None
            else:raise RuntimeError('Harmless fixture cannot write ordinary storage')
            if opened is not None:
                try:
                    if os.write(opened,b'held')!=4:raise RuntimeError('Incomplete owned storage write')
                finally:
                    if mode!='descriptor':os.close(opened)
            os.write(ack_write,b'{"kind":"written"}\n')
        if mode=='thread':
            thread_stop.set();thread_continue.set();worker.join(5)
            if worker.is_alive():raise RuntimeError('Owned writer thread survived shutdown')
        if shared is not None:shared.close()
        if descriptor is not None:os.close(descriptor)
        os.close(control_read);os.close(ack_write);os._exit(0)
    except BaseException as failure:
        os.write(ack_write,(json.dumps({'kind':'failed','message':str(failure)[:1000]})+'\n').encode());os._exit(70)
os.close(control_read);os.close(ack_write)
def read_receipt():
    observed=b''
    while not observed.endswith(b'\n'):
        if not select.select([ack_read],[],[],5)[0]:raise RuntimeError('Owned chroot receipt expired')
        block=os.read(ack_read,4096)
        if not block or len(observed)+len(block)>8192:raise RuntimeError('Missing bounded owned chroot receipt')
        observed+=block
    frame=json.loads(observed)
    if frame['kind']=='failed':raise RuntimeError('Owned chroot child failed: '+frame['message'])
    return frame
try:
    if mode=='virtual':
        if read_receipt()!={'kind':'rooted'}:raise RuntimeError('Owned proc root not established')
        drop_uid();set_dumpable()
        if os.write(control_write,b'p')!=1:raise RuntimeError('Owned proc parent profile acknowledgement incomplete')
    if read_receipt()!={'kind':'ready'}:raise RuntimeError('Owned chroot child not ready')
    print(json.dumps({'pid':child,'root':read_path_receipt(child,'root'),'cwd':read_path_receipt(child,'cwd'),'status':read_status_receipt(child)}),flush=True)
    while True:
        if not select.select([0],[],[],30)[0]:raise RuntimeError('Owned chroot control expired')
        command=os.read(0,64)
        if command==b'':break
        if command!=b'write\n':raise RuntimeError('Unknown owned parent control')
        if os.write(control_write,b'w')!=1:raise RuntimeError('Owned chroot control incomplete')
        print(json.dumps(read_receipt()),flush=True)
finally:
    os.close(control_write)
    waited,status=os.waitpid(child,0);os.close(ack_read)
    if waited!=child or not os.WIFEXITED(status) or os.WEXITSTATUS(status)!=0:raise RuntimeError('Owned chroot child did not close normally')
