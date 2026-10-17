from pathlib import Path
import subprocess, os
path = Path('libs/wbs/application/core/src/compose.ts')
original = path.read_text()
try:
    path.write_text(original.replace('stepParallels: stores.stepParallels,', "stepParallels: Reflect.get(shared, 'stepParallels') ?? stores.stepParallels,", 1))
    raise SystemExit(subprocess.run(['python3', '/tmp/runtime-rss-guard.py', '/home/df/.bun/bin/bun', 'test', 'libs/wbs/application/core/src/module/work-item/duplicate-step-parallel.test.ts', '--test-name-pattern', 'reads admitted sparse duplication'], env={**os.environ, 'RUNTIME_CLOSURE_RSS_MIB': '900'}).returncode)
finally:
    path.write_text(original)
