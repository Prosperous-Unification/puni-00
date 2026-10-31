import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import {
  assertRestorationCases,
  captureRestorationDeadline,
  readRestorationProfile,
} from '../fixtures/participant-restoration-profile';
import {
  INHERITED_SOURCE_CASES,
  PARTICIPANT_POLICY_CASES,
} from '../fixtures/participant-source-restoration-cases';

test('closed profiles retain independent original and policy timing allocations', () => {
  for (const scenario of INHERITED_SOURCE_CASES) {
    expect(readRestorationProfile(scenario.kind)).toEqual({
      group: 'source',
      operationMs: 300000,
      modelMs: 300000,
      abortMs: 310000,
      parentMs: 320000,
    });
    expect(captureRestorationDeadline(scenario.kind)).toBeUndefined();
  }
  for (const scenario of PARTICIPANT_POLICY_CASES) {
    const before = performance.now();
    expect(readRestorationProfile(scenario.kind)).toEqual({
      group: 'policy',
      operationMs: 465000,
      modelMs: 495000,
      abortMs: 505000,
      parentMs: 525000,
    });
    const deadline = captureRestorationDeadline(scenario.kind);
    expect(deadline).toBeGreaterThanOrEqual(before + 465000);
    expect(deadline).toBeLessThanOrEqual(performance.now() + 465000);
  }
  expect(() => readRestorationProfile('unknown' as never)).toThrow('profile unknown');
});

test('registration refuses incomplete duplicate renamed and crossed actual groups', () => {
  assertRestorationCases('source', INHERITED_SOURCE_CASES);
  assertRestorationCases('policy', PARTICIPANT_POLICY_CASES);
  for (const cases of [
    [],
    PARTICIPANT_POLICY_CASES.slice(1),
    [...PARTICIPANT_POLICY_CASES.slice(1), PARTICIPANT_POLICY_CASES[1]],
    [{ ...PARTICIPANT_POLICY_CASES[0], name: 'renamed' }, ...PARTICIPANT_POLICY_CASES.slice(1)],
    [INHERITED_SOURCE_CASES[0], ...PARTICIPANT_POLICY_CASES.slice(1)],
  ])
    expect(() => {
      assertRestorationCases('policy', cases);
    }).toThrow();
});

test('actual model and fixture forward the one pre-fixture deadline into original preparation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'policy-origin-'));
  const source = new URL('../..', import.meta.url).pathname;
  const preload = join(directory, 'boundary.ts');
  await writeFile(
    preload,
    `
import { mock, spyOn } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = await mkdtemp(join(tmpdir(),'policy-origin-fixture-'));
let captured;
let captures=0;
let factoryStarted;
let factoryFinished;
let stops=0;
const profile = await import(${JSON.stringify(join(source, 'src/fixtures/participant-restoration-profile.ts'))});
const capture = profile.captureRestorationDeadline;
spyOn(profile,'captureRestorationDeadline').mockImplementation(kind => {const deadline=capture(kind);captures++;if(captures===1)captured=deadline;return deadline;});
const container = (Id,network) => ({Id,HostConfig:{RestartPolicy:{Name:'always',MaximumRetryCount:0}},NetworkSettings:{Networks:{[network]:{NetworkID:'n'}}}});
const backend=container('b','prod'),gateway=container('g','prod'),source=container('s','dev');
mock.module(${JSON.stringify(join(source, 'src/fixtures/dependency-participant-restoration.ts'))},()=>({participantActivationFixture:async()=>{
  factoryStarted=performance.now();await new Promise(resolve=>setTimeout(resolve,20));factoryFinished=performance.now();
  return {root,backend,gateway,source,inventory:[backend,gateway,source],layouts:{prod:{network:'prod'},dev:{network:'dev'}},request:{owner:{sha:'fixture'}},ports:{docker:async()=>{throw Error('unexpected Docker');},authorities:{collect:async()=>{throw Error('unexpected authority');}}}};
}}));
mock.module(${JSON.stringify(join(source, 'src/fixtures/participant-solver-runtime.ts'))},()=>({createParticipantSolverRuntime:()=>({closeRuntime:async()=>{console.error('POLICY_ORIGIN_FIXTURE_RETIRED: '+String(stops));},bindContext:()=>{throw Error('unexpected context');}})}));
const ownership=await import(${JSON.stringify(join(source, 'src/lib/edge-ownership.ts'))});
mock.module(${JSON.stringify(join(source, 'src/lib/edge-ownership.ts'))},()=>({...ownership,withDependencyOwner:async(_request,action)=>action({}),retainActivationRecord:async()=>{throw Error('unexpected publication');}}));
mock.module(${JSON.stringify(join(source, 'src/lib/complete-dependency-exclusion.ts'))},()=>({
 prepareActivatedParticipantsUnderOwner:async(_owner,_request,_layouts,deadline)=>{
   if(captures!==1 || deadline!==captured || !(factoryStarted>captured-465000) || !(factoryFinished>factoryStarted) || !(deadline-performance.now()<465000))throw Error('original deadline reset');
   console.error('POLICY_ORIGINAL_DEADLINE_SENTINEL: '+JSON.stringify({same:true,setupConsumed:true}));throw Error('test-owned pre-authority sentinel');
 },consumePreparedDependencyActivation:async()=>{throw Error('unexpected consume');},releasePreparedDependencyActivation:()=>{throw Error('unexpected release');}
}));
mock.module(${JSON.stringify(join(source, 'src/lib/dependency-product-process.ts'))},()=>({OBSERVER_PROGRAM:'test-owned-unused'}));
mock.module(${JSON.stringify(join(source, 'src/lib/dependency-participant-solver-restoration.ts'))},()=>({restoreSolverForPreparedParticipants:async()=>{throw Error('unexpected solver');}}));
mock.module(${JSON.stringify(join(source, 'src/lib/dependency-participant-restoration.ts'))},()=>({}));
spyOn(Bun,'serve').mockImplementation(()=>({stop:async()=>{stops++;}}));
`,
  );
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'test',
        join(source, 'test/dependency-source-restoration-model-child.test.ts'),
        '-t',
        '^participant policy restoration retains original policies and whole bindings$',
        '--preload',
        preload,
      ],
      {
        cwd: source,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0' },
      },
    );
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).toBe(1);
    expect(child.signalCode).toBeNull();
    expect(stdout).toMatch(/^bun test/);
    expect(stderr).toMatch(
      /^POLICY_ORIGINAL_DEADLINE_SENTINEL: \{"same":true,"setupConsumed":true\}$/m,
    );
    expect(stderr).toMatch(/^error: test-owned pre-authority sentinel$/m);
    expect(stderr).toMatch(/^POLICY_ORIGIN_FIXTURE_RETIRED: 6$/m);
    expect(stderr).not.toMatch(/^error: original deadline reset$/m);
  } finally {
    await rm(directory, { recursive: true });
  }
}, 30000);

for (const admission of ['absent', 'nonfinite', 'expired', 'inherited-override'] as const)
  test(`actual fixture refuses ${admission} deadline before activation factory`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'policy-admission-'));
    const source = new URL('../..', import.meta.url).pathname;
    const deadline = {
      absent: 'undefined',
      nonfinite: 'Number.NaN',
      expired: 'performance.now()-1',
      'inherited-override': 'performance.now()+1000',
    }[admission];
    const expected =
      admission === 'inherited-override'
        ? 'inherited fixture deadline override refused'
        : 'policy original pre-fixture deadline absent or exhausted';
    const script = `
import { rejects } from 'node:assert/strict';
import { expect,mock,test } from 'bun:test';
let factories=0;
mock.module(${JSON.stringify(join(source, 'src/fixtures/dependency-participant-restoration.ts'))},()=>({participantActivationFixture:async()=>{
 factories++;console.error('POLICY_FIXTURE_FACTORY_CROSSED: ${admission}');throw Error('test-owned activation factory sentinel');
}}));
mock.module(${JSON.stringify(join(source, 'src/lib/complete-dependency-exclusion.ts'))},()=>({prepareActivatedParticipantsUnderOwner:async()=>{throw Error('unexpected preparation');},consumePreparedDependencyActivation:async()=>{throw Error('unexpected consume');},releasePreparedDependencyActivation:()=>{throw Error('unexpected release');}}));
mock.module(${JSON.stringify(join(source, 'src/lib/dependency-product-process.ts'))},()=>({OBSERVER_PROGRAM:'unused'}));
mock.module(${JSON.stringify(join(source, 'src/fixtures/participant-solver-runtime.ts'))},()=>({createParticipantSolverRuntime:()=>{throw Error('unexpected runtime');}}));
const { withParticipantSourceRestoration }=await import(${JSON.stringify(join(source, 'src/fixtures/participant-source-restoration.ts'))});
test('fixture entry ${admission}',async()=>{
 await rejects(withParticipantSourceRestoration(async()=>{throw Error('unexpected action');},${String(admission !== 'inherited-override')},${deadline}),cause=>cause instanceof Error&&cause.message===${JSON.stringify(expected)});
 expect(factories).toBe(0);
 console.error('POLICY_FIXTURE_ENTRY_REFUSED: ${admission} factory0');
});
`;
    try {
      const path = join(directory, 'admission.test.ts');
      await writeFile(path, script);
      const child = Bun.spawn([process.execPath, 'test', path], {
        cwd: source,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0' },
      });
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(child.signalCode).toBeNull();
      expect(stdout).toMatch(/^bun test/);
      if (exit !== 0) throw new Error(`fixture admission ${admission} failed: ${stderr}`);
      expect(stderr).toMatch(
        new RegExp(`^POLICY_FIXTURE_ENTRY_REFUSED: ${admission} factory0$`, 'm'),
      );
      expect(stderr).not.toMatch(/^POLICY_FIXTURE_FACTORY_CROSSED:/m);
    } finally {
      await rm(directory, { recursive: true });
    }
  }, 30000);

test('actual top-level registration refuses incomplete valid policy tuples before peer and child', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'policy-registration-'));
  const source = new URL('../..', import.meta.url).pathname;
  try {
    const { mkdir } = await import('node:fs/promises');
    for (const path of ['src/lib', 'src/fixtures', 'test'])
      await mkdir(join(directory, path), { recursive: true });
    for (const path of [
      'src/lib/dependency-source-restoration-parent.ts',
      'src/fixtures/participant-restoration-profile.ts',
      'src/fixtures/participant-source-restoration-cases.ts',
    ])
      await copyFile(join(source, path), join(directory, path));
    const peer = await readFile(
      join(source, 'src/fixtures/product-readiness-byte-transport.ts'),
      'utf8',
    );
    await writeFile(
      join(directory, 'src/fixtures/product-readiness-byte-transport.ts'),
      peer.replace(
        'const identity = await lstat(path, { bigint: true });',
        'const identity = await lstat(path, { bigint: true });globalThis.__registrationPeerCreated?.();',
      ),
    );
    await writeFile(
      join(directory, 'test/dependency-source-restoration-model-child.test.ts'),
      `import {test} from 'bun:test'; const cases=${JSON.stringify(PARTICIPANT_POLICY_CASES)};for(const {name} of cases)test(name,()=>{console.error('POLICY_REGISTRATION_TINY_CHILD: '+name);});`,
    );
    await writeFile(
      join(directory, 'registration.test.ts'),
      `
import * as testing from 'bun:test';
import {rejects} from 'node:assert/strict';
import {PARTICIPANT_POLICY_CASES} from './src/fixtures/participant-source-restoration-cases';
const actualTest=testing.test;
const registrations=[];
let peers=0,spawns=0;
globalThis.__registrationPeerCreated=()=>{peers++;};
const spawn=Bun.spawn;Bun.spawn=(...args)=>{spawns++;return spawn(...args);};
const observer=testing.spyOn(testing,'test').mockImplementation((...args)=>{registrations.push(args[0]);return actualTest(...args);});
const {registerRestorationParent,runRestorationParentCase}=await import('./src/lib/dependency-source-restoration-parent');
let refusal;
try{registerRestorationParent('policy',PARTICIPANT_POLICY_CASES.slice(0,7));}catch(cause){refusal=cause;}
observer.mockRestore();
actualTest('top-level registration observation',async()=>{
 await rejects(runRestorationParentCase({...PARTICIPANT_POLICY_CASES[0],name:'test-owned-wrong-selected-name'}),cause=>cause instanceof Error&&cause.message==='restoration selected case differs');
 console.error('POLICY_REGISTRATION_OBSERVATION: '+JSON.stringify({registrations,peers,spawns,refusal:refusal instanceof Error?refusal.message:null}));
 testing.expect(refusal instanceof Error?refusal.message:null).toBe('restoration case ownership incomplete');
 testing.expect(registrations).toEqual([]);testing.expect(peers).toBe(0);testing.expect(spawns).toBe(0);
});
`,
    );
    const child = Bun.spawn([process.execPath, 'test', 'registration.test.ts'], {
      cwd: directory,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(child.signalCode).toBeNull();
    expect(stdout).toMatch(/^bun test/);
    if (exit !== 0) throw new Error(`top-level registration failed: ${stderr}`);
    expect(stderr).toMatch(
      /^POLICY_REGISTRATION_OBSERVATION: \{"registrations":\[\],"peers":0,"spawns":0,"refusal":"restoration case ownership incomplete"\}$/m,
    );
    expect(stderr).not.toMatch(/^POLICY_REGISTRATION_TINY_CHILD:/m);
  } finally {
    await rm(directory, { recursive: true });
  }
}, 30000);
