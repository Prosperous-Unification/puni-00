import os,subprocess,pathlib,hashlib,json,re
root=pathlib.Path(__file__).resolve().parents[5]
p=root/'apps/twilight-structure/twilight-burokrat/cli/src/packaging/compiler-derivative.ts'
test='apps/twilight-structure/twilight-burokrat/cli/src/packaging/compiler-derivative.test.ts'
original=p.read_text(); summary=[]
mutations=[
 ('input',"  if (hash(upstream) !== inputSha256) throw new Error('compiler input digest differs');",'', 'build refuses altered upstream'),
 ('count',"  if (source.split(needle).length !== 2)\n    throw new Error('compiler transformation section must occur exactly once');",'', 'builder refuses (missing|duplicate) section'),
 ('build-output',"  if (hash(instrumented) !== outputSha256) throw new Error('compiler output digest differs');",'', 'builder refuses altered output'),
 ('verify-output',"  if (hash(source) !== outputSha256) throw new Error('compiler output digest differs');",'', 'manifest verifier refuses output'),
 ('manifest-shape',"  if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied))\n    throw new Error('compiler derivative manifest differs');",'', 'manifest refuses malformed'),
 ('manifest-fields',"  if (fields.length !== Object.keys(manifest).length ||\n    fields.some(([key, value]) => !Object.hasOwn(manifest, key) || Reflect.get(manifest, key) !== value))\n    throw new Error('compiler derivative manifest differs');",'', 'manifest verifier refuses output|manifest refuses malformed'),
 ('freeze','const manifest = Object.freeze({','const manifest = ({', 'returned manifest'),
 ('writer-license',"  if (hash(license) !== licenseSha256) throw new Error('compiler upstream license digest differs');",'', 'writer refuses altered upstream license'),
 ('writer-notice',"  if (hash(upstreamNotice) !== upstreamNoticeSha256) throw new Error('compiler upstream notice digest differs');",'', 'writer refuses altered upstream notice'),
 ('reader-license',"  if (hash(license) !== licenseSha256) throw new Error('compiler artifact license digest differs');",'', 'artifact reader refuses altered LICENSE'),
 ('reader-notice',"  if (hash(modificationNotice) !== noticeSha256) throw new Error('compiler artifact notice differs');",'', 'artifact reader refuses altered NOTICE'),
]
mutations=[(name, re.search(r'  if \(\n    fields.length.*?throw new Error\(\'compiler derivative manifest differs\'\);', original, re.S).group(0) if name=='manifest-fields' else needle, replacement, pattern) for name,needle,replacement,pattern in mutations]
mutations=[(name, re.search(r'  if \(hash\(upstreamNotice\) !== upstreamNoticeSha256\)\s+throw new Error\(\'compiler upstream notice digest differs\'\);', original).group(0) if name=='writer-notice' else needle, replacement, pattern) for name,needle,replacement,pattern in mutations]
mutations=[(name, re.search(r'  if \(hash\(modificationNotice\) !== noticeSha256\)\s+throw new Error\(\'compiler artifact notice differs\'\);', original).group(0) if name=='reader-notice' else needle, replacement, pattern) for name,needle,replacement,pattern in mutations]
compiler=(root/'apps/twilight-structure/twilight-burokrat/cli/dist/compiler-derivative/compiler.cjs').read_text()
mutated=compiler.replace('state.host.onPathsSubstitutionAttempt({','void ({')
assert mutated!=compiler
observation=original.replace('state.host.onPathsSubstitutionAttempt({','void ({').replace(hashlib.sha256(compiler.encode()).hexdigest(),hashlib.sha256(mutated.encode()).hexdigest())
mutations.append(('observation',original,observation,'first escaping|explicit extension refusal'))
try:
 for name,needle,replacement,pattern in mutations:
  assert original.count(needle)==1,(name,original.count(needle))
  p.write_text(original.replace(needle,replacement))
  env=os.environ|{'RUNTIME_CLOSURE_RSS_MIB':'900'}
  run=subprocess.run(['python3',str(pathlib.Path(__file__).with_name('rss-guard.py')),'bun','test',test,'-t',pattern],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  pathlib.Path('/tmp/compiler-r5-'+name+'.log').write_text(run.stdout)
  record={'fault':name,'exit':run.returncode,'tail':run.stdout.splitlines()[-5:]};summary.append(record)
  print(json.dumps(record),flush=True)
  if run.returncode!=1: raise RuntimeError('mutation not caught normally: '+name)
finally:
 p.write_text(original)
pathlib.Path('/tmp/compiler-derivative-mutations.json').write_text(json.dumps(summary,indent=2)+'\n')
