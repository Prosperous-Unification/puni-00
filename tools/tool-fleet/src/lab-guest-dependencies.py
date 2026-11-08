import hashlib
import importlib
import io
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
import tarfile
import time

RECORD_BYTES = 65536
INDEX_BYTES = 8 * 1024**2
CONTROL_TAR_BYTES = 1024**2
INPUT_BYTES = 1024**3
RELATION_FIELDS = ('Pre-Depends', 'Depends', 'Provides', 'Conflicts', 'Breaks')
PACKAGE = r'[a-z0-9][a-z0-9+.-]+'
ARCHITECTURE = r'[a-z0-9][a-z0-9-]*'
VERSION = r'(?:[0-9]+:)?[0-9][A-Za-z0-9.+~:-]*'
ATOM = re.compile(r'(' + PACKAGE + r'(?::' + ARCHITECTURE + r')?)(?:\s*\(\s*(<<|<=|=|>=|>>)\s*(' + VERSION + r')\s*\))?')


class DependencyRefusal(Exception):
    """Fixed public category without paths, child output or underlying exception causes."""


def require(predicate, category):
    if not predicate:
        raise DependencyRefusal(category)


def stable_identity(observation):
    return [observation.st_dev, observation.st_ino, observation.st_uid,
            stat.S_IMODE(observation.st_mode), observation.st_size, observation.st_nlink,
            observation.st_mtime_ns, observation.st_ctime_ns]


def check_deadline(deadline):
    require(time.monotonic() < deadline, 'dependency-deadline')


def encode_report(report):
    encoded = json.dumps(report, separators=(',', ':'), sort_keys=True).encode() + b'\n'
    # Proof: report boundary injects a 64KiB field and observes dependency-report-bound.
    require(len(encoded) <= RECORD_BYTES, 'dependency-report-bound')
    return encoded


def unique_fields(pairs):
    fields = {}
    for name, value in pairs:
        require(name not in fields, 'dependency-input-malformed')
        fields[name] = value
    return fields


def decode_json(content):
    try:
        return json.loads(content, object_pairs_hook=unique_fields,
                          parse_constant=lambda _value: require(False, 'dependency-input-malformed'))
    except (ValueError, UnicodeError, RecursionError):
        raise DependencyRefusal('dependency-input-malformed') from None


def check_pin(pin, root):
    require(isinstance(pin, dict) and set(pin) == {'path', 'sha256', 'bytes', 'uid', 'mode'},
            'dependency-request-invalid')
    require(isinstance(pin['path'], str) and Path(pin['path']).is_absolute()
            and os.path.normpath(pin['path']) == pin['path']
            and pin['path'].startswith(root + '/')
            and isinstance(pin['sha256'], str) and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
            and type(pin['bytes']) is int and 0 < pin['bytes'] <= INPUT_BYTES
            and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
            and type(pin['mode']) is int and pin['mode'] in (0o400, 0o444, 0o600, 0o644, 0o664),
            'dependency-request-invalid')


def check_source(source, root, inventory=False):
    expected = {'release', 'index', 'indexName', 'suite'} if inventory else {'release', 'index', 'indexName', 'keyring'}
    require(isinstance(source, dict) and set(source) == expected, 'dependency-request-invalid')
    require(isinstance(source['indexName'], str)
            and re.fullmatch(r'[a-z0-9-]+/binary-[a-z0-9-]+/Packages', source['indexName']),
            'dependency-request-invalid')
    if inventory:
        require(isinstance(source['suite'], str) and re.fullmatch('[a-z0-9-]+', source['suite']),
                'dependency-request-invalid')
    for role in ('release', 'index') if inventory else ('release', 'index', 'keyring'):
        check_pin(source[role], root)


def check_request(request):
    """Admit only the fixed read-only retained-signature proof; bounds and trust are not caller policy."""
    expected = {'schemaVersion', 'root', 'architecture', 'trustModel', 'receipts', 'image',
                'imageName', 'inventory', 'inventoryName', 'checksums', 'signature', 'keyring',
                'archiveSource', 'inventorySources', 'archives'}
    # Proof: request boundary injects foreign keys, traversal, unconfined paths and trust/limit overrides.
    require(isinstance(request, dict) and set(request) == expected, 'dependency-request-invalid')
    require(type(request['schemaVersion']) is int and request['schemaVersion'] == 1
            and isinstance(request['root'], str) and Path(request['root']).is_absolute()
            and request['root'] != '/' and os.path.normpath(request['root']) == request['root']
            and request['architecture'] == 'amd64'
            and request['trustModel'] == 'installed-host-and-operator-reviewed-retained-signatures'
            and isinstance(request['receipts'], dict)
            and set(request['receipts']) == {'cloud', 'archives', 'inventory'}
            and isinstance(request['archives'], list) and 1 <= len(request['archives']) <= 16
            and isinstance(request['inventorySources'], list) and 1 <= len(request['inventorySources']) <= 4,
            'dependency-request-invalid')
    for role in ('imageName', 'inventoryName'):
        require(isinstance(request[role], str) and re.fullmatch('[a-zA-Z0-9._-]+', request[role])
                and request[role] not in ('.', '..'), 'dependency-request-invalid')
    for pin in list(request['receipts'].values()) + request['archives'] + [request[role] for role in
                ('image', 'inventory', 'checksums', 'signature', 'keyring')]:
        check_pin(pin, request['root'])
    check_source(request['archiveSource'], request['root'])
    suites = set()
    for source in request['inventorySources']:
        check_source(source, request['root'], inventory=True)
        require(source['suite'] not in suites, 'dependency-request-invalid')
        suites.add(source['suite'])
    aliases = [os.path.basename(pin['path']) for pin in request['archives']]
    require(len(set(aliases)) == len(aliases), 'dependency-request-invalid')


def refuse_io(failure):
    if isinstance(failure, FileNotFoundError):
        raise DependencyRefusal('dependency-input-absent') from None
    if isinstance(failure, PermissionError):
        raise DependencyRefusal('dependency-input-unreadable') from None
    raise DependencyRefusal('dependency-input-unsafe') from None


def open_root(root):
    try:
        before = os.lstat(root)
        require(bool(before.st_mode & 0o400), 'dependency-input-unreadable')
        require(stat.S_ISDIR(before.st_mode) and before.st_uid == os.geteuid()
                and stat.S_IMODE(before.st_mode) == 0o700, 'dependency-input-unsafe')
        descriptor = os.open(root, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_DIRECTORY)
        if stable_identity(before) != stable_identity(os.fstat(descriptor)):
            os.close(descriptor)
            raise DependencyRefusal('dependency-input-changed')
        return descriptor
    except OSError as failure:
        refuse_io(failure)


def open_beneath(root_descriptor, path, root):
    """Resolve every directory component through retained nofollow FDs under the original private root."""
    current = os.dup(root_descriptor)
    try:
        parts = path[len(root) + 1:].split('/')
        for part in parts[:-1]:
            following = os.open(part, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_DIRECTORY,
                                dir_fd=current)
            os.close(current)
            current = following
            observed = os.fstat(current)
            require(observed.st_uid in (0, os.geteuid()) and not observed.st_mode & 0o022,
                    'dependency-input-unsafe')
        return os.open(parts[-1], os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK,
                       dir_fd=current)
    finally:
        os.close(current)


def read_pin(pin, root, root_descriptor, deadline, bindings, maximum=RECORD_BYTES,
             retain=True, public_receipt=False, consume=None):
    """Hash actual bytes through one retained FD and compare original FD/path metadata at last use."""
    descriptor = None
    try:
        check_deadline(deadline)
        descriptor = open_beneath(root_descriptor, pin['path'], root)
        before = os.fstat(descriptor)
        root_before = os.fstat(root_descriptor)
        require(root_before.st_uid == os.geteuid() and stat.S_IMODE(root_before.st_mode) == 0o700,
                'dependency-input-unsafe')
        # Proof: input boundary injects absent, mode000, symlink, equal-length replacement and short-read faults.
        require(bool(before.st_mode & 0o400), 'dependency-input-unreadable')
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                and before.st_uid == pin['uid'] and stat.S_IMODE(before.st_mode) == pin['mode']
                and (not before.st_mode & 0o022 or (public_receipt and before.st_uid == os.geteuid()
                     and pin['mode'] == 0o664 and os.path.dirname(pin['path']) == root))
                and 0 < before.st_size <= maximum, 'dependency-input-unsafe')
        require(before.st_size == pin['bytes'], 'dependency-input-changed')
        digest = hashlib.sha256()
        content = bytearray()
        count = 0
        while True:
            check_deadline(deadline)
            chunk = os.read(descriptor, min(1024**2, maximum + 1 - count))
            if not chunk:
                break
            count += len(chunk)
            require(count <= maximum, 'dependency-input-unsafe')
            digest.update(chunk)
            if retain:
                content.extend(chunk)
        require(count == before.st_size and digest.hexdigest() == pin['sha256'],
                'dependency-input-changed')
        os.lseek(descriptor, 0, os.SEEK_SET)
        observation = consume(descriptor) if consume is not None else bytes(content)
        # Proof: identity boundary replaces the path during the original FD read; the replacement is refused.
        last_descriptor = open_beneath(root_descriptor, pin['path'], root)
        try:
            require(stable_identity(before) == stable_identity(os.fstat(descriptor))
                    == stable_identity(os.fstat(last_descriptor))
                    and stable_identity(root_before) == stable_identity(os.fstat(root_descriptor))
                    == stable_identity(os.lstat(root)), 'dependency-input-changed')
        finally:
            os.close(last_descriptor)
        bindings.append({'path': pin['path'], 'bytes': count, 'sha256': pin['sha256'],
                         'identity': stable_identity(before)})
        return observation
    except OSError as failure:
        refuse_io(failure)
    finally:
        if descriptor is not None:
            os.close(descriptor)


def parse_paragraphs(content):
    """Parse bounded Debian control paragraphs without accepting duplicate or orphan fields."""
    require(len(content) <= INDEX_BYTES, 'dependency-control-invalid')
    try:
        text = content.decode('utf8')
    except UnicodeError:
        raise DependencyRefusal('dependency-control-invalid') from None
    require('\x00' not in text and '\r' not in text, 'dependency-control-invalid')
    for paragraph in text.split('\n\n'):
        if not paragraph.strip():
            continue
        fields = {}
        key = None
        for line in paragraph.splitlines():
            if line.startswith((' ', '\t')):
                require(key is not None, 'dependency-control-invalid')
                fields[key] += '\n' + line
            else:
                require(':' in line, 'dependency-control-invalid')
                key, value = line.split(':', 1)
                require(re.fullmatch('[A-Za-z0-9][A-Za-z0-9-]*', key)
                        and key.lower() not in {existing.lower() for existing in fields},
                        'dependency-control-invalid')
                fields[key] = value.lstrip(' ')
        yield fields


def run_child(arguments, descriptors, deadline):
    """Drain both child pipes concurrently; every exceptional path kills and reaps the original child."""
    child = None
    streams = selectors.DefaultSelector()
    try:
        try:
            child = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, pass_fds=descriptors,
                                     env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'}, start_new_session=True)
        except OSError:
            raise DependencyRefusal('dependency-tool-unavailable') from None
        capture = {'stdout': bytearray(), 'stderr': bytearray()}
        for name, stream in (('stdout', child.stdout), ('stderr', child.stderr)):
            require(stream is not None, 'dependency-child-failed')
            os.set_blocking(stream.fileno(), False)
            streams.register(stream, selectors.EVENT_READ, name)
        while streams.get_map():
            # Proof: child boundary stalls a real subprocess and floods stdout; both refuse and reap.
            require(time.monotonic() < deadline, 'dependency-child-timeout')
            for selected, _events in streams.select(min(.05, max(0, deadline - time.monotonic()))):
                chunk = os.read(selected.fd, 4096)
                if not chunk:
                    streams.unregister(selected.fileobj)
                    continue
                capture[selected.data].extend(chunk)
                require(len(capture[selected.data]) <= (CONTROL_TAR_BYTES if selected.data == 'stdout'
                        else RECORD_BYTES), 'dependency-child-bound')
        try:
            status = child.wait(timeout=max(.001, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            raise DependencyRefusal('dependency-child-timeout') from None
        require(status == 0 and not capture['stderr'], 'dependency-child-failed')
        return bytes(capture['stdout'])
    finally:
        streams.close()
        if child is not None:
            # Proof: child-group keeps a grandchild pipe open after parent exit; disabling killpg leaves it live.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                require(child.poll() is not None, 'dependency-child-failed')
            child.wait(timeout=5)
            for stream in (child.stdout, child.stderr):
                if stream is not None:
                    stream.close()


def parse_control(content):
    """Inspect only the bounded control tar stream; no package payload or tar member is written."""
    try:
        require(0 < len(content) <= CONTROL_TAR_BYTES, 'dependency-control-invalid')
        with tarfile.open(fileobj=io.BytesIO(content), mode='r:') as archive:
            chosen = None
            names = set()
            count = 0
            for member in archive:
                count += 1
                name = member.name[2:] if member.name.startswith('./') else member.name
                # Proof: control boundary supplies duplicate, traversal, symlink, oversize and malformed controls.
                require(count <= 64 and not name.startswith('/') and '..' not in name.split('/')
                        and (member.isfile() or member.isdir()) and member.size <= RECORD_BYTES
                        and name not in names, 'dependency-control-invalid')
                names.add(name)
                if name == 'control':
                    require(member.isfile() and 0 < member.size <= RECORD_BYTES,
                            'dependency-control-invalid')
                    stream = archive.extractfile(member)
                    require(stream is not None, 'dependency-control-invalid')
                    with stream:
                        chosen = stream.read(RECORD_BYTES + 1)
                    require(len(chosen) == member.size, 'dependency-control-invalid')
            require(chosen is not None, 'dependency-control-invalid')
            fields = list(parse_paragraphs(chosen))
            require(len(fields) == 1, 'dependency-control-invalid')
            return fields[0]
    except (tarfile.TarError, OSError, ValueError, UnicodeError):
        raise DependencyRefusal('dependency-control-invalid') from None


def load_adapter():
    try:
        adapter = importlib.import_module('apt_pkg')
        adapter.init_system()
        require(callable(adapter.parse_depends) and callable(adapter.check_dep),
                'dependency-tool-unavailable')
        return adapter
    except (ImportError, AttributeError, SystemError):
        raise DependencyRefusal('dependency-tool-unavailable') from None


def valid_version(version):
    if not isinstance(version, str) or not version:
        return False
    remainder = version
    if ':' in version:
        epoch, remainder = version.split(':', 1)
        if not epoch.isascii() or not epoch.isdigit():
            return False
    upstream = remainder
    if '-' in remainder:
        upstream, revision = remainder.rsplit('-', 1)
        if re.fullmatch('[A-Za-z0-9+.~]+', revision) is None:
            return False
    return re.fullmatch('[0-9][A-Za-z0-9.+~:-]*', upstream) is not None


def parse_relations(expression, architecture, adapter=None):
    """Strict binary-package grammar supplements apt's permissive token parser; apt compares versions."""
    require(isinstance(expression, str) and len(expression.encode()) <= RECORD_BYTES,
            'dependency-relation-invalid')
    if expression == '':
        return []
    groups = expression.split(',')
    for group in groups:
        for alternative in group.split('|'):
            # Proof: grammar boundary rejects apt-accepted trailing commas, malformed operators and qualified names.
            atom = ATOM.fullmatch(alternative.strip())
            require(atom is not None, 'dependency-relation-invalid')
            # Proof: grammar boundary accepts all five operators but refuses empty/colon-bearing revisions.
            require(atom.group(3) is None or valid_version(atom.group(3)), 'dependency-relation-invalid')
    if adapter is None:
        adapter = load_adapter()
    try:
        parsed = adapter.parse_depends(expression, strip_multi_arch=False, architecture=architecture)
    except (ValueError, TypeError):
        raise DependencyRefusal('dependency-relation-invalid') from None
    require(len(parsed) == len(groups) and all(parsed), 'dependency-relation-invalid')
    return parsed


def package_identity(fields):
    require(all(isinstance(fields.get(key), str) for key in ('Package', 'Version', 'Architecture'))
            and re.fullmatch(PACKAGE, fields['Package'])
            and valid_version(fields['Version'])
            and re.fullmatch(ARCHITECTURE, fields['Architecture']), 'dependency-control-invalid')
    return fields['Package'], fields['Version'], fields['Architecture']


def release_binding(content, name, pin):
    try:
        lines = content.decode().splitlines()
        require(lines.count('SHA256:') == 1, 'dependency-provenance-invalid')
        rows = []
        for line in lines[lines.index('SHA256:') + 1:]:
            if not line.startswith(' '):
                break
            parts = line.split()
            require(len(parts) == 3 and re.fullmatch('[a-f0-9]{64}', parts[0])
                    and parts[1].isdigit(), 'dependency-provenance-invalid')
            if parts[2] == name:
                rows.append((parts[0], int(parts[1])))
        require(rows == [(pin['sha256'], pin['bytes'])], 'dependency-provenance-invalid')
    except (ValueError, UnicodeError):
        raise DependencyRefusal('dependency-provenance-invalid') from None


def receipt_binding(rows, pin):
    require(isinstance(rows, list), 'dependency-provenance-invalid')
    chosen = [row for row in rows if isinstance(row, dict)
              and os.path.basename(row.get('name', row.get('path', ''))) == os.path.basename(pin['path'])]
    require(len(chosen) == 1 and chosen[0].get('sha256') == pin['sha256']
            and type(chosen[0].get('bytes')) is int and chosen[0]['bytes'] == pin['bytes'],
            'dependency-provenance-invalid')


def checksum_binding(content, name, pin):
    try:
        rows = [line.split() for line in content.decode().splitlines()]
        matches = [row[0] for row in rows if len(row) == 2 and row[1].lstrip('*') == name]
        require(matches == [pin['sha256']], 'dependency-provenance-invalid')
    except UnicodeError:
        raise DependencyRefusal('dependency-provenance-invalid') from None


def read_inventory(content):
    installed = {}
    try:
        for line in content.decode().splitlines():
            parts = line.split('\t')
            require(len(parts) == 2 and parts[0] not in installed
                    and re.fullmatch(PACKAGE + '(?::' + ARCHITECTURE + ')?', parts[0])
                    and valid_version(parts[1]), 'dependency-input-malformed')
            installed[parts[0]] = parts[1]
        require(bool(installed), 'dependency-input-malformed')
        return installed
    except UnicodeError:
        raise DependencyRefusal('dependency-input-malformed') from None


def candidate_matches(candidate, name, version, operator, architecture, adapter):
    parts = name.split(':')
    qualifier = parts[1] if len(parts) == 2 else None
    found_architecture = candidate['architecture']
    architecture_ok = found_architecture in (architecture, 'all') if qualifier in (None, 'native') else qualifier == found_architecture
    if qualifier is None and candidate.get('multiArch') == 'foreign':
        architecture_ok = True
    if qualifier == 'any':
        architecture_ok = candidate.get('multiArch') == 'allowed'
    return architecture_ok and (not operator or adapter.check_dep(candidate['version'], operator, version))


def verify_closure(controls, installed, metadata, architecture, adapter):
    candidates = {}
    for package, fields in controls.items():
        candidates.setdefault(package, []).append({'package': package, 'version': fields['Version'],
                   'architecture': fields['Architecture'], 'multiArch': fields.get('Multi-Arch', ''),
                   'source': 'selected-signed-archive'})
    for name, version in installed.items():
        base = name.split(':')[0]
        rows = metadata.get((name, version), [])
        projections = {(row['Package'], row['Version'], row['Architecture'],
                        row.get('Multi-Arch', ''), row.get('Provides', '')) for row in rows}
        # Proof: receipt boundary adds a second exact-version architecture; metadata ambiguity refuses.
        require(len(projections) <= 1, 'dependency-metadata-ambiguous')
        if not projections:
            continue
        package, exact_version, found_architecture, multi_arch, _provides = next(iter(projections))
        require(len(name.split(':')) == 1 or name.split(':')[1] == found_architecture,
                'dependency-metadata-ambiguous')
        require(base not in controls, 'dependency-metadata-ambiguous')
        candidates.setdefault(package, []).append({'package': name, 'version': exact_version,
                   'architecture': found_architecture, 'multiArch': multi_arch,
                   'source': 'signed-image-inventory-and-exact-index'})
    edges = []
    conflicts = []
    for owner, fields in controls.items():
        for kind in ('Pre-Depends', 'Depends', 'Conflicts', 'Breaks'):
            for alternatives in parse_relations(fields.get(kind, ''), architecture, adapter):
                observations = []
                for name, version, operator in alternatives:
                    base = name.split(':')[0]
                    matching = [candidate for candidate in candidates.get(base, [])
                                if candidate_matches(candidate, name, version, operator, architecture, adapter)
                                and (kind in ('Pre-Depends', 'Depends') or candidate['package'] != owner)]
                    observations.append({'name': name, 'operator': operator, 'requiredVersion': version,
                                         'matches': matching})
                if kind in ('Conflicts', 'Breaks'):
                    require(len(alternatives) == 1, 'dependency-relation-invalid')
                    # Inventory name/version alone can reject a conflict; it cannot satisfy a required edge.
                    name, version, operator = alternatives[0]
                    inventory_conflicts = [found for package, found in installed.items()
                                           if package.split(':')[0] == name.split(':')[0]
                                           and (not operator or adapter.check_dep(found, operator, version))]
                    # Proof: conflicts boundary uses actual named inventory at matching/nonmatching version bounds.
                    require(not inventory_conflicts and not observations[0]['matches'], 'dependency-conflict')
                    conflicts.append({'package': owner, 'field': kind, 'name': name, 'status': 'absent'})
                else:
                    # Proof: relations boundary supplies virtual-only, wrong-version/architecture and missing metadata.
                    require(bool(observations) and any(observation['matches'] for observation in observations),
                            'dependency-unsatisfied')
                    edges.append({'package': owner, 'field': kind, 'alternatives': observations, 'status': 'matched'})
    require(len(edges) <= 256, 'dependency-report-bound')
    return edges, conflicts


def bind_tool(path):
    """Installed root-owned host tools are a declared trust boundary, not a new signature chain."""
    descriptor = None
    try:
        # Proof: tool boundary removes the native path and observes dependency-tool-unavailable without a cause.
        resolved = Path(path).resolve(strict=True)
        descriptor = os.open(resolved, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and not before.st_mode & 0o022,
                'dependency-tool-unavailable')
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024**2)
            if not chunk:
                break
            digest.update(chunk)
        require(stable_identity(before) == stable_identity(os.fstat(descriptor))
                == stable_identity(os.lstat(resolved)), 'dependency-tool-unavailable')
        return {'path': str(path), 'resolved': str(resolved), 'sha256': digest.hexdigest(),
                'bytes': before.st_size, 'identity': stable_identity(before)}
    except OSError:
        raise DependencyRefusal('dependency-tool-unavailable') from None
    finally:
        if descriptor is not None:
            os.close(descriptor)


def verify_dependencies(request):
    """Prove direct required artifact edges from independently reviewed retained signed evidence.

    Published inventory is not configured dpkg status. No virtual Provides satisfies an edge.
    Caller pins must come from independent operator review of the retained signature provenance;
    current content hashes alone are not authorization. Imports perform no I/O, installs or writes.
    Invoke in a dedicated process: this API and CLI impose fixed irreversible OS limits,
    including a 60-second alarm. Merely importing the module changes no process limits.
    """
    check_request(request)
    apply_limits()
    deadline = time.monotonic() + 60
    adapter = load_adapter()
    root = request['root']
    root_descriptor = open_root(root)
    bindings = []
    try:
        def read(pin, maximum=RECORD_BYTES, retain=True, public_receipt=False, consume=None):
            return read_pin(pin, root, root_descriptor, deadline, bindings, maximum, retain,
                            public_receipt, consume)
        cloud = decode_json(read(request['receipts']['cloud'], public_receipt=True))
        vendor = decode_json(read(request['receipts']['archives']))
        base = decode_json(read(request['receipts']['inventory']))
        # Proof: receipt boundary removes the retained signature success and substitutes signed content bindings.
        require(isinstance(cloud, dict) and cloud.get('exit_code') == 0
                and type(cloud.get('exit_code')) is int
                and isinstance(cloud.get('expected_cloud_signer'), str)
                and re.fullmatch('[A-F0-9]{40}', cloud['expected_cloud_signer'])
                and isinstance(cloud.get('status'), str)
                and ('[GNUPG:] VALIDSIG ' + cloud['expected_cloud_signer'] + ' ') in cloud['status']
                and isinstance(vendor, dict) and vendor.get('signed_index_verified') is True
                and vendor.get('cached_archives_verified') is True
                and isinstance(vendor.get('gpgv_status'), str)
                and re.search(r'\[GNUPG:\] VALIDSIG [A-F0-9]{40} ', vendor['gpgv_status'])
                and isinstance(base, dict) and isinstance(base.get('metadata'), list),
                'dependency-provenance-invalid')
        for role, receipt_key in (('checksums', 'checksum_sha256'), ('signature', 'signature_sha256'),
                                  ('keyring', 'keyring_sha256')):
            require(cloud.get(receipt_key) == request[role]['sha256'], 'dependency-provenance-invalid')
        checksums = read(request['checksums'])
        read(request['signature'])
        read(request['keyring'])
        checksum_binding(checksums, request['imageName'], request['image'])
        checksum_binding(checksums, request['inventoryName'], request['inventory'])
        read(request['image'], INPUT_BYTES, retain=False)
        installed = read_inventory(read(request['inventory']))
        source = request['archiveSource']
        for role in ('release', 'index', 'keyring'):
            receipt_binding(vendor.get('inputs'), source[role])
        release = read(source['release'], 1024**2)
        index = read(source['index'], INDEX_BYTES)
        read(source['keyring'])
        release_binding(release, source['indexName'], source['index'])
        controls = {}
        selected = []
        selected_index = list(parse_paragraphs(index))
        for pin in request['archives']:
            receipt_binding(vendor.get('inputs'), pin)
            fields = read(pin, INPUT_BYTES, retain=False, consume=lambda descriptor: parse_control(run_child(
                ['/usr/bin/dpkg-deb', '--threads-max=1', '--ctrl-tarfile', '/proc/self/fd/' + str(descriptor)],
                (descriptor,), min(deadline, time.monotonic() + 10))))
            package, version, architecture = package_identity(fields)
            require(architecture in (request['architecture'], 'all') and package not in controls,
                    'dependency-control-mismatch')
            matches = [row for row in selected_index if (row.get('Package'), row.get('Version'), row.get('Architecture'))
                       == (package, version, architecture)]
            require(len(matches) == 1 and matches[0].get('SHA256') == pin['sha256']
                    and matches[0].get('Size') == str(pin['bytes'])
                    and all(matches[0].get(key, '') == fields.get(key, '') for key in RELATION_FIELDS + ('Multi-Arch',)),
                    'dependency-control-mismatch')
            for kind in RELATION_FIELDS:
                parse_relations(fields.get(kind, ''), request['architecture'], adapter)
            controls[package] = fields
            selected.append({'alias': os.path.basename(pin['path']), 'package': package, 'version': version,
                             'architecture': architecture, 'sha256': pin['sha256'], 'bytes': pin['bytes']})
        del selected_index, index, release
        metadata = {}
        for source in request['inventorySources']:
            matches = [entry for entry in base['metadata'] if isinstance(entry, dict)
                       and entry.get('suite') == source['suite']]
            require(len(matches) == 1 and isinstance(matches[0].get('signatureOutput'), str)
                    and 'gpgv: Good signature from ' in matches[0]['signatureOutput'],
                    'dependency-provenance-invalid')
            for role in ('release', 'index'):
                receipt_binding(matches[0].get('retained'), source[role])
            release = read(source['release'], 1024**2)
            index = read(source['index'], INDEX_BYTES)
            release_binding(release, source['indexName'], source['index'])
            for row in parse_paragraphs(index):
                package = row.get('Package')
                version = row.get('Version')
                for name in (package, str(package) + ':' + str(row.get('Architecture'))):
                    if name in installed and installed[name] == version:
                        package_identity(row)
                        metadata.setdefault((name, version), []).append({key: row[key] for key in
                            ('Package', 'Version', 'Architecture', 'Multi-Arch', 'Provides') if key in row})
            del index, release
        edges, conflicts = verify_closure(controls, installed, metadata, request['architecture'], adapter)
        tools = [bind_tool(path) for path in ('/usr/bin/python3', '/usr/bin/dpkg-deb', adapter.__file__)]
        check_deadline(deadline)
        report = {'schemaVersion': 1, 'artifactDependencyClosureVerified': True,
                  'guestConfiguredInstallationVerified': False, 'runtimeAuthority': False,
                  'receiptSignaturesReplayed': False, 'trustModel': request['trustModel'],
                  'imageSha256': request['image']['sha256'], 'inputBindings': bindings,
                  'selectedArtifacts': selected, 'requiredEdgeCount': len(edges), 'matchedEdgeCount': len(edges),
                  'unresolved': [], 'edges': edges, 'conflictsAndBreaks': conflicts,
                  'tools': tools, 'aptPkgVersion': adapter.VERSION,
                  'limits': {'addressSpaceBytes': 128 * 1024**2, 'cpuSeconds': 20, 'wallSeconds': 60,
                             'fileBytes': RECORD_BYTES, 'nofile': 64, 'coreBytes': 0,
                             'controlTarBytes': CONTROL_TAR_BYTES, 'controlBytes': RECORD_BYTES,
                             'childWallSeconds': 10, 'indexBytesEach': INDEX_BYTES},
                  'limitations': ['Retained independently reviewed signature receipts are consumed, not replayed.',
                                  'Installed root-owned host tools are trusted independently of package provenance.',
                                  'Only direct required edges of selected archives are checked.',
                                  'Published image inventory is not actual configured package status.',
                                  'Virtual Provides does not satisfy required edges.']}
        encode_report(report)
        return report
    except (KeyError, TypeError, ValueError, UnicodeError, RecursionError):
        raise DependencyRefusal('dependency-input-malformed') from None
    except OSError as failure:
        refuse_io(failure)
    finally:
        os.close(root_descriptor)


def apply_limits():
    # Proof: limits boundary observes all five exact native limits; caller overrides refuse at request admission.
    for kind, limit in ((resource.RLIMIT_AS, 128 * 1024**2), (resource.RLIMIT_CPU, 20),
                        (resource.RLIMIT_FSIZE, RECORD_BYTES), (resource.RLIMIT_NOFILE, 64),
                        (resource.RLIMIT_CORE, 0)):
        resource.setrlimit(kind, (limit, limit))
    def expire(_signal, _frame):
        raise DependencyRefusal('dependency-deadline')
    signal.signal(signal.SIGALRM, expire)
    signal.alarm(60)


def main():
    """Read one original private hash-pinned request and emit at most 64KiB; parent persists exclusively."""
    try:
        apply_limits()
        require(len(sys.argv) == 3 and re.fullmatch('[a-f0-9]{64}', sys.argv[2]),
                'dependency-request-invalid')
        path = str(Path(sys.argv[1]).absolute())
        observed = os.lstat(path)
        require(stat.S_IMODE(observed.st_mode) == 0o600 and observed.st_uid == os.geteuid(),
                'dependency-input-unsafe')
        root = os.path.dirname(path)
        root_descriptor = open_root(root)
        try:
            pin = {'path': path, 'sha256': sys.argv[2], 'bytes': observed.st_size,
                   'uid': observed.st_uid, 'mode': 0o600}
            request = decode_json(read_pin(pin, root, root_descriptor, time.monotonic() + 60, []))
        finally:
            os.close(root_descriptor)
        sys.stdout.buffer.write(encode_report(verify_dependencies(request)))
        sys.stdout.buffer.flush()
        return 0
    except DependencyRefusal as failure:
        sys.stdout.buffer.write(encode_report({'category': str(failure)}))
        return 1
    except (OSError, ValueError, TypeError, KeyError, RuntimeError):
        sys.stdout.buffer.write(encode_report({'category': 'dependency-input-malformed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
