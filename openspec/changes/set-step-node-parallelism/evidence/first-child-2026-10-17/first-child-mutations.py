import json, os, subprocess
from pathlib import Path
root=Path.cwd()
evidence=root/'openspec/changes/set-step-node-parallelism/evidence/first-child-2026-10-17'
resource=Path('libs/wbs/application/core/src/module/work-item/work-item.resource.ts')
service='libs/wbs/application/core/src/module/work-item/first-child-step-parallel.test.ts'
mounted='apps/wbs/be-01/src/controller/first-child-step-parallel.controller.db.test.ts'
source=(root/resource).read_text()
start=source.index('    if (input.parentId !== null) {\n      // Proof: omitting this read/refusal')
end=source.index('    const placed =',start)
guard=source[start:end]
faults=[
 ('omitted-guard',resource,guard,'',service),
 ('wrong-parent',resource,'listByWorkItems(projectId, [input.parentId])',"listByWorkItems(projectId, ['sibling'])",service),
 ('wrong-project',resource,'listByWorkItems(projectId, [input.parentId])',"listByWorkItems('foreign', [input.parentId])",service),
 ('project-wide',resource,'listByWorkItems(projectId, [input.parentId])','listByWorkItems(projectId, rows.map((row) => row.id))',service),
 ('unconditional',resource,'if (parallels.length > 0)', 'if (parallels.length >= 0)',service),
 ('aliased-nodes',resource,'nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId }))','nodes: parallels',service),
 ('late-guard',resource,guard,'',service),
 ('dropped-command-detail',Path('libs/wbs/application/core/src/module/plan-commands/command-bindings.ts'),"detail: { nodes: outcome.nodes.map(({ workItemId, stepId }) => ({ workItemId, stepId })) }",'detail: { nodes: [] }',mounted),
 ('dropped-http-detail',Path('libs/wbs/application/core/src/http/work-item.routes.ts'),"    case 'referenced_by_step_parallel':\n", "    case 'referenced_by_step_parallel':\n      return { ok: false, status: 409, body: { ...context, error: outcome.reason } };\n",mounted),
 ('missing-409-schema',Path('libs/wbs/domain/contracts/src/http/work-item-shapes.ts'),"        type({\n          ...context,\n          error: \"'referenced_by_step_parallel'\",\n          nodes: type({ workItemId: 'string', stepId: 'string' }).array(),\n        }),\n",'',mounted),
 ('stale-scope',Path('libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts'),'return scope.stores.stepParallels.listByWorkItems(requestedProjectId, ids);','return Promise.resolve([]);',service),
 ('unscoped-read',Path('libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts'),'        assertProject(requestedProjectId);\n        return scope.stores.stepParallels.listByWorkItems(requestedProjectId, ids);','        return scope.stores.stepParallels.listByWorkItems(requestedProjectId, ids);',service),
]
receipts=[]
for name,path,before,after,test in faults:
 original=(root/path).read_text()
 if before not in original: raise RuntimeError(f'Mutation target missing: {name}')
 changed=original.replace(before,after,1)
 if name=='late-guard': changed=changed.replace('    const blockedHandedDown =',guard+'    const blockedHandedDown =',1)
 try:
  (root/path).write_text(changed)
  with (evidence/f'mutation-{name}.txt').open('w') as log:
   completed=subprocess.run(['python3',str(evidence/'rss-guard.py'),'bun','test',test],cwd=root,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'},stdout=log,stderr=subprocess.STDOUT)
  receipt={'fault':name,'exitCode':completed.returncode}
  receipts.append(receipt)
  print(json.dumps(receipt),flush=True)
  if completed.returncode==0: raise RuntimeError(f'Mutation survived: {name}')
 finally: (root/path).write_text(original)
(evidence/'mutation-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
