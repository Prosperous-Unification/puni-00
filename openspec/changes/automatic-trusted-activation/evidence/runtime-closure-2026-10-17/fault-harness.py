from pathlib import Path
import subprocess,json,sys
root=Path.cwd(); p=root/'apps/twilight-structure/twilight-dash/cli/src/activation/review-runtime.ts'; clean=p.read_text(); evidence=root/'openspec/changes/automatic-trusted-activation/evidence/runtime-closure-2026-10-17'; evidence.mkdir(exist_ok=True)
faults=[
('utf8-fatal',"new TextDecoder('utf-8', { fatal: true })","new TextDecoder('utf-8', { fatal: false })",'invalid raw UTF-8'),
('tuple-snapshot','const bytes = owned.get(expected.path);','const bytes = owned.get(file.path);','snapshots a caller tuple'),
('limits-snapshot','const limits = { ...input.limits };','const limits = input.limits;','owns complete exact'),
('freeze-capability','const capability: ReviewRuntime = Object.freeze({','const capability: ReviewRuntime = ((value) => value)({','owns complete exact'),
('freeze-closure','Object.freeze(closure);','','owns complete exact'),
('freeze-files','Object.freeze(closure.files);','','owns complete exact'),
('freeze-file','for (const file of closure.files) Object.freeze(file);','','owns complete exact'),
('limits-grammar','!Number.isSafeInteger(ceiling) || ceiling < 1','false','bounds admission'),
('root-path-cap','Buffer.byteLength(runtimeRoot) > limits.maximumPathBytes ||\n    Buffer.byteLength(candidateRoot) > limits.maximumPathBytes','false','root path bound'),
('copy-read-bytes','bytes.byteLength > limits.maximumReadBytes - readBytes','false','distinct lifetime returned-byte'),
('independent-pin','hashBytes(source) !== input.runtimeClosureIdentity','false','independent exact canonical pin'),
('canonical-bytes',"serializeCanonical(closure) !== source.toString('utf8')",'false','program-free inventories'),
('schema-root',"}).onUndeclaredKey('reject');\nexport type",'});\nexport type','closed schema'),
('schema-file',"}).onUndeclaredKey('reject');\nconst Closure",'});\nconst Closure','closed schema'),
('manifest-cap','input.closureBytes.byteLength > limits.maximumManifestBytes','false','bounds admission'),
('entry-cap','decoded.files.length > limits.maximumEntries','false','bounds admission'),
('program-inventory',"!closure.files.some((file) => file.role === 'program')",'false','program-free inventories'),
('path-grammar',"Buffer.from(file.path, 'utf8').toString('utf8') !== file.path ||\n      file.path.includes('\\\\') ||\n      file.path.includes('\\0') ||\n      file.path.split('/').some((part) => part === '' || part === '.' || part === '..')",'false','manifest refusals'),
('path-cap','Buffer.byteLength(file.path) > limits.maximumPathBytes','false','manifest refusals'),
('path-sort',"(Buffer.compare(Buffer.from(previous), Buffer.from(file.path)) >= 0 ||\n        file.path.startsWith(`${previous}/`))",'false','manifest refusals'),
('length-safe','!Number.isSafeInteger(file.byteLength)','false','root aliases'),
('path-prefix',"file.path.split('/').some((_, index, parts) => paths.has(parts.slice(0, index).join('/')))",'false','nonadjacent file ancestors'),
('owned-cap','file.byteLength + 1 > limits.maximumOwnedBytes - retained','false','bounds admission'),
('probe-cap','probes >= limits.maximumProbes','false','bounds admission'),
('read-cap','reads >= limits.maximumReads','false','bounds admission'),
('allocation-cap','!Number.isSafeInteger(length) || length > limits.maximumBytes - allocated','false','bounds admission'),
('root-grammar',"!isAbsolute(path) || resolve(path) !== path || path.includes('\\0') || path.includes('\\\\')",'false','root aliases'),
('candidate-overlap','contains(candidate, runtimeRoot) || contains(runtimeRoot, candidate)','false','symlinks and candidate overlap'),
('ancestor-symlink','constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW','constants.O_RDONLY | constants.O_DIRECTORY','symlinks and candidate overlap'),
('leaf-symlink','constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK','constants.O_RDONLY | constants.O_NONBLOCK','symlinks and candidate overlap'),
('file-kind','!before.isFile()','false','non-regular files'),
('preallocation-length','before.size !== file.byteLength','false','wrong-length files refuse before'),
('capture-read-bytes','bytes.length - count > limits.maximumReadBytes - readBytes','false','bounds admission'),
('raw-identity','hashBytes(bytes.subarray(0, count)) !== file.identity','false','unreadable, changed'),
('stable-stat', 'before.mtimeMs !== after.mtimeMs ||\n        before.ctimeMs !== after.ctimeMs','false','same-byte file mutation'),
('cleanup-aggregate',"if (failures.length > 1)\n      throw new AggregateError(failures, 'runtime capture and cleanup failed');",'if (failures.length > 1) throw failures[0];','simultaneous cleanup'),
('exact-owner','Owners.get(this) !== owned','false','copied methods'),
('tuple',"expected?.role !== role ||\n        expected.identity !== identity ||\n        expected.byteLength !== byteLength",'expected === undefined','owns complete exact'),
('copy-return','return Uint8Array.from(bytes);','return bytes;','owns complete exact'),
('nonblocking','constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK','constants.O_RDONLY | constants.O_NOFOLLOW','FIFO refuses'),
]
observed=[]
try:
 for name,needle,replacement,focus in faults:
  if clean.count(needle)<1: raise RuntimeError(name+' missing needle')
  changed=clean.replace(needle,replacement)
  # Entry count has one pre-schema and one redundant post-schema fence; omit both.
  if name=='entry-cap': changed=changed.replace('closure.files.length > limits.maximumEntries','false')
  if name=='capture-read-bytes': changed=changed.replace('bytes.byteLength > limits.maximumReadBytes - readBytes','false')
  p.write_text(changed)
  command=['python3',str(evidence/'rss-guard.py'),'bun','test','apps/twilight-structure/twilight-dash/cli/src/activation/review-runtime.test.ts','--test-name-pattern',focus]
  run=subprocess.run(command,cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  (evidence/(name+'.log')).write_text(run.stdout)
  assertion='error: expect(received)' in run.stdout and run.returncode==1
  observed.append({'fault':name,'needle':needle,'replacement':replacement,'focus':focus,'exitCode':run.returncode,'assertionFailed':assertion})
  print(name,run.returncode,'ASSERTION' if assertion else 'ESCAPED',flush=True)
finally:
 p.write_text(clean)
 (evidence/'faults.json').write_text(json.dumps(observed,indent=2)+'\n')
if not all(o['assertionFailed'] for o in observed):sys.exit(1)
