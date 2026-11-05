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
import types

HELPER = Path(__file__).resolve()
SPEC = importlib.util.spec_from_file_location('seed_raw', HELPER.with_name('lab-raw-preparation.py'))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError('seed-runtime-unavailable')
raw = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(raw)
MEMBER_BYTES = 64 * 1024**2
ISO_BYTES = 80 * 1024**2
MEMBERS = ('user-data', 'meta-data', 'network-config', 'docker-ce.deb', 'docker-ce-cli.deb', 'containerd.io.deb')
ISO_NAMES = {'user-data': 'USER_DATA.;1', 'meta-data': 'META_DATA.;1', 'network-config': 'NETWORK_CONFIG.;1',
             'docker-ce.deb': 'DOCKER_CE.DEB;1', 'docker-ce-cli.deb': 'DOCKER_CE_CLI.DEB;1',
             'containerd.io.deb': 'CONTAINERD_IO.DEB;1'}
CAPS = {'memory.max': '268435456', 'memory.swap.max': '0', 'pids.max': '64', 'cpu.max': '100000 100000'}
SERVICE_LIMITS = dict(raw.SERVICE_LIMITS, RuntimeMaxUSec='1min', LimitAS='1073741824',
                      LimitFSIZE='83886080', LimitNOFILE='64', LimitCORE='0', Restart='no')
require = raw.require


def check_capacity(memory, free, allocated, initial, after_allocation):
    """Charge existing raw blocks once; reserve only the new seed and bounded evidence."""
    # Proof: capacity controls inject unknown/one-byte-short memory, disk and staging facts.
    require(all(type(quantity) is int and quantity >= 0 for quantity in (memory, free, allocated)),
            'seed-capacity-malformed')
    require(memory >= (4160749568 if initial else 2147483648), 'seed-memory-floor')
    require(free >= (50 if initial else 40) * 1024**3, 'seed-disk-floor')
    require(allocated + raw.RESERVE_BYTES + (0 if after_allocation else ISO_BYTES) <= raw.STAGING_BYTES,
            'seed-staging-bound')


def check_iso(descriptor, path, original):
    opened = os.fstat(descriptor)
    # Proof: stream replacement refuses before pwrite; ISO replacement refuses before pread.
    require(raw.identity(opened) == original == raw.identity(os.lstat(path))
            and raw.stable_identity(opened) == raw.stable_identity(os.lstat(path))
            and stat.S_ISREG(opened.st_mode) and opened.st_nlink == 1
            and opened.st_uid == os.geteuid() and stat.S_IMODE(opened.st_mode) == 0o600
            and 0 <= opened.st_size <= ISO_BYTES, 'seed-iso-changed')
    return opened


def write_iso(descriptor, path, original, chunk, offset):
    check_iso(descriptor, path, original)
    require(offset + len(chunk) <= ISO_BYTES, 'seed-stream-bound')
    # Proof: stream short-write injection refuses before artifact fsync.
    require(os.pwrite(descriptor, chunk, offset) == len(chunk), 'seed-short-write')


def stream_command(arguments, descriptors, environment, maximum, consume, monitor, exact=False, seconds=10):
    """Drain finite stdout incrementally; bound stderr separately and reap every child."""
    process = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, pass_fds=descriptors, env=environment)
    process.stdin.close()
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, 'stdout')
    selector.register(process.stderr, selectors.EVENT_READ, 'stderr')
    digest = hashlib.sha256()
    count = 0
    errors = 0
    deadline = time.monotonic() + seconds
    try:
        while selector.get_map():
            # Proof: stream controls use real oversized, short, failed and hanging children.
            require(time.monotonic() < deadline, 'seed-child-timeout')
            monitor()
            for event, _ in selector.select(min(.1, max(0, deadline-time.monotonic()))):
                chunk = os.read(event.fd, 65536)
                if not chunk:
                    selector.unregister(event.fileobj)
                elif event.data == 'stderr':
                    errors += len(chunk)
                    require(errors <= raw.RECORD_BYTES, 'seed-child-output-bound')
                else:
                    count += len(chunk)
                    require(count <= maximum, 'seed-stream-bound')
                    consume(chunk)
                    digest.update(chunk)
        process.wait(timeout=max(.01, deadline-time.monotonic()))
        require(process.returncode == 0, 'seed-child-failed')
        require(not exact or count == maximum, 'seed-stream-length')
        return digest.hexdigest()
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
        selector.close()


def check_listing(listing, members, namespace, volume_blocks):
    """Parse the pinned isoinfo formatter without trimming or normalizing hostile names."""
    expected = {(ISO_NAMES[name] if namespace == 'iso9660' else name): member['bytes']
                for name, member in members.items()}
    lines = listing.splitlines()
    require(lines[:2] == ['', 'Directory listing of /'], 'seed-iso-namespace')
    observed = {}
    directories = set()
    extents = []
    for line in lines[2:]:
        # Exactly two ASCII spaces delimit the pinned formatter's filename; retain its bytes.
        match = re.fullmatch(r'([d-][rwx-]{9})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+) '
                             r'[A-Z][a-z]{2} [ 0-9][0-9] [0-9]{4} \[\s*([0-9]+) ([0-9]{2})\]  (.*) ', line)
        # Proof: listing controls inject padding, hostile path, symlink, duplicate/aliased extent, size and directory.
        require(match is not None, 'seed-iso-namespace')
        mode, links, uid, gid, size, extent, flags, name = match.groups()
        if name in ('.', '..'):
            require(mode[0] == 'd' and flags == '02' and name not in directories, 'seed-iso-namespace')
            directories.add(name)
        else:
            first = int(extent)
            finish = first + (int(size) + 2047) // 2048
            require(name in expected and name not in observed
                    and mode == ('-r--r--r--' if namespace == 'rock-ridge' else '----------')
                    and links == ('1' if namespace == 'rock-ridge' else '0') and uid == gid == '0'
                    and flags == '00' and int(size) == expected[name] and 0 < first < finish <= volume_blocks
                    and all(finish <= start or first >= end for start, end in extents), 'seed-iso-namespace')
            observed[name] = {'bytes': int(size), 'extent': first}
            extents.append((first, finish))
    require({name: member['bytes'] for name, member in observed.items()} == expected
            and directories == {'.', '..'}, 'seed-iso-namespace')
    return observed


def inspect_iso(descriptor, path, original, members, tool_fd, environment, monitor):
    """Verify PVD, all three namespaces and bounded exact member hashes on the original FD."""
    before = check_iso(descriptor, path, original)
    pvd = os.pread(descriptor, 2048, 32768)
    # Proof: real pinned-tool ISO control changes the PVD magic and is refused.
    require(len(pvd) == 2048 and pvd[:7] == b'\x01CD001\x01'
            and pvd[40:72] == b'cidata' + b' ' * 26
            and int.from_bytes(pvd[80:84], 'little') == int.from_bytes(pvd[84:88], 'big')
            == before.st_size // 2048 and before.st_size % 2048 == 0
            and pvd[128:132] == b'\x00\x08\x08\x00', 'seed-iso-pvd')
    tool = f'/proc/self/fd/{tool_fd}'
    source = f'/proc/self/fd/{descriptor}'
    descriptors = (descriptor, tool_fd)
    header = raw.run_bounded([tool, '-d', '-i', source], 3, environment, descriptors, converter=True,
                             monitor=monitor).decode()
    require('CD-ROM is in ISO 9660 format\n' in header and 'Volume id: cidata\n' in header
            and 'Joliet with UCS level 3 found\n' in header
            and 'Rock Ridge signatures version 1 found\n' in header, 'seed-iso-pvd')
    total = sum(member['bytes'] for member in members.values())
    require(0 < total <= MEMBER_BYTES and set(members) == set(MEMBERS), 'seed-member-bound')
    locations = None
    for namespace, options in [('iso9660', []), ('joliet', ['-J']), ('rock-ridge', ['-R'])]:
        listing = raw.run_bounded([tool, *options, '-l', '-i', source], 3, environment, descriptors,
                                  converter=True, monitor=monitor).decode()
        observed = check_listing(listing, members, namespace, before.st_size // 2048)
        canonical = {name: observed[ISO_NAMES[name] if namespace == 'iso9660' else name] for name in MEMBERS}
        # Proof: pinned-tool control substitutes one Joliet extent while keeping valid root names and sizes.
        require(locations is None or canonical == locations, 'seed-iso-alias')
        locations = canonical
    extracted = 0
    for name, member in members.items():
        check_iso(descriptor, path, original)
        digest = stream_command([tool, '-R', '-i', source, '-x', '/' + name], descriptors,
                                environment, member['bytes'], lambda chunk: None, monitor, exact=True)
        extracted += member['bytes']
        # Proof: pinned-tool control injects an equal-size wrong member hash and measures one complete input pass.
        require(digest == member['sha256'] and extracted <= MEMBER_BYTES, 'seed-member-digest')
    require(raw.stable_identity(before) == raw.stable_identity(check_iso(descriptor, path, original)),
            'seed-iso-changed')
    digest = hashlib.sha256()
    offset = 0
    while offset < before.st_size:
        check_iso(descriptor, path, original)
        chunk = os.pread(descriptor, min(65536, before.st_size-offset), offset)
        require(bool(chunk), 'seed-stream-length')
        digest.update(chunk)
        offset += len(chunk)
    return {'bytes': before.st_size, 'sha256': digest.hexdigest(), 'memberBytes': total,
            'members': {name: {'bytes': member['bytes'], 'sha256': member['sha256']}
                        for name, member in members.items()}, 'namespaces': ['iso9660', 'joliet', 'rock-ridge']}


def generate_iso(descriptor, path, original, members, tools, environment, monitor):
    check_iso(descriptor, path, original)
    require(os.fstat(descriptor).st_size == 0, 'seed-iso-occupied')
    arguments = [f"/proc/self/fd/{tools['genisoimage']}", '-quiet', '-V', 'cidata', '-J', '-r',
                 '-iso-level', '3', '-follow-links', '-graft-points']
    arguments.extend(name + '=/proc/self/fd/' + str(member['fd']) for name, member in members.items())
    descriptors = tuple([tools['genisoimage']] + [member['fd'] for member in members.values()])
    offset = 0
    def consume(chunk):
        nonlocal offset
        write_iso(descriptor, path, original, chunk, offset)
        offset += len(chunk)
    stream_command(arguments, descriptors, environment, ISO_BYTES, consume, monitor, seconds=40)
    require(offset > 0, 'seed-stream-length')
    os.fsync(descriptor)
    return inspect_iso(descriptor, path, original, members, tools['isoinfo'], environment, monitor)


def check_request(request):
    """Exact selected paths and pins are operator reviewed; all native resource policy is fixed."""
    fields = {'schemaVersion', 'root', 'state', 'nonce', 'pins', 'members', 'image',
              'dependencyReport', 'rawReceipt', 'rawRequest', 'rawProvenance', 'provenance'}
    # Proof: request controls inject extra policy keys, unsafe paths, boolean sizes, aliases and absent pins.
    require(isinstance(request, dict) and set(request) == fields, 'seed-request-invalid')
    require(type(request['schemaVersion']) is int and request['schemaVersion'] == 1
            and isinstance(request['root'], str) and Path(request['root']).is_absolute()
            and os.path.normpath(request['root']) == request['root']
            and request['state'] == request['root'] + '/.puni/fleet-labs/observability-baseline'
            and isinstance(request['nonce'], str) and re.fullmatch('[a-f0-9]{32}', request['nonce'])
            and isinstance(request['pins'], list) and 1 <= len(request['pins']) <= 512
            and isinstance(request['members'], dict) and set(request['members']) == set(MEMBERS),
            'seed-request-invalid')
    pins = {}
    for pin in request['pins']:
        require(isinstance(pin, dict) and set(pin) == {'path', 'sha256', 'bytes', 'uid', 'mode'}
                and isinstance(pin['path'], str) and Path(pin['path']).is_absolute()
                and os.path.normpath(pin['path']) == pin['path'] and pin['path'] not in pins
                and isinstance(pin['sha256'], str) and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
                and type(pin['bytes']) is int and 0 < pin['bytes'] <= 1024**3
                and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
                and type(pin['mode']) is int and 0 <= pin['mode'] <= 0o755
                and (not pin['mode'] & 0o022 or is_confined_receipt(request, pin)), 'seed-request-invalid')
        pins[pin['path']] = pin
    total = 0
    paths = set()
    for name, member in request['members'].items():
        require(isinstance(member, dict) and set(member) == {'path', 'sha256', 'bytes'}
                and isinstance(member['path'], str) and member['path'] in pins
                and os.path.normpath(member['path']) == member['path']
                and member['path'].startswith(request['state'] + '/') and member['path'] not in paths
                and type(member['bytes']) is int and 0 < member['bytes'] <= MEMBER_BYTES
                and member['bytes'] == pins[member['path']]['bytes']
                and member['sha256'] == pins[member['path']]['sha256']
                and pins[member['path']]['uid'] == os.geteuid()
                and pins[member['path']]['mode'] == 0o400, 'seed-request-invalid')
        paths.add(member['path'])
        total += member['bytes']
    require(total <= MEMBER_BYTES, 'seed-request-invalid')
    for field in ('image', 'dependencyReport', 'rawReceipt', 'rawRequest', 'rawProvenance'):
        require(isinstance(request[field], str) and request[field] in pins
                and request[field].startswith(request['state'] + '/'), 'seed-request-invalid')
    require(isinstance(request['provenance'], list) and 1 <= len(request['provenance']) <= 64
            and len(set(request['provenance'])) == len(request['provenance'])
            and all(isinstance(path, str) and path in pins for path in request['provenance']),
            'seed-request-invalid')


def hash_member(member):
    # Proof: member-fds controls substitute the pathname and an equal-size expected content digest.
    before = os.fstat(member['fd'])
    require(raw.stable_identity(before) == member['identity']
            == raw.stable_identity(os.lstat(member['path'])), 'seed-input-changed')
    digest = hashlib.sha256()
    offset = 0
    while offset < member['bytes']:
        chunk = os.pread(member['fd'], min(65536, member['bytes']-offset), offset)
        require(bool(chunk), 'seed-input-changed')
        digest.update(chunk)
        offset += len(chunk)
    require(offset == before.st_size and digest.hexdigest() == member['sha256']
            and member['identity'] == raw.stable_identity(os.fstat(member['fd']))
            == raw.stable_identity(os.lstat(member['path'])), 'seed-input-changed')


def open_members(request):
    """Keep exact input files read-only and original through generation and ISO verification."""
    opened = {}
    try:
        for name in MEMBERS:
            member = request['members'][name]
            before = os.lstat(member['path'])
            # Proof: member-fds controls separately inject absent and unreadable input plus original-FD replacement.
            require(bool(before.st_mode & 0o400), 'seed-input-unreadable')
            require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                    and before.st_uid == os.geteuid() and stat.S_IMODE(before.st_mode) == 0o400
                    and before.st_size == member['bytes'], 'seed-input-changed')
            descriptor = os.open(member['path'], os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
            opened[name] = dict(member, fd=descriptor, identity=raw.stable_identity(before))
            hash_member(opened[name])
        return opened
    except BaseException as failure:
        for member in opened.values():
            os.close(member['fd'])
        if isinstance(failure, FileNotFoundError):
            raise raw.PreparationRefusal('seed-input-absent') from None
        if isinstance(failure, PermissionError):
            raise raw.PreparationRefusal('seed-input-unreadable') from None
        raise


def check_members(members):
    for member in members.values():
        hash_member(member)


def check_caps(caps):
    # Proof: profile controls replace every effective memory/swap/PID/CPU value with max.
    require(caps == CAPS, 'seed-native-caps')


def service_arguments(request, request_path, request_digest):
    properties = ['MemoryMax=268435456', 'MemorySwapMax=0', 'CPUQuota=100%', 'CPUQuotaPeriodSec=100ms',
                  'TasksMax=64', 'RuntimeMaxSec=60s', 'TimeoutStopSec=5s', 'KillMode=control-group',
                  'SendSIGKILL=yes', 'LimitFSIZE=83886080', 'LimitAS=1073741824', 'LimitNOFILE=64',
                  'LimitCORE=0', 'NoNewPrivileges=yes', 'UMask=0077', 'Restart=no']
    arguments = ['/usr/bin/systemd-run', '--user', '--quiet', '--pipe', '--wait', '--collect',
                 '--service-type=exec', '--unit=puni-seed-' + request['nonce'] + '.service']
    arguments.extend('--property=' + prop for prop in properties)
    arguments.extend(['/usr/bin/python3', '-I', '-B', str(HELPER), '--worker', request_path, request_digest])
    return arguments


def check_counter(record, binding, ready_ns, now):
    # Proof: counter controls inject stale/future/foreign/partial/OOM/caps and false completion facts.
    raw.check_counter(record, binding, ready_ns, now, CAPS, ('generated', 'verified'))


def check_creator(binding, directory, directory_fd):
    try:
        opened = os.stat(f"/proc/{binding['pid']}/fd/{binding['isoFd']}")
        named = os.lstat(directory + '/seed.iso')
        # Proof: creator controls substitute original process start and named ISO while FD remains live.
        require(raw.process_start(binding['pid']) == binding['start']
                and raw.identity(os.fstat(directory_fd)) == binding['creator']
                == raw.identity(os.lstat(directory))
                and raw.identity(opened) == binding['iso'] == raw.identity(named)
                and raw.stable_identity(opened) == raw.stable_identity(named)
                and stat.S_ISREG(opened.st_mode) and opened.st_nlink == 1
                and opened.st_uid == os.geteuid() and stat.S_IMODE(opened.st_mode) == 0o600
                and 0 <= opened.st_size <= ISO_BYTES, 'seed-creator-invalid')
    except (FileNotFoundError, KeyError, ProcessLookupError):
        raise raw.PreparationRefusal('seed-creator-invalid') from None


def check_dependency(report, request):
    """Join an externally selected dependency proof to exact immutable seed inputs; no runtime authority."""
    pins = {pin['path']: pin for pin in request['pins']}
    fields = {'schemaVersion', 'artifactDependencyClosureVerified', 'guestConfiguredInstallationVerified',
              'runtimeAuthority', 'imageSha256', 'selectedArtifacts', 'inputBindings', 'tools',
              'requiredEdgeCount', 'matchedEdgeCount', 'unresolved', 'edges', 'receiptSignaturesReplayed',
              'aptPkgVersion', 'conflictsAndBreaks', 'limitations', 'limits', 'trustModel'}
    # Proof: dependency controls inject false closure, runtime authority, image/hash/version/count and foreign bindings.
    require(isinstance(report, dict) and set(report) == fields and type(report['schemaVersion']) is int
            and report['schemaVersion'] == 1 and report['artifactDependencyClosureVerified'] is True
            and report['guestConfiguredInstallationVerified'] is False and report['runtimeAuthority'] is False
            and report['receiptSignaturesReplayed'] is False and report['unresolved'] == []
            and type(report['requiredEdgeCount']) is int and report['requiredEdgeCount'] == 10
            and type(report['matchedEdgeCount']) is int and report['matchedEdgeCount'] == 10
            and report['imageSha256'] == pins[request['image']]['sha256']
            and isinstance(report['edges'], list) and len(report['edges']) == 10
            and all(isinstance(edge, dict) and edge.get('status') == 'matched' for edge in report['edges'])
            and isinstance(report['selectedArtifacts'], list) and len(report['selectedArtifacts']) == 3
            and isinstance(report['inputBindings'], list) and 1 <= len(report['inputBindings']) <= 128
            and isinstance(report['tools'], list) and len(report['tools']) == 3, 'seed-dependency-binding')
    limits = {'addressSpaceBytes': 134217728, 'cpuSeconds': 20, 'wallSeconds': 60,
              'fileBytes': 65536, 'nofile': 64, 'coreBytes': 0, 'controlTarBytes': 1048576,
              'controlBytes': 65536, 'childWallSeconds': 10, 'indexBytesEach': 8388608}
    limitations = ['Retained independently reviewed signature receipts are consumed, not replayed.',
                   'Installed root-owned host tools are trusted independently of package provenance.',
                   'Only direct required edges of selected archives are checked.',
                   'Published image inventory is not actual configured package status.',
                   'Virtual Provides does not satisfy required edges.']
    # Proof: dependency producer-schema controls remove/mistype every diagnostic field and alter fixed limits, including bool zero.
    require(isinstance(report['aptPkgVersion'], str)
            and re.fullmatch('[0-9][0-9A-Za-z.+:~_-]{0,63}', report['aptPkgVersion'])
            and report['trustModel'] == 'installed-host-and-operator-reviewed-retained-signatures'
            and isinstance(report['limits'], dict) and report['limits'] == limits
            and all(type(value) is int for value in report['limits'].values())
            and report['limitations'] == limitations, 'seed-dependency-binding')
    conflicts = {('docker-ce', 'Conflicts', 'docker.io'), ('docker-ce-cli', 'Conflicts', 'docker-cli'),
                 ('docker-ce-cli', 'Conflicts', 'docker.io'), ('docker-ce-cli', 'Breaks', 'docker-ce'),
                 ('containerd.io', 'Conflicts', 'containerd'), ('containerd.io', 'Conflicts', 'runc')}
    require(isinstance(report['conflictsAndBreaks'], list)
            and len(report['conflictsAndBreaks']) == len(conflicts), 'seed-dependency-binding')
    observed_conflicts = set()
    for conflict in report['conflictsAndBreaks']:
        # Proof: dependency conflict controls preserve forged closure=true while injecting matched/extra/missing/duplicate/foreign facts.
        require(isinstance(conflict, dict) and set(conflict) == {'package', 'field', 'name', 'status'}
                and all(isinstance(value, str) for value in conflict.values())
                and conflict['status'] == 'absent', 'seed-dependency-binding')
        selection = (conflict['package'], conflict['field'], conflict['name'])
        require(selection in conflicts and selection not in observed_conflicts, 'seed-dependency-binding')
        observed_conflicts.add(selection)
    selected = {}
    versions = {'docker-ce': '5:29.7.2-1~ubuntu.24.04~noble', 'docker-ce-cli': '5:29.7.2-1~ubuntu.24.04~noble',
                'containerd.io': '2.3.4-1~ubuntu.24.04~noble'}
    for artifact in report['selectedArtifacts']:
        require(isinstance(artifact, dict) and set(artifact) ==
                {'alias', 'package', 'version', 'architecture', 'sha256', 'bytes'}
                and artifact['package'] in versions and artifact['alias'] == artifact['package'] + '.deb'
                and artifact['version'] == versions[artifact['package']] and artifact['architecture'] == 'amd64'
                and artifact['alias'] not in selected, 'seed-dependency-binding')
        member = request['members'][artifact['alias']]
        require(type(artifact['bytes']) is int and artifact['bytes'] == member['bytes']
                and artifact['sha256'] == member['sha256'], 'seed-dependency-binding')
        selected[artifact['alias']] = artifact
    bound = set()
    for observed in report['inputBindings']:
        require(isinstance(observed, dict) and set(observed) == {'path', 'sha256', 'bytes', 'identity'}
                and observed['path'] in pins and observed['path'] not in bound
                and type(observed['bytes']) is int and observed['bytes'] == pins[observed['path']]['bytes']
                and observed['sha256'] == pins[observed['path']]['sha256']
                and isinstance(observed['identity'], list) and len(observed['identity']) == 8,
                'seed-dependency-binding')
        bound.add(observed['path'])
    require(all(request['members'][alias]['path'] in bound for alias in selected)
            and request['image'] in bound, 'seed-dependency-binding')
    tool_paths = set()
    for tool in report['tools']:
        require(isinstance(tool, dict) and set(tool) == {'path', 'resolved', 'sha256', 'bytes', 'identity'}
                and isinstance(tool['path'], str) and isinstance(tool['resolved'], str)
                and tool['resolved'] in pins and tool['resolved'] not in tool_paths
                and type(tool['bytes']) is int and tool['bytes'] == pins[tool['resolved']]['bytes']
                and tool['sha256'] == pins[tool['resolved']]['sha256']
                and isinstance(tool['identity'], list) and len(tool['identity']) == 8
                and tool['identity'][2] == 0, 'seed-dependency-binding')
        tool_paths.add(tool['resolved'])
    require(tool_paths == {'/usr/bin/python3.12', '/usr/bin/dpkg-deb',
            '/usr/lib/python3/dist-packages/apt_pkg.cpython-312-x86_64-linux-gnu.so'}, 'seed-dependency-binding')



def observe_capacity(state, initial=False, after_allocation=False):
    # Proof: capacity-parser control supplies native aligned whitespace, missing/unknown and duplicated readings.
    memory = re.findall(r'^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$', raw.read_text('/proc/meminfo'), re.M)
    require(len(memory) == 1, 'seed-capacity-malformed')
    filesystem = os.statvfs(state)
    available = int(memory[0]) * 1024
    free = filesystem.f_bavail * filesystem.f_frsize
    allocated = raw.allocated_bytes(state)
    check_capacity(available, free, allocated, initial, after_allocation)
    return {'availableMemoryBytes': available, 'freeBytes': free, 'allocatedBytes': allocated,
            'observedNs': time.time_ns()}


def observe_active(unit, pid):
    return raw.observe_active(unit, pid, CAPS, SERVICE_LIMITS)


def check_input_descriptors(binding, request):
    # Proof: original-inputs controls substitute the interpreter and input inode, plus a writable input FD.
    require(raw.stable_identity(os.stat(f"/proc/{binding['pid']}/exe")) == binding['python']
            == raw.stable_identity(os.stat('/usr/bin/python3.12')), 'seed-python-binding')
    paths = {name: request['members'][name]['path'] for name in MEMBERS}
    paths.update({name: request['state'] + '/tools-root/usr/bin/' + name for name in ('genisoimage', 'isoinfo')})
    require(set(binding['inputs']) == set(paths), 'seed-input-changed')
    for name, path in paths.items():
        member = binding['inputs'][name]
        descriptor = member['fd']
        require(type(descriptor) is int and 3 <= descriptor < 64
                and raw.stable_identity(os.stat(f"/proc/{binding['pid']}/fd/{descriptor}")) == member['identity']
                == raw.stable_identity(os.lstat(path)), 'seed-input-changed')
        flags = raw.read_text(f"/proc/{binding['pid']}/fdinfo/{descriptor}", 4096)
        access = re.findall(r'^flags:\s+([0-7]+)$', flags, re.M)
        require(len(access) == 1 and int(access[0], 8) & os.O_ACCMODE == os.O_RDONLY, 'seed-input-writable')


def check_ready(frame, request, request_digest, source, directory, directory_fd):
    # Proof: lifecycle foreign/future frames lose their before-write refusal when these joins are bypassed.
    require(isinstance(frame, dict) and set(frame) == {'phase', 'binding', 'observedNs'}
            and frame['phase'] == 'ready' and type(frame['observedNs']) is int
            and 0 <= time.time_ns()-frame['observedNs'] <= 10 * 10**9, 'seed-ready-invalid')
    binding = frame['binding']
    require(isinstance(binding, dict) and set(binding) == {'pid', 'start', 'unit', 'invocation', 'cgroup',
            'nonce', 'creator', 'iso', 'isoFd', 'python', 'inputs', 'source', 'request'}
            and binding['nonce'] == request['nonce'] and binding['request'] == request_digest
            and binding['source'] == source and type(binding['pid']) is int and binding['pid'] > 0
            and type(binding['isoFd']) is int and 3 <= binding['isoFd'] < 64
            and binding['unit'] == 'puni-seed-' + request['nonce'] + '.service', 'seed-ready-invalid')
    native = observe_active(binding['unit'], binding['pid'])
    require(all(binding[name] == native[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')),
            'seed-ready-invalid')
    check_creator(binding, directory, directory_fd)
    check_input_descriptors(binding, request)
    require(verify_inputs(request) == source, 'seed-source-binding')
    # This is fresh admission while the worker holds the original nonblocking staging lock.
    observe_capacity(request['state'], initial=True)
    return binding


def require_descriptors(allowed):
    directory_fd = os.open('/proc/self/fd', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        for descriptor in map(int, os.listdir(directory_fd)):
            if descriptor in allowed | {directory_fd}:
                continue
            try:
                os.fstat(descriptor)
            except OSError as failure:
                require(failure.errno == raw.errno.EBADF, 'seed-unexpected-fd')
                continue
            # Proof: original-inputs and lifecycle descriptor controls inject a real unexpected open FD.
            raise raw.PreparationRefusal('seed-unexpected-fd')
    finally:
        os.close(directory_fd)


def worker(request, request_digest):
    """Own the staging lock and only original ISO regular-file write grant through durable ACK."""
    resource.setrlimit(resource.RLIMIT_AS, (1024**3,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (ISO_BYTES,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    # Proof: nonpipe worker control reaches its producer barrier when the pipe guard is removed.
    require(all(stat.S_ISFIFO(os.fstat(descriptor).st_mode) for descriptor in (0, 1, 2)), 'seed-worker-pipes')
    staging_fd = raw.acquire_staging(request['state'])
    try:
        produce_seed(request, request_digest, staging_fd)
    finally:
        os.close(staging_fd)


def produce_seed(request, request_digest, staging_fd):
    from contextlib import ExitStack
    with ExitStack() as opened:
        state = request['state']
        source = verify_inputs(request)
        observe_capacity(state, initial=True)
        unit = 'puni-seed-' + request['nonce'] + '.service'
        native = observe_active(unit, os.getpid())
        # Proof: lifecycle invocation injects a foreign environment ID; bypassing this guard accepts it.
        require(os.environ.get('INVOCATION_ID') == native['invocation'], 'seed-worker-invocation')
        directory = state + '/seed-' + request['nonce']
        directory_fd = raw.open_private(directory, directory=True)
        opened.callback(os.close, directory_fd)
        # Proof: lifecycle staging moves every original child into a new700 root; the original lock cannot authorize it.
        require(raw.identity(os.fstat(staging_fd)) == raw.identity(os.lstat(state)), 'seed-staging-changed')
        iso_fd = os.open('seed.iso', os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW,
                         0o600, dir_fd=directory_fd)
        opened.callback(os.close, iso_fd)
        members = open_members(request)
        for member in members.values():
            opened.callback(os.close, member['fd'])
        tools = {}
        for name in ('genisoimage', 'isoinfo'):
            tools[name] = os.open(state + '/tools-root/usr/bin/' + name,
                                  os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            opened.callback(os.close, tools[name])
        inputs = {name: {'fd': member['fd'], 'identity': member['identity']} for name, member in members.items()}
        inputs.update({name: {'fd': descriptor, 'identity': raw.stable_identity(os.fstat(descriptor))}
                       for name, descriptor in tools.items()})
        binding = {name: native[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')}
        binding.update({'nonce': request['nonce'], 'creator': raw.identity(os.fstat(directory_fd)),
                        'iso': raw.identity(os.fstat(iso_fd)), 'isoFd': iso_fd, 'inputs': inputs,
                        'python': raw.stable_identity(os.stat('/proc/self/exe')),
                        'source': source, 'request': request_digest})
        ready_ns = time.time_ns()
        raw.send_frame(1, {'phase': 'ready', 'binding': binding, 'observedNs': ready_ns})
        # Proof: lifecycle missing withholds the actual admission ACK and leaves the original ISO empty.
        raw.receive_ack(0, binding, request_digest)
        # Proof: lifecycle source changes the second observed digest; bypassing this join accepts the attempt.
        require(verify_inputs(request) == source and observe_active(unit, os.getpid()) == native,
                'seed-mutation-binding')
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        check_members(members)
        # Proof: lifecycle staging moves every original child into a new700 root; the original lock cannot authorize it.
        require(raw.identity(os.fstat(staging_fd)) == raw.identity(os.lstat(state)), 'seed-staging-changed')
        observe_capacity(state, initial=True)
        require_descriptors({0, 1, 2, staging_fd, directory_fd, iso_fd, *tools.values(),
                             *(member['fd'] for member in members.values())})
        raw.confine_writer(iso_fd, tools['genisoimage'], (tools['isoinfo'],))
        next_observation = 0
        def monitor():
            nonlocal next_observation
            if time.monotonic() >= next_observation:
                observe_capacity(state)
                check_caps(raw.read_caps(binding['cgroup']))
                next_observation = time.monotonic() + 1
        started_ns = time.time_ns()
        artifact = generate_iso(iso_fd, directory + '/seed.iso', binding['iso'], members, tools,
                                raw.clean_environment(state), monitor)
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        check_members(members)
        counters = {name: raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/' + name, 4096).strip()
                    for name in raw.COUNTERS}
        record = {'binding': binding, 'startedNs': started_ns, 'finishedNs': time.time_ns(),
                  'caps': raw.read_caps(binding['cgroup']), 'counters': counters,
                  'generated': True, 'verified': True}
        check_counter(record, binding, ready_ns, time.time_ns())
        raw.send_frame(1, {'phase': 'complete', 'record': record, 'artifact': artifact})
        # Proof: lifecycle persistence callback checks this original lock is held before the durable ACK.
        # Lifecycle durable substitutes the ACK digest; bypassing the comparison accepts its failed client.
        acknowledgement = raw.receive_frame(0)
        require(acknowledgement == {'durableDigest': raw.digest_json(record)}, 'seed-durability-ack')


def launch_service(request, request_path, request_digest):
    return subprocess.Popen(service_arguments(request, request_path, request_digest),
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=raw.clean_environment(), preexec_fn=raw.client_limits)


def persist_artifact(frame, publish, request):
    """Parent independently hashes the original live-worker ISO before durable publication."""
    binding = frame['record']['binding']
    path = request['state'] + '/seed-' + request['nonce'] + '/seed.iso'
    descriptor = os.open(f"/proc/{binding['pid']}/fd/{binding['isoFd']}", os.O_RDONLY | os.O_CLOEXEC)
    try:
        before = check_iso(descriptor, path, binding['iso'])
        digest = hashlib.sha256()
        offset = 0
        while offset < before.st_size:
            check_iso(descriptor, path, binding['iso'])
            chunk = os.pread(descriptor, min(65536, before.st_size-offset), offset)
            require(bool(chunk), 'seed-stream-length')
            digest.update(chunk)
            offset += len(chunk)
        expected = {'bytes': before.st_size, 'sha256': digest.hexdigest(),
                    'memberBytes': sum(member['bytes'] for member in request['members'].values()),
                    'members': {name: {'bytes': member['bytes'], 'sha256': member['sha256']}
                                for name, member in request['members'].items()},
                    'namespaces': ['iso9660', 'joliet', 'rock-ridge']}
        # Proof: lifecycle artifact/float frames fail this original-FD hash and exact JSON join.
        require(raw.encode_json(frame['artifact']) == raw.encode_json(expected) and 0 < before.st_size <= ISO_BYTES
                and raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor)), 'seed-artifact-binding')
        publish('iso.json', expected)
    finally:
        os.close(descriptor)


def coordinator(request, request_path, request_digest):
    """Reuse raw's fixed bounded lifecycle while selecting only the fixed seed adapter callbacks."""
    adapter = types.SimpleNamespace(
        verify_inputs=verify_inputs, observe_capacity=observe_capacity, observe_unit=raw.observe_unit,
        launch_service=launch_service, check_ready=check_ready, check_counter=check_counter,
        observe_active=observe_active, check_creator=check_creator, check_input_descriptors=check_input_descriptors,
        stop_owned=raw.stop_owned, prefix='seed', caps=CAPS, seconds=70, final_cleanup=True, decode_frame=decode_json,
        completion_fields={'phase', 'record', 'artifact'}, measurement_phase='after-seed-before-worker-exit',
        persist_artifact=lambda frame, publish: persist_artifact(frame, publish, request),
        receipt_fields=lambda record: {'isoBytesLimit': ISO_BYTES, 'memberBytesLimit': MEMBER_BYTES,
                                      'dependencyReport': request['dependencyReport'],
                                      'rawReceipt': request['rawReceipt']})
    return raw.coordinate_attempt(request, request_path, request_digest, adapter)


def decode_json(payload):
    def fields(pairs):
        record = {}
        for name, value in pairs:
            # Proof: JSON nested duplicate and actual lifecycle duplicate-frame controls become accepted without this check.
            require(name not in record, 'seed-json-duplicate')
            record[name] = value
        return record
    return json.loads(payload, object_pairs_hook=fields)


def is_confined_receipt(request, pin):
    return (pin['mode'] == 0o664 and pin['uid'] == os.geteuid()
            and pin['path'] == request['state'] + '/cloud-image-signature.json')


def verify_pin(request, pin):
    """The one retained public signature receipt is confined by its original private parent."""
    if not is_confined_receipt(request, pin):
        return raw.verify_pin(pin)
    directory_fd = raw.open_private(request['state'], directory=True)
    try:
        original = raw.identity(os.fstat(directory_fd))
        raw.verify_pin(pin)
        # Proof: public-receipt control substitutes the parent after the actual content check.
        require(original == raw.identity(os.lstat(request['state']))
                == raw.identity(os.fstat(directory_fd)), 'seed-provenance-root-changed')
        return original
    finally:
        os.close(directory_fd)


def read_pinned_json(request, path):
    from contextlib import ExitStack
    pins = {pin['path']: pin for pin in request['pins']}
    # Proof: JSON controls use an actual 64KiB receipt and absent pin; bypassing the bound loses refusal.
    require(path in pins and pins[path]['bytes'] < raw.RECORD_BYTES, 'seed-provenance-bound')
    with ExitStack() as opened:
        root_fd = None
        if is_confined_receipt(request, pins[path]):
            root_fd = raw.open_private(request['state'], directory=True)
            root_identity = raw.identity(os.fstat(root_fd))
            opened.callback(os.close, root_fd)
        verify_pin(request, pins[path])
        descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        opened.callback(os.close, descriptor)
        before = os.fstat(descriptor)
        payload = raw.read_fd(descriptor)
        require(raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor))
                == raw.stable_identity(os.lstat(path))
                and hashlib.sha256(payload).hexdigest() == pins[path]['sha256'], 'seed-provenance-changed')
        if root_fd is not None:
            # Proof: public-receipt control changes the original parent to0755 during the actual FD read.
            require(root_identity == raw.identity(os.fstat(root_fd)) == raw.identity(os.lstat(request['state']))
                    and stat.S_IMODE(os.fstat(root_fd).st_mode) == 0o700, 'seed-provenance-root-changed')
        return decode_json(payload)


def verify_raw_history(request):
    """Join immutable original request/receipt/provenance; grants no current raw admission."""
    # Proof: raw-provenance controls substitute source/request/authority/history/inode/map facts independently.
    receipt = read_pinned_json(request, request['rawReceipt'])
    require(isinstance(receipt, dict) and receipt.get('schemaVersion') == 1
            and receipt.get('scope') == 'raw-preparation' and receipt.get('accepted') is True
            and receipt.get('guestAuthority') is False and receipt.get('fullRehearsalAuthority') is False
            and type(receipt.get('rawBytes')) is int and receipt['rawBytes'] == raw.RAW_BYTES,
            'seed-raw-binding')
    binding = receipt['binding']
    directory = request['state'] + '/raw-' + binding['nonce']
    require(request['rawReceipt'] == directory + '/receipt.json'
            and receipt['sourceDigest'] == binding['source']
            and receipt['requestDigest'] == binding['request'], 'seed-raw-binding')
    allocation = read_pinned_json(request, directory + '/allocation.json')
    original = read_pinned_json(request, request['rawRequest'])
    pins = {pin['path']: pin for pin in request['pins']}
    require(pins[request['rawRequest']]['sha256'] == receipt['requestDigest']
            and raw.digest_json({pin['path']: pin['sha256'] for pin in original['pins']}) == receipt['sourceDigest']
            and original['nonce'] == binding['nonce'] and original['image'] == request['image'], 'seed-raw-binding')
    provenance = read_pinned_json(request, request['rawProvenance'])
    require(isinstance(provenance, dict) and set(provenance) ==
            {'schemaVersion', 'sourceRevision', 'sourcePins', 'requestDigest', 'receiptDigest'}
            and type(provenance['schemaVersion']) is int and provenance['schemaVersion'] == 1
            and isinstance(provenance['sourceRevision'], str)
            and re.fullmatch('[a-f0-9]{40}', provenance['sourceRevision'])
            and provenance['requestDigest'] == receipt['requestDigest']
            and provenance['receiptDigest'] == pins[request['rawReceipt']]['sha256']
            and isinstance(provenance['sourcePins'], list), 'seed-raw-provenance')
    historical = [pin for pin in original['pins'] if pin['path'].startswith(request['root'] + '/')
                  and not pin['path'].startswith(request['state'] + '/')]
    require(historical and provenance['sourcePins'] == historical, 'seed-raw-provenance')
    return {'path': directory + '/disk.raw', 'binding': binding, 'allocation': allocation,
            'receiptDigest': pins[request['rawReceipt']]['sha256'],
            'sourceRevision': provenance['sourceRevision']}


def verify_raw(request):
    """Preserve v1 current exact map/identity admission on top of immutable historical joins."""
    history = verify_raw_history(request)
    path, binding, allocation = history['path'], history['binding'], history['allocation']
    observation = os.lstat(path)
    require(raw.identity(observation) == binding['raw'] and observation.st_size == raw.RAW_BYTES,
            'seed-raw-binding')
    inspector = raw.load_inspector()
    current = inspector.inspect_file(path, raw.RAW_BYTES)
    require(current['identity'] == allocation['after']['identity']
            and current['mapDigest'] == allocation['after']['mapDigest']
            and current['coverageBytes'] == raw.RAW_BYTES, 'seed-raw-changed')
    return {'receiptDigest': history['receiptDigest'], 'identity': current['identity'],
            'allocationDigest': current['mapDigest'], 'sourceRevision': history['sourceRevision']}


def verify_inputs(request):
    """Rebind current source/tools, signed input provenance and historical raw authority independently."""
    root = request['root']
    state = request['state']
    # Proof: source controls lose exact current-source/pin/interpreter/version/closure refusals when their guards are removed.
    require(str(HELPER) == root + '/tools/tool-fleet/src/lab-seed-preparation.py', 'seed-source-binding')
    pins = {pin['path']: pin for pin in request['pins']}
    required = [str(HELPER), str(HELPER.with_suffix('.ts')), str(HELPER.with_name('lab-seed-preparation-cli.ts')),
                str(HELPER.with_name('lab-raw-preparation.py')), str(HELPER.with_name('lab-raw-allocation.py')),
                root + '/infra/local/qemu-lab.lock.json', '/usr/bin/python3.12',
                '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
                state + '/tools-root/usr/bin/genisoimage', state + '/tools-root/usr/bin/isoinfo']
    require(all(path in pins for path in required), 'seed-source-pins-missing')
    require(os.path.realpath('/usr/bin/python3') == '/usr/bin/python3.12', 'seed-python-binding')
    for pin in request['pins']:
        verify_pin(request, pin)
    lock_path = root + '/infra/local/qemu-lab.lock.json'
    lock = read_pinned_json(request, lock_path)
    environment = raw.clean_environment(state)
    loader = '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
    for name in ('genisoimage', 'isoinfo'):
        tool = state + '/tools-root/usr/bin/' + name
        version = raw.run_bounded([tool, '--version' if name == 'genisoimage' else '-version'], 3,
                                   environment).decode().splitlines()
        expected = lock['qemu']['isoToolVersionLine'] if name == 'genisoimage' else 'isoinfo 1.1.11 (Linux)'
        require(version == [expected], 'seed-tool-version')
        closure = raw.run_bounded([loader, '--list', tool], 3, environment).decode()
        libraries = re.findall(r'(?:=>\s+|^\s*)(/[^\s()]+)', closure, re.M)
        require(libraries and 'not found' not in closure
                and all(os.path.realpath(path) in pins for path in libraries), 'seed-tool-closure')
    dependency = read_pinned_json(request, request['dependencyReport'])
    check_dependency(dependency, request)
    for observed in dependency['inputBindings']:
        require(raw.stable_identity(os.lstat(observed['path'])) == observed['identity'], 'seed-dependency-changed')
    for tool in dependency['tools']:
        require(os.path.realpath(tool['path']) == tool['resolved']
                and raw.stable_identity(os.lstat(tool['resolved'])) == tool['identity'], 'seed-dependency-changed')
    verify_raw(request)
    return raw.digest_json({path: pin['sha256'] for path, pin in pins.items()})


def main():
    try:
        require(len(sys.argv) in (3, 4), 'seed-arguments')
        is_worker = len(sys.argv) == 4
        require(not is_worker or sys.argv[1] == '--worker', 'seed-arguments')
        request_path, request_digest = sys.argv[-2:]
        require(re.fullmatch('[a-f0-9]{64}', request_digest) is not None, 'seed-arguments')
        descriptor = raw.open_private(request_path)
        try:
            before = os.fstat(descriptor)
            payload = raw.read_fd(descriptor)
            require(hashlib.sha256(payload).hexdigest() == request_digest
                    and raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor))
                    == raw.stable_identity(os.lstat(request_path)), 'seed-request-changed')
            request = decode_json(payload)
        finally:
            os.close(descriptor)
        check_request(request)
        for cancellation in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
            signal.signal(cancellation, raw.cancel)
        signal.setitimer(signal.ITIMER_REAL, 60 if is_worker else 80)
        if is_worker:
            worker(request, request_digest)
        else:
            resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2,) * 2)
            resource.setrlimit(resource.RLIMIT_FSIZE, (raw.RECORD_BYTES,) * 2)
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
            print(raw.encode_json(coordinator(request, request_path, request_digest)).decode())
        return 0
    except raw.PreparationRefusal as failure:
        print(str(failure), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError, IndexError, subprocess.SubprocessError):
        print('seed-native-refused', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
