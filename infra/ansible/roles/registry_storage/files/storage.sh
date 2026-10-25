#!/bin/sh
set -eu
exec python3 - "$@" <<'PY'
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


def run(*arguments):
    return subprocess.check_output(arguments, text=True).strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def durable_write(path, content, mode=0o644):
    try:
        status = path.lstat()
    except FileNotFoundError:
        status = None
    if status is not None:
        is_safe_receipt = (stat.S_ISREG(status.st_mode) and status.st_uid == 0 and
                           status.st_gid == 0 and status.st_nlink == 1 and
                           stat.S_IMODE(status.st_mode) == mode)
        # Proof: identical bytes with owner/group/mode/symlink/hardlink drift fail the
        # physical rehearsal; removing this guard restores the unsafe unchanged fastpath.
        require(is_safe_receipt, 'Untrusted durable receipt metadata')
        if path.read_text() == content:
            return False
    pending = path.with_suffix('.pending')
    with pending.open('x') as stream:
        os.chmod(pending, mode)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return True


def allocated(image, limit):
    status = image.lstat()
    # Proof: sparse backing fault in registry-storage-rehearsal.sh refuses before mounting.
    require(stat.S_ISREG(status.st_mode) and status.st_uid == 0 and
            status.st_nlink == 1 and stat.S_IMODE(status.st_mode) == 0o600 and
            status.st_size == limit and status.st_blocks * 512 >= limit,
            f'Backing file is not owned, private, fixed-size and fully allocated: {image} uid={status.st_uid} mode={stat.S_IMODE(status.st_mode):o} links={status.st_nlink} size={status.st_size} allocated={status.st_blocks * 512} limit={limit} inode={status.st_ino}')
    return status


def inspect_mount(mount):
    probe = subprocess.run(['findmnt', '--mountpoint', str(mount), '--json',
                            '--output', 'SOURCE,FSTYPE,OPTIONS,MAJ:MIN'],
                           text=True, capture_output=True)
    if probe.returncode == 1:
        return None
    require(probe.returncode == 0, 'Cannot inspect mount: ' + probe.stderr)
    mounts = json.loads(probe.stdout)['filesystems']
    require(len(mounts) == 1, 'Ambiguous stacked mount')
    return mounts[0]


def main():
    require(os.geteuid() == 0, 'Storage enrollment requires root')
    require(len(sys.argv) == 3 and sys.argv[1] in ('provision', 'mount', 'verify', 'provision-scratch', 'mount-scratch', 'verify-scratch'),
            'Usage: storage.sh provision|mount|verify[-scratch] <configuration.json>')
    is_scratch = sys.argv[1].endswith('-scratch')
    command = sys.argv[1].removesuffix('-scratch')
    config_path = Path(sys.argv[2])
    config = json.loads(config_path.read_text())
    require(set(config) == {'directory', 'rootReserveBytes', 'volumes', 'fstab'}, 'Invalid configuration keys')
    directory = Path(config['directory'])
    reserve = config['rootReserveBytes']
    require(type(reserve) is int and reserve >= 20 * 1024**3, 'Invalid root reserve')
    require(re.fullmatch(r'/[a-zA-Z0-9_./-]+', str(directory)) is not None and
            directory.is_dir() and not directory.is_symlink(), 'Invalid storage directory')
    require(directory.stat().st_uid == 0 and directory.stat().st_mode & 0o022 == 0,
            'Storage directory is not root owned')
    volumes = config['volumes']
    expected_names = {'scratch'} if is_scratch else {'registry', 'journal'}
    # Proof: removing this check let registry mode create scratch backing before the cross-mode negative failed.
    require(isinstance(volumes, list) and len(volumes) == len(expected_names) and
            {volume['name'] for volume in volumes} == expected_names, 'Volume set differs from storage mode')
    for volume in volumes:
        require(set(volume) == {'name', 'bytes', 'uid'}, 'Invalid volume keys')
        ceiling = 1024**3 if volume['name'] == 'journal' else 50 * 1024**3
        require(type(volume['bytes']) is int and 32 * 1024**2 <= volume['bytes'] <= ceiling,
                'Invalid fixed capacity')
        require(type(volume['uid']) is int and 1 <= volume['uid'] < 61184 and
                volume['uid'] == volumes[0]['uid'], 'Invalid volume owner')
    table = Path(config['fstab']).read_text()
    for volume in volumes:
        name = volume['name']
        entries = [line.split() for line in table.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        entries = [entry for entry in entries if len(entry) >= 4 and entry[1] == str(directory / name)]
        has_trim_exclusion = (len(entries) == 1 and entries[0][0] == str(directory / (name + '.ext4')) and
                              entries[0][2] == 'ext4' and {'noauto', 'nodiscard', 'X-fstrim.notrim'}.issubset(set(entries[0][3].split(','))))
        # Proof: removing the fstab notrim option refuses startup; removing this guard admits it.
        require(has_trim_exclusion, 'Missing exact scheduled-trim exclusion')
    with (directory / 'storage.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        changed = False
        receipts = {}
        for volume in volumes:
            name, limit = volume['name'], volume['bytes']
            image = directory / (name + '.ext4')
            mount = directory / name
            identity_path = directory / (name + '.identity.json')
            if not image.exists():
                require(command == 'provision' and not identity_path.exists(),
                        'Missing enrolled backing file')
                root = os.statvfs('/')
                # Proof: oversized reserve fault refuses allocation in registry-storage-rehearsal.sh.
                require(root.f_bavail * root.f_frsize - limit >= reserve,
                        'Allocation would cross host root reserve')
                require(not mount.exists() or not any(mount.iterdir()), 'Mountpoint is not empty')
                descriptor = os.open(image, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                os.close(descriptor)
                run('fallocate', '--length', str(limit), str(image))
                # Proof: lazy-init mutation loses 2,088,960 reserved bytes despite nodiscard;
                # eager initialization retains allocation after metadata churn and remount.
                run('mkfs.ext4', '-q', '-F', '-m', '0', '-E', 'nodiscard,lazy_itable_init=0,lazy_journal_init=0', str(image))
                status = allocated(image, limit)
                identity = {'inode': status.st_ino, 'device': status.st_dev, 'bytes': limit,
                            'uuid': run('blkid', '-s', 'UUID', '-o', 'value', str(image))}
                durable_write(identity_path, json.dumps(identity, sort_keys=True) + '\n')
                changed = True
            status = allocated(image, limit)
            identity = json.loads(identity_path.read_text())
            # Proof: replacement inode and wrong filesystem faults refuse in the physical rehearsal.
            require(identity['inode'] == status.st_ino and identity['device'] == status.st_dev and
                    identity['bytes'] == limit and
                    identity['uuid'] == run('blkid', '-s', 'UUID', '-o', 'value', str(image)),
                    'Backing identity differs from enrollment')
            attached = json.loads(run('losetup', '--json', '--list', '--output',
                                     'NAME,BACK-FILE,BACK-INO,BACK-MAJ:MIN,OFFSET,SIZELIMIT'))['loopdevices']
            loops = [loop for loop in attached if loop['back-file'] == str(image)]
            require(len(loops) <= 1, 'Duplicate loop attachment')
            mounted = inspect_mount(mount)
            if command == 'verify':
                # Proof: replacing the mount with a directory fails the production verify command.
                require(mounted is not None, 'Required filesystem is not mounted')
            if not loops:
                require(mounted is None, 'Mount exists without enrolled loop')
                device = run('losetup', '--find', '--show', '--nooverlap', str(image))
                changed = True
            else:
                loop = loops[0]
                require(int(loop['back-ino']) == status.st_ino and
                        loop['back-maj:min'] == f'{os.major(status.st_dev)}:{os.minor(status.st_dev)}' and
                        int(loop['offset']) == 0 and int(loop['sizelimit']) == 0,
                        'Loop backing identity differs')
                device = loop['name']
            if mounted is None:
                mount.mkdir(mode=0o000, exist_ok=True)
                require(not any(mount.iterdir()), 'Refuse root-backed contents')
                os.chmod(mount, 0o000)
                run('mount', '-t', 'ext4', '-o', 'nodiscard,nodev,nosuid,noexec', device, str(mount))
                mounted = inspect_mount(mount)
                changed = True
            # Proof: wrong ext4 mount and removed capacity bound are exercised by the rehearsal.
            require(mounted is not None and mounted['source'] == device and mounted['fstype'] == 'ext4'
                    and {'rw', 'nodev', 'nosuid', 'noexec'}.issubset(set(mounted['options'].split(',')))
                    and 'discard' not in mounted['options'].split(','), 'Wrong mounted filesystem')
            capacity = os.statvfs(mount)
            require(0 < capacity.f_blocks * capacity.f_frsize <= limit, 'Filesystem exceeds capacity')
            allocated(image, limit)
            contents = mount / 'contents'
            if command == 'provision' and not contents.exists():
                contents.mkdir(mode=0o700)
                os.chown(contents, volume['uid'], volume['uid'])
                changed = True
            require(contents.is_dir() and not contents.is_symlink() and
                    contents.stat().st_uid == volume['uid'] and
                    stat.S_IMODE(contents.stat().st_mode) == 0o700, 'Invalid contents ownership')
            receipt = f"{mounted['maj:min']} {limit} {identity['uuid']} {run('stat', '-f', '-c', '%i', str(mount))}\n"
            receipts[name] = receipt
        identities = directory / 'identities' if is_scratch else directory / 'journal' / 'identities'
        if not identities.exists():
            identities.mkdir(mode=0o755)
            changed = True
        require(identities.is_dir() and not identities.is_symlink() and
                identities.stat().st_uid == 0 and stat.S_IMODE(identities.stat().st_mode) == 0o755,
                'Invalid physical identity directory')
        for name, receipt in receipts.items():
            changed = durable_write(identities / (name + '.receipt'), receipt) or changed
        print('changed' if changed else 'unchanged')


main()
PY
