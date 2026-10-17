from pathlib import Path
import subprocess
root = Path.cwd()
source = root / 'libs/wbs/domain/domain/src/step-parallel.ts'
evidence = root / 'openspec/changes/set-step-node-parallelism/evidence'
original = source.read_text()
before = "return { kind: 'explicit', maxParallel };"
after = "return { kind: 'explicit', maxParallel: override.maxParallel };"
assert original.count(before) == 1
try:
    source.write_text(original.replace(before, after))
    with (evidence / 'resolver-accessor-2026-10-17/reread.txt').open('w') as transcript:
        completed = subprocess.run([
            'python3', str(evidence / 'resolver-2026-10-17/rss-guard.py'),
            'bun', 'test', 'libs/wbs/domain/domain/src/step-parallel.test.ts',
        ], cwd=root, stdout=transcript, stderr=subprocess.STDOUT)
    if completed.returncode != 1:
        raise RuntimeError(f'Expected exit 1, received {completed.returncode}')
finally:
    source.write_text(original)
print('Re-reading the supplied getter failed its production-path regression (exit 1).')
