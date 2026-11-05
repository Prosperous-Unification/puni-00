import { expect, test } from 'bun:test';

const program = String.raw`
import ast, errno, importlib.util, os, pathlib, shutil, stat, sys, tempfile, types

scenario, omission = sys.argv[2:4]
with tempfile.TemporaryDirectory(prefix='puni-live-open106-') as scratch:
    root = pathlib.Path(scratch)
    helpers = root / 'helpers'
    helpers.mkdir(mode=0o700)
    for name in ('lab-raw-repair.py', 'lab-raw-preparation.py', 'lab-repair-worker.py',
                 'lab-seed-preparation.py', 'lab-guest-preparation.py', 'lab-raw-allocation.py'):
        shutil.copyfile(pathlib.Path(sys.argv[1]) / name, helpers / name)
    source = helpers / 'lab-raw-repair.py'
    if omission != 'none':
        tree = ast.parse(source.read_text())
        removed = []
        for function in tree.body:
            if isinstance(function, ast.FunctionDef) and function.name == 'open_live_original':
                for statement in function.body:
                    if (omission in ('readonly', 'nofollow', 'nonblock', 'cloexec')
                            and isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Call)
                            and isinstance(statement.value.func, ast.Attribute) and statement.value.func.attr == 'open'):
                        flags = statement.value.args[1]
                        if omission == 'readonly':
                            statement.value.args[1] = ast.BinOp(left=flags, op=ast.BitOr(),
                                right=ast.Attribute(value=ast.Name(id='os', ctx=ast.Load()), attr='O_RDWR', ctx=ast.Load()))
                        else:
                            flag = {'nofollow':'O_NOFOLLOW', 'nonblock':'O_NONBLOCK', 'cloexec':'O_CLOEXEC'}[omission]
                            statement.value.args[1] = ast.BinOp(left=flags, op=ast.BitAnd(),
                                right=ast.UnaryOp(op=ast.Invert(), operand=ast.Attribute(
                                    value=ast.Name(id='os', ctx=ast.Load()), attr=flag, ctx=ast.Load())))
                        removed.append(omission)
                for statement in list(function.body):
                    if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                        continue
                    call = statement.value
                    name = call.func.id if isinstance(call.func, ast.Name) else ''
                    category = call.args[-1].value if call.args and isinstance(call.args[-1], ast.Constant) else ''
                    if (omission == 'reservation' and name == 'check_reservation'
                            or omission == 'before' and category == 'repair-live-original-unsafe'):
                        function.body.remove(statement)
                        removed.append(omission)
                for statement in function.body:
                    if not isinstance(statement, ast.Try):
                        continue
                    if omission == 'after':
                        statement.body = [node for node in statement.body
                            if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
                                and isinstance(node.value.func, ast.Name) and node.value.func.id == 'check_original')]
                        removed.append(omission)
                    if omission == 'close':
                        for handler in statement.handlers:
                            handler.body = [node for node in handler.body
                                if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
                                    and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == 'close')]
                        removed.append(omission)
        assert removed == [omission], ('mutation did not find one production protection', removed)
        source.write_text(ast.unparse(tree))
    spec = importlib.util.spec_from_file_location('repair', source)
    repair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(repair)
    state = root / 'state'
    state.mkdir(mode=0o700)
    path = state / 'disk.raw'
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.ftruncate(descriptor, 8589934592)
        original = os.fstat(descriptor)
        assert original.st_blocks == 0
        snapshot = repair.snapshot_file(original)
        reservation = repair.make_reservation('a'*32, 'b'*64, 'c'*64, snapshot, 154128384)
        assert reservation['grossBytes'] == '141754548224'
        directory = state / ('raw-repair-' + 'a'*32)
        directory.mkdir(mode=0o700)
        repair.raw.persist(directory, 'request-binding.json', dict(requestDigest='b'*64,
            sourceDigest='c'*64, initial={}, unitBefore={}))
        repair.raw.persist(directory, 'reservation.json', reservation)
        profile = dict(filesystem='ext4', blockBytes=4096, clusterBytes=4096,
            inodeFlags=524288, delalloc=True, dioreadNolock=True, dataMode='ordered',
            kernelRelease='7.0.11-76070011-generic',
            kernelSourceCommit='49748809f7e18ca62f2e054523f1e2c0eb7a88ad',
            rawDevice=snapshot['device'], witnessDevice=snapshot['device'], witnessBytes=79,
            witnessAllocatedBytes=4096, witnessStable=True, witnessRegular=True, rawRegular=True)
        # Native facts/profile are controlled provider boundaries; opener, ledger and admission stay real.
        repair.observe_facts = lambda selected: dict(availableMemoryBytes=3623878656,
            freeBytes=250*1024**3, retainedInodeBytes=8192, otherFutureReservations=0)
        def observe_profile(request, opened):
            assert not scenario.startswith(('pre-', 'post-', 'during-', 'reservation-')), 'unsafe profile reached'
            if scenario == 'profile-failure':
                raise OSError(errno.EIO, 'injected profile failure')
            return profile
        repair.observe_profile = observe_profile
        adapter = repair.RepairCoordinator(dict(expectedRaw=snapshot), 'b'*64)
        adapter.reservation, adapter.path = reservation, str(path)
        native_open, native_read, native_close = os.open, os.read, os.close
        native_lstat, native_fstat = os.lstat, os.fstat
        opened_descriptors, mutations = [], []
        active_samples = set()
        reached_open = []
        def project(observed, fault):
            attributes = {name:getattr(observed, name) for name in dir(observed) if name.startswith('st_')}
            changes = dict(owner=dict(st_uid=original.st_uid+1), device=dict(st_dev=original.st_dev+1),
                mode=dict(st_mode=stat.S_IFREG|0o640), unreadable=dict(st_mode=stat.S_IFREG),
                links=dict(st_nlink=2), type=dict(st_mode=stat.S_IFIFO|0o600),
                symlink=dict(st_mode=stat.S_IFLNK|0o600), size=dict(st_size=8589934591),
                allocation=dict(st_blocks=(8589934592+1048576)//512+1))
            attributes.update(changes[fault])
            return types.SimpleNamespace(**attributes)
        def replace_path():
            path.rename(state / 'original.raw')
            replacement = native_open(path, os.O_RDWR|os.O_CREAT|os.O_EXCL, 0o600)
            try: os.ftruncate(replacement, 8589934592)
            finally: native_close(replacement)
        if scenario == 'pre-inode': replace_path()
        if scenario == 'pre-symlink':
            path.rename(state / 'original.raw')
            path.symlink_to(state / 'original.raw')
        if scenario == 'pre-absent': path.unlink()
        if scenario == 'reservation-invalid': adapter.reservation = dict(reservation, grossBytes='1')
        def lstat_boundary(selected, *arguments, **keywords):
            observed = native_lstat(selected, *arguments, **keywords)
            if os.fspath(selected) == str(path) and scenario.startswith('pre-'):
                fault = scenario.removeprefix('pre-')
                if fault not in ('inode', 'symlink', 'absent'): return project(observed, fault)
            return observed
        def fstat_boundary(opened):
            observed = native_fstat(opened)
            if opened in active_samples and scenario.startswith('post-'):
                if scenario == 'post-stat-failure': raise OSError(errno.EIO, 'injected post-open stat failure')
                fault = scenario.removeprefix('post-')
                if fault != 'inode': return project(observed, fault)
            return observed
        def open_boundary(selected, flags, *arguments, **keywords):
            if os.fspath(selected) == str(path):
                reached_open.append(True)
                assert not scenario.startswith(('pre-', 'reservation-')), 'unsafe original opened'
                assert flags & os.O_ACCMODE == os.O_RDONLY, 'sample open flags unsafe'
                assert flags & os.O_NOFOLLOW and flags & os.O_CLOEXEC and flags & os.O_NONBLOCK, 'sample open flags unsafe'
                if scenario == 'open-failure': raise OSError(errno.EIO, 'injected open failure')
                if scenario in ('timestamp-race', 'immutable'):
                    current = native_lstat(path)
                    os.utime(path, ns=(current.st_atime_ns, current.st_mtime_ns+1000000))
                    mutations.append(True)
                if scenario == 'allocation-race':
                    os.posix_fallocate(descriptor, 0, 4096)
                    mutations.append(True)
                if scenario == 'during-inode': replace_path()
                opened = native_open(selected, flags, *arguments, **keywords)
                opened_descriptors.append(opened)
                active_samples.add(opened)
                if scenario == 'post-inode': replace_path()
                return opened
            return native_open(selected, flags, *arguments, **keywords)
        def read_boundary(opened, length):
            assert opened not in active_samples, 'sample raw payload read'
            observed = native_fstat(opened)
            assert (observed.st_dev, observed.st_ino) != (original.st_dev, original.st_ino), 'raw payload read'
            return native_read(opened, length)
        def close_boundary(opened):
            sample = opened in active_samples
            native_close(opened)
            active_samples.discard(opened)
            if sample and scenario == 'close-failure':
                raise OSError(errno.EIO, 'injected close failure')
        os.open, os.read, os.close = open_boundary, read_boundary, close_boundary
        os.lstat, os.fstat = lstat_boundary, fstat_boundary
        try:
            rejected = False
            try:
                if scenario == 'immutable':
                    opened = repair.raw.open_private(path)
                    os.close(opened)
                    raise AssertionError('immutable state accepted timestamp race')
                for after_allocation in (True, False):
                    observed = adapter.observe_capacity(str(state), after_allocation=after_allocation)
                    assert observed['grossDebtRetained'] is True
                    assert set(observed) == {'availableMemoryBytes', 'freeBytes', 'retainedInodeBytes',
                        'otherFutureReservations', 'observedNs', 'grossDebtRetained'}
                    assert observed['freeBytes'] == 268435456000
            except (repair.raw.PreparationRefusal, OSError) as failure:
                rejected = True
                if scenario in ('quiet', 'timestamp-race', 'allocation-race'): raise
                if scenario == 'immutable': assert str(failure) == 'raw-state-changed'
                if scenario == 'pre-absent': assert isinstance(failure, FileNotFoundError)
                if scenario in ('open-failure', 'post-stat-failure', 'profile-failure', 'close-failure'):
                    assert isinstance(failure, OSError) and failure.errno == errno.EIO
            assert rejected == (scenario not in ('quiet', 'timestamp-race', 'allocation-race'))
            if scenario.startswith(('pre-', 'reservation-')): assert not reached_open
            assert repair.read_reservations(state) == [reservation]
        finally:
            os.open, os.read, os.close = native_open, native_read, native_close
            os.lstat, os.fstat = native_lstat, native_fstat
            for opened in opened_descriptors:
                try: native_fstat(opened)
                except OSError as failure: assert failure.errno == errno.EBADF
                else:
                    native_close(opened)
                    raise AssertionError('sample descriptor leaked')
            assert native_fstat(descriptor).st_blocks*512 <= 4096
            if scenario in ('quiet', 'timestamp-race', 'allocation-race', 'immutable'):
                repair.check_original(descriptor, str(path), repair.raw.identity(original))
                assert bool(mutations) == (scenario != 'quiet')
    finally:
        os.close(descriptor)
print('accepted ' + scenario)
`;

function run(scenario: string, omission = 'none') {
  return Bun.spawnSync(
    ['/usr/bin/python3.12', '-I', '-B', '-c', program, import.meta.dir, scenario, omission],
    { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
  );
}

for (const scenario of [
  'quiet',
  'timestamp-race',
  'allocation-race',
  'immutable',
  'pre-absent',
  'open-failure',
  'profile-failure',
  'close-failure',
]) {
  test(`parent capacity sampling ${scenario} preserves original inode and gross debt`, () => {
    const invocation = run(scenario);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`accepted ${scenario}\n`);
  });
}

const boundaryCases: [string, string, string][] = [
  ['reservation-invalid', 'reservation', 'unsafe original opened'],
  ...[
    'inode',
    'device',
    'owner',
    'mode',
    'unreadable',
    'links',
    'type',
    'symlink',
    'size',
    'allocation',
  ].map((fault): [string, string, string] => [`pre-${fault}`, 'before', 'unsafe original opened']),
  ...['inode', 'device', 'owner', 'mode', 'links', 'type', 'symlink', 'size', 'allocation'].map(
    (fault): [string, string, string] => [`post-${fault}`, 'after', 'unsafe profile reached'],
  ),
  ['during-inode', 'after', 'unsafe profile reached'],
  ['post-stat-failure', 'after', 'unsafe profile reached'],
  ['post-inode', 'close', 'sample descriptor leaked'],
];

for (const [scenario, omission, evidence] of boundaryCases) {
  test(`parent capacity ${scenario} refuses at its boundary and loses protection under ${omission} omission`, () => {
    const guarded = run(scenario);
    expect(guarded.stderr.toString()).toBe('');
    expect(guarded.exitCode).toBe(0);
    const unguarded = run(scenario, omission);
    expect(unguarded.exitCode).not.toBe(0);
    expect(unguarded.stderr.toString()).toContain(evidence);
  });
}

for (const omission of ['readonly', 'nofollow', 'nonblock', 'cloexec']) {
  test(`parent sample ${omission} flag omission loses the protected open boundary`, () => {
    const invocation = run('quiet', omission);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain('sample open flags unsafe');
  });
}
