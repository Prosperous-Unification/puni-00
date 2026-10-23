/** One ephemeral Linux subreaper owns only its fixed worker/query descendants.
 * A terminal clean response requires ECHILD and worker-pipe EOF; uncertain cleanup is never success.
 */
export const AUTHORITY_SUPERVISOR = String.raw`
import ctypes, signal, select

def coordinator_alive(request):
    try:
        with open('/proc/'+str(request['coordinator']['pid'])+'/stat','rb') as stream:
            start=parse_stat(stream.read(1024*1024))[0]
        with open('/proc/'+str(request['coordinator']['pid'])+'/cgroup','rb') as stream:
            group=parse_cgroup(stream.read(1024*1024))
        return start==request['coordinator']['startTime'] and group==request['coordinator']['cgroup']
    except (OSError,Refusal): return False

def supervise(request,deadline,worker):
    nonce=request['nonce']; libc=ctypes.CDLL(None,use_errno=True); enabled=ctypes.c_int()
    # Proof: subreaper-required omission failed subreaper-unavailable before any worker fork.
    require(libc.prctl(36,1,0,0,0)==0 and libc.prctl(37,ctypes.byref(enabled),0,0,0)==0 and enabled.value==1,'subreaper unavailable')
    require(hasattr(os,'pidfd_open') and hasattr(signal,'pidfd_send_signal'),'pidfd unavailable')
    require(coordinator_alive(request),'coordinator unavailable before collection')
    os.set_blocking(0,False); os.set_blocking(1,False)
    poll=selectors.DefaultSelector();poll.register(0,selectors.EVENT_READ,'control')
    outgoing=bytearray(encode({'phase':'ready','nonce':nonce,'monotonic':time.monotonic()})+b'\n')
    control=bytearray(); captured=bytearray(); eof=False; worker_pid=None; worker_status=None
    worker_group=None; owned={}; cancelling=False; reason=None; term_at=None; last_ping=time.monotonic(); started=False
    collection_deadline=deadline-min(10,max(0.05,(deadline-time.monotonic())/3))
    def refuse(context):
        nonlocal cancelling,reason,term_at
        if reason is None: reason=context
        cancelling=True
        if term_at is None: term_at=time.monotonic()
    def children(pid):
        with open('/proc/'+str(pid)+'/task/'+str(pid)+'/children','rb') as stream: content=stream.read(1024*1024)
        require(len(content)<1024*1024,'child roster oversized')
        names=content.split(); require(len(names)<=4096 and all(name.isdigit() for name in names),'child roster malformed')
        return [int(name) for name in names]
    def discover():
        queue=[os.getpid()]; visited=set()
        while queue:
            parent=queue.pop()
            if parent in visited: continue
            visited.add(parent)
            try: descendants=children(parent)
            except FileNotFoundError: continue
            for pid in descendants:
                if pid not in owned:
                    try:
                        descriptor=os.pidfd_open(pid,0)
                        with open('/proc/'+str(pid)+'/stat','rb') as stream: content=stream.read(1024*1024)
                        end=content.rfind(b') '); fields=content[end+2:].split()
                        if not (len(fields)>=20 and int(fields[1])==parent):
                            os.close(descriptor);raise Refusal('child identity changed')
                        owned[pid]=(descriptor,fields[19])
                        if worker_group is not None and pid!=worker_pid and int(fields[2])!=worker_group:refuse('query descendant escaped process group')
                    except ProcessLookupError: continue
                    except FileNotFoundError:
                        os.close(descriptor); continue
                queue.append(pid)
                require(len(owned)<=4096,'descendant bound exceeded')
    def reap():
        nonlocal worker_status
        for pid,(descriptor,start) in list(owned.items()):
            readable,_,_=select.select([descriptor],[],[],0)
            if readable:
                os.close(descriptor);owned.pop(pid)
        while True:
            try: pid,status_code=os.waitpid(-1,os.WNOHANG)
            except ChildProcessError: return True
            if pid==0:return False
            if pid==worker_pid:worker_status=status_code
            if pid in owned: os.close(owned.pop(pid)[0])
    def stop_owned(sig):
        # A retained pidfd cannot target a recycled or unrelated PID.
        discover()
        if worker_group is not None and worker_status is None and worker_pid in owned:
            try:os.killpg(worker_group,sig)
            except ProcessLookupError:pass
        for pid,(descriptor,start) in list(owned.items()):
            try:signal.pidfd_send_signal(descriptor,sig,None,0)
            except ProcessLookupError:pass
    def send_output():
        nonlocal outgoing
        if outgoing:
            try:count=os.write(1,outgoing);del outgoing[:count]
            except BlockingIOError:pass
            except BrokenPipeError:refuse('coordinator output lost');outgoing.clear()
    try:
        while True:
            now=time.monotonic()
            if not coordinator_alive(request):refuse('coordinator identity ended')
            if now>=collection_deadline and not cancelling:refuse('collection deadline exceeded')
            if now-last_ping>1:refuse('coordinator heartbeat lost')
            send_output()
            try:
                for registered,event in poll.select(min(0.02,max(0,deadline-now))):
                    descriptor=registered.fd
                    try:chunk=os.read(descriptor,65536)
                    except BlockingIOError:continue
                    if registered.data=='control':
                        if not chunk:refuse('coordinator control lost');poll.unregister(descriptor);continue
                        control.extend(chunk);require(len(control)<=65536,'control bound exceeded')
                        while b'\n' in control:
                            line,remaining=control.split(b'\n',1);control=bytearray(remaining)
                            if line==('ping '+nonce).encode():last_ping=now
                            elif line==('cancel '+nonce).encode():refuse('coordinator cancelled')
                            elif line.startswith(('start '+nonce+' ').encode()) and not started and not cancelling:
                                selected_deadline=float(line.decode().split(' ')[2])
                                require(time.monotonic()<selected_deadline<=deadline,'worker deadline binding differs')
                                deadline=selected_deadline
                                collection_deadline=deadline-min(10,max(0.05,(deadline-time.monotonic())/3))
                                started=True
                                read_fd,write_fd=os.pipe();os.set_blocking(read_fd,False)
                                worker_pid=os.fork()
                                if worker_pid==0:
                                    try:
                                        os.close(read_fd);os.close(0);os.setsid();os.dup2(write_fd,1);os.dup2(write_fd,2)
                                        if write_fd not in [1,2]:os.close(write_fd)
                                        poll.close()
                                        require(time.monotonic()<collection_deadline,'worker deadline exceeded')
                                        kernel=Host(collection_deadline)
                                        for internal_pid in [os.getpid(),os.getppid()]:
                                            kernel.internal_processes[internal_pid]={'startTime':process_start(kernel,internal_pid)[0],'cgroup':parse_cgroup(kernel.read('/proc/'+str(internal_pid)+'/cgroup',1024*1024))}
                                        observed=worker(request,kernel)
                                        contents=encode(observed)
                                        require(len(contents)<=32*1024*1024,'worker output oversized')
                                        os.write(1,contents);os._exit(0)
                                    except BaseException:os._exit(1)
                                os.close(write_fd);worker_group=worker_pid
                                poll.register(read_fd,selectors.EVENT_READ,'worker');discover()
                            else:refuse('control protocol malformed')
                    else:
                        if not chunk:eof=True;poll.unregister(descriptor);os.close(descriptor)
                        else:
                            captured.extend(chunk)
                            # Proof: supervisor-output-bound omission admitted oversized valid-JSON whitespace in saturation.
                            if len(captured)>32*1024*1024:captured.clear();refuse('worker output oversized')
                discover()
                empty=reap()
                if worker_status is not None and not cancelling:
                    discover()
                    if not empty or owned:refuse('worker left descendants')
                    elif not os.WIFEXITED(worker_status) or os.WEXITSTATUS(worker_status)!=0:refuse('worker refused')
                if cancelling:
                    sig=signal.SIGKILL if now-term_at>=0.1 else signal.SIGTERM
                    stop_owned(sig)
                    empty=reap()
                # Proof: separate supervisor-echild and supervisor-eof omissions failed missing-echild and retained-pipe.
                if started and worker_status is not None and empty and eof:
                    if outgoing:continue
                    phase='refused' if cancelling else 'complete'
                    terminal={'phase':phase,'nonce':nonce,'cleanup':'complete'}
                    if not cancelling:
                        try:terminal['observation']=json.loads(captured)
                        except (ValueError,UnicodeError):terminal={'phase':'refused','nonce':nonce,'cleanup':'complete'}
                    outgoing.extend(encode(terminal)+b'\n')
                    while outgoing and time.monotonic()<deadline:
                        send_output();time.sleep(0.001)
                    return 0 if not outgoing else 2
                if cancelling and not started and empty:
                    outgoing.extend(encode({'phase':'refused','nonce':nonce,'cleanup':'complete'})+b'\n')
                    while outgoing and time.monotonic()<deadline:send_output();time.sleep(0.001)
                    return 1
                if now>=deadline:
                    outgoing.clear();outgoing.extend(encode({'phase':'refused','nonce':nonce,'cleanup':'unknown'})+b'\n');send_output();return 2
            except (OSError,Refusal):refuse('supervisor observation refused')
    finally:
        poll.close()
        for descriptor,start in owned.values():os.close(descriptor)

def supervised_main(request,deadline):
    try:code=supervise(request,deadline,collect)
    except BaseException:
        os.write(2,b'installed authority cleanup unknown\n');code=2
    raise SystemExit(code)

def supervisor_entry(worker):
    startup=time.monotonic()+120
    contents=bytearray()
    try:
        while b'\n' not in contents:
            require(time.monotonic()<startup,'initial request deadline exceeded')
            ready,_,_=select.select([0],[],[],max(0,startup-time.monotonic()))
            require(ready,'initial control unavailable')
            chunk=os.read(0,65536)
            require(chunk,'initial control ended');contents.extend(chunk)
            require(len(contents)<=65536,'initial request bound exceeded')
        line,remaining=contents.split(b'\n',1)
        require(not remaining,'unexpected prefork control bytes')
        envelope=json.loads(line)
        require(type(envelope)==dict and set(envelope)=={'request','budgetSeconds'},'supervisor request malformed')
        request=envelope['request'];budget=envelope['budgetSeconds']
        require(type(budget) in [int,float] and 0<budget<=120,'supervisor budget malformed')
        deadline=time.monotonic()+budget
        validate_request(request)
        require(type(deadline) in [int,float] and 0<deadline-time.monotonic()<=120,'supervisor deadline malformed')
        code=supervise(request,deadline,worker)
    except BaseException:
        os.write(2,b'installed authority cleanup unknown\n');code=2
    raise SystemExit(code)
`;
