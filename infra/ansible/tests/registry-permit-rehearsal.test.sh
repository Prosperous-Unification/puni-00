#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import base64, hashlib, json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path

def run(*arguments):
    completed=subprocess.run(arguments,capture_output=True,text=True)
    if completed.returncode!=0: raise RuntimeError(f'{arguments}: {completed.stdout} {completed.stderr}')
    return completed.stdout.strip()

assert os.statvfs('/').f_bavail*os.statvfs('/').f_frsize >= 21*1024**3
root=Path(tempfile.mkdtemp(prefix='puni-registry-permit-',dir='/var/tmp'))
os.chmod(root,0o755)
helper=root/'storage.sh'; helper.write_bytes(base64.b64decode(os.environ['STORAGE_HELPER']))
guard=root/'startup.sh'; guard.write_bytes(base64.b64decode(os.environ['STORAGE_GUARD']))
fstab=root/'fstab'; fstab.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n' for name in ('registry','journal')))
configuration=root/'config.json'; configuration.write_text(json.dumps({'fstab':str(fstab),'directory':str(root),'rootReserveBytes':20*1024**3,'volumes':[{'name':'registry','bytes':64*1024**2,'uid':59001},{'name':'journal','bytes':32*1024**2,'uid':59001}]}))
task='puni-registry-permit-'+uuid.uuid4().hex
process=None
shim_directory=root/'stat-bin'; shim_directory.mkdir(mode=0o755)
shim=shim_directory/'stat'
shim.write_text("""#!/bin/sh
set -eu
wait_for() {
  attempts=0
  while ! test -f "$1"; do
    attempts=$((attempts + 1))
    test "$attempts" -le 100 || exit 1
    sleep .1
  done
}
if test "$#" -eq 3 && test "$1" = -c; then
  if test "$3" = /registry-journal/contents/writable.permit && test -f /var/lib/registry/.permit-open-released; then
    touch /var/lib/registry/.permit-next-poll
    wait_for /var/lib/registry/.permit-next-poll-released
  fi
  if test "$3" = /registry-journal/contents/journal.json && test -f /var/lib/registry/.inject-open-failure; then
    metadata=$(/bin/busybox stat "$@") || exit 1
    touch /var/lib/registry/.permit-open-ready
    wait_for /var/lib/registry/.permit-open-released
    printf '%s\\n' "$metadata"
    exit 0
  fi
fi
exec /bin/busybox stat "$@"
""")
os.chmod(shim,0o755)
print(f'FIXTURE {root}',flush=True)
with socket.socket() as listener:
    listener.bind(('127.0.0.1',0)); port=listener.getsockname()[1]
url=f'http://127.0.0.1:{port}'

def post():
    try:
        with urllib.request.urlopen(urllib.request.Request(url+'/v2/proof/blobs/uploads/',method='POST'),timeout=1) as response: return response.status
    except urllib.error.HTTPError as error: return error.code
    except (OSError,urllib.error.URLError): return 0

def wait_http(expected):
    for attempt in range(60):
        status=post()
        if status==expected: return
        time.sleep(.1)
    raise RuntimeError(f'Expected HTTP {expected}, observed {status}')

def start(script):
    global process
    with (root/'service.stderr').open('wb') as errors:
        process=subprocess.Popen(['k3s','ctr','-n','k8s.io','run','--rm','--net-host','--read-only','--memory-limit','67108864','--user','59001:59001',
          '--mount',f'type=bind,src={root}/registry/contents,dst=/var/lib/registry,options=bind:rw',
          '--mount',f'type=bind,src={root}/journal,dst=/registry-journal,options=rbind:ro',
          '--mount',f'type=bind,src={script},dst=/storage-guard.sh,options=bind:ro',
          '--mount',f'type=bind,src={shim_directory},dst=/probe-bin,options=bind:ro',
          '--env','PATH=/probe-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          '--env',f'REGISTRY_HTTP_ADDR=127.0.0.1:{port}',
          'docker.io/library/registry@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',task,
          '/bin/sh','/storage-guard.sh','/registry-journal/identities','/var/lib/registry','/registry-journal','/bin/registry','serve','/etc/docker/registry/config.yml'],stdout=subprocess.DEVNULL,stderr=errors)

def stop():
    global process
    if process is not None:
        if process.poll() is None: run('k3s','ctr','-n','k8s.io','tasks','kill','--signal','SIGKILL',task)
        process.wait(timeout=10); process=None
        for resource in ('tasks','containers'): assert task not in run('k3s','ctr','-n','k8s.io',resource,'list','--quiet').splitlines()
        assert post()==0

def issue():
    digest=hashlib.sha256(journal.read_bytes()).hexdigest()
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    issued=int(float(Path('/proc/uptime').read_text().split()[0]))
    record=f'1 {boot} {issued} {issued+30} {digest} {digest}\n'.encode()
    permission.write_bytes(record); os.chown(permission,59001,59001); os.chmod(permission,0o600)
    return record

def wait_marker(name):
    for attempt in range(60):
        if (root/'registry/contents'/name).exists(): return
        time.sleep(.1)
    raise RuntimeError('Missing failed-open barrier: '+name)

def prove_open_failure(script,expected):
    issue(); start(script); wait_http(202)
    (root/'registry/contents/.inject-open-failure').touch()
    wait_marker('.permit-open-ready')
    permission.unlink()
    (root/'registry/contents/.permit-open-released').touch()
    # The next poll barrier proves the failed open and resulting mode change have completed.
    wait_marker('.permit-next-poll')
    assert not permission.exists()
    failure=(root/'service.stderr').read_text().lower()
    assert '/registry-journal/contents/writable.permit' in failure and 'no such file' in failure, failure
    wait_http(expected)
    stop()
    for name in ('.inject-open-failure','.permit-open-ready','.permit-open-released','.permit-next-poll'):
        (root/'registry/contents'/name).unlink()

faults={
 'trailing-content':lambda record:record+b'CORRUPT\n',
 'blank-second-line':lambda record:record+b'\n',
 'unterminated-suffix':lambda record:record+b'CORRUPT',
 'missing-newline':lambda record:record[:-1],
 'double-space':lambda record:record.replace(b' ',b'  ',1),
 'leading-space':lambda record:b' '+record,
 'trailing-space':lambda record:record[:-1]+b' \n',
 'embedded-nul':lambda record:record.replace(b' ',b'\0 ',1),
 'trailing-nul':lambda record:record+b'\0',
}
try:
    run('sh',str(helper),'provision',str(configuration))
    journal=root/'journal/contents/journal.json'; journal.write_text('{"schemaVersion":2,"fenced":false}\n')
    os.chown(journal,59001,59001); os.chmod(journal,0o600)
    permission=root/'journal/contents/writable.permit'
    prove_open_failure(guard,405)
    print('PASS failed permit open cannot reuse prior record with HTTP405',flush=True)
    statement='  } 3< "$permission" || return 1'
    altered=guard.read_text().replace(statement,'  } 3< "$permission"')
    assert altered!=guard.read_text(), 'Missing exact open-failure propagation mutation'
    removed=root/'removed-startup.sh'; removed.write_text(altered)
    prove_open_failure(removed,202)
    print('PASS removed open-failure propagation reuses prior record with HTTP202',flush=True)
    issue(); start(guard); wait_http(202)
    for name,corrupt in faults.items():
        valid=issue(); wait_http(202)
        malformed=corrupt(valid); assert len(malformed)<=256
        permission.write_bytes(malformed)
        wait_http(405)
        if name=='trailing-content': stop(); start(guard); wait_http(405)
        print('PASS complete permit refuses '+name+' with HTTP405',flush=True)
    for position in (4,5):
        fields=issue().decode().split(); fields[position]='0'*64
        permission.write_text(' '.join(fields)+'\n'); wait_http(202)
        permission.write_bytes(permission.read_bytes()+b'CORRUPT\n'); wait_http(405)
        print('PASS valid transition hash position '+str(9-position)+' admits HTTP202',flush=True)
    stop()
    for name,statement in (
        ('trailing-content','    test "${#record}" -eq "$((size - 1))" || return 1'),
        ('blank-second-line','    test "${#record}" -eq "$((size - 1))" || return 1'),
        ('double-space','  test "$record" = "1 $boot $issued $expires $first $second" || return 1'),
    ):
        altered=guard.read_text().replace(statement,'  :')
        assert altered!=guard.read_text(), 'Missing exact guard mutation: '+statement
        removed=root/'removed-startup.sh'; removed.write_text(altered)
        permission.write_bytes(faults[name](issue()))
        start(removed); wait_http(202); stop()
        print('PASS removed complete-record guard admits '+name+' with HTTP202',flush=True)
finally:
    if process is not None: stop()
    for name in ('registry','journal'):
        mounted=subprocess.run(['findmnt','--mountpoint',str(root/name)],capture_output=True)
        if mounted.returncode==0: run('umount',str(root/name))
        elif mounted.returncode!=1: raise RuntimeError('Unknown owned mount state')
        for loop in json.loads(run('losetup','--json','--list','--output','NAME,BACK-FILE'))['loopdevices']:
            if loop['back-file']==str(root/(name+'.ext4')): run('losetup','--detach',loop['name'])
    shim.unlink(); shim_directory.rmdir()
    for path in root.iterdir():
        if path.is_dir(): path.rmdir()
        else: path.unlink()
    root.rmdir(); print(f'PASS cleanup {root} absent={not root.exists()}',flush=True)
PY
