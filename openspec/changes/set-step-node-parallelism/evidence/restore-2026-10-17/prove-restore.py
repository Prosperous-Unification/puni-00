from pathlib import Path
import subprocess, os, json
repo=Path.cwd()
path=repo/'libs/wbs/application/core/src/module/work-item/work-item.resource.ts'
original=path.read_text()
start=original.index('  private async applyRestore(\n')
a=original.index('    if (root.parentId !== null) {',start)
b=original.index('    if (command.deletionState !== undefined) {',a)
guard=original[a:b]
mode=os.environ['RESTORE_FAULT']
pattern=''
if mode=='omit':
    changed=original[:a]+original[b:]; pattern='(redo-create|undo-delete) destination'
elif mode=='overbroad':
    changed=original[:a]+guard.replace('listByWorkItems(projectId, [root.parentId])','listByProject(projectId)')+original[b:]; pattern='unrelated sparse'
elif mode=='catch':
    changed=original[:a]+'    try {\n'+guard+'    } catch { return { ok: false, detail: "swallowed trusted evidence" }; }\n'+original[b:]; pattern='(throw|corrupt) sparse'
elif mode=='parent-skip':
    changed=original[:a]+guard.replace('if (root.parentId !== null)', 'if (root.parentId !== null && !rows.some((row) => row.parentId === root.parentId))')+original[b:]; pattern='parent sparse'
elif mode=='null-read':
    changed=original[:a]+guard.replace('if (root.parentId !== null)', 'if (true)')+original[b:]; pattern='root sparse'
elif mode=='early':
    changed=original[:a]+original[b:]
    point=changed.rindex('    if (command.deletionState !== undefined) {',start,a)
    changed=changed[:point]+guard+changed[point:]; pattern='undo-delete blockage'
elif mode=='nested-omit':
    changed=original[:a]+original[b:]; pattern='nonnull-parent redo-duplicate destination'
elif mode=='source-reread':
    changed=original[:a]+'    await this.opts.stepParallels.listByWorkItems(projectId, rows.map((row) => row.id));\n'+original[a:]; pattern='nonnull-parent redo-duplicate source'
elif mode=='late-clear':
    changed=original[:a]+original[b:]
    point=changed.index('    await this.opts.subtrees.insertSubtree(',a)
    changed=changed[:point]+guard+changed[point:]; pattern='captured-blockage sparse'
elif mode=='late':
    changed=original[:a]+original[b:]
    point=changed.index('    if (command.deletionState !== undefined) {\n      // Proof:',a)
    changed=changed[:point]+guard+changed[point:]; pattern='destination sparse'
else: raise RuntimeError(mode)
log=Path('/tmp/restore-fault-'+mode+'-20261017.txt')
try:
    path.write_text(changed)
    with log.open('w') as stream:
        receipt=subprocess.run(['python3','/tmp/runtime-rss-guard.py','bun','test','apps/wbs/be-01/src/controller/restore-step-parallel.controller.db.test.ts','--test-name-pattern',pattern],cwd=repo,stdout=stream,stderr=subprocess.STDOUT,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'900'})
    print(json.dumps({'fault':mode,'exit':receipt.returncode,'log':str(log)}))
    if receipt.returncode != 1: raise RuntimeError('fault did not produce expected test failure')
finally:
    path.write_text(original)
