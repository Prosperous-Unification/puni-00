import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { createInstalledLintFixture } from './installed-lint-fixtures';

/**
 * Isolate the Linux x64 subreaper ABI so an actual killed launcher cannot leave the fixture's
 * detached validator behind. Only its recorded orphan PID is reaped; Bun retains its own children.
 * The real facade must first report unconfirmed ownership while that stage is still alive.
 */
export function writeInstalledLintDeathProbe(
  fixture: ReturnType<typeof createInstalledLintFixture>,
): string {
  const preload = join(fixture.root, 'death-launcher-pid.mjs');
  const launcherPath = join(fixture.root, 'launcher.pid');
  const stagePath = join(fixture.root, 'stage.pid');
  writeFileSync(
    preload,
    'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(launcherPath) +
      ',String(process.pid));',
  );
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    runtime: fixture.context.runtime,
    activationRoot: fixture.archive,
    scratchDirectory: fixture.scratch,
    request: fixture.invocation.request,
    preload,
    launcherPath,
    stagePath,
  };
  const program = [
    'import { dlopen,ptr,read } from "bun:ffi";',
    'import { Buffer } from "node:buffer";',
    'import { existsSync,readFileSync,readdirSync } from "node:fs";',
    'import { executeLint } from ' +
      JSON.stringify(new URL('../runtime-facade.ts', import.meta.url).href) +
      ';',
    'import { InstalledLintFailure } from ' +
      JSON.stringify(new URL('../installed-lint-launcher.ts', import.meta.url).href) +
      ';',
    'import { createLaunch } from ' +
      JSON.stringify(import.meta.resolve('@shared/bun-startup')) +
      ';',
    'if(process.platform!=="linux"||process.arch!=="x64")throw new Error("orphan-cleanup fixture requires observed Linux x64 ABI");',
    'const fixture=' + JSON.stringify(configuration) + ';',
    'const libc=dlopen("libc.so.6",{prctl:{args:["i32","u64","u64","u64","u64"],returns:"i32"},waitpid:{args:["i32","ptr","i32"],returns:"i32"},__errno_location:{args:[],returns:"ptr"}});',
    'const errno=()=>read.i32(libc.symbols.__errno_location(),0);const state=new Int32Array(1),status=new Int32Array(1);',
    'let prior,armed=false,reaped=false,launcherPid,stagePid,report;',
    'function readPid(path){const pid=Number(readFileSync(path,"utf8"));if(!Number.isSafeInteger(pid)||pid<=1)throw new Error("invalid owned fixture PID");return pid;}',
    'function parentOf(pid){const match=/^PPid:\\s+(\\d+)$/m.exec(readFileSync("/proc/"+pid+"/status","utf8"));if(match===null)throw new Error("owned stage lacks PPid");return Number(match[1]);}',
    'function killGroup(pid){try{process.kill(-pid,"SIGKILL");}catch(cause){if(!(cause instanceof Error&&cause.code==="ESRCH"))throw cause;}}',
    'function isGone(pid){try{process.kill(pid,0);return false;}catch(cause){if(cause instanceof Error&&cause.code==="ESRCH")return true;throw cause;}}',
    'async function waitPath(path){for(let attempt=0;attempt<500;attempt++){if(existsSync(path))return;await Bun.sleep(10);}throw new Error("owned stage did not start");}',
    'async function waitOutcome(pending){const expiry=Promise.withResolvers();const timer=setTimeout(()=>expiry.reject(new Error("actual installed owner did not settle")),5000);try{return await Promise.race([pending,expiry.promise]);}finally{clearTimeout(timer);}}',
    'async function reapOwned(pid){for(let attempt=0;attempt<300;attempt++){const waited=libc.symbols.waitpid(pid,ptr(status),1);if(waited===pid){reaped=true;return status[0];}if(waited===-1){const code=errno();if(code===4)continue;throw new Error("exact orphan waitpid failed errno "+code);}await Bun.sleep(10);}throw new Error("exact orphan waitpid deadline");}',
    'try{',
    'if(libc.symbols.prctl(37,BigInt(ptr(state)),0n,0n,0n)!==0)throw new Error("read subreaper failed "+errno());prior=state[0];if(libc.symbols.prctl(36,1n,0n,0n,0n)!==0)throw new Error("arm subreaper failed "+errno());armed=true;',
    'if(libc.symbols.prctl(37,BigInt(ptr(state)),0n,0n,0n)!==0||state[0]!==1)throw new Error("subreaper not armed");',
    'const stdout=[],stderr=[],diagnostics=[];',
    'const pending=executeLint(fixture.request,{...fixture,trustedNodeModules:undefined,required:false,launch(entrypoint){const argv=createLaunch(process.execPath,entrypoint);return[...argv.slice(0,-1),"--preload",fixture.preload,entrypoint];},stdout(bytes){stdout.push(bytes.slice());return{kind:"written"};},stderr(bytes){stderr.push(bytes.slice());return{kind:"written"};},reportDiagnostic(bytes){diagnostics.push(bytes.slice());return Promise.resolve({kind:"reported"});},subscribeInterrupts:()=>()=>undefined});',
    'const observed=pending.then(status=>({kind:"returned",status}),cause=>({kind:"threw",cause}));',
    'await waitPath(fixture.stagePath);stagePid=readPid(fixture.stagePath);launcherPid=readPid(fixture.launcherPath);if(parentOf(stagePid)!==launcherPid)throw new Error("stage was not owned by actual launcher");',
    'killGroup(launcherPid);const outcome=await waitOutcome(observed);if(outcome.kind!=="threw"||!(outcome.cause instanceof InstalledLintFailure))throw new Error("unsolicited death was not an owned failure");',
    'if(!outcome.cause.message.includes("detached-stage cleanup is unconfirmed")||!outcome.cause.message.includes(String(launcherPid)))throw new Error("unsolicited death lost its retained ownership diagnostic");',
    'const outerGone=isGone(launcherPid);if(!outerGone)throw new Error("launcher survived fixture SIGKILL");process.kill(stagePid,0);const adopted=parentOf(stagePid)===process.pid;if(!adopted)throw new Error("orphan was not adopted by isolated fixture");',
    'const alive=libc.symbols.waitpid(stagePid,ptr(status),1);if(alive!==0)throw new Error("stage was not alive after outer death");const retained=readdirSync(fixture.scratchDirectory);if(retained.length!==1)throw new Error("unknown inner scratch was not retained");',
    'killGroup(stagePid);const signal=await reapOwned(stagePid);const gone=isGone(stagePid);if(!gone)throw new Error("orphan survived exact waitpid");',
    'report={outerGone,stageAliveBeforeCleanup:alive===0,adopted,reaped,gone,signal,retained:retained.length,launcherPid,stagePid,failure:outcome.cause.message,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString(),diagnostics:Buffer.concat(diagnostics).toString()};',
    '}finally{',
    'if(launcherPid===undefined&&existsSync(fixture.launcherPath))launcherPid=readPid(fixture.launcherPath);if(launcherPid!==undefined&&!isGone(launcherPid)){killGroup(launcherPid);await Bun.sleep(50);}',
    'if(stagePid===undefined&&existsSync(fixture.stagePath))stagePid=readPid(fixture.stagePath);if(stagePid!==undefined&&!reaped){killGroup(stagePid);await reapOwned(stagePid);}',
    'if(armed){if(libc.symbols.prctl(36,BigInt(prior),0n,0n,0n)!==0)throw new Error("restore subreaper failed "+errno());if(libc.symbols.prctl(37,BigInt(ptr(state)),0n,0n,0n)!==0||state[0]!==prior)throw new Error("subreaper restore differs");if(report!==undefined)report.priorRestored=true;}libc.close();',
    '}',
    'if(report===undefined)throw new Error("owned death probe lacks report");process.stdout.write(JSON.stringify(report));',
  ].join('\n');
  const path = join(fixture.root, 'installed-death-probe.mjs');
  writeFileSync(path, program);
  return path;
}
