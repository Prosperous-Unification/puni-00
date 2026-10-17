from pathlib import Path
import subprocess,json,sys
base=Path('apps/twilight-structure/twilight-dash/cli/src/activation')
evidence=Path('openspec/changes/automatic-trusted-activation/evidence/retained-namespace-2026-10-17')
namespace=base/'review-namespace.ts';runtime=base/'review-runtime.ts'
originals={p:p.read_text() for p in [namespace,runtime]}
trials=[]
def trial(name,path,old,new,pattern): trials.append((name,path,old,new,pattern))
trial('candidate-owner',namespace,'const candidateProof = readRetainedCandidateProvenance(candidate);','const candidateProof = {};','rejects copied candidate|rejects false-empty candidate')
trial('runtime-owner',runtime,"if (provenance === undefined) throw new Error('owned review runtime required');",'', 'rejects copied runtime|rejects false-empty runtime')
trial('namespace-owner',namespace,"if (provenance === undefined) throw new Error('owned retained namespace required');",'', 'retains sha1')
a=originals[namespace].index('  const limits = {');b=originals[namespace].index('\n  // Proof: limit-grammar',a)
trial('limit-snapshot',namespace,originals[namespace][a:b],'  const limits = installedLimits;','snapshots each')
trial('limit-grammar',namespace,'!Number.isSafeInteger(ceiling) || ceiling < 1','false','validates maximum')
trial('entry-cap',namespace,'entries.length > limits.maximumEntries ||\n    files.length > limits.maximumEntries - entries.length','false','counts all runtime')
trial('node-cap',namespace,'nodes.size >= limits.maximumNodes','false','counts root')
trial('path-codeunit-cap',namespace,'path.length > limits.maximumPathBytes','false','bounds code units')
trial('path-byte-cap',namespace,'if (length > limits.maximumPathBytes)','if (false)','bounds code units')
trial('virtual-cap',namespace,'sourceBytes > limits.maximumPathBytes - CandidateRoot.length - 1','false','caps source and virtual')
trial('total-cap',namespace,'pathBytes > limits.maximumTotalPathBytes - retainedPathBytes ||\n      sourceBytes > limits.maximumTotalPathBytes - retainedPathBytes - pathBytes','false','caps aggregate')
trial('path-unicode',namespace,r'/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(path)','false','rejects candidate path')
trial('path-nul',namespace,r"path.includes('\0')",'false','rejects candidate path')
trial('path-backslash',namespace,r"path.includes('\\')",'false','rejects candidate path')
for component in ['', '.', '..']:
 trial('path-component-'+{'':'empty','.':'dot','..':'traversal'}[component],namespace,"part === '"+component+"'",'false','rejects candidate path')
trial('candidate-git',namespace,"component === '.git'",'false','rejects candidate path')
trial('candidate-dependencies',namespace,"component === 'node_modules'",'false','rejects candidate path')
trial('mode',namespace,"entry.mode !== '100644' && entry.mode !== '100755' && entry.mode !== '120000'",'false','rejects unsupported')
trial('ancestor-conflict',namespace,"prior !== undefined && prior.kind !== 'directory'",'false','rejects duplicate mounts')
trial('duplicate-conflict',namespace,'nodes.has(path)','false','rejects duplicate mounts')
trial('runtime-git',namespace,"file.path.split('/').includes('.git')",'false','rejects visible runtime')
trial('runtime-role',namespace,"file.role !== 'dependency' || ",'','keeps programs')
trial('runtime-prefix',namespace,"!file.path.startsWith('node_modules/')",'false','retains sha1')
trial('freeze-node',namespace,'nodes.set(node.path, Object.freeze(node));','nodes.set(node.path, node);','retains sha1')
trial('freeze-candidate-tuple',namespace,'Object.freeze({ path: entry.path, mode: entry.mode, blob: entry.blob })','{ path: entry.path, mode: entry.mode, blob: entry.blob }','retains sha1')
trial('freeze-runtime-tuple',namespace,'''Object.freeze({
          path: file.path,
          role: file.role,
          identity: file.identity,
          byteLength: file.byteLength,
        })''','''{path:file.path,role:file.role,identity:file.identity,byteLength:file.byteLength}''','retains sha1')
trial('freeze-array',namespace,'''nodes: Object.freeze(
      [...nodes.values()].sort((left, right) =>
        Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
      ),
    ),''','''nodes: [...nodes.values()].sort((left,right)=>Buffer.compare(Buffer.from(left.path),Buffer.from(right.path))),''','retains sha1')
trial('freeze-index',namespace,'const namespace: RetainedNamespace = Object.freeze({','const namespace: RetainedNamespace = ({','retains sha1')
trial('freeze-provenance',namespace,'''Object.freeze({
      ...candidateProof,
      ...runtimeProof,
      namespacePolicyIdentity: NamespacePolicyIdentity,
    })''','''{...candidateProof,...runtimeProof,namespacePolicyIdentity:NamespacePolicyIdentity}''','retains sha1')
trial('freeze-runtime-provenance',runtime,'''Provenance.set(
    capability,
    Object.freeze({''','''Provenance.set(
    capability,
    ({''','retains sha1')
trial('ambient-fs',namespace,'  const entries = candidate.snapshot.entries;',"  const entries = candidate.snapshot.entries;\n  namespaceFaultFs.readFileSync('/forbidden');",'retains sha1')
trial('ambient-git',namespace,'  const entries = candidate.snapshot.entries;',"  const entries = candidate.snapshot.entries;\n  Bun.spawnSync(['/usr/bin/git']);",'retains sha1')
trial('candidate-content',namespace,'  const entries = candidate.snapshot.entries;',"  const entries = candidate.snapshot.entries;\n  candidate.readBlob('foreign','a.ts');",'does not call candidate')
trial('runtime-content',namespace,'  const files = runtime.closure.files;',"  const files = runtime.closure.files;\n  runtime.readFile(files[0]);",'does not call candidate')
trial('ambient-environment',namespace,'  const entries = candidate.snapshot.entries;',"  const entries = candidate.snapshot.entries;\n  void process.env;",'does not consult environment')
trial('ambient-metadata',namespace,'  const entries = candidate.snapshot.entries;',"  const entries = candidate.snapshot.entries;\n  namespaceFaultFs.statSync('/forbidden');",'retains sha1')
records=json.loads((evidence/'faults.json').read_text()) if (evidence/'faults.json').exists() else []
try:
 for name,path,old,new,pattern in trials:
  if any(record['fault']==name for record in records): continue
  source=originals[path]
  if source.count(old)!=1: raise Exception((name,'replacement count',source.count(old)))
  altered=source.replace(old,new)
  if name in ['ambient-fs','ambient-metadata']: altered="import * as namespaceFaultFs from 'node:fs';\n"+altered
  path.write_text(altered)
  log=evidence/(name+'.log')
  completed=subprocess.run([sys.executable,str(evidence/'rss-guard.py'),str(log),'bun','--smol','test',str(base/'review-namespace.test.ts'),'-t',pattern],capture_output=True,text=True)
  path.write_text(source)
  body=log.read_text();receipt=json.loads(Path(str(log)+'.json').read_text())
  if receipt['exitCode']!=1 or '(fail)' not in body: raise Exception((name,'not causal test red',receipt,body[-1000:]))
  if name=='ambient-fs' and 'forbidden fs' not in body: raise Exception('filesystem sentinel not intercepted')
  if name=='ambient-metadata' and 'forbidden filesystem metadata' not in body: raise Exception('metadata sentinel not intercepted')
  if name=='ambient-environment' and 'forbidden environment' not in body: raise Exception('environment sentinel not intercepted')
  if name=='ambient-git' and 'forbidden Git' not in body: raise Exception('Git sentinel not intercepted')
  if name.endswith('-content') and 'forbidden retained content' not in body: raise Exception('content sentinel not intercepted')
  records.append({'fault':name,**receipt,'namedFailures':[line for line in body.splitlines() if line.startswith('(fail)')]})
  print(name,'RED',flush=True)
finally:
 for path,source in originals.items():path.write_text(source)
 (evidence/'faults.json').write_text(json.dumps(records,indent=2)+'\n')
