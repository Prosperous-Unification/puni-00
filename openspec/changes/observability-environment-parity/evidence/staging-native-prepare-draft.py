import hashlib
import os
import stat
import subprocess
import sys
import types
import resource
import selectors
import signal
import time

EXPECTED_SOURCE_COMMIT = 'ROOT_MUST_FILL_REVIEWED_40_HEX_SOURCE_COMMIT'
EXPECTED_SHARED_SHA = 'ROOT_MUST_FILL_FINAL_REVIEWED_64_HEX_SHARED_SHA256'
EXPECTED_THIN_SHA = 'ROOT_MUST_FILL_FINAL_REVIEWED_64_HEX_THIN_SHA256'
ROOT = '/home/df/.codex/worktrees/aa39/puni-00'
PLAN = ROOT + '/.superpowers/sdd/observability-environment-parity'
PACKET = PLAN + '/repair-native-controls'
STATE = ROOT + '/.puni/fleet-labs/observability-baseline'
PREPARED = '/tmp/puni-staging110-prepared.json'
REVIEWED = '/tmp/puni-staging110-review.json'
APPROVED = '/tmp/puni-staging110-approved.json'
LAUNCHED = '/tmp/puni-staging110-launched.json'
CAPTURE = '/tmp/puni-staging110-capture.json'
OLD_NONCE = '6f7ddcf89107339386b0d1bb5de99d0c'
OLD_TERMINAL_SHA = '045244a7f3dc26940fe92e3f24e5d787ccd120b9a612ace82fda4cd9faef3dbc'
DEBT_NONCE = 'a2f4205072063acc8e66755d59687369'
DEBT = 141754548224
KIB = 1024
MIB = 1024**2
ADMISSION = None
SOURCE_ROLES = (
    ('openspec/changes/observability-environment-parity/evidence/repair-native-control.py', 98304,
     EXPECTED_SHARED_SHA),
    ('tools/tool-fleet/src/lab-repair-worker.py', 131072,
     '228c46388b14258589deae9908e238df818c789f05545c5bc6ee1704f09e320c'),
    ('tools/tool-fleet/src/lab-raw-preparation.py', 131072,
     'a4b54fa650172830402f07c169b4162d31a21fc2a8f22a7b3d8f4d5457c68574'),
    ('tools/tool-fleet/src/lab-guest-preparation.py', 131072,
     'f48f9f9d4fc53f2c7ba1c41ee9f91a5262dd3ac377f4f01af8cc1054aaaff0b6'),
    ('tools/tool-fleet/src/lab-seed-preparation.py', 131072,
     'c85ebe531dc69d146ae23b8e140bb9ef866ad81ad9e64197c15322804c0ceadf'),
    ('tools/tool-fleet/src/lab-raw-allocation.py', 131072,
     'be25ffe1740848c2dad861d87f42123a1a1664c8ffc0df6aa0a3062cf4d13ea8'),
    ('tools/tool-fleet/src/lab-raw-repair.py', 131072,
     '15f96bdc91fa9e1a5860528ee743c9d247705069f15935275b8b5d7f3b8b4462'),
    ('openspec/changes/observability-environment-parity/evidence/staging-native-control.py', 65536,
     EXPECTED_THIN_SHA))
TOOLS = ('/usr/bin/python3.12', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/git',
         '/usr/bin/true', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
         '/usr/lib/x86_64-linux-gnu/libc.so.6')
FUTURE = {
    'reviewedOperatorBuilder': 49152,
    'fixedOperatorBootstrap': 8192,
    'operatorQualificationRecord': 16384,
    'jointNativeProjections': 65536,
    'fiveProjectionAllocationTails': 5 * 4096,
    'sharedCaptureRevision': 32768,
    'thinCapture': 32768,
    'preparationApprovalAndAttemptRecords': 32768,
    'operatorPlan': 16384,
    'independentReview': 8192,
    'executionCapture': 16384,
    'terminalJournal': 16384,
    'directoryGrowthAndAllocationTails': 16384}


def insist(predicate, category):
    if not predicate:
        raise RuntimeError(category)


def check_wall():
    # Proof: capture-boundaries refuses a read after cutoff; omitted guard reads those bytes.
    insist(time.monotonic() < OPERATOR_DEADLINE - 3, 'operator-wall-timeout')


def work_timeout(_number, _frame):
    raise RuntimeError('operator-work-timeout')


def hard_timeout(_number, _frame):
    raise RuntimeError('operator-hard-timeout')


def arm_work_watchdog():
    remaining = OPERATOR_DEADLINE - 3 - time.monotonic()
    insist(remaining > 0, 'operator-work-timeout')
    signal.signal(signal.SIGALRM, work_timeout)
    signal.setitimer(signal.ITIMER_REAL, remaining)


def arm_terminal_watchdog():
    remaining = OPERATOR_DEADLINE - time.monotonic()
    insist(remaining > 0, 'operator-capture-unavailable-deadline')
    signal.signal(signal.SIGALRM, hard_timeout)
    signal.setitimer(signal.ITIMER_REAL, remaining)
    insist(signal.getitimer(signal.ITIMER_REAL)[0] > 0, 'operator-capture-unavailable-watchdog')


def check_admission(helpers, request):
    check_wall()
    # Proof: lock-before/lock-after replace the real owned root with the same ledger;
    # omit-lock removes these joins and admits the unlocked replacement.
    helpers['repair'].check_lock(ADMISSION, request['state'])


def under_admission(helpers, request, operation, *arguments, **keywords):
    check_admission(helpers, request)
    try:
        return operation(*arguments, **keywords)
    finally:
        check_admission(helpers, request)


def mark(observed):
    return (observed.st_dev, observed.st_ino, observed.st_uid, observed.st_mode,
            observed.st_nlink, observed.st_size, observed.st_blocks,
            observed.st_mtime_ns, observed.st_ctime_ns)


def capture(path, limit, owner, mode, expected=None):
    check_wall()
    before = os.lstat(path)
    # Proof: capture-boundaries refuses absent/unreadable/mode/size/hash faults;
    # identity/hash guard omissions admit the otherwise refused captured bytes.
    insist(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
           and before.st_uid == owner and stat.S_IMODE(before.st_mode) == mode
           and bool(before.st_mode & 0o400) and 0 <= before.st_size <= limit,
           'operator-file-identity')
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        payload = bytearray()
        while len(payload) <= limit:
            check_wall()
            chunk = os.read(descriptor, min(65536, limit + 1 - len(payload)))
            if not chunk:
                break
            payload.extend(chunk)
        insist(len(payload) == before.st_size and mark(before) == mark(os.fstat(descriptor))
               == mark(os.lstat(path)), 'operator-file-changed')
        checksum = hashlib.sha256(payload).hexdigest()
        insist(expected is None or checksum == expected, 'operator-file-sha')
        return bytes(payload), dict(path=path, sha256=checksum, bytes=len(payload), uid=owner, mode=mode)
    finally:
        os.close(descriptor)


def fixed_environment():
    environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'PYTHONNOUSERSITE': '1',
                   'GIT_OPTIONAL_LOCKS': '0'}
    for name in ('XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'):
        insist(name in os.environ and bool(os.environ[name]), 'operator-user-manager-environment')
        environment[name] = os.environ[name]
    return environment


def git(arguments):
    streams, exit_code = capture_child(['/usr/bin/git', '--no-optional-locks',
        '-c', 'core.preloadIndex=false', '-c', 'index.threads=1', '-c', 'core.fsmonitor=false',
        '-C', ROOT, *arguments], fixed_environment(), time.monotonic() + 3, 65536)
    insist(exit_code == 0 and streams['stderr'] == b'', 'operator-git')
    return streams['stdout']


def capture_child(arguments, environment, deadline, bound, limits=None, publish=None):
    """Own one fixed caller's pipes and process from spawn through finite capture and reap."""
    arm_work_watchdog()
    deadline = min(deadline, OPERATOR_DEADLINE - 3)
    insist(time.monotonic() < deadline, 'operator-child-deadline')
    streams = {'stdout': bytearray(), 'stderr': bytearray()}
    selector = None
    failures = []
    process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, env=environment, close_fds=True, preexec_fn=limits)
    # Proof: cleanup/wall-cleanup inject failure in the first selector construction;
    # both pipes close, the child is reaped, and capture survives. real-wall injects
    # SIGALRM; capture-failure still cleans up; cleanup-close-fault stays visibly uncertain.
    try:
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
        while selector.get_map():
            check_wall()
            remaining = deadline - time.monotonic()
            insist(remaining > 0, 'operator-child-deadline')
            for event, _ in selector.select(min(.1, remaining)):
                total = sum(len(content) for content in streams.values())
                chunk = os.read(event.fd, min(4096, bound + 1 - total))
                if not chunk:
                    selector.unregister(event.fileobj)
                else:
                    # Proof: git/overflow kill the actual overflowing child before its later marker;
                    # omit-output removes this live guard and the forbidden marker is written.
                    insist(total + len(chunk) <= bound, 'operator-child-output-bound')
                    streams[event.data].extend(chunk)
        process.wait(timeout=max(.001, deadline - time.monotonic()))
    except BaseException as caught:
        failures.append(caught)
    finally:
        # Proof: real work alarm then stalled-publication is interrupted by the remaining
        # hard watchdog; omit-publication-watchdog exposes missing protection to an outer
        # fixture watch. no-publication-budget starts no capture I/O and retains its reason.
        try:
            arm_terminal_watchdog()
        except BaseException as caught:
            failures.append(caught)
        def cleanup_step(operation):
            try:
                operation()
            except BaseException as caught:
                failures.append(BaseExceptionGroup('operator-child-cleanup-uncertain', [caught]))
        cleanup_step(lambda: process.kill() if process.poll() is None else None)
        cleanup_step(lambda: process.wait(timeout=max(0, min(1, OPERATOR_DEADLINE - time.monotonic()))))
        cleanup_step(process.stdout.close)
        cleanup_step(process.stderr.close)
        if selector is not None:
            cleanup_step(selector.close)
        if publish is not None:
            try:
                arm_terminal_watchdog()
                publish(streams, process.returncode, not failures)
            except BaseException as caught:
                failures.append(BaseExceptionGroup('operator-capture-unavailable', [caught]))
    # Proof: compound-all preserves registration, close and publication errors together;
    # omit-primary-failure loses registration and the independent graph assertion detects it.
    if failures:
        raise BaseExceptionGroup('operator-child-failures', failures)
    if time.monotonic() < OPERATOR_DEADLINE - 3:
        arm_work_watchdog()
    return {name: bytes(content) for name, content in streams.items()}, process.returncode


def bootstrap():
    check_wall()
    insist(type(BUILDER_SHA) is str and len(BUILDER_SHA) == 64
           and all(character in '0123456789abcdef' for character in BUILDER_SHA),
           'operator-reviewed-builder-sha-required')
    insist(len(EXPECTED_SOURCE_COMMIT) == 40
           and all(character in '0123456789abcdef' for character in EXPECTED_SOURCE_COMMIT),
           'operator-reviewed-source-commit-required')
    insist(all(len(checksum) == 64 and all(character in '0123456789abcdef' for character in checksum)
               for checksum in (EXPECTED_SHARED_SHA, EXPECTED_THIN_SHA)),
           'operator-reviewed-source-sha-required')
    insist(os.getcwd() == ROOT and os.path.realpath(ROOT) == ROOT, 'operator-fixed-root')
    insist(os.environ.get('LANG') == os.environ.get('LC_ALL') == 'C'
           and sys.version_info[:2] == (3, 12) and sys.flags.isolated == 1
           and sys.dont_write_bytecode and '__file__' not in globals()
           and os.path.samefile('/proc/self/exe', TOOLS[0]), 'operator-cold-runtime')
    resource.setrlimit(resource.RLIMIT_AS, (128 * MIB,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_FSIZE, (65536,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.umask(0o077)
    buffers = {}
    pins = []
    for relative, bound, checksum in SOURCE_ROLES:
        payload, pin = capture(ROOT + '/' + relative, bound, os.geteuid(), 0o644, checksum)
        insist(len(payload) > 0, 'operator-empty-source')
        buffers[pin['path']] = payload
        pins.append(pin)
    insist(len(buffers[ROOT + '/' + SOURCE_ROLES[-1][0]]) <= FUTURE['thinCapture'],
           'operator-thin-capture-envelope-needs-reviewed-revision')
    for path in TOOLS:
        observed = os.lstat(path)
        payload, pin = capture(path, 128 * MIB, 0, stat.S_IMODE(observed.st_mode))
        insist(not pin['mode'] & 0o022 and len(payload) > 0, 'operator-tool-identity')
        pins.append(pin)
        del payload
    insist(git(['rev-parse', '--verify', 'HEAD']).decode().strip() == EXPECTED_SOURCE_COMMIT,
           'operator-source-head')
    tree = git(['ls-tree', '-z', EXPECTED_SOURCE_COMMIT, '--',
                *(relative for relative, _, _ in SOURCE_ROLES)])
    expected = {('100644 blob ' + hashlib.sha1(b'blob ' + str(len(buffers[ROOT + '/' + relative])).encode()
        + b'\0' + buffers[ROOT + '/' + relative]).hexdigest() + '\t' + relative).encode()
        for relative, _, _ in SOURCE_ROLES}
    insist(set(tree.removesuffix(b'\0').split(b'\0')) == expected, 'operator-source-git-blobs')
    insist(git(['status', '--porcelain=v1', '--untracked-files=no']) == b'', 'operator-dirty-source-tree')
    check_wall()
    control_path = ROOT + '/' + SOURCE_ROLES[0][0]
    control = types.ModuleType('staging_operator_shared')
    control.__file__ = control_path
    sys.modules[control.__name__] = control
    exec(compile(buffers[control_path], control_path, 'exec', dont_inherit=True), control.__dict__)
    insist(tuple(control.TOOLS) == TOOLS and control.SOURCE_LIMIT == 98304,
           'operator-fixed-source-contract')
    with control.select_purpose('staging-channel'):
        insist(tuple(control.select_sources()) == tuple(relative for relative, _, _ in SOURCE_ROLES),
               'operator-fixed-source-roles')
    return control, buffers, pins, BUILDER_SHA


def runtime_pins(control):
    paths = sorted(control.runtime_paths())
    pins = []
    for path in paths:
        observed = os.lstat(path)
        _, pin = capture(path, 128 * MIB, 0, stat.S_IMODE(observed.st_mode))
        insist(not pin['mode'] & 0o022 and control.is_runtime_path(path), 'operator-runtime-identity')
        pins.append(pin)
    insist(set(paths) == control.runtime_paths(), 'operator-runtime-changed')
    return pins


def ledger(control, helpers, request):
    reservations = under_admission(helpers, request, helpers['repair'].read_reservations, request['state'])
    selected = [record for record in reservations if record['nonce'] == DEBT_NONCE]
    # Proof: ledger-composition refuses missing/foreign nonce/request/source/debt,
    # sums both actual pending debts, and selection omission admits foreign provenance.
    insist(len(selected) == 1 and selected[0]['grossBytes'] == str(DEBT)
           and selected[0]['requestDigest'] == '77160420ab64fbe534d3cdf5543a37ad10af4dbaaa0a4dba9ce1d7a67b20dd0e'
           and selected[0]['sourceDigest'] == '4f3c6c6c12da6a99c229650df34f495e81faec87bfbd30911948f89bcfb61de9',
           'operator-original-g-missing-or-changed')
    return {'digest': control.digest(reservations), 'records': len(reservations),
            'grossBytes': sum(int(record['grossBytes']) for record in reservations)}


def packet_budget(control, reserve_before_creation=False):
    check_wall()
    receipt_path = PACKET + '/observation-' + OLD_NONCE + '-terminal.json'
    receipt_bytes, _ = capture(receipt_path, 65536, os.geteuid(), 0o600, OLD_TERMINAL_SHA)
    receipt = control.decode(receipt_bytes)
    insist(set(receipt['fixtures']) == set(control.FIXTURES)
           and receipt['fixtureAllocatedBytes'] == 1544192
           and receipt['request'] == '70112203211e480c759105ecc46b1da1d857684e540b0bfa9b27fbdf78ff16af',
           'operator-old-fixture-receipt')
    fixtures = {}
    for name, snapshot in receipt['fixtures'].items():
        path = PACKET + '/fixtures-' + OLD_NONCE + '/' + name
        observed = os.lstat(path)
        # Proof: packet-budget substitutes one real fixture inode; omitted join exempts it.
        insist(stat.S_ISREG(observed.st_mode) and observed.st_uid == os.geteuid()
               and stat.S_IMODE(observed.st_mode) == 0o600 and observed.st_nlink == 1
               and (observed.st_dev, observed.st_ino, observed.st_size, observed.st_blocks * 512)
                   == (snapshot['device'], snapshot['inode'], snapshot['bytes'], snapshot['allocatedBytes']),
               'operator-old-fixture-identity')
        fixtures[path] = (observed.st_dev, observed.st_ino)
    seen = set()
    observed_paths = {}
    metadata = 0
    fixture_bytes = 0
    count = 0
    def refuse_walk(_failure):
        raise RuntimeError('operator-packet-unreadable')
    control.check_directory(PACKET, private=True)
    for directory, directories, files in os.walk(PACKET, followlinks=False, onerror=refuse_walk):
        control.check_inventory_directory(directory)
        directories.sort()
        files.sort()
        for name in ['.'] + directories + files:
            check_wall()
            path = os.path.normpath(directory + '/' + name)
            observed = os.lstat(path)
            count += 1
            insist(count <= 20000 and observed.st_uid == os.geteuid()
                   and (stat.S_ISREG(observed.st_mode) or stat.S_ISDIR(observed.st_mode)
                        or stat.S_ISLNK(observed.st_mode)), 'operator-packet-identity')
            insist(stat.S_ISLNK(observed.st_mode) or bool(observed.st_mode & 0o400),
                   'operator-packet-unreadable')
            observed_paths[path] = mark(observed)
            identity = (observed.st_dev, observed.st_ino)
            if identity not in seen:
                if path in fixtures:
                    insist(fixtures[path] == identity, 'operator-old-fixture-changed')
                    fixture_bytes += observed.st_blocks * 512
                else:
                    metadata += observed.st_blocks * 512
                seen.add(identity)
    insist(all(mark(os.lstat(path)) == observed for path, observed in observed_paths.items()),
           'operator-packet-changed')
    insist(fixture_bytes == 1544192 and fixture_bytes <= control.FIXTURE_LIMIT,
           'operator-fixture-budget')
    future = dict(FUTURE)
    if reserve_before_creation:
        future['newPaddedRequest'] = 65536
        future['twoEmptyFixtureDirectories'] = 2 * 4096
        future['preparationPacketGrowth'] = 16384
    projected = metadata + sum(future.values())
    # Proof: packet-budget accepts literal1MiB, refuses one extra byte;
    # omitted budget guard returns1048577 for that same real packet.
    insist(projected <= control.METADATA_LIMIT, 'operator-metadata-budget')
    return {'metadataAllocatedBytes': metadata, 'fixtureAllocatedBytes': fixture_bytes,
            'futureAllocatedBytes': future, 'projectedMetadataBytes': projected,
            'metadataLimitBytes': control.METADATA_LIMIT, 'entries': count,
            'fixtureExemption': 'only twelve exact original terminal-receipt-bound file inodes; directories charged'}


def write_private(control, path, record, bound):
    payload = control.encode(record) + b'\n'
    insist(len(payload) <= bound, 'operator-artifact-bound')
    # Proof: exclusive-marker keeps original bytes on collision; removing O_EXCL overwrites them.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    try:
        insist(os.write(descriptor, payload) == len(payload), 'operator-artifact-write')
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return hashlib.sha256(payload).hexdigest()


def read_record(control, path, bound):
    payload, _ = capture(path, bound, os.geteuid(), 0o600)
    return control.decode(payload)


def base_request(control, pins, nonce):
    native = os.uname()
    return dict(schemaVersion=2, purpose='staging-channel', root=ROOT, state=STATE,
        outside=PLAN, packet=PACKET, nonce=nonce, commit=EXPECTED_SOURCE_COMMIT, pins=pins,
        runtimePins=runtime_pins(control), kernel={'release': native.release,
            'version': native.version, 'machine': native.machine}, fixtures={})


def proper_host_preflight(control, staging, helpers, request, checksum=None):
    check_admission(helpers, request)
    deadline = control.time.monotonic() + 8
    control.check_process_limits()
    if checksum is not None:
        insist(control.authorize(PACKET + '/request-' + request['nonce'] + '.json', checksum,
            request['nonce']) == request, 'operator-request-authorize')
    source, _ = control.verify_environment(request, deadline)
    control.check_loaded_runtime(request, deadline)
    capacity = under_admission(helpers, request, control.observe_capacity,
        request, helpers, deadline, initial=True, exact=True)
    insist(ledger(control, helpers, request) == request['ledger'], 'operator-fresh-ledger')
    for label in staging.LABELS:
        check_admission(helpers, request)
        staging.check_fixture(control, request, label)
        insist(helpers['raw'].observe_unit(staging.name_unit(request['nonce'], label))['LoadState']
               == 'not-found', 'operator-unit-collision')
    check_admission(helpers, request)
    return {'source': source, 'capacity': capacity,
            'metadata': packet_budget(control), 'kernel': request['kernel'],
            'sourceCommit': EXPECTED_SOURCE_COMMIT, 'pins': len(request['pins']),
            'runtimePins': len(request['runtimePins'])}


def prepare(control, staging, helpers, pins, builder_sha):
    insist(not os.path.lexists(PREPARED), 'operator-existing-preparation')
    nonce = os.urandom(16).hex()
    request = base_request(control, pins, nonce)
    path = PACKET + '/request-' + nonce + '.json'
    insist(not os.path.lexists(path)
           and all(not os.path.lexists(PACKET + '/staging-' + nonce + '-' + label)
                   for label in staging.LABELS), 'operator-nonce-collision')
    request['ledger'] = ledger(control, helpers, request)
    request['inventory'] = under_admission(helpers, request, control.inventory_roots, request)
    early_budget = packet_budget(control, reserve_before_creation=True)
    early_capacity = under_admission(helpers, request, control.observe_capacity,
        request, helpers, control.time.monotonic() + 8, initial=True, exact=True)
    insist(request['ledger']['grossBytes'] >= DEBT, 'operator-g-unaccounted')
    directory_records = []
    for label in staging.LABELS:
        fixture_path = PACKET + '/staging-' + nonce + '-' + label
        under_admission(helpers, request, os.mkdir, fixture_path, 0o700)
        observed = control.check_directory(fixture_path, private=True)
        insist(os.listdir(fixture_path) == [], 'operator-new-fixture-not-empty')
        request['fixtures'][label] = dict(path=fixture_path, device=str(observed.st_dev),
            inode=str(observed.st_ino), owner=observed.st_uid, mode='0700')
        directory_records.append({'operation': 'exclusive-mkdir', 'label': label,
            'identity': request['fixtures'][label], 'allocatedBytes': observed.st_blocks * 512,
            'observedNs': str(control.time.time_ns())})
    check_admission(helpers, request)
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    try:
        check_admission(helpers, request)
        # Proof: prepare-composition short pad/write/fsync faults never publish; original FD closes.
        insist(os.write(descriptor, b' ' * 65536) == 65536, 'operator-request-pad-write')
        os.fsync(descriptor)
        check_admission(helpers, request)
        padded = os.fstat(descriptor)
        insist(padded.st_size == 65536 and padded.st_blocks * 512 == 65536
               and padded.st_nlink == 1 and padded.st_uid == os.geteuid()
               and stat.S_IMODE(padded.st_mode) == 0o600, 'operator-request-pad-allocation')
        packet_fd = os.open(PACKET, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
        try:
            os.fsync(packet_fd)
        finally:
            os.close(packet_fd)
        request['ledger'] = ledger(control, helpers, request)
        budget = packet_budget(control)
        # This is the freeze: no subsequent writes below STATE/PLAN except this same request FD,
        # then the single native source invocation's existing bounded projection publications.
        request['inventory'] = under_admission(helpers, request, control.inventory_roots, request)
        control.check_request(request, nonce)
        body = control.encode(request)
        insist(len(body) < 65536, 'operator-request-body-bound')
        payload = body + b' ' * (65536 - len(body))
        # Proof: prepare-composition omits this guard while retaining the actual short pwrite;
        # otherwise-refused finalization reaches publication through unchanged shared validators.
        insist(under_admission(helpers, request, os.pwrite, descriptor, payload, 0) == 65536,
               'operator-request-finalize')
        under_admission(helpers, request, os.fsync, descriptor)
        final = os.fstat(descriptor)
        # Proof: prepare-composition actual dup2/size/block movement refuses; omitted FD join publishes.
        insist((final.st_dev, final.st_ino, final.st_uid, final.st_mode, final.st_nlink,
                final.st_size, final.st_blocks) == (padded.st_dev, padded.st_ino, padded.st_uid,
                padded.st_mode, padded.st_nlink, padded.st_size, padded.st_blocks),
               'operator-request-inode-allocation-changed')
        # Proof: prepare-composition request-path/unrelated inventory movement refuses before
        # later profile admission; omitted freeze comparison crosses that protected boundary.
        insist(under_admission(helpers, request, control.inventory_roots, request)
               == request['inventory'], 'operator-freeze-changed')
    finally:
        os.close(descriptor)
    checksum = hashlib.sha256(payload).hexdigest()
    preflight = proper_host_preflight(control, staging, helpers, request, checksum)
    preparation = {'schemaVersion': 1, 'requestPath': path, 'requestSha256': checksum,
        'builderSha256': builder_sha,
        'nonce': nonce, 'sourceCommit': EXPECTED_SOURCE_COMMIT,
        'sourceHashes': {relative: expected for relative, _, expected in SOURCE_ROLES},
        'requestIdentity': {'device': str(final.st_dev), 'inode': str(final.st_ino),
            'owner': final.st_uid, 'mode': '0600', 'bytes': final.st_size,
            'allocatedBytes': final.st_blocks * 512},
        'directoryPreparation': directory_records, 'earlyCapacity': early_capacity,
        'earlyMetadataBudget': early_budget, 'finalMetadataBudget': budget,
        'preflight': preflight,
        'frozenWrites': 'No STATE/PLAN writes until one authorized source CLI, then terminal; review only /tmp',
        'oldGrossBytesStillChargedOnce': str(DEBT), 'automaticRetry': False}
    write_private(control, PREPARED, preparation, 16384)
    print(control.encode({'prepared': PREPARED, 'requestSha256': checksum, 'nonce': nonce}).decode())


def read_prepared(control, staging, helpers):
    preparation = read_record(control, PREPARED, 16384)
    # Proof: binding-composition real malformed/foreign source/SHA/nonce/builder/inode records
    # prevent the CLI; watched preparation/inode omissions reach that forbidden launch boundary.
    insist(preparation['sourceCommit'] == EXPECTED_SOURCE_COMMIT
           and preparation['builderSha256'] == BUILDER_SHA
           and preparation['sourceHashes'] == {relative: expected for relative, _, expected in SOURCE_ROLES}
           and preparation['requestPath'] == PACKET + '/request-' + preparation['nonce'] + '.json',
           'operator-preparation-binding')
    request = control.authorize(preparation['requestPath'], preparation['requestSha256'], preparation['nonce'])
    observed = os.lstat(preparation['requestPath'])
    insist(preparation['requestIdentity'] == {'device': str(observed.st_dev), 'inode': str(observed.st_ino),
        'owner': observed.st_uid, 'mode': '0600', 'bytes': observed.st_size,
        'allocatedBytes': observed.st_blocks * 512}, 'operator-request-original-inode')
    preflight = proper_host_preflight(control, staging, helpers, request, preparation['requestSha256'])
    return preparation, request, preflight


def review(control, staging, helpers):
    preparation, request, preflight = read_prepared(control, staging, helpers)
    report = {'schemaVersion': 1, 'nonce': request['nonce'],
        'builderSha256': BUILDER_SHA,
        'requestSha256': preparation['requestSha256'], 'sourceCommit': EXPECTED_SOURCE_COMMIT,
        'inventory': request['inventory'], 'ledger': request['ledger'], 'preflight': preflight,
        'reviewScope': 'Fresh actual shared helper preflight; independent human/agent judgment still required'}
    write_private(control, REVIEWED, report, 8192)
    print(control.encode({'review': REVIEWED, 'requestSha256': preparation['requestSha256']}).decode())


def launch(control, staging, helpers, admission_lock):
    preparation, request, preflight = read_prepared(control, staging, helpers)
    reviewed = read_record(control, REVIEWED, 8192)
    # Proof: binding-composition malformed/foreign/replayed review/approval refuses;
    # corresponding guard omissions reach the intercepted original CLI boundary.
    insist(reviewed['sourceCommit'] == EXPECTED_SOURCE_COMMIT
           and reviewed['builderSha256'] == BUILDER_SHA
           and reviewed['nonce'] == request['nonce']
           and reviewed['requestSha256'] == preparation['requestSha256']
           and reviewed['inventory'] == request['inventory'] and reviewed['ledger'] == request['ledger'],
           'operator-reviewed-request-binding')
    insist(not os.path.lexists(CAPTURE), 'operator-existing-execution-capture')
    approval = read_record(control, APPROVED, 8192)
    insist(approval == {'schemaVersion': 1, 'sourceCommit': EXPECTED_SOURCE_COMMIT,
        'builderSha256': BUILDER_SHA,
        'nonce': request['nonce'], 'requestSha256': preparation['requestSha256'],
        'approved': True}, 'operator-independent-approval-required')
    # Proof: binding-composition replay and failed marker fsync keep CLI unlaunched and FD closed.
    write_private(control, LAUNCHED, {'schemaVersion': 1, 'nonce': request['nonce'],
        'builderSha256': BUILDER_SHA,
        'requestSha256': preparation['requestSha256'], 'preflight': preflight,
        'attemptedNs': str(control.time.time_ns())}, 8192)
    # The corrected native coordinator must acquire/hold the actual state lock itself.
    # Release only this preflight's original descriptor before the sole source CLI invocation.
    os.close(admission_lock[0])
    admission_lock[0] = None
    command = ['/usr/bin/python3.12', '-I', '-B', ROOT + '/' + SOURCE_ROLES[-1][0], 'run',
               preparation['requestPath'], preparation['requestSha256'], request['nonce']]
    def publish(streams, exit_code, complete):
        write_private(control, CAPTURE, {'schemaVersion': 1, 'requestSha256': preparation['requestSha256'],
            'builderSha256': BUILDER_SHA,
            'nonce': request['nonce'], 'command': command, 'exitCode': exit_code,
            'stdoutHex': bytes(streams['stdout']).hex(), 'stderrHex': bytes(streams['stderr']).hex(),
            'transportComplete': complete,
            'providerCounters': 'see authenticated pre-exit counters in source durable projections; absent counters unavailable'}, 16384)
    streams, exit_code = capture_child(command, fixed_environment(), time.monotonic()+21, 4096,
        helpers['raw'].client_limits, publish)
    insist(exit_code == 0
           and streams['stdout'] == b'{"phase":"qualified-staging-channel-only"}\n'
           and streams['stderr'] == b'', 'operator-source-unaccepted')
    print(control.encode({'capture': CAPTURE, 'sourceExitCode': exit_code,
                          'qualification': 'service handoff only; native receipt audit remains required'}).decode())


def main():
    global ADMISSION
    insist(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'review', 'launch'), 'operator-action')
    control, buffers, pins, builder_sha = bootstrap()
    with control.select_purpose('staging-channel'), control.repository_loader(buffers):
        helpers = control.load_helpers()
        staging = control.load_staging()
        check_wall()
        admission_lock = [helpers['raw'].acquire_staging(STATE)]
        try:
            raw = helpers['raw']
            ADMISSION = dict(pid=os.getpid(), start=raw.process_start(os.getpid()),
                stagingFd=admission_lock[0], staging=raw.identity(os.fstat(admission_lock[0])))
            if sys.argv[1] == 'prepare':
                prepare(control, staging, helpers, pins, builder_sha)
            elif sys.argv[1] == 'review':
                review(control, staging, helpers)
            else:
                launch(control, staging, helpers, admission_lock)
        finally:
            ADMISSION = None
            if admission_lock[0] is not None:
                os.close(admission_lock[0])


if __name__ == '__main__':
    main()
