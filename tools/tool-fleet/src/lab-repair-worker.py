import ctypes
import importlib.util
import json
import mmap
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import time

SPEC = importlib.util.spec_from_file_location('writer_raw', Path(__file__).with_name('lab-raw-preparation.py'))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError('repair-runtime-unavailable')
raw = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(raw)
require = raw.require
RAW_BYTES = raw.RAW_BYTES
STEP_BYTES = 1048576


def native_call(number, *arguments):
    """Exactly one native syscall. EINTR, short I/O and partial conversion are never retried."""
    libc = ctypes.CDLL(None, use_errno=True)
    syscall = libc.syscall
    syscall.restype = ctypes.c_long
    # Proof: offset-width fault loses explicit64bit offsets at the actual mocked C variadic boundary.
    return syscall(ctypes.c_long(number), *arguments)


class AlignedBuffer:
    """One anonymous page-aligned MiB, shared only with the current direct I/O syscall."""
    def __enter__(self):
        self.length = STEP_BYTES
        self.mapping = mmap.mmap(-1, self.length, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS)
        self.address = ctypes.addressof(ctypes.c_char.from_buffer(self.mapping))
        require(self.address % 4096 == 0, 'repair-buffer-alignment')
        return self

    def __exit__(self, *failure):
        self.mapping.close()


def rewrite_step(descriptor, buffer, offset):
    """Read then rewrite the same bytes once, direct and DSYNC, without redirty or retry."""
    arguments = (ctypes.c_int(descriptor), ctypes.c_void_p(buffer.address),
                 ctypes.c_size_t(STEP_BYTES), ctypes.c_longlong(offset))
    # Proof: direct faults return EINTR/short read; the write syscall is never reached.
    require(native_call(17, *arguments) == STEP_BYTES, 'repair-read-failed')
    # Proof: direct faults return EINTR/short write; exactly one write occurs, no next syscall.
    require(native_call(18, *arguments) == STEP_BYTES, 'repair-write-failed')
    # Proof: direct sync failure prevents the done frame and every subsequent write.
    require(native_call(74, ctypes.c_int(descriptor)) == 0, 'repair-sync-failed')


def allocate_block(descriptor, offset):
    """One non-emulated native fallocate per original missing 4KiB block; no retry."""
    # Proof: allocation fault returns EINTR once; a second native call is forbidden.
    require(native_call(285, ctypes.c_int(descriptor), ctypes.c_int(0),
                        ctypes.c_longlong(offset), ctypes.c_longlong(4096)) == 0,
            'repair-allocation-failed')


class PrivatePipe:
    """One outstanding frame, <=1KiB including LF and <=4MiB in each direction."""
    def __init__(self, reader, writer, deadline, error_reader=None):
        self.reader, self.writer, self.deadline = reader, writer, deadline
        self.error_reader = error_reader
        self.received = 0
        self.sent = 0

    def wait(self, descriptor, event):
        deadline = min(self.deadline, time.monotonic() + 10)
        with selectors.DefaultSelector() as selector:
            selector.register(descriptor, event)
            if self.error_reader is not None:
                selector.register(self.error_reader, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                require(remaining > 0, 'repair-private-timeout')
                selected = selector.select(remaining)
                require(bool(selected), 'repair-private-timeout')
                for entry, _ in selected:
                    if entry.fd == self.error_reader:
                        # Proof: parent stderr control rejects private child diagnostics before another grant.
                        require(os.read(entry.fd, 1) == b'', 'repair-private-stderr')
                        selector.unregister(entry.fd)
                        self.error_reader = None
                    else:
                        return

    def send(self, frame):
        payload = raw.encode_json(frame) + b'\n'
        self.sent += len(payload)
        require(len(payload) <= 1024 and self.sent <= 4 * 1024**2, 'repair-private-frame-bound')
        self.wait(self.writer, selectors.EVENT_WRITE)
        # Frames fit PIPE_BUF. No partial protocol frame is resumed.
        require(os.write(self.writer, payload) == len(payload), 'repair-private-write')

    def receive(self):
        payload = bytearray()
        while True:
            self.wait(self.reader, selectors.EVENT_READ)
            chunk = os.read(self.reader, 1)
            # Proof: frames EOF control rejects truncated private protocol.
            require(bool(chunk), 'repair-private-eof')
            self.received += 1
            # Proof: frames 1025-byte line refuses before decoding or another write grant.
            require(len(payload) < 1024 and self.received <= 4 * 1024**2, 'repair-private-frame-bound')
            if chunk == b'\n':
                break
            payload.extend(chunk)
        try:
            def fields(pairs):
                record = {}
                for name, value in pairs:
                    require(name not in record, 'repair-private-frame-invalid')
                    record[name] = value
                return record
            frame = json.loads(payload, object_pairs_hook=fields)
        except ValueError:
            raise raw.PreparationRefusal('repair-private-frame-invalid') from None
        require(type(frame) is dict and frame.get('kind') in ('step', 'done', 'finish', 'finished'),
                'repair-private-frame-invalid')
        return frame


def write_ranges(descriptor, channel):
    """Only ordered fixed steps authorize writes; failures leave partial files without retries."""
    with AlignedBuffer() as buffer:
        for sequence, offset in enumerate(range(0, RAW_BYTES, STEP_BYTES)):
            expected = {'kind': 'step', 'seq': sequence, 'offset': offset, 'bytes': STEP_BYTES}
            frame = channel.receive()
            # Proof: child wrong sequence/offset/length/type/foreign fields refuse before intercepted write.
            require(frame == expected and all(type(frame[key]) is int for key in ('seq', 'offset', 'bytes')),
                    'repair-private-sequence')
            rewrite_step(descriptor, buffer, offset)
            channel.send(dict(expected, kind='done'))
        frame = channel.receive()
        require(frame == {'kind': 'finish', 'seq': RAW_BYTES // STEP_BYTES}
                and type(frame['seq']) is int, 'repair-private-sequence')
        channel.send({'kind': 'finished', 'seq': RAW_BYTES // STEP_BYTES})


def drive_writer(child, before_step, after_step, deadline):
    """Trusted worker grants only one step, verifies it, then reaps exact child before return."""
    channel = PrivatePipe(child.stdout.fileno(), child.stdin.fileno(), deadline, child.stderr.fileno())
    try:
        for sequence, offset in enumerate(range(0, RAW_BYTES, STEP_BYTES)):
            before_step(offset)
            channel.send({'kind': 'step', 'seq': sequence, 'offset': offset, 'bytes': STEP_BYTES})
            frame = channel.receive()
            # Proof: parent real-pipe sequence fault prevents the next admit/write.
            require(frame == {'kind': 'done', 'seq': sequence, 'offset': offset, 'bytes': STEP_BYTES}
                    and all(type(frame[key]) is int for key in ('seq', 'offset', 'bytes')),
                    'repair-private-sequence')
            # Proof: parent range fault after first real pipe reply prevents second admission.
            after_step(offset)
        channel.send({'kind': 'finish', 'seq': RAW_BYTES // STEP_BYTES})
        require(channel.receive() == {'kind': 'finished', 'seq': RAW_BYTES // STEP_BYTES},
                'repair-private-sequence')
        child.stdin.close()
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            selector.register(child.stderr, selectors.EVENT_READ)
            eof_deadline = min(deadline, time.monotonic() + 10)
            while selector.get_map():
                remaining = eof_deadline - time.monotonic()
                require(remaining > 0, 'repair-private-timeout')
                selected = selector.select(remaining)
                require(bool(selected), 'repair-private-timeout')
                for entry, _ in selected:
                    # Proof: parent extra/stderr real-pipe controls reject trailing bytes before counters.
                    require(os.read(entry.fd, 1) == b'', 'repair-private-trailing')
                    selector.unregister(entry.fileobj)
        # Proof: parent nonzero exit control refuses despite valid complete frames and EOF.
        require(child.wait(timeout=max(.01, min(10, deadline-time.monotonic()))) == 0, 'repair-writer-exit')
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=5)


def spawn_filter():
    """Additional immutable x86_64 filter denies every process/thread creation and execution."""
    kill = (0x06, 0, 0, 0x80000000)
    deny = (0x06, 0, 0, 0x50001)
    instructions = [(0x20, 0, 0, 4), (0x15, 1, 0, 0xc000003e), kill,
                    (0x20, 0, 0, 0), (0x35, 0, 1, 472), kill]
    # Proof: policy interpreter exercises each exact clone/fork/vfork/execve/execveat/clone3 decision.
    for number in (56, 57, 58, 59, 322, 435):
        instructions.extend([(0x15, 0, 1, number), deny])
    return tuple(instructions + [(0x06, 0, 0, 0x7fff0000)])


def install_spawn_filter():
    class Instruction(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte),
                    ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [('length', ctypes.c_ushort), ('filter', ctypes.POINTER(Instruction))]
    instructions = spawn_filter()
    compiled = (Instruction * len(instructions))(*(Instruction(*entry) for entry in instructions))
    program = Program(len(instructions), compiled)
    libc = ctypes.CDLL(None, use_errno=True)
    # Proof: filter-install guard fault accepts failed no-new-privileges/filter installation.
    require(libc.prctl(38, 1, 0, 0, 0) == 0 and libc.prctl(22, 2, ctypes.byref(program), 0, 0) == 0,
            'repair-spawn-filter-refused')


class ForkedWriter:
    """Original direct fork only; no process discovery or descendant signaling."""
    def __init__(self, pid, reader, writer, error_reader):
        self.pid, self.returncode = pid, None
        self.stdout = os.fdopen(reader, 'rb', buffering=0)
        self.stdin = os.fdopen(writer, 'wb', buffering=0)
        self.stderr = os.fdopen(error_reader, 'rb', buffering=0)

    def poll(self):
        if self.returncode is None:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                require(pid == self.pid, 'repair-writer-reap')
                self.returncode = os.waitstatus_to_exitcode(status)
        return self.returncode

    def wait(self, timeout):
        deadline = time.monotonic() + timeout
        while self.poll() is None:
            if time.monotonic() >= deadline:
                raise subprocess.TimeoutExpired('repair-private-writer', timeout)
            time.sleep(.005)
        return self.returncode

    def kill(self):
        if self.poll() is None:
            os.kill(self.pid, signal.SIGKILL)


def confine_child(descriptor, original, geometry):
    """Drop every inherited authority; reopen original inode after irreversible noexec/noTRUNC policy."""
    # Loader/tool execution grants remain absent in this branch; existing raw/seed defaults are unchanged.
    # Proof: truncate-grant fault exposes forbidden TRUNCATE in the controlled installed rule bytes.
    raw.confine_writer(descriptor, None, truncate=False)
    reopened = os.open(f'/proc/self/fd/{descriptor}',
                       os.O_RDWR | os.O_DIRECT | os.O_DSYNC | os.O_CLOEXEC)
    try:
        require(raw.identity(os.fstat(reopened)) == original, 'repair-child-inode')
        os.dup2(reopened, descriptor, inheritable=False)
    finally:
        os.close(reopened)
    for number in range(64):
        if number in (0, 1, 2, descriptor):
            continue
        try:
            os.close(number)
        except OSError as failure:
            require(failure.errno == 9, 'repair-child-close')
    require(all(stat.S_ISFIFO(os.fstat(number).st_mode) for number in (0, 1, 2)), 'repair-child-pipes')
    geometry.install_geometry_filter()
    install_spawn_filter()


def start_writer(descriptor, original, geometry, deadline):
    """Fork exactly one child into private pipes; no outer/state/evidence descriptors survive."""
    input_read, input_write = os.pipe2(os.O_CLOEXEC)
    output_read, output_write = os.pipe2(os.O_CLOEXEC)
    error_read, error_write = os.pipe2(os.O_CLOEXEC)
    try:
        pid = os.fork()
    except BaseException:
        for number in (input_read, input_write, output_read, output_write, error_read, error_write):
            os.close(number)
        raise
    if pid == 0:
        try:
            os.dup2(input_read, 0)
            os.dup2(output_write, 1)
            os.dup2(error_write, 2)
            confine_child(descriptor, original, geometry)
            write_ranges(descriptor, PrivatePipe(0, 1, deadline))
            os.close(descriptor)
            os._exit(0)
        except BaseException:
            os._exit(1)
    for number in (input_read, output_write, error_write):
        os.close(number)
    return ForkedWriter(pid, output_read, input_write, error_read)

class SettlementPrerequisites:
    """External physical input qualification and durable grant are deliberately unavailable.

    A future provider must qualify pre-first-access history and consume the directory/reservation/
    request/source-bound grant durably before any allocating create. Request fields, a post-load
    inventory, and an empty namespace cannot implement either boundary.
    """

    def qualify(self, context):
        require(False, 'settlement-inputs-unqualified')

    def consume(self, context):
        require(False, 'settlement-attempt-unqualified')

    def outside_bytes(self, context):
        require(False, 'settlement-inputs-unqualified')


SETTLEMENT_ORDER = ('request', 'ready', 'drain', 'counter', 'barrier', 'certificate', 'receipt', 'execution')
SETTLEMENT_DEBT = 33554432
SETTLEMENT_AUTHORITY = {'repairAuthority': False, 'guestAuthority': False, 'fullRehearsalAuthority': False}


def check_settlement_shape(value, fields):
    # Proof: lab-failed-settlement.test.ts record:ready:extra, record:drain:extra and 5 more vectors; copied predicate omission reaches unsafe-credit.
    require(type(value) is dict and set(value) == set(fields.split()), 'settlement-shape')


def check_settlement_digest(value):
    import re
    # Proof: lab-failed-settlement.test.ts record:ready:ledgerDigest; copied predicate omission reaches unsafe-credit.
    require(type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None, 'settlement-digest')


def parse_settlement_unsigned(value, positive=False):
    import re
    # Proof: lab-failed-settlement.test.ts record:ready:readyTimeBool, record:ready:capacityTimeOverflow; copied predicate omission reaches unsafe-credit.
    require(type(value) is str and re.fullmatch(r'0|[1-9][0-9]{0,19}', value) is not None
            and int(value) < 2**64 and (not positive or int(value) > 0), 'settlement-unsigned')
    return int(value)


def check_settlement_directory(value):
    check_settlement_shape(value, 'device inode owner mode')
    parse_settlement_unsigned(value['device']); parse_settlement_unsigned(value['inode'], True)
    require(type(value['owner']) is int and 0 <= value['owner'] < 2**32 and value['mode'] == '0700',
            'settlement-directory')


def check_settlement_process(value):
    import re
    check_settlement_shape(value, 'pid start uid gid bootId')
    parse_settlement_unsigned(value['pid'], True); parse_settlement_unsigned(value['start'], True)
    # Proof: lab-failed-settlement.test.ts record:ready:workerUid, record:ready:workerBoot; copied predicate omission reaches unsafe-credit.
    require(all(type(value[field]) is int and 0 <= value[field] < 2**32 for field in ('uid', 'gid'))
            and type(value['bootId']) is str and re.fullmatch(
                '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', value['bootId']) is not None,
            'settlement-process')


def check_settlement_unit(value, nonce):
    import re
    check_settlement_shape(value, 'unit invocation cgroup process caps limits')
    check_settlement_process(value['process'])
    # Proof: lab-failed-settlement.test.ts record:ready:workerCaps, record:ready:workerLimits; copied predicate omission reaches unsafe-credit.
    require(value['unit'] == 'puni-failed-settlement-' + nonce + '.service'
            and type(value['invocation']) is str and re.fullmatch('[a-f0-9]{32}', value['invocation']) is not None
            and type(value['cgroup']) is str and value['cgroup'].startswith('/')
            and value['cgroup'].endswith('/' + value['unit'])
            and value['caps'] == raw.CAPS and value['limits'] == raw.SERVICE_LIMITS, 'settlement-unit')


def check_settlement_terminal(value):
    """Exclude old writers without asserting a successful old execution or an invented birth boot.

    Legacy ready has no boot ID. Its independent capture uses bootScope=observation: bootId
    dates the PID/start lookup, not the old process birth. New service identities use process-birth.
    """
    check_settlement_shape(value, 'unit invocation cgroup process bootScope properties processState group')
    require(value['bootScope'] in ('observation', 'process-birth'), 'settlement-terminal-boot-scope')
    check_settlement_process(value['process'])
    check_settlement_shape(value['properties'], ' '.join(raw.PROPERTIES))
    require(all(type(part) is str and len(part) <= 4096 for part in value['properties'].values()),
            'settlement-terminal-properties')
    check_settlement_shape(value['processState'], 'state observedStart')
    state = value['processState']
    # Proof: lab-failed-settlement.test.ts record:certificate:terminalProcess; copied predicate omission reaches unsafe-credit.
    require(state['state'] in ('absent-ENOENT', 'reused') and
            (state['observedStart'] is None if state['state'] == 'absent-ENOENT' else
             type(state['observedStart']) is str and state['observedStart'] != value['process']['start']),
            'settlement-old-process-live')
    if state['state'] == 'reused': parse_settlement_unsigned(state['observedStart'], True)
    group = value['group']
    check_settlement_shape(group, 'state events procs threads')
    # Proof: lab-failed-settlement.test.ts record:certificate:terminalGroup; copied predicate omission reaches unsafe-credit.
    require(group['state'] in ('absent-ENOENT', 'empty') and group['procs'] == group['threads'] == '',
            'settlement-terminal-group')
    if group['state'] == 'absent-ENOENT':
        # Proof: lab-failed-settlement.test.ts record:certificate:terminalGroup; copied predicate omission reaches unsafe-credit.
        require(group['events'] is None, 'settlement-terminal-group')
    else:
        # Proof: lab-failed-settlement.test.ts record:certificate:terminalGroup; copied predicate omission reaches unsafe-credit.
        require(type(group['events']) is str and raw.parse_pairs(group['events']).get('populated') == 0,
                'settlement-terminal-group')
    properties = value['properties']
    # Proof: lab-failed-settlement.test.ts record:certificate:terminalUnit; copied predicate omission reaches unsafe-credit.
    require(properties['MainPID'] == '0' and properties['ActiveState'] == 'inactive'
            and properties['SubState'] == 'dead' and properties['LoadState'] in ('loaded', 'not-found')
            and (properties['LoadState'] == 'not-found' or properties['InvocationID'] == value['invocation'])
            and properties['ControlGroup'] in ('', value['cgroup']), 'settlement-terminal-unit')


def check_settlement_capacity(value, initial=False):
    check_settlement_shape(value, 'availableMemoryBytes freeBytes retainedInodeBytes outsideBytes ledgerDigest '
                            'unresolvedGrossBytes settlementDebtBytes otherFutureBytes observedNs')
    for field in set(value) - {'ledgerDigest'}: parse_settlement_unsigned(value[field])
    check_settlement_digest(value['ledgerDigest'])
    # Proof: lab-failed-settlement.test.ts record:ready:memory, record:ready:backing and 2 more vectors; copied predicate omission reaches unsafe-credit.
    require(value['settlementDebtBytes'] == str(SETTLEMENT_DEBT)
            and int(value['availableMemoryBytes']) >= (3623878656 if initial else 2147483648)
            and int(value['freeBytes']) >= (50 if initial else 40) * 1024**3
                + int(value['unresolvedGrossBytes']) + SETTLEMENT_DEBT + int(value['otherFutureBytes'])
            and int(value['retainedInodeBytes']) + raw.RESERVE_BYTES + SETTLEMENT_DEBT <= raw.STAGING_BYTES
            and int(value['outsideBytes']) <= 160 * 1024**2, 'settlement-capacity')


def check_settlement_cleanup(value):
    check_settlement_shape(value, 'state terminalDigest')
    # Proof: lab-failed-settlement.test.ts record:certificate:cleanup; copied predicate omission reaches unsafe-credit.
    require(value['state'] == 'verified-original-unit-empty', 'settlement-cleanup')
    check_settlement_digest(value['terminalDigest'])


def check_settlement_capture(value):
    check_settlement_shape(value, 'bytes sha256 frames')
    # Proof: lab-failed-settlement.test.ts record:execution:captureBound; copied predicate omission reaches unsafe-credit.
    require(type(value['bytes']) is int and 0 <= value['bytes'] < 65536
            and type(value['frames']) is int and 0 <= value['frames'] <= 2, 'settlement-capture')
    check_settlement_digest(value['sha256'])


def check_settlement_history(value):
    import re
    check_settlement_shape(value, 'originalNonce originalRequestDigest originalSourceDigest requestBindingDigest '
                            'reservationDigest readyDigest failureDigest terminalCaptureDigest '
                            'originalDirectory originalRawIdentity')
    require(type(value['originalNonce']) is str and re.fullmatch('[a-f0-9]{32}', value['originalNonce']) is not None
            and type(value['originalDirectory']) is str and value['originalDirectory'].endswith(
                '/raw-repair-' + value['originalNonce']), 'settlement-history')
    for field in ('originalRequestDigest', 'originalSourceDigest', 'requestBindingDigest', 'reservationDigest',
                  'readyDigest', 'failureDigest', 'terminalCaptureDigest'): check_settlement_digest(value[field])
    identity = value['originalRawIdentity']
    check_settlement_shape(identity, 'device inode owner mode links logicalBytes')
    for field in ('device', 'inode', 'logicalBytes'): parse_settlement_unsigned(identity[field])
    require(type(identity['owner']) is int and 0 <= identity['owner'] < 2**32 and identity['mode'] == '0600'
            and type(identity['links']) is int and identity['links'] == 1
            and identity['logicalBytes'] == '8589934592', 'settlement-history-raw')


def check_settlement_binding(value, context):
    check_settlement_shape(value, 'nonce requestDigest sourceDigest history coordinator worker stagingIdentity '
                            'originalDirectory rawPath rawSnapshot workerRawFd workerStagingFd')
    # Proof: lab-failed-settlement.test.ts record:ready:bindingRequest, record:ready:workerFd; copied predicate omission reaches unsafe-credit.
    require(value['nonce'] == context.request['nonce'] and value['requestDigest'] == context.request_digest
            and value['sourceDigest'] == context.source and value['history'] == context.history
            and value['rawPath'] == context.raw_path, 'settlement-binding')
    check_settlement_history(value['history']); check_settlement_process(value['coordinator'])
    check_settlement_unit(value['worker'], value['nonce'])
    check_settlement_directory(value['stagingIdentity']); check_settlement_directory(value['originalDirectory'])
    context.repair.check_snapshot(value['rawSnapshot'], context.request['expectedRaw'])
    # Proof: lab-failed-settlement.test.ts record:ready:bindingRequest, record:ready:workerFd; copied predicate omission reaches unsafe-credit.
    require(value['originalDirectory'] == context.directory_identity
            and all(type(value[field]) is int and 3 <= value[field] < 64 for field in
                    ('workerRawFd', 'workerStagingFd')), 'settlement-binding')


def check_settlement_counter(value, binding, ready, now):
    check_settlement_shape(value, 'bindingDigest readyDigest drainDigest startedNs finishedNs caps counters measurementPhase drained')
    for field in ('bindingDigest', 'readyDigest', 'drainDigest'): check_settlement_digest(value[field])
    start = parse_settlement_unsigned(value['startedNs']); finish = parse_settlement_unsigned(value['finishedNs'])
    # The existing real parser owns memory/OOM/CPU/pids validation; no synthetic old counters enter it.
    raw.check_counter({'binding': binding, 'startedNs': start, 'finishedNs': finish,
                       'caps': value['caps'], 'counters': value['counters'], 'drained': value['drained']},
                      binding, ready, now, completion=('drained',))
    # Proof: lab-failed-settlement.test.ts record:counter:counterPhase; copied predicate omission reaches unsafe-credit.
    require(value['measurementPhase'] == 'after-original-drain-before-settlement-worker-exit',
            'settlement-counter-phase')


def make_settlement_record(context, role, fields):
    return {'schemaVersion': 1, 'kind': 'failed-repair-settlement-' + role,
            'nonce': context.request['nonce'], 'requestDigest': context.request_digest,
            'sourceDigest': context.source, 'historyDigest': raw.digest_json(context.history), **fields}


def check_settlement_records(context, records, reservation):
    """Closed causal chain; every present prefix is validated before any debt credit is considered."""
    common = 'schemaVersion kind nonce requestDigest sourceDigest historyDigest '
    shapes = {
        'ready': 'binding observedNs oldTerminal profile initialCapacity adoption',
        'drain': 'bindingDigest readyDigest oldTerminalDigest before after startedNs finishedNs operation rawWrite contentRead',
        'counter': 'bindingDigest readyDigest drainDigest startedNs finishedNs caps counters measurementPhase drained',
        'barrier': 'bindingDigest drainDigest counterDigest profileDigest oldTerminalDigest publication observedNs',
        'certificate': 'bindingDigest readyDigest drainDigest counterDigest barrierDigest profile oldTerminal newTerminal '
                       'cleanup durableAck finalSnapshot finalCapacity issuedNs releasedReservationDigest releasedGrossBytes '
                       'retainedSettlementDebtBytes repairAuthority guestAuthority fullRehearsalAuthority',
        'receipt': 'certificateDigest counterDigest barrierDigest terminalDigest finishedNs accepted scope '
                   'releasedReservationDigest releasedGrossBytes retainedSettlementDebtBytes repairAuthority guestAuthority '
                   'fullRehearsalAuthority',
        'execution': 'outcome bindingDigest receiptDigest certificateDigest workerClientExit stdout stderr '
                     'originalTerminalDigest newTerminalDigest cleanup finishedNs sourcePinsDigest',
        'failure': 'phase category cleanup observedNs bindingDigest retainedGrossBytes retainedSettlementDebtBytes accepted '
                   'repairAuthority guestAuthority fullRehearsalAuthority',
    }
    for role, record in records.items():
        if role == 'request': continue
        if role == 'execution':
            # Proof: lab-failed-settlement.test.ts unknown-execution; copied predicate omission reaches unsafe-admission.
            require(record.get('outcome') in ('accepted', 'refused'), 'settlement-execution-outcome')
        fields = shapes[role]
        if role == 'execution' and record.get('outcome') == 'refused':
            fields = 'outcome phase category bindingDigest cleanup finishedNs'
        check_settlement_shape(record, common + fields)
        # Proof: lab-failed-settlement.test.ts record:ready:source; copied predicate omission reaches unsafe-credit.
        require(type(record['schemaVersion']) is int and record['schemaVersion'] == 1
                and record['kind'] == 'failed-repair-settlement-' + role and record['nonce'] == context.request['nonce']
                and record['requestDigest'] == context.request_digest and record['sourceDigest'] == context.source
                and record['historyDigest'] == raw.digest_json(context.history), 'settlement-provenance')
        for field, value in record.items():
            if field.endswith('Digest') and value is not None: check_settlement_digest(value)
            if field.endswith('Ns'): parse_settlement_unsigned(value)
        if role in ('certificate', 'receipt', 'failure'):
            # Proof: lab-failed-settlement.test.ts record:certificate:authority; copied predicate omission reaches unsafe-credit.
            require(all(record[field] is False for field in SETTLEMENT_AUTHORITY)
                    and record['retainedSettlementDebtBytes'] == str(SETTLEMENT_DEBT), 'settlement-authority')
    if 'failure' in records: check_settlement_failure(records['failure'], reservation)
    if 'execution' in records and records['execution']['outcome'] == 'refused':
        execution = records['execution']
        require('failure' in records and all(execution[field] == records['failure'][field]
                for field in ('phase', 'category', 'bindingDigest', 'cleanup')), 'settlement-refused-execution')
    if 'ready' not in records: return
    ready = records['ready']; binding = ready['binding']; binding_digest = raw.digest_json(binding)
    check_settlement_binding(binding, context)
    check_settlement_terminal(ready['oldTerminal'])
    # Proof: lab-failed-settlement.test.ts record:ready:oldTerminal; copied predicate omission reaches unsafe-credit.
    require(all(ready['oldTerminal'][key] == context.old_binding[key] for key in
                ('unit', 'invocation', 'cgroup', 'process')), 'settlement-old-terminal-binding')
    check_settlement_capacity(ready['initialCapacity'], initial=True)
    context.repair.check_profile(ready['profile'], context.request['expectedRaw'])
    check_settlement_shape(ready['adoption'], 'coordinator worker stagingIdentity requestDigest')
    # Proof: adoptionCoordinatorUid/Gid, adoptionWorkerUid/Gid and adoptionStagingOwner inject canonical floats; predicate omission reaches unsafe-credit.
    require(raw.encode_json(ready['adoption']) == raw.encode_json(
            {'coordinator': binding['coordinator'], 'worker': binding['worker']['process'],
             'stagingIdentity': binding['stagingIdentity'], 'requestDigest': context.request_digest}), 'settlement-adoption')
    digests = {role: raw.digest_json(record) for role, record in records.items()}
    for role in ('drain', 'counter', 'barrier', 'certificate', 'execution'):
        if role in records: require(records[role]['bindingDigest'] == binding_digest, 'settlement-chain-binding')
    for role in ('drain', 'counter', 'certificate'):
        # Proof: lab-failed-settlement.test.ts record:drain:readyDigest; copied predicate omission reaches unsafe-credit.
        if role in records: require(records[role]['readyDigest'] == digests['ready'], 'settlement-chain-ready')
    if 'drain' in records:
        drain = records['drain']
        context.repair.check_snapshot(drain['before'], context.request['expectedRaw'])
        context.repair.check_snapshot(drain['after'], drain['after'])
        # Proof: lab-failed-settlement.test.ts record:drain:rawWrite; copied predicate omission reaches unsafe-credit.
        require(all(drain['after'][key] == drain['before'][key] for key in context.raw_identity)
                and drain['oldTerminalDigest'] == raw.digest_json(ready['oldTerminal'])
                and int(ready['observedNs']) <= int(drain['startedNs']) <= int(drain['finishedNs'])
                and drain['operation'] == 'readonly-original-fd-fsync'
                and drain['rawWrite'] is False and drain['contentRead'] is False, 'settlement-drain')
    if 'counter' in records:
        counter = {key: value for key, value in records['counter'].items() if key not in common.split()}
        check_settlement_counter(counter, binding, int(ready['observedNs']), int(records['counter']['finishedNs']))
        # Proof: lab-failed-settlement.test.ts record:counter:counterStart; copied predicate omission reaches unsafe-credit.
        require(counter['drainDigest'] == digests['drain']
                and int(counter['startedNs']) == int(records['drain']['startedNs'])
                and int(counter['finishedNs']) >= int(records['drain']['finishedNs']), 'settlement-chain-counter')
    if 'barrier' in records:
        barrier = records['barrier']
        # Proof: lab-failed-settlement.test.ts record:barrier:barrierOrder; copied predicate omission reaches unsafe-credit.
        require(barrier['drainDigest'] == digests['drain'] and barrier['counterDigest'] == digests['counter']
                and barrier['profileDigest'] == raw.digest_json(ready['profile'])
                and barrier['oldTerminalDigest'] == raw.digest_json(ready['oldTerminal'])
                and barrier['publication'] == 'counter-directory-A-before-barrier-directory-C'
                and int(barrier['observedNs']) >= int(records['counter']['finishedNs']), 'settlement-chain-barrier')
    if 'certificate' in records:
        certificate = records['certificate']
        for role in ('drain', 'counter', 'barrier'):
            # Proof: lab-failed-settlement.test.ts record:certificate:certificateJoin; copied predicate omission reaches unsafe-credit.
            require(certificate[role + 'Digest'] == digests[role], 'settlement-chain-certificate')
        check_settlement_terminal(certificate['oldTerminal']); check_settlement_terminal(certificate['newTerminal'])
        check_settlement_cleanup(certificate['cleanup'])
        check_settlement_shape(certificate['durableAck'], 'requestDigest bindingDigest counterDigest drainDigest barrierDigest consumed senderState')
        # Proof: ackConsumedInt/ackConsumedFloat in lab-failed-settlement.test.ts inject canonical1/1.0; predicate omission reaches unsafe-credit.
        require(certificate['durableAck']['consumed'] is True, 'settlement-ack-consumed-type')
        sender_state = certificate['durableAck']['senderState']
        check_settlement_shape(sender_state, 'state start')
        require(sender_state == {'state': 'absent-ENOENT', 'start': None} or
                sender_state == {'state': 'live', 'start': binding['worker']['process']['start']}, 'settlement-ack-consumed')
        # Proof: certificateJoin and certificateProfileBlock/Bool inject false joins/canonical numeric aliases; predicate omission reaches unsafe-credit.
        require(certificate['durableAck'] == dict(requestDigest=context.request_digest, bindingDigest=binding_digest,
                counterDigest=digests['counter'], drainDigest=digests['drain'], barrierDigest=digests['barrier'], consumed=True, senderState=sender_state)
                and certificate['cleanup']['terminalDigest'] == raw.digest_json(certificate['newTerminal'])
                and certificate['oldTerminal'] == ready['oldTerminal']
                and certificate['newTerminal']['process'] == binding['worker']['process']
                and certificate['newTerminal']['unit'] == binding['worker']['unit']
                and certificate['newTerminal']['invocation'] == binding['worker']['invocation']
                and certificate['newTerminal']['cgroup'] == binding['worker']['cgroup']
                and certificate['newTerminal']['bootScope'] == 'process-birth'
                and raw.encode_json(certificate['profile']) == raw.encode_json(ready['profile']), 'settlement-chain-certificate')
        properties = certificate['newTerminal']['properties']
        # Proof: lab-failed-settlement.test.ts new-terminal-failed; copied predicate omission reaches accepted-G-only-K-retained.
        require(properties['Result'] in ('', 'success') and properties['ExecMainStatus'] in ('', '0'),
                'settlement-new-terminal-failed')
        context.repair.check_snapshot(certificate['finalSnapshot'], certificate['finalSnapshot'])
        require(all(certificate['finalSnapshot'][key] == context.raw_identity[key] for key in context.raw_identity),
                'settlement-final-identity')
        check_settlement_capacity(certificate['finalCapacity'])
    if 'receipt' in records:
        receipt = records['receipt']
        # Proof: lab-failed-settlement.test.ts record:receipt:receiptAccepted; copied predicate omission reaches unsafe-credit.
        require(receipt['accepted'] is True and receipt['scope'] == 'failed-repair-settlement'
                and receipt['certificateDigest'] == digests['certificate']
                and receipt['counterDigest'] == digests['counter'] and receipt['barrierDigest'] == digests['barrier']
                and receipt['terminalDigest'] == raw.digest_json(records['certificate']['newTerminal'])
                and int(receipt['finishedNs']) >= int(records['certificate']['issuedNs']), 'settlement-chain-receipt')
    for role in ('certificate', 'receipt'):
        # Proof: lab-failed-settlement.test.ts record:receipt:amount; copied predicate omission reaches unsafe-credit.
        if role in records: require(records[role]['releasedReservationDigest'] == raw.digest_json(reservation)
                and records[role]['releasedGrossBytes'] == reservation['grossBytes'], 'settlement-release-amount')
    if 'execution' in records and records['execution']['outcome'] == 'accepted':
        execution = records['execution']
        check_settlement_cleanup(execution['cleanup']); check_settlement_capture(execution['stdout']); check_settlement_capture(execution['stderr'])
        # Proof: lab-failed-settlement.test.ts record:execution:workerExit; copied predicate omission reaches unsafe-credit.
        require(type(execution['workerClientExit']) is int and execution['workerClientExit'] == 0
                and execution['stderr']['bytes'] == execution['stderr']['frames'] == 0
                and execution['stderr']['sha256'] == __import__('hashlib').sha256(b'').hexdigest()
                and execution['stdout']['frames'] == 2 and execution['receiptDigest'] == digests['receipt']
                and execution['certificateDigest'] == digests['certificate']
                and execution['originalTerminalDigest'] == raw.digest_json(records['certificate']['oldTerminal'])
                and execution['newTerminalDigest'] == raw.digest_json(records['certificate']['newTerminal'])
                and execution['cleanup'] == records['certificate']['cleanup']
                and execution['sourcePinsDigest'] == context.source
                and int(execution['finishedNs']) >= int(records['receipt']['finishedNs']), 'settlement-execution')
    if 'failure' in records:
        failure = records['failure']
        check_settlement_failure(failure, reservation)
    if 'execution' in records and records['execution']['outcome'] == 'refused':
        execution = records['execution']
        require('failure' in records and all(execution[field] == records['failure'][field]
                for field in ('phase', 'category', 'bindingDigest', 'cleanup')), 'settlement-refused-execution')


SETTLEMENT_PHASES = ('admission', 'request', 'ready', 'drain', 'counter', 'barrier', 'certificate', 'receipt', 'execution')
SETTLEMENT_FAILURES = ('cancelled', 'native-refused', 'protocol-refused', 'publication-refused', 'cleanup-uncertain')


def check_settlement_failure(value, reservation):
    require(value['phase'] in SETTLEMENT_PHASES and value['category'] in SETTLEMENT_FAILURES
            and value['cleanup'] in ('not-started', 'verified-original-unit-empty', 'uncertain')
            and value['accepted'] is False and value['retainedGrossBytes'] == reservation['grossBytes'],
            'settlement-failure')
    if value['bindingDigest'] is not None: check_settlement_digest(value['bindingDigest'])


def read_settlement_namespace(repair, directory, descriptor, reservation, names, owned=None):
    """No optional-file defaults: complete validated prefixes retain debt, accepted execution alone credits G."""
    original = {'request-binding.json', 'reservation.json', 'worker-ready.json', 'failure.json'}
    # Proof: lab-failed-settlement.test.ts mixed, accepted-and-failure; copied predicate omission reaches unsafe-credit.
    require(original <= names and not names - original - repair['_SETTLEMENT_NAMES'], 'settlement-namespace-conflict')
    present = {role for role in SETTLEMENT_ORDER if 'settlement-' + role + '.json' in names}
    failed = 'settlement-failure.json' in names
    prefix = [role for role in SETTLEMENT_ORDER if role in present and role != 'execution']
    require(prefix == list(SETTLEMENT_ORDER[:len(prefix)]) and 'request' in present,
            'settlement-prefix')
    records = {role: repair['read_record'](Path(directory) / ('settlement-' + role + '.json')) for role in present}
    if failed: records['failure'] = repair['read_record'](Path(directory) / 'settlement-failure.json')
    accepted = 'execution' in present and records['execution'].get('outcome') == 'accepted'
    # Proof: lab-failed-settlement.test.ts mixed, accepted-and-failure; copied predicate omission reaches unsafe-credit.
    require(not accepted or not failed and len(present) == 8, 'settlement-namespace-conflict')
    require('execution' not in present or accepted or failed, 'settlement-prefix')
    if owned is not None:
        require(type(owned) is SettlementContext and owned.directory == str(directory)
                and raw.encode_json(records['request']) == raw.encode_json(owned.request)
                and set(records) == set(owned.records)
                and all(raw.encode_json(record) == raw.encode_json(owned.records[role])
                        for role, record in records.items()), 'settlement-owned-prefix')
        context = owned
    else:
        context = SettlementContext(repair, records['request'], raw.digest_json(records['request']))
        context.admit_request(reading=True)
    require(context.directory == str(directory) and context.reservation == reservation
            and context.directory_identity == context.snapshot_directory(os.fstat(descriptor)),
            'settlement-history-changed')
    check_settlement_records(context, records, reservation)
    return {'state': 'accepted' if accepted else 'failed' if failed else 'incomplete',
            'settled': accepted, 'settlementRelevant': True}


class SettlementContext:
    """Fixed conditional operation over an explicitly verified repair closure and external prerequisites."""

    def __init__(self, repair, request, request_digest):
        import types
        self.repair = types.SimpleNamespace(**repair) if type(repair) is dict else repair
        self.request, self.request_digest = request, request_digest
        self.prerequisites = SettlementPrerequisites()
        self.directory = request['originalDirectory']
        self.source = None
        self.history = None
        self.records = {}
        self.witnesses = []
        self.phase = 'admission'
        self.binding = None
        self.adopted = self.durable = None

    @staticmethod
    def snapshot_directory(observed):
        return {'device': str(observed.st_dev), 'inode': str(observed.st_ino),
                'owner': observed.st_uid, 'mode': format(stat.S_IMODE(observed.st_mode), '04o')}

    @staticmethod
    def observe_process(pid):
        return {'pid': str(pid), 'start': raw.process_start(pid), 'uid': os.geteuid(), 'gid': os.getegid(),
                'bootId': raw.read_text('/proc/sys/kernel/random/boot_id', 128).strip()}

    def admit_request(self, reading=False):
        """No request-selected capability can qualify external input history or grant a second attempt."""
        payload = raw.encode_json(self.request)
        self.repair._source_payload(payload, self.request_digest, settlement=True)
        # Proof: unqualified-input dependency removal reaches the intercepted first publication in source fixtures.
        self.prerequisites.qualify(self)
        self.source = self.repair.verify_inputs(self.request)
        self.read_history()
        before = os.lstat(self.directory)
        self.directory_identity = self.snapshot_directory(before)
        check_settlement_directory(self.directory_identity)
        require(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid(), 'settlement-directory')
        descriptor = self.repair.open_original(self.raw_path, self.request['expectedRaw']) if not reading else \
            self.repair.open_live_original(self.raw_path, self.reservation)
        try:
            observed = self.repair.snapshot_file(os.fstat(descriptor))
            require(all(observed[field] == self.raw_identity[field] for field in self.raw_identity),
                    'settlement-history-changed')
        finally:
            os.close(descriptor)

    def read_history(self):
        """Historical executable pins identify old code only; current pins never substitute for them."""
        original = self.repair.seed.read_pinned_json(self.request, self.request['originalRepairRequest'])
        self.repair.check_request(original)
        pins = {pin['path']: pin for pin in self.request['pins']}
        records = {name: self.repair.seed.read_pinned_json(self.request, self.directory + '/' + name + '.json')
                   for name in ('request-binding', 'reservation', 'worker-ready', 'failure')}
        self.reservation = records['reservation']; self.repair.check_reservation(self.reservation)
        binding = records['worker-ready']['binding']
        self.repair.closed(records['worker-ready'], 'phase binding observedNs reservation snapshot mapDigest')
        self.repair.closed(binding, 'pid start unit invocation cgroup nonce creator originalCreator originalFd raw rawFd '
                                   'rawPath staging stagingFd python inputs evidence source request reservationDigest')
        self.repair.closed(records['request-binding'], 'requestDigest sourceDigest initial unitBefore')
        failure = records['failure']
        self.repair.closed(failure, 'accepted cleanup category finishedNs guestAuthority fullRehearsalAuthority')
        require(failure['accepted'] is False and failure['guestAuthority'] is False
                and failure['fullRehearsalAuthority'] is False and type(failure['finishedNs']) is int
                and 0 < failure['finishedNs'] < 2**64 and type(failure['category']) is str
                and 0 < len(failure['category']) <= 128
                and failure['cleanup'] in ('unknown', 'verified-original-unit-empty'), 'settlement-original-failure')
        self.raw_path = self.repair.seed.verify_raw_history(original)['path']
        self.raw_identity = {key: original['expectedRaw'][key] for key in
                             ('device', 'inode', 'owner', 'mode', 'links', 'logicalBytes')}
        expected_identity = [int(self.raw_identity['device']), int(self.raw_identity['inode']),
                             self.raw_identity['owner'], int(self.raw_identity['mode'], 8)]
        request_digest = pins[self.request['originalRepairRequest']]['sha256']
        source_digest = raw.digest_json({pin['path']: pin['sha256'] for pin in original['pins']})
        # Proof: history-snapshot-float/history-reservation-float re-pin canonical numeric aliases; predicate omission reaches full acceptance.
        require(original['root'] == self.request['root'] and original['state'] == self.request['state']
                and self.directory == original['state'] + '/raw-repair-' + original['nonce']
                and self.request['nonce'] != original['nonce']
                and self.reservation['nonce'] == original['nonce']
                and self.reservation['requestDigest'] == request_digest
                and self.reservation['sourceDigest'] == source_digest
                and self.reservation['originalSnapshot'] == original['expectedRaw']
                and records['request-binding']['requestDigest'] == request_digest
                and records['request-binding']['sourceDigest'] == source_digest
                and records['worker-ready']['phase'] == 'ready'
                and type(records['worker-ready']['observedNs']) is int
                and 0 < records['worker-ready']['observedNs'] < 2**64
                and raw.encode_json(records['worker-ready']['reservation']) == raw.encode_json(self.reservation)
                and raw.encode_json(records['worker-ready']['snapshot']) == raw.encode_json(original['expectedRaw'])
                and binding['request'] == request_digest and binding['source'] == source_digest
                and binding['reservationDigest'] == raw.digest_json(self.reservation)
                and binding['nonce'] == original['nonce'] and binding['rawPath'] == self.raw_path
                and binding['raw'] == expected_identity
                and type(binding['pid']) is int and binding['pid'] > 0, 'settlement-history-changed')
        import re
        # Proof: history-creator re-pins a substituted legacy creator and reaches complete credit with this composite omitted.
        require(all(type(binding[field]) is list and len(binding[field]) == 4
                    and all(type(part) is int and 0 <= part < 2**64 for part in binding[field])
                    for field in ('creator', 'originalCreator', 'raw', 'staging'))
                and binding['creator'] == raw.identity(os.lstat(self.directory))
                and binding['originalCreator'] == raw.identity(os.lstat(Path(self.raw_path).parent))
                and binding['staging'] == raw.identity(os.lstat(self.request['state']))
                and binding['unit'] == 'puni-raw-repair-' + original['nonce'] + '.service'
                and type(binding['invocation']) is str and re.fullmatch('[a-f0-9]{32}', binding['invocation'])
                and type(binding['cgroup']) is str and binding['cgroup'].startswith('/')
                and binding['cgroup'].endswith('/' + binding['unit'])
                and type(binding['start']) is str and re.fullmatch('[1-9][0-9]{0,19}', binding['start'])
                and int(binding['start']) < 2**64, 'settlement-history-native')
        capture = self.repair.seed.read_pinned_json(self.request, self.request['originalTerminalCapture'])
        check_settlement_shape(capture, 'schemaVersion kind originalDirectory originalDirectoryIdentity rawPath '
                                  'originalRawIdentity requestDigest sourceDigest reservationDigest readyDigest '
                                  'failureDigest terminal')
        # Proof: history-raw-identity-float re-pins the captured owner as float; predicate omission reaches full acceptance.
        require(type(capture['schemaVersion']) is int and capture['schemaVersion'] == 1
                and capture['kind'] == 'failed-repair-terminal-capture'
                and capture['originalDirectory'] == self.directory and capture['rawPath'] == self.raw_path
                and raw.encode_json(capture['originalRawIdentity']) == raw.encode_json(self.raw_identity)
                and capture['requestDigest'] == request_digest and capture['sourceDigest'] == source_digest
                and capture['reservationDigest'] == raw.digest_json(self.reservation)
                and capture['readyDigest'] == raw.digest_json(records['worker-ready'])
                and capture['failureDigest'] == raw.digest_json(failure), 'settlement-history-capture')
        check_settlement_directory(capture['originalDirectoryIdentity'])
        require(capture['originalDirectoryIdentity'] == self.snapshot_directory(os.lstat(self.directory)),
                'settlement-history-capture')
        check_settlement_terminal(capture['terminal'])
        self.old_binding = capture['terminal']
        require(self.old_binding['unit'] == binding['unit']
                and self.old_binding['invocation'] == binding['invocation']
                and self.old_binding['cgroup'] == binding['cgroup']
                and self.old_binding['process']['pid'] == str(binding['pid'])
                and self.old_binding['process']['start'] == binding['start']
                and self.old_binding['bootScope'] == 'observation', 'settlement-history-capture')
        self.history = {'originalNonce': original['nonce'], 'originalRequestDigest': request_digest,
                        'originalSourceDigest': source_digest,
                        'requestBindingDigest': raw.digest_json(records['request-binding']),
                        'reservationDigest': raw.digest_json(self.reservation),
                        'readyDigest': raw.digest_json(records['worker-ready']), 'failureDigest': raw.digest_json(failure),
                        'terminalCaptureDigest': pins[self.request['originalTerminalCapture']]['sha256'],
                        'originalDirectory': self.directory, 'originalRawIdentity': self.raw_identity}
        check_settlement_history(self.history)

    def observe_terminal(self, binding):
        """Observe absence by ENOENT only; a reused original PID is never signaled."""
        process = binding['process']
        try:
            start = raw.process_start(int(process['pid']))
        except FileNotFoundError:
            state = {'state': 'absent-ENOENT', 'observedStart': None}
        else:
            state = {'state': 'reused', 'observedStart': start}
        group_root = '/sys/fs/cgroup' + binding['cgroup']
        try:
            events = raw.read_text(group_root + '/cgroup.events', 4096)
        except FileNotFoundError:
            # Distinguish a collected group from a missing required file in a still-present group.
            try: os.lstat(group_root)
            except FileNotFoundError: group = {'state': 'absent-ENOENT', 'events': None, 'procs': '', 'threads': ''}
            else: raise raw.PreparationRefusal('settlement-terminal-group')
        else:
            group = {'state': 'empty', 'events': events,
                     'procs': raw.read_text(group_root + '/cgroup.procs', 4096).strip(),
                     'threads': raw.read_text(group_root + '/cgroup.threads', 4096).strip()}
        observation = {key: binding[key] for key in ('unit', 'invocation', 'cgroup', 'process')}
        observation.update(bootScope=binding['bootScope'] if 'bootScope' in binding else 'process-birth',
                           properties=raw.observe_unit(binding['unit']), processState=state, group=group)
        check_settlement_terminal(observation)
        return observation

    def observe_worker(self, pid):
        unit = 'puni-failed-settlement-' + self.request['nonce'] + '.service'
        native = raw.observe_active(unit, pid)
        binding = {key: native[key] for key in ('unit', 'invocation', 'cgroup', 'caps')}
        binding.update(process=self.observe_process(pid), limits=dict(raw.SERVICE_LIMITS))
        check_settlement_unit(binding, self.request['nonce'])
        # Proof: lab-failed-settlement.test.ts live-thread; copied predicate omission reaches accepted-G-only-K-retained.
        require(raw.read_text(f'/proc/{pid}/task/{pid}/children', 4096).strip() == ''
                and os.listdir(f'/proc/{pid}/task') == [str(pid)]
                and raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/cgroup.procs', 4096).split() == [str(pid)]
                and raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/cgroup.threads', 4096).split() == [str(pid)],
                'settlement-worker-not-sole')
        return binding

    def check_physical_profile(self, raw_fd, directory_fd, initial=False):
        """The qualified one-parent theorem is checked freshly, separately from outside-input admission."""
        import errno, fcntl
        before = os.fstat(directory_fd)
        # Proof: lab-failed-settlement.test.ts parent-inode, parent-size and 2 more vectors; copied predicate omission reaches accepted-G-only-K-retained.
        require(self.snapshot_directory(before) == self.directory_identity
                == self.snapshot_directory(os.lstat(self.directory))
                and not os.listxattr(directory_fd), 'settlement-parent-profile')
        flags = bytearray(8); fcntl.ioctl(directory_fd, 0x80086601, flags, True)
        # Proof: lab-failed-settlement.test.ts parent-inode, parent-size and 2 more vectors; copied predicate omission reaches accepted-G-only-K-retained.
        require(int.from_bytes(flags, 'little') == 524288
                and (not initial or before.st_size == before.st_blocks * 512 == 4096), 'settlement-parent-profile')
        acl_absent = False
        try: os.getxattr(directory_fd, 'system.posix_acl_default')
        except OSError as failure:
            acl_absent = failure.errno == errno.ENODATA
        # Proof: lab-failed-settlement.test.ts acl-present, acl-denied; copied predicate omission reaches accepted-G-only-K-retained.
        require(acl_absent, 'settlement-parent-acl')
        # Proof: lab-failed-settlement.test.ts foreign-lsm, ima-fix; copied predicate omission reaches accepted-G-only-K-retained.
        require(raw.read_text('/sys/kernel/security/lsm', 4096).strip()
                == 'lockdown,capability,landlock,yama,apparmor,ima,evm'
                and not any(token == 'ima_appraise' or token.startswith('ima_appraise=')
                            for token in raw.read_text('/proc/cmdline', 65536).split()), 'settlement-security-profile')
        for name in ('request-binding.json', 'reservation.json', 'worker-ready.json', 'failure.json'):
            path = Path(self.directory) / name
            # Proof: lab-failed-settlement.test.ts xattr; copied predicate omission reaches unsafe-credit.
            require(not os.listxattr(path, follow_symlinks=False), 'settlement-record-xattrs')
            self.repair.read_record(path)
        return self.repair.observe_profile(self.request, raw_fd)

    def observe_capacity(self, initial=False):
        """Inventory the fixed in-state tree once physically; retain the independent K reserve."""
        facts = self.repair.observe_facts(self.request['state'])
        # During this invocation validated owned prefixes cannot recursively grant credit.
        accounting = self.repair.read_repair_accounting(self.request['state'],
                                                        settlement=self if self.records else None)
        if initial:
            # Proof: nonce-reused admits an existing unrelated attempt identity through publication when omitted.
            require(self.request['nonce'] not in {entry['nonce'] for entry in accounting['namespaces']},
                    'settlement-nonce-reused')
        observation = {'availableMemoryBytes': str(facts['availableMemoryBytes']),
                       'freeBytes': str(facts['freeBytes']), 'retainedInodeBytes': str(facts['retainedInodeBytes']),
                       'outsideBytes': str(self.prerequisites.outside_bytes(self)),
                       'ledgerDigest': accounting['ledgerDigest'], 'unresolvedGrossBytes': accounting['unresolvedGrossBytes'],
                       'settlementDebtBytes': accounting['settlementDebtBytes'],
                       'otherFutureBytes': str(facts['otherFutureReservations']), 'observedNs': str(time.time_ns())}
        check_settlement_capacity(observation, initial)
        return observation

    def check_live(self, raw_fd, directory_fd, initial=False):
        require(self.repair.verify_inputs(self.request) == self.source, 'settlement-source-changed')
        self.repair.check_original(raw_fd, self.raw_path,
            [int(self.raw_identity['device']), int(self.raw_identity['inode']), self.raw_identity['owner'], 0o600])
        old = self.observe_terminal(self.old_binding)
        require(old == self.old_terminal, 'settlement-old-terminal-changed')
        profile = self.check_physical_profile(raw_fd, directory_fd, initial)
        capacity = self.observe_capacity(initial)
        return profile, capacity

    def publish_record(self, role, fields):
        """A witness is appended only after the actual Task111 call returns; it is never request supplied."""
        expected = SETTLEMENT_ORDER[len(self.witnesses)] if len(self.witnesses) < 8 else None
        require(role == expected, 'settlement-publication-order')
        record = self.request if role == 'request' else make_settlement_record(self, role, fields)
        self.repair.publish_settlement_record(self.directory, self.directory_fd, 'settlement-' + role + '.json', record)
        self.records[role] = record
        self.witnesses.append((role, raw.digest_json(record)))
        self.phase = role
        return record

    def launch_worker(self, channel):
        import subprocess
        arguments = self.repair.service_arguments(self.request, self.directory + '/settlement-request.json', self.request_digest)
        # Reuse every original systemd service property and replace only fixed unit/mode/worker bootstrap.
        arguments = [argument.replace('puni-raw-repair-', 'puni-failed-settlement-')
                     if argument.startswith('--unit=') else argument for argument in arguments]
        bootstrap_index = arguments.index('-c') + 1
        arguments[bootstrap_index] = self.repair._SOURCE_BOOTSTRAP + """
entry = Path(sys.argv[1])
_source_require(entry.is_absolute() and entry.name == 'lab-raw-repair.py'
                and os.path.normpath(str(entry)) == str(entry), 'settlement-source-entry')
payload = _source_capture(sys.argv[-2], _REPAIR_REQUEST_BYTES, digest=sys.argv[-1])
request, pins = _source_payload(payload, sys.argv[-1], settlement=True)
_source_require(str(entry) == request['root'] + '/tools/tool-fleet/src/lab-raw-repair.py'
                and sys.argv[-2] == request['originalDirectory'] + '/settlement-request.json', 'settlement-worker-path')
source = _source_entry(entry, pins)
sys.argv = [str(entry), '--settlement-worker', *sys.argv[-2:]]
exec(_source_compile(source, entry), {'__name__': '__main__', '__file__': str(entry)})
"""
        return subprocess.Popen(arguments, stdin=channel.recipient, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=raw.clean_environment(), preexec_fn=raw.client_limits)

    def stop_worker(self, binding):
        legacy = {'unit': binding['unit'], 'invocation': binding['invocation'], 'cgroup': binding['cgroup'],
                  'pid': int(binding['process']['pid']), 'start': binding['process']['start']}
        raw.stop_owned(legacy)
        return self.observe_terminal(binding)


def send_settlement_control(endpoint, context, phase, fields):
    import socket
    payload = raw.encode_json({'phase': phase, 'nonce': context.request['nonce'],
                               'requestDigest': context.request_digest, **fields})
    require(len(payload) <= 4096, 'settlement-control-bound')
    sent = endpoint.sendmsg([payload], [], socket.MSG_DONTWAIT)
    require(sent == len(payload), 'settlement-control-send')


def receive_settlement_control(endpoint, context, phase, peer, expected):
    import json, select, socket, struct
    require(select.select([endpoint], [], [], max(0, min(10, context.deadline-time.monotonic())))[0],
            'settlement-control-timeout')
    payload, ancillary, flags, _ = endpoint.recvmsg(4097, socket.CMSG_SPACE(12), socket.MSG_CMSG_CLOEXEC)
    require(0 < len(payload) <= 4096 and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC)
            and len(ancillary) == 1 and ancillary[0][:2] == (socket.SOL_SOCKET, socket.SCM_CREDENTIALS)
            and len(ancillary[0][2]) == 12, 'settlement-control-credentials')
    pid, uid, gid = struct.unpack('iII', ancillary[0][2])
    require((str(pid), uid, gid) == (peer['pid'], peer['uid'], peer['gid']), 'settlement-control-peer')
    try:
        observed_start = raw.process_start(pid)
    except FileNotFoundError:
        # Proof: consumed-exited reaps the real sender after its queued credentialed frame; only this phase permits ENOENT.
        require(phase == 'consumed' and context.adopted == peer and context.durable == expected,
                'settlement-consumed-context')
        sender_state = {'state': 'absent-ENOENT', 'start': None}
    else:
        require(observed_start == peer['start'], 'settlement-control-peer')
        sender_state = {'state': 'live', 'start': observed_start}
    frame = json.loads(payload)
    # Proof: lab-failed-settlement.test.ts ack-phase; copied predicate omission reaches accepted-G-only-K-retained.
    require(payload == raw.encode_json(frame) and frame == {'phase': phase,
            'nonce': context.request['nonce'], 'requestDigest': context.request_digest, **expected},
            'settlement-control-phase')
    return sender_state if phase == 'consumed' else frame


def write_settlement_frame(descriptor, frame):
    payload = raw.encode_json(frame) + b'\n'
    require(os.write(descriptor, payload) == len(payload), 'settlement-frame-write')


class SettlementPipe:
    """Capture two finite original stdout frames and stderr through EOF without replacing client facts."""

    def __init__(self, client, deadline):
        import hashlib
        self.client, self.deadline = client, deadline
        self.selector = selectors.DefaultSelector()
        self.selector.register(client.stdout, selectors.EVENT_READ, 'stdout')
        self.selector.register(client.stderr, selectors.EVENT_READ, 'stderr')
        self.payloads = {'stdout': bytearray(), 'stderr': bytearray()}
        self.offset, self.frames = 0, 0

    def poll(self):
        require(time.monotonic() < self.deadline, 'settlement-client-timeout')
        for event, _ in self.selector.select(min(.1, max(0, self.deadline-time.monotonic()))):
            chunk = os.read(event.fd, 4096)
            if not chunk: self.selector.unregister(event.fileobj)
            else:
                self.payloads[event.data].extend(chunk)
                require(len(self.payloads[event.data]) < 65536, 'settlement-client-output-bound')

    def frame(self, phase):
        import json
        while True:
            payload = self.payloads['stdout']
            end = payload.find(b'\n', self.offset)
            if end >= 0:
                encoded = bytes(payload[self.offset:end]); self.offset = end+1; self.frames += 1
                frame = json.loads(encoded)
                require(self.frames <= 2 and encoded == raw.encode_json(frame)
                        and type(frame) is dict and frame.get('phase') == phase, 'settlement-client-frame')
                return frame
            require(any(key.data == 'stdout' for key in self.selector.get_map().values()), 'settlement-client-eof')
            self.poll()

    def finish(self):
        import hashlib
        while self.selector.get_map(): self.poll()
        self.client.wait(timeout=max(.01, self.deadline-time.monotonic()))
        require(self.client.returncode == 0 and not self.payloads['stderr']
                and self.frames == 2 and self.offset == len(self.payloads['stdout']), 'settlement-client-exit')
        return {name: {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(),
                       'frames': self.frames if name == 'stdout' else 0}
                for name, payload in self.payloads.items()}

    def close(self):
        self.selector.close()


def check_settlement_worker(context, binding, channel):
    """SCM credentials select the principal; independently observed service and received descriptions join it."""
    import fcntl, re
    check_settlement_binding(binding, context)
    worker = binding['worker']; pid = int(worker['process']['pid'])
    require(context.observe_worker(pid) == worker and binding['coordinator'] == context.observe_process(os.getpid()),
            'settlement-worker-identity')
    raw_fd = os.open(f"/proc/{pid}/fd/{binding['workerRawFd']}", os.O_RDONLY | os.O_CLOEXEC)
    staging = os.stat(f"/proc/{pid}/fd/{binding['workerStagingFd']}")
    try:
        context.repair.check_original(raw_fd, context.raw_path,
            [int(context.raw_identity['device']), int(context.raw_identity['inode']), context.raw_identity['owner'], 0o600])
        info = raw.read_text(f"/proc/{pid}/fdinfo/{binding['workerRawFd']}", 4096)
        flags = re.findall(r'(?m)^flags:\s+([0-7]+)$', info)
        require(len(flags) == 1 and int(flags[0], 8) & (os.O_ACCMODE | os.O_PATH) == os.O_RDONLY,
                'settlement-worker-raw-access')
        require(context.snapshot_directory(staging) == binding['stagingIdentity']
                == context.snapshot_directory(os.fstat(channel.staging_fd)), 'settlement-staging-identity')
        lock_info = raw.read_text(f"/proc/{pid}/fdinfo/{binding['workerStagingFd']}", 4096)
        lock = (r'(?m)^lock:\s+[0-9]+: FLOCK\s+ADVISORY\s+WRITE\s+' + str(os.getpid())
                + r'\s+' + format(os.major(staging.st_dev), '02x') + ':'
                + format(os.minor(staging.st_dev), '02x') + ':' + str(staging.st_ino) + r'\s+0 EOF$')
        require(re.search(lock, lock_info) is not None, 'settlement-staging-lock')
    finally:
        os.close(raw_fd)


def run_settlement_worker(context):
    """One adopted readonly inode drain; retain shared exclusion until authenticated C acknowledgement."""
    import socket
    require(stat.S_ISSOCK(os.fstat(0).st_mode)
            and all(stat.S_ISFIFO(os.fstat(descriptor).st_mode) for descriptor in (1, 2)), 'settlement-worker-topology')
    raw.worker_limits()
    context.deadline = time.monotonic() + 850
    context.admit_request()
    endpoint = socket.socket(fileno=os.dup(0))
    resources = [endpoint]
    try:
        sender = {}
        staging_fd = context.repair.receive_staging_channel(endpoint, context.request['state'],
            context.request['nonce'], context.request_digest, sender=sender)
        resources.append(staging_fd)
        coordinator = context.observe_process(int(sender['pid']))
        require(coordinator['start'] == sender['start'] and coordinator['uid'] == int(sender['uid'])
                and coordinator['gid'] == int(sender['gid']), 'settlement-coordinator-identity')
        raw_fd = context.repair.open_original(context.raw_path, context.request['expectedRaw']); resources.append(raw_fd)
        directory_fd = raw.open_private(context.directory, directory=True); resources.append(directory_fd)
        worker = context.observe_worker(os.getpid())
        require(os.environ.get('INVOCATION_ID') == worker['invocation'], 'settlement-worker-invocation')
        context.old_terminal = context.observe_terminal(context.old_binding)
        profile, capacity = context.check_live(raw_fd, directory_fd)
        binding = {'nonce': context.request['nonce'], 'requestDigest': context.request_digest, 'sourceDigest': context.source,
                   'history': context.history, 'coordinator': coordinator, 'worker': worker,
                   'stagingIdentity': context.snapshot_directory(os.fstat(staging_fd)),
                   'originalDirectory': context.directory_identity, 'rawPath': context.raw_path,
                   'rawSnapshot': context.request['expectedRaw'], 'workerRawFd': raw_fd, 'workerStagingFd': staging_fd}
        check_settlement_binding(binding, context)
        ready = {'phase': 'ready', 'binding': binding, 'observedNs': str(time.time_ns())}
        write_settlement_frame(1, ready)
        send_settlement_control(endpoint, context, 'adopted', {'readyFrameDigest': raw.digest_json(ready)})
        # Read Y only after the authenticated grant arrives; publication cannot be assumed from a pathname.
        import select, json
        require(select.select([endpoint], [], [], 10)[0], 'settlement-control-timeout')
        preview = endpoint.recv(4097, socket.MSG_PEEK)
        grant = json.loads(preview)
        check_settlement_shape(grant, 'phase nonce requestDigest bindingDigest readyDigest oldTerminalDigest')
        expected = {key: grant[key] for key in ('bindingDigest', 'readyDigest', 'oldTerminalDigest')}
        require(expected['bindingDigest'] == raw.digest_json(binding)
                and expected['oldTerminalDigest'] == raw.digest_json(context.old_terminal), 'settlement-drain-grant')
        receive_settlement_control(endpoint, context, 'drain', coordinator, expected)
        persisted_ready = context.repair.read_record(Path(context.directory) / 'settlement-ready.json')
        require(raw.digest_json(persisted_ready) == expected['readyDigest']
                and persisted_ready['binding'] == binding, 'settlement-drain-grant')
        context.check_live(raw_fd, directory_fd)
        before = context.repair.snapshot_file(os.fstat(raw_fd))
        context.repair.check_snapshot(before, context.request['expectedRaw'])
        started = str(time.time_ns())
        # Proof: original-fsync fault preserves one actual readonly syscall and blocks all D/N/B publication.
        drained = native_call(74, ctypes.c_int(raw_fd))
        # Proof: lab-failed-settlement.test.ts original-sync; copied predicate omission reaches accepted-G-only-K-retained.
        require(drained == 0, 'settlement-original-sync')
        context.repair.check_original(raw_fd, context.raw_path,
            [int(context.raw_identity['device']), int(context.raw_identity['inode']), context.raw_identity['owner'], 0o600])
        after = context.repair.snapshot_file(os.fstat(raw_fd))
        drain = {'bindingDigest': raw.digest_json(binding), 'readyDigest': expected['readyDigest'],
                 'oldTerminalDigest': raw.digest_json(context.old_terminal), 'before': before, 'after': after,
                 'startedNs': started, 'finishedNs': str(time.time_ns()), 'operation': 'readonly-original-fd-fsync',
                 'rawWrite': False, 'contentRead': False}
        counter = {'bindingDigest': raw.digest_json(binding), 'readyDigest': expected['readyDigest'],
                   'drainDigest': raw.digest_json(make_settlement_record(context, 'drain', drain)), 'startedNs': started,
                   'finishedNs': str(time.time_ns()), 'caps': raw.read_caps(worker['cgroup']),
                   'counters': {name: raw.read_text('/sys/fs/cgroup' + worker['cgroup'] + '/' + name, 4096).strip()
                                for name in raw.COUNTERS},
                   'measurementPhase': 'after-original-drain-before-settlement-worker-exit', 'drained': True}
        check_settlement_counter(counter, binding, int(ready['observedNs']), time.time_ns())
        write_settlement_frame(1, {'phase': 'drained', 'drain': drain, 'counter': counter})
        send_settlement_control(endpoint, context, 'drained', {'drainDigest': counter['drainDigest'],
            'counterDigest': raw.digest_json(make_settlement_record(context, 'counter', counter))})
        require(select.select([endpoint], [], [], 10)[0], 'settlement-control-timeout')
        preview = json.loads(endpoint.recv(4097, socket.MSG_PEEK))
        check_settlement_shape(preview, 'phase nonce requestDigest bindingDigest counterDigest drainDigest barrierDigest')
        acknowledgement = {key: preview[key] for key in ('bindingDigest', 'counterDigest', 'drainDigest', 'barrierDigest')}
        require(acknowledgement['bindingDigest'] == raw.digest_json(binding)
                and acknowledgement['counterDigest'] == raw.digest_json(make_settlement_record(context, 'counter', counter))
                and acknowledgement['drainDigest'] == counter['drainDigest'], 'settlement-durable-ack')
        receive_settlement_control(endpoint, context, 'durable', coordinator, acknowledgement)
        barrier = context.repair.read_record(Path(context.directory) / 'settlement-barrier.json')
        require(acknowledgement['barrierDigest'] == raw.digest_json(barrier), 'settlement-durable-ack')
        send_settlement_control(endpoint, context, 'consumed', acknowledgement)
    except BaseException as failure:
        context.repair._close_staging_resources(reversed(resources), failure)
    else:
        context.repair._close_staging_resources(reversed(resources))


def coordinate_settlement(context):
    """One fresh conditional invocation; every durable slot is written once and every causal barrier is real."""
    import socket
    context.deadline = time.monotonic() + 910
    context.admit_request()
    resources = []
    client = pipe = channel = None
    accepted = publication_failed = False
    failure = None
    try:
        channel = context.repair.open_staging_channel(context.request['state'], context.request['nonce'], context.request_digest)
        resources.append(channel)
        channel.control.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
        context.directory_fd = raw.open_private(context.directory, directory=True); resources.append(context.directory_fd)
        raw_fd = context.repair.open_original(context.raw_path, context.request['expectedRaw']); resources.append(raw_fd)
        # Complete initial enumeration is required even when R does not survive a former allocating failure.
        names = set(os.listdir(context.directory_fd))
        require(names == {'request-binding.json', 'reservation.json', 'worker-ready.json', 'failure.json'},
                'settlement-attempt-occupied')
        context.old_terminal = context.observe_terminal(context.old_binding)
        context.profile, initial_capacity = context.check_live(raw_fd, context.directory_fd, initial=True)
        # Proof: consume-then-create fault leaves O only; a second invocation cannot call the allocator.
        context.prerequisites.consume(context)
        def publish_record(role, fields):
            nonlocal publication_failed
            context.check_live(raw_fd, context.directory_fd)
            try: return context.publish_record(role, fields)
            except BaseException:
                publication_failed = True
                raise
        publish_record('request', {})
        client = context.launch_worker(channel)
        channel.close_recipient()
        pipe = SettlementPipe(client, context.deadline)
        frame = pipe.frame('ready'); check_settlement_shape(frame, 'phase binding observedNs')
        binding = frame['binding']
        check_settlement_worker(context, binding, channel)
        receive_settlement_control(channel.control, context, 'adopted', binding['worker']['process'],
                           {'readyFrameDigest': raw.digest_json(frame)})
        context.binding = binding
        context.adopted = binding['worker']['process']
        # Proof: lab-failed-settlement.test.ts ready-stale; copied predicate omission reaches accepted-G-only-K-retained.
        require(0 <= time.time_ns() - parse_settlement_unsigned(frame['observedNs'], True) <= 10 * 10**9,
                'settlement-ready-time')
        context.check_live(raw_fd, context.directory_fd)
        ready = publish_record('ready', {'binding': binding, 'observedNs': frame['observedNs'],
            'oldTerminal': context.old_terminal, 'profile': context.profile, 'initialCapacity': initial_capacity,
            'adoption': {'coordinator': binding['coordinator'], 'worker': binding['worker']['process'],
                         'stagingIdentity': binding['stagingIdentity'], 'requestDigest': context.request_digest}})
        binding_digest = raw.digest_json(binding)
        send_settlement_control(channel.control, context, 'drain', {'bindingDigest': binding_digest,
            'readyDigest': raw.digest_json(ready), 'oldTerminalDigest': raw.digest_json(context.old_terminal)})
        frame = pipe.frame('drained'); check_settlement_shape(frame, 'phase drain counter')
        check_settlement_worker(context, binding, channel)
        drain = make_settlement_record(context, 'drain', frame['drain'])
        counter = make_settlement_record(context, 'counter', frame['counter'])
        receive_settlement_control(channel.control, context, 'drained', binding['worker']['process'],
                           {'drainDigest': raw.digest_json(drain), 'counterDigest': raw.digest_json(counter)})
        candidate = {**context.records, 'drain': drain, 'counter': counter}
        check_settlement_records(context, candidate, context.reservation)
        publish_record('drain', frame['drain'])
        publish_record('counter', frame['counter'])
        # Only actual N return creates A; preserve native evaluations in watched guard faults.
        require(context.witnesses[-1] == ('counter', raw.digest_json(counter)), 'settlement-A-witness')
        check_settlement_worker(context, binding, channel)
        context.check_live(raw_fd, context.directory_fd)
        barrier = publish_record('barrier', {'bindingDigest': binding_digest, 'drainDigest': raw.digest_json(drain),
            'counterDigest': raw.digest_json(counter), 'profileDigest': raw.digest_json(context.profile),
            'oldTerminalDigest': raw.digest_json(context.old_terminal),
            'publication': 'counter-directory-A-before-barrier-directory-C', 'observedNs': str(time.time_ns())})
        require(context.witnesses[-2:] == [('counter', raw.digest_json(counter)), ('barrier', raw.digest_json(barrier))],
                'settlement-C-witness')
        check_settlement_worker(context, binding, channel)
        context.check_live(raw_fd, context.directory_fd)
        durable = {'bindingDigest': binding_digest, 'counterDigest': raw.digest_json(counter),
                   'drainDigest': raw.digest_json(drain), 'barrierDigest': raw.digest_json(barrier)}
        send_settlement_control(channel.control, context, 'durable', durable)
        context.durable = dict(durable)
        consumed_process = receive_settlement_control(channel.control, context, 'consumed', binding['worker']['process'], durable)
        captures = pipe.finish()
        terminal = context.observe_terminal(binding['worker'])
        terminal = context.stop_worker(binding['worker'])
        check_settlement_terminal(terminal)
        # Proof: lab-failed-settlement.test.ts new-terminal-failed; copied predicate omission reaches accepted-G-only-K-retained.
        require(terminal['properties']['Result'] in ('', 'success')
                and terminal['properties']['ExecMainStatus'] in ('', '0'), 'settlement-new-terminal-failed')
        context.check_live(raw_fd, context.directory_fd)
        cleanup = {'state': 'verified-original-unit-empty', 'terminalDigest': raw.digest_json(terminal)}
        final_snapshot = context.repair.snapshot_file(os.fstat(raw_fd))
        certificate = publish_record('certificate', {'bindingDigest': binding_digest, 'readyDigest': raw.digest_json(ready),
            'drainDigest': raw.digest_json(drain), 'counterDigest': raw.digest_json(counter),
            'barrierDigest': raw.digest_json(barrier), 'profile': context.profile, 'oldTerminal': context.old_terminal,
            'newTerminal': terminal, 'cleanup': cleanup, 'durableAck': {'requestDigest': context.request_digest,
                **durable, 'consumed': True, 'senderState': consumed_process}, 'finalSnapshot': final_snapshot,
            'finalCapacity': context.observe_capacity(), 'issuedNs': str(time.time_ns()),
            'releasedReservationDigest': raw.digest_json(context.reservation),
            'releasedGrossBytes': context.reservation['grossBytes'], 'retainedSettlementDebtBytes': str(SETTLEMENT_DEBT),
            **SETTLEMENT_AUTHORITY})
        receipt = publish_record('receipt', {'certificateDigest': raw.digest_json(certificate),
            'counterDigest': raw.digest_json(counter), 'barrierDigest': raw.digest_json(barrier),
            'terminalDigest': raw.digest_json(terminal), 'finishedNs': str(time.time_ns()), 'accepted': True,
            'scope': 'failed-repair-settlement', 'releasedReservationDigest': raw.digest_json(context.reservation),
            'releasedGrossBytes': context.reservation['grossBytes'], 'retainedSettlementDebtBytes': str(SETTLEMENT_DEBT),
            **SETTLEMENT_AUTHORITY})
        execution = publish_record('execution', {'outcome': 'accepted', 'bindingDigest': binding_digest,
            'receiptDigest': raw.digest_json(receipt), 'certificateDigest': raw.digest_json(certificate),
            'workerClientExit': client.returncode, **captures, 'originalTerminalDigest': raw.digest_json(context.old_terminal),
            'newTerminalDigest': raw.digest_json(terminal), 'cleanup': cleanup,
            'finishedNs': str(time.time_ns()), 'sourcePinsDigest': context.source})
        accepted = True
        check_settlement_records(context, context.records, context.reservation)
        summary = context.repair.read_repair_accounting(context.request['state'])
        require(any(record['reservationDigest'] == raw.digest_json(context.reservation) for record in summary['settled'])
                and summary['settlementDebtBytes'] == str(SETTLEMENT_DEBT), 'settlement-readback')
        envelope = {'schemaVersion': 1, 'scope': 'failed-repair-settlement', 'accepted': True,
                    'nonce': context.request['nonce'], 'receiptDigest': raw.digest_json(receipt),
                    'executionDigest': raw.digest_json(execution), 'releasedReservationDigest': raw.digest_json(context.reservation),
                    'releasedGrossBytes': context.reservation['grossBytes'],
                    'retainedSettlementDebtBytes': str(SETTLEMENT_DEBT), **SETTLEMENT_AUTHORITY}
    except BaseException as primary:
        failure = primary
        cleanup = 'not-started'
        if context.binding is not None:
            try:
                context.stop_worker(context.binding['worker'])
                cleanup = 'verified-original-unit-empty'
            except BaseException as cleanup_failure:
                failure = BaseExceptionGroup('settlement owned cleanup failed', [primary, cleanup_failure])
                cleanup = 'uncertain'
        if not accepted and context.witnesses and not publication_failed:
            try:
                context.check_live(raw_fd, context.directory_fd)
                record = make_settlement_record(context, 'failure', {'phase': context.phase,
                    'category': 'cleanup-uncertain' if cleanup == 'uncertain' else 'protocol-refused',
                    'cleanup': cleanup, 'observedNs': str(time.time_ns()),
                    'bindingDigest': raw.digest_json(context.binding) if context.binding is not None else None,
                    'retainedGrossBytes': context.reservation['grossBytes'],
                    'retainedSettlementDebtBytes': str(SETTLEMENT_DEBT), 'accepted': False, **SETTLEMENT_AUTHORITY})
                context.repair.publish_settlement_record(context.directory, context.directory_fd,
                                                        'settlement-failure.json', record)
                refused = make_settlement_record(context, 'execution', {'outcome': 'refused', 'phase': context.phase,
                    'category': record['category'], 'bindingDigest': record['bindingDigest'],
                    'cleanup': cleanup, 'finishedNs': str(time.time_ns())})
                context.repair.publish_settlement_record(context.directory, context.directory_fd,
                                                        'settlement-execution.json', refused)
            except BaseException as publication_failure:
                failure = BaseExceptionGroup('settlement failure publication failed', [failure, publication_failure])
    finally:
        if pipe is not None: resources.append(pipe)
        if client is not None:
            try:
                if client.poll() is None: client.kill()
                client.wait(timeout=5)
            except BaseException as client_failure:
                failure = client_failure if failure is None else BaseExceptionGroup('settlement client cleanup failed', [failure, client_failure])
            resources.extend((client.stdout, client.stderr))
        context.repair._close_staging_resources(reversed(resources), failure)
    return envelope
