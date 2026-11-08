import json, subprocess
from pathlib import Path
root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
contracts='libs/wbs/domain/contracts/solver/src/connected-durable.ts'
stage='libs/wbs/domain/contracts/solver/src/stored-connected-stage.ts'
canonical='libs/wbs/domain/domain/src/canonical-connected-stage-input.ts'
suite='libs/wbs/domain/contracts/solver/src/connected-durable.test.ts'
hashsuite='libs/wbs/adapters/store-sqlite/src/connected-question-identity.test.ts'
mutations=[]
def add(name,file,before,after='',test=suite): mutations.append((name,file,before,after,test))
add('stage schema bypass',stage,'const stored = stageShape.assert(structuredClone(raw));','const stored = raw as StoredConnectedStage;')
add('duplicate map bypass',stage,"  if (restored.size !== pairs.length) throw new Error('stored connected stage: duplicate map key');")
add('baseline replay bypass',stage,'  replayConnectedStage(captured);')
add('identity comparison bypass',contracts,"  requireEqual(identity, expected, 'identity');")
add('scope comparison bypass',contracts,"  requireEqual(scopeProject, stage.projectId, 'scope');")
add('request correspondence bypass',contracts,"  requireEqual(rawRequest, prepared.request, 'request');")
add('publication comparison bypass',contracts,"  requireEqual(stored.publication, outcome.decision.chosen, 'publication');")
start=Path(root/contracts).read_text(); begin=start.index('  requireEqual(\n    stored.comparison,'); end=start.index('\n  return { identity:',begin)
add('comparison evidence bypass',contracts,start[begin:end])
add('direct contradiction comparison bypass',contracts,"    requireEqual(stored.evidence, prepared.evidence, 'contradiction');")
add('boundary solver status bypass',contracts,"    if (outcome.kind !== 'boundary-infeasible')\n      throw new Error('stored boundary certificate requires initial-model infeasibility');")
add('success schema bypass',contracts,'const stored = envelopeShape.assert(structuredClone(raw));','const stored = raw as StoredConnectedSuccess;')
add('certificate schema bypass',contracts,'const stored = certificateShape.assert(structuredClone(raw));','const stored = raw as StoredBoundaryCertificate;')
add('stage detachment bypass',stage,'stageShape.assert(structuredClone(raw));','stageShape.assert(raw);')
add('success detachment bypass',contracts,'envelopeShape.assert(structuredClone(raw));','envelopeShape.assert(raw);')
add('certificate detachment bypass',contracts,'certificateShape.assert(structuredClone(raw));','certificateShape.assert(raw);')
add('nonfinite JSON bypass',contracts,"    if (typeof held === 'number' && !Number.isFinite(held))\n      throw new Error('stored connected evidence contains nonfinite number');")
# Remove one tuple member at a time, from the actual question-hash array only.
for member in ['stage.projectId','inputHash','objective','contractVersion','installed.budgetMs','SOLVER_QUANTUM','SOLVER_WIRE_VERSION']:
 add('tuple omission '+member,contracts,'        '+member+',\n','',suite)
for label,field in [('projectId','projectId: stage.projectId,'),('mode','mode: stage.mode,'),('origin','originOrdinal: stage.originOrdinal,'),('anchor','anchorOrdinal: project.anchorOrdinal,'),('rows','rows: [...input.rows]'),('ownership','ownership: sortedPairs(projectIdByWorkItem),'),('effort','days: slice.days,'),('width','width: slice.width,'),('person','personId: slice.personId,'),('pools','poolIds: [...new Set(slice.poolIds)].sort(byBytes),'),('floor','notBefore: sortedPairs(input.notBefore),'),('deadline','deadlines: sortedPairs(input.deadlines),'),('pool capacity','poolSizes: sortedPairs(input.poolSizes),'),('resource capacity','resourceCapacities: sortedPairs(input.resourceCapacities),'),('starts','starts: sortedPairs(stage.starts),'),('finishes','finishes: sortedPairs(stage.finishes),')]:
 if label=='rows': continue
 add('canonical omission '+label,canonical,field,'',hashsuite)
# The rank is intentionally redundant in project facts and the ownership order map.
add('canonical rank project field alone',canonical,'rank: project.rank,','',hashsuite)
# Demand and relationship members tested by changing the independent units/id where possible.
add('canonical omission demand units',canonical,'units: demand.units,','',hashsuite)
properties=json.loads(subprocess.check_output(['bun',str(root/'openspec/changes/cross-project-dependencies/evidence/task-7-durable-contracts/canonical-properties.ts')],text=True))
for at,prop in enumerate(properties):
 text=prop['text']
 if text+',' in (root/canonical).read_text():
  add('canonical property '+str(at)+' '+prop['name'],canonical,text+',','',hashsuite)
add('boundary node discriminator omission',canonical,": { kind: node.kind, workItemId: node.workItemId, at: node.at }",": { workItemId: node.workItemId, at: node.at }",hashsuite)
add('boundary node index omission',canonical,": { kind: node.kind, workItemId: node.workItemId, at: node.at }",": { kind: node.kind, workItemId: node.workItemId }",hashsuite)
baseline=subprocess.run(['bun','test',suite,hashsuite],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
if baseline.returncode != 0: raise RuntimeError('baseline is not green: '+baseline.stdout)
records=[]
for name,file,before,after,test in mutations:
 path=root/file; original=path.read_text()
 if before not in original: raise RuntimeError('missing target '+name)
 try:
  path.write_text(original.replace(before,after,1))
  run=subprocess.run(['bun','test',test],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  output=run.stdout
  directory=Path('/tmp/puni-durable-mutation-logs'); directory.mkdir(exist_ok=True)
  (directory/(str(len(records))+'.log')).write_text(output)
  failed=[line for line in output.splitlines() if '(fail)' in line]
  records.append({'fault':name,'exit':run.returncode,'failedTests':failed,'log':str(directory/(str(len(records))+'.log'))})
  print(name,run.returncode,failed[:1],flush=True)
 finally: path.write_text(original)
restored=subprocess.run(['bun','test',suite,hashsuite],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
if restored.returncode != 0: raise RuntimeError('restored baseline is not green: '+restored.stdout)
if any(entry['exit'] == 0 or not entry['failedTests'] for entry in records): raise RuntimeError('mutation survived or did not fail semantically')
Path('/tmp/puni-durable-mutations.json').write_text(json.dumps(records,indent=2)+'\n')
