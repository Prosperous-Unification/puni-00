import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

// Independent frozen31 oracle: catalog05 SHA1981b0e4, not the production partition.
const originalCases = [
  {
    kind: 'policy-released',
    name: 'participant policy restoration refuses released original source-ready context',
  },
  {
    kind: 'policy-name',
    name: 'participant policy restoration refuses wrong original policy name',
  },
  {
    kind: 'policy-count',
    name: 'participant policy restoration refuses wrong original retry count',
  },
  {
    kind: 'policy-pid',
    name: 'participant policy restoration refuses process drift after exact update',
  },
  {
    kind: 'policy-listener',
    name: 'participant policy restoration refuses listener drift after final policy readback',
  },
  {
    kind: 'policy-readback-fence',
    name: 'participant policy restoration refuses fence loss after first policy readback before later intent',
  },
  {
    kind: 'policy-published-record',
    name: 'participant policy restoration refuses late record drift after actual restored publication',
  },
  {
    kind: 'policy-ready',
    name: 'participant policy restoration retains original policies and whole bindings',
  },
  { kind: 'ready', name: 'source restoration retains original gateway authority through ready' },
  {
    kind: 'admission',
    name: 'source restoration refuses absent and copied phases before genuine continuation',
  },
  { kind: 'released', name: 'source restoration refuses released original context' },
  {
    kind: 'record-missing',
    name: 'source restoration refuses missing gateway record and terminal repair',
  },
  { kind: 'record-unreadable', name: 'source restoration refuses unreadable gateway record' },
  {
    kind: 'record-replacement',
    name: 'source restoration refuses same-byte gateway record replacement',
  },
  {
    kind: 'record-rebased',
    name: 'source restoration refuses gateway record rebased through public summary',
  },
  { kind: 'dev-gateway', name: 'source restoration refuses dev gateway database opener' },
  { kind: 'dev-mcp', name: 'source restoration refuses dev MCP database opener' },
  { kind: 'dev-frontend', name: 'source restoration refuses dev frontend database opener' },
  { kind: 'dev-helper', name: 'source restoration refuses dev Nx helper database opener' },
  { kind: 'dev-foreign', name: 'source restoration refuses foreign dev database opener' },
  { kind: 'dev-ticks', name: 'source restoration refuses changed dev backend start ticks' },
  { kind: 'dev-executable', name: 'source restoration refuses null dev backend executable' },
  { kind: 'prod-source', name: 'source restoration refuses source backend as prod opener' },
  { kind: 'backend-drift', name: 'source restoration refuses backend drift during source HTTP' },
  { kind: 'gateway-drift', name: 'source restoration refuses gateway drift during source HTTP' },
  { kind: 'solver-drift', name: 'source restoration refuses solver drift during source HTTP' },
  {
    kind: 'source-after-authority',
    name: 'source restoration refuses source drift after authority return',
  },
  {
    kind: 'ready-missing',
    name: 'source restoration refuses missing actual source ready publication',
  },
  {
    kind: 'late-fence',
    name: 'source restoration refuses late fence drift after final source observation',
  },
  {
    kind: 'selected',
    name: 'source restoration refuses wrong selected source before intent and start',
  },
  {
    kind: 'listener-after-ready',
    name: 'source restoration refuses listener replacement after actual ready publication',
  },
] as const;

async function runTinyParent(parent = 'dependency-source-restoration.test.ts') {
  const directory = await mkdtemp(join(tmpdir(), 'restoration-parent-'));
  const source = new URL('../..', import.meta.url).pathname;
  try {
    for (const path of ['src/lib', 'src/fixtures', 'test'])
      await mkdir(join(directory, path), { recursive: true });
    for (const path of [
      'src/lib/dependency-source-restoration.test.ts',
      'src/lib/dependency-source-restoration-parent.ts',
      'src/lib/dependency-participant-policy-restoration.test.ts',
      'src/fixtures/participant-restoration-profile.ts',
      'src/fixtures/participant-source-restoration-cases.ts',
      'src/fixtures/product-readiness-byte-transport.ts',
    ])
      await copyFile(join(source, path), join(directory, path));
    await writeFile(
      join(directory, 'test/dependency-source-restoration-model-child.test.ts'),
      `import { test } from 'bun:test';
const cases = ${JSON.stringify(originalCases)};
for (const {name} of cases) test(name, () => { console.error('RESTORATION_TINY_CHILD: '+name); });
`,
    );
    const child = Bun.spawn([process.execPath, 'test', `src/lib/${parent}`], {
      cwd: directory,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(child.signalCode).toBeNull();
    expect(stdout).toMatch(/^bun test v[^\n]+\n$/);
    return {
      names: [...stderr.matchAll(/^\(pass\) isolated (.+) \[[0-9.]+ms\]$/gm)].map(
        (match) => match[1],
      ),
      selected: [...stderr.matchAll(/^RESTORATION_TINY_CHILD: (.+)$/gm)].map((match) => match[1]),
    };
  } finally {
    await rm(directory, { recursive: true });
  }
}

test('inherited parent executes exactly the independent original23 tiny children', async () => {
  const observed = await runTinyParent();
  const inherited = originalCases.slice(8).map(({ name }) => name);
  expect(observed.names).toEqual(inherited);
  expect(observed.selected).toEqual(inherited);
}, 30000);

test('policy parent executes exactly the independent eight tiny children', async () => {
  const observed = await runTinyParent('dependency-participant-policy-restoration.test.ts');
  const policy = originalCases.slice(0, 8).map(({ name }) => name);
  expect(observed.names).toEqual(policy);
  expect(observed.selected).toEqual(policy);
}, 30000);

async function runCustodyScenario(
  mode:
    | 'normal'
    | 'failure'
    | 'signal'
    | 'abort'
    | 'withheld'
    | 'retirement'
    | 'horizon'
    | 'registration',
  followup: 'policy' | 'inherited' = 'policy',
) {
  const directory = await mkdtemp(join(tmpdir(), 'policy-custody-'));
  const source = new URL('../..', import.meta.url).pathname;
  try {
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
        'const identity = await lstat(path, { bigint: true }); globalThis.__policyPeerCreated?.(directory);',
      ),
    );
    const scenario = originalCases[0];
    const model = join(directory, 'test/dependency-source-restoration-model-child.test.ts');
    const gate = join(directory, 'original-close');
    const ready = join(directory, 'original-ready');
    const writerDone = join(directory, 'writer-done');
    const writer = `import {existsSync} from 'node:fs'; await Bun.write(${JSON.stringify(ready)},String(process.pid)); const end=performance.now()+3000; while(!existsSync(${JSON.stringify(gate)})){if(performance.now()>end)throw Error('test-owned writer gate deadline');await new Promise(resolve=>setTimeout(resolve,5));} await Bun.write(${JSON.stringify(writerDone)},'closed');`;
    const following = followup === 'policy' ? originalCases[0] : originalCases[8];
    const followingPassing = `import { test } from 'bun:test'; test(${JSON.stringify(following.name)},()=>{});`;
    const passing = `import { test } from 'bun:test'; test(${JSON.stringify(scenario.name)},()=>{});`;
    await writeFile(
      model,
      mode === 'failure'
        ? `import { test } from 'bun:test'; test(${JSON.stringify(scenario.name)},()=>{throw Error('test-owned normal failure');});`
        : mode === 'signal'
          ? `process.kill(process.pid,'SIGTERM');`
          : mode === 'abort'
            ? `import { test } from 'bun:test';test(${JSON.stringify(scenario.name)},async()=>{await new Promise(resolve=>setTimeout(resolve,500));});`
            : mode === 'withheld'
              ? `import { test } from 'bun:test'; test(${JSON.stringify(scenario.name)},()=>{const writer=Bun.spawn([process.execPath,'-e',${JSON.stringify(writer)}],{stdin:'ignore',stdout:'inherit',stderr:'inherit'});writer.unref();});`
              : passing,
    );
    const script = `
import { expect,test,spyOn } from 'bun:test';
import * as fs from 'node:fs/promises';
import { SOURCE_RESTORATION_CASES,PARTICIPANT_POLICY_CASES } from './src/fixtures/participant-source-restoration-cases';
import { runRestorationParentCase,registerRestorationParent } from './src/lib/dependency-source-restoration-parent';
const mode=${JSON.stringify(mode)};
const scenario=SOURCE_RESTORATION_CASES[0];
const followup=${JSON.stringify(followup)};
const following=SOURCE_RESTORATION_CASES[followup==='inherited'?8:0];
const peers=[];
let shift=0;
const now=performance.now.bind(performance);
if(mode==='horizon') spyOn(performance,'now').mockImplementation(()=>now()+shift);
globalThis.__policyPeerCreated=(directory)=>{peers.push(directory);if(mode==='horizon')shift=505001;};
let abortRequested;
if(mode==='abort'){const timeout=AbortSignal.timeout;spyOn(AbortSignal,'timeout').mockImplementation(ms=>{abortRequested=ms;return timeout(25);});}
const abortBudgets=[];
if(followup==='inherited'){const timeout=AbortSignal.timeout;spyOn(AbortSignal,'timeout').mockImplementation(ms=>{abortBudgets.push(ms);return timeout(ms);});}
const spawn=Bun.spawn;
const children=[];
const commands=[];
Bun.spawn=(...args)=>{const child=spawn(...args);children.push(child);commands.push(args[0]);return child;};
const failure=async(action)=>{let refused=false;try{await action();}catch{refused=true;}expect(refused).toBe(true);};
const waitFor=async(predicate)=>{const end=now()+3000;while(!await predicate()){if(now()>end)throw Error('test-owned boundary not reached');await new Promise(resolve=>setTimeout(resolve,5));}};
test('real original custody '+mode,async()=>{
 if(mode==='registration'){
   for(const cases of [[],PARTICIPANT_POLICY_CASES.slice(1),[...PARTICIPANT_POLICY_CASES.slice(1),PARTICIPANT_POLICY_CASES[1]],[{...scenario,name:'wrong'},...PARTICIPANT_POLICY_CASES.slice(1)],[SOURCE_RESTORATION_CASES[8],...PARTICIPANT_POLICY_CASES.slice(1)]])
     expect(()=>registerRestorationParent('policy',cases)).toThrow();
   expect(peers).toHaveLength(0);expect(children).toHaveLength(0);return;
 }
 if(followup==='inherited'){
   let secondError;
   if(mode==='withheld'){
     let completed=false;
     const first=runRestorationParentCase(scenario).finally(()=>{completed=true;});
     await waitFor(async()=>{try{return /^[1-9][0-9]*$/.test(await fs.readFile(${JSON.stringify(ready)},'utf8'));}catch(cause){if(cause.code!=='ENOENT')throw cause;return false;}});
     expect(await children[0].exited).toBe(0);expect(children[0].signalCode).toBeNull();expect(completed).toBe(false);
     console.error('POLICY_CROSS_ORIGINAL_EXIT_BEFORE_EOF: '+JSON.stringify({pid:children[0].pid,exitCode:0,signal:null,pendingEof:!completed}));
     await fs.writeFile(${JSON.stringify(model)},${JSON.stringify(followingPassing)});
     let secondSettled=false;
     const second=runRestorationParentCase(following).then(()=>{secondSettled=true;return null;},cause=>{secondSettled=true;return cause;});
     try{await waitFor(()=>secondSettled||peers.length>1);}finally{await fs.writeFile(${JSON.stringify(gate)},'close');}
     await first;secondError=await second;expect(await fs.readFile(${JSON.stringify(writerDone)},'utf8')).toBe('closed');
   }else{
     let removal;
     if(mode==='retirement')removal=spyOn(fs,'rm').mockRejectedValue(new Error('test-owned retirement refused'));
     try{if(mode==='normal')await runRestorationParentCase(scenario);else await failure(()=>runRestorationParentCase(scenario));}finally{removal?.mockRestore();}
     if(mode==='signal')expect(children[0].signalCode).toBe('SIGTERM');
     await fs.writeFile(${JSON.stringify(model)},${JSON.stringify(followingPassing)});
     secondError=await runRestorationParentCase(following).then(()=>null,cause=>cause);
   }
   console.error('POLICY_CROSS_GROUP_CUSTODY: '+JSON.stringify({mode,peers:peers.length,spawns:children.length,following:following.name,reservationError:secondError instanceof Error?secondError.message:null}));
   if(mode==='normal'){
     expect(secondError).toBeNull();expect(peers).toHaveLength(2);expect(children).toHaveLength(2);
     expect(commands[0].at(-1)).toBe('--timeout=495000');expect(commands[1]).toEqual([process.execPath,'test','test/dependency-source-restoration-model-child.test.ts','-t','^'+following.name+'$','--timeout=300000']);
     expect(abortBudgets[0]).toBeGreaterThan(0);expect(abortBudgets[0]).toBeLessThanOrEqual(505000);expect(abortBudgets[1]).toBe(310000);
   }else{
     expect(secondError instanceof Error?secondError.message:null).toBe('policy original invocation remains reserved');
     expect(peers).toHaveLength(1);expect(children).toHaveLength(1);
   }
   console.error('POLICY_CROSS_GROUP_OBSERVED: '+mode);
 }else if(mode==='withheld'){
   let completed=false;
   const first=runRestorationParentCase(scenario).finally(()=>{completed=true;});
   await waitFor(async()=>{try{return /^[1-9][0-9]*$/.test(await fs.readFile(${JSON.stringify(ready)},'utf8'));}catch(cause){if(cause.code!=='ENOENT')throw cause;return false;}});
   const original=children[0];
   expect(await original.exited).toBe(0);expect(original.signalCode).toBeNull();
   // ORIGINAL exit is known while the bounded descendant retains both actual inherited pipes.
   expect(completed).toBe(false);
   try{
     await failure(()=>runRestorationParentCase(scenario));expect(peers).toHaveLength(1);expect(children).toHaveLength(1);
   }finally{await fs.writeFile(${JSON.stringify(gate)},'close');}
   await first;expect(completed).toBe(true);expect(await fs.readFile(${JSON.stringify(writerDone)},'utf8')).toBe('closed');
   await fs.writeFile(${JSON.stringify(model)},${JSON.stringify(passing)});
   await runRestorationParentCase(scenario);expect(peers).toHaveLength(2);expect(children).toHaveLength(2);
 }else if(mode==='normal'||mode==='failure'){
   if(mode==='failure')await failure(()=>runRestorationParentCase(scenario));else await runRestorationParentCase(scenario);
   await fs.writeFile(${JSON.stringify(model)},${JSON.stringify(passing)});
   await runRestorationParentCase(scenario);expect(peers).toHaveLength(2);expect(children).toHaveLength(2);
 }else{
   let removal;
   if(mode==='retirement') removal=spyOn(fs,'rm').mockRejectedValue(new Error('test-owned retirement refused'));
   try{await failure(()=>runRestorationParentCase(scenario));}finally{removal?.mockRestore();}
   await failure(()=>runRestorationParentCase(scenario));expect(peers).toHaveLength(1);expect(children).toHaveLength(mode==='horizon'?0:1);
   if(mode==='abort'){expect(abortRequested).toBeGreaterThan(504000);expect(abortRequested).toBeLessThanOrEqual(505000);}
   console.error('POLICY_RETAINED_TEST_PEER: '+peers[0]);
 }
 console.error('POLICY_CUSTODY_OBSERVED: '+mode);
},10000);
`;
    await writeFile(join(directory, 'custody.test.ts'), script);
    const child = Bun.spawn([process.execPath, 'test', 'custody.test.ts', '--timeout=10000'], {
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
    if (exit !== 0) throw new Error(`custody ${mode} failed: ${stderr}`);
    expect(stderr).toMatch(new RegExp(`^\\(pass\\) real original custody ${mode} `, 'm'));
    if (followup === 'inherited')
      expect(stderr).toMatch(new RegExp(`^POLICY_CROSS_GROUP_OBSERVED: ${mode}$`, 'm'));
    else if (mode !== 'registration')
      expect(stderr).toMatch(new RegExp(`^POLICY_CUSTODY_OBSERVED: ${mode}$`, 'm'));
  } finally {
    await rm(directory, { recursive: true });
  }
}

for (const mode of [
  'normal',
  'failure',
  'signal',
  'abort',
  'withheld',
  'retirement',
  'horizon',
  'registration',
] as const)
  test(`shared policy parent owns ${mode} custody`, () => runCustodyScenario(mode), 30000);

for (const mode of ['withheld', 'signal', 'retirement', 'normal'] as const)
  test(
    `shared policy reservation protects inherited ${mode} followup`,
    () => runCustodyScenario(mode, 'inherited'),
    30000,
  );
