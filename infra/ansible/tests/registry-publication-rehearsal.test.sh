#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import base64, hashlib, json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error
import uuid as identifiers
from pathlib import Path

def run(*arguments, succeeds=True):
    completed = subprocess.run(arguments, capture_output=True, text=True)
    if succeeds and completed.returncode != 0:
        raise RuntimeError(f'{arguments}: {completed.stdout} {completed.stderr}')
    return completed

assert os.statvfs('/').f_bavail * os.statvfs('/').f_frsize >= 21 * 1024**3
assert run('sha256sum',os.environ['BUN_RUNTIME']).stdout.split()[0]==os.environ['BUN_SHA256']
print('RUNTIME '+run(os.environ['BUN_RUNTIME'],'--version').stdout.strip()+' '+os.environ['BUN_SHA256'],flush=True)
root = Path(tempfile.mkdtemp(prefix='puni-registry-publication-', dir='/var/tmp'))
os.chmod(root, 0o755)
helper = root/'storage.sh'; helper.write_bytes(base64.b64decode(os.environ['STORAGE_HELPER']))
authority=root/'authority.js'; authority.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('AUTHORITY_BUNDLE_'))))
wrapper=root/'authority.sh'; wrapper.write_bytes(base64.b64decode(os.environ['STORAGE_AUTHORITY']))
wrapper.write_text(wrapper.read_text().replace('/usr/local/libexec/puni-registry-authority/bun',os.environ['BUN_RUNTIME']).replace('/usr/local/libexec/puni-registry-authority/authority.js',str(authority)).replace('/var/lib/puni-registry/journal/contents',str(root/'journal/contents')))
copy_cli=root/'copy.js';copy_cli.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('COPY_BUNDLE_'))))
publisher=root/'publisher.js'; publisher.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('PUBLISHER_BUNDLE_'))))
archive=root/'export.tar';archive.write_bytes(base64.b64decode(os.environ['OCI_EXPORT']))
enrollment_cli=root/'enrollment.js';enrollment_cli.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('ENROLLMENT_BUNDLE_'))))
guard = root/'startup.sh'; guard.write_bytes(base64.b64decode(os.environ['STORAGE_GUARD']))
fstab = root/'fstab'
fstab.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n' for name in ('registry','journal')))
configuration = root/'config.json'
configuration.write_text(json.dumps({'fstab': str(fstab), 'directory': str(root), 'rootReserveBytes':20*1024**3, 'volumes':[{'name':'registry','bytes':128*1024**2,'uid':59001},{'name':'journal','bytes':32*1024**2,'uid':59001}]}))
image='docker.io/library/registry@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278'
task='puni-registry-publication-'+identifiers.uuid4().hex
process=None
source_process=None
source_task=task+'-source'
print(f'FIXTURE {root}', flush=True)

def post():
    try:
        with urllib.request.urlopen(urllib.request.Request(url+'/v2/proof/blobs/uploads/',method='POST'),timeout=1) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (OSError, urllib.error.URLError):
        return 0

def wait_http(expected):
    for attempt in range(60):
        status=post()
        if status==expected: return
        time.sleep(.1)
    raise RuntimeError(f'Expected HTTP {expected}, observed {status}')

def issue(seconds=30):
    digest=hashlib.sha256(journal.read_bytes()).hexdigest()
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    issued=int(float(Path('/proc/uptime').read_text().split()[0]))
    permission.write_text(f'1 {boot} {issued} {issued+seconds} {digest} {digest}\n')
    os.chown(permission,59001,59001); os.chmod(permission,0o600)

def start(script):
    global process
    process=subprocess.Popen(['k3s','ctr','-n','k8s.io','run','--rm','--net-host','--read-only','--memory-limit','67108864','--user','59001:59001',
      '--mount',f'type=bind,src={root}/registry/contents,dst=/var/lib/registry,options=bind:rw',
      '--mount',f'type=bind,src={root}/journal,dst=/registry-journal,options=rbind:ro',
      '--mount',f'type=bind,src={script},dst=/storage-guard.sh,options=bind:ro',
      '--env',f'REGISTRY_HTTP_ADDR=127.0.0.1:{port}',image,task,'/bin/sh','/storage-guard.sh','/registry-journal/identities','/var/lib/registry','/registry-journal','/bin/registry','serve','/etc/docker/registry/config.yml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

def stop():
    global process
    if process is not None:
        if process.poll() is None: run('k3s','ctr','-n','k8s.io','tasks','kill','--signal','SIGKILL',task)
        process.wait(timeout=10); process=None
        assert task not in run('k3s','ctr','-n','k8s.io','tasks','list','--quiet').stdout.splitlines()
        assert task not in run('k3s','ctr','-n','k8s.io','containers','list','--quiet').stdout.splitlines()
        assert post()==0

try:
    run('sh',str(helper),'provision',str(configuration))
    builder=root/'builder';builder.mkdir(mode=0o755)
    (builder/'fstab').write_text(f'{builder}/scratch.ext4 {builder}/scratch ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n')
    (builder/'storage.json').write_text(json.dumps({'directory':str(builder),'rootReserveBytes':20*1024**3,'fstab':str(builder/'fstab'),'volumes':[{'name':'scratch','bytes':32*1024**2,'uid':59001}]}))
    run('sh',str(helper),'provision-scratch',str(builder/'storage.json'))
    source=root/'source';source.mkdir(mode=0o755)
    (source/'fstab').write_text(f'{source}/scratch.ext4 {source}/scratch ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n')
    (source/'storage.json').write_text(json.dumps({'directory':str(source),'rootReserveBytes':20*1024**3,'fstab':str(source/'fstab'),'volumes':[{'name':'scratch','bytes':32*1024**2,'uid':59001}]}))
    run('sh',str(helper),'provision-scratch',str(source/'storage.json'))
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0)); source_port=listener.getsockname()[1]
    source_url=f'http://127.0.0.1:{source_port}'
    source_process=subprocess.Popen(['k3s','ctr','-n','k8s.io','run','--rm','--net-host','--read-only','--memory-limit','67108864','--user','59001:59001',
      '--mount',f'type=bind,src={source}/scratch/contents,dst=/var/lib/registry,options=bind:rw',
      '--env',f'REGISTRY_HTTP_ADDR=127.0.0.1:{source_port}',image,source_task,'/bin/registry','serve','/etc/docker/registry/config.yml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for attempt in range(60):
        try:
            with urllib.request.urlopen(source_url+'/v2/',timeout=1) as response:
                if response.status==200:break
        except (OSError,urllib.error.URLError):time.sleep(.1)
    else:raise RuntimeError('Source registry did not become ready')
    machine=Path('/etc/machine-id').read_text().strip()
    client={'schemaVersion':1,'registryUrl':'https://fixture.example','registryId':'proof','authorityMachineId':machine,'registryPath':str(root/'registry/contents'),'journalPath':str(root/'journal/contents'),'sshHost':'fixture','owner':'proof','product':'proof-product','requiredRepositories':['proof-be','proof-gw','proof-fe'],'builder':{'uid':59001,'machineId':machine,'path':str(builder/'scratch/contents'),'receiptPath':str(builder/'identities/scratch.receipt'),'maximumBytes':1024**2,'maximumInodes':32,'excludedFilesystems':[{'machineId':'0'*32,'path':'/absent-on-remote-host'}]}}
    client_path=root/'publication.json'
    def write_client(value):
        client_path.write_text(json.dumps(value));os.chown(client_path,0,0);os.chmod(client_path,0o644)
    def inspect_client(succeeds=True,cli=enrollment_cli,mode=None):
        completed=subprocess.run(['setpriv','--reuid=59001','--regid=59001','--clear-groups','env','REGISTRY_PUBLICATION_ENROLLMENT='+str(client_path),os.environ['BUN_RUNTIME'],str(cli),'https://fixture.example']+([] if mode is None else [mode]),text=True,capture_output=True)
        if succeeds: assert completed.returncode==0,completed.stderr
        else: assert completed.returncode!=0,completed.stdout
        return completed
    inspect_client(False)
    write_client({});inspect_client(False)
    write_client(client);inspect_client()
    os.chmod(root,0o700);inspect_client(False);os.chmod(root,0o755)
    os.chown(client_path,59001,59001);inspect_client(False);write_client(client)
    os.chmod(client_path,0o600);inspect_client(False);write_client(client)
    write_client({**client,'registryUrl':'https://wrong.example'});inspect_client(False)
    write_client({**client,'builder':{**client['builder'],'machineId':'0'*32}});inspect_client(False)
    write_client({**client,'builder':{**client['builder'],'excludedFilesystems':[{'machineId':machine,'path':'/absent-local-enrolled-volume'}]}});inspect_client(False)
    write_client({**client,'builder':{**client['builder'],'path':str(root/'registry/contents'),'receiptPath':str(root/'journal/identities/registry.receipt')}});inspect_client(False)
    write_client({**client,'builder':{**client['builder'],'receiptPath':str(root/'absent.receipt')}});inspect_client(False)
    mutations=[
      ('metadata', 'throw new Error("Untrusted registry publication enrollment");', ';'),
      ('registry', 'throw new Error("Publication enrollment registry or required repositories mismatch");', ';'),
      ('machine', 'throw new Error("Builder machine identity mismatch");', ';'),
      ('owner', 'throw new Error("Builder scratch owner or caller differs from enrollment");', ';'),
      ('colocation', 'const targetPaths = enrollment.authorityMachineId === machineId ? [enrollment.registryPath, enrollment.journalPath] : [];', 'const targetPaths = [];'),
    ]
    for fault,needle,replacement in mutations:
        write_client(client)
        if fault=='metadata':os.chown(client_path,59001,59001)
        elif fault=='registry':write_client({**client,'registryUrl':'https://wrong.example'})
        elif fault=='owner':write_client({**client,'builder':{**client['builder'],'uid':59002}})
        elif fault=='machine':write_client({**client,'builder':{**client['builder'],'machineId':'0'*32}})
        else:write_client({**client,'builder':{**client['builder'],'path':str(root/'registry/contents'),'receiptPath':str(root/'journal/identities/registry.receipt')}})
        inspect_client(False)
        original=enrollment_cli.read_text();assert needle in original
        mutated=root/'removed-enrollment.js';mutated.write_text(original.replace(needle,replacement))
        inspect_client(cli=mutated)
        print('PASS removed enrollment '+fault+' guard admits exact unsafe configuration',flush=True)
    write_client(client);inspect_client()
    print(inspect_client(mode='oversize').stdout,flush=True)
    archived=builder/'scratch/contents/export.tar';archived.write_bytes(archive.read_bytes());os.chown(archived,59001,59001)
    archive=archived
    print('PASS trusted enrollment refuses missing malformed unreadable and unenforced scratch',flush=True)
    journal=root/'journal/contents/journal.json'
    permission=root/'journal/contents/writable.permit'
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0)); port=listener.getsockname()[1]
    url=f'http://127.0.0.1:{port}'
    start(guard)
    wait_http(405)
    print('PASS missing permit refuses actual uploads',flush=True)
    def command(request, succeeds=True):
        completed=subprocess.run(['sh',str(wrapper)],input=json.dumps(request),text=True,capture_output=True)
        if succeeds and completed.returncode!=0: raise RuntimeError(completed.stderr)
        if not succeeds:
            assert completed.returncode!=0, completed.stdout
            return completed.stderr
        return json.loads(completed.stdout)
    device,maximum,uuid,fsid=(root/'journal/identities/registry.receipt').read_text().split()
    enrollment={'registryId':'proof','storageId':uuid,'owners':['proof'],'registryPath':str(root/'registry/contents'),'rootPath':'/','maximumBytes':int(maximum),'journalMaximumBytes':32*1024**2}
    state=command({'command':'initialize','enrollment':enrollment})['state']
    state=command({'command':'check-capacity'})['state']
    assert state['fenced']
    def recover(state, operation):
        begun=command({'command':'begin-maintenance','expectedRevision':state['revision'],'operationId':operation,'owner':'proof','kind':'backup'})
        state=begun['state']
        for phase in ('reconciled','fenced','stopped','backed-up','verified','restored','completed'):
            state=command({'command':'advance-maintenance','expectedRevision':state['revision'],'operationId':operation,'owner':'proof','token':begun['token'],'phase':phase})['state']
        state=command({'command':'reopen','expectedRevision':state['revision'],'operationId':operation+'-reopen','owner':'proof'})['state']
        return state
    state=recover(state,'initial-recovery')
    wait_http(202)
    client['registryUrl']=url;write_client(client)
    completed=run(os.environ['BUN_RUNTIME'],str(publisher),url,str(archive),str(wrapper),source_url,str(copy_cli),str(client_path),str(authority),str(root/'journal/contents'))
    print(completed.stdout,flush=True)
finally:
    if source_process is not None:
        if source_process.poll() is None:run('k3s','ctr','-n','k8s.io','tasks','kill','--signal','SIGKILL',source_task)
        source_process.wait(timeout=10)
        assert source_task not in run('k3s','ctr','-n','k8s.io','tasks','list','--quiet').stdout.splitlines()
        assert source_task not in run('k3s','ctr','-n','k8s.io','containers','list','--quiet').stdout.splitlines()
    stop()
    for name in ('registry','journal'):
        mounted=run('findmnt','--mountpoint',str(root/name),succeeds=False)
        if mounted.returncode==0: run('umount',str(root/name))
        elif mounted.returncode!=1: raise RuntimeError('Unknown mount state')
        loops=json.loads(run('losetup','--json','--list','--output','NAME,BACK-FILE').stdout)['loopdevices']
        for loop in loops:
            if loop['back-file']==str(root/(name+'.ext4')): run('losetup','--detach',loop['name'])
    for scratch_name in ('builder','source'):
      builder=root/scratch_name
      if builder.exists():
          mounted=run('findmnt','--mountpoint',str(builder/'scratch'),succeeds=False)
          if mounted.returncode==0:run('umount',str(builder/'scratch'))
          elif mounted.returncode!=1:raise RuntimeError('Unknown scratch mount state')
          loops=json.loads(run('losetup','--json','--list','--output','NAME,BACK-FILE').stdout)['loopdevices']
          for loop in loops:
              if loop['back-file']==str(builder/'scratch.ext4'):run('losetup','--detach',loop['name'])
          for name in ['scratch.ext4','scratch.identity.json','storage.lock','storage.json','fstab','identities/scratch.receipt']:
              path=builder/name
              if path.exists():path.unlink()
          for name in ['scratch','identities']:
              path=builder/name
              if path.exists():path.rmdir()
          builder.rmdir()
    for path in root.iterdir():
        if path.is_dir(): path.rmdir()
        else: path.unlink()
    root.rmdir()
    print(f'PASS cleanup {root} absent={not root.exists()}',flush=True)
PY
