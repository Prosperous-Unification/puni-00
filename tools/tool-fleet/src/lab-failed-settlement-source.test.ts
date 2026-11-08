import { expect, spyOn, test } from 'bun:test';

import * as repair from './lab-raw-repair';

const { settleFailedRepair } = repair as unknown as {
  settleFailedRepair: (payload: Uint8Array, digest: string) => unknown;
};

const startup = String.raw`
import ast, hashlib, importlib.util, json, os, pathlib, shutil, socket, subprocess, sys, tempfile, types
scenario=sys.argv[2]
omission=sys.argv[3] if len(sys.argv)>3 else 'none'
with tempfile.TemporaryDirectory(prefix='puni-settlement-source113-') as scratch:
    root=pathlib.Path(scratch); helpers=root/'tools/tool-fleet/src';helpers.mkdir(parents=True)
    names=('lab-raw-repair.py','lab-raw-preparation.py','lab-repair-worker.py',
        'lab-seed-preparation.py','lab-guest-preparation.py','lab-raw-allocation.py')
    pins=[]
    for name in names:
        target=helpers/name;shutil.copyfile(pathlib.Path(sys.argv[1])/name,target);target.chmod(0o600)
        if name=='lab-raw-preparation.py':
            target.write_text('from pathlib import Path\nPath('+repr(str(root/'helper-executed'))+').write_bytes(b"executed")\n'+target.read_text())
        if name=='lab-repair-worker.py' and scenario=='worker-bootstrap':
            target.write_text(target.read_text().replace('    def admit_request(self, reading=False):',
                '    def admit_request(self, reading=False):\n        assert callable(self.repair.verify_inputs), "lost verified execution namespace"'))
        if name=='lab-raw-repair.py' and omission!='none':
            changed=[]
            class Omit(ast.NodeTransformer):
                def visit_Call(self,node):
                    if isinstance(node.func,ast.Name) and node.func.id=='_source_require' and len(node.args)==2 and isinstance(node.args[1],ast.Constant) and node.args[1].value==omission:
                        node.args[0]=ast.Subscript(value=ast.Tuple(elts=[node.args[0],ast.Constant(True)],ctx=ast.Load()),slice=ast.Constant(1),ctx=ast.Load());changed.append(omission)
                    return self.generic_visit(node)
                def visit_Assign(self,node):
                    if any(isinstance(target,ast.Name) and target.id=='_SOURCE_BOOTSTRAP' for target in node.targets):
                        node.value=ast.Constant(ast.unparse(ast.fix_missing_locations(Omit().visit(ast.parse(node.value.value)))))
                    return self.generic_visit(node)
            tree=Omit().visit(ast.parse(target.read_text()));assert changed,omission
            target.write_text(ast.unparse(ast.fix_missing_locations(tree)))
        pins.append(dict(path=str(target),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            bytes=target.stat().st_size,uid=os.geteuid(),mode=0o600))
    state=str(root)+'/.puni/fleet-labs/observability-baseline'
    for name in ('original.json','capture.json','qualification.json','witness'):
        pins.append(dict(path=state+'/'+name,sha256='d'*64,bytes=79,uid=os.geteuid(),mode=0o600))
    original=state+'/raw-repair-'+'a'*32
    for name in ('reservation.json','request-binding.json','worker-ready.json','failure.json'):
        pins.append(dict(path=original+'/'+name,sha256='e'*64,bytes=79,uid=os.geteuid(),mode=0o600))
    request=dict(schemaVersion=2,operation='settle-failed-repair',root=str(root),state=state,nonce='b'*32,
        pins=pins,originalRepairRequest=state+'/original.json',originalDirectory=original,
        originalTerminalCapture=state+'/capture.json',qualification=state+'/qualification.json',witness=state+'/witness',
        expectedRaw=dict(device='1',inode='2',owner=os.geteuid(),mode='0600',links=1,
            logicalBytes='8589934592',allocatedBytes='4096',mtimeNs='1',ctimeNs='2'))
    payload=json.dumps(request,sort_keys=True,separators=(',',':')).encode()
    if scenario=='duplicate':payload=payload[:-1]+b',"nonce":"b"}'
    if scenario=='oversized':payload=b' '*65536
    if scenario=='operation':request['operation']='repair'
    if scenario=='history':
        request['originalDirectory']=state+'/raw-repair-'+request['nonce']
        for pin in request['pins']:
            if '/raw-repair-'+'a'*32+'/' in pin['path']:pin['path']=request['originalDirectory']+'/'+pin['path'].rsplit('/',1)[-1]
    if scenario=='pins':request['pins']=[pin for pin in request['pins'] if not pin['path'].endswith('/failure.json')]
    if scenario=='source-entry':request['root']=str(root/'foreign');request['state']=request['root']+'/.puni/fleet-labs/observability-baseline'
    if scenario in ('operation','history','pins'):
        payload=json.dumps(request,sort_keys=True,separators=(',',':')).encode()
    if scenario=='source-entry':
        request['root']=str(root/'foreign');request['state']=str(root/'foreign')+'/.puni/fleet-labs/observability-baseline'
        request['originalDirectory']=request['state']+'/raw-repair-'+'a'*32
        for key in ('originalRepairRequest','originalTerminalCapture','qualification','witness'):
            previous=request[key];request[key]=request['state']+'/'+previous.rsplit('/',1)[-1]
            for pin in request['pins']:
                if pin['path']==previous:pin['path']=request[key]
        for pin in request['pins']:
            if '/raw-repair-'+'a'*32+'/' in pin['path']:pin['path']=request['originalDirectory']+'/'+pin['path'].rsplit('/',1)[-1]
        payload=json.dumps(request,sort_keys=True,separators=(',',':')).encode()
    if scenario=='noncanonical':payload=json.dumps(request,sort_keys=True).encode()
    if scenario=='boolean':
        request['expectedRaw']['owner']=True;payload=json.dumps(request,sort_keys=True,separators=(',',':')).encode()
    digest=hashlib.sha256(payload).hexdigest()
    arguments=['/usr/bin/python3','-I','-B',str(helpers/names[0]),'--settle-failed-repair',digest]
    endpoint=None
    if scenario in ('worker-bootstrap','worker-path'):
        original_path=pathlib.Path(original);original_path.mkdir(parents=True,mode=0o700)
        request_path=original_path/('foreign.json' if scenario=='worker-path' else 'settlement-request.json')
        request_path.write_bytes(payload);request_path.chmod(0o600)
        if scenario=='worker-bootstrap':
            spec=importlib.util.spec_from_file_location('launch_repair',helpers/names[0]);repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)
            native_popen=subprocess.Popen
            subprocess.Popen=lambda arguments,**kwargs:arguments
            try:arguments=repair.writer.SettlementContext(repair,request,digest).launch_worker(types.SimpleNamespace(recipient=0))
            finally:subprocess.Popen=native_popen
            arguments=arguments[arguments.index('/usr/bin/python3'):]
            # The launch-shape inspection imported helpers in this fixture process; isolate its marker from cold execution.
            (root/'helper-executed').unlink()
        else:arguments=['/usr/bin/python3','-I','-B',str(helpers/names[0]),'--settlement-worker',str(request_path),digest]
        endpoint,recipient=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
        invocation=subprocess.run(arguments,stdin=recipient,capture_output=True,timeout=5)
        recipient.close();endpoint.close()
    else:
        if scenario=='worker-arguments':arguments=['/usr/bin/python3','-I','-B',str(helpers/names[0]),'--settlement-worker',digest]
        invocation=subprocess.run(arguments,input=payload,capture_output=True,timeout=5)
    assert invocation.returncode==1 and invocation.stdout==b'',invocation
    expected={'valid':'settlement-inputs-unqualified','duplicate':'repair-source-json-duplicate',
        'oversized':'settlement-request-bound','boolean':'repair-source-snapshot-invalid',
        'operation':'settlement-request-invalid','history':'settlement-request-history','pins':'settlement-request-pins',
        'source-entry':'settlement-source-entry','noncanonical':'settlement-request-canonical',
        'worker-bootstrap':'settlement-inputs-unqualified','worker-path':'settlement-worker-path','worker-arguments':'repair-arguments'}[scenario]
    if omission=='none':assert invocation.stderr.decode().strip()==expected,(expected,invocation.stderr)
    imported=(root/'helper-executed').exists()
    assert imported == (scenario in ('valid','worker-bootstrap') or omission!='none'),(scenario,omission,invocation.stderr)
    if scenario not in ('worker-bootstrap','worker-path'):assert not pathlib.Path(state).exists(),'entry published before external qualification'
    print('refused-before-publication')
`;

for (const scenario of [
  'valid',
  'duplicate',
  'oversized',
  'boolean',
  'operation',
  'history',
  'pins',
  'source-entry',
  'noncanonical',
  'worker-bootstrap',
  'worker-path',
  'worker-arguments',
]) {
  test(`settlement stdin bootstrap ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', startup, import.meta.dir, scenario],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('refused-before-publication');
  });
}

test('settlement API uses bounded stdin and refuses v1 or mixed authority envelopes', () => {
  expect(settleFailedRepair).toBeFunction();
  const payload = new TextEncoder().encode('{}');
  const digest = new Bun.CryptoHasher('sha256').update(payload).digest('hex');
  const envelope = {
    schemaVersion: 1,
    scope: 'failed-repair-settlement',
    accepted: true,
    nonce: 'b'.repeat(32),
    receiptDigest: 'c'.repeat(64),
    executionDigest: 'd'.repeat(64),
    releasedReservationDigest: 'e'.repeat(64),
    releasedGrossBytes: '141754548224',
    retainedSettlementDebtBytes: '33554432',
    repairAuthority: false,
    guestAuthority: false,
    fullRehearsalAuthority: false,
  };
  const completed = Bun.spawnSync(['/usr/bin/true'], { stdout: 'pipe', stderr: 'pipe' });
  expect(completed.exitCode).toBe(0);
  const launch = spyOn(Bun, 'spawnSync');
  try {
    launch.mockImplementation((...arguments_) => {
      expect(arguments_[0]).toContain('--settle-failed-repair');
      expect(arguments_[0]).toContain(digest);
      const options = arguments_[1];
      if (typeof options !== 'object' || options === null || !('stdin' in options)) {
        throw new Error('settlement launch requires stdin options');
      }
      expect(options.stdin).toEqual(payload);
      return {
        ...completed,
        stdout: Buffer.from(JSON.stringify(envelope) + '\n'),
        stderr: Buffer.from(''),
      };
    });
    expect(settleFailedRepair(payload, digest)).toEqual(envelope);
    for (const change of [
      { scope: 'raw-repair-preparation' },
      { repairAuthority: true },
      { retainedSettlementDebtBytes: '0' },
      { extra: true },
      { releasedGrossBytes: true },
    ]) {
      launch.mockReturnValue({
        ...completed,
        stdout: Buffer.from(JSON.stringify({ ...envelope, ...change }) + '\n'),
        stderr: Buffer.from(''),
      });
      expect(() => settleFailedRepair(payload, digest)).toThrow('producer-malformed');
    }
    const before = launch.mock.calls.length;
    expect(() => settleFailedRepair(new Uint8Array(65536), digest)).toThrow('invalid-arguments');
    expect(() => settleFailedRepair(payload, 'f'.repeat(64))).toThrow('invalid-arguments');
    expect(launch.mock.calls.length).toBe(before);
  } finally {
    launch.mockRestore();
  }
});

for (const [scenario, guard] of [
  ['operation', 'settlement-request-invalid'],
  ['history', 'settlement-request-history'],
  ['pins', 'settlement-request-pins'],
  ['source-entry', 'settlement-source-entry'],
  ['noncanonical', 'settlement-request-canonical'],
  ['worker-path', 'settlement-worker-path'],
] as const) {
  test(`settlement cold guard omission ${scenario}`, () => {
    const invocation = Bun.spawnSync(
      ['/usr/bin/python3', '-I', '-B', '-c', startup, import.meta.dir, scenario, guard],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stdout.toString().trim()).toBe('refused-before-publication');
  });
}
