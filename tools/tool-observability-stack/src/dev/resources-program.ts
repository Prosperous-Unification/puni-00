/** Fixed, embedded read-only provider. run's path/command dependencies allow real filesystem fixtures without production flags. */
export const resourceProgram = String.raw`import datetime,json,os,pathlib,re,selectors,subprocess,time

MACHINE='bed07fdd1c9d47c08540df462db009f4'
DAEMON='91cee18b-c061-4279-a311-1ac86ca3dd97'
PROJECTS={'puni-dev-observability':['elasticsearch','kibana','gateway','collector','prometheus','alertmanager'],'h3mon-observability':['mlflow','otel-collector','victorialogs','victoriatraces','victoriametrics','vmauth','grafana']}
PROJECTION='{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"started":{{json .State.StartedAt}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"memory":{{json .HostConfig.Memory}},"nanoCpus":{{json .HostConfig.NanoCpus}},"cpuPeriod":{{json .HostConfig.CpuPeriod}},"cpuQuota":{{json .HostConfig.CpuQuota}},"cpuset":{{json .HostConfig.CpusetCpus}}}'
LIMIT=9007199254740991

def integer(value,minimum=0):
 # Proof: removing this guard fails unsafe-number in resources-ssh.test.ts.
 assert type(value) is int and minimum<=value<=LIMIT,'integer'
 return value

def number(text,minimum=0):
 # Proof: removing this guard fails negative-number in resources-ssh.test.ts.
 assert re.fullmatch(r'[0-9]+',text),'number'
 return integer(int(text),minimum)

def read(path):
 with path.open('rb') as stream:
  content=stream.read(32769)
 # Proof: removing this guard fails file-bound in resources-ssh.test.ts.
 assert len(content)<=32768,'file bound'
 return content.decode('utf-8').strip()

def run(proc=pathlib.Path('/proc'),cgroups=pathlib.Path('/sys/fs/cgroup'),machine=pathlib.Path('/etc/machine-id'),boot=pathlib.Path('/proc/sys/kernel/random/boot_id'),docker=None):
 # Proof: removing this explicit refusal admits the foreign-machine -O fixture; optimized Python test fails.
 if not __debug__: raise RuntimeError('Optimized Python is unsupported')
 deadline=time.monotonic()+8
 def command(args):
  child=subprocess.Popen(['docker',*args],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  try:
   selector=selectors.DefaultSelector()
   with selector:
    selector.register(child.stdout,selectors.EVENT_READ)
    captured=bytearray()
    while True:
     remaining=deadline-time.monotonic()
     # Proof: removing the select deadline fails command-deadline's intended refusal (9.052s); restored.
     if not selector.select(max(0,remaining)): raise TimeoutError('provider deadline')
     chunk=os.read(child.stdout.fileno(),min(4096,32769-len(captured)))
     if not chunk: break
     captured.extend(chunk)
     # Proof: removing this guard fails command-bound in resources-ssh.test.ts.
     assert len(captured)<=32768,'command bound'
   # Proof: removing this guard fails command-exit in resources-ssh.test.ts.
   assert child.wait(timeout=max(0.001,deadline-time.monotonic()))==0,'docker unavailable'
   return captured.decode('utf-8')
  finally:
   if child.poll() is None: child.kill()
   child.wait()
   child.stdout.close()
 docker=command if docker is None else docker
 # Proof: removing this guard fails refuses machine before in resources-ssh.test.ts.
 assert read(machine)==MACHINE,'machine'
 authority=docker(['info','--format','{{.ID}}']).strip()
 # Proof: removing this guard fails refuses daemon before in resources-ssh.test.ts.
 assert authority==DAEMON,'daemon'
 generation=read(boot)
 # Proof: removing this guard fails refuses boot with in resources-ssh.test.ts.
 assert re.fullmatch(r'[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}',generation),'boot'
 # Proof: removing this guard fails refuses controllers with in resources-ssh.test.ts.
 assert {'cpu','memory'}.issubset(set(read(cgroups/'cgroup.controllers').split())),'cgroup v2'
 roster=docker(['ps','--all','--no-trunc','--format','{{.ID}} {{.Names}}']).splitlines()
 # Proof: removing this guard fails refuses roster-bound before in resources-ssh.test.ts.
 assert 13<=len(roster)<=64,'roster bound'
 names={}
 for line in roster:
  fields=line.split()
  # Proof: removing this guard fails refuses roster-identity with in resources-ssh.test.ts.
  assert len(fields)==2 and re.fullmatch(r'[a-f0-9]{64}',fields[0]) and fields[1] not in names,'roster identity'
  names[fields[1]]=fields[0]
 selected=[(project,role,project+'-'+role+'-1') for project,roles in PROJECTS.items() for role in roles]
 # Proof: removing this guard fails refuses missing-role before in resources-ssh.test.ts.
 assert all(name in names for _,_,name in selected),'missing role'
 ids=[names[name] for _,_,name in selected]
 # Proof: removing this guard fails refuses duplicate-identity with in resources-ssh.test.ts.
 assert len(set(ids))==13,'duplicate identities'
 def inspect():
  lines=docker(['inspect','--format',PROJECTION,*ids]).splitlines()
  # Proof: removing this guard fails refuses inspect-count with in resources-ssh.test.ts.
  assert len(lines)==13,'inspect count'
  rows=[json.loads(line) for line in lines]
  for row,(project,role,name),identity in zip(rows,selected,ids):
   # Proof: removing this guard fails refuses projection with in resources-ssh.test.ts.
   assert set(row)=={'id','name','running','pid','started','project','service','memory','nanoCpus','cpuPeriod','cpuQuota','cpuset'},'projection'
   # Proof: removing this guard fails refuses owner before in resources-ssh.test.ts.
   assert row['id']==identity and row['name']=='/'+name and row['project']==project and row['service']==role and row['running'] is True,'ownership'
   integer(row['pid'],1)
   # Proof: removing this guard fails refuses started before in resources-ssh.test.ts.
   assert isinstance(row['started'],str) and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z',row['started']),'started'
   integer(row['memory']);integer(row['nanoCpus']);integer(row['cpuPeriod']);integer(row['cpuQuota'],-1)
   # Proof: removing this guard fails refuses cpuset with in resources-ssh.test.ts.
   assert isinstance(row['cpuset'],str) and len(row['cpuset'])<=128 and re.fullmatch(r'[0-9,-]*',row['cpuset']),'cpuset'
  return rows
 before=inspect()
 meminfo={}
 for line in read(proc/'meminfo').splitlines():
  fields=line.split()
  if fields[0] in ['MemTotal:','MemAvailable:']:
   # Proof: removing this guard fails refuses meminfo-units with in resources-ssh.test.ts.
   assert len(fields)==3 and fields[2]=='kB' and fields[0] not in meminfo,'meminfo units'
   meminfo[fields[0]]=integer(number(fields[1])*1024)
 # Proof: removing this guard fails refuses host-memory with in resources-ssh.test.ts.
 assert set(meminfo)=={'MemTotal:','MemAvailable:'} and 0<=meminfo['MemAvailable:']<=meminfo['MemTotal:'] and meminfo['MemTotal:']>0,'host memory'
 stat=[line.split() for line in read(proc/'stat').splitlines()]
 cpus=[fields for fields in stat if fields[0]=='cpu']
 starts=[fields for fields in stat if fields[0]=='btime']
 # Proof: removing this guard fails refuses host-stat with in resources-ssh.test.ts.
 assert len(cpus)==1 and len(cpus[0])>=11 and len(starts)==1 and len(starts[0])==2,'host stat'
 ticks=integer(os.sysconf('SC_CLK_TCK'),1)
 counters=[number(field) for field in cpus[0][1:11]]
 # Proof: removing this guard fails refuses guest-accounting with in resources-ssh.test.ts.
 assert counters[8]<=counters[0] and counters[9]<=counters[1],'guest accounting'
 cpu_seconds=integer(sum(counters[index] for index in [0,1,2,5,6,7]))/ticks
 host_start=integer(number(starts[0][1],1)*1000)
 root=cgroups.resolve(strict=True)
 def bind(row):
  pid=row['pid']
  process=read(proc/str(pid)/'stat')
  # Proof: removing this guard fails refuses pid-stat with in resources-ssh.test.ts.
  assert process.startswith(str(pid)+' (') and ') ' in process,'pid stat'
  fields=process.rsplit(') ',1)[1].split()
  # Proof: removing this guard fails refuses pid-stat-length with in resources-ssh.test.ts.
  assert len(fields)>=20,'pid stat length'
  start=number(fields[19],1)
  group=read(proc/str(pid)/'cgroup')
  # Proof: removing this guard fails refuses cgroup-v1 before in resources-ssh.test.ts.
  assert group.startswith('0::/') and '\n' not in group,'unified cgroup'
  relative=group[4:]
  parts=relative.split('/')
  # Proof: removing this guard fails refuses traversal before in resources-ssh.test.ts.
  assert relative and all(part not in ['', '.', '..'] for part in parts),'cgroup traversal'
  # Proof: removing this guard fails refuses membership before in resources-ssh.test.ts.
  assert any(part in [row['id'],'docker-'+row['id']+'.scope'] for part in parts),'cgroup membership'
  path=root.joinpath(*parts)
  resolved=path.resolve(strict=True)
  # Proof: removing this guard fails refuses symlink before in resources-ssh.test.ts.
  assert resolved.is_relative_to(root) and resolved!=root and resolved==path,'cgroup escape'
  # Proof: removing this guard fails refuses process-time with in resources-ssh.test.ts.
  assert host_start+start*1000/ticks<=time.time()*1000,'process time'
  return (start,group,str(resolved))
 bindings=[bind(row) for row in before]
 def metric(path):
  # Proof: removing this guard fails refuses metric-symlink with in resources-ssh.test.ts.
  assert path.resolve(strict=True)==path,'metric escape'
  return read(path)
 workloads=[]
 for row,binding in zip(before,bindings):
  path=pathlib.Path(binding[2])
  memory=number(metric(path/'memory.current'))
  maximum=metric(path/'memory.max')
  limit=None if maximum=='max' else number(maximum,1)
  # Proof: removing this guard fails refuses memory before in resources-ssh.test.ts.
  assert (row['memory']==0 and limit is None) or row['memory']==limit,'memory control'
  cpu={}
  for line in metric(path/'cpu.stat').splitlines():
   fields=line.split()
   # Proof: removing this guard fails refuses cpu-stat with in resources-ssh.test.ts.
   assert len(fields)==2 and fields[0] not in cpu,'cpu stat'
   cpu[fields[0]]=number(fields[1])
  # Proof: removing this guard fails refuses cpu before in resources-ssh.test.ts.
  assert all(key in cpu for key in ['usage_usec','user_usec','system_usec']) and cpu['user_usec']+cpu['system_usec']<=cpu['usage_usec'],'cpu counters'
  maximum=metric(path/'cpu.max').split()
  # Proof: removing this guard fails refuses cpu-max with in resources-ssh.test.ts.
  assert len(maximum)==2,'cpu maximum'
  quota=None if maximum[0]=='max' else number(maximum[0],1)
  period=number(maximum[1],1)
  expected_period=row['cpuPeriod'] or 100000
  expected_quota=(row['nanoCpus']*expected_period//1000000000) if row['nanoCpus'] else (row['cpuQuota'] if row['cpuQuota']>0 else None)
  # Proof: removing this guard fails refuses cpu-control with in resources-ssh.test.ts.
  assert period==expected_period and quota==expected_quota,'cpu control'
  # Proof: removing this guard fails refuses cpuset-control with in resources-ssh.test.ts.
  if row['cpuset']: assert metric(path/'cpuset.cpus')==row['cpuset'],'cpuset control'
  started=int(datetime.datetime.fromisoformat(row['started'].replace('Z','+00:00')).timestamp()*1000)
  # Proof: removing this guard fails refuses execution-time with in resources-ssh.test.ts.
  assert host_start<=started<=time.time()*1000,'execution time'
  workloads.append({'group':row['project'],'role':row['service'],'generation':row['id'],'startedAt':started,'memoryBytes':memory,'memoryLimitBytes':limit,'cpuSeconds':cpu['usage_usec']/1000000})
 after=inspect()
 # Proof: removing this guard fails refuses inspect-generation before in resources-ssh.test.ts.
 assert before==after,'changed inspection'
 # Proof: removing this guard fails refuses pid-generation before in resources-ssh.test.ts.
 assert bindings==[bind(row) for row in after],'changed process'
 # Proof: removing this guard fails refuses changed-authority with in resources-ssh.test.ts.
 assert read(machine)==MACHINE and read(boot)==generation and docker(['info','--format','{{.ID}}']).strip()==authority,'changed authority'
 # Proof: removing this guard fails refuses provider-deadline in resources-ssh.test.ts.
 assert time.monotonic()<=deadline,'provider deadline'
 return {'observedAt':int(time.time()*1000),'source':{'provider':'ssh-linux-cgroup-v2','target':'h3mon','identity':MACHINE,'authority':authority,'generation':generation},'host':{'startedAt':host_start,'totalBytes':meminfo['MemTotal:'],'availableBytes':meminfo['MemAvailable:'],'cpuSeconds':cpu_seconds},'unselected':len(roster)-13,'workloads':workloads}

if __name__=='__main__':
 print(json.dumps(run(),separators=(',',':')))
`;
