from pathlib import Path
import subprocess,os,json
root=Path.cwd()
evidence=root/'openspec/changes/set-step-node-parallelism/evidence/first-child-2026-10-17'
path=root/'libs/wbs/application/core/src/module/work-item/work-item.resource.ts'
original=path.read_text()
try:
 path.write_text("import '@wbs/store-sqlite';\n"+original)
 argv=['python3',str(evidence/'rss-guard.py'),'bunx','eslint',str(path.relative_to(root))]
 with (evidence/'mutation-nx-boundary.txt').open('w') as log:
  completed=subprocess.run(argv,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'1280'},stdout=log,stderr=subprocess.STDOUT)
 output=(evidence/'mutation-nx-boundary.txt').read_text()
 receipt={'argv':argv,'exitCode':completed.returncode,'boundaryRuleReported':'@nx/enforce-module-boundaries' in output,'skipped':'rule will be skipped' in output}
 (evidence/'nx-boundary-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt))
 if completed.returncode in [0,137] or not receipt['boundaryRuleReported'] or receipt['skipped']: raise RuntimeError('Nx boundary negative did not qualify')
finally: path.write_text(original)
