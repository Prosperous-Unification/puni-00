import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time


def command(*argv, succeeds=True):
    child = subprocess.run(argv, capture_output=True, text=True, timeout=30)
    if (child.returncode == 0) != succeeds:
        raise RuntimeError(f'Unexpected command outcome {child.returncode}: {argv}: {child.stderr}')
    return child.stdout.strip()


def worker(root):
    if os.geteuid() != 0 or not root.is_dir():
        raise RuntimeError('Expected isolated owned root fixture')
    helper = root / 'storage.sh'
    canonical = Path('/etc/puni/registry-storage.json')
    table = root / 'fstab'
    table.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,nodev,nosuid,noexec,X-fstrim.notrim 0 0\n' for name in ['registry', 'journal', 'pulls']))
    normal = {'directory': str(root), 'rootReserveBytes': 20 * 1024**3, 'fstab': str(table), 'volumes': [{'name': 'registry', 'bytes': 64 * 1024**2, 'uid': 59001}, {'name': 'journal', 'bytes': 32 * 1024**2, 'uid': 59001}]}
    canonical.write_text(json.dumps(normal));canonical.chmod(0o600)
    profile = {'directory': str(root), 'rootReserveBytes': 20 * 1024**3, 'fstab': str(table), 'volumes': [{'name': 'pulls', 'bytes': 64 * 1024**2, 'uid': 0, 'inodes': 1024}]}
    configuration = root / 'pulls.json';configuration.write_text(json.dumps(profile));configuration.chmod(0o600)
    run = lambda mode, succeeds=True: command('sh', str(helper), mode, str(configuration), succeeds=succeeds)
    command('sh', str(helper), 'provision', str(canonical))
    run('provision', succeeds=False);run('provision-scratch', succeeds=False)
    if (root / 'pulls.ext4').exists():raise RuntimeError('Cross-mode refusal allocated pull backing')
    invalid = []
    for fault, field, value in [('owner', 'uid', 59001), ('inode-zero', 'inodes', 0), ('inode-boolean', 'inodes', True), ('inode-overflow', 'inodes', 2**32), ('bytes-type', 'bytes', '67108864'), ('extra', 'unknown', 'refuse')]:
        changed = json.loads(json.dumps(profile));changed['volumes'][0][field] = value
        configuration.write_text(json.dumps(changed));run('provision-pulls', succeeds=False)
        if (root / 'pulls.ext4').exists():raise RuntimeError('Invalid pull input allocated backing: ' + fault)
        invalid.append('input-' + fault + '-refused')
    configuration.write_text(json.dumps(profile))
    if run('provision-pulls') != 'changed':raise RuntimeError('First pull provisioning not acknowledged')
    if run('provision-pulls') != 'unchanged' or run('verify-pulls') != 'unchanged':raise RuntimeError('Pull convergence not idempotent')
    pool = root / 'pulls/contents';metadata = pool.stat()
    if metadata.st_uid != 0 or metadata.st_gid != 0 or stat.S_IMODE(metadata.st_mode) != 0o711:raise RuntimeError('Pull pool is not root:root0711')
    receipt = root / 'journal/identities/pulls.receipt';fields = receipt.read_text().split()
    if len(fields) != 4 or int(fields[1]) != 64 * 1024**2 or fields[2] != command('blkid', '-s', 'UUID', '-o', 'value', str(root / 'pulls.ext4')):raise RuntimeError('Pull receipt differs from actual filesystem')
    inode_ceiling = os.statvfs(pool).f_files
    if not 0 < inode_ceiling <= 1024:raise RuntimeError('Pull inode bound missing')
    cases = ['cross-mode-refusal', *invalid, 'root-pool', 'physical-identity', 'idempotent']
    command('setpriv', '--reuid=59001', '--regid=59001', '--clear-groups', 'touch', str(pool / 'unowned'), succeeds=False)
    if (pool / 'unowned').exists():raise RuntimeError('Client can allocate parent ownership')
    cases.append('client-parent-write-refused')
    for fault in ['mode', 'uid', 'gid', 'symlink']:
        if fault == 'mode':pool.chmod(0o777)
        if fault == 'uid':os.chown(pool, 59001, 0)
        if fault == 'gid':os.chown(pool, 0, 59001)
        if fault == 'symlink':pool.rename(root / 'pulls/saved');pool.symlink_to(root / 'external')
        try:run('verify-pulls', succeeds=False)
        finally:
            if fault == 'symlink':pool.unlink();(root / 'pulls/saved').rename(pool)
            else:os.chown(pool, 0, 0);pool.chmod(0o711)
        cases.append('pool-' + fault + '-refused')
    profile['volumes'][0]['inodes'] = inode_ceiling - 1;configuration.write_text(json.dumps(profile));run('verify-pulls', succeeds=False)
    profile['volumes'][0]['inodes'] = 1024;configuration.write_text(json.dumps(profile));cases.append('inode-profile-refused')
    saved_table = table.read_text();table.write_text(saved_table.replace('pulls ext4 loop,noauto,nodiscard,nodev,nosuid,noexec,X-fstrim.notrim', 'pulls ext4 loop,noauto,nodiscard,nodev,nosuid,noexec'))
    run('verify-pulls', succeeds=False);table.write_text(saved_table);cases.append('trim-exclusion-refused')
    image = root / 'pulls.ext4';allocated = image.stat().st_blocks
    filled = subprocess.run(['dd', 'if=/dev/zero', 'of=' + str(pool / 'fill'), 'bs=1M', 'count=70'], capture_output=True, text=True, timeout=20)
    if filled.returncode == 0 or 'No space left' not in filled.stderr:raise RuntimeError('Byte ceiling not physically enforced')
    (pool / 'fill').unlink();cases.append('physical-byte-exhaustion')
    count = 0
    try:
        while count < 2000:
            with (pool / ('inode-' + str(count))).open('x'):pass
            count += 1
        raise RuntimeError('Inode ceiling not physically enforced')
    except OSError as failure:
        if failure.errno != 28:raise
    for index in range(count):(pool / ('inode-' + str(index))).unlink()
    if count >= 1024 or image.stat().st_blocks != allocated or os.statvfs('/').f_bavail * os.statvfs('/').f_frsize < 20 * 1024**3:raise RuntimeError('Exhaustion escaped its fixed physical reservation')
    cases.append('physical-inode-exhaustion')
    normal['rootReserveBytes'] = 21 * 1024**3;canonical.write_text(json.dumps(normal));run('verify-pulls', succeeds=False)
    normal['rootReserveBytes'] = 20 * 1024**3;canonical.write_text(json.dumps(normal));cases.append('canonical-reserve-refused')
    other = root / 'other';other.mkdir(mode=0o755)
    other_table = root / 'other-fstab';other_table.write_text(''.join(f'{other}/{name}.ext4 {other}/{name} ext4 loop,noauto,nodiscard,nodev,nosuid,noexec,X-fstrim.notrim 0 0\n' for name in ['registry', 'journal']))
    other_profile = {'directory': str(other), 'rootReserveBytes': 20 * 1024**3, 'fstab': str(other_table), 'volumes': [{'name': name, 'bytes': 32 * 1024**2, 'uid': 59001} for name in ['registry', 'journal']]}
    other_configuration = root / 'other.json';other_configuration.write_text(json.dumps(other_profile))
    command('sh', str(helper), 'provision', str(other_configuration))
    canonical.write_text(json.dumps(other_profile));run('verify-pulls', succeeds=False)
    canonical.write_text(json.dumps(normal));cases.append('canonical-directory-refused')
    command('umount', str(root / 'pulls'));run('verify-pulls', succeeds=False)
    if pool.exists():raise RuntimeError('Missing pull mount has root-backed contents')
    run('mount-pulls');cases.append('missing-pull-mount-refused')
    command('umount', str(root / 'journal'));run('verify-pulls', succeeds=False)
    if (root / 'journal/identities').exists():raise RuntimeError('Missing journal gained root-backed receipt')
    command('sh', str(helper), 'mount', str(canonical));run('verify-pulls');cases.append('missing-canonical-journal-refused')
    print(json.dumps({'cases': cases, 'byteCeiling': 64 * 1024**2, 'inodeCeiling': inode_ceiling}), flush=True)


def outer(storage, source):
    if os.geteuid() != 0 or os.statvfs('/').f_bavail * os.statvfs('/').f_frsize < 21 * 1024**3:raise RuntimeError('Root fixture requires21GiB free')
    root = Path(tempfile.mkdtemp(prefix='puni-registry-pulls-proof-', dir='/var/tmp'));root.chmod(0o755)
    (root / 'storage.sh').write_bytes(storage);(root / 'rehearsal.py').write_bytes(source);(root / 'external').mkdir(mode=0o700)
    script = 'set -e\nmount --make-rprivate /\nmount -t tmpfs -o size=2097152,nr_inodes=128,mode=0755 tmpfs /etc\nmkdir /etc/puni\nexec /usr/bin/python3 -u "$1/rehearsal.py" worker "$1"\n'
    claim = {'directory': str(root), 'device': root.stat().st_dev, 'inode': root.stat().st_ino, 'helperSha256': hashlib.sha256(storage).hexdigest(), 'fixtureSha256': hashlib.sha256(source).hexdigest()}
    (root / 'claim.json').write_text(json.dumps(claim));(root / 'claim.json').chmod(0o600)
    stdout, stderr = b'', b''
    child = subprocess.Popen(['/usr/bin/unshare', '--mount', '--', '/bin/sh', '-c', script, 'owned', str(root)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        try:stdout,stderr=child.communicate(timeout=120)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid,signal.SIGKILL);stdout,stderr=child.communicate(timeout=10);raise RuntimeError('Owned storage fixture exceeded deadline')
    finally:
        # The private namespace is terminal; detach only loop devices backed by this exact exclusive directory.
        if child.poll() is None:os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=10)
        (root / 'observation.json').write_text(json.dumps({'workerExit': child.returncode, 'stdout': stdout.decode(), 'stderr': stderr.decode()}))
        loops=json.loads(command('losetup','--json','--list','--output','NAME,BACK-FILE,BACK-INO'))['loopdevices']
        for loop in loops:
            if loop['back-file'] in [str(root/(name+'.ext4')) for name in ['registry','journal','pulls']] + [str(root/'other'/(name+'.ext4')) for name in ['registry','journal']]:
                path=Path(loop['back-file']);metadata=path.lstat()
                if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=0 or metadata.st_nlink!=1 or metadata.st_ino!=int(loop['back-ino']):raise RuntimeError('Untrusted loop cleanup identity')
                command('losetup','-d',loop['name'])
        deadline = time.monotonic() + 5
        while True:
            remaining=json.loads(command('losetup','--json','--list','--output','NAME,BACK-FILE'))['loopdevices']
            if not any(v['back-file'].startswith(str(root)+'/') for v in remaining):break
            if time.monotonic() >= deadline:raise RuntimeError('Owned loop remained; preserved workspace: ' + str(root))
            time.sleep(0.02)
        if any(line.split()[4].startswith(str(root)+'/') for line in Path('/proc/self/mountinfo').read_text().splitlines()):raise RuntimeError('Owned host mount remained')
        shutil.rmtree(root)
        if root.exists():raise RuntimeError('Owned fixture workspace remained')
    if len(stdout)>65536 or len(stderr)>65536:raise RuntimeError('Storage observation exceeded bounds')
    print(json.dumps({'helperSha256':hashlib.sha256(storage).hexdigest(),'fixtureSha256':hashlib.sha256(source).hexdigest(),'workspace':str(root),'workerExit':child.returncode,'workspaceRemoved':True,'loopLeaks':False,'mountLeaks':False,'observation':stdout.decode()}),flush=True)
    if stderr:sys.stderr.write(stderr.decode())
    raise SystemExit(child.returncode)


if sys.argv[1:2] == ['worker']:worker(Path(sys.argv[2]))
else:outer(STORAGE,NATIVE_SOURCE)
