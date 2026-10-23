import hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd()
evidence=Path(__file__).resolve().parent
service=root/'libs/wbs/application/core/src/module/work-item/work-item.resource.ts'
original=service.read_bytes()
try:
 service.write_bytes(b"import '@wbs/store-sqlite';\n"+original)
 with (evidence/'lint-boundary-negative.txt').open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py','bunx','eslint',str(service.relative_to(root))],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900','NX_DAEMON':'false'},stdout=log,stderr=subprocess.STDOUT)
 output=(evidence/'lint-boundary-negative.txt').read_text()
 if completed.returncode!=1 or '@nx/enforce-module-boundaries' not in output or 'rule will be skipped' in output: raise RuntimeError('boundary fault did not fail through active Nx rule')
finally:
 service.write_bytes(original)
 (evidence/'lint-boundary-restoration.json').write_text(json.dumps({'injectedFault':'core imports SQLite adapter','restored':service.read_bytes()==original,'sha256':hashlib.sha256(original).hexdigest()},indent=2)+'\n')
