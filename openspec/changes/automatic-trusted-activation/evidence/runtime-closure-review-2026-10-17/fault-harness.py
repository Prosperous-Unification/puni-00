from pathlib import Path
import json,subprocess,sys
root=Path.cwd();p=root/'apps/twilight-structure/twilight-dash/cli/src/activation/review-runtime.ts';clean=p.read_text();e=root/'openspec/changes/automatic-trusted-activation/evidence/runtime-closure-review-2026-10-17';guard=root/'openspec/changes/automatic-trusted-activation/evidence/runtime-closure-2026-10-17/rss-guard.py'
faults=[
('closure-reference-snapshot','const source = Buffer.from(closureBytes);','const source = Buffer.from(input.closureBytes);','snapshots the closure byte reference'),
('closure-pin-snapshot','    closure,\n    runtimeClosureIdentity,\n    readFile','    closure,\n    runtimeClosureIdentity: input.runtimeClosureIdentity,\n    readFile','captured pin after runtime file reads'),
('root-unicode',"Buffer.from(path, 'utf8').toString('utf8') !== path ||",'false ||','lexically preserving resolve'),
('review-manifest-cap','closureBytes.byteLength > limits.maximumManifestBytes','false','bounds admission'),
('review-independent-pin','hashBytes(source) !== runtimeClosureIdentity','false','independent exact canonical pin'),
('review-limits-snapshot','const limits = { ...installedLimits };','const limits = installedLimits;','owns complete exact'),
('review-root-path-cap','Buffer.byteLength(runtimeRoot) > limits.maximumPathBytes ||\n    Buffer.byteLength(candidateRoot) > limits.maximumPathBytes','false','root path bound'),
]
observations=[]
try:
 for name,needle,replacement,focus in faults:
  if clean.count(needle)!=1:raise RuntimeError(name+' ambiguous needle')
  p.write_text(clean.replace(needle,replacement))
  command=['python3',str(guard),'bun','test','apps/twilight-structure/twilight-dash/cli/src/activation/review-runtime.test.ts','--test-name-pattern',focus]
  run=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(e/(name+'.log')).write_text(run.stdout)
  failed=run.returncode==1 and 'error: expect(received)' in run.stdout
  observations.append({'fault':name,'needle':needle,'replacement':replacement,'focus':focus,'argv':command,'exitCode':run.returncode,'assertionFailed':failed});print(name,run.returncode,failed,flush=True)
  if name=='root-unicode':
   control=command[:-1]+['physical root Unicode aliases'];native=subprocess.run(control,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(e/'root-unicode-native-omission-control.log').write_text(native.stdout)
   if native.returncode!=0:raise RuntimeError('native omission control must still refuse via Bun resolve')
finally:p.write_text(clean);(e/'faults.json').write_text(json.dumps(observations,indent=2)+'\n')
if not all(o['assertionFailed'] for o in observations):sys.exit(1)
