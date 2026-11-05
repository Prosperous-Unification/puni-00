import importlib.util
import json
import os
from pathlib import Path
import re
import stat

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
    coordinator PendingAttempt may exclude its unpublished directory; published attempts all owe G.
    Traversal is top-level (the fixed attempt layout), bounded to 20,000 entries/1,024 records and
    <64KiB per read. Missing/unreadable/malformed state throws; no reclamation is implemented.
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
                    records.append(record)
                    # Proof: ledger bound bypass admits 1,025 records in native capacity/metadata-bounds.
                    require(len(records) <= 1024, 'repair-ledger-bound')
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
