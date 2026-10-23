from pathlib import Path
import subprocess,os,json
root=Path('/tmp/step-export-fence-20261017');folder=root/'openspec/changes/set-step-node-parallelism/evidence/export-fence-2026-10-17'
guard=root/'openspec/changes/set-step-node-parallelism/evidence/saved-plan-2026-10-17/rss-guard.py'
expected=json.loads(Path('/tmp/export-fence-lint-expected.json').read_text())
shim=Path('/tmp/export-fence-lint-shim');shim.mkdir(exist_ok=True)
shim.joinpath('bunx').write_text('''#!/usr/bin/env python3
import os,sys,json
with open('/tmp/export-fence-bunx-calls.jsonl','a') as log: log.write(json.dumps(sys.argv[1:])+'\\n')
if len(sys.argv)!=3 or sys.argv[1]!='eslint': raise RuntimeError('unexpected lint argv')
if sys.argv[2]==os.environ.get('EXPORT_FENCE_FAULT_PATH'):
 print('Injected lint command failure at '+sys.argv[2]);sys.exit(7)
''');shim.joinpath('bunx').chmod(0o755)
base={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900','NODE_OPTIONS':'--max-old-space-size=640'}
cli=[str(root/'node_modules/.bin/lefthook'),'run','pre-commit','--command','lint']
receipts=[]
def run(label,env,arguments=cli):
 for path in ['/tmp/export-fence-bunx-calls.jsonl','/tmp/export-fence-lint-invocations.txt']:
  Path(path).write_text('')
 with (folder/(label+'.txt')).open('w') as log:
  status=subprocess.call(['python3',str(guard),*arguments],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
 calls=[json.loads(line) for line in Path('/tmp/export-fence-bunx-calls.jsonl').read_text().splitlines()]
 receipts.append({'case':label,'exitCode':status,'argv':calls})
 (folder/'serial-hook-proof-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 (folder/(label+'-argv.json')).write_text(json.dumps(calls,indent=2)+'\n')
 print(json.dumps({'case':label,'exitCode':status,'calls':len(calls)}),flush=True)
 return status,calls
mocked={**base,'PATH':str(shim)+':'+base['PATH']}
status,calls=run('serial-hook-coverage',mocked)
assert status==0 and len(calls)==len(expected) and sorted(call[1] for call in calls)==sorted(expected)
actual=[call[1] for call in calls]
for label,index in [('first',0),('middle',len(actual)//2),('last',len(actual)-1)]:
 status,calls=run('serial-hook-failure-'+label,{**mocked,'EXPORT_FENCE_FAULT_PATH':actual[index]})
 assert status!=0 and calls[-1][1]==actual[index] and len(calls)==index+1
wrapper=Path('/tmp/export-fence-lint-staged.sh');original=wrapper.read_text()
try:
 wrapper.write_text(original.replace('set -eu','set -u'))
 status,calls=run('serial-hook-propagation-omitted',{**mocked,'EXPORT_FENCE_FAULT_PATH':actual[0]})
 assert status==0 and len(calls)==len(expected)
finally:wrapper.write_text(original)
if os.environ.get('MOCK_ONLY') != '1':
 # A real repository rule must also fail through the real hook, without the process shim.
 source=root/'libs/wbs/domain/contracts/src/http/project-shapes.ts';original=source.read_text()
 try:
  source.write_text(original+'\nconst exportFenceUnusedProof = 1;\n')
  subprocess.run(['git','add',str(source)],cwd=root,check=True)
  status,calls=run('serial-hook-real-lint-fault',base,cli+['--file','libs/wbs/domain/contracts/src/http/project-shapes.ts'])
  assert status!=0
  transcript=(folder/'serial-hook-real-lint-fault.txt').read_text()
  assert '@typescript-eslint/no-unused-vars' in transcript and 'ProjectGraph' not in transcript
 finally:
  source.write_text(original)
  subprocess.run(['git','add',str(source)],cwd=root,check=True)
(folder/'serial-hook-proof-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
(folder/'serial-hook-expected.json').write_text(json.dumps(expected,indent=2)+'\n')
