import pathlib, subprocess, json, os
folder = pathlib.Path(__file__).parent
source = pathlib.Path('apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-source.ts')
guard = 'openspec/changes/automatic-trusted-activation/evidence/retained-typescript-source-2026-10-17/rss-guard.py'
original = source.read_text()
needle = 'fresh && ledger.size >= limits.maximumReadEntries'
if original.count(needle) != 1:
    raise RuntimeError('entry guard differs')
try:
    source.write_text(original.replace(needle, 'false'))
    log = folder / 'entry-copy-red.log'
    invocation = subprocess.run(['python3', guard, str(log), 'bun', 'test', str(source.with_name('review-typescript-source.test.ts')), '--test-name-pattern', 'entry count refuses'], env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=512'))
    receipt = json.loads(pathlib.Path(str(log) + '.json').read_text())
    contents = log.read_text()
    if invocation.returncode != 1 or receipt['exitCode'] != 1 or '(fail)' not in contents or 'entry copy sentinel' not in contents:
        raise RuntimeError('entry omission did not reach the owner-copy sentinel')
finally:
    source.write_text(original)
