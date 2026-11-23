import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { fixtureGit } from '../resources/host-pool.test.fixture';
import { catalogueCheckout } from './ops.test.fixture';

function exercise(
  shouldFailOperation: boolean,
  controls: { nativeFailure?: boolean; fenceFailure?: boolean; interruptQueue?: boolean } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'switch-native-cleanup-'));
  try {
    const checkout = join(root, 'checkout');
    catalogueCheckout(checkout, []);
    writeFileSync(join(checkout, 'bin/heavy-lock-lib.sh'), 'run_heavy_job() {\n :\n}\n');
    fixtureGit(checkout, 'add', '.');
    fixtureGit(checkout, 'commit', '--quiet', '-m', 'shim');
    const program = [
      'import{mock}from"bun:test";',
      'const url=' +
        JSON.stringify(new URL('../resources/legacy-lock.ts', import.meta.url).href) +
        ';',
      'const controls=' +
        JSON.stringify({ nativeFailure: true, ...controls }) +
        ';const native=await import(url);let released=false,mode="observe",abandoned=false,commits=0;const queueSignals=[];const operationFailure=new Error("mode transaction failed"),cleanupFailure=new Error("native cleanup failed"),fenceFailure=new Error("intake fence cleanup failed");',
      'mock.module(url,()=>({...native,readLegacyQueue:async()=>{if(controls.interruptQueue){for(const signal of ["SIGTERM","SIGINT"]){const entered=Promise.withResolvers();process.once(signal,()=>{queueSignals.push(signal);entered.resolve();});process.kill(process.pid,signal);await entered.promise;}}return {holder:{kind:"none"},waiters:[],lines:[]};},holdLegacyLock:async()=>({kind:"held",hold:{pid:123,release(){released=true;},get exited(){return controls.nativeFailure?Promise.reject(cleanupFailure):Promise.resolve(0);}}})}));',
      'const{switchPoolMode}=await import(' +
        JSON.stringify(new URL('./switch-mode.ts', import.meta.url).href) +
        ');',
      'const runtime={configuration:{root:' +
        JSON.stringify(root) +
        ',launcherCheckouts:[' +
        JSON.stringify(checkout) +
        '],concurrencyEligible:[]},hostPoolTransition:()=>({mode:"observe"}),beginModeSwitch(){},modeDrain:()=>[],completeModeSwitch(){commits++;if(' +
        String(shouldFailOperation) +
        ')throw operationFailure;mode="concurrent";return {mode};},abandonModeSwitch(){abandoned=true;if(controls.fenceFailure)throw fenceFailure;}};',
      'let failure;try{await switchPoolMode(runtime,{target:"concurrent",operator:"operator",waitSeconds:0,pollSeconds:1,releaseGuard:false,allowEmpty:true},{now:()=>0,legacyLock:{lockPath:"/unused"},environment:process.env,account:"account",report:()=>{}});}catch(cause){failure=cause;}process.stdout.write(JSON.stringify({released,mode,abandoned,message:failure?.message,causes:failure instanceof AggregateError?failure.errors.flatMap(function leaves(cause){return cause instanceof AggregateError?cause.errors.flatMap(leaves):[cause.message];}):[],...(controls.interruptQueue?{code:failure?.exitCode,queueSignals,commits}:{}),...(controls.fenceFailure?{identities:[operationFailure,cleanupFailure,fenceFailure].map(expected=>{function includes(cause){return cause===expected||(cause instanceof AggregateError&&cause.errors.some(includes))||(cause instanceof Error&&cause.cause!==undefined&&includes(cause.cause));}return includes(failure);})}:{})}));',
    ].join('\n');
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      { cwd: import.meta.dir, env: process.env, stdout: 'pipe', stderr: 'pipe', timeout: 15000 },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    const observation: unknown = JSON.parse(child.stdout.toString());
    return observation;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('mode commit remains visible when native hold cleanup fails', () => {
  expect(exercise(false)).toEqual({
    released: true,
    mode: 'concurrent',
    abandoned: true,
    message: 'native cleanup failed',
    causes: [],
  });
}, 30_000);
test('mode switch preserves operation and native hold cleanup failures', () => {
  expect(exercise(true)).toEqual({
    released: true,
    mode: 'observe',
    abandoned: true,
    message: 'pool mode switch and native hold cleanup failed',
    causes: ['mode transaction failed', 'native cleanup failed'],
  });
}, 30_000);

test('a first signal during gated queue observation refuses before mode commit', () => {
  expect(exercise(false, { nativeFailure: false, interruptQueue: true })).toEqual({
    released: true,
    mode: 'observe',
    abandoned: true,
    message: 'ops pool switch-mode: interrupted by SIGTERM; nothing switched and intake reopened',
    causes: [],
    code: 143,
    queueSignals: ['SIGTERM', 'SIGINT'],
    commits: 0,
  });
}, 30_000);
test('transaction native settlement and fence abandonment retain all original causes', () => {
  expect(exercise(true, { fenceFailure: true })).toEqual({
    released: true,
    mode: 'observe',
    abandoned: true,
    message: 'pool mode switch and intake fence cleanup failed',
    causes: ['mode transaction failed', 'native cleanup failed', 'intake fence cleanup failed'],
    identities: [true, true, true],
  });
}, 30_000);
test('a committed mode remains visible when fence abandonment alone fails', () => {
  expect(exercise(false, { nativeFailure: false, fenceFailure: true })).toEqual({
    released: true,
    mode: 'concurrent',
    abandoned: true,
    message: 'intake fence cleanup failed',
    causes: [],
    identities: [false, false, true],
  });
}, 30_000);
