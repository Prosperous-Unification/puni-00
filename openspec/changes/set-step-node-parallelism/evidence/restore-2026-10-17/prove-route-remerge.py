from pathlib import Path
import os, subprocess, hashlib, json
path=Path('libs/wbs/application/core/src/http/work-item.routes.ts')
original=path.read_bytes(); digest=hashlib.sha256(original).hexdigest()
old="""    case 'referenced_by_step_parallel':
      return {
        ok: false,
        status: 409,
        body: { ...context, error: outcome.reason, ...outcome.detail },
      };
    case 'descendant_step_on_leaf':"""
new="""    case 'referenced_by_step_parallel':
    case 'descendant_step_on_leaf':"""
assert old in original.decode()
try:
 path.write_text(original.decode().replace(old,new,1))
 with open('/tmp/restore-route-remerge-fault-20261017.txt','w') as log:
  run=subprocess.run(['python3','/tmp/runtime-rss-guard.py','node_modules/.bin/tsc','--project','/tmp/restore-controller-tsconfig-20261017.json','--noEmit'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'1700'})
 assert run.returncode==1
 assert 'work-item.routes.ts' in Path('/tmp/restore-route-remerge-fault-20261017.txt').read_text()
finally:
 path.write_bytes(original)
 assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
 Path('/tmp/restore-route-restoration-20261017.json').write_text(json.dumps({'sha256Before':digest,'sha256Restored':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2)+'\n')
