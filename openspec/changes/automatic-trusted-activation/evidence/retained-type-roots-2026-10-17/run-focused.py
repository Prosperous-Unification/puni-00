import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[5]
guard = root / 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-aggregate-2026-10-17/rss-guard.py'
activation = 'apps/twilight-structure/twilight-dash/cli/src/activation/'
relationships = 'apps/twilight-structure/twilight-burokrat/cli/src/relationships/'
selections = [(activation + 'review-typescript-roots.test.ts', name) for name in [
    'refuses absolute outside', 'refuses relative outside', 'refuses inherited outside',
    'refuses ancestor escape', 'refuses absent escape descendant',
    'admits existing', 'admits missing', 'admits inherited', 'admits override discarded outside',
    'admits valid candidate link', 'admits omitted ordinary probes',
    'sha1 replays', 'sha256 replays', 'bounds long roots',
    'repeated compiler admission', 'repeated source admission', 'repeated steps admission',
    'omitted typeRoots wildcard types discover', 'omitted typeRoots and types preserve',
]] + [
    (relationships + 'typescript-compiler.test.ts', 'explicit type root admission|observes only parser effective roots|namespace misses'),
    (relationships + 'typescript-core.test.ts', 'configuration mode|compatible source mode'),
]
regressions = [(activation + 'review-typescript.test.ts', f'retained compiler {mode} {format} matches legacy')
               for mode in ['noLib', 'implicit'] for format in ['sha1', 'sha256']]
regressions += [
    (activation + 'review-typescript-owner.test.ts', 'exact extraction owner rejects impostors|registers only after'),
    (activation + 'review-typescript.test.ts', 'byte census seals only after successful extraction'),
]
log_root = pathlib.Path(sys.argv[1])
log_root.mkdir(parents=True, exist_ok=True)
if '--regressions-only' in sys.argv:
    selections = regressions
for index, (test_path, selection) in enumerate(selections):
    log = log_root / f'focused-{index:02}.log'
    invocation = subprocess.run(['python3', str(guard), str(log), 'bun', 'test', test_path, '--test-name-pattern', selection], cwd=root, check=False)
    if invocation.returncode:
        raise SystemExit(invocation.returncode)
    expected = 3 if test_path.endswith(('typescript-compiler.test.ts', 'typescript-core.test.ts')) else 2 if test_path.endswith('review-typescript-owner.test.ts') else 1
    passed = re.search(r'\n ([0-9]+) pass\n', log.read_text())
    # Proof: observations/partial-selection-driver.log has Bun 1 pass/exit 0; this refusal rejects the required count of 2.
    if passed is None or int(passed.group(1)) != expected or '\n 0 fail\n' not in log.read_text():
        raise RuntimeError(f'focused selection did not execute exactly {expected} passing tests: {selection}')
