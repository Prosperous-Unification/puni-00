import { join } from 'node:path';

import { expect, test } from 'bun:test';

const program = String.raw`
import ctypes, importlib.util, json, os, pathlib, signal, subprocess, sys, tempfile, time
spec=importlib.util.spec_from_file_location('writer',sys.argv[1])
w=importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
case=sys.argv[2]
def refuses(operation, category):
    try: operation()
    except w.raw.PreparationRefusal as failure:
        assert str(failure)==category, (str(failure),category)
        return
    raise AssertionError('protected operation admitted: '+category+' calls='+repr(globals().get('calls')))
if case=='direct':
    calls=[]
    def syscall(number,*arguments):
        calls.append((number,arguments)); return 1048576 if number in (17,18) else 0
    w.native_call=syscall
    with w.AlignedBuffer() as buffer:
        assert buffer.address%4096==0 and buffer.length==1048576
        w.rewrite_step(9,buffer,0)
        w.rewrite_step(9,buffer,1048576)
    assert [number for number,_ in calls]==[17,18,74,17,18,74]
    assert [arguments[-1].value for number,arguments in calls if number in (17,18)]==[0,0,1048576,1048576]
    for number,reply,category in [(17,-1,'repair-read-failed'),(17,4096,'repair-read-failed'),
                                  (18,-1,'repair-write-failed'),(18,4096,'repair-write-failed'),
                                  (74,-1,'repair-sync-failed')]:
        calls.clear()
        def broken(operation,*arguments):
            calls.append(operation)
            return reply if operation==number else (1048576 if operation in (17,18) else 0)
        w.native_call=broken
        with w.AlignedBuffer() as buffer: refuses(lambda:w.rewrite_step(9,buffer,0),category)
        assert calls==([17] if number==17 else [17,18] if number==18 else [17,18,74]), calls
elif case=='width':
    calls=[]
    class Syscall:
        def __call__(self,number,*arguments):
            assert type(number) is ctypes.c_long
            calls.append((number.value,arguments))
            return 1048576 if number.value in (17,18) else 0
    syscall=Syscall()
    w.ctypes.CDLL=lambda *arguments,**keywords:type('Library',(),{'syscall':syscall})()
    with w.AlignedBuffer() as buffer:
        for offset in [2147483648,4294967296,8588886016]:
            w.rewrite_step(9,buffer,offset);w.allocate_block(9,offset)
    assert syscall.restype is ctypes.c_long
    for number,arguments in calls:
        assert type(arguments[0]) is ctypes.c_int
        if number in (17,18):
            assert type(arguments[1]) is ctypes.c_void_p and type(arguments[2]) is ctypes.c_size_t
            assert type(arguments[3]) in (ctypes.c_long,ctypes.c_longlong),'unsafe native offset width'
        if number==285:
            assert type(arguments[2]) in (ctypes.c_long,ctypes.c_longlong)
            assert type(arguments[3]) in (ctypes.c_long,ctypes.c_longlong),'unsafe native offset width' and arguments[3].value==4096
    assert [arguments[3].value for number,arguments in calls if number==18]==[2147483648,4294967296,8588886016]
elif case=='install':
    calls=[]
    class Library:
        def prctl(self,number,*arguments):
            calls.append(number)
            return -1 if (failure=='privilege' and number==38) or (failure=='filter' and number==22) else 0
    w.ctypes.CDLL=lambda *arguments,**keywords:Library()
    for failure in ['none','privilege','filter']:
        calls.clear()
        if failure=='none':w.install_spawn_filter();assert calls==[38,22]
        else:
            refuses(w.install_spawn_filter,'repair-spawn-filter-refused')
            assert calls==([38] if failure=='privilege' else [38,22])
elif case=='grants':
    events=[]
    class Syscall:
        def __call__(self,number,*arguments):
            if number==444:return 3 if arguments[-1]==1 else 100
            if number==445:events.append(arguments[2]._obj.allowed_access)
            return 0
    class Library:
        syscall=Syscall()
        def prctl(self,*arguments):return 0
    w.raw.ctypes.CDLL=lambda *arguments,**keywords:Library()
    native_close=os.close
    w.raw.os.close=lambda descriptor:None if descriptor==100 else native_close(descriptor)
    with tempfile.TemporaryFile() as raw_stream,tempfile.TemporaryFile() as tool_stream,tempfile.TemporaryFile() as extra_stream:
        w.raw.confine_writer(raw_stream.fileno(),tool_stream.fileno(),(extra_stream.fileno(),))
        assert events==[16386,1,1,1],events
        events.clear();w.raw.confine_writer(raw_stream.fileno(),None,truncate=False)
        assert events==[2],('unsafe repair truncate/exec grant',events)
elif case=='confinement':
    with tempfile.TemporaryFile() as stream:
        descriptor=stream.fileno();original=w.raw.identity(os.fstat(descriptor));events=[]
        w.raw.confine_writer=lambda *arguments,**keywords:events.append(('landlock',arguments,keywords))
        original_close=os.close;original_open=os.open;original_dup=os.dup2
        def observed_open(path,flags):events.append(('open',flags));return original_open(path,flags)
        def observed_dup(source,target,**keywords):events.append(('dup',target));return original_dup(source,target,**keywords)
        def observed_close(number):events.append(('close',number))
        w.os.open=observed_open;w.os.dup2=observed_dup;w.os.close=observed_close
        w.stat.S_ISFIFO=lambda mode:True
        geometry=type('Geometry',(),{'install_geometry_filter':lambda self:events.append(('geometry',))})()
        w.install_spawn_filter=lambda:events.append(('spawn',))
        w.confine_child(descriptor,original,geometry)
        assert events[0]==('landlock',(descriptor,None),dict(truncate=False))
        flags=events[1][1];assert flags&os.O_DIRECT and flags&os.O_DSYNC and flags&os.O_ACCMODE==os.O_RDWR
        assert events[2]==('dup',descriptor)
        assert all(('close',number) in events for number in range(64) if number not in (0,1,2,descriptor))
        assert ('close',descriptor) not in events and events[-2:]==[('geometry',),('spawn',)]
        w.os.close=original_close;w.os.open=original_open;w.os.dup2=original_dup
elif case=='fork':
    import errno,fcntl,resource
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    w.RAW_BYTES=1048576
    with tempfile.TemporaryFile() as stream,tempfile.TemporaryFile() as foreign:
        stream.write(b'x'*1048576);stream.flush()
        descriptor=stream.fileno();outer=[(os.fstat(number).st_dev,os.fstat(number).st_ino) for number in (0,1,2)]
        w.raw.confine_writer=lambda *arguments,**keywords:None
        w.install_spawn_filter=lambda:None
        geometry=type('Geometry',(),{'install_geometry_filter':lambda self:None})()
        def inspect_descriptors(selected,buffer,offset):
            assert selected==descriptor and offset==0
            flags=fcntl.fcntl(selected,fcntl.F_GETFL)
            assert flags&os.O_DIRECT and flags&os.O_DSYNC
            for number in (0,1,2):assert (os.fstat(number).st_dev,os.fstat(number).st_ino)!=outer[number]
            for number in map(int,os.listdir('/proc/self/fd')):
                if number in (0,1,2,descriptor):continue
                try:os.fstat(number)
                except OSError as failure:assert failure.errno==errno.EBADF
                else:raise AssertionError('inherited outer/state/writer authority survived')
        w.rewrite_step=inspect_descriptors
        child=w.start_writer(descriptor,w.raw.identity(os.fstat(descriptor)),geometry,time.monotonic()+5)
        try:w.drive_writer(child,lambda offset:None,lambda offset:None,time.monotonic()+5)
        finally:
            for stream in (child.stdin,child.stdout,child.stderr):stream.close()
        assert child.returncode==0
elif case=='frames':
    read_fd,write_fd=os.pipe()
    try:
        pipe=w.PrivatePipe(read_fd,write_fd,time.monotonic()+5)
        pipe.send({'kind':'step','seq':0,'offset':0,'bytes':1048576})
        assert pipe.receive()=={'kind':'step','seq':0,'offset':0,'bytes':1048576}
        pipe.sent=4*1024**2
        refuses(lambda:pipe.send({'kind':'finish','seq':8192}),'repair-private-frame-bound')
        pipe.sent=0
        os.write(write_fd,b'x'*1024+b'\n')
        refuses(pipe.receive,'repair-private-frame-bound')
    finally: os.close(read_fd);os.close(write_fd)
    for payload in [b'{}\n',b'{"seq":0,"seq":1}\n',b'false\n']:
        read_fd,write_fd=os.pipe()
        try:
            os.write(write_fd,payload)
            refuses(lambda:w.PrivatePipe(read_fd,write_fd,time.monotonic()+5).receive(),
                    'repair-private-frame-invalid')
        finally: os.close(read_fd);os.close(write_fd)
    read_fd,write_fd=os.pipe();os.close(write_fd)
    try: refuses(lambda:w.PrivatePipe(read_fd,read_fd,time.monotonic()+5).receive(),'repair-private-eof')
    finally: os.close(read_fd)
elif case=='child':
    events=[]
    class Channel:
        def __init__(self,frames):self.frames=iter(frames)
        def receive(self): return next(self.frames)
        def send(self,frame):events.append(frame)
    w.rewrite_step=lambda descriptor,buffer,offset:events.append(('write',offset))
    w.RAW_BYTES=2*1048576
    good=[dict(kind='step',seq=0,offset=0,bytes=1048576),dict(kind='step',seq=1,offset=1048576,bytes=1048576),dict(kind='finish',seq=2)]
    w.write_ranges(9,Channel(good))
    assert events==[('write',0),dict(kind='done',seq=0,offset=0,bytes=1048576),('write',1048576),dict(kind='done',seq=1,offset=1048576,bytes=1048576),dict(kind='finished',seq=2)]
    for change in [dict(seq=True),dict(seq=1),dict(offset=1048576),dict(bytes=4096),dict(extra=1)]:
        events.clear();refuses(lambda:w.write_ranges(9,Channel([dict(good[0],**change)])),'repair-private-sequence')
        assert not events,'write happened before step validation'
    events.clear()
    def fail(descriptor,buffer,offset):events.append(('write',offset));raise w.raw.PreparationRefusal('injected-write')
    w.rewrite_step=fail
    refuses(lambda:w.write_ranges(9,Channel(good)),'injected-write');assert events==[('write',0)]
elif case=='parent':
    w.RAW_BYTES=2*1048576
    for fault in ['none','sequence','range','source','extra','stderr','exit','timeout']:
        events=[]
        code='''import json,sys,time\nfor line in sys.stdin:\n f=json.loads(line)\n if f['kind']=='finish':\n  print(json.dumps(dict(kind='finished',seq=f['seq'])),flush=True);break\n f['kind']='done'\n if FAULT=='timeout':time.sleep(1)\n if FAULT=='sequence':f['seq']+=1\n print(json.dumps(f),flush=True)\n'''.replace('FAULT',repr(fault))
        if fault=='extra':code+="print('{}',flush=True)\n"
        if fault=='stderr':code+="print('private',file=sys.stderr)\n"
        if fault=='exit':code+='sys.exit(2)\n'
        child=subprocess.Popen([sys.executable,'-I','-B','-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def before(offset):
            events.append(('admit',offset))
            if fault=='source':raise w.raw.PreparationRefusal('source-injected')
        def after(offset):
            events.append(('inspect',offset))
            if fault=='range':raise w.raw.PreparationRefusal('range-injected')
        try:
            if fault=='none':
                w.drive_writer(child,before,after,time.monotonic()+5)
                assert events==[('admit',0),('inspect',0),('admit',1048576),('inspect',1048576)]
            else:
                try:w.drive_writer(child,before,after,time.monotonic()+(.05 if fault=='timeout' else 5))
                except w.raw.PreparationRefusal:pass
                else:raise AssertionError('unsafe child accepted '+fault)
                if fault in ['sequence','range']:assert ('admit',1048576) not in events,'unsafe second private write grant'
        finally:
            assert child.poll() is not None,'orphan writer'
            child.stdin.close();child.stdout.close();child.stderr.close()
elif case=='allocation':
    calls=[];w.native_call=lambda number,*arguments:calls.append((number,[getattr(argument,'value',argument) for argument in arguments])) or 0
    w.allocate_block(9,4096);assert calls==[(285,[9,0,4096,4096])]
    w.native_call=lambda number,*arguments:calls.append((number,[])) or -1
    calls.clear();refuses(lambda:w.allocate_block(9,4096),'repair-allocation-failed');assert len(calls)==1
elif case=='policy':
    policy=w.spawn_filter()
    def decision(number):
        accumulator=number;index=0
        while True:
            code,yes,no,operand=policy[index]
            if code==0x20:accumulator=0xc000003e if operand==4 else number
            elif code==0x15:index+=yes if accumulator==operand else no
            elif code==0x35:index+=yes if accumulator>=operand else no
            elif code==0x06:return operand
            else:raise AssertionError(code)
            index+=1
    for number in [56,57,58,59,322,435]:assert decision(number)!=0x7fff0000
    for number in [0,1,3,17,18,60,74,231]:assert decision(number)==0x7fff0000
else:raise AssertionError(case)
print('ok '+case)
`;

for (const boundary of [
  'direct',
  'width',
  'install',
  'grants',
  'confinement',
  'fork',
  'frames',
  'child',
  'parent',
  'allocation',
  'policy',
]) {
  test(`repair writer ${boundary} protects the next fixed mutation`, () => {
    const invocation = Bun.spawnSync(
      [
        'python3',
        '-I',
        '-B',
        '-c',
        program,
        join(import.meta.dir, 'lab-repair-worker.py'),
        boundary,
      ],
      { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    expect(Bun.stripANSI(invocation.stderr.toString())).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`ok ${boundary}\n`);
  });
}
