import hashlib,json,os,subprocess,sys
from pathlib import Path

root=Path.cwd()
evidence=Path(__file__).resolve().parent
resource=Path('libs/wbs/application/core/src/module/work-item/work-item.resource.ts')
working=Path('libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts')
bindings=Path('libs/wbs/application/core/src/module/plan-commands/command-bindings.ts')
memory='libs/wbs/application/core/src/module/work-item/delete-step-parallel.test.ts'
mounted='apps/wbs/be-01/src/controller/delete-step-parallel.controller.db.test.ts'
originals={path:path.read_text() for path in [resource,working,bindings]}
source=originals[resource]
start=source.index('    const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, doomed);')
end=source.index('    // Before the branch rather',start)
forward=source[start:end]
start=source.index('    const parallels = await this.opts.stepParallels.listByWorkItems(projectId, command.remove);')
end=source.index('    await this.opts.dependencies.removeAllFor(command.remove, stamp);',start)
replay=source[start:end]

def replace_once(text,before,after):
    if text.count(before)!=1: raise RuntimeError('mutation anchor is not unique: '+before)
    return text.replace(before,after)

def mutate_resource(before,after):
    return resource,replace_once(source,before,after)

faults={
 'forward-omitted': (*mutate_resource(forward,''),memory,'refuses leaf'),
 'forward-root-only': (*mutate_resource('listByWorkItems(workItem.projectId, doomed)','listByWorkItems(workItem.projectId, [id])'),memory,'cascade descendant'),
 'forward-wrong-owner': (*mutate_resource('listByWorkItems(workItem.projectId, doomed)',"listByWorkItems(workItem.projectId, ['moving'])"),memory,'refuses leaf'),
 'forward-wrong-project': (*mutate_resource('listByWorkItems(workItem.projectId, doomed)',"listByWorkItems('missing-project', doomed)"),memory,'refuses leaf'),
 'forward-overbroad': (*mutate_resource('listByWorkItems(workItem.projectId, doomed)','listByWorkItems(workItem.projectId, rows.map((row) => row.id))'),memory,'cascade descendant'),
 'forward-before-auth': (*mutate_resource('''    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    const children = rows''','''    await this.opts.stepParallels.listByWorkItems('p', [id]);
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    const children = rows'''),memory,'required strategy precedence'),
 'forward-before-strategy': (*mutate_resource("    if (children.length > 0 && strategy === null) return { ok: false, reason: 'strategy_required' };", "    await this.opts.stepParallels.listByWorkItems(workItem.projectId, [id]);\n    if (children.length > 0 && strategy === null) return { ok: false, reason: 'strategy_required' };"),memory,'required strategy precedence'),
 'forward-late': (resource,replace_once(replace_once(source,forward,''),'      await this.opts.workItems.remove(doomed, [], stamp);',forward+'      await this.opts.workItems.remove(doomed, [], stamp);'),memory,'refuses leaf'),
 'forward-swallowed': (*mutate_resource('    const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, doomed);', '''    let parallels;
    try { parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, doomed); }
    catch { parallels = []; }'''),memory,'trusted|unavailable|absent|required strategy precedence'),
 'forward-unconditional': (*mutate_resource(forward,forward.replace('if (parallels.length > 0)','if (true)')),memory,'cascade descendant|cleared'),
 'forward-detail-loss': (*mutate_resource(forward,forward.replace('parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId }))','[]')),memory,'detached exact'),
 'forward-aliased-nodes': (*mutate_resource(forward,forward.replace('parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId }))','parallels.map((fact) => ({ get workItemId() { return fact.workItemId; }, get stepId() { return fact.stepId; } }))')),memory,'detached exact'),
 'admitted-empty': (working,replace_once(originals[working],'return scope.stores.stepParallels.listByWorkItems(requestedProjectId, ids);','return Promise.resolve([]);'),memory,'admitted sparse deletion'),
 'http-detail-loss': (bindings,replace_once(originals[bindings],'detail: { nodes: outcome.nodes.map(({ workItemId, stepId }) => ({ workItemId, stepId })) }','detail: { nodes: [] }'),mounted,'through single'),
 'replay-omitted': (*mutate_resource(replay,''),mounted,'owned sparse'),
 'replay-root-only': (*mutate_resource('this.opts.stepParallels.listByWorkItems(projectId, command.remove)','this.opts.stepParallels.listByWorkItems(projectId, [command.rootId])'),mounted,'redo-cascade owned'),
 'replay-operation-restricted': (*mutate_resource(replay,'    if (command.deletionState !== undefined) {\n'+replay+'    }\n'),mounted,'undo-create owned|undo-duplicate owned'),
 'replay-overbroad': (*mutate_resource('this.opts.stepParallels.listByWorkItems(projectId, command.remove)','this.opts.stepParallels.listByWorkItems(projectId, rows.map((row) => row.id))'),mounted,'unrelated sparse|promote delete'),
 'replay-swallowed': (*mutate_resource(replay,'    try {\n'+replay+'''    } catch { return { ok: false, detail: 'sparse evidence unavailable' }; }
'''),mounted,'throw sparse|corrupt sparse'),
 'replay-late': (resource,replace_once(replace_once(source,replay,''),'    await this.opts.workItems.remove(command.remove, command.reparented, stamp);','    await this.opts.workItems.remove(command.remove, command.reparented, stamp);\n'+replay),mounted,'owned sparse'),
}
receipts=[]
try:
 for name,(path,mutant,test,pattern) in faults.items():
    if len(sys.argv)>1 and name not in sys.argv[1:]: continue
    path.write_text(mutant)
    argv=['/home/df/.bun/bin/bun','test',test,'--test-name-pattern',pattern]
    with (evidence/('mutation-'+name+'.txt')).open('w') as log:
      completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py',*argv],env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'},stdout=log,stderr=subprocess.STDOUT)
    transcript=(evidence/('mutation-'+name+'.txt')).read_text()
    receipt={'fault':name,'path':str(path),'argv':argv,'exitCode':completed.returncode,'originalSha256':hashlib.sha256(originals[path].encode()).hexdigest(),'mutantSha256':hashlib.sha256(mutant.encode()).hexdigest(),'assertionObserved':'expect(received)' in transcript or 'expected the production call to reject' in transcript or 'delete sparse reader unavailable' in transcript}
    path.write_text(originals[path])
    receipt['restoredSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    receipts.append(receipt)
    (evidence/('mutation-receipts-'+('-'.join(sys.argv[1:]) or 'all')+'.json')).write_text(json.dumps(receipts,indent=2)+'\n')
    print(json.dumps(receipt),flush=True)
    if completed.returncode!=1 or not receipt['assertionObserved']: raise RuntimeError('fault did not fail its intended test: '+name)
finally:
 for path,original in originals.items(): path.write_text(original)
