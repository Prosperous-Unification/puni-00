import contextlib
import fcntl
import hashlib
import json
import os
import pathlib
import re
import selectors
import stat
import struct
import subprocess
import sys
import time
import uuid


class Refusal(Exception):
    """A fixed bounded baseline failure, never a recovery or permission grant."""


PACKAGES = {
    'docker-ce': ('5:29.7.2-1~ubuntu.24.04~noble', 'amd64', 24039440, '8243f97d569a0fa33ea32417e399e9f524e7d75d3898fa9d24e0eadaa486af68'),
    'docker-ce-cli': ('5:29.7.2-1~ubuntu.24.04~noble', 'amd64', 16984968, '920a5fa031f33f2dd5b56b4a9bc4c725bc9549d6007004a6610a469873ec69fe'),
    'containerd.io': ('2.3.4-1~ubuntu.24.04~noble', 'amd64', 22704320, '1c858bacbf367f415cfd9723152f6402f0b8e865ca00d0b701f58fb33c963c59'),
}
PREREQUISITES = {
    'init-system-helpers': ('1.66ubuntu1', 'all'),
    'iptables': ('1.8.10-3ubuntu2', 'amd64'),
    'libc6:amd64': ('2.39-0ubuntu8.9', 'amd64'),
    'libseccomp2:amd64': ('2.5.5-1ubuntu3.1', 'amd64'),
    'libsystemd0:amd64': ('255.4-1ubuntu8.18', 'amd64'),
    'nftables': ('1.0.9-1ubuntu0.1', 'amd64'),
    'libnftables1:amd64': ('1.0.9-1ubuntu0.1', 'amd64'),
    'libmnl0:amd64': ('1.0.5-2build1', 'amd64'),
    'libnftnl11:amd64': ('1.2.6-2build1', 'amd64'),
    'cloud-init': ('26.1-0ubuntu1~24.04.1', 'all'),
}
ENVIRONMENT = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'HOME': '/run/puni-baseline/docker-client', 'DOCKER_HOST': 'unix:///run/docker.sock', 'DOCKER_API_VERSION': '1.55', 'DOCKER_CONFIG': '/run/puni-baseline/docker-client'}
SOURCE = pathlib.Path(__file__).resolve()
REQUEST = pathlib.Path('/opt/puni-baseline/request.json')
SEED = pathlib.Path('/run/puni-baseline/seed')
MAX_FRAME = 65536


def require(condition, code):
    if not condition:
        raise Refusal(code)


def parse_json(text):
    """Decode bounded JSON with duplicate rejection at every object depth."""
    # Proof: bypass json-size failed `strict guest JSON refuses large` (watched guard fault).
    require(len(text.encode('utf-8')) <= MAX_FRAME, 'json-size')
    def pairs(entries):
        fields = {}
        for key, value in entries:
            # Proof: bypass json-duplicate failed `strict guest JSON refuses nested` (watched guard fault).
            require(key not in fields, 'json-duplicate')
            fields[key] = value
        return fields
    def constant(value):
        # Proof: bypass json-nonfinite failed `strict guest JSON refuses nan` (watched guard fault).
        raise Refusal('json-nonfinite')
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def run(command, timeout=10, pass_fds=(), stderr_policy=None):
    """Drain both real pipes concurrently under aggregate byte and monotonic deadlines."""
    started = time.monotonic()
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             env=ENVIRONMENT, close_fds=True, pass_fds=pass_fds, start_new_session=True)
    stdout = bytearray()
    stderr = bytearray()
    try:
        with selectors.DefaultSelector() as selector:
            for pipe, buffer in ((child.stdout, stdout), (child.stderr, stderr)):
                os.set_blocking(pipe.fileno(), False)
                selector.register(pipe, selectors.EVENT_READ, buffer)
            while selector.get_map():
                remaining = timeout - (time.monotonic() - started)
                # Proof: bypass command-deadline failed `real bounded child refuses deadline` (watched guard fault).
                require(remaining > 0, 'command-deadline')
                for key, _ in selector.select(min(remaining, 0.1)):
                    chunk = os.read(key.fileobj.fileno(), 4096)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        key.data.extend(chunk)
                        # Proof: bypass command-output failed `real bounded child refuses flood` (watched guard fault).
                        require(len(stdout) + len(stderr) <= MAX_FRAME, 'command-output')
            remaining = timeout - (time.monotonic() - started)
            require(remaining > 0, 'command-deadline')
            # Proof: bypass command-exit failed `real bounded child refuses exit` (watched guard fault).
            require(child.wait(timeout=remaining) == 0, 'command-exit')
        # Proof: bypass command-stderr failed `bounded primitive refuses stderr` (watched guard fault).
        if stderr_policy is None:
            require(not stderr, 'command-stderr')
        else:
            stderr_policy(stderr.decode('utf-8', errors='strict'))
        return stdout.decode('utf-8', errors='strict')
    finally:
        if child.poll() is None:
            os.killpg(child.pid, 9)
            child.wait(timeout=2)
        child.stdout.close()
        child.stderr.close()


def require_install_stderr(text):
    """Only the pinned postinst/helper suppression diagnostics are modeled successes."""
    allowed = {
        "/usr/sbin/policy-rc.d returned 101, not running 'start containerd.service'",
        "/usr/sbin/policy-rc.d returned 101, not running 'start docker.service docker.socket'",
    }
    lines = text.split('\n')[:-1] if text else []
    # Proof: allowlist bypass made the real-child unknown-diagnostic installer negative exit 0.
    require((not text or text.endswith('\n')) and len(lines) == len(set(lines)) and all(line in allowed for line in lines), 'install-stderr')


def read_text(path, maximum=65536):
    with open(path, 'rb') as stream:
        content = stream.read(maximum + 1)
    # Proof: bypass read-size failed `bounded primitive refuses read` (watched guard fault).
    require(len(content) <= maximum, 'read-size')
    return content.decode('utf-8', errors='strict').strip()


def read_request(path):
    request = parse_json(read_text(path))
    # Proof: bypass request-shape failed `request boundary refuses shape` (watched guard fault).
    require(type(request) is dict and set(request) == {'schemaVersion', 'nonce', 'bootstrapSha256'}, 'request-shape')
    # Proof: bypass request-version failed `request boundary refuses version` (watched guard fault).
    require(type(request['schemaVersion']) is int and request['schemaVersion'] == 1, 'request-version')
    # Proof: bypass request-nonce failed `request boundary refuses nonce` (watched guard fault).
    require(type(request['nonce']) is str and re.fullmatch('[a-f0-9]{32}', request['nonce']) is not None, 'request-nonce')
    # Proof: bypass request-source failed `request boundary refuses source` (watched guard fault).
    require(request['bootstrapSha256'] == hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'request-source')
    return request


def require_guest_identity(facts, request):
    """No bypass: every installer and collector entrypoint requires these guest facts."""
    expected = {'vendor': 'QEMU', 'product': 'Puni bounded baseline', 'uuid': str(uuid.UUID(request['nonce'])),
                'instance': 'puniq-' + request['nonce'], 'cloud': 'nocloud', 'rootSource': '/dev/vda1',
                'rootSectors': 16777216, 'network': ['lo'], 'uid': 0}
    # Proof: bypass guest-boundary failed `guest mutation boundary refuses product` (watched guard fault).
    require(facts == expected and type(facts['rootSectors']) is int and type(facts['uid']) is int, 'guest-boundary')


def guard_guest(request):
    """Read actual DMI first, so accidental execution on the host cannot reach mutation."""
    # Proof: bypass guest-boundary-vendor failed `native guest entry checks refuse vendor` (watched guard fault).
    require(read_text('/sys/class/dmi/id/sys_vendor') == 'QEMU', 'guest-boundary-vendor')
    facts = {
        'vendor': read_text('/sys/class/dmi/id/sys_vendor'), 'product': read_text('/sys/class/dmi/id/product_name'),
        'uuid': read_text('/sys/class/dmi/id/product_uuid').lower(), 'instance': read_text('/var/lib/cloud/data/instance-id'),
        'cloud': run(['/usr/bin/cloud-id']).strip(), 'rootSource': run(['/usr/bin/findmnt', '-n', '-o', 'SOURCE', '/']).strip(),
        'rootSectors': int(read_text('/sys/class/block/vda/size')), 'network': sorted(os.listdir('/sys/class/net')), 'uid': os.geteuid(),
    }
    require_guest_identity(facts, request)
    # Proof: bypass seed-not-cdrom failed `native guest entry checks refuse cdrom` (watched guard fault).
    require(int(read_text('/sys/class/block/sr0/device/type')) == 5, 'seed-not-cdrom')
    # Proof: bypass root-filesystem failed `native guest entry checks refuse filesystem` (watched guard fault).
    require(run(['/usr/bin/findmnt', '-n', '-o', 'FSTYPE', '/']).strip() == 'ext4', 'root-filesystem')
    # Proof: bypass guest-swap failed `native guest entry checks refuse swap` (watched guard fault).
    require(run(['/usr/sbin/swapon', '--noheadings', '--show=NAME']).strip() == '', 'guest-swap')
    require_configured(PREREQUISITES, run)
    return inspect_seed(request)


def pread_exact(fd, count, offset):
    content = os.pread(fd, count, offset)
    # Proof: bypass seed-short-read failed `bounded primitive refuses short-read` (watched guard fault).
    require(len(content) == count, 'seed-short-read')
    return content


def inspect_seed(request):
    """Validate Joliet CD bytes and exact package pins before mount or guest file writes."""
    fd = os.open('/dev/sr0', os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        # Proof: bypass seed-device failed `original read-only CD guard refuses type` (watched guard fault).
        require(stat.S_ISBLK(os.fstat(fd).st_mode), 'seed-device')
        # Proof: bypass seed-not-readonly failed `original read-only CD guard refuses writable` (watched guard fault).
        require(struct.unpack('I', fcntl.ioctl(fd, 0x125e, bytes(4)))[0] == 1, 'seed-not-readonly')
        capacity = struct.unpack('Q', fcntl.ioctl(fd, 0x80081272, bytes(8)))[0]
        # Proof: bypass seed-size failed `original read-only CD guard refuses size` (watched guard fault).
        require(0 < capacity <= 80 * 1024 * 1024, 'seed-size')
        pvd = pread_exact(fd, 2048, 16 * 2048)
        # Proof: bypass seed-label failed `original read-only CD guard refuses label` (watched guard fault).
        require(pvd[:7] == b'\x01CD001\x01' and pvd[40:72].rstrip(b' ') == b'CIDATA', 'seed-label')
        supplementary = []
        for sector in range(17, 32):
            descriptor = pread_exact(fd, 2048, sector * 2048)
            # Proof: bypass seed-descriptor failed `original read-only CD guard refuses descriptor` (watched guard fault).
            require(descriptor[1:7] == b'CD001\x01', 'seed-descriptor')
            if descriptor[0] == 255:
                break
            if descriptor[0] == 2:
                supplementary.append(descriptor)
        # Proof: bypass seed-joliet failed `original read-only CD guard refuses joliet` (watched guard fault).
        require(len(supplementary) == 1 and supplementary[0][88:91] in (b'%/@', b'%/C', b'%/E'), 'seed-joliet')
        root = supplementary[0][156:190]
        sector = int.from_bytes(root[2:6], 'little')
        length = int.from_bytes(root[10:14], 'little')
        # Proof: bypass seed-root-size failed `original read-only CD guard refuses root-size` (watched guard fault).
        require(0 < length <= MAX_FRAME, 'seed-root-size')
        directory = pread_exact(fd, length, sector * 2048)
        members = {}
        cursor = 0
        while cursor < length:
            size = directory[cursor]
            if size == 0:
                cursor = (cursor // 2048 + 1) * 2048
                continue
            entry = directory[cursor:cursor + size]
            # Proof: bypass seed-directory changed the modeled refusal to IndexError; typed-decoder proof only.
            require(size >= 34 and len(entry) == size and cursor % 2048 + size <= 2048, 'seed-directory')
            name_bytes = entry[33:33 + entry[32]]
            cursor += size
            if name_bytes in (b'\x00', b'\x01'):
                continue
            name = name_bytes.decode('utf-16-be').removesuffix(';1')
            # Proof: bypass seed-member-type failed `original read-only CD guard refuses directory` (watched guard fault).
            require(name not in members and entry[25] == 0, 'seed-member-type')
            offset = int.from_bytes(entry[2:6], 'little') * 2048
            count = int.from_bytes(entry[10:14], 'little')
            # Proof: bypass seed-member-range failed `original read-only CD guard refuses member-range` (watched guard fault).
            require(offset >= 32768 and 0 < count <= 64 * 1024 * 1024 and offset + count <= capacity, 'seed-member-range')
            members[name] = (offset, count)
        # Proof: bypass seed-members failed `original read-only CD guard refuses extra` (watched guard fault).
        require(set(members) == {'user-data', 'meta-data', 'network-config', 'docker-ce.deb', 'docker-ce-cli.deb', 'containerd.io.deb'}, 'seed-members')
        # Proof: bypass seed-input-size failed `original read-only CD guard refuses input-size` (watched guard fault).
        require(sum(count for _, count in members.values()) <= 64 * 1024 * 1024, 'seed-input-size')
        for name, pin in PACKAGES.items():
            offset, count = members[name + '.deb']
            # Proof: bypass seed-package-size failed `original read-only CD guard refuses package-size` (watched guard fault).
            require(count == pin[2], 'seed-package-size')
            digest = hashlib.sha256()
            for position in range(0, count, MAX_FRAME):
                digest.update(pread_exact(fd, min(MAX_FRAME, count - position), offset + position))
            # Proof: bypass seed-package-hash failed `original read-only CD guard refuses hash` (watched guard fault).
            require(digest.hexdigest() == pin[3], 'seed-package-hash')
        offset, count = members['meta-data']
        metadata = parse_json(pread_exact(fd, count, offset).decode('utf-8'))
        # Proof: bypass seed-instance failed `original read-only CD guard refuses instance` (watched guard fault).
        require(metadata == {'instance-id': 'puniq-' + request['nonce'], 'local-hostname': 'puni-baseline'}, 'seed-instance')
        return (os.fstat(fd).st_rdev, capacity)
    finally:
        os.close(fd)


def require_configured(pins, execute=run):
    for name, (version, architecture) in pins.items():
        observed = execute(['/usr/bin/dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${Architecture}\t${Status}\n', name]).strip().split('\t')
        # Proof: bypass package-configured failed `configured prerequisite guard refuses status` (watched guard fault).
        require(observed == [name, version, architecture, 'install ok installed'], 'package-configured')


def capture_capabilities(execute=run):
    version = parse_json(execute(['/usr/bin/docker', 'version', '--format', '{"engineVersion":{{json .Server.Version}},"serverApi":{{json .Server.APIVersion}},"minimumApi":{{json .Server.MinAPIVersion}}}']))
    info = parse_json(execute(['/usr/bin/docker', 'info', '--format', '{"daemonId":{{json .ID}},"os":{{json .OSType}},"arch":{{json .Architecture}},"driver":{{json .Driver}},"driverStatus":{{json .DriverStatus}}}']))
    # Proof: bypass capability-version failed `capability projection refuses engineVersion` (watched guard fault).
    require(version == {'engineVersion': '29.7.2', 'serverApi': '1.55', 'minimumApi': '1.40'}, 'capability-version')
    # Proof: bypass capability-info-shape failed `capability projection refuses info-shape` (watched guard fault).
    require(type(info) is dict and set(info) == {'daemonId', 'os', 'arch', 'driver', 'driverStatus'}, 'capability-info-shape')
    # Proof: bypass capability-daemon failed `capability projection refuses daemonId` (watched guard fault).
    require(type(info['daemonId']) is str and re.fullmatch('[A-Za-z0-9_-]{1,128}', info['daemonId']) is not None, 'capability-daemon')
    # Proof: bypass capability-platform failed `capability projection refuses os` (watched guard fault).
    require(info['os'] == 'linux' and info['arch'] in ('x86_64', 'amd64') and info['driver'] == 'overlayfs', 'capability-platform')
    # Proof: bypass capability-store-shape failed `capability projection refuses malformed-row` (watched guard fault).
    require(type(info['driverStatus']) is list and all(type(row) is list and all(type(value) is str for value in row) for row in info['driverStatus']), 'capability-store-shape')
    stores = [row for row in info['driverStatus'] if row and row[0] == 'driver-type']
    # Proof: bypass capability-store failed `capability projection refuses duplicate-store` (watched guard fault).
    require(stores == [['driver-type', 'io.containerd.snapshotter.v1']], 'capability-store')
    return {**version, 'daemonId': info['daemonId'], 'os': 'linux', 'arch': 'amd64', 'driver': info['driver'], 'driverType': stores[0][1], 'requestApi': '1.55'}


def require_empty(counts):
    # Proof: bypass workload-shape failed `zero workload counts refuse missing` (watched guard fault).
    require(type(counts) is dict and set(counts) == {'containers', 'running', 'paused', 'stopped', 'images'}, 'workload-shape')
    # Proof: bypass workload-present failed `zero workload counts refuse boolean` (watched guard fault).
    require(all(type(count) is int and count == 0 for count in counts.values()), 'workload-present')


SERVICE_LIMITS = {'docker.service': (536870912, 64), 'containerd.service': (134217728, 32)}
SERVICE_PROPERTIES = ['LoadState', 'ActiveState', 'SubState', 'InvocationID', 'MainPID', 'ExecMainStartTimestampMonotonic', 'ControlGroup', 'MemoryMax', 'MemorySwapMax', 'TasksMax', 'NRestarts', 'Restart', 'KillMode', 'TimeoutStopUSec']


def require_service_fields(unit, fields):
    # Proof: bypass service-shape failed `service generation/cap guard refuses shape` (watched guard fault).
    require(set(fields) == set(SERVICE_PROPERTIES), 'service-shape')
    memory, tasks = SERVICE_LIMITS[unit]
    expected = {'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'running', 'ControlGroup': '/system.slice/' + unit,
                'MemoryMax': str(memory), 'MemorySwapMax': '0', 'TasksMax': str(tasks), 'NRestarts': '0', 'Restart': 'no', 'KillMode': 'control-group', 'TimeoutStopUSec': '30s'}
    # Proof: bypass service-policy failed `service generation/cap guard refuses MemoryMax` (watched guard fault).
    require(all(fields[key] == value for key, value in expected.items()), 'service-policy')
    # Proof: bypass service-invocation failed `service generation/cap guard refuses InvocationID` (watched guard fault).
    require(re.fullmatch('[a-f0-9]{32}', fields['InvocationID']) is not None and fields['InvocationID'] != '0' * 32, 'service-invocation')
    # Proof: bypass service-process failed `service generation/cap guard refuses MainPID` (watched guard fault).
    require(re.fullmatch('[1-9][0-9]*', fields['MainPID']) is not None and re.fullmatch('[1-9][0-9]*', fields['ExecMainStartTimestampMonotonic']) is not None, 'service-process')
    return fields


def show_fields(unit, properties):
    text = run(['/usr/bin/systemctl', 'show', unit, '--property=' + ','.join(properties)])
    fields = {}
    for line in text.splitlines():
        key, separator, value = line.partition('=')
        # Proof: bypass unit-fields failed `bounded primitive refuses duplicate-unit` (watched guard fault).
        require(separator == '=' and key not in fields, 'unit-fields')
        fields[key] = value
    # Proof: bypass unit-fields-missing failed `bounded primitive refuses missing-unit` (watched guard fault).
    require(set(fields) == set(properties), 'unit-fields-missing')
    return fields


def generation():
    """Bind actual merged units, processes, kernel cgroups and filesystem socket identities."""
    snapshot = {}
    for unit, (memory, tasks) in SERVICE_LIMITS.items():
        fields = require_service_fields(unit, show_fields(unit, SERVICE_PROPERTIES))
        pid = fields['MainPID']
        process = read_text('/proc/' + pid + '/stat')
        suffix = process[process.rindex(')') + 2:].split()
        # Proof: bypass process-stat failed `actual generation decoder refuses stat` (watched guard fault).
        require(len(suffix) >= 20, 'process-stat')
        executable = '/usr/bin/dockerd' if unit == 'docker.service' else '/usr/bin/containerd'
        # Proof: bypass service-executable failed `actual generation decoder refuses executable` (watched guard fault).
        require(os.readlink('/proc/' + pid + '/exe') == executable, 'service-executable')
        arguments = pathlib.Path('/proc/' + pid + '/cmdline').read_bytes().split(b'\0')[:-1]
        expected = [executable.encode()] + ([b'-H', b'fd://', b'--containerd=/run/containerd/containerd.sock'] if unit == 'docker.service' else [])
        # Proof: bypass service-command failed `actual generation decoder refuses command` (watched guard fault).
        require(arguments == expected, 'service-command')
        # Proof: bypass service-cgroup failed `actual generation decoder refuses cgroup` (watched guard fault).
        require(read_text('/proc/' + pid + '/cgroup') == '0::' + fields['ControlGroup'], 'service-cgroup')
        cgroup = '/sys/fs/cgroup' + fields['ControlGroup']
        # Proof: bypass service-kernel-caps failed `actual generation decoder refuses memory` (watched guard fault).
        require(read_text(cgroup + '/memory.max') == str(memory) and read_text(cgroup + '/memory.swap.max') == '0' and read_text(cgroup + '/pids.max') == str(tasks), 'service-kernel-caps')
        counters = dict(line.split() for line in read_text(cgroup + '/memory.events').splitlines())
        # Proof: bypass service-oom failed `actual generation decoder refuses oom` (watched guard fault).
        require('oom' in counters and 'oom_kill' in counters and counters['oom'] == '0' and counters['oom_kill'] == '0', 'service-oom')
        snapshot[unit] = {'unit': fields, 'processStart': suffix[19], 'executable': executable}
    for path in ('/run/docker.sock', '/run/containerd/containerd.sock'):
        identity = os.lstat(path)
        # Proof: bypass service-socket failed `actual generation decoder refuses socket-mode` (watched guard fault).
        require(stat.S_ISSOCK(identity.st_mode) and identity.st_uid == 0 and stat.S_IMODE(identity.st_mode) == 0o660, 'service-socket')
        snapshot[path] = [identity.st_dev, identity.st_ino, identity.st_ctime_ns, identity.st_uid, identity.st_gid, stat.S_IMODE(identity.st_mode)]
    docker = show_fields('docker.service', ['Requires'])
    # Proof: bypass docker-socket-dependency failed `actual generation decoder refuses requires` (watched guard fault).
    require('docker.socket' in docker['Requires'].split(), 'docker-socket-dependency')
    socket = show_fields('docker.socket', ['LoadState', 'ActiveState', 'SubState', 'Listen', 'SocketMode', 'SocketUser', 'SocketGroup'])
    # Proof: bypass docker-socket-unit failed `actual generation decoder refuses socket-unit` (watched guard fault).
    require(socket == {'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'listening', 'Listen': '/run/docker.sock (Stream)', 'SocketMode': '0660', 'SocketUser': 'root', 'SocketGroup': 'root'}, 'docker-socket-unit')
    snapshot['docker.socket'] = socket
    for unit, memory, tasks in [('system.slice', 805306368, 256), ('user.slice', 67108864, 32)]:
        caps = show_fields(unit, ['MemoryMax', 'MemorySwapMax', 'TasksMax'])
        # Proof: bypass slice-policy failed `actual generation decoder refuses slice` (watched guard fault).
        require(caps == {'MemoryMax': str(memory), 'MemorySwapMax': '0', 'TasksMax': str(tasks)}, 'slice-policy')
        snapshot[unit] = caps
    return snapshot


def collect_sample():
    before = generation()
    def fenced(command, **options):
        # Proof: bypass service-generation-before-query failed `sample refuses before` (watched guard fault).
        require(generation() == before, 'service-generation-before-query')
        answer = run(command, **options)
        # Proof: bypass service-generation-after-query failed `sample refuses after` (watched guard fault).
        require(generation() == before, 'service-generation-after-query')
        return answer
    capabilities = capture_capabilities(fenced)
    counts = parse_json(fenced(['/usr/bin/docker', 'info', '--format', '{"containers":{{json .Containers}},"running":{{json .ContainersRunning}},"paused":{{json .ContainersPaused}},"stopped":{{json .ContainersStopped}},"images":{{json .Images}}}']))
    require_empty(counts)
    filesystem = os.statvfs('/')
    # Proof: bypass filesystem-geometry failed `sample refuses invalid filesystem` (watched guard fault).
    require(filesystem.f_frsize > 0 and filesystem.f_blocks > 0 and filesystem.f_files > 0 and filesystem.f_bavail > 0 and filesystem.f_favail > 0, 'filesystem-geometry')
    # Proof: bypass filesystem-boundary failed `sample refuses invalid disk` (watched guard fault).
    require(filesystem.f_blocks * filesystem.f_frsize <= 8 * 1024 ** 3, 'filesystem-boundary')
    # Proof: bypass service-generation-after-sample failed `sample refuses last` (watched guard fault).
    require(generation() == before, 'service-generation-after-sample')
    return {'capabilities': capabilities, 'generation': before, 'counts': counts, 'filesystem': {'fragmentBytes': filesystem.f_frsize, 'blocks': filesystem.f_blocks, 'freeBlocks': filesystem.f_bavail, 'files': filesystem.f_files, 'freeFiles': filesystem.f_favail}}


class Protocol:
    """Bounded nonce/source-bound frames; final acknowledges only a poweroff request."""
    def __init__(self, request, stream):
        self.request = request
        self.stream = stream
        self.frames = 0

    def emit(self, kind, **fields):
        # Proof: bypass frame-count failed `serial protocol refuses frame count` (watched guard fault).
        require(self.frames < 128, 'frame-count')
        frame = {'schemaVersion': 1, 'nonce': self.request['nonce'], 'bootstrapSha256': self.request['bootstrapSha256'], 'kind': kind, **fields}
        text = 'PUNI_BASELINE ' + json.dumps(frame, separators=(',', ':'), allow_nan=False) + '\n'
        # Proof: bypass frame-size failed `serial protocol refuses frame size` (watched guard fault).
        require(len(text.encode('utf-8')) <= MAX_FRAME, 'frame-size')
        self.stream.write(text)
        self.stream.flush()
        self.frames += 1


def measure(request, protocol, sample=collect_sample, shutdown=None, clock=time.monotonic, sleep=time.sleep):
    # Proof: bypass shutdown-missing failed `bounded primitive refuses missing-shutdown` (watched guard fault).
    require(shutdown is not None, 'shutdown-missing')
    started = clock()
    previous = started
    first = sample()
    final = first
    count = 1
    for _ in range(61):
        sleep(1)
        observed = clock()
        # Proof: bypass steady-clock failed `measurement refuses stutter` (watched guard fault).
        require(observed > previous and observed - previous <= 5, 'steady-clock')
        final = sample()
        # Proof: bypass steady-generation failed `measurement refuses changed` (watched guard fault).
        require(final['generation'] == first['generation'] and final['capabilities'] == first['capabilities'], 'steady-generation')
        count += 1
        previous = observed
        if observed - started >= 60:
            break
    elapsed = clock() - started
    # Proof: bypass steady-interval failed `measurement refuses short` (watched guard fault).
    require(elapsed >= 60 and elapsed <= 65 and count >= 2, 'steady-interval')
    protocol.emit('measured', elapsedSeconds=elapsed, samples=count, first=first, last=final)
    shutdown()
    protocol.emit('final', poweroffRequested=True, guestPoweroffVerified=False, hostCleanupVerified=False)


@contextlib.contextmanager
def suppress_starts(path, nonce):
    """Refuse foreign policies and unlink only the exact owned temporary inode/content."""
    content = ('#!/bin/sh\n# puniq-' + nonce + '\nexit 101\n').encode()
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_CLOEXEC | os.O_NOFOLLOW, 0o700)
    try:
        # Proof: bypass policy-short-write reached dpkg (installCalls=1 vs 0); later cleanup still refused.
        require(os.write(fd, content) == len(content), 'policy-short-write')
        os.fsync(fd)
        original = os.fstat(fd)
        try:
            yield
        finally:
            current = os.lstat(path)
            # Proof: bypass policy-replaced failed `temporary start policy refuses replacement` (watched guard fault).
            require((current.st_dev, current.st_ino, current.st_nlink) == (original.st_dev, original.st_ino, 1) and pathlib.Path(path).read_bytes() == content, 'policy-replaced')
            os.unlink(path)
    finally:
        os.close(fd)


def create_file(path, content):
    path = pathlib.Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600), 'wb', closefd=True) as stream:
        encoded = content.encode('utf-8')
        # Proof: bypass config-write failed `bounded primitive refuses configuration` (watched guard fault).
        require(len(encoded) <= MAX_FRAME and stream.write(encoded) == len(encoded), 'config-write')
        stream.flush()
        os.fsync(stream.fileno())


def write_policy():
    """Author all daemon/socket caps before dpkg can start any selected service."""
    for unit, memory, tasks in [('system.slice', '768M', 256), ('user.slice', '64M', 32)]:
        create_file('/etc/systemd/system/' + unit + '.d/puni-baseline.conf', '[Slice]\nMemoryMax=' + memory + '\nMemorySwapMax=0\nTasksMax=' + str(tasks) + '\n')
    for unit, memory, tasks, command in [
        ('containerd.service', '128M', 32, '/usr/bin/containerd'),
        ('docker.service', '512M', 64, '/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock'),
    ]:
        dependency = 'Requires=docker.socket containerd.service\nAfter=containerd.service docker.socket\n' if unit == 'docker.service' else ''
        create_file('/etc/systemd/system/' + unit, '[Unit]\nDescription=Puni bounded baseline\n' + dependency + '[Service]\nType=notify\nExecStart=' + command + '\nMemoryMax=' + memory + '\nMemorySwapMax=0\nTasksMax=' + str(tasks) + '\nRestart=no\nKillMode=control-group\nTimeoutStartSec=60\nTimeoutStopSec=30\nLimitCORE=0\nLimitNOFILE=1024\n')
    create_file('/etc/systemd/system/docker.socket', '[Unit]\nDescription=Puni baseline Docker socket\n[Socket]\nListenStream=/run/docker.sock\nSocketMode=0660\nSocketUser=root\nSocketGroup=root\n')
    create_file('/etc/docker/daemon.json', '{"features":{"containerd-snapshotter":true},"iptables":false,"ip6tables":false,"bridge":"none","log-driver":"local","log-opts":{"max-size":"1m","max-file":"1"}}\n')
    create_file('/etc/systemd/journald.conf.d/puni-baseline.conf', '[Journal]\nRuntimeMaxUse=8M\nSystemMaxUse=8M\nRuntimeMaxFileSize=1M\nSystemMaxFileSize=1M\n')
    run(['/usr/bin/systemctl', 'daemon-reload'])
    run(['/usr/bin/systemctl', 'restart', 'systemd-journald.service'])


def file_identity(fd):
    identity = os.fstat(fd)
    return (identity.st_dev, identity.st_ino, identity.st_mode, identity.st_size, identity.st_mtime_ns, identity.st_ctime_ns)


def hash_file(fd):
    digest = hashlib.sha256()
    size = os.fstat(fd).st_size
    for offset in range(0, size, MAX_FRAME):
        digest.update(pread_exact(fd, min(MAX_FRAME, size - offset), offset))
    return digest.hexdigest()


def install_packages(request):
    guard_guest(request)
    properties = ['MemoryMax', 'MemorySwapMax', 'TasksMax', 'LimitFSIZE', 'RuntimeMaxUSec', 'KillMode', 'Restart']
    # Proof: bypass installer-policy failed `installer refuses limits` (watched guard fault).
    require(show_fields('puni-offline-install.service', properties) == {'MemoryMax': '536870912', 'MemorySwapMax': '0', 'TasksMax': '64', 'LimitFSIZE': '134217728', 'RuntimeMaxUSec': '3min', 'KillMode': 'control-group', 'Restart': 'no'}, 'installer-policy')
    # Proof: bypass installer-cgroup failed `installer refuses cgroup` (watched guard fault).
    require(read_text('/proc/self/cgroup') == '0::/system.slice/puni-offline-install.service', 'installer-cgroup')
    # Proof: bypass installer-kernel-swap failed `installer refuses swap` (watched guard fault).
    require(read_text('/sys/fs/cgroup/system.slice/puni-offline-install.service/memory.swap.max') == '0', 'installer-kernel-swap')
    # Proof: bypass installer-kernel-caps failed `installer refuses kernel` (watched guard fault).
    require(read_text('/sys/fs/cgroup/system.slice/puni-offline-install.service/memory.max') == '536870912' and read_text('/sys/fs/cgroup/system.slice/puni-offline-install.service/pids.max') == '64', 'installer-kernel-caps')
    with contextlib.ExitStack() as stack:
        archives = []
        for name, (version, architecture, count, digest) in PACKAGES.items():
            path = SEED / (name + '.deb')
            fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            stack.callback(os.close, fd)
            identity = file_identity(fd)
            # Proof: bypass archive-binding failed `installer refuses hash` (watched guard fault).
            require(stat.S_ISREG(identity[2]) and identity[3] == count and hash_file(fd) == digest, 'archive-binding')
            fields = run(['/usr/bin/dpkg-deb', '-f', '/proc/self/fd/' + str(fd), 'Package', 'Version', 'Architecture'], pass_fds=(fd,))
            # Proof: bypass archive-metadata failed `installer refuses metadata` (watched guard fault).
            require(fields == 'Package: ' + name + '\nVersion: ' + version + '\nArchitecture: ' + architecture + '\n', 'archive-metadata')
            archives.append((fd, identity, digest, path))
        for fd, identity, digest, path in archives:
            current = os.lstat(path)
            # Proof: bypass archive-before-install failed `installer refuses path-before` (watched guard fault).
            require(file_identity(fd) == identity and (current.st_dev, current.st_ino, current.st_nlink) == (identity[0], identity[1], 1) and hash_file(fd) == digest, 'archive-before-install')
        with suppress_starts('/usr/sbin/policy-rc.d', request['nonce']):
            run(['/usr/bin/dpkg', '--install'] + ['/proc/self/fd/' + str(fd) for fd, _, _, _ in archives], timeout=170, pass_fds=tuple(fd for fd, _, _, _ in archives), stderr_policy=require_install_stderr)
        for fd, identity, digest, path in archives:
            # Proof: bypass archive-changed failed `installer refuses post-start changed` (watched guard fault).
            require(file_identity(fd) == identity and (os.lstat(path).st_dev, os.lstat(path).st_ino) == (identity[0], identity[1]) and hash_file(fd) == digest, 'archive-changed')
        require_configured({name: pin[:2] for name, pin in PACKAGES.items()}, run)
        require_configured(PREREQUISITES, run)
        # Proof: bypass package-verification failed `installer refuses post-start verify` (watched guard fault).
        require(run(['/usr/bin/dpkg', '--verify', 'docker-ce', 'docker-ce-cli', 'containerd.io']) == '', 'package-verification')


def require_collector():
    expected = {'MemoryMax': '134217728', 'MemorySwapMax': '0', 'TasksMax': '32', 'LimitFSIZE': '65536',
                'RuntimeMaxUSec': '12min 30s', 'KillMode': 'control-group', 'Restart': 'no', 'TimeoutStopUSec': '30s', 'MainPID': str(os.getpid())}
    # Proof: bypass collector-policy failed `collector must actually be bounded before mutation: MemoryMax` (watched guard fault).
    require(show_fields('puni-baseline.service', list(expected)) == expected, 'collector-policy')
    # Proof: bypass collector-cgroup failed `collector must actually be bounded before mutation: cgroup` (watched guard fault).
    require(read_text('/proc/self/cgroup') == '0::/system.slice/puni-baseline.service', 'collector-cgroup')
    group = '/sys/fs/cgroup/system.slice/puni-baseline.service'
    # Proof: bypass collector-kernel-caps failed `collector must actually be bounded before mutation: kernel` (watched guard fault).
    require(read_text(group + '/memory.max') == '134217728' and read_text(group + '/memory.swap.max') == '0' and read_text(group + '/pids.max') == '32', 'collector-kernel-caps')


def request_poweroff():
    run(['/usr/bin/systemctl', '--no-block', 'poweroff'], timeout=30)


def require_readiness():
    # Proof: bypass readiness-deadline failed `bounded primitive refuses readiness` (watched guard fault).
    require(float(read_text('/proc/uptime').split()[0]) <= 600, 'readiness-deadline')


def require_seed_mount(text):
    mounted = text.split()
    # Proof: bypass seed-mount failed `bounded primitive refuses mount` (watched guard fault).
    require(len(mounted) == 3 and mounted[:2] == ['/dev/sr0', 'iso9660'] and {'ro', 'nosuid', 'nodev', 'noexec'}.issubset(set(mounted[2].split(','))), 'seed-mount')


def bootstrap(request):
    guard_guest(request)
    require_collector()
    require_readiness()
    resource = __import__('resource')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_FRAME, MAX_FRAME))
    os.umask(0o077)
    pathlib.Path('/run/puni-baseline/docker-client').mkdir(parents=True, mode=0o700)
    SEED.mkdir(mode=0o700)
    run(['/usr/bin/mount', '-t', 'iso9660', '-o', 'ro,nosuid,nodev,noexec', '/dev/sr0', str(SEED)])
    require_seed_mount(run(['/usr/bin/findmnt', '-n', '-o', 'SOURCE,FSTYPE,OPTIONS', str(SEED)]))
    run(['/usr/bin/cloud-init', 'schema', '--config-file', str(SEED / 'user-data')])
    with open('/dev/ttyS0', 'w', buffering=1) as serial:
        protocol = Protocol(request, serial)
        try:
            write_policy()
            run(['/usr/bin/systemd-run', '--unit=puni-offline-install', '--quiet', '--service-type=exec', '--wait', '--pipe', '--collect',
                 '--property=MemoryMax=512M', '--property=MemorySwapMax=0', '--property=TasksMax=64', '--property=RuntimeMaxSec=180',
                 '--property=LimitFSIZE=134217728', '--property=LimitCORE=0', '--property=LimitNOFILE=64', '--property=Restart=no',
                 '--property=KillMode=control-group', '--property=TimeoutStopSec=5', '/usr/bin/python3', str(SOURCE), str(REQUEST), '--install'], timeout=190)
            run(['/usr/bin/systemctl', 'daemon-reload'])
            require_configured({name: pin[:2] for name, pin in PACKAGES.items()}, run)
            run(['/usr/bin/systemctl', 'start', 'containerd.service', 'docker.socket', 'docker.service'], timeout=125)
            require_readiness()
            measure(request, protocol, shutdown=request_poweroff)
        except Exception:
            protocol.emit('failure', code='guest-baseline-refused')
            raise


def main(arguments):
    # Proof: bypass arguments failed `bounded primitive refuses arguments` (watched guard fault).
    require(len(arguments) in (1, 2) and (len(arguments) == 1 or arguments[1] == '--install'), 'arguments')
    request = read_request(arguments[0])
    if len(arguments) == 2:
        install_packages(request)
    else:
        bootstrap(request)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as failure:
        print('Puni guest bootstrap refused: ' + (str(failure) if isinstance(failure, Refusal) else type(failure).__name__), file=sys.stderr)
        sys.exit(1)
