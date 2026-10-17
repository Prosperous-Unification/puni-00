from pathlib import Path
import subprocess
import json
import sys

# Run from any checkout; every trial restores the exact starting production source.
root = Path(__file__).resolve().parents[5]
production = root / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-selection-objects.ts'
evidence = Path(__file__).resolve().parent
pristine = production.read_text()
registration_start = pristine.index('  ReviewProvenance.set(')
registration_end = pristine.index('\n  return candidate;', registration_start)
registration = pristine[registration_start:registration_end]
request_start = pristine.index('  const request = assertActivationRequest({')
request_end = pristine.index('\n  const binding =', request_start)
request = pristine[request_start:request_end]
admission_start = pristine.index('  const validatedRequest =')
admission = pristine[admission_start:request_end]
mutants = {
    'lookup-omission': pristine.replace("if (provenance === undefined) throw new Error('owned retained review candidate required');", "if (provenance === undefined) return { requestIdentity: '', snapshotIdentity: '', historyManifestIdentity: null };"),
    'freeze-omission': pristine.replace(registration, registration.replace('Object.freeze({', '({')),
    'request-substitution': pristine.replace(registration, registration.replace('request.requestIdentity', "'0'.repeat(64)")),
    'snapshot-substitution': pristine.replace(registration, registration.replace('      snapshotIdentity,', "      snapshotIdentity: '0'.repeat(64),")),
    'history-substitution': pristine.replace(registration, registration.replace('retainedHistory.identity', "'0'.repeat(64)")),
    'complete-history-null': pristine.replace(registration, registration.replace('retainedHistory === null ? null : retainedHistory.identity', 'null')),
    'legacy-pin-promotion': pristine.replace(registration, registration.replace('retainedHistory === null ? null : retainedHistory.identity', 'retainedHistory === null ? historyIdentity ?? null : retainedHistory.identity')),
    'late-caller-reread': pristine.replace(registration, registration.replace('request.requestIdentity', 'rawRequest.requestIdentity')),
    'registration-omission': pristine.replace(registration, ''),
    'early-registration': pristine.replace('  input.history?.assertOwner();\n  const candidate: RetainedCandidate', '  const candidate: RetainedCandidate', 1).replace(registration, registration + '\n  input.history?.assertOwner();'),
    'generic-clone-before-admission': pristine.replace(admission, '  const request = assertActivationRequest(structuredClone(rawRequest));'),
    'closed-admission-omission': pristine.replace('const validatedRequest = assertActivationRequest(rawRequest);', 'const validatedRequest = rawRequest;'),
    'snapshot-validation-omission': pristine.replace(request, request.replace('assertActivationRequest({', '{', 1).replace('\n  });', '\n  };', 1)),
}
selected = sys.argv[1:] or list(mutants)
assert all(name in mutants for name in selected)
ledger = json.loads((evidence / 'fault-ledger.json').read_text()) if sys.argv[1:] else []
try:
    for name in selected:
        source = mutants[name]
        assert source != pristine, name
        production.write_text(source)
        subprocess.run(['python3', str(root / 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'), str(evidence / (name + '.log')), 'bun', 'test', 'apps/twilight-structure/twilight-dash/cli/src/activation/review-selection-provenance.test.ts', '--timeout=60000'], cwd=root, check=False)
        log = (evidence / (name + '.log')).read_text()
        failures = [line for line in log.splitlines() if line.startswith('(fail)')]
        receipt = json.loads((evidence / (name + '.log.json')).read_text())
        ledger = [entry for entry in ledger if entry['fault'] != name]
        ledger.append({'fault': name, 'exitCode': receipt['exitCode'], 'peakProcessTreeKiB': receipt['peakProcessTreeKiB'], 'failedTests': failures})
        print(name, receipt['exitCode'], len(failures), flush=True)
        assert receipt['exitCode'] != 0 and failures, name
finally:
    production.write_text(pristine)
    (evidence / 'fault-ledger.json').write_text(json.dumps(ledger, indent=2) + '\n')
