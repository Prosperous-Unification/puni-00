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
