/** Fixed read-only collector. Fixture adapters exercise these same algorithms without privileged host access.
 * It never reads process environments, emits raw configuration, signals participants or reconstructs authority.
 */
export const AUTHORITY_COLLECTOR = String.raw`
import os, stat, json, hashlib, time, subprocess, selectors, pwd, errno, re, ctypes, unicodedata

class Refusal(Exception): pass

def require(condition, context):
    if not condition: raise Refusal(context)

def digest(content): return hashlib.sha256(content).hexdigest()
def encode(value): return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def identity(metadata): return str(metadata.st_dev)+':'+str(metadata.st_ino)
def metadata_key(metadata):
    return (metadata.st_dev,metadata.st_ino,metadata.st_mode,metadata.st_size,metadata.st_mtime_ns,metadata.st_ctime_ns)

def parse_stat(content):
    # Proof: stat parser negative preserves spaces/parentheses and rejects malformed start identity.
    end=content.rfind(b') ')
    require(end>0,'process stat malformed')
    fields=content[end+2:].split()
    require(len(fields)>=20 and fields[19].isdigit(),'process start identity malformed')
    return fields[19].decode(), fields[0], int(fields[6])

def parse_cgroup(content):
    # Proof: cgroup parser rejects multiple controllers, relative paths and traversal.
    lines=content.decode().splitlines()
    require(len(lines)==1 and lines[0].startswith('0::/'),'process cgroup malformed')
    path=lines[0][3:]
    require(os.path.normpath(path)==path and '\x00' not in path,'process cgroup malformed')
    return path

def read_crontab(user, query):
    code,stdout,stderr=query(['/usr/bin/crontab','-u',user,'-l'])
    # Proof: exact crontab diagnostic negative rejects unrelated exit1 and nonempty stderr.
    if code==1 and stdout==b'' and stderr==('no crontab for '+user+'\n').encode(): return None
    # Proof: cron-diagnostic guard omission failed exact no-crontab.
    require(code==0 and stderr==b'','crontab observation unavailable')
    return stdout

class SelfDescriptors:
    def __init__(self,host,pid): self.host=host; self.pid=pid; self.directory=None
    def __enter__(self):
        if self.pid!=os.getpid(): return self
        class Dirent(ctypes.Structure):
            _fields_=[('inode',ctypes.c_ulong),('offset',ctypes.c_long),('length',ctypes.c_ushort),('kind',ctypes.c_ubyte),('name',ctypes.c_char*256)]
        require(ctypes.sizeof(ctypes.c_ulong)==8,'self census requires Linux 64-bit dirent')
        self.libc=ctypes.CDLL(None,use_errno=True)
        self.libc.opendir.argtypes=[ctypes.c_char_p];self.libc.opendir.restype=ctypes.c_void_p
        self.libc.readdir.argtypes=[ctypes.c_void_p];self.libc.readdir.restype=ctypes.POINTER(Dirent)
        self.libc.rewinddir.argtypes=[ctypes.c_void_p];self.libc.closedir.argtypes=[ctypes.c_void_p]
        self.directory=self.libc.opendir(('/proc/'+str(self.pid)+'/fd').encode())
        require(bool(self.directory),'self descriptor directory unavailable')
        self.host.fd_directory=self
        return self
    def listing(self,limit):
        self.libc.rewinddir(self.directory);names=[];ctypes.set_errno(0)
        while True:
            entry=self.libc.readdir(self.directory)
            if not entry:
                require(ctypes.get_errno()==0,'self descriptor enumeration unreadable');break
            name=entry.contents.name.decode()
            if name not in ['.','..']:names.append(name)
            require(len(names)<=limit,'collector membership bound exceeded')
        return sorted(names)
    def __exit__(self,kind,cause,trace):
        if self.directory is not None:
            self.host.fd_directory=None
            require(self.libc.closedir(self.directory)==0,'self descriptor directory close failed')


class Host:
    def __init__(self, deadline): self.deadline=deadline; self.children=[]; self.internal_processes={};self.solver_process=None
    def check(self): require(time.monotonic()<self.deadline,'collector deadline exceeded')
    def read(self,path,limit):
        self.check()
        with open(path,'rb',buffering=0) as stream: content=stream.read(limit+1)
        require(len(content)<=limit,'collector read bound exceeded')
        return content
    def open_executable(self,path):
        self.check(); return os.open(path,os.O_RDONLY|os.O_NONBLOCK)
    def read_executable(self,pid,original):
        # Proof: an invalid PID cannot select an arbitrary path before the fixed proc-executable open.
        require(type(pid)==int and pid>0,'process identity malformed')
        path='/proc/'+str(pid)+'/exe';limit=128*1024*1024
        descriptor=self.open_executable(path)
        try:
            opened=os.fstat(descriptor)
            # Proof: isolated precheck, regular-mode and size omissions each read a refused real FD before the final check.
            require(stat.S_ISREG(opened.st_mode) and opened.st_size<=limit and metadata_key(opened)==metadata_key(original),'process executable opened identity changed')
            chunks=[];count=0
            while True:
                self.check();chunk=os.read(descriptor,min(65536,limit+1-count))
                if not chunk:break
                # Proof: omitting this incremental guard let a real sparse file grow past 128 MiB and reach only the later metadata refusal.
                count+=len(chunk);require(count<=limit,'collector read bound exceeded');chunks.append(chunk)
            # Proof: removing only this final descriptor check accepted a real dup2 A-to-B swap after the precheck.
            require(metadata_key(original)==metadata_key(os.fstat(descriptor))==metadata_key(self.metadata(path)),'process executable changed during read')
            return b''.join(chunks)
        finally:os.close(descriptor)
    def metadata(self,path,follow=True):
        self.check(); return os.stat(path,follow_symlinks=follow)
    def link(self,path):
        self.check(); return os.readlink(path)
    def resolve(self,path):
        self.check(); return os.path.realpath(path)
    def exists(self,path):
        self.check(); return os.path.lexists(path)
    def listing(self,path,limit):
        self.check()
        directory=getattr(self,'fd_directory',None)
        if directory is not None and path=='/proc/'+str(os.getpid())+'/fd':return directory.listing(limit)
        names=os.listdir(path)
        require(len(names)<=limit,'collector membership bound exceeded')
        return sorted(names)
    def regular(self,path,limit):
        self.check()
        require(os.path.isabs(path) and os.path.normpath(path)==path and os.path.realpath(path)==path,'configuration path is not canonical')
        parents=[]
        try:
            parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
            parents.append(parent)
            segments=path.split('/')[1:]
            for segment in segments[:-1]:
                parent=os.open(segment,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
                parents.append(parent)
            before=os.stat(segments[-1],dir_fd=parent,follow_symlinks=False)
            require(stat.S_ISREG(before.st_mode) and before.st_size<=limit,'configuration is not bounded regular file')
            descriptor=os.open(segments[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
            try:
                require(metadata_key(before)==metadata_key(os.fstat(descriptor)),'configuration identity changed')
                chunks=[]; count=0
                while True:
                    self.check(); chunk=os.read(descriptor,min(65536,limit+1-count))
                    if not chunk: break
                    count+=len(chunk); require(count<=limit,'configuration read bound exceeded'); chunks.append(chunk)
                after=os.fstat(descriptor)
                require(metadata_key(before)==metadata_key(after)==metadata_key(os.stat(path,follow_symlinks=False)),'configuration identity changed')
                return b''.join(chunks), metadata_key(before)
            finally: os.close(descriptor)
        finally:
            for descriptor in reversed(parents): os.close(descriptor)
    def open_runtime_fragment(self,path): return open_runtime_fragment(self,path)
    def query(self,argv):
        self.check()
        child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env={'PATH':'/usr/bin:/bin','LC_ALL':'C'})
        self.children.append(child.pid)
        streams=selectors.DefaultSelector(); chunks={1:[],2:[]}; count=0
        try:
            for stream,key in [(child.stdout,1),(child.stderr,2)]:
                os.set_blocking(stream.fileno(),False); streams.register(stream,selectors.EVENT_READ,key)
            while streams.get_map():
                self.check()
                for registered,event in streams.select(min(0.1,max(0,self.deadline-time.monotonic()))):
                    chunk=os.read(registered.fileobj.fileno(),65536)
                    if not chunk: streams.unregister(registered.fileobj)
                    else:
                        count+=len(chunk); require(count<=32*1024*1024,'query output bound exceeded'); chunks[registered.data].append(chunk)
            code=child.wait(timeout=max(0.001,self.deadline-time.monotonic()))
            return code,b''.join(chunks[1]),b''.join(chunks[2])
        finally:
            if child.poll() is None: child.kill()
            child.wait(); streams.close(); child.stdout.close(); child.stderr.close()

def query_text(host,argv):
    code,stdout,stderr=host.query(argv)
    require(code==0 and stderr==b'','launch query unavailable')
    return stdout.decode()

def manager_argv(manager,tool):
    if manager=='system': return ['/usr/bin/'+tool]
    return ['/usr/sbin/runuser','-u','puni1','--','/usr/bin/env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','/usr/bin/'+tool,'--user']

def typed_property(host,manager,path,interface,property_name,strict=False):
    content=query_text(host,manager_argv(manager,'busctl')+['--json=short','get-property','org.freedesktop.systemd1',path,interface,property_name])
    response=runtime_json_reply(content.encode('utf-8'),1024*1024) if strict else json.loads(content)
    require(type(response)==dict and set(response)=={'type','data'},'typed unit property malformed')
    return response['type'],response['data']

def unit_path(name):
    return '/org/freedesktop/systemd1/unit/'+''.join(chr(byte) if (65<=byte<=90 or 97<=byte<=122 or 48<=byte<=57) else '_'+format(byte,'02x') for byte in name.encode())

def _collect_launch_projection(host,known_paths,observations=None):
    cron=[]; retained={}; total=0
    def retain(path):
        nonlocal total
        content,key=host.regular(path,4*1024*1024)
        if path in retained:
            require(retained[path]==(key,digest(content)),'launch definition changed')
        else:
            total+=len(content); require(total<=64*1024*1024,'launch byte bound exceeded')
            retained[path]=(key,digest(content)); require(len(retained)<=4096,'configuration membership bound exceeded')
        if observations is not None:observations.append(['file',path,list(key),runtime_metadata(host.metadata(path,False)),runtime_parents(host,path)])
        check_surface(path,content.decode(),known_paths,path=='/home/puni1/.config/systemd/user/wbs-solver-supervisor.service')
        return content
    def add(source,content):
        cron.append({'source':source,'state':'absent'} if content is None else {'source':source,'state':'present','sha256':digest(content)})
        if content is not None: check_surface(source,content.decode(),known_paths,source=='crontab:puni1')
    for user in ['root','puni1']: add('crontab:'+user,read_crontab(user,host.query))
    add('/etc/crontab',retain('/etc/crontab'))
    try: add('/etc/anacrontab',retain('/etc/anacrontab'))
    except FileNotFoundError:
        require(not host.exists('/etc/anacrontab'),'anacrontab unreadable'); add('/etc/anacrontab',None)
    memberships=[]
    for directory in ['/etc/cron.d','/etc/cron.hourly','/etc/cron.daily','/etc/cron.weekly','/etc/cron.monthly']:
        names=host.listing(directory,4096); memberships.append((directory,names))
        for name in names:
            require('/' not in name and name not in ['.','..'],'cron entry malformed')
            add(directory+'/'+name,retain(directory+'/'+name))
        require(len(cron)<=4096,'schedule membership bound exceeded')
    units=[]
    properties=['Id','Names','LoadState','FragmentPath','DropInPaths','Transient','NeedDaemonReload','Triggers','TriggeredBy','ActiveState','SubState','MainPID','ControlPID','InvocationID','ControlGroup','Job']
    command_types={
        'service':('Service',['ExecCondition','ExecStartPre','ExecStart','ExecStartPost','ExecReload','ExecStop','ExecStopPost']),
        'socket':('Socket',['ExecStartPre','ExecStartPost','ExecStopPre','ExecStopPost']),
        'mount':('Mount',['ExecMount','ExecUnmount','ExecRemount']),
        'swap':('Swap',['ExecActivate','ExecDeactivate']),
    }
    commandless={'automount','device','target','timer','path','slice','scope'}
    links=[]
    def definition(path,masked):
        if path=='/dev/null':
            require(masked,'unbound masked definition'); return digest(b'/dev/null')
        metadata=host.metadata(path,False)
        if stat.S_ISLNK(metadata.st_mode):
            target=host.link(path); resolved=host.resolve(path)
            links.append((path,identity(metadata),target,resolved))
            if observations is not None:observations.append(['link',path,runtime_metadata(metadata),target,resolved,runtime_parents(host,path)])
            if resolved=='/dev/null':
                require(masked and target=='/dev/null','unbound masked definition')
                return digest(target.encode())
            return digest(retain(resolved))
        return digest(retain(path))
    def inventory(manager):
        installed={}
        for line in query_text(host,manager_argv(manager,'systemctl')+['list-unit-files','--full','--plain','--no-legend','--no-pager']).splitlines():
            fields=line.split(); require(2<=len(fields)<=3,'installed unit inventory malformed')
            require(fields[0] not in installed,'duplicate installed unit'); installed[fields[0]]=fields[1]
        loaded=[]
        for line in query_text(host,manager_argv(manager,'systemctl')+['list-units','--all','--full','--plain','--no-legend','--no-pager']).splitlines():
            fields=line.split(); require(len(fields)>=4,'loaded unit inventory malformed'); loaded.append(fields[0])
        require(len(set(loaded))==len(loaded),'duplicate loaded unit')
        return installed,set(loaded)
    for manager in ['system','user']:
        installed,loaded=inventory(manager)
        if observations is not None:observations.append([manager,'inventory',sorted(installed.items()),sorted(loaded)])
        roster=set(installed)|loaded; projections={}
        for closure_round in range(3):
            require(len(roster)<=4096,'unit membership bound exceeded')
            discovered=set()
            for name in sorted(roster):
                require(re.fullmatch(r'[A-Za-z0-9:_.@\\-]+',name) is not None,'unit name malformed')
                argv=manager_argv(manager,'systemctl')+['show',name]+['--property='+key for key in properties]
                first=query_text(host,argv)
                if observations is not None:observations.append([manager,name,first])
                fields={}
                for line in first.splitlines():
                    key,separator,value=line.partition('=')
                    require(separator and key in properties and key not in fields,'effective unit fields malformed'); fields[key]=value
                require(set(['Id','Names','LoadState','FragmentPath','DropInPaths','Transient','NeedDaemonReload','Triggers','TriggeredBy','ActiveState','SubState']).issubset(fields),'effective unit fields missing')
                if name.endswith('.service') and '@.' not in name and fields['LoadState']=='loaded':
                    require(set(['MainPID','ControlPID','InvocationID','ControlGroup','Job']).issubset(fields),'service live identities missing')
                names=sorted(fields['Names'].split()); canonical=fields['Id']
                require(canonical in names and name in names,'effective unit alias differs'); discovered.update(names)
                # Proof: unit-reload guard omission failed fresh typed commands.
                require(fields['NeedDaemonReload']=='no','unit needs daemon reload')
                require(fields['Transient'] in ['yes','no'],'transient unit state malformed')
                require(not(name.startswith('atd.') and fields['ActiveState'] not in ['inactive','failed']),'unsupported scheduler owner')
                masked=fields['LoadState']=='masked' and installed.get(name) in ['masked','masked-runtime']
                fragment=None; drop_ins=[]
                if fields['FragmentPath']:
                    path=fields['FragmentPath']; fragment={'path':path,'sha256':definition(path,masked)}
                require(not masked or fragment is not None,'masked definition identity unavailable')
                for path in fields['DropInPaths'].split(): drop_ins.append({'path':path,'sha256':definition(path,False)})
                if '@.' not in name and fields['LoadState']!='masked':
                    binding_content=query_text(host,manager_argv(manager,'busctl')+['--json=short','call','org.freedesktop.systemd1','/org/freedesktop/systemd1','org.freedesktop.systemd1.Manager','LoadUnit','s',name])
                    bound=runtime_json_reply(binding_content.encode('utf-8'),1024*1024) if observations is not None else json.loads(binding_content)
                    # Proof: typed-object guard omission failed native typed unit.
                    require(type(bound)==dict and set(bound)=={'type','data'} and bound['type']=='o' and bound['data']==[unit_path(canonical)],'typed unit object binding differs')
                    expectations={'Id':('s',canonical),'Names':('as',names),'LoadState':('s',fields['LoadState']),'FragmentPath':('s',fields['FragmentPath']),'DropInPaths':('as',fields['DropInPaths'].split()),'Transient':('b',fields['Transient']=='yes'),'NeedDaemonReload':('b',False),'Triggers':('as',fields['Triggers'].split()),'TriggeredBy':('as',fields['TriggeredBy'].split())}
                    for property_name,(expected_type,expected_value) in expectations.items():
                        signature,value=typed_property(host,manager,unit_path(canonical),'org.freedesktop.systemd1.Unit',property_name,observations is not None)
                        # Proof: typed-metadata guard omission failed native typed unit.
                        require(signature==expected_type and type(value)==type(expected_value) and (sorted(value)==sorted(expected_value) if expected_type=='as' else value==expected_value),'typed unit metadata differs')
                commands=[]; suffix=name.rsplit('.',1)[-1]
                require(suffix in command_types or suffix in commandless,'unsupported unit command surface')
                if '@.' not in name and fields['LoadState']=='loaded' and suffix in command_types:
                    interface,execution_properties=command_types[suffix]
                    for property_name in execution_properties:
                        signature,entries=typed_property(host,manager,unit_path(canonical),'org.freedesktop.systemd1.'+interface,property_name,observations is not None)
                        if signature=='(sasbttttuii)': entries=[entries]
                        else: require(signature=='a(sasbttttuii)','execution property unsupported')
                        require(type(entries)==list,'execution property malformed')
                        for command in entries:
                            # Proof: typed-command guard omission failed native typed unit.
                            require(type(command)==list and len(command)==10 and type(command[0])==str and type(command[1])==list and all(type(part)==str for part in command[1]) and type(command[2])==bool,'execution command malformed')
                            if not command[0]:
                                require(command[1]==[],'empty execution path has argv'); continue
                            commands.append({'property':property_name,'path':command[0],'argv':command[1],'ignoreFailure':command[2]})
                    # Proof: unit-transient guard omission failed unrelated transient.
                    require(fields['Transient']=='no' or not any(path in json.dumps(commands) for path in known_paths),'transient launch owner unsupported')
                    check_surface(manager+':'+name,json.dumps(commands),known_paths,manager=='user' and name=='wbs-solver-supervisor.service')
                if '@.' in name:
                    require(fields['ActiveState']=='inactive' and fields.get('MainPID','0')=='0' and fields.get('ControlPID','0')=='0' and fields.get('Job','') in ['','0'],'template unexpectedly instantiated')
                require(query_text(host,argv)==first,'effective launch state changed during observation')
                projection={'manager':manager,'name':name,'canonicalId':canonical,'names':names,'unitFileState':installed.get(name,'loaded-only'),'loadState':fields['LoadState'],'fragment':fragment,'dropIns':sorted(drop_ins,key=lambda entry:entry['path']),'transient':fields['Transient']=='yes','commands':commands,'triggers':sorted(fields['Triggers'].split()),'triggeredBy':sorted(fields['TriggeredBy'].split())}
                if name in projections: require(projections[name]==projection,'static unit projection changed')
                projections[name]=projection
            current_installed,current_loaded=inventory(manager)
            # Proof: unit-inventory guard omission failed non-service commands.
            require(current_installed==installed,'installed unit inventory changed')
            additions=(current_loaded|discovered)-roster
            if not additions:
                require(loaded.issubset(current_loaded),'initial loaded unit disappeared')
                units.extend(projections[name] for name in sorted(projections)); break
            roster.update(additions)
        else: raise Refusal('loaded unit inventory did not converge')
    for path,inode,target,resolved in links:
        require(identity(host.metadata(path,False))==inode and host.link(path)==target and host.resolve(path)==resolved,'unit alias or mask changed')
        if observations is not None:observations.append(['link-closing',path,runtime_metadata(host.metadata(path,False)),target,resolved,runtime_parents(host,path)])
    for directory,names in memberships: require(host.listing(directory,4096)==names,'schedule membership changed')
    for path,(key,hash_value) in retained.items():
        content,current=host.regular(path,4*1024*1024)
        require(current==key and digest(content)==hash_value,'launch definition changed')
        if observations is not None:observations.append(['file-closing',path,list(current),runtime_metadata(host.metadata(path,False)),runtime_parents(host,path)])
    return {'version':1,'cron':sorted(cron,key=lambda entry:entry['source']),'units':units}

def collect_launch(host,known_paths):
    # Proof: full-static-hash guard omission failed full inventories.
    return digest(encode(_collect_launch_projection(host,known_paths)))

RUNTIME_RELATIONSHIPS=['requires','wants','requisite','bindsTo','partOf','upholds','requiredBy','requisiteOf','wantedBy','boundBy','upheldBy','consistsOf','conflicts','conflictedBy','before','after','onSuccess','onSuccessOf','onFailure','onFailureOf','triggers','triggeredBy','propagatesReloadTo','reloadPropagatedFrom','propagatesStopTo','stopPropagatedFrom','joinsNamespaceOf','requiresMountsFor']

class RuntimeFilePort:
    def __init__(self,descriptor): self.descriptor=descriptor
    def stat(self): return os.fstat(self.descriptor)
    def read(self,count): return os.read(self.descriptor,count)
    def close(self): os.close(self.descriptor)

def open_runtime_fragment(host,path):
    host.check(); parents=[]; stream=None
    try:
        descriptor=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW); parents.append(('/',RuntimeFilePort(descriptor)))
        segments=path.split('/')[1:]; prefix=''
        for segment in segments[:-1]:
            descriptor=os.open(segment,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=descriptor)
            prefix+='/'+segment; parents.append((prefix,RuntimeFilePort(descriptor)))
        stream=RuntimeFilePort(os.open(segments[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=descriptor))
        return {'file':stream,'parents':parents}
    except BaseException:
        if stream is not None:stream.close()
        for name,parent in reversed(parents):parent.close()
        raise


class RuntimeBudget:
    def __init__(self):self.bytes=0
    def admit(self,value):
        count=len(encode(value))+2
        require(self.bytes+count<=8*1024*1024,'runtime retained observation exceeds bound')
        self.bytes+=count

class RuntimeOrdinary(list):
    def __init__(self,budget):super().__init__();self.budget=budget
    def append(self,value):self.budget.admit(value);super().append(value)

def runtime_closed_pairs(pairs):
    fields={}
    for key,value in pairs:
        require(key not in fields,'duplicate runtime reply key');fields[key]=value
    return fields

def runtime_json_reply(content,limit):
    require(len(content)<=limit,'runtime typed reply unavailable or oversized')
    response=json.loads(content.decode('utf-8'),object_pairs_hook=runtime_closed_pairs)
    require(type(response)==dict and set(response)=={'type','data'},'runtime typed reply malformed');return response

def runtime_reply(host,manager,arguments,signature,method=True,limit=1024*1024):
    host.check();code,content,stderr=host.query(manager_argv(manager,'busctl')+['--json=short']+arguments)
    require(code==0 and stderr==b'','runtime typed reply unavailable or oversized')
    response=runtime_json_reply(content,limit)
    require(response['type']==signature,'runtime typed reply malformed')
    value=response['data']
    if method:
        require(type(value)==list and len(value)==1,'runtime method return malformed');value=value[0]
    host.check();return value

def runtime_call(host,manager,service,path,interface,method,signature,arguments=(),limit=1024*1024):
    return runtime_reply(host,manager,['call',service,path,interface,method]+list(arguments),signature,True,limit)

def runtime_property(host,service,path,interface,name,signature):
    return runtime_reply(host,'system',['get-property',service,path,interface,name],signature,False)

def runtime_unit_name(value):
    require(type(value)==str and 1<=len(value.encode('utf-8'))<=255 and re.fullmatch(r'[A-Za-z0-9:_.@\\-]+',value,re.ASCII) is not None,'runtime unit name malformed');return value

def runtime_path(value,prefix=None):
    require(type(value)==str and len(value.encode('utf-8'))<=4096 and re.fullmatch(r'/(?:[A-Za-z0-9_]+(?:/[A-Za-z0-9_]+)*)?',value,re.ASCII) is not None,'runtime object path malformed')
    require(prefix is None or value.startswith(prefix) and len(value)>len(prefix),'runtime object namespace differs');return value

def runtime_filesystem_path(value,empty=False):
    require(type(value)==str and len(value.encode('utf-8'))<=4096 and (empty and value=='' or value.startswith('/') and not value.startswith('//') and os.path.normpath(value)==value and (value=='/' or all(part not in ['', '.', '..'] for part in value.split('/')[1:]))) and all(unicodedata.category(character)!='Cc' for character in value),'runtime filesystem path malformed');return value

def runtime_text(value,empty=False):
    require(type(value)==str and len(value.encode('utf-8'))<=256 and (empty or len(value)>0) and all(unicodedata.category(character)!='Cc' for character in value),'runtime string malformed');return value

def runtime_bus_ids(host):
    ids=[]
    for manager in ['system','user']:
        bus=runtime_call(host,manager,'org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetId','s')
        require(type(bus)==str and re.fullmatch(r'[0-9A-Fa-f]{32}',bus,re.ASCII) is not None,'runtime bus identity malformed');ids.append(bus)
    return ids

def runtime_owners(host):
    owners=[]
    for manager,service,uid in [('system','org.freedesktop.systemd1',0),('system','org.freedesktop.login1',0),('user','org.freedesktop.systemd1',1000)]:
        owner=runtime_call(host,manager,'org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetNameOwner','s',['s',service])
        require(type(owner)==str and len(owner)<=256 and re.fullmatch(r':[0-9]+\.[0-9]+',owner,re.ASCII) is not None,'runtime service owner malformed')
        actual=runtime_call(host,manager,'org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetConnectionUnixUser','u',['s',owner])
        require(type(actual)==int and actual==uid,'runtime service owner uid differs');owners.append([manager,service,owner,actual])
    return owners

def runtime_accounts():
    accounts=[]
    for uid,name in [(0,'root'),(1000,'puni1')]:
        by_name=pwd.getpwnam(name);by_uid=pwd.getpwuid(uid)
        require(by_name.pw_uid==uid and by_name.pw_name==name and by_uid.pw_uid==uid and by_uid.pw_name==name,'runtime fixed account differs');accounts.append([uid,name])
    return accounts

def runtime_sessions(host,budget):
    service='org.freedesktop.login1';manager='/org/freedesktop/login1';interface=service+'.Manager'
    rows=runtime_call(host,'system',service,manager,interface,'ListSessions','a(susso)',limit=4*1024*1024)
    require(type(rows)==list and len(rows)<=4096,'runtime session roster malformed')
    sessions=[];ids=set();paths=set();scopes=set()
    for row in rows:
        require(type(row)==list and len(row)==5,'runtime session tuple malformed')
        session_id,uid,name,seat,path=row
        require(type(session_id)==str and re.fullmatch(r'[A-Za-z0-9_-]{1,256}',session_id,re.ASCII) is not None,'runtime session id malformed')
        require(type(uid)==int and 0<=uid<=4294967294,'runtime session uid malformed')
        runtime_text(name);runtime_text(seat,True);runtime_path(path,'/org/freedesktop/login1/session/')
        budget.admit({'tuple':row})
        require(session_id not in ids and path not in paths,'duplicate runtime session');ids.add(session_id);paths.add(path)
        selected=runtime_call(host,'system',service,manager,interface,'GetSession','o',['s',session_id]);runtime_path(selected,'/org/freedesktop/login1/session/');require(selected==path,'runtime session association differs');budget.admit({'getSession':selected})
        fields={}
        for key,signature in [('Id','s'),('User','(uo)'),('Name','s'),('Scope','s'),('Leader','u')]:
            value=runtime_property(host,service,path,service+'.Session',key,signature);budget.admit({key:value});fields[key]=value
        user=fields['User'];require(type(user)==list and len(user)==2 and type(user[0])==int and user[0]==uid,'runtime session user differs');runtime_path(user[1],'/org/freedesktop/login1/user/')
        require(fields['Id']==session_id and fields['Name']==name,'runtime session tuple differs');scope=runtime_unit_name(fields['Scope'])
        require(scope not in scopes,'duplicate runtime scope binding');scopes.add(scope)
        leader=fields['Leader'];require(type(leader)==int and 1<=leader<=2147483647,'runtime leader malformed')
        start=process_start(host,leader)[0];require(re.fullmatch(r'[0-9]{1,20}',start,re.ASCII) is not None,'runtime leader start malformed')
        cgroup=runtime_filesystem_path(parse_cgroup(host.read('/proc/'+str(leader)+'/cgroup',4096)))
        association=runtime_call(host,'system','org.freedesktop.systemd1','/org/freedesktop/systemd1','org.freedesktop.systemd1.Manager','GetUnitByPID','o',['u',str(leader)])
        runtime_path(association);require(association==unit_path(scope),'runtime leader unit differs')
        entry={'tuple':row,'getSession':selected,'properties':fields,'leader':{'pid':leader,'startTime':start,'cgroup':cgroup,'unit':association}}
        budget.admit({'leader':entry['leader']});sessions.append(entry)
    return sorted(sessions,key=lambda entry:entry['tuple'])

def runtime_parents(host,path):
    parents=[];parent=os.path.dirname(path)
    while True:
        parents.append([parent,runtime_metadata(host.metadata(parent,False))])
        if parent=='/':return parents
        parent=os.path.dirname(parent)

def runtime_metadata(metadata):
    return list(metadata_key(metadata))+[metadata.st_uid,metadata.st_gid]

class RuntimeFragments:
    def __init__(self,host,budget):self.host=host;self.budget=budget;self.retained={};self.bytes=0
    def capture(self,path):
        require(path not in self.retained,'duplicate runtime fragment');opened=self.host.open_runtime_fragment(path)
        try:
            parents=[]
            for name,port in opened['parents']:
                metadata=port.stat();named=self.host.metadata(name,False)
                require(stat.S_ISDIR(metadata.st_mode) and runtime_metadata(metadata)==runtime_metadata(named),'runtime fragment parent differs');parents.append([name,runtime_metadata(metadata)])
            before=opened['file'].stat();require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==0o644 and before.st_uid==0 and 0<before.st_size<=4*1024*1024,'runtime fragment mode or size differs')
            require(runtime_metadata(before)==runtime_metadata(self.host.metadata(path,False)),'runtime fragment named identity differs')
            chunks=[];count=0
            while True:
                self.host.check();chunk=opened['file'].read(min(65536,4*1024*1024+1-count))
                if not chunk:break
                count+=len(chunk);require(count<=4*1024*1024,'runtime fragment byte bound exceeded');chunks.append(chunk)
            content=b''.join(chunks);self.bytes+=count;require(self.bytes<=64*1024*1024 and count==before.st_size,'runtime fragment byte count differs')
            require(runtime_metadata(opened['file'].stat())==runtime_metadata(before)==runtime_metadata(self.host.metadata(path,False)),'runtime fragment changed')
            for (name,port),(expected_name,metadata) in zip(opened['parents'],parents):require(name==expected_name and runtime_metadata(port.stat())==metadata==runtime_metadata(self.host.metadata(name,False)),'runtime fragment parent changed during read')
            self.budget.admit({'path':path,'metadata':runtime_metadata(before),'parents':parents,'contents':content.decode('utf-8')})
            self.retained[path]=(opened,runtime_metadata(before),parents,content);return content
        except BaseException:
            opened['file'].close()
            for name,port in reversed(opened['parents']):port.close()
            raise
    def verify(self):
        for path,(opened,before,parents,content) in self.retained.items():
            self.host.check();require(runtime_metadata(opened['file'].stat())==before==runtime_metadata(self.host.metadata(path,False)),'runtime fragment closing identity differs')
            for (name,port),(expected_name,metadata) in zip(opened['parents'],parents):
                require(name==expected_name and runtime_metadata(port.stat())==metadata==runtime_metadata(self.host.metadata(name,False)),'runtime fragment closing parent differs')
            reread=self.host.open_runtime_fragment(path)
            try:
                require(runtime_metadata(reread['file'].stat())==before,'runtime fragment reopened identity differs');chunks=[];count=0
                while True:
                    self.host.check();chunk=reread['file'].read(min(65536,4*1024*1024+1-count))
                    if not chunk:break
                    count+=len(chunk);require(count<=4*1024*1024,'runtime fragment closing bound exceeded');chunks.append(chunk)
                require(b''.join(chunks)==content and count==before[3] and runtime_metadata(reread['file'].stat())==before==runtime_metadata(self.host.metadata(path,False)),'runtime fragment closing bytes differ')
                for (name,port),(expected_name,metadata) in zip(reread['parents'],parents):require(name==expected_name and runtime_metadata(port.stat())==metadata==runtime_metadata(self.host.metadata(name,False)),'runtime fragment reopened parent differs')
            finally:
                reread['file'].close()
                for name,port in reversed(reread['parents']):port.close()
    def close(self):
        for opened,before,parents,content in self.retained.values():
            opened['file'].close()
            for name,port in reversed(opened['parents']):port.close()

def runtime_normalize_fragment(content,session):
    text=content.decode('utf-8');require('\x00' not in text,'runtime fragment NUL');section=None;count=0;lines=[]
    for line in text.splitlines(keepends=True):
        body=line.rstrip('\r\n');ending=line[len(body):]
        require('\\' not in body,'runtime fragment escape ambiguous')
        if not body.strip() or body.lstrip().startswith(('#',';')):lines.append(line);continue
        if body.startswith('['):
            require(re.fullmatch(r'\[[A-Za-z0-9]+\]',body) is not None,'runtime fragment section malformed');section=body[1:-1]
        else:
            key,separator,value=body.partition('=');require(section is not None and separator and re.fullmatch(r'[A-Za-z][A-Za-z0-9]*',key) is not None,'runtime fragment assignment malformed')
            if key=='Description':
                count+=1;require(section=='Unit' and value=='Session '+session['tuple'][0]+' of User '+session['tuple'][2],'runtime fragment description differs');line='Description=@logind-session-description'+ending
        lines.append(line)
    require(count==1,'runtime fragment description missing or duplicate');return ''.join(lines).encode('utf-8')

def runtime_scope_evidence(host,sessions,budget):
    evidence=[]
    for session in sessions:
        uid=session['tuple'][1];require(uid in [0,1000] and session['tuple'][2]==('root' if uid==0 else 'puni1'),'runtime session account unsupported')
        path=unit_path(session['properties']['Scope']);fields={}
        for key,interface,signature in [('Slice','Scope','s'),('ControlGroup','Scope','s'),('SourcePath','Unit','s')]+[(key[0].upper()+key[1:],'Unit','as') for key in RUNTIME_RELATIONSHIPS]:
            value=runtime_property(host,'org.freedesktop.systemd1',path,'org.freedesktop.systemd1.'+interface,key,signature)
            if signature=='as':
                require(type(value)==list and len(value)<=4096 and all(type(entry)==str for entry in value) and len(set(value))==len(value),'runtime relationship malformed')
                if key=='RequiresMountsFor':
                    for entry in value:runtime_filesystem_path(entry)
                else:
                    for entry in value:runtime_unit_name(entry)
                value=sorted(value)
            elif key=='SourcePath':runtime_filesystem_path(value,True)
            elif key=='Slice':runtime_unit_name(value)
            else:runtime_filesystem_path(value)
            budget.admit({key:value});fields[key]=value
        evidence.append(fields)
    return evidence

def runtime_classify(host,projection,sessions,evidence,profiles,fragments,known_paths):
    included=[];scope_names={session['properties']['Scope'] for session in sessions};durable={unit['name'] for unit in projection['units'] if unit['manager']=='system' and unit['name'] not in scope_names};seen=set()
    for unit in projection['units']:
        matches=[(session,fields) for session,fields in zip(sessions,evidence) if unit['manager']=='system' and unit['name']==session['properties']['Scope']]
        if not matches:included.append(unit);continue
        require(len(matches)==1,'runtime scope ambiguous');session,fields=matches[0];uid=session['tuple'][1];scope=unit['name'];seen.add(scope)
        require(unit['canonicalId']==scope and unit['names']==[scope] and scope.endswith('.scope') and unit['loadState']=='loaded' and unit['transient'] is True and unit['unitFileState'] in ['loaded-only','transient'],'runtime session scope class differs')
        require(unit['dropIns']==[] and unit['commands']==[] and unit['triggers']==[] and unit['triggeredBy']==[] and fields['SourcePath']=='','runtime session scope launch surface differs')
        expected_slice='user-'+str(uid)+'.slice';expected_cgroup='/user.slice/'+expected_slice+'/'+scope
        require(fields['Slice']==expected_slice and fields['ControlGroup']==expected_cgroup and (session['leader']['cgroup']==expected_cgroup or session['leader']['cgroup'].startswith(expected_cgroup+'/')),'runtime scope leader/slice differs')
        for key in ['Triggers','TriggeredBy','OnSuccess','OnFailure','Upholds']:require(fields[key]==[],'runtime session activation edge unsupported')
        for key in ['Requires','Wants','Requisite','BindsTo']:
            for target in fields[key]:require(target in durable and (target in [expected_slice,'user-runtime-dir@'+str(uid)+'.service','user@'+str(uid)+'.service'] or target.endswith('.mount')),'runtime session activation target unsupported')
        path='/run/systemd/transient/'+scope;require(unit['fragment'] is not None and unit['fragment']['path']==path,'runtime fragment path differs');content=fragments.capture(path)
        require(digest(content)==unit['fragment']['sha256'],'runtime fragment ordinary binding differs');check_surface(path,content.decode('utf-8'),known_paths,False)
        normalized=dict(unit);normalized.update({'name':'@logind-session-scope','canonicalId':'@logind-session-scope','names':['@logind-session-scope'],'fragment':{'path':'@logind-session-fragment','sha256':digest(runtime_normalize_fragment(content,session))}})
        relationships={'slice':fields['Slice']}
        for key in RUNTIME_RELATIONSHIPS:relationships[key]=fields[key[0].upper()+key[1:]]
        profile={'version':1,'uid':uid,'unit':normalized,'relationships':relationships}
        require(digest(b'wbs-dependency-logind-scope\0v1\0'+encode(profile))==profiles[0 if uid==0 else 1]['sha256'],'runtime session profile differs')
    require(seen==scope_names,'runtime associated scope absent');return included

def collect_runtime_launch_hash(host,known_paths,session_profiles):
    host.check();budget=RuntimeBudget();fragments=RuntimeFragments(host,budget)
    try:
        ids=runtime_bus_ids(host);owners=runtime_owners(host);accounts=runtime_accounts();budget.admit([ids,owners,accounts]);sessions=runtime_sessions(host,budget)
        ordinary=RuntimeOrdinary(budget);projection=_collect_launch_projection(host,known_paths,ordinary);evidence=runtime_scope_evidence(host,sessions,budget)
        opening={'ids':ids,'owners':owners,'accounts':accounts,'sessions':sessions,'scopes':evidence}
        require(len(encode(opening))<=8*1024*1024,'runtime retained observation exceeds bound')
        units=runtime_classify(host,projection,sessions,evidence,session_profiles,fragments,known_paths)
        require(runtime_bus_ids(host)==ids,'runtime opening bus incarnation changed')
        require(runtime_bus_ids(host)==ids,'runtime closing bus incarnation changed')
        closing_budget=RuntimeBudget();closing_owners=runtime_owners(host);closing_accounts=runtime_accounts();closing_budget.admit([ids,closing_owners,closing_accounts]);closing_sessions=runtime_sessions(host,closing_budget);closing_evidence=runtime_scope_evidence(host,closing_sessions,closing_budget)
        closing={'ids':ids,'owners':closing_owners,'accounts':closing_accounts,'sessions':closing_sessions,'scopes':closing_evidence}
        require(len(encode(closing))<=8*1024*1024 and closing==opening,'runtime session observation changed')
        closing_ordinary=RuntimeOrdinary(closing_budget);closing_projection=_collect_launch_projection(host,known_paths,closing_ordinary)
        require(closing_projection==projection and closing_ordinary==ordinary,'runtime ordinary launch observation changed');fragments.verify()
        require(runtime_owners(host)==owners,'runtime closing owner changed');require(runtime_bus_ids(host)==ids,'runtime final bus incarnation changed');host.check()
        return digest(b'wbs-dependency-runtime-launch\0v1\0'+encode({'version':1,'cron':projection['cron'],'units':units,'sessionProfiles':session_profiles}))
    finally:fragments.close()

def check_surface(source,text,known_paths,allowed):
    # Proof: launch surface negatives include differently named wrappers and duplicate units/cron.
    matches=[path for path in known_paths if path in text]
    if not matches: return
    if allowed and source=='crontab:puni1':
        relevant=[line for line in text.splitlines() if any(path in line for path in known_paths)]
        # Proof: direct-launch guard omission failed direct duplicate.
        require(len(relevant)==1 and '/home/puni1/wbs-dev/bin/poll.sh' in relevant[0] and all(path=='/home/puni1/wbs-dev/bin/poll.sh' for path in matches),'unsupported direct launch source')
    elif allowed and source in ['user:wbs-solver-supervisor.service','/home/puni1/.config/systemd/user/wbs-solver-supervisor.service']:
        require(all(path.startswith('/home/puni1/.local/lib/wbs-solver/') or path.startswith('/home/puni1/.config/wbs-solver/') for path in matches),'unsupported solver launch source')
    else: raise Refusal('unsupported direct launch source')

def capture_database_family(host,databases):
    families=[]; inodes=set()
    require(len(databases)==2 and [entry.get('environment') for entry in databases]==['prod','dev'],'database roster differs')
    for entry in databases:
        require(set(entry)=={'environment','host','directoryIdentity','fileIdentity'},'database request malformed')
        path=entry['host']; root='/home/puni1/'+('wbs' if entry['environment']=='prod' else 'wbs-dev')+'/data/'
        require(type(path)==str and path.startswith(root) and os.path.normpath(path)==path,'database outside fixed root')
        parent=os.path.dirname(path)
        require(host.resolve(parent)==parent,'database parent alias unsupported')
        # Proof: db-parent-pin guard omission failed whole collector.
        require(identity(host.metadata(parent,False))==entry['directoryIdentity'],'database parent identity differs')
        main=host.metadata(path,False)
        # Proof: db-file-pin guard omission failed whole collector.
        require(stat.S_ISREG(main.st_mode) and identity(main)==entry['fileIdentity'],'database main identity differs')
        for suffix in ['','-wal','-shm','-journal']:
            name=path+suffix
            try:
                metadata=host.metadata(name,False)
                require(stat.S_ISREG(metadata.st_mode),'database family is not ordinary')
                require(identity(metadata) not in inodes,'database family inode alias'); inodes.add(identity(metadata))
                families.append({'environment':entry['environment'],'suffix':suffix,'path':name,'identity':identity(metadata),'metadata':metadata_key(metadata)[:3]})
            except FileNotFoundError:
                require(suffix!='' and not host.exists(name),'database family unreadable')
                families.append({'environment':entry['environment'],'suffix':suffix,'path':name,'identity':None,'metadata':None})
    return families

def process_start(host,pid): return parse_stat(host.read('/proc/'+str(pid)+'/stat',1024*1024))

def ended_process(host,pid,start):
    try: current=process_start(host,pid)[0]
    except FileNotFoundError:
        # Independently confirm namespace absence after a vanished identity.
        require(str(pid) not in host.listing('/proc',65536),'process inaccessible rather than ended')
        return True
    return current!=start

def capture_internal_process(host,pid):
    base='/proc/'+str(pid);start=process_start(host,pid)[0]
    group=parse_cgroup(host.read(base+'/cgroup',1024*1024));command=host.read(base+'/cmdline',1024*1024)
    status=host.read(base+'/status',1024*1024).decode();uids=[line.split()[1:] for line in status.splitlines() if line.startswith('Uid:')]
    require(len(uids)==1 and len(uids[0])==4,'internal uid malformed')
    metadata=host.metadata(base+'/exe');path=host.link(base+'/exe');cwd=host.link(base+'/cwd')
    # Proof: replacing this call with the prior unchecked read accepted B in internal capture.
    executable={'device':str(metadata.st_dev),'inode':str(metadata.st_ino),'sha256':digest(host.read_executable(pid,metadata))}
    with open(base+'/stat','rb') as stream:content=stream.read(1024*1024)
    fields=content[content.rfind(b') ')+2:].split();require(len(fields)>=20,'internal parent malformed')
    require(process_start(host,pid)[0]==start and parse_cgroup(host.read(base+'/cgroup',1024*1024))==group and host.read(base+'/cmdline',1024*1024)==command and identity(host.metadata(base+'/exe'))==identity(metadata),'internal process changed during capture')
    return {'identity':{'pid':pid,'startTime':start,'uid':int(uids[0][0]),'cgroup':group,'executable':executable,'argvSha256':digest(command),'cwd':cwd},'parent':int(fields[1]),'argv':command.rstrip(b'\x00').split(b'\x00'),'path':path}

def assert_internal_processes(host):
    # Proof: retained-internal-liveness omission admitted a vanished native bound-process identity.
    for pid,expected in getattr(host,'internal_processes',{}).items():
        require(capture_internal_process(host,pid)['identity']==expected,'retained internal process ended or changed')

def relevant_executor(argv,cwd,executable,known_paths):
    text='\x00'.join(argv)
    return any(path in text or executable==path for path in known_paths) or '/home/puni1/wbs-build/' in text or '/home/puni1/wbs-dev/bin/sync.' in text or (cwd is not None and cwd.startswith('/home/puni1/wbs-build/') and any(part.endswith(('.ts','.js','.sh')) for part in argv))

def observe_process(host,pid,families,known_paths,coordinator):
    for attempt in range(3):
        start,state,flags=process_start(host,pid)
        base='/proc/'+str(pid)
        try:
            status=host.read(base+'/status',1024*1024).decode()
            uids=[line.split()[1:] for line in status.splitlines() if line.startswith('Uid:')]
            require(len(uids)==1 and len(uids[0])==4 and all(part.isdecimal() for part in uids[0]),'process uid malformed')
            uid=int(uids[0][0]); cgroup=parse_cgroup(host.read(base+'/cgroup',1024*1024))
            command=host.read(base+'/cmdline',1024*1024)
            require(not command or command.endswith(b'\x00'),'process command malformed')
            argv=[part.decode(errors='surrogateescape') for part in command.rstrip(b'\x00').split(b'\x00')] if command else []
            special=(flags & 0x00200000)!=0 or state==b'Z'
            if special:
                require(not argv,'special process has unexpected command'); executable=None; cwd=None; executable_path=None
            else:
                executable_path=host.link(base+'/exe'); cwd=host.link(base+'/cwd')
                require(cwd.startswith('/'),'process cwd malformed')
                executable_metadata=host.metadata(base+'/exe')
                executable={'device':str(executable_metadata.st_dev),'inode':str(executable_metadata.st_ino),'sha256':None}
            relevant=relevant_executor(argv,cwd,executable_path,known_paths)
            exact=pid==coordinator['pid'] and start==coordinator['startTime'] and cgroup==coordinator['cgroup']
            if relevant or pid in getattr(host,'internal_processes',{}):
                require(executable is not None,'relevant executor missing executable')
                # Proof: replacing this call with the prior unchecked read accepted B in relevant observation.
                executable['sha256']=digest(host.read_executable(pid,executable_metadata))
            current={'pid':pid,'startTime':start,'uid':uid,'cgroup':cgroup,'executable':executable,'argvSha256':digest(command),'cwd':cwd}
            # Proof: internal-full-identity weakening admitted native transport argv identity drift.
            internal=getattr(host,'internal_processes',{}).get(pid)==current
            require(pid not in getattr(host,'internal_processes',{}) or internal,'internal process identity changed')
            expected_solver=getattr(host,'solver_process',None)
            solver_candidate=executable_path=='/home/puni1/.local/lib/wbs-solver/bun' and '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js' in argv
            # Proof: solver-kernel-binding omission admitted the real manually launched supervisor with wrong unit identities.
            solver=solver_candidate and expected_solver is not None and all(current[key]==value for key,value in expected_solver.items())
            # Proof: solver-coordinator-alias omission let a manual supervisor reuse the coordinator exception while the unit was stopped.
            require(not solver_candidate or solver,'unmanaged solver supervisor remains')
            # Proof: prior-interpreter guard omission failed reports all database openers.
            if relevant and not exact and not solver and not internal: raise Refusal('prior or unclassified host executor remains')
            openers=[]
            # Proof: self-listing-fd omission made the real unchanged self-census fail all three FD retries.
            with SelfDescriptors(host,pid):
                for fd_attempt in range(3):
                    descriptors=host.listing(base+'/fd',65536)
                    require(all(name.isdecimal() for name in descriptors),'process descriptor roster malformed')
                    captured=[]; raced=False
                    for fd in descriptors:
                        host.fd_count+=1; require(host.fd_count<=1000000,'total descriptor bound exceeded')
                        try:
                            target=host.link(base+'/fd/'+fd); metadata=host.metadata(base+'/fd/'+fd)
                        except FileNotFoundError:
                            raced=True; break
                        try:
                            if identity(host.metadata(base+'/fd/'+fd))!=identity(metadata) or host.link(base+'/fd/'+fd)!=target:
                                raced=True; break
                        except FileNotFoundError:
                            raced=True; break
                        # Proof: fd-inode guard omission failed reports all database openers.
                        selected=[family for family in families if family['identity']==identity(metadata)]
                        if target.endswith(' (deleted)') and (selected or any(target[:-10]==family['path'] for family in families)):
                            raise Refusal('deleted selected database alias remains')
                        for family in selected:
                            captured.append({'environment':family['environment'],'suffix':family['suffix'],'pid':pid,'startTime':start,'uid':uid,'cgroup':cgroup,'fd':int(fd),'executable':executable})
                    if not raced and host.listing(base+'/fd',65536)==descriptors:
                        openers=captured; break
                else: raise Refusal('process descriptor census did not converge')
            require(not special or not descriptors,'special process retains descriptors')
            if openers and executable is not None and executable['sha256'] is None:
                # Proof: replacing this call with the prior unchecked read accepted B in late opener observation.
                executable['sha256']=digest(host.read_executable(pid,executable_metadata))
            again=process_start(host,pid)
            if again[0]!=start:
                continue
            require(parse_cgroup(host.read(base+'/cgroup',1024*1024))==cgroup and host.read(base+'/cmdline',1024*1024)==command,'process cgroup or command changed')
            if not special:
                final_executable=host.metadata(base+'/exe')
                require(str(final_executable.st_dev)==executable['device'] and str(final_executable.st_ino)==executable['inode'] and host.link(base+'/exe')==executable_path and host.link(base+'/cwd')==cwd,'process executable or cwd changed')
            # Exact collector/query children must still have no selected DB descriptor.
            require((pid not in host.children and not internal) or not openers,'collector child owns database descriptor')
            return {'pid':pid,'startTime':start,'uid':uid,'cgroup':cgroup,'executable':executable,'argvSha256':digest(command),'cwd':cwd},openers,relevant or solver
        # Proof: unreadability guard omission failed reports all database openers.
        except (FileNotFoundError,ProcessLookupError):
            if ended_process(host,pid,start):
                try: process_start(host,pid)
                except FileNotFoundError: return None,[],False
                continue
            raise Refusal('partial process observation')
    raise Refusal('process identity did not converge')

def collect_processes(host,families,known_paths,coordinator):
    assert_internal_processes(host)
    identities={}; openers={}; relevant={}; host.fd_count=0
    for round_number in range(3):
        roster=[int(name) for name in host.listing('/proc',65536) if name.isdecimal()]
        for pid in roster:
            try: observed,opened,is_relevant=observe_process(host,pid,families,known_paths,coordinator)
            except FileNotFoundError:
                require(str(pid) not in host.listing('/proc',65536),'partial census process missing'); continue
            if observed is None: continue
            key=(pid,observed['startTime'])
            if pid in relevant:
                require(relevant[pid]==observed,'relevant process identity changed')
            if round_number and key not in identities:
                # Proof: late-writer guard omission failed real complete census.
                require(not is_relevant and not opened,'new relevant process appeared')
            if round_number and pid in openers and (openers[pid] or opened):
                require(openers[pid]==opened and identities.get(key)==observed,'database opener changed during census')
            identities[key]=observed
            openers[pid]=opened
            if is_relevant: relevant[pid]=observed
        after=[int(name) for name in host.listing('/proc',65536) if name.isdecimal()]
        if round_number>0 and set(after).issubset(roster):
            for (pid,start),observed in identities.items():
                # Proof: census-omission guard omission failed real complete census.
                if pid not in after:require(ended_process(host,pid,start),'previous census identity omitted')
            for pid,observed in relevant.items():
                require(not ended_process(host,pid,observed['startTime']),'relevant process ended during observation')
            return sorted([entry for pid in after for entry in openers.get(pid,[])],key=lambda entry:(entry['environment'],entry['suffix'],entry['pid'],entry['fd'])), list(relevant.values())
    raise Refusal('process census did not converge')

WRITER_NAMES=['prod-swap','prod-smoke','dev-swap','dev-smoke','dev-poller','dev-loader','dev-interpreter','declared-manual-launcher','declared-bootstrap','declared-configure','shared-launch-authority','shared-restart-authority']
FIXED_WRITERS=['/home/puni1/wbs/bin/swap.js','/home/puni1/wbs/bin/smoke.js','/home/puni1/wbs-dev/bin/swap.js','/home/puni1/wbs-dev/bin/smoke.js','/home/puni1/wbs-dev/bin/poll.sh','/home/puni1/wbs-dev/bin/dev-poll-sync.sh','/home/puni1/wbs-dev/bin/bun']

def validate_request(request):
    require(type(request)==dict and set(request)=={'nonce','writerManifestSha256','coordinator','databases','layouts','writerPaths','solver'},'collector request malformed')
    require(type(request['nonce'])==str and re.fullmatch('[a-f0-9]{64}',request['nonce']) is not None,'collector nonce malformed')
    require(type(request['writerManifestSha256'])==str and re.fullmatch('[a-f0-9]{64}',request['writerManifestSha256']) is not None,'writer manifest binding malformed')
    require(request['layouts']==['prod','dev'],'collector layouts differ')
    coordinator=request['coordinator']
    require(type(coordinator)==dict and set(coordinator)=={'pid','startTime','cgroup'} and type(coordinator['pid'])==int and coordinator['pid']>0 and type(coordinator['startTime'])==str and coordinator['startTime'].isdecimal() and type(coordinator['cgroup'])==str and parse_cgroup(('0::'+coordinator['cgroup']).encode())==coordinator['cgroup'],'coordinator identity malformed')
    solver=request['solver']
    if solver is not None:
        require(type(solver)==dict and set(solver)=={'pid','startTime','uid','cgroup','executable','argvSha256'},'solver process binding malformed')
        require(type(solver['pid'])==int and solver['pid']>0 and solver['uid']==1000 and type(solver['startTime'])==str and solver['startTime'].isdecimal() and parse_cgroup(('0::'+solver['cgroup']).encode())==solver['cgroup'],'solver kernel identity malformed')
        require(type(solver['executable'])==dict and set(solver['executable'])=={'device','inode','sha256'} and all(type(solver['executable'][key])==str and solver['executable'][key].isdecimal() for key in ['device','inode']) and re.fullmatch('[a-f0-9]{64}',solver['executable']['sha256']) is not None and re.fullmatch('[a-f0-9]{64}',solver['argvSha256']) is not None,'solver executable binding malformed')
    paths=request['writerPaths']
    # Proof: writer-roster guard omission failed finite private matching.
    require(type(paths)==list and len(paths)==12,'writer path roster differs')
    for index,entry in enumerate(paths):
        require(type(entry)==dict and set(entry)=={'member','path'} and entry['member']==WRITER_NAMES[index],'writer path roster differs')
        path=entry['path']
        require(type(path)==str and 1<len(path)<=4096 and path.startswith('/') and os.path.normpath(path)==path and '\x00' not in path and not any(path==root or path.startswith(root+'/') for root in ['/proc','/sys','/dev']),'writer needle malformed')
        # Proof: writer-fixed-path guard omission failed finite private matching.
        require(index>=7 or path==FIXED_WRITERS[index],'fixed writer location differs')
    require(len({entry['path'] for entry in paths})==12,'writer needle alias')
    # Paths are matching needles only. Privileged reads remain fixed or validated DB-family paths.
    return [entry['path'] for entry in paths]+['/home/puni1/.local/lib/wbs-solver/bun','/home/puni1/.local/lib/wbs-solver/solver-supervisor.js','/home/puni1/.config/wbs-solver/solver-supervisor.json','/home/puni1/wbs-build/','/home/puni1/wbs-dev/bin/sync.']

def collect(request,host):
    known_paths=validate_request(request)
    host.solver_process=request['solver']
    require(os.geteuid()==0 and pwd.getpwnam('puni1').pw_uid==1000,'collector requires fixed root and user identities')
    machine=host.read('/etc/machine-id',1024)
    require(re.fullmatch(b'[a-f0-9]{32}\n?',machine) is not None,'machine identity malformed')
    boot=host.read('/proc/sys/kernel/random/boot_id',1024)
    require(re.fullmatch(b'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\n?',boot) is not None,'boot identity malformed')
    families=capture_database_family(host,request['databases'])
    launch=collect_launch(host,known_paths)
    coordinator=request['coordinator']
    # Proof: coordinator-binding guard omission failed coordinator, final host.
    require(process_start(host,coordinator['pid'])[0]==coordinator['startTime'] and parse_cgroup(host.read('/proc/'+str(coordinator['pid'])+'/cgroup',1024*1024))==coordinator['cgroup'],'coordinator identity changed')
    openers,relevant=collect_processes(host,families,known_paths,coordinator)
    if host.solver_process is not None:require(sum(all(process[key]==value for key,value in host.solver_process.items()) for process in relevant)==1,'effective solver missing from complete census')
    # Proof: db-sidecar-drift guard omission failed whole collector.
    require(capture_database_family(host,request['databases'])==families,'database family changed')
    # Proof: launch-final guard omission failed coordinator, final host.
    require(collect_launch(host,known_paths)==launch,'launch configuration changed')
    # Proof: host-final guard omission failed coordinator, final host.
    require(host.read('/etc/machine-id',1024)==machine and host.read('/proc/sys/kernel/random/boot_id',1024)==boot,'host identity changed')
    assert_internal_processes(host)
    return {'nonce':request['nonce'],'writerManifestSha256':request['writerManifestSha256'],'complete':True,'version':1,'euid':0,'hostMachineIdSha256':digest(machine),'bootId':boot.decode().strip(),'launchConfigurationSha256':launch,'databaseOpeners':openers,'relevantProcesses':relevant,'internalProcesses':list(host.internal_processes.values())}

def main(request,deadline):
    try:
        observed=collect(request,Host(deadline))
        contents=encode(observed)
        require(len(contents)<=32*1024*1024,'collector output bound exceeded')
        os.write(1,contents+b'\n')
    except BaseException:
        # Payloads, argv, definitions and parser exception causes never cross the private collector boundary.
        os.write(2,b'installed authority collection refused\n')
        raise SystemExit(1)
`;
