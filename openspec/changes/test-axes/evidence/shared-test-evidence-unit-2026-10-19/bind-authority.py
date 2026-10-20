import hashlib
import json
import pathlib
import shutil
import subprocess

root = pathlib.Path.cwd()
scratch = pathlib.Path('/tmp/wbs08039-evidence-unit-20261019')
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
assert subprocess.check_output(['git', 'status', '--porcelain'], text=True) == ''
shutil.copy2(root / 'tmp/junit/shared-test-evidence.unit.xml', scratch / 'report.xml')
script = '''
import { readCandidate } from './apps/twilight-structure/twilight-burokrat/cli/src/inventory/read-candidate.ts';
import { hashCanonical } from './apps/twilight-structure/twilight-burokrat/cli/src/evidence/content-manifest.ts';
const snapshot = readCandidate(process.cwd(), { kind: 'committed', revision: process.argv[1] });
process.stdout.write(hashCanonical({ selection: snapshot.selection, entries: snapshot.entries, untracked: snapshot.untracked }));
'''
subprocess.run(['python3', '/tmp/wbs08039-evidence-guard.py', str(scratch / 'candidate-pin'), 'bun', '--eval', script, revision], check=True)
candidate = (scratch / 'candidate-pin.stdout').read_text().strip()
assert len(candidate) == 64
manifest = 'libs/shared/domain/test-evidence/project.json'
manifest_bytes = subprocess.check_output(['git', 'show', revision + ':' + manifest])
authority = {
    'schemaVersion': 1,
    'revision': revision,
    'candidate': candidate,
    'projectRoot': 'libs/shared/domain/test-evidence',
    'projectManifest': {'path': manifest, 'digest': hashlib.sha256(manifest_bytes).hexdigest()},
    'target': 'test:unit:level',
    'junit': {'path': str(scratch / 'report.xml'), 'digest': hashlib.sha256((scratch / 'report.xml').read_bytes()).hexdigest()},
}
(scratch / 'authority.json').write_text(json.dumps(authority, indent=2) + '\n')
subprocess.run(['python3', '/tmp/wbs08039-evidence-guard.py', str(scratch / 'inspector'), 'bun', 'apps/twilight-structure/twilight-burokrat/cli/src/cli.ts', 'inspect-bun-test-reports', '.', revision, str(scratch / 'authority.json')], check=True)
subprocess.run(['python3', '/tmp/wbs08039-evidence-guard.py', str(scratch / 'parity'), 'python3', str(scratch / 'parity.py')], check=True)
