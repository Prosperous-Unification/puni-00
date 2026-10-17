import pathlib, subprocess, json, os, sys
base = pathlib.Path.cwd()
folder = pathlib.Path(__file__).parent
source = base / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-source.ts'
mount = source.with_name('review-typescript.ts')
compiler = base / 'apps/twilight-structure/twilight-burokrat/cli/src/relationships/typescript-compiler.ts'
originals = {path: path.read_text() for path in [source, mount, compiler]}
guard = 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
test = str(source.with_name('review-typescript.test.ts').relative_to(base))
parity = 'compiler implicit sha1.*capture roots'
trials = [
 ('wrong-default-selection', compiler, 'ts.getDefaultLibFileName(compilerOptions)', "(system.compilerLibraryDirectory === '/__puni_review__/candidate/node_modules/typescript/lib' ? 'lib.es5.d.ts' : ts.getDefaultLibFileName(compilerOptions))", parity),
 ('redirect-library-namespace', source, 'compilerLibraryDirectory: namespace.libraryDirectory,', "compilerLibraryDirectory: namespace.libraryDirectory + '/absent',", parity),
 ('esm-physical-library-read', source, '? runtime.readFile(node.source)', "? (node.source.path.includes('/lib/') ? fs.readFileSync(node.path) : runtime.readFile(node.source))", parity),
 ('ambient-library-substitution', source, "      const { node } = resolvePath(path);\n      return node === undefined || node.kind === 'directory'", "      const { node } = resolvePath(path);\n      if (path.includes('/lib/')) return ts.sys.readFile(path);\n      return node === undefined || node.kind === 'directory'", parity),
 ('omitted-indirect-census-entry', source, 'if (fresh) {', "if (fresh && !node.source.path.endsWith('/lib.es2015.promise.d.ts')) {", parity),
 ('wrong-indirect-identity', source, '? node.source.identity', "? (node.source.path.endsWith('/lib.es2015.promise.d.ts') ? 'f'.repeat(64) : node.source.identity)", parity),
 ('omitted-source-byte-accounting', source, 'readBytes += identity.byteLength;', "if (!node.source.path.includes('/lib/')) readBytes += identity.byteLength;", 'implicit compiler bounds exact source library observations'),
 ('omitted-compiler-byte-accounting', compiler, "readBytes += text === undefined ? 0 : Buffer.byteLength(text, 'utf8');", "readBytes += text === undefined || path.includes('/lib/') ? 0 : Buffer.byteLength(text, 'utf8');", 'implicit compiler bounds exact compiler library observations'),
 ('omitted-envelope-accounting', mount, 'if (Buffer.byteLength(serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes)', 'if (false)', 'implicit compiler bounds exact envelope library observations'),
]
selected = sys.argv[1:]
if selected: trials = [trial for trial in trials if trial[0] in selected]
receipts = json.loads((folder / 'faults.json').read_text()) if selected else []
receipts = [phase for phase in receipts if phase['fault'] not in selected]
try:
 for name, path, before, after, pattern in trials:
  original = originals[path]
  if original.count(before) != 1: raise RuntimeError((name, original.count(before)))
  mutated = original.replace(before, after)
  if name == 'esm-physical-library-read': mutated = "import * as fs from 'node:fs';\n" + mutated
  path.write_text(mutated)
  log = folder / (name + '.log')
  invocation = subprocess.run(['python3', guard, str(log), 'bun', 'test', test, '--test-name-pattern', pattern], env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=512'), capture_output=True, text=True)
  receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
  transcript = log.read_text()
  sentinel = 'error: forbidden ambient route' if name in ['ambient-library-substitution', 'esm-physical-library-read'] else None
  observed = sentinel is None or (transcript.count(sentinel) == 1 and 'error: ENOENT' not in transcript)
  expected_test = 'retained compiler implicit sha1 matches legacy after all capture roots disappear' if pattern == parity else 'retained ' + pattern
  retained_mount_reached = 'at extractRetainedTypeScriptRelationships (' in transcript
  watched = (name != 'wrong-default-selection' or retained_mount_reached) and ('(fail) ' + expected_test) in transcript and invocation.returncode == 1 and receipt['exitCode'] == 1 and '(fail)' in transcript and '1 fail' in transcript and observed
  receipts.append({'fault': name, 'testPattern': pattern, 'expectedTest': expected_test, 'watchedFailure': watched, 'expectedSentinel': sentinel, 'observedSentinel': observed, 'retainedMountReached': retained_mount_reached, **receipt})
  path.write_text(original)
  print(name, watched, receipt['peakProcessTreeKiB'], flush=True)
  if not watched: raise RuntimeError('fault survived or exceeded guard: ' + name)
finally:
 for path, original in originals.items(): path.write_text(original)
 (folder / 'faults.json').write_text(json.dumps(receipts, indent=2) + '\n')
