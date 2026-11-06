import ctypes
import fcntl
import hashlib
import importlib.util
import json
import math
import os
import re
import selectors
import stat
import subprocess
import time
from pathlib import Path

HELPER = Path(__file__).resolve()
SPEC = importlib.util.spec_from_file_location('guest_seed', HELPER.with_name('lab-seed-preparation.py'))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError('guest-runtime-unavailable')
seed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed)
raw = seed.raw
require = raw.require


def check_sample(sample):
    """Validate the closed guest observation, including actual service/socket generations."""
    # Proof: sample extra field — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(type(sample) is dict and set(sample) == {'capabilities', 'counts', 'filesystem', 'generation'},
            'guest-sample-shape')
    capabilities = sample['capabilities']
    expected = {'engineVersion': '29.7.2', 'serverApi': '1.55', 'minimumApi': '1.40',
                'os': 'linux', 'arch': 'amd64', 'driver': 'overlayfs',
                'driverType': 'io.containerd.snapshotter.v1', 'requestApi': '1.55'}
    # Proof: wrong Docker request API — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(type(capabilities) is dict and set(capabilities) == {*expected, 'daemonId'}
            and all(capabilities[key] == value for key, value in expected.items())
            and type(capabilities['daemonId']) is str
            and re.fullmatch('[A-Za-z0-9_-]{1,128}', capabilities['daemonId']), 'guest-capabilities')
    counts = sample['counts']
    # Proof: boolean/float workload zero — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(type(counts) is dict and set(counts) == {'containers', 'running', 'paused', 'stopped', 'images'}
            and all(type(count) is int and count == 0 for count in counts.values()), 'guest-workload')
    filesystem = sample['filesystem']
    # Proof: oversized filesystem — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(type(filesystem) is dict and set(filesystem) == {'fragmentBytes', 'blocks', 'freeBlocks', 'files', 'freeFiles'}
            and all(type(count) is int and count > 0 for count in filesystem.values())
            and filesystem['freeBlocks'] <= filesystem['blocks'] and filesystem['freeFiles'] <= filesystem['files']
            and filesystem['fragmentBytes'] * filesystem['blocks'] <= raw.RAW_BYTES, 'guest-filesystem')
    generation = sample['generation']
    # Proof: generation key set — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(generation) is dict and set(generation) == {'docker.service', 'containerd.service',
            '/run/docker.sock', '/run/containerd/containerd.sock', 'docker.socket', 'system.slice', 'user.slice'},
            'guest-generation')
    for unit, memory, tasks, executable in [('docker.service', 536870912, 64, '/usr/bin/dockerd'),
                                          ('containerd.service', 134217728, 32, '/usr/bin/containerd')]:
        service = generation[unit]
        # Proof: service executable — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(service) is dict and set(service) == {'unit', 'processStart', 'executable'}
                and service['executable'] == executable and type(service['processStart']) is str
                and re.fullmatch('[1-9][0-9]*', service['processStart']), 'guest-generation')
        expected = {'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'running',
                    'ControlGroup': '/system.slice/' + unit, 'MemoryMax': str(memory), 'MemorySwapMax': '0',
                    'TasksMax': str(tasks), 'NRestarts': '0', 'Restart': 'no', 'KillMode': 'control-group',
                    'TimeoutStopUSec': '30s'}
        fields = service['unit']
        # Proof: wrong service MemoryMax — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(type(fields) is dict and set(fields) == {*expected, 'InvocationID', 'MainPID', 'ExecMainStartTimestampMonotonic'}
                and all(fields[key] == value for key, value in expected.items())
                and all(type(value) is str for value in fields.values())
                and re.fullmatch('[a-f0-9]{32}', fields['InvocationID']) and fields['InvocationID'] != '0'*32
                and all(re.fullmatch('[1-9][0-9]*', fields[key]) for key in ('MainPID', 'ExecMainStartTimestampMonotonic')),
                'guest-generation')
    for path in ('/run/docker.sock', '/run/containerd/containerd.sock'):
        socket = generation[path]
        # Proof: nonroot socket owner — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(type(socket) is list and len(socket) == 6 and all(type(value) is int and value >= 0 for value in socket)
                and socket[1] > 0 and socket[2] > 0 and socket[3:5] == [0, 0] and socket[5] == 0o660, 'guest-socket')
    # Proof: socket unit policy — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(generation['docker.socket'] == {'LoadState': 'loaded', 'ActiveState': 'active', 'SubState': 'listening',
            'Listen': '/run/docker.sock (Stream)', 'SocketMode': '0660', 'SocketUser': 'root', 'SocketGroup': 'root'},
            'guest-socket')
    for unit, memory, tasks in [('system.slice', 805306368, 256), ('user.slice', 67108864, 32)]:
        # Proof: slice policy — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(generation[unit] == {'MemoryMax': str(memory), 'MemorySwapMax': '0', 'TasksMax': str(tasks)},
                'guest-slice')


class SerialCollector:
    """Consume bounded serial lines through EOF; only two ordered source-bound frames can succeed."""
    def __init__(self, request, started):
        self.request = request
        self.started = started
        self.pending = bytearray()
        self.total = 0
        self.frames = []
        self.measured_at = None

    def feed(self, chunk, observed):
        self.total += len(chunk)
        # Proof: serial aggregate8MiB+1 — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(self.total <= 8 * 1024**2, 'guest-serial-bound')
        self.pending.extend(chunk)
        while b'\n' in self.pending:
            line, _, remainder = self.pending.partition(b'\n')
            self.pending = bytearray(remainder)
            # Proof: LF-terminated line quota — single-call AST mutation; focused guest control observes the independent trust/output barrier.
            require(len(line) + 1 <= 65536, 'guest-line-bound')
            if line.startswith(b'PUNI_BASELINE '):
                self.accept(seed.decode_json(line[len(b'PUNI_BASELINE '):]), observed)
        # Proof: unterminated65537-byte line — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(len(self.pending) < 65536, 'guest-line-bound')

    def accept(self, frame, observed):
        common = {'schemaVersion', 'nonce', 'bootstrapSha256', 'kind'}
        # Proof: foreign nonce — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(type(frame) is dict and type(frame.get('schemaVersion')) is int and frame['schemaVersion'] == 1
                and frame.get('nonce') == self.request['nonce']
                and frame.get('bootstrapSha256') == self.request['bootstrapSha256'], 'guest-frame-binding')
        # Proof: third protocol frame — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(len(self.frames) < 2, 'guest-frame-order')
        if not self.frames:
            # Proof: foreign first frame kind — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
            require(set(frame) == common | {'elapsedSeconds', 'samples', 'first', 'last'}
                    and frame['kind'] == 'measured', 'guest-frame-order')
            elapsed = frame['elapsedSeconds']
            # Proof: short measurement — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
            require(type(elapsed) in (int, float) and math.isfinite(elapsed) and 60 <= elapsed <= 65
                    and type(frame['samples']) is int and 2 <= frame['samples'] <= 62
                    and elapsed <= observed-self.started <= 600+elapsed, 'guest-measurement-time')
            check_sample(frame['first'])
            check_sample(frame['last'])
            # Proof: steady generation — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
            require(frame['first']['generation'] == frame['last']['generation']
                    and frame['first']['capabilities'] == frame['last']['capabilities'], 'guest-steady-generation')
            self.measured_at = observed
        else:
            # Proof: final authority — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
            require(set(frame) == common | {'poweroffRequested', 'guestPoweroffVerified', 'hostCleanupVerified'}
                    and frame['kind'] == 'final' and frame['poweroffRequested'] is True
                    and frame['guestPoweroffVerified'] is False and frame['hostCleanupVerified'] is False,
                    'guest-frame-order')
            # Proof: late final frame — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
            require(self.measured_at is not None and observed-self.measured_at <= 30, 'guest-shutdown-time')
        self.frames.append(frame)

    def finish(self):
        # Proof: unterminated trailing bytes — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(not self.pending and len(self.frames) == 2, 'guest-serial-incomplete')
        return {'measured': self.frames[0], 'final': self.frames[1]}


def drain_qemu(arguments, descriptors, environment, monitor, emit, request, prepare):
    """Concurrently drain anonymous pipes, reap the foreground child, then expose guest observations."""
    started = time.monotonic()
    collector = SerialCollector(request, started)
    process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, pass_fds=descriptors, env=environment, preexec_fn=prepare)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, 'serial')
    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
    error_bytes = 0
    serial_bytes = 0
    def deadline():
        observed = time.monotonic()
        require(observed-started <= 900, 'guest-runtime-timeout')
        require(collector.frames or observed-started <= 665, 'guest-boot-timeout')
        require(collector.measured_at is None or observed-collector.measured_at <= 30, 'guest-shutdown-time')
        return min(started+900, collector.measured_at+30 if collector.measured_at is not None else started+665)
    try:
        while selector.get_map():
            deadline()
            monitor()
            for event, _ in selector.select(.1):
                chunk = os.read(event.fd, 16384)
                if not chunk:
                    selector.unregister(event.fileobj)
                    continue
                if event.data == 'serial':
                    serial_bytes += len(chunk)
                    # Proof: pre-emit serial quota — single-call AST mutation; focused guest control observes the independent trust/output barrier.
                    require(serial_bytes <= 8*1024**2, 'guest-serial-bound')
                else:
                    error_bytes += len(chunk)
                    # Proof: stderr1MiB+1 then final — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
                    require(error_bytes <= 1024**2, 'guest-stderr-bound')
                # Proof: review I2 observed actual bounded failure bytes lost when feed preceded emit.
                emit(event.data, chunk)
                if event.data == 'serial':
                    collector.feed(chunk, time.monotonic())
        # Proof: review I4 ordinary child closed both pipes then outlived shutdown when wait used900s.
        while process.poll() is None:
            stop_at = deadline()
            monitor()
            try:
                process.wait(timeout=min(.1, max(.001, stop_at-time.monotonic())))
            except subprocess.TimeoutExpired:
                continue
        deadline()
        # Proof: nonzero child after final — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(process.returncode == 0, 'guest-qemu-failed')
        require(collector.measured_at is not None and time.monotonic()-collector.measured_at <= 30, 'guest-shutdown-time')
        return collector.finish()
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
        selector.close()



def confine_qemu(raw_fd, executable_fd, kvm_fd, null_fd):
    """Landlock ABI3 allows raw writes without truncate and exact device writes; no other mutation.

    Call in CPython preexec before close_fds, while the original device FDs remain open.
    These character grants support QEMU's KVM/null opens without granting regular-file writes.
    """
    original = os.fstat(raw_fd)
    libc = ctypes.CDLL(None, use_errno=True)
    syscall = libc.syscall
    syscall.restype = ctypes.c_long
    require(os.uname().machine == 'x86_64' and syscall(444, 0, 0, 1) >= 3, 'guest-sandbox-unsupported')
    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]
    class PathBeneath(ctypes.Structure):
        _pack_ = 1
        _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int32)]
    # Proof: removing TRUNCATE handling admitted actual raw O_TRUNC in guest confinement proof.
    ruleset = Ruleset((1 << 15)-1-(1 << 2)-(1 << 3))
    descriptor = syscall(444, ctypes.byref(ruleset), ctypes.sizeof(ruleset), 0)
    require(descriptor >= 0, 'guest-sandbox-refused')
    loader = os.open('/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', os.O_PATH | os.O_CLOEXEC)
    try:
        for parent, rights in ((raw_fd, 2), (executable_fd, 1), (loader, 1), (kvm_fd, 2), (null_fd, 2)):
            rule = PathBeneath(rights, parent)
            require(syscall(445, descriptor, 1, ctypes.byref(rule), 0) == 0, 'guest-sandbox-refused')
        # Proof: bypassing restrict_self admitted a protected regular-file write in guest confinement proof.
        require(libc.prctl(38, 1, 0, 0, 0) == 0 and syscall(446, descriptor, 0) == 0, 'guest-sandbox-refused')
    finally:
        os.close(loader)
        os.close(descriptor)
    reopen_confined_raw(raw_fd, original)


def reopen_confined_raw(descriptor, original):
    """Replace the child's pre-domain description with the same inode opened under Landlock.

    The proc link denotes only the retained descriptor, not an operator-selected pathname.
    Opening after restrict_self binds the denied TRUNCATE right to the new description;
    dup2 keeps the existing pass_fds number and closes the child's original description.
    This does not constrain arbitrary fallocate operations or grant full rehearsal authority.
    """
    reopened = os.open(f'/proc/self/fd/{descriptor}', os.O_RDWR | os.O_CLOEXEC)
    try:
        opened = os.fstat(reopened)
        retained = os.fstat(descriptor)
        # Proof: guest fdset guard reopen-inode/reopen-access observes unqualified dup2 when this check is removed; original-fd observes invalid validator acceptance.
        require(raw.stable_identity(opened) == raw.stable_identity(original) == raw.stable_identity(retained)
                and opened.st_blocks == original.st_blocks == retained.st_blocks
                and fcntl.fcntl(reopened, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDWR,
                'guest-raw-reopen-changed')
        # Proof: guest fdset reopen RED allowed actual inherited-FD ftruncate; GREEN denies it and retains original writes and the metadata pipe.
        os.dup2(reopened, descriptor, inheritable=True)
        # Proof: guest fdset guard rebind-inode substitutes the dup2 destination; removing this check accepts the foreign descriptor.
        require(raw.stable_identity(os.fstat(descriptor)) == raw.stable_identity(original)
                and os.fstat(descriptor).st_blocks == original.st_blocks
                and fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDWR,
                'guest-raw-rebind-changed')
    finally:
        os.close(reopened)

def check_raw_geometry(descriptor, path):
    """Admit only the initialized, private ext4 overwrite profile through the canonical inspector.

    This fixed provider requires the observed 4KiB ext4 mount policy, EXTENTS-only
    inode flags, and no unwritten/shared/unknown FIEMAP extent. Existing mapped
    overwrites then reuse mappings; the child filter denies range and xattr mutation.
    Bind the path inspection back to the original descriptor before returning.
    """
    # Proof: geometry admission architecture/word-size and exact guard faults expose unsupported profile admission.
    require(os.uname().machine == 'x86_64' and ctypes.sizeof(ctypes.c_long) == 8,
            'guest-geometry-unsupported')
    opened = os.fstat(descriptor)
    filesystem = (ctypes.c_long * 15)()
    libc = ctypes.CDLL(None, use_errno=True)
    filesystem_status = libc.fstatfs(descriptor, ctypes.byref(filesystem))
    # Proof: geometry admission statfs-failure preserves the failed syscall while removing only its status check.
    require(filesystem_status == 0, 'guest-geometry-statfs')
    # Proof: geometry admission filesystem/block-size exact-call faults admit the unqualified native reply.
    require(filesystem[0] == 0xef53 and filesystem[1] == 4096, 'guest-geometry-filesystem')
    device = f'{os.major(opened.st_dev)}:{os.minor(opened.st_dev)}'
    mounts = [line.split() for line in raw.read_text('/proc/self/mountinfo', 1024**2).splitlines()]
    selected = [mount for mount in mounts if len(mount) >= 10 and mount[2] == device]
    # Proof: geometry admission mount-type/options/duplicate/missing faults each bypass this one call.
    require(len(selected) == 1 and selected[0][5] == 'rw,noatime'
            and selected[0][-4] == '-' and selected[0][-3] == 'ext4'
            and selected[0][-1] == 'rw,errors=remount-ro', 'guest-geometry-mount')
    flags = bytearray(8)
    fcntl.ioctl(descriptor, 0x80086601, flags, True)
    # Proof: geometry admission inode-feature fault bypass admits an unsupported feature; unreadable ioctl throws.
    require(int.from_bytes(flags, 'little') == 0x80000, 'guest-geometry-inode')
    allocation = raw.load_inspector().inspect_file(path, raw.RAW_BYTES, require_initialized=True)
    retained = os.fstat(descriptor)
    named = os.lstat(path)
    # Proof: geometry admission raw-replace/allocation-change and exact guard faults expose unsafe validator acceptance.
    require(raw.stable_identity(opened) == raw.stable_identity(retained) == raw.stable_identity(named)
            and opened.st_blocks == retained.st_blocks == named.st_blocks, 'guest-geometry-changed')
    return allocation


def geometry_filter():
    """Fixed native x86_64 cBPF: preserve initialized ext4 mappings under untrusted QEMU.

    ioctls use the kernel's low unsigned 32-bit command; advice uses its low int.
    KVM's 0xAE namespace has no geometry dispatch on the qualified ext4 raw inode.
    Unknown ABI/syscall generations kill; no FD-number exception survives duplication.
    """
    allow = (0x06, 0, 0, 0x7fff0000)
    deny = (0x06, 0, 0, 0x50001)
    kill = (0x06, 0, 0, 0x80000000)
    # Proof: guest geometry policy exercises compat/x32 dispatch against actual filter bytes.
    instructions = [(0x20, 0, 0, 4), (0x15, 1, 0, 0xc000003e), kill,
                    (0x20, 0, 0, 0), (0x35, 0, 1, 472), kill]
    # Proof: native geometry punch control observes an actual hole without this rule.
    instructions.extend([(0x15, 0, 1, 285), (0x06, 0, 0, 0x5005f)])
    # Proof: geometry filter fault <syscall> removes each decision; native-alternates/block-green additionally witness
    # copy-range/chmod/xattr mutations and successful legacy/io_uring setup with only their own rules removed.
    # Fixed 7.0 syscall table: sockets, range operations, async bypasses, authority transfer,
    # xattr/EA-inode allocation and private-inode attribute changes are unavailable.
    for number in (41, 42, 43, 44, 45, 46, 47, 53, 76, 77, 90, 91, 92, 93, 94, 101,
                   188, 189, 190, 197, 198, 199, 206, 207, 208, 209, 210,
                   260, 268, 288, 299, 307, 311, 326, 333, 425, 426, 427,
                   438, 440, 448, 452, 463, 466, 469):
        instructions.extend([(0x15, 0, 1, number), deny])
    # Proof: native-alternates madvise exact dispatch removal punches an actual mmap-backed raw hole.
    advice = [(0x20, 0, 0, 32), (0x15, 0, 1, 9), deny, allow]
    instructions.extend([(0x15, 0, len(advice), 28), *advice])
    # Proof: native-alternates unresvsp default-ioctl fault punches an actual hole; block-green preserves KVM API12.
    ioctl = [(0x20, 0, 0, 24)]
    for command in (0x5401, 0x5413, 0x5421):
        ioctl.extend([(0x15, 0, 1, command), allow])
    ioctl.extend([(0x54, 0, 0, 0xff00), (0x15, 0, 1, 0xae00), allow,
                  (0x06, 0, 0, 0x50019)])
    instructions.extend([(0x15, 0, len(ioctl), 16), *ioctl, allow])
    return tuple(instructions)


def install_geometry_filter():
    """Install the immutable policy after Landlock/reopen and before QEMU exec.

    This provider qualifies one kernel/ABI profile; a newer syscall surface is not
    silently admitted by the deny policy. Descendants inherit the irreversible filter.
    """
    # Proof: geometry installation architecture/kernel/word-size faults expose unqualified return before caller exec.
    require(os.uname().machine == 'x86_64' and ctypes.sizeof(ctypes.c_long) == 8
            and os.uname().release == '7.0.11-76070011-generic',
            'guest-geometry-unsupported')
    class Instruction(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte),
                    ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ushort), ('filter', ctypes.POINTER(Instruction))]
    instructions = geometry_filter()
    compiled = (Instruction * len(instructions))(*(Instruction(*entry) for entry in instructions))
    program = Program(len(instructions), compiled)
    libc = ctypes.CDLL(None, use_errno=True)
    # Proof: geometry installation no-new-privileges failure/guard removal preserves the required failure contract.
    require(libc.prctl(38, 1, 0, 0, 0) == 0, 'guest-geometry-install')
    # Proof: geometry installation installation fault exposes return without a filter when this exact guard is removed.
    require(libc.prctl(22, 2, ctypes.byref(program), 0, 0) == 0, 'guest-geometry-install')


CAPS = dict(raw.CAPS, **{'memory.max': '1610612736'})
SERVICE_LIMITS = dict(raw.SERVICE_LIMITS, LimitNOFILE='64', LimitCORE='0', Restart='no')


def check_request(request):
    """Current guest pins are selected independently of historical raw and seed source pins."""
    fields = {'schemaVersion', 'root', 'state', 'nonce', 'pins', 'seedRequest', 'seedReceipt',
              'seedProvenance', 'bootstrapSha256', 'kvm'}
    continued = type(request) is dict and type(request.get('schemaVersion')) is int and request['schemaVersion'] == 2
    if continued:
        fields.add('lineage')
    # Proof: caller memoryMax override — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    # Proof: requests accepted mixed/open v2 input after only this boundary call was omitted (faults.json).
    require(type(request) is dict and set(request) == fields and type(request['schemaVersion']) is int
            and request['schemaVersion'] in (1, 2) and (not continued or request['lineage'] == 'continued-guest')
            and type(request['root']) is str
            and Path(request['root']).is_absolute() and os.path.normpath(request['root']) == request['root']
            and request['state'] == request['root'] + '/.puni/fleet-labs/observability-baseline'
            and type(request['nonce']) is str and re.fullmatch('[a-f0-9]{32}', request['nonce'])
            and type(request['bootstrapSha256']) is str and re.fullmatch('[a-f0-9]{64}', request['bootstrapSha256'])
            and type(request['pins']) is list and 1 <= len(request['pins']) <= 512, 'guest-request-invalid')
    pins = {}
    for pin in request['pins']:
        # Proof: pin closed schema — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(pin) is dict and set(pin) == {'path', 'sha256', 'bytes', 'uid', 'mode'}
                and type(pin['path']) is str and Path(pin['path']).is_absolute()
                and os.path.normpath(pin['path']) == pin['path'] and pin['path'] not in pins
                and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
                and type(pin['bytes']) is int and 0 < pin['bytes'] <= 1024**3
                and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
                and type(pin['mode']) is int and 0 <= pin['mode'] <= 0o755
                and (not pin['mode'] & 0o022 or seed.is_confined_receipt(request, pin)), 'guest-request-invalid')
        pins[pin['path']] = pin
    # Proof: receipt pin membership — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(all(type(request[key]) is str and request[key] in pins
                and request[key].startswith(request['state'] + '/')
                for key in ('seedRequest', 'seedReceipt', 'seedProvenance')), 'guest-request-invalid')
    device = request['kvm']
    # Proof: request KVM identity — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(device) is dict and set(device) == {'identity', 'rdev'}
            and type(device['identity']) is list and len(device['identity']) == 4
            and all(type(value) is int and value >= 0 for value in device['identity'])
            and type(device['rdev']) is int and device['rdev'] == os.makedev(10, 232), 'guest-request-invalid')


def check_capacity(memory, free, allocated, initial, after_allocation):
    """The original raw and seed are already charged; only the existing160MiB reserve is added."""
    # Proof: float memory budget — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(all(type(value) is int and value >= 0 for value in (memory, free, allocated)), 'guest-capacity-malformed')
    # Proof: one-byte-short RAM — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(memory >= (4160749568 if initial else 2147483648), 'guest-memory-floor')
    # Proof: one-byte-short disk — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(free >= (50 if initial else 40) * 1024**3, 'guest-disk-floor')
    # Proof: one-byte-over staging — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(allocated + raw.RESERVE_BYTES <= raw.STAGING_BYTES, 'guest-staging-bound')


def observe_capacity(state, initial=False, after_allocation=False, request=None):
    readings = re.findall(r'^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$', raw.read_text('/proc/meminfo'), re.M)
    # Proof: unique MemAvailable — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(len(readings) == 1, 'guest-capacity-malformed')
    filesystem = os.statvfs(state)
    memory = int(readings[0]) * 1024
    free = filesystem.f_bavail * filesystem.f_frsize
    allocated = raw.allocated_bytes(state)
    check_capacity(memory, free, allocated, initial, after_allocation)
    if request is not None and request['schemaVersion'] == 2:
        # Proof: capacity accepted one-byte-short prior-failed G at this component observation when omitted (faults.json).
        seed.load_lineage().check_backing(state, free, initial)
    else:
        raw.refuse_repair_accounting(state)
    return {'availableMemoryBytes': memory, 'freeBytes': free, 'allocatedBytes': allocated, 'observedNs': time.time_ns()}


def check_kvm(descriptor, expected):
    observed = os.fstat(descriptor)
    named = os.lstat('/dev/kvm')
    # Proof: last-use KVM inode — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(stat.S_ISCHR(observed.st_mode) and raw.identity(observed) == expected['identity']
            == raw.identity(named) and observed.st_rdev == named.st_rdev == expected['rdev'] == os.makedev(10, 232),
            'guest-kvm-changed')


def check_receipt(receipt, prefix, version=1):
    fields = {'schemaVersion', 'scope', 'accepted', 'guestAuthority', 'fullRehearsalAuthority',
              'requestDigest', 'sourceDigest', 'binding', 'counterDigest', 'measurementPhase', 'counterPersistence',
              'terminal', 'groupEvents', 'finalCapacity', 'finishedNs', 'trust'}
    fields |= {'rawBytes'} if prefix == 'raw' else {'isoBytesLimit', 'memberBytesLimit', 'dependencyReport', 'rawReceipt'}
    if prefix == 'seed' and version == 2:
        fields |= {'lineage', 'repairRequestDigest', 'repairReceiptDigest', 'repairProvenanceDigest', 'repairArtifactDigest'}
    # Proof: receipt extra field — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    # Proof: guest-native-mixed admitted native v1 as v2 when only this schema call was omitted (faults.json).
    require(type(receipt) is dict and set(receipt) == fields and type(receipt['schemaVersion']) is int
            and receipt['schemaVersion'] == version and receipt['scope'] == prefix + '-preparation'
            and receipt['accepted'] is True and receipt['guestAuthority'] is False
            and receipt['fullRehearsalAuthority'] is False and type(receipt['finishedNs']) is int
            and 0 < receipt['finishedNs'] <= time.time_ns(), 'guest-predecessor-receipt')
    # Proof: receipt terminal schema — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(receipt['terminal']) is dict and set(receipt['terminal']) == set(raw.PROPERTIES)
            and all(type(value) is str for value in receipt['terminal'].values())
            and (receipt['groupEvents'] is None or type(receipt['groupEvents']) is str)
            and receipt['measurementPhase'] == ('after-converter-before-worker-exit' if prefix == 'raw'
                                               else 'after-seed-before-worker-exit')
            and receipt['counterPersistence'] == 'coordinator-fsync-before-worker-durability-ack'
            and receipt['trust'] == 'independently-selected-content-pins; signatures remain separate input provenance',
            'guest-predecessor-receipt')
    if version == 2:
        # Proof: guest-native-type accepted a boolean lineage digest when this call was omitted (lab-repair-lineage.test.ts; faults.json).
        require(receipt['lineage'] == 'continued-guest'
                and all(type(receipt[field]) is str and re.fullmatch('[a-f0-9]{64}', receipt[field])
                        for field in ('repairRequestDigest', 'repairReceiptDigest',
                                      'repairProvenanceDigest', 'repairArtifactDigest')), 'guest-predecessor-lineage')
    binding = receipt['binding']
    fields = {'pid', 'start', 'unit', 'invocation', 'cgroup', 'nonce', 'creator', 'python', 'source', 'request'}
    fields |= {'raw', 'rawFd', 'image', 'imageFd', 'tool', 'toolFd'} if prefix == 'raw' else {'iso', 'isoFd', 'inputs'}
    # Proof: receipt binding schema — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(binding) is dict and set(binding) == fields and type(binding['pid']) is int and binding['pid'] > 0
            and type(binding['start']) is str and re.fullmatch('[1-9][0-9]*', binding['start'])
            and type(binding['nonce']) is str and re.fullmatch('[a-f0-9]{32}', binding['nonce'])
            and type(binding['invocation']) is str and re.fullmatch('[a-f0-9]{32}', binding['invocation'])
            and binding['unit'] == 'puni-' + prefix + '-' + binding['nonce'] + '.service'
            and type(binding['cgroup']) is str and binding['cgroup'].startswith('/')
            and binding['cgroup'].endswith('/' + binding['unit']), 'guest-predecessor-receipt')
    identities = [('creator', 4), ('python', 8)] + ([('raw', 4), ('image', 8), ('tool', 8)]
                                                     if prefix == 'raw' else [('iso', 4)])
    # Proof: receipt exact inode — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(all(type(binding[key]) is list and len(binding[key]) == length
                and all(type(value) is int and value >= 0 for value in binding[key]) for key, length in identities)
            and all(type(binding[key]) is int and 3 <= binding[key] < 64
                    for key in (('rawFd', 'imageFd', 'toolFd') if prefix == 'raw' else ('isoFd',))),
            'guest-predecessor-receipt')
    if prefix == 'raw':
        # Proof: receipt raw size — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(receipt['rawBytes']) is int and receipt['rawBytes'] == raw.RAW_BYTES, 'guest-predecessor-receipt')
    else:
        # Proof: receipt seed input set — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(receipt['isoBytesLimit']) is int and receipt['isoBytesLimit'] == seed.ISO_BYTES
                and type(receipt['memberBytesLimit']) is int and receipt['memberBytesLimit'] == seed.MEMBER_BYTES
                and type(binding['inputs']) is dict and set(binding['inputs']) == {*seed.MEMBERS, 'genisoimage', 'isoinfo'},
                'guest-predecessor-receipt')
        for member in binding['inputs'].values():
            # Proof: receipt seed member fd — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
            require(type(member) is dict and set(member) == {'fd', 'identity'}
                    and type(member['fd']) is int and 3 <= member['fd'] < 64
                    and type(member['identity']) is list and len(member['identity']) == 8
                    and all(type(value) is int and value >= 0 for value in member['identity']), 'guest-predecessor-receipt')
    capacity = receipt['finalCapacity']
    # Proof: receipt capacity exact integers — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(capacity) is dict and set(capacity) == {'availableMemoryBytes', 'freeBytes', 'allocatedBytes', 'observedNs'}
            and all(type(value) is int and value >= 0 for value in capacity.values()), 'guest-predecessor-receipt')
    raw.check_terminal(receipt['terminal'], receipt['groupEvents'], 0)
    # Proof: receipt unloaded identity — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(receipt['terminal']['LoadState'] != 'not-found' or
            (receipt['terminal']['InvocationID'] == '' and receipt['terminal']['ControlGroup'] == ''),
            'guest-predecessor-receipt')
    # Proof: receipt digest join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(all(type(receipt[key]) is str and re.fullmatch('[a-f0-9]{64}', receipt[key])
                for key in ('requestDigest', 'sourceDigest', 'counterDigest'))
            and receipt['requestDigest'] == receipt['binding']['request']
            and receipt['sourceDigest'] == receipt['binding']['source'], 'guest-predecessor-receipt')


def verify_seed(request, current=True):
    """Consume durable seed acceptance and historical source evidence without querying its dead worker."""
    original = seed.read_pinned_json(request, request['seedRequest'])
    seed.check_request(original)
    # Proof: predecessor namespace after broken request validator — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    # Proof: guest-mixed reached the receipt-read witness after only this version-join call was omitted (faults.json).
    require(original['root'] == request['root'] and original['state'] == request['state']
            and original['schemaVersion'] == request['schemaVersion'], 'guest-seed-binding')
    pins = {pin['path']: pin for pin in request['pins']}
    receipt = seed.read_pinned_json(request, request['seedReceipt'])
    check_receipt(receipt, 'seed', request['schemaVersion'])
    directory = request['state'] + '/seed-' + original['nonce']
    # Proof: seed receipt nonce join — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(request['seedReceipt'] == directory + '/receipt.json'
            and receipt['binding']['nonce'] == original['nonce']
            and receipt['requestDigest'] == pins[request['seedRequest']]['sha256']
            and receipt['sourceDigest'] == raw.digest_json({pin['path']: pin['sha256'] for pin in original['pins']})
            and type(receipt['isoBytesLimit']) is int and receipt['isoBytesLimit'] == seed.ISO_BYTES
            and type(receipt['memberBytesLimit']) is int and receipt['memberBytesLimit'] == seed.MEMBER_BYTES
            and receipt['rawReceipt'] == original['rawReceipt']
            and receipt['dependencyReport'] == original['dependencyReport'], 'guest-seed-binding')
    historical = [pin for pin in original['pins'] if pin['path'].startswith(request['root'] + '/')
                  and not pin['path'].startswith(request['state'] + '/')]
    provenance = seed.read_pinned_json(request, request['seedProvenance'])
    # Proof: historical source provenance — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(type(provenance) is dict and set(provenance) == {'schemaVersion', 'sourceRevision', 'sourcePins',
            'requestDigest', 'receiptDigest'} and type(provenance['schemaVersion']) is int
            and provenance['schemaVersion'] == 1 and type(provenance['sourceRevision']) is str
            and re.fullmatch('[a-f0-9]{40}', provenance['sourceRevision']) and historical
            and provenance['sourcePins'] == historical and provenance['requestDigest'] == receipt['requestDigest']
            and provenance['receiptDigest'] == pins[request['seedReceipt']]['sha256'], 'guest-seed-provenance')
    for pin in original['pins']:
        if pin not in historical:
            # Proof: immutable predecessor pin — single-call AST mutation; focused guest control observes the independent trust/output barrier.
            require(pins.get(pin['path']) == pin, 'guest-predecessor-input')
    selected = dict(original, pins=request['pins'])
    predecessor = seed.read_pinned_json(selected, selected['rawReceipt'])
    check_receipt(predecessor, 'raw')
    raw_directory = request['state'] + '/raw-' + predecessor['binding']['nonce']
    # Proof: canonical raw receipt path — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(original['rawReceipt'] == raw_directory + '/receipt.json', 'guest-raw-binding')
    raw_directory_fd = raw.open_private(raw_directory, directory=True)
    try:
        # Proof: original raw creator — single-call AST mutation; focused guest control observes the independent trust/output barrier.
        require(raw.identity(os.fstat(raw_directory_fd)) == predecessor['binding']['creator'], 'guest-raw-binding')
    finally:
        os.close(raw_directory_fd)
    if request['schemaVersion'] == 2:
        continuation = seed.load_lineage().verify_lineage(selected, seed.verify_raw_history(selected),
                                                seed.read_pinned_json, current=current)
        # Proof: guest-digest accepted a substituted repair artifact digest when this call was omitted (lab-repair-lineage.test.ts; faults.json).
        require(all(receipt[field] == value for field, value in continuation['receipt'].items()),
                'guest-seed-lineage')
    else:
        seed.verify_raw(selected)
    dependency = seed.read_pinned_json(selected, selected['dependencyReport'])
    seed.check_dependency(dependency, selected)
    for observation in dependency['inputBindings']:
        # Proof: dependency input identity — single-call AST mutation; focused guest control observes the independent trust/output barrier.
        require(raw.stable_identity(os.lstat(observation['path'])) == observation['identity'], 'guest-dependency-changed')
    for tool in dependency['tools']:
        # Proof: dependency tool identity — single-call AST mutation; focused guest control observes the independent trust/output barrier.
        require(os.path.realpath(tool['path']) == tool['resolved']
                and raw.stable_identity(os.lstat(tool['resolved'])) == tool['identity'], 'guest-dependency-changed')
    iso = directory + '/seed.iso'
    # Proof: selected ISO private pin — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(iso in pins and pins[iso]['mode'] == 0o600 and pins[iso]['uid'] == os.geteuid(), 'guest-seed-binding')
    descriptor = raw.open_private(directory, directory=True)
    try:
        # Proof: original seed creator — single-call AST mutation; focused guest control observes the independent trust/output barrier.
        require(raw.identity(os.fstat(descriptor)) == receipt['binding']['creator'], 'guest-seed-binding')
    finally:
        os.close(descriptor)
    observed = os.lstat(iso)
    # Proof: original ISO identity — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(raw.identity(observed) == receipt['binding']['iso'] and 0 < observed.st_size <= seed.ISO_BYTES,
            'guest-seed-binding')
    artifact = seed.read_pinned_json(request, directory + '/iso.json')
    expected = {'bytes': pins[iso]['bytes'], 'sha256': pins[iso]['sha256'],
                'memberBytes': sum(member['bytes'] for member in original['members'].values()),
                'members': {name: {'bytes': member['bytes'], 'sha256': member['sha256']}
                            for name, member in original['members'].items()},
                'namespaces': ['iso9660', 'joliet', 'rock-ridge']}
    # Proof: exact ISO artifact record — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(raw.encode_json(artifact) == raw.encode_json(expected), 'guest-seed-binding')
    bootstrap = request['root'] + '/tools/tool-fleet/src/lab-guest-bootstrap.py'
    # Proof: selected bootstrap pin — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(bootstrap in pins and pins[bootstrap]['sha256'] == request['bootstrapSha256'], 'guest-bootstrap-binding')
    # The renderer embeds the exact bootstrap and serial request in its independently pinned member.
    descriptor = os.open(original['members']['user-data']['path'], os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        payload = raw.read_fd(descriptor, 1024**2).decode()
    finally:
        os.close(descriptor)
    # Proof: cloud-config prefix — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(payload.startswith('#cloud-config\n'), 'guest-bootstrap-binding')
    config = seed.decode_json(payload[len('#cloud-config\n'):])
    files = config['write_files']
    # Proof: embedded bootstrap identity — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(type(files) is list and len(files) == 2 and files[0]['path'] == '/opt/puni-baseline/bootstrap.py'
            and hashlib.sha256(files[0]['content'].encode()).hexdigest() == request['bootstrapSha256']
            and files[1]['path'] == '/opt/puni-baseline/request.json'
            and seed.decode_json(files[1]['content']) == {'schemaVersion': 1, 'nonce': original['nonce'],
                                                        'bootstrapSha256': request['bootstrapSha256']}, 'guest-bootstrap-binding')
    return {'nonce': original['nonce'], 'raw': raw_directory + '/disk.raw',
            **({'lineage': continuation['receipt'], 'admission': continuation['admission']}
               if request['schemaVersion'] == 2 else {}),
            'rawIdentity': predecessor['binding']['raw'], 'iso': iso, 'isoIdentity': raw.stable_identity(observed),
            'bootstrapSha256': request['bootstrapSha256']}


def verify_inputs(request, current=True):
    root, state = request['root'], request['state']
    # Proof: source location — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(str(HELPER) == root + '/tools/tool-fleet/src/lab-guest-preparation.py', 'guest-source-binding')
    pins = {pin['path']: pin for pin in request['pins']}
    required = [str(HELPER), str(HELPER.with_suffix('.ts')), str(HELPER.with_name('lab-guest-preparation-cli.ts')),
                str(HELPER.with_name('lab-raw-preparation.py')), str(HELPER.with_name('lab-raw-allocation.py')),
                str(HELPER.with_name('lab-seed-preparation.py')), str(HELPER.with_name('lab-guest-bootstrap.py')),
                root + '/infra/local/qemu-lab.lock.json', '/usr/bin/python3.12',
                '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
                state + '/tools-root/usr/bin/qemu-system-x86_64', state + '/tools-root/usr/share/seabios/bios-256k.bin']
    # Proof: required source pins — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    if request['schemaVersion'] == 2:
        required += [str(HELPER.with_name(name)) for name in
                     ('lab-repair-lineage.py', 'lab-raw-repair.py', 'lab-repair-worker.py')]
    # Proof: roles crossed into unselected file verification after this v2 pin barrier was omitted (faults.json).
    require(all(path in pins for path in required), 'guest-source-pins-missing')
    # Proof: qualified interpreter — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(os.path.realpath('/usr/bin/python3') == '/usr/bin/python3.12', 'guest-python-binding')
    for pin in request['pins']:
        seed.verify_pin(request, pin)
    tool = state + '/tools-root/usr/bin/qemu-system-x86_64'
    environment = raw.clean_environment(state)
    lock = seed.read_pinned_json(request, root + '/infra/local/qemu-lab.lock.json')
    version = raw.run_bounded([tool, '--version'], 3, environment).decode().splitlines()
    # Proof: tool version — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(version and version[0] == lock['qemu']['systemVersionLine'], 'guest-tool-version')
    closure = raw.run_bounded(['/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', '--list', tool], 3, environment).decode()
    libraries = re.findall(r'(?:=>\s+|^\s*)(/[^\s()]+)', closure, re.M)
    # Proof: loader closure — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(libraries and 'not found' not in closure and all(os.path.realpath(path) in pins for path in libraries),
            'guest-tool-closure')
    for relative in ('usr/share/qemu', 'usr/share/seabios', 'usr/lib/x86_64-linux-gnu/qemu'):
        directory = state + '/tools-root/' + relative
        # Proof: closure directory absence — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(os.path.isdir(directory), 'guest-tool-closure')
        for parent, names, files in os.walk(directory, followlinks=False):
            # Proof: closure symlink directory — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
            require(not any(os.path.islink(parent + '/' + name) for name in names), 'guest-tool-closure')
            # Proof: unpinned firmware — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
            require(all(os.path.realpath(parent + '/' + name) in pins for name in files), 'guest-tool-closure')
    if request['schemaVersion'] == 2:
        verify_seed(request, current=current)
    else:
        verify_seed(request)
    return raw.digest_json({path: pin['sha256'] for path, pin in pins.items()})


def qemu_arguments(request, predecessor, descriptors):
    """Foreground raw/ISO FD interfaces; explicit RW matches the original raw fdset access mode.

    Automatic readonly opens request O_RDONLY before a writer attaches; QEMU fdsets require
    an exact O_ACCMODE match, so the sole O_RDWR raw descriptor cannot satisfy that probe.
    """
    import uuid
    prefix = request['state'] + '/tools-root'
    return [f"/proc/self/fd/{descriptors['qemu']}", '-name', 'puni-guest-' + request['nonce'],
            '-machine', 'accel=kvm,type=q35', '-cpu', 'host', '-smp', '1', '-m', '1024',
            '-bios', f"/proc/self/fd/{descriptors['bios']}", '-L', prefix + '/usr/share/qemu',
            '-nodefaults', '-no-user-config', '-vga', 'none', '-display', 'none', '-monitor', 'none',
            '-serial', 'stdio', '-nic', 'none', '-no-reboot',
            '-smbios', 'type=1,manufacturer=QEMU,product=Puni bounded baseline,uuid=' + str(uuid.UUID(predecessor['nonce'])),
            '-add-fd', f"fd={descriptors['raw']},set=1,opaque=raw",
            '-add-fd', f"fd={descriptors['iso']},set=2,opaque=seed",
            # Proof: fdset-fix/red.json has automatic readonly and the pinned QEMU refuses flags 0x4000; green-final.json opens RW with O_DIRECT under unchanged confinement.
            '-drive', 'file=/dev/fdset/1,if=virtio,format=raw,readonly=off,auto-read-only=off,cache=none,aio=threads,discard=ignore,detect-zeroes=off',
            '-drive', 'file=/dev/fdset/2,if=ide,index=0,media=cdrom,format=raw,readonly=on,discard=ignore,detect-zeroes=off']


def observe_active(unit, pid):
    return raw.observe_active(unit, pid, CAPS, SERVICE_LIMITS)


def service_arguments(request, request_path, request_digest):
    properties = ['MemoryMax=1610612736', 'MemorySwapMax=0', 'CPUQuota=100%', 'CPUQuotaPeriodSec=100ms',
                  'TasksMax=128', 'RuntimeMaxSec=900s', 'TimeoutStopSec=5s', 'KillMode=control-group',
                  'SendSIGKILL=yes', 'LimitFSIZE=8589934592', 'LimitAS=8589934592', 'LimitNOFILE=64',
                  'LimitCORE=0', 'NoNewPrivileges=yes', 'UMask=0077', 'Restart=no']
    return ['/usr/bin/systemd-run', '--user', '--quiet', '--pipe', '--wait', '--collect', '--service-type=exec',
            '--unit=puni-guest-' + request['nonce'] + '.service', *('--property=' + value for value in properties),
            '/usr/bin/python3', '-I', '-B', str(HELPER), '--worker', request_path, request_digest]


def check_original_raw(descriptor, path, original):
    opened = os.fstat(descriptor)
    named = os.lstat(path)
    # Proof: replaced original raw — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(raw.identity(opened) == original == raw.identity(named)
            and raw.stable_identity(opened) == raw.stable_identity(named)
            and stat.S_ISREG(opened.st_mode) and opened.st_uid == os.geteuid()
            and stat.S_IMODE(opened.st_mode) == 0o600 and opened.st_nlink == 1
            and opened.st_size == raw.RAW_BYTES and raw.RAW_BYTES <= opened.st_blocks * 512 <= raw.RAW_BYTES + 1024**2,
            'guest-raw-changed')


def check_creator(binding, directory, directory_fd):
    # Proof: foreign creator inode — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(raw.process_start(binding['pid']) == binding['start']
            and raw.identity(os.fstat(directory_fd)) == binding['creator'] == raw.identity(os.lstat(directory)),
            'guest-creator-invalid')
    descriptor = os.open(f"/proc/{binding['pid']}/fd/{binding['rawFd']}", os.O_RDONLY | os.O_CLOEXEC)
    try:
        check_original_raw(descriptor, binding['rawPath'], binding['raw'])
    finally:
        os.close(descriptor)


def check_input_descriptors(binding, request):
    # Proof: worker interpreter FD — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(raw.stable_identity(os.stat(f"/proc/{binding['pid']}/exe")) == binding['python']
            == raw.stable_identity(os.stat('/usr/bin/python3.12')), 'guest-python-binding')
    paths = {'iso': request['state'] + '/seed-' + binding['seedNonce'] + '/seed.iso',
             'qemu': request['state'] + '/tools-root/usr/bin/qemu-system-x86_64',
             'bios': request['state'] + '/tools-root/usr/share/seabios/bios-256k.bin'}
    device = os.stat(f"/proc/{binding['pid']}/fd/{binding['kvmFd']}")
    # Proof: worker KVM FD — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(stat.S_ISCHR(device.st_mode) and raw.identity(device) == request['kvm']['identity']
            == raw.identity(os.lstat('/dev/kvm')) and device.st_rdev == request['kvm']['rdev'], 'guest-kvm-changed')
    raw_flags = re.findall(r'^flags:\s+([0-7]+)$', raw.read_text(f"/proc/{binding['pid']}/fdinfo/{binding['rawFd']}", 4096), re.M)
    # Proof: raw access mode — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(len(raw_flags) == 1 and int(raw_flags[0], 8) & os.O_ACCMODE == os.O_RDWR, 'guest-raw-access')
    # Proof: input key set — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(binding['inputs']) is dict and set(binding['inputs']) == set(paths), 'guest-input-changed')
    for name, path in paths.items():
        observation = binding['inputs'][name]
        # Proof: input FD schema — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(observation) is dict and set(observation) == {'fd', 'identity'}
                and type(observation['fd']) is int and 3 <= observation['fd'] < 64, 'guest-input-changed')
        fd_path = f"/proc/{binding['pid']}/fd/{observation['fd']}"
        # Proof: replaced ISO before counter publication — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(raw.stable_identity(os.stat(fd_path)) == observation['identity']
                == raw.stable_identity(os.lstat(path)), 'guest-input-changed')
        flags = re.findall(r'^flags:\s+([0-7]+)$', raw.read_text(f"/proc/{binding['pid']}/fdinfo/{observation['fd']}", 4096), re.M)
        # Proof: readonly inputs — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(len(flags) == 1 and int(flags[0], 8) & os.O_ACCMODE == os.O_RDONLY, 'guest-input-writable')


def check_ready(frame, request, request_digest, source, directory, directory_fd):
    # Proof: ready freshness — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(type(frame) is dict and set(frame) == {'phase', 'binding', 'observedNs'} and frame['phase'] == 'ready'
            and type(frame['observedNs']) is int and 0 <= time.time_ns()-frame['observedNs'] <= 10*10**9,
            'guest-ready-invalid')
    binding = frame['binding']
    fields = {'pid', 'start', 'unit', 'invocation', 'cgroup', 'nonce', 'creator', 'raw', 'rawFd',
              'rawPath', 'seedNonce', 'python', 'inputs', 'source', 'request', 'kvmFd'}
    # Proof: foreign request before ACK — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
    require(type(binding) is dict and set(binding) == fields and binding['nonce'] == request['nonce']
            and binding['request'] == request_digest and binding['source'] == source
            and type(binding['pid']) is int and binding['pid'] > 0
            and type(binding['rawFd']) is int and 3 <= binding['rawFd'] < 64
            and type(binding['kvmFd']) is int and 3 <= binding['kvmFd'] < 64
            and binding['unit'] == 'puni-guest-' + request['nonce'] + '.service', 'guest-ready-invalid')
    predecessor = verify_seed(request)
    # Proof: predecessor join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(binding['rawPath'] == predecessor['raw'] and binding['raw'] == predecessor['rawIdentity']
            and binding['seedNonce'] == predecessor['nonce'], 'guest-ready-invalid')
    native = observe_active(binding['unit'], binding['pid'])
    # Proof: native ready join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(all(native[key] == binding[key] for key in ('pid', 'start', 'unit', 'invocation', 'cgroup')),
            'guest-ready-invalid')
    check_creator(binding, directory, directory_fd)
    check_input_descriptors(binding, request)
    # Proof: fresh ready source — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(verify_inputs(request) == source, 'guest-source-binding')
    observe_capacity(request['state'], initial=True, request=request)
    return binding


def check_counter(record, binding, ready_ns, now):
    raw.check_counter(record, binding, ready_ns, now, CAPS, ('qemuExited', 'qemuReaped', 'measured'))


def worker(request, request_digest):
    import resource
    import base64
    from contextlib import ExitStack
    raw.worker_limits()
    # Proof: anonymous worker pipes — single-call AST mutation; focused guest control observes the independent trust/output barrier.
    require(all(stat.S_ISFIFO(os.fstat(descriptor).st_mode) for descriptor in (0, 1, 2)), 'guest-worker-pipes')
    with ExitStack() as opened:
        staging_fd = raw.acquire_staging(request['state'])
        opened.callback(os.close, staging_fd)
        source = verify_inputs(request)
        predecessor = verify_seed(request)
        observe_capacity(request['state'], initial=True, request=request)
        unit = 'puni-guest-' + request['nonce'] + '.service'
        native = observe_active(unit, os.getpid())
        # Proof: foreign worker invocation — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(os.environ.get('INVOCATION_ID') == native['invocation'], 'guest-worker-invocation')
        directory = request['state'] + '/guest-' + request['nonce']
        directory_fd = raw.open_private(directory, directory=True)
        opened.callback(os.close, directory_fd)
        paths = {'raw': predecessor['raw'], 'iso': predecessor['iso'],
                 'qemu': request['state'] + '/tools-root/usr/bin/qemu-system-x86_64',
                 'bios': request['state'] + '/tools-root/usr/share/seabios/bios-256k.bin',
                 'kvm': '/dev/kvm', 'null': '/dev/null'}
        descriptors = {}
        for name, path in paths.items():
            descriptors[name] = os.open(path, (os.O_RDWR if name in ('raw', 'kvm', 'null') else os.O_RDONLY)
                                         | os.O_CLOEXEC | os.O_NOFOLLOW)
            opened.callback(os.close, descriptors[name])
        check_original_raw(descriptors['raw'], predecessor['raw'], predecessor['rawIdentity'])
        check_raw_geometry(descriptors['raw'], predecessor['raw'])
        check_kvm(descriptors['kvm'], request['kvm'])
        # Proof: null device identity — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(stat.S_ISCHR(os.fstat(descriptors['null']).st_mode)
                and os.fstat(descriptors['null']).st_rdev == os.makedev(1, 3), 'guest-null-changed')
        inputs = {name: {'fd': descriptors[name], 'identity': raw.stable_identity(os.fstat(descriptors[name]))}
                  for name in ('iso', 'qemu', 'bios')}
        require(inputs['iso']['identity'] == predecessor['isoIdentity'], 'guest-input-changed')
        binding = {key: native[key] for key in ('pid', 'start', 'unit', 'invocation', 'cgroup')}
        binding.update({'nonce': request['nonce'], 'creator': raw.identity(os.fstat(directory_fd)),
                        'raw': predecessor['rawIdentity'], 'rawFd': descriptors['raw'], 'rawPath': predecessor['raw'],
                        'seedNonce': predecessor['nonce'], 'python': raw.stable_identity(os.stat('/proc/self/exe')),
                        'inputs': inputs, 'source': source, 'request': request_digest, 'kvmFd': descriptors['kvm']})
        ready_ns = time.time_ns()
        raw.send_frame(1, {'phase': 'ready', 'binding': binding, 'observedNs': ready_ns})
        raw.receive_ack(0, binding, request_digest)
        # Proof: changed source before raw write — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(verify_inputs(request) == source and observe_active(unit, os.getpid()) == native, 'guest-mutation-binding')
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        # Proof: original staging root — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(raw.identity(os.fstat(staging_fd)) == raw.identity(os.lstat(request['state'])), 'guest-staging-changed')
        observe_capacity(request['state'], initial=True, request=request)
        seed.require_descriptors({0, 1, 2, staging_fd, directory_fd, *descriptors.values()})
        def prepare():
            check_original_raw(descriptors['raw'], predecessor['raw'], predecessor['rawIdentity'])
            check_input_descriptors(binding, request)
            check_kvm(descriptors['kvm'], request['kvm'])
            # Proof: guest geometry caller admission refuses before the original QEMU preexec body can finish.
            check_raw_geometry(descriptors['raw'], predecessor['raw'])
            if request['schemaVersion'] == 2:
                # Proof: handoff reached the writable-handoff witness after only this production callback call was omitted (faults.json).
                seed.load_lineage().check_admission(predecessor['admission']['history'],
                                                 predecessor['admission']['artifact'])
            confine_qemu(descriptors['raw'], descriptors['qemu'], descriptors['kvm'], descriptors['null'])
            # Proof: guest fdset caller revalidates canonical raw path; removing this call admits an actual write after pathname substitution.
            check_original_raw(descriptors['raw'], predecessor['raw'], predecessor['rawIdentity'])
            # Proof: guest geometry caller installation refuses before the original QEMU preexec body can finish.
            install_geometry_filter()
            # CPython preexec precedes close_fds: close only this child's known worker-only copies.
            for descriptor in (staging_fd, directory_fd, descriptors['kvm'], descriptors['null']):
                os.close(descriptor)
        next_observation = 0
        def monitor():
            nonlocal next_observation
            if time.monotonic() >= next_observation:
                observe_capacity(request['state'], after_allocation=True, request=request)
                # Proof: live native caps — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
                require(raw.read_caps(binding['cgroup']) == CAPS, 'guest-native-caps')
                next_observation = time.monotonic()+1
        def emit(stream, chunk):
            raw.send_frame(1, {'phase': 'output', 'stream': stream, 'bytes': base64.b64encode(chunk).decode('ascii')})
        projection = drain_qemu(qemu_arguments(request, predecessor, descriptors),
                                tuple(descriptors[name] for name in ('raw', 'iso', 'qemu', 'bios')),
                                raw.clean_environment(request['state']), monitor, emit, predecessor, prepare)
        os.fsync(descriptors['raw'])
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        allocation = raw.load_inspector().inspect_file(predecessor['raw'], raw.RAW_BYTES, require_initialized=True)
        # Proof: review I3 rejects a record starting before the ordinary child was reaped.
        started_ns = time.time_ns()
        counters = {key: raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/' + key, 4096).strip()
                    for key in raw.COUNTERS}
        counter_caps = raw.read_caps(binding['cgroup'])
        finished_ns = time.time_ns()
        record = {'binding': binding, 'startedNs': started_ns, 'finishedNs': finished_ns,
                  'caps': counter_caps, 'counters': counters,
                  'qemuExited': True, 'qemuReaped': True, 'measured': True}
        check_counter(record, binding, ready_ns, time.time_ns())
        raw.send_frame(1, {'phase': 'complete', 'record': record, 'projection': projection, 'allocation': allocation})
        # Proof: wrong durable ACK — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(raw.receive_frame(0) == {'durableDigest': raw.digest_json(record)}, 'guest-durability-ack')


class Evidence:
    """Coordinator-only original private files; every write is bounded before pwrite and fsync."""
    def __init__(self, directory):
        self.directory = directory
        self.directory_fd = raw.open_private(directory, directory=True)
        self.creator = raw.identity(os.fstat(self.directory_fd))
        self.files = {}
        self.collector = None
        try:
            for stream, name, limit in [('serial', 'raw-serial.bin', 8*1024**2), ('stderr', 'client-stderr.bin', 1024**2)]:
                descriptor = os.open(name, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
                                     0o600, dir_fd=self.directory_fd)
                self.files[stream] = {'fd': descriptor, 'path': directory + '/' + name,
                                      'identity': raw.identity(os.fstat(descriptor)), 'bytes': 0, 'limit': limit}
        except BaseException:
            self.close()
            raise

    def validate(self):
        for stream in self.files:
            self.validate_file(stream)

    def validate_file(self, stream):
        evidence = self.files[stream]
        opened = os.fstat(evidence['fd'])
        # Proof: original evidence renamed/replaced — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(raw.identity(os.fstat(self.directory_fd)) == self.creator == raw.identity(os.lstat(self.directory))
                and raw.identity(opened) == evidence['identity'] == raw.identity(os.lstat(evidence['path']))
                and raw.stable_identity(opened) == raw.stable_identity(os.lstat(evidence['path']))
                and opened.st_size == evidence['bytes'] and opened.st_nlink == 1, 'guest-evidence-changed')

    def append(self, stream, chunk):
        self.validate_file(stream)
        evidence = self.files[stream]
        # Proof: evidence8MiB+1 — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(evidence['bytes']+len(chunk) <= evidence['limit'], 'guest-evidence-bound')
        # Proof: short-write diagnostic changed — diagnostic contract; size validator separately refuses; focused guest control observes refusal or the protected-operation witness.
        require(os.pwrite(evidence['fd'], chunk, evidence['bytes']) == len(chunk), 'guest-evidence-short-write')
        evidence['bytes'] += len(chunk)
        self.validate_file(stream)

    def consume(self, frame, binding, request):
        import base64
        # Proof: output closed schema — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(type(frame) is dict and set(frame) == {'phase', 'stream', 'bytes'} and frame['phase'] == 'output'
                and frame['stream'] in self.files and type(frame['bytes']) is str
                and 0 < len(frame['bytes']) <= 21848, 'guest-output-frame')
        chunk = base64.b64decode(frame['bytes'], validate=True)
        # Proof: decoded output quota — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(0 < len(chunk) <= 16384 and base64.b64encode(chunk).decode() == frame['bytes'], 'guest-output-frame')
        if self.collector is None:
            self.collector = SerialCollector({'nonce': binding['seedNonce'], 'bootstrapSha256': request['bootstrapSha256']},
                                             time.monotonic()-((time.time_ns()-self.ready_ns)/10**9))
        # Proof: review I2 observed a zero-byte named serial file when semantic feed preceded append.
        self.append(frame['stream'], chunk)
        if frame['stream'] == 'serial':
            self.collector.feed(chunk, time.monotonic())

    def durable(self):
        # Proof: review I1 renamed/replaced raw-serial.bin after append; fsync alone accepted the foreign name.
        self.validate()
        for evidence in self.files.values():
            os.fsync(evidence['fd'])
            self.validate()
        os.fsync(self.directory_fd)
        self.validate()

    def close(self):
        for evidence in self.files.values():
            os.close(evidence['fd'])
        os.close(self.directory_fd)


def check_final_artifact(request, binding):
    descriptor = raw.open_private(binding['rawPath'])
    try:
        check_original_raw(descriptor, binding['rawPath'], binding['raw'])
        allocation = raw.load_inspector().inspect_file(binding['rawPath'], raw.RAW_BYTES, require_initialized=True)
        # Proof: final raw coverage — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(allocation['coverageBytes'] == raw.RAW_BYTES, 'guest-final-artifact')
    finally:
        os.close(descriptor)
    pins = {pin['path']: pin for pin in request['pins']}
    iso = request['state'] + '/seed-' + binding['seedNonce'] + '/seed.iso'
    seed.verify_pin(request, pins[iso])
    # Proof: final ISO identity — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
    require(raw.stable_identity(os.lstat(iso)) == binding['inputs']['iso']['identity'], 'guest-final-artifact')
    for pin in request['pins']:
        seed.verify_pin(request, pin)
    return allocation


def coordinator(request, request_path, request_digest):
    """Reuse the original raw coordinator; guest callbacks own only serial evidence and final artifacts."""
    import types
    evidence = None
    original_allocation = None
    def launch(selected, path, digest):
        nonlocal evidence
        evidence = Evidence(selected['state'] + '/guest-' + selected['nonce'])
        return subprocess.Popen(service_arguments(selected, path, digest), stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=raw.clean_environment(), preexec_fn=raw.client_limits)
    def ready(frame, selected, digest, source, directory, directory_fd):
        binding = check_ready(frame, selected, digest, source, directory, directory_fd)
        require(evidence is not None, 'guest-evidence-absent')
        evidence.ready_ns = frame['observedNs']
        return binding
    def output(frame, binding):
        require(evidence is not None, 'guest-evidence-absent')
        evidence.consume(frame, binding, request)
    def stderr(chunk):
        require(evidence is not None, 'guest-evidence-absent')
        evidence.append('stderr', chunk)
    def persist_artifact(frame, publish):
        nonlocal original_allocation
        require(evidence is not None and evidence.collector is not None, 'guest-evidence-absent')
        projection = evidence.collector.finish()
        # Proof: collector projection join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(raw.encode_json(projection) == raw.encode_json(frame['projection']), 'guest-projection-binding')
        binding = frame['record']['binding']
        allocation = check_final_artifact(request, binding)
        # Proof: live allocation join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(raw.encode_json(allocation) == raw.encode_json(frame['allocation']), 'guest-allocation-binding')
        original_allocation = allocation
        evidence.durable()
        publish('collector.json', projection)
    def finalize(binding, terminal, events, final, publish):
        require(original_allocation is not None, 'guest-final-artifact')
        # Proof: terminal allocation join — single-call AST mutation; focused guest control observes refusal or the protected-operation witness.
        require(check_final_artifact(request, binding) == original_allocation, 'guest-final-artifact')
        # Proof: foreign unloaded invocation — previous category witness; only this reached call is claimed; focused guest control observes refusal or the protected-operation witness.
        require(terminal['LoadState'] != 'not-found' or
                (terminal['InvocationID'] == '' and terminal['ControlGroup'] == ''), 'guest-terminal-identity')
        raw.stop_owned(binding)
        require(evidence is not None, 'guest-evidence-absent')
        evidence.durable()
        publish('terminal.json', {'native': terminal, 'groupEvents': events, 'finalCapacity': final,
                                 'allocation': original_allocation})
    adapter = types.SimpleNamespace(
        verify_inputs=verify_inputs,
        observe_capacity=lambda state, **phase: observe_capacity(state, request=request, **phase),
        observe_unit=raw.observe_unit,
        launch_service=launch, check_ready=ready, check_counter=check_counter,
        observe_active=observe_active, check_creator=check_creator, check_input_descriptors=check_input_descriptors,
        stop_owned=raw.stop_owned, prefix='guest', caps=CAPS, seconds=910, final_cleanup=True,
        decode_frame=seed.decode_json, completion_fields={'phase', 'record', 'projection', 'allocation'},
        measurement_phase='after-qemu-exit-and-reap-before-worker-exit', persist_artifact=persist_artifact,
        consume_output=output, consume_stderr=stderr, stdout_limit=14*1024**2, stderr_limit=1024**2,
        finalize_artifact=finalize, receipt_fields=lambda record: {'rawBytes': raw.RAW_BYTES, 'vmMemoryBytes': 1024**3,
            'guestPoweroffVerified': True, 'hostCleanupVerified': True, 'seedReceipt': request['seedReceipt'],
            **(verify_seed(request, current=False)['lineage'] if request['schemaVersion'] == 2 else {})})
    try:
        return raw.coordinate_attempt(request, request_path, request_digest, adapter)
    except BaseException:
        # Failure bytes are evidence too; sync/identity failures propagate and can never become acceptance.
        if evidence is not None:
            evidence.durable()
        raise
    finally:
        if evidence is not None:
            evidence.close()


def main():
    import resource
    import signal
    import sys
    try:
        require(len(sys.argv) in (3, 4), 'guest-arguments')
        is_worker = len(sys.argv) == 4
        require(not is_worker or sys.argv[1] == '--worker', 'guest-arguments')
        path, digest = sys.argv[-2:]
        require(re.fullmatch('[a-f0-9]{64}', digest), 'guest-arguments')
        descriptor = raw.open_private(path)
        try:
            before = os.fstat(descriptor)
            payload = raw.read_fd(descriptor)
            # Proof: original request digest — single-call AST mutation; focused guest control observes the independent trust/output barrier.
            require(hashlib.sha256(payload).hexdigest() == digest
                    and raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor))
                    == raw.stable_identity(os.lstat(path)), 'guest-request-changed')
            request = seed.decode_json(payload)
        finally:
            os.close(descriptor)
        check_request(request)
        for cancellation in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
            signal.signal(cancellation, raw.cancel)
        signal.setitimer(signal.ITIMER_REAL, 900 if is_worker else 910)
        if is_worker:
            worker(request, digest)
        else:
            resource.setrlimit(resource.RLIMIT_AS, (128*1024**2,)*2)
            resource.setrlimit(resource.RLIMIT_FSIZE, (8*1024**2,)*2)
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
            print(raw.encode_json(coordinator(request, path, digest)).decode())
        return 0
    except raw.PreparationRefusal as failure:
        print(str(failure), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError, IndexError, subprocess.SubprocessError):
        print('guest-native-refused', file=sys.stderr)
        return 1


if __name__ == '__main__':
    import sys
    sys.exit(main())
