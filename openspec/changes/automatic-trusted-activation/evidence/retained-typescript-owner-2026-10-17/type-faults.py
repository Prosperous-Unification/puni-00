from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[5]
source = root / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.ts'
original = source.read_text()
evidence = Path(__file__).parent
try:
    for name, before, after in [
        ('readonly-type', 'readonly [K in keyof T]', '[K in keyof T]'),
        ('opaque-brand', '  readonly [ExtractionBrand]: true;', ''),
    ]:
        assert original.count(before) == 1
        source.write_text(original.replace(before, after))
        phase = subprocess.run([
            'python3', str(evidence.parent / 'retained-typescript-source-2026-10-17/rss-guard.py'),
            str(evidence / ('fault-' + name + '.log')), 'bunx', '--no-install', 'tsc', '--noEmit',
            '-p', str(evidence / 'focused-tests.tsconfig.json'),
        ], cwd=root)
        assert phase.returncode != 0
        assert "Unused '@ts-expect-error' directive" in (evidence / ('fault-' + name + '.log')).read_text()
finally:
    source.write_text(original)
