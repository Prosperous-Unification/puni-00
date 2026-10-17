import hashlib,json,os,subprocess
from pathlib import Path

root=Path.cwd()
evidence=Path(__file__).resolve().parent
wrapper=root/'.git/duplicate-lint-staged.sh'
original=wrapper.read_text()
shim=Path('/tmp/duplicate-owner-hook-shim')
shim.mkdir(exist_ok=True)
invocations=shim/'calls.jsonl'
(shim/'bunx').write_text('''#!/usr/bin/env python3
import json,os,sys
with open('/tmp/duplicate-owner-hook-shim/calls.jsonl','a') as log: log.write(json.dumps(sys.argv[1:])+'\\n')
if len(sys.argv)!=3 or sys.argv[1]!='eslint': raise RuntimeError('unexpected selected lint argv')
if sys.argv[2]==os.environ.get('DUPLICATE_OWNER_FAULT_PATH'): sys.exit(7)
''')
(shim/'bunx').chmod(0o755)
selected=['apps/wbs/be-01/src/controller/duplicate-step-parallel.controller.db.test.ts','libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts','libs/wbs/application/core/src/module/work-item/work-item.resource.ts']
argv=[str(root/'node_modules/.bin/lefthook'),'run','pre-commit','--command','lint']
receipts=[]

def observe(name,command,expected_exit,expected_paths,extra={}):
 invocations.write_text('')
 with (evidence/(name+'.txt')).open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py',*command],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900','PATH':str(shim)+':'+os.environ['PATH'],**extra},stdout=log,stderr=subprocess.STDOUT)
 calls=[json.loads(line) for line in invocations.read_text().splitlines()]
 receipt={'case':name,'argv':command,'exitCode':completed.returncode,'selectedLintArgv':calls}
 receipts.append(receipt)
 (evidence/'hook-proof-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 print(json.dumps(receipt),flush=True)
 if completed.returncode!=expected_exit or calls!=[['eslint',path] for path in expected_paths]: raise RuntimeError('hook proof failed: '+name)

try:
 observe('hook-selected-coverage',argv,0,selected)
 for index,label in enumerate(['first','middle','last']):
  observe('hook-failure-'+label,argv,1,selected[:index+1],{'DUPLICATE_OWNER_FAULT_PATH':selected[index]})
 wrapper.write_text(original.replace('set -eu','set -u'))
 observe('hook-propagation-omitted',argv,0,selected,{'DUPLICATE_OWNER_FAULT_PATH':selected[0]})
 wrapper.write_text(original)
 observe('hook-empty-argv',[str(wrapper)],64,[])
 start=original.index('if [[ $# -eq 0 ]]');end=original.index('fi\n',start)+3
 wrapper.write_text(original[:start]+original[end:])
 observe('hook-empty-guard-omitted',[str(wrapper)],0,[])
finally:
 wrapper.write_text(original)
 (evidence/'hook-wrapper-restoration.json').write_text(json.dumps({'path':str(wrapper),'sha256':hashlib.sha256(wrapper.read_bytes()).hexdigest(),'restored':wrapper.read_text()==original},indent=2)+'\n')
