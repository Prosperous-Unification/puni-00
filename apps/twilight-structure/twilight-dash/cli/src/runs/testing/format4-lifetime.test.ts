import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';
import { expect, test } from 'bun:test';

import { settleFixture } from './construct-fixture';

const cli = resolve(import.meta.dirname, '../../..');
const root = resolve(cli, '../../../..');
const fixtureModule = join(import.meta.dirname, 'format4-fixture.ts');
const providerModule = join(import.meta.dirname, 'format4-provider.ts');
const preload = join(import.meta.dirname, 'format4-lifetime-preload.ts');
const scratchModule = join(root, 'tools/test/scratch/index.ts');

function childImports(directory: string) {
  return `
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { bootstrapFormat4Stores, createFormat4Fixture, openPooledFormat4Stores } from ${JSON.stringify(fixtureModule)};
import { closeFormat4Lifetime, inspectFormat4Provider, retainFormat4Provider } from ${JSON.stringify(providerModule)};
import { organizationId, ownerId } from ${JSON.stringify(resolve(import.meta.dirname, '../record-codecs.ts'))};
import { scratchRoot } from ${JSON.stringify(scratchModule)};
const directory=${JSON.stringify(directory)};
const options=(name, clock=1000)=>({path:join(directory,name+'.sqlite'),organizationId:organizationId('organization'),capacity:1,leaseMilliseconds:100,clock:{read:()=>clock},maxBusyAttempts:2,busyDelayMilliseconds:1});
const record=(value)=>appendFileSync(join(directory,'witnesses.jsonl'),JSON.stringify(value)+'\\n');
`;
}

async function runChild(kind: 'reuse' | 'missing' | 'closed' | 'open' | 'close' | 'provenance') {
  const directory = mkdtempSync(join(tmpdir(), 'format4-lifetime-proof-'));
  const temporary = join(directory, 'temporary');
  mkdirSync(temporary);
  const suites: string[] = [];
  const header = childImports(directory);
  if (kind === 'reuse') {
    for (const ordinal of [1, 2]) {
      const path = join(directory, `${String(ordinal)}.test.ts`);
      suites.push(path);
      writeFileSync(
        path,
        header +
          `
test('provider reuse file ${String(ordinal)}', async()=>{
 const stores=await bootstrapFormat4Stores(options('file-${String(ordinal)}',${String(ordinal * 1000)}));
 try {
  const ownership=await stores.runs.acquireOwnership(ownerId('owner-${String(ordinal)}'),0);
  expect(ownership.kind).toBe('applied');
  expect(ownership.value.expiresAt).toBe(${String(ordinal * 1000 + 100)});
  const provider=inspectFormat4Provider();
  if(provider===undefined)throw new Error('source absent');
  expect(provider.moduleLoadCount).toBe(1);
  expect(provider.leaseCount).toBe(1);
  expect(provider.isClosing).toBe(false);
  if(${String(ordinal)}===2){
   const previous=JSON.parse(readFileSync(join(directory,'first.json'),'utf8'));
   expect(provider.directory).toBe(previous.provider.directory);
   expect(provider.sourceFiles).toEqual(previous.provider.sourceFiles);
   expect(ownership.value.storeId).not.toBe(previous.storeId);
  }else writeFileSync(join(directory,'first.json'),JSON.stringify({provider,storeId:ownership.value.storeId}));
 } finally {await stores.close();}
 const provider=inspectFormat4Provider();
 expect(provider.leaseCount).toBe(0);
 expect(existsSync(provider.directory)).toBe(true);
 record({kind:'reuse',ordinal:${String(ordinal)},provider,scratch:scratchRoot(),rss:process.memoryUsage().rss,closed:true});
});
`,
      );
    }
  } else {
    const path = join(directory, 'boundary.test.ts');
    suites.push(path);
    if (kind === 'missing')
      writeFileSync(
        path,
        header +
          `
test('missing lifetime refuses before source allocation',async()=>{
 let stores;
 try {
  let failure;try{stores=await bootstrapFormat4Stores(options('missing'));}catch(cause){failure=cause;}
  expect(String(failure)).toContain('active format4-lifetime-preload.ts owner');
  expect(inspectFormat4Provider()).toBeUndefined();
  record({kind:'missing',closed:true});
 }finally{if(stores!==undefined){await stores.close();await closeFormat4Lifetime();}}
});
`,
      );
    else if (kind === 'closed')
      writeFileSync(
        path,
        header +
          `
test('closed lifetime refuses a later native store',async()=>{
 const stores=await bootstrapFormat4Stores(options('closed'));await stores.close();
 const provider=inspectFormat4Provider();await closeFormat4Lifetime();
 expect(existsSync(provider.directory)).toBe(false);
 let late;try{
  let failure;try{late=await bootstrapFormat4Stores(options('late'));}catch(cause){failure=cause;}
  expect(String(failure)).toContain('active format4-lifetime-preload.ts owner');
 }finally{if(late!==undefined)await late.close();}
 record({kind:'closed',provider,closed:true});
});
`,
      );
    else
      writeFileSync(
        path,
        header +
          `
test('pooled ${kind} boundary retains source and drains worker',async()=>{
 const configured=options('${kind}');
 const fixture=await createFormat4Fixture(configured.path);
 const nativeQuery=Database.prototype.query;
 const nativeClose=Database.prototype.close;
 const sentinel=new Error('owned pooled ${kind} fault');
 let closingStore=false;let faulted=false;let leaseCountAtOpen;let failure;
 if('${kind}'==='provenance'){
  const lease=retainFormat4Provider('provenance setup without a native store');
  const path=join(lease.directory,'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/format.ts');
  appendFileSync(path,'\\n');lease.release();
 }
 try {
  if('${kind}'==='open')Database.prototype.query=function(sql){if(this.filename===configured.path){leaseCountAtOpen=inspectFormat4Provider()?.leaseCount;faulted=true;throw sentinel;}return nativeQuery.call(this,sql);};
  if('${kind}'==='close')Database.prototype.close=function(...parameters){const path=this.filename;nativeClose.apply(this,parameters);if(closingStore&&path===configured.path){faulted=true;throw sentinel;}};
  try{const stores=await openPooledFormat4Stores(fixture,configured);closingStore=true;await stores.close();}catch(cause){failure=cause;}
 }finally{Database.prototype.query=nativeQuery;Database.prototype.close=nativeClose;}
 const terminal=await fixture.worker.exited;
 expect(terminal).toEqual({code:0,signal:null});
 expect(fixture.worker.stdoutClosed).toBe(true);expect(fixture.worker.stderrClosed).toBe(true);
 expect(existsSync(fixture.sourceDirectory)).toBe(false);
 const provider=inspectFormat4Provider();
 expect(provider.leaseCount).toBe(1);expect(existsSync(provider.directory)).toBe(true);
 const includes=(cause, expected)=>cause===expected||(cause instanceof Error&&includes(cause.cause,expected))||(cause instanceof AggregateError&&cause.errors.some(entry=>includes(entry,expected)));
 if('${kind}'!=='provenance'){expect(faulted).toBe(true);expect(includes(failure,sentinel)).toBe(true);}
 else expect(String(failure.cause)).toContain('predecessor source differs');
 if('${kind}'==='open')expect(leaseCountAtOpen).toBe(1);
 record({kind:'${kind}',provider,scratch:scratchRoot(),worker:fixture.worker.pid,terminal,pipesClosed:fixture.worker.stdoutClosed&&fixture.worker.stderrClosed,closed:true,failure:String(failure)});
});
`,
      );
  }
  const argv = [
    process.execPath,
    'test',
    '--timeout=60000',
    ...(kind === 'missing' ? [] : ['--preload', preload]),
    ...suites,
  ];
  const stdoutPath = join(directory, 'stdout');
  const stderrPath = join(directory, 'stderr');
  let hasClosureWitness = false;
  await settleFixture(async () => {
    const child = Bun.spawn(argv, {
      cwd: cli,
      env: { ...process.env, TMPDIR: temporary },
      stdout: Bun.file(stdoutPath),
      stderr: Bun.file(stderrPath),
      timeout: 60000,
    });
    const exit = await child.exited;
    const stdout = readFileSync(stdoutPath);
    const stderr = readFileSync(stderrPath);
    console.log(
      JSON.stringify({
        event: 'format4-lifetime-child',
        kind,
        argv,
        cwd: cli,
        pid: child.pid,
        exit,
        stdout: stdout.toString('base64'),
        stderr: stderr.toString('base64'),
        directory,
      }),
    );
    const witnessPath = join(directory, 'witnesses.jsonl');
    if (!existsSync(witnessPath))
      throw new Error('child closure unestablished; retained ' + directory);
    const witnesses = readFileSync(witnessPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) =>
        parseOrThrow(
          type({
            closed: 'boolean',
            'worker?': 'number',
            'ordinal?': 'number',
            'scratch?': 'string',
            'provider?': { directory: 'string' },
          }),
          JSON.parse(line),
        ),
      );
    // Proof: Task3 080/081 failed the second file before its closure witness but cleanup still removed the child directory. The same 082 fault now retains incomplete ownership evidence.
    expect(witnesses).toHaveLength(kind === 'reuse' ? 2 : 1);
    expect(witnesses.every((witness) => witness.closed)).toBe(true);
    expect(existsSync('/proc/' + String(child.pid))).toBe(false);
    for (const witness of witnesses)
      if (witness.worker !== undefined)
        expect(existsSync('/proc/' + String(witness.worker))).toBe(false);
    hasClosureWitness = true;
    const retainsSource = kind === 'open' || kind === 'close' || kind === 'provenance';
    expect(exit).toBe(retainsSource ? 1 : 0);
    if (retainsSource) {
      expect(stderr.toString()).toContain('format4 provider source retained');
      expect(stderr.toString()).toContain('pending owners');
    }
    for (const witness of witnesses) {
      if (witness.provider !== undefined)
        expect(existsSync(witness.provider.directory)).toBe(retainsSource);
      if (witness.scratch !== undefined) expect(existsSync(witness.scratch)).toBe(retainsSource);
    }
    if (kind === 'reuse') expect(witnesses.map((witness) => witness.ordinal)).toEqual([1, 2]);
    console.log(
      JSON.stringify({
        event: 'format4-lifetime-witnesses',
        kind,
        witnesses,
        retainedAtBoundary: retainsSource,
      }),
    );
  }, [
    () => {
      if (!hasClosureWitness) throw new Error('closure unestablished; retained ' + directory);
      // The child process has exited and explicitly observed every worker's terminal event; native closure is now established even for the intentional pre-exit opaque failure.
      rmSync(directory, { recursive: true, force: true });
    },
  ]);
}

for (const kind of ['reuse', 'missing', 'closed', 'open', 'close', 'provenance'] as const)
  test('format4 suite lifetime ' + kind, async () => {
    await runChild(kind);
  });

test('Dash test target installs the dedicated lifetime before every source suite', async () => {
  const project = parseOrThrow(
    type({ targets: { test: { options: { command: 'string', cwd: 'string' } } } }),
    JSON.parse(readFileSync(join(cli, 'project.json'), 'utf8')),
  );
  const selected = 'unused new down restores exact original physical schema and old records';
  const cwd = resolve(root, project.targets.test.options.cwd);
  // exec env preserves the configured assignment and gives the actual Bun runner the owned PID.
  const argv = [
    'sh',
    '-c',
    `exec env ${project.targets.test.options.command} --test-name-pattern '^${selected}$'`,
  ];
  const child = Bun.spawn(argv, { cwd, stdout: 'pipe', stderr: 'pipe', timeout: 45000 });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  console.log(
    JSON.stringify({
      event: 'format4-configured-target',
      argv,
      cwd,
      pid: child.pid,
      exit,
      signal: child.signalCode,
      stdout,
      stderr,
      pipesClosed: true,
    }),
  );
  // Proof: release-preload-fix 002 executed the bare src/ preload and failed here with preload not found; restoring only ./ made the same real source test pass.
  expect(exit).toBe(0);
  expect(child.signalCode).toBeNull();
  expect(existsSync('/proc/' + String(child.pid))).toBe(false);
  // Proof: release-preload-fix 014 ran the genuine selected test with FORCE_COLOR=1; Bun's successful checkmark failed the old literal (pass) assertion.
  expect(stderr).toContain(selected);
  expect(stderr).toMatch(/\b1 pass\b/);
  const closed = stdout
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as unknown)
    .map((entry) =>
      parseOrThrow(
        type({
          event: "'format4-provider-closed'",
          directory: 'string',
          moduleLoadCount: 'number',
          leaseCount: 'number',
        }),
        entry,
      ),
    );
  expect(closed).toHaveLength(1);
  for (const provider of closed) {
    expect(provider.moduleLoadCount).toBe(1);
    expect(provider.leaseCount).toBe(0);
    expect(existsSync(provider.directory)).toBe(false);
  }
}, 60000);
