from pathlib import Path
from collections import Counter
import hashlib, json, os, subprocess
root = Path.cwd()
folder = root / 'openspec/changes/set-step-node-parallelism/evidence/move-2026-10-17'
guard = Path('/tmp/runtime-rss-guard.py')
wrapper = root / '.git/move-lint-staged.sh'
selected = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], text=True).splitlines()
expected = [path for path in selected if Path(path).suffix in ['.ts', '.tsx', '.js', '.mjs', '.cjs']]
if not expected:
    raise RuntimeError('hook proof requires staged lint paths')
shim = Path('/tmp/step-move-lint-shim')
shim.mkdir(exist_ok=True)
shim.joinpath('bunx').write_text(r'''#!/usr/bin/env python3
import os, sys, json
with open('/tmp/step-move-bunx-calls.jsonl', 'a') as log:
    log.write(json.dumps(sys.argv[1:]) + '\n')
if len(sys.argv) != 3 or sys.argv[1] != 'eslint':
    raise RuntimeError('unexpected lint argv')
if sys.argv[2] == os.environ.get('STEP_MOVE_FAULT_PATH'):
    print('Injected lint command failure at ' + sys.argv[2])
    sys.exit(7)
''')
shim.joinpath('bunx').chmod(0o755)
base = {**os.environ, 'RUNTIME_CLOSURE_RSS_MIB': '900'}
mocked = {**base, 'PATH': str(shim) + ':' + base['PATH']}
cli = [str(root / 'node_modules/.bin/lefthook'), 'run', 'pre-commit', '--command', 'lint']
receipts = []

def run(label, environment, arguments=cli):
    for path in ['/tmp/step-move-bunx-calls.jsonl', '/tmp/step-move-lint-invocations.txt']:
        Path(path).write_text('')
    with (folder / (label + '.txt')).open('w') as log:
        status = subprocess.call(['python3', str(guard), *arguments], cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT)
    calls = [json.loads(line) for line in Path('/tmp/step-move-bunx-calls.jsonl').read_text().splitlines()]
    receipts.append({'case': label, 'exitCode': status, 'argv': arguments, 'selectedLintArgv': calls})
    (folder / ('hook-real-proof-receipts.json' if os.environ.get('REAL_LINT_PROOF') == '1' else 'hook-proof-receipts.json')).write_text(json.dumps(receipts, indent=2) + '\n')
    print(json.dumps({'case': label, 'exitCode': status, 'calls': len(calls)}), flush=True)
    return status, calls

if os.environ.get('REAL_LINT_PROOF') != '1':
    status, calls = run('hook-selected-path-coverage', mocked)
    assert status == 0 and Counter(call[1] for call in calls) == Counter(expected)
    actual = [call[1] for call in calls]
    for label, index in [('first', 0), ('middle', len(actual) // 2), ('last', len(actual) - 1)]:
        status, calls = run('hook-failure-' + label, {**mocked, 'STEP_MOVE_FAULT_PATH': actual[index]})
        assert status not in [0, 137] and calls[-1][1] == actual[index] and len(calls) == index + 1
    original = wrapper.read_text()
    try:
        wrapper.write_text(original.replace('set -eu', 'set -u'))
        status, calls = run('hook-propagation-omitted', {**mocked, 'STEP_MOVE_FAULT_PATH': actual[0]})
        assert status == 0 and len(calls) == len(expected)
    finally:
        wrapper.write_text(original)
    status, calls = run('hook-empty-argv', mocked, [str(wrapper)])
    assert status == 64 and not calls
    try:
        guard_start = original.index('if [[ $# -eq 0 ]]')
        guard_end = original.index('fi\n', guard_start) + len('fi\n')
        wrapper.write_text(original[:guard_start] + original[guard_end:])
        status, calls = run('hook-empty-guard-omitted', mocked, [str(wrapper)])
        assert status == 0 and not calls
    finally:
        wrapper.write_text(original)
    (folder / 'hook-selected-lint-paths.json').write_text(json.dumps(expected, indent=2) + '\n')
else:
    path = root / 'libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts'
    original = path.read_text()
    before = hashlib.sha256(original.encode()).hexdigest()
    try:
        path.write_text(original + '\nconst moveLintUnusedProof = 1;\n')
        subprocess.run(['git', 'add', str(path)], check=True)
        status, calls = run('hook-real-staged-lint-fault', {**base, 'RUNTIME_CLOSURE_RSS_MIB': '900'}, cli + ['--file', str(path.relative_to(root))])
        transcript = (folder / 'hook-real-staged-lint-fault.txt').read_text()
        assert status not in [0, 137] and '@typescript-eslint/no-unused-vars' in transcript and 'rule will be skipped' not in transcript
    finally:
        path.write_text(original)
        subprocess.run(['git', 'add', str(path)], check=True)
    after = hashlib.sha256(path.read_bytes()).hexdigest()
    assert before == after
    (folder / 'hook-real-restoration.json').write_text(json.dumps({'path': str(path.relative_to(root)), 'beforeSha256': before, 'afterSha256': after}, indent=2) + '\n')
    (folder / 'hook-real-proof-receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
