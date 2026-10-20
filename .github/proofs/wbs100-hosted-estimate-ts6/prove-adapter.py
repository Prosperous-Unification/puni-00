import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hosted_ts6', ROOT / 'run-hosted.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
proof = ROOT.parents[2]
expected = json.loads((proof / adapter.EVIDENCE / 'ts6-identity.json.txt').read_text())
checks = []


def watch(name, check, good, alter, diagnostic):
    check(good)
    changed = copy.deepcopy(good)
    alter(changed)
    try:
        check(changed)
    except RuntimeError as refusal:
        if diagnostic not in str(refusal):
            raise RuntimeError(f'{name}: wrong refusal {refusal}') from refusal
        checks.append({'name': name, 'refusal': str(refusal), 'restored': 'passed'})
    else:
        raise RuntimeError(f'{name}: altered adapter input was accepted')
    check(good)


def set_key(key, value):
    return lambda content: content.__setitem__(key, value)


receipt = {
    'command': ['bun', 'node_modules/typescript/bin/tsc6', '-p', adapter.SCOPE, '--noEmit'],
    'cwd': '/isolated/source', 'exitCode': 0, 'stopReason': None,
    'ceilingKiB': 2097152, 'timeoutSeconds': 360, 'minimumAvailableKiB': 12582912,
    'availableBeforeKiB': 14000000, 'peakProcessTreeKiB': 1700000, 'seconds': 7,
}
for key, changed in [
    ('command', ['bun', 'tsgo']), ('cwd', '/other'), ('exitCode', 1),
    ('stopReason', 'rss_limit'), ('ceilingKiB', 4194304), ('timeoutSeconds', 900),
    ('minimumAvailableKiB', 0), ('availableBeforeKiB', 12582911),
    ('peakProcessTreeKiB', 2097153), ('seconds', 361),
]:
    watch('receipt-' + key, lambda content: adapter.validate_receipt(content, receipt['command'], receipt['cwd']),
          receipt, set_key(key, changed), 'receipt ' + key)
for key, changed in [
    ('version', 'Version 7.0.0'), ('resolvedPackageVersion', '7.0.0'),
    ('entrySha256', '0' * 64), ('facadeShimSha256', '0' * 64),
]:
    watch('compiler-' + key, lambda content: adapter.validate_compiler(content, expected),
          expected, set_key(key, changed), 'version' if 'Version' in key or key == 'version' else key)
for name in ['lib/tsc.js', 'lib/_tsc.js']:
    for field, changed in [('sha256', '0' * 64), ('bytes', 1)]:
        watch('compiler-' + name + '-' + field, lambda content: adapter.validate_compiler(content, expected),
              expected, lambda content, name=name, field=field, changed=changed:
              content['resolvedCompilerFiles'][name].__setitem__(field, changed), 'resolvedCompilerFiles')
source = {'revision': adapter.SOURCE, 'inputs': adapter.INPUTS, 'lock': adapter.LOCK, 'bun': '1.4.2'}
for key, changed, diagnostic in [
    ('revision', '0' * 40, 'source revision'), ('lock', '0' * 64, 'lockfile'), ('bun', '1.4.1', 'Bun version'),
]:
    watch('source-' + key, lambda content: adapter.validate_source(content['revision'], content['inputs'], content['lock'], content['bun']),
          source, set_key(key, changed), diagnostic)
for name in adapter.INPUTS:
    watch('input-' + name, lambda content: adapter.validate_source(content['revision'], content['inputs'], content['lock'], content['bun']),
          source, lambda content, name=name: content['inputs'].__setitem__(name, '0' * 64), 'retained inputs')
for key, changed in [('exitCode', False), ('seconds', False), ('seconds', float('nan')),
                     ('seconds', float('inf')), ('seconds', '7'), ('peakProcessTreeKiB', True)]:
    watch('receipt-type-' + key + '-' + repr(changed),
          lambda content: adapter.validate_receipt(content, receipt['command'], receipt['cwd']),
          receipt, set_key(key, changed), 'receipt ' + key)
snapshot = {
    'sourceRevision': adapter.SOURCE, 'compiler': expected, 'scopeSha256': adapter.INPUTS['ts6-scope.json.txt'],
    'sourceFiles': {'bun.lock': adapter.LOCK, 'selected.tsx': 'original'},
    'retainedInputs': adapter.INPUTS, 'bunVersion': '1.4.2', 'trackedDiff': '',
    'untrackedPaths': adapter.SCOPE,
}
for key, changed, diagnostic in [
    ('scopeSha256', '0' * 64, 'scope config'), ('trackedDiff', 'changed tracked source', 'tracked source mutation'),
    ('untrackedPaths', adapter.SCOPE + '\nextra.ts', 'unexpected source file'),
]:
    watch('snapshot-' + key, lambda content: adapter.validate_snapshot(content, expected),
          snapshot, set_key(key, changed), diagnostic)
watch('after-source-drift', lambda content: adapter.validate_after(content, snapshot), snapshot,
      lambda content: content['sourceFiles'].__setitem__('selected.tsx', 'changed'), 'source/config/compiler after')
checkout = {'status': '', 'installed': False}
for key, changed, diagnostic in [('status', ' M source.ts', 'fresh source checkout'),
                                 ('installed', True, 'fresh dependency tree')]:
    watch('checkout-' + key, lambda content: adapter.validate_checkout(content['status'], content['installed']),
          checkout, set_key(key, changed), diagnostic)
guard = {'exit': 0, 'receipt': receipt}
watch('guard-failure', lambda content: adapter.validate_guard(content['exit'], content['receipt'], receipt['command'], receipt['cwd']),
      guard, set_key('exit', 1), 'guard exit')
watch('guard-success-child-one', lambda content: adapter.validate_guard(content['exit'], content['receipt'], receipt['command'], receipt['cwd']),
      guard, lambda content: content['receipt'].__setitem__('exitCode', 1), 'receipt exitCode')
orchestration = []


def exercise(fault, destination):
    observations = 0

    def observe():
        nonlocal observations
        observations += 1
        observed = copy.deepcopy(snapshot)
        if fault == 'source':
            observed['sourceRevision'] = '0' * 40
        if fault == 'compiler':
            observed['compiler']['entrySha256'] = '0' * 64
        if fault == 'after' and observations == 2:
            observed['sourceFiles']['selected.tsx'] = 'changed'
        return observed

    def invoke(label, command):
        observed_receipt = copy.deepcopy(receipt)
        observed_receipt['command'] = command
        if fault == 'child':
            observed_receipt['exitCode'] = 1
        adapter.write_json(destination / (label + '.receipt.json'), observed_receipt)
        return (1 if fault == 'guard' else 0), observed_receipt, ''

    return adapter.verify_typecheck(destination, observe, invoke, expected,
                                    receipt['command'], receipt['cwd'])


with tempfile.TemporaryDirectory(prefix='wbs100-ts6-adapter-') as scratch:
    for fault, diagnostic in [('source', 'source revision'), ('compiler', 'entrySha256'),
                              ('child', 'receipt exitCode'), ('guard', 'guard exit'),
                              ('after', 'source/config/compiler after')]:
        destination = Path(scratch) / fault
        destination.mkdir()
        try:
            exercise(fault, destination)
        except RuntimeError as refusal:
            if diagnostic not in str(refusal):
                raise RuntimeError(f'{fault}: wrong orchestration refusal {refusal}') from refusal
            if (destination / 'acceptance.json').exists():
                raise RuntimeError(f'{fault}: failed orchestration published acceptance')
            orchestration.append({'fault': fault, 'refusal': str(refusal),
                                  'acceptanceAbsent': True, 'restored': 'passed'})
        else:
            raise RuntimeError(f'{fault}: production orchestration accepted fault')
        restored = Path(scratch) / (fault + '-restored')
        restored.mkdir()
        accepted = exercise(None, restored)
        if accepted != json.loads((restored / 'acceptance.json').read_text()):
            raise RuntimeError(f'{fault}: restored acceptance not published exactly')
receipts = Path(sys.argv[1]).resolve()
receipts.mkdir(parents=True, exist_ok=True)
adapter.write_json(receipts / 'adapter-negatives.json', {
    'scope': 'Proof adapter integrity only: synthetic assertions, no compiler negatives or compiler execution',
    'checks': checks, 'orchestration': orchestration, 'status': 'passed',
})
print(json.dumps({'status': 'passed', 'watchedNegatives': len(checks), 'orchestrationNegatives': len(orchestration), 'scope': 'adapter integrity only'}))
