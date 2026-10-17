from pathlib import Path
import subprocess,json
root=Path.cwd()
source=root/'libs/wbs/domain/domain/src/step-parallel.ts'
evidence=root/'openspec/changes/set-step-node-parallelism/evidence/resolver-2026-10-17'
original=source.read_text()
faults={
'override-ignored':("if (override === undefined)","if (true)"),
'equality-collapse':("if (override === undefined)","if (override === undefined || override.maxParallel === rowMaximum)"),
'work-item-guard':("if (override.workItemId !== node.workItemId)","if (false)"),
'step-guard':("if (override.stepId !== node.stepId)","if (false)"),
'row-validation':("  assertStepParallel(rowMaximum);", ""),
'override-validation':("  assertStepParallel(override.maxParallel);", ""),
'mutable-boundary':("return { kind: 'explicit', maxParallel: override.maxParallel };", "return { kind: 'explicit', get maxParallel() { return override.maxParallel; } };"),
}
receipts=[]
try:
 for name,(before,after) in faults.items():
  assert original.count(before)==1,name
  source.write_text(original.replace(before,after))
  with (evidence/(name+'.txt')).open('w') as transcript:
   completed=subprocess.run(['python3',str(evidence/'rss-guard.py'),'bun','test','libs/wbs/domain/domain/src/step-parallel.test.ts'],cwd=root,stdout=transcript,stderr=subprocess.STDOUT)
  receipts.append({'fault':name,'exitCode':completed.returncode,'transcript':name+'.txt'})
  if completed.returncode!=1: raise RuntimeError(f'{name}: expected failing test exit 1, received {completed.returncode}')
finally:
 source.write_text(original)
(evidence/'mutation-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps(receipts,indent=2))
