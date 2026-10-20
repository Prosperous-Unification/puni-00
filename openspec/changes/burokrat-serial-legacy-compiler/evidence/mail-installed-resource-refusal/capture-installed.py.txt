import hashlib
import json
from pathlib import Path
import subprocess
import sys

executable, manifest_path, descriptor_path, destination = map(Path, sys.argv[1:])

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

snapshot = {
    'manifest': json.loads(manifest_path.read_text()),
    'executableSha256': digest(executable),
    'descriptor': json.loads(descriptor_path.read_text()),
    'descriptorSha256': digest(descriptor_path),
    'validatorSha256': digest(descriptor_path.parent / 'validator.mjs'),
    'bunVersion': subprocess.run(['bun', '--version'], check=True, capture_output=True,
                                 text=True).stdout.strip(),
}
with destination.open('x') as stream:
    stream.write(json.dumps(snapshot, indent=2) + '\n')
print(json.dumps({'snapshot': str(destination), 'sha256': digest(destination),
                  'sourceRevision': snapshot['manifest']['sourceRevision'],
                  'executableSha256': snapshot['executableSha256']}))
