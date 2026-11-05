import { expect, test } from 'bun:test';

interface StartupObservation {
  baselineCode: number;
  baselineOut: string;
  baselineError: string;
  code: number;
  stdout: string;
  stderr: string;
}

// Scratch-only adaptation of the preserved 4092-byte investigation in the change evidence.
// Production startup, service_arguments and load_inspector run; no native service is invoked.
const startup = String.raw`
import hashlib, importlib.util, json, os, pathlib, py_compile, shutil, subprocess, sys, tempfile
source_root = pathlib.Path(sys.argv[1])
scenario = sys.argv[2]
fault = sys.argv[3]
omission = sys.argv[4] if len(sys.argv) > 4 else ''
filenames = ('lab-raw-repair.py', 'lab-raw-preparation.py', 'lab-repair-worker.py',
             'lab-seed-preparation.py', 'lab-guest-preparation.py', 'lab-raw-allocation.py')
with tempfile.TemporaryDirectory(prefix='repair-source-cache-') as directory, tempfile.TemporaryDirectory(prefix='repair-source-alias-') as alias_directory:
    root = pathlib.Path(directory)
    for filename in filenames:
        shutil.copyfile(source_root / filename, root / filename)
        (root / filename).chmod(0o644)
    component_root = root / 'trusted-component'
    component_root.mkdir()
    for filename in filenames: shutil.copyfile(source_root / filename,component_root / filename)
    alias = pathlib.Path(alias_directory)
    entry = root / filenames[0]
    request_path = root / 'request.json'
    selected = root / ('lab-repair-worker.py' if scenario == 'worker' else 'lab-raw-preparation.py')
    if scenario == 'lazy': selected = root / 'lab-raw-allocation.py'
    if fault != 'absent-request':
        with (root / 'lab-raw-preparation.py').open('a') as stream:
            stream.write("\nprint('ADMITTED_RAW')\n")
        with (root / 'lab-raw-allocation.py').open('a') as stream:
            stream.write("\nprint('ADMITTED_ALLOCATION')\n")
        with (root / 'lab-guest-preparation.py').open('a') as stream:
            stream.write("\nraw.load_inspector()\nprint('ADMITTED_GEOMETRY')\nraise SystemExit(0)\n")
    if fault in ('replace-initial', 'replace-lazy', 'unpinned-sibling'):
        if fault == 'unpinned-sibling':
            sibling = root / 'unselected.py'
            sibling.write_text("print('UNPINNED_SIBLING_EXECUTED')\n")
            action = "spec=importlib.util.spec_from_file_location('unselected',Path(__file__).with_name('unselected.py'))\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\n"
        else:
            replaced = 'lab-seed-preparation.py' if fault == 'replace-initial' else 'lab-raw-allocation.py'
            action = "Path(__file__).with_name("+repr(replaced)+").write_text(\"print('REPLACED_PATH_EXECUTED')\\nraise SystemExit(73)\\n\")\n"
        with (root / 'lab-raw-preparation.py').open('a') as stream: stream.write(action)
    if fault in ('external-spec','symlink-after-capture'):
        foreign = alias / 'lab-raw-preparation.py'
        foreign.write_text("print('FOREIGN_REPOSITORY_SOURCE_EXECUTED')\nraise SystemExit(73)\n")
        if fault == 'external-spec':
            action = "spec=importlib.util.spec_from_file_location('external',"+repr(str(foreign))+")\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\n"
        else:
            target = alias / 'lab-seed-preparation.py'
            target.write_bytes((root / 'lab-seed-preparation.py').read_bytes())
            action = "path=Path(__file__).with_name('lab-seed-preparation.py')\npath.unlink()\npath.symlink_to("+repr(str(target))+")\n"
        with (root / 'lab-raw-preparation.py').open('a') as stream: stream.write(action)
    entry_source = entry.read_text()
    if omission and omission not in ('loader','syntax'):
        entry_source = entry_source.replace('if not predicate:', 'if not predicate and category != '+repr(omission)+':', 1)
    if omission == 'syntax':
        entry_source = entry_source.replace('except (SyntaxError, ValueError):','except OverflowError:',1)
    if omission == 'loader':
        entry_source = entry_source.replace('importlib.util.spec_from_file_location = repository_spec', 'pass # watched loader omission', 1)
    if fault == 'aggregate-bound':
        entry_source = entry_source.replace('_REPAIR_SOURCES_BYTES = 786432', '_REPAIR_SOURCES_BYTES = 1', 1)
    injection = ''
    if fault in ('changed-read', 'changed-path', 'read-failure', 'close-failure', 'changed-open', 'short-read', 'source-bound', 'unreadable-source'):
        injection = """
import types
_capture_path = str(Path(__file__).with_name('lab-raw-preparation.py'))
_native_read, _native_open, _native_close = os.read, os.open, os.close
_native_lstat, _native_fstat = os.lstat, os.fstat
_fault_once = False
def _is_selected(descriptor):
    return os.readlink('/proc/self/fd/'+str(descriptor)) == _capture_path
def _fault_read(descriptor, count):
    global _fault_once
    chunk = _native_read(descriptor, count)
    if _is_selected(descriptor) and not _fault_once:
        _fault_once = True
        if FAULT == 'read-failure': raise OSError('injected scratch read failure')
        if FAULT == 'changed-read':
            observed = _native_lstat(_capture_path)
            os.utime(_capture_path, ns=(observed.st_atime_ns, observed.st_mtime_ns+1))
        if FAULT == 'changed-path':
            payload = Path(_capture_path).read_bytes()
            Path(_capture_path).unlink()
            Path(_capture_path).write_bytes(payload)
            Path(_capture_path).chmod(0o644)
    return chunk
def _fault_open(path, flags, *arguments):
    if str(path) == _capture_path and FAULT == 'unreadable-source': print('UNREADABLE_SOURCE_OPEN_ATTEMPTED')
    if str(path) == _capture_path and FAULT == 'changed-open':
        opened = _native_open(path,flags,*arguments)
        payload = Path(path).read_bytes()
        Path(path).unlink()
        Path(path).write_bytes(payload)
        Path(path).chmod(0o644)
        return opened
    return _native_open(path,flags,*arguments)
def _fault_close(descriptor):
    if _is_selected(descriptor) and FAULT == 'close-failure':
        _native_close(descriptor)
        raise OSError('injected scratch close failure')
    return _native_close(descriptor)
def _alter_size(observed):
    fields = {field:getattr(observed,field) for field in dir(observed) if field.startswith('st_')}
    fields['st_size'] = observed.st_size+1 if FAULT == 'short-read' else 131073
    return types.SimpleNamespace(**fields)
def _fault_lstat(path, *arguments, **keywords):
    observed = _native_lstat(path,*arguments,**keywords)
    return _alter_size(observed) if str(path) == _capture_path and FAULT in ('short-read','source-bound') else observed
def _fault_fstat(descriptor):
    observed = _native_fstat(descriptor)
    return _alter_size(observed) if _is_selected(descriptor) and FAULT in ('short-read','source-bound') else observed
os.read, os.open, os.close = _fault_read, _fault_open, _fault_close
os.lstat, os.fstat = _fault_lstat, _fault_fstat
""".replace('FAULT',repr(fault))
    if injection:
        entry_source = entry_source.replace("if __name__ == '__main__':", injection+"\nif __name__ == '__main__':",1)
    entry.write_text(entry_source)
    if fault == 'wrong-worker-entry':
        path = root / 'lab-raw-preparation.py'
        payload = path.read_text()
        prefix,suffix = payload.rsplit("\nif __name__ == '__main__':",1)
        path.write_text(prefix+"\nprint('WRONG_PINNED_ENTRY_EXECUTED')\nraise SystemExit(74)\n\nif __name__ == '__main__':"+suffix)
    if fault == 'source-limits':
        for filename in filenames:
            path = root / filename
            with path.open('a') as stream: stream.write(' ' * (131072-path.stat().st_size))
    if fault == 'oversized-source':
        path = root / 'lab-raw-preparation.py'
        with path.open('a') as stream: stream.write(' ' * (131073-path.stat().st_size))
    if fault == 'malformed-source':
        with (root / 'lab-repair-worker.py').open('a') as stream: stream.write('\nBROKEN SYNTAX !\n')
    pins = []
    for filename in filenames:
        path = root / filename
        payload = path.read_bytes()
        pins.append(dict(path=str(path), bytes=len(payload), uid=os.geteuid(), mode=0o644,
                         sha256=hashlib.sha256(payload).hexdigest()))
    state = str(root) + '/.puni/fleet-labs/observability-baseline'
    request = dict(schemaVersion=1,root=str(root),state=state,nonce='a'*32,pins=pins,
        expectedRaw=dict(device='1',inode='1',owner=os.geteuid(),mode='0600',links=1,
            logicalBytes='8589934592',allocatedBytes='4096',mtimeNs='1',ctimeNs='1'))
    for name in ('image','rawRequest','rawReceipt','rawProvenance','priorGuestRequest',
                 'priorGuestFailure','postBootEvidence','witness'):
        request[name] = state + '/' + name
        pins.append(dict(path=request[name],bytes=1,uid=os.geteuid(),mode=0o600,sha256='a'*64))
    if fault == 'duplicate-pin': pins.append(dict(pins[0]))
    if fault == 'missing-pin': pins.pop(1)
    if fault == 'digest': pins[1]['sha256'] = 'f'*64
    if fault == 'pin-size': pins[1]['bytes'] += 1
    if fault in ('pin-path','pin-sha256','pin-bytes','pin-uid','pin-mode'):
        field = fault[4:]
        pins[-1][field] = dict(path='relative',sha256='INVALID',bytes=True,uid=True,mode=420.0)[field]
    if fault == 'pin-fields': pins[-1]['foreign'] = 1
    if fault == 'request-shape': request['foreign'] = 1
    if fault == 'request-schema': request['schemaVersion'] = True
    if fault == 'request-root': request['root'] = 'relative'
    if fault == 'request-state': request['state'] = '/foreign'
    if fault == 'request-nonce': request['nonce'] = False
    if fault == 'request-evidence': request['image'] = False
    if fault == 'snapshot-shape': request['expectedRaw']['foreign'] = 1
    if fault == 'snapshot-quantity': request['expectedRaw']['device'] = True
    if fault == 'snapshot-owner': request['expectedRaw']['owner'] = True
    if fault == 'snapshot-mode': request['expectedRaw']['mode'] = 600
    if fault == 'snapshot-links': request['expectedRaw']['links'] = True
    payload = json.dumps(request,sort_keys=True,separators=(',',':')).encode()
    if fault in ('oversized-request','request-limit'):
        limit = 65537 if fault == 'oversized-request' else 65536
        pins[-1]['path'] += 'a'*(limit-len(payload))
        payload = json.dumps(request,sort_keys=True,separators=(',',':')).encode()
        assert len(payload) == limit
    if fault == 'whitespace-request': payload = b' \n'+payload+b' \n'
    if fault == 'reordered-request': payload = json.dumps(request,sort_keys=False,indent=2).encode()
    if fault == 'duplicate-json': payload = b'{"nonce":"' + b'a'*32 + b'",'+payload[1:]
    if fault == 'duplicate-nested-json': payload = payload.replace(b'"expectedRaw":{',b'"expectedRaw":{"device":"1",',1)
    if fault == 'malformed-json': payload = b'{'
    if fault == 'deep-json': payload = b'['*1001+b'0'+b']'*1001
    if fault == 'request-pins': payload = b'{"pins":true}'
    if fault == 'request-type': payload = b'[]'

    request_path.write_bytes(payload)
    request_path.chmod(0o600)
    digest = hashlib.sha256(payload).hexdigest()
    command = [sys.executable,'-I','-B',str(entry),str(request_path),digest]
    if scenario == 'worker':
        specification = importlib.util.spec_from_file_location('trusted_component',component_root / filenames[0])
        repair = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(repair)
        repair.HELPER = entry
        arguments = repair.service_arguments(request,str(request_path),digest)
        command = arguments[arguments.index('/usr/bin/python3'):]
    if fault == 'absent-request': request_path.unlink()
    if fault == 'missing-source': (root / 'lab-raw-preparation.py').unlink()
    if fault == 'unreadable-source':
        (root / 'lab-raw-preparation.py').chmod(0o200)
        pins[1]['mode'] = 0o200
    if fault == 'unsafe-source': (root / 'lab-raw-preparation.py').chmod(0o640)
    if fault == 'linked-source': os.link(root / 'lab-raw-preparation.py',root / 'linked.py')
    if fault == 'symlink-source':
        (root / 'lab-raw-preparation.py').rename(root / 'renamed.py')
        (root / 'lab-raw-preparation.py').symlink_to(root / 'renamed.py')
    if fault == 'unreadable-request': request_path.chmod(0o200)
    if fault == 'unsafe-request': request_path.chmod(0o640)
    if fault == 'wrong-worker-entry': command[command.index('-c')+2] = str(root / 'lab-raw-preparation.py')
    if fault == 'request-digest': command[-1] = 'f'*64
    if fault == 'arguments': command.insert(-2,'--foreign')
    if fault == 'entry-replacement':
        entry.write_text("print('UNVERIFIED_ENTRY_EXECUTED')\nraise SystemExit(73)\n")
    if fault == 'unreadable-source':
        payload = json.dumps(request,sort_keys=True,separators=(',',':')).encode()
        request_path.write_bytes(payload)
        command[-1] = hashlib.sha256(payload).hexdigest()
    if scenario == 'worker' and omission and omission != 'loader':
        index = command.index('-c') + 1
        command[index] = command[index].replace('if not predicate:', 'if not predicate and category != '+repr(omission)+':', 1)
    baseline = subprocess.run(command,capture_output=True,timeout=5)
    cache = pathlib.Path(importlib.util.cache_from_source(str(selected)))
    cache.parent.mkdir(exist_ok=True)
    substitute = root / 'harmless-cache-marker.py'
    substitute.write_text("print('UNPINNED_REPOSITORY_CACHE_EXECUTED')\nraise SystemExit(73)\n")
    py_compile.compile(str(substitute),cfile=str(cache),dfile=str(selected),doraise=True,
                       invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
    substituted = subprocess.run(command,capture_output=True,timeout=5)
    print(json.dumps(dict(baselineCode=baseline.returncode,baselineOut=baseline.stdout.decode(),
        baselineError=baseline.stderr.decode(),code=substituted.returncode,
        stdout=substituted.stdout.decode(),stderr=substituted.stderr.decode())))
`;

for (const scenario of ['coordinator', 'worker', 'lazy']) {
  for (const fault of ['valid', 'absent-request']) {
    test(`repair production ${scenario} ${fault} excludes substituted repository caches`, () => {
      const invocation = Bun.spawnSync(
        ['/usr/bin/python3.12', '-I', '-B', '-c', startup, import.meta.dir, scenario, fault],
        { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
      );
      expect(invocation.exitCode).toBe(0);
      expect(invocation.stderr.toString()).toBe('');
      const observation = JSON.parse(invocation.stdout.toString()) as StartupObservation;
      if (fault === 'valid') {
        expect(observation.baselineCode).toBe(0);
        expect(observation.baselineOut).toContain('ADMITTED_RAW\n');
        expect(observation.baselineOut).toContain('ADMITTED_ALLOCATION\n');
        expect(observation.baselineOut).toContain('ADMITTED_GEOMETRY\n');
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
}

function observeStartup(scenario: string, fault: string, omission = '') {
  const invocation = Bun.spawnSync(
    ['/usr/bin/python3.12', '-I', '-B', '-c', startup, import.meta.dir, scenario, fault, omission],
    { stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
  );
  expect(invocation.stderr.toString()).toBe('');
  expect(invocation.exitCode).toBe(0);
  return JSON.parse(invocation.stdout.toString()) as StartupObservation;
}

for (const scenario of ['coordinator', 'worker', 'lazy']) {
  test(`repair production ${scenario} watched loader omission executes the forbidden cache`, () => {
    const observation = observeStartup(scenario, 'valid', 'loader');
    expect(observation.baselineCode).toBe(0);
    expect(observation.stdout).toContain('UNPINNED_REPOSITORY_CACHE_EXECUTED');
    expect(observation.code).toBe(73);
  });
}

for (const fault of ['replace-initial', 'replace-lazy']) {
  for (const scenario of ['coordinator', 'worker']) {
    test(`repair production ${scenario} ${fault} executes immutable admitted buffers`, () => {
      const observation = observeStartup(scenario, fault);
      expect(observation.baselineCode).toBe(0);
      expect(observation.code).toBe(1);
      expect(observation.baselineOut).toContain('ADMITTED_ALLOCATION\n');
      expect(observation.baselineOut).toContain('ADMITTED_GEOMETRY\n');
      expect(observation.stdout).not.toContain('REPLACED_PATH_EXECUTED');
      expect(observation.stdout).not.toContain('UNPINNED_REPOSITORY_CACHE_EXECUTED');
      expect(observation.stderr).toBe('repair-source-digest\n');
    });
  }
}

const sourceFaults = [
  ['unsafe-source', 'repair-source-unsafe'],
  ['linked-source', 'repair-source-unsafe'],
  ['unsafe-request', 'repair-source-unsafe'],
  ['digest', 'repair-source-digest'],
  ['pin-size', 'repair-source-digest'],
  ['request-digest', 'repair-request-digest'],
  ['oversized-source', 'repair-source-bound'],
  ['oversized-request', 'repair-source-bound'],
  ['source-bound', 'repair-source-bound'],
  ['short-read', 'repair-source-bound'],
  ['changed-read', 'repair-source-changed'],
  ['changed-path', 'repair-source-changed'],
  ['changed-open', 'repair-source-changed'],
  ['duplicate-pin', 'repair-source-pin-duplicate'],
  ['pin-path', 'repair-source-pin-invalid'],
  ['pin-sha256', 'repair-source-pin-invalid'],
  ['pin-bytes', 'repair-source-pin-invalid'],
  ['pin-uid', 'repair-source-pin-invalid'],
  ['pin-mode', 'repair-source-pin-invalid'],
  ['pin-fields', 'repair-source-pin-invalid'],
  ['request-shape', 'repair-source-request-shape'],
  ['request-schema', 'repair-source-request-shape'],
  ['request-root', 'repair-source-request-shape'],
  ['request-state', 'repair-source-request-shape'],
  ['request-nonce', 'repair-source-request-shape'],
  ['request-evidence', 'repair-source-request-shape'],
  ['snapshot-shape', 'repair-source-snapshot-invalid'],
  ['snapshot-quantity', 'repair-source-snapshot-invalid'],
  ['snapshot-owner', 'repair-source-snapshot-invalid'],
  ['snapshot-mode', 'repair-source-snapshot-invalid'],
  ['snapshot-links', 'repair-source-snapshot-invalid'],
  ['aggregate-bound', 'repair-sources-bound'],
  ['arguments', 'repair-arguments'],
] as const;

for (const [fault, category] of sourceFaults) {
  test(`repair production ${fault} refuses before helpers; watched ${category} omission admits`, () => {
    const observation = observeStartup('coordinator', fault);
    expect(observation.baselineCode).toBe(1);
    expect(observation.baselineOut).toBe('');
    expect(observation.baselineError).toBe(`${category}\n`);
    const omitted = observeStartup('coordinator', fault, category);
    expect(omitted.baselineCode).toBe(0);
    expect(omitted.baselineOut).toContain('ADMITTED_GEOMETRY\n');
    expect(omitted.baselineError).toBe('');
  });
}

for (const [fault, category] of [
  ['missing-source', 'raw-state-absent'],
  ['unreadable-request', 'raw-state-unreadable'],
  ['symlink-source', 'repair-source-unsafe'],
  ['malformed-json', 'repair-source-request-invalid'],
  ['deep-json', 'repair-source-request-invalid'],
  ['malformed-source', 'repair-source-syntax-invalid'],
  ['request-pins', 'repair-source-request-invalid'],
  ['request-type', 'repair-source-request-invalid'],
  ['missing-pin', 'repair-source-pin-absent'],
  ['read-failure', 'repair-source-unavailable'],
  ['close-failure', 'repair-source-unavailable'],
  ['unpinned-sibling', 'repair-source-unselected'],
] as const) {
  test(`repair production ${fault} safely refuses its actual boundary fault`, () => {
    const observation = observeStartup('coordinator', fault);
    expect(observation.baselineCode).toBe(1);
    expect(observation.baselineOut).not.toContain('ADMITTED_GEOMETRY');
    expect(observation.baselineOut).not.toContain('UNPINNED_SIBLING_EXECUTED');
    expect(observation.baselineError).toBe(`${category}\n`);
  });
}

test('repair actual worker bootstrap refuses substituted entry bytes before entry execution', () => {
  const observation = observeStartup('worker', 'entry-replacement');
  expect(observation.baselineCode).toBe(1);
  expect(observation.baselineOut).toBe('');
  expect(observation.baselineError).toBe('repair-source-digest\n');
  const omitted = observeStartup('worker', 'entry-replacement', 'repair-source-digest');
  expect(omitted.baselineCode).toBe(73);
  expect(omitted.baselineOut).toBe('UNVERIFIED_ENTRY_EXECUTED\n');
});

test('repair watched loader omission executes the rejected sibling', () => {
  const observation = observeStartup('coordinator', 'unpinned-sibling', 'loader');
  expect(observation.baselineOut).toContain('UNPINNED_SIBLING_EXECUTED');
});

test('repair production unreadable source refuses before open; watched readability omission attempts open', () => {
  const observation = observeStartup('coordinator', 'unreadable-source');
  expect(observation.baselineCode).toBe(1);
  expect(observation.baselineOut).toBe('');
  expect(observation.baselineError).toBe('raw-state-unreadable\n');
  const omitted = observeStartup('coordinator', 'unreadable-source', 'raw-state-unreadable');
  expect(omitted.baselineOut).toBe('UNREADABLE_SOURCE_OPEN_ATTEMPTED\n');
  expect(omitted.baselineError).toBe('raw-state-unreadable\n');
});

test('repair watched source syntax dependency failure loses safe refusal before any helper', () => {
  const omitted = observeStartup('coordinator', 'malformed-source', 'syntax');
  expect(omitted.baselineCode).toBe(1);
  expect(omitted.baselineOut).toBe('');
  expect(omitted.baselineError).toContain('SyntaxError');
});

for (const fault of ['external-spec', 'symlink-after-capture']) {
  test(`repair production ${fault} refuses an external repository alias before execution`, () => {
    const observation = observeStartup('coordinator', fault);
    expect(observation.baselineCode).toBe(1);
    expect(observation.baselineOut).not.toContain('FOREIGN_REPOSITORY_SOURCE_EXECUTED');
    expect(observation.baselineError).toBe('repair-source-unselected\n');
    const omitted = observeStartup('coordinator', fault, 'loader');
    expect(omitted.baselineCode).toBe(73);
    expect(omitted.baselineOut).toContain('FOREIGN_REPOSITORY_SOURCE_EXECUTED');
  });
}

for (const [fault, category] of [
  ['missing-pin', 'repair-source-pin-absent'],
  ['request-pins', 'repair-source-request-invalid'],
  ['unpinned-sibling', 'repair-source-unselected'],
] as const) {
  test(`repair production watched ${category} omission loses the bounded refusal`, () => {
    const observation = observeStartup('coordinator', fault, category);
    expect(observation.baselineCode).toBe(1);
    expect(observation.baselineError).not.toBe(`${category}\n`);
    expect(observation.baselineOut).not.toContain('ADMITTED_GEOMETRY');
  });
}

for (const fault of ['source-limits', 'request-limit']) {
  for (const scenario of ['coordinator', 'worker']) {
    test(`repair production ${scenario} admits the exact ${fault} boundary`, () => {
      const observation = observeStartup(scenario, fault);
      expect(observation.baselineCode).toBe(0);
      expect(observation.baselineOut).toContain('ADMITTED_GEOMETRY\n');
      expect(observation.baselineError).toBe('');
      expect(observation.code).toBe(0);
      expect(observation.stdout).not.toContain('UNPINNED_REPOSITORY_CACHE_EXECUTED');
    });
  }
}

test('repair worker bootstrap fixed entry role refuses another pinned Python source; omission executes it', () => {
  const observation = observeStartup('worker', 'wrong-worker-entry');
  expect(observation.baselineCode).toBe(1);
  expect(observation.baselineOut).toBe('');
  expect(observation.baselineError).toBe('repair-arguments\n');
  const omitted = observeStartup('worker', 'wrong-worker-entry', 'repair-arguments');
  expect(omitted.baselineCode).toBe(74);
  expect(omitted.baselineOut).toContain('WRONG_PINNED_ENTRY_EXECUTED');
});

for (const encoding of ['whitespace-request', 'reordered-request']) {
  for (const scenario of ['coordinator', 'worker']) {
    test(`repair production ${scenario} request encodings ${encoding} preserve source admission`, () => {
      const observation = observeStartup(scenario, encoding);
      expect(observation.baselineCode).toBe(0);
      expect(observation.baselineOut).toContain('ADMITTED_RAW\n');
      expect(observation.baselineOut).toContain('ADMITTED_ALLOCATION\n');
      expect(observation.baselineOut).toContain('ADMITTED_GEOMETRY\n');
      expect(observation.baselineError).toBe('');
      expect(observation.code).toBe(0);
      expect(observation.stdout).toBe(observation.baselineOut);
      expect(observation.stderr).toBe('');
      expect(observation.stdout).not.toContain('UNPINNED_REPOSITORY_CACHE_EXECUTED');
    });
  }
}

for (const fault of ['duplicate-json', 'duplicate-nested-json']) {
  for (const scenario of ['coordinator', 'worker']) {
    test(`repair production ${scenario} duplicate members ${fault} refuse; watched hook omission admits`, () => {
      const observation = observeStartup(scenario, fault);
      expect(observation.baselineCode).toBe(1);
      expect(observation.baselineOut).toBe('');
      expect(observation.baselineError).toBe('repair-source-json-duplicate\n');
      const omitted = observeStartup(scenario, fault, 'repair-source-json-duplicate');
      expect(omitted.baselineCode).toBe(0);
      expect(omitted.baselineOut).toContain('ADMITTED_GEOMETRY\n');
      expect(omitted.baselineError).toBe('');
    });
  }
}
