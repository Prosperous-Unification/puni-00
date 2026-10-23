from pathlib import Path
import os,subprocess,json,hashlib
repo=Path.cwd()
source=repo/'libs/wbs/adapters/store-sqlite/src/optimization-drain.ts'
uow=repo/'libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.ts'
original=source.read_text();uow_original=uow.read_text()
a=original.index('    const parallels = tx\n');b=original.index('    const ownedWorkItems = tx',a);guard=original[a:b]
fault=os.environ['PROJECT_DRAIN_FAULT'];modified=original;modified_uow=uow_original
pattern='';suite='libs/wbs/adapters/store-sqlite/src/optimization-drain-step-parallel.db.test.ts'
if fault=='omit':
 modified=original[:a]+original[b:];pattern='finish throws on (target-owner-foreign-step|foreign-owner-target-step|missing-owner|missing-step|parent|zero|fraction|too-large|absent|unreadable|cleanup-order)'
elif fault=='owner-only':
 modified=original[:a]+guard.replace('or(eq(workItem.projectId, projectId), eq(step.projectId, projectId))','eq(workItem.projectId, projectId)')+original[b:];pattern='finish throws on (foreign-owner-target-step|missing-owner)'
elif fault=='step-only':
 modified=original[:a]+guard.replace('or(eq(workItem.projectId, projectId), eq(step.projectId, projectId))','eq(step.projectId, projectId)')+original[b:];pattern='finish throws on (target-owner-foreign-step|missing-step)'
elif fault=='inner-owner':
 modified=original[:a]+guard.replace('.leftJoin(workItem,','.innerJoin(workItem,')+original[b:];pattern='finish throws on missing-owner'
elif fault=='inner-step':
 modified=original[:a]+guard.replace('.leftJoin(step,','.innerJoin(step,')+original[b:];pattern='finish throws on missing-step'
elif fault=='omit-owner-reference':
 modified=original[:a]+guard.replace("      if (parallel.ownerProject === null)\n        throw new Error('step parallelism has an invalid work-item reference');\n",'')+original[b:];pattern='finish throws on missing-owner'
elif fault=='omit-step-reference':
 modified=original[:a]+guard.replace("      if (parallel.stepProject === null)\n        throw new Error('step parallelism has an invalid step reference');\n",'')+original[b:];pattern='finish throws on missing-step'
elif fault=='omit-owner-project':
 modified=original[:a]+guard.replace('parallel.ownerProject !== projectId || parallel.stepProject !== projectId','parallel.stepProject !== projectId')+original[b:];pattern='finish throws on foreign-owner-target-step'
elif fault=='omit-step-project':
 modified=original[:a]+guard.replace('parallel.ownerProject !== projectId || parallel.stepProject !== projectId','parallel.ownerProject !== projectId')+original[b:];pattern='finish throws on target-owner-foreign-step'
elif fault=='omit-leaf':
 modified=original[:a]+guard.replace("      if (parallel.hasChildren !== 0) throw new Error('step parallelism owner is not a leaf');\n",'')+original[b:];pattern='finish throws on parent'
elif fault=='omit-range':
 modified=original[:a]+guard.replace('      assertStepParallel(parallel.maxParallel);\n','')+original[b:];pattern='finish throws on (zero|fraction|too-large)'
elif fault=='required-read-default':
 revised=guard.replace('const parallels = tx','const parallels = (() => { try { return tx',1).replace('      .all();','      .all(); } catch { return []; } })();',1)
 modified=original[:a]+revised+original[b:];pattern='finish throws on (absent|unreadable)'
elif fault=='late-cleanup':
 modified=original[:a]+original[b:];point=modified.index('    tx.delete(projectAccess)',a);modified=modified[:point]+guard+modified[point:];pattern='finish throws on cleanup-order'
elif fault=='early-waiting':
 modified=original[:a]+original[b:];point=modified.index('    if (outstanding() > 0)');modified=modified[:point]+guard+modified[point:];pattern='waiting keeps existing'
elif fault=='early-typed':
 modified=original[:a]+original[b:];point=modified.index('    const foreignTyped = tx');modified=modified[:point]+guard+modified[point:];pattern='typed-dependency-refusal keeps existing'
elif fault=='overbroad':
 modified=original[:a]+guard.replace('      .where(or(eq(workItem.projectId, projectId), eq(step.projectId, projectId)))\n','')+original[b:];pattern='finish keeps nonincident corrupt'
elif fault=='release-commit':
 start=original.index('export function releaseSolverSlot(');end=original.index('\n/** How long',start);release=original[start:end]
 release=release.replace('  return db.transaction((tx) => {','  const released = db.transaction((tx) => {',1)
 old='''    return {
      released,
      retirement: finishDrainIn(tx, slot.projectId, slot.contractVersion),
      deletion: finishDrainIn(tx, slot.projectId),
    };
  });'''
 new='''    return released;
  });
  return {
    released,
    retirement: finishOptimizationDrain(db, slot.projectId, slot.contractVersion),
    deletion: finishOptimizationDrain(db, slot.projectId),
  };'''
 assert old in release;release=release.replace(old,new);modified=original[:start]+release+original[end:];pattern='last-release throws on zero'
elif fault=='reclaim-commit':
 start=original.index('export function reclaimExpiredSolverSlotsIn(');point=original.index('  tx.delete(solverSlot).where(expiring).run();',start)+len('  tx.delete(solverSlot).where(expiring).run();');modified=original[:point]+"\n  tx.run(sql.raw('COMMIT'));\n  tx.run(sql.raw('BEGIN'));"+original[point:];pattern='expired-reclaim throws on zero'
elif fault=='outer-commit':
 modified_uow=uow_original.replace("            db.run(sql.raw('ROLLBACK'));", "            db.run(sql.raw('COMMIT'));",1);suite='apps/wbs/be-01/src/services.db.test.ts';pattern='installed project drain sparse policy rollback'
else: raise RuntimeError(fault)
assert modified!=original or modified_uow!=uow_original
log=Path('/tmp/project-drain-fault-'+fault+'-20261017.txt')
try:
 source.write_text(modified);uow.write_text(modified_uow)
 with log.open('w') as stream:
  run=subprocess.run(['python3','/tmp/runtime-rss-guard.py','bun','test',suite,'--test-name-pattern',pattern],cwd=repo,stdout=stream,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'})
 print(json.dumps({'fault':fault,'exit':run.returncode,'log':str(log)}),flush=True)
 assert run.returncode==1
 assert '(fail)' in log.read_text()
finally:
 source.write_text(original);uow.write_text(uow_original)
 assert hashlib.sha256(source.read_bytes()).hexdigest()==hashlib.sha256(original.encode()).hexdigest()
 assert uow.read_text()==uow_original
