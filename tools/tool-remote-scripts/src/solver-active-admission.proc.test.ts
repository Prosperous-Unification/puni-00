import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, open, readFile, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  fixtureRuntimeProfiles,
  initialHandoffFixture,
  initialHandoffLayout,
  RUNTIME_SESSION_HOST,
} from './fixtures/initial-handoff';
import { envLayout } from './lib/env';
import { withCanonicalLock } from './lib/lock';

const quoteShell = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
const hashBytes = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map((entry: unknown) => canonical(entry)).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(Reflect.get(value, key)))
        .join(',') +
      '}'
    );
  const serialized: unknown = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('owned expected projection is not JSON');
  return serialized;
}

async function activeFixture(
  fault: 'normal' | 'unknown' | 'pipe' = 'normal',
  holdRequest = false,
  sessionMode: 'none' | 'identities' | 'zero-to-two' = 'none',
  imageReadFault = false,
  programFault: 'none' | 'oversize' | 'expired' = 'none',
) {
  const root = scratchSync('active-cli-');
  const executable = join(root, 'bun');
  const bundle = join(root, 'supervisor.js');
  const config = join(root, 'config.json');
  const unit = join(root, 'supervisor.service');
  const socket = join(root, 'supervisor.sock');
  const machine = join(root, 'machine-id');
  const cron = join(root, 'crontab');
  const command = join(root, 'effective-command');
  const waited = join(root, 'original-exit');
  const retire = join(root, 'retire-writer');
  const writer = join(root, 'writer-pid');
  const requestEntered = join(root, 'request-entered');
  const requestReading = join(root, 'request-reading');
  const requestRead = join(root, 'request-read');
  const requestPipe = join(root, 'request.fifo');
  const layouts = [
    { ...envLayout('prod'), root, stateDir: root },
    { ...envLayout('dev'), root: join(root, 'dev'), stateDir: join(root, 'dev') },
  ];
  const unitPath = '/home/puni1/.config/systemd/user/wbs-solver-supervisor.service';
  const bunPath = '/home/puni1/.local/lib/wbs-solver/bun';
  const bundlePath = '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js';
  const configPath = '/home/puni1/.config/wbs-solver/solver-supervisor.json';
  const argv = [bunPath, bundlePath, '--config=' + configPath, '--admission=policy'];
  const unitContents =
    '[Unit]\nDescription=Owned active consumer fixture\n[Service]\nType=simple\nExecStart=' +
    argv.join(' ') +
    '\nRestart=on-failure\n';
  await writeFile(machine, '0123456789abcdef0123456789abcdef\n', { mode: 0o600 });
  await writeFile(cron, '# owned fixture\n', { mode: 0o600 });
  await writeFile(command, bunPath, { mode: 0o600 });
  await writeFile(unit, unitContents, { mode: 0o644 });
  const cronProjection = [
    { source: 'crontab:root', state: 'absent' },
    { source: 'crontab:puni1', state: 'absent' },
    { source: '/etc/crontab', state: 'present', sha256: hashBytes('# owned fixture\n') },
    { source: '/etc/anacrontab', state: 'absent' },
  ].sort((left, right) => Buffer.compare(Buffer.from(left.source), Buffer.from(right.source)));
  const unitProjection = {
    manager: 'user',
    name: 'wbs-solver-supervisor.service',
    canonicalId: 'wbs-solver-supervisor.service',
    names: ['wbs-solver-supervisor.service'],
    unitFileState: 'enabled',
    loadState: 'loaded',
    fragment: { path: unitPath, sha256: hashBytes(unitContents) },
    dropIns: [],
    transient: false,
    commands: [{ property: 'ExecStart', path: bunPath, argv, ignoreFailure: false }],
    triggers: [],
    triggeredBy: [],
  };
  const launchConfigurationSha256 = hashBytes(
    canonical({ version: 1, cron: cronProjection, units: [unitProjection] }),
  );
  const durableSlices =
    sessionMode === 'none'
      ? []
      : [0, 1000].map((uid) => ({
          manager: 'system',
          name: 'user-' + String(uid) + '.slice',
          canonicalId: 'user-' + String(uid) + '.slice',
          names: ['user-' + String(uid) + '.slice'],
          unitFileState: 'loaded-only',
          loadState: 'loaded',
          fragment: null,
          dropIns: [],
          transient: false,
          commands: [],
          triggers: [],
          triggeredBy: [],
        }));
  const runtimeLaunchSha256 = hashBytes(
    'wbs-dependency-runtime-launch\0v1\0' +
      canonical({
        version: 1,
        cron: cronProjection,
        units: [...durableSlices, unitProjection],
        sessionProfiles: fixtureRuntimeProfiles(),
      }),
  );
  const fixtureProgram = String.raw`
_OriginalHost=Host
class RuntimeFixtureHost(_OriginalHost):
    def __init__(self,deadline):
        super().__init__(deadline);self.sessions=None
    def prepare_sessions(self):
        if SESSION_MODE!='none' and self.sessions is None:
            count=int(open(PASS_RECORD).read()) if os.path.exists(PASS_RECORD) else 0
            open(PASS_RECORD,'w').write(str(count+1))
            roster=[] if SESSION_MODE=='zero-to-two' and count==0 else [('openingRoot' if count==0 else 'closingRoot',0),('openingUser' if count==0 else 'closingUser',1000)]
            self.sessions=RuntimeSessionFixture(roster)
    def open_runtime_fragment(self,path):return self.sessions.open_runtime_fragment(path) if self.sessions is not None else super().open_runtime_fragment(path)
    def read(self,path,limit):
        if self.sessions is not None and any(path.startswith('/proc/'+str(entry['leader'])+'/') for entry in self.sessions.sessions):return self.sessions.read(path,limit)
        if path=='/etc/machine-id':return super().read(MACHINE,limit)
        return super().read(path,limit)
    def regular(self,path,limit):
        if self.sessions is not None and path.startswith('/run/systemd/transient/'):return self.sessions.regular(path,limit)
        if path=='/etc/crontab':return super().regular(CRON,limit)
        if path=='/etc/anacrontab':raise FileNotFoundError(path)
        if path==UNIT:return super().regular(UNIT_FILE,limit)
        return super().regular(path,limit)
    def metadata(self,path,follow=True):
        if path=='/home/puni1' or path.startswith('/home/puni1/'):return super().metadata(UNIT_FILE if path==UNIT else os.path.dirname(UNIT_FILE),follow)
        if self.sessions is not None and (path in ['/','/run','/run/systemd','/run/systemd/transient'] or path.startswith('/run/systemd/transient/')):return self.sessions.metadata(path,follow)
        return super().metadata(UNIT_FILE if path==UNIT else CRON if path=='/etc/crontab' else path,follow)
    def exists(self,path):
        if path=='/etc/anacrontab':return False
        return super().exists(path)
    def listing(self,path,limit):
        if path in ['/etc/cron.d','/etc/cron.hourly','/etc/cron.daily','/etc/cron.weekly','/etc/cron.monthly']:return []
        return super().listing(path,limit)
    def query(self,arguments):
        self.prepare_sessions()
        if arguments[0]=='/usr/bin/crontab':return 1,b'',('no crontab for '+arguments[2]+'\n').encode()
        manager='user' if '--user' in arguments else 'system'
        if self.sessions is not None and manager=='system':return self.sessions.query(arguments)
        if 'list-unit-files' in arguments:return 0,(b'wbs-solver-supervisor.service enabled\n' if manager=='user' else b''),b''
        if 'list-units' in arguments:return 0,(b'wbs-solver-supervisor.service loaded inactive dead\n' if manager=='user' else b''),b''
        fields={'Id':'wbs-solver-supervisor.service','Names':'wbs-solver-supervisor.service','LoadState':'loaded','FragmentPath':UNIT,'DropInPaths':'','Transient':'no','NeedDaemonReload':'no','Triggers':'','TriggeredBy':'','ActiveState':'inactive','SubState':'dead','MainPID':'0','ControlPID':'0','InvocationID':'','ControlGroup':'','Job':'0'}
        if 'show' in arguments:return 0,('\n'.join(key+'='+value for key,value in fields.items())+'\n').encode(),b''
        if 'GetId' in arguments:return 0,encode({'type':'s','data':['a'*32 if manager=='system' else 'b'*32]}),b''
        if 'GetNameOwner' in arguments:return 0,encode({'type':'s','data':[':1.4' if manager=='user' else ':1.3' if arguments[-1]=='org.freedesktop.login1' else ':1.2']}),b''
        if 'GetConnectionUnixUser' in arguments:return 0,encode({'type':'u','data':[1000 if manager=='user' else 0]}),b''
        if 'ListSessions' in arguments:return 0,encode({'type':'a(susso)','data':[[]]}),b''
        if 'LoadUnit' in arguments:return 0,encode({'type':'o','data':['/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice']}),b''
        if 'get-property' in arguments:
            name=arguments[-1]
            types={'Id':'s','Names':'as','LoadState':'s','FragmentPath':'s','DropInPaths':'as','Transient':'b','NeedDaemonReload':'b','Triggers':'as','TriggeredBy':'as'}
            if name in types:
                signature=types[name];value=fields[name].split() if signature=='as' else fields[name]=='yes' if signature=='b' else fields[name]
            else:
                signature='a(sasbttttuii)';value=[]
                if name=='ExecStart':
                    current=super().read(COMMAND,4096).decode()
                    value=[[current,[current]+ARGV[1:],False,0,0,0,0,0,0,0]]
            return 0,encode({'type':signature,'data':value}),b''
        raise AssertionError('unexpected owned manager query '+repr(arguments))
Host=RuntimeFixtureHost
`;
  const accounts =
    sessionMode === 'none'
      ? String.raw`os.geteuid=lambda:0
class FixtureUser:
    def __init__(self,uid,name):self.pw_uid=uid;self.pw_name=name
pwd.getpwnam=lambda name:FixtureUser(0 if name=='root' else 1000,name)
pwd.getpwuid=lambda uid:FixtureUser(uid,'root' if uid==0 else 'puni1')
`
      : 'fixture_accounts()\n';
  const configuration = `\nMACHINE=${JSON.stringify(machine)}\nCRON=${JSON.stringify(cron)}\nUNIT=${JSON.stringify(unitPath)}\nUNIT_FILE=${JSON.stringify(unit)}\nCOMMAND=${JSON.stringify(command)}\nARGV=${JSON.stringify(argv)}\n`;
  let entry = 'supervisor_entry(collect_runtime_launch)\n';
  if (fault !== 'normal')
    entry = String.raw`
os.read(0,65536)
if FAULT=='pipe':
    pid=os.fork()
    if pid==0:
        open(WRITER,'w').write(str(os.getpid()))
        while not os.path.exists(RETIRE):time.sleep(0.01)
        os._exit(0)
os._exit(0)
`.replace(
      'os.read(0,65536)',
      `FAULT=${JSON.stringify(fault)}\nWRITER=${JSON.stringify(writer)}\nRETIRE=${JSON.stringify(retire)}\nos.read(0,65536)`,
    );
  const sessionConfiguration = `\nSESSION_MODE=${JSON.stringify(sessionMode)}\nPASS_RECORD=${JSON.stringify(join(root, 'observation-count'))}\n`;
  const suffix =
    configuration +
    sessionConfiguration +
    (sessionMode === 'none' ? '' : RUNTIME_SESSION_HOST) +
    '\n' +
    fixtureProgram +
    accounts +
    '\n' +
    entry +
    (programFault === 'oversize' ? '\n#' + 'p'.repeat(98304) + '\n' : '');
  const mappings = new Map([
    [bunPath, executable],
    [bundlePath, bundle],
    [configPath, config],
    [unitPath, unit],
  ]);
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'solver-supervisor.ts')],
    target: 'bun',
    plugins: [
      initialHandoffLayout(root, layouts),
      {
        name: 'owned-active-native-boundaries',
        setup(build) {
          build.onLoad(
            {
              filter:
                /(solver-supervisor-install-contract|solver-supervisor-config|solver-launch-observation|solver-supervisor-peer-cgroup|solver-active-admission|docker-deadline)\.ts$/,
            },
            async (entry) => {
              let contents = await readFile(entry.path, 'utf8');
              if (
                entry.path.endsWith('/solver-active-admission.ts') ||
                entry.path.endsWith('/docker-deadline.ts')
              ) {
                if (imageReadFault) {
                  contents =
                    "import{writeFileSync as recordImageCustody}from'node:fs';\n" + contents;
                  contents += `\nfunction ownedImageRead(child){
child.exited.then(code=>recordImageCustody(${JSON.stringify(join(root, 'image-exit'))},String(code)));
return new Response(child.stdout.pipeThrough(new TransformStream({transform(chunk,controller){recordImageCustody(${JSON.stringify(join(root, 'image-read-failed'))},'actual stdout read error');controller.error(new Error('owned actual image stdout failure'));}}))).text();}
function ownedImageStderr(child){return new Response(child.stderr.pipeThrough(new TransformStream({transform(chunk,controller){controller.enqueue(chunk);},flush(){recordImageCustody(${JSON.stringify(join(root, 'image-stderr-eof'))},'actual stderr EOF');}}))).text();}\n`;
                  contents = contents
                    .replaceAll('new Response(child.stdout).text()', 'ownedImageRead(child)')
                    .replaceAll('new Response(child.stderr).text()', 'ownedImageStderr(child)');
                }
              } else if (entry.path.endsWith('/solver-supervisor-install-contract.ts')) {
                for (const [logical, physical] of mappings) {
                  if (!contents.includes("'" + logical + "'"))
                    throw new Error('owned install contract changed');
                  contents = contents.replaceAll("'" + logical + "'", JSON.stringify(physical));
                }
              } else if (entry.path.endsWith('/solver-supervisor-config.ts')) {
                if (!contents.includes('unix: socketPath,'))
                  throw new Error('owned listener boundary changed');
                contents = contents.replace(
                  'unix: socketPath,',
                  'unix: ' + JSON.stringify(socket) + ',',
                );
              } else if (entry.path.endsWith('/solver-supervisor-peer-cgroup.ts')) {
                if (holdRequest) {
                  const signature = '  if (!Number.isSafeInteger(peerPid)';
                  if (!contents.includes(signature))
                    throw new Error('owned request host-read boundary changed');
                  contents =
                    "import {writeFileSync as recordOwnedRequest}from'node:fs';\nimport{open as openOwnedRequestPipe}from'node:fs/promises';\n" +
                    contents.replace(
                      signature,
                      `recordOwnedRequest(${JSON.stringify(requestEntered)},String(peerPid));
const ownedPipe=await openOwnedRequestPipe(${JSON.stringify(requestPipe)},'r');
try{recordOwnedRequest(${JSON.stringify(requestReading)},'reading');await ownedPipe.read(Buffer.alloc(1),0,1,null);recordOwnedRequest(${JSON.stringify(requestRead)},'settled');}finally{await ownedPipe.close();}
` + signature,
                    );
                }
              } else {
                if (programFault === 'expired') {
                  contents =
                    'const ownedActualClock=globalThis.performance;let ownedProgramConstructed=false;const performance={now:()=>ownedActualClock.now()+(ownedProgramConstructed?120001:0)};\n' +
                    contents;
                }
                const original = "'\\nsupervisor_entry(collect_runtime_launch)\\n'";
                if (!contents.includes(original) || !contents.includes('process.geteuid() === 0'))
                  throw new Error('owned observer transport boundary changed');
                contents = contents
                  .replace(original, JSON.stringify(suffix))
                  .replace('process.geteuid() === 0', 'true');
                contents = contents.replace(
                  '  if (Buffer.byteLength(program) > 96 * 1024)',
                  `recordOwnedExit(${JSON.stringify(join(root, 'program-bytes'))},String(Buffer.byteLength(program)));${programFault === 'expired' ? 'ownedProgramConstructed=true;' : ''}\n  if (Buffer.byteLength(program) > 96 * 1024)`,
                );
                const spawned =
                  "const child = spawn(executable, command, { stdio: ['pipe', 'pipe', 'pipe'] });";
                if (!contents.includes(spawned))
                  throw new Error('owned original child boundary changed');
                contents =
                  "import {writeFileSync as recordOwnedExit} from 'node:fs';\n" +
                  contents.replace(
                    spawned,
                    spawned +
                      `\nrecordOwnedExit(${JSON.stringify(join(root, 'original-spawn'))},String(child.pid));child.once('exit',(code)=>{recordOwnedExit(${JSON.stringify(waited)},String(code));});`,
                  );
              }
              return { contents, loader: 'ts' };
            },
          );
        },
      },
    ],
  });
  if (!built.success || built.outputs.length !== 1)
    throw new Error('owned active CLI compilation failed', { cause: built.logs });
  const output = built.outputs.at(0);
  if (output === undefined) throw new Error('owned CLI bundle absent');
  await Bun.write(bundle, output);
  await chmod(bundle, 0o755);
  await copyFile(process.execPath, executable);
  await chmod(executable, 0o755);
  const image = 'registry/wbs-be-01@sha256:' + 'b'.repeat(64);
  await writeFile(
    config,
    JSON.stringify({
      socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
      maxSearchWorkers: 2,
      maxMemoryLimitMb: 512,
      pidsLimit: 128,
      maxManagedContainers: 16,
      devSourceSha: 'a'.repeat(40),
      images: [{ callerName: 'be-01-blue', callerImage: image, solverImage: image }],
    }),
    { mode: 0o600 },
  );
  const pins = {
    version: 1 as const,
    sourceSha: 'a'.repeat(40),
    bunSha256: hashBytes(await readFile(executable)),
    bundleSha256: hashBytes(await readFile(bundle)),
    configSha256: hashBytes(await readFile(config)),
    unitSha256: hashBytes(await readFile(unit)),
  };
  const graph = await initialHandoffFixture('H8', pins, undefined, {
    root,
    launchConfigurationSha256,
    runtimeLaunchSha256,
  });
  const drift = join(root, 'drift-kind');
  const applied = join(root, 'drift-applied');
  const rawCapture = graph.paths.get('raw-capture');
  if (rawCapture === undefined) throw new Error('owned capture path absent');
  await writeFile(
    join(root, 'docker'),
    `#!/bin/sh
set -eu
printf '%s\n' "$*" >> ${quoteShell(join(root, 'docker.calls'))}
if [ "$1" = image ]; then
  if [ -f ${quoteShell(drift)} ]; then
    IFS= read -r kind < ${quoteShell(drift)}
    case "$kind" in
      config) printf ' ' >> ${quoteShell(config)} ;;
      unit) printf ' ' >> ${quoteShell(unit)} ;;
      policy) printf ' ' >> ${quoteShell(join(root, 'edge-policy.json'))} ;;
      pointer) printf ' ' >> ${quoteShell(join(root, 'edge-owner.json'))} ;;
      capture) printf ' ' >> ${quoteShell(rawCapture)} ;;
      *) exit 92 ;;
    esac
    printf '%s' "$kind" > ${quoteShell(applied)}
    /bin/rm ${quoteShell(drift)}
  fi
  printf 'sha256:${'b'.repeat(64)}\n'
elif [ "$1" != ps ]; then exit 91
fi
`,
    { mode: 0o700 },
  );
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('owned CLI requires PATH');
  const spawn = () =>
    Bun.spawn([executable, bundle, '--config=' + config, '--admission=policy'], {
      env: { ...process.env, PATH: root + ':' + path, WBS_EDGE_STATE: root },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  return {
    ...graph,
    executable,
    bundle,
    config,
    unit,
    socket,
    machine,
    cron,
    command,
    waited,
    retire,
    writer,
    drift,
    applied,
    requestEntered,
    requestReading,
    requestRead,
    requestPipe,
    spawn,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}
async function isListener(path: string): Promise<boolean> {
  try {
    const status = await lstat(path);
    if (!status.isSocket()) throw new Error('owned listener path is not a socket');
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}
type ActiveChild = ReturnType<Awaited<ReturnType<typeof activeFixture>>['spawn']>;
async function waitForChild(child: ActiveChild): Promise<number> {
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, 10000);
  try {
    return await child.exited;
  } finally {
    clearTimeout(timer);
  }
}

async function until(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 10000;
  while (!(await predicate())) {
    if (performance.now() >= deadline) throw new Error('owned active milestone timed out');
    await Bun.sleep(10);
  }
}
async function refusesLock(path: string): Promise<void> {
  let refusal: unknown;
  try {
    await withCanonicalLock(path, () => Promise.resolve());
  } catch (cause) {
    refusal = cause;
  }
  expect(String(refusal)).toContain('lock held');
}

test('actual compiled active CLI starts while original edge.lock is held and excludes runtime contender through listener lifetime', async () => {
  const fixture = await activeFixture();
  await withCanonicalLock(join(fixture.root, 'edge.lock'), async () => {
    const child = fixture.spawn();
    let diagnostic = '';
    const stderr = new Response(child.stderr).text().then((contents) => {
      diagnostic = contents;
    });
    try {
      await until(async () => {
        if (child.exitCode !== null) throw new Error('owned active startup exited: ' + diagnostic);
        try {
          return (await lstat(fixture.socket)).isSocket();
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
          throw cause;
        }
      });
      await refusesLock(join(fixture.root, 'solver-runtime.lock'));
      expect(await Bun.file(join(fixture.root, 'docker.calls')).text()).toContain(
        'image inspect --format {{.Id}} registry/wbs-be-01@sha256:',
      );
    } finally {
      child.kill('SIGTERM');
      await child.exited;
      await stderr;
    }
    expect(diagnostic).toBe('');
  });
  await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
}, 30000);

for (const fault of ['machine', 'effective-command', 'definition'] as const) {
  test(`actual active CLI refuses independent current ${fault} mismatch`, async () => {
    const fixture = await activeFixture();
    if (fault === 'machine') await writeFile(fixture.machine, 'fedcba9876543210fedcba9876543210\n');
    if (fault === 'effective-command') await writeFile(fixture.command, '/usr/bin/false');
    if (fault === 'definition')
      await writeFile(
        fixture.unit,
        (await readFile(fixture.unit, 'utf8')) + '# changed owned definition\n',
      );
    const child = fixture.spawn();
    expect(await waitForChild(child)).toBe(78);
    expect(await pathExists(fixture.socket)).toBe(false);
    expect(await Bun.file(join(fixture.root, 'docker.calls')).exists()).toBe(false);
    await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
  }, 30000);
}
for (const fault of ['config', 'unit', 'policy', 'pointer', 'capture'] as const) {
  test(`actual active CLI refuses ${fault} drift between opening and closing after real image lookup`, async () => {
    const fixture = await activeFixture();
    await writeFile(fixture.drift, fault + '\n');
    const child = fixture.spawn();
    expect(await waitForChild(child)).toBe(78);
    expect(await pathExists(fixture.socket)).toBe(false);
    expect(await Bun.file(fixture.applied).text()).toBe(fault);
    const calls = (await Bun.file(join(fixture.root, 'docker.calls')).text()).trim().split('\n');
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain('image inspect');
    await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
  }, 30000);
}

for (const fault of ['unknown', 'pipe'] as const) {
  test(`actual active consumer retains runtime lock for original ${fault} child and pipe custody`, async () => {
    const fixture = await activeFixture(fault);
    const child = fixture.spawn();
    let diagnostic = '';
    const readErrors = (async () => {
      for await (const chunk of child.stderr) {
        diagnostic += Buffer.from(chunk).toString('utf8');
      }
    })();
    try {
      await until(() => Bun.file(fixture.waited).exists());
      expect(await Bun.file(fixture.waited).text()).toBe('0');
      if (fault === 'pipe') {
        await until(() => Bun.file(fixture.writer).exists());
        await Bun.sleep(150);
        expect(diagnostic).not.toContain('active admission HOLD');
        await refusesLock(join(fixture.root, 'solver-runtime.lock'));
        await writeFile(fixture.retire, 'attended owned writer retirement');
      }
      await until(() => Promise.resolve(diagnostic.includes('active admission HOLD')));
      expect(child.exitCode).toBeNull();
      expect(await pathExists(fixture.socket)).toBe(false);
      expect(await Bun.file(join(fixture.root, 'docker.calls')).exists()).toBe(false);
      await refusesLock(join(fixture.root, 'solver-runtime.lock'));
    } finally {
      if (fault === 'pipe') await writeFile(fixture.retire, 'attended owned writer retirement');
      child.kill('SIGTERM');
      await child.exited;
      await readErrors;
    }
    await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
  }, 30000);
}

test('actual active listener retains runtime exclusion during real accepted-socket request pipe continuation', async () => {
  const fixture = await activeFixture('normal', true);
  const created = Bun.spawn(['/usr/bin/mkfifo', fixture.requestPipe], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await created.exited).toBe(0);
  await chmod(fixture.requestPipe, 0o600);
  const child = fixture.spawn();
  const stderr = new Response(child.stderr).text();
  let client: ReturnType<typeof createConnection> | undefined;
  let writer: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await until(async () => {
      if (child.exitCode !== null)
        throw new Error('owned active startup exited: ' + (await stderr));
      return isListener(fixture.socket);
    });
    const connection = createConnection(fixture.socket);
    client = connection;
    await new Promise<void>((settle, reject) => {
      connection.once('connect', settle);
      connection.once('error', reject);
    });
    client.write('{"type":"start"}\n');
    await until(() => Bun.file(fixture.requestEntered).exists());
    expect(await Bun.file(fixture.requestEntered).text()).toBe(String(process.pid));
    writer = await open(fixture.requestPipe, 'w');
    await until(() => Bun.file(fixture.requestReading).exists());
    expect(await Bun.file(fixture.requestRead).exists()).toBe(false);
    await refusesLock(join(fixture.root, 'solver-runtime.lock'));
    await writer.close();
    writer = undefined;
    await until(() => Bun.file(fixture.requestRead).exists());
    await refusesLock(join(fixture.root, 'solver-runtime.lock'));
  } finally {
    if (writer !== undefined) await writer.close();
    client?.destroy();
    child.kill('SIGTERM');
    await child.exited;
    await stderr;
  }
  await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
}, 30000);

for (const sessionMode of ['identities', 'zero-to-two'] as const) {
  test(`actual compiled active CLI accepts coherent ${sessionMode} across both current observations with unchanged prepared pins`, async () => {
    const fixture = await activeFixture('normal', false, sessionMode);
    const child = fixture.spawn();
    try {
      await until(async () => {
        if (child.exitCode !== null)
          throw new Error(
            'owned active process exited, program bytes ' +
              (await readFile(join(fixture.root, 'program-bytes'), 'utf8')) +
              ': ' +
              (await new Response(child.stderr).text()),
          );
        return isListener(fixture.socket);
      });
      expect(await readFile(join(fixture.root, 'observation-count'), 'utf8')).toBe('2');
      expect(
        Number(await readFile(join(fixture.root, 'program-bytes'), 'utf8')),
      ).toBeLessThanOrEqual(98304);
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill('SIGTERM');
      await child.exited;
    }
    expect(await new Response(child.stderr).text()).toBe('');
  });
}

test('review actual active image read failure retains original child and each stream inside runtime lock', async () => {
  const fixture = await activeFixture('normal', false, 'none', true);
  const finish = join(fixture.root, 'finish-image');
  const originalPid = join(fixture.root, 'image-pid');
  const imageProgram = `import os,time;open(${JSON.stringify(originalPid)},'w').write(str(os.getpid()));print('owned stdout failure',flush=True);\nwhile not os.path.exists(${JSON.stringify(finish)}):time.sleep(0.01)\n`;
  await writeFile(
    join(fixture.root, 'docker'),
    '#!/bin/sh\nexec /usr/bin/python3 -I -c ' + quoteShell(imageProgram) + '\n',
    { mode: 0o700 },
  );
  const child = fixture.spawn();
  let diagnostic = '';
  const stderr = (async () => {
    for await (const chunk of child.stderr) diagnostic += Buffer.from(chunk).toString('utf8');
  })();
  try {
    await until(() => {
      if (child.exitCode !== null)
        throw new Error('owned image path exited before fault: ' + diagnostic);
      return pathExists(join(fixture.root, 'image-read-failed'));
    });
    await Bun.sleep(150);
    expect(await pathExists(join(fixture.root, 'image-exit'))).toBe(false);
    expect(await pathExists(join(fixture.root, 'image-stderr-eof'))).toBe(false);
    expect(Number(await readFile(originalPid, 'utf8'))).toBeGreaterThan(1);
    await refusesLock(join(fixture.root, 'solver-runtime.lock'));
    expect(child.exitCode).toBeNull();
    await writeFile(finish, 'attended original image completion');
    await until(() => pathExists(join(fixture.root, 'image-exit')));
    await until(() => pathExists(join(fixture.root, 'image-stderr-eof')));
    await until(() => Promise.resolve(diagnostic.includes('active admission HOLD')));
    expect(await readFile(join(fixture.root, 'image-exit'), 'utf8')).toBe('0');
    expect(child.exitCode).toBeNull();
    await refusesLock(join(fixture.root, 'solver-runtime.lock'));
    expect(await pathExists(fixture.socket)).toBe(false);
  } finally {
    await writeFile(finish, 'attended owned image retirement');
    child.kill('SIGTERM');
    await child.exited;
    await stderr;
  }
  await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
}, 30000);

for (const fault of ['oversize', 'expired'] as const) {
  test(`review actual compiled launch ${fault} construction refuses before spawning its original child`, async () => {
    const fixture = await activeFixture('normal', false, 'none', false, fault);
    const child = fixture.spawn();
    expect(await waitForChild(child)).toBe(78);
    const bytes = Number(await readFile(join(fixture.root, 'program-bytes'), 'utf8'));
    if (fault === 'oversize') expect(bytes).toBeGreaterThan(98304);
    else expect(bytes).toBeLessThanOrEqual(98304);
    expect(await pathExists(join(fixture.root, 'original-spawn'))).toBe(false);
    expect(await pathExists(join(fixture.root, 'original-exit'))).toBe(false);
    expect(await pathExists(fixture.socket)).toBe(false);
    expect(await pathExists(join(fixture.root, 'docker.calls'))).toBe(false);
    await withCanonicalLock(join(fixture.root, 'solver-runtime.lock'), () => Promise.resolve());
  }, 30000);
}
