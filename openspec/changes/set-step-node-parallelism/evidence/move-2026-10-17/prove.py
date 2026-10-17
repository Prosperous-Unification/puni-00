import hashlib,json,os,subprocess
from pathlib import Path

root=Path.cwd()
evidence=Path(__file__).resolve().parent
service=root/'libs/wbs/application/core/src/module/work-item/work-item.resource.ts'
working=root/'libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts'
binding=root/'libs/wbs/application/core/src/module/plan-commands/command-bindings.ts'
original={path:path.read_text() for path in [service,working,binding]}
memory='libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts'
mounted='apps/wbs/be-01/src/controller/move-step-parallel.controller.db.test.ts'
forward='''    if (input.parentId !== null) {
      const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, [
        input.parentId,
      ]);
      if (parallels.length > 0) {
        return {
          ok: false,
          reason: 'referenced_by_step_parallel',
          nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
        };
      }
    }
'''
replay_start=original[service].index('    if (parentId !== null) {\n      const parallels',original[service].index('  private async applyMove('))
replay_end=original[service].index('    const group =',replay_start)
replay=original[service][replay_start:replay_end]
assert original[service].count(forward)==1
assert original[service].count(replay)==1
moves=original[service]
start=moves.index('  async move(')
end=moves.index('    // Where it was', start)
move_head=moves[start:end]
# Each injected fault must cause an assertion failure in the actual service or mounted path.
faults=[
 ('omit-forward',service,moves.replace(forward,''),memory,None),
 ('read-moving',service,moves.replace(forward,forward.replace('        input.parentId,','        id,')),memory,'retained pairs'),
 ('overbroad-forward',service,moves.replace(forward,forward.replace('[\n        input.parentId,\n      ]','rows.map((row) => row.id)')),memory,'retains moving subtree'),
 ('before-membership',service,moves.replace(move_head,move_head.replace(forward,'').replace('    // A frozen work item',forward+'\n    // A frozen work item')),memory,'checks authorization'),
 ('before-authorization',service,moves[:start]+moves[start:].replace('    const context = await this.contextFor(id, actorId);',"    const owner = await this.opts.workItems.findById(id);\n    if (owner !== null && input.parentId !== null) await this.opts.stepParallels.listByWorkItems(owner.projectId, [input.parentId]);\n    const context = await this.contextFor(id, actorId);",1),memory,'checks authorization'),
 ('swallow-read',service,moves.replace(forward,forward.replace('await this.opts.stepParallels.listByWorkItems(', 'await Promise.resolve().then(() => this.opts.stepParallels.listByWorkItems(').replace('      ]);','      ])).catch(() => []);')),memory,'poisoned reader'),
 ('skip-existing',service,moves.replace(forward,forward.replace('if (input.parentId !== null)', 'if (input.parentId !== null && !rows.some((row) => row.parentId === input.parentId))')),memory,'validates selected facts'),
 ('lose-nodes',service,moves.replace(forward,forward.replace('nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId }))','nodes: []')),mounted,'exact 409'),
 ('empty-admitted-reader',working,original[working].replace('return scope.stores.stepParallels.listByWorkItems(requestedProjectId, ids);','return Promise.resolve([]);'),memory,'reads the admitted sparse store'),
 ('omit-replay',service,moves.replace(replay,''),mounted,'newly retained destination'),
 ('overbroad-replay',service,moves.replace(replay,replay.replace('[parentId]','rows.map((row) => row.id)')),mounted,'preserves unrelated policy'),
]
receipts=[]
try:
 for name,path,mutated,test,pattern in faults:
  for target,source in original.items(): target.write_text(source)
  path.write_text(mutated)
  argv=['python3','/tmp/runtime-rss-guard.py','bun','test',test]
  if pattern: argv+=['--test-name-pattern',pattern]
  with (evidence/('fault-'+name+'.txt')).open('w') as log:
   completed=subprocess.run(argv,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'},stdout=log,stderr=subprocess.STDOUT)
  output=(evidence/('fault-'+name+'.txt')).read_text()
  receipts.append({'fault':name,'argv':argv,'exitCode':completed.returncode,'observedFailure': ('unexpected poisoned-reader rejection before modeled refusal' if name in ['before-membership','before-authorization'] and 'error: poisoned sparse read' in output else 'assertion failure' if 'error: expect(' in output or 'expected the production call to reject' in output else None),'log':'fault-'+name+'.txt'})
  (evidence/'fault-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
  if completed.returncode!=1 or not receipts[-1]['observedFailure']: raise RuntimeError('fault did not fail through expected assertion: '+name)
finally:
 for path,source in original.items(): path.write_text(source)
 (evidence/'restoration.json').write_text(json.dumps([{'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'restored':path.read_text()==source} for path,source in original.items()],indent=2)+'\n')
