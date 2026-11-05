import ast
import ctypes
from contextlib import contextmanager
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
import types

ROOT = Path(__file__).resolve().parents[4]
RELATIVE = 'openspec/changes/observability-environment-parity/evidence/repair-native-control.py'
PLAN = '.superpowers/sdd/observability-environment-parity'
SOURCES = (RELATIVE, *('tools/tool-fleet/src/' + name for name in (
    'lab-repair-worker.py', 'lab-raw-preparation.py', 'lab-guest-preparation.py',
    'lab-seed-preparation.py', 'lab-raw-allocation.py', 'lab-raw-repair.py')))
TOOLS = ('/usr/bin/python3.12', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/git',
         '/usr/bin/true', '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
         '/usr/lib/x86_64-linux-gnu/libc.so.6')
CAPS = {'memory.max': '268435456', 'memory.swap.max': '0',
        'cpu.max': '100000 100000', 'pids.max': '32'}
LIMITS = {'RuntimeMaxUSec': '10s', 'TimeoutStopUSec': '1s', 'KillMode': 'control-group',
          'SendSIGKILL': 'yes', 'LimitAS': '268435456', 'LimitFSIZE': '2097152',
          'LimitNOFILE': '64', 'LimitCORE': '0', 'NoNewPrivileges': 'yes',
          'Restart': 'no', 'UMask': '0077'}
PROPERTIES = ('MemoryMax=268435456', 'MemorySwapMax=0', 'CPUQuota=100%',
              'CPUQuotaPeriodSec=100ms', 'TasksMax=32', 'RuntimeMaxSec=10s',
              'TimeoutStopSec=1s', 'KillMode=control-group', 'SendSIGKILL=yes',
              'LimitAS=268435456', 'LimitFSIZE=2097152', 'LimitNOFILE=64',
              'LimitCORE=0', 'NoNewPrivileges=yes', 'Restart=no', 'UMask=0077')
FUTURE_GUEST = 33619968
FIXTURE_LIMIT = 2 * 1024**2
METADATA_LIMIT = 1024**2
OUTPUT_LIMIT = 65536
WORKER_REFUSALS = frozenset(('raw-staging-occupied raw-staging-changed raw-state-absent '
    'raw-state-unreadable raw-state-unsafe raw-child-timeout raw-child-output-bound raw-child-failed '
    'raw-unit-malformed raw-unit-binding raw-native-caps raw-service-limits raw-ack-missing '
    'raw-ack-invalid source-binding control-deadline worker-native-binding worker-staging-binding '
    'helper-refused-unavailable').split())
GIB = 1024**3
MIB = 1024**2
FIXTURES = {'direct': MIB, 'allocation': 0,
            **{name + suffix: 65536 for name in ('truncate', 'exec', 'fd', 'clone')
               for suffix in ('-guarded', '-fault')},
            'foreign-guarded': 16384, 'foreign-fault': 16384}


WORKER_BOOTSTRAP = r"""
import hashlib, os, stat, sys
try:
    root, expected, request, request_sha, nonce = sys.argv[1:]
    path = root + '/openspec/changes/observability-environment-parity/evidence/repair-native-control.py'
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        # Proof: worker-bootstrap unsafe-mode fault intercepts the first source payload read.
        if not (stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
                and stat.S_IMODE(before.st_mode) == 0o644 and before.st_nlink == 1
                and 0 < before.st_size <= 65536): raise ValueError('worker-source-refused')
        mark = lambda entry: (entry.st_dev, entry.st_ino, entry.st_uid, entry.st_mode,
            entry.st_nlink, entry.st_size, entry.st_mtime_ns, entry.st_ctime_ns)
        payload = os.read(descriptor, 65537)
        valid = (os.path.isabs(root) and os.path.normpath(root) == root
            and stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
            and stat.S_IMODE(before.st_mode) == 0o644 and before.st_nlink == 1
            and 0 < before.st_size == len(payload) <= 65536
            and mark(before) == mark(os.fstat(descriptor)) == mark(os.lstat(path))
            and hashlib.sha256(payload).hexdigest() == expected)
        # Proof: worker-bootstrap hash/path substitution negatives; removing valid guard executes bad metadata.
        if not valid: raise ValueError('worker-source-refused')
    finally: os.close(descriptor)
    compiled = compile(payload, path, 'exec', dont_inherit=True)
    sys.argv = [path, 'worker', request, request_sha, nonce]
    exec(compiled, {'__name__': '__main__', '__file__': path})
except Exception:
    os.write(2, b'repair-native-control: worker-source-refused\n')
    raise SystemExit(1) from None
"""


class Refusal(Exception):
    """A fixed safe category; private input and subprocess diagnostics are never printed."""


def require(predicate, category):
    if not predicate:
        raise Refusal(category)


@contextmanager
def helper_refusals(raw):
    """Bridge modeled helper refusals."""
    try:
        yield
    except raw.PreparationRefusal as failure:
        # Proof: modeled/unknown helper faults preserve only fixed codes.
        category = str(failure)
        raise Refusal(category if category in WORKER_REFUSALS else 'helper-refused-unavailable') from None


def cancel(_number, _frame):
    raise Refusal('control-cancelled')


def encode(record):
    payload = json.dumps(record, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    require(len(payload) <= OUTPUT_LIMIT, 'projection-bound')
    return payload


def digest(record):
    return hashlib.sha256(encode(record)).hexdigest()


def closed(record, fields, category):
    require(type(record) is dict and set(record) == set(fields.split()), category)


def decode(payload):
    def unique(pairs):
        record = {}
        for key, value in pairs:
            require(key not in record, 'request-json')
            record[key] = value
        return record
    try:
        return json.loads(payload, object_pairs_hook=unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(Refusal('request-json')))
    except (ValueError, UnicodeError):
        raise Refusal('request-json') from None


def stable(observation):
    return (observation.st_dev, observation.st_ino, observation.st_uid,
            observation.st_mode, observation.st_nlink, observation.st_size,
            observation.st_blocks, observation.st_mtime_ns, observation.st_ctime_ns)


def read_private(path):
    """Request boundary rejects absent, unreadable, aliased or shared files before imports/launch."""
    try:
        before = os.lstat(path)
        # Proof: selfcheck request-unreadable / request-owner-mode / request-symlink,
        # with the category removed, reach the intercepted first launch.
        require(bool(before.st_mode & 0o400), 'request-unreadable')
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
                and stat.S_IMODE(before.st_mode) & ~0o400 == 0o200 and before.st_nlink == 1,
                'request-owner-mode')
        descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            require(stable(before) == stable(os.fstat(descriptor)), 'request-changed')
            payload = os.read(descriptor, OUTPUT_LIMIT + 1)
            # Proof: selfcheck request-bound reaches intercepted first launch when bound is removed.
            require(len(payload) <= OUTPUT_LIMIT, 'request-bound')
            require(stable(before) == stable(os.fstat(descriptor)) == stable(os.lstat(path)),
                    'request-changed')
            return payload
        finally:
            os.close(descriptor)
    except FileNotFoundError:
        raise Refusal('request-absent') from None
    except PermissionError:
        raise Refusal('request-unreadable') from None
    except OSError:
        raise Refusal('request-owner-mode') from None


def check_pin(pin, path, *, is_runtime=False):
    # Proof: selected empty runtime schema/file pass; source0/runtime-negative refuse; role/guard faults admit source0.
    closed(pin, 'path sha256 bytes uid mode', 'pin-schema')
    require(pin['path'] == path and type(pin['sha256']) is str
            and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
            and type(pin['bytes']) is int and (0 if is_runtime else 1) <= pin['bytes'] <= 128 * MIB
            and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
            and type(pin['mode']) is int and 0 <= pin['mode'] <= 0o755
            and not pin['mode'] & 0o022, 'pin-schema')


def is_runtime_path(path):
    # Proof: startup-role vectors allow both exact hooks, reject nearby/private paths;
    # runtime-closure rejects a declared but unselected hook before hashing.
    return path.startswith(('/usr/lib/python3.12/', '/usr/lib/x86_64-linux-gnu/', '/usr/lib/locale/')) or path in (
        '/etc/python3.12/sitecustomize.py', '/usr/lib/python3/dist-packages/apport_python_hook.py')


def check_request(request, nonce, root=ROOT):
    """No caller command, fixture, bounds, policy or executable selection is accepted."""
    # Proof: selfcheck schema, nonce, paths, pins, kernel and inventory faults exercise this entry.
    closed(request, 'schemaVersion root state outside packet nonce commit pins runtimePins kernel inventory ledger',
           'request-schema')
    require(request['schemaVersion'] == 1 and type(request['schemaVersion']) is int,
            'request-schema')
    require(type(nonce) is str and re.fullmatch('[a-f0-9]{32}', nonce)
            and request['nonce'] == nonce, 'request-nonce')
    require(request['root'] == str(root)
            and request['state'] == str(root / '.puni/fleet-labs/observability-baseline')
            and request['outside'] == str(root / PLAN)
            and request['packet'] == str(root / PLAN / 'repair-native-controls'), 'request-paths')
    require(type(request['commit']) is str and re.fullmatch('[a-f0-9]{40}', request['commit']),
            'source-commit')
    expected = [str(root / relative) for relative in SOURCES] + list(TOOLS)
    require(type(request['pins']) is list and len(request['pins']) == len(expected), 'pin-set')
    for pin, path in zip(request['pins'], expected):
        check_pin(pin, path)
    require(type(request['runtimePins']) is list and 1 <= len(request['runtimePins']) <= 256, 'runtime-pin-set')
    runtime_paths = set()
    for pin in request['runtimePins']:
        require(type(pin) is dict and type(pin.get('path')) is str
                and is_runtime_path(pin['path'])
                and os.path.normpath(pin['path']) == pin['path']
                and pin['path'] not in runtime_paths and pin['path'] not in expected, 'runtime-pin-set')
        check_pin(pin, pin['path'], is_runtime=True)
        require(pin['uid'] == 0, 'runtime-pin-set')
        runtime_paths.add(pin['path'])
    closed(request['kernel'], 'release version machine', 'kernel-schema')
    require(request['kernel']['release'] == '7.0.11-76070011-generic'
            and request['kernel']['machine'] == 'x86_64'
            and type(request['kernel']['version']) is str
            and 1 <= len(request['kernel']['version']) <= 256, 'kernel-schema')
    closed(request['inventory'], 'digest entries retainedBytes outsideBytes', 'inventory-schema')
    inventory = request['inventory']
    require(type(inventory['digest']) is str and re.fullmatch('[a-f0-9]{64}', inventory['digest'])
            and all(type(inventory[key]) is int and 0 <= inventory[key] < 2**64
                    for key in ('entries', 'retainedBytes', 'outsideBytes'))
            and 2 <= inventory['entries'] <= 20000, 'inventory-schema')
    closed(request['ledger'], 'digest records grossBytes', 'ledger-schema')
    ledger = request['ledger']
    require(type(ledger['digest']) is str and re.fullmatch('[a-f0-9]{64}', ledger['digest'])
            and type(ledger['records']) is int and 0 <= ledger['records'] <= 1024
            and type(ledger['grossBytes']) is int and 0 <= ledger['grossBytes'] < 2**64,
            'ledger-schema')


def authorize(path, expected_sha, nonce, root=ROOT):
    """The public run/worker entry reaches no environment read or launch before metadata admission."""
    # Proof: selfcheck request-path and request-digest watched faults hit this exact CLI path.
    require(type(nonce) is str and re.fullmatch('[a-f0-9]{32}', nonce), 'request-nonce')
    require(str(path) == str(root / PLAN / 'repair-native-controls' / ('request-' + nonce + '.json')),
            'request-path')
    require(type(expected_sha) is str and re.fullmatch('[a-f0-9]{64}', expected_sha), 'request-digest')
    payload = read_private(path)
    require(hashlib.sha256(payload).hexdigest() == expected_sha, 'request-digest')
    request = decode(payload)
    check_request(request, nonce, root)
    return request


def verify_file(pin, *, capture=False, deadline=None):
    """Pinned fixed code/tool bytes are stable, regular, singly linked and unshared for mutation."""
    before = os.lstat(pin['path'])
    # Proof: metadata-only selfcheck pin-mode/pin-bytes/pin-hash faults protect intercepted launch.
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
            and before.st_uid == pin['uid'] and stat.S_IMODE(before.st_mode) == pin['mode']
            and before.st_size == pin['bytes'] and not before.st_mode & 0o022, 'pin-identity')
    descriptor = os.open(pin['path'], os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        checksum = hashlib.sha256()
        payload = bytearray()
        blob = hashlib.sha1(b'blob ' + str(before.st_size).encode() + b'\0')
        while True:
            if deadline is not None:
                assert_deadline(deadline)
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            checksum.update(chunk)
            blob.update(chunk)
            if capture:
                payload.extend(chunk)
        require(checksum.hexdigest() == pin['sha256'], 'pin-hash')
        require(stable(before) == stable(os.fstat(descriptor)) == stable(os.lstat(pin['path'])),
                'pin-changed')
        # Proof: source-cache metadata test rewrites the path after this FD read; only captured bytes execute.
        return blob.hexdigest(), bytes(payload) if capture else None
    finally:
        os.close(descriptor)


def check_process_limits(worker=False):
    expected = ((resource.RLIMIT_AS, 256*MIB if worker else 128*MIB),
                (resource.RLIMIT_FSIZE, 2*MIB if worker else OUTPUT_LIMIT),
                (resource.RLIMIT_NOFILE, 64), (resource.RLIMIT_CORE, 0))
    if not worker:
        expected += ((resource.RLIMIT_CPU, 5),)
    require(all(resource.getrlimit(kind) == (value, value) for kind, value in expected),
            'process-effective-limits')
    if worker:
        with open('/proc/self/status', encoding='ascii') as stream:
            status = stream.read(65536)
        require(re.search(r'^NoNewPrivs:\s+1$', status, re.M) is not None
                and re.search(r'^Umask:\s+0077$', status, re.M) is not None,
                'process-no-new-privileges')


def observe_process_limits(pid):
    with open('/proc/' + str(pid) + '/limits', encoding='ascii') as stream:
        limits = stream.read(8193)
    with open('/proc/' + str(pid) + '/status', encoding='ascii') as stream:
        status = stream.read(65537)
    require(len(limits) <= 8192 and len(status) <= 65536, 'process-limit-bound')
    observed = {}
    for name, expected, unit in (('Max address space', 256*MIB, 'bytes'),
                                  ('Max file size', 2*MIB, 'bytes'),
                                  ('Max open files', 64, 'files'),
                                  ('Max core file size', 0, 'bytes')):
        matched = re.findall(r'^' + name + r'\s+([0-9]+)\s+([0-9]+)\s+' + unit + '$', limits, re.M)
        require(matched == [(str(expected), str(expected))], 'process-effective-limits')
        observed[name] = [int(matched[0][0]), int(matched[0][1])]
    require(re.search(r'^NoNewPrivs:\s+1$', status, re.M) is not None
            and re.search(r'^Umask:\s+0077$', status, re.M) is not None, 'process-no-new-privileges')
    return dict(observed, NoNewPrivs=1, Umask='0077')


def fixed_environment():
    environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'PYTHONNOUSERSITE': '1'}
    for key in ('XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'):
        if key in os.environ:
            environment[key] = os.environ[key]
    return environment


def fixed_git(arguments, deadline):
    completed = subprocess.run(['/usr/bin/git', '-C', str(ROOT), *arguments],
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, env=fixed_environment(), timeout=min(1, remaining_time(deadline)))
    assert_deadline(deadline)
    require(completed.returncode == 0 and len(completed.stdout) <= OUTPUT_LIMIT
            and completed.stderr == b'', 'source-commit')
    return completed.stdout


def verify_environment(request, deadline):
    assert_deadline(deadline)
    loaded = verify_runtime_pins(request, deadline)
    repository = {str(ROOT / relative) for relative in SOURCES}
    verified = {pin['path']: verify_file(pin, capture=pin['path'] in repository, deadline=deadline)
                for pin in request['pins'] + [pin for pin in request['runtimePins'] if pin['path'] in loaded]}
    require(sys.version_info[:2] == (3, 12) and sys.flags.isolated == 1
            and sys.dont_write_bytecode and os.path.samefile('/proc/self/exe', TOOLS[0]),
            'runtime-binding')
    native = os.uname()
    require(request['kernel'] == {'release': native.release, 'version': native.version,
                                  'machine': native.machine}, 'kernel-binding')
    require(fixed_git(['rev-parse', '--verify', 'HEAD'], deadline).decode().strip() == request['commit'],
            'source-commit')
    tree = fixed_git(['ls-tree', '-z', request['commit'], '--', *SOURCES], deadline)
    expected = {('100644 blob ' + verified[str(ROOT / relative)][0] + '\t' + relative).encode()
                for relative in SOURCES}
    require(set(tree.removesuffix(b'\0').split(b'\0')) == expected, 'source-commit')
    assert_deadline(deadline)
    return digest(request['pins'] + request['runtimePins']), types.MappingProxyType(
        {path: verified[path][1] for path in repository})


def runtime_paths():
    """Finite actual imported-path/native-map closure, classified before any caller pin is read.

    Python may consume installed root-owned bytecode caches; source hashes alone do not
    attest that bytecode. The root-installed system runtime remains a trusted boundary.
    No dependency scan, subprocess or request-selected path is used to discover this set.
    """
    covered = {str((ROOT / relative).resolve()) for relative in SOURCES}
    covered.update(str(Path(path).resolve()) for path in TOOLS)
    mappings = set()
    with open('/proc/self/maps', encoding='ascii') as stream:
        payload = stream.read(65537)
    require(len(payload) <= 65536, 'runtime-map-bound')
    for line in payload.splitlines():
        fields = line.split(maxsplit=5)
        if len(fields) == 6 and fields[5].startswith('/'):
            require(not fields[5].endswith(' (deleted)'), 'runtime-mapping')
            mappings.add(str(Path(fields[5]).resolve()))
    # Proof: first-open codec is included immediately; omitting its import loses that codec.
    imported = {str(Path(module.__file__).resolve()) for module in tuple(sys.modules.values())
                if getattr(module, '__file__', None) is not None}
    paths = (imported | mappings) - covered
    require(1 <= len(paths) <= 256 and all(is_runtime_path(path) for path in paths), 'runtime-mapping')
    return paths


def verify_runtime_pins(request, deadline, *, complete=False):
    assert_deadline(deadline)
    loaded = runtime_paths()
    declared = {pin['path'] for pin in request['runtimePins']}
    # Proof: runtime-closure metadata tests admit a valid two-phase subset/full closure;
    # unexpected added paths or an unmatched declaration refuse before any new path hash.
    require(loaded == declared if complete else loaded <= declared, 'runtime-pin-set')
    if complete:
        for pin in request['runtimePins']:
            if pin['path'] in loaded:
                verify_file(pin, deadline=deadline)
    assert_deadline(deadline)
    return loaded


def check_loaded_runtime(request, deadline):
    verify_runtime_pins(request, deadline, complete=True)


@contextmanager
def repository_loader(verified):
    """Compile only immutable buffers read from the original SHA-verified source descriptors.

    The scope covers initial and lazy nested sibling imports. Installed system imports retain
    their existing trust boundary; repository bytecode and subsequent path reads are excluded.
    """
    snapshot = types.MappingProxyType(dict(verified))
    # Proof: source-cache missing-buffer and unselected-sibling guard removal admits unsafe metadata.
    require(set(snapshot) == {str(ROOT / relative) for relative in SOURCES}
            and all(type(payload) is bytes for payload in snapshot.values()), 'source-buffer-set')
    original = importlib.util.spec_from_file_location
    class SourceBytes:
        def __init__(self, path):
            self.path = path
        def create_module(self, _specification):
            return None
        def exec_module(self, module):
            # Proof: source-cache substitutes every default cache body and rewrites verified paths;
            # initial and lazy nested imports still execute the same original reviewed byte buffers.
            exec(compile(snapshot[self.path], self.path, 'exec', dont_inherit=True), module.__dict__)
    def select_source(name, location, *arguments, **keywords):
        path = str(Path(location).absolute())
        if path in snapshot:
            return original(name, path, loader=SourceBytes(path))
        require(not path.startswith(str(ROOT) + '/'), 'source-import-unpinned')
        return original(name, location, *arguments, **keywords)
    importlib.util.spec_from_file_location = select_source
    try:
        yield
    finally:
        importlib.util.spec_from_file_location = original


def load_helpers():
    """Only fixed reviewed repository siblings are importable; request fields cannot select a module."""
    helpers = {}
    for name, filename in (('raw', 'lab-raw-preparation.py'), ('writer', 'lab-repair-worker.py'),
                           ('geometry', 'lab-guest-preparation.py'), ('allocation', 'lab-raw-allocation.py'),
                           ('repair', 'lab-raw-repair.py')):
        specification = importlib.util.spec_from_file_location(
            'repair_control_' + name, ROOT / 'tools/tool-fleet/src' / filename)
        require(specification is not None and specification.loader is not None, 'source-import')
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        helpers[name] = module
    for name in ('writer', 'geometry', 'repair'):
        helpers[name].raw = helpers['raw']
        helpers[name].require = helpers['raw'].require
    return helpers


def check_directory(path, private=False):
    observation = os.lstat(path)
    require(stat.S_ISDIR(observation.st_mode) and observation.st_uid == os.geteuid()
            and bool(observation.st_mode & 0o400) and bool(observation.st_mode & 0o100)
            and not observation.st_mode & 0o022
            and (not private or stat.S_IMODE(observation.st_mode) == 0o700), 'directory-identity')
    return observation


def check_inventory_directory(path):
    """Record passive owned evidence without granting active directory authority."""
    observation = os.lstat(path)
    # Proof: inventory0775 vectors retain exact modes; owner/type/read/search/other-write
    # faults refuse, and removing this guard admits them. Active0775 remains refused.
    require(stat.S_ISDIR(observation.st_mode) and observation.st_uid == os.geteuid()
            and bool(observation.st_mode & 0o400) and bool(observation.st_mode & 0o100)
            and not observation.st_mode & 0o002, 'inventory-directory-identity')
    return observation


def inventory_roots(request, deadline=None):
    """Complete metadata-only two-root inventory; never opens retained file payloads.

    Only the exact padded request omits timestamps to avoid its content self-reference.
    Every other entry includes modification identity; all entries retain within-walk checks.
    Directory blocks and symlinks are charged too.
    """
    checksum = hashlib.sha256()
    seen = set()
    totals = [0, 0]
    observed = {}
    count = 0
    for index, root_path in enumerate((request['state'], request['outside'])):
        root_before = (check_directory(root_path, private=True) if index == 0
                       else check_inventory_directory(root_path))
        def refuse_walk(_failure):
            raise Refusal('inventory-unreadable')
        for directory, directories, files in os.walk(root_path, followlinks=False, onerror=refuse_walk):
            check_inventory_directory(directory)
            directories.sort()
            files.sort()
            for name in ['.'] + directories + files:
                path = Path(directory) / name
                if deadline is not None:
                    assert_deadline(deadline)
                before = os.lstat(path)
                observed[str(path)] = stable(before)
                count += 1
                require(count <= 20000, 'inventory-bound')
                require(before.st_uid == os.geteuid()
                        and (stat.S_ISREG(before.st_mode) or stat.S_ISDIR(before.st_mode)
                             or stat.S_ISLNK(before.st_mode)), 'inventory-identity')
                require(stat.S_ISLNK(before.st_mode) or before.st_mode & 0o400,
                        'inventory-unreadable')
                key = (before.st_dev, before.st_ino)
                if key not in seen:
                    totals[index] += before.st_blocks * 512
                    seen.add(key)
                row = [index, str(path.relative_to(root_path)), before.st_dev, before.st_ino,
                       before.st_uid, before.st_mode, before.st_nlink,
                       before.st_size, before.st_blocks * 512]
                # Proof: inventory metadata test edits an unrelated same-inode/size/block file;
                # timestamp removal accepts it, while only exact request rebinding remains stable.
                if path != Path(request['packet']) / ('request-' + request['nonce'] + '.json'):
                    row.extend((before.st_mtime_ns, before.st_ctime_ns))
                checksum.update(encode(row) + b'\n')
                require(stable(before) == stable(os.lstat(path)), 'inventory-changed')
        after = os.lstat(root_path)
        require(stable(root_before) == stable(after), 'inventory-changed')
    require(all(observation == stable(os.lstat(path)) for path, observation in observed.items()),
            'inventory-changed')
    return {'digest': checksum.hexdigest(), 'entries': count,
            'retainedBytes': totals[0], 'outsideBytes': totals[1]}


def observe_capacity(request, helpers, deadline, initial=False, exact=False):
    assert_deadline(deadline)
    raw = helpers['raw']
    inventory = inventory_roots(request, deadline)
    # Proof: metadata capacity selfcheck watched inventory/ledger/space/memory inequalities.
    if exact:
        require(inventory == request['inventory'], 'inventory-binding')
    reservations = helpers['repair'].read_reservations(request['state'])
    ledger = {'digest': digest(reservations), 'records': len(reservations),
              'grossBytes': sum(int(record['grossBytes']) for record in reservations)}
    require(ledger == request['ledger'], 'ledger-binding')
    readings = re.findall(r'^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$',
                          raw.read_text('/proc/meminfo'), re.M)
    require(len(readings) == 1, 'capacity-memory')
    memory = int(readings[0]) * 1024
    free = []
    devices = []
    for path in (request['state'], request['outside']):
        filesystem = os.statvfs(path)
        free.append(filesystem.f_bavail * filesystem.f_frsize)
        devices.append(os.lstat(path).st_dev)
    require(devices[0] == devices[1], 'capacity-backing-device')
    facts = {'inventory': inventory, 'ledger': ledger, 'availableMemoryBytes': memory,
             'freeBytes': min(free), 'initial': initial}
    check_capacity(facts)
    assert_deadline(deadline)
    return facts


def check_capacity(facts):
    inventory = facts['inventory']
    ledger = facts['ledger']
    future = FUTURE_GUEST + FIXTURE_LIMIT + METADATA_LIMIT
    # Proof: initial-memory/metadata-reserve deficits refuse; old reserve reaches launch sentinel.
    require(facts['availableMemoryBytes'] >= 2 * GIB + (640*MIB if facts['initial'] else 0),
            'capacity-memory')
    require(facts['freeBytes'] >= (50 if facts['initial'] else 40) * GIB
            + ledger['grossBytes'] + future, 'capacity-backing')
    require(inventory['outsideBytes'] + future <= 160 * MIB, 'capacity-outside')
    # Proof: staging tests full160MiB threshold/one byte short; owning guard removal accepts excess.
    require(inventory['retainedBytes'] + 160*MIB <= 10 * GIB,
            'capacity-staging')


def assert_deadline(deadline):
    require(time.monotonic() < deadline, 'control-deadline')


def remaining_time(deadline):
    remaining = deadline - time.monotonic()
    require(remaining > 0, 'control-deadline')
    return remaining


@contextmanager
def bounded_observations(raw, deadline):
    """Clamp the existing raw subprocess observer to work, then original-owned cleanup time."""
    cutoff = [deadline]
    original = raw.run_bounded
    def run(arguments, seconds, environment=None, descriptors=(), allowed=(0,), converter=False, monitor=None):
        def watch():
            assert_deadline(cutoff[0])
            if monitor is not None:
                monitor()
            assert_deadline(cutoff[0])
        # Proof: deadline probe substitutions exhaust work during observation; no later ACK/write occurs.
        seconds = min(seconds, remaining_time(cutoff[0]))
        captured = original(arguments, seconds, environment, descriptors, allowed, converter, watch)
        assert_deadline(cutoff[0])
        return captured
    raw.run_bounded = run
    try:
        yield cutoff
    finally:
        raw.run_bounded = original


@contextmanager
def bounded_native_calls(writer, deadline):
    original = writer.native_call
    def call(*arguments):
        assert_deadline(deadline)
        returned = original(*arguments)
        assert_deadline(deadline)
        return returned
    writer.native_call = call
    try:
        yield
    finally:
        writer.native_call = original


def send_ack(raw, descriptor, binding, request_sha, deadline):
    # Proof: deadline tests advance observation clocks across cutoff; mutation/durability ACKs remain absent.
    assert_deadline(deadline)
    raw.send_frame(descriptor, {'bindingDigest': raw.digest_json(binding), 'request': request_sha})
    assert_deadline(deadline)


def send_frame(descriptor, frame):
    payload = encode(frame) + b'\n'
    require(len(payload) <= OUTPUT_LIMIT and os.write(descriptor, payload) == len(payload), 'frame-write')


def receive_frame(raw, descriptor, deadline):
    assert_deadline(deadline)
    frame = raw.receive_frame(descriptor, seconds=min(3.0, remaining_time(deadline)))
    assert_deadline(deadline)
    return frame


def read_service(invocation, streams, deadline, drain=False):
    """Bound pipes; stderr stays tainted."""
    payload = bytearray()
    with selectors.DefaultSelector() as selector:
        for name in streams:
            if not streams[name]['complete']:
                selector.register(getattr(invocation, name), selectors.EVENT_READ, name)
        while selector.get_map():
            if drain and time.monotonic() >= deadline:
                return None
            assert_deadline(deadline)
            for entry, _ in selector.select(min(.05, max(0, deadline-time.monotonic()))):
                name = entry.data
                observed = streams[name]
                total = sum(stream['bytes'] for stream in streams.values())
                chunk = os.read(entry.fd, 1 if name == 'stdout' and not drain else min(4096, max(1, OUTPUT_LIMIT+1-total)))
                if not chunk:
                    observed['complete'] = True
                    selector.unregister(entry.fileobj)
                    continue
                observed['bytes'] += len(chunk)
                observed['hash'].update(chunk)
                if drain and total + len(chunk) > OUTPUT_LIMIT:
                    return None
                # Proof: overflow-fault bypass accepts oversized output.
                require(total + len(chunk) <= OUTPUT_LIMIT, 'service-output-bound')
                if name == 'stdout' and not drain:
                    if chunk == b'\n':
                        return decode(payload)
                    payload.extend(chunk)
    if not drain:
        raise Refusal('service-frame-eof')


def child_case(callback, helpers, deadline):
    """One direct owned child with actual FIFO stdio; no discovery or foreign PID signaling."""
    assert_deadline(deadline)
    writer = helpers['writer']
    input_read, input_write = os.pipe2(os.O_CLOEXEC)
    output_read, output_write = os.pipe2(os.O_CLOEXEC)
    error_read, error_write = os.pipe2(os.O_CLOEXEC)
    assert_deadline(deadline)
    pid = os.fork()
    if pid == 0:
        try:
            os.dup2(input_read, 0)
            os.dup2(output_write, 1)
            os.dup2(error_write, 2)
            for descriptor in (input_read, input_write, output_read, output_write, error_read, error_write):
                if descriptor > 2:
                    os.close(descriptor)
            assert_deadline(deadline)
            observation = callback()
            send_frame(1, observation)
            os._exit(0)
        except BaseException:
            os.write(2, b'case-setup-or-assertion-refused\n')
            os._exit(1)
    for descriptor in (input_read, output_write, error_write):
        os.close(descriptor)
    class ObservedChild(writer.ForkedWriter):
        def poll(self):
            if self.returncode is None:
                reaped, wait_status = os.waitpid(self.pid, os.WNOHANG)
                if reaped:
                    require(reaped == self.pid, 'case-child-reap')
                    self.wait_status = wait_status
                    self.returncode = os.waitstatus_to_exitcode(wait_status)
            return self.returncode
    child = ObservedChild(pid, output_read, input_write, error_read)
    output = bytearray()
    errors = bytearray()
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ, output)
            selector.register(child.stderr, selectors.EVENT_READ, errors)
            while selector.get_map():
                assert_deadline(deadline)
                selected = selector.select(min(.05, max(0, deadline-time.monotonic())))
                for entry, _ in selected:
                    chunk = os.read(entry.fd, 4096)
                    if not chunk:
                        selector.unregister(entry.fileobj)
                    else:
                        entry.data.extend(chunk)
                        require(len(output) <= 4096 and len(errors) <= 4096, 'case-output-bound')
        require(child.wait(timeout=max(.01, min(.2, deadline-time.monotonic()))) == 0
                and errors == b'', 'case-child-exit')
        frames = [decode(line) for line in output.splitlines()]
        return {'pid': pid, 'waitStatus': child.wait_status, 'exitCode': child.returncode, 'frames': frames}
    finally:
        if child.poll() is None:
            child.kill()
        child.wait(timeout=.2)
        child.stdin.close()
        child.stdout.close()
        child.stderr.close()


def close_authorities(target):
    for descriptor in range(3, 64):
        if descriptor == target:
            continue
        try:
            os.close(descriptor)
        except OSError as failure:
            require(failure.errno == errno.EBADF, 'case-descriptor-close')


def invoke_native(writer, number, *arguments):
    ctypes.set_errno(0)
    status = writer.native_call(number, *arguments)
    return {'status': status, 'errno': ctypes.get_errno() if status == -1 else 0}


def file_snapshot(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        opened = os.fstat(descriptor)
        checksum = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            checksum.update(chunk)
        return {'device': opened.st_dev, 'inode': opened.st_ino, 'bytes': opened.st_size,
                'allocatedBytes': opened.st_blocks * 512, 'sha256': checksum.hexdigest()}
    finally:
        os.close(descriptor)


def create_fixtures(request, deadline):
    # Proof: deadline fixture test crosses cutoff in observation and intercepts mkdir; no write starts.
    assert_deadline(deadline)
    directory = Path(request['packet']) / ('fixtures-' + request['nonce'])
    os.mkdir(directory, 0o700)
    for name, length in FIXTURES.items():
        assert_deadline(deadline)
        descriptor = os.open(directory / name, os.O_RDWR | os.O_CREAT | os.O_EXCL
                             | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
        try:
            if length:
                assert_deadline(deadline)
                require(os.write(descriptor, b'X' * length) == length, 'fixture-write')
                assert_deadline(deadline)
                os.fsync(descriptor)
                assert_deadline(deadline)
        finally:
            os.close(descriptor)
    validate_fixtures(directory, initial=True)
    assert_deadline(deadline)
    return directory


def validate_fixtures(directory, initial=False):
    require(set(os.listdir(directory)) == set(FIXTURES), 'fixture-set')
    total = 0
    for name, length in FIXTURES.items():
        observation = os.lstat(directory / name)
        require(stat.S_ISREG(observation.st_mode) and observation.st_uid == os.geteuid()
                and observation.st_nlink == 1 and stat.S_IMODE(observation.st_mode) == 0o600
                and (not initial or observation.st_size == length), 'fixture-identity')
        total += observation.st_blocks * 512
    require(total <= FIXTURE_LIMIT, 'fixture-allocation')
    return total


def run_cases(directory, helpers, deadline):
    raw, writer, geometry, allocation = (helpers[key] for key in ('raw', 'writer', 'geometry', 'allocation'))
    observations = []
    original_fixtures = {name: file_snapshot(directory / name) for name in FIXTURES}
    path = directory / 'direct'
    before = file_snapshot(path)
    initialized_before = allocation.inspect_file(str(path), MIB, require_initialized=True)
    descriptor = os.open(path, os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        original = raw.identity(os.fstat(descriptor))
        def direct():
            writer.confine_child(descriptor, original, geometry)
            flags = fcntl.fcntl(descriptor, fcntl.F_GETFL)
            require(flags & os.O_DIRECT and flags & os.O_DSYNC, 'direct-flags')
            with writer.AlignedBuffer() as buffer:
                writer.rewrite_step(descriptor, buffer, 0)
                offsets = []
                for offset in (2 * GIB, 4 * GIB):
                    observed = invoke_native(writer, 17, ctypes.c_int(descriptor),
                                             ctypes.c_void_p(buffer.address), ctypes.c_size_t(4096),
                                             ctypes.c_longlong(offset))
                    require(observed == {'status': 0, 'errno': 0}, 'offset-native-eof')
                    offsets.append({'offset': offset, **observed})
                wrapped = invoke_native(writer, 17, ctypes.c_int(descriptor),
                                        ctypes.c_void_p(buffer.address), ctypes.c_size_t(4096),
                                        ctypes.c_int(4 * GIB))
                require(wrapped == {'status': 4096, 'errno': 0}
                        and ctypes.string_at(buffer.address, 16) == b'X' * 16, 'offset-wrap-witness')
            return {'case': 'direct-and-offset', 'flags': flags, 'rewriteSteps': 1,
                    'nativeReads': offsets, 'wrapped4GiB': wrapped}
        observations.append(child_case(direct, helpers, deadline))
    finally:
        os.close(descriptor)
    after = file_snapshot(path)
    initialized_after = allocation.inspect_file(str(path), MIB, require_initialized=True)
    require(after == before and initialized_before['mapDigest'] == initialized_after['mapDigest'],
            'direct-final-identity')
    observations.append({'case': 'direct-file', 'before': before, 'after': after,
                         'initializedBefore': initialized_before, 'initializedAfter': initialized_after})
    for family in ('allocation', 'truncate', 'exec', 'fd', 'clone'):
        for fault in ((False,) if family == 'allocation' else (False, True)):
            assert_deadline(deadline)
            name = family if family == 'allocation' else family + ('-fault' if fault else '-guarded')
            path = directory / name
            descriptor = os.open(path, os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
            original = raw.identity(os.fstat(descriptor))
            foreign = (os.open(directory / ('foreign-fault' if fault else 'foreign-guarded'),
                               os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW) if family == 'fd' else None)
            def operation():
                if family == 'allocation':
                    raw.confine_writer(descriptor, None, truncate=False)
                    close_authorities(descriptor)
                    writer.allocate_block(descriptor, 0)
                    observed = os.fstat(descriptor)
                    require(observed.st_size == 4096 and observed.st_blocks * 512 == 4096,
                            'allocation-witness')
                    return {'case': family, 'nativeFallocateCalls': 1, 'status': 0, 'errno': 0}
                if family == 'truncate':
                    raw.confine_writer(descriptor, None, truncate=fault)
                    close_authorities(descriptor)
                    observed = invoke_native(writer, 257, ctypes.c_int(-100),
                                             ctypes.c_char_p(str(path).encode()),
                                             ctypes.c_int(os.O_WRONLY | os.O_TRUNC | os.O_CLOEXEC),
                                             ctypes.c_int(0))
                    if observed['status'] >= 0:
                        os.close(observed['status'])
                    require((observed['status'] >= 0 and observed['errno'] == 0) if fault
                            else observed == {'status': -1, 'errno': errno.EACCES}, 'truncate-witness')
                    return {'case': family, 'fault': fault, 'isolatedBeforeSeccomp': True, **observed}
                if family == 'exec':
                    executable = os.open('/usr/bin/true', os.O_PATH | os.O_CLOEXEC) if fault else None
                    raw.confine_writer(descriptor, executable, truncate=False)
                    close_authorities(descriptor)
                    send_frame(1, {'case': family, 'fault': fault, 'phase': 'attempt',
                                   'isolatedBeforeSeccomp': True})
                    arguments = (ctypes.c_char_p * 2)(b'/usr/bin/true', None)
                    environment = (ctypes.c_char_p * 1)(None)
                    observed = invoke_native(writer, 59, ctypes.c_char_p(b'/usr/bin/true'),
                                             ctypes.cast(arguments, ctypes.c_void_p),
                                             ctypes.cast(environment, ctypes.c_void_p))
                    require(not fault and observed == {'status': -1, 'errno': errno.EACCES}, 'exec-witness')
                    return {'case': family, 'fault': fault, **observed}
                if family == 'fd' and fault:
                    original_close = os.close
                    def skip_only_foreign(number):
                        if number != foreign:
                            original_close(number)
                    os.close = skip_only_foreign
                    try:
                        writer.confine_child(descriptor, original, geometry)
                    finally:
                        os.close = original_close
                else:
                    if family == 'clone' and fault:
                        instructions = list(writer.spawn_filter())
                        positions = [index for index, instruction in enumerate(instructions)
                                     if instruction == (0x15, 0, 1, 56)]
                        require(len(positions) == 1, 'clone-fault-binding')
                        instructions[positions[0]] = (0x15, 0, 1, 999)
                        writer.spawn_filter = lambda: tuple(instructions)
                    writer.confine_child(descriptor, original, geometry)
                if family == 'fd':
                    observed = invoke_native(writer, 18, ctypes.c_int(foreign),
                                             ctypes.c_char_p(b'F'), ctypes.c_size_t(1), ctypes.c_longlong(0))
                    require(observed == ({'status': 1, 'errno': 0} if fault
                                         else {'status': -1, 'errno': errno.EBADF}), 'fd-witness')
                    return {'case': family, 'fault': fault, **observed}
                observed = invoke_native(writer, 56, ctypes.c_ulong(signal.SIGCHLD),
                                         ctypes.c_void_p(0), ctypes.c_void_p(0),
                                         ctypes.c_void_p(0), ctypes.c_ulong(0))
                if observed['status'] == 0:
                    os._exit(0)
                if fault:
                    require(observed['status'] > 0 and observed['errno'] == 0, 'clone-witness')
                    clone_pid = observed['status']
                    clone_deadline = min(deadline, time.monotonic() + .2)
                    while True:
                        reaped, wait_status = os.waitpid(clone_pid, os.WNOHANG)
                        if reaped:
                            require(reaped == clone_pid and os.waitstatus_to_exitcode(wait_status) == 0,
                                    'clone-reap')
                            observed['childWaitStatus'] = wait_status
                            break
                        require(time.monotonic() < clone_deadline, 'clone-reap')
                        time.sleep(.005)
                else:
                    require(observed == {'status': -1, 'errno': errno.EPERM}, 'clone-witness')
                return {'case': family, 'fault': fault, **observed}
            try:
                observed = child_case(operation, helpers, deadline)
                frames = observed['frames']
                require(len(frames) == (1 if family != 'exec' or fault else 2), 'case-frame-count')
                if family == 'exec' and fault:
                    require(frames[0]['phase'] == 'attempt' and observed['exitCode'] == 0, 'exec-success-reap')
                observations.append(observed)
            finally:
                os.close(descriptor)
                if foreign is not None:
                    os.close(foreign)
    for name, length in FIXTURES.items():
        expected = (b'' if name == 'truncate-fault' else b'\0' * 4096 if name == 'allocation'
                    else b'F' + b'X' * (length-1) if name == 'foreign-fault' else b'X' * length)
        snapshot = file_snapshot(directory / name)
        require((snapshot['device'], snapshot['inode'])
                == (original_fixtures[name]['device'], original_fixtures[name]['inode']),
                'fixture-original-inode')
        require(snapshot['bytes'] == len(expected)
                and snapshot['sha256'] == hashlib.sha256(expected).hexdigest(), 'fixture-final-content')
        observations.append({'fixture': name, **snapshot})
    validate_fixtures(directory)
    return observations


def collect_counter(raw, binding, ready_ns, started_ns):
    counters = {name: raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/' + name, 4096).strip()
                for name in raw.COUNTERS}
    return {'binding': binding, 'startedNs': started_ns, 'finishedNs': time.time_ns(),
            'caps': raw.read_caps(binding['cgroup']), 'counters': counters, 'controlled': True}


def worker_control(request, request_sha, helpers, source, deadline):
    raw = helpers['raw']
    unit = 'puni-repair-primitives-' + request['nonce'] + '.service'
    assert_deadline(deadline)
    staging = raw.acquire_staging(request['state'])
    try:
        require(verify_environment(request, deadline)[0] == source, 'source-binding')
        check_loaded_runtime(request, deadline)
        check_process_limits(worker=True)
        initial = observe_capacity(request, helpers, deadline, initial=True, exact=True)
        native = raw.observe_active(unit, os.getpid(), CAPS, LIMITS)
        binding = dict(native, request=request_sha, nonce=request['nonce'], source=source,
                       stagingFd=staging, staging=raw.identity(os.fstat(staging)),
                       processLimits=observe_process_limits(os.getpid()))
        ready_ns = time.time_ns()
        assert_deadline(deadline)
        send_frame(1, {'phase': 'ready', 'binding': binding, 'observedNs': ready_ns})
        raw.check_ack(receive_frame(raw, 0, deadline), binding, request_sha)
        # Request/native/lock/current capacity are refreshed immediately before first fixture write.
        require(raw.observe_active(unit, os.getpid(), CAPS, LIMITS) == native, 'worker-native-binding')
        require(raw.identity(os.lstat(request['state'])) == binding['staging'], 'worker-staging-binding')
        require(verify_environment(request, deadline)[0] == source, 'source-binding')
        check_loaded_runtime(request, deadline)
        observe_capacity(request, helpers, deadline, exact=True)
        started_ns = time.time_ns()
        assert_deadline(deadline)
        directory = create_fixtures(request, deadline)
        with bounded_native_calls(helpers['writer'], deadline):
            observations = run_cases(directory, helpers, deadline)
        final_capacity = observe_capacity(request, helpers, deadline)
        require(raw.observe_active(unit, os.getpid(), CAPS, LIMITS) == native, 'worker-native-binding')
        counter = collect_counter(raw, binding, ready_ns, started_ns)
        raw.check_counter(counter, binding, ready_ns, time.time_ns(), CAPS, ('controlled',))
        assert_deadline(deadline)
        send_frame(1, {'phase': 'complete', 'binding': binding, 'counter': counter,
                       'cases': observations, 'initialCapacity': initial, 'finalCapacity': final_capacity})
        raw.check_ack(receive_frame(raw, 0, deadline), binding, request_sha)
        require(raw.identity(os.lstat(request['state'])) == binding['staging'], 'worker-staging-binding')
    finally:
        os.close(staging)


def check_ready(frame, request, request_sha, source, helpers, deadline):
    assert_deadline(deadline)
    raw = helpers['raw']
    closed(frame, 'phase binding observedNs', 'ready-schema')
    binding = frame['binding']
    closed(binding, 'pid start unit invocation cgroup caps request nonce source stagingFd staging processLimits', 'ready-schema')
    require(frame['phase'] == 'ready' and type(frame['observedNs']) is int
            and 0 <= time.time_ns() - frame['observedNs'] <= 2 * 10**9
            and type(binding['pid']) is int and binding['pid'] > 0
            and binding['request'] == request_sha and binding['nonce'] == request['nonce']
            and binding['source'] == source
            and binding['unit'] == 'puni-repair-primitives-' + request['nonce'] + '.service', 'ready-binding')
    native = raw.observe_active(binding['unit'], binding['pid'], CAPS, LIMITS)
    require(all(binding[key] == value for key, value in native.items()), 'ready-native-binding')
    require(observe_process_limits(binding['pid']) == binding['processLimits']
            and raw.process_start(binding['pid']) == binding['start'], 'ready-process-limits')
    helpers['repair'].check_lock(binding, request['state'])
    assert_deadline(deadline)
    return binding


def persist_projection(packet, nonce, projection, budget, deadline):
    # Proof: deadline publication test intercepts open after cutoff; no projection write starts.
    assert_deadline(deadline)
    payload = encode(projection) + b'\n'
    require(len(payload) <= budget, 'projection-total-bound')
    path = Path(packet) / ('observation-' + nonce + '-' + projection['phase'] + '.json')
    assert_deadline(deadline)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    try:
        assert_deadline(deadline)
        require(os.write(descriptor, payload) == len(payload), 'projection-write')
        assert_deadline(deadline)
        os.fsync(descriptor)
        assert_deadline(deadline)
    finally:
        os.close(descriptor)
    directory = os.open(packet, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        assert_deadline(deadline)
        os.fsync(directory)
        assert_deadline(deadline)
    finally:
        os.close(directory)
    return len(payload)


def run_control(request, path, request_sha, nonce):
    """Root-controlled run, fixed executable/unit/properties, finite original-owned lifecycle."""
    started = time.monotonic()
    deadline = started + 12
    resource.setrlimit(resource.RLIMIT_AS, (128 * MIB,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_FSIZE, (OUTPUT_LIMIT,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    check_process_limits()
    source, verified = verify_environment(request, deadline)
    with repository_loader(verified):
        helpers = load_helpers()
        with helper_refusals(helpers['raw']), bounded_observations(helpers['raw'], deadline) as probe_cutoff:
            coordinate_controls(request, path, request_sha, nonce, source, helpers, started, deadline, probe_cutoff)


def coordinate_controls(request, path, request_sha, nonce, source, helpers, started, deadline, probe_cutoff):
    raw = helpers['raw']
    check_loaded_runtime(request, deadline)
    check_directory(request['packet'], private=True)
    observe_capacity(request, helpers, deadline, initial=True, exact=True)
    require(time.monotonic() - started < 4, 'launch-budget')
    unit = 'puni-repair-primitives-' + nonce + '.service'
    # A preexisting nonce never authorizes replacement, adoption or signaling.
    require(raw.observe_unit(unit)['LoadState'] == 'not-found', 'unit-collision')
    source_pin = next(pin for pin in request['pins'] if pin['path'] == str(ROOT / RELATIVE))
    # Proof: worker-bootstrap source cap fault reaches intercepted launch when this guard is removed.
    require(source_pin['mode'] == 0o644 and source_pin['uid'] == os.geteuid()
            and source_pin['bytes'] <= OUTPUT_LIMIT, 'worker-source-pin')
    # Proof: actual controller interceptor rejects either omitted service locale assignment.
    command = ['/usr/bin/systemd-run', '--user', '--quiet', '--pipe', '--wait', '--collect',
               '--setenv=LANG=C', '--setenv=LC_ALL=C', '--service-type=exec', '--unit=' + unit, *('--property=' + value for value in PROPERTIES),
               '/usr/bin/python3.12', '-I', '-B', '-c', WORKER_BOOTSTRAP, str(ROOT),
               source_pin['sha256'], str(path), request_sha, nonce]
    assert_deadline(deadline)
    require(time.monotonic() - started < 4, 'launch-budget')
    invocation = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, env=fixed_environment(), preexec_fn=raw.client_limits)
    binding = None
    accepted = False
    stage = 'awaiting-ready'
    published = 0
    streams = {name: {'bytes': 0, 'hash': hashlib.sha256(), 'complete': False}
               for name in ('stdout', 'stderr')}
    try:
        ready = read_service(invocation, streams, min(deadline, time.monotonic()+3))
        stage = 'ready-received'
        if type(ready) is dict and ready.get('phase') == 'refused':
            closed(ready, 'phase category request nonce source', 'worker-refusal-schema')  # Proof: schema-fault accepts extra field.
            # Proof: join-fault accepts a foreign request.
            require(ready['request'] == request_sha and ready['nonce'] == nonce
                    and ready['source'] == source, 'worker-refusal-provenance')
            # Proof: code-fault leaks private-token.
            require(type(ready['category']) is str and ready['category'] in WORKER_REFUSALS, 'worker-refusal-cat')
            raise Refusal(ready['category'])
        binding = check_ready(ready, request, request_sha, source, helpers, deadline)
        require(verify_environment(request, deadline)[0] == source, 'source-binding')
        observe_capacity(request, helpers, deadline, exact=True)
        stage = 'ready-verified'
        admission = {'phase': 'admitted', 'binding': binding}
        admission_bytes = len(encode(admission)) + 1
        assert_deadline(deadline)
        send_frame(1, admission)
        published = admission_bytes
        send_ack(raw, invocation.stdin.fileno(), binding, request_sha, deadline)
        stage = 'admitted'
        complete = read_service(invocation, streams, deadline)
        assert_deadline(deadline)
        require(len(encode(ready)) + len(encode(complete)) + 2 <= OUTPUT_LIMIT, 'service-output-total')
        closed(complete, 'phase binding counter cases initialCapacity finalCapacity', 'complete-schema')
        require(complete['phase'] == 'complete' and complete['binding'] == binding, 'complete-binding')
        raw.check_counter(complete['counter'], binding, ready['observedNs'], time.time_ns(), CAPS, ('controlled',))
        require(raw.observe_active(unit, binding['pid'], CAPS, LIMITS)
                == {key: binding[key] for key in ('pid', 'start', 'unit', 'invocation', 'cgroup', 'caps')},
                'complete-native-binding')
        helpers['repair'].check_lock(binding, request['state'])
        assert_deadline(deadline)
        durable_bytes = persist_projection(request['packet'], nonce,
                                          {'phase': 'durable', 'request': request_sha, 'ready': ready,
                                           'complete': complete, 'command': command}, OUTPUT_LIMIT-admission_bytes, deadline)
        published += durable_bytes
        stage = 'durable'
        send_ack(raw, invocation.stdin.fileno(), binding, request_sha, deadline)
        invocation.stdin.close()
        require(invocation.wait(timeout=min(2, remaining_time(deadline))) == 0,
                'service-client-exit')
        before = sum(stream['bytes'] for stream in streams.values())
        read_service(invocation, streams, deadline, drain=True)
        require(all(stream['complete'] for stream in streams.values())
                and sum(stream['bytes'] for stream in streams.values()) == before
                and streams['stderr']['bytes'] == 0, 'service-trailing-output')
        assert_deadline(deadline)
        probe_cutoff[0] = started + 20
        terminal = raw.observe_unit(unit)
        events = raw.group_events(binding['cgroup'])
        raw.check_terminal(terminal, events, invocation.returncode)
        raw.stop_owned(binding)
        repeated = raw.observe_unit(unit)
        repeated_events = raw.group_events(binding['cgroup'])
        raw.check_terminal(repeated, repeated_events, invocation.returncode)
        raw.stop_owned(binding)
        final_capacity = observe_capacity(request, helpers, deadline)
        directory = Path(request['packet']) / ('fixtures-' + nonce)
        allocated = validate_fixtures(directory)
        final_fixtures = {name: file_snapshot(directory / name) for name in FIXTURES}
        declared = {record['fixture']: {key: value for key, value in record.items() if key != 'fixture'}
                    for record in complete['cases'] if type(record) is dict and 'fixture' in record}
        require(final_fixtures == declared, 'terminal-fixture-binding')
        persist_projection(request['packet'], nonce,
                           {'phase': 'terminal', 'request': request_sha, 'binding': binding,
                            'terminal': terminal, 'events': events, 'repeated': repeated,
                            'repeatedEvents': repeated_events, 'repeatOwnedCleanup': True,
                            'fixtures': final_fixtures, 'fixtureAllocatedBytes': allocated,
                            'finalCapacity': final_capacity,
                            'elapsedMilliseconds': int((time.monotonic()-started)*1000)},
                           OUTPUT_LIMIT-durable_bytes-admission_bytes-80, deadline)
        accepted = True
    except BaseException as failure:
        probe_cutoff[0] = started + 20
        try:
            # Wait only for the owned client.
            try:
                invocation.wait(timeout=min(.1, remaining_time(started+20)))
            except subprocess.TimeoutExpired:
                pass  # Running is modeled.
            read_service(invocation, streams, min(started+20, time.monotonic()+.1), drain=True)
            category = str(failure) if isinstance(failure, Refusal) else 'failure-unavailable'
            if isinstance(failure, raw.PreparationRefusal) and str(failure) in WORKER_REFUSALS:
                category = str(failure)
            if re.fullmatch('[a-z0-9-]{1,64}', category) is None:
                category = 'failure-unavailable'
            # Proof: publication fsync fault still closes/reaps.
            persist_projection(request['packet'], nonce,
                {'phase': 'failure', 'accepted': False, 'request': request_sha, 'stage': stage,
                 'category': category, 'workerBinding': 'unavailable' if binding is None else binding,
                 'counter': 'unavailable', 'client': {'pid': invocation.pid, 'exitCode': invocation.poll(),
                            'status': 'exited' if invocation.returncode is not None else 'unavailable-running'},
                 'streams': {name: {'bytes': stream['bytes'], 'sha256': stream['hash'].hexdigest(),
                                    'complete': stream['complete']} for name, stream in streams.items()}},
                OUTPUT_LIMIT-published, started+20)
        except Exception:
            raise Refusal('failure-publication') from None
        raise
    finally:
        probe_cutoff[0] = started + 20
        try:
            if not accepted and binding is not None:
                raw.stop_owned(binding)
        finally:
            if invocation.poll() is None:
                invocation.kill()
            invocation.wait(timeout=min(.2, remaining_time(started+20)))
            if not invocation.stdin.closed:
                invocation.stdin.close()
            invocation.stdout.close()
            invocation.stderr.close()
    print('{"phase":"qualified-tiny-primitives-only"}')


def entry(arguments):
    require(len(arguments) == 4 and arguments[0] in ('run', 'worker'), 'cli-shape')
    action, path, request_sha, nonce = arguments
    request = authorize(path, request_sha, nonce)
    if action == 'run':
        run_control(request, path, request_sha, nonce)
    else:
        deadline = time.monotonic() + 7
        source, verified = verify_environment(request, deadline)
        with repository_loader(verified):
            helpers = load_helpers()
            try:
                with helper_refusals(helpers['raw']), bounded_observations(helpers['raw'], deadline):
                    worker_control(request, request_sha, helpers, source, deadline)
            except Refusal as failure:
                category = str(failure)
                send_frame(1, {'phase': 'refused', 'request': request_sha, 'nonce': nonce, 'source': source,
                    'category': category if category in WORKER_REFUSALS else 'helper-refused-unavailable'})
                raise



def hard_timeout(_number, _frame):
    os.write(2, b'repair-native-control: controller-wall-timeout-unaccepted\n')
    os._exit(124)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['ast-check']:
            ast.parse(Path(__file__).read_bytes())
            print('repair-native-control: AST-valid')
        else:
            signal.signal(signal.SIGALRM, hard_timeout)
            signal.signal(signal.SIGINT, cancel)
            signal.signal(signal.SIGTERM, cancel)
            signal.alarm(20)
            entry(sys.argv[1:])
            signal.alarm(0)
    except Refusal as refusal:
        category = str(refusal)
        if re.fullmatch('[a-z0-9-]{1,64}', category) is None:
            category = 'refused-unexpected'
        os.write(2, ('repair-native-control: ' + category + '\n').encode())
        sys.exit(1)
    except Exception:
        os.write(2, b'repair-native-control: refused-unexpected\n')
        sys.exit(1)
