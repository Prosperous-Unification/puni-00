# Repair source-cache investigation — 2026-11-05 UTC

Later resolution: [Task104 verification](../verify.md#task104-verified-source-execution--2026-11-05-utc) records the implemented and reviewed source fix. The initial findings and original red probe below remain historical evidence; retained-disk and full-stack acceptance remain separate.

The repair producer can execute owner-controlled repository bytecode while every pinned Python source hash still verifies. Python `-B` prevents writing bytecode caches; it does not prevent reading existing caches. This investigation covers the actual coordinator and worker startup loaders and the lazy allocation loader. The main script itself does not load its own cache. Root-installed Python runtime/stdlib remain the existing system trust boundary.

Fresh verification used owned temporary copies of the six actual repository Python sources and a harmless unchecked-hash cache marker. All six source pins passed the actual `raw.verify_pin` before substituted execution. Clean coordinator and worker cases refused the absent request with `raw-state-absent`; the clean lazy case loaded the allocation source. With only a cache substituted, all three printed `UNPINNED_REPOSITORY_CACHE_EXECUTED`. No valid request, retained disk, host cache, native service or VM was accessed.

`env -u NO_COLOR CI=true FORCE_COLOR=1 TERM=xterm bun test tools/tool-fleet/src/lab-raw-repair-source.test.ts` returned 1: 0 passed, 3 failed, 18 assertions, 830 ms. This is a confirmed unresolved bug, not a passing regression or a completed repair. The deliberately red investigation is preserved below as evidence rather than registered as a new failing gate test. Restore it at the original path when implementing the fix; its `import.meta.dir` must resolve to the production helper directory.

Original test: 4092 bytes, SHA256 `f9fce93e3bb03034294d288c6bea35080fc49bef4d8ee4ae0c035069fc5d9f70`. The fenced source is byte-for-byte preserved.

Proposed bounded fix: verify and capture the fixed helper source bytes from the same file descriptors before production imports, keep the verified-buffer loader active for lazy imports, and bootstrap the worker from its existing pinned entry bytes. Preserve the trusted coordinator entry boundary explicitly. A separate shared bootstrap source pin is an alternative if that improves the final implementation. Neither option has been implemented or selected. Preserve wire contracts, caps, native leaf bodies, history and source/runtime evidence distinctions; do not repeat accepted native qualification merely for an unchanged leaf. Before implementation, add the precise behavior/design and ordered TDD slice to the existing OpenSpec.

<!-- prettier-ignore -->
```typescript
import { expect, test } from 'bun:test';

const cacheSubstitution = String.raw`
import hashlib, importlib.util, json, os, pathlib, py_compile, shutil, subprocess, sys, tempfile
source_root = pathlib.Path(sys.argv[1])
scenario = sys.argv[2]
filenames = ('lab-raw-repair.py', 'lab-raw-preparation.py', 'lab-repair-worker.py',
             'lab-seed-preparation.py', 'lab-guest-preparation.py', 'lab-raw-allocation.py')
with tempfile.TemporaryDirectory(prefix='repair-source-cache-') as directory:
    root = pathlib.Path(directory)
    for filename in filenames:
        shutil.copyfile(source_root / filename, root / filename)
        (root / filename).chmod(0o644)
    entry = root / 'lab-raw-repair.py'
    specification = importlib.util.spec_from_file_location('reviewed_repair', entry)
    repair = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(repair)
    pins = []
    for filename in filenames:
        path = root / filename
        payload = path.read_bytes()
        pin = dict(path=str(path), bytes=len(payload), uid=os.geteuid(), mode=0o644,
                   sha256=hashlib.sha256(payload).hexdigest())
        repair.raw.verify_pin(pin)
        pins.append(pin)
    if scenario == 'lazy-allocation':
        command = [sys.executable, '-I', '-B', '-c',
            "import importlib.util,sys; s=importlib.util.spec_from_file_location('repair',sys.argv[1]); "
            "p=importlib.util.module_from_spec(s); s.loader.exec_module(p); "
            "p.raw.load_inspector(); print('reviewed-allocation')", str(entry)]
        selected = root / 'lab-raw-allocation.py'
    else:
        command = [sys.executable, '-I', '-B', str(entry)]
        if scenario == 'worker-writer':
            command.append('--worker')
        command.extend([str(root / 'absent-request.json'), 'a' * 64])
        selected = root / ('lab-repair-worker.py' if scenario == 'worker-writer' else 'lab-raw-preparation.py')
    baseline = subprocess.run(command, capture_output=True, timeout=5)
    cache = pathlib.Path(importlib.util.cache_from_source(str(selected)))
    cache.parent.mkdir(exist_ok=True)
    substitute = root / 'harmless-cache-marker.py'
    substitute.write_text("print('UNPINNED_REPOSITORY_CACHE_EXECUTED')\nraise SystemExit(73)\n")
    py_compile.compile(str(substitute), cfile=str(cache), dfile=str(selected), doraise=True,
                       invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
    for pin in pins:
        repair.raw.verify_pin(pin)
    substituted = subprocess.run(command, capture_output=True, timeout=5)
    print(json.dumps(dict(baselineCode=baseline.returncode, baselineOut=baseline.stdout.decode(),
                         baselineError=baseline.stderr.decode(), code=substituted.returncode,
                         stdout=substituted.stdout.decode(), stderr=substituted.stderr.decode())))
`;

for (const scenario of ['coordinator-raw', 'worker-writer', 'lazy-allocation']) {
  test(`repair ${scenario} executes pinned source instead of an owned repository cache`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3.12', '-I', '-B', '-c', cacheSubstitution, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stderr.toString()).toBe('');
    const observation = JSON.parse(invocation.stdout.toString());
    if (scenario === 'lazy-allocation') {
      expect(observation.baselineCode).toBe(0);
      expect(observation.baselineOut).toBe('reviewed-allocation\n');
      expect(observation.baselineError).toBe('');
    } else {
      expect(observation.baselineCode).toBe(1);
      expect(observation.baselineOut).toBe('');
      expect(observation.baselineError).toBe('raw-state-absent\n');
    }
    expect(observation.stdout).not.toContain('UNPINNED_REPOSITORY_CACHE_EXECUTED');
    expect(observation.code).toBe(observation.baselineCode);
    expect(observation.stdout).toBe(observation.baselineOut);
    expect(observation.stderr).toBe(observation.baselineError);
  });
}
```
