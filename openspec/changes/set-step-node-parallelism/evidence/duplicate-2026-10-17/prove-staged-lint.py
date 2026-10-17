import hashlib,json,os,subprocess
from pathlib import Path

root=Path.cwd()
evidence=Path(__file__).resolve().parent
service=Path('libs/wbs/application/core/src/module/work-item/work-item.resource.ts')
tests=['libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts','apps/wbs/be-01/src/controller/duplicate-step-parallel.controller.db.test.ts']
original=service.read_bytes()
try:
 subprocess.run(['git','restore','--staged',*tests],check=True)
 service.write_bytes(original+b'\nconst duplicationLintFault = 1;\n')
 subprocess.run(['git','add',str(service)],check=True)
 argv=[str(root/'node_modules/.bin/lefthook'),'run','pre-commit','--command','lint']
 with (evidence/'hook-real-staged-lint-negative.txt').open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py',*argv],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'1280','NX_DAEMON':'false','NX_ISOLATE_PLUGINS':'false'},stdout=log,stderr=subprocess.STDOUT)
 transcript=(evidence/'hook-real-staged-lint-negative.txt').read_text()
 receipt={'argv':argv,'exitCode':completed.returncode,'namedUnusedFaultObserved':'duplicationLintFault' in transcript and '@typescript-eslint/no-unused-vars' in transcript,'activeGraph':'rule will be skipped' not in transcript}
 (evidence/'hook-real-staged-lint-negative.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt),flush=True)
 if completed.returncode!=1 or not receipt['namedUnusedFaultObserved'] or not receipt['activeGraph']: raise RuntimeError('real staged lint negative did not fail through ESLint')
finally:
 service.write_bytes(original)
 subprocess.run(['git','add',str(service),*tests],check=True)
 (evidence/'hook-real-staged-restoration.json').write_text(json.dumps({'sha256':hashlib.sha256(service.read_bytes()).hexdigest(),'restored':service.read_bytes()==original},indent=2)+'\n')
