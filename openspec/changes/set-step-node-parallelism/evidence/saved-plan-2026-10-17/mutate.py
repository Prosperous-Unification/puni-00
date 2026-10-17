import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[5]
evidence = Path(__file__).resolve().parent
domain = 'libs/wbs/domain/domain/src/saved-plan/'
canonical = domain + 'canonical-plan-input.ts'
normalise = domain + 'normalise-plan-input.ts'
domain_test = domain + 'step-parallels.test.ts'
memory_test = 'libs/wbs/adapters/store-memory/src/memory-source.test.ts'
sqlite_test = 'libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts'
fold_test = 'libs/wbs/application/core/src/service/saved-plan-input.test.ts'


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError(f'expected one mutation boundary: {before!r}')
    return source.replace(before, after, 1)


def disable_guard(source, message, occurrence=0):
    needle = f"throw new Error('{message}');"
    occurrences = [match.start() for match in re.finditer(re.escape(needle), source)]
    at = occurrences[occurrence]
    start = source.rfind('if (', 0, at)
    if start < 0:
        raise RuntimeError('guard boundary absent')
    return source[:start] + 'if (false) ' + source[at:]


faults = []
for name, message, expected, occurrence in [
    ('collection', 'step parallelism collection is missing or malformed', 'refuses missing parallel facts at capture', 0),
    ('reference-lists', 'step parallelism references have no owner or step collection', 'refuses malformed owner list while validating stored parallel facts', 0),
    ('owner-shape', 'step parallelism owner collection is malformed', 'refuses malformed owner row while validating stored parallel facts', 0),
    ('step-shape', 'step parallelism step collection is malformed', 'refuses malformed step row while validating stored parallel facts', 0),
    ('fact-object', 'step parallelism fact is malformed', 'refuses null fact parallel facts at capture', 0),
    ('fact-values', 'step parallelism fact is malformed', 'refuses string maximum parallel facts at capture', 1),
    ('owner', 'step parallelism owner is unknown', 'refuses unknown owner parallel facts at capture', 0),
    ('leaf', 'step parallelism owner is not a leaf', 'refuses parent owner parallel facts at capture', 0),
    ('step', 'step parallelism step is unknown', 'refuses unknown step parallel facts at capture', 0),
    ('duplicate', 'step parallelism pair is duplicated', 'refuses duplicate parallel facts at capture', 0),
]:
    faults.append((name, canonical, lambda source, message=message, occurrence=occurrence: disable_guard(source, message, occurrence), domain_test, expected))
faults.extend([
    ('tuple-percent', domain + 'diff-plans.ts', lambda source: replace_once(source, ".replaceAll('%', '%25')", ''), domain_test, 'compares distinct tuples containing colons without losing an override'),
    ('tuple-key', domain + 'diff-plans.ts', lambda source: replace_once(source, "if (collection === 'stepParallels')", 'if (false)'), domain_test, 'compares distinct tuples containing colons without losing an override'),
    ('range', canonical, lambda source: replace_once(source, '    assertStepParallel(maxParallel);', ''), domain_test, 'refuses oversized maximum parallel facts at capture'),
    ('capture-validation', canonical, lambda source: replace_once(source, 'const stepParallels = readStepParallels(values);', 'const stepParallels = values.stepParallels;'), domain_test, 'refuses unknown owner parallel facts at capture'),
    ('stored-validation', normalise, lambda source: replace_once(source, '  if (readerVersion >= 8) readStepParallels(current);', ''), domain_test, 'refuses duplicate parallel facts at stored read'),
    ('legacy-upgrade', normalise, lambda source: replace_once(source, 'schemaVersion: 8, stepParallels: []', 'schemaVersion: 8'), domain_test, 'upgrades schema7 to absent overrides without changing historical bytes'),
    ('memory-read', 'libs/wbs/adapters/store-memory/src/source.ts', lambda source: replace_once(source, 'stores.stepParallels.listByProject(projectId)', 'Promise.resolve([])'), memory_test, 'captures sparse parallel facts detached from later memory writes'),
    ('sqlite-read', 'libs/wbs/adapters/store-sqlite/src/saved-plan-capture.ts', lambda source: replace_once(source, 'new StepParallelRepository(db, OPEN).listByProject(projectId)', 'Promise.resolve([])'), sqlite_test, 'captures sparse parallel facts on the SQLite snapshot before concurrent clear'),
    ('fold', 'libs/wbs/domain/domain/src/saved-plan-input.ts', lambda source: re.sub(r'stepParallels: reads\.stepParallels\.map\([\s\S]*?\}\)\),', 'stepParallels: [],', source, count=1), fold_test, 'preserves sparse explicit parallel policy through the authored capture fold'),
    ('accessor-reread', canonical, lambda source: replace_once(source, 'facts.push({ workItemId, stepId, maxParallel });', "facts.push({ workItemId, stepId, maxParallel: 'maxParallel' in fact ? fact.maxParallel : 0 });"), domain_test, 'validates and captures the same maximum from a changing accessor'),
])
receipts = []
for name, filename, inject, test, expected in faults:
    path = root / filename
    original = path.read_text()
    changed = inject(original)
    if changed == original:
        raise RuntimeError(f'{name} did not change production')
    try:
        path.write_text(changed)
        execution = subprocess.run([sys.executable, str(evidence / 'rss-guard.py'), 'bun', 'test', test, '--test-name-pattern', 'sparse|parallel', '--timeout=30000'], cwd=root, capture_output=True, text=True)
        transcript = execution.stdout + execution.stderr
        (evidence / (name + '.txt')).write_text(transcript)
        if execution.returncode == 0 or not any('(fail)' in line and expected in line for line in transcript.splitlines()):
            raise RuntimeError(f'{name}: missing named failure, exit {execution.returncode}')
        receipts.append({'fault': name, 'path': filename, 'test': expected, 'exitCode': execution.returncode, 'transcript': name + '.txt'})
        print(name + ': named negative failed', flush=True)
    finally:
        path.write_text(original)
(evidence / 'receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
