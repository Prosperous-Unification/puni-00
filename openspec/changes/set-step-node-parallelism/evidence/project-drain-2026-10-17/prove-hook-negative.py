from pathlib import Path
import os,subprocess,hashlib,json
path=Path('libs/wbs/adapters/store-sqlite/src/optimization-drain-step-parallel.db.test.ts');original=path.read_bytes();digest=hashlib.sha256(original).hexdigest()
try:
 path.write_bytes(original+b'\nconst projectDrainHookLintFault = 1;\n')
 subprocess.run(['git','add',str(path)],check=True)
 with open('/tmp/project-drain-real-hook-negative-20261017.txt','w') as log:
  run=subprocess.run(['python3','/tmp/runtime-rss-guard.py','bunx','--no-install','lefthook','run','pre-commit'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'NX_DAEMON':'false','NX_ISOLATE_PLUGINS':'false','RUNTIME_CLOSURE_RSS_MIB':'1280'})
 assert run.returncode==1
 receipt=Path('/tmp/project-drain-real-hook-negative-20261017.txt').read_text()
 assert 'projectDrainHookLintFault' in receipt and '@typescript-eslint/no-unused-vars' in receipt
finally:
 path.write_bytes(original)
 subprocess.run(['git','add',str(path)],check=True)
 staged=subprocess.run(['git','show',':'+str(path)],capture_output=True,check=True).stdout
 assert staged==original and path.read_bytes()==original
 Path('/tmp/project-drain-hook-source-restoration-20261017.json').write_text(json.dumps({'sourceSha256':digest,'indexSha256':hashlib.sha256(staged).hexdigest()},indent=2)+'\n')
