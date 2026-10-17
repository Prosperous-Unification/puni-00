from pathlib import Path
exec(Path('/tmp/duplicate-mutations.py').read_text().split('mutations={')[0].replace('from pathlib import Path','from pathlib import Path'))

bindings=Path('libs/wbs/application/core/src/module/plan-commands/command-bindings.ts');bindings_base=bindings.read_text()
folder=Path('openspec/changes/set-step-node-parallelism/evidence/duplicate-2026-10-17')
mutations={
 'reversed-order': (resource, base, head+guard.replace('nodes: parallels.map(', 'nodes: [...parallels].reverse().map(')+tail),
 'late-writes': (resource, base, (head+tail).replace('    return { ok: true, value: { id: copyOf(id) } };', guard+'\n    return { ok: true, value: { id: copyOf(id) } };',1)),
 'shared-detail': (bindings, bindings_base, bindings_base.replace('detail: { nodes: outcome.nodes.map(({ workItemId, stepId }) => ({ workItemId, stepId })) },','detail: { nodes: [] },',1)),
}
summary=json.loads((folder/'mutations.json').read_text())
for name,(path,original,mutant) in mutations.items():
 try:
  path.write_text(mutant)
  with (folder/f'mutation-{name}.txt').open('w') as log:
   completed=subprocess.run(['python3','/tmp/runtime-rss-guard.py','/home/df/.bun/bin/bun','test','libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts','apps/wbs/be-01/src/controller/duplicate-step-parallel.controller.db.test.ts'],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'})
  summary.append({'fault':name,'exit':completed.returncode});print(name,completed.returncode,flush=True)
  if completed.returncode !=1: raise RuntimeError(f'{name} unexpected exit')
 finally: path.write_text(original)
(folder/'mutations.json').write_text(json.dumps(summary,indent=2)+'\n')
