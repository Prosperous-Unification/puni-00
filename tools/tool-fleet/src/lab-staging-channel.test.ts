import { expect, test } from 'bun:test';

const program = String.raw`
import array, ast, errno, fcntl, importlib.util, json, os, pathlib, select, shutil, signal, socket, struct, sys, tempfile, time

scenario, omission = sys.argv[2:4]
with tempfile.TemporaryDirectory(prefix='puni-channel107-') as scratch:
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
        changed = []
        class Omit(ast.NodeTransformer):
            def visit_FunctionDef(self, node):
                if omission == 'unlock-close' and node.name == 'close' and node.args.args[0].arg == 'self':
                    node.body.insert(1, ast.parse('fcntl.flock(self.staging_fd, fcntl.LOCK_UN)').body[0])
                    changed.append(omission)
                return self.generic_visit(node)
            def visit_Expr(self, node):
                call = node.value
                if isinstance(call, ast.Call):
                    if (isinstance(call.func, ast.Name) and call.func.id == 'require'
                            and len(call.args) == 2 and isinstance(call.args[1], ast.Constant)
                            and call.args[1].value == omission):
                        changed.append(omission)
                        return ast.Pass()
                    if (omission == 'passcred' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'setsockopt'):
                        changed.append(omission)
                        return ast.Pass()
                    if (omission == 'cleanup-sockets' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'close' and isinstance(call.func.value, ast.Name)
                            and call.func.value.id == 'resource'):
                        changed.append(omission)
                        return ast.Pass()
                    if (omission == 'cleanup' and isinstance(call.func, ast.Attribute)
                            and call.func.attr == 'close' and isinstance(call.func.value, ast.Name)
                            and call.func.value.id == 'os' and len(call.args) == 1
                            and isinstance(call.args[0], ast.Name) and call.args[0].id == 'resource'):
                        changed.append(omission)
                        return ast.Pass()
                return self.generic_visit(node)
            def visit_Call(self, node):
                if (omission == 'refusal-close' and isinstance(node.func, ast.Name)
                        and node.func.id == '_close_staging_resources' and len(node.args) == 2
                        and isinstance(node.args[0], ast.Name) and node.args[0].id == 'rights'):
                    node.args[0] = ast.List(elts=[], ctx=ast.Load())
                    changed.append(omission)
                if (omission == 'recv-flags' and isinstance(node.func, ast.Attribute)
                        and node.func.attr == 'recvmsg'):
                    node.args[2] = ast.Constant(value=0)
                    changed.append(omission)
                return self.generic_visit(node)
        tree = Omit().visit(tree)
        assert len(changed) == 1, ('expected one production omission', changed)
        source.write_text(ast.unparse(ast.fix_missing_locations(tree)))
    spec = importlib.util.spec_from_file_location('repair', source)
    repair = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(repair)
    raw = repair.raw
    state = root / 'state'
    state.mkdir(mode=0o700)
    nonce, digest = 'a'*32, 'b'*64
    children = set()
    baseline_fds = set(os.listdir('/proc/self/fd'))
    helper_bytes = sum((helpers/name).stat().st_size for name in names)
    assert 0 < source.stat().st_size < 131072 and helper_bytes <= 786432
    native_close, native_fstat, native_lstat, native_fcntl = os.close, os.fstat, os.lstat, fcntl.fcntl
    def occupied():
        try:
            descriptor = raw.acquire_staging(str(state))
        except raw.PreparationRefusal as failure:
            assert str(failure) == 'raw-staging-occupied'
            return True
        native_close(descriptor)
        return False
    def wait_child(pid):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            ended, status = os.waitpid(pid, os.WNOHANG)
            if ended:
                children.remove(pid)
                assert os.waitstatus_to_exitcode(status) == 0, ('child failed', status)
                return
            select.select([], [], [], 0.01)
        raise AssertionError('owned child deadline exceeded')
    def launch(function):
        pid = os.fork()
        if pid == 0:
            try:
                function()
            except BaseException:
                import traceback
                traceback.print_exc()
                os._exit(1)
            os._exit(0)
        children.add(pid)
        return pid
    def closed(descriptors):
        for descriptor in descriptors:
            try: native_fstat(descriptor)
            except OSError as failure: assert failure.errno == errno.EBADF
            else:
                native_close(descriptor)
                raise AssertionError('received right leaked')
    try:
        if scenario in ('queued-parent-exit', 'received-parent-exit'):
            # The coordinator is exactly owned; inherited socket sends the future stdin to this process.
            bridge, coordinator_bridge = socket.socketpair(socket.AF_UNIX, socket.SOCK_SEQPACKET)
            control_read, control_write = os.pipe2(os.O_CLOEXEC)
            def coordinate():
                bridge.close()
                native_close(control_write)
                channel = repair.open_staging_channel(str(state), nonce, digest)
                coordinator_bridge.sendmsg([b'!'], [(socket.SOL_SOCKET, socket.SCM_RIGHTS,
                    array.array('i', [channel.recipient.fileno()]))])
                channel.close_recipient()
                assert os.read(control_read, 1) == b'!'
                # Process exit, not a synthesized unlock/close, drops the original parent copies.
            pid = launch(coordinate)
            coordinator_bridge.close()
            native_close(control_read)
            assert select.select([bridge], [], [], 3)[0]
            payload, ancillary, flags, address = bridge.recvmsg(1, socket.CMSG_SPACE(4), socket.MSG_CMSG_CLOEXEC)
            assert payload == b'!' and not flags & (socket.MSG_TRUNC|socket.MSG_CTRUNC) and len(ancillary) == 1
            descriptors = array.array('i'); descriptors.frombytes(ancillary[0][2])
            endpoint = socket.socket(fileno=descriptors[0])
            bridge.close()
            held = None
            try:
                assert occupied(), 'queued transfer lost exclusion'
                if scenario == 'received-parent-exit':
                    held = repair.receive_staging_channel(endpoint, str(state), nonce, digest)
                os.write(control_write, b'!')
                native_close(control_write)
                wait_child(pid)
                assert occupied(), 'coordinator death lost exclusion'
                if scenario == 'queued-parent-exit':
                    try: repair.receive_staging_channel(endpoint, str(state), nonce, digest)
                    except FileNotFoundError: pass
                    else: raise AssertionError('dead sender accepted')
                else:
                    endpoint.close()
                    assert occupied(), 'received right lost exclusion'
                    native_close(held); held = None
                endpoint.close()
                assert not occupied(), 'last transfer close retained exclusion'
            finally:
                endpoint.close()
                if held is not None: native_close(held)
        elif scenario in ('receiver-exit', 'closing-copies', 'parent-close-first', 'recipient-closed', 'owner-close-failure'):
            channel = repair.open_staging_channel(str(state), nonce, digest)
            try:
                if scenario == 'recipient-closed':
                    channel.close_recipient()
                    try: channel.close_recipient()
                    except raw.PreparationRefusal as failure:
                        assert str(failure) == 'repair-channel-recipient-closed'
                    else: raise AssertionError('closed recipient reused')
                elif scenario == 'owner-close-failure':
                    original_control, original_recipient = channel.control, channel.recipient
                    held_numbers = [original_control.fileno(), original_recipient.fileno(), channel.staging_fd]
                    class FailingClose:
                        def close(self):
                            original_recipient.close()
                            raise OSError(errno.EIO, 'injected owner close failure')
                    channel.recipient = FailingClose()
                    try: channel.close()
                    except OSError as failure: assert failure.errno == errno.EIO
                    else: raise AssertionError('owner close failure suppressed')
                    closed(held_numbers)
                elif scenario == 'receiver-exit':
                    def receive_and_exit():
                        # Child must not inherit coordinator ownership in this ordinary-process fixture.
                        channel.control.close()
                        native_close(channel.staging_fd)
                        held = repair.receive_staging_channel(channel.recipient, str(state), nonce, digest)
                        native_close(held)
                        channel.recipient.close()
                    pid = launch(receive_and_exit)
                    channel.close_recipient()
                    wait_child(pid)
                    assert occupied(), 'receiver exit released coordinator publication lock'
                else:
                    held = repair.receive_staging_channel(channel.recipient, str(state), nonce, digest)
                    channel.close_recipient()
                    assert channel.control.fileno() >= 0 and native_fstat(channel.staging_fd)
                    assert occupied(), 'closing launch copy released exclusion'
                    if scenario == 'parent-close-first':
                        channel.close()
                        assert occupied(), 'coordinator close unlocked received right'
                        native_close(held)
                    else:
                        native_close(held)
                        assert occupied(), 'closing receive copy released coordinator lock'
                channel.close()
                assert not occupied(), 'final coordinator close retained exclusion'
            finally: channel.close()
        else:
            channel = None
            received = []
            extra = []
            expected = None
            try:
                if scenario in ('binding-nonce', 'binding-digest'):
                    try:
                        channel = repair.open_staging_channel(str(state), 'A'*32 if scenario == 'binding-nonce' else nonce,
                            'b'*65 if scenario == 'binding-digest' else digest)
                    except raw.PreparationRefusal as failure:
                        assert str(failure) == 'repair-channel-binding'
                    else: raise AssertionError('unsafe construction accepted')
                elif scenario.startswith('construction-'):
                    fault = scenario.removeprefix('construction-')
                    native_pair = socket.socketpair
                    class Sender:
                        def __init__(self, endpoint): self.endpoint = endpoint
                        def sendmsg(self, *arguments):
                            assert arguments[2] == socket.MSG_DONTWAIT, 'send flags unsafe'
                            if fault == 'send': raise OSError(errno.EIO, 'injected send failure')
                            sent = self.endpoint.sendmsg(*arguments)
                            return sent - 1 if fault == 'short' else sent
                        def close(self): self.endpoint.close()
                    def pair(*arguments):
                        if fault == 'pair': raise OSError(errno.EIO, 'injected pair failure')
                        sender, recipient = native_pair(*arguments)
                        class Recipient:
                            def setsockopt(self, *options):
                                recipient.setsockopt(*options)
                                raise OSError(errno.EIO, 'injected setsockopt failure')
                            def close(self): recipient.close()
                        return Sender(sender), Recipient() if fault == 'passcred' else recipient
                    socket.socketpair = pair
                    if fault == 'bound': repair._STAGING_FRAME_BYTES = 1
                    try: channel = repair.open_staging_channel(str(state), nonce, digest)
                    except (OSError, raw.PreparationRefusal): pass
                    else: raise AssertionError('failed construction accepted')
                    finally: socket.socketpair = native_pair
                    assert not occupied(), 'failed construction retained ownership'
                else:
                    channel = repair.open_staging_channel(str(state), nonce, digest)
                    assert not channel.control.get_inheritable() and not channel.recipient.get_inheritable()
                    assert not os.get_inheritable(channel.staging_fd)
                    # Consume/requeue through real sendmsg so forged payloads still bear kernel credentials.
                    payload, ancillary, flags, address = channel.recipient.recvmsg(4097, socket.CMSG_SPACE(64)+socket.CMSG_SPACE(12), socket.MSG_CMSG_CLOEXEC)
                    frame = json.loads(payload)
                    for level, kind, content in ancillary:
                        if kind == socket.SCM_RIGHTS:
                            descriptors = array.array('i'); descriptors.frombytes(content)
                            for descriptor in descriptors: native_close(descriptor)
                    rights = [channel.staging_fd]
                    selected_state = str(state)
                    changes = {
                        'nonce':dict(nonce='c'*32), 'digest':dict(requestDigest='c'*64),
                        'payload-binding':dict(nonce='A'*32), 'schema':dict(schemaVersion=True),
                        'extra-field':dict(foreign=1), 'decimal':dict(start='0'+frame['start']),
                        'overflow':dict(start=str(2**64)), 'pid':dict(pid=str(os.getpid()+1)),
                        'uid':dict(uid=str(os.geteuid()+1)), 'gid':dict(gid=str(os.getegid()+1)),
                        'start':dict(start=str(int(frame['start'])+1)), 'inode':dict(inode=str(int(frame['inode'])+1)),
                        'device':dict(device=str(int(frame['device'])+1)), 'frame-mode':dict(mode='0755')}
                    frame.update(changes.get(scenario, {}))
                    payload = raw.encode_json(frame)
                    if scenario == 'null': payload = b'null'
                    if scenario == 'canonical': payload += b' '
                    if scenario == 'duplicate': payload = payload[:-1]+b',"schemaVersion":1}'
                    if scenario == 'malformed': payload = b'{'
                    if scenario == 'oversized': payload = b' '*5000
                    if scenario == 'empty': payload = b''
                    if scenario == 'missing-right': rights = []
                    if scenario in ('extra-right', 'control-truncated'):
                        rights = [channel.staging_fd] * (2 if scenario == 'extra-right' else 40)
                    if scenario in ('unlocked', 'opath'):
                        descriptor = os.open(state, (os.O_PATH if scenario == 'opath' else os.O_RDONLY)|os.O_CLOEXEC)
                        extra.append(descriptor); rights = [descriptor]
                    if scenario == 'wrong-right':
                        foreign = root / 'foreign'; foreign.mkdir(mode=0o700)
                        descriptor = raw.acquire_staging(str(foreign)); extra.append(descriptor); rights = [descriptor]
                    if scenario == 'foreign-state':
                        foreign = root / 'foreign'; foreign.mkdir(mode=0o700); selected_state = str(foreign)
                    if scenario == 'symlink-state':
                        state.rename(root / 'original'); state.symlink_to(root / 'original')
                    if scenario == 'replaced-state':
                        state.rename(root / 'original'); state.mkdir(mode=0o700)
                    if scenario == 'mode': state.chmod(0o750)
                    if scenario == 'unreadable': state.chmod(0o000)
                    if scenario == 'absent-state': selected_state = str(root / 'absent')
                    if scenario != 'missing-packet':
                        channel.control.sendmsg([payload], [] if not rights else [
                            (socket.SOL_SOCKET, socket.SCM_RIGHTS, array.array('i', rights))])
                    expected = {
                        'nonce':'repair-channel-request', 'digest':'repair-channel-request',
                        'payload-binding':'repair-channel-binding', 'schema':'repair-channel-shape', 'null':'repair-channel-shape',
                        'extra-field':'repair-channel-shape', 'decimal':'repair-channel-decimal',
                        'overflow':'repair-channel-decimal', 'pid':'repair-channel-credentials',
                        'uid':'repair-channel-credentials', 'gid':'repair-channel-credentials',
                        'start':'repair-channel-start', 'inode':'repair-channel-identity',
                        'device':'repair-channel-identity', 'frame-mode':'repair-channel-identity',
                        'canonical':'repair-channel-canonical', 'duplicate':'repair-channel-canonical',
                        'malformed':'repair-channel-json', 'oversized':'repair-channel-packet',
                        'empty':'repair-channel-packet', 'missing-right':'repair-channel-ancillary',
                        'extra-right':'repair-channel-ancillary', 'control-truncated':'repair-channel-ancillary',
                        'wrong-right':'repair-channel-identity', 'foreign-state':'repair-channel-identity',
                        'replaced-state':'repair-channel-identity', 'symlink-state':'repair-channel-identity', 'mode':'repair-channel-identity',
                        'unreadable':'repair-channel-identity', 'unlocked':'repair-channel-lock',
                        'opath':'repair-channel-access', 'no-cloexec':'repair-channel-access',
                        'no-credentials':'repair-channel-ancillary', 'wrong-ancillary':'repair-channel-ancillary',
                        'bad-right-width':'repair-channel-ancillary', 'frame-truncated':'repair-channel-packet',
                        'flags':'repair-channel-packet', 'stat-failure':'EIO', 'fdinfo-failure':'EIO',
                        'recv-failure':'EIO', 'close-failure':'repair-channel-ancillary',
                        'missing-packet':'EAGAIN', 'absent-state':'ENOENT', 'bad-credentials':'repair-channel-ancillary',
                        'owner':'repair-channel-identity'} .get(scenario)
                    class Endpoint:
                        def recvmsg(self, length, control_bytes, receive_flags):
                            assert length <= 4097 and control_bytes <= 128, 'unbounded receive allocation'
                            assert receive_flags == socket.MSG_DONTWAIT|socket.MSG_CMSG_CLOEXEC, 'receive flags unsafe'
                            if scenario == 'recv-failure': raise OSError(errno.EIO, 'injected recv failure')
                            packet = channel.recipient.recvmsg(length, control_bytes, receive_flags)
                            content, controls, observed_flags, address = packet
                            for level, kind, content_rights in controls:
                                if kind == socket.SCM_RIGHTS:
                                    descriptors = array.array('i'); descriptors.frombytes(content_rights)
                                    received.extend(descriptors)
                            if scenario == 'no-cloexec': os.set_inheritable(received[0], True)
                            if scenario == 'no-credentials': controls = [entry for entry in controls if entry[1] != socket.SCM_CREDENTIALS]
                            if scenario == 'wrong-ancillary': controls.append((socket.SOL_SOCKET, 999, b''))
                            if scenario == 'bad-credentials': controls = [(level, kind, payload[:-1] if kind == socket.SCM_CREDENTIALS else payload) for level,kind,payload in controls]
                            if scenario == 'bad-right-width': controls = [(level, kind, payload+b'!' if kind == socket.SCM_RIGHTS else payload) for level,kind,payload in controls]
                            if scenario in ('frame-truncated', 'flags'): observed_flags |= socket.MSG_TRUNC if scenario == 'frame-truncated' else socket.MSG_CTRUNC
                            if scenario == 'close-failure':
                                # Duplicate one actually acquired right to prove every cleanup attempt occurs.
                                received.append(os.dup(received[0]))
                                controls = [(level,kind,array.array('i', received).tobytes() if kind == socket.SCM_RIGHTS else payload) for level,kind,payload in controls]
                                frame['nonce'] = 'c'*32
                                content = raw.encode_json(frame)
                            return content, controls, observed_flags, address
                    native_text = raw.read_text
                    close_attempts = []
                    def close_boundary(descriptor):
                        close_attempts.append(descriptor)
                        native_close(descriptor)
                        if scenario == 'close-failure' and descriptor == received[0]:
                            raise OSError(errno.EIO, 'injected close failure')
                    def fstat_boundary(descriptor):
                        if descriptor in received and scenario == 'stat-failure': raise OSError(errno.EIO, 'injected stat failure')
                        observed = native_fstat(descriptor)
                        if descriptor in received and scenario == 'owner':
                            import types
                            fields = {name:getattr(observed,name) for name in dir(observed) if name.startswith('st_')}
                            fields['st_uid'] += 1
                            return types.SimpleNamespace(**fields)
                        return observed
                    def text_boundary(selected, limit=raw.RECORD_BYTES):
                        if scenario == 'fdinfo-failure' and '/fdinfo/' in selected: raise OSError(errno.EIO, 'injected fdinfo failure')
                        return native_text(selected, limit)
                    os.close, os.fstat, raw.read_text = close_boundary, fstat_boundary, text_boundary
                    accepted = None
                    refusal = None
                    try:
                        try: accepted = repair.receive_staging_channel(Endpoint(), selected_state, nonce, digest)
                        except raw.PreparationRefusal as failure: refusal = str(failure)
                        except OSError as failure: refusal = errno.errorcode[failure.errno]
                        except BaseExceptionGroup as failures:
                            assert scenario == 'close-failure'
                            assert any(isinstance(failure, raw.PreparationRefusal) and str(failure) == 'repair-channel-ancillary' for failure in failures.exceptions)
                            assert any(isinstance(failure, OSError) for failure in failures.exceptions)
                            refusal = 'repair-channel-ancillary'
                    finally:
                        os.close, os.fstat, raw.read_text = native_close, native_fstat, native_text
                    if scenario == 'close-failure':
                        assert close_attempts == received, 'cleanup did not attempt every acquired right'
                    if expected is None:
                        assert accepted is not None, ('valid transfer refused', refusal)
                        assert occupied(), 'valid receive lost exclusion'
                        native_close(accepted)
                    else:
                        if accepted is not None: native_close(accepted)
                        assert refusal == expected, ('unsafe receive accepted or wrong refusal', expected, refusal)
                        closed(received)
            finally:
                os.close, os.fstat, os.lstat, fcntl.fcntl = native_close, native_fstat, native_lstat, native_fcntl
                if channel is not None: channel.close()
                for descriptor in extra: native_close(descriptor)
                state.chmod(0o700)
        assert not children, 'owned children not reaped'
        assert set(os.listdir('/proc/self/fd')) == baseline_fds, 'fixture descriptor leaked'
        fixture_files = [path for path in root.rglob('*') if path.is_file()]
        assert set(fixture_files) == {helpers/name for name in names}, 'unexpected fixture payload'
        assert sum(path.stat().st_blocks*512 for path in fixture_files) <= 786432 + 6*4096
    finally:
        for pid in list(children):
            os.kill(pid, signal.SIGKILL)
            ended, status = os.waitpid(pid, 0)
            assert ended == pid
            children.remove(pid)
print('accepted ' + scenario)
`;

function run(scenario: string, omission = 'none') {
  return Bun.spawnSync(
    ['/usr/bin/python3', '-I', '-B', '-c', program, import.meta.dir, scenario, omission],
    { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
  );
}

for (const scenario of [
  'quiet',
  'parent-close-first',
  'recipient-closed',
  'owner-close-failure',
  'closing-copies',
  'queued-parent-exit',
  'received-parent-exit',
  'receiver-exit',
  'binding-nonce',
  'binding-digest',
  'construction-pair',
  'construction-send',
  'construction-short',
  'construction-bound',
  'construction-passcred',
  'nonce',
  'digest',
  'payload-binding',
  'schema',
  'null',
  'extra-field',
  'decimal',
  'overflow',
  'pid',
  'uid',
  'gid',
  'start',
  'inode',
  'device',
  'frame-mode',
  'canonical',
  'duplicate',
  'malformed',
  'oversized',
  'empty',
  'missing-right',
  'extra-right',
  'control-truncated',
  'wrong-right',
  'foreign-state',
  'replaced-state',
  'symlink-state',
  'mode',
  'unreadable',
  'unlocked',
  'opath',
  'no-cloexec',
  'no-credentials',
  'wrong-ancillary',
  'bad-right-width',
  'frame-truncated',
  'flags',
  'stat-failure',
  'fdinfo-failure',
  'recv-failure',
  'close-failure',
  'missing-packet',
  'absent-state',
  'bad-credentials',
  'owner',
]) {
  test(`staging channel ${scenario} preserves bounded exclusive ownership`, () => {
    const invocation = run(scenario);
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString()).toBe(`accepted ${scenario}\n`);
  });
}

const omissions: [string, string][] = [
  ['nonce', 'repair-channel-request'],
  ['payload-binding', 'repair-channel-binding'],
  ['schema', 'repair-channel-shape'],
  ['canonical', 'repair-channel-canonical'],
  ['decimal', 'repair-channel-decimal'],
  ['pid', 'repair-channel-credentials'],
  ['uid', 'repair-channel-credentials'],
  ['gid', 'repair-channel-credentials'],
  ['start', 'repair-channel-start'],
  ['inode', 'repair-channel-identity'],
  ['foreign-state', 'repair-channel-identity'],
  ['mode', 'repair-channel-identity'],
  ['unlocked', 'repair-channel-lock'],
  ['opath', 'repair-channel-access'],
  ['no-cloexec', 'repair-channel-access'],
  ['extra-right', 'repair-channel-ancillary'],
  ['frame-truncated', 'repair-channel-packet'],
  ['nonce', 'refusal-close'],
  ['quiet', 'passcred'],
  ['quiet', 'recv-flags'],
  ['closing-copies', 'cleanup'],
  ['owner-close-failure', 'cleanup-sockets'],
  ['parent-close-first', 'unlock-close'],
  ['recipient-closed', 'repair-channel-recipient-closed'],
  ['construction-short', 'repair-channel-send'],
  ['construction-bound', 'repair-channel-bound'],
];
for (const [scenario, omission] of omissions) {
  test(`staging channel watched ${omission} omission exposes ${scenario}`, () => {
    const invocation = run(scenario, omission);
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain(
      omission === 'repair-channel-recipient-closed' ? 'AttributeError' : 'AssertionError',
    );
    const witness =
      omission === 'repair-channel-recipient-closed'
        ? "'NoneType' object has no attribute 'close'"
        : omission === 'cleanup-sockets'
          ? 'owner close failure suppressed'
          : omission === 'cleanup'
            ? 'final coordinator close retained exclusion'
            : omission === 'unlock-close'
              ? 'coordinator close unlocked received right'
              : omission === 'refusal-close'
                ? 'received right leaked'
                : omission === 'passcred'
                  ? 'valid transfer refused'
                  : omission === 'recv-flags'
                    ? 'receive flags unsafe'
                    : omission === 'repair-channel-send' || omission === 'repair-channel-bound'
                      ? 'failed construction accepted'
                      : 'unsafe receive accepted or wrong refusal';
    expect(invocation.stderr.toString()).toContain(witness);
    expect(invocation.stderr.toString()).not.toContain('expected one production omission');
  });
}
