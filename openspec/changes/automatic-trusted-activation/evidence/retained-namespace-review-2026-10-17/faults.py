from pathlib import Path
import subprocess,json,sys
source=Path('apps/twilight-structure/twilight-dash/cli/src/activation/review-namespace.ts')
evidence=Path('openspec/changes/automatic-trusted-activation/evidence/retained-namespace-review-2026-10-17')
guard=Path('openspec/changes/automatic-trusted-activation/evidence/retained-namespace-2026-10-17/rss-guard.py')
original=source.read_text()
trials=[
 ('recipe-pin','      namespacePolicyIdentity,',"      namespacePolicyIdentity: '0'.repeat(64),"),
 ('recipe-field','  runtimeMountPrefix: CandidateRoot,\n  workingDirectory: CandidateRoot,','  runtimeMountPrefix: CandidateRoot,'),
 ('freeze-policy','const NamespacePolicy = Object.freeze({','const NamespacePolicy = ({'),
 ('freeze-policy-candidate-components',"Object.freeze(['.git', 'node_modules'])","['.git', 'node_modules']"),
 ('freeze-policy-runtime-components',"Object.freeze(['.git'])","['.git']"),
 ('freeze-policy-modes',"Object.freeze(['100644', '100755', '120000'])","['100644', '100755', '120000']"),
]
records=[]
try:
 for name,old,new in trials:
  if original.count(old)!=1:raise Exception((name,'ambiguous needle',original.count(old)))
  source.write_text(original.replace(old,new))
  log=evidence/(name+'.log')
  subprocess.run([sys.executable,str(guard),str(log),'bun','--smol','test','apps/twilight-structure/twilight-dash/cli/src/activation/review-namespace.test.ts','-t','binds emitted namespace pin'],check=False)
  source.write_text(original)
  receipt=json.loads(Path(str(log)+'.json').read_text());body=log.read_text()
  if receipt['exitCode']!=1 or '(fail) binds emitted namespace pin' not in body:raise Exception((name,'not named assertion RED',receipt))
  if name=='recipe-pin' and '6181ca6a60a1af7563b1b877a5123b80d0047cb841be24ad0368091abd0e68ec' not in body:raise Exception('literal digest assertion was not reached')
  records.append({'fault':name,'needle':old,'replacement':new,**receipt,'namedFailures':[line for line in body.splitlines() if line.startswith('(fail)')]})
finally:
 source.write_text(original)
 (evidence/'faults.json').write_text(json.dumps(records,indent=2)+'\n')
