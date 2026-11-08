import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const root = join(import.meta.dir, '../../..');
// Proof: asset-only Nx affected queries omitted tool-fleet before these exact test inputs.
const sourcePath = join(
  root,
  'openspec/changes/observability-environment-parity/evidence/audit-status-inspection.py',
);
const proposalPath = join(
  root,
  'openspec/changes/observability-environment-parity/audit-status-inspection-proposal.md',
);

const harness = String.raw`
import ast, contextlib, ctypes, errno, hashlib, io, json, os, selectors, stat, struct, sys, tempfile, time, types
request = json.loads(sys.stdin.read())
source = request['source']
case = request['case']
mutation = request.get('mutation')
class BoundaryViolation(BaseException): pass
calls = []
clock = [0.0]
frames = []
configuration = {'mode': stat.S_IFREG | 0o644, 'uid': 0, 'open': 73, 'request': 11,
                 'select_delay': 0.0, 'get_delay': 0.0, 'ready': True, 'raise': None}
real_sizeof = ctypes.sizeof
real_stat = os.stat
real_open = os.open
real_close = os.close
real_read = os.read
real_fstat = os.fstat
real_lstat = os.lstat
real_exec = exec
class Function:
    def __init__(self, name): self.name = name
    def __call__(self, *arguments):
        name = self.name
        expected = {
            'audit_open': ([], ctypes.c_int),
            'audit_close': ([ctypes.c_int], None),
            'audit_request_status': ([ctypes.c_int], ctypes.c_int),
            'audit_get_reply': ([ctypes.c_int, ctypes.POINTER(namespace['Reply']), ctypes.c_int, ctypes.c_int], ctypes.c_int),
        }
        assert (self.argtypes, self.restype) == expected[name], 'prototype ' + name
        calls.append([name, list(arguments) if name != 'audit_get_reply' else [arguments[0], 'reply', *arguments[2:]]])
        if name == 'audit_open':
            assert not arguments
            ctypes.set_errno(errno.EACCES)
            return configuration['open']
        if name == 'audit_close':
            assert arguments == (73,)
            return None
        assert arguments[0] == 73, 'fake descriptor escaped'
        if name == 'audit_request_status':
            if configuration['raise'] == 'request': raise RuntimeError('injected request exception')
            ctypes.set_errno(errno.ESTALE)
            return configuration['request']
        assert arguments[2:] == (1, 0), 'get must be nonblocking without peek'
        clock[0] += configuration['get_delay']
        if configuration['raise'] == 'get': raise RuntimeError('injected reply exception')
        frame = frames.pop(0)
        if frame.get('return', 60) < 0:
            ctypes.set_errno(errno.ESTALE)
            return frame['return']
        reply = arguments[1]._obj
        reply.pointer = 1
        reply.header = ctypes.cast(ctypes.c_void_p(1), ctypes.POINTER(namespace['Header']))
        payload = struct.pack('=IHHII', frame.get('length', 60), frame.get('kind', 1000), 0, frame.get('sequence', 11), 0)
        if frame.get('kind', 1000) == 2:
            payload += struct.pack('=i', frame.get('error', 0))
        else:
            payload += struct.pack('=11I', *range(0xfffffff5, 0x100000000))
        ctypes.memmove(ctypes.addressof(reply.message), payload, len(payload))
        return frame.get('return', 60)
class Library:
    def __init__(self): self.functions = {name: Function(name) for name in ('audit_open','audit_close','audit_request_status','audit_get_reply')}
    def __getattr__(self, name):
        if name not in self.functions: raise BoundaryViolation('unexpected native lookup: ' + name)
        return self.functions[name]
def fake_cdll(path, **options):
    assert path == '/usr/lib/x86_64-linux-gnu/libaudit.so.1.0.0' and options == {'use_errno': True}
    calls.append(['CDLL', path])
    if configuration['raise'] == 'load': raise OSError(errno.ENOENT, 'injected missing library')
    return Library()
def fake_stat(path, **options):
    if path != '/usr/lib/x86_64-linux-gnu/libaudit.so.1.0.0': raise BoundaryViolation('unexpected library stat')
    assert options == {'follow_symlinks': False}
    if configuration['raise'] == 'stat': raise OSError(errno.EACCES, 'injected unreadable library')
    if configuration['raise'] == 'missing': raise FileNotFoundError(errno.ENOENT, 'injected absent library')
    return types.SimpleNamespace(st_mode=configuration['mode'], st_uid=configuration['uid'])
class Selector:
    def __init__(self):
        if configuration['raise'] == 'selector': raise RuntimeError('injected selector creation exception')
    def register(self, descriptor, event):
        assert descriptor == 73 and event == selectors.EVENT_READ
        calls.append(['register', descriptor])
        if configuration['raise'] == 'register': raise RuntimeError('injected selector register exception')
    def select(self, timeout):
        assert 0 <= timeout <= 1.0
        calls.append(['select', timeout])
        clock[0] += configuration['select_delay']
        if configuration['raise'] == 'select': raise RuntimeError('injected select exception')
        return [object()] if configuration['ready'] else []
    def close(self): calls.append(['selector-close'])
# All diagnostic executions, including mutants, install these fail-closed boundaries first.
ctypes.CDLL = fake_cdll
ctypes.PyDLL = lambda *_args, **_options: (_ for _ in ()).throw(BoundaryViolation('unexpected PyDLL'))
selectors.DefaultSelector = Selector
time.monotonic = lambda: clock[0]
os.stat = fake_stat
namespace = {'__name__': 'audit_status_fixture', '__file__': '<audit-status-fixture>'}
mutations = {
 'open-failure': ('if descriptor < 0:', 'if False:'),
 'arguments': ('if sys.argv[1:]:','if False:'),
 'library-regular': ('if not stat.S_ISREG(identity.st_mode):', 'if False:'),
 'library-owner': ('if identity.st_uid != 0 or identity.st_mode & 0o022:', 'if False:'),
 'uapi-size': ('if ctypes.sizeof(Header) != 16 or ctypes.sizeof(Status) != 44:', 'if False:'),
 'reply-size': ('if ctypes.sizeof(Message) != 8988 or ctypes.sizeof(Reply) != 9016:', 'if False:'),
 'request-negative': ('if sequence < 0:', 'if False:'),
 'request-zero': ('if sequence == 0:', 'if False:'),
 'header': ('if (received < 16 or header.length < 16\n                    or header.length > received or header.sequence != sequence):', 'if False:'),
 'short-error': ('if header.length < 20:', 'if False:'),
 'negative-error': ('if native_error < 0:', 'if False:'),
 'positive-error': ('if native_error > 0:', 'if False:'),
 'kind': ('if header.kind != AUDIT_GET:', 'if False:'),
 'short-status': ('if header.length < 16 + ctypes.sizeof(Status):', 'if False:'),
 'count': ('for _ in range(REPLY_COUNT):', 'for _ in range(REPLY_COUNT + 1):'),
 'close': ('audit.audit_close(descriptor)', 'pass'),
 'serialization': ('if len(encoded) > STREAM_BYTES:', 'if False:'),
 'get-negative': ('if received < 0:', 'if False:'),
 'timeout': ('if not ready or time.monotonic() >= deadline:', 'if False:'),
 'late-get': ("if time.monotonic() >= deadline:\n                return unavailable('status-reply-timeout')\n", ''),
}
if mutation in mutations:
    before, after = mutations[mutation]
    assert source.count(before) == 1, 'mutation anchor ' + mutation
    source = source.replace(before, after)
real_exec(compile(source, '<audit-status-fixture>', 'exec'), namespace)
frames[:] = [{}]
expected_stage = None
expected_errno = None
expected_open = True
expected_request = True
expected_get = 1
expected_state = 'unavailable'
expected_exception = None
if case in ('main-success','main-arguments'):
    namespace['__name__'] = '__main__'
    sys.argv = ['audit-status-inspection'] + (['unexpected'] if case == 'main-arguments' else [])
    sink = types.SimpleNamespace(buffer=io.BytesIO())
    print('EXERCISE ' + case)
    with contextlib.redirect_stdout(sink):
        try: real_exec(compile(source,'<audit-status-fixture>','exec'),namespace)
        except SystemExit as fault: code = fault.code
        else: raise AssertionError('main did not exit')
    observation = json.loads(sink.buffer.getvalue())
    assert code == (2 if case == 'main-arguments' else 0), (case,code,observation)
    if case == 'main-arguments': assert observation == {'state':'unavailable','stage':'unsupported-arguments'} and not calls, (case,observation,calls)
    else: assert observation['state'] == 'observed'
    print('PASS ' + case)
    sys.exit(0)
if case == 'success': expected_state = 'observed'
elif case == 'near-deadline': configuration['get_delay'] = 0.999; expected_state = 'observed'
elif case in ('library-directory','library-symlink','library-owner','library-group-write','library-other-write'):
    if case == 'library-directory': configuration['mode'] = stat.S_IFDIR | 0o755
    if case == 'library-symlink': configuration['mode'] = stat.S_IFLNK | 0o777
    if case == 'library-owner': configuration['uid'] = 1000
    if case == 'library-group-write': configuration['mode'] |= 0o020
    if case == 'library-other-write': configuration['mode'] |= 0o002
    expected_stage = 'library-not-regular' if case in ('library-directory','library-symlink') else 'library-owner-or-write-mode'
    expected_open = expected_request = False
    expected_get = 0
elif case in ('Header','Status','Message','Reply'):
    target = namespace[case]
    ctypes.sizeof = lambda value: real_sizeof(value) + 1 if value is target else real_sizeof(value)
    expected_stage = 'unexpected-uapi-structure-size' if case in ('Header','Status') else 'unexpected-v3.1.2-reply-abi-size'
    expected_open = expected_request = False
    expected_get = 0
elif case in ('missing','stat','load'):
    configuration['raise'] = case
    expected_stage = 'diagnostic-os-error'
    expected_errno = errno.EACCES if case == 'stat' else errno.ENOENT
    expected_open = expected_request = False
    expected_get = 0
elif case == 'open-failure':
    configuration['open'] = -1
    expected_stage, expected_errno = 'audit_open', errno.EACCES
    expected_request = False
    expected_get = 0
elif case in ('request-negative','request-zero'):
    configuration['request'] = -errno.EPERM if case == 'request-negative' else 0
    expected_stage = 'audit_request_status' if case == 'request-negative' else 'request-short-return'
    expected_errno = errno.EPERM if case == 'request-negative' else None
    expected_get = 0
elif case == 'get-negative':
    frames[:] = [{'return': -errno.EBADF}]
    expected_stage, expected_errno = 'audit_get_reply', errno.EBADF
elif case in ('received-short','header-short','header-overrun','sequence'):
    frames[:] = [dict({'received-short': {'return': 15}, 'header-short': {'length': 0}, 'header-overrun': {'length': 61}, 'sequence': {'sequence': 12}}[case])]
    expected_stage = 'invalid-status-header'
elif case in ('short-error','negative-error','positive-error','ack-status','count'):
    frames[:] = [{'kind':2, 'length':20}]
    if case == 'short-error': frames[0]['length'] = 19
    if case == 'negative-error': frames[0]['error'] = -errno.EPERM
    if case == 'positive-error': frames[0]['error'] = errno.EPERM
    if case == 'ack-status': frames += [{}]; expected_state = 'observed'; expected_get = 2
    if case == 'count': frames[:] = frames * 4 + [{}]; expected_get = 4
    expected_stage = {'short-error':'short-netlink-status-error','negative-error':'kernel-status-response','positive-error':'invalid-positive-netlink-error','ack-status':None,'count':'status-response-count-cap'}[case]
    if case == 'negative-error': expected_errno = errno.EPERM
elif case == 'kind': frames[0]['kind'] = 1001; expected_stage = 'unexpected-response-type'
elif case == 'short-status': frames[0]['length'] = 59; expected_stage = 'short-audit-status'
elif case in ('timeout','late-ready','late-get','deadline-ready','deadline-get','deadline-ack'):
    expected_stage = 'status-reply-timeout'
    if case == 'timeout': configuration['ready'] = False; expected_get = 0
    if case in ('late-ready','deadline-ready'): configuration['select_delay'] = 1.01 if case == 'late-ready' else 1.0; expected_get = 0
    if case in ('late-get','deadline-get'): configuration['get_delay'] = 1.01 if case == 'late-get' else 1.0
    if case == 'deadline-ack': configuration['get_delay'] = 0.6; frames[:] = [{'kind':2,'length':20},{}]; expected_get = 2
elif case == 'parse-exception':
    def refuse_copy(_payload): raise RuntimeError('injected status copy exception')
    namespace['Status'].from_buffer_copy = refuse_copy
    expected_stage, expected_exception = 'diagnostic-error', 'RuntimeError'
elif case in ('request-exception','selector-exception','register-exception','select-exception','get-exception'):
    configuration['raise'] = case.split('-')[0]
    expected_stage, expected_exception = 'diagnostic-error', 'RuntimeError'
    expected_get = 1 if case == 'get-exception' else 0
elif case in ('serialization-cap','serialization-exact'):
    observation = {'padding': ''}
    empty = len((json.dumps(observation, sort_keys=True)+'\n').encode())
    observation['padding'] = 'x' * (65536 - empty + (1 if case == 'serialization-cap' else 0))
    sink = types.SimpleNamespace(buffer=io.BytesIO())
    print('EXERCISE ' + case)
    with contextlib.redirect_stdout(sink):
        try: namespace['emit'](observation)
        except RuntimeError:
            assert case == 'serialization-cap'
            assert sink.buffer.getvalue() == b''
        else:
            assert case == 'serialization-exact', 'serialization guard did not refuse'
            assert len(sink.buffer.getvalue()) == 65536
    print('PASS ' + case)
    sys.exit(0)
else: raise AssertionError('unknown case ' + case)
sink = types.SimpleNamespace(buffer=io.BytesIO())
print('EXERCISE ' + case)
with contextlib.redirect_stdout(sink): code = namespace['run_worker']()
observation = json.loads(sink.buffer.getvalue())
assert observation['state'] == expected_state, (case, observation, calls)
assert code == (0 if expected_state == 'observed' else 2), (case, code)
assert observation['subscription'] is False
assert observation['purpose'] == 'status-only diagnostic; never operational qualification'
if expected_stage is not None: assert observation['stage'] == expected_stage, (case, observation, calls)
if expected_errno is not None: assert observation['errno'] == expected_errno, (case, observation)
if expected_exception is not None: assert observation['exception'] == expected_exception
names = [call[0] for call in calls]
assert names.count('audit_open') == int(expected_open), (case,calls)
assert names.count('audit_request_status') == int(expected_request), (case,calls)
assert names.count('audit_get_reply') == expected_get, (case,calls)
assert names.count('audit_close') == int(expected_open and case != 'open-failure'), (case,calls)
assert names.count('selector-close') == names.count('register'), (case,calls)
if not expected_open: assert 'CDLL' not in names or case == 'load', (case,calls)
if expected_state == 'observed':
    assert observation['status'] == dict(zip((name for name, _ in namespace['Status']._fields_), range(0xfffffff5,0x100000000)))
    assert len(observation['status']) == 11
assert len(sink.buffer.getvalue()) <= 65536
print('PASS ' + case)
`;

function runCase(name: string, mutation?: string) {
  const child = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-S', '-c', harness], {
    stdin: Buffer.from(
      JSON.stringify({ source: readFileSync(sourcePath, 'utf8'), case: name, mutation }),
    ),
    timeout: 8000,
  });
  const log = `${child.stdout.toString()}${child.stderr.toString()}`;
  const evidence = process.env['PUNI119_EVIDENCE'];
  if (evidence !== undefined)
    writeFileSync(
      join(evidence, `${name}${mutation === undefined ? '' : `-omit-${mutation}`}.log`),
      log,
    );
  return { code: child.exitCode, log };
}

for (const name of ['late-ready', 'late-get', 'deadline-ready', 'deadline-get', 'deadline-ack']) {
  test(`status waiting rejects ${name} beyond the existing one-second window`, () => {
    const execution = runCase(name);
    expect(execution.log).toContain(`PASS ${name}`);
    expect(execution.code).toBe(0);
  });
}

for (const name of [
  'near-deadline',
  'main-success',
  'main-arguments',
  'success',
  'library-directory',
  'library-symlink',
  'library-owner',
  'library-group-write',
  'library-other-write',
  'Header',
  'Status',
  'Message',
  'Reply',
  'missing',
  'stat',
  'load',
  'open-failure',
  'request-negative',
  'request-zero',
  'get-negative',
  'received-short',
  'header-short',
  'header-overrun',
  'sequence',
  'short-error',
  'negative-error',
  'positive-error',
  'ack-status',
  'count',
  'kind',
  'short-status',
  'timeout',
  'request-exception',
  'selector-exception',
  'parse-exception',
  'register-exception',
  'select-exception',
  'get-exception',
  'serialization-cap',
  'serialization-exact',
]) {
  test(`fake native status contract: ${name}`, () => {
    const execution = runCase(name);
    expect(execution.log).toContain(`PASS ${name}`);
    expect(execution.code).toBe(0);
  });
}

for (const [name, mutation] of [
  ['open-failure', 'open-failure'],
  ['main-arguments', 'arguments'],
  ['library-directory', 'library-regular'],
  ['library-owner', 'library-owner'],
  ['library-group-write', 'library-owner'],
  ['library-other-write', 'library-owner'],
  ['library-symlink', 'library-regular'],
  ['Header', 'uapi-size'],
  ['Status', 'uapi-size'],
  ['Message', 'reply-size'],
  ['Reply', 'reply-size'],
  ['request-negative', 'request-negative'],
  ['request-zero', 'request-zero'],
  ['sequence', 'header'],
  ['short-error', 'short-error'],
  ['negative-error', 'negative-error'],
  ['positive-error', 'positive-error'],
  ['kind', 'kind'],
  ['short-status', 'short-status'],
  ['count', 'count'],
  ['success', 'close'],
  ['serialization-cap', 'serialization'],
  ['get-negative', 'get-negative'],
  ['timeout', 'timeout'],
  ['late-ready', 'timeout'],
  ['late-get', 'late-get'],
  ['deadline-ack', 'late-get'],
] as const) {
  test(`guard proof rejects omission of ${mutation} for ${name}`, () => {
    const execution = runCase(name, mutation);
    expect(execution.code).toBe(1);
    expect(execution.log).toContain(`EXERCISE ${name}`);
    expect(execution.log).toContain('AssertionError');
    expect(execution.log).not.toContain('BoundaryViolation');
  });
}

const bootstrapHarness =
  harness.slice(0, harness.indexOf("namespace = {'__name__'")) +
  String.raw`
import builtins
os.stat = real_stat
proposal = request['proposal']
command = proposal.split(chr(96)*3+'sh\n', 1)[1].split('\n'+chr(96)*3, 1)[0]
assert command.startswith('sudo /usr/bin/timeout --foreground --signal=KILL 5s /usr/bin/python3 -I -B -S -c ')
body = command.split(" -c '", 1)[1]
assert body.endswith("\n'")
body = body[:-1]
tree = ast.parse(body)
pins = {node.targets[0].id: node.value.value for node in tree.body if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and isinstance(node.value, ast.Constant)}
assert pins['expected'] == hashlib.sha256(source.encode()).hexdigest(), 'proposal pin must match frozen source'
namespace = {}
frames[:] = [{}]
opened = []
closed = []
executed = []
real_builtin_open = builtins.open
class ForbiddenExec(BaseException): pass
with tempfile.TemporaryDirectory(prefix='audit-status-bootstrap-') as directory:
    path = os.path.join(directory, 'inspection.py')
    with real_builtin_open(path, 'wb') as stream: stream.write(source.encode())
    if case == 'metadata-directory':
        os.unlink(path); os.mkdir(path)
    elif case == 'metadata-hardlink': os.link(path, path + '.link')
    elif case == 'metadata-empty':
        with real_builtin_open(path, 'wb'): pass
    elif case == 'metadata-oversize':
        with real_builtin_open(path, 'wb') as stream: stream.write(b'#' * 16385)
    elif case == 'hash':
        with real_builtin_open(path, 'wb') as stream: stream.write(b"raise ForbiddenExec('unverified payload executed')\n" + source.encode())
    elif case == 'nofollow':
        os.rename(path, path + '.target'); os.symlink(path + '.target', path)
    elif case == 'missing': os.unlink(path)
    elif case == 'unreadable': os.chmod(path, 0)
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'path': node.value = ast.Constant(path)
    def change_stat(entry, **changes):
        names = ('st_dev','st_ino','st_uid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
        return types.SimpleNamespace(**{name: changes.get(name,getattr(entry,name)) for name in names})
    stat_count = [0]
    def tracked_open(name, flags, *arguments):
        assert name == path, 'unexpected source open path'
        assert not opened, 'forbidden source reopen'
        descriptor = real_open(name, flags, *arguments)
        opened.append(descriptor)
        return descriptor
    def tracked_read(descriptor, count):
        assert descriptor in opened and count == 16385, 'source read must stay bounded'
        payload = real_read(descriptor,count)
        if case == 'short-read': return payload[:-1]
        if case == 'descriptor-race': os.chmod(path,0o600)
        if case == 'path-change':
            os.rename(path,path+'.original')
            with real_builtin_open(path,'wb') as stream: stream.write(source.encode())
        return payload
    def tracked_fstat(descriptor):
        stat_count[0] += 1
        identity = real_fstat(descriptor)
        if case == 'declared-size': return change_stat(identity,st_size=identity.st_size+1)
        if case == 'descriptor-change' and stat_count[0] == 2: return change_stat(identity,st_ino=identity.st_ino+1)
        return identity
    def tracked_lstat(name):
        identity = real_lstat(name)
        if case == 'declared-size': return change_stat(identity,st_size=identity.st_size+1)
        if case == 'named-change': return change_stat(identity,st_ino=identity.st_ino+1)
        return identity
    def tracked_close(descriptor):
        assert descriptor in opened and descriptor not in closed, 'source close count'
        real_close(descriptor)
        closed.append(descriptor)
        if case == 'no-reopen':
            with real_builtin_open(path,'wb') as stream: stream.write(b"raise ForbiddenExec('mutable path reopened')\n")
    def forbid_builtin_open(name, *_arguments, **_options): raise AssertionError('forbidden builtin source reopen')
    def captured_exec(code, globals_):
        global namespace
        assert len(opened) == len(closed) == 1, 'source descriptor must close before exec'
        try: real_fstat(opened[0])
        except OSError as fault: assert fault.errno == errno.EBADF
        else: raise AssertionError('source descriptor still readable at exec')
        assert code.co_filename == '<audit-status-inspection>', 'synthetic compile filename'
        assert globals_ == {'__name__':'__main__','__file__':'<audit-status-inspection>'}, 'synthetic source namespace'
        assert sys.argv == ['audit-status-inspection']
        namespace = globals_
        namespace['ForbiddenExec'] = ForbiddenExec
        executed.append('captured-buffer')
        builtins.open = forbid_builtin_open
        real_exec(code, globals_)
    if mutation is not None:
        class Omit(ast.NodeTransformer):
            def visit_If(self,node):
                self.generic_visit(node)
                if mutation == 'metadata' and isinstance(node.test,ast.BoolOp) and any(isinstance(entry,ast.UnaryOp) for entry in node.test.values): return []
                if isinstance(node.test,ast.BoolOp) and len(node.test.values) == 4 and isinstance(node.test.values[0],ast.Compare):
                    position = {'length':0,'hash':1,'descriptor':2,'path':3}.get(mutation)
                    if position is not None: node.test.values.pop(position)
                return node
            def visit_Call(self,node):
                self.generic_visit(node)
                if mutation == 'close' and isinstance(node.func,ast.Attribute) and node.func.attr == 'close': return ast.Constant(None)
                if isinstance(node.func,ast.Name) and node.func.id == 'compile':
                    if mutation == 'filename': node.args[1] = ast.Constant(path)
                    if mutation == 'reopen': node.args[0] = ast.parse('os.read(os.open(path,os.O_RDONLY),16385)',mode='eval').body
                return node
        tree = Omit().visit(tree)
    tree = ast.fix_missing_locations(tree)
    os.open,os.read,os.close,os.fstat,os.lstat,os.stat = tracked_open,tracked_read,tracked_close,tracked_fstat,tracked_lstat,fake_stat
    sink = types.SimpleNamespace(buffer=io.BytesIO())
    refusal = None
    code = None
    print('EXERCISE bootstrap ' + case)
    try:
        with contextlib.redirect_stdout(sink):
            try: real_exec(compile(tree,'<proposal-bootstrap>','exec'),{'exec':captured_exec})
            except (OSError,RuntimeError) as fault: refusal = fault
            except SystemExit as fault: code = fault.code
    finally:
        os.open,os.read,os.close,os.fstat,os.lstat,os.stat = real_open,real_read,real_close,real_fstat,real_lstat,real_stat
        builtins.open = real_builtin_open
        for descriptor in opened:
            if descriptor not in closed: real_close(descriptor)
        if case == 'unreadable': os.chmod(path,0o600)
    if case in ('success','no-reopen'):
        assert refusal is None and code == 0, (case,refusal,code)
        assert executed == ['captured-buffer'] and len(opened) == len(closed) == 1
        observation = json.loads(sink.buffer.getvalue())
        assert observation['state'] == 'observed' and observation['subscription'] is False
        assert [call[0] for call in calls].count('audit_request_status') == 1
        assert [call[0] for call in calls].count('audit_close') == 1
    else:
        assert refusal is not None and code is None and not executed and not calls, (case,refusal,code,executed,calls)
        if case.startswith('metadata-'): assert str(refusal) == 'inspection source metadata refused', (case,refusal)
        elif case in ('nofollow','missing','unreadable'):
            assert isinstance(refusal,OSError)
            assert refusal.errno == {'nofollow':errno.ELOOP,'missing':errno.ENOENT,'unreadable':errno.EACCES}[case], (case,refusal)
        else: assert str(refusal) == 'inspection source identity or hash refused', (case,refusal)
        assert len(opened) == len(closed), (case,opened,closed)
print('PASS bootstrap ' + case)
`;

function runBootstrap(name: string, mutation?: string) {
  const child = Bun.spawnSync(['/usr/bin/python3', '-I', '-B', '-S', '-c', bootstrapHarness], {
    stdin: Buffer.from(
      JSON.stringify({
        source: readFileSync(sourcePath, 'utf8'),
        proposal: readFileSync(proposalPath, 'utf8'),
        case: name,
        mutation,
      }),
    ),
    timeout: 8000,
  });
  const log = `${child.stdout.toString()}${child.stderr.toString()}`;
  const evidence = process.env['PUNI119_EVIDENCE'];
  if (evidence !== undefined)
    writeFileSync(
      join(evidence, `bootstrap-${name}${mutation === undefined ? '' : `-omit-${mutation}`}.log`),
      log,
    );
  return { code: child.exitCode, log };
}

for (const name of [
  'success',
  'metadata-directory',
  'metadata-hardlink',
  'metadata-empty',
  'metadata-oversize',
  'hash',
  'short-read',
  'declared-size',
  'descriptor-race',
  'descriptor-change',
  'named-change',
  'path-change',
  'nofollow',
  'missing',
  'unreadable',
  'no-reopen',
]) {
  test(`captured-buffer bootstrap: ${name}`, () => {
    const execution = runBootstrap(name);
    expect(execution.log).toContain(`PASS bootstrap ${name}`);
    expect(execution.code).toBe(0);
  });
}

for (const [name, mutation, failure] of [
  ['metadata-hardlink', 'metadata', 'AssertionError'],
  ['hash', 'hash', 'ForbiddenExec'],
  ['declared-size', 'length', 'AssertionError'],
  ['descriptor-change', 'descriptor', 'AssertionError'],
  ['named-change', 'path', 'AssertionError'],
  ['success', 'close', 'AssertionError'],
  ['success', 'filename', 'AssertionError'],
  ['no-reopen', 'reopen', 'AssertionError'],
] as const) {
  test(`bootstrap guard proof rejects omission of ${mutation} for ${name}`, () => {
    const execution = runBootstrap(name, mutation);
    expect(execution.code).toBe(1);
    expect(execution.log).toContain(`EXERCISE bootstrap ${name}`);
    expect(execution.log).toContain(failure);
    expect(execution.log).not.toContain('BoundaryViolation');
  });
}
