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
root = Path(tempfile.mkdtemp(prefix='puni-registry-capacity-', dir='/var/tmp'))
os.chmod(root, 0o755)
helper = root/'storage.sh'; helper.write_bytes(base64.b64decode(os.environ['STORAGE_HELPER']))
authority=root/'authority.js'; authority.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('AUTHORITY_BUNDLE_'))))
wrapper=root/'authority.sh'; wrapper.write_bytes(base64.b64decode(os.environ['STORAGE_AUTHORITY']))
wrapper.write_text(wrapper.read_text().replace('/usr/local/libexec/puni-registry-authority/bun',os.environ['BUN_RUNTIME']).replace('/usr/local/libexec/puni-registry-authority/authority.js',str(authority)).replace('/var/lib/puni-registry/journal/contents',str(root/'journal/contents')))
scratch_cli=root/'scratch.js'; scratch_cli.write_bytes(base64.b64decode(''.join(os.environ[key] for key in sorted(os.environ) if key.startswith('SCRATCH_BUNDLE_'))))
guard = root/'startup.sh'; guard.write_bytes(base64.b64decode(os.environ['STORAGE_GUARD']))
fstab = root/'fstab'
fstab.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n' for name in ('registry','journal')))
configuration = root/'config.json'
configuration.write_text(json.dumps({'fstab': str(fstab), 'directory': str(root), 'rootReserveBytes':20*1024**3, 'volumes':[{'name':'registry','bytes':64*1024**2,'uid':59001},{'name':'journal','bytes':32*1024**2,'uid':59001}]}))
image='docker.io/library/registry@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278'
task='puni-registry-capacity-'+identifiers.uuid4().hex
process=None
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
    revision=state['revision']
    assert command({'command':'check-capacity'})['state']['revision']==revision
    refused=subprocess.run(['sh',str(wrapper),'/bin/true'],input='{"command":"read"}',text=True,capture_output=True)
    assert refused.returncode!=0
    removed_wrapper=root/'removed-authority.sh'; removed_wrapper.write_text(wrapper.read_text().replace('test "$#" -eq 0','true'))
    admitted=subprocess.run(['sh',str(removed_wrapper),'/bin/true'],input='{"command":"read"}',text=True,capture_output=True)
    assert admitted.returncode==0
    print('PASS fixed SSH wrapper rejects executable override; removed arity guard admits it',flush=True)
    print('PASS native authority explicit recovery and heartbeat preserve canonical revision',flush=True)
    print('PASS fresh permit admits actual upload',flush=True)
    checker=subprocess.Popen(['setpriv','--reuid=59001','--regid=59001','--clear-groups','--no-new-privs',os.environ['BUN_RUNTIME'],str(authority),str(root/'journal/contents'),'--monitor'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    report=json.loads(checker.stdout.readline()); assert not report['fenced']
    checker.kill(); checker.wait(timeout=5)
    time.sleep(31); wait_http(405)
    print('PASS checker death fences actual writes',flush=True)
    stop()
    expired_guard=root/'expired-startup.sh'; expired_guard.write_text(guard.read_text().replace('$3 > $6','1'))
    start(expired_guard); wait_http(202); stop()
    start(guard); wait_http(405)
    print('PASS removed expiry guard reopens actual writes after checker death',flush=True)
    state=command({'command':'check-capacity'})['state']; assert state['fenced']
    stop(); start(guard); wait_http(405)
    print('PASS restart preserves expired fence',flush=True)
    state=recover(state,'checker-recovery'); wait_http(202)
    digest='sha256:'+'1'*64
    publication={'command':'reserve-publication','expectedRevision':state['revision'],'operationId':'upload','owner':'proof','product':'proof','roots':[digest],'references':[{'repository':'proof','digest':digest}],'envelope':{'bytes':128*1024**2,'inodes':1}}
    command(publication,False)
    assert command({'command':'read'})['state']['publication'] is None
    wait_http(202)
    print('PASS oversized publication refuses before upload without revoking healthy writer',flush=True)
    publication['envelope']={'bytes':1024,'inodes':1}
    reserved=command(publication); state=reserved['state']
    command({**publication,'operationId':'second','expectedRevision':state['revision']},False)
    wait_http(202)
    command({'command':'unknown'},False); wait_http(202)
    print('PASS competing publisher refusal preserves existing writer permit',flush=True)
    full_journal=run('setpriv','--reuid=59001','--regid=59001','--clear-groups','dd','if=/dev/zero',f'of={root}/journal/contents/filled','bs=1M','count=40','conv=fsync',succeeds=False)
    assert full_journal.returncode!=0 and 'No space left on device' in full_journal.stderr
    command({'command':'check-capacity'},False); wait_http(405)
    (root/'journal/contents/filled').unlink()
    state=command({'command':'check-capacity'})['state']; assert state['fenced']
    print('PASS full journal command fails closed and freeing space cannot reopen writes',flush=True)
    filled=run('setpriv','--reuid=59001','--regid=59001','--clear-groups','dd','if=/dev/zero',f'of={root}/registry/contents/full','bs=1M','count=80','conv=fsync',succeeds=False)
    assert filled.returncode!=0 and 'No space left on device' in filled.stderr
    failure={'command':'finish-publication','expectedRevision':state['revision'],'operationId':'upload','owner':'proof','token':reserved['token'],'outcome':'failed','reconciled':False,'failure':'registry ENOSPC'}
    completed=subprocess.run(['setpriv','--reuid=59001','--regid=59001','--clear-groups','--no-new-privs',os.environ['BUN_RUNTIME'],str(authority),str(root/'journal/contents')],input=json.dumps(failure),text=True,capture_output=True)
    state=json.loads(journal.read_text()); assert state['publication']['failure']=='registry ENOSPC' and state['fenced']
    wait_http(405)
    print('PASS actual registry ENOSPC preserves independent journal failure receipt and write refusal',flush=True)
    (root/'registry/contents/full').unlink()
    state=command({**failure,'expectedRevision':state['revision'],'outcome':'abandoned','reconciled':True})['state']
    state=recover(state,'full-recovery'); wait_http(202)
    saved=journal.read_text()
    journal.write_text('{')
    command({'command':'check-capacity'},False)
    wait_http(405)
    journal.write_text(saved)
    state=command({'command':'check-capacity'})['state']; assert state['fenced']
    print('PASS malformed journal fails closed and checker restart cannot reopen it',flush=True)
    state=recover(state,'corruption-recovery'); wait_http(202)
    inode_directory=root/'registry/contents/inode-pressure'; inode_directory.mkdir()
    inode_counts=os.statvfs(inode_directory)
    for index in range((inode_counts.f_files*9+9)//10-(inode_counts.f_files-inode_counts.f_ffree)):
        (inode_directory/str(index)).touch()
    state=command({'command':'check-capacity'})['state']
    assert state['fenced'] and 'inodes' in state['fenceReason']
    measured=state['measurement']; assert measured['usedBytes']*10<min(measured['maximumBytes'],measured['usableBytes'])*9
    wait_http(405)
    for path in inode_directory.iterdir(): path.unlink()
    inode_directory.rmdir()
    print('PASS actual inode pressure fences writes despite free bytes',flush=True)
    state=recover(state,'inode-recovery'); wait_http(202)
    journal.write_text('{"schemaVersion":2,"fenced":true}\n')
    wait_http(405)
    print('PASS changed journal hash refuses actual writes',flush=True)
    stop()
    removed=root/'removed-startup.sh'
    removed.write_text(guard.read_text().replace('if permits_writes; then', 'if true; then'))
    permission.unlink()
    start(removed); wait_http(202)
    print('PASS removed startup fence admits forbidden upload',flush=True)
    stop()
    run('fallocate','-l',str(32*1024**2),str(root/'scratch.ext4'))
    run('mkfs.ext4','-q','-F','-m','10','-E','nodiscard,lazy_itable_init=0,lazy_journal_init=0',str(root/'scratch.ext4'))
    scratch_device=run('losetup','--find','--show',str(root/'scratch.ext4')).stdout.strip()
    (root/'scratch').mkdir()
    run('mount','-t','ext4','-o','nodiscard,nodev,nosuid,noexec',scratch_device,str(root/'scratch'))
    os.chown(root/'scratch',59001,59001)
    scratch_receipt=root/'scratch.receipt'
    device=run('findmnt','-n','-o','MAJ:MIN','--mountpoint',str(root/'scratch')).stdout.strip()
    fsid=run('stat','-f','-c','%i',str(root/'scratch')).stdout.strip()
    uuid=run('blkid','-s','UUID','-o','value',scratch_device).stdout.strip()
    scratch_receipt.write_text(f'{device} {32*1024**2} {uuid} {fsid}\n'); os.chmod(scratch_receipt,0o644)
    scratch_request={'path':str(root/'scratch'),'receiptPath':str(scratch_receipt),'excludedPaths':['/',str(root/'registry'),str(root/'journal')],'envelope':{'bytes':1024,'inodes':1}}
    def scratch_admit(request,succeeds=True,script=scratch_cli):
        completed=subprocess.run(['setpriv','--reuid=59001','--regid=59001','--clear-groups','--no-new-privs',os.environ['BUN_RUNTIME'],str(script)],input=json.dumps(request),text=True,capture_output=True)
        if succeeds and completed.returncode!=0: raise RuntimeError(completed.stderr)
        if not succeeds: assert completed.returncode!=0, completed.stdout
        return completed
    measured_scratch=json.loads(scratch_admit(scratch_request).stdout)
    assert measured_scratch['reservedBytes']>0
    assert measured_scratch['usableBytes']==measured_scratch['usedBytes']+measured_scratch['availableBytes']
    print('PASS actual ext4 reserved blocks remain unavailable to the service UID',flush=True)
    for message,request in [
        ('Scratch aliases a protected filesystem',{**scratch_request,'path':str(root/'registry'),'receiptPath':str(root/'journal/identities/registry.receipt')}),
        ('Filesystem identity mismatch',{**scratch_request,'receiptPath':str(root/'journal/identities/registry.receipt')}),
    ]:
        scratch_admit(request,False)
        mutated=root/'mutated-scratch.js'
        statement='throw new Error("'+message+'");'
        altered=scratch_cli.read_text().replace(statement,';')
        assert altered!=scratch_cli.read_text(), message
        mutated.write_text(altered)
        scratch_admit(request,script=mutated)
        print('PASS removed '+message+' guard admits exact unsafe filesystem',flush=True)
    saved_receipt=scratch_receipt.read_text()
    for fault in ('metadata','maximum'):
        if fault=='metadata': os.chown(scratch_receipt,59001,59001)
        else: scratch_receipt.write_text(saved_receipt.replace(str(32*1024**2),str(16*1024**2)))
        scratch_admit(scratch_request,False)
        message='Untrusted filesystem identity receipt' if fault=='metadata' else 'Filesystem exceeds enforced maximum'
        statement='throw new Error("'+message+'");'
        altered=scratch_cli.read_text().replace(statement,';'); assert altered!=scratch_cli.read_text()
        mutated.write_text(altered); scratch_admit(scratch_request,script=mutated)
        os.chown(scratch_receipt,0,0); scratch_receipt.write_text(saved_receipt)
        print('PASS removed scratch '+fault+' guard admits exact fault',flush=True)
    scratch_admit({**scratch_request,'envelope':{'bytes':32*1024**2,'inodes':1}},False)
    scratch_admit({**scratch_request,'envelope':{'bytes':1,'inodes':1000000}},False)
    scratch_admit({**scratch_request,'path':str(root/'registry'),'receiptPath':str(root/'journal/identities/registry.receipt')},False)
    scratch_admit({**scratch_request,'path':'/'},False)
    filled=run('setpriv','--reuid=59001','--regid=59001','--clear-groups','dd','if=/dev/zero',f'of={root}/scratch/full','bs=1M','count=40','conv=fsync',succeeds=False)
    assert filled.returncode!=0 and 'No space left on device' in filled.stderr
    assert os.statvfs('/').f_bavail*os.statvfs('/').f_frsize > 20*1024**3
    print('PASS independent bounded scratch refuses aliases bytes inodes and actual saturation',flush=True)
finally:
    if process is not None: stop()
    for name in ('registry','journal','scratch'):
        mounted=run('findmnt','--mountpoint',str(root/name),succeeds=False)
        if mounted.returncode==0: run('umount',str(root/name))
        elif mounted.returncode!=1: raise RuntimeError('Unknown mount state')
        loops=json.loads(run('losetup','--json','--list','--output','NAME,BACK-FILE').stdout)['loopdevices']
        for loop in loops:
            if loop['back-file']==str(root/(name+'.ext4')): run('losetup','--detach',loop['name'])
    for path in root.iterdir():
        if path.is_dir(): path.rmdir()
        else: path.unlink()
    root.rmdir()
    print(f'PASS cleanup {root} absent={not root.exists()}',flush=True)
PY
