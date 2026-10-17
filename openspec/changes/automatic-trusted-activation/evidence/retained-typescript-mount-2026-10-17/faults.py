import pathlib, subprocess, json, os
base=pathlib.Path.cwd()
source=base/'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.ts'
test='apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript.test.ts'
folder=base/'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-mount-2026-10-17'
guard='openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
original=source.read_text()
trials=[
('provenance-envelope', 'const envelope = { runtimeTrust: provenance.runtimeTrust, provenance, ...extracted };', "const envelope = { runtimeTrust: provenance.runtimeTrust, provenance: { ...provenance, snapshotIdentity: 'f'.repeat(64) }, ...extracted };", 'sha1 matches legacy'),
('config-count-safe', '!Number.isSafeInteger(configCount)', 'false', 'captured proxy'),
('public-count-safe', '!Number.isSafeInteger(publicCount)', 'false', 'captured proxy'),
('limit-safe', '!Number.isSafeInteger(ceiling)', 'false', 'validates every limit'),
('limit-minimum', 'ceiling < minimum', 'false', 'validates every limit'),
('config-array', '!Array.isArray(configPaths)', 'false', 'array impostors'),
('public-array', '!Array.isArray(publicEntrypoints)', 'false', 'array impostors'),
('config-nonempty', 'configCount < 1', 'false', 'malformed or noncandidate'),
('public-nonempty', 'publicCount < 1', 'false', 'malformed or noncandidate'),
('config-count', 'configCount > capturedRequestLimits.maximumConfigPaths', 'false', 'fixed request lengths'),
('public-count', 'publicCount > capturedRequestLimits.maximumPublicEntrypoints', 'false', 'bounds UTF8'),
('path-type', "if (typeof path !== 'string')", 'if (false)', 'sparse entries'),
('path-codeunits', 'path.length > capturedRequestLimits.maximumPathBytes', 'false', 'path codeunits'),
('path-utf8', 'bytes > capturedRequestLimits.maximumPathBytes', 'false', 'bounds UTF8'),
('path-total', 'bytes > capturedRequestLimits.maximumTotalPathBytes - pathBytes', 'false', 'fixed request lengths'),
('drive', '/^[A-Za-z]:/u.test(path)', 'false', 'malformed or noncandidate'),
('surrogate', r'/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(path)', 'false', 'malformed or noncandidate'),
('reserved', "path.split('/').some((component) => component === '.git' || component === 'node_modules')", 'false', 'malformed or noncandidate'),
('relative-path', 'parseOrThrow(RelativePath, path);', '', 'malformed or noncandidate'),
('unique', 'if (unique.has(path))', 'if (false)', 'malformed or noncandidate'),
('fixed-length', 'index < count', 'index < paths.length', 'fixed request lengths'),
('request-snapshot', 'capturedRequest,\n    source,', 'request,\n    source,', 'callbacks mutate'),
('compiler-snapshot', 'source,\n    capturedCompilerLimits,', 'source,\n    compilerLimits,', 'callbacks mutate'),
('source-snapshot', 'runtime,\n    capturedSourceLimits,', 'runtime,\n    sourceLimits,', 'callbacks mutate'),
('output-snapshot', 'serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes', 'serializeCanonical(envelope)) > requestLimits.maximumOutputBytes', 'callbacks mutate'),
('envelope-cap', 'if (Buffer.byteLength(serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes)', 'if (false)', 'one byte below exact'),
]
ledger=[]
try:
 for name,before,after,pattern in trials:
  if original.count(before)!=1: raise RuntimeError((name, original.count(before)))
  source.write_text(original.replace(before,after))
  log=folder/(name+'.log')
  invocation=subprocess.run(['python3',guard,str(log),'bun','test',test,'--test-name-pattern',pattern],env=dict(os.environ,NODE_OPTIONS='--max-old-space-size=512'),capture_output=True,text=True)
  receipt=json.loads(pathlib.Path(str(log)+'.json').read_text())
  contents=log.read_text()
  watched=invocation.returncode==1 and receipt['exitCode']==1 and '(fail)' in contents
  ledger.append({'fault':name,'testPattern':pattern,'watchedFailure':watched,**receipt})
  print(name, watched, flush=True)
  if not watched: raise RuntimeError('not caught: '+name)
finally:
 source.write_text(original)
 (folder/'faults.json').write_text(json.dumps(ledger,indent=2)+'\n')
