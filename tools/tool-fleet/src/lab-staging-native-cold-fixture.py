
import io, os, sys, types
from pathlib import Path
os.uname=lambda:os.uname_result(('Linux','','7.0.11-76070011-generic','fixture','x86_64'))
# Proof: missing3.12 RED; runtime-provider preserves native guards over current interpreter bytes.
physical_stdlib=str(Path(os.__file__).parent)
physical_executable=str(Path(sys.executable).resolve())
runtime_aliases=[('/usr/bin/python3.12',physical_executable),('/usr/lib/python3.12/',physical_stdlib+'/')]
# Proof: packaged hook RED rejects /etc/python3.14; exact alias passes while foreign-runtime still refuses.
configuration='/etc/'+Path(physical_stdlib).name+'/sitecustomize.py'
runtime_aliases.append(('/etc/python3.12/sitecustomize.py',configuration))
with open('/proc/self/maps',encoding='ascii') as stream:
    for row in stream:
        fields=row.split(maxsplit=5)
        if len(fields)==6:
            physical=fields[5].strip()
            if physical.startswith(sys.base_prefix+'/lib/libpython'):
                alias=('/usr/lib/x86_64-linux-gnu/'+Path(physical).name,physical)
                if alias not in runtime_aliases:runtime_aliases.append(alias)
def map_runtime_path(path,physical=False):
    if not isinstance(path,(str,os.PathLike)):return path
    selected=str(path)
    for modeled,installed in runtime_aliases:
        before,after=(modeled,installed) if physical else (installed,modeled)
        if selected==before or before.endswith('/') and selected.startswith(before):
            return after+selected[len(before):]
    return selected
def runtime_observation(observed,path):
    if map_runtime_path(path)!=str(path) or map_runtime_path(path,True)!=str(path):
        fields={name:getattr(observed,name) for name in dir(observed) if name.startswith('st_')}
        fields['st_uid']=0;fields['st_mode'] &= ~0o022
        return types.SimpleNamespace(**fields)
    return observed
installed_lstat,installed_stat,installed_fstat,installed_open,installed_io_open,installed_resolve=os.lstat,os.stat,os.fstat,os.open,io.open,Path.resolve
os.lstat=lambda path,*args,**kwargs:runtime_observation(installed_lstat(map_runtime_path(path,True),*args,**kwargs),path)
os.stat=lambda path,*args,**kwargs:runtime_observation(installed_stat(map_runtime_path(path,True),*args,**kwargs),path)
os.fstat=lambda descriptor:runtime_observation(installed_fstat(descriptor),os.readlink('/proc/self/fd/'+str(descriptor)))
os.open=lambda path,*args,**kwargs:installed_open(map_runtime_path(path,True),*args,**kwargs)
io.open=lambda path,*args,**kwargs:installed_io_open(map_runtime_path(path,True),*args,**kwargs)
Path.resolve=lambda path,*args,**kwargs:Path(map_runtime_path(installed_resolve(Path(map_runtime_path(path,True)),*args,**kwargs)))

# Proof: foreign-runtime lacked its rejected path until this test-only context was added.
def observed_runtime(control):
    try:return control.runtime_paths()
    except control.Refusal as failure:
        if str(failure)=='runtime-mapping':
            trace=failure.__traceback__
            while trace.tb_frame.f_code.co_name!='runtime_paths':trace=trace.tb_next
            scope=trace.tb_frame.f_locals
            paths=scope['paths'] if 'paths' in scope else {scope['fields'][5]}
            rejected=sorted(path for path in paths if not control.is_runtime_path(path) or path.endswith(' (deleted)'))
            failure.add_note('fixture runtime count='+str(len(paths))+' rejected: '+repr([path[:256] for path in rejected[:16]]))
        raise

# Worker entry follows the runtime provider.
import hashlib, importlib.util, json, os, signal, stat, sys, types
from pathlib import Path
root, request_path, request_sha, nonce, phase, omitted, mapped, bootstrap, *worker_args=sys.argv[1:]
root=Path(root);request=json.loads(Path(request_path).read_bytes());initial=[]
platform_path='/usr/lib/python3.12/platform.py'
native_lstat,native_fstat,native_open=os.lstat,os.fstat,os.open
native_samefile=os.path.samefile
sys.version_info=(3,12,0)
os.path.samefile=lambda left,right:True if (left,right)==('/proc/self/exe','/usr/bin/python3.12') else native_samefile(left,right)
def observed(observation,path):
    path=map_runtime_path(path)
    if str(path).startswith('/usr/') or str(path).startswith('/etc/python3.12/'):
        fields={name:getattr(observation,name) for name in dir(observation) if name.startswith('st_')};fields['st_uid']=0
        return types.SimpleNamespace(**fields)
    return observation
def selected(path):return mapped if mapped!='-' and str(path)==platform_path else path
os.lstat=lambda path,*args,**kwargs:observed(native_lstat(selected(path),*args,**kwargs),path)
def fstat(descriptor):
    path=os.readlink('/proc/self/fd/'+str(descriptor))
    return observed(native_fstat(descriptor),platform_path if path==mapped else path)
os.fstat=fstat
os.open=lambda path,*args,**kwargs:native_open(selected(path),*args,**kwargs)
native_exec=exec
def execute(program,scope=None,local_scope=None):
    if scope is None:scope=sys._getframe(1).f_globals
    native_exec(program,scope,scope if local_scope is None else local_scope)
    if scope.get('__name__')!='staging_shared_control':return
    control=sys.modules['staging_shared_control']
    def git(arguments,deadline):
        if arguments[0]=='rev-parse':return (request['commit']+'\n').encode()
        rows=[]
        for relative in arguments[4:]:
            payload=(root/relative).read_bytes();sha=hashlib.sha1(b'blob '+str(len(payload)).encode()+b'\0'+payload).hexdigest()
            rows.append(('100644 blob '+sha+'\t'+relative).encode())
        return b'\0'.join(rows)+b'\0'
    control.fixed_git=git
    verify=control.verify_environment
    def verify_initial(*arguments):
        initial[:]=sorted(control.runtime_paths());assert platform_path not in initial
        return verify(*arguments)
    control.verify_environment=verify_initial
    if omitted=='yes':control.check_loaded_runtime=lambda *_:None
    require=control.require
    def checked(predicate,category):
        if not predicate:os.write(2,('guard:'+category+'\n').encode())
        return require(predicate,category)
    control.require=checked
    load_helpers=control.load_helpers
    def load():
        helpers=load_helpers();raw=helpers['raw'];read_text=raw.read_text
        unit='puni-staging-live-'+nonce+'.service'
        def read(path,limit=65536):
            if path.endswith('/cgroup'):return '0::/fixture/'+unit+'\n'
            if path.startswith('/sys/fs/cgroup/fixture/'):return control.CAPS[path.rsplit('/',1)[1]]
            return read_text(path,limit)
        raw.read_text=read
        def native(arguments,*args,**kwargs):
            fields=arguments[-1].removeprefix('--property=').split(',')
            values=(control.LIMITS if fields==list(control.LIMITS) else dict(LoadState='loaded',ActiveState='active',SubState='running',MainPID=str(os.getpid()),InvocationID='c'*32,ControlGroup='/fixture/'+unit,Result='',ExecMainStatus=''))
            return ''.join(name+'='+values[name]+'\n' for name in fields).encode()
        raw.run_bounded=native
        return helpers
    control.load_helpers=load
    if phase=='capture':
        def capture(*_):
            complete=sorted(control.runtime_paths());assert platform_path in set(complete)-set(initial)
            os.write(1,json.dumps({'initial':initial,'complete':complete}).encode());os._exit(0)
        control.worker_control=capture
    else:
        loader=control.load_staging
        def staging():
            module=loader();send=module.send_packet
            def started(control,endpoint,frame,deadline):
                previous=signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGUSR2})
                send(control,endpoint,frame,deadline)
                if frame['phase']=='started':
                    os.write(1,b'!');assert signal.sigtimedwait({signal.SIGUSR2},3) is not None
                    signal.pthread_sigmask(signal.SIG_SETMASK,previous);raise SystemExit(0)
            module.send_packet=started
            return module
        control.load_staging=staging
import builtins
builtins.exec=execute
sys.argv=['-c',*worker_args]
native_exec(compile(bootstrap,'<cold-native-bootstrap>','exec'),{'__name__':'__main__'})
