from pathlib import Path
import subprocess,os,json
resource=Path('libs/wbs/application/core/src/module/work-item/work-item.resource.ts')
runner=Path('libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts')
base=resource.read_text(); runner_base=runner.read_text()
line='    const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, originals);'
start=base.index(line,base.index('  async duplicate(')); end=base.index('\n    const newIds',start)
guard=base[start:end]
head=base[:start];tail=base[end:]
mutations={
'omitted':head+tail,
'root-only':base.replace(line,line.replace('originals);','[id]);')),
'wrong-project':base.replace(line,line.replace('workItem.projectId','\'foreign\'')),
'broad-scope':base.replace(line,line.replace('originals);','rows.map((row) => row.id));')),
'leaves-only':base.replace(line,line.replace('originals);','originals.filter((ownerId) => !rows.some((row) => row.parentId === ownerId)));')),
'catch-default':base.replace(line,line.replace(';', '.catch(() => []);')),
'optional-default':base.replace(line,"    const parallels = await this.opts.stepParallels?.listByWorkItems(workItem.projectId, originals) ?? [];"),
'lost-detail':head+guard.replace('nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),','nodes: [],')+tail,
'alias':head+guard.replace('nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),',"nodes: parallels.map((parallel) => { Reflect.deleteProperty(parallel, 'maxParallel'); return parallel; }),")+tail,
'late-ids':head+tail.replace('    const newIds = new Map(originals.map((originalId) => [originalId, this.clock.newId()]));','    const newIds = new Map(originals.map((originalId) => [originalId, this.clock.newId()]));\n'+guard,1),
'early-stamp':head+'    this.clock.stampFor(actorId);\n'+guard+tail,
'early-reader':base.replace('    const context = await this.contextFor(id, actorId);\n    if (!context.ok) return context;\n    const { workItem, rows } = context.value;\n\n    // Ancestors-first,',"    await this.opts.stepParallels.listByWorkItems('p', [id]);\n    const context = await this.contextFor(id, actorId);\n    if (!context.ok) return context;\n    const { workItem, rows } = context.value;\n\n    // Ancestors-first,",1),
'early-size':head.replace("    if (originals.length > MAX_DUPLICATED_ROWS) return { ok: false, reason: 'too_large' };\n",'')+guard+"\n    if (originals.length > MAX_DUPLICATED_ROWS) return { ok: false, reason: 'too_large' };\n"+tail,
}
folder=Path('openspec/changes/set-step-node-parallelism/evidence/duplicate-2026-10-17')
summary=[]
try:
 for name,mutant in mutations.items():
  resource.write_text(mutant)
  with (folder/f'mutation-{name}.txt').open('w') as log:
   completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py','/home/df/.bun/bin/bun','test','libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts','apps/wbs/be-01/src/controller/duplicate-step-parallel.controller.db.test.ts'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'})
  summary.append({'fault':name,'exit':completed.returncode});print(name,completed.returncode,flush=True)
  if completed.returncode !=1: raise RuntimeError(f'{name} unexpected exit {completed.returncode}')
 resource.write_text(base)
 runner.write_text(runner_base.replace('const graph = workingPlan.services;', 'const graph = this.opts.publicServices;',1))
 with (folder/'mutation-public-scope.txt').open('w') as log:
  completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py','/home/df/.bun/bin/bun','test','libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts','--test-name-pattern','reads admitted sparse duplication'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'})
 summary.append({'fault':'public-scope','exit':completed.returncode});print('public-scope',completed.returncode,flush=True)
 if completed.returncode !=1: raise RuntimeError('public-scope survived')
finally:
 resource.write_text(base);runner.write_text(runner_base)
 (folder/'mutations.json').write_text(json.dumps(summary,indent=2)+'\n')
