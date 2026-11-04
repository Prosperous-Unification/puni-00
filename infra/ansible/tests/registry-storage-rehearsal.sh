#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def execute(*arguments, succeeds=True):
    completed = subprocess.run(arguments, text=True, capture_output=True)
    if succeeds and completed.returncode != 0:
        raise RuntimeError(f'{arguments}: {completed.stdout} {completed.stderr}')
    if not succeeds and completed.returncode == 0:
        raise RuntimeError(f'Fault unexpectedly succeeded: {arguments}')
    return completed.stdout.strip()


assert os.statvfs('/').f_bavail * os.statvfs('/').f_frsize >= 21 * 1024**3
root = Path(tempfile.mkdtemp(prefix='puni-registry-storage-proof-', dir='/var/tmp'))
os.chmod(root, 0o755)
helper = root / 'storage.sh'
guard = root / 'startup.sh'
helper.write_bytes(base64.b64decode(os.environ['STORAGE_HELPER']))
guard.write_bytes(base64.b64decode(os.environ['STORAGE_GUARD']))
table = root / 'fstab'
table.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n' for name in ('registry', 'journal')))
config = {'fstab': str(table), 'directory': str(root), 'rootReserveBytes': 20 * 1024**3,
          'volumes': [{'name': 'registry', 'bytes': 64 * 1024**2, 'uid': 59001},
                      {'name': 'journal', 'bytes': 32 * 1024**2, 'uid': 59001}]}
configuration = root / 'config.json'
configuration.write_text(json.dumps(config))
print(f'FIXTURE {root}', flush=True)


def converge(mode='provision', succeeds=True):
    return execute('sh', str(helper), mode, str(configuration), succeeds=succeeds)


def startup(succeeds=True, script=guard):
    return execute('sh', str(script), str(root / 'journal/identities'), str(root / 'registry'), str(root / 'journal'),
                   '/bin/true', succeeds=succeeds)


try:
    config['rootReserveBytes'] = os.statvfs('/').f_blocks * os.statvfs('/').f_frsize
    configuration.write_text(json.dumps(config))
    converge(succeeds=False)
    assert not (root / 'registry.ext4').exists()
    altered_helper = root / 'altered-storage.sh'
    altered_helper.write_text(helper.read_text().replace('root.f_bavail * root.f_frsize - limit >= reserve', 'True'))
    execute('sh', str(altered_helper), 'provision', str(configuration))
    assert (root / 'registry.ext4').exists()
    print('PASS removed reserve check admits allocation below declared reserve', flush=True)
    config['rootReserveBytes'] = 20 * 1024**3
    configuration.write_text(json.dumps(config))
    assert converge() == 'unchanged'
    for iteration in range(30):
        assert converge() == 'unchanged', iteration
    assert converge('verify') == 'unchanged'
    startup()
    for name in ('registry', 'journal'):
        receipt = root / 'journal/identities' / (name + '.receipt')
        saved_receipt = receipt.read_bytes()
        alternate = receipt.with_suffix('.alternate')
        for fault in ('owner', 'group', 'mode', 'symlink', 'hardlink'):
            if fault == 'owner':
                os.chown(receipt, 59001, 0)
            elif fault == 'group':
                os.chown(receipt, 0, 59001)
            elif fault == 'mode':
                os.chmod(receipt, 0o666)
            elif fault == 'symlink':
                receipt.rename(alternate)
                receipt.symlink_to(alternate.name)
            else:
                os.link(receipt, alternate)
            assert receipt.read_bytes() == saved_receipt
            converge('verify', succeeds=False)
            startup(succeeds=False)
            untrusted_helper = root / 'untrusted-receipt-storage.sh'
            untrusted_helper.write_text(helper.read_text().replace('require(is_safe_receipt,', 'require(True,'))
            assert execute('sh', str(untrusted_helper), 'verify', str(configuration)) == 'unchanged'
            untrusted_guard = root / 'untrusted-receipt-startup.sh'
            untrusted_guard.write_text(guard.read_text().replace("  test \"$receipt_metadata\" = '81a4:0:0:1'", '  :'))
            startup(script=untrusted_guard)
            if fault == 'symlink':
                receipt.unlink()
                alternate.rename(receipt)
            elif fault == 'hardlink':
                alternate.unlink()
            else:
                os.chown(receipt, 0, 0)
                os.chmod(receipt, 0o644)
            assert receipt.read_bytes() == saved_receipt
            assert converge('verify') == 'unchanged'
            startup()
            print(f'PASS identical-byte {name} receipt {fault} drift refuses host and startup; removed guards admit it', flush=True)
    identity = root / 'registry.identity.json'
    saved_identity = identity.read_text()
    changed_identity = json.loads(saved_identity)
    changed_identity['inode'] += 1
    identity.write_text(json.dumps(changed_identity))
    converge('verify', succeeds=False)
    altered_helper.write_text(helper.read_text().replace("identity['inode'] == status.st_ino", 'True'))
    execute('sh', str(altered_helper), 'verify', str(configuration))
    identity.write_text(saved_identity)
    print('PASS removed inode identity check admits substituted identity', flush=True)
    print('PASS second convergence changes nothing', flush=True)
    saved_table = table.read_text()
    table.write_text(saved_table.replace(',X-fstrim.notrim', ''))
    converge('verify', succeeds=False)
    altered_helper.write_text(helper.read_text().replace("require(has_trim_exclusion,", "require(True,"))
    execute('sh', str(altered_helper), 'verify', str(configuration))
    table.write_text(saved_table)
    print('PASS removed trim exclusion refuses startup; removed guard admits it', flush=True)

    authority = root / 'journal/contents/authority-receipt'
    authority.write_text('authoritative state\n')
    os.chown(authority, 59001, 59001)
    os.chmod(authority, 0o600)
    image = 'docker.io/library/registry@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278'
    task = 'puni-registry-storage-' + uuid.uuid4().hex + '-uid'
    drops = [argument for capability in ('CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'KILL', 'MKNOD', 'NET_BIND_SERVICE', 'NET_RAW', 'SETFCAP', 'SETPCAP', 'SYS_CHROOT', 'AUDIT_WRITE', 'SETUID', 'SETGID') for argument in ('--cap-drop', 'CAP_' + capability)]
    registry_status = execute('k3s', 'ctr', '-n', 'k8s.io', 'run', '--rm', '--read-only', '--memory-limit', '67108864',
                         *drops, '--user', '59001:59001',
                         '--mount', f'type=bind,src={root}/registry/contents,dst=/var/lib/registry,options=bind:rw',
                         '--mount', f'type=bind,src={root}/journal,dst=/registry-journal,options=rbind:ro',
                         '--mount', f'type=bind,src={guard},dst=/storage-guard.sh,options=bind:ro',
                         image, task, '/bin/sh', '/storage-guard.sh', '/registry-journal/identities',
                         '/var/lib/registry', '/registry-journal', '/bin/sh', '-c',
                         "set -eu; id; test -r /registry-journal/contents/authority-receipt; if touch /registry-journal/contents/forbidden; then exit 91; fi; /bin/registry serve /etc/docker/registry/config.yml >/dev/null 2>&1 & registry_pid=$!; sleep 0.2; grep -E '^(Name|Uid|Gid|CapEff|CapPrm|CapAmb|NoNewPrivs):' /proc/$registry_pid/status; kill $registry_pid; if wait $registry_pid; then exit 0; else test $? = 143; fi")
    assert 'uid=59001' in registry_status and 'gid=59001' in registry_status and 'registry' in registry_status
    assert not (root / 'journal/contents/forbidden').exists()
    for capability in ('CapEff:', 'CapPrm:', 'CapAmb:'):
        assert any(line.startswith(capability) and line.split()[1] == '0000000000000000'
                   for line in registry_status.splitlines())
    assert any(line.startswith('NoNewPrivs:') and line.split()[1] == '1' for line in registry_status.splitlines())
    print('PASS pinned-image restricted startup and readonly journal ' + registry_status.replace('\n', '; '), flush=True)
    assert task not in execute('k3s', 'ctr', '-n', 'k8s.io', 'tasks', 'list', '--quiet')
    assert task not in execute('k3s', 'ctr', '-n', 'k8s.io', 'containers', 'list', '--quiet')
    print('REMOVED container task ' + task, flush=True)

    devices = {name: execute('findmnt', '-n', '-o', 'SOURCE', '--mountpoint', str(root / name))
               for name in ('registry', 'journal')}
    print('DEVICES ' + json.dumps(devices), flush=True)
    before_blocks = (root / 'registry.ext4').stat().st_blocks
    table = root / 'fstab'
    table.write_text(''.join(f'{root}/{name}.ext4 {root}/{name} ext4 loop,noauto,nodiscard,X-fstrim.notrim 0 0\n'
                             for name in devices))
    # The timer's actual --listed-in selection sees these fstab entries first.
    trimmed = execute('fstrim', '--listed-in', f'{table}:/proc/self/mountinfo', '--dry-run', '--verbose')
    assert str(root / 'registry') not in trimmed and str(root / 'journal') not in trimmed
    execute('fstrim', '--listed-in', str(table), '--verbose')
    assert (root / 'registry.ext4').stat().st_blocks == before_blocks
    converge('verify')
    print('PASS formatting and scheduled trim selection preserve allocation', flush=True)
    for name in devices:
        for index in range(500):
            entry = root / name / 'contents' / f'metadata-{index}'
            entry.write_bytes(b'x' * 4096)
            entry.unlink()
    execute('sync', '-f', str(root / 'registry'))
    execute('sync', '-f', str(root / 'journal'))
    time.sleep(2)
    converge('verify')
    for name in devices:
        execute('umount', str(root / name))
    assert converge('mount') == 'changed'
    assert converge('verify') == 'unchanged'
    print('PASS eager initialization retains all blocks after metadata churn, quiescence and remount', flush=True)
    lazy = root / 'lazy.ext4'
    execute('fallocate', '-l', str(32 * 1024**2), str(lazy))
    execute('mkfs.ext4', '-q', '-F', '-m', '0', '-E', 'nodiscard', str(lazy))
    assert lazy.stat().st_blocks * 512 >= 32 * 1024**2
    lazy_device = execute('losetup', '--find', '--show', '--nooverlap', str(lazy))
    (root / 'lazy').mkdir()
    execute('mount', '-t', 'ext4', '-o', 'nodiscard,init_itable=0', lazy_device, str(root / 'lazy'))
    for attempt in range(100):
        if lazy.stat().st_blocks * 512 < 32 * 1024**2:
            break
        time.sleep(0.1)
    assert lazy.stat().st_blocks * 512 < 32 * 1024**2, 'Lazy-init removal fault did not reproduce'
    print(f'PASS removed eager initialization loses reserved blocks size={lazy.stat().st_size} allocated={lazy.stat().st_blocks * 512}', flush=True)
    execute('umount', str(root / 'lazy'))
    execute('losetup', '--detach', lazy_device)
    execute('umount', str(root / 'registry'))
    execute('losetup', '--detach', devices['registry'])
    execute('losetup', devices['registry'], str(lazy))
    execute('mount', '-t', 'ext4', '-o', 'nodiscard,nodev,nosuid,noexec', devices['registry'], str(root / 'registry'))
    startup(succeeds=False)
    reused = root / 'reused-device.sh'
    reused.write_text(guard.read_text().replace('  test "$actual_fsid" = "$fsid"', '  :'))
    startup(script=reused)
    print('PASS reused loop device wrong filesystem refuses; removed FSID guard admits it', flush=True)
    execute('umount', str(root / 'registry'))
    execute('losetup', '--detach', devices['registry'])
    converge('mount')


    root_before = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
    filled = subprocess.run(['dd', 'if=/dev/zero', f'of={root}/registry/contents/saturation',
                             'bs=1M', 'count=80', 'conv=fsync'], capture_output=True, text=True)
    assert filled.returncode != 0 and 'No space left on device' in filled.stderr
    root_after = os.statvfs('/').f_bavail * os.statvfs('/').f_frsize
    assert root_after >= 20 * 1024**3 and root_before - root_after < 8 * 1024**2
    assert (root / 'registry.ext4').stat().st_blocks == before_blocks
    (root / 'journal/contents/failure-receipt').write_text('registry full\n')
    print(f'PASS saturation leaves root reserve intact before={root_before} after={root_after}', flush=True)
    (root / 'registry/contents/saturation').unlink()
    execute('umount', str(root / 'registry'))
    converge('verify', succeeds=False)
    startup(succeeds=False)
    assert not (root / 'registry/contents').exists()
    # Removing the startup mount predicate allows the exact missing-mount negative through.
    removed = root / 'unguarded.sh'
    removed.write_text(guard.read_text().replace("END { exit !(count == 1 && found) }", "END { exit 0 }").replace('  test "$(( block_size * block_count ))" -le "$maximum"', '  :').replace('  test "$actual_fsid" = "$fsid"', '  :'))
    startup(script=removed)
    observation = root / 'registry/.authority-instance'
    assert observation.is_file()
    observation.unlink()
    print('PASS missing mount cannot write root; removed mount guard admits directory', flush=True)
    execute('mount', '--bind', str(root / 'journal'), str(root / 'registry'))
    startup(succeeds=False)
    converge('verify', succeeds=False)
    startup(script=removed)
    print('PASS wrong filesystem refuses startup', flush=True)
    execute('umount', str(root / 'registry'))
    converge()
    receipt = root / 'journal/identities/registry.receipt'
    saved = receipt.read_text()
    receipt.write_text(saved.replace(str(64 * 1024**2), str(32 * 1024**2)))
    startup(succeeds=False)
    removed.write_text(guard.read_text().replace('  test "$(( block_size * block_count ))" -le "$maximum"', '  :'))
    startup(script=removed)
    receipt.write_text(saved)
    print('PASS capacity guard removal admits oversized physical filesystem', flush=True)
    # Remount convergence can select another free loop after the reuse fault.
    # Resolve its current source before unmounting rather than detaching the stale snapshot.
    sparse_device = execute('findmnt', '-n', '-o', 'SOURCE', '--mountpoint', str(root / 'registry'))
    # Sparse punched hole preserves logical size but destroys real root reservation.
    execute('umount', str(root / 'registry'))
    execute('losetup', '--detach', sparse_device)
    execute('fallocate', '--punch-hole', '--offset', str(60 * 1024**2), '--length', str(1024**2), str(root / 'registry.ext4'))
    execute('sh', str(helper), 'provision', str(configuration), succeeds=False)
    altered_helper.write_text(helper.read_text().replace('status.st_blocks * 512 >= limit', 'True'))
    execute('sh', str(altered_helper), 'provision', str(configuration))
    converge('verify', succeeds=False)
    print('PASS removed allocation check admits sparse backing', flush=True)
    print('PASS lost allocated backing refuses startup', flush=True)
finally:
    # Detach only devices whose kernel backing-file identity names this exclusive directory.
    for name in ('registry', 'journal', 'lazy'):
        mount = root / name
        mounted = subprocess.run(['findmnt', '--mountpoint', str(mount)], capture_output=True)
        if mounted.returncode == 0:
            execute('umount', str(mount))
        elif mounted.returncode != 1:
            raise RuntimeError('Cannot determine owned fixture mount state')
        loops = json.loads(execute('losetup', '--json', '--list', '--output', 'NAME,BACK-FILE'))['loopdevices']
        for loop in loops:
            if loop['back-file'] == str(root / (name + '.ext4')):
                execute('losetup', '--detach', loop['name'])
                print('DETACHED ' + loop['name'], flush=True)
    for child in root.iterdir():
        if child.is_dir():
            for observation_name in ('.authority-instance', '.authority-readonly'):
                observation = child / observation_name
                if observation.exists(): observation.unlink()
            child.rmdir()
        else:
            child.unlink()
    root.rmdir()
    print(f'PASS cleanup {root} absent={not root.exists()}', flush=True)
PY
