import array
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import stat
import struct
import subprocess
import sys
import time
import types

RELATIVE = 'openspec/changes/observability-environment-parity/evidence/staging-native-control.py'
ROOT = Path(__file__).resolve().parents[4]
CONTROL = RELATIVE.replace('staging-native-control.py', 'repair-native-control.py')
LABELS = ('live', 'dead')


def capture_source(path, limit, pin=None, expected=None):
    """Capture private request or fixed source bytes before executing any repository import."""
    before = os.lstat(path)
    mark = lambda observed: (observed.st_dev, observed.st_ino, observed.st_uid, observed.st_mode,
        observed.st_nlink, observed.st_size, observed.st_mtime_ns, observed.st_ctime_ns)
    # Proof: startup unreadable/unsafe/bound/source-hash vectors precede control execution.
    if not (stat.S_ISREG(before.st_mode) and before.st_nlink == 1
            and before.st_uid == os.geteuid() and bool(before.st_mode & 0o400)
            and stat.S_IMODE(before.st_mode) == (0o600 if pin is None else 0o644)
            and 0 < before.st_size <= limit):
        raise ValueError('staging-source-identity')
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        payload = os.read(descriptor, limit + 1)
        # Proof: startup wrong-hash omission executes the otherwise refused control marker.
        if not (len(payload) == before.st_size and mark(before) == mark(os.fstat(descriptor))
                == mark(os.lstat(path)) and hashlib.sha256(payload).hexdigest()
                == (expected if pin is None else pin['sha256'])
                and (pin is None or pin == dict(path=str(path), sha256=pin['sha256'],
                    bytes=len(payload), uid=os.geteuid(), mode=0o644))):
            raise ValueError('staging-source-binding')
        return payload
    finally:
        os.close(descriptor)


def load_control(arguments):
    """The launcher trusts only its fixed sibling role, SHA-bound by a private bounded request."""
    # Proof: startup bad-action omission reaches verified control execution.
    if not (len(arguments) == 4 and arguments[0] in ('run', 'worker')
            and re.fullmatch('[a-f0-9]{64}', arguments[2])
            and re.fullmatch('[a-f0-9]{32}', arguments[3])):
        raise ValueError('staging-arguments')
    path = ROOT / '.superpowers/sdd/observability-environment-parity/repair-native-controls' / ('request-' + arguments[3] + '.json')
    # Proof: startup foreign-path omission executes control against the canonical request.
    if str(path) != arguments[1]:
        raise ValueError('staging-request-path')
    payload = capture_source(path, 65536, expected=arguments[2])
    def unique(pairs):
        record = {}
        for key, value in pairs:
            if key in record:
                raise ValueError('staging-request-json')
            record[key] = value
        return record
    request = json.loads(payload, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(ValueError('staging-request-json')))
    if not (type(request) is dict and type(request.get('pins')) is list):
        raise ValueError('staging-request-pins')
    captures = {}
    for relative, limit in ((CONTROL, 98304), (RELATIVE, 65536)):
        selected = [pin for pin in request['pins'] if type(pin) is dict and pin.get('path') == str(ROOT / relative)]
        # Proof: startup duplicate-role omission executes the otherwise refused control.
        if len(selected) != 1:
            raise ValueError('staging-source-role')
        captures[str(ROOT / relative)] = capture_source(ROOT / relative, limit, pin=selected[0])
    module = types.ModuleType('staging_shared_control')
    module.__file__ = str(ROOT / CONTROL)
    sys.modules[module.__name__] = module
    exec(compile(captures[module.__file__], module.__file__, 'exec', dont_inherit=True), module.__dict__)
    return module, captures


def name_unit(nonce, label):
    return 'puni-staging-' + label + '-' + nonce + '.service'


def check_fixture(control, request, label):
    fixture = request['fixtures'][label]
    observed = control.check_directory(fixture['path'], private=True)
    # Proof: fixture identity/foreign inode/nonempty vectors refuse before launch or adoption.
    control.require((str(observed.st_dev), str(observed.st_ino), observed.st_uid,
                     format(stat.S_IMODE(observed.st_mode), '04o'))
                    == (fixture['device'], fixture['inode'], fixture['owner'], fixture['mode'])
                    and os.listdir(fixture['path']) == [], 'staging-fixture-binding')
    return fixture['path']


def send_packet(control, endpoint, frame, deadline):
    control.assert_deadline(deadline)
    payload = control.encode(frame)
    # Proof: packets short-send dependency returns one byte short; omitted guard accepts it.
    control.require(endpoint.sendmsg([payload], [], socket.MSG_DONTWAIT) == len(payload), 'staging-packet-send')
    control.assert_deadline(deadline)


def receive_packet(control, endpoint, deadline, budget):
    """Authenticate the actual sender of each packet, closing every unexpected received right."""
    control.assert_deadline(deadline)
    with selectors.DefaultSelector() as selector:
        selector.register(endpoint, selectors.EVENT_READ)
        control.require(bool(selector.select(control.remaining_time(deadline))), 'staging-packet-timeout')
    payload, ancillary, flags, address = endpoint.recvmsg(min(65537, budget + 1),
        socket.CMSG_SPACE(64) + socket.CMSG_SPACE(12), socket.MSG_DONTWAIT | socket.MSG_CMSG_CLOEXEC)
    credentials = []
    unexpected = False
    for level, kind, content in ancillary:
        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
            rights = array.array('i')
            rights.frombytes(content[:len(content) - len(content) % rights.itemsize])
            for descriptor in rights:
                os.close(descriptor)
            unexpected = True
        elif level == socket.SOL_SOCKET and kind == socket.SCM_CREDENTIALS and len(content) == 12:
            credentials.append(struct.unpack('iII', content))
        else:
            unexpected = True
    # Proof: packet credentials/rights/truncation/output vectors watch refusal on real recvmsg.
    control.require(not unexpected and len(credentials) == len(ancillary) == 1
                    and not flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC)
                    and 0 < len(payload) <= budget, 'staging-packet-auth')
    frame = control.decode(payload)
    # Proof: packets noncanonical JSON is accepted only with this guard omitted.
    control.require(payload == control.encode(frame), 'staging-packet-canonical')
    control.assert_deadline(deadline)
    return frame, credentials[0], len(payload)


def is_occupied(control, raw, path):
    try:
        descriptor = raw.acquire_staging(path)
    except raw.PreparationRefusal as failure:
        control.require(str(failure) == 'raw-staging-occupied', 'staging-competition-refusal')
        return True
    os.close(descriptor)
    return False


def create_dead_channel(control, helpers, path, nonce, request_sha, deadline):
    """Only the owned fork receives a fixed real socketpair constructor seam; no FD broker exists."""
    repair, raw = helpers['repair'], helpers['raw']
    parent, recipient = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET | socket.SOCK_CLOEXEC)
    parent.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
    reader, writer = os.pipe2(os.O_CLOEXEC)
    pid = os.fork()
    if pid == 0:
        try:
            os.dup2(parent.fileno(), 0)
            os.dup2(recipient.fileno(), 1)
            os.dup2(writer, 2)
            # Includes any inherited global admission-lock duplicate and unrelated authority.
            control.close_authorities(-1)
            repair.socket.socketpair = lambda *_: (socket.socket(fileno=0), socket.socket(fileno=1))
            channel = repair.open_staging_channel(path, nonce, request_sha)
            control.send_frame(2, {'pid': str(os.getpid()), 'start': raw.process_start(os.getpid())})
            channel.close()
            os._exit(0)
        except BaseException:
            os._exit(1)
    os.close(writer)
    child_start = raw.process_start(pid)
    reaped = False
    try:
        sender = control.receive_frame(raw, reader, min(deadline, time.monotonic() + 1))
        while True:
            control.assert_deadline(deadline)
            ended, status = os.waitpid(pid, os.WNOHANG)
            if ended:
                reaped = True
                control.require(ended == pid and os.waitstatus_to_exitcode(status) == 0
                    and sender == {'pid': str(pid), 'start': child_start}, 'staging-dead-child')
                break
            with selectors.DefaultSelector() as selector:
                selector.select(min(.005, control.remaining_time(deadline)))
        return repair.StagingChannel(parent, recipient, None), sender
    except BaseException:
        ended = pid if reaped else os.waitpid(pid, os.WNOHANG)[0]
        if not ended:
            # Only this original, unreaped owned child can still carry this PID.
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        parent.close()
        recipient.close()
        raise
    finally:
        os.close(reader)


def check_reply(control, request, label, request_sha, source, frame, credentials, helpers, deadline, phase='ready'):
    control.closed(frame, 'phase binding observedNs outcome sender', 'staging-ready-schema')
    binding = frame['binding']
    control.closed(binding, 'pid start unit invocation cgroup caps request nonce source processLimits', 'staging-binding-schema')
    pid, uid, gid = credentials
    # Proof: wrong native PID/start/unit/request/source credentials vectors refuse before ACK.
    control.require(frame['phase'] == phase and binding['request'] == request_sha
        and binding['nonce'] == request['nonce'] and binding['source'] == source
        and binding['unit'] == name_unit(request['nonce'], label)
        and type(binding['pid']) is int and pid == binding['pid'] and pid > 0
        and uid == os.geteuid() and gid == os.getegid()
        and type(frame['observedNs']) is str and re.fullmatch(r'0|[1-9][0-9]{0,19}', frame['observedNs'])
        and int(frame['observedNs']) < 2**64 and 0 <= time.time_ns() - int(frame['observedNs']) <= 2*10**9,
        'staging-ready-binding')
    native = helpers['raw'].observe_active(binding['unit'], pid, control.CAPS, control.LIMITS)
    # Proof: transport forged-start refuses at the independently observed native join.
    control.require(all(binding[key] == value for key, value in native.items())
        and control.observe_process_limits(pid) == binding['processLimits'], 'staging-ready-native')
    control.assert_deadline(deadline)
    return binding


def release_worker(control, raw, binding, deadline):
    """Signal only the original native process through a freshly joined owned pidfd."""
    control.assert_deadline(deadline)
    descriptor = os.pidfd_open(binding['pid'], 0)
    try:
        native = raw.observe_active(binding['unit'], binding['pid'], control.CAPS, control.LIMITS)
        # Proof: pidfd-start/native substitutions refuse before signaling the owned process.
        control.require(all(binding[key] == value for key, value in native.items())
                        and raw.process_start(binding['pid']) == binding['start'], 'staging-signal-binding')
        control.assert_deadline(deadline)
        signal.pidfd_send_signal(descriptor, signal.SIGUSR1)
    finally:
        os.close(descriptor)


def run_worker(control, request, request_sha, helpers, source, deadline):
    raw, repair = helpers['raw'], helpers['repair']
    control.check_process_limits(worker=True)
    group = raw.process_cgroup(os.getpid())
    labels = [label for label in LABELS if group.endswith('/' + name_unit(request['nonce'], label))]
    control.require(len(labels) == 1, 'staging-worker-unit')
    label = labels[0]
    path = check_fixture(control, request, label)
    native = raw.observe_active(name_unit(request['nonce'], label), os.getpid(), control.CAPS, control.LIMITS)
    binding = dict(native, request=request_sha, nonce=request['nonce'], source=source,
                   processLimits=control.observe_process_limits(os.getpid()))
    held = None
    endpoint = socket.socket(fileno=os.dup(0))
    try:
        packet = control.decode(endpoint.recv(4097, socket.MSG_PEEK | socket.MSG_DONTWAIT))
        sender = {'pid': packet['pid'], 'start': packet['start']}
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGUSR1})
        send_packet(control, endpoint, dict(phase='started', binding=binding, observedNs=str(time.time_ns()),
            outcome='queued', sender=sender), deadline)
        released = signal.sigtimedwait({signal.SIGUSR1}, control.remaining_time(deadline))
        # Proof: absent/foreign release signals never authorize consuming the queued handoff.
        control.require(released is not None and released.si_signo == signal.SIGUSR1
                        and (str(released.si_pid), released.si_uid) == (control.STAGING_COORDINATOR[0], os.geteuid())
                        and raw.process_start(released.si_pid) == control.STAGING_COORDINATOR[1], 'staging-startup-signal')
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        coordinator_credentials = (released.si_pid, released.si_uid, os.getegid())
        try:
            held = repair.receive_staging_channel(endpoint, path, request['nonce'], request_sha)
            outcome = 'adopted'
        except FileNotFoundError as failure:
            # Proof: dead receiver accepts only the exact original sender's absent stat, never arbitrary ENOENT.
            control.require(label == 'dead' and failure.filename == '/proc/' + sender['pid'] + '/stat'
                            and not os.path.exists(failure.filename), 'staging-dead-refusal')
            outcome = 'dead-sender-refused'
        except raw.PreparationRefusal as failure:
            control.require(label == 'dead' and str(failure) == 'repair-channel-start'
                and raw.process_start(int(sender['pid'])) != sender['start'], 'staging-dead-refusal')
            outcome = 'dead-sender-refused'
        control.require(outcome == ('adopted' if label == 'live' else 'dead-sender-refused'), 'staging-worker-outcome')
        ready_ns = time.time_ns()
        send_packet(control, endpoint, dict(phase='ready', binding=binding, observedNs=str(ready_ns),
            outcome=outcome, sender=sender), deadline)
        ack, credentials, width = receive_packet(control, endpoint, deadline, control.OUTPUT_LIMIT)
        raw.check_ack(ack, binding, request_sha)
        # Proof: transport foreign-ack uses a real same-UID child; omission admits its ACK.
        control.require(credentials == coordinator_credentials, 'staging-ack-credentials')
        started_ns = time.time_ns()
        control.require(raw.observe_active(binding['unit'], os.getpid(), control.CAPS, control.LIMITS) == native,
                        'staging-worker-native')
        counter = control.collect_counter(raw, binding, ready_ns, started_ns)
        raw.check_counter(counter, binding, ready_ns, time.time_ns(), control.CAPS, ('controlled',))
        send_packet(control, endpoint, {'phase': 'complete', 'binding': binding, 'counter': counter}, deadline)
        ack, final_credentials, width = receive_packet(control, endpoint, deadline, control.OUTPUT_LIMIT)
        control.require(final_credentials == credentials, 'staging-ack-credentials')
        raw.check_ack(ack, binding, request_sha)
    finally:
        if held is not None:
            os.close(held)
        endpoint.close()


def coordinate_staging(control, request, request_path, request_sha, nonce, source, helpers, started, deadline, probe_cutoff):
    """Compose the established admission, observers, counters and durability around two tiny real handoffs."""
    raw, repair = helpers['raw'], helpers['repair']
    # Proof: global-holder refuses before admission; broken acquire admits real competing flock at capacity.
    staging = raw.acquire_staging(request['state'])
    try:
        control.check_loaded_runtime(request, deadline)
        control.check_directory(request['packet'], private=True)
        control.observe_capacity(request, helpers, deadline, initial=True, exact=True)
        for label in LABELS:
            check_fixture(control, request, label)
            control.require(raw.observe_unit(name_unit(nonce, label))['LoadState'] == 'not-found', 'unit-collision')
        published = 0
        total_output = 0
        for label in LABELS:
            control.assert_deadline(deadline)
            control.observe_capacity(request, helpers, deadline, initial=label == 'live', exact=label == 'live')
            path = check_fixture(control, request, label)
            if label == 'live':
                channel = repair.open_staging_channel(path, nonce, request_sha)
                sender = {'pid': str(os.getpid()), 'start': raw.process_start(os.getpid())}
                channel.control.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
            else:
                channel, sender = create_dead_channel(control, helpers, path, nonce, request_sha, deadline)
            invocation = None
            binding = None
            accepted = False
            stage = 'queued'
            streams = {name: {'bytes': 0, 'hash': hashlib.sha256(), 'complete': False} for name in ('stdout', 'stderr')}
            try:
                control.require(is_occupied(control, raw, path), 'staging-queued-unlocked')
                pin = next(pin for pin in request['pins'] if pin['path'] == str(control.ROOT / RELATIVE))
                bootstrap = control.WORKER_BOOTSTRAP.replace('evidence/repair-native-control.py', 'evidence/staging-native-control.py').replace('98304', '65536').replace('98305', '65537')
                bootstrap = bootstrap.replace('root, expected, request, request_sha, nonce = sys.argv[1:]',
                    'root, expected, request, request_sha, nonce, coordinator_pid, coordinator_start = sys.argv[1:]')
                bootstrap = bootstrap.replace("sys.argv = [path, 'worker', request, request_sha, nonce]",
                    "sys.argv = [path, 'worker', request, request_sha, nonce, coordinator_pid, coordinator_start]")
                coordinator = (str(os.getpid()), raw.process_start(os.getpid()))
                command = ['/usr/bin/systemd-run', '--user', '--quiet', '--pipe', '--wait', '--collect',
                    '--setenv=LANG=C', '--setenv=LC_ALL=C', '--service-type=exec', '--unit=' + name_unit(nonce, label),
                    *('--property=' + value for value in control.PROPERTIES), '/usr/bin/python3.12', '-I', '-B', '-c',
                    bootstrap, str(control.ROOT), pin['sha256'], str(request_path), request_sha, nonce, *coordinator]
                control.assert_deadline(deadline)
                invocation = subprocess.Popen(command, stdin=channel.recipient, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    env=control.fixed_environment(), preexec_fn=raw.client_limits)
                channel.close_recipient()
                launched, start_credentials, width = receive_packet(control, channel.control, deadline, control.OUTPUT_LIMIT-total_output)
                total_output += width
                binding = check_reply(control, request, label, request_sha, source, launched, start_credentials, helpers, deadline, 'started')
                control.require(launched['sender'] == sender and launched['outcome'] == 'queued'
                                and is_occupied(control, raw, path), 'staging-startup-exclusion')
                stage = 'started-queued'
                release_worker(control, raw, binding, deadline)
                ready, credentials, width = receive_packet(control, channel.control, deadline, control.OUTPUT_LIMIT-total_output)
                total_output += width
                stage = 'ready'
                control.require(check_reply(control, request, label, request_sha, source, ready, credentials, helpers, deadline) == binding
                                and credentials == start_credentials, 'staging-adopted-native')
                # Proof: case-outcome omission admits a falsely labeled actual handoff.
                control.require(ready['sender'] == sender and ready['outcome'] == ('adopted' if label == 'live' else 'dead-sender-refused'),
                                'staging-case-binding')
                if label == 'live':
                    os.close(channel.staging_fd)
                    channel.staging_fd = None
                # Proof: early unlock / leaked dead right are detected by real competing flock acquisitions.
                control.require(is_occupied(control, raw, path) == (label == 'live'), 'staging-adoption-exclusion')
                control.require(control.verify_environment(request, deadline)[0] == source, 'source-binding')
                control.observe_capacity(request, helpers, deadline)
                send_packet(control, channel.control, {'bindingDigest': raw.digest_json(binding), 'request': request_sha}, deadline)
                complete, final_credentials, width = receive_packet(control, channel.control, deadline, control.OUTPUT_LIMIT-total_output)
                total_output += width
                control.closed(complete, 'phase binding counter', 'staging-complete-schema')
                # Proof: complete-phase omission accepts a foreign phase over the real socket.
                control.require(complete['phase'] == 'complete' and complete['binding'] == binding
                                and final_credentials == credentials, 'staging-complete-binding')
                raw.check_counter(complete['counter'], binding, int(ready['observedNs']), time.time_ns(), control.CAPS, ('controlled',))
                native = raw.observe_active(binding['unit'], binding['pid'], control.CAPS, control.LIMITS)
                control.require(all(binding[key] == value for key, value in native.items()), 'staging-complete-native')
                control.require(is_occupied(control, raw, path) == (label == 'live'), 'staging-preack-exclusion')
                published += control.persist_projection(request['packet'], nonce,
                    {'phase': label + '-durable', 'request': request_sha, 'source': source, 'ready': ready,
                     'started': launched, 'complete': complete, 'command': command, 'socketpairSeam': label == 'dead'}, control.OUTPUT_LIMIT-published, deadline)
                stage = 'durable'
                # Proof: publication fsync failure prevents this ACK and closes the owned service/client.
                send_packet(control, channel.control, {'bindingDigest': raw.digest_json(binding), 'request': request_sha}, deadline)
                control.read_service(invocation, streams, deadline, drain=True)
                control.require(invocation.wait(timeout=min(2, control.remaining_time(deadline))) == 0, 'service-client-exit')
                total_output += sum(stream['bytes'] for stream in streams.values())
                # Proof: private-stderr/trailing-stdout/output-overflow refuse after actual pipe drain.
                control.require(total_output <= control.OUTPUT_LIMIT and all(stream['complete'] and stream['bytes'] == 0
                                for stream in streams.values()), 'service-trailing-output')
                probe_cutoff[0] = started + 20
                terminal = raw.observe_unit(binding['unit'])
                events = raw.group_events(binding['cgroup'])
                raw.check_terminal(terminal, events, invocation.returncode)
                raw.stop_owned(binding)
                repeated = raw.observe_unit(binding['unit'])
                repeated_events = raw.group_events(binding['cgroup'])
                raw.check_terminal(repeated, repeated_events, invocation.returncode)
                raw.stop_owned(binding)
                channel.close()
                control.require(not is_occupied(control, raw, path), 'staging-terminal-exclusion')
                final_capacity = control.observe_capacity(request, helpers, deadline)
                published += control.persist_projection(request['packet'], nonce,
                    {'phase': label + '-terminal', 'request': request_sha, 'binding': binding, 'terminal': terminal,
                     'events': events, 'repeated': repeated, 'repeatedEvents': repeated_events,
                     'repeatOwnedCleanup': True, 'finalCapacity': final_capacity,
                     'elapsedMilliseconds': str(int((time.monotonic()-started)*1000))}, control.OUTPUT_LIMIT-published-80, deadline)
                accepted = True
            except BaseException as failure:
                probe_cutoff[0] = started + 20
                if invocation is not None:
                    try:
                        invocation.wait(timeout=min(.1, control.remaining_time(started+20)))
                    except subprocess.TimeoutExpired:
                        pass  # A still-running original client is modeled and cleaned below.
                    control.read_service(invocation, streams, min(started+20, time.monotonic()+.1), drain=True)
                category = str(failure) if isinstance(failure, control.Refusal) else 'failure-unavailable'
                if re.fullmatch('[a-z0-9-]{1,64}', category) is None:
                    category = 'failure-unavailable'
                control.persist_projection(request['packet'], nonce,
                    {'phase': label + '-failure', 'request': request_sha, 'accepted': False, 'stage': stage,
                     'category': category, 'workerBinding': binding if binding is not None else 'unavailable',
                     'counter': 'unavailable', 'clientPid': str(invocation.pid) if invocation is not None else 'unavailable',
                     'clientExit': invocation.poll() if invocation is not None else 'unavailable',
                     'streams': {name: {'bytes': stream['bytes'], 'sha256': stream['hash'].hexdigest(),
                        'complete': stream['complete']} for name, stream in streams.items()}},
                    control.OUTPUT_LIMIT-published, started+20)
                raise
            finally:
                probe_cutoff[0] = started + 20
                try:
                    if not accepted and binding is not None:
                        raw.stop_owned(binding)
                finally:
                    try:
                        if invocation is not None:
                            if invocation.poll() is None:
                                invocation.kill()
                            invocation.wait(timeout=min(.2, control.remaining_time(started+20)))
                            invocation.stdout.close()
                            invocation.stderr.close()
                    finally:
                        channel.close()
        print('{"phase":"qualified-staging-channel-only"}')
    finally:
        os.close(staging)


def expire_startup(_number, _frame):
    os.write(2, b'staging-native-control: controller-wall-timeout-unaccepted\n')
    os._exit(124)


def cancel_startup(_number, _frame):
    raise ValueError('staging-cancelled')


def main(arguments):
    if arguments == ['ast-check']:
        ast.parse(Path(__file__).read_bytes())
        print('staging-native-control: AST-valid')
        return
    signal.signal(signal.SIGALRM, expire_startup)
    signal.signal(signal.SIGINT, cancel_startup)
    signal.signal(signal.SIGTERM, cancel_startup)
    signal.alarm(20)
    worker = len(arguments) > 0 and arguments[0] == 'worker'
    # Proof: worker internal-argv missing/malformed/stale controller vectors precede packet consumption.
    if worker and not (len(arguments) == 6 and all(re.fullmatch(r'0|[1-9][0-9]{0,19}', value)
            and int(value) < 2**64 for value in arguments[4:]) and int(arguments[4]) > 0):
        raise ValueError('staging-coordinator-arguments')
    control, captures = load_control(arguments[:4] if worker else arguments)
    if worker:
        control.STAGING_COORDINATOR = tuple(arguments[4:])
    original_verify = control.verify_environment
    def verify(request, deadline):
        source, verified = original_verify(request, deadline)
        # Bootstrap captures are independently SHA-bound before the actual worker imports helpers.
        control.require(all(verified[path] == payload for path, payload in captures.items()), 'staging-bootstrap-binding')
        return source, verified
    control.verify_environment = verify
    with control.select_purpose('staging-channel'):
        signal.signal(signal.SIGALRM, control.hard_timeout)
        signal.signal(signal.SIGINT, control.cancel)
        signal.signal(signal.SIGTERM, control.cancel)
        control.entry(arguments[:4] if worker else arguments)
        signal.alarm(0)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        os.write(2, b'staging-native-control: refused\n')
        raise SystemExit(1) from None
