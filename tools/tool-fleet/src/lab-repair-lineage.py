import importlib.util
import os
from pathlib import Path
import re
import time


def initialize_runtime(runtime):
    """Load the fixed audited producer only on v2 paths and preserve the caller refusal class."""
    global repair, raw, require
    raw = runtime
    require = runtime.require
    spec = importlib.util.spec_from_file_location('continued_repair', Path(__file__).with_name('lab-raw-repair.py'))
    # Proof: runtime absent sibling lost modeled refusal when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(spec is not None and spec.loader is not None, 'continued-runtime-unavailable')
    repair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(repair)
    for module in (repair, repair.seed, repair.geometry, repair.geometry.seed, repair.writer):
        module.raw = runtime
        module.require = runtime.require


def check_backing(state, free, initial):
    """Refresh qualified ledger debt once, including failed attempts, above the fixed backing floor."""
    accounting = repair.read_repair_accounting(state)
    debt = repair.unsigned(accounting['unresolvedGrossBytes']) + repair.unsigned(accounting['settlementDebtBytes'])
    require(raw.allocated_bytes(state) + raw.RESERVE_BYTES + repair.unsigned(accounting['settlementDebtBytes'])
            <= raw.STAGING_BYTES, 'continued-staging-bound')
    # Proof: capacity accepted one-byte-short backing above prior failed G when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(type(free) is int and type(initial) is bool
            and free >= (50 if initial else 40) * 1024**3 + debt, 'continued-backing-floor')


def check_records(records):
    """Validate exact repair-native JSON types before Python equality can equate bool/float identities."""
    binding = records['receipt.json']['binding']
    # Proof: typed-binding-extra admitted unknown fields with only this closed-shape dependency disabled (faults.json).
    repair.closed(binding, 'pid start unit invocation cgroup nonce creator originalCreator originalFd raw rawFd '
                          'rawPath staging stagingFd python inputs evidence source request reservationDigest')
    # Proof: typed-fd accepted a canonical float FD when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(type(binding['pid']) is int and binding['pid'] > 0
            and type(binding['start']) is str and re.fullmatch('[1-9][0-9]*', binding['start']) is not None
            and all(type(binding[field]) is str and re.fullmatch('[a-f0-9]{32}', binding[field]) is not None
                    for field in ('nonce', 'invocation'))
            and binding['unit'] == 'puni-raw-repair-' + binding['nonce'] + '.service'
            and type(binding['cgroup']) is str and binding['cgroup'].startswith('/')
            and binding['cgroup'].endswith('/' + binding['unit'])
            and all(type(binding[field]) is int and 3 <= binding[field] < 64
                    for field in ('rawFd', 'originalFd', 'stagingFd'))
            and all(type(binding[field]) is str and re.fullmatch('[a-f0-9]{64}', binding[field]) is not None
                    for field in ('source', 'request', 'reservationDigest')), 'continued-native-binding')
    def is_identity(value, length):
        return type(value) is list and len(value) == length and all(type(part) is int and part >= 0 for part in value)
    # Proof: typed-owner accepted canonical float ownership when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(all(is_identity(binding[field], length) for field, length in
                (('creator', 4), ('originalCreator', 4), ('raw', 4), ('staging', 4), ('python', 8)))
            and type(binding['inputs']) is dict and all(type(path) is str and is_identity(value, 8)
                for path, value in binding['inputs'].items())
            and type(binding['evidence']) is dict and all(type(path) is str and type(held) is dict
                and set(held) == {'fd', 'identity'} and type(held['fd']) is int and 3 <= held['fd'] < 64
                and is_identity(held['identity'], 8) for path, held in binding['evidence'].items()),
            'continued-native-identities')
    ready = records['worker-ready.json']
    # Proof: typed-ready admitted unknown fields with only this closed-shape dependency disabled (faults.json).
    repair.closed(ready, 'phase binding observedNs reservation snapshot mapDigest')
    # Proof: typed-ready-schema accepted a foreign ready phase when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(ready['phase'] == 'ready' and raw.encode_json(ready['reservation']) == raw.encode_json(records['reservation.json'])
            and raw.encode_json(ready['snapshot']) == raw.encode_json(records['reservation.json']['originalSnapshot'])
            and type(ready['mapDigest']) is str and re.fullmatch('[a-f0-9]{64}', ready['mapDigest']) is not None,
            'continued-native-ready')
    receipt = records['receipt.json']
    # Proof: typed-terminal accepted unknown terminal fields when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(type(receipt['finishedNs']) is int and 0 < receipt['finishedNs'] <= time.time_ns()
            and type(receipt['terminal']) is dict and set(receipt['terminal']) == set(raw.PROPERTIES)
            and all(type(value) is str for value in receipt['terminal'].values())
            and (receipt['groupEvents'] is None or type(receipt['groupEvents']) is str), 'continued-native-terminal')
    allocation = records['repair.json']['repair']['allocation']
    # Proof: typed-allocation-extra admitted unknown fields with only this closed-shape dependency disabled (faults.json).
    repair.closed(allocation, 'provider inspectorVersion observations identity expectedBytes allocatedBytes '
                             'allocationOverheadBytes coverageBytes extentCount pageCount metadataBytes mapDigest')
    # Proof: typed-allocation accepted float coverage when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(allocation['provider'] == 'linux-fiemap' and type(allocation['inspectorVersion']) is int
            and allocation['inspectorVersion'] == 1
            and type(allocation['observations']) is dict
            and set(allocation['observations']) == {'kernelRelease', 'pythonVersion'}
            and all(type(value) is str for value in allocation['observations'].values())
            and all(type(allocation[field]) is int and allocation[field] >= 0 for field in
                    ('expectedBytes', 'allocatedBytes', 'coverageBytes', 'extentCount', 'pageCount', 'metadataBytes'))
            and raw.encode_json(allocation['identity']) == raw.encode_json({
                key: records['repair.json']['repair']['after'][key] for key in
                ('device', 'inode', 'owner', 'mode', 'links', 'mtimeNs', 'ctimeNs')})
            and type(allocation['allocationOverheadBytes']) is int
            and allocation['allocationOverheadBytes'] == allocation['allocatedBytes'] - raw.RAW_BYTES
            and type(allocation['mapDigest']) is str and re.fullmatch('[a-f0-9]{64}', allocation['mapDigest']) is not None,
            'continued-native-allocation')
    # Compare serialized projections to preserve exact JSON types on every repeated native join.
    # Proof: typed-repeat accepted a float-substituted ready binding when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(raw.encode_json(records['release.json']['directory']) == raw.encode_json(binding['creator'])
            and raw.encode_json(binding) == raw.encode_json(records['worker-counter.json']['binding'])
            == raw.encode_json(ready['binding'])
            and raw.encode_json(receipt['terminal']) == raw.encode_json(records['release.json']['terminal'])
            and raw.encode_json(records['repair.json']['repair']['after']) ==
                raw.encode_json(records['release.json']['finalSnapshot']), 'continued-native-repeat')


def verify_lineage(request, history, read, current=True):
    """Join selected successful repair authority without rebinding historical source to current code.

    Current admission reads metadata/map only; the accepted artifact owns the complete logical hash.
    Once guest writes are permitted, callers retain immutable joins and existing native geometry
    checks with current=False rather than re-admitting pristine timestamps.
    """
    original = read(request, request['repairRequest'])
    repair.check_request(original)
    # Proof: original-history accepted a foreign original lineage when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(all(original[field] == request[field] for field in
                ('root', 'state', 'image', 'rawRequest', 'rawReceipt', 'rawProvenance')),
            'continued-original-history')
    pins = {pin['path']: pin for pin in request['pins']}
    historical = [pin for pin in original['pins'] if pin['path'].startswith(request['root'] + '/')
                  and not pin['path'].startswith(request['state'] + '/')]
    # Proof: original-pins accepted a substituted historical witness pin when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(historical and all(pins.get(pin['path']) == pin for pin in original['pins'] if pin not in historical),
            'continued-original-pins')
    provenance = read(request, request['repairProvenance'])
    # Proof: provenance-extra admitted unknown fields with only this closed-shape dependency disabled (faults.json).
    repair.closed(provenance, 'schemaVersion sourceRevision sourcePins requestDigest receiptDigest envelope')
    # Proof: provenance-source accepted foreign historical source when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(type(provenance['schemaVersion']) is int and provenance['schemaVersion'] == 1
            and type(provenance['sourceRevision']) is str
            and re.fullmatch('[a-f0-9]{40}', provenance['sourceRevision']) is not None
            and raw.encode_json(provenance['sourcePins']) == raw.encode_json(historical)
            and provenance['requestDigest'] == pins[request['repairRequest']]['sha256']
            and provenance['receiptDigest'] == pins[request['repairReceipt']]['sha256'],
            'continued-provenance')
    envelope = provenance['envelope']
    # Proof: envelope-extra admitted unknown fields with only this closed-shape dependency disabled (faults.json).
    repair.closed(envelope, 'schemaVersion scope accepted nonce receiptDigest guestAuthority fullRehearsalAuthority')
    # Proof: envelope-failed accepted failed independent success authority when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(type(envelope['schemaVersion']) is int and envelope['schemaVersion'] == 1
            and envelope['scope'] == 'raw-repair-preparation' and envelope['accepted'] is True
            and envelope['nonce'] == original['nonce'] and envelope['receiptDigest'] == provenance['receiptDigest']
            and envelope['guestAuthority'] is False and envelope['fullRehearsalAuthority'] is False,
            'continued-success-envelope')
    selected = dict(original, pins=request['pins'])
    previous = repair.verify_history(selected)
    failure = read(request, original['priorGuestFailure'])
    post_boot = read(request, original['postBootEvidence'])
    # Proof: typed-failure accepted numeric float historical identity without this comparison (lab-repair-lineage.test.ts; faults.json).
    require(raw.encode_json(failure['binding']['raw']) == raw.encode_json(history['binding']['raw'])
            and raw.encode_json(post_boot['observation']['identity']) == raw.encode_json({
                key: original['expectedRaw'][key] for key in
                ('device', 'inode', 'owner', 'mode', 'links', 'mtimeNs', 'ctimeNs')}), 'continued-history-types')
    repair.geometry.check_receipt(read(request, request['rawReceipt']), 'raw')
    # Proof: history-dependency accepted a foreign original lineage when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(previous['path'] == history['path'] and previous['binding'] == history['binding'],
            'continued-original-history')
    directory = request['state'] + '/raw-repair-' + original['nonce']
    # Proof: receipt-path accepted an aliased receipt outside the original attempt when omitted (lab-repair-lineage.test.ts; faults.json).
    require(request['repairReceipt'] == directory + '/receipt.json', 'continued-receipt-path')
    records = {name: read(request, directory + '/' + name) for name in
               ('receipt.json', 'repair.json', 'release.json', 'reservation.json', 'worker-counter.json',
                'worker-ready.json', 'request-binding.json')}
    check_records(records)
    # Proof: before-owner-float reached unsafe continued credit when only this snapshot dependency call was omitted (fix-fault.json).
    repair.check_snapshot(records['repair.json']['repair']['before'], original['expectedRaw'])
    reservation = records['reservation.json']
    repair.check_reservation(reservation)
    repair.check_binding(Path(directory), reservation)
    binding = records['receipt.json']['binding']
    source = raw.digest_json({pin['path']: pin['sha256'] for pin in original['pins']})
    # Proof: joined-history accepted a foreign original receipt digest when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(reservation['originalSnapshot'] == original['expectedRaw']
            and reservation['nonce'] == original['nonce']
            and reservation['requestDigest'] == provenance['requestDigest']
            and reservation['sourceDigest'] == source
            and records['request-binding.json']['requestDigest'] == provenance['requestDigest']
            and records['request-binding.json']['sourceDigest'] == source
            and binding['rawPath'] == history['path'] and binding['raw'] == history['binding']['raw']
            and binding['originalCreator'] == history['binding']['creator']
            and records['repair.json']['originalReceiptDigest'] == pins[request['rawReceipt']]['sha256']
            and records['repair.json']['failedGuestDigest'] == pins[original['priorGuestFailure']]['sha256']
            and type(records['receipt.json']['rawBytes']) is int
            and records['receipt.json']['rawBytes'] == raw.RAW_BYTES,
            'continued-repair-binding')
    descriptor = raw.open_private(directory, directory=True)
    try:
        creator = raw.identity(os.fstat(descriptor))
        # Proof: release-dependency accepted a false audited release response when this call was omitted (lab-repair-lineage.test.ts; faults.json).
        require(repair.read_release(Path(directory), creator, reservation), 'continued-qualified-release')
        # Proof: directory-change accepted a replaced repair directory when this call was omitted (lab-repair-lineage.test.ts; faults.json).
        require(creator == raw.identity(os.lstat(directory)), 'continued-directory-changed')
    finally:
        os.close(descriptor)
    artifact = records['repair.json']['repair']
    prior_guest = read(request, original['priorGuestRequest'])
    prior_seed = read(request, prior_guest['seedRequest'])
    # Proof: metadata accepted a foreign NoCloud instance-id when this call was omitted (lab-repair-lineage.test.ts; faults.json).
    require(request['nonce'] != prior_seed['nonce']
            and request['members']['meta-data']['path'] != prior_seed['members']['meta-data']['path']
            and request['members']['user-data']['path'] != prior_seed['members']['user-data']['path']
            and all(request['members'][name]['sha256'] != prior_seed['members'][name]['sha256']
                    for name in ('user-data', 'meta-data'))
            and read(request, request['members']['meta-data']['path']) ==
                {'instance-id': 'puniq-' + request['nonce'], 'local-hostname': 'puni-baseline'},
            'continued-seed-identity')
    if current:
        check_admission(history, artifact)
    return {'admission': {'history': history, 'artifact': artifact}, 'path': history['path'], 'identity': artifact['allocation']['identity'],
            'allocationDigest': artifact['allocation']['mapDigest'], 'receiptDigest': history['receiptDigest'],
            'sourceRevision': history['sourceRevision'],
            'receipt': {'schemaVersion': 2, 'lineage': 'continued-guest',
                        'repairRequestDigest': provenance['requestDigest'],
                        'repairReceiptDigest': provenance['receiptDigest'],
                        'repairProvenanceDigest': pins[request['repairProvenance']]['sha256'],
                        'repairArtifactDigest': pins[directory + '/repair.json']['sha256']}}


def check_admission(history, artifact):
    """Re-admit the exact decimal after-snapshot and initialized map immediately before writable handoff."""
    descriptor = repair.open_original(history['path'], artifact['after'])
    try:
        creator_fd = raw.open_private(Path(history['path']).parent, directory=True)
        try:
            # Proof: creator-dependency accepted a foreign original creator when this call was omitted (lab-repair-lineage.test.ts; faults.json).
            require(raw.identity(os.fstat(creator_fd)) == history['binding']['creator'],
                    'continued-original-creator')
        finally:
            os.close(creator_fd)
        allocation = raw.load_inspector().inspect_file(history['path'], raw.RAW_BYTES, require_initialized=True)
        # Proof: map accepted a changed initialized map when this call was omitted (lab-repair-lineage.test.ts; faults.json).
        require(raw.encode_json(allocation) == raw.encode_json(artifact['allocation']), 'continued-current-map')
        repair.check_snapshot(artifact['after'], repair.snapshot_file(os.fstat(descriptor)))
        repair.check_snapshot(artifact['after'], repair.snapshot_file(os.lstat(history['path'])))
    finally:
        os.close(descriptor)
