import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { createInstalledLintFixture } from './installed-lint-fixtures';

export type OperationFault =
  | 'send'
  | 'disconnect'
  | 'reader'
  | 'reader-read'
  | 'reader-cancel'
  | 'reader-release'
  | 'exit-getter'
  | 'signal-zero'
  | 'exit-reject'
  | 'exit-null'
  | 'exit-fraction'
  | 'exit-negative'
  | 'exit-range'
  | 'exit-string'
  | 'exit-nan';

/** Break one real subprocess observation port while keeping its original native exit for cleanup. */
export function writeInstalledLintOperationProbe(
  fixture: ReturnType<typeof createInstalledLintFixture>,
  fault: OperationFault,
): string {
  const preload = join(fixture.root, 'operation-native-signal.mjs');
  if (fault === 'signal-zero')
    writeFileSync(
      preload,
      'process.exit=()=>{setTimeout(()=>process.kill(process.pid,"SIGKILL"),100);};',
    );
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    runtime: fixture.context.runtime,
    activationRoot: fixture.archive,
    scratchDirectory: fixture.scratch,
    request: fixture.invocation.request,
    fault,
    preload,
    marker: join(fixture.root, 'operation-ran'),
  };
  const program = [
    'import { existsSync } from "node:fs";',
    'import { createLaunch } from ' +
      JSON.stringify(import.meta.resolve('@shared/bun-startup')) +
      ';',
    'import { executeLint } from ' +
      JSON.stringify(new URL('../runtime-facade.ts', import.meta.url).href) +
      ';',
    'import { InstalledLintFailure } from ' +
      JSON.stringify(new URL('../installed-lint-launcher.ts', import.meta.url).href) +
      ';',
    'const fixture=' + JSON.stringify(configuration) + ';',
    'const originalSpawn=Bun.spawn.bind(Bun);let actual,realExit,restoreReader,hasNativeExited=false,hasFinished=false,injected=false,hasCancelledStream=false,report;',
    'const ready=Promise.withResolvers();',
    'Bun.spawn=(argv,options)=>{const selected=Array.isArray(argv)&&argv.includes("--puni-lint-parent-v1");const configured=selected?{...options,ipc(message,child){if(message==="puni-lint-ready-v1")ready.resolve();if(message==="puni-lint-finished-v1")hasFinished=true;options.ipc(message,child);}}:options;const child=originalSpawn(argv,configured);if(selected){actual=child;realExit=child.exited;void realExit.then(()=>{hasNativeExited=true;},()=>{hasNativeExited=true;});injected=true;if(fixture.fault==="send"||fixture.fault==="disconnect"){child.send=()=>{throw new Error("controlled parent send failure");};if(fixture.fault==="disconnect"){const disconnect=child.disconnect.bind(child);child.disconnect=()=>{disconnect();throw new Error("controlled parent disconnect failure");};}}else if(fixture.fault.startsWith("reader")){const getReader=child.stdout.getReader;restoreReader=()=>{child.stdout.getReader=getReader;};if(fixture.fault==="reader"||fixture.fault==="reader-cancel"){child.stdout.getReader=()=>{throw new Error("controlled reader acquisition failure");};if(fixture.fault==="reader-cancel"){const cancel=child.stdout.cancel.bind(child.stdout);child.stdout.cancel=async()=>{await cancel();hasCancelledStream=true;throw new Error("controlled stream cancellation failure");};}}else{child.stdout.getReader=()=>{const reader=getReader.call(child.stdout);if(fixture.fault==="reader-read")reader.read=()=>Promise.reject(new Error("controlled stream read failure"));else{const release=reader.releaseLock.bind(reader);reader.releaseLock=()=>{release();throw new Error("controlled reader release failure");};}return reader;};}}else if(fixture.fault==="exit-getter"){Object.defineProperty(child,"exited",{get(){throw new Error("controlled exit getter failure");},configurable:true});}else{const values={"exit-null":null,"exit-fraction":1.5,"exit-negative":-1,"exit-range":256,"exit-string":"0","exit-nan":NaN};const value=fixture.fault==="signal-zero"?realExit.then(()=>0):fixture.fault==="exit-reject"?Promise.reject(new Error("controlled exit observation failure")):Promise.resolve(values[fixture.fault]);void value.catch(()=>undefined);Object.defineProperty(child,"exited",{value,configurable:true});}}return child;};',
    'async function waitOwned(pending){const expiry=Promise.withResolvers();const timer=setTimeout(()=>expiry.reject(new Error("owned operation probe did not settle")),5000);try{return await Promise.race([pending,expiry.promise]);}finally{clearTimeout(timer);}}',
    'const stdout=[],stderr=[],diagnostics=[];',
    'try{',
    'const outcome=await waitOwned(executeLint(fixture.request,{...fixture,trustedNodeModules:undefined,required:false,launch:entrypoint=>{const argv=createLaunch(process.execPath,entrypoint);return fixture.fault==="signal-zero"?[...argv.slice(0,-1),"--preload",fixture.preload,entrypoint]:argv;},stdout:bytes=>{stdout.push(bytes.slice());return{kind:"written"};},stderr:bytes=>{stderr.push(bytes.slice());return{kind:"written"};},reportDiagnostic:bytes=>{diagnostics.push(bytes.slice());return Promise.resolve({kind:"reported"});},subscribeInterrupts:()=>()=>undefined}).then(status=>({kind:"returned",status}),cause=>({kind:"threw",cause})));',
    'report={injected,hasCancelledStream,nativeSignal:actual?.signalCode,causes:outcome.kind==="threw"&&outcome.cause instanceof AggregateError?outcome.cause.errors.map(String):[],ownedFailure:outcome.kind==="threw"&&outcome.cause instanceof InstalledLintFailure,nativeExitedAtRejection:hasNativeExited,finishedAtRejection:hasFinished,operationRanAtRejection:existsSync(fixture.marker),message:outcome.kind==="threw"?String(outcome.cause):"returned status "+String(outcome.status)};',
    '}finally{',
    'Bun.spawn=originalSpawn;',
    'if(actual!==undefined){if(!hasNativeExited){await waitOwned(Promise.race([ready.promise,realExit]));if(actual.exitCode===null&&actual.signalCode===null){try{actual.send("puni-lint-SIGTERM-v1");}catch(cause){if(!(cause instanceof Error&&cause.code==="ERR_IPC_CHANNEL_CLOSED"))throw cause;}}}await waitOwned(realExit);if(restoreReader!==undefined){restoreReader();if(!actual.stdout.locked){try{await actual.stdout.cancel();}catch(cause){if(fixture.fault!=="reader-cancel")throw cause;}}}}',
    '}',
    'if(report===undefined)throw new Error("owned operation probe lacks report");report.nativeExitedFinally=hasNativeExited;report.operationRanFinally=existsSync(fixture.marker);process.stdout.write(JSON.stringify(report));',
  ].join('\n');
  const path = join(fixture.root, 'installed-operation-' + fault + '.mjs');
  writeFileSync(path, program);
  return path;
}

/** Observe actual native exit/channel settlement while the caller deliberately holds one output channel. */
export function writeInstalledLintAwaitProbe(
  fixture: ReturnType<typeof createInstalledLintFixture>,
  channel: 'stdout' | 'stderr',
): string {
  const configuration = {
    channel,
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    runtime: fixture.context.runtime,
    activationRoot: fixture.archive,
    scratchDirectory: fixture.scratch,
    request: fixture.invocation.request,
  };
  const program = [
    'import{executeLint}from ' +
      JSON.stringify(new URL('../runtime-facade.ts', import.meta.url).href) +
      ';',
    'import{createLaunch}from ' + JSON.stringify(import.meta.resolve('@shared/bun-startup')) + ';',
    'const fixture=' + JSON.stringify(configuration) + ';',
    'const nativeSpawn=Bun.spawn.bind(Bun),nativeExit=Promise.withResolvers(),disconnected=Promise.withResolvers(),entered=Promise.withResolvers(),output=Promise.withResolvers();let actual,releaseOutput;',
    'Bun.spawn=(argv,options)=>{const selected=Array.isArray(argv)&&argv.includes("--puni-lint-parent-v1");const child=nativeSpawn(argv,selected?{...options,onDisconnect(...args){options.onDisconnect(...args);disconnected.resolve();}}:options);if(selected){actual=child;void child.exited.then(nativeExit.resolve,nativeExit.reject);}return child;};',
    'let listener;const pending=executeLint(fixture.request,{...fixture,trustedNodeModules:undefined,required:false,launch:entrypoint=>createLaunch(process.execPath,entrypoint),stdout:()=>{if(fixture.channel!=="stdout")return{kind:"written"};entered.resolve();return output.promise;},stderr:()=>{if(fixture.channel!=="stderr")return{kind:"written"};entered.resolve();return output.promise;},reportDiagnostic:()=>Promise.resolve({kind:"reported"}),subscribeInterrupts:next=>{listener=next;releaseOutput=()=>output.resolve({kind:"cancelled",signal:"SIGINT"});return()=>{listener=undefined;};}});',
    'async function bounded(promise){const expiry=Promise.withResolvers(),timer=setTimeout(()=>expiry.reject(new Error("owned await probe did not settle")),5000);try{return await Promise.race([promise,expiry.promise]);}finally{clearTimeout(timer);}}',
    'let hasWaited,status;try{await bounded(Promise.all([entered.promise,nativeExit.promise,disconnected.promise]));const settled=pending.then(()=>"returned",()=>"threw");hasWaited=await Promise.race([settled,Bun.sleep(30).then(()=>"pending")])==="pending";if(listener!==undefined)listener("SIGINT");releaseOutput();status=await bounded(pending);}finally{Bun.spawn=nativeSpawn;output.resolve({kind:"cancelled",signal:"SIGINT"});if(actual!==undefined&&actual.exitCode===null&&actual.signalCode===null)actual.kill("SIGTERM");if(actual!==undefined)await bounded(nativeExit.promise);}',
    'process.stdout.write(JSON.stringify({hasWaited,status}));',
  ].join('\n');
  const path = join(fixture.root, 'installed-await-probe.mjs');
  writeFileSync(path, program);
  return path;
}
