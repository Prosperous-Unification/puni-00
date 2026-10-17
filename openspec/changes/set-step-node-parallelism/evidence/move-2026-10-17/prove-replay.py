import hashlib,json,os,subprocess
from pathlib import Path
root=Path.cwd()
evidence=Path(__file__).resolve().parent
service=root/'libs/wbs/application/core/src/module/work-item/work-item.resource.ts'
original=service.read_text()
moveStart=original.index('  async move(')
guardStart=original.index('    if (input.parentId !== null) {\n      const parallels',moveStart)
guardEnd=original.index('    // Where it was',guardStart)
forward=original[guardStart:guardEnd]
without=original[:guardStart]+original[guardEnd:]
stamp='    const stamp = this.clock.stampFor(actorId);\n'
stampAt=without.index(stamp,moveStart)+len(stamp)
replayStart=original.index('    if (parentId !== null) {\n      const parallels',original.index('  private async applyMove('))
replayEnd=original.index('    const group =',replayStart)
replay=original[replayStart:replayEnd]
faults=[
 ('late-forward',without[:stampAt]+forward+without[stampAt:],'libs/wbs/application/core/src/module/work-item/move-step-parallel.test.ts','retained pairs'),
 ('replay-catch-stale',original[:replayStart]+'    try {\n'+replay+"    } catch { return { ok: false, detail: 'sparse read failed' }; }\n"+original[replayEnd:],'apps/wbs/be-01/src/controller/move-step-parallel.controller.db.test.ts','preserves history on'),
]
receipts=[]
try:
 for name,mutated,test,pattern in faults:
  service.write_text(mutated)
  argv=['python3','/tmp/runtime-rss-guard.py','bun','test',test,'--test-name-pattern',pattern]
  with (evidence/('fault-'+name+'.txt')).open('w') as log:
   completed=subprocess.run(argv,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'},stdout=log,stderr=subprocess.STDOUT)
  output=(evidence/('fault-'+name+'.txt')).read_text()
  receipts.append({'fault':name,'argv':argv,'exitCode':completed.returncode,'assertionFailed':'error: expect(' in output,'log':'fault-'+name+'.txt'})
  (evidence/'replay-fault-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
  if completed.returncode!=1 or not receipts[-1]['assertionFailed']: raise RuntimeError('fault did not produce assertion failure: '+name)
finally:
 service.write_text(original)
 (evidence/'replay-restoration.json').write_text(json.dumps({'path':str(service.relative_to(root)),'sha256':hashlib.sha256(service.read_bytes()).hexdigest(),'restored':service.read_text()==original},indent=2)+'\n')
