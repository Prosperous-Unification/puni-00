import json, pathlib, subprocess, sys
root=pathlib.Path('/tmp/puni-shared-failures-unit-oct17')
source=root/'tools/tool-devsync/src/test-levels.ts'
project=root/'libs/shared/domain/failures/project.json'
original_source=source.read_text()
original_project=project.read_text()
original_hashes={str(path):__import__('hashlib').sha256(path.read_bytes()).hexdigest() for path in [source,project]}
registry="""  {
    project: 'shared-failures',
    root: 'libs/shared/domain/failures',
    target: 'test:unit:level',
    level: 'unit',
    report: 'tmp/junit/shared-failures.unit.xml',
    testRoots: ['src'],
  },
"""
required="""    if (manifest.targets[target.target] === undefined)
      throw new Error(`${target.project}:${target.target} is missing from project manifest`);"""
complete="""      if (!bunFiles.has(canonical))
        throw new Error(`${manifest.name} level targets do not collect ${canonical}`);"""
wrong="""    if (level !== target.level)
      throw new Error(
        `${label} is declared ${target.level} and collects ${path}, which is ${level}`,
      );"""
report="""  if (
    parsed.flags.filter((flag) => flag === '--reporter=junit').length !== 1 ||
    parsed.flags.filter((flag) => flag.startsWith('--reporter-outfile=')).length !== 1 ||
    parsed.flags.filter((flag) => flag === `--reporter-outfile=${report}`).length !== 1
  )
    throw new Error(`${label} report differs from declaration`);"""
mutations=[
 ('registration',source,registry,'','registers the canonical Unit'),
 ('required-target',source,required,'','refuses unknown and missing target declarations'),
 ('literal-operands',project,'find ./src','find src','executes literal operands'),
 ('empty-selection',project,'if [ -z \\"$files\\" ]; then','if [ -z \\"never\\" ]; then','removes stale reports before refusing an empty selection'),
 ('stale-report',project,' && rm -f ../../../../tmp/junit/shared-failures.unit.xml','', 'removes stale reports before refusing an empty selection'),
 ('selector-failure',project,') && if [ -z','); if [ -z','removes stale reports and refuses a failing selector'),
 ('complete-collection',source,complete,'','audits the full Unit source inventory'),
 ('wrong-level',source,wrong,'','refuses api files in the Unit collection'),
 ('report-identity',source,report,'','refuses a different report identity'),
]
receipts=[]
try:
 for label,path,before,after,test in mutations:
  pristine=original_source if path==source else original_project
  if pristine.count(before)!=1:
   raise RuntimeError(f'{label}: expected one mutation anchor, got {pristine.count(before)}')
  path.write_text(pristine.replace(before,after,1))
  log=f'/tmp/shared-failures-r5-{label}-oct17.log'
  invocation=subprocess.run(['python3','/tmp/config-roots-guard-900.py',log,'bun','test','tools/tool-devsync/src/shared-failures-level.test.ts','--timeout=30000','-t',test],cwd=root)
  record=json.loads(pathlib.Path(log+'.json').read_text())
  body=pathlib.Path(log).read_text()
  record['fault']=label
  record['expectedTest']=test
  record['observedNamedFailure']=f'(fail) shared-failures isolated Unit level > {test}' in body
  receipts.append(record)
  path.write_text(pristine)
  if invocation.returncode==0 or not record['observedNamedFailure']:
   raise RuntimeError(f'{label}: mutation did not produce expected named failure; inspect {log}')
finally:
 source.write_text(original_source)
 project.write_text(original_project)
 restored_hashes={str(path):__import__('hashlib').sha256(path.read_bytes()).hexdigest() for path in [source,project]}
 assert restored_hashes==original_hashes,'production source restoration hash mismatch'
 pathlib.Path('/tmp/shared-failures-r5-restoration-oct17.json').write_text(json.dumps({'before':original_hashes,'after':restored_hashes,'equal':True},indent=2)+'\n')
 pathlib.Path('/tmp/shared-failures-r5-oct17.json').write_text(json.dumps(receipts,indent=2)+'\n')
