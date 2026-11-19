import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,cpSync,chmodSync,statSync,symlinkSync} from 'node:fs';
import {readFile,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {expect} from 'bun:test';
import {createLaunch} from '@shared/bun-startup';

import {createExecutionFixture} from '../../../../../tools/tool-devsync/src/performance-execution-fixture';
import {createPerformanceProcessOwner} from '../../../../../tools/tool-devsync/src/performance-processes';
import * as selectionCore from './selection';

interface InstalledSelection {
  readonly root:string;
  readonly installation:string;
  readonly archive:string;
  readonly entrypoint:string;
  readonly revision:string;
  readonly sourceRoot?:string;
  readonly environment:Readonly<Record<string,string>>;
}
function hasKnownCustody(custody:{settled:boolean}):boolean{return custody.settled;}
function hashBytes(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
async function awaitWithin<Value>(pending:Promise<Value>,milliseconds:number,label:string):Promise<Value>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([pending,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error(label+' did not settle')),milliseconds);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
function assertProcessAbsent(pid:number):void{
  try{readFileSync('/proc/'+String(pid)+'/stat','utf8');}
  catch(cause){if(cause!==null&&typeof cause==='object'&&'code'in cause&&cause.code==='ENOENT')return;throw cause;}
  throw new Error('Installed test-level child remains or PID was reused: '+String(pid));
}
function readRecords(path:string):Record<string,unknown>[]{
  return readFileSync(path,'utf8').split('\n').filter(Boolean).map(line=>{
    const record:unknown=JSON.parse(line);if(record===null||typeof record!=='object'||Array.isArray(record))throw new Error('Installed native trace is malformed');
    // Test-owned isolated observer writes these exact JSON records; fields are checked where consumed.
    return record as Record<string,unknown>;
  });
}
/** Real installed main, observed native argv forwarded unchanged; no provider or asset-selection test override. */
async function observeInstalledOperation(selection:InstalledSelection,repository:string,args:readonly string[],tag:string,custody:{settled:boolean}){
  const harness=join(selection.root,'test-level-'+tag+'.mjs'),trace=join(selection.root,'test-level-'+tag+'.jsonl');
  const completion=join(selection.root,'test-level-'+tag+'.completion.json');
  writeFileSync(trace,'',{flag:'wx'});
  writeFileSync(harness,`import{appendFileSync,writeFileSync}from'node:fs';import{dirname}from'node:path';import{tmpdir}from'node:os';import{pathToFileURL}from'node:url';
const original=Bun.spawn;const originalSync=Bun.spawnSync;const observed=[];const failures=[];
const append=record=>{try{appendFileSync(${JSON.stringify(trace)},JSON.stringify(record)+'\\n')}catch(cause){failures.push(cause)}};
Bun.spawn=(...argv)=>{const child=original(...argv);append({kind:'spawn',pid:child.pid,argv:argv[0],cwd:argv[1]?.cwd});observed.push(child.exited.then(exitCode=>append({kind:'exit',pid:child.pid,exitCode})).catch(cause=>failures.push(cause)));return child;};
Bun.spawnSync=(...argv)=>{const child=originalSync(...argv);append({kind:'spawn-sync',pid:child.pid,argv:argv[0],cwd:argv[1]?.cwd,exitCode:child.exitCode,signalCode:child.signalCode,timeout:child.exitedDueToTimeout,maxBuffer:child.exitedDueToMaxBuffer});return child;};
let first;let failed=false;let completion;
try{const installed=await import(pathToFileURL(${JSON.stringify(selection.entrypoint)}).href);if(typeof installed.main!=='function')throw new Error('Installed PUNI main absent');completion=await installed.main(${JSON.stringify(args)},{installation:{directory:dirname(${JSON.stringify(selection.entrypoint)}),entrypoint:${JSON.stringify(selection.entrypoint)}},lookup:{directory:${JSON.stringify(repository)},path:process.env.PATH},callerDirectory:${JSON.stringify(repository)},runtime:process.execPath,temporaryDirectory:tmpdir(),environment:{...process.env},stdout:bytes=>process.stdout.write(bytes),stderr:bytes=>process.stderr.write(bytes)});}
catch(cause){failed=true;first=cause;}
await Promise.all(observed);Bun.spawn=original;Bun.spawnSync=originalSync;
if(failures.length)throw new AggregateError(failed?[first,...failures]:failures,'Installed test-level observation failed');if(failed)throw first;
if(completion===null||typeof completion!=='object'||!['drain','exit'].includes(completion.kind)||!Number.isInteger(completion.status)||completion.status<0||completion.status>255)throw new Error('Installed main completion malformed');
writeFileSync(${JSON.stringify(completion)},JSON.stringify(completion));if(completion.kind==='exit')process.exit(completion.status);process.exitCode=completion.status;
`);
  const owner=createPerformanceProcessOwner();let stopping:Promise<void>|undefined;
  const stop=()=>stopping??=owner.stop();
  let known=false;let primary:{cause:unknown}|undefined;
  let output:{exitCode:number;stdout:string;stderr:string;trace:Record<string,unknown>[]} | undefined;
  const channels:Promise<PromiseSettledResult<number|string>>[]=[];
  const retainChannel=<Value extends number|string>(pending:Promise<Value>):Promise<Value>=>{
    channels.push(pending.then((value):PromiseFulfilledResult<Value>=>({status:'fulfilled',value}),(reason:unknown):PromiseRejectedResult=>({status:'rejected',reason})));
    return pending;
  };
  try{
    const child=owner.spawn([...createLaunch(process.execPath,harness)],repository,{...selection.environment},{stdout:'pipe',stderr:'pipe'});
    retainChannel(child.exited);
    const stdout=child.stdout;
    if(!(stdout instanceof ReadableStream))throw new Error('Installed main stdout pipe absent');
    retainChannel(new Response(stdout).text());
    const stderr=child.stderr;
    if(!(stderr instanceof ReadableStream))throw new Error('Installed main stderr pipe absent');
    retainChannel(new Response(stderr).text());
    const settled=await awaitWithin(Promise.all(channels),180000,'Installed main exit and EOFs');
    const causes=settled.flatMap(channel=>channel.status==='rejected'?[channel.reason as unknown]:[]);
    if(causes.length)throw new AggregateError(causes,'Installed main exit or EOF failed');
    const [exit,out,err]=settled;
    if(exit?.status!=='fulfilled'||typeof exit.value!=='number'||out?.status!=='fulfilled'||typeof out.value!=='string'||err?.status!=='fulfilled'||typeof err.value!=='string')throw new Error('Installed main channel types malformed');
    await stop();assertProcessAbsent(child.pid);
    const traceRecords=readRecords(trace);for(const record of traceRecords)if(record['kind']==='spawn'){if(typeof record['pid']!=='number')throw new Error('Installed spawn PID malformed');assertProcessAbsent(record['pid']);}
    known=true;custody.settled=true;
    let returned:unknown;
    try{returned=JSON.parse(await readFile(completion,'utf8'));}
    catch(cause){throw new Error('Actual root completion unavailable; exit='+String(exit.value)+'; stderr='+err.value.slice(0,8192),{cause});}
    expect(returned).toMatchObject({status:exit.value});
    output={exitCode:exit.value,stdout:out.value,stderr:err.value,trace:traceRecords};
  }catch(cause){primary={cause};}
  const cleanupFailures:unknown[]=[];
  try{await stop();}catch(cause){cleanupFailures.push(cause);known=false;custody.settled=false;}
  if(!known){
    const causes:unknown[]=primary===undefined?[]:[primary.cause];
    const append=(cause:unknown)=>{if(!causes.some(held=>Object.is(held,cause)))causes.push(cause);};
    for(const cause of cleanupFailures)append(cause);
    try{const final=await awaitWithin(Promise.all(channels),10000,'Final installed exit/EOF settlement');for(const channel of final)if(channel.status==='rejected')append(channel.reason as unknown);}catch(cause){append(cause);}
    append(new Error('Installed test-level custody unknown; retain '+selection.root));
    throw new AggregateError(causes,'Installed test-level observation failed');
  }
  if(primary!==undefined)throw primary.cause;
  if(output===undefined)throw new Error('Installed main produced no observed outcome');
  return output;
}

/** One existing actual build/pack/add session; actual installed roots execute after producer checkout/output removal. */
export async function assertInstalledTestLevels(supplied:InstalledSelection):Promise<void>{
  const archive=readFileSync(supplied.archive),archiveSha=hashBytes(archive);
  cpSync(supplied.archive,join(supplied.installation,'authenticated-puni.tgz'));
  const selected=createTestSelection(supplied,archiveSha);
  const selection:InstalledSelection={...supplied,environment:{...supplied.environment,
    PUNI_SELECTION:Buffer.from(selected).toString('utf8'),PUNI_SELECTION_SHA256:hashBytes(selected),PUNI_INSTALLATION_DIRECTORY:supplied.installation,PUNI_EXECUTABLE:supplied.entrypoint}};
  const {performance,perfSelection,args}=await assertHealthyTestLevels(selection,'installed');
  const before=readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'));
  const worker=join(dirname(selection.entrypoint),'performance-judge.mjs'),backup=worker+'.test-held';
  renameSync(worker,backup);
  const missingCustody={settled:false};let missingFailure:{cause:unknown}|undefined;
  try{const absent=await observeInstalledOperation(perfSelection,performance.root,args,'missing-worker',missingCustody);expect(absent.exitCode).not.toBe(0);expect(absent.stderr.length).toBeGreaterThan(0);expect(absent.trace.filter(record=>record['kind']==='spawn')).toEqual([]);expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);}
  catch(cause){missingFailure={cause};}
  if(!hasKnownCustody(missingCustody))throw new Error('Missing-worker child custody unknown; retain modified fixture '+selection.root,{cause:missingFailure?.cause});
  try{renameSync(backup,worker);}catch(cleanup){if(missingFailure!==undefined)throw new AggregateError([missingFailure.cause,cleanup],'Missing-worker owner and exact restore failed');throw cleanup;}
  if(missingFailure!==undefined)throw missingFailure.cause;
  const profilePath=join(dirname(selection.entrypoint),'package-manifest.json'),profileBytes=readFileSync(profilePath),profileMode=statSync(profilePath).mode&0o777;
  const oldCustody={settled:false};let oldFailure:{cause:unknown}|undefined;
  try{
    const current:unknown=JSON.parse(profileBytes.toString('utf8'));if(current===null||typeof current!=='object'||Array.isArray(current))throw new Error('Installed package manifest malformed');
    const historical={...current,packageVersion:'0.3.0'};Reflect.deleteProperty(historical,'testLevelIdentity');chmodSync(profilePath,0o600);writeFileSync(profilePath,JSON.stringify(historical));
    const old=await observeInstalledOperation(perfSelection,performance.root,args,'old-profile-shape',oldCustody);expect(old.exitCode).not.toBe(0);expect(old.trace.filter(record=>record['kind']==='spawn')).toEqual([]);expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  }catch(cause){oldFailure={cause};}
  if(!hasKnownCustody(oldCustody))throw new Error('Old-profile child custody unknown; retain modified fixture '+selection.root,{cause:oldFailure?.cause});
  try{writeFileSync(profilePath,profileBytes);chmodSync(profilePath,profileMode);}catch(cleanup){if(oldFailure!==undefined)throw new AggregateError([oldFailure.cause,cleanup],'Old-profile owner and exact restore failed');throw cleanup;}
  if(oldFailure!==undefined)throw oldFailure.cause;
  const restored=await observeInstalledOperation(perfSelection,performance.root,args,'restored-performance',{settled:false});expect(restored.exitCode,restored.stderr).toBe(0);
  await rm(performance.parent,{recursive:true});
}

/** Actual root main and independent installed asset selection are shared; each execution has its own real candidate and durable output. */
async function assertHealthyTestLevels(selection:InstalledSelection,prefix:string){
  const browser=join(selection.root,prefix+' Browser candidate');mkdirSync(join(browser,'libs/wbs/application/core/testing'),{recursive:true});
  writeFileSync(join(browser,'.gitignore'),'tmp/\nnode_modules\ndist/\ntest-results/\nplaywright-report/\n');
  writeFileSync(join(browser,'libs/wbs/application/core/testing/portable-composition.ts'),'export const installedBrowser = "actual Bun build";\n');
  writeFileSync(join(browser,'libs/wbs/application/core/playwright.config.ts'),"import{defineConfig}from'@playwright/test';export default defineConfig({testDir:'./testing',testMatch:'**/installed.spec.ts',projects:[{name:'chromium'}],workers:1,retries:0,timeout:30000});\n");
  writeFileSync(join(browser,'libs/wbs/application/core/testing/installed.spec.ts'),"import{test,expect}from'@playwright/test';test('actual installed Browser',()=>{expect(typeof process.versions.bun).toBe('string')});\n");
  for(const args of [['init','-q'],['config','user.name','Installed Browser'],['config','user.email','installed-browser@example.invalid'],['add','.'],['commit','-qm','actual installed Browser']]){
    const command=Bun.spawnSync(['/usr/bin/git','-C',browser,...args],{stdout:'pipe',stderr:'pipe',env:{PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'},timeout:30000});if(command.exitCode!==0)throw new Error(command.stderr.toString());
  }
  const browserRun=await observeInstalledOperation(selection,browser,['dash','browser','portable','--repository',browser],prefix+'-browser',{settled:false});
  expect(browserRun.exitCode,browserRun.stderr).toBe(0);
  const browserPointer:unknown=JSON.parse(readFileSync(join(browser,'tmp/junit/browser/portable.current.json'),'utf8'));
  expect(browserPointer).toMatchObject({schemaVersion:2,mode:'portable'});
  if(browserPointer===null||typeof browserPointer!=='object'||!('bundle'in browserPointer)||typeof browserPointer.bundle!=='string')throw new Error('Installed Browser pointer malformed');
  const browserManifest:unknown=JSON.parse(readFileSync(join(browser,browserPointer.bundle,'manifest.json'),'utf8'));
  expect(browserManifest).toMatchObject({certifies:false,mode:'portable',reportDigest:hashBytes(readFileSync(join(browser,browserPointer.bundle,'report.xml')))});
  for(const [name,filename]of [['discovery','discovery.json'],['execution','execution.json'],['junit','playwright.xml']]as const)
    expect(browserManifest).toMatchObject({raw:{[name]:{path:browserPointer.bundle+'/'+filename,digest:hashBytes(readFileSync(join(browser,browserPointer.bundle,filename)))}}});
  const performance=await createExecutionFixture('success');
  try{writeFileSync(join(selection.root,prefix+'-performance-fixture-location.json'),JSON.stringify({parent:performance.parent,root:performance.root}));}
  catch(cause){throw new Error('Installed Performance fixture acquired; retained '+performance.parent,{cause});}
  const variables={...selection.environment,E2E_PORT_SHIFT:String(performance.shift)};
  const perfSelection={...selection,environment:variables};
  const args=['dash','performance','--repository',performance.root,'--rule-policy',performance.policy];
  const observed=await observeInstalledOperation(perfSelection,performance.root,args,prefix+'-performance',{settled:false});
  expect(observed.exitCode,observed.stderr).toBe(0);
  const pointer:unknown=JSON.parse(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'),'utf8'));
  expect(pointer).toMatchObject({schemaVersion:1,certifies:false});
  if(pointer===null||typeof pointer!=='object'||!('bundle'in pointer)||typeof pointer.bundle!=='string')throw new Error('Installed Performance pointer malformed');
  const bundle=join(performance.root,pointer.bundle),manifest:unknown=JSON.parse(readFileSync(join(bundle,'manifest.json'),'utf8'));
  for(const [name,path]of [['discovery','discovery.json'],['run','run.json'],['evidence','evidence.json'],['report','report.xml']]as const){const bytes=readFileSync(join(bundle,path));expect(manifest).toMatchObject({[name]:{path,digest:hashBytes(bytes)}});}
  const spawns=observed.trace.filter(record=>record['kind']==='spawn');
  expect(spawns.filter(record=>Array.isArray(record['argv'])&&record['argv'].includes('test')&&record['argv'].includes('--reporter=json'))).toHaveLength(2);
  for(const record of spawns){
    if(!Array.isArray(record['argv']))throw new Error('Installed argv missing');
    if(prefix==='source'&&record['argv'][0]==='git'){
      if(record['argv'][1]==='--version')expect(record['argv']).toEqual(['git','--version']);
      else{
        if(selection.sourceRoot===undefined)throw new Error('source owner lacks its actual source root');
        expect(record['argv'].slice(1,3)).toEqual(['-C',selection.sourceRoot]);
        expect(['rev-parse','ls-files']).toContain(record['argv'][3]);
      }
    }else expect(record['argv'][0]).toBe(process.execPath);
  }
  const judgments=observed.trace.filter(record=>record['kind']==='spawn'&&Array.isArray(record['argv'])&&record['argv'].some(operand=>typeof operand==='string'&&operand.endsWith('/performance-judge.mjs')));
  expect(judgments).toHaveLength(3);
  for(const record of judgments){if(!Array.isArray(record['argv']))throw new Error('Installed judge argv absent');expect(record['argv'][0]).toBe(process.execPath);}
  return{performance,perfSelection,args};
}

/**
 * Exercise the actual source main at its captured relative entrypoint before source removal.
 * The source checkout differs from the producer's private materialization. Only the separately
 * authenticated installed archive supplies tools and judge bytes; a role flag grants no source identity.
 * This owner covers a real captured committed source root. Dirty working-source provisioning is a separate required owner.
 */
export async function assertSourceTestLevels(supplied:InstalledSelection,sourceRoot:string):Promise<void>{
  cpSync(supplied.archive,join(supplied.installation,'authenticated-puni.tgz'));
  const selected=createTestSelection(supplied,hashBytes(readFileSync(supplied.archive)));
  const admitted=await selectionCore.verifyPuniSelection(selected,hashBytes(selected),supplied.installation);
  // Actual authenticated delivery supplies source import prerequisites before any source module is loaded.
  symlinkSync(join(dirname(admitted.entrypoint),'toolkit/trusted-node-modules'),join(sourceRoot,'node_modules'));
  await assertRequiredSourceSelections(supplied,sourceRoot,selected);
  const transport=(bytes:Uint8Array)=>Buffer.from(JSON.stringify({format:'puni-source-test-level-selection',version:1,
    record:Buffer.from(bytes).toString('base64'),recordSha256:hashBytes(bytes),installationDirectory:supplied.installation,executable:supplied.entrypoint,sourceRoot})).toString('base64');
  const environment={...supplied.environment,PUNI_TEST_LEVEL_ROLE:'source',PUNI_SOURCE_TEST_LEVEL_SELECTION:transport(selected)};
  const sourceMain=join(sourceRoot,'apps/puni/cli/src/entrypoint.ts');
  const selection={...supplied,entrypoint:sourceMain,sourceRoot,environment};
  const{performance,perfSelection,args}=await assertHealthyTestLevels(selection,'source');
  const before=readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'));
  const record=readRecordBytes(selected),workingClaim={kind:'working',base:supplied.revision,identity:'d'.repeat(64)};
  const missingRecord={...record};Reflect.deleteProperty(missingRecord,'sourceSelection');
  for(const [label,corrupt]of [['missing-record-selection',missingRecord],['downgraded-record-source',{...missingRecord,schemaVersion:1}],['wrong-record-source',{...record,sourceSelection:workingClaim}]]as const){
    const bytes=Buffer.from(JSON.stringify(corrupt,null,2)+'\n');
    const refused=await observeInstalledOperation({...perfSelection,environment:{...perfSelection.environment,PUNI_SOURCE_TEST_LEVEL_SELECTION:transport(bytes)}},performance.root,args,label,{settled:false});
    expect(refused.exitCode).not.toBe(0);expect(refused.trace.filter(record=>record['kind']==='spawn')).toEqual([]);
    expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  }
  for(const [label,encoded]of [['missing-source-transport',''],['malformed-source-transport','not/base64!'],['malformed-source-envelope',Buffer.from(JSON.stringify({format:'puni-source-test-level-selection',version:1,sourceRoot})).toString('base64')]]as const){
    const refused=await observeInstalledOperation({...perfSelection,environment:{...perfSelection.environment,PUNI_SOURCE_TEST_LEVEL_SELECTION:encoded}},performance.root,args,label,{settled:false});
    expect(refused.exitCode).not.toBe(0);expect(refused.trace.filter(record=>record['kind']==='spawn')).toEqual([]);
    expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  }
  const claimedInstalled={...perfSelection,entrypoint:supplied.entrypoint};
  const installedFlag=await observeInstalledOperation(claimedInstalled,performance.root,args,'installed-source-flag',{settled:false});
  expect(installedFlag.exitCode).not.toBe(0);expect(installedFlag.trace.filter(record=>record['kind']==='spawn')).toEqual([]);
  expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  const renamed=join(selection.root,'renamed-puni.ts');cpSync(supplied.entrypoint,renamed);
  const renamedFlag=await observeInstalledOperation({...perfSelection,entrypoint:renamed},performance.root,args,'renamed-source-flag',{settled:false});
  expect(renamedFlag.exitCode).not.toBe(0);expect(renamedFlag.trace.filter(record=>record['kind']==='spawn')).toEqual([]);
  expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  const original=readFileSync(sourceMain),mode=statSync(sourceMain).mode&0o777,custody={settled:false};
  let primary:{cause:unknown}|undefined;
  try{
    chmodSync(sourceMain,0o600);writeFileSync(sourceMain,Buffer.concat([original,Buffer.from('\n// controlled source identity mismatch\n')]));
    const changed=await observeInstalledOperation(perfSelection,performance.root,args,'changed-source-entrypoint',custody);
    expect(changed.exitCode).not.toBe(0);
    const preflight=changed.trace.filter(record=>record['kind']==='spawn');
    expect(preflight.length).toBeGreaterThan(0);
    for(const record of preflight){
      if(!Array.isArray(record['argv']))throw new Error('Source preflight argv absent');
      expect(record['argv'][0]).toBe('git');
      if(record['argv'][1]==='--version')expect(record['argv']).toEqual(['git','--version']);
      else{
        expect(record['argv'].slice(1,3)).toEqual(['-C',sourceRoot]);
        expect(['rev-parse','ls-files']).toContain(record['argv'][3]);
      }
    }
    expect(readFileSync(join(performance.root,'tmp/junit/wbs-fe-01.performance.current.json'))).toEqual(before);
  }catch(cause){primary={cause};}
  if(!hasKnownCustody(custody))throw new Error('Changed source owner custody unknown; retain '+selection.root,{cause:primary?.cause});
  try{writeFileSync(sourceMain,original);chmodSync(sourceMain,mode);}catch(cleanup){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'Changed source owner and exact restoration failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
  const restored=await observeInstalledOperation(perfSelection,performance.root,args,'restored-source-performance',{settled:false});
  expect(restored.exitCode,restored.stderr).toBe(0);
  await rm(performance.parent,{recursive:true});
}

function readRecordBytes(bytes:Uint8Array):Record<string,unknown>{
  const decoded:unknown=JSON.parse(Buffer.from(bytes).toString('utf8'));
  if(decoded===null||typeof decoded!=='object'||Array.isArray(decoded))throw new Error('actual selected-source document is not an object');
  // Test-owned artifact inspection checks the fields at their explicit consistency oracle.
  return decoded as Record<string,unknown>;
}

/**
 * Actual installed consistency reader, deliberately below archive admission so another archive
 * mismatch cannot stand in for required field/join refusal. No corruption is granted provenance.
 * Only these test-owned fixture files change, and their original bytes and modes are always restored.
 */
async function assertRequiredSourceSelections(selection:InstalledSelection,sourceRoot:string,recordBytes:Uint8Array):Promise<void>{
  const directory=dirname(selection.entrypoint),profilePath=join(directory,'package-manifest.json'),assetPath=join(directory,'test-level-assets.json');
  const sourcePath=join(directory,'test-level-source.json'),toolkitPath=join(directory,'toolkit/toolkit.json');
  const profileBytes=readFileSync(profilePath),assetBytes=readFileSync(assetPath),profileMode=statSync(profilePath).mode&0o777,assetMode=statSync(assetPath).mode&0o777;
  const profile=readRecordBytes(profileBytes),assets=readRecordBytes(assetBytes),source=readRecordBytes(readFileSync(sourcePath));
  const toolkit=readRecordBytes(readFileSync(toolkitPath)),record=readRecordBytes(recordBytes),sourceSelection=source['sourceSelection'];
  expect(profile).toMatchObject({packageVersion:'0.4.0',sourceRevision:selection.revision,sourceSelection});
  expect(toolkit).toMatchObject({schemaVersion:3,sourceRevision:selection.revision,sourceSelection});
  expect(assets).toMatchObject({sourceRevision:selection.revision,sourceSelection});
  expect(structuredClone(sourceSelection)).toMatchObject({kind:'committed',revision:selection.revision,tree:expect.stringMatching(/^[0-9a-f]{40}$/u)});
  expect(record).toMatchObject({schemaVersion:2,sourceSelection});
  const module=await import(pathToFileURL(join(sourceRoot,'apps/twilight-structure/twilight-burokrat/cli/src/packaging/installed-test-levels.ts')).href);
  const reader:unknown=Reflect.get(module,'readInstalledTestLevelAssets');
  expect(typeof reader).toBe('function');if(typeof reader!=='function')throw new Error('actual installed test-level reader absent');
  const read=()=>Reflect.apply(reader,undefined,[directory]);
  expect(read()).toMatchObject({sourceSelection});
  const missingProfile={...profile};Reflect.deleteProperty(missingProfile,'sourceSelection');
  const missingAssets={...assets};Reflect.deleteProperty(missingAssets,'sourceSelection');
  const mismatched={kind:'working',base:selection.revision,identity:'d'.repeat(64)};
  const mutations=[
    {profile:missingProfile,assets},
    {profile:{...profile,sourceSelection:mismatched},assets},
    {profile:{...profile,testLevelIdentity:hashBytes(Buffer.from(JSON.stringify(missingAssets)))},assets:missingAssets},
    {profile:{...profile,testLevelIdentity:hashBytes(Buffer.from(JSON.stringify({...assets,sourceSelection:mismatched})))},assets:{...assets,sourceSelection:mismatched}},
  ];
  let primary:{cause:unknown}|undefined;
  try{
    for(const mutation of mutations){
      chmodSync(profilePath,0o600);chmodSync(assetPath,0o600);
      writeFileSync(profilePath,JSON.stringify(mutation.profile));writeFileSync(assetPath,JSON.stringify(mutation.assets));
      expect(()=>read()).toThrow();
      writeFileSync(profilePath,profileBytes);writeFileSync(assetPath,assetBytes);
      expect(read()).toMatchObject({sourceSelection});
    }
  }catch(cause){primary={cause};}
  const cleanup:unknown[]=[];
  try{writeFileSync(profilePath,profileBytes);chmodSync(profilePath,profileMode);}catch(cause){cleanup.push(cause);}
  try{writeFileSync(assetPath,assetBytes);chmodSync(assetPath,assetMode);}catch(cause){cleanup.push(cause);}
  if(cleanup.length!==0)throw new AggregateError(primary===undefined?cleanup:[primary.cause,...cleanup],'selected-source corruption and exact restoration failed; retain '+selection.root);
  if(primary!==undefined)throw primary.cause;
  expect(readFileSync(profilePath)).toEqual(profileBytes);expect(readFileSync(assetPath)).toEqual(assetBytes);
}

/** Required new record comes from the actual serializer after real package/profile bytes exist. */
function createTestSelection(selection:InstalledSelection,archiveSha:string):Uint8Array{
  const profile=readRecordBytes(readFileSync(join(dirname(selection.entrypoint),'package-manifest.json')));
  expect(structuredClone(profile)).toMatchObject({packageVersion:'0.4.0',sourceSelection:expect.any(Object)});
  const factory:unknown=Reflect.get(selectionCore,'createSelectedSelectionRecord');
  expect(typeof factory).toBe('function');if(typeof factory!=='function')throw new Error('required selected-source record serializer absent');
  const bytes:unknown=Reflect.apply(factory,undefined,[selection.installation,archiveSha,selection.entrypoint,profile['sourceSelection']]);
  if(!(bytes instanceof Uint8Array))throw new Error('actual selected-source record serializer returned no bytes');
  return Uint8Array.from(bytes);
}
