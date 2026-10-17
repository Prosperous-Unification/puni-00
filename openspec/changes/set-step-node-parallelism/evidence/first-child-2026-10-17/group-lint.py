from pathlib import Path
import subprocess,os,json
root=Path.cwd()
evidence=root/'openspec/changes/set-step-node-parallelism/evidence/first-child-2026-10-17'
paths=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
paths=sorted({p for p in paths if p.endswith('.ts')})
groups={}
for path in paths:
 config=next(parent/'tsconfig.json' for parent in (root/path).parents if (parent/'tsconfig.json').exists())
 groups.setdefault(str(config.relative_to(root)),[]).append(path)
receipts=[]
def lint(paths,label):
 argv=['python3',str(evidence/'rss-guard.py'),'bunx','eslint',*paths,'--fix']
 logpath=evidence/f'lint-final-{label}.txt'
 with logpath.open('w') as log:
  completed=subprocess.run(argv,env={**os.environ,'RUNTIME_CLOSURE_RSS_MIB':'1280'},stdout=log,stderr=subprocess.STDOUT)
 receipt={'argv':argv,'paths':paths,'exitCode':completed.returncode,'log':str(logpath.relative_to(root))}
 receipts.append(receipt)
 (evidence/'lint-final-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 print(json.dumps(receipt),flush=True)
 return completed.returncode
for index,(config,paths) in enumerate(groups.items()):
 code=lint(paths,str(index))
 if code==137 and len(paths)>1:
  for part,path in enumerate(paths):
   code=lint([path],f'{index}-{part}')
   if code: raise RuntimeError(f'Lint failed {path}')
 elif code: raise RuntimeError(f'Lint failed {config}')
