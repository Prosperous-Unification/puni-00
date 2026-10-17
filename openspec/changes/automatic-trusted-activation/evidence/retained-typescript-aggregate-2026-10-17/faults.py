from pathlib import Path
import subprocess,json,sys
folder=Path(__file__).parent
trials=json.loads((folder/'trials.json').read_text())
originals={trial['file']:Path(trial['file']).read_text() for trial in trials}
records=json.loads((folder/'faults.json').read_text()) if (folder/'faults.json').exists() else []
finished={record['name'] for record in records if record['exitCode']==1 and record['namedFailures']}
try:
 for trial in trials:
  if trial['name'] in finished:continue
  source=Path(trial['file']);original=originals[trial['file']]
  if original.count(trial['old'])!=1:raise Exception((trial['name'],'ambiguous needle',original.count(trial['old'])))
  source.write_text(original.replace(trial['old'],trial['new']))
  log=folder/(trial['name']+'.log')
  subprocess.run([sys.executable,str(folder/'rss-guard.py'),str(log),'bun','--smol','test','apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-source.test.ts','-t',trial['test']],check=False)
  source.write_text(original)
  receipt=json.loads(Path(str(log)+'.json').read_text());body=log.read_text()
  failures=[line for line in body.splitlines() if line.startswith('(fail)')]
  record={**trial,**receipt,'namedFailures':failures}
  records.append(record)
  print(trial['name'], 'NAMED RED' if receipt['exitCode']==1 and failures else 'NOT PROVEN',flush=True)
finally:
 for file,original in originals.items():Path(file).write_text(original)
 (folder/'faults.json').write_text(json.dumps(records,indent=2)+'\n')
if any(record['exitCode']!=1 or not record['namedFailures'] for record in records):sys.exit(1)
