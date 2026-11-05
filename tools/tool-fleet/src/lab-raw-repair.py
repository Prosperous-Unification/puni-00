import ctypes
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import resource
import signal
import stat
import subprocess
import sys
import time

_spec = importlib.util.spec_from_file_location('repair_raw', Path(__file__).with_name('lab-raw-preparation.py'))
raw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(raw)
require = raw.require


def closed(value, fields):
    """Refuse unknown or missing boundary fields rather than supplying defaults."""
    # Proof: shape bypass admits foreign snapshot fields in native snapshot.
    require(type(value) is dict and set(value) == set(fields.split()), 'repair-shape-invalid')


def unsigned(value):
    """Decode one canonical unsigned64 string without accepting coercion or alternate syntax."""
    # Proof: integer bypass admits alternate native integer syntax in native snapshot.
    require(type(value) is str and re.fullmatch(r'0|[1-9][0-9]{0,19}', value) is not None
            and int(value) <= 2**64 - 1, 'repair-integer-invalid')
    return int(value)


def check_snapshot(expected, observed):
    """Compare exact native observations, without opening a writable target or coercing integers."""
    for snapshot in (expected, observed):
        closed(snapshot, 'device inode owner mode links logicalBytes allocatedBytes mtimeNs ctimeNs')
        for field in ('device', 'inode', 'logicalBytes', 'allocatedBytes', 'mtimeNs', 'ctimeNs'):
            unsigned(snapshot[field])
        # Proof: snapshot predicate bypass admits unsafe native fields in native snapshot.
        require(type(snapshot['owner']) is int and 0 <= snapshot['owner'] < 2**32
                and snapshot['mode'] == '0600' and type(snapshot['links']) is int
                and snapshot['links'] == 1 and snapshot['logicalBytes'] == '8589934592'
                and int(snapshot['allocatedBytes']) <= raw.RAW_BYTES + 1048576
                and int(snapshot['allocatedBytes']) % 4096 == 0, 'repair-snapshot-invalid')
    # Proof: identity bypass admits a one-nanosecond change in native snapshot.
    require(expected == observed, 'repair-snapshot-changed')


def make_reservation(nonce, request_digest, source_digest, snapshot, missing_bytes):
    """Bind fixed gross debt to immutable request/source/native facts; no release or adjustable cap."""
    check_snapshot(snapshot, snapshot)
    # Proof: binding bypass admits malformed nonce/digests in native capacity.
    require(type(nonce) is str and re.fullmatch('[0-9a-f]{32}', nonce) is not None
            and all(type(digest) is str and re.fullmatch('[0-9a-f]{64}', digest) is not None
                    for digest in (request_digest, source_digest)), 'repair-binding-invalid')
    # Proof: missing-byte bypass admits unaligned D in native capacity.
    require(type(missing_bytes) is int and 0 <= missing_bytes <= raw.RAW_BYTES
            and missing_bytes % 4096 == 0, 'repair-missing-invalid')
    return {'schemaVersion': 1, 'nonce': nonce, 'requestDigest': request_digest,
            'sourceDigest': source_digest, 'originalSnapshot': dict(snapshot),
            'missingBytes': str(missing_bytes), 'grossBytes': str(128 * 1024**3 + 28 * missing_bytes)}


def check_reservation(record):
    """Verify the closed immutable original-bound record and independently recompute fixed debt."""
    closed(record, 'schemaVersion nonce requestDigest sourceDigest originalSnapshot missingBytes grossBytes')
    # Proof: record bypass admits an inconsistent gross reservation in native capacity.
    require(type(record['schemaVersion']) is int and record['schemaVersion'] == 1,
            'repair-reservation-invalid')
    missing = unsigned(record['missingBytes'])
    unsigned(record['grossBytes'])
    # Proof: record bypass admits an inconsistent gross reservation in native capacity.
    require(record == make_reservation(record['nonce'], record['requestDigest'], record['sourceDigest'],
                                      record['originalSnapshot'], missing), 'repair-reservation-invalid')


def check_profile(profile, snapshot):
    """Require the reviewed source predicate. Caller must obtain and freshly join native facts."""
    expected = {'filesystem': 'ext4', 'blockBytes': 4096, 'clusterBytes': 4096,
                'inodeFlags': 524288, 'delalloc': True, 'dioreadNolock': True,
                'dataMode': 'ordered', 'kernelRelease': '7.0.11-76070011-generic',
                'kernelSourceCommit': '49748809f7e18ca62f2e054523f1e2c0eb7a88ad',
                'rawDevice': snapshot['device'], 'witnessDevice': snapshot['device'],
                'witnessBytes': 79, 'witnessAllocatedBytes': 4096,
                'witnessStable': True, 'witnessRegular': True, 'rawRegular': True}
    # Proof: profile bypass admits an unsupported predicate in native capacity.
    require(type(profile) is dict and set(profile) == set(expected)
            and all(type(profile[key]) is type(value) and profile[key] == value
                    for key, value in expected.items()), 'repair-profile-invalid')


def check_capacity(facts, profile, current, reservations, step, initial=False):
    """Logical admission only. Hold original staging lock and refresh native/source/deadline joins.

    Retained inode bytes come from raw.allocated_bytes, which includes the existing raw once.
    Pending current debt is added once; published current debt must match exactly. Never give
    credit for completion, smaller inode blocks, fsync or absent successful receipts.
    """
    closed(facts, 'availableMemoryBytes freeBytes retainedInodeBytes otherFutureReservations')
    # Proof: quantity bypass admits boolean capacity facts in native capacity.
    require(all(type(quantity) is int and 0 <= quantity <= 2**64 - 1 for quantity in facts.values())
            and type(initial) is bool, 'repair-capacity-invalid')
    check_reservation(current)
    check_profile(profile, current['originalSnapshot'])
    # Proof: ledger bound bypass admits 1,025 records in native capacity/metadata-bounds.
    require(type(reservations) is list and len(reservations) <= 1024, 'repair-ledger-bound')
    by_nonce = {}
    for record in reservations:
        check_reservation(record)
        # Proof: duplicate bypass hides repeated debt in native capacity.
        require(record['nonce'] not in by_nonce, 'repair-ledger-duplicate')
        by_nonce[record['nonce']] = record
    if current['nonce'] in by_nonce:
        # Proof: binding bypass admits changed current debt in native capacity.
        require(by_nonce[current['nonce']] == current, 'repair-reservation-changed')
    by_nonce[current['nonce']] = current
    # Proof: step bypass admits an oversized preallocation batch in native capacity.
    require(type(step) is dict, 'repair-step-invalid')
    if step.get('kind') == 'preallocate':
        closed(step, 'kind calls')
        # Proof: step bypass admits an oversized preallocation batch in native capacity.
        require(type(step['calls']) is int and 1 <= step['calls'] <= 256, 'repair-step-invalid')
        growth = step['calls'] * 114688
    else:
        closed(step, 'kind bytes')
        # Proof: step bypass admits an oversized preallocation batch in native capacity.
        require(step['kind'] == 'rewrite' and type(step['bytes']) is int
                and step['bytes'] == 1048576, 'repair-step-invalid')
        growth = 16 * 1024**2
    # Proof: memory-floor bypass admits one-byte-short memory in native capacity.
    require(facts['availableMemoryBytes'] >= (3623878656 if initial else 2147483648),
            'repair-memory-floor')
    debt = sum(int(record['grossBytes']) for record in by_nonce.values())
    # Proof: backing-floor bypass admits one-byte-short free bytes in native capacity.
    require(facts['freeBytes'] >= (50 if initial else 40) * 1024**3
            + debt + facts['otherFutureReservations'], 'repair-backing-floor')
    # Proof: staging bypass admits one-byte-short step growth in native capacity.
    require(facts['retainedInodeBytes'] + raw.RESERVE_BYTES + growth <= raw.STAGING_BYTES,
            'repair-staging-bound')


def read_record(path):
    """Read bounded private original metadata and refuse changed paths, FD state or noncanonical JSON."""
    descriptor = raw.open_private(path)
    try:
        before = os.fstat(descriptor)
        # Proof: injected read failure refuses before next-authority in metadata-read.
        payload = raw.read_fd(descriptor)
        # Proof: changed-read bypass reaches next-authority in metadata-changed.
        require(raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor))
                == raw.stable_identity(os.lstat(path)), 'repair-state-changed')
        record = json.loads(payload)
        # Proof: canonical bypass admits alternate/duplicate JSON encodings in metadata-negative.
        require(payload == raw.encode_json(record), 'repair-json-noncanonical')
        return record
    finally:
        # Proof: injected close failure refuses before next-authority in metadata-close.
        os.close(descriptor)


class PendingAttempt:
    """Original coordinator FD borrowed until publication, never an external admission token.

    Construct only via capture_pending from coordinate_attempt's original check_ready callback.
    That caller must prove exclusive creation, live worker/source/request joins and lock ownership;
    reopening a historical directory is forbidden. This metadata layer does not prove those joins.
    """

    def __init__(self, directory, descriptor, record):
        self.directory = directory
        self.descriptor = descriptor
        self.record = raw.encode_json(record)
        self.original = raw.identity(os.fstat(descriptor))


def check_binding(directory, record):
    """Join both pending and retained debt to the original coordinator request/source binding."""
    binding = read_record(Path(directory) / 'request-binding.json')
    closed(binding, 'requestDigest sourceDigest initial unitBefore')
    # Proof: request/source bypass admits substituted pending or prior binding in metadata-boundaries.
    require(binding['requestDigest'] == record['requestDigest']
            and binding['sourceDigest'] == record['sourceDigest'], 'repair-pending-binding')


def check_pending(pending):
    """Refuse substituted descriptors, records, paths or previously published pending exclusions."""
    # Proof: pending type bypass admits a forged token in metadata-boundaries.
    require(type(pending) is PendingAttempt, 'repair-pending-invalid')
    record = json.loads(pending.record)
    check_reservation(record)
    opened = os.fstat(pending.descriptor)
    # Proof: original-FD bypass admits a foreign directory descriptor in metadata-boundaries.
    require(raw.identity(opened) == pending.original == raw.identity(os.lstat(pending.directory))
            and stat.S_ISDIR(opened.st_mode) and opened.st_uid == os.geteuid()
            and stat.S_IMODE(opened.st_mode) == 0o700
            and Path(pending.directory).name == 'raw-repair-' + record['nonce'], 'repair-pending-changed')
    check_binding(pending.directory, record)
    # Proof: pending-publication bypass excludes already published debt in metadata-durable.
    require(not os.path.lexists(Path(pending.directory) / 'reservation.json'), 'repair-state-occupied')
    return record


def capture_pending(directory, directory_fd, record):
    """Capture the original ready callback FD; caller retains FD lifetime and exclusive-creation proof."""
    check_reservation(record)
    pending = PendingAttempt(str(directory), directory_fd, record)
    check_pending(pending)
    return pending


def publish_reservation(pending, record):
    """Persist fixed debt through raw.persist before returning to the original coordinator ACK path.

    Requires original staging lock and native check_ready joins. No raw operation or ACK is exposed.
    A persistence/read/close failure throws; a partially published record remains debt and is never
    overwritten, adopted or released. The caller must abort rather than issue another authority.
    """
    original = check_pending(pending)
    check_reservation(record)
    # Proof: binding bypass admits changed current debt in native capacity.
    require(record == original, 'repair-reservation-changed')
    # Proof: file/dir fsync and changed-write faults refuse before next-authority in metadata-* tests.
    raw.persist(pending.directory, 'reservation.json', record, directory_fd=pending.descriptor)
    # Proof: binding bypass admits changed current debt in native capacity.
    require(read_record(Path(pending.directory) / 'reservation.json') == original,
            'repair-reservation-changed')


def read_reservations(state, pending=None):
    """Charge every repair directory, including failed/cancelled attempts without accepted receipts.

    Hold the original staging lock throughout enumeration/admission. Only the trusted original
    coordinator PendingAttempt may exclude its unpublished directory. Published attempts owe G
    until a complete accepted release joins.
    Traversal is top-level (the fixed attempt layout), bounded to 20,000 entries/1,024 records and
    <64KiB per read. Missing/unreadable/malformed state throws; absent optional release remains pending.
    """
    root_fd = raw.open_private(state, directory=True)
    try:
        original = raw.identity(os.fstat(root_fd))
        pending_record = None
        if pending is not None:
            pending_record = check_pending(pending)
            # Proof: pending type bypass admits a forged token in metadata-boundaries.
            require(Path(pending.directory).parent == Path(state), 'repair-pending-invalid')
        records = []
        seen = set()
        excluded = False
        with os.scandir(root_fd) as entries:
            for count, entry in enumerate(entries, 1):
                # Proof: traversal bypass accepts 20,001 scanned entries in metadata-bounds.
                require(count <= 20000, 'repair-traversal-bound')
                if not entry.name.startswith('raw-repair-'):
                    continue
                directory = Path(state) / entry.name
                descriptor = raw.open_private(directory, directory=True)
                try:
                    identity = raw.identity(os.fstat(descriptor))
                    if pending_record is not None and entry.name == 'raw-repair-' + pending_record['nonce']:
                        # Proof: pending type bypass admits a forged token in metadata-boundaries.
                        require(identity == pending.original and not excluded, 'repair-pending-invalid')
                        check_pending(pending)
                        excluded = True
                        continue
                    record = read_record(directory / 'reservation.json')
                    check_reservation(record)
                    check_binding(directory, record)
                    # Proof: binding bypass admits changed current debt in native capacity.
                    require(entry.name == 'raw-repair-' + record['nonce']
                            and record['nonce'] not in seen, 'repair-reservation-changed')
                    # Proof: changed-read bypass reaches next-authority in metadata-changed.
                    require(identity == raw.identity(os.lstat(directory)), 'repair-state-changed')
                    seen.add(record['nonce'])
                    if not read_release(directory, identity, record):
                        records.append(record)
                    # Proof: ledger bound bypass admits 1,025 records in native capacity/metadata-bounds.
                    require(len(seen) <= 1024, 'repair-ledger-bound')
                finally:
                    os.close(descriptor)
        # Proof: pending-presence bypass admits a missing original entry in metadata-boundaries.
        require(pending is None or excluded, 'repair-pending-absent')
        # Proof: changed-read bypass reaches next-authority in metadata-changed.
        require(original == raw.identity(os.fstat(root_fd)) == raw.identity(os.lstat(state)),
                'repair-state-changed')
        return records
    finally:
        os.close(root_fd)


def read_release(directory, identity, reservation):
    """Credit only the fixed producer's complete accepted certificate under its pinned source contract.

    Files cannot reconstruct publication ordering. The certificate is authority only because the
    independently pinned coordinator creates it after those returns and terminal cleanup. Absent
    optional proof is pending; every present proof requires all original private canonical joins.
    Canonical receipt bytes witness the prior certificate publish return, not their own directory
    sync or a successful runtime envelope. A present failure still refuses; later v2 consumers
    require their separate fresh success/provenance authority.
    """
    certificate_path = Path(directory) / 'release.json'
    try:
        os.lstat(certificate_path)
    except FileNotFoundError:
        return False
    certificate = read_record(certificate_path)
    closed(certificate, 'schemaVersion nonce requestDigest sourceDigest reservationDigest bindingDigest '
                        'counterDigest repairDigest directory profile publication quiescence cleanup '
                        'terminal groupEvents finalSnapshot issuedNs')
    receipt = read_record(Path(directory) / 'receipt.json')
    counter = read_record(Path(directory) / 'worker-counter.json')
    artifact = read_record(Path(directory) / 'repair.json')
    ready = read_record(Path(directory) / 'worker-ready.json')
    closed(artifact, 'schemaVersion repair originalReceiptDigest failedGuestDigest requestDigest sourceDigest '
                     'reservationDigest counterDigest guestAuthority fullRehearsalAuthority grossDebtRetained')
    closed(receipt, 'schemaVersion scope accepted guestAuthority fullRehearsalAuthority requestDigest sourceDigest '
                    'binding counterDigest measurementPhase counterPersistence terminal groupEvents finalCapacity '
                    'finishedNs repairDigest releaseDigest rawBytes lineage grossDebtRetained trust')
    # Proof: fix ready-bool guard removal credits canonical observedNs=False before delegated comparisons.
    require(type(ready['observedNs']) is int and 0 < ready['observedNs'] <= 2**64 - 1,
            'repair-release-ready-time')
    # Proof: fix receipt-float guard removal credits canonical float finishedNs before delegated comparisons.
    require(type(receipt['finishedNs']) is int and 0 < receipt['finishedNs'] <= 2**64 - 1,
            'repair-release-receipt-time')
    capacity = receipt['finalCapacity']
    # Proof: fix capacity guard removal credits malformed canonical shape, quantity, clock or retained flag.
    require(type(capacity) is dict and set(capacity) == {
                'availableMemoryBytes', 'freeBytes', 'retainedInodeBytes', 'otherFutureReservations',
                'observedNs', 'grossDebtRetained'}
            and all(type(capacity[field]) is int and 0 <= capacity[field] <= 2**64 - 1
                    for field in ('availableMemoryBytes', 'freeBytes', 'retainedInodeBytes', 'otherFutureReservations'))
            and type(capacity['observedNs']) is str
            and re.fullmatch('[1-9][0-9]{0,19}', capacity['observedNs']) is not None
            and int(capacity['observedNs']) <= 2**64 - 1
            and capacity['grossDebtRetained'] is True, 'repair-release-capacity-invalid')
    # Proof: fix trust guard removal credits a canonical receipt with a non-source-produced trust value.
    require(type(receipt['trust']) is str
            and receipt['trust'] == 'independently-selected-content-pins; signatures remain separate input provenance',
            'repair-release-trust-invalid')
    check_repair(artifact['repair'], reservation['originalSnapshot'])
    check_profile(certificate['profile'], artifact['repair']['after'])
    binding = counter['binding']
    check_counter(counter, binding, ready['observedNs'], receipt['finishedNs'])
    raw.check_terminal(receipt['terminal'], receipt['groupEvents'], 0)
    # Proof: release ledger-{source,directory,reservation,counter,artifact,binding,receipt,premature,
    # profile,cleanup,terminal,artifact-schema,receipt-schema,artifact-history} corrupt actual
    # published records; bypass admits unsafe credit.
    require(type(certificate['schemaVersion']) is int and certificate['schemaVersion'] == 1
            and certificate['nonce'] == reservation['nonce'] == binding['nonce']
            and certificate['requestDigest'] == reservation['requestDigest'] == receipt['requestDigest']
                == artifact['requestDigest'] == binding['request']
            and certificate['sourceDigest'] == reservation['sourceDigest'] == receipt['sourceDigest']
                == artifact['sourceDigest'] == binding['source']
            and certificate['reservationDigest'] == raw.digest_json(reservation)
                == artifact['reservationDigest'] == binding['reservationDigest']
            and certificate['directory'] == identity == binding['creator']
            and certificate['bindingDigest'] == raw.digest_json(binding)
            and ready['binding'] == receipt['binding'] == binding
            and certificate['counterDigest'] == receipt['counterDigest'] == artifact['counterDigest']
                == raw.digest_json(counter)
            and certificate['repairDigest'] == receipt['repairDigest'] == raw.digest_json(artifact)
            and receipt['releaseDigest'] == raw.digest_json(certificate)
            and certificate['publication'] == 'exclusive-counter-dir-before-exclusive-repair-dir'
            and certificate['quiescence'] == 'sole-original-worker-reaped-child-original-fd-drained'
            and certificate['cleanup'] == 'verified-original-unit-empty'
            and certificate['terminal'] == receipt['terminal']
            and certificate['groupEvents'] == receipt['groupEvents']
            and certificate['finalSnapshot'] == artifact['repair']['after']
            and type(certificate['issuedNs']) is int
            and counter['finishedNs'] <= certificate['issuedNs'] <= receipt['finishedNs']
            and type(receipt['schemaVersion']) is int and receipt['schemaVersion'] == 1
            and type(artifact['schemaVersion']) is int and artifact['schemaVersion'] == 1
            and all(type(artifact[field]) is str and re.fullmatch('[a-f0-9]{64}', artifact[field]) is not None
                    for field in ('originalReceiptDigest', 'failedGuestDigest'))
            and artifact['grossDebtRetained'] is True
            and receipt['scope'] == 'raw-repair-preparation'
            and receipt['accepted'] is True and receipt['guestAuthority'] is False
            and receipt['fullRehearsalAuthority'] is False and receipt['grossDebtRetained'] is False
            and receipt['rawBytes'] == raw.RAW_BYTES and receipt['lineage'] == 'continued-guest'
            and receipt['measurementPhase'] == RepairCoordinator.measurement_phase
            and receipt['counterPersistence'] == 'coordinator-fsync-before-worker-durability-ack'
            and artifact['guestAuthority'] is False and artifact['fullRehearsalAuthority'] is False
            and not os.path.lexists(Path(directory) / 'failure.json'), 'repair-release-invalid')
    return True


HELPER = Path(__file__).resolve()
for _name, _filename in (('seed', 'lab-seed-preparation.py'), ('writer', 'lab-repair-worker.py'),
                         ('geometry', 'lab-guest-preparation.py')):
    _helper_spec = importlib.util.spec_from_file_location('repair_' + _name, HELPER.with_name(_filename))
    require(_helper_spec is not None and _helper_spec.loader is not None, 'repair-helper-unavailable')
    _helper = importlib.util.module_from_spec(_helper_spec)
    _helper_spec.loader.exec_module(_helper)
    _helper.raw = raw
    _helper.require = require
    globals()[_name] = _helper


def check_request(request):
    """Closed current request; no writable target, limit, policy, range or output selection."""
    closed(request, 'schemaVersion root state nonce pins image rawRequest rawReceipt rawProvenance '
                    'priorGuestRequest priorGuestFailure postBootEvidence expectedRaw witness')
    # Proof: request extra/schema/foreign path/duplicate pins controls refuse before any service launch.
    require(type(request['schemaVersion']) is int and request['schemaVersion'] == 1
            and type(request['root']) is str and Path(request['root']).is_absolute()
            and os.path.normpath(request['root']) == request['root']
            and request['state'] == request['root'] + '/.puni/fleet-labs/observability-baseline'
            and type(request['nonce']) is str and re.fullmatch('[a-f0-9]{32}', request['nonce'])
            and type(request['pins']) is list and 1 <= len(request['pins']) <= 512,
            'repair-request-invalid')
    check_snapshot(request['expectedRaw'], request['expectedRaw'])
    pins = {}
    for pin in request['pins']:
        require(type(pin) is dict and set(pin) == {'path', 'sha256', 'bytes', 'uid', 'mode'}
                and type(pin['path']) is str and Path(pin['path']).is_absolute()
                and os.path.normpath(pin['path']) == pin['path'] and pin['path'] not in pins
                and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256'])
                and type(pin['bytes']) is int and 0 < pin['bytes'] <= 1024**3
                and type(pin['uid']) is int and pin['uid'] in (0, os.geteuid())
                and type(pin['mode']) is int and 0 <= pin['mode'] <= 0o755
                and not pin['mode'] & 0o022, 'repair-request-invalid')
        pins[pin['path']] = pin
    require(all(type(request[key]) is str and request[key] in pins
                and request[key].startswith(request['state'] + '/')
                for key in ('image', 'rawRequest', 'rawReceipt', 'rawProvenance', 'priorGuestRequest',
                            'priorGuestFailure', 'postBootEvidence', 'witness')), 'repair-request-invalid')


def snapshot_file(observed):
    """Project exact native integers as decimal strings, including nanoseconds and allocation."""
    return {'device': str(observed.st_dev), 'inode': str(observed.st_ino), 'owner': observed.st_uid,
            'mode': format(stat.S_IMODE(observed.st_mode), '04o'), 'links': observed.st_nlink,
            'logicalBytes': str(observed.st_size), 'allocatedBytes': str(observed.st_blocks * 512),
            'mtimeNs': str(observed.st_mtime_ns), 'ctimeNs': str(observed.st_ctime_ns)}


def open_original(path, expected):
    """Read-only original descriptor first; no writable open occurs before exact snapshot admission."""
    descriptor = raw.open_private(path)
    try:
        # Proof: readonly one-nanosecond fault observes only O_RDONLY opens and unchanged tiny contents.
        check_snapshot(expected, snapshot_file(os.fstat(descriptor)))
        check_snapshot(expected, snapshot_file(os.lstat(path)))
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def verify_history(request):
    """Historical source/receipt/failure observations identify one target; they grant no current admission."""
    history = seed.verify_raw_history(request)
    original = seed.read_pinned_json(request, request['rawRequest'])
    require(original['root'] == request['root'] and original['state'] == request['state'], 'repair-history-invalid')
    guest_request = seed.read_pinned_json(request, request['priorGuestRequest'])
    failure = seed.read_pinned_json(request, request['priorGuestFailure'])
    post_boot = seed.read_pinned_json(request, request['postBootEvidence'])
    pins = {pin['path']: pin for pin in request['pins']}
    # Proof: history-lineage source fault accepts a substituted target/source join.
    require(type(failure['schemaVersion']) is int and failure['schemaVersion'] == 1 and failure['scope'] == 'independent-failed-guest-attempt-observation'
            and failure['accepted'] is False and failure['acceptedReceiptAvailable'] is False
            and failure['guestBootObserved'] is True and failure['fullRehearsalAuthority'] is False
            and failure['binding']['rawPath'] == history['path']
            and failure['binding']['raw'] == history['binding']['raw']
            and failure['binding']['nonce'] == guest_request['nonce']
            and failure['requestDigest'] == pins[request['priorGuestRequest']]['sha256']
            == failure['binding']['request']
            and failure['binding']['source'] == raw.digest_json({pin['path']: pin['sha256'] for pin in guest_request['pins']})
            and guest_request['root'] == request['root'] and guest_request['state'] == request['state'],
            'repair-history-invalid')
    prior_seed = seed.read_pinned_json(request, guest_request['seedRequest'])
    require(all(prior_seed[key] == request[key] for key in ('image', 'rawRequest', 'rawReceipt', 'rawProvenance'))
            and failure['binding']['seedNonce'] == prior_seed['nonce'], 'repair-history-invalid')
    raw.check_terminal(failure['terminal'], failure['groupEvents'], 0)
    require(failure['failure']['cleanup'] == 'verified-original-unit-empty'
            and type(post_boot['schemaVersion']) is int and post_boot['schemaVersion'] == 1 and post_boot['scope'] == 'independent-read-only-repair-source'
            and post_boot['originalFailedGuest'] == guest_request['nonce']
            and post_boot['contentRead'] is False and post_boot['rawWrite'] is False
            and post_boot['repairAuthorized'] is False
            and post_boot['observation']['identity'] == {key: request['expectedRaw'][key] for key in
                ('device', 'inode', 'owner', 'mode', 'links', 'mtimeNs', 'ctimeNs')}
            and str(post_boot['observation']['allocatedBytes']) == request['expectedRaw']['allocatedBytes']
            and request['witness'] == str(Path(request['priorGuestRequest']).with_name('request.sha256')),
            'repair-history-invalid')
    return history


def verify_inputs(request):
    """Pin current helper/runtime independently of opaque historical source and guest evidence."""
    require(str(HELPER) == request['root'] + '/tools/tool-fleet/src/lab-raw-repair.py', 'repair-source-binding')
    pins = {pin['path']: pin for pin in request['pins']}
    required = [str(HELPER.with_name(name)) for name in ('lab-raw-repair.py', 'lab-raw-repair.ts',
                'lab-raw-repair-cli.ts', 'lab-repair-worker.py', 'lab-raw-preparation.py',
                'lab-raw-allocation.py', 'lab-seed-preparation.py', 'lab-guest-preparation.py')]
    required += ['/usr/bin/python3.12', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/dpkg-query',
                 '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']
    require(all(path in pins for path in required), 'repair-source-pins-missing')
    # Proof: current-runtime guard fault admits controlled Python3.14 as the native producer.
    require(platform.machine() == 'x86_64' and ctypes.sizeof(ctypes.c_long) == 8
            and sys.version_info[:2] == (3, 12)
            and os.path.realpath('/usr/bin/python3') == '/usr/bin/python3.12', 'repair-python-binding')
    metadata = {request[key] for key in ('image', 'rawRequest', 'rawReceipt', 'rawProvenance',
                'priorGuestRequest', 'priorGuestFailure', 'postBootEvidence', 'witness')}
    changelog = '/usr/share/doc/linux-image-7.0.11-76070011-generic/changelog.Debian.gz'
    fixed = set(required) | {changelog}
    # Proof: credential-role control refuses a fictional unselected private path before any hash/read.
    require(all(path in fixed or path.startswith(request['state'] + '/') or
                re.fullmatch(r'/usr/lib/x86_64-linux-gnu/lib[A-Za-z0-9_.+-]+[.]so[.0-9]*', path)
                for path in pins), 'repair-input-role')
    guest_request = seed.read_pinned_json(request, request['priorGuestRequest'])
    metadata |= {guest_request['seedRequest'], str(Path(request['rawReceipt']).with_name('allocation.json'))}
    require(all(path in pins and path.startswith(request['state'] + '/') for path in metadata),
            'repair-input-role')
    loader = '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
    for path in ('/usr/bin/python3.12', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/dpkg-query', loader):
        raw.verify_pin(pins[path])
    libraries = set()
    for tool in ('/usr/bin/python3.12', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/dpkg-query'):
        closure = raw.run_bounded([loader, '--list', tool], 3, raw.clean_environment()).decode()
        selected_libraries = re.findall(r'(?:=>\s+|^\s*)(/[^\s()]+)', closure, re.M)
        require(selected_libraries and 'not found' not in closure
                and all(os.path.realpath(path) in pins for path in selected_libraries), 'repair-runtime-closure')
        libraries |= {os.path.realpath(path) for path in selected_libraries}
    # Only actual ELF dependencies and selected historical metadata may accompany fixed current source.
    require(set(pins) == fixed | metadata | libraries, 'repair-input-role')
    for pin in request['pins']:
        raw.verify_pin(pin)
    changelog = '/usr/share/doc/linux-image-7.0.11-76070011-generic/changelog.Debian.gz'
    # Proof: current-kernel guard fault accepts a substituted compressed changelog digest.
    require(changelog in pins and pins[changelog]['sha256'] ==
            '5b40c328ae4ed4a56d36d73f37f5335136439db093be8033dc4c413f663c7569', 'repair-kernel-source')
    version = raw.run_bounded(['/usr/bin/dpkg-query', '-W', '-f=${source:Package} ${Version}\n',
                               'linux-image-7.0.11-76070011-generic',
                               'linux-modules-7.0.11-76070011-generic'], 3, raw.clean_environment()).decode()
    require(version.splitlines() == ['linux 7.0.11-76070011.202606011647~1784215097~24.04~4974880'] * 2
            and '4974880' in raw.read_text('/proc/version')
            and os.uname().release == '7.0.11-76070011-generic', 'repair-kernel-source')
    verify_history(request)
    return raw.digest_json({path: pin['sha256'] for path, pin in pins.items()})


def check_original(descriptor, path, original):
    """Mutation permits timestamps/allocation to change but preserves private original inode and size."""
    opened, named = os.fstat(descriptor), os.lstat(path)
    require(raw.identity(opened) == raw.identity(named) == original
            and stat.S_ISREG(opened.st_mode) and opened.st_size == named.st_size == raw.RAW_BYTES
            and opened.st_nlink == named.st_nlink == 1
            and opened.st_blocks * 512 <= raw.RAW_BYTES + 1048576,
            'repair-original-changed')


def preallocate(descriptor, path, ranges, admit):
    """Allocate canonical original holes once in <=256-call batches, sync and freshly reobserve."""
    blocks = (offset for start, length in ranges for offset in range(start, start + length, 4096))
    import itertools
    while True:
        batch = list(itertools.islice(blocks, 256))
        if not batch:
            break
        admit({'kind': 'preallocate', 'calls': len(batch)})
        for offset in batch:
            writer.allocate_block(descriptor, offset)
        require(writer.native_call(74, ctypes.c_int(descriptor)) == 0, 'repair-sync-failed')
        raw.load_inspector().observe_repair_ranges(path, raw.RAW_BYTES)
    return raw.load_inspector().inspect_file(path, raw.RAW_BYTES)


def check_repair(artifact, before):
    """Validate complete logical byte preservation and final whole-file initialized allocation joins."""
    closed(artifact, 'schemaVersion lineage before after logicalSha256Before logicalSha256After '
                     'readBytes rewrittenBytes allocation')
    after = artifact['after']
    check_snapshot(after, after)
    # Proof: finish hash/byte-count/inode/coverage faults refuse the artifact before durable publication.
    require(type(artifact['schemaVersion']) is int and artifact['schemaVersion'] == 1
            and artifact['lineage'] == 'continued-guest' and artifact['before'] == before
            and all(after[key] == before[key] for key in ('device', 'inode', 'owner', 'mode', 'links', 'logicalBytes'))
            and re.fullmatch('[a-f0-9]{64}', artifact['logicalSha256Before']) is not None
            and artifact['logicalSha256Before'] == artifact['logicalSha256After']
            and artifact['readBytes'] == artifact['rewrittenBytes'] == str(raw.RAW_BYTES)
            and artifact['allocation']['identity'] == {key: after[key] for key in
                ('device', 'inode', 'owner', 'mode', 'links', 'mtimeNs', 'ctimeNs')}
            and artifact['allocation']['expectedBytes'] == artifact['allocation']['coverageBytes'] == raw.RAW_BYTES
            and str(artifact['allocation']['allocatedBytes']) == after['allocatedBytes'], 'repair-artifact-invalid')


def observe_profile(request, descriptor):
    """Fresh selected native mount/inode/options/witness; dated metadata cannot satisfy this predicate."""
    opened = os.fstat(descriptor)
    filesystem = (ctypes.c_long * 15)()
    libc = ctypes.CDLL(None, use_errno=True)
    # Proof: native-filesystem/status faults preserve the failed native reply and admit it without this guard.
    require(libc.fstatfs(descriptor, ctypes.byref(filesystem)) == 0
            and filesystem[0] == 0xef53 and filesystem[1] == 4096, 'repair-filesystem-invalid')
    device = f'{os.major(opened.st_dev)}:{os.minor(opened.st_dev)}'
    mounts = [line.split() for line in raw.read_text('/proc/self/mountinfo', 1024**2).splitlines()]
    selected = [mount for mount in mounts if len(mount) >= 10 and mount[2] == device]
    # Proof: native-mount guard fault accepts xfs from the selected native mount reply.
    require(len(selected) == 1 and selected[0][-4] == '-' and selected[0][-3] == 'ext4'
            and selected[0][5] == 'rw,noatime' and selected[0][-1] == 'rw,errors=remount-ro',
            'repair-mount-invalid')
    source = selected[0][-2]
    require(re.fullmatch('/dev/[A-Za-z0-9_-]+', source) is not None, 'repair-mount-invalid')
    options = raw.read_text('/proc/fs/ext4/' + os.path.basename(source) + '/options').splitlines()
    # Proof: native-options guard fault accepts conflicting data=journal before mutation.
    require(len(options) == len(set(options))
            and {'rw', 'delalloc', 'dioread_nolock', 'data=ordered', 'nodiscard', 'noquota'} <= set(options)
            and not {'nodelalloc', 'dioread_lock', 'data=journal', 'data=writeback', 'bigalloc', 'ro'} & set(options),
            'repair-options-invalid')
    flags = bytearray(8)
    fcntl.ioctl(descriptor, 0x80086601, flags, True)
    witness_fd = raw.open_private(request['witness'])
    try:
        witness = os.fstat(witness_fd)
        witness_flags = bytearray(8)
        fcntl.ioctl(witness_fd, 0x80086601, witness_flags, True)
        witness_fs = os.fstatvfs(witness_fd)
        # Proof: native-witness guard fault admits unsupported witness inode flags.
        require(int.from_bytes(witness_flags, 'little') == 524288
                and witness_fs.f_bsize == witness_fs.f_frsize == 4096, 'repair-witness-invalid')
        raw.verify_pin(next(pin for pin in request['pins'] if pin['path'] == request['witness']))
        profile = {'filesystem': 'ext4', 'blockBytes': int(filesystem[1]), 'clusterBytes': witness_fs.f_frsize,
                   'inodeFlags': int.from_bytes(flags, 'little'), 'delalloc': 'delalloc' in options,
                   'dioreadNolock': 'dioread_nolock' in options, 'dataMode': 'ordered',
                   'kernelRelease': os.uname().release,
                   'kernelSourceCommit': '49748809f7e18ca62f2e054523f1e2c0eb7a88ad',
                   'rawDevice': str(opened.st_dev), 'witnessDevice': str(witness.st_dev),
                   'witnessBytes': witness.st_size, 'witnessAllocatedBytes': witness.st_blocks * 512,
                   'witnessStable': raw.stable_identity(witness) == raw.stable_identity(os.fstat(witness_fd))
                       == raw.stable_identity(os.lstat(request['witness'])),
                   'witnessRegular': stat.S_ISREG(witness.st_mode), 'rawRegular': stat.S_ISREG(opened.st_mode)}
        check_profile(profile, snapshot_file(opened))
        return profile
    finally:
        os.close(witness_fd)


def observe_facts(state):
    """Actual backing and retained inode bytes; raw is already included once by allocated_bytes."""
    readings = re.findall(r'^MemAvailable:[ \t]+([0-9]+)[ \t]+kB$', raw.read_text('/proc/meminfo'), re.M)
    require(len(readings) == 1, 'repair-capacity-malformed')
    filesystem = os.statvfs(state)
    # Nonblocking exclusive staging workers cannot retain concurrent future raw/seed mutation;
    # repair is the only persistent future-debt kind and is enumerated separately without credit.
    return {'availableMemoryBytes': int(readings[0]) * 1024,
            'freeBytes': filesystem.f_bavail * filesystem.f_frsize,
            'retainedInodeBytes': raw.allocated_bytes(state), 'otherFutureReservations': 0}


def source_identities(request):
    """Capture actual current sources/runtime identities after their independent content verification."""
    return {pin['path']: raw.stable_identity(os.lstat(pin['path'])) for pin in request['pins']
            if not pin['path'].startswith(request['state'] + '/')}


def refresh_inputs(request, identities):
    """Refresh current source content and held runtime identities without replaying historical input scans."""
    for pin in request['pins']:
        path = pin['path']
        if path not in identities:
            continue
        require(raw.stable_identity(os.lstat(path)) == identities[path], 'repair-source-changed')
        if path.startswith(request['root'] + '/tools/tool-fleet/src/'):
            raw.verify_pin(pin)


def check_lock(binding, state):
    """Join original state descriptor and its worker-owned flock, without taking another admission lock."""
    named = os.lstat(state)
    held = os.stat(f"/proc/{binding['pid']}/fd/{binding['stagingFd']}")
    info = raw.read_text(f"/proc/{binding['pid']}/fdinfo/{binding['stagingFd']}")
    # Proof: ready-lock guard fault reaches mutation ACK after the actual original flock was released.
    require(raw.identity(held) == raw.identity(named) == binding['staging']
            and raw.process_start(binding['pid']) == binding['start']
            and re.search(r'(?m)^lock:\s+[0-9]+: FLOCK\s+ADVISORY\s+WRITE\s+'
                          + str(binding['pid']) + r'\s+[^\s]+:' + str(named.st_ino) + r'\s+0 EOF$', info),
            'repair-lock-invalid')


def check_creator(binding, directory, directory_fd):
    """Original attempt, original retained creator directory and original held raw inode all join."""
    raw_path = binding['rawPath']
    held = os.stat(f"/proc/{binding['pid']}/fd/{binding['rawFd']}")
    # Proof: ready-creator guard fault reaches mutation ACK with a foreign creator identity.
    require(raw.process_start(binding['pid']) == binding['start']
            and raw.identity(os.fstat(directory_fd)) == raw.identity(os.lstat(directory)) == binding['creator']
            and raw.identity(held) == raw.identity(os.lstat(raw_path)) == binding['raw']
            and raw.identity(os.stat(f"/proc/{binding['pid']}/fd/{binding['originalFd']}"))
                == raw.identity(os.lstat(Path(raw_path).parent)) == binding['originalCreator']
            and held.st_size == raw.RAW_BYTES and held.st_nlink == 1
            and stat.S_ISREG(held.st_mode), 'repair-creator-invalid')



def evidence_paths(request):
    return [request[key] for key in ('rawRequest', 'rawReceipt', 'rawProvenance', 'priorGuestRequest',
                                     'priorGuestFailure', 'postBootEvidence', 'witness')]


def open_evidence(request):
    """Hold the exact pinned historical metadata descriptions until the worker's durability ACK."""
    pins = {pin['path']: pin for pin in request['pins']}
    evidence = {}
    try:
        for path in evidence_paths(request):
            pin = pins[path]
            raw.verify_pin(pin)
            descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
            evidence[path] = {'fd': descriptor, 'identity': raw.stable_identity(os.fstat(descriptor))}
        check_evidence({'pid': os.getpid(), 'evidence': evidence}, request)
        return evidence
    except BaseException:
        for held in evidence.values():
            os.close(held['fd'])
        raise


def check_evidence(binding, request):
    """Join every held original evidence FD and pathname to its initial verified exact metadata."""
    require(type(binding['evidence']) is dict and set(binding['evidence']) == set(evidence_paths(request)),
            'repair-evidence-changed')
    for path, held in binding['evidence'].items():
        require(type(held) is dict and set(held) == {'fd', 'identity'}
                and type(held['fd']) is int and 3 <= held['fd'] < 64, 'repair-evidence-changed')
        opened = os.stat(f"/proc/{binding['pid']}/fd/{held['fd']}")
        # Proof: evidence tiny-file substitution retains the opened FD but refuses the replaced pathname.
        require(raw.stable_identity(opened) == held['identity'] == raw.stable_identity(os.lstat(path)),
                'repair-evidence-changed')

def check_input_descriptors(binding, request):
    """Preserve worker executable, original runtime identities and current selected source at last use."""
    require(raw.stable_identity(os.stat(f"/proc/{binding['pid']}/exe")) == binding['python']
            == raw.stable_identity(os.stat('/usr/bin/python3.12')), 'repair-python-binding')
    refresh_inputs(request, binding['inputs'])
    check_lock(binding, request['state'])
    check_evidence(binding, request)


def hash_logical(descriptor, monitor):
    """Hash every logical byte from the held original descriptor with a bounded one-MiB read."""
    digest = hashlib.sha256()
    for offset in range(0, raw.RAW_BYTES, 1048576):
        monitor()
        count = min(1048576, raw.RAW_BYTES-offset)
        chunk = os.pread(descriptor, count, offset)
        # Proof: hash tiny-file truncation refuses incomplete logical input before first mutation.
        require(len(chunk) == count, 'repair-hash-short')
        digest.update(chunk)
    return digest.hexdigest()


def service_arguments(request, request_path, request_digest):
    """Identical fixed raw service caps/limits, distinct original unit and repair helper."""
    return [('--unit=puni-raw-repair-' + request['nonce'] + '.service' if argument.startswith('--unit=')
             else str(HELPER) if argument == str(raw.HELPER) else argument)
            for argument in raw.service_arguments(request, request_path, request_digest)]


def launch_service(request, request_path, request_digest):
    return subprocess.Popen(service_arguments(request, request_path, request_digest),
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env=raw.clean_environment(), preexec_fn=raw.client_limits)


def capture_counter(binding, ready_ns, started_ns):
    """Call only after writer exact reap, EOF, full posthash and final initialized map."""
    record = {'binding': binding, 'startedNs': started_ns, 'finishedNs': time.time_ns(),
              'caps': raw.read_caps(binding['cgroup']),
              'counters': {name: raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/' + name, 4096).strip()
                           for name in raw.COUNTERS},
              'rewritten': True, 'bytePreserved': True, 'initialized': True}
    check_counter(record, binding, ready_ns, time.time_ns())
    return record


def check_counter(record, binding, ready_ns, now):
    return raw.check_counter(record, binding, ready_ns, now,
                             completion=('rewritten', 'bytePreserved', 'initialized'))


def produce_repair(request, request_digest, staging_fd):
    """Trusted source/native worker. Every failure retains partial files and the full immutable debt."""
    source = verify_inputs(request)
    history = verify_history(request)
    path = history['path']
    raw_fd = open_original(path, request['expectedRaw'])
    directory = request['state'] + '/raw-repair-' + request['nonce']
    directory_fd = raw.open_private(directory, directory=True)
    original_fd = raw.open_private(Path(path).parent, directory=True)
    evidence = {}
    try:
        evidence = open_evidence(request)
        require(raw.identity(os.fstat(original_fd)) == history['binding']['creator'], 'repair-history-invalid')
        native = raw.observe_active('puni-raw-repair-' + request['nonce'] + '.service', os.getpid())
        require(os.environ.get('INVOCATION_ID') == native['invocation'], 'repair-worker-invocation')
        ranges = raw.load_inspector().observe_repair_ranges(path, raw.RAW_BYTES)
        check_snapshot(request['expectedRaw'], snapshot_file(os.fstat(raw_fd)))
        reservation = make_reservation(request['nonce'], request_digest, source, request['expectedRaw'],
                                       ranges['observation']['missingDataBytes'])
        binding = {name: native[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')}
        binding.update({'nonce': request['nonce'], 'creator': raw.identity(os.fstat(directory_fd)),
                        'originalCreator': raw.identity(os.fstat(original_fd)), 'originalFd': original_fd,
                        'raw': raw.identity(os.fstat(raw_fd)), 'rawFd': raw_fd, 'rawPath': path,
                        'staging': raw.identity(os.fstat(staging_fd)), 'stagingFd': staging_fd,
                        'python': raw.stable_identity(os.stat('/proc/self/exe')),
                        'inputs': source_identities(request), 'evidence': evidence, 'source': source, 'request': request_digest,
                        'reservationDigest': raw.digest_json(reservation)})
        check_lock(binding, request['state'])
        ready_ns = time.time_ns()
        raw.send_frame(1, {'phase': 'ready', 'binding': binding, 'observedNs': ready_ns,
                           'reservation': reservation, 'snapshot': request['expectedRaw'],
                           'mapDigest': ranges['observation']['mapDigest']})
        raw.receive_ack(0, binding, request_digest)
        # Only the parent can publish debt; re-read it under the original still-held lock after ACK.
        require(read_record(Path(directory) / 'reservation.json') == reservation, 'repair-reservation-changed')
        deadline = time.monotonic() + 850
        def admit(step, original_snapshot=False):
            require(time.monotonic() < deadline, 'repair-io-timeout')
            check_creator(binding, directory, directory_fd)
            check_input_descriptors(binding, request)
            # Proof: worker-native guard fault reaches intercepted allocation after changed invocation.
            require(raw.observe_active(binding['unit'], os.getpid()) == native, 'repair-native-changed')
            check_original(raw_fd, path, binding['raw'])
            if original_snapshot:
                check_snapshot(request['expectedRaw'], snapshot_file(os.fstat(raw_fd)))
            fresh_profile = observe_profile(request, raw_fd)
            check_capacity(observe_facts(request['state']), fresh_profile, reservation,
                           read_reservations(request['state']), step)
        def monitor():
            require(time.monotonic() < deadline, 'repair-io-timeout')
            check_original(raw_fd, path, binding['raw'])
        before_hash = hash_logical(raw_fd, monitor)
        admit({'kind': 'rewrite', 'bytes': 1048576}, original_snapshot=True)
        # Proof: worker-map guard fault permits allocation after the original canonical map changed.
        require(raw.load_inspector().observe_repair_ranges(path, raw.RAW_BYTES) == ranges,
                'repair-map-changed')
        writable = os.open(f'/proc/self/fd/{raw_fd}', os.O_RDWR | os.O_CLOEXEC)
        try:
            check_snapshot(request['expectedRaw'], snapshot_file(os.fstat(writable)))
            os.dup2(writable, raw_fd, inheritable=False)
        finally:
            os.close(writable)
        started_ns = time.time_ns()
        preallocate(raw_fd, path, ranges['missingRanges'], admit)
        check_original(raw_fd, path, binding['raw'])
        child = writer.start_writer(raw_fd, binding['raw'], geometry, deadline)
        try:
            def before_step(offset):
                admit({'kind': 'rewrite', 'bytes': 1048576})
            def after_step(offset):
                raw.load_inspector().inspect_initialized_range(path, raw.RAW_BYTES, offset, 1048576)
                check_original(raw_fd, path, binding['raw'])
            writer.drive_writer(child, before_step, after_step, deadline)
        finally:
            for stream in (child.stdin, child.stdout, child.stderr):
                stream.close()
        # No child mutation can occur after exact reap; direct syscall drain does not retry EINTR.
        require(writer.native_call(74, ctypes.c_int(raw_fd)) == 0, 'repair-sync-failed')
        after_hash = hash_logical(raw_fd, monitor)
        allocation = raw.load_inspector().inspect_file(path, raw.RAW_BYTES, require_initialized=True)
        check_original(raw_fd, path, binding['raw'])
        artifact = {'schemaVersion': 1, 'lineage': 'continued-guest', 'before': request['expectedRaw'],
                    'after': snapshot_file(os.fstat(raw_fd)), 'logicalSha256Before': before_hash,
                    'logicalSha256After': after_hash, 'readBytes': str(raw.RAW_BYTES),
                    'rewrittenBytes': str(raw.RAW_BYTES), 'allocation': allocation}
        check_repair(artifact, request['expectedRaw'])
        admit({'kind': 'rewrite', 'bytes': 1048576})
        record = capture_counter(binding, ready_ns, started_ns)
        raw.send_frame(1, {'phase': 'complete', 'record': record, 'repair': artifact})
        require(raw.receive_frame(0) == {'durableDigest': raw.digest_json(record)}, 'repair-durability-ack')
    finally:
        for held in evidence.values():
            os.close(held['fd'])
        for descriptor in (raw_fd, directory_fd, original_fd):
            os.close(descriptor)


def worker(request, request_digest):
    """Keep the original state flock from before readiness through the coordinator's durable ACK."""
    require(all(stat.S_ISFIFO(os.fstat(descriptor).st_mode) for descriptor in (0, 1, 2)), 'repair-worker-pipes')
    raw.worker_limits()
    staging_fd = raw.acquire_staging(request['state'])
    try:
        seed.require_descriptors({0, 1, 2, staging_fd})
        produce_repair(request, request_digest, staging_fd)
    finally:
        os.close(staging_fd)


class RepairCoordinator:
    """Original callback composition; preliminary observations are explicitly nonauthorizing."""
    prefix = 'raw-repair'
    seconds = 910
    caps = raw.CAPS
    final_cleanup = True
    completion_fields = {'phase', 'record', 'repair'}
    measurement_phase = 'after-repair-writer-reap-before-worker-exit'
    observe_unit = staticmethod(raw.observe_unit)
    observe_active = staticmethod(raw.observe_active)
    stop_owned = staticmethod(raw.stop_owned)
    launch_service = staticmethod(launch_service)
    check_counter = staticmethod(check_counter)
    check_input_descriptors = staticmethod(check_input_descriptors)
    decode_frame = staticmethod(seed.decode_json)

    def __init__(self, request, request_digest):
        self.request = request
        self.request_digest = request_digest
        self.reservation = None
        self.artifact = None
        self.source = None
        self.inputs = None
        self.release = None
        self.publications = []
        self.release_binding = None
        self.release_directory = None
        self.release_descriptor = None
        self.release_profile = None

    def verify_inputs(self, request):
        self.source = verify_inputs(request)
        self.inputs = source_identities(request)
        return self.source

    def observe_capacity(self, state, initial=False, after_allocation=False):
        facts = observe_facts(state)
        if self.reservation is None:
            if initial:
                history = verify_history(self.request)
                descriptor = open_original(history['path'], self.request['expectedRaw'])
                try:
                    profile = observe_profile(self.request, descriptor)
                    observed = raw.load_inspector().observe_repair_ranges(history['path'], raw.RAW_BYTES)
                    candidate = make_reservation(self.request['nonce'], self.request_digest, self.source,
                                                 self.request['expectedRaw'], observed['observation']['missingDataBytes'])
                    # Proof: initial-capacity one-byte-short G+50GiB candidate refuses before directory/unit creation.
                    check_capacity(facts, profile, candidate, read_reservations(state),
                                   {'kind': 'rewrite', 'bytes': 1048576}, initial=True)
                    return {**facts, 'admissionAuthorized': False}
                finally:
                    os.close(descriptor)
            # This may run after mkdir but before original check_ready. It cannot exclude unknown debt or ACK.
            require(facts['availableMemoryBytes'] >= (3623878656 if initial else 2147483648)
                    and facts['freeBytes'] >= (50 if initial else 40) * 1024**3
                    and facts['retainedInodeBytes'] + raw.RESERVE_BYTES <= raw.STAGING_BYTES,
                    'repair-preliminary-capacity')
            return {**facts, 'admissionAuthorized': False}
        descriptor = raw.open_private(self.path)
        try:
            profile = observe_profile(self.request, descriptor)
            check_capacity(facts, profile, self.reservation, read_reservations(state),
                           {'kind': 'rewrite', 'bytes': 1048576}, initial=initial)
            return {**facts, 'observedNs': str(time.time_ns()), 'grossDebtRetained': True}
        finally:
            os.close(descriptor)

    def check_ready(self, frame, request, request_digest, source, directory, directory_fd):
        closed(frame, 'phase binding observedNs reservation snapshot mapDigest')
        require(frame['phase'] == 'ready' and type(frame['observedNs']) is int
                and 0 <= time.time_ns() - frame['observedNs'] <= 10 * 10**9, 'repair-ready-invalid')
        binding = frame['binding']
        closed(binding, 'pid start unit invocation cgroup nonce creator originalCreator originalFd raw rawFd '
                        'rawPath staging stagingFd python inputs evidence source request reservationDigest')
        history = verify_history(request)
        # Proof: ready-source guard fault issues mutation ACK for a substituted worker source.
        require(binding['nonce'] == request['nonce'] and binding['request'] == request_digest
                and binding['source'] == source and type(binding['pid']) is int and binding['pid'] > 0
                and binding['unit'] == 'puni-raw-repair-' + request['nonce'] + '.service'
                and binding['rawPath'] == history['path'] and binding['raw'] == history['binding']['raw']
                and binding['originalCreator'] == history['binding']['creator']
                and binding['inputs'] == self.inputs
                and all(type(binding[name]) is int and 3 <= binding[name] < 64
                        for name in ('rawFd', 'originalFd', 'stagingFd')), 'repair-ready-invalid')
        native = raw.observe_active(binding['unit'], binding['pid'])
        require(all(native[name] == binding[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup')),
                'repair-ready-invalid')
        check_creator(binding, directory, directory_fd)
        check_input_descriptors(binding, request)
        descriptor = open_original(history['path'], request['expectedRaw'])
        try:
            profile = observe_profile(request, descriptor)
            ranges = raw.load_inspector().observe_repair_ranges(history['path'], raw.RAW_BYTES)
            reservation = make_reservation(request['nonce'], request_digest, source, request['expectedRaw'],
                                           ranges['observation']['missingDataBytes'])
            # Proof: ready-map guard fault issues mutation ACK for a substituted native map digest.
            require(frame['snapshot'] == request['expectedRaw']
                    and frame['reservation'] == reservation and binding['reservationDigest'] == raw.digest_json(reservation)
                    and frame['mapDigest'] == ranges['observation']['mapDigest'], 'repair-ready-invalid')
            # Original directory FD is borrowed only here, while the original worker demonstrably holds the flock.
            pending = capture_pending(directory, directory_fd, reservation)
            prior = read_reservations(request['state'], pending)
            check_capacity(observe_facts(request['state']), profile, reservation, prior,
                           {'kind': 'rewrite', 'bytes': 1048576})
            # Proof: outer reservation-sync breaks actual regular-file fsync; no ACK/mutation sentinel appears.
            publish_reservation(pending, reservation)
            # No stale pre-mkdir snapshot is reused. Own debt now appears once in the actual complete ledger.
            check_capacity(observe_facts(request['state']), profile, reservation, read_reservations(request['state']),
                           {'kind': 'rewrite', 'bytes': 1048576})
            self.reservation, self.path = reservation, history['path']
            return binding
        finally:
            os.close(descriptor)

    def check_creator(self, binding, directory, directory_fd):
        """Before A, independently drain the original inode and exclude live owned byte writers."""
        check_creator(binding, directory, directory_fd)
        self.release_binding = binding
        self.release_directory = directory
        self.release_descriptor = directory_fd
        self.check_release_live()
        descriptor = raw.open_private(self.path)
        try:
            check_original(descriptor, self.path, binding['raw'])
            # Proof: release raw-drain fault fails the real original-FD fsync before counter creation.
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def check_release_live(self):
        """Rejoin original live worker, lock, same filesystem, pinned source and qualified journal."""
        binding = self.release_binding
        check_creator(binding, self.release_directory, self.release_descriptor)
        check_input_descriptors(binding, self.request)
        refresh_inputs(self.request, self.inputs)
        native = self.observe_active(binding['unit'], binding['pid'])
        # Proof: release native-change injects a changed original cgroup after A; bypass accepts it.
        require(all(native[name] == binding[name] for name in ('pid', 'start', 'unit', 'invocation', 'cgroup'))
                and raw.read_caps(binding['cgroup']) == self.caps, 'repair-release-native-changed')
        tasks = []
        with os.scandir(f"/proc/{binding['pid']}/task") as entries:
            for entry in entries:
                tasks.append(entry.name)
                if len(tasks) == 2:
                    break
        children = raw.read_text(f"/proc/{binding['pid']}/task/{binding['pid']}/children", 4096)
        processes = raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/cgroup.procs', 4096).split()
        threads = raw.read_text('/sys/fs/cgroup' + binding['cgroup'] + '/cgroup.threads', 4096).split()
        # Proof: release live-thread uses a live thread; live-child/live-group inject owned proc/cgroup replies.
        require(tasks == [str(binding['pid'])] and not children.strip()
                and processes == threads == [str(binding['pid'])], 'repair-release-writer-live')
        descriptor = raw.open_private(self.path)
        try:
            check_original(descriptor, self.path, binding['raw'])
            profile = observe_profile(self.request, descriptor)
            check_profile(profile, snapshot_file(os.fstat(descriptor)))
            # Proof: release foreign-fs substitutes the recorded original device after qualification; bypass accepts it.
            require(str(os.fstat(self.release_descriptor).st_dev) == profile['rawDevice']
                    and (self.release_profile is None or profile == self.release_profile),
                    'repair-release-profile-changed')
            self.release_profile = profile
        finally:
            os.close(descriptor)

    def persisted(self, name, record, directory, directory_fd):
        """Record only actual successful original raw.persist returns; no external witness accepted."""
        if name not in ('worker-counter.json', 'repair.json'):
            return
        # Proof: release substituted-directory passes an actual foreign directory FD to notification; bypass accepts it.
        require(directory == self.release_directory and directory_fd == self.release_descriptor
                and self.publications == ([] if name == 'worker-counter.json'
                                          else [('worker-counter.json', record['counterDigest'])]),
                'repair-release-publication-invalid')
        self.check_release_live()
        self.publications.append((name, raw.digest_json(record)))

    def persist_artifact(self, frame, publish):
        # Proof: release counter-notification fault refuses artifact creation without actual A return.
        require(self.publications == [('worker-counter.json', raw.digest_json(frame['record']))],
                'repair-release-publication-invalid')
        self.check_release_live()
        artifact = frame['repair']
        check_repair(artifact, self.request['expectedRaw'])
        self.check_final(artifact)
        pins = {pin['path']: pin for pin in self.request['pins']}
        joined = {'schemaVersion': 1, 'repair': artifact,
                  'originalReceiptDigest': pins[self.request['rawReceipt']]['sha256'],
                  'failedGuestDigest': pins[self.request['priorGuestFailure']]['sha256'],
                  'requestDigest': self.reservation['requestDigest'], 'sourceDigest': self.source,
                  'reservationDigest': raw.digest_json(self.reservation),
                  'counterDigest': raw.digest_json(frame['record']),
                  'guestAuthority': False, 'fullRehearsalAuthority': False, 'grossDebtRetained': True}
        publish('repair.json', joined)
        self.artifact = joined

    def check_final(self, artifact):
        descriptor = open_original(self.path, artifact['after'])
        try:
            current = raw.load_inspector().inspect_file(self.path, raw.RAW_BYTES, require_initialized=True)
            require(current == artifact['allocation'], 'repair-final-changed')
            check_snapshot(artifact['after'], snapshot_file(os.fstat(descriptor)))
        finally:
            os.close(descriptor)

    def finalize_artifact(self, binding, terminal, events, final, publish):
        require(self.artifact is not None, 'repair-artifact-absent')
        refresh_inputs(self.request, self.inputs)
        self.check_final(self.artifact['repair'])
        descriptor = open_original(self.path, self.artifact['repair']['after'])
        try:
            profile = observe_profile(self.request, descriptor)
            # Proof: release final-profile fault refuses changed journal after owned cleanup.
            require(profile == self.release_profile
                    and str(os.fstat(self.release_descriptor).st_dev) == profile['rawDevice']
                    and raw.identity(os.fstat(self.release_descriptor)) == binding['creator']
                        == raw.identity(os.lstat(self.release_directory)), 'repair-release-profile-changed')
        finally:
            os.close(descriptor)
        # Proof: release artifact-notification fault refuses certificate without actual C return.
        require(self.publications == [('worker-counter.json', self.artifact['counterDigest']),
                                      ('repair.json', raw.digest_json(self.artifact))]
                and binding == self.release_binding, 'repair-release-publication-invalid')
        raw.check_terminal(terminal, events, 0)
        self.release = {'schemaVersion': 1, 'nonce': self.reservation['nonce'],
                        'requestDigest': self.request_digest, 'sourceDigest': self.source,
                        'reservationDigest': raw.digest_json(self.reservation),
                        'bindingDigest': raw.digest_json(binding),
                        'counterDigest': self.artifact['counterDigest'],
                        'repairDigest': raw.digest_json(self.artifact), 'directory': binding['creator'],
                        'profile': profile, 'publication': 'exclusive-counter-dir-before-exclusive-repair-dir',
                        'quiescence': 'sole-original-worker-reaped-child-original-fd-drained',
                        'cleanup': 'verified-original-unit-empty', 'terminal': terminal, 'groupEvents': events,
                        'finalSnapshot': self.artifact['repair']['after'], 'issuedNs': time.time_ns()}
        publish('release.json', self.release)

    def receipt_fields(self, record):
        require(self.artifact is not None, 'repair-artifact-absent')
        # Proof: release skip-finalize breaks the required certificate producer; bypass accepts an unproved receipt.
        require(self.release is not None, 'repair-release-absent')
        return {'repairDigest': raw.digest_json(self.artifact), 'releaseDigest': raw.digest_json(self.release),
                'rawBytes': raw.RAW_BYTES, 'lineage': 'continued-guest', 'grossDebtRetained': False}


def coordinator(request, request_path, request_digest):
    return raw.coordinate_attempt(request, request_path, request_digest, RepairCoordinator(request, request_digest))


def main():
    try:
        require(len(sys.argv) in (3, 4) and (len(sys.argv) == 3 or sys.argv[1] == '--worker'), 'repair-arguments')
        request_path, request_digest = sys.argv[-2:]
        require(re.fullmatch('[a-f0-9]{64}', request_digest) is not None, 'repair-arguments')
        descriptor = raw.open_private(request_path)
        try:
            before = os.fstat(descriptor)
            payload = raw.read_fd(descriptor)
            require(hashlib.sha256(payload).hexdigest() == request_digest
                    and raw.stable_identity(before) == raw.stable_identity(os.fstat(descriptor))
                    == raw.stable_identity(os.lstat(request_path)), 'repair-request-digest')
            request = seed.decode_json(payload)
        finally:
            os.close(descriptor)
        check_request(request)
        for selected_signal in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
            signal.signal(selected_signal, raw.cancel)
        is_worker = len(sys.argv) == 4
        signal.setitimer(signal.ITIMER_REAL, 900 if is_worker else 920)
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
    except (OSError, ValueError, TypeError, KeyError, IndexError, StopIteration, subprocess.SubprocessError):
        print('repair-native-refused', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
