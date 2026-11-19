import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach,expect,it} from 'bun:test';

interface RootCustody {readonly directory:string;isConfirmed:boolean}
const roots:RootCustody[]=[];
afterEach(()=>{const failures:unknown[]=[];for(const root of roots.splice(0)){if(!root.isConfirmed){failures.push(new Error('test-level root child custody is unknown; retained '+root.directory));continue;}try{rmSync(root.directory,{recursive:true});}catch(cause:unknown){failures.push(cause);}}if(failures.length>0)throw new AggregateError(failures,'test-level root fixture cleanup incomplete');});
function createRoot(prefix:string):RootCustody{const root={directory:mkdtempSync(join(tmpdir(),prefix)),isConfirmed:true};roots.push(root);return root;}
function runOwned(root:RootCustody,argv:readonly string[],cwd:string,environment:Record<string,string>){root.isConfirmed=false;const child=Bun.spawnSync([...argv],{cwd,env:environment,stdin:'ignore',stdout:'pipe',stderr:'pipe',timeout:10000,killSignal:'SIGKILL',maxBuffer:1024*1024});root.isConfirmed=child.signalCode===undefined&&!child.exitedDueToTimeout&&!child.exitedDueToMaxBuffer;return child;}
const mainURL=new URL('./entrypoint.ts',import.meta.url);
const sourceRoot=fileURLToPath(new URL('.',mainURL));
const adapterURL=new URL('packaging/test-levels.ts',mainURL);
const preload=fileURLToPath(new URL('testing/refuse-effects.fixture.ts',mainURL));

for(const namespace of ['dash','d']){
 for(const operation of ['browser','performance'] as const){
  it(namespace+' dispatches owned '+operation+' once with retained inputs and awaited exit completion',()=>{
   const custody=createRoot('puni typed test levels '),root=custody.directory;
   const installation={directory:join(root,'original installation'),entrypoint:join(root,'original installation/puni.mjs')};
   const lookup={directory:join(root,'original lookup'),path:'/usr/bin:/bin'};
   const context={installation,lookup,callerDirectory:join(root,'original caller'),runtime:process.execPath,temporaryDirectory:join(root,'original scratch'),environment:{SENTINEL:'original'}};
   const repository='../candidate with spaces';
   const args=operation==='browser'?[namespace,operation,'portable','--repository',repository]:[namespace,operation,'--repository',repository,'--rule-policy','../independent policy.json'];
   const program=[
    'import{mock}from"bun:test";',
    'const entered=Promise.withResolvers(),gate=Promise.withResolvers();let calls=0,observed;let finished=false;let output="",errors="";',
    'const invoke=kind=>async(request,context)=>{calls++;observed={kind,request,installation:{...context.installation},lookup:{...context.lookup},callerDirectory:context.callerDirectory,runtime:context.runtime,temporaryDirectory:context.temporaryDirectory,environment:{...context.environment}};context.stdout("owned output");context.stderr("owned diagnostic");entered.resolve();await gate.promise;return 37;};',
    'mock.module('+JSON.stringify(adapterURL.href)+',()=>({runInstalledBrowser:invoke("browser"),runInstalledPerformance:invoke("performance")}));',
    'mock.module("@puni/dash/runtime",()=>({executeRequest:()=>{throw new Error("test level entered legacy dispatch");},wallClock:()=>({read:()=>0}),monotonicClock:()=>({now:()=>0})}));',
    'const{main}=await import('+JSON.stringify(mainURL.href)+');',
    'const context='+JSON.stringify(context)+';context.stdout=chunk=>{output+=String(chunk);};context.stderr=chunk=>{errors+=String(chunk);};',
    'process.argv=[process.execPath,"misleading-entry","b","unknown"];process.exitCode=19;let report;',
    'try{const pending=main('+JSON.stringify(args)+',context).then(completion=>{finished=true;return completion;});',
    'context.installation.directory="changed installation";context.installation.entrypoint="changed main";context.lookup.directory="changed lookup";context.lookup.path="changed PATH";context.callerDirectory="changed caller";context.runtime="changed runtime";context.temporaryDirectory="changed scratch";context.environment.SENTINEL="changed";context.stdout=()=>{output+="replacement output";};context.stderr=()=>{errors+="replacement diagnostic";};',
    'const didEnter=await Promise.race([entered.promise.then(()=>true),pending.then(()=>false)]);if(!didEnter){report={entered:false,completion:await pending,calls,output,errors};}else{await Promise.resolve();await Promise.resolve();const finishedBeforeRelease=finished;gate.resolve();report={entered:true,finishedBeforeRelease,completion:await pending,calls,observed,output,errors,globalStatus:process.exitCode};}}finally{gate.resolve();process.exitCode=0;}process.stdout.write(JSON.stringify(report));',
   ].join('\n');
   const child=runOwned(custody,[process.execPath,'--no-env-file','--config=/dev/null','--eval',program],sourceRoot,{PATH:'/usr/bin:/bin'});
   expect(child.exitCode,child.stderr.toString()).toBe(0);
   const observed:unknown=JSON.parse(child.stdout.toString());
   // Initial old grammar refusal is a first feature boundary; forwarding tails count only once this is reached.
   expect(observed).toMatchObject({entered:true});
   expect(observed).toEqual({entered:true,finishedBeforeRelease:false,completion:{kind:'exit',status:37},calls:1,
    observed:{kind:operation,request:operation==='browser'?{command:'browser',mode:'portable',repository}:{command:'performance',repository,rulePolicy:'../independent policy.json'},...context},
    output:'owned output',errors:'owned diagnostic',globalStatus:19});
  },20000);

  it(namespace+' discovers '+operation+' help before any provider effect or asset lookup',()=>{
   const custody=createRoot('puni test level help '),root=custody.directory;mkdirSync(join(root,'caller'));
   const child=runOwned(custody,[process.execPath,'--no-env-file','--config=/dev/null','--preload',preload,fileURLToPath(mainURL),namespace,operation,'--help'],sourceRoot,{});
   expect(child.exitCode,child.stderr.toString()).toBe(0);
   expect(child.stdout.toString()).toContain(operation);
   expect(child.stdout.toString()).toContain('--repository');
   expect(child.stderr.toString()).toBe('');
  },20000);
 }
}
