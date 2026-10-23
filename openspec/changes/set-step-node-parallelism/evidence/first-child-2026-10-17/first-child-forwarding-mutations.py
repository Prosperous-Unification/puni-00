import json, os, subprocess
from pathlib import Path
root=Path.cwd()
evidence=root/'openspec/changes/set-step-node-parallelism/evidence/first-child-2026-10-17'
working=Path('libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts')
registry=Path('libs/wbs/domain/contracts/src/http/refusal.ts')
mounted='apps/wbs/be-01/src/controller/first-child-step-parallel.controller.db.test.ts'
types='libs/wbs/domain/contracts/src/http/refusal.test.ts'
def replace_sparse(source,before,after):
 start=source.index('    stepParallels: {')
 end=source.index('    dependencies: retainedDependencies,',start)
 fragment=source[start:end]
 if before not in fragment: raise RuntimeError(f'Target missing {before}')
 return source[:start]+fragment.replace(before,after,1)+source[end:]
faults=[
 ('list-project-guard',working,'assertProject(requestedProjectId);','',mounted),
 ('list-lifetime-guard',working,'assertProject(requestedProjectId);',"if (requestedProjectId !== projectId) throw new Error('cannot read project');",mounted),
 ('set-owner-guard',working,'await assertOwner(parallel.workItemId);','',mounted),
 ('remove-owner-guard',working,'await assertOwner(workItemId);','',mounted),
 ('set-refresh',working,'await refreshRows([parallel.workItemId]);','',mounted),
 ('remove-refresh',working,'await refreshRows([workItemId]);','',mounted),
 ('closed-command-registry',registry,"  | 'referenced_by_step_parallel'\n",'',types),
 ('optional-command-nodes',registry,"? { nodes: { workItemId: string; stepId: string }[] }","? { nodes?: { workItemId: string; stepId: string }[] }",types),
]
receipts=[]
for name,path,before,after,test in faults:
 original=(root/path).read_text()
 if path==working: changed=replace_sparse(original,before,after)
 else:
  if before not in original: raise RuntimeError(f'Target missing {name}')
  changed=original.replace(before,after,1)
 try:
  (root/path).write_text(changed)
  with (evidence/f'mutation-{name}.txt').open('w') as log:
   completed=subprocess.run(['python3',str(evidence/'rss-guard.py'),'bun','test',test],cwd=root,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'},stdout=log,stderr=subprocess.STDOUT)
  receipt={'fault':name,'exitCode':completed.returncode}
  receipts.append(receipt)
  print(json.dumps(receipt),flush=True)
  if completed.returncode in [0,137]: raise RuntimeError(f'Mutation not qualified: {name}')
 finally: (root/path).write_text(original)
(evidence/'forwarding-mutation-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
