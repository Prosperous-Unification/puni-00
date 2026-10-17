import json,os,subprocess,sys
from pathlib import Path

evidence=Path(__file__).resolve().parent
spec='/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js'
checks=[
 ('format',['bunx','prettier','--write','libs/wbs/application/core/src/module/work-item/work-item.resource.ts','libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts','apps/wbs/be-01/src/controller/delete-step-parallel.controller.db.test.ts','openspec/changes/set-step-node-parallelism/design.md','openspec/changes/set-step-node-parallelism/tasks.md','openspec/changes/set-step-node-parallelism/specs/wbs-domain/spec.md','openspec/changes/set-step-node-parallelism/verify.md']),
 ('final-memory',['bun','test','libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts','libs/wbs/application/core/src/module/work-item/first-child-step-parallel.test.ts','libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts','libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts']),
 ('final-mounted',['bun','test','apps/wbs/be-01/src/controller/delete-step-parallel.controller.db.test.ts','apps/wbs/be-01/src/controller/first-child-step-parallel.controller.db.test.ts','apps/wbs/be-01/src/controller/move-step-parallel.controller.db.test.ts']),
 ('hook-install',['bun','run','tools/tool-git-hooks/src/install.ts']),
 ('normal-hook',['bunx','lefthook','run','pre-commit','--force']),
 ('green-memory',['bun','test','libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts']),
 ('green-mounted',['bun','test','apps/wbs/be-01/src/controller/delete-step-parallel.controller.db.test.ts']),
 ('openspec-status',['bun',spec,'status','--change','set-step-node-parallelism','--json']),
 ('openspec-apply',['bun',spec,'instructions','apply','--change','set-step-node-parallelism','--json']),
 ('openspec-selected',['bun',spec,'validate','set-step-node-parallelism','--strict','--json']),
 ('openspec-all',['bun',spec,'validate','--all','--json']),
 ('type-work-item',['bunx','tsc','--project','libs/wbs/application/core/src/module/work-item/tsconfig.json','--pretty','false']),
 ('type-plan-commands',['bunx','tsc','--project','libs/wbs/application/core/src/module/plan-commands/tsconfig.json','--pretty','false']),
 ('lint-service',['bunx','eslint','libs/wbs/application/core/src/module/work-item/work-item.resource.ts']),
 ('lint-memory',['bunx','eslint','libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts']),
 ('lint-mounted',['bunx','eslint','apps/wbs/be-01/src/controller/delete-step-parallel.controller.db.test.ts']),
 ('graph',['bunx','nx','show','project','wbs-core','--json']),
]
receipts=[]
for name,argv in checks:
 if len(sys.argv)>1 and name not in sys.argv[1:]: continue
 with (evidence/(name+'.txt')).open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py',*argv],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900','NX_DAEMON':'false'},stdout=log,stderr=subprocess.STDOUT)
 receipts.append({'check':name,'argv':argv,'capMiB':900,'exitCode':completed.returncode})
 (evidence/('checks-'+('-'.join(sys.argv[1:]) or 'all')+'.json')).write_text(json.dumps(receipts,indent=2)+'\n')
 print(json.dumps(receipts[-1]),flush=True)
 if completed.returncode: sys.exit(completed.returncode)
