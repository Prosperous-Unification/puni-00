from pathlib import Path
import subprocess, json, os
root=Path(__file__).resolve().parents[5]
service='libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts'
service_test='libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts'
chain='libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts'
chain_test='libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts'
route='libs/wbs/application/core/src/http/project.routes.ts'
mounted='apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts'
race='apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts'
folder=root/'openspec/changes/set-step-node-parallelism/evidence/export-fence-2026-10-17/replayed'
folder.mkdir(exist_ok=True)
guard=root/'openspec/changes/set-step-node-parallelism/evidence/saved-plan-2026-10-17/rss-guard.py'
faults=[]
def add(name,path,old,new,test=service_test,pattern='v9'):
 faults.append((name,path,old,new,test,pattern))
add('refusal',service,"    if (reads.stepParallels.length > 0) return { ok: false, error: 'unsupported_step_parallelism' };",'',mounted,'v9 sparse export fence')
add('legacy-read-empty',service,'this.options.stepParallels.listByProject(project.id)','Promise.resolve([])',mounted,'v9 sparse export fence.*isolated')
add('legacy-wrong-project',service,'this.options.stepParallels.listByProject(project.id)',"this.options.stepParallels.listByProject('wrong-project')",mounted,'v9 sparse export fence.*isolated')
add('capture-empty',chain,'new StepParallelRepository(db, OPEN).listByProject(projectId)','Promise.resolve([])',mounted,'v9 sparse export fence.*shared')
add('capture-missing',chain,'stepParallels: stepParallels.map(({ workItemId, stepId, maxParallel }) => ({','omittedStepParallels: stepParallels.map(({ workItemId, stepId, maxParallel }) => ({',mounted,'v9 sparse export fence.*shared')
add('capture-alias',chain,'''stepParallels: stepParallels.map(({ workItemId, stepId, maxParallel }) => ({
              workItemId,
              stepId,
              maxParallel,
            }))''','stepParallels',chain_test,'copies sparse adapter')
add('post-snapshot-reread',route,'''            captured.document,
''','''            { ...captured.document, stepParallels: await stepParallels.listByProject(params.id) },
''',race,'v9 sparse export uses')
add('required-reader',service,"    const reader: unknown = Reflect.get(options, 'stepParallels');\n    if (\n      typeof reader !== 'object' ||\n      reader === null ||\n      typeof Reflect.get(reader, 'listByProject') !== 'function'\n    )\n      throw new Error('plan export requires a step parallelism reader');",'',pattern='v9 refuses construction')
add('collection',service,"  if (!Array.isArray(held)) throw new Error('export was read without step parallelism');",'',pattern='v9 refuses corrupt captured')
add('row',service,"    if (typeof fact !== 'object' || fact === null || Array.isArray(fact))\n      throw new Error('malformed step parallelism');",'',pattern='v9 refuses corrupt captured')
add('ids',service,"    if (typeof workItemId !== 'string' || typeof stepId !== 'string' || typeof maximum !== 'number')\n      throw new Error('malformed step parallelism');",'',pattern='v9 refuses corrupt captured')
add('maximum',service,'    assertStepParallel(maximum);','',pattern='v9 refuses corrupt captured')
add('owner-existence',service,"    if (owner === undefined) throw new Error('step parallelism names an unknown work item');",'',pattern='v9 refuses corrupt captured')
add('owner-project',service,"    if (owner.projectId !== project.id)\n      throw new Error('step parallelism names a foreign work item');",'',pattern='v9 refuses sparse ownership')
add('step-existence',service,"    if (step === undefined) throw new Error('step parallelism names an unknown step');",'',pattern='v9 refuses corrupt captured')
add('step-project',service,"    if (step.projectId !== project.id) throw new Error('step parallelism names a foreign step');",'',pattern='v9 refuses sparse ownership')
add('leaf',service,"    if (parents.has(workItemId)) throw new Error('step parallelism names a parent work item');",'',pattern='v9 refuses sparse ownership')
add('duplicate',service,"    if (seen?.has(stepId)) throw new Error('duplicate step parallelism');",'',pattern='v9 refuses corrupt captured')
# Break each route mapping independently without bypassing response validation.
body="                  : { error: exported.error },"
add('shared-mapping',route,body,"                  : { error: 'uncoded_steps' },",mounted,'v9 sparse export fence.*shared')
body2="\n                : { error: exported.error },"
add('isolated-mapping',route,body2,"\n                : { error: 'uncoded_steps' },",mounted,'v9 sparse export fence.*isolated')
add('response-schema','libs/wbs/domain/contracts/src/http/project-shapes.ts',"      .or({ error: \"'unsupported_step_parallelism'\" })",'',mounted,'v9 sparse export fence')
add('registry','libs/wbs/domain/contracts/src/http/refusal.ts',"  | 'unsupported_step_parallelism'\n",'','libs/wbs/domain/contracts/src/http/refusal.test.ts','compiler enforces closed')
selected=set(os.environ.get('FAULTS','').split(',')) if os.environ.get('FAULTS') else None
receipts=[]
for name,path,old,new,test,pattern in faults:
 if selected and name not in selected: continue
 file=root/path
 original=file.read_text()
 if original.count(old)!=1: raise RuntimeError(f'{name}: expected one target, got {original.count(old)}')
 try:
  file.write_text(original.replace(old,new))
  with (folder/f'mutation-{name}.txt').open('w') as log:
   status=subprocess.call(['python3',str(guard),'bun','test',test,'--test-name-pattern',pattern],cwd=root,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900','NODE_OPTIONS':'--max-old-space-size=576'})
  receipt={'fault':name,'exitCode':status,'test':test,'pattern':pattern}
  receipts.append(receipt)
  print(json.dumps(receipt),flush=True)
  if status!=1: raise RuntimeError(f'{name} did not fail exactly as an assertion/compiler test')
 finally: file.write_text(original)
(folder/'mutation-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
