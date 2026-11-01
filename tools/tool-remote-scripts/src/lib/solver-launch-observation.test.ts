import { expect, test } from 'bun:test';

import { RUNTIME_SESSION_FIXTURE } from '../fixtures/initial-handoff';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { SOLVER_LAUNCH_WORKER } from './solver-launch-observation';

const fixtureRequest = String.raw`
fixture_accounts()
RUNTIME_SESSION_PROFILES_HEX=json.dumps(fixture_profiles(),sort_keys=True,separators=(',',':')).encode().hex()
request={'nonce':'a'*64,'writerManifestSha256':'b'*64,'coordinator':{'pid':41,'startTime':'123','cgroup':'/fixture'},'databases':[],'layouts':['prod','dev'],'writerPaths':[{'member':name,'path':FIXED_WRITERS[index] if index<7 else '/fixture/'+name} for index,name in enumerate(WRITER_NAMES)],'solver':None}
`;
async function runWorker(assertions: string) {
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    RUNTIME_SESSION_FIXTURE +
    '\n' +
    SOLVER_LAUNCH_WORKER +
    fixtureRequest +
    assertions;
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

test('actual runtime worker preserves independent launch expectation across coherent legitimate session identities', async () => {
  const observed = await runWorker(String.raw`
first=collect_runtime_launch(request,RuntimeSessionFixture([('c1',0),('c2',1000)]))
second=collect_runtime_launch(request,RuntimeSessionFixture([('other1',0),('other2',1000)],system_id='C'*32,user_id='D'*32))
assert first==second,('legitimate current session identities changed runtime expectation',first,second)
assert first=={'format':'dependency-runtime-launch-observation','version':1,'nonce':'a'*64,'writerManifestSha256':'b'*64,'hostMachineIdSha256':'6ed6653dba3d6aee8110c6e23de37f15c609b8a6e29aa164d1acace604e5cb7e','runtimeLaunchSha256':fixture_runtime_hash()},first
for sessions in [[],[('rootonly',0)],[('one',1000),('two',1000)]]:
    assert collect_runtime_launch(request,RuntimeSessionFixture(sessions))==first
print('coherent-runtime-identity')
`);
  expect(observed.stderr).toBe('');
  expect(observed.code).toBe(0);
  expect(observed.stdout).toBe('coherent-runtime-identity\n');
});

for (const [fault, diagnostic] of [
  ['get-session', 'runtime session association differs'],
  ['user-tuple', 'runtime session observation changed'],
  ['leader', 'runtime session observation changed'],
  ['relationship', 'runtime session observation changed'],
  ['system-bus', 'runtime closing bus incarnation changed'],
  ['user-bus', 'runtime closing bus incarnation changed'],
  ['scope-cgroup', 'runtime session observation changed'],
  ['roster-churn', 'runtime session observation changed'],
  ['duplicate-roster', 'duplicate runtime session'],
  ['boolean-uid', 'runtime session uid malformed'],
  ['duplicate-json', 'duplicate runtime reply key'],
  ['oversize-reply', 'runtime typed reply unavailable or oversized'],
  ['wrong-bus-wrapper', 'runtime method return malformed'],
  ['wrong-owner-uid', 'runtime service owner uid differs'],
  ['foreign-fragment', 'runtime fragment mode or size differs'],
  ['extra-fragment', 'runtime session profile differs'],
  ['duplicate-description', 'runtime fragment description missing or duplicate'],
] as const) {
  test(`actual runtime worker rejects current ${fault} with stable independently prepared pins`, async () => {
    const observed = await runWorker(
      `collect_runtime_launch(request,RuntimeSessionFixture([('c1',0),('c2',1000)],${JSON.stringify(fault)}))`,
    );
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain(diagnostic);
    expect(observed.stdout).toBe('');
  });
}
for (const malformed of ['short', 'uppercase', 'space', 'duplicate', 'reverse'] as const) {
  test(`actual worker rejects ${malformed} profile data inside invocation before collection`, async () => {
    const observed = await runWorker(`
original=RUNTIME_SESSION_PROFILES_HEX
fault=${JSON.stringify(malformed)}
if fault=='short':RUNTIME_SESSION_PROFILES_HEX=original[:-2]
if fault=='uppercase':RUNTIME_SESSION_PROFILES_HEX=original.upper()
if fault=='space':RUNTIME_SESSION_PROFILES_HEX=(bytes.fromhex(original)+b' ').hex()
if fault=='duplicate':RUNTIME_SESSION_PROFILES_HEX=bytes.fromhex(original).replace(b'"uid":0',b'"uid":1').hex()
if fault=='reverse':RUNTIME_SESSION_PROFILES_HEX=json.dumps(list(reversed(fixture_profiles())),sort_keys=True,separators=(',',':')).encode().hex()
collect_runtime_launch(request,RuntimeSessionFixture([]))
`);
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('runtime profile');
  });
}

for (const surface of ['metadata', 'unit-binding'] as const) {
  test(`actual runtime collection rejects duplicate JSON keys in ordinary ${surface} replies`, async () => {
    const observed = await runWorker(
      String.raw`
class DuplicateOrdinaryReply(RuntimeSessionFixture):
    def query(self,argv):
        code,content,stderr=super().query(argv)
        selected=('get-property' in argv and 'org.freedesktop.systemd1.Unit' in argv and argv[-1]=='Id') if SURFACE=='metadata' else 'LoadUnit' in argv
        if selected:content=content.replace(b'{"type":',b'{"type":"foreign","type":',1)
        return code,content,stderr
collect_runtime_launch(request,DuplicateOrdinaryReply([('c1',0),('c2',1000)]))
`.replace(
        'class DuplicateOrdinaryReply(RuntimeSessionFixture):',
        `SURFACE=${JSON.stringify(surface)}\nclass DuplicateOrdinaryReply(RuntimeSessionFixture):`,
      ),
    );
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain('duplicate runtime reply key');
  });
}

for (const fault of ['ordinary-file', 'ordinary-parent', 'leader-control'] as const) {
  test(`review runtime refuses stable-byte ${fault} outside earlier closing boundary`, async () => {
    const observed = await runWorker(
      String.raw`
class ChangedObservation(RuntimeSessionFixture):
    changed=False
    def query(self,argv):
        response=super().query(argv)
        if 'get-property' in argv and argv[-1]=='SourcePath':self.changed=True
        return response
    def regular(self,path,limit):
        content,key=super().regular(path,limit)
        if FAULT=='ordinary-file' and path=='/etc/crontab' and self.changed:key=(key[0],key[1]+1,*key[2:])
        return content,key
    def metadata(self,path,follow=True):
        metadata=super().metadata(path,follow)
        if FAULT=='ordinary-parent' and path=='/etc' and self.changed:metadata.st_ino+=1
        return metadata
    def read(self,path,limit):
        content=super().read(path,limit)
        if FAULT=='leader-control' and path.startswith('/proc/5000/') and path.endswith('/cgroup'):content=content[:-1]+b'/bad\tchild\n'
        return content
collect_runtime_launch(request,ChangedObservation([('c1',0)]))
`.replace(
        'class ChangedObservation(RuntimeSessionFixture):',
        `FAULT=${JSON.stringify(fault)}\nclass ChangedObservation(RuntimeSessionFixture):`,
      ),
    );
    expect(observed.code).toBe(1);
    expect(observed.stderr).toContain(
      fault === 'leader-control'
        ? 'runtime filesystem path malformed'
        : 'runtime ordinary launch observation changed',
    );
  });
}

test('review scope evidence stops before retaining the first cumulative overflow', async () => {
  const observed = await runWorker(String.raw`
class LargeRelationships(RuntimeSessionFixture):
    reads=0
    def query(self,argv):
        response=super().query(argv)
        if 'get-property' in argv and argv[-1] in [key[0].upper()+key[1:] for key in RUNTIME_RELATIONSHIPS]:
            self.reads+=1
            values=[('/' if argv[-1]=='RequiresMountsFor' else '')+'a'*220+str(index)+'.mount' for index in range(4096)]
            content=json.dumps({'type':'as','data':values},separators=(',',':')).encode()
            assert len(content)<1048576
            return 0,content,b''
        return response
host=LargeRelationships([('c1',0)]);budget=RuntimeBudget();sessions=runtime_sessions(host,budget)
try:runtime_scope_evidence(host,sessions,budget)
except Refusal as cause:
    assert str(cause)=='runtime retained observation exceeds bound',cause
    assert host.reads<28,('all relationship replies retained',host.reads,budget.bytes)
    assert budget.bytes<=8388608,('budget mutated past ceiling',budget.bytes)
    print('early-cap')
else:raise AssertionError('missing cumulative cap')
`);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(observed.stdout).toBe('early-cap\n');
});

test('review runtime rejects same-byte ordinary symlink replacement after opening closure with independent pins', async () => {
  const observed = await runWorker(String.raw`
class ChangedLink(RuntimeSessionFixture):
    changed=False
    content=b'# owned durable definition\n'
    def query(self,argv):
        code,content,stderr=super().query(argv)
        if 'show' in argv and argv[argv.index('show')+1]=='user-0.slice':content=content.replace(b'FragmentPath=\n',b'FragmentPath=/etc/alias.slice\n')
        if 'get-property' in argv and argv[-3]==unit_path('user-0.slice') and argv[-1]=='FragmentPath':content=json.dumps({'type':'s','data':'/etc/alias.slice'}).encode()
        if 'get-property' in argv and argv[-1]=='SourcePath':self.changed=True
        return code,content,stderr
    def metadata(self,path,follow=True):
        metadata=super().metadata(path,follow)
        if path=='/etc/alias.slice':metadata.st_mode=stat.S_IFLNK|0o777;metadata.st_ino+=1 if self.changed else 0
        if path=='/etc/target.slice':metadata.st_mode=stat.S_IFREG|0o644;metadata.st_size=len(self.content)
        return metadata
    def link(self,path):assert path=='/etc/alias.slice';return '/etc/target.slice'
    def resolve(self,path):return '/etc/target.slice' if path=='/etc/alias.slice' else path
    def regular(self,path,limit):
        if path=='/etc/target.slice':return self.content,metadata_key(self.metadata(path))
        return super().regular(path,limit)
unit=fixture_unit('user-0.slice');unit['fragment']={'path':'/etc/alias.slice','sha256':hashlib.sha256(b'# owned durable definition\n').hexdigest()}
cron=[{'source':'crontab:root','state':'absent'},{'source':'crontab:puni1','state':'absent'},{'source':'/etc/crontab','state':'present','sha256':hashlib.sha256(b'# owned fixture\n').hexdigest()},{'source':'/etc/anacrontab','state':'absent'}]
expected=hashlib.sha256(b'wbs-dependency-runtime-launch\x00v1\x00'+json.dumps({'version':1,'cron':sorted(cron,key=lambda entry:entry['source']),'units':[unit,fixture_unit('user-1000.slice')],'sessionProfiles':fixture_profiles()},sort_keys=True,separators=(',',':')).encode()).hexdigest()
actual=collect_runtime_launch(request,ChangedLink([('c1',0)]))
assert actual['runtimeLaunchSha256']==expected,(actual,expected)
print('ACCEPTED same-byte link identity change')
`);
  expect(observed.code).toBe(1);
  expect(observed.stderr).toContain('runtime ordinary launch observation changed');
});

test('review runtime path boundaries reject controls and noncanonical forms while retaining valid UTF8 paths', async () => {
  const observed = await runWorker(String.raw`
for value in ['/bad\tchild','/bad\nchild','/bad\x00child','/bad\x7fchild','/bad\u0085child','//root/path','/one//two','/one/../two','/one/./two','/trailing/','relative','']:
    try:runtime_filesystem_path(value)
    except Refusal as cause:assert str(cause)=='runtime filesystem path malformed',cause
    else:raise AssertionError(('invalid runtime path accepted',repr(value)))
for value in ['/','/user.slice/user-1000.slice/session-c1.scope','/owned/mount-\u03b1']:
    assert runtime_filesystem_path(value)==value
assert runtime_filesystem_path('',True)==''
class PathReply(RuntimeSessionFixture):
    def query(self,argv):
        code,content,stderr=super().query(argv)
        if 'get-property' in argv and argv[-1]==PROPERTY:
            content=json.dumps({'type':'as' if PROPERTY=='RequiresMountsFor' else 's','data':['/bad\tpath'] if PROPERTY=='RequiresMountsFor' else '/bad\tpath'}).encode()
        return code,content,stderr
for PROPERTY in ['ControlGroup','SourcePath','RequiresMountsFor']:
    host=PathReply([('c1',0)]);budget=RuntimeBudget();sessions=runtime_sessions(host,budget)
    try:runtime_scope_evidence(host,sessions,budget)
    except Refusal as cause:assert str(cause)=='runtime filesystem path malformed',cause
    else:raise AssertionError(('invalid typed path accepted',PROPERTY))
print('runtime-path-boundaries')
`);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(observed.stdout).toBe('runtime-path-boundaries\n');
});

test('review session properties stop before retaining a field beyond residual shared budget', async () => {
  const observed = await runWorker(String.raw`
class LargeUser(RuntimeSessionFixture):
    reads=[]
    def query(self,argv):
        code,content,stderr=super().query(argv)
        if 'get-property' in argv and argv[-2]=='org.freedesktop.login1.Session':
            self.reads.append(argv[-1])
            if argv[-1]=='User':content=json.dumps({'type':'(uo)','data':[0,'/org/freedesktop/login1/user/'+'u'*4000]}).encode()
        return code,content,stderr
host=LargeUser([('c1',0)]);budget=RuntimeBudget();budget.admit('p'*(8388608-512))
try:runtime_sessions(host,budget)
except Refusal as cause:
    assert str(cause)=='runtime retained observation exceeds bound',cause
    assert host.reads==['Id','User'],host.reads
    assert budget.bytes<=8388608,budget.bytes
else:raise AssertionError('session fields exceeded residual budget')
print('early-session-cap')
`);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(observed.stdout).toBe('early-session-cap\n');
});
