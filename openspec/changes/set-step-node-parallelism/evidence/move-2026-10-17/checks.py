import json,os,subprocess,sys
from pathlib import Path
root=Path.cwd()
evidence=Path(__file__).resolve().parent
checks=[
 ('format', ['bunx','prettier','--write','libs/wbs/application/core/src/module/work-item/work-item.resource.ts','libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts','apps/wbs/be-01/src/controller/move-step-parallel.controller.db.test.ts','openspec/changes/set-step-node-parallelism/design.md','openspec/changes/set-step-node-parallelism/tasks.md','openspec/changes/set-step-node-parallelism/specs/wbs-domain/spec.md','openspec/changes/set-step-node-parallelism/verify.md']),
 ('type-work-item',['bunx','tsc','--project','libs/wbs/application/core/src/module/work-item/tsconfig.json','--pretty','false']),
 ('type-plan-commands',['bunx','tsc','--project','libs/wbs/application/core/src/module/plan-commands/tsconfig.json','--pretty','false']),
 ('lint-service',['bunx','eslint','libs/wbs/application/core/src/module/work-item/work-item.resource.ts']),
 ('lint-memory',['bunx','eslint','libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts']),
 ('lint-mounted',['bunx','eslint','apps/wbs/be-01/src/controller/move-step-parallel.controller.db.test.ts']),
 ('openspec-status',['bun','/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js','status','--change','set-step-node-parallelism','--json']),
 ('openspec-apply',['bun','/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js','instructions','apply','--change','set-step-node-parallelism','--json']),
 ('openspec-selected',['bun','/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js','validate','set-step-node-parallelism','--strict','--json']),
 ('openspec-all',['bun','/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js','validate','--all','--json']),
]
receipts=[]
for name,argv in checks:
 if len(sys.argv)>1 and name not in sys.argv[1:]: continue
 cap=1280 if name in ['type-work-item','type-plan-commands','lint-mounted'] else 900
 with (evidence/(name+'.txt')).open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py',*argv],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':str(cap),'NX_DAEMON':'false'},stdout=log,stderr=subprocess.STDOUT)
 receipts.append({'check':name,'argv':argv,'capMiB':cap,'exitCode':completed.returncode})
 with (evidence/('checks-'+('-'.join(sys.argv[1:]) or 'all')+'.json')).open('w') as receipt: json.dump(receipts,receipt,indent=2);receipt.write('\n')
 print(json.dumps(receipts[-1]),flush=True)
 if completed.returncode: sys.exit(completed.returncode)
