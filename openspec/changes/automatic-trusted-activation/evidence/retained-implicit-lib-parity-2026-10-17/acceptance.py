import pathlib, subprocess, json, sys
folder = pathlib.Path(__file__).parent
guard = 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
test = 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.test.ts'
trials = [
 ('budget-census-entries', 'implicit compiler bounds exact census-entries library observations'),
 ('budget-census-bytes', 'implicit compiler bounds exact census-bytes library observations'),
 ('budget-envelope', 'implicit compiler bounds exact envelope library observations'),
 ('absent-root', 'implicit compiler refuses absent lib.es2025.full.d.ts'),
 ('absent-dom', 'implicit compiler refuses absent lib.dom.d.ts'),
 ('absent-transitive', 'implicit compiler refuses absent lib.es2015.promise.d.ts'),
 ('physical-mutation', 'implicit compiler ignores physical library mutation'),
 ('changed-indirect', 'implicit compiler observes changed indirect library identity'),
 ('restored-sha1', 'compiler implicit sha1.*capture roots'),
 ('restored-sha256', 'compiler implicit sha256.*capture roots'),
 ('control-nolib-sha1', 'compiler noLib sha1.*capture roots'),
 ('control-nolib-sha256', 'compiler noLib sha256.*capture roots'),
 ('control-es5-sha1', 'compiler ES5 sha1.*capture roots'),
 ('control-es5-sha256', 'compiler ES5 sha256.*capture roots'),
]
receipts = json.loads((folder / 'acceptance.json').read_text()) if '--resume' in sys.argv else []
receipts = [phase for phase in receipts if phase['oneSelectedTestPassed']]
try:
 for name, pattern in trials:
  if name in [phase['phase'] for phase in receipts]: continue
  log = folder / (name + '.log')
  invocation = subprocess.run(['python3', guard, str(log), 'bun', 'test', test, '--test-name-pattern', pattern], capture_output=True, text=True)
  receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
  transcript = log.read_text()
  passed = invocation.returncode == 0 and receipt['exitCode'] == 0 and '1 pass' in transcript and '0 fail' in transcript
  receipts.append({'phase': name, 'testPattern': pattern, 'oneSelectedTestPassed': passed, **receipt})
  print(name, passed, receipt['peakProcessTreeKiB'], flush=True)
  if not passed: raise RuntimeError('phase failed or exceeded guard: ' + name)
finally:
 (folder / 'acceptance.json').write_text(json.dumps(receipts, indent=2) + '\n')
