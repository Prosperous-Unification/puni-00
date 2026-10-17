from pathlib import Path
import subprocess,os,json,sys
root=Path.cwd()
folder=root/'openspec/changes/set-step-node-parallelism/evidence/first-child-2026-10-17'
guard=str(folder/'rss-guard.py')
receipts=[]
def run(label,cap,argv):
 with (folder/(label+'.txt')).open('w') as log:
  completed=subprocess.run(['python3',guard,*argv],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':str(cap)},stdout=log,stderr=subprocess.STDOUT)
 receipts.append({'check':label,'capMiB':cap,'argv':argv,'exitCode':completed.returncode})
 (folder/'final-check-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 print(json.dumps(receipts[-1]),flush=True)
 if completed.returncode: sys.exit(completed.returncode)
run('final-focused',900,['bun','test','libs/wbs/application/core/src/module/work-item/first-child-step-parallel.test.ts','apps/wbs/be-01/src/controller/first-child-step-parallel.controller.db.test.ts','libs/wbs/domain/contracts/src/http/refusal.test.ts'])
for module in ['work-item','plan-commands']:
 run('type-final-'+module,1280,['bunx','tsc','--project','libs/wbs/application/core/src/module/'+module+'/tsconfig.json','--pretty','false'])
paths=subprocess.check_output(['git','diff','HEAD','--name-only'],text=True).splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
paths=sorted({path for path in paths if Path(path).suffix in ['.ts','.md','.json','.yml','.yaml']})
run('format-final',900,['bunx','prettier','--write',*paths])
cli=['bun','/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js']
run('openspec-strict-final',900,[*cli,'validate','set-step-node-parallelism','--strict','--json'])
run('openspec-all-final',900,[*cli,'validate','--all','--json'])
