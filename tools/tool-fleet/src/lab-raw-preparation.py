import ctypes
import errno
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time

RAW_BYTES = 8 * 1024**3
STAGING_BYTES = 10 * 1024**3
RESERVE_BYTES = 160 * 1024**2
RECORD_BYTES = 65536
CAPS = {'memory.max': '1073741824', 'memory.swap.max': '0',
        'pids.max': '128', 'cpu.max': '100000 100000'}
SERVICE_LIMITS = {'RuntimeMaxUSec': '15min', 'TimeoutStopUSec': '5s', 'LimitAS': '8589934592',
                  'LimitFSIZE': '8589934592', 'KillMode': 'control-group',
                  'NoNewPrivileges': 'yes', 'UMask': '0077', 'SendSIGKILL': 'yes'}
COUNTERS = ('memory.current', 'memory.peak', 'memory.events', 'cpu.stat', 'pids.current', 'pids.events')
PROPERTIES = ('LoadState', 'ActiveState', 'SubState', 'MainPID', 'InvocationID',
              'ControlGroup', 'Result', 'ExecMainStatus')
HELPER = Path(__file__).resolve()


class PreparationRefusal(Exception):
    """Public fixed category; subprocess diagnostics and private paths are never attached."""


def require(predicate, category):
    if not predicate:
        raise PreparationRefusal(category)


def encode_json(value):
    payload = json.dumps(value, separators=(',', ':'), sort_keys=True).encode()
    require(len(payload) < RECORD_BYTES, 'raw-record-bound')
    return payload


def digest_json(value):
    return hashlib.sha256(encode_json(value)).hexdigest()


def identity(observation):
    return [observation.st_dev, observation.st_ino, observation.st_uid,
            stat.S_IMODE(observation.st_mode)]


def stable_identity(observation):
    return identity(observation) + [observation.st_size, observation.st_nlink,
                                     observation.st_mtime_ns, observation.st_ctime_ns]


def open_private(path, directory=False):
    """Open trusted owner-only state without accepting symlinks or unreadable modes."""
    try:
        before = os.lstat(path)
        # Proof: files boundary uses actual absent/unreadable/mode/symlink faults.
        require(bool(before.st_mode & 0o400), 'raw-state-unreadable')
        require((stat.S_ISDIR(before.st_mode) if directory else stat.S_ISREG(before.st_mode))
                and before.st_uid == os.geteuid()
                and stat.S_IMODE(before.st_mode) == (0o700 if directory else 0o600)
                and (directory or before.st_nlink == 1), 'raw-state-unsafe')
        descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
                             | (os.O_DIRECTORY if directory else os.O_NONBLOCK))
        if stable_identity(before) != stable_identity(os.fstat(descriptor)):
            os.close(descriptor)
            raise PreparationRefusal('raw-state-changed')
        return descriptor
    except OSError as failure:
        if failure.errno == errno.ENOENT:
            raise PreparationRefusal('raw-state-absent') from None
        if failure.errno in (errno.EACCES, errno.EPERM):
            raise PreparationRefusal('raw-state-unreadable') from None
        raise PreparationRefusal('raw-state-unsafe') from None


def read_fd(descriptor, limit=RECORD_BYTES):
    payload = bytearray()
    while True:
        chunk = os.read(descriptor, min(4096, limit + 1 - len(payload)))
        if not chunk:
            return bytes(payload)
        payload.extend(chunk)
        require(len(payload) <= limit, 'raw-record-bound')


def read_json(path, expected_digest=None):
    descriptor = open_private(path)
    try:
        before = os.fstat(descriptor)
        payload = read_fd(descriptor)
        require(stable_identity(before) == stable_identity(os.fstat(descriptor)), 'raw-state-changed')
        if expected_digest is not None:
            require(hashlib.sha256(payload).hexdigest() == expected_digest, 'raw-request-digest')
        return json.loads(payload)
    finally:
        os.close(descriptor)


def check_request(request):
    """Fixed policy has no caller-overridable resource limits or adoption path."""
    fields = {'schemaVersion', 'root', 'state', 'nonce', 'pins', 'image', 'imageBytes', 'imageVirtualBytes'}
    # Proof: request boundary injects foreign keys, traversal and raw-size overrides.
    require(isinstance(request, dict) and set(request) == fields, 'raw-request-invalid')
    require(request['schemaVersion'] == 1 and type(request['schemaVersion']) is int
            and isinstance(request['root'], str) and Path(request['root']).is_absolute()
            and os.path.normpath(request['root']) == request['root']
            and request['state'] == request['root'] + '/.puni/fleet-labs/observability-baseline'
            and isinstance(request['nonce'], str) and re.fullmatch('[0-9a-f]{32}', request['nonce'])
            and isinstance(request['pins'], list) and 1 <= len(request['pins']) <= 512
            and isinstance(request['image'], str)
            and os.path.dirname(request['image']) == request['state'] + '/inputs'
            and re.fullmatch('[a-zA-Z0-9._-]+[.]img', os.path.basename(request['image']))
            and type(request['imageBytes']) is int and 0 < request['imageBytes'] <= 1024**3
            and type(request['imageVirtualBytes']) is int and 0 < request['imageVirtualBytes'] < RAW_BYTES,
            'raw-request-invalid')
    paths = set()
    for pin in request['pins']:
        require(isinstance(pin, dict) and set(pin) == {'path', 'sha256', 'bytes', 'uid', 'mode'}
                and isinstance(pin['path'], str) and Path(pin['path']).is_absolute()
                and os.path.normpath(pin['path']) == pin['path'] and pin['path'] not in paths
                and isinstance(pin['sha256'], str) and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
                and type(pin['bytes']) is int and 0 < pin['bytes'] <= 1024**3
                and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
                and type(pin['mode']) is int and 0 <= pin['mode'] <= 0o755
                and not pin['mode'] & 0o022, 'raw-request-invalid')
        paths.add(pin['path'])


def verify_pin(pin):
    """Bind actual content and original metadata; retain native root ownership on system inputs."""
    descriptor = os.open(pin['path'], os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                and before.st_uid == pin['uid'] and stat.S_IMODE(before.st_mode) == pin['mode']
                and before.st_size == pin['bytes'], 'raw-pin-changed')
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024**2)
            if not chunk:
                break
            digest.update(chunk)
        # Proof: pins boundary substitutes equal-length contents in the production verifier.
        require(digest.hexdigest() == pin['sha256']
                and stable_identity(before) == stable_identity(os.fstat(descriptor))
                and stable_identity(before) == stable_identity(os.lstat(pin['path'])), 'raw-pin-changed')
        return identity(before)
    finally:
        os.close(descriptor)


def check_capacity(memory, free, allocated, initial, after_allocation):
    # Proof: capacity boundary covers exact/one-byte-short initial/live floors and full allocated reservation.
    require(all(type(quantity) is int and quantity >= 0 for quantity in (memory, free, allocated)),
            'raw-capacity-malformed')
    require(memory >= (3623878656 if initial else 2147483648), 'raw-memory-floor')
    require(free >= (50 if initial else 40) * 1024**3, 'raw-disk-floor')
    require(allocated + RESERVE_BYTES + (0 if after_allocation else RAW_BYTES) <= STAGING_BYTES,
            'raw-staging-bound')


def read_text(path, limit=RECORD_BYTES):
    with open(path, 'rb', buffering=0) as stream:
        payload = stream.read(limit + 1)
    require(len(payload) <= limit, 'raw-record-bound')
    return payload.decode('utf8')


def allocated_bytes(state):
    """Account actual blocks once per inode; refuse unknown or unreadable traversal state."""
    # Proof: traversal-root fault bypasses this boundary; actual missing/unreadable-root diagnostics are lost.
    root_fd = open_private(state, directory=True)
    def refuse_traversal(failure):
        if failure.errno in (errno.EACCES, errno.EPERM):
            raise PreparationRefusal('raw-state-unreadable') from None
        if failure.errno == errno.ENOENT:
            raise PreparationRefusal('raw-staging-changed') from None
        raise PreparationRefusal('raw-staging-unreadable') from None
    total = 0
    seen = set()
    entries = 0
    try:
        # Proof: traversal-errors fault removes onerror; chmod000 hides the retained 1MiB file and the negative fails.
        for directory, names, files in os.walk(state, followlinks=False, onerror=refuse_traversal):
            for name in ['.'] + names + files:
                try:
                    observation = os.lstat(os.path.join(directory, name))
                except OSError as failure:
                    refuse_traversal(failure)
                entries += 1
                require(entries <= 20000, 'raw-staging-traversal-bound')
                inode = (observation.st_dev, observation.st_ino)
                if inode not in seen:
                    total += observation.st_blocks * 512
                    seen.add(inode)
        try:
            named_root = os.lstat(state)
        except OSError as failure:
            refuse_traversal(failure)
        # Proof: traversal-identity fault accepts the replaced root held under its original descriptor.
        require(identity(os.fstat(root_fd)) == identity(named_root), 'raw-staging-changed')
        return total
    finally:
        os.close(root_fd)


def observe_capacity(state, initial=False, after_allocation=False):
    # Proof: restoring exact single spaces fails the production capacity-parser test on native aligned spaces and tabs.
    memory = re.findall(r'^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$', read_text('/proc/meminfo'), re.M)
    require(len(memory) == 1, 'raw-capacity-malformed')
    filesystem = os.statvfs(state)
    allocated = allocated_bytes(state)
    free = filesystem.f_bavail * filesystem.f_frsize
    available = int(memory[0]) * 1024
    check_capacity(available, free, allocated, initial, after_allocation)
    return {'availableMemoryBytes': available, 'freeBytes': free, 'allocatedBytes': allocated,
            'observedNs': time.time_ns()}


def check_caps(caps):
    # Proof: caps boundary substitutes max independently in every effective controller value.
    require(caps == CAPS, 'raw-native-caps')


def process_start(pid):
    fields = read_text(f'/proc/{pid}/stat', 4096).rsplit(')', 1)[1].split()
    require(len(fields) >= 20 and fields[19].isdigit(), 'raw-process-invalid')
    return fields[19]


def process_cgroup(pid):
    lines = read_text(f'/proc/{pid}/cgroup', 4096).splitlines()
    require(len(lines) == 1 and lines[0].startswith('0::/'), 'raw-cgroup-invalid')
    cgroup = lines[0][3:]
    require('..' not in cgroup.split('/') and '//' not in cgroup, 'raw-cgroup-invalid')
    return cgroup


def read_caps(cgroup):
    return {name: read_text('/sys/fs/cgroup' + cgroup + '/' + name, 1024).strip() for name in CAPS}


def client_limits():
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_FSIZE, (RECORD_BYTES,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def clean_environment(state=None):
    environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'PYTHONNOUSERSITE': '1'}
    if state is not None:
        environment['HOME'] = state
        environment['LD_LIBRARY_PATH'] = state + '/tools-root/usr/lib/x86_64-linux-gnu'
        environment['QEMU_MODULE_DIR'] = state + '/tools-root/usr/lib/x86_64-linux-gnu/qemu'
    for name in ('XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'):
        if name in os.environ:
            environment[name] = os.environ[name]
    return environment


def run_bounded(arguments, seconds, environment=None, descriptors=(), allowed=(0,), converter=False, monitor=None):
    """Read finite binary pipes without communicate; kill and reap on every interrupted capture."""
    process = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, env=environment or clean_environment(),
                               pass_fds=descriptors, preexec_fn=None if converter else client_limits)
    process.stdin.close()
    selector = selectors.DefaultSelector()
    output = bytearray()
    errors = bytearray()
    selector.register(process.stdout, selectors.EVENT_READ, output)
    selector.register(process.stderr, selectors.EVENT_READ, errors)
    deadline = time.monotonic() + seconds
    try:
        while selector.get_map():
            # Proof: bounded boundary runs actual oversized output and hanging/failing child controls.
            require(time.monotonic() < deadline, 'raw-child-timeout')
            if monitor is not None:
                monitor()
            for event, _ in selector.select(min(.2, max(0, deadline - time.monotonic()))):
                chunk = os.read(event.fd, 4096)
                if not chunk:
                    selector.unregister(event.fileobj)
                else:
                    event.data.extend(chunk)
                    require(len(event.data) <= RECORD_BYTES, 'raw-child-output-bound')
        process.wait(timeout=max(.01, deadline - time.monotonic()))
        require(process.returncode in allowed, 'raw-child-failed')
        return bytes(output)
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
        selector.close()


def observe_unit(unit):
    payload = run_bounded(['/usr/bin/systemctl', '--user', 'show', unit,
                           '--property=' + ','.join(PROPERTIES)], 3, allowed=(0, 4))
    native = {}
    for line in payload.decode().splitlines():
        name, separator, value = line.partition('=')
        require(separator and name in PROPERTIES and name not in native, 'raw-unit-malformed')
        native[name] = value
    require(set(native) == set(PROPERTIES), 'raw-unit-malformed')
    return native


def check_service_limits(limits):
    # Proof: service boundary replaces each effective native service property with unknown.
    require(limits == SERVICE_LIMITS, 'raw-service-limits')


def observe_service_limits(unit):
    payload = run_bounded(['/usr/bin/systemctl', '--user', 'show', unit,
                           '--property=' + ','.join(SERVICE_LIMITS)], 3)
    limits = {}
    for line in payload.decode().splitlines():
        name, separator, value = line.partition('=')
        require(separator and name not in limits, 'raw-service-limits')
        limits[name] = value
    check_service_limits(limits)


def observe_active(unit, pid):
    native = observe_unit(unit)
    cgroup = process_cgroup(pid)
    # Proof: native boundary substitutes each observed unit fact; native-unit guard removal accepts it.
    require(native['LoadState'] == 'loaded' and native['ActiveState'] == 'active'
            and native['SubState'] == 'running' and native['MainPID'] == str(pid)
            and re.fullmatch('[0-9a-f]{32}', native['InvocationID'])
            and native['ControlGroup'] == cgroup and cgroup.endswith('/' + unit), 'raw-unit-binding')
    caps = read_caps(cgroup)
    check_caps(caps)
    observe_service_limits(unit)
    return {'pid': pid, 'start': process_start(pid), 'unit': unit,
            'invocation': native['InvocationID'], 'cgroup': cgroup, 'caps': caps}


def check_ack(ack, binding, request_digest):
    # Proof: ack boundary rejects missing acknowledgement and an independently foreign request digest.
    require(ack == {'bindingDigest': digest_json(binding), 'request': request_digest}, 'raw-ack-invalid')


def parse_pairs(text):
    pairs = {}
    for line in text.splitlines():
        fields = line.split()
        require(len(fields) == 2 and fields[1].isdigit() and fields[0] not in pairs, 'raw-counter-invalid')
        pairs[fields[0]] = int(fields[1])
    return pairs


def check_counter(record, binding, ready_ns, now):
    """Counter interval ends while original worker lives; terminal cleanup is observed separately."""
    # Proof: counter boundary injects foreign/stale/future/partial/OOM/caps/content failures.
    require(isinstance(record, dict) and set(record) == {'binding', 'startedNs', 'finishedNs', 'caps',
                                                       'counters', 'converted', 'compared'}
            and record['binding'] == binding and record['converted'] is True and record['compared'] is True
            and type(record['startedNs']) is int and type(record['finishedNs']) is int
            and ready_ns <= record['startedNs'] <= record['finishedNs'] <= now
            and now - record['finishedNs'] <= 10 * 10**9 and record['caps'] == CAPS
            and isinstance(record['counters'], dict) and set(record['counters']) == set(COUNTERS),
            'raw-counter-invalid')
    counters = record['counters']
    require(all(isinstance(value, str) and len(value) < 4096 for value in counters.values()), 'raw-counter-invalid')
    require(all(counters[name].isdigit() for name in ('memory.current', 'memory.peak', 'pids.current')),
            'raw-counter-invalid')
    memory = parse_pairs(counters['memory.events'])
    cpu = parse_pairs(counters['cpu.stat'])
    pids = parse_pairs(counters['pids.events'])
    require(all(name in memory and memory[name] == 0 for name in ('oom', 'oom_kill'))
            and 'usage_usec' in cpu and 'user_usec' in cpu and 'system_usec' in cpu
            and pids.get('max') == 0, 'raw-counter-invalid')


def check_terminal(native, events, client_exit):
    # Proof: terminal boundary preserves absent native fields and rejects live/failed-client/populated groups.
    require(client_exit == 0 and native['MainPID'] == '0'
            and native['ActiveState'] == 'inactive' and native['SubState'] == 'dead'
            and native['LoadState'] in ('loaded', 'not-found')
            and native['Result'] in ('', 'success') and native['ExecMainStatus'] in ('', '0')
            and (events is None or parse_pairs(events).get('populated') == 0), 'raw-terminal-invalid')


def persist(directory, name, record, directory_fd=None):
    """Exclusive coordinator-only publication, bounded by RLIMIT_FSIZE and fsynced before ACK."""
    payload = encode_json(record)
    owns_directory = directory_fd is None
    if owns_directory:
        directory_fd = open_private(directory, directory=True)
    try:
        # Proof: files boundary substitutes the directory while retaining its original FD; publication-directory fault loses refusal.
        require(identity(os.fstat(directory_fd)) == identity(os.lstat(directory)), 'raw-state-changed')
        try:
            descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL
                                 | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
        except FileExistsError:
            raise PreparationRefusal('raw-state-occupied') from None
        try:
            offset = 0
            while offset < len(payload):
                written = os.write(descriptor, payload[offset:])
                require(written > 0, 'raw-persistence-failed')
                offset += written
            # Proof: persistence boundary breaks regular-file fsync; durable-fsync omission accepts the unsynced record.
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        os.fsync(directory_fd)
    finally:
        if owns_directory:
            os.close(directory_fd)


def check_creator(binding, directory, directory_fd):
    """Independently join the live original worker FD to the original parent directory."""
    try:
        raw_path = directory + '/disk.raw'
        worker_descriptor = f"/proc/{binding['pid']}/fd/{binding['rawFd']}"
        opened = os.stat(worker_descriptor)
        named = os.lstat(raw_path)
        # Proof: creator boundary substitutes directory FD, process start and pathname inode.
        require(process_start(binding['pid']) == binding['start']
                and identity(os.fstat(directory_fd)) == binding['creator']
                and identity(os.lstat(directory)) == binding['creator']
                and identity(opened) == binding['raw'] == identity(named)
                and stat.S_ISREG(opened.st_mode) and opened.st_nlink == 1
                and stat.S_IMODE(opened.st_mode) == 0o600 and opened.st_uid == os.geteuid()
                and stable_identity(opened) == stable_identity(named), 'raw-creator-invalid')
    except (FileNotFoundError, KeyError, ProcessLookupError):
        raise PreparationRefusal('raw-creator-invalid') from None


def confine_writer(raw_fd, executable_fd):
    """Linux Landlock ABI>=3 grants WRITE/TRUNCATE on one file and EXECUTE on one tool.

    No directory write, create, rename or remove is granted. Preopened stdout/stderr
    must be pipes; evidence is bounded and fsynced by the coordinator, not this writer.
    """
    libc = ctypes.CDLL(None, use_errno=True)
    syscall = libc.syscall
    syscall.restype = ctypes.c_long
    require(os.uname().machine == 'x86_64', 'raw-sandbox-unsupported')
    abi = syscall(444, 0, 0, 1)
    require(abi >= 3, 'raw-sandbox-unsupported')
    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]
    class PathBeneath(ctypes.Structure):
        _pack_ = 1
        _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int32)]
    # Include all ABI3 file mutation rights and execution. READ_FILE/READ_DIR stay readable.
    handled = (1 << 15) - 1 - (1 << 2) - (1 << 3)
    ruleset = Ruleset(handled)
    ruleset_fd = syscall(444, ctypes.byref(ruleset), ctypes.sizeof(ruleset), 0)
    require(ruleset_fd >= 0, 'raw-sandbox-refused')
    try:
        loader_fd = os.open('/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', os.O_PATH | os.O_CLOEXEC)
        grants = ((raw_fd, (1 << 1) | (1 << 14)), (executable_fd, 1), (loader_fd, 1))
        for descriptor, rights in grants:
            path_fd = os.open(f'/proc/self/fd/{descriptor}', os.O_PATH | os.O_CLOEXEC)
            try:
                rule = PathBeneath(rights, path_fd)
                require(syscall(445, ruleset_fd, 1, ctypes.byref(rule), 0) == 0, 'raw-sandbox-refused')
            finally:
                os.close(path_fd)
        os.close(loader_fd)
        require(libc.prctl(38, 1, 0, 0, 0) == 0, 'raw-sandbox-refused')
        # Proof: real sandbox boundary attempts unrelated existing-file and new-file writes.
        require(syscall(446, ruleset_fd, 0) == 0, 'raw-sandbox-refused')
    finally:
        os.close(ruleset_fd)


def receive_frame(descriptor, seconds=10):
    selector = selectors.DefaultSelector()
    selector.register(descriptor, selectors.EVENT_READ)
    payload = bytearray()
    deadline = time.monotonic() + seconds
    try:
        while True:
            require(time.monotonic() < deadline, 'raw-ack-missing')
            if not selector.select(max(0, deadline-time.monotonic())):
                raise PreparationRefusal('raw-ack-missing')
            chunk = os.read(descriptor, 1)
            require(bool(chunk), 'raw-ack-missing')
            if chunk == b'\n':
                return json.loads(payload)
            payload.extend(chunk)
            require(len(payload) < RECORD_BYTES, 'raw-record-bound')
    finally:
        selector.close()


def receive_ack(descriptor, binding, request_digest):
    check_ack(receive_frame(descriptor), binding, request_digest)


def send_frame(descriptor, frame):
    payload = encode_json(frame) + b'\n'
    offset = 0
    while offset < len(payload):
        written = os.write(descriptor, payload[offset:])
        require(written > 0, 'raw-protocol-failed')
        offset += written


def verify_inputs(request):
    """Rehash reviewed source/input/tool closure; metadata receipts confer no native authority."""
    pins = {pin['path']: pin for pin in request['pins']}
    root = request['root']
    state = request['state']
    require(str(HELPER) == root + '/tools/tool-fleet/src/lab-raw-preparation.py', 'raw-source-binding')
    required = [str(HELPER), str(HELPER.with_name('lab-raw-allocation.py')),
                str(HELPER.with_suffix('.ts')), str(HELPER.with_name('lab-raw-preparation-cli.ts')),
                root + '/infra/local/qemu-lab.lock.json', request['image'],
                state + '/tools-root/usr/bin/qemu-img', '/usr/bin/python3.12',
                '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']
    require(all(path in pins for path in required), 'raw-source-pins-missing')
    require(os.path.realpath('/usr/bin/python3') == '/usr/bin/python3.12', 'raw-python-binding')
    for pin in request['pins']:
        verify_pin(pin)
    image_pin = pins[request['image']]
    require(image_pin['bytes'] == request['imageBytes'] and image_pin['uid'] == os.geteuid()
            and image_pin['mode'] == 0o400, 'raw-image-binding')
    tool = state + '/tools-root/usr/bin/qemu-img'
    environment = clean_environment(state)
    with open(root + '/infra/local/qemu-lab.lock.json', 'rb') as lock_stream:
        lock = json.load(lock_stream)
    version = run_bounded([tool, '--version'], 3, environment).decode().splitlines()
    require(bool(version) and version[0] == lock['qemu']['imageToolVersionLine'], 'raw-tool-version')
    loader = '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
    closure = run_bounded([loader, '--list', tool], 3, environment).decode()
    libraries = re.findall(r'(?:=>\s+|^\s*)(/[^\s()]+)', closure, re.M)
    require(bool(libraries) and 'not found' not in closure, 'raw-tool-closure')
    for library in libraries:
        require(os.path.realpath(library) in pins, 'raw-tool-closure')
    module_directory = state + '/tools-root/usr/lib/x86_64-linux-gnu/qemu'
    require(os.path.isdir(module_directory), 'raw-tool-closure')
    for directory, names, files in os.walk(module_directory, followlinks=False):
        require(not any(os.path.islink(directory + '/' + name) for name in names), 'raw-tool-closure')
        for name in files:
            if name.startswith(('block-', 'crypto-')):
                require(os.path.realpath(directory + '/' + name) in pins, 'raw-tool-closure')
    inspection = json.loads(run_bounded([tool, 'info', '--output=json', '--backing-chain',
                                         '-f', 'qcow2', request['image']], 15, environment))
    require(isinstance(inspection, list) and len(inspection) == 1, 'raw-image-geometry')
    image = inspection[0]
    require(image.get('format') == 'qcow2' and image.get('virtual-size') == request['imageVirtualBytes']
            and image.get('dirty-flag') is False and 'backing-filename' not in image
            and 'full-backing-filename' not in image and 'encrypted' not in image
            and image.get('format-specific', {}).get('data', {}).get('corrupt') is False,
            'raw-image-geometry')
    return digest_json({path: pin['sha256'] for path, pin in pins.items()})


def load_inspector():
    spec = importlib.util.spec_from_file_location('raw_allocation', HELPER.with_name('lab-raw-allocation.py'))
    require(spec is not None and spec.loader is not None, 'raw-inspector-unavailable')
    inspector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inspector)
    return inspector


def worker_limits():
    resource.setrlimit(resource.RLIMIT_AS, (RAW_BYTES,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (RAW_BYTES,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (900, 900))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def convert_image(tool_fd, image_fd, raw_fd, environment, monitor):
    """Popen pass_fds preserves original artifacts without pre-exec descriptor remapping."""
    tool = f'/proc/self/fd/{tool_fd}'
    source = f'/proc/self/fd/{image_fd}'
    target = f'/proc/self/fd/{raw_fd}'
    geometry = os.fstat(raw_fd).st_size
    run_bounded([tool, 'convert', '-q', '-n', '-S', '0', '-m', '1', '-f', 'qcow2', '-O', 'raw',
                 source, target], 850, environment, (tool_fd, image_fd, raw_fd), converter=True,
                monitor=monitor)
    require(os.fstat(raw_fd).st_size == geometry, 'raw-target-growth')
    comparison_fd = os.open(target, os.O_RDONLY | os.O_CLOEXEC)
    try:
        require(identity(os.fstat(comparison_fd)) == identity(os.fstat(raw_fd)), 'raw-input-fd-changed')
        run_bounded([tool, 'compare', '-q', '-f', 'qcow2', '-F', 'raw', source,
                     f'/proc/self/fd/{comparison_fd}'], 850,
                    environment, (tool_fd, image_fd, comparison_fd), converter=True, monitor=monitor)
    finally:
        os.close(comparison_fd)


def acquire_staging(state):
    """Own the original private staging directory nonblockingly until its read-only FD closes."""
    descriptor = open_private(state, directory=True)
    acquired = False
    try:
        try:
            # Proof: staging-lock bypass lets a second production nonce reach readiness against the same future charge.
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise PreparationRefusal('raw-staging-occupied') from None
        # Proof: staging-lock fixture replaces the path during acquisition; the original locked FD refuses adoption.
        require(identity(os.fstat(descriptor)) == identity(os.lstat(state)), 'raw-staging-changed')
        acquired = True
        return descriptor
    finally:
        if not acquired:
            os.close(descriptor)


def worker(request, request_digest):
    worker_limits()
    require(all(stat.S_ISFIFO(os.fstat(descriptor).st_mode) for descriptor in (0, 1, 2)), 'raw-worker-pipes')
    staging_fd = acquire_staging(request['state'])
    try:
        produce_raw(request, request_digest, staging_fd)
    finally:
        # Proof: staging-lock-release-omission prevents same-process reacquisition after success/refusal.
        os.close(staging_fd)


def produce_raw(request, request_digest, staging_fd):
    state = request['state']
    unit = 'puni-raw-' + request['nonce'] + '.service'
    source = verify_inputs(request)
    observe_capacity(state)
    native = observe_active(unit, os.getpid())
    require(os.environ.get('INVOCATION_ID') == native['invocation'], 'raw-worker-invocation')
    require(identity(os.fstat(staging_fd)) == identity(os.lstat(state)), 'raw-staging-changed')
    directory = state + '/raw-' + request['nonce']
    directory_fd = open_private(directory, directory=True)
    raw_fd = os.open('disk.raw', os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW,
                     0o600, dir_fd=directory_fd)
    image_fd = os.open(request['image'], os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    tool_fd = os.open(state + '/tools-root/usr/bin/qemu-img', os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    inspector = load_inspector()
    try:
        binding = {name: native[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')}
        binding.update({'nonce': request['nonce'], 'creator': identity(os.fstat(directory_fd)),
                        'raw': identity(os.fstat(raw_fd)), 'rawFd': raw_fd, 'imageFd': image_fd, 'toolFd': tool_fd,
                        'python': stable_identity(os.stat('/proc/self/exe')),
                        'image': stable_identity(os.fstat(image_fd)),
                        'tool': stable_identity(os.fstat(tool_fd)), 'source': source, 'request': request_digest})
        ready_ns = time.time_ns()
        send_frame(1, {'phase': 'ready', 'binding': binding, 'observedNs': ready_ns})
        receive_ack(0, binding, request_digest)
        # Reobserve original native/source/input facts at the mutation boundary after parent admission.
        # Proof: mutation source/native fixtures reach intercepted allocation when this original binding join is disabled.
        require(verify_inputs(request) == source and observe_active(unit, os.getpid()) == native,
                'raw-mutation-binding')
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        # Proof: mutation staging moves the original children into a replacement root; the held lock cannot authorize it.
        require(identity(os.fstat(staging_fd)) == identity(os.lstat(state)), 'raw-staging-changed')
        observe_capacity(state)
        # No extra inherited write-capable regular descriptors may bypass the one-file Landlock policy.
        allowed_fds = {0, 1, 2, staging_fd, directory_fd, raw_fd, image_fd, tool_fd}
        proc_fd = os.open('/proc/self/fd', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            for inherited_fd in map(int, os.listdir(proc_fd)):
                if inherited_fd in allowed_fds | {proc_fd}:
                    continue
                try:
                    os.fstat(inherited_fd)
                except OSError as failure:
                    # listdir duplicates its directory FD transiently; that one descriptor is closed before return.
                    require(failure.errno == errno.EBADF, 'raw-unexpected-fd')
                    continue
                # Proof: mutation-descriptor fault admits the injected unexpected live descriptor.
                raise PreparationRefusal('raw-unexpected-fd')
        finally:
            os.close(proc_fd)
        confine_writer(raw_fd, tool_fd)
        os.posix_fallocate(raw_fd, 0, RAW_BYTES)
        os.fsync(raw_fd)
        before = inspector.inspect_file(directory + '/disk.raw', RAW_BYTES)
        observe_capacity(state, after_allocation=True)
        next_observation = 0
        def monitor():
            nonlocal next_observation
            if time.monotonic() >= next_observation:
                observe_capacity(state, after_allocation=True)
                require(read_caps(binding['cgroup']) == native['caps'], 'raw-native-caps')
                next_observation = time.monotonic() + 1
        started_ns = time.time_ns()
        convert_image(tool_fd, image_fd, raw_fd, clean_environment(state), monitor)
        os.fsync(raw_fd)
        after = inspector.inspect_file(directory + '/disk.raw', RAW_BYTES)
        check_creator(binding, directory, directory_fd)
        require(identity(os.fstat(raw_fd)) == binding['raw']
                and stable_identity(os.fstat(image_fd)) == binding['image']
                and stable_identity(os.fstat(tool_fd)) == binding['tool'], 'raw-input-fd-changed')
        caps = read_caps(binding['cgroup'])
        counters = {name: read_text('/sys/fs/cgroup' + binding['cgroup'] + '/' + name, 4096).strip()
                    for name in COUNTERS}
        record = {'binding': binding, 'startedNs': started_ns, 'finishedNs': time.time_ns(),
                  'caps': caps, 'counters': counters, 'converted': True, 'compared': True}
        check_counter(record, binding, ready_ns, time.time_ns())
        send_frame(1, {'phase': 'complete', 'record': record, 'allocationBefore': before, 'allocationAfter': after})
        # Proof: staging-lock-early-release permits competition here before the original durability ACK.
        acknowledgement = receive_frame(0)
        require(acknowledgement == {'durableDigest': digest_json(record)}, 'raw-durability-ack')
    finally:
        for descriptor in (raw_fd, image_fd, tool_fd, directory_fd):
            os.close(descriptor)


def service_arguments(request, request_path, request_digest):
    """Only this fixed service profile can launch the internal worker."""
    unit = 'puni-raw-' + request['nonce'] + '.service'
    properties = ['MemoryMax=1073741824', 'MemorySwapMax=0', 'CPUQuota=100%',
                  'CPUQuotaPeriodSec=100ms', 'TasksMax=128', 'RuntimeMaxSec=900s',
                  'TimeoutStopSec=5s', 'KillMode=control-group', 'SendSIGKILL=yes',
                  'LimitFSIZE=8589934592', 'LimitAS=8589934592', 'LimitNOFILE=64',
                  'LimitCORE=0', 'NoNewPrivileges=yes', 'UMask=0077', 'Restart=no']
    arguments = ['/usr/bin/systemd-run', '--user', '--quiet', '--pipe', '--wait', '--collect',
                 '--service-type=exec', '--unit=' + unit]
    arguments.extend('--property=' + prop for prop in properties)
    arguments.extend(['/usr/bin/python3', '-I', '-B', str(HELPER), '--worker', request_path, request_digest])
    return arguments


def launch_service(request, request_path, request_digest):
    return subprocess.Popen(service_arguments(request, request_path, request_digest),
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=clean_environment(), preexec_fn=client_limits)


def check_input_descriptors(binding, request):
    # Proof: mutation-python substitutes the interpreter inode before intercepted allocation.
    require(stable_identity(os.stat(f"/proc/{binding['pid']}/exe")) == binding['python']
            == stable_identity(os.stat('/usr/bin/python3.12')), 'raw-python-binding')
    for name, path in (('image', request['image']), ('tool', request['state'] + '/tools-root/usr/bin/qemu-img')):
        descriptor_path = f"/proc/{binding['pid']}/fd/{binding[name + 'Fd']}"
        # Proof: mutation-input substitutes a held input; disabling this join reaches intercepted allocation.
        require(stable_identity(os.stat(descriptor_path)) == binding[name]
                == stable_identity(os.lstat(path)), 'raw-input-fd-changed')


def check_ready(frame, request, request_digest, source, directory, directory_fd):
    require(isinstance(frame, dict) and set(frame) == {'phase', 'binding', 'observedNs'}
            and frame['phase'] == 'ready' and type(frame['observedNs']) is int
            and 0 <= time.time_ns() - frame['observedNs'] <= 10 * 10**9, 'raw-ready-invalid')
    binding = frame['binding']
    require(isinstance(binding, dict) and set(binding) == {'pid', 'start', 'unit', 'invocation', 'cgroup',
            'nonce', 'creator', 'raw', 'rawFd', 'python', 'image', 'tool', 'imageFd', 'toolFd', 'source', 'request'}
            and binding['nonce'] == request['nonce'] and binding['request'] == request_digest
            and binding['source'] == source and type(binding['pid']) is int and binding['pid'] > 0
            and all(type(binding[name]) is int and 3 <= binding[name] < 64
                    for name in ('rawFd', 'imageFd', 'toolFd'))
            and binding['unit'] == 'puni-raw-' + request['nonce'] + '.service', 'raw-ready-invalid')
    native = observe_active(binding['unit'], binding['pid'])
    require(all(binding[name] == native[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')),
            'raw-ready-invalid')
    check_creator(binding, directory, directory_fd)
    check_input_descriptors(binding, request)
    require(verify_inputs(request) == source, 'raw-source-binding')
    observe_capacity(request['state'])
    return binding


def group_events(cgroup):
    try:
        return read_text('/sys/fs/cgroup' + cgroup + '/cgroup.events', 4096)
    except FileNotFoundError:
        # An absent original group is an explicitly accepted terminal cleanup outcome.
        return None


def stop_owned(binding):
    """Stop only the still-matching original invocation; unknown cleanup remains a refusal."""
    native = observe_unit(binding['unit'])
    events = group_events(binding['cgroup'])
    if native['LoadState'] == 'not-found':
        require(events is None or parse_pairs(events).get('populated') == 0, 'raw-cleanup-uncertain')
        return
    # Proof: native cleanup fixtures inject a foreign invocation/start; removing either join would signal it.
    require(native['InvocationID'] == binding['invocation']
            and native['ControlGroup'] in ('', binding['cgroup']), 'raw-cleanup-uncertain')
    if native['MainPID'] != '0':
        require(native['MainPID'] == str(binding['pid'])
                and process_start(binding['pid']) == binding['start'], 'raw-cleanup-uncertain')
    run_bounded(['/usr/bin/systemctl', '--user', 'stop', binding['unit']], 5)
    require(group_events(binding['cgroup']) in (None, 'populated 0\nfrozen 0\n'), 'raw-cleanup-uncertain')


def coordinator(request, request_path, request_digest):
    """Own one exclusive attempt, independently ACK admission and fsync live-worker records."""
    source = verify_inputs(request)
    state_fd = open_private(request['state'], directory=True)
    os.close(state_fd)
    initial = observe_capacity(request['state'], initial=True)
    unit = 'puni-raw-' + request['nonce'] + '.service'
    absent = observe_unit(unit)
    require(absent['LoadState'] == 'not-found' and absent['MainPID'] == '0'
            and absent['InvocationID'] == '' and absent['ControlGroup'] == '', 'raw-unit-occupied')
    directory = request['state'] + '/raw-' + request['nonce']
    try:
        os.mkdir(directory, 0o700)
    except FileExistsError:
        raise PreparationRefusal('raw-state-occupied') from None
    state_sync_fd = open_private(request['state'], directory=True)
    try:
        os.fsync(state_sync_fd)
    finally:
        os.close(state_sync_fd)
    directory_fd = open_private(directory, directory=True)
    def publish(name, record):
        persist(directory, name, record, directory_fd=directory_fd)
    publish('request-binding.json', {'requestDigest': request_digest, 'sourceDigest': source,
                                               'initial': initial, 'unitBefore': absent})
    client = launch_service(request, request_path, request_digest)
    selector = selectors.DefaultSelector()
    selector.register(client.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(client.stderr, selectors.EVENT_READ, 'stderr')
    pending = bytearray()
    stderr_bytes = 0
    total_bytes = 0
    deadline = time.monotonic() + 910
    ready_deadline = time.monotonic() + 15
    binding = None
    record = None
    ready_ns = None
    next_observation = 0
    try:
        while selector.get_map():
            require(time.monotonic() < deadline, 'raw-service-timeout')
            require(binding is not None or time.monotonic() < ready_deadline, 'raw-ready-timeout')
            if time.monotonic() >= next_observation:
                observe_capacity(request['state'], after_allocation=binding is not None)
                if binding is not None and record is None:
                    require(read_caps(binding['cgroup']) == CAPS, 'raw-native-caps')
                next_observation = time.monotonic() + 1
            for event, _ in selector.select(.2):
                chunk = os.read(event.fd, 4096)
                if not chunk:
                    selector.unregister(event.fileobj)
                    continue
                if event.data == 'stderr':
                    stderr_bytes += len(chunk)
                    require(stderr_bytes <= RECORD_BYTES, 'raw-child-output-bound')
                    continue
                total_bytes += len(chunk)
                require(total_bytes <= 2 * RECORD_BYTES, 'raw-child-output-bound')
                pending.extend(chunk)
                while b'\n' in pending:
                    payload, _, remainder = pending.partition(b'\n')
                    pending = bytearray(remainder)
                    require(len(payload) < RECORD_BYTES, 'raw-record-bound')
                    frame = json.loads(payload)
                    if binding is None:
                        binding = check_ready(frame, request, request_digest, source, directory, directory_fd)
                        ready_ns = frame['observedNs']
                        publish('worker-ready.json', frame)
                        send_frame(client.stdin.fileno(), {'bindingDigest': digest_json(binding), 'request': request_digest})
                    else:
                        require(record is None and isinstance(frame, dict)
                                and set(frame) == {'phase', 'record', 'allocationBefore', 'allocationAfter'}
                                and frame['phase'] == 'complete', 'raw-protocol-invalid')
                        record = frame['record']
                        # Proof: coordinator-counter omission accepts the lifecycle OOM record.
                        check_counter(record, binding, ready_ns, time.time_ns())
                        native = observe_active(unit, binding['pid'])
                        require(all(native[name] == binding[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')),
                                'raw-counter-invalid')
                        check_creator(binding, directory, directory_fd)
                        check_input_descriptors(binding, request)
                        observe_capacity(request['state'], after_allocation=True)
                        # These are the original bounded bytes received from the still-live worker.
                        publish('worker-counter.json', record)
                        publish('allocation.json', {'before': frame['allocationBefore'], 'after': frame['allocationAfter']})
                        require(process_start(binding['pid']) == binding['start'], 'raw-counter-invalid')
                        send_frame(client.stdin.fileno(), {'durableDigest': digest_json(record)})
                require(len(pending) < RECORD_BYTES, 'raw-record-bound')
        client.wait(timeout=max(.01, deadline-time.monotonic()))
        require(binding is not None and record is not None and not pending, 'raw-protocol-incomplete')
        check_counter(record, binding, ready_ns, time.time_ns())
        terminal = observe_unit(unit)
        events = group_events(binding['cgroup'])
        # Proof: coordinator-client omission accepts a nonzero actual lifecycle client exit.
        check_terminal(terminal, events, client.returncode)
        require(terminal['LoadState'] == 'not-found' or terminal['InvocationID'] == binding['invocation'],
                'raw-terminal-invalid')
        final = observe_capacity(request['state'], after_allocation=True)
        receipt = {'schemaVersion': 1, 'scope': 'raw-preparation', 'accepted': True,
                   'guestAuthority': False, 'fullRehearsalAuthority': False,
                   'requestDigest': request_digest, 'sourceDigest': source, 'binding': binding,
                   'counterDigest': digest_json(record), 'measurementPhase': 'after-converter-before-worker-exit',
                   'counterPersistence': 'coordinator-fsync-before-worker-durability-ack',
                   'terminal': terminal, 'groupEvents': events, 'finalCapacity': final,
                   'finishedNs': time.time_ns(), 'rawBytes': RAW_BYTES,
                   'trust': 'independently-selected-content-pins; signatures remain separate input provenance'}
        publish('receipt.json', receipt)
        return {'schemaVersion': 1, 'scope': 'raw-preparation', 'accepted': True, 'nonce': request['nonce'],
                'receiptDigest': digest_json(receipt), 'guestAuthority': False, 'fullRehearsalAuthority': False}
    except BaseException as failure:
        cleanup = 'unknown'
        cleanup_failed = False
        if binding is not None:
            try:
                stop_owned(binding)
                cleanup = 'verified-original-unit-empty'
            except (PreparationRefusal, OSError, ValueError):
                # Failed owned cleanup is a modeled unaccepted outcome; persist it before rethrowing.
                cleanup_failed = True
        publish('failure.json', {'accepted': False, 'cleanup': cleanup,
                'category': str(failure) if isinstance(failure, PreparationRefusal) else 'raw-interrupted',
                'finishedNs': time.time_ns(), 'guestAuthority': False, 'fullRehearsalAuthority': False})
        if cleanup_failed:
            raise PreparationRefusal('raw-cleanup-uncertain') from None
        raise
    finally:
        if client.poll() is None:
            # This PID is the original local systemd client, never a provider-discovered foreign PID.
            client.kill()
        client.wait(timeout=5)
        client.stdin.close()
        client.stdout.close()
        client.stderr.close()
        selector.close()
        os.close(directory_fd)


def cancel(_signal, _frame):
    raise PreparationRefusal('raw-cancelled')


def main():
    try:
        require(len(sys.argv) in (3, 4), 'raw-arguments')
        is_worker = len(sys.argv) == 4
        require(not is_worker or sys.argv[1] == '--worker', 'raw-arguments')
        request_path, request_digest = sys.argv[-2:]
        require(re.fullmatch('[a-f0-9]{64}', request_digest) is not None, 'raw-arguments')
        request = read_json(request_path, request_digest)
        check_request(request)
        signal.signal(signal.SIGTERM, cancel)
        signal.signal(signal.SIGINT, cancel)
        signal.signal(signal.SIGALRM, cancel)
        signal.setitimer(signal.ITIMER_REAL, 920 if not is_worker else 900)
        if is_worker:
            worker(request, request_digest)
        else:
            resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2,) * 2)
            resource.setrlimit(resource.RLIMIT_FSIZE, (RECORD_BYTES,) * 2)
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
            print(encode_json(coordinator(request, request_path, request_digest)).decode())
        return 0
    except PreparationRefusal as failure:
        print(str(failure), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError, IndexError, subprocess.SubprocessError):
        print('raw-native-refused', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
