import { expect, test } from 'bun:test';

const program = String.raw`
import ast, ctypes, errno, fcntl, importlib.util, json, os, pathlib, shutil, stat, sys, tempfile
scenario, omission = sys.argv[2:4]
with tempfile.TemporaryDirectory(prefix='puni-settlement111-') as scratch:
    root = pathlib.Path(scratch)
    helpers = root / 'helpers'
    helpers.mkdir(mode=0o700)
    names = ('lab-raw-repair.py', 'lab-raw-preparation.py', 'lab-repair-worker.py',
             'lab-seed-preparation.py', 'lab-guest-preparation.py', 'lab-raw-allocation.py')
    for name in names:
        shutil.copyfile(pathlib.Path(sys.argv[1]) / name, helpers / name)
    source = helpers / names[0]
    if omission != 'none':
        tree = ast.parse(source.read_text())
        changes = []
        flag_assignment = False
        class Omit(ast.NodeTransformer):
            def visit_Assign(self, node):
                if omission == 'cleanup-primary' and any(isinstance(target, ast.Name) and target.id == 'failures' for target in node.targets):
                    node.value = ast.List(elts=[], ctx=ast.Load())
                    changes.append(omission)
                global flag_assignment
                flag_assignment = any(isinstance(target, ast.Name) and target.id == 'flags' for target in node.targets)
                revised = self.generic_visit(node)
                flag_assignment = False
                return revised
            def visit_Expr(self, node):
                call = node.value
                if isinstance(call, ast.Call):
                    if (isinstance(call.func, ast.Name) and call.func.id == 'require'
                            and len(call.args) == 2 and isinstance(call.args[1], ast.Constant)
                            and call.args[1].value == omission):
                        changes.append(omission)
                        return ast.Expr(value=call.args[0])
                    if (isinstance(call.func, ast.Attribute) and call.func.attr == 'close'
                            and len(call.args) == 1 and isinstance(call.args[0], ast.Name)
                            and call.args[0].id == 'descriptor_to_close' and omission == 'success-close-fd'):
                        changes.append(omission)
                        return ast.Pass()
                    if (isinstance(call.func, ast.Attribute) and call.func.attr == 'close'
                            and isinstance(call.func.value, ast.Name)
                            and call.func.value.id == 'mapping_to_close' and omission == 'success-close-map'):
                        changes.append(omission)
                        return ast.Pass()
                    if (isinstance(call.func, ast.Attribute) and call.func.attr == 'append'
                            and len(call.args) == 1 and isinstance(call.args[0], ast.Name)
                            and call.args[0].id == 'cleanup_failure' and omission == 'cleanup-causes'):
                        changes.append(omission)
                        return ast.Pass()
                    if (omission == 'prefix' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'inspect_file'):
                        changes.append(omission)
                        return ast.Pass()
                    if (omission == 'cleanup-fd' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'close' and isinstance(call.func.value, ast.Name)
                            and call.func.value.id == 'os' and len(call.args) == 1
                            and isinstance(call.args[0], ast.Name) and call.args[0].id == 'resource'):
                        changes.append(omission)
                        return ast.Pass()
                    if (omission == 'cleanup-map' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'close' and isinstance(call.func.value, ast.Name)
                            and call.func.value.id == 'resource'):
                        changes.append(omission)
                        return ast.Pass()
                return self.generic_visit(node)
            def visit_Attribute(self, node):
                if (flag_assignment and omission.startswith('flag-') and isinstance(node.value, ast.Name)
                        and node.value.id == 'os' and node.attr == omission[5:]):
                    changes.append(omission)
                    return ast.Constant(value=0)
                return self.generic_visit(node)
        publisher = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                         and node.name == 'publish_settlement_record')
        Omit().visit(publisher)
        assert len(changes) == 1, ('expected one production omission', changes)
        source.write_text(ast.unparse(ast.fix_missing_locations(tree)))
    spec = importlib.util.spec_from_file_location('repair', source)
    repair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(repair)
    raw, writer = repair.raw, repair.writer
    assert source.stat().st_size < 131072
    assert sum((helpers/name).stat().st_size for name in names) <= 786432
    directory = root / 'records'
    directory.mkdir(mode=0o700)
    parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    borrowed = parent
    destination = directory / 'settlement-request.json'
    name, record = destination.name, {'text': 'x'*8200}
    expected = b'{"text":"' + b'x'*8200 + b'"}'
    if scenario.startswith('role-'):
        name = 'settlement-' + scenario[5:] + '.json'
        destination = directory / name
    events, mappings, closes = [], [], []
    descriptors = []
    native_call, native_close = writer.native_call, os.close
    native_ioctl, native_fcntl = fcntl.ioctl, fcntl.fcntl
    native_mmap = writer.mmap.mmap
    native_address = ctypes.addressof
    writes, injected = 0, False
    expected_category = None
    if scenario.startswith('bytes-'):
        length = int(scenario[6:])
        record = {'text': 'x'*(length-11)}
        expected = b'{"text":"' + b'x'*(length-11) + b'"}'
        assert len(expected) == length
    elif scenario in ('empty', 'list', 'scalar'):
        record = {'empty': {}, 'list': [], 'scalar': 'text'}[scenario]
        expected_category = 'settlement-record'
    elif scenario == 'oversized':
        record = {'text': 'x'*65536}
        expected_category = 'raw-record-bound'
    elif scenario in ('foreign-name', 'traversal'):
        name = 'foreign.json' if scenario == 'foreign-name' else '../foreign.json'
        expected_category = 'settlement-name'
    elif scenario.startswith('parent-'):
        expected_category = 'settlement-parent'
        if scenario == 'parent-foreign':
            other = root / 'other'; other.mkdir(mode=0o700)
            borrowed = os.open(other, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        elif scenario == 'parent-mode': os.chmod(directory, 0o755)
        elif scenario == 'parent-unreadable': os.chmod(directory, 0o000)
        elif scenario == 'parent-symlink':
            directory.rename(root / 'original')
            directory.symlink_to(root / 'original', target_is_directory=True)
        elif scenario == 'parent-absent': directory.rename(root / 'original')
    elif scenario.startswith('platform-'):
        repair.platform.system = lambda: 'Foreign' if scenario == 'platform-os' else 'Linux'
        repair.platform.machine = lambda: 'aarch64' if scenario == 'platform-machine' else 'x86_64'
        expected_category = 'settlement-platform'
    elif scenario in ('repeated', 'existing-symlink'):
        expected_category = 'settlement-open'
        if scenario == 'repeated': destination.write_bytes(b'old'); destination.chmod(0o600)
        else: destination.symlink_to(root / 'foreign-target')
    elif scenario.startswith('flag-'):
        expected_category = 'open-flags'
    elif scenario.startswith('file-'): expected_category = 'settlement-file'
    elif scenario.startswith('direct-'): expected_category = 'settlement-direct'
    elif scenario == 'alignment': expected_category = 'settlement-alignment'
    elif scenario.startswith('prefix-'):
        expected_category = {'prefix-unwritten': 'raw-map-uninitialized',
                             'prefix-hole': 'raw-allocation-invalid',
                             'prefix-extra': 'raw-map-coverage',
                             'prefix-helper-close': 'helper-close'}[scenario]
    elif scenario.startswith('open-'): expected_category = 'settlement-open'
    elif scenario.startswith('allocate-'): expected_category = 'repair-allocation-failed'
    elif scenario.startswith('write-'): expected_category = 'settlement-write'
    elif scenario.startswith('truncate-'): expected_category = 'settlement-truncate'
    elif scenario.startswith('read-'): expected_category = 'settlement-content'
    elif scenario.startswith('sync-file'): expected_category = 'settlement-file-sync'
    elif scenario.startswith('sync-directory'): expected_category = 'settlement-directory-sync'
    elif scenario == 'close-file': expected_category = 'file-close'
    elif scenario == 'close-map': expected_category = 'map-close'
    elif scenario in ('completion', 'content-during-sync'): expected_category = 'settlement-completion'
    elif scenario.startswith('cleanup-') or scenario == 'repeat-partial': expected_category = 'settlement-write'

    if scenario == 'parent-absent': expected_category = 'FileNotFoundError'
    if scenario in ('empty', 'list', 'scalar'):
        expected = {'empty': b'{}', 'list': b'[]', 'scalar': b'"text"'}[scenario]

    class Map:
        def __init__(self, *arguments, **keywords):
            self.inner = native_mmap(*arguments, **keywords)
            self.closed = False
            mappings.append(self)
        def __setitem__(self, key, value): self.inner[key] = value
        def __getitem__(self, key): return self.inner[key]
        def close(self):
            assert not self.closed, 'mapping close retried'
            self.closed = True
            self.inner.close()
            if scenario in ('close-map', 'cleanup-compound'): raise OSError('map-close')
    writer.mmap.mmap = Map
    def address(mapping):
        return native_address(mapping) + (1 if scenario == 'alignment' else 0)
    # ctypes receives the real anonymous mapping through the wrapper below.
    native_character = ctypes.c_char
    original_from_buffer = native_character.from_buffer
    class Character:
        @staticmethod
        def from_buffer(mapping): return original_from_buffer(mapping.inner)
    ctypes.c_char = Character
    ctypes.addressof = address

    def close(descriptor):
        if descriptor < 0: raise RuntimeError('invalid-cleanup')
        if descriptor in descriptors:
            closes.append(descriptor)
            assert closes.count(descriptor) == 1, 'file close retried'
            events.append('close-file')
            native_close(descriptor)
            if scenario in ('close-file', 'cleanup-compound'): raise OSError('file-close')
        else:
            native_close(descriptor)
            if scenario == 'prefix-helper-close': raise OSError('helper-close')
    os.close = close
    def mutate_file(descriptor):
        if scenario == 'parent-during': os.chmod(directory, 0o755)
        elif scenario == 'parent-replaced':
            directory.rename(root / 'original')
            directory.symlink_to(root / 'original', target_is_directory=True)
        elif scenario == 'file-mode': os.chmod(destination, 0o640)
        elif scenario == 'file-links': os.link(destination, root / 'alias')
        elif scenario == 'file-substituted':
            destination.rename(root / 'original-file')
            destination.write_bytes(b'x'*4096); destination.chmod(0o600)
        elif scenario == 'file-size': os.truncate(destination, 8192)
        elif scenario == 'file-fd':
            foreign = os.open(root / 'foreign', os.O_RDWR | os.O_CREAT | os.O_CLOEXEC, 0o600)
            os.dup2(foreign, descriptor, inheritable=False); native_close(foreign)
        elif scenario == 'direct-cleared':
            native_fcntl(descriptor, fcntl.F_SETFL, native_fcntl(descriptor, fcntl.F_GETFL) & ~os.O_DIRECT)
        elif scenario == 'direct-cloexec': native_fcntl(descriptor, fcntl.F_SETFD, 0)
        elif scenario == 'direct-access':
            reopened = os.open(destination, os.O_RDONLY | os.O_DIRECT | os.O_CLOEXEC | os.O_DSYNC)
            os.dup2(reopened, descriptor, inheritable=False); native_close(reopened)
        elif scenario in ('prefix-unwritten', 'prefix-hole'):
            mode = 0x11 if scenario == 'prefix-unwritten' else 0x03
            assert native_call(285, ctypes.c_int(descriptor), ctypes.c_int(mode),
                               ctypes.c_longlong(0), ctypes.c_longlong(4096)) == 0
        elif scenario == 'prefix-helper-close': os.chmod(destination, 0o640)

    def syscall(number, *arguments):
        global writes, injected
        number = int(number)
        if number == 257:
            events.append('open')
            requested_flags = arguments[2].value
            required_flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_DIRECT | os.O_DSYNC
            unsafe_flags = scenario.startswith('flag-') and requested_flags & required_flags != required_flags
        elif number == 285:
            offset, count = arguments[2].value, arguments[3].value
            assert offset == events.count('allocate')*4096 and count == 4096
            events.append('allocate')
        elif number == 18:
            descriptor, pointer, count, offset = [argument.value for argument in arguments]
            assert count == 4096
            assert offset == writes*4096
            if pointer % 4096 == 0:
                block = ctypes.string_at(pointer, count)
                assert block == expected[offset:offset+4096].ljust(4096, b'\0'), 'noncanonical padded write'
            events.append('write'); writes += 1
        elif number == 17: events.append('read')
        elif number == 77: events.append('truncate')
        elif number == 74: events.append('sync-directory' if arguments[0].value == borrowed else 'sync-file')
        if number == 257 and scenario in ('open-error', 'open-eintr'):
            arguments = (ctypes.c_int(-1), *arguments[1:])
        observed = native_call(number, *arguments)
        if number == 257:
            if observed >= 0: descriptors.append(observed)
            if unsafe_flags:
                if observed >= 0:
                    native_close(observed); closes.append(observed); events.append('close-file')
                raise RuntimeError('unsafe-open-flags')
        if number == 18 and writes == 1: mutate_file(arguments[0].value)
        stage = {257: 'open', 285: 'allocate', 18: 'write', 77: 'truncate', 17: 'read'}.get(number)
        if stage and scenario in (stage+'-error', stage+'-eintr', stage+'-short'):
            if scenario.endswith('eintr'): ctypes.set_errno(errno.EINTR)
            return 2048 if scenario.endswith('short') else -1
        if number == 18 and (scenario.startswith('cleanup-') or scenario == 'repeat-partial'): return -1
        if number == 74:
            stage = 'sync-directory' if arguments[0].value == borrowed else 'sync-file'
            if scenario in (stage+'-error', stage+'-eintr'):
                ctypes.set_errno(errno.EINTR if scenario.endswith('eintr') else errno.EIO)
                return -1
            if stage == 'sync-directory' and scenario == 'completion': os.chmod(destination, 0o640)
            if stage == 'sync-file' and scenario == 'content-during-sync':
                with destination.open('r+b', buffering=0) as changed: changed.write(b'y')
        if number == 17 and scenario == 'read-content':
            ctypes.memset(arguments[1], 0x79, 1)
        return observed
    writer.native_call = syscall
    def ioctl(descriptor, operation, packet, mutate=True):
        events.append('inspect')
        observed = native_ioctl(descriptor, operation, packet, mutate)
        if scenario == 'prefix-extra':
            inspector = raw.load_inspector()
            fields = list(inspector.EXTENT.unpack_from(packet, inspector.HEADER.size))
            fields[2] += 4096
            inspector.EXTENT.pack_into(packet, inspector.HEADER.size, *fields)
        return observed
    fcntl.ioctl = ioctl
    def flags(descriptor, operation, *arguments):
        observed = native_fcntl(descriptor, operation, *arguments)
        if (scenario == 'direct-dsync' and writes and descriptor in descriptors
                and operation == fcntl.F_GETFL): return observed & ~os.O_DSYNC
        return observed
    fcntl.fcntl = flags
    # The helper compound test injects its primary ioctl failure only after the actual native query.
    if scenario == 'prefix-helper-close':
        def ioctl_failure(descriptor, operation, packet, mutate=True):
            ioctl(descriptor, operation, packet, mutate)
            raise RuntimeError('helper-primary')
        fcntl.ioctl = ioctl_failure
        # Leave the actual private file intact, so the FIEMAP dependency is reached.
        def mutate_file(descriptor): pass

    def causes(failure):
        found, visited = [], set()
        def collect(current):
            if current is None or id(current) in visited: return
            visited.add(id(current)); found.extend((str(current), type(current).__name__))
            if isinstance(current, BaseExceptionGroup):
                for nested in current.exceptions: collect(nested)
            collect(current.__cause__); collect(current.__context__)
        collect(failure)
        return found
    failure = None
    try:
        repair.publish_settlement_record(directory, borrowed, name, record)
        if scenario == 'repeat-published':
            first_bytes = destination.read_bytes()
            try: repair.publish_settlement_record(directory, borrowed, name, {'new': 'forbidden'})
            except raw.PreparationRefusal as repeated:
                assert str(repeated) == 'settlement-open'
            else: raise AssertionError('repeated publication admitted')
            assert destination.read_bytes() == first_bytes
            events.pop()
    except BaseException as caught:
        failure = caught
    observed_causes = [] if failure is None else causes(failure)
    if scenario == 'repeat-partial':
        partial = destination.read_bytes()
        try: repair.publish_settlement_record(directory, borrowed, name, {'new': 'forbidden'})
        except raw.PreparationRefusal as repeated: assert str(repeated) == 'settlement-open'
        else: raise AssertionError('partial publication retried')
        assert destination.read_bytes() == partial
        events.pop()
    try:
        os.fstat(parent); os.fstat(borrowed)
        for stage in ('open', 'read', 'truncate', 'sync-file', 'sync-directory'):
            assert events.count(stage) <= 1, ('syscall retried', stage, events)
        assert omission == 'success-close-fd' or 'sync-directory' not in events or events.index('sync-file') < events.index('close-file') < events.index('sync-directory')
        if omission == 'none':
            assert 'invalid-cleanup' not in observed_causes, observed_causes
            if expected_category is None or scenario.startswith('flag-'):
                assert failure is None, (scenario, observed_causes, events)
                assert destination.read_bytes() == expected
                assert stat.S_IMODE(destination.stat().st_mode) == 0o600
                blocks = (len(expected)+4095)//4096
                assert events[:1+blocks*3] == ['open'] + ['allocate', 'write', 'inspect']*blocks, events
                assert events.count('truncate') == int(len(expected)%4096 != 0)
                assert events[-4:] == ['read', 'sync-file', 'close-file', 'sync-directory'], events
            else:
                assert expected_category in observed_causes, (scenario, expected_category, observed_causes, events)
                if scenario.startswith(('write-', 'allocate-', 'prefix-', 'cleanup-')):
                    assert events.count('allocate') == 1 and events.count('write') <= 1, events
                    assert 'sync-directory' not in events
                if scenario == 'prefix-helper-close': assert 'helper-primary' in observed_causes
                if scenario == 'cleanup-compound':
                    assert 'map-close' in observed_causes and 'file-close' in observed_causes
                if scenario in ('empty', 'list', 'scalar', 'oversized', 'foreign-name', 'traversal') or scenario.startswith('parent-') and scenario not in ('parent-during', 'parent-replaced'):
                    assert 'open' not in events
                if scenario == 'repeated': assert destination.read_bytes() == b'old'
                if descriptors and scenario not in ('existing-symlink', 'repeated'):
                    assert destination.exists() or scenario == 'file-substituted', 'partial file deleted'
        else:
            if omission.startswith('flag-'):
                assert 'unsafe-open-flags' in observed_causes, observed_causes
            elif omission in ('cleanup-map', 'success-close-map'):
                assert any(not mapping.closed and not mapping.inner.closed for mapping in mappings), 'mapping omission failed to leak'
            elif omission in ('cleanup-fd', 'success-close-fd'):
                assert any(descriptor not in closes and os.fstat(descriptor).st_nlink == 1 for descriptor in descriptors), 'FD omission failed to leak'
            elif omission == 'cleanup-causes':
                assert 'settlement-write' in observed_causes and 'map-close' not in observed_causes and 'file-close' not in observed_causes, observed_causes
            elif omission == 'cleanup-primary':
                assert failure is None, observed_causes
            elif omission == 'prefix':
                assert events.count('allocate') > 1, ('unsafe next allocation not witnessed', observed_causes, events)
            elif expected_category == 'open-flags': raise AssertionError('unrecognized omission')
            else:
                assert expected_category not in observed_causes, ('omission did not change refusal', scenario, observed_causes, events)
            print(json.dumps({'scenario': scenario, 'omission': omission, 'witness': observed_causes or ['unsafe-publication'], 'events': events}))
        if omission not in ('cleanup-fd', 'success-close-fd'):
            assert len(closes) == len(descriptors), ('owned descriptor leaked', closes, descriptors)
        if omission not in ('cleanup-map', 'success-close-map'): assert all(mapping.closed for mapping in mappings), 'owned mapping leaked'
    finally:
        os.close = native_close
        ctypes.c_char = native_character
        ctypes.addressof = native_address
        for mapping in mappings:
            if not mapping.closed: mapping.inner.close()
        for descriptor in descriptors:
            if descriptor not in closes: native_close(descriptor)
        native_close(parent)
        if borrowed != parent: native_close(borrowed)
        if directory.exists(): os.chmod(directory, 0o700)
`;

function runPublication(scenario: string, omission = 'none') {
  const execution = Bun.spawnSync(
    [
      '/usr/bin/python3',
      '-I',
      '-B',
      '-c',
      program,
      Bun.env['PUNI_TASK111_SOURCE'] ?? import.meta.dir,
      scenario,
      omission,
    ],
    { stdout: 'pipe', stderr: 'pipe', timeout: 15_000 },
  );
  expect(execution.stderr.toString()).toBe('');
  expect(execution.exitCode).toBe(0);
  if (omission !== 'none') console.log(execution.stdout.toString().trim());
}

for (const scenario of [
  'repeat-published',
  'role-request',
  'role-execution',
  'role-ready',
  'role-counter',
  'role-drain',
  'role-barrier',
  'role-certificate',
  'role-receipt',
  'role-failure',
  'bytes-12',
  'bytes-4096',
  'bytes-8192',
  'bytes-65535',
]) {
  test(`publishes exact canonical bytes and ordered durability: ${scenario}`, () => {
    runPublication(scenario);
  });
}

const boundaries = [
  ['platform-os', 'settlement-platform'],
  ['platform-machine', 'settlement-platform'],
  ['empty', 'settlement-record'],
  ['list', 'settlement-record'],
  ['scalar', 'settlement-record'],
  ['foreign-name', 'settlement-name'],
  ['traversal', 'settlement-name'],
  ['parent-foreign', 'settlement-parent'],
  ['parent-mode', 'settlement-parent'],
  ['parent-unreadable', 'settlement-parent'],
  ['parent-symlink', 'settlement-parent'],
  ['parent-during', 'settlement-parent'],
  ['parent-replaced', 'settlement-parent'],
  ['file-mode', 'settlement-file'],
  ['file-links', 'settlement-file'],
  ['file-substituted', 'settlement-file'],
  ['file-size', 'settlement-file'],
  ['file-fd', 'settlement-file'],
  ['direct-cleared', 'settlement-direct'],
  ['direct-cloexec', 'settlement-direct'],
  ['direct-access', 'settlement-direct'],
  ['direct-dsync', 'settlement-direct'],
  ['alignment', 'settlement-alignment'],
  ['prefix-unwritten', 'prefix'],
  ['prefix-hole', 'prefix'],
  ['prefix-extra', 'prefix'],
  ['open-error', 'settlement-open'],
  ['open-eintr', 'settlement-open'],
  ['write-error', 'settlement-write'],
  ['write-short', 'settlement-write'],
  ['write-eintr', 'settlement-write'],
  ['truncate-error', 'settlement-truncate'],
  ['truncate-eintr', 'settlement-truncate'],
  ['read-error', 'settlement-content'],
  ['read-short', 'settlement-content'],
  ['read-eintr', 'settlement-content'],
  ['read-content', 'settlement-content'],
  ['sync-file-error', 'settlement-file-sync'],
  ['sync-file-eintr', 'settlement-file-sync'],
  ['sync-directory-error', 'settlement-directory-sync'],
  ['sync-directory-eintr', 'settlement-directory-sync'],
  ['success-close-fd', 'success-close-fd'],
  ['success-close-map', 'success-close-map'],
  ['cleanup-primary', 'cleanup-primary'],
  ['cleanup-compound', 'cleanup-causes'],
  ['content-during-sync', 'settlement-completion'],
  ['completion', 'settlement-completion'],
  ['cleanup-fd', 'cleanup-fd'],
  ['cleanup-map', 'cleanup-map'],
] as const;
for (const [scenario, omission] of boundaries) {
  test(`refuses ${scenario}; watched production omission ${omission}`, () => {
    runPublication(scenario);
    runPublication(scenario, omission);
  });
}
for (const scenario of [
  'oversized',
  'repeated',
  'existing-symlink',
  'parent-absent',
  'allocate-error',
  'allocate-eintr',
  'repeat-partial',
  'close-file',
  'close-map',
  'cleanup-compound',
  'prefix-helper-close',
]) {
  test(`retains failure and resources: ${scenario}`, () => {
    runPublication(scenario);
  });
}
for (const flag of [
  'O_EXCL',
  'O_NOFOLLOW',
  'O_CLOEXEC',
  'O_DIRECT',
  'O_DSYNC',
  'O_RDWR',
  'O_CREAT',
]) {
  test(`requires original creation flag ${flag}`, () => {
    runPublication(`flag-${flag}`);
    runPublication(`flag-${flag}`, `flag-${flag}`);
  });
}
