import pathlib, subprocess, json, os
base = pathlib.Path.cwd()
folder = base / 'openspec/changes/automatic-trusted-activation/evidence/retained-byte-census-2026-10-17'
guard = 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
source = base / 'apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-source.ts'
mount = source.with_name('review-typescript.ts')
source_test = str(source.with_name('review-typescript-source.test.ts').relative_to(base))
mount_test = str(source.with_name('review-typescript.test.ts').relative_to(base))
originals = {source: source.read_text(), mount: mount.read_text()}
trials = [
('record', source, 'ledger.set(encoding, Object.freeze(entry));', '', 'raw candidate'),
('path', source, 'path: node.source.path,', "path: node.path,", 'raw candidate'),
('identity', source, 'identity:\n        node.kind ===', "identity: true ? 'f'.repeat(64) : node.kind ===", 'raw candidate'),
('dedup', source, 'const fresh = !ledger.has(encoding);', 'const fresh = true;', 'exact ceilings'),
('sort', source, '.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))', '.sort(([a], [b]) => Buffer.compare(Buffer.from(b), Buffer.from(a)))', 'raw candidate'),
('utf16-sort', source, 'Buffer.compare(Buffer.from(a), Buffer.from(b))', '(a < b ? -1 : a > b ? 1 : 0)', 'UTF8 order'),
('entry-cap', source, 'fresh && ledger.size >= limits.maximumReadEntries', 'false', 'exact ceilings'),
('ledger-cap', source, 'fresh && contribution > limits.maximumReadLedgerBytes - ledgerBytes', 'false', 'exact ceilings|runtime ledger'),
('wrapper-cap', source, 'ledgerBytes > limits.maximumReadLedgerBytes', 'false', 'empty wrapper'),
('owner', source, "if (seal === undefined) throw new Error('owned retained TypeScript source required');", '', 'raw candidate'),
('seal', source, "if (sealed !== undefined) throw new Error('retained TypeScript source sealed');", '', 'raw candidate'),
('query-seal', source, '  function assertQuery(path: string): string {\n    assertOpen();', '  function assertQuery(path: string): string {', 'raw candidate'),
('probe-seal', source, '  function probe(): void {\n    assertOpen();', '  function probe(): void {', 'raw candidate'),
('freeze-envelope', source, 'sealed = Object.freeze({', 'sealed = ({', 'raw candidate'),
('freeze-entries', source, 'entries: Object.freeze(entries)', 'entries: entries', 'raw candidate'),
('freeze-entry', source, 'ledger.set(encoding, Object.freeze(entry));', 'ledger.set(encoding, entry);', 'raw candidate'),
('cache', source, 'if (sealed === undefined) {', 'if (true) {', 'raw candidate'),
('successful-only', source, "    const bytes =\n", "    if (fresh) ledger.set(encoding, Object.freeze(entry));\n    const bytes =\n", 'failed owner'),
('safe-limits', source, '!Number.isSafeInteger(ceiling)', 'false', 'empty wrapper'),
('positive-limits', source, 'ceiling < 1', 'false', 'empty wrapper'),
('exact-contribution', source, 'Buffer.byteLength(encoding) - 1', 'Buffer.byteLength(encoding)', 'exact ceilings'),
('comma', source, '(ledger.size === 0 ? 0 : 1)', '0', 'two entry'),
('mount-census', mount, 'provenance, byteReads, ...extracted', 'provenance, ...extracted', 'byte census seals'),
('mount-before-success', mount, '  const extracted = extractTypeScriptRelationshipsFromSource(', '  sealRetainedTypeScriptReads(source);\n  const extracted = extractTypeScriptRelationshipsFromSource(', 'byte census seals'),
('unused-runtime', mount, 'provenance, byteReads, ...extracted', "provenance, byteReads: {...byteReads, entries: [...byteReads.entries, {namespace: 'runtime', path: 'node_modules/unused/index.d.ts', revision: null, identity: 'f'.repeat(64), byteLength: 1}]}, ...extracted", 'byte census seals'),
('mount-output', mount, 'if (Buffer.byteLength(serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes)', 'if (false)', 'one byte below exact'),
]
ledger = []
try:
 for name, path, before, after, pattern in trials:
  original = originals[path]
  if original.count(before) != 1: raise RuntimeError((name, original.count(before)))
  path.write_text(original.replace(before, after))
  log = folder / (name + '.log')
  invocation = subprocess.run(['python3', guard, str(log), 'bun', 'test', mount_test if path == mount else source_test, '--test-name-pattern', pattern], env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=512'), capture_output=True, text=True)
  receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
  watched = invocation.returncode == 1 and receipt['exitCode'] == 1 and '(fail)' in log.read_text()
  ledger.append({'fault': name, 'testPattern': pattern, 'watchedFailure': watched, **receipt})
  path.write_text(original)
  print(name, watched, flush=True)
  if not watched: raise RuntimeError('not caught: ' + name)
finally:
 for path, original in originals.items(): path.write_text(original)
 (folder / 'faults.json').write_text(json.dumps(ledger, indent=2) + '\n')
