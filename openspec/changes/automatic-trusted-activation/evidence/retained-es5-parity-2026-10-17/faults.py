import pathlib, subprocess, json, os
base = pathlib.Path.cwd()
folder = pathlib.Path(__file__).parent
source = base / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-source.ts'
mount = source.with_name('review-typescript.ts')
compiler = base / 'apps/twilight-structure/twilight-burokrat/cli/src/relationships/typescript-compiler.ts'
originals = {path: path.read_text() for path in [source, mount, compiler]}
guard = 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
test = str(source.with_name('review-typescript.test.ts').relative_to(base))
trials = [
 ('ambient-library-substitution', source, "      const { node } = resolvePath(path);\n      return node === undefined || node.kind === 'directory'", "      const { node } = resolvePath(path);\n      if (path.includes('/lib/')) return ts.sys.readFile(path);\n      return node === undefined || node.kind === 'directory'", 'compiler ES5.*capture roots'),
 ('bypass-retained-library-read', source, '.decode(readNode(node));', ".decode(node.kind === 'runtime-file' && node.source.path.includes('/lib/') ? runtime.readFile(node.source) : readNode(node));", 'ES5 compiler sha1 records'),
 ('suppressed-library-entry', source, 'if (fresh) {', "if (fresh && !node.source.path.includes('/lib/')) {", 'ES5 compiler sha1 records'),
 ('wrong-library-identity', source, '? node.source.identity', "? (node.source.path.includes('/lib/') ? 'f'.repeat(64) : node.source.identity)", 'ES5 compiler sha1 records'),
 ('omitted-library-byte-accounting', source, 'readBytes += identity.byteLength;', "if (!node.source.path.includes('/lib/')) readBytes += identity.byteLength;", 'library observations'),
 ('omitted-compiler-byte-accounting', compiler, "readBytes += text === undefined ? 0 : Buffer.byteLength(text, 'utf8');", "readBytes += text === undefined || path.includes('/lib/') ? 0 : Buffer.byteLength(text, 'utf8');", 'library observations'),
 ('omitted-envelope-accounting', mount, 'if (Buffer.byteLength(serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes)', 'if (false)', 'library observations'),
 ('restored-physical-library-dependence', source, '? runtime.readFile(node.source)', "? (node.source.path.includes('/lib/') ? fs.readFileSync(node.path) : runtime.readFile(node.source))", 'compiler ES5.*capture roots'),
]
receipts = []
try:
 for name, path, before, after, pattern in trials:
  original = originals[path]
  if original.count(before) != 1: raise RuntimeError((name, original.count(before)))
  mutated = original.replace(before, after)
  if name == 'restored-physical-library-dependence': mutated = "import * as fs from 'node:fs';\n" + mutated
  path.write_text(mutated)
  log = folder / (name + '.log')
  invocation = subprocess.run(['python3', guard, str(log), 'bun', 'test', test, '--test-name-pattern', pattern], env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=512'), capture_output=True, text=True)
  receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
  transcript = log.read_text()
  expected_sentinel = 'error: forbidden ambient route' if name in ['ambient-library-substitution', 'restored-physical-library-dependence'] else None
  observed_sentinel = expected_sentinel is None or (transcript.count(expected_sentinel) == 2 and 'error: ENOENT' not in transcript)
  watched = invocation.returncode == 1 and receipt['exitCode'] == 1 and '(fail)' in transcript and observed_sentinel
  receipts.append({'fault': name, 'testPattern': pattern, 'watchedFailure': watched, 'expectedSentinel': expected_sentinel, 'observedSentinel': observed_sentinel, **receipt})
  path.write_text(original)
  print(name, watched, flush=True)
  if not watched: raise RuntimeError('fault survived: ' + name)
finally:
 for path, original in originals.items(): path.write_text(original)
 (folder / 'faults.json').write_text(json.dumps(receipts, indent=2) + '\n')
