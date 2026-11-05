import { createHash } from 'node:crypto';
import { readFileSync, writeSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BuildArtifact, BunPlugin } from 'bun';

const writeBuiltArtifact: (destination: string, artifact: BuildArtifact) => Promise<number> =
  Bun.write;
const readBinaryFile: (path: string) => Promise<Buffer> = readFile;

const SUBJECT = '/home/df/.codex/worktrees/681e/puni-00';
const GRAPH_INPUT =
  '/tmp/puni-uc1-identity-r5-controller-r1-preparation-20261102/actual/R1-negative/source-before.ts';
const SOURCE_PATHS = [
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/edge-ownership.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/edge-ownership.test.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/dependency-activation-owner.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/solver-exclusion.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/lock.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/directory-file.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.test.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/namespace-audit.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/source-startup.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/source-database-binding.ts',
  '/home/df/.codex/worktrees/681e/puni-00/libs/wbs/adapters/store-sqlite/src/db.ts',
  '/home/df/.codex/worktrees/681e/puni-00/libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts',
  '/tmp/puni-uc1-identity-r5-controller-r1-preparation-20261102/actual/R1-negative/source-before.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts',
  '/home/df/.codex/worktrees/681e/puni-00/libs/wbs/adapters/store-sqlite/src/migrate.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts',
  '/home/df/.codex/worktrees/681e/puni-00/tools/tool-remote-scripts/src/fixtures/dependency-owner-custody.ts',
];
/** Explicit passthroughs avoid Bun 1.4.4's unbound node_fs in this re-export chain. */
const LEDGER =
  "import * as nativeFS from 'node:fs';\nimport { createHash } from 'node:crypto';\nimport { openDirectoryFile as nativeRelative } from '__DIRECTORY_FILE__';\nexport const {constants,fchmodSync,fstatSync,fsyncSync,ftruncateSync,lstatSync,mkdirSync,readdirSync,readFileSync,realpathSync,statSync,writeSync}=nativeFS;\nconst SETUP_CAPS={\"dependency-participant-restoration.fs.mkdir\":1024,\"dependency-participant-restoration.fs.readFile\":512,\"dependency-participant-restoration.fs.writeFile\":1024,\"dependency-complete-activation.fs.cp\":16,\"dependency-complete-activation.fs.lstat\":512,\"dependency-complete-activation.fs.mkdir\":1024,\"dependency-complete-activation.fs.readdir\":512,\"dependency-complete-activation.fs.readFile\":512,\"dependency-complete-activation.fs.rename\":32,\"dependency-complete-activation.fs.stat\":512,\"dependency-complete-activation.fs.writeFile\":1024,\"dependency-complete-activation.Bun.write.0\":1,\"dependency-complete-activation.Bun.write.1\":1,\"dependency-complete-activation.runMigrations.prod\":1,\"dependency-complete-activation.runMigrations.dev\":1,\"source-startup.fs.chmod\":4096,\"source-startup.fs.cp\":16,\"source-startup.fs.lstat\":512,\"source-startup.fs.mkdir\":1024,\"source-startup.fs.mkdtemp\":16,\"source-startup.fs.readdir\":512,\"source-startup.fs.symlink\":64,\"source-startup.fs.writeFile\":1024,\"source-database-binding.fs.chmod\":4096,\"source-database-binding.fs.cp\":16,\"source-database-binding.fs.mkdir\":1024,\"source-database-binding.fs.mkdtemp\":16,\"source-database-binding.fs.writeFile\":1024,\"source-frontend-profile.fs.mkdir\":1024,\"source-frontend-profile.fs.readFile\":512,\"source-frontend-profile.fs.symlink\":64,\"source-frontend-profile.fs.writeFile\":1024,\"namespace-audit.fs.chmod\":4096,\"namespace-audit.fs.link\":32,\"namespace-audit.fs.mkdir\":1024,\"namespace-audit.fs.mkdtemp\":16,\"namespace-audit.fs.rename\":32,\"namespace-audit.fs.rm\":32,\"namespace-audit.fs.stat\":512,\"namespace-audit.fs.symlink\":64,\"namespace-audit.Bun.write.0\":32,\"namespace-audit.Bun.write.1\":32,\"namespace-audit.Bun.write.2\":32,\"namespace-audit.Bun.write.3\":32,\"namespace-audit.Bun.write.4\":32};\nconst LIMITS={resources:512,streams:32,connections:64,children:32,git:8,namespace:16,emitter:2,collector:6,contender:2,bytes:33554432,timers:16};\nexport const custody={resources:[],streams:[],connections:[],children:[],childOriginals:new WeakMap(),timers:[],failures:[],generation:0,graph:false,fault:undefined,graphFailure:undefined,classified:false,fixtureKeeper:undefined,allocationStart:undefined,allocationEnd:undefined,lastTick:undefined,clockOperations:[],setupOperations:[],workDeadline:undefined,waits:[],owner:undefined,expectedLocks:undefined,lockFrame:undefined,totalBytes:0,stopped:false,operation:'not-started',injection:undefined};\nconst nativeOpen=nativeFS.openSync,nativeClose=nativeFS.closeSync,nativeRead=nativeFS.readSync,nativeFstat=nativeFS.fstatSync,nativeDirectory=nativeFS.opendirSync,nativeSpawn=Bun.spawn.bind(Bun),nativeWrite=nativeFS.writeFileSync,nativeClockRead=nativeFS.readFileSync,nativeBunWrite=Bun.write;\nconst nativeSetInterval=setInterval,nativeClearInterval=clearInterval,nativeSetTimeout=setTimeout,nativeClearTimeout=clearTimeout;\nexport function holdFixture(cause){\n  custody.failures.push(cause);custody.stopped=true;\n  if(custody.fixtureKeeper===undefined)custody.fixtureKeeper=nativeSetInterval(()=>custody,30000);\n  if(!custody.reported){custody.reported=true;try{process.stderr.write('UC2 fixture STOP: original outcomes incomplete\\n');}catch(diagnostic){custody.failures.push(diagnostic);}}\n  return new Promise(()=>undefined);\n}\nexport function startFixture(){if(custody.fixtureKeeper!==undefined)throw Error('fixture started twice');custody.fixtureKeeper=nativeSetInterval(()=>custody,30000);}\nfunction readKernelTick(){\n  if(process.platform!=='linux'||custody.clockOperations.length>=32768){holdFixture(Error('fixed kernel clock unavailable or capped'));throw Error('fixed kernel clock refused');}\n  const original={label:'kernel.uptime',state:'entered',returned:undefined,cause:undefined};custody.clockOperations.push(original);\n  let bytes;try{bytes=nativeClockRead('/proc/uptime');original.returned=bytes;original.state='returned';}catch(cause){original.state='threw';original.cause=cause;holdFixture(cause);throw cause;}\n  if(bytes.length>128)throwClock('kernel uptime record oversized');\n  const text=bytes.toString('latin1');\n  const fields=/^([0-9]{1,20})\\.([0-9]{2}) ([0-9]{1,20})\\.([0-9]{2})\\n$/.exec(text);\n  if(fields===null||fields[0]!==text)throwClock('kernel uptime record malformed');\n  const tick=BigInt(fields[1])*100n+BigInt(fields[2]);\n  if(custody.lastTick!==undefined&&tick<custody.lastTick)throwClock('kernel uptime moved backward');\n  custody.lastTick=tick;original.tick=tick;\n  return tick;\n}\nfunction throwClock(message){const cause=new Error(message);holdFixture(cause);throw cause;}\nfunction ticks(text){if(typeof text!=='string')throwClock('original centisecond allocation invalid');const matched=/^[0-9]{1,24}$/.exec(text);if(matched===null||matched[0]!==text)throwClock('original centisecond allocation invalid');return BigInt(text);}\nexport function configureAllocation(startText,endText,lowerText){\n  if(custody.allocationEnd!==undefined)throwClock('original allocation configured twice');\n  const start=ticks(startText),end=ticks(endText),lower=ticks(lowerText);\n  if(end!==start+18000n||lower<start||lower>=end)throwClock('original centisecond span or inherited bound differs');\n  custody.allocationStart=start;custody.allocationEnd=end;custody.lastTick=lower;\n  const local=performance.now();const tick=readKernelTick();\n  if(tick<start||tick>=end)throwClock('original allocation expired before fixture work');\n  const remaining=(end-tick-1n)*10n;\n  if(remaining<=0n)throwClock('original conservative local deadline exhausted');\n  custody.workDeadline=local+Number(remaining);\n  return custody.workDeadline;\n}\nfunction admit(bucket,maximum){\n  if(custody.stopped||custody.allocationEnd===undefined||bucket.length>=maximum){holdFixture(Error('fixture start closed or capped'));throw Error('fixture acquisition refused before native entry');}\n  const tick=readKernelTick();\n  if(tick<custody.allocationStart||tick>=custody.allocationEnd||bucket.length>=maximum){holdFixture(Error('original kernel allocation exhausted'));throw Error('fixture acquisition refused before native entry');}\n}\nexport function invokeSetupOperation(label,original,receiver,args,kind){\n  if(!Object.hasOwn(SETUP_CAPS,label))throwClock('unrecognized fixed setup operation');\n  admit(custody.setupOperations,8192);\n  if(custody.setupOperations.filter(operation=>operation.label===label).length>=SETUP_CAPS[label])throwClock('fixed setup operation cap exceeded');\n  const operation={label,kind,original,receiver,args,modeledRejection:false,state:'entered',returned:undefined,promise:undefined,observer:undefined,observerSettled:false,joined:false,cause:undefined};custody.setupOperations.push(operation);\n  try{\n    const returned=original.apply(receiver,args);operation.returned=returned;\n    if(kind==='promise'){\n      if(!(returned instanceof Promise))throw Error('fixed setup API did not return its Promise');\n      operation.promise=returned;operation.state='pending';\n      operation.observer=returned.then(value=>{operation.state='fulfilled';operation.value=value;operation.observerSettled=true;},cause=>{operation.state='rejected';operation.cause=cause;try{operation.modeledRejection=isModeledAbsence(label,args,cause);}catch(classificationFailure){operation.classificationFailure=classificationFailure;}operation.observerSettled=true;if(!operation.modeledRejection)custody.stopped=true;});\n    }else operation.state='returned';\n    return returned;\n  }catch(cause){operation.state='threw';operation.cause=cause;holdFixture(cause);throw cause;}\n}\nfunction isModeledAbsence(label,args,cause){\n  if(!(cause instanceof Error)||Object.getOwnPropertyDescriptor(cause,'code')?.value!=='ENOENT'||typeof args[0]!=='string')return false;\n  return label==='dependency-complete-activation.fs.lstat'&&['-wal','-shm','-journal'].some(suffix=>args[0].endsWith(suffix))\n    ||label==='dependency-complete-activation.fs.stat'&&/^\\/proc\\/self\\/fd\\/[0-9]+$/.test(args[0]);\n}\nfunction knownSetupOperation(operation){return operation.state==='returned'||operation.joined&&operation.observerSettled&&(operation.state==='fulfilled'||operation.state==='rejected'&&operation.modeledRejection);}\nexport const writeSetup=(label,...args)=>invokeSetupOperation(label,nativeBunWrite,Bun,args,'promise');\nexport async function joinSetupOperations(){\n  for(const operation of custody.setupOperations){\n    if(operation.promise!==undefined){await Promise.allSettled([operation.promise,operation.observer]);operation.joined=true;}\n    if(!knownSetupOperation(operation))return await holdFixture(Error('original setup operation not known successful'));\n  }\n  if(custody.stopped)return await holdFixture(Error('original setup or clock outcome stopped'));\n}\nfunction identity(original){\n  try{const observed=nativeFstat(original.descriptor,{bigint:true});original.identity={device:observed.dev,inode:observed.ino};return observed;}\n  catch(cause){original.identity=undefined;holdFixture(cause);throw cause;}\n}\nfunction enroll(descriptor,origin){\n  const original={generation:++custody.generation,descriptor,origin,path:undefined,identity:undefined,attempts:0,entries:0,native:'not-entered',fault:undefined};\n  custody.resources.push(original);\n  identity(original);\n  return original;\n}\nfunction originalFD(descriptor){const original=custody.resources.findLast(record=>record.descriptor===descriptor&&record.native!=='returned');if(!original){holdFixture(Error('original acquisition missing'));throw Error('original acquisition missing');}return original;}\nexport function acquireFD(origin,...args){admit(custody.resources,LIMITS.resources);const descriptor=nativeOpen(...args);const original=enroll(descriptor,origin);original.path=String(args[0]);return descriptor;}\nexport function acquireRelative(...args){admit(custody.resources,LIMITS.resources);const descriptor=nativeRelative(...args);enroll(descriptor,'graph-relative');return descriptor;}\nfunction enter(original,close,origin){\n  if(original.native!=='not-entered'){holdFixture(Error('native re-entry refused'));throw Error('native re-entry refused');}\n  original.native='entered';original.entries++;original.closeOrigin=origin;\n  try{close();original.native='returned';}catch(cause){original.native='unknown';holdFixture(cause);throw cause;}\n}\nexport function closeSync(descriptor){\n  const original=originalFD(descriptor);original.attempts++;\n  if(original.fault==='before')throw custody.injection;\n  enter(original,()=>nativeClose(descriptor),'production');\n  if(original.fault==='after')throw custody.injection;\n}\nfunction captureLockFrame(){\n  if(custody.owner===undefined||!Array.isArray(custody.expectedLocks)||custody.expectedLocks.length!==6||new Set(custody.expectedLocks).size!==6){holdFixture(Error('original owner frame absent'));throw Error('original owner frame absent');}\n  const frame={owner:custody.owner,paths:[...custody.expectedLocks],originals:[]};custody.lockFrame=frame;\n  for(const path of frame.paths){\n    const matches=custody.resources.filter(original=>original.origin==='lock'&&original.path===path&&original.native!=='returned');\n    if(matches.length!==1){holdFixture(Error('original lock frame is not unique'));throw Error('original lock frame is not unique');}\n    const original=matches[0];frame.originals.push(original);\n    if(original.native!=='not-entered'||original.entries!==0||original.attempts!==0||original.identity===undefined){holdFixture(Error('original lock close entered before fault'));throw Error('original lock frame invalid');}\n    let current;try{current=nativeFstat(original.descriptor,{bigint:true});}catch(cause){holdFixture(cause);throw cause;}\n    if(current.dev!==original.identity.device||current.ino!==original.identity.inode){holdFixture(Error('original lock identity changed before fault'));throw Error('original lock identity changed before fault');}\n  }\n}\nexport function readSync(descriptor,...args){\n  if(custody.graph&&custody.fault===undefined){\n    if(custody.children.some(child=>!child.known)){holdFixture(Error('fault armed before children joined'));throw Error('fault arming refused');}\n    if(custody.setupOperations.some(operation=>!knownSetupOperation(operation))){holdFixture(Error('graph fault preceded original setup joins'));throw Error('graph fault arming refused');}\n    captureLockFrame();\n    const original=originalFD(descriptor);custody.fault=original;\n    original.fault=custody.variant==='healthy'?undefined:custody.variant;\n    custody.injection=new Error('PRIVATE_UC2_ORIGINAL_CLOSE');\n    custody.faultEvent();throw custody.primary;\n  }\n  return nativeRead(descriptor,...args);\n}\nexport function opendirSync(...args){\n  admit(custody.streams,LIMITS.streams);const directory=nativeDirectory(...args);\n  const original={generation:++custody.generation,directory,close:undefined,attempts:0,entries:0,native:'not-entered'};custody.streams.push(original);\n  try{original.close=directory.closeSync.bind(directory);directory.closeSync=()=>{original.attempts++;enter(original,original.close,'production');};}\n  catch(cause){holdFixture(cause);throw cause;}\n  return directory;\n}\nexport function acquireConnection(acquire,args,kind){\n  admit(custody.connections,LIMITS.connections);\n  const connection=acquire(...args);\n  const original={generation:++custody.generation,connection,kind,close:undefined,attempts:0,entries:0,native:'not-entered'};custody.connections.push(original);\n  try{original.close=connection.close.bind(connection);connection.close=(...args)=>{original.attempts++;return enter(original,()=>original.close(...args),'production');};}\n  catch(cause){holdFixture(cause);throw cause;}\n  return connection;\n}\nfunction admitChild(kind){\n  admit(custody.children,LIMITS.children+LIMITS.contender);\n  if(!Object.hasOwn(LIMITS,kind)||custody.children.filter(original=>original.kind===kind).length>=LIMITS[kind]){holdFixture(Error('fixture child-family cap exceeded'));throw Error('child-family acquisition refused');}\n}\nexport function acquireOwnedChild(argv,options,kind){admitChild(kind);return spawnAdmittedChild(argv,options,kind);}\nexport function acquireContender(bundle,paths){\n  admitChild('contender');\n  const argv=[process.execPath,'run',bundle,JSON.stringify(paths),String(custody.allocationStart),String(custody.allocationEnd),String(custody.lastTick)];\n  return spawnAdmittedChild(argv,{stdin:'ignore',stdout:'pipe',stderr:'pipe'},'contender');\n}\nfunction spawnAdmittedChild(argv,options,kind){\n  const child=nativeSpawn(argv,options);\n  const original={generation:++custody.generation,child,argv,options,kind,stdout:undefined,stderr:undefined,exit:undefined,known:false};custody.children.push(original);custody.childOriginals.set(child,original);\n  try{child.ref();original.exit=child.exited;original.stdout=drain(child.stdout,original,'stdout');original.stderr=drain(child.stderr,original,'stderr');}\n  catch(cause){holdFixture(cause);throw cause;}\n  return child;\n}\nfunction drain(stream,child,kind){\n  const pipe={stream,reader:undefined,closedPromise:undefined,closedObserver:undefined,closedState:'pending',closedCause:undefined,pump:undefined,complete:false,closed:false,count:0,chunks:[],hash:createHash('sha256')};child[kind+'Record']=pipe;\n  try{\n    pipe.reader=stream.getReader();pipe.closedPromise=pipe.reader.closed;\n    pipe.closedObserver=pipe.closedPromise.then(()=>{pipe.closedState='fulfilled';},cause=>{pipe.closedState='rejected';pipe.closedCause=cause;custody.stopped=true;});\n  }catch(cause){holdFixture(cause);throw cause;}\n  pipe.pump=(async()=>{try{\n    for(;;){const chunk=await pipe.reader.read();if(chunk.done){pipe.complete=true;break;}pipe.count+=chunk.value.byteLength;custody.totalBytes+=chunk.value.byteLength;pipe.hash.update(chunk.value);if(pipe.count>LIMITS.bytes||custody.totalBytes>LIMITS.bytes){holdFixture(Error('original child output cap exceeded'));}else pipe.chunks.push(chunk.value);}\n    await pipe.closedPromise;await pipe.closedObserver;\n    if(pipe.closedState!=='fulfilled')return await holdFixture(Error('original closed promise not fulfilled'));\n    pipe.closed=true;\n    if(custody.stopped)return await holdFixture(Error('child drain stopped'));\n    return Buffer.concat(pipe.chunks);\n  }catch(cause){return await holdFixture(cause);}})();\n  return pipe.pump;\n}\nexport async function readOwnedTuple(child){\n  const original=custody.childOriginals.get(child);\n  if(original===undefined)return await holdFixture(Error('original child association absent'));\n  try{const [stdout,stderr,code]=await Promise.all([original.stdout,original.stderr,original.exit]);\n    if(!original.stdoutRecord.complete||!original.stderrRecord.complete||!original.stdoutRecord.closed||!original.stderrRecord.closed)return await holdFixture(Error('original readers incomplete'));\n    original.known=true;original.code=code;original.stdoutSHA256=original.stdoutRecord.hash.digest('hex');original.stderrSHA256=original.stderrRecord.hash.digest('hex');\n    original.stdoutRecord.reader.releaseLock();original.stderrRecord.reader.releaseLock();\n    if(custody.outputRoot!==undefined){nativeWrite(custody.outputRoot+'/child-'+original.generation+'.stdout.log',stdout);nativeWrite(custody.outputRoot+'/child-'+original.generation+'.stderr.log',stderr);}\n    const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);\n    return [decode(stdout),decode(stderr),code];\n  }catch(cause){if(original.known)throw cause;return await holdFixture(cause);}\n}\nexport async function readOwnedChild(child,deadline){\n  if(deadline!==undefined&&performance.now()>=deadline)return await holdFixture(Error('original collector deadline exceeded'));\n  const [stdout,stderr,code]=await readOwnedTuple(child);\n  if(code!==0||stderr!=='')throw Error('owned collector failed after known join');\n  return stdout;\n}\nexport function productionInterval(callback,delay,...args){admit(custody.timers,LIMITS.timers);const timer={kind:'interval',callback,reference:undefined,cleared:false};custody.timers.push(timer);timer.reference=nativeSetInterval(callback,delay,...args);return timer.reference;}\nexport function productionTimeout(callback,delay,...args){admit(custody.timers,LIMITS.timers);const timer={kind:'timeout',callback,reference:undefined,cleared:false};custody.timers.push(timer);timer.reference=nativeSetTimeout(callback,delay,...args);return timer.reference;}\nexport async function retireTerminalFixture(){\n  // This RED epoch admits only terminal current-production operations. Genuine parked HOLD requires the reviewed capsule source epoch.\n  await Promise.all(custody.waits.map(wait=>wait.settlement));\n  if(custody.waits.some(wait=>!wait.settled))return await holdFixture(Error('original fixture wait unsettled'));\n  if(custody.operation!=='terminal'||custody.children.some(child=>!child.known)||custody.stopped)return await holdFixture(Error('terminal quiescence or original joins unproved'));\n  if(custody.operationSettlement!==undefined)await custody.operationSettlement;\n  await joinSetupOperations();\n  for(const original of [...custody.streams,...custody.connections,...custody.resources.filter(record=>record.origin!=='lock')])retire(original);\n  if(custody.stopped)return await holdFixture(Error('non-lock retirement unknown'));\n  for(const original of custody.resources.filter(record=>record.origin==='lock'))retire(original);\n  if(custody.stopped)return await holdFixture(Error('lock retirement unknown'));\n  if(custody.timers.length!==0)return await holdFixture(Error('RED epoch has unreviewed production timer handles'));\n  if([...custody.streams,...custody.connections,...custody.resources].some(original=>original.native!=='returned'||original.entries!==1))return await holdFixture(Error('fixture original final outcome missing'));\n  nativeClearInterval(custody.fixtureKeeper);custody.fixtureKeeper=undefined;\n  return {resources:custody.resources.length,streams:custody.streams.length,connections:custody.connections.length,children:custody.children.length,setupOperations:custody.setupOperations.length,clockOperations:custody.clockOperations.length,known:true};\n}\nfunction retire(original){\n  if(original.native==='returned')return;\n  if(original.native!=='not-entered'){holdFixture(Error('fixture refuses native retry'));return;}\n  if(original.connection){if(typeof original.close!=='function'){holdFixture(Error('original connection close missing'));return;}try{enter(original,original.close,'fixture');}catch(cause){custody.failures.push(cause);}return;}\n  if(original.directory){if(typeof original.close!=='function'){holdFixture(Error('original Dir close missing'));return;}try{enter(original,original.close,'fixture');}catch(cause){custody.failures.push(cause);}return;}\n  if(!original.identity){holdFixture(Error('original identity missing'));return;}\n  let current;try{current=nativeFstat(original.descriptor,{bigint:true});}catch(cause){holdFixture(cause);return;}\n  if(current.dev!==original.identity.device||current.ino!==original.identity.inode){holdFixture(Error('original identity changed'));return;}\n  try{enter(original,()=>nativeClose(original.descriptor),'fixture');}catch(cause){custody.failures.push(cause);}\n}\nexport function wait(ms){\n  admit(custody.waits,8);\n  const original={reference:undefined,settlement:undefined,settled:false};custody.waits.push(original);\n  try{original.settlement=new Promise(resolve=>{original.reference=nativeSetTimeout(()=>{original.settled=true;resolve();},ms);});}\n  catch(cause){holdFixture(cause);throw cause;}\n  return original.settlement;\n}\n";
const ENTRY =
  "import { custody, startFixture, holdFixture, retireTerminalFixture, acquireContender, readOwnedTuple, wait, configureAllocation, joinSetupOperations } from '__LEDGER__';\nimport { participantActivationFixture } from '__PARTICIPANT__';\nimport { withDependencyOwner } from '__OWNER__';\nimport { prepareInitialDependencyHandoffUnderOwner } from '__COMPLETE__';\nimport { openReadOnlyConnection } from '__DB__';\nimport { inspectDependencyActivation } from '__ACTIVATION__';\nstartFixture();\ntry {\nconst deadline=configureAllocation(process.argv[2],process.argv[3],process.argv[4]);\ncustody.outputRoot=__OUTPUT_ROOT__;\ncustody.variant=__VARIANT__;\ncustody.primary=new Error('PRIVATE_UC2_ORIGINAL_READ');\nlet reached;const faultEvent=new Promise(resolve=>{reached=resolve;});custody.faultEvent=reached;\nconst fixture=await participantActivationFixture(['prod']);\nawait joinSetupOperations();\nprocess.env.WBS_EDGE_STATE=fixture.root;\nlet terminalFailure;\ncustody.operation='running';\nconst originalOperation=withDependencyOwner(fixture.request.owner,owner=>{\n  custody.owner=owner;\n  custody.expectedLocks=[fixture.root+'/edge.lock',fixture.layouts.dev.stateDir+'/poll.lock',fixture.layouts.dev.stateDir+'/devsync.lock',fixture.layouts.prod.stateDir+'/deploy.lock',fixture.layouts.dev.stateDir+'/deploy.lock',fixture.root+'/solver-runtime.lock'];\n  return prepareInitialDependencyHandoffUnderOwner(owner,fixture.request,fixture.layouts,deadline,fixture.root,fixture.ports);\n},fixture.root);\ncustody.originalOperation=originalOperation;\nconst terminal=originalOperation.then(()=>{custody.operation='terminal';},cause=>{terminalFailure=cause;custody.operation='terminal';if(custody.fault===undefined)void holdFixture(cause);});\ncustody.operationSettlement=terminal;\nawait faultEvent;\n// One observation point, never a polling/retry loop or an abandonment deadline.\nawait wait(250);\nif(custody.operation!=='terminal')await holdFixture(Error('current RED epoch lacks reviewed parked-HOLD quiescence'));\nawait terminal;\nif(!(terminalFailure instanceof Error))await holdFixture(Error('constructor path unexpectedly succeeded with unreviewed obligations'));\nif(custody.lockFrame===undefined||custody.lockFrame.owner!==custody.owner||custody.lockFrame.originals.length!==6)await holdFixture(Error('actual owner and six original lock frame missing'));\nconst locks=custody.lockFrame.paths;\nasync function sample(){\n  const child=acquireContender(__CONTENDER_EXPRESSION__,locks);\n  const [stdout,stderr,code]=await readOwnedTuple(child);\n  if(code!==0||stderr!=='')return await holdFixture(Error('original contender failed'));\n  const decoded=JSON.parse(stdout);\n  if(!Array.isArray(decoded)||decoded.length!==locks.length||decoded.some((entry,index)=>entry.path!==locks[index]||typeof entry.acquired!=='boolean'||entry.known!==true))return await holdFixture(Error('original contender report invalid'));\n  return decoded;\n}\nconst beforeWindow=custody.resources.map(original=>[original.generation,original.attempts,original.entries]);\nconst first=await sample();const firstJoined=performance.now();await wait(250);const second=await sample();\nconst afterWindow=custody.resources.filter(original=>original.origin!=='contender').map(original=>[original.generation,original.attempts,original.entries]);\nconst stores=[fixture.prodPath,fixture.devPath].map(path=>{const connection=openReadOnlyConnection(path);try{return inspectDependencyActivation(connection.db);}finally{connection.close();}});\nfunction includesOriginal(cause,original,seen=new Set()){if(cause===original)return true;if(!(cause instanceof Error)||seen.has(cause))return false;seen.add(cause);return includesOriginal(cause.cause,original,seen)||(cause instanceof AggregateError&&cause.errors.some(failure=>includesOriginal(failure,original,seen)));}\nlet oracle='';const failedOracles=[];\nfunction check(condition,label){if(!condition){failedOracles.push(label);if(oracle==='')oracle=label;}}\ncheck(performance.now()-firstJoined>=250,'UC2_OBSERVATION_WINDOW_SHORT');\ncheck(JSON.stringify(beforeWindow)===JSON.stringify(afterWindow),'UC2_ADDITIONAL_PRODUCTION_CLOSE_DURING_WINDOW');\ncheck(custody.fault!==undefined,'UC2_CONSTRUCTOR_ORIGINAL_FAULT_MISSING');\ncheck(custody.fault.attempts===1,'UC2_ORIGINAL_GRAPH_CLOSE_ATTEMPT_DIFFERS');\ncheck(custody.fault.entries===(custody.variant==='before'?0:1),'UC2_ORIGINAL_NATIVE_ENTRY_DIFFERS');\ncheck(includesOriginal(custody.graphFailure,custody.primary),'UC2_ORIGINAL_PRIMARY_ATTRIBUTION_MISSING');\nif(custody.variant!=='healthy')check(includesOriginal(custody.graphFailure,custody.injection),'UC2_ORIGINAL_CLOSE_ATTRIBUTION_MISSING');\ncheck(custody.classified===(custody.variant!=='healthy'),'UC2_GENUINE_GRAPH_CLASSIFICATION_DIFFERS');\ncheck(stores.every(store=>store.state==='DISABLED'&&store.receipt===null),'UC2_PRE_DML_PREFIX_DIFFERS');\ncheck(terminalFailure instanceof Error&&terminalFailure.cause===undefined&&!terminalFailure.message.includes('PRIVATE_'),'UC2_OUTWARD_FAILURE_UNSAFE');\nif(custody.variant==='healthy'){\n  check(custody.operation==='terminal','UC2_KNOWN_REFUSAL_DID_NOT_SETTLE');\n  check(custody.lockFrame.originals.every(original=>original.native==='returned'&&original.entries===1),'UC2_KNOWN_REFUSAL_ORIGINAL_LOCK_NOT_CLOSED');\n  check(first.every(entry=>entry.acquired)&&second.every(entry=>entry.acquired),'UC2_KNOWN_REFUSAL_LOCK_NOT_RELEASED');\n}else{\n  check(custody.operation!=='terminal','UC2_ORIGINAL_OPERATION_UNWOUND_AFTER_UNKNOWN');\n  check(custody.lockFrame.originals.every(original=>original.native==='not-entered'&&original.entries===0&&original.attempts===0),'UC2_CAPTURED_ORIGINAL_LOCK_ENTERED_CLOSE');\n  check(first.every(entry=>!entry.acquired)&&second.every(entry=>!entry.acquired),'UC2_ORIGINAL_RUNTIME_OR_OUTER_LOCK_RELEASED');\n  check(custody.timers.some(timer=>timer.kind==='interval'&&!timer.cleared),'UC2_PRODUCTION_KEEPER_MISSING');\n}\nconst retired=await retireTerminalFixture();\nconsole.log('UC2_KNOWN:'+JSON.stringify({variant:custody.variant,pass:oracle==='',oracle,failedOracles,lockFrame:custody.lockFrame.originals.map(original=>({generation:original.generation,descriptor:original.descriptor,path:original.path,identity:{device:String(original.identity.device),inode:String(original.identity.inode)},attempts:original.attempts,entries:original.entries,native:original.native})),setupOperations:custody.setupOperations.map(operation=>({label:operation.label,kind:operation.kind,state:operation.state,modeledRejection:operation.modeledRejection,joined:operation.joined})),clockTicks:custody.clockOperations.map(operation=>({state:operation.state,tick:operation.tick===undefined?null:String(operation.tick)})),fixtureWaits:custody.waits.map(wait=>({settled:wait.settled})),retired,classified:custody.classified,first,second,resources:custody.resources.map(original=>({generation:original.generation,descriptor:original.descriptor,identity:original.identity===undefined?null:{device:String(original.identity.device),inode:String(original.identity.inode)},origin:original.origin,attempts:original.attempts,entries:original.entries,native:original.native,closeOrigin:original.closeOrigin})),children:custody.children.map(original=>({generation:original.generation,kind:original.kind,stdoutEOF:original.stdoutRecord.complete,stderrEOF:original.stderrRecord.complete,stdoutReaderClosed:original.stdoutRecord.closed,stderrReaderClosed:original.stderrRecord.closed,code:original.code,known:original.known,stdoutSHA256:original.stdoutSHA256,stderrSHA256:original.stderrSHA256}))}));\n\n} catch (cause) { await holdFixture(cause); }\n";
const CONTENDER =
  "import { withExistingCanonicalLock } from '__LOCK__';\nimport { custody, holdFixture, startFixture, configureAllocation, retireTerminalFixture } from '__LEDGER__';\nstartFixture();\ntry {\nconfigureAllocation(process.argv[3],process.argv[4],process.argv[5]);\nconst paths=JSON.parse(process.argv[2]);\nif(!Array.isArray(paths)||paths.length!==6||paths.some(path=>typeof path!=='string'))throw Error('contender roster differs');\nconst observed=[];\nfor(const path of paths){\n  let acquired=false;\n  try{await withExistingCanonicalLock(path,async()=>{acquired=true;});}\n  catch(cause){if(!(cause instanceof Error)||!cause.message.startsWith('existing canonical lock held:'))throw cause;}\n  observed.push({path,acquired,known:true});\n}\nif(custody.resources.length!==6||custody.resources.some(original=>original.native!=='returned'||original.entries!==1))await holdFixture(Error('contender originals not known closed'));\nawait new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(observed)+'\\n',cause=>cause?reject(cause):resolve()));\ncustody.operation='terminal';\nawait retireTerminalFixture();\n\n} catch (cause) { await holdFixture(cause); }\n";
const CHILD_MAPS = [
  {
    filename: 'source-startup.ts',
    kind: 'git',
    replacements: [
      {
        before: "import { createHash } from 'node:crypto';\n",
        after:
          "import { acquireOwnedChild, readOwnedTuple } from '__LEDGER__';\nimport { createHash } from 'node:crypto';\n",
      },
      {
        before:
          "const child = Bun.spawn(['git', '--no-optional-locks', '-C', root, ...args], {\n    stdout: 'pipe',\n    stderr: 'pipe',\n    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },\n  });\n  ",
        after:
          "const child = acquireOwnedChild(['git', '--no-optional-locks', '-C', root, ...args], {\n    stdout: 'pipe',\n    stderr: 'pipe',\n    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },\n  }, 'git');\n  ",
      },
      {
        before:
          'const [stdout, stderr, code] = await Promise.all([\n    new Response(child.stdout).text(),\n    new Response(child.stderr).text(),\n    child.exited,\n  ]);',
        after: 'const [stdout, stderr, code] = await readOwnedTuple(child);',
      },
    ],
  },
  {
    filename: 'namespace-audit.ts',
    kind: 'namespace',
    replacements: [
      {
        before:
          "import { chmod, link, mkdir, mkdtemp, rename, rm, stat, symlink } from 'node:fs/promises';\n",
        after:
          "import { acquireOwnedChild, readOwnedTuple } from '__LEDGER__';\nimport { chmod, link, mkdir, mkdtemp, rename, rm, stat, symlink } from 'node:fs/promises';\n",
      },
      {
        before:
          "const child = Bun.spawn(\n      [\n        ...credentials,\n        '/usr/bin/busybox',\n        'sh',\n        '-c',\n        emitted,\n        '--',\n        nonce,\n        ...argumentsForProgram,\n      ],\n      { stdout: 'pipe', stderr: 'pipe' },\n    );\n    ",
        after:
          "const child = acquireOwnedChild(\n      [\n        ...credentials,\n        '/usr/bin/busybox',\n        'sh',\n        '-c',\n        emitted,\n        '--',\n        nonce,\n        ...argumentsForProgram,\n      ],\n      { stdout: 'pipe', stderr: 'pipe' },\n      'namespace',\n    );\n    ",
      },
      {
        before:
          'const [stdout, stderr, code] = await Promise.all([\n      new Response(child.stdout).text(),\n      new Response(child.stderr).text(),\n      child.exited,\n    ]);',
        after: 'const [stdout, stderr, code] = await readOwnedTuple(child);',
      },
    ],
  },
  {
    filename: 'dependency-participant-restoration.ts',
    kind: 'emitter',
    replacements: [
      {
        before: "import { mkdir, readFile, writeFile } from 'node:fs/promises';\n",
        after:
          "import { acquireOwnedChild, readOwnedTuple } from '__LEDGER__';\nimport { mkdir, readFile, writeFile } from 'node:fs/promises';\n",
      },
      {
        before:
          "const child = Bun.spawn(\n        [\n          process.execPath,\n          '--no-env-file',\n          'run',\n          'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',\n        ],\n        {\n          cwd: fixture.sourceRoot,\n          env: { PATH: process.env['PATH'], BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },\n          stdout: 'pipe',\n          stderr: 'pipe',\n        },\n      );\n",
        after:
          "const child = acquireOwnedChild(\n        [\n          process.execPath,\n          '--no-env-file',\n          'run',\n          'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',\n        ],\n        {\n          cwd: fixture.sourceRoot,\n          env: { PATH: process.env['PATH'], BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },\n          stdout: 'pipe',\n          stderr: 'pipe',\n        },\n        'emitter',\n      );\n",
      },
      {
        before:
          "      const cancel = () => {\n        child.kill('SIGKILL');\n      };\n      signal?.addEventListener('abort', cancel, { once: true });\n      try {\n        const [stdout, stderr, code] = await Promise.all([\n          new Response(child.stdout).text(),\n          new Response(child.stderr).text(),\n          child.exited,\n        ]);\n        if (code !== 0 || stderr !== '') throw new Error('native fixture source emitter failed');\n        return stdout;\n      } finally {\n        signal?.removeEventListener('abort', cancel);\n      }\n",
        after:
          "      const [stdout, stderr, code] = await readOwnedTuple(child);\n      if (code !== 0 || stderr !== '') throw new Error('native fixture source emitter failed');\n      return stdout;\n",
      },
    ],
  },
  {
    filename: 'dependency-complete-activation.ts',
    kind: 'collector',
    replacements: [
      {
        before: "import { readAuthorityCollector } from '../lib/installed-authority-transport';",
        after:
          "import { readOwnedChild as readAuthorityCollector, acquireOwnedChild } from '__LEDGER__';",
      },
      {
        before:
          "Bun.spawn(['/usr/bin/python3', '-I', '-'], {\n        stdin: new TextEncoder().encode(program),\n        stdout: 'pipe',\n        stderr: 'pipe',\n      }),\n",
        after:
          "acquireOwnedChild(['/usr/bin/python3', '-I', '-'], {\n        stdin: new TextEncoder().encode(program),\n        stdout: 'pipe',\n        stderr: 'pipe',\n      }, 'collector'),\n",
      },
    ],
  },
];
const SETUP_MAPS = [
  {
    filename: 'dependency-participant-restoration.ts',
    label: 'dependency-participant-restoration',
    fsFunctions: ['mkdir', 'readFile', 'writeFile'],
    bunWrites: [],
    migrations: [],
  },
  {
    filename: 'dependency-complete-activation.ts',
    label: 'dependency-complete-activation',
    fsFunctions: ['cp', 'lstat', 'mkdir', 'readdir', 'readFile', 'rename', 'stat', 'writeFile'],
    bunWrites: [
      {
        before: "  await Bun.write(base.prodPath, '');",
        after:
          '  await writeSetup("dependency-complete-activation.Bun.write.0", base.prodPath, \'\');',
      },
      {
        before: "  await Bun.write(base.devPath, '');",
        after:
          '  await writeSetup("dependency-complete-activation.Bun.write.1", base.devPath, \'\');',
      },
    ],
    migrations: [
      {
        before: "import { runMigrations } from '@wbs/store-sqlite/migrate';",
        after: "import { runSetupMigrations } from '__MIGRATION_PORT__';",
      },
      {
        before: '  runMigrations(base.prodPath, preparedDirectory);',
        after:
          '  runSetupMigrations("dependency-complete-activation.runMigrations.prod", base.prodPath, preparedDirectory);',
      },
      {
        before: '  runMigrations(base.devPath, preparedDirectory);',
        after:
          '  runSetupMigrations("dependency-complete-activation.runMigrations.dev", base.devPath, preparedDirectory);',
      },
    ],
  },
  {
    filename: 'source-startup.ts',
    label: 'source-startup',
    fsFunctions: ['chmod', 'cp', 'lstat', 'mkdir', 'mkdtemp', 'readdir', 'symlink', 'writeFile'],
    bunWrites: [],
    migrations: [],
  },
  {
    filename: 'source-database-binding.ts',
    label: 'source-database-binding',
    fsFunctions: ['chmod', 'cp', 'mkdir', 'mkdtemp', 'writeFile'],
    bunWrites: [],
    migrations: [],
  },
  {
    filename: 'source-frontend-profile.ts',
    label: 'source-frontend-profile',
    fsFunctions: ['mkdir', 'readFile', 'symlink', 'writeFile'],
    bunWrites: [],
    migrations: [],
  },
  {
    filename: 'namespace-audit.ts',
    label: 'namespace-audit',
    fsFunctions: ['chmod', 'link', 'mkdir', 'mkdtemp', 'rename', 'rm', 'stat', 'symlink'],
    bunWrites: [
      {
        before: "      await Bun.write(`${database}${suffix}`, 'family');",
        after:
          '      await writeSetup("namespace-audit.Bun.write.0", `${database}${suffix}`, \'family\');',
      },
      {
        before: "    await Bun.write(`${namespace}${destination}/nested/ordinary`, 'ordinary');",
        after:
          '    await writeSetup("namespace-audit.Bun.write.1", `${namespace}${destination}/nested/ordinary`, \'ordinary\');',
      },
      {
        before: "      await Bun.write(`${namespace}/data/wbs.db${suffix}`, 'wrong inode');",
        after:
          '      await writeSetup("namespace-audit.Bun.write.2", `${namespace}/data/wbs.db${suffix}`, \'wrong inode\');',
      },
      {
        before:
          "  await Bun.write(mountinfo, fault === 'mountinfo-malformed' ? 'malformed' : lines.join('\\n'));",
        after:
          "  await writeSetup(\"namespace-audit.Bun.write.3\", mountinfo, fault === 'mountinfo-malformed' ? 'malformed' : lines.join('\\n'));",
      },
      {
        before: "      await Bun.write(database, 'replacement');",
        after: '      await writeSetup("namespace-audit.Bun.write.4", database, \'replacement\');',
      },
    ],
    migrations: [],
  },
];

export const dependencyOwnerCustodyCases = [
  {
    variant: 'before',
    title: 'UC2 constructor before-native UNKNOWN retains original runtime and outer locks',
  },
  {
    variant: 'after',
    title: 'UC2 constructor after-known-return UNKNOWN retains original runtime and outer locks',
  },
  {
    variant: 'healthy',
    title: 'UC2 constructor healthy cleanup preserves primary refusal and releases original locks',
  },
] as const;

interface SourcePin {
  path: string;
  bytes: number;
  sha256: string;
}
interface CustodyObservation {
  pass: boolean;
  oracle: string;
}
interface ParentPipe {
  stream: ReadableStream<Uint8Array>;
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  closedPromise: Promise<void> | undefined;
  closedObserver: Promise<void> | undefined;
  closedState: 'pending' | 'fulfilled' | 'rejected';
  closedCause: unknown;
  pump: Promise<Buffer> | undefined;
  eof: boolean;
}
interface ParentOriginal {
  child: ReturnType<typeof Bun.spawn>;
  exit: Promise<number> | undefined;
  stdout: ParentPipe | undefined;
  stderr: ParentPipe | undefined;
  known: boolean;
}
interface ParentOperation {
  label: string;
  state: 'entered' | 'pending' | 'returned' | 'fulfilled' | 'threw' | 'rejected';
  returned: unknown;
  value: unknown;
  original: unknown;
  receiver: unknown;
  args: readonly unknown[];
  cause: unknown;
  promise: Promise<unknown> | undefined;
  observer: Promise<void> | undefined;
  observerSettled: boolean;
  joined: boolean;
}
type PrehelperReportDisposition =
  { state: 'unknown' } | { state: 'complete' } | { state: 'failed'; failure: Error };
interface ParentReport {
  setupCause: unknown;
  writer: (
    descriptor: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: null,
  ) => unknown;
  descriptor: number;
  buffer: Buffer;
  offset: 0;
  length: number;
  position: null;
  state: 'entered' | 'returned' | 'threw';
  returned: unknown;
  cause: unknown;
  reportingFailure: unknown;
  failures: readonly unknown[];
}
type ParentStopSite =
  | 'outer-operation-incomplete'
  | 'parent-pipe-cap'
  | 'parent-pipe-closed'
  | 'parent-pipe-catch'
  | 'deadline-notice'
  | 'helper-acquisition-refused'
  | 'build-refused'
  | 'spawn-refused'
  | 'pump-absent'
  | 'readers-not-closed'
  | 'helper-outcome-catch'
  | 'allocation-exceeded'
  | 'parent-catch';
interface ParentStopReport {
  site: ParentStopSite;
  cause: unknown;
  snapshot: object;
  writer: typeof prehelperWriteSync;
  descriptor: number;
  buffer: Buffer;
  offset: 0;
  length: number;
  position: null;
  state: 'entered' | 'returned' | 'threw';
  returned: unknown;
  writeCause: unknown;
}
const parent = {
  originals: [] as ParentOriginal[],
  failures: [] as unknown[],
  keeper: undefined as ReturnType<typeof setInterval> | undefined,
  timer: undefined as ReturnType<typeof setTimeout> | undefined,
  stopped: false,
  spawnEntered: false,
  prehelperRefusalTerminal: false,
  reported: false,
  report: undefined as ParentReport | undefined,
  stopContext: undefined as { site: ParentStopSite; cause: unknown } | undefined,
  stopReport: undefined as ParentStopReport | undefined,
  allocationStart: undefined as bigint | undefined,
  allocationEnd: undefined as bigint | undefined,
  lastTick: undefined as bigint | undefined,
  operations: [] as ParentOperation[],
  clockOperations: [] as {
    state: string;
    returned: unknown;
    cause: unknown;
    tick: bigint | undefined;
  }[],
};

/** Projects only recorded parent state; presence does not establish settlement or hidden helper progress. */
function snapshotParentStop(site: ParentStopSite, cause: unknown) {
  const pipeState = (pipe: ParentPipe | undefined) =>
    pipe === undefined
      ? { present: false }
      : {
          present: true,
          readerPresent: pipe.reader !== undefined,
          pumpPresent: pipe.pump !== undefined,
          closedPromisePresent: pipe.closedPromise !== undefined,
          closedObserverPresent: pipe.closedObserver !== undefined,
          closedState: pipe.closedState,
          eof: pipe.eof,
        };
  const operations = parent.operations.slice(0, 128).map((operation, index) => ({
    index,
    label: Object.hasOwn(PARENT_CAPS, operation.label) ? operation.label : 'unsupported',
    state: operation.state,
    originalPresent: operation.original !== undefined,
    promisePresent: operation.promise !== undefined,
    observerPresent: operation.observer !== undefined,
    observerSettled: operation.observerSettled,
    joined: operation.joined,
  }));
  const clockOperations = parent.clockOperations.slice(0, 128).map((operation) => ({
    state: ['entered', 'returned', 'threw'].includes(operation.state)
      ? operation.state
      : 'unsupported',
    validated: operation.tick !== undefined,
  }));
  // The selected variant admits one parent helper; the inner ledger's child cap is separate.
  const children = parent.originals.slice(0, 1).map((original, index) => ({
    index,
    known: original.known,
    exitPresent: original.exit !== undefined,
    stdout: pipeState(original.stdout),
    stderr: pipeState(original.stderr),
  }));
  const snapshot = {
    schema: 'uc2-parent-stop',
    version: 1,
    site,
    causeCategory: cause === null ? 'null' : typeof cause,
    spawnEntered: parent.spawnEntered,
    allocation: {
      startPresent: parent.allocationStart !== undefined,
      endPresent: parent.allocationEnd !== undefined,
      lastTickPresent: parent.lastTick !== undefined,
    },
    operationCount: parent.operations.length,
    operationsTruncated: parent.operations.length > operations.length,
    operations,
    clockOperationCount: parent.clockOperations.length,
    clockOperationsTruncated: parent.clockOperations.length > clockOperations.length,
    clockOperations,
    childCount: parent.originals.length,
    childrenTruncated: parent.originals.length > children.length,
    children,
  };
  return snapshot;
}

/** Publishes one bounded first-site frame with the original captured writer, retaining its exact outcome. */
function reportParentStop(site: ParentStopSite, cause: unknown): void {
  const snapshot = snapshotParentStop(site, cause);
  const prefix = 'UC2 parent STOP: original helper or reader outcomes incomplete\nUC2_PARENT_STOP:';
  let buffer = Buffer.from(prefix + JSON.stringify(snapshot) + '\n', 'utf8');
  while (buffer.length > 32768) {
    if (snapshot.children.length > 0) {
      snapshot.children.pop();
      snapshot.childrenTruncated = true;
    } else if (snapshot.operations.length > 0) {
      snapshot.operations.pop();
      snapshot.operationsTruncated = true;
    } else if (snapshot.clockOperations.length > 0) {
      snapshot.clockOperations.pop();
      snapshot.clockOperationsTruncated = true;
    } else {
      throw new Error('UC2 fixed parent STOP frame exceeded bound');
    }
    buffer = Buffer.from(prefix + JSON.stringify(snapshot) + '\n', 'utf8');
  }
  const report: ParentStopReport = {
    site,
    cause,
    snapshot,
    writer: prehelperWriteSync,
    descriptor: prehelperStderr,
    buffer,
    offset: 0,
    length: buffer.length,
    position: null,
    state: 'entered',
    returned: undefined,
    writeCause: undefined,
  };
  parent.stopReport = report;
  try {
    report.returned = report.writer(
      report.descriptor,
      report.buffer,
      report.offset,
      report.length,
      report.position,
    );
    report.state = 'returned';
  } catch (diagnostic) {
    report.state = 'threw';
    report.writeCause = diagnostic;
    parent.failures.push(diagnostic);
  }
}

function stop(cause: unknown, site: ParentStopSite): Promise<never> {
  parent.failures.push(cause);
  parent.stopped = true;
  parent.keeper ??= setInterval(() => parent, 30000);
  if (!parent.reported) {
    parent.reported = true;
    parent.stopContext = { site, cause };
    try {
      reportParentStop(site, cause);
    } catch (diagnostic) {
      parent.failures.push(diagnostic);
    }
  }
  return new Promise(() => undefined);
}
function replaceOnce(source: string, before: string, after: string): string {
  if (source.split(before).length !== 2) throw new Error('UC2 pinned source occurrence differs');
  return source.replace(before, after);
}
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function isSourcePin(value: unknown): value is SourcePin {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'bytes' in value &&
    typeof value.bytes === 'number' &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0 &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256)
  );
}
const prehelperWriteSync = writeSync;
const prehelperStderr = process.stderr.fd;
const nativeClockRead = readFileSync;
function throwParentClock(message: string): never {
  parent.stopped = true;
  throw new Error(message);
}
function readKernelTick(): bigint {
  // Proof: injected parent-clock R2 M11/C05 and M12/C06 omissions fail refusal;
  // M12 reaches record32769. Each unchanged-source restoration passes.
  if (process.platform !== 'linux' || parent.clockOperations.length >= 32768)
    throwParentClock('UC2 fixed kernel clock unavailable or capped');
  const original = {
    state: 'entered',
    returned: undefined as unknown,
    cause: undefined as unknown,
    tick: undefined as bigint | undefined,
  };
  parent.clockOperations.push(original);
  let bytes: Buffer;
  try {
    bytes = nativeClockRead('/proc/uptime');
    original.returned = bytes;
    original.state = 'returned';
  } catch (cause) {
    original.state = 'threw';
    // Proof: injected R2 M13/C07+C08 omit this assignment; ENOENT/EACCES ledger-cause
    // identity assertions fail, and both unchanged-source restorations pass.
    original.cause = cause;
    parent.stopped = true;
    throw cause;
  }
  if (bytes.length > 128) throwParentClock('UC2 kernel uptime record oversized');
  const text = bytes.toString('latin1');
  const fields = /^([0-9]{1,20})\.([0-9]{2}) ([0-9]{1,20})\.([0-9]{2})\n$/.exec(text);
  // Proof: injected R2 M01-null-refusal/C10b omission yields TypeError with STOP=false;
  // the modeled Error/STOP assertion fails, and unchanged-source restoration passes.
  if (fields === null) throwParentClock('UC2 kernel uptime record malformed');
  const seconds = fields.at(1),
    fraction = fields.at(2);
  if (seconds === undefined || fraction === undefined)
    throwParentClock('UC2 fixed clock captures absent');
  const tick = BigInt(seconds) * 100n + BigInt(fraction);
  // Proof: injected R2 M05/C16 omission admits a regressed tick to the downstream
  // original; its refusal assertion fails and unchanged-source restoration passes.
  if (parent.lastTick !== undefined && tick < parent.lastTick)
    throwParentClock('UC2 kernel uptime moved backward');
  parent.lastTick = tick;
  original.tick = tick;
  return tick;
}
function allocationTick(text: string | undefined): bigint {
  if (text === undefined) throwParentClock('UC2 original centisecond allocation absent');
  const matched = /^[0-9]{1,24}$/.exec(text);
  // Proof: injected R2 M02/C12a omission accepts hex text, failing the lexical-refusal
  // assertion; unchanged-source restoration passes.
  if (matched === null) throwParentClock('UC2 original centisecond allocation malformed');
  return BigInt(text);
}
function readAllocation(): { start: bigint; end: bigint; localDeadline: number } {
  const start = allocationTick(process.env['PUNI_UC2_ALLOCATION_START_CS']);
  const end = allocationTick(process.env['PUNI_UC2_ALLOCATION_END_CS']);
  const lower = allocationTick(process.env['PUNI_UC2_ALLOCATION_LOWER_CS']);
  // Proof: injected R2 M03/C13 and M04/C14 separately omit duration and lower<S limbs;
  // refusal assertions fail and restorations pass. No lower>=E necessity is claimed.
  if (end !== start + 18000n || lower < start || lower >= end)
    throwParentClock('UC2 fixed original allocation span differs');
  parent.allocationStart = start;
  parent.allocationEnd = end;
  parent.lastTick = lower;
  const local = performance.now();
  const tick = readKernelTick();
  if (tick < start || tick >= end) throwParentClock('UC2 original allocation exhausted');
  const remaining = (end - tick - 1n) * 10n;
  // Proof: injected R2 M06/C18 omission accepts zero conservative remainder, failing
  // its refusal assertion; unchanged-source restoration passes.
  if (remaining <= 0n) throwParentClock('UC2 conservative local deadline exhausted');
  return { start, end, localDeadline: local + Number(remaining) };
}
function isParentStopped(): boolean {
  return parent.stopped;
}
function assertParentStart(): void {
  // Proof: injected R2 M07/C19, M08/C20 and M09/C21 each omit one closed-state limb;
  // the original enters after stopped/missing-boundary injection, failing refusal.
  // Each unchanged-source restoration passes; these are state-boundary injections.
  if (parent.stopped || parent.allocationStart === undefined || parent.allocationEnd === undefined)
    throw new Error('UC2 outer operation starts closed');
  const tick = readKernelTick();
  // Proof: injected R2 M10/C22 omits only the expiry limb and enters the original at E;
  // refusal fails and restoration passes. No lower-bound necessity is claimed.
  if (tick < parent.allocationStart || tick >= parent.allocationEnd) {
    parent.stopped = true;
    throw new Error('UC2 original kernel allocation exhausted');
  }
}
const PARENT_CAPS: Readonly<Partial<Record<string, number>>> = {
  'outer.fs.mkdtemp': 1,
  'outer.fs.writeFile': 32,
  'outer.fs.readFile': 16,
  'outer.Bun.build': 2,
  'outer.Bun.write': 2,
};
function outerOperation<Arguments extends unknown[], Returned>(
  label: string,
  original: (...args: Arguments) => Returned,
  receiver: unknown,
  args: Arguments,
): Returned {
  assertParentStart();
  const cap = PARENT_CAPS[label];
  if (
    cap === undefined ||
    parent.operations.length >= 128 ||
    parent.operations.filter((operation) => operation.label === label).length >= cap
  )
    throw new Error('UC2 fixed outer operation unknown or capped');
  const operation: ParentOperation = {
    label,
    state: 'entered',
    returned: undefined,
    value: undefined,
    original,
    receiver,
    args,
    cause: undefined,
    promise: undefined,
    observer: undefined,
    observerSettled: false,
    joined: false,
  };
  parent.operations.push(operation);
  try {
    const returned = original.apply(receiver, args);
    operation.returned = returned;
    if (!(returned instanceof Promise))
      throw new Error('UC2 fixed outer API did not return its Promise');
    operation.promise = returned;
    operation.state = 'pending';
    operation.observer = returned.then(
      (value: unknown) => {
        operation.value = value;
        operation.state = 'fulfilled';
        operation.observerSettled = true;
      },
      (cause: unknown) => {
        operation.cause = cause;
        operation.state = 'rejected';
        operation.observerSettled = true;
        parent.stopped = true;
      },
    );
    return returned;
  } catch (cause) {
    operation.state = 'threw';
    operation.cause = cause;
    parent.stopped = true;
    throw cause;
  }
}
/** Joins terminal private API records without reopening work; delegate provenance comes from the closed outerOperation call sites. */
function joinPrehelperRefusal(): Promise<boolean> {
  // Proof: finite original MODEL S omitted both mirrored spawnEntered predicates;
  // 'UC2 pre-helper spawn entry without child retains parent timers' failed HOLD
  // identity; exact restoration passed (2026-11-03). Grouped predicates only; no real spawn.
  if (!parent.stopped || parent.spawnEntered || parent.originals.length !== 0)
    return Promise.resolve(false);
  // Proof: source-image MODEL C omitted this grouped clock exclusion;
  // 'UC2 pre-helper entered clock boundary retains parent timers' failed,
  // then exact restoration passed (2026-11-02); entered state only.
  if (
    parent.clockOperations.some(
      (operation) => operation.state !== 'returned' || typeof operation.tick !== 'bigint',
    )
  )
    return Promise.resolve(false);
  const captured = parent.operations.map((operation) => ({
    operation,
    label: operation.label,
    original: operation.original,
    receiver: operation.receiver,
    args: operation.args,
    promise: operation.promise,
    observer: operation.observer,
    state: operation.state,
    value: operation.value,
    cause: operation.cause,
  }));
  const promises: Promise<unknown>[] = [];
  for (const record of captured) {
    const promise = record.promise;
    const observer = record.observer;
    if (
      !Object.hasOwn(PARENT_CAPS, record.label) ||
      typeof record.original !== 'function' ||
      !(promise instanceof Promise) ||
      // Proof: finite original MODEL T omitted both mirrored returned identities;
      // 'UC2 pre-helper changed returned original retains timers' failed
      // UC2_PREFLIGHT_CHANGED_RETURNED_RETIRED; exact restoration passed
      // (2026-11-03). Grouped identity predicates only.
      record.operation.returned !== promise ||
      // Proof: source-image MODEL M omitted this Promise check; the owning
      // 'UC2 pre-helper absent observer retains parent timers' failed.
      // Exact restoration passed (2026-11-02); model boundary only.
      !(observer instanceof Promise) ||
      // Proof: source-image MODEL P omitted only this EARLY settled check;
      // 'UC2 pre-helper pending observer retains parent timers' failed after
      // controlled settlement; exact restoration passed (2026-11-02).
      !record.operation.observerSettled ||
      (record.state !== 'fulfilled' && record.state !== 'rejected')
    )
      return Promise.resolve(false);
    promises.push(promise, observer);
  }
  // Proof: source-image MODEL R omitted this API-rejection requirement;
  // 'UC2 pre-helper empty operation roster retains parent timers' failed,
  // then exact restoration passed (2026-11-02).
  if (!captured.some((record) => record.state === 'rejected')) return Promise.resolve(false);
  return Promise.allSettled(promises).then((outcomes) => {
    for (const [index, record] of captured.entries()) {
      const settled = outcomes.at(index * 2);
      const observed = outcomes.at(index * 2 + 1);
      const operation = record.operation;
      if (
        settled === undefined ||
        // Proof: source-image MODEL O omitted this fulfilled-outcome check;
        // 'UC2 pre-helper rejected observer retains parent timers' failed,
        // then exact restoration passed (2026-11-02).
        observed?.status !== 'fulfilled' ||
        operation.label !== record.label ||
        operation.original !== record.original ||
        operation.receiver !== record.receiver ||
        operation.args !== record.args ||
        operation.promise !== record.promise ||
        // Proof: finite original MODEL T above omitted this mirrored limb too;
        // the changed-returned HOLD consumer failed, then exact restoration passed (2026-11-03).
        operation.returned !== record.promise ||
        operation.observer !== record.observer ||
        operation.state !== record.state ||
        !Object.is(operation.value, record.value) ||
        !Object.is(operation.cause, record.cause) ||
        !operation.observerSettled
      )
        return false;
      // Proof: finite original MODEL O omitted only the rejected-cause identity;
      // 'UC2 pre-helper rejected cause mismatch retains timers' failed
      // UC2_PREFLIGHT_REJECTED_CAUSE_MISMATCH_RETIRED; exact restoration
      // passed (2026-11-03). Same rejected-cause example only.
      if (
        record.state === 'fulfilled'
          ? settled.status !== 'fulfilled' || !Object.is(settled.value, record.value)
          : settled.status !== 'rejected' || !Object.is(settled.reason, record.cause)
      )
        return false;
      // Proof: finite original MODEL J omitted only this joined assignment;
      // 'UC2 pre-helper known build refusal retires only parent timers' failed
      // operations.every(operation => operation.joined); exact restoration
      // passed (2026-11-03). Joined bookkeeping only.
      operation.joined = true;
    }
    // Proof: finite original MODEL S above also omitted this final spawnEntered
    // predicate; spawn-entered HOLD identity failed, then exact restoration passed
    // (2026-11-03). Grouped predicates only; no real spawn.
    return parent.stopped && !parent.spawnEntered && parent.originals.length === 0;
  });
}

/** Projects only fixed tags from private records; raw causes, arguments and paths never enter the buffer. */
function projectPrehelperRefusal(setupCause: unknown): Buffer | undefined {
  function projectLabel(label: unknown): string {
    // Proof: reporting MODEL R6 omitted label allowlisting;
    // 'UC2 pre-helper diagnostic projection is bounded' received the model label
    // instead of 'unsupported'; exact restoration passed (2026-11-03); label only.
    return typeof label === 'string' && Object.hasOwn(PARENT_CAPS, label) ? label : 'unsupported';
  }
  function projectState(state: unknown): string {
    const states = ['entered', 'pending', 'returned', 'fulfilled', 'threw', 'rejected'];
    return typeof state === 'string' && states.includes(state) ? state : 'unsupported';
  }
  function projectCategory(value: unknown): string {
    return value === null ? 'null' : typeof value;
  }
  // Proof: reporting MODEL R5 removed this slice; the synthetic129 case
  // 'UC2 pre-helper diagnostic projection is bounded' failed operationsTruncated.
  // Exact restoration passed (2026-11-03); operation-summary truncation only.
  const operations = parent.operations.slice(0, 128).map((operation, index) => ({
    index,
    label: projectLabel(operation.label),
    state: projectState(operation.state),
    original: typeof operation.original === 'function',
    promise: operation.promise !== undefined,
    observer: operation.observer !== undefined,
    joined: operation.joined,
    observerSettled: operation.observerSettled,
  }));
  const failures = [
    { role: 'setup', category: projectCategory(setupCause) },
    ...parent.failures.slice(0, 7).map((failure) => ({
      role: 'setup',
      category: projectCategory(failure),
    })),
  ];
  const clocks = parent.clockOperations.slice(0, 128).map((operation) => ({
    state: projectState(operation.state),
    validated: typeof operation.tick === 'bigint',
  }));
  for (const summary of [...operations, ...failures, ...clocks]) {
    const serialized = JSON.stringify(summary);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 512)
      return undefined;
  }
  const projection = {
    schema: 'uc2-prehelper-failure',
    version: 1,
    sourceEpoch: 'uc2-prehelper-report-v1',
    phase: 'pre-helper',
    disposition: 'terminal-setup-refusal',
    spawnEntered: parent.spawnEntered,
    children: parent.originals.length,
    operationCount: parent.operations.length,
    operationsTruncated: parent.operations.length > operations.length,
    operations,
    failureCount: 1 + parent.failures.length,
    failuresTruncated: 1 + parent.failures.length > failures.length,
    failures,
    clockCount: parent.clockOperations.length,
    clocksTruncated: parent.clockOperations.length > clocks.length,
    clocks,
  };
  const serialized = JSON.stringify(projection);
  if (typeof serialized !== 'string') return undefined;
  const buffer = Buffer.from('UC2_PREFLIGHT_FAILURE:' + serialized + '\n', 'utf8');
  return buffer.byteLength <= 32768 ? buffer : undefined;
}

/** Records one synchronous write to the existing descriptor; unsupported publication retains UNKNOWN without retry. */
function reportPrehelperRefusal(setupCause: unknown): PrehelperReportDisposition {
  if (parent.report !== undefined) return { state: 'unknown' };
  let buffer: Buffer | undefined;
  try {
    buffer = projectPrehelperRefusal(setupCause);
  } catch (failure) {
    parent.failures.push(failure);
    return { state: 'unknown' };
  }
  if (buffer === undefined) return { state: 'unknown' };
  const report: ParentReport = {
    setupCause,
    writer: prehelperWriteSync,
    descriptor: prehelperStderr,
    buffer,
    offset: 0,
    length: buffer.byteLength,
    position: null,
    state: 'entered',
    returned: undefined,
    cause: undefined,
    reportingFailure: undefined,
    failures: [],
  };
  // Proof: reporting source-image MODEL R1 omitted this record assignment;
  // 'UC2 pre-helper complete diagnostic preserves setup identity' failed at
  // report-record presence. Exact restoration passed (2026-11-03); retention only.
  parent.report = report;
  const writer = report.writer;
  let returned: unknown;
  try {
    returned = writer(
      report.descriptor,
      report.buffer,
      report.offset,
      report.length,
      report.position,
    );
  } catch (cause) {
    report.state = 'threw';
    report.cause = cause;
    report.reportingFailure = cause;
    // Proof: finite reporting MODEL thrown-failure-pair omitted only this pair;
    // 'UC2 pre-helper thrown diagnostic retains both failures' failed
    // record.failures length (expected 2, received 0); exact restoration passed
    // (2026-11-03). This thrown example's private ordered retention only.
    report.failures = [setupCause, cause];
    // Proof: finite reporting MODEL safe-outward-failure returned the retained
    // thrown Error here; 'UC2 pre-helper thrown diagnostic retains both failures'
    // failed the safe fixed-message consumer with the private sentinel. Exact
    // restoration passed (2026-11-03); this thrown example only.
    return { state: 'failed', failure: new Error('UC2 setup and diagnostic publication failed') };
  }
  report.returned = returned;
  report.state = 'returned';
  if (
    typeof returned !== 'number' ||
    // Proof: finite reporting MODEL integer omitted only this limb;
    // 'UC2 pre-helper fractional diagnostic return retains timers' failed
    // UC2_PREFLIGHT_FRACTIONAL_REPORT_RETIRED; exact restoration passed
    // (2026-11-03). Fractional 0.5 lexical writer example only.
    !Number.isInteger(returned) ||
    // Proof: finite reporting MODEL lower-bound omitted only this limb;
    // 'UC2 pre-helper negative diagnostic return retains timers' failed
    // UC2_PREFLIGHT_NEGATIVE_REPORT_RETIRED; exact restoration passed
    // (2026-11-03). Negative -1 lexical writer example only.
    returned < 0 ||
    // Proof: reporting source-image MODEL R2 omitted this upper-count limb;
    // 'UC2 pre-helper unsupported diagnostic count retains timers' failed its
    // HOLD identity oracle; exact restoration passed (2026-11-03); upper bound only.
    returned > report.length
  )
    return { state: 'unknown' };
  // Proof: reporting MODEL R4 accepted a short count as complete;
  // 'UC2 pre-helper short diagnostic retains both failures' failed the
  // reportingFailure Error oracle; exact restoration passed (2026-11-03).
  if (returned === report.length) return { state: 'complete' };
  const failure = new Error('UC2 diagnostic publication was incomplete');
  report.reportingFailure = failure;
  report.failures = [setupCause, failure];
  return { state: 'failed', failure: new Error('UC2 setup and diagnostic publication failed') };
}

async function joinOuterOperations(): Promise<void> {
  for (const operation of parent.operations) {
    if (operation.promise !== undefined) {
      await Promise.allSettled([operation.promise, operation.observer]);
      operation.joined = true;
    }
    if (operation.state !== 'fulfilled' || !operation.joined || !operation.observerSettled)
      return await stop(
        new Error('UC2 original outer operation not known successful'),
        'outer-operation-incomplete',
      );
  }
}
function captureParentPipe(
  original: ParentOriginal,
  kind: 'stdout' | 'stderr',
  stream: ReadableStream<Uint8Array>,
): ParentPipe {
  const pipe: ParentPipe = {
    stream,
    reader: undefined,
    closedPromise: undefined,
    closedObserver: undefined,
    closedState: 'pending',
    closedCause: undefined,
    pump: undefined,
    eof: false,
  };
  original[kind] = pipe;
  pipe.reader = stream.getReader();
  pipe.closedPromise = pipe.reader.closed;
  pipe.closedObserver = pipe.closedPromise.then(
    () => {
      pipe.closedState = 'fulfilled';
    },
    (cause: unknown) => {
      pipe.closedState = 'rejected';
      pipe.closedCause = cause;
      parent.stopped = true;
    },
  );
  const reader = pipe.reader,
    closedPromise = pipe.closedPromise,
    closedObserver = pipe.closedObserver;
  pipe.pump = (async () => {
    try {
      const chunks: Uint8Array[] = [];
      let count = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          pipe.eof = true;
          break;
        }
        count += chunk.value.byteLength;
        if (count > 1048576)
          return await stop(new Error('UC2 original parent pipe cap exceeded'), 'parent-pipe-cap');
        chunks.push(chunk.value);
      }
      await closedPromise;
      await closedObserver;
      if (pipe.closedState !== 'fulfilled')
        return await stop(
          new Error('UC2 original closed promise not fulfilled'),
          'parent-pipe-closed',
        );
      reader.releaseLock();
      return Buffer.concat(chunks);
    } catch (cause) {
      return await stop(cause, 'parent-pipe-catch');
    }
  })();
  return pipe;
}

/** Module preparation owns original helpers before timed tests register; only joined observations reach callbacks. */
export async function prepareDependencyOwnerCustody(): Promise<
  ReadonlyMap<string, CustodyObservation>
> {
  const admission = process.env['PUNI_UC2_PREFLIGHT'];
  const selected =
    admission === 'constructor-before-red-v1'
      ? 'before'
      : admission === 'constructor-after-red-v1'
        ? 'after'
        : admission === 'constructor-healthy-control-v1'
          ? 'healthy'
          : undefined;
  const safeAdmissions = [
    ['safe-r1-drop-live-v1', 'UC2 original drop live closes genuine raw originals at owner return'],
    [
      'safe-r1-drop-expired-v1',
      'UC2 original drop expired closes genuine raw originals at owner return',
    ],
    [
      'safe-r1-release-live-v1',
      'UC2 original release live closes genuine raw originals at owner return',
    ],
    [
      'safe-r1-release-expired-v1',
      'UC2 original release expired closes genuine raw originals at owner return',
    ],
  ];
  const safe = safeAdmissions.find((row) => row[0] === admission);
  if (selected === undefined && safe === undefined)
    throw new Error('UC2 literal native or safe-R1 admission required before acquisition');
  const title =
    safe === undefined
      ? dependencyOwnerCustodyCases.find((row) => row.variant === selected)?.title
      : safe[1];
  if (title === undefined || process.env['PUNI_UC2_SELECTOR'] !== title)
    throw new Error('UC2 exact Root-bound selector differs');
  if (process.cwd() !== SUBJECT || process.execPath !== '/home/df/.bun/bin/bun')
    throw new Error('UC2 original preflight identity differs');
  const metadataPath = process.env['PUNI_UC2_EPOCH_PATH'];
  const metadataSHA256 = process.env['PUNI_UC2_EPOCH_SHA256'];
  if (
    metadataPath === undefined ||
    metadataSHA256 === undefined ||
    !/^[0-9a-f]{64}$/.test(metadataSHA256)
  )
    throw new Error('UC2 Root-controlled after-epoch metadata binding absent');
  const metadataBytes = await readFile(metadataPath);
  if (sha(metadataBytes) !== metadataSHA256)
    throw new Error('UC2 after-epoch metadata identity differs');
  const metadata: unknown = JSON.parse(metadataBytes.toString('utf8'));
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('version' in metadata) ||
    metadata.version !== 'uc2-after-r2-v1' ||
    !('sources' in metadata) ||
    !Array.isArray(metadata.sources) ||
    !metadata.sources.every(isSourcePin)
  )
    throw new Error('UC2 after-epoch metadata schema differs');
  const pins = metadata.sources;
  if (
    pins.length !== SOURCE_PATHS.length ||
    new Set(pins.map((pin) => pin.path)).size !== SOURCE_PATHS.length ||
    SOURCE_PATHS.some((path) => !pins.some((pin) => pin.path === path))
  )
    throw new Error('UC2 exact after-epoch path roster differs');
  const sourceBodies = new Map<string, string>();
  for (const pin of pins) {
    const bytes = await readFile(pin.path);
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256)
      throw new Error('UC2 after source epoch differs before acquisition: ' + pin.path);
    sourceBodies.set(pin.path, bytes.toString('utf8'));
  }
  // Safe R1 admission performs no build, helper, keeper or native-constructor acquisition.
  if (safe !== undefined) return new Map<string, CustodyObservation>();
  if (
    !('clock' in metadata) ||
    typeof metadata.clock !== 'object' ||
    metadata.clock === null ||
    !('status' in metadata.clock) ||
    metadata.clock.status !== 'ROOT_QUALIFIED_FIXED_KERNEL_METADATA' ||
    !('basis' in metadata.clock) ||
    metadata.clock.basis !== 'linux.proc-uptime-centiseconds' ||
    !('evidenceSHA256' in metadata.clock) ||
    typeof metadata.clock.evidenceSHA256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(metadata.clock.evidenceSHA256) ||
    !('binarySHA256' in metadata.clock) ||
    typeof metadata.clock.binarySHA256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(metadata.clock.binarySHA256) ||
    sha(await readFile(process.execPath)) !== metadata.clock.binarySHA256
  )
    throw new Error('UC2 fixed kernel clock requires reviewed Root metadata');
  if (
    !('graphBridge' in metadata) ||
    typeof metadata.graphBridge !== 'object' ||
    metadata.graphBridge === null ||
    !('status' in metadata.graphBridge) ||
    metadata.graphBridge.status !== 'ROOT_VERIFIED_CURRENT_EPOCH' ||
    !('logicalSHA256' in metadata.graphBridge) ||
    metadata.graphBridge.logicalSHA256 !==
      '29b973f6bdfbab34e20a43af7de88600ac00a9dbc2ad6d52e42c71124da3320d'
  )
    throw new Error('UC2 Root Graph checkpoint bridge is not qualified');
  const allocation = readAllocation();
  const keeper = setInterval(() => parent, 30000);
  parent.keeper = keeper;
  const observations = new Map<string, CustodyObservation>();
  const timer = setTimeout(
    () => {
      void stop(
        new Error('UC2 conservative local deadline notice; fixed-clock expiry not inferred'),
        'deadline-notice',
      );
    },
    Math.max(1, Math.floor(allocation.localDeadline - performance.now())),
  );
  parent.timer = timer;
  try {
    for (const row of dependencyOwnerCustodyCases.filter((row) => row.variant === selected)) {
      if (parent.stopped || readKernelTick() >= allocation.end)
        return await stop(
          new Error('UC2 next helper acquisition refused after allocation'),
          'helper-acquisition-refused',
        );
      const root = await outerOperation('outer.fs.mkdtemp', mkdtemp, undefined, [
        join(tmpdir(), 'dependency-owner-custody-'),
      ]);
      if (typeof root !== 'string') throw new Error('UC2 fixed mkdtemp return was not text');
      const ledger = join(root, 'originals.js');
      const graphPorts = join(root, 'graph-ports.js');
      const storagePorts = join(root, 'storage-ports.js');
      const lockPorts = join(root, 'lock-ports.js');
      const graphCall = join(root, 'graph-call.js');
      const databasePorts = join(root, 'database-ports.js');
      const migrationPorts = join(root, 'migration-ports.js');
      const setupPorts = new Map<string, string>();
      const entry = join(root, 'entry.js');
      const contender = join(root, 'contender.js');
      const contenderBundle = join(root, 'contender.bundle.js');
      const bundle = join(root, 'entry.bundle.js');
      const lib = join(SUBJECT, 'tools/tool-remote-scripts/src/lib');
      const fixtures = join(SUBJECT, 'tools/tool-remote-scripts/src/fixtures');
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        ledger,
        LEDGER.replace('__DIRECTORY_FILE__', join(lib, 'directory-file.ts')),
      ]);
      for (const [path, origin] of [
        [graphPorts, 'graph'],
        [storagePorts, 'storage'],
        [lockPorts, 'lock'],
      ])
        await outerOperation('outer.fs.writeFile', writeFile, undefined, [
          path,
          `export * from ${JSON.stringify(ledger)};import {acquireFD,acquireRelative} from ${JSON.stringify(ledger)};export const openSync=(...args)=>acquireFD(${JSON.stringify(origin)},...args);export const openDirectoryFile=(...args)=>acquireRelative(...args);`,
        ]);
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        graphCall,
        `export * from ${JSON.stringify(join(lib, 'initial-handoff-graph.ts'))};import {captureInitialHandoffArtifacts as original,isInitialHandoffCleanupUnknown} from ${JSON.stringify(join(lib, 'initial-handoff-graph.ts'))};import {custody} from ${JSON.stringify(ledger)};export function captureInitialHandoffArtifacts(...args){custody.graph=true;try{return original(...args);}catch(cause){custody.graphFailure=cause;custody.classified=isInitialHandoffCleanupUnknown(cause);throw cause;}finally{custody.graph=false;}}`,
      ]);
      const database = join(SUBJECT, 'libs/wbs/adapters/store-sqlite/src/db.ts');
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        databasePorts,
        `export * from ${JSON.stringify(database)};import {openReadOnlyConnection as connection,openReadOnlyDatabase as database} from ${JSON.stringify(database)};import {acquireConnection} from ${JSON.stringify(ledger)};export const openReadOnlyConnection=(...args)=>acquireConnection(connection,args,'connection');export const openReadOnlyDatabase=(...args)=>acquireConnection(database,args,'database');`,
      ]);
      for (const mapping of SETUP_MAPS) {
        const path = join(root, mapping.filename + '.setup.js');
        setupPorts.set(mapping.filename, path);
        const exports = mapping.fsFunctions
          .map(
            (name) =>
              `const original_${name}=originals.${name};export const ${name}=(...args)=>invokeSetupOperation(${JSON.stringify(mapping.label + '.fs.' + name)},original_${name},undefined,args,'promise');`,
          )
          .join('\n');
        await outerOperation('outer.fs.writeFile', writeFile, undefined, [
          path,
          `import * as originals from 'node:fs/promises';import {invokeSetupOperation} from ${JSON.stringify(ledger)};\n${exports}`,
        ]);
      }
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        migrationPorts,
        `import {runMigrations as original} from ${JSON.stringify(join(SUBJECT, 'libs/wbs/adapters/store-sqlite/src/migrate.ts'))};import {invokeSetupOperation} from ${JSON.stringify(ledger)};export const runSetupMigrations=(label,...args)=>invokeSetupOperation(label,original,undefined,args,'sync');`,
      ]);
      const substitutions = {
        __LEDGER__: ledger,
        __PARTICIPANT__: join(fixtures, 'dependency-participant-restoration.ts'),
        __OWNER__: join(lib, 'edge-ownership.ts'),
        __COMPLETE__: join(lib, 'complete-dependency-exclusion.ts'),
        __DB__: databasePorts,
        __ACTIVATION__: join(
          SUBJECT,
          'libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts',
        ),
        __LOCK__: join(lib, 'lock.ts'),
      };
      let entryProgram = ENTRY.replace('__VARIANT__', JSON.stringify(row.variant))
        .replace('__OUTPUT_ROOT__', JSON.stringify(root))
        .replace('__CONTENDER_EXPRESSION__', JSON.stringify(contenderBundle));
      let contenderProgram = CONTENDER;
      for (const [before, after] of Object.entries(substitutions)) {
        entryProgram = entryProgram.replaceAll(before, after);
        contenderProgram = contenderProgram.replaceAll(before, after);
      }
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [entry, entryProgram]);
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        contender,
        contenderProgram,
      ]);
      const plugin: BunPlugin = {
        name: 'owned-dependency-custody-red',
        setup(build) {
          // Proof: the basename-only selector made the same inert build consumer fail on four
          // missing-map callbacks; exact directory-filter restoration passed (2026-11-02).
          // This covers selector/lookup/default loading only.
          build.onLoad(
            {
              filter:
                /\/tools\/tool-remote-scripts\/src\/(?:lib\/(?:initial-handoff-graph|dependency-activation-storage|edge-ownership|lock)|fixtures\/(?:dependency-participant-restoration|dependency-complete-activation|namespace-audit|source-startup|source-frontend-profile|source-database-binding))\.ts$/,
            },
            (source) => {
              let contents = sourceBodies.get(
                source.path.endsWith('/initial-handoff-graph.ts') ? GRAPH_INPUT : source.path,
              );
              if (contents === undefined)
                throw new Error('UC2 mapped source was not frozen before acquisition');
              if (source.path.endsWith('/initial-handoff-graph.ts')) {
                contents = replaceOnce(
                  contents,
                  "from 'node:fs';",
                  'from ' + JSON.stringify(graphPorts) + ';',
                );
                contents = replaceOnce(
                  contents,
                  "from './directory-file';",
                  'from ' + JSON.stringify(graphPorts) + ';',
                );
              } else if (source.path.endsWith('/lock.ts')) {
                contents = replaceOnce(
                  contents,
                  "from 'node:fs';",
                  'from ' + JSON.stringify(lockPorts) + ';',
                );
              } else if (source.path.endsWith('/dependency-activation-storage.ts')) {
                if (contents.split("from 'node:fs';").length !== 3)
                  throw new Error('UC2 storage filesystem import count differs');
                contents = contents.replaceAll(
                  "from 'node:fs';",
                  'from ' + JSON.stringify(storagePorts) + ';',
                );
                contents = replaceOnce(
                  contents,
                  "from '@wbs/store-sqlite/db';",
                  'from ' + JSON.stringify(databasePorts) + ';',
                );
                contents = replaceOnce(
                  contents,
                  "from './initial-handoff-graph';",
                  'from ' + JSON.stringify(graphCall) + ';',
                );
              } else if (source.path.endsWith('/edge-ownership.ts')) {
                // The current RED source has no production keeper. Future bodies require a newly reviewed source epoch.
                if (contents.includes('setInterval(') || contents.includes('setTimeout('))
                  throw new Error('UC2 RED epoch refuses unreviewed production timer source');
              } else if (source.path.endsWith('/source-frontend-profile.ts')) {
                contents = replaceOnce(
                  contents,
                  "const ROOT = resolve(import.meta.dir, '../../../..');",
                  'const ROOT = ' + JSON.stringify(SUBJECT) + ';',
                );
              } else {
                if (source.path.endsWith('/dependency-complete-activation.ts'))
                  contents = replaceOnce(
                    contents,
                    "const migrationsDirectory = new URL('../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;",
                    'const migrationsDirectory = ' +
                      JSON.stringify(join(SUBJECT, 'apps/wbs/be-01/drizzle')) +
                      ';',
                  );
                const mapping = CHILD_MAPS.find((mapping) =>
                  source.path.endsWith('/' + mapping.filename),
                );
                if (mapping === undefined && !source.path.endsWith('/source-database-binding.ts'))
                  throw new Error('UC2 original child mapping absent');
                if (mapping !== undefined)
                  for (const replacement of mapping.replacements)
                    contents = replaceOnce(
                      contents,
                      replacement.before,
                      replacement.after.replaceAll('__LEDGER__', ledger),
                    );
              }
              const setup = SETUP_MAPS.find((mapping) =>
                source.path.endsWith('/' + mapping.filename),
              );
              if (
                setup === undefined &&
                [
                  'dependency-participant-restoration.ts',
                  'dependency-complete-activation.ts',
                  'source-startup.ts',
                  'source-database-binding.ts',
                  'source-frontend-profile.ts',
                  'namespace-audit.ts',
                ].some((filename) => source.path.endsWith('/' + filename))
              )
                throw new Error('UC2 required fixed setup mapping absent');
              if (setup !== undefined) {
                const port = setupPorts.get(setup.filename);
                if (port === undefined) throw new Error('UC2 fixed setup port absent');
                contents = replaceOnce(
                  contents,
                  "from 'node:fs/promises';",
                  'from ' + JSON.stringify(port) + ';',
                );
                if (setup.bunWrites.length > 0)
                  contents =
                    'import {writeSetup} from ' + JSON.stringify(ledger) + ';\n' + contents;
                for (const replacement of setup.bunWrites)
                  contents = replaceOnce(contents, replacement.before, replacement.after);
                for (const replacement of setup.migrations)
                  contents = replaceOnce(
                    contents,
                    replacement.before,
                    replacement.after.replaceAll('__MIGRATION_PORT__', migrationPorts),
                  );
              }
              if (source.path.endsWith('/dependency-activation-storage.ts')) {
                contents =
                  'import {joinSetupOperations} from ' + JSON.stringify(ledger) + ';\n' + contents;
                contents = replaceOnce(
                  contents,
                  '      raw = captureInitialHandoffArtifacts(',
                  '      await joinSetupOperations();\n      raw = captureInitialHandoffArtifacts(',
                );
              }
              return { contents, loader: 'ts' };
            },
          );
        },
      };
      for (const [input, output] of [
        [contender, contenderBundle],
        [entry, bundle],
      ]) {
        if (isParentStopped() || readKernelTick() >= allocation.end)
          return await stop(new Error('UC2 next build refused after allocation'), 'build-refused');
        const built = await outerOperation('outer.Bun.build', Bun.build, Bun, [
          { entrypoints: [input], target: 'bun', plugins: [plugin] },
        ]);
        if (!built.success || built.outputs.length !== 1)
          throw new Error('UC2 owned build failed', { cause: built.logs });
        const emitted = built.outputs.at(0);
        if (emitted === undefined) throw new Error('UC2 owned bundle absent');
        await outerOperation('outer.Bun.write', writeBuiltArtifact, Bun, [output, emitted]);
      }
      await outerOperation('outer.fs.writeFile', writeFile, undefined, [
        join(root, 'bundle-hashes.json'),
        JSON.stringify({
          ledger: sha(
            await outerOperation('outer.fs.readFile', readBinaryFile, undefined, [ledger]),
          ),
          entry: sha(
            await outerOperation('outer.fs.readFile', readBinaryFile, undefined, [bundle]),
          ),
          contender: sha(
            await outerOperation('outer.fs.readFile', readBinaryFile, undefined, [contenderBundle]),
          ),
          afterEpochSHA256: metadataSHA256,
          graphLogicalSHA256: '29b973f6bdfbab34e20a43af7de88600ac00a9dbc2ad6d52e42c71124da3320d',
        }),
      ]);
      if (isParentStopped() || readKernelTick() >= allocation.end)
        return await stop(new Error('UC2 next spawn refused after allocation'), 'spawn-refused');
      await joinOuterOperations();
      assertParentStart();
      parent.spawnEntered = true;
      const child = Bun.spawn(
        [
          process.execPath,
          'run',
          bundle,
          String(allocation.start),
          String(allocation.end),
          String(parent.lastTick),
        ],
        { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' },
      );
      const original: ParentOriginal = {
        child,
        exit: undefined,
        stdout: undefined,
        stderr: undefined,
        known: false,
      };
      parent.originals.push(original);
      try {
        child.ref();
        original.exit = child.exited;
        const stdoutPipe = captureParentPipe(original, 'stdout', child.stdout);
        const stderrPipe = captureParentPipe(original, 'stderr', child.stderr);
        if (stdoutPipe.pump === undefined || stderrPipe.pump === undefined)
          return await stop(new Error('UC2 original pump absent'), 'pump-absent');
        const [stdout, stderr, code] = await Promise.all([
          stdoutPipe.pump,
          stderrPipe.pump,
          original.exit,
        ]);
        if (
          !stdoutPipe.eof ||
          !stderrPipe.eof ||
          stdoutPipe.closedState !== 'fulfilled' ||
          stderrPipe.closedState !== 'fulfilled'
        )
          return await stop(
            new Error('UC2 original parent readers not known closed'),
            'readers-not-closed',
          );
        original.known = true;
        await outerOperation('outer.fs.writeFile', writeFile, undefined, [
          join(root, 'stdout.log'),
          stdout,
        ]);
        await outerOperation('outer.fs.writeFile', writeFile, undefined, [
          join(root, 'stderr.log'),
          stderr,
        ]);
        if (code !== 0 || stderr.length !== 0)
          throw new Error('UC2 helper refused before known observation');
        const lines = stdout.toString('utf8').trimEnd().split('\n');
        if (lines.length !== 1 || !lines[0]?.startsWith('UC2_KNOWN:'))
          throw new Error('UC2 helper record envelope differs');
        const decoded: unknown = JSON.parse(lines[0].slice('UC2_KNOWN:'.length));
        if (
          typeof decoded !== 'object' ||
          decoded === null ||
          !('pass' in decoded) ||
          typeof decoded.pass !== 'boolean' ||
          !('oracle' in decoded) ||
          typeof decoded.oracle !== 'string' ||
          !('retired' in decoded) ||
          typeof decoded.retired !== 'object' ||
          decoded.retired === null ||
          !('known' in decoded.retired) ||
          decoded.retired.known !== true
        )
          throw new Error('UC2 helper retirement record invalid');
        observations.set(row.variant, { pass: decoded.pass, oracle: decoded.oracle });
      } catch (cause) {
        if (!original.known) return await stop(cause, 'helper-outcome-catch');
        throw cause;
      }
    }
    if (parent.stopped || readKernelTick() >= allocation.end)
      return await stop(
        new Error('UC2 observation exceeded original allocation'),
        'allocation-exceeded',
      );
    await joinOuterOperations();
    return observations;
  } catch (cause) {
    if (parent.stopped || parent.originals.some((original) => !original.known)) {
      if (await joinPrehelperRefusal()) {
        const report = reportPrehelperRefusal(cause);
        // Proof: reporting MODEL R3 bypassed this UNKNOWN retirement exclusion;
        // 'UC2 pre-helper Promise diagnostic return retains timers' failed its
        // HOLD identity oracle; exact restoration passed (2026-11-03).
        if (report.state !== 'unknown') {
          parent.prehelperRefusalTerminal = true;
          throw report.state === 'failed' ? report.failure : cause;
        }
      }
      return await stop(cause, 'parent-catch');
    }
    throw cause;
  } finally {
    if (
      parent.prehelperRefusalTerminal ||
      (!parent.stopped && parent.originals.every((original) => original.known))
    ) {
      clearTimeout(timer);
      clearInterval(keeper);
    }
  }
}
import { realpath as ordinaryHoldRealpath } from 'node:fs/promises';
import { resolve as ordinaryHoldResolve } from 'node:path';

// The ordinary V1 image is separate from the historical private constructor protocol.
export interface OrdinaryHoldSourcePinV1 {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface OrdinaryHoldSourceCutV1 {
  readonly before: string;
  readonly after: string;
  readonly count: number;
}
export type OrdinaryHoldSourceMappingV1 =
  | {
      readonly mode: 'transform';
      readonly path: string;
      readonly inputSha256: string;
      readonly outputSha256: string;
      readonly cuts: readonly OrdinaryHoldSourceCutV1[];
    }
  | {
      readonly mode: 'pinned-pass-through' | 'external-unchanged';
      readonly path: string;
      readonly sha256: string;
    };
export interface OrdinaryHoldImageV1 {
  readonly format: 'dependency-owner-ordinary-hold-image';
  readonly sourceEpoch: 'ordinary-febb-custody-v1';
  readonly version: 1;
  readonly sourceRoot: string;
  readonly sourceIdentity: string;
  readonly sourcePins: readonly OrdinaryHoldSourcePinV1[];
  readonly mappings: readonly OrdinaryHoldSourceMappingV1[];
  readonly mappingDigest: string;
  readonly titleDigest: string;
}

function ordinaryHoldFields(
  value: unknown,
  expected: readonly string[],
  subject: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${subject} requires a closed record`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(`${subject} record prototype differs`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== 'string' || !expected.includes(key))
  )
    throw new Error(`${subject} field set differs`);
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor))
      throw new Error(`${subject} data field absent`);
  }
  // The plain record, exact own keys and data descriptors were checked above.
  return value as Record<string, unknown>;
}
function ordinaryHoldSha(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new Error(`${subject} SHA-256 differs`);
  return value;
}
function ordinaryHoldAbsolute(path: unknown, subject: string): string {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path === '/' ||
    path.includes('\0') ||
    path.endsWith('/') ||
    path.includes('//') ||
    path.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error(`${subject} requires a canonical absolute path`);
  return path;
}

/**
 * Decodes an inert, closed ordinary image. This structural check grants no build or helper entry:
 * the later controller must compare actual source bytes, executable, root, maps and title census.
 */
export function decodeOrdinaryHoldImageV1(value: unknown): OrdinaryHoldImageV1 {
  const image = ordinaryHoldFields(
    value,
    [
      'format',
      'version',
      'sourceEpoch',
      'sourceRoot',
      'sourceIdentity',
      'sourcePins',
      'mappings',
      'mappingDigest',
      'titleDigest',
    ],
    'ordinary HOLD image',
  );
  if (
    image['format'] !== 'dependency-owner-ordinary-hold-image' ||
    image['version'] !== 1 ||
    image['sourceEpoch'] !== 'ordinary-febb-custody-v1'
  )
    throw new Error('ordinary HOLD image version differs');
  const sourceRoot = ordinaryHoldAbsolute(image['sourceRoot'], 'ordinary HOLD source root');
  const sourceIdentity = image['sourceIdentity'];
  if (typeof sourceIdentity !== 'string' || !/^[a-f0-9]{40}$/.test(sourceIdentity))
    throw new Error('ordinary HOLD source identity differs');
  if (
    !Array.isArray(image['sourcePins']) ||
    image['sourcePins'].length !== ordinaryHoldModuleModesV1.length
  )
    throw new Error('ordinary HOLD source pin roster differs');
  const sourcePins: OrdinaryHoldSourcePinV1[] = [];
  const pinPaths = new Set<string>();
  for (const candidate of image['sourcePins']) {
    const pin = ordinaryHoldFields(candidate, ['path', 'bytes', 'sha256'], 'ordinary HOLD pin');
    const path = ordinaryHoldAbsolute(pin['path'], 'ordinary HOLD pin');
    if (!ordinaryHoldModuleModesV1.some((entry) => path === `${sourceRoot}/${entry.relative}`))
      throw new Error('ordinary HOLD source pin roster differs');
    if (pinPaths.has(path)) throw new Error('ordinary HOLD duplicate pin path');
    if (typeof pin['bytes'] !== 'number' || !Number.isSafeInteger(pin['bytes']) || pin['bytes'] < 1)
      throw new Error('ordinary HOLD pin byte length differs');
    pinPaths.add(path);
    sourcePins.push(
      Object.freeze({
        path,
        bytes: pin['bytes'],
        sha256: ordinaryHoldSha(pin['sha256'], 'ordinary HOLD pin'),
      }),
    );
  }
  if (!Array.isArray(image['mappings']) || image['mappings'].length === 0)
    throw new Error('ordinary HOLD mappings absent');
  const mappings: OrdinaryHoldSourceMappingV1[] = [];
  const mappingPaths = new Set<string>();
  for (const candidate of image['mappings']) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      throw new Error('ordinary HOLD mapping requires a closed record');
    const modeDescriptor = Object.getOwnPropertyDescriptor(candidate, 'mode');
    const mode: unknown = modeDescriptor?.value;
    const mapping = ordinaryHoldFields(
      candidate,
      mode === 'transform'
        ? ['mode', 'path', 'inputSha256', 'outputSha256', 'cuts']
        : ['mode', 'path', 'sha256'],
      'ordinary HOLD mapping',
    );
    const path = ordinaryHoldAbsolute(mapping['path'], 'ordinary HOLD mapping');
    if (!pinPaths.has(path)) throw new Error('ordinary HOLD mapping pin absent');
    if (mappingPaths.has(path)) throw new Error('ordinary HOLD duplicate mapping path');
    const pin = sourcePins.find((entry) => entry.path === path);
    if (pin === undefined) throw new Error('ordinary HOLD mapping pin absent');
    const declared = ordinaryHoldModuleModesV1.find(
      (entry) => path === `${sourceRoot}/${entry.relative}`,
    );
    if (declared?.mode !== mode)
      throw new Error('ordinary HOLD mapping mode differs from fixed module roster');
    if (mode === 'transform') {
      if (pin.sha256 !== mapping['inputSha256'])
        throw new Error('ordinary HOLD mapping input pin differs');
      if (!Array.isArray(mapping['cuts']) || mapping['cuts'].length === 0)
        throw new Error('ordinary HOLD mapping cuts absent');
      const cuts: OrdinaryHoldSourceCutV1[] = [];
      for (const candidateCut of mapping['cuts']) {
        const cut = ordinaryHoldFields(
          candidateCut,
          ['before', 'after', 'count'],
          'ordinary HOLD cut',
        );
        if (
          typeof cut['before'] !== 'string' ||
          cut['before'].length === 0 ||
          typeof cut['after'] !== 'string' ||
          cut['after'] === cut['before'] ||
          typeof cut['count'] !== 'number' ||
          !Number.isSafeInteger(cut['count']) ||
          cut['count'] < 1
        )
          throw new Error('ordinary HOLD cut count or text differs');
        cuts.push(
          Object.freeze({
            before: cut['before'],
            after: cut['after'],
            count: cut['count'],
          }),
        );
      }
      mappings.push(
        Object.freeze({
          mode,
          path,
          inputSha256: pin.sha256,
          outputSha256: ordinaryHoldSha(mapping['outputSha256'], 'ordinary HOLD mapping output'),
          cuts: Object.freeze(cuts),
        }),
      );
    } else if (mode === 'pinned-pass-through' || mode === 'external-unchanged') {
      if (pin.sha256 !== mapping['sha256'])
        throw new Error('ordinary HOLD pass-through pin differs');
      mappings.push(Object.freeze({ mode, path, sha256: pin.sha256 }));
    } else {
      throw new Error('ordinary HOLD mapping mode differs');
    }
    mappingPaths.add(path);
  }
  if (mappingPaths.size !== pinPaths.size) throw new Error('ordinary HOLD mapping roster differs');
  const mappingDigest = ordinaryHoldSha(image['mappingDigest'], 'ordinary HOLD mapping');
  if (mappingDigest !== createHash('sha256').update(JSON.stringify(mappings)).digest('hex'))
    throw new Error('ordinary HOLD mapping digest differs');
  const titleDigest = ordinaryHoldSha(image['titleDigest'], 'ordinary HOLD title');
  if (
    titleDigest !== ordinaryHoldTitleDigestV1 ||
    createHash('sha256').update(JSON.stringify(ordinaryHoldCasesV1)).digest('hex') !==
      ordinaryHoldTitleDigestV1
  )
    throw new Error('ordinary HOLD title roster digest differs');
  return Object.freeze({
    format: 'dependency-owner-ordinary-hold-image',
    sourceEpoch: 'ordinary-febb-custody-v1',
    version: 1,
    sourceRoot,
    sourceIdentity,
    sourcePins: Object.freeze(sourcePins),
    mappings: Object.freeze(mappings),
    mappingDigest,
    titleDigest,
  });
}

/** Applies only reviewed literal cuts to supplied bytes; it never reads or builds a module. */
export function materializeOrdinaryHoldImageV1(
  image: OrdinaryHoldImageV1,
  supplied: ReadonlyMap<string, Uint8Array>,
): ReadonlyMap<string, Uint8Array> {
  if (
    supplied.size !== image.sourcePins.length ||
    image.mappings.length !== image.sourcePins.length
  )
    throw new Error('ordinary HOLD supplied source roster differs');
  const materialized = new Map<string, Uint8Array>();
  for (const mapping of image.mappings) {
    const bytes = supplied.get(mapping.path);
    const pin = image.sourcePins.find((entry) => entry.path === mapping.path);
    if (bytes === undefined || pin === undefined)
      throw new Error('ordinary HOLD source bytes absent');
    if (
      bytes.byteLength !== pin.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256
    )
      throw new Error('ordinary HOLD source bytes differ');
    if (mapping.mode !== 'transform') {
      if (mapping.sha256 !== pin.sha256)
        throw new Error('ordinary HOLD unchanged source pin differs');
      materialized.set(mapping.path, bytes);
      continue;
    }
    if (mapping.inputSha256 !== pin.sha256)
      throw new Error('ordinary HOLD transformed source pin differs');
    let source = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    for (const cut of mapping.cuts) {
      if (source.split(cut.before).length - 1 !== cut.count)
        throw new Error('ordinary HOLD source cut cardinality differs');
      source = source.replaceAll(cut.before, () => cut.after);
    }
    const transformed = new TextEncoder().encode(source);
    if (createHash('sha256').update(transformed).digest('hex') !== mapping.outputSha256)
      throw new Error('ordinary HOLD transformed source digest differs');
    materialized.set(mapping.path, transformed);
  }
  return materialized;
}

/** Exact module identities and image modes; arbitrary near-name maps are never accepted. */
export const ordinaryHoldModuleModesV1 = [
  {
    relative: 'tools/tool-remote-scripts/src/lib/edge-ownership.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts',
    mode: 'transform',
  },
  { relative: 'tools/tool-remote-scripts/src/lib/lock.ts', mode: 'transform' },
  {
    relative: 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts',
    mode: 'transform',
  },
  { relative: 'libs/wbs/adapters/store-sqlite/src/db.ts', mode: 'transform' },
  {
    relative: 'libs/wbs/adapters/store-sqlite/src/backup.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts',
    mode: 'external-unchanged',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/source-startup.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/source-database-binding.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/fixtures/namespace-audit.ts',
    mode: 'transform',
  },
  {
    relative: 'tools/tool-remote-scripts/src/lib/directory-file.ts',
    mode: 'pinned-pass-through',
  },
  {
    relative: 'libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts',
    mode: 'pinned-pass-through',
  },
  { relative: 'libs/wbs/adapters/store-sqlite/src/migrate.ts', mode: 'transform' },
] as const;

/** Closed ordinary case metadata only; registration and helper execution are later work. */
export const ordinaryHoldCasesV1 = [
  {
    caseId: 'direct-anchor-main-before-native',
    title: 'UC2 direct anchor-main close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-anchor-main-after-native-return',
    title: 'UC2 direct anchor-main close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-capture-read-before-native',
    title: 'UC2 direct capture-read close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-capture-read-after-native-return',
    title: 'UC2 direct capture-read close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-backup-read-before-native',
    title: 'UC2 direct backup-read close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-backup-read-after-native-return',
    title: 'UC2 direct backup-read close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-backup-finalizer-before-native',
    title: 'UC2 direct backup-finalizer close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-backup-finalizer-after-native-return',
    title: 'UC2 direct backup-finalizer close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-database-authority-before-native',
    title: 'UC2 direct database-authority close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-database-authority-after-native-return',
    title: 'UC2 direct database-authority close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-database-backup-before-native',
    title: 'UC2 direct database-backup close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-database-backup-after-native-return',
    title: 'UC2 direct database-backup close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-connection-authority-before-native',
    title: 'UC2 direct connection-authority close before-native retains actual runtime custody',
  },
  {
    caseId: 'direct-connection-authority-after-native-return',
    title:
      'UC2 direct connection-authority close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'direct-anchor-parent-before-native',
    title: 'UC2 direct anchor-parent close before-native retains actual runtime custody',
  },
  {
    caseId: 'inherited-graph-before-native',
    title: 'UC2 inherited Graph final-close before-native retains actual runtime custody',
  },
  {
    caseId: 'inherited-graph-after-native-return',
    title: 'UC2 inherited Graph final-close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'late-state-before-native',
    title: 'UC2 late state close before-native retains only outer custody',
  },
  {
    caseId: 'late-state-after-native-return',
    title: 'UC2 late state close after-native-return retains only outer custody',
  },
  {
    caseId: 'late-evidence-before-native',
    title: 'UC2 late evidence close before-native retains only outer custody',
  },
  {
    caseId: 'late-evidence-after-native-return',
    title: 'UC2 late evidence close after-native-return retains only outer custody',
  },
  {
    caseId: 'late-graph-before-native',
    title: 'UC2 late graph close before-native retains only outer custody',
  },
  {
    caseId: 'late-graph-after-native-return',
    title: 'UC2 late graph close after-native-return retains only outer custody',
  },
  {
    caseId: 'late-scanner-before-native',
    title: 'UC2 late scanner close before-native retains only outer custody',
  },
  {
    caseId: 'late-scanner-after-native-return',
    title: 'UC2 late scanner close after-native-return retains only outer custody',
  },
  {
    caseId: 'inherited-sqlite-before-native',
    title: 'UC2 inherited SQLite initialization before-native retains actual runtime custody',
  },
  {
    caseId: 'inherited-sqlite-after-native-return',
    title: 'UC2 inherited SQLite initialization after-native-return retains actual runtime custody',
  },
  {
    caseId: 'inherited-snapshot-before-native',
    title: 'UC2 inherited bounded snapshot close before-native retains actual runtime custody',
  },
  {
    caseId: 'inherited-snapshot-after-native-return',
    title:
      'UC2 inherited bounded snapshot close after-native-return retains actual runtime custody',
  },
  {
    caseId: 'runtime-evidence-transfer',
    title: 'UC2 runtime evidence transfer retains originals until outer cleanup',
  },
  {
    caseId: 'swallowed-release',
    title: 'UC2 swallowed release failure revokes observation before outer return',
  },
  {
    caseId: 'dropped-preparation-before-native',
    title: 'UC2 dropped preparation close before-native retains outer custody',
  },
  {
    caseId: 'dropped-preparation-after-native-return',
    title: 'UC2 dropped preparation close after-native-return retains outer custody',
  },
  {
    caseId: 'expired-preparation-known',
    title: 'UC2 expired preparation cleanup known never renews work',
  },
  {
    caseId: 'expired-preparation-before-native',
    title: 'UC2 expired preparation cleanup before-native never renews work',
  },
  {
    caseId: 'expired-preparation-after-native-return',
    title: 'UC2 expired preparation cleanup after-native-return never renews work',
  },
  {
    caseId: 'storage-operation-refusal',
    title: 'UC2 genuine storage operation refusal closes originals and releases all locks',
  },
  {
    caseId: 'migrated-anchor-close',
    title:
      'initial preparation anchor-close retains commits and closes directly owned original descriptors',
  },
  {
    caseId: 'migrated-operation-two-cleanups',
    title:
      'initial preparation operation-two-cleanups retains commits and closes directly owned original descriptors',
  },
] as const;
export type OrdinaryHoldCaseId = (typeof ordinaryHoldCasesV1)[number]['caseId'];
export const ordinaryHoldTitleDigestV1 =
  '7b3faabc063d5e2b0511655b313f51926425eb81c15c9e03f5a13c93cf473b16';

export type OrdinaryHoldPlanV1 =
  | {
      readonly mode: 'prepare';
      readonly profile: 'storage-leaf' | 'canonical-remote' | 'local-exact';
      readonly caseIds: readonly OrdinaryHoldCaseId[];
      readonly imageDigest: string;
      readonly titleDigest: string;
    }
  | {
      readonly mode: 'not-selected';
      readonly profile: 'local-exact';
      readonly caseIds: readonly [];
    };

const ORDINARY_HOLD_STORAGE_TEST = 'src/lib/dependency-activation-storage.test.ts';
const ORDINARY_HOLD_PROJECT = 'tools/tool-remote-scripts';
const ORDINARY_HOLD_CANONICAL_DISCOVERY = [
  'src',
  'test/edge-init.test.ts',
  'test/solver-drain-transport.test.ts',
  'test/solver-drain-fixture.test.ts',
  'test/source-exclusion-transport.test.ts',
  'test/source-exclusion-topology.test.ts',
  'test/source-exclusion-native.test.ts',
  'test/fixture-failure.test.ts',
] as const;
const ORDINARY_HOLD_KNOWN_ONLY_TITLE =
  'initial fenced envelope LF is admitted before the actual fenced publication';
function ordinaryHoldTokens(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((token, index) => token === expected[index])
  );
}
function ordinaryHoldSelectionPattern(title: string): string {
  if (!/^[A-Za-z0-9 -]+$/.test(title))
    throw new Error('ordinary HOLD fixed title contains unsupported pattern characters');
  return `--test-name-pattern=^${title}$`;
}

/**
 * Plans only exact source-known Bun vectors from a supplied invocation descriptor. The later
 * command reader must verify actual kernel argv, executable, config bytes and environment.
 * This pure plan neither creates an observation nor authorizes helper entry by itself.
 */
export function planOrdinaryHoldAdmissionV1(
  imageValue: unknown,
  invocationValue: unknown,
): OrdinaryHoldPlanV1 {
  const image = decodeOrdinaryHoldImageV1(imageValue);
  const invocation = ordinaryHoldFields(
    invocationValue,
    [
      'format',
      'version',
      'sourceRoot',
      'cwd',
      'executable',
      'executableVersion',
      'argv',
      'environment',
      'configuration',
    ],
    'ordinary HOLD invocation',
  );
  if (
    invocation['format'] !== 'dependency-owner-ordinary-hold-invocation' ||
    invocation['version'] !== 1
  )
    throw new Error('ordinary HOLD invocation version differs');
  const sourceRoot = ordinaryHoldAbsolute(
    invocation['sourceRoot'],
    'ordinary HOLD invocation root',
  );
  const cwd = ordinaryHoldAbsolute(invocation['cwd'], 'ordinary HOLD invocation cwd');
  const executable = ordinaryHoldAbsolute(invocation['executable'], 'ordinary HOLD Bun executable');
  const rawArgv = invocation['argv'];
  if (!Array.isArray(rawArgv)) throw new Error('ordinary HOLD invocation argument vector differs');
  const argv: string[] = [];
  for (const token of rawArgv) {
    if (typeof token !== 'string')
      throw new Error('ordinary HOLD invocation argument token differs');
    argv.push(token);
  }
  if (
    sourceRoot !== image.sourceRoot ||
    (cwd !== `${sourceRoot}/${ORDINARY_HOLD_PROJECT}` && cwd !== sourceRoot) ||
    invocation['executableVersion'] !== '1.4.4' ||
    argv[0] !== executable
  )
    throw new Error('ordinary HOLD invocation executable or root differs');
  const environment = invocation['environment'];
  if (typeof environment !== 'object' || environment === null || Array.isArray(environment))
    throw new Error('ordinary HOLD invocation environment differs');
  if (Object.getPrototypeOf(environment) !== Object.prototype)
    throw new Error('ordinary HOLD invocation environment prototype differs');
  // The plain environment record was checked before looking at fixed selection keys.
  const environmentFields = environment as Record<string, unknown>;
  for (const name of Reflect.ownKeys(environment)) {
    if (typeof name !== 'string' || !Object.hasOwn(environment, name))
      throw new Error('ordinary HOLD invocation environment field differs');
    const descriptor = Object.getOwnPropertyDescriptor(environment, name);
    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      (descriptor.value !== undefined && typeof descriptor.value !== 'string')
    )
      throw new Error('ordinary HOLD invocation environment value differs');
    if (
      name === 'BUN_OPTIONS' ||
      name === 'NODE_OPTIONS' ||
      name.startsWith('BUN_TEST_') ||
      name.startsWith('PUNI_UC2_') ||
      (name.startsWith('PUNI_ORDINARY_HOLD_') && name !== 'PUNI_ORDINARY_HOLD_SELECTION')
    )
      throw new Error('ordinary HOLD invocation selection override refused');
  }
  const configuration = ordinaryHoldFields(
    invocation['configuration'],
    ['kind', 'path', 'sha256'],
    'ordinary HOLD Bun configuration',
  );
  const configKind = configuration['kind'];
  if (configKind !== 'absent' && configKind !== 'empty-explicit')
    throw new Error('ordinary HOLD Bun configuration mode differs');
  const configPath = configuration['path'];
  const configHash = configuration['sha256'];
  if (configKind === 'absent' && (configPath !== null || configHash !== null))
    throw new Error('ordinary HOLD unconfigured Bun identity differs');
  if (configKind === 'empty-explicit') {
    ordinaryHoldAbsolute(configPath, 'ordinary HOLD empty Bun config');
    if (configHash !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
      throw new Error('ordinary HOLD empty Bun config differs');
  }
  const hasSelection = Object.hasOwn(environmentFields, 'PUNI_ORDINARY_HOLD_SELECTION');
  const selection = environmentFields['PUNI_ORDINARY_HOLD_SELECTION'];
  const normalOptions = ['--preload', '../test/scratch/preload.ts', '--timeout=10000'];
  const singleton = [executable, 'test', `./${ORDINARY_HOLD_STORAGE_TEST}`, ...normalOptions];
  const canonical = [
    executable,
    'test',
    ...ORDINARY_HOLD_CANONICAL_DISCOVERY,
    ...normalOptions,
    '--path-ignore-patterns=src/lib/initial-handoff-graph.test.ts',
    '--path-ignore-patterns=acceptance/dependency-owner-custody.test.ts',
  ];
  const imageDigest = createHash('sha256').update(JSON.stringify(image)).digest('hex');
  const fullCaseIds = Object.freeze(ordinaryHoldCasesV1.map((row) => row.caseId));
  if (
    cwd === `${sourceRoot}/${ORDINARY_HOLD_PROJECT}` &&
    configKind === 'absent' &&
    !hasSelection &&
    ordinaryHoldTokens(argv, singleton)
  )
    return Object.freeze({
      mode: 'prepare',
      profile: 'storage-leaf',
      caseIds: fullCaseIds,
      imageDigest,
      titleDigest: image.titleDigest,
    });
  if (
    cwd === `${sourceRoot}/${ORDINARY_HOLD_PROJECT}` &&
    configKind === 'absent' &&
    !hasSelection &&
    ordinaryHoldTokens(argv, canonical)
  )
    return Object.freeze({
      mode: 'prepare',
      profile: 'canonical-remote',
      caseIds: fullCaseIds,
      imageDigest,
      titleDigest: image.titleDigest,
    });
  if (
    cwd !== sourceRoot ||
    configKind !== 'empty-explicit' ||
    typeof configPath !== 'string' ||
    !hasSelection
  )
    throw new Error('ordinary HOLD invocation selection refused');
  const localPrefix = [
    executable,
    'test',
    '--no-env-file',
    `--config=${configPath}`,
    '--preload',
    './tools/test/scratch/preload.ts',
    '--timeout=10000',
    `${ORDINARY_HOLD_PROJECT}/${ORDINARY_HOLD_STORAGE_TEST}`,
  ];
  if (
    selection === 'known-only' &&
    ordinaryHoldTokens(argv, [
      ...localPrefix,
      ordinaryHoldSelectionPattern(ORDINARY_HOLD_KNOWN_ONLY_TITLE),
    ])
  )
    return Object.freeze({
      mode: 'not-selected',
      profile: 'local-exact',
      caseIds: [] as const,
    });
  const row = ordinaryHoldCasesV1.find((candidate) => candidate.caseId === selection);
  if (
    row === undefined ||
    !ordinaryHoldTokens(argv, [...localPrefix, ordinaryHoldSelectionPattern(row.title)])
  )
    throw new Error('ordinary HOLD invocation selection refused');
  return Object.freeze({
    mode: 'prepare',
    profile: 'local-exact',
    caseIds: Object.freeze([row.caseId]),
    imageDigest,
    titleDigest: image.titleDigest,
  });
}

export type OrdinaryHoldOracleFailureV1 =
  | 'source-image'
  | 'body-settlement'
  | 'native-close'
  | 'lock-exclusion'
  | 'deadline'
  | 'publication'
  | 'original-identity'
  | 'child-join'
  | 'stream-join'
  | 'retirement'
  | 'safe-failure';
export interface OrdinaryHoldObservationV1 {
  readonly format: 'dependency-owner-ordinary-hold';
  readonly version: 1;
  readonly invocationId: string;
  readonly caseId: OrdinaryHoldCaseId;
  readonly title: string;
  readonly production: 'known-refusal' | 'known-prepared' | 'runtime-hold' | 'outer-hold';
  readonly retirement: 'known-originals-closed';
  readonly failures: readonly OrdinaryHoldOracleFailureV1[];
  readonly imageDigest: string;
  readonly titleDigest: string;
  readonly evidenceDigest: string;
}
const ORDINARY_HOLD_ORACLE_CODES = [
  'source-image',
  'body-settlement',
  'native-close',
  'lock-exclusion',
  'deadline',
  'publication',
  'original-identity',
  'child-join',
  'stream-join',
  'retirement',
  'safe-failure',
] as const;

/** Decodes a supplied closed packet; no packet proves its own production or retirement claims. */
export function decodeOrdinaryHoldObservationV1(value: unknown): OrdinaryHoldObservationV1 {
  const packet = ordinaryHoldFields(
    value,
    [
      'format',
      'version',
      'invocationId',
      'caseId',
      'title',
      'production',
      'retirement',
      'failures',
      'imageDigest',
      'titleDigest',
      'evidenceDigest',
    ],
    'ordinary HOLD observation',
  );
  if (packet['format'] !== 'dependency-owner-ordinary-hold' || packet['version'] !== 1)
    throw new Error('ordinary HOLD observation version differs');
  const invocationId = packet['invocationId'];
  if (
    typeof invocationId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(invocationId)
  )
    throw new Error('ordinary HOLD observation invocation differs');
  const row = ordinaryHoldCasesV1.find((candidate) => candidate.caseId === packet['caseId']);
  if (row === undefined || row.title !== packet['title'])
    throw new Error('ordinary HOLD observation case title differs');
  const production = packet['production'];
  if (
    production !== 'known-refusal' &&
    production !== 'known-prepared' &&
    production !== 'runtime-hold' &&
    production !== 'outer-hold'
  )
    throw new Error('ordinary HOLD observation production phase differs');
  if (packet['retirement'] !== 'known-originals-closed')
    throw new Error('ordinary HOLD observation retirement differs');
  const candidates = packet['failures'];
  if (!Array.isArray(candidates)) throw new Error('ordinary HOLD observation oracle code differs');
  const failures: OrdinaryHoldOracleFailureV1[] = [];
  for (let index = 0; index < candidates.length; index++) {
    if (!Object.hasOwn(candidates, index))
      throw new Error('ordinary HOLD observation oracle code differs');
    const code = ORDINARY_HOLD_ORACLE_CODES.find((accepted) => accepted === candidates[index]);
    if (code === undefined) throw new Error('ordinary HOLD observation oracle code differs');
    failures.push(code);
  }
  const titleDigest = ordinaryHoldSha(packet['titleDigest'], 'ordinary HOLD observation title');
  if (titleDigest !== ordinaryHoldTitleDigestV1)
    throw new Error('ordinary HOLD observation title digest differs');
  return Object.freeze({
    format: 'dependency-owner-ordinary-hold',
    version: 1,
    invocationId,
    caseId: row.caseId,
    title: row.title,
    production,
    retirement: 'known-originals-closed',
    failures: Object.freeze([...failures]),
    imageDigest: ordinaryHoldSha(packet['imageDigest'], 'ordinary HOLD observation image'),
    titleDigest,
    evidenceDigest: ordinaryHoldSha(packet['evidenceDigest'], 'ordinary HOLD observation evidence'),
  });
}

/** Fixed source bytes for the ordinary image compiler epoch at published febb1c244. */
export const ordinaryHoldHistoricalSourceEpochV1 = Object.freeze({
  sourceIdentity: 'febb1c24427b2d368aa2d6446d6000dc1faabdb3',
  pins: Object.freeze([
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/edge-ownership.ts',
      bytes: 83874,
      sha256: 'd979452d02089652c12515af8bfcaeede1fa13bc458a66013f5463555b528f68',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts',
      bytes: 34665,
      sha256: 'e8ac098736b6cc538693437ae9c923819f5783fb8df61285d4f217a0f1b2154a',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts',
      bytes: 43658,
      sha256: 'ab7766c66a8a53fb84f11f3e0262802295ad823854b1cb4df13899bfddd2b798',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/lock.ts',
      bytes: 8844,
      sha256: '6d2c29fa57f4356f28f0ba0287f15c0c8a49dded94b251d12a33c3e11a28d40d',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts',
      bytes: 91002,
      sha256: 'bdf3da709f70238e073fcc7db1f51870e855959477048645c1fcd46bb3b042ef',
    }),
    Object.freeze({
      relative: 'libs/wbs/adapters/store-sqlite/src/db.ts',
      bytes: 24545,
      sha256: '3071cca955b20084cac3c769dad23b0741a34ad4204d6f7e4dbb476392715120',
    }),
    Object.freeze({
      relative: 'libs/wbs/adapters/store-sqlite/src/backup.ts',
      bytes: 25178,
      sha256: 'c681a4ec8fc6d8b2787647507e8f8357146cff261cba75250ae446cea305a230',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts',
      bytes: 9796,
      sha256: 'fd749af5d221bafecfb7581d61e187a0ef15bcdb59a077eed25e86b0ce382ace',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts',
      bytes: 5394,
      sha256: '32c05b771edbab3f5f6fd448aaa0de7184f16e6ffe21e1d84444c66087d841bc',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts',
      bytes: 17432,
      sha256: 'ae37e7411040d680ab04419090a546fcddfc7f295697d99ff9e46ff7d915d91e',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/source-startup.ts',
      bytes: 4791,
      sha256: '0c8e0b6afc98008f34352d68254fbe137265c46a24fa0edf482dcf1ca341783b',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/source-database-binding.ts',
      bytes: 14053,
      sha256: 'b83a928aae6880c6142c4dc6d0f584fa085d5039a1b4f70512c73f5819d5bbd4',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts',
      bytes: 5425,
      sha256: 'a4f9378c421110a43d2a2db51edb9e56afc38cbb6bfc74f954322b2810d196c0',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/fixtures/namespace-audit.ts',
      bytes: 10450,
      sha256: '63a0506377f8d7c4ee7701e06a155bccb65ab8abd0783d5d4f6929e491bab015',
    }),
    Object.freeze({
      relative: 'tools/tool-remote-scripts/src/lib/directory-file.ts',
      bytes: 3520,
      sha256: 'b3d0480ceaa6fc88e19278cfc667919d1803173f5fdccaf5e4b33bf2c97e7e0c',
    }),
    Object.freeze({
      relative: 'libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts',
      bytes: 2479,
      sha256: '83785f02655bf81514328255fe45e047b4b79a5374fdebb3a269d2d2687ac74b',
    }),
  ]),
});

/** Current custody epoch adds the exact migration implementation to historical source identities. */
export const ordinaryHoldSourceEpochV1 = Object.freeze({
  sourceEpoch: 'ordinary-febb-custody-v1' as const,
  sourceIdentity: ordinaryHoldHistoricalSourceEpochV1.sourceIdentity,
  pins: Object.freeze([
    ...ordinaryHoldHistoricalSourceEpochV1.pins,
    Object.freeze({
      relative: 'libs/wbs/adapters/store-sqlite/src/migrate.ts',
      bytes: 8962,
      sha256: '029cd9f29f1b555175c4fe6d758e2921c2d6abe320210b9b5f7cd079cace9f8f',
    }),
  ]),
});

/** Resolves only classifier-sensitive imports to one canonical module per ordinary image. */
export function resolveOrdinaryHoldImportV1(
  sourceRoot: string,
  importer: string,
  specifier: string,
): { readonly path: string; readonly external: boolean } | undefined {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD resolver root');
  const from = ordinaryHoldAbsolute(importer, 'ordinary HOLD resolver importer');
  if (!from.startsWith(`${root}/`)) throw new Error('ordinary HOLD importer outside source root');
  if (specifier.startsWith('ordinary-hold-v1:'))
    throw new Error('ordinary HOLD unknown virtual port');
  const aliases: Readonly<Record<string, string>> = {
    '@wbs/store-sqlite/db': 'libs/wbs/adapters/store-sqlite/src/db.ts',
    '@wbs/store-sqlite/backup': 'libs/wbs/adapters/store-sqlite/src/backup.ts',
    '@wbs/store-sqlite/sqlite-cleanup': 'libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts',
  };
  let destination: string | undefined;
  if (Object.hasOwn(aliases, specifier)) destination = `${root}/${aliases[specifier]}`;
  else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const directory = from.slice(0, from.lastIndexOf('/'));
    destination = join(directory, specifier.endsWith('.ts') ? specifier : `${specifier}.ts`);
  } else if (specifier.startsWith(`${root}/`)) destination = specifier;
  if (destination === undefined) return undefined;
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  const canonical = [
    'tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts',
    'libs/wbs/adapters/store-sqlite/src/db.ts',
    'libs/wbs/adapters/store-sqlite/src/backup.ts',
    'libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts',
    'tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts',
  ];
  if (!canonical.some((relative) => destination === `${root}/${relative}`)) return undefined;
  return { path: destination, external: destination === scanner };
}

interface OrdinaryHoldConcreteCutV1 extends OrdinaryHoldSourceCutV1 {
  readonly id: string;
}

/** Fixed febb source cuts. Missing runtime taps remain explicit build qualifications. */
function ordinaryHoldConcreteCutsV1(
  relative: string,
  sourceRoot: string,
): readonly OrdinaryHoldConcreteCutV1[] {
  const cut = (id: string, before: string, after: string, count = 1) =>
    Object.freeze({ id, before, after, count });
  const fs = (id: string, port: string, count = 1) =>
    cut(id, "from 'node:fs';", `from 'ordinary-hold-v1:${port}';`, count);
  const asyncFs = (id: string, port: string) =>
    cut(id, "from 'node:fs/promises';", `from 'ordinary-hold-v1:${port}';`);
  switch (relative) {
    case 'tools/tool-remote-scripts/src/lib/edge-ownership.ts':
      return [
        fs('owner.fs', 'owner-fs'),
        cut(
          'owner.observation-import',
          "import { createHash, randomUUID } from 'node:crypto';",
          "import { createHash, randomUUID } from 'node:crypto';\nimport { captureSettlement, captureOperation, captureRuntimeEntry, captureKeeper, captureOriginal, captureHold } from 'ordinary-hold-v1:ledger';",
        ),
        cut(
          'owner.settlement-observer',
          '  settlement.observer = observer;',
          '  settlement.observer = observer;\n  captureSettlement(record, settlement, original, observer);',
        ),
        cut(
          'owner.operation-observer',
          '  observed.observer = observer;',
          '  observed.observer = observer;\n  captureOperation(operation, observed, original, observer);',
        ),
        cut(
          'owner.runtime-entry',
          '  entry.observer = observer;',
          '  entry.observer = observer;\n  captureRuntimeEntry(owner, ownership, entry, original, observer);',
        ),
        cut(
          'owner.keeper',
          '  ownership.keeper = keeper;',
          '  ownership.keeper = keeper;\n  captureKeeper(owner, ownership, keeper);',
        ),
        cut(
          'owner.original',
          '  record.originals.add(observed);',
          '  record.originals.add(observed);\n  captureOriginal(preparation, original, observed);',
        ),
        cut(
          'owner.hold',
          '  await keeper.pending;',
          '  captureHold(owner, ownership, keeper);\n  await keeper.pending;',
        ),

        cut(
          'owner.timer-import',
          "import { createHash, randomUUID } from 'node:crypto';",
          "import { createHash, randomUUID } from 'node:crypto';\nimport { ordinaryHoldSetInterval, ordinaryHoldClearInterval } from 'ordinary-hold-v1:owner-timer';",
        ),
        cut(
          'owner.interval',
          'setInterval(() => retained, 60000)',
          'ordinaryHoldSetInterval(() => retained, 60000)',
        ),
        cut(
          'owner.clear',
          'clearInterval(ownership.keeper.interval)',
          'ordinaryHoldClearInterval(ownership.keeper.interval)',
        ),
      ];
    case 'tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts':
      return [
        fs('storage.fs-main-and-finalizer', 'storage-fs', 2),
        cut(
          'storage.database',
          "from '@wbs/store-sqlite/db';",
          "from 'ordinary-hold-v1:storage-database';",
        ),
        cut(
          'storage.graph',
          "from './initial-handoff-graph';",
          "from 'ordinary-hold-v1:storage-graph';",
        ),
      ];
    case 'tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts':
      return [
        cut(
          'complete.storage',
          "from './dependency-activation-storage';",
          "from 'ordinary-hold-v1:complete-storage';",
        ),
        cut(
          'complete.scanner',
          "from './dependency-migration-artifact-scanner';",
          "from 'ordinary-hold-v1:complete-scanner';",
        ),
      ];
    case 'tools/tool-remote-scripts/src/lib/lock.ts':
      return [fs('lock.fs', 'lock-fs')];
    case 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts':
      return [
        fs('graph.fs', 'graph-fs'),
        cut(
          'graph.relative',
          "from './directory-file';",
          "from 'ordinary-hold-v1:graph-relative';",
        ),
      ];
    case 'libs/wbs/adapters/store-sqlite/src/db.ts':
      return [
        cut(
          'database.readonly-import',
          "import { Database, SQLiteError } from 'bun:sqlite';",
          "import { Database, SQLiteError } from 'bun:sqlite';\nimport { ordinaryHoldOpenReadonly } from 'ordinary-hold-v1:database-readonly';",
        ),
        cut(
          'database.readwrite-import',
          "import { Database, SQLiteError } from 'bun:sqlite';",
          "import { Database, SQLiteError } from 'bun:sqlite';\nimport { ordinaryHoldOpenReadwrite } from 'ordinary-hold-v1:database-readwrite';",
        ),
        cut(
          'database.readwrite-enter-return',
          'const db = new Database(dbPath, { create: isCreateAllowed, readwrite: true });',
          'const db = ordinaryHoldOpenReadwrite(dbPath, isCreateAllowed);',
        ),
        cut(
          'database.readonly-enter-return',
          'const client = new Database(dbPath, { readonly: true, create: false });',
          'const client = ordinaryHoldOpenReadonly(dbPath);',
        ),
      ];
    case 'libs/wbs/adapters/store-sqlite/src/backup.ts':
      return [fs('backup.fs', 'backup-fs')];
    case 'libs/wbs/adapters/store-sqlite/src/migrate.ts':
      return [fs('migration.fs', 'migration-fs')];
    case 'tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts':
      return [
        asyncFs('setup.participant.fs', 'setup-participant-fs'),
        cut(
          'child.emitter.import',
          "from 'ordinary-hold-v1:setup-participant-fs';",
          "from 'ordinary-hold-v1:setup-participant-fs';\nimport { spawnOrdinaryEmitter, joinOrdinaryChild } from 'ordinary-hold-v1:child-emitter';",
        ),
        cut(
          'child.emitter.spawn',
          "      const child = Bun.spawn(\n        [\n          process.execPath,\n          '--no-env-file',\n          'run',\n          'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts',\n        ],\n        {\n          cwd: fixture.sourceRoot,\n          env: { PATH: process.env['PATH'], BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },\n          stdout: 'pipe',\n          stderr: 'pipe',\n        },\n      );\n",
          '      const child = spawnOrdinaryEmitter(fixture.sourceRoot);\n',
        ),
        cut(
          'child.emitter.join',
          "      const cancel = () => {\n        child.kill('SIGKILL');\n      };\n      signal?.addEventListener('abort', cancel, { once: true });\n      try {\n        const [stdout, stderr, code] = await Promise.all([\n          new Response(child.stdout).text(),\n          new Response(child.stderr).text(),\n          child.exited,\n        ]);\n        if (code !== 0 || stderr !== '') throw new Error('native fixture source emitter failed');\n        return stdout;\n      } finally {\n        signal?.removeEventListener('abort', cancel);\n      }\n",
          "      const [stdout, stderr, code] = await joinOrdinaryChild(child);\n      if (code !== 0 || stderr !== '') throw new Error('native fixture source emitter failed');\n      return stdout;\n",
        ),
      ];
    case 'tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts':
      return [
        asyncFs('setup.complete.fs', 'setup-complete-fs'),
        cut(
          'child.collector.transport',
          "from '../lib/installed-authority-transport';",
          "from 'ordinary-hold-v1:child-collector';",
        ),
        cut(
          'child.collector.import',
          "import { readAuthorityCollector } from 'ordinary-hold-v1:child-collector';",
          "import { readAuthorityCollector, spawnOrdinaryCollector } from 'ordinary-hold-v1:child-collector';",
        ),
        cut(
          'child.collector.spawn',
          "Bun.spawn(['/usr/bin/python3', '-I', '-'], {\n        stdin: new TextEncoder().encode(program),\n        stdout: 'pipe',\n        stderr: 'pipe',\n      })",
          'spawnOrdinaryCollector(program, deadline)',
        ),
        cut(
          'setup.complete.migrations',
          "from '@wbs/store-sqlite/migrate';",
          "from 'ordinary-hold-v1:migration-call';",
        ),
        cut(
          'setup.complete.write-import',
          "from 'ordinary-hold-v1:setup-complete-fs';",
          "from 'ordinary-hold-v1:setup-complete-fs';\nimport { writeOrdinaryComplete } from 'ordinary-hold-v1:setup-complete-write';",
        ),
        cut(
          'setup.complete.write.prod',
          "Bun.write(base.prodPath, '')",
          "writeOrdinaryComplete('complete.write.prod', base.prodPath, '')",
        ),
        cut(
          'setup.complete.write.dev',
          "Bun.write(base.devPath, '')",
          "writeOrdinaryComplete('complete.write.dev', base.devPath, '')",
        ),
        cut(
          'setup.migration-root',
          "const migrationsDirectory = new URL('../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;",
          `const migrationsDirectory = ${JSON.stringify(`${sourceRoot}/apps/wbs/be-01/drizzle`)};`,
        ),
      ];
    case 'tools/tool-remote-scripts/src/fixtures/source-startup.ts':
      return [
        asyncFs('setup.startup.fs', 'setup-startup-fs'),
        cut(
          'child.git.import',
          "import { createHash } from 'node:crypto';",
          "import { createHash } from 'node:crypto';\nimport { spawnOrdinaryGit, joinOrdinaryChild } from 'ordinary-hold-v1:child-git';",
        ),
        cut(
          'child.git.spawn',
          "  const child = Bun.spawn(['git', '--no-optional-locks', '-C', root, ...args], {\n    stdout: 'pipe',\n    stderr: 'pipe',\n    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },\n  });\n",
          '  const child = spawnOrdinaryGit(root, args);\n',
        ),
        cut(
          'child.git.join',
          '  const [stdout, stderr, code] = await Promise.all([\n    new Response(child.stdout).text(),\n    new Response(child.stderr).text(),\n    child.exited,\n  ]);\n',
          '  const [stdout, stderr, code] = await joinOrdinaryChild(child);\n',
        ),
      ];
    case 'tools/tool-remote-scripts/src/fixtures/source-database-binding.ts':
      return [asyncFs('setup.database.fs', 'setup-database-fs')];
    case 'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts':
      return [
        asyncFs('setup.frontend.fs', 'setup-frontend-fs'),
        cut(
          'setup.frontend-root',
          "const ROOT = resolve(import.meta.dir, '../../../..');",
          `const ROOT = ${JSON.stringify(sourceRoot)};`,
        ),
      ];
    case 'tools/tool-remote-scripts/src/fixtures/namespace-audit.ts':
      return [
        asyncFs('setup.namespace.fs', 'setup-namespace-fs'),
        cut(
          'child.namespace.import',
          "from 'ordinary-hold-v1:setup-namespace-fs';",
          "from 'ordinary-hold-v1:setup-namespace-fs';\nimport { spawnOrdinaryNamespace, joinOrdinaryChild } from 'ordinary-hold-v1:child-namespace';",
        ),
        cut(
          'child.namespace.spawn',
          "    const child = Bun.spawn(\n      [\n        ...credentials,\n        '/usr/bin/busybox',\n        'sh',\n        '-c',\n        emitted,\n        '--',\n        nonce,\n        ...argumentsForProgram,\n      ],\n      { stdout: 'pipe', stderr: 'pipe' },\n    );\n",
          '    const child = spawnOrdinaryNamespace(credentials, emitted, nonce, argumentsForProgram);\n',
        ),
        cut(
          'child.namespace.join',
          '    const [stdout, stderr, code] = await Promise.all([\n      new Response(child.stdout).text(),\n      new Response(child.stderr).text(),\n      child.exited,\n    ]);\n',
          '    const [stdout, stderr, code] = await joinOrdinaryChild(child);\n',
        ),
        cut(
          'setup.namespace.write.0',
          "Bun.write(`${database}${suffix}`, 'family')",
          "writeOrdinaryNamespace('namespace.write.0', `${database}${suffix}`, 'family')",
        ),
        cut(
          'setup.namespace.write.1',
          "Bun.write(`${namespace}${destination}/nested/ordinary`, 'ordinary')",
          "writeOrdinaryNamespace('namespace.write.1', `${namespace}${destination}/nested/ordinary`, 'ordinary')",
        ),
        cut(
          'setup.namespace.write.2',
          "Bun.write(`${namespace}/data/wbs.db${suffix}`, 'wrong inode')",
          "writeOrdinaryNamespace('namespace.write.2', `${namespace}/data/wbs.db${suffix}`, 'wrong inode')",
        ),
        cut(
          'setup.namespace.write.3',
          "Bun.write(mountinfo, fault === 'mountinfo-malformed' ? 'malformed' : lines.join('\\n'))",
          "writeOrdinaryNamespace('namespace.write.3', mountinfo, fault === 'mountinfo-malformed' ? 'malformed' : lines.join('\\n'))",
        ),
        cut(
          'setup.namespace.write.4',
          "Bun.write(database, 'replacement')",
          "writeOrdinaryNamespace('namespace.write.4', database, 'replacement')",
        ),
        cut(
          'setup.namespace.write-import',
          "from 'ordinary-hold-v1:setup-namespace-fs';",
          "from 'ordinary-hold-v1:setup-namespace-fs';\nimport { writeOrdinaryNamespace } from 'ordinary-hold-v1:setup-namespace-write';",
        ),
      ];
    default:
      throw new Error('ordinary HOLD fixed transform recipe absent');
  }
}

const ORDINARY_HOLD_FS_NAMES = [
  'closeSync',
  'fstatSync',
  'fsyncSync',
  'readFileSync',
  'readSync',
  'writeFileSync',
  'fchmodSync',
  'lstatSync',
  'openSync',
  'readdirSync',
  'realpathSync',
  'mkdirSync',
  'ftruncateSync',
  'statSync',
  'writeSync',
  'opendirSync',
  'copyFileSync',
  'existsSync',
  'renameSync',
  'rmSync',
] as const;
const ORDINARY_HOLD_ASYNC_FS_NAMES = [
  'chmod',
  'cp',
  'lstat',
  'mkdir',
  'mkdtemp',
  'readdir',
  'symlink',
  'writeFile',
  'readFile',
  'rename',
  'stat',
  'link',
  'rm',
] as const;

/** Fixed generated ports forward real APIs and retain their actual return/throw identities. */
function ordinaryHoldPortSourcesV1(sourceRoot: string): ReadonlyMap<string, string> {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD port root');
  const port = (name: string, source: string): readonly [string, string] => [
    `ordinary-hold-v1:${name}`,
    source,
  ];
  const fixedSync =
    "const invoke=(label,original,receiver,args)=>{const record=reserveOperation(label,'sync',receiver,args);try{return returnOperation(record,Reflect.apply(original,receiver,args));}catch(cause){throwOperation(record,cause);throw cause;}};";
  const fixedPromise =
    "const invoke=(label,original,receiver,args)=>{const record=reserveOperation(label,'promise',receiver,args);try{return attachPromise(record,Reflect.apply(original,receiver,args));}catch(cause){throwOperation(record,cause);throw cause;}};";
  const ledgerImports =
    "import {inspectLedger,linkWrapper,reserveNative,attachNative,throwNative,retainNativeClose,retainNativeIdentity,beginClose,returnClose,throwClose,reserveOperation,returnOperation,throwOperation,attachPromise} from 'ordinary-hold-v1:ledger';\n";
  const nativeFs = (label: string) => {
    const functions = ORDINARY_HOLD_FS_NAMES.map((name) => {
      if (name === 'openSync')
        return `export const openSync=(...args)=>{const record=reserveNative('${label}.openSync','fd',args,native);try{const descriptor=attachNative(record,Reflect.apply(native.openSync,native,args));retainNativeClose(record,native.closeSync,native,[descriptor]);retainNativeIdentity(record,Reflect.apply(native.fstatSync,native,[descriptor,{bigint:true}]));return descriptor;}catch(cause){throwNative(record,cause);throw cause;}};`;
      if (name === 'closeSync')
        return `export const closeSync=(...args)=>{const record=beginClose(args[0],'production');try{const returned=Reflect.apply(native.closeSync,native,args);returnClose(record);return returned;}catch(cause){throwClose(record,cause);throw cause;}};`;
      if (name === 'opendirSync' && label === 'graph')
        return `export const opendirSync=(...args)=>{const record=reserveNative('graph.opendirSync','dir',args,native);try{const directory=attachNative(record,Reflect.apply(native.opendirSync,native,args));const savedClose=directory.closeSync;retainNativeClose(record,savedClose,directory,[]);directory.closeSync=function(...closeArgs){beginClose(directory,'production');try{const returned=Reflect.apply(savedClose,this,closeArgs);returnClose(record);return returned;}catch(cause){throwClose(record,cause);throw cause;}};return directory;}catch(cause){throwNative(record,cause);throw cause;}};`;
      return `export const ${name}=(...args)=>invoke('${label}.${name}',native.${name},native,args);`;
    });
    return `import * as native from 'node:fs';\n${ledgerImports}${fixedSync}\nexport type { BigIntStats, Dir } from 'node:fs';\nexport const constants=native.constants;\n${functions.join('\n')}`;
  };
  const promiseFs = (label: string) =>
    `import * as native from 'node:fs/promises';\n${ledgerImports}${fixedPromise}\n` +
    ORDINARY_HOLD_ASYNC_FS_NAMES.map(
      (name) =>
        `export const ${name}=(...args)=>invoke('${label}.${name}',native.${name},native,args);`,
    ).join('\n');
  const operationLabels = [
    ...(['owner', 'storage', 'lock', 'graph', 'backup'] as const).flatMap((label) =>
      ORDINARY_HOLD_FS_NAMES.map((name) => `${label}.${name}`),
    ),
    ...(
      ['participant', 'complete', 'startup', 'database', 'frontend', 'namespace'] as const
    ).flatMap((label) => ORDINARY_HOLD_ASYNC_FS_NAMES.map((name) => `setup.${label}.${name}`)),
    'owner.interval',
    'owner.clear',
    'storage.database.connection',
    'storage.database.database',
    'storage.graph',
    'complete.storage',
    'complete.scanner',
    'setup.runMigrations',
    'complete.write.prod',
    'complete.write.dev',
    ...Array.from({ length: 5 }, (_, index) => `namespace.write.${index.toString()}`),
  ];
  const ledger =
    `const custody={natives:[],operations:[],owners:[],events:[],stopped:false,failures:[],generation:0,fatalObservation:undefined};
const records=new WeakMap(),nativeAliases=new Map(),wrappers=new Map();
const migrationCalls=[],migrationRoots=[],migrationTickets=new WeakMap();
const migrationLimits=Object.freeze({mkdtempSync:2,cpSync:210,rmSync:2,readdirSync:2,existsSync:214,readFileSync:214});
export function reserveMigrationFs(name,args){
 if(!Object.hasOwn(migrationLimits,name))fail('ordinary HOLD migration boundary differs');
 let root;
 if(name==='rmSync'){
  root=migrationRoots.find(root=>root.path===args[0]);
// Proof: omitting the one-shot removal guard failed the RETURNED-removal branch; UNKNOWN has ordinary coverage only (triplet 0/1/0).
  if(root===undefined||root.removalPhase!=='not-entered')fail('ordinary HOLD migration removal differs');
 }else admit();
// Proof: widening the filesystem cap failed the first mkdtemp2 branch; later constants lack separate physical credit (triplet 0/1/0).
 if(migrationCalls.filter(call=>call.name===name).length>=migrationLimits[name])fail('ordinary HOLD migration call cap exceeded');
 const ticket=Object.freeze({});const call={ticket,name,args:[...args],phase:'entered',root};
// Proof: omitting call reservation failed the staging-before-entry consumer; finite triplet 0/1/0.
 if(root!==undefined)root.removalPhase='entered';migrationTickets.set(ticket,call);migrationCalls.push(call);return ticket;
}
export function returnMigrationFs(ticket,returned){const call=migrationTickets.get(ticket);if(call===undefined||call.phase!=='entered')fail('ordinary HOLD migration ticket differs');call.returned=returned;call.phase='returned';if(call.name==='mkdtempSync'){const root={path:returned,acquisition:ticket,removalPhase:'not-entered'};migrationRoots.push(root);call.root=root;}if(call.name==='rmSync')call.root.removalPhase='returned';return returned;}
export function throwMigrationFs(ticket,cause){const call=migrationTickets.get(ticket);if(call===undefined)fail('ordinary HOLD migration ticket differs');call.phase='unknown';call.cause=cause;if(call.name==='rmSync')call.root.removalPhase='unknown';custody.stopped=true;custody.failures.push(cause);}
export function inspectMigrationStaging(){return Object.freeze({limits:migrationLimits,calls:Object.freeze(migrationCalls.map(call=>Object.freeze({...call,args:Object.freeze([...call.args]),root:call.root===undefined?undefined:Object.freeze({...call.root})}))),roots:Object.freeze(migrationRoots.map(root=>Object.freeze({...root})))});}

const childRecords=new WeakMap(),children=[],childByOriginal=new WeakMap();
const childLimits=Object.freeze({git:8,namespace:16,emitter:2,collector:6});
let childReadCount=0,childDeliveredBytes=0,childAcceptedBytes=0,childReadsStopped=false;
const unknownChildPending=new Promise(()=>{});
function stopChild(record,cause){record.phase='unknown';record.cause=cause;custody.stopped=true;custody.failures.push(cause);}
function observeChildPromise(record,key,original){
 record[key]=original;record[key+'State']='pending';
 const observer=original.then(value=>{record[key+'State']='fulfilled';record[key+'Value']=value;},cause=>{record[key+'State']='rejected';record[key+'Cause']=cause;stopChild(record,cause);});
 record[key+'Observer']=observer;return observer;
}
export function reserveChild(label,args){
 admit();if(!Object.hasOwn(childLimits,label))fail('ordinary HOLD child boundary differs');
// Proof: widening the family cap failed the first Git8 branch; other family constants lack separate physical credit (triplet 0/1/0).
 if(children.length>=32||children.filter(record=>record.label===label).length>=childLimits[label])fail('ordinary HOLD child cap exceeded');
 const ticket=Object.freeze({});const record={ticket,label,args:[...args],phase:'entered',streams:[],joined:false};childRecords.set(ticket,record);// Proof: omitting child reservation failed the same generated reservation consumer; finite triplet 0/1/0.
children.push(record);return ticket;
}
export function throwChild(ticket,cause){const record=childRecords.get(ticket);if(record===undefined)fail('ordinary HOLD child ticket differs');stopChild(record,cause);}
function childStreamSnapshot(stream){return Object.freeze({...stream,reads:Object.freeze(stream.reads.map(read=>Object.freeze({...read}))),chunks:Object.freeze([...stream.chunks])});}
export function inspectChildren(){return Object.freeze(children.map(record=>Object.freeze({...record,args:Object.freeze([...record.args]),streams:Object.freeze(record.streams.map(childStreamSnapshot))})));}
function captureChildStream(record,name,stream){
 const captured={name,stream,reads:[],chunks:[],eof:false,releasePhase:'not-entered'};record.streams.push(captured);
 if(stream===undefined||stream===null)throw Error('ordinary HOLD child stream absent');
// Proof: substituting ready closed failed the retained-reader identity consumer; finite triplet 0/1/0.
 captured.reader=stream.getReader();observeChildPromise(captured,'closed',captured.reader.closed);return captured;
}
async function pumpChild(record,stream){
 for(;;){
  if(childReadsStopped)return await unknownChildPending;
// Proof: omitting read refusal failed the finite 8193-chunk UNKNOWN consumer; triplet 0/1/0.
  if(childReadCount>=8192){childReadsStopped=true;stopChild(record,Error('ordinary HOLD child read cap exceeded'));return await unknownChildPending;}
  const read={phase:'entered'};childReadCount++;stream.reads.push(read);
  let chunk;
  try{const original=stream.reader.read();observeChildPromise(read,'original',original);chunk=await original;await read.originalObserver;read.phase='returned';read.chunk=chunk;}
  catch(cause){read.phase='unknown';read.cause=cause;stopChild(record,cause);return await unknownChildPending;}
  if(chunk.done){stream.eof=true;return;}
  childDeliveredBytes+=chunk.value.byteLength;
 // Proof: omitting byte refusal failed the finite oversized-read UNKNOWN consumer; triplet 0/1/0.
 if(childDeliveredBytes>33554432){childReadsStopped=true;stopChild(record,Error('ordinary HOLD child byte cap exceeded'));return await unknownChildPending;}
  childAcceptedBytes+=chunk.value.byteLength;stream.chunks.push(chunk.value);
 }
}
export function attachChild(ticket,child){
 const record=childRecords.get(ticket);if(record===undefined||record.phase!=='entered')fail('ordinary HOLD child attachment differs');
 record.original=child;record.phase='returned';childByOriginal.set(child,record);
 try{
  // Proof: substituting an exit projection failed the original-identity consumer; finite triplet 0/1/0.
observeChildPromise(record,'exited',child.exited);
  record.stdout=child.stdout;record.stderr=child.stderr;
  const stdout=captureChildStream(record,'stdout',record.stdout),stderr=captureChildStream(record,'stderr',record.stderr);
  observeChildPromise(stdout,'pump',pumpChild(record,stdout));observeChildPromise(stderr,'pump',pumpChild(record,stderr));
  return child;
 }catch(cause){stopChild(record,cause);throw cause;}
}
function decodeChildStream(stream,fatal){const length=stream.chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0);const bytes=new Uint8Array(length);let offset=0;for(const chunk of stream.chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal}).decode(bytes);}
// Proof: omitting actual releaseLock failed the known-join consumer's unlocked-stream oracle; finite triplet 0/1/0.
async function joinChildBody(record){
 const waits=[record.exited,record.exitedObserver];
 for(const stream of record.streams)waits.push(stream.pump,stream.pumpObserver,stream.closed,stream.closedObserver);
 await Promise.allSettled(waits);
 if(record.phase==='unknown'||record.streams.length!==2||record.exitedState!=='fulfilled'||record.streams.some(stream=>!stream.eof||stream.closedState!=='fulfilled'||stream.pumpState!=='fulfilled'||stream.reads.some(read=>read.originalState!=='fulfilled')))return await unknownChildPending;
 for(const stream of record.streams){
  if(stream.releasePhase!=='not-entered'){stopChild(record,Error('ordinary HOLD child reader release re-entry'));return await unknownChildPending;}
  stream.releasePhase='entered';try{stream.releaseReturned=stream.reader.releaseLock();stream.releasePhase='returned';}catch(cause){stream.releasePhase='unknown';stopChild(record,cause);return await unknownChildPending;}
 }
 record.joined=true;return Object.freeze([decodeChildStream(record.streams[0],false),decodeChildStream(record.streams[1],false),record.exitedValue]);
}
// Proof: returning a join projection failed exact original join identity; finite triplet 0/1/0.
export function joinOrdinaryChild(child){const record=childByOriginal.get(child);if(record===undefined)fail('ordinary HOLD child original absent');if(record.join!==undefined)return record.join;const original=joinChildBody(record);observeChildPromise(record,'join',original);return original;}
export function inspectChildLimits(){return Object.freeze({children:32,readers:64,reads:8192,bytes:33554432,families:childLimits,readCount:childReadCount,deliveredBytes:childDeliveredBytes,acceptedBytes:childAcceptedBytes});}
export function refuseChildSemantic(child,cause){const record=childByOriginal.get(child);if(record===undefined)fail('ordinary HOLD child original absent');record.semanticCause=cause;custody.stopped=true;custody.failures.push(cause);throw cause;}
export function assertChildDeadline(deadline){admit();if(!Number.isFinite(deadline)||performance.now()>=deadline)fail('ordinary HOLD child deadline exceeded');}
// Proof: removing fatal decoding failed the invalid-UTF8 collector consumer after known joins; finite triplet 0/1/0.
export function decodeCollectorChild(child){const record=childByOriginal.get(child);if(record===undefined||!record.joined)fail('ordinary HOLD collector join absent');try{return decodeChildStream(record.streams[0],true);}catch(cause){return refuseChildSemantic(child,cause);}}
// Proof: omitting raw-stderr refusal accepted BOM-only stderr after known joins; same consumer triplet 0/1/0.
function collectorStderrByteLength(child){return childByOriginal.get(child).streams[1].chunks.reduce((bytes,chunk)=>bytes+chunk.byteLength,0);}
export async function readAuthorityCollector(child,deadline){const [stdout,stderr,code]=await joinOrdinaryChild(child);if(performance.now()>=deadline)return refuseChildSemantic(child,Error('authority collector deadline exceeded'));if(collectorStderrByteLength(child)>0)return refuseChildSemantic(child,Error('authority collector reported failure'));if(code!==0)return refuseChildSemantic(child,Error('authority collector exited unsuccessfully'));return decodeCollectorChild(child);}

const nativeLabels=new Set(['owner.openSync','storage.openSync','lock.openSync','graph.openSync','backup.openSync','graph.opendirSync','graph.relative','database.readonly','database.readwrite']);
const operationLabels=new Set(__OPERATION_LABELS__);
// Proof: removing snapshot freezing let the inspection consumer manufacture native completion (exit 1; restored).
function snapshot(record){return Object.freeze({...record,args:record.args===undefined?undefined:Object.freeze([...record.args]),aliases:record.aliases===undefined?undefined:Object.freeze([...record.aliases])});}
export function inspectLedger(){return Object.freeze({stopped:custody.stopped,fatalObservation:custody.fatalObservation===undefined?undefined:Object.freeze({...custody.fatalObservation}),natives:Object.freeze(custody.natives.map(snapshot)),operations:Object.freeze(custody.operations.map(snapshot)),owners:Object.freeze(custody.owners.map(frame=>Object.freeze({...frame,observations:Object.freeze(frame.observations.map(snapshot))}))),events:Object.freeze(custody.events.map(event=>Object.freeze({kind:event.kind,record:snapshot(event.record)}))),failures:Object.freeze([...custody.failures])});}
function requireRecord(ticket,kind){const record=records.get(ticket);if(record===undefined||record.family!==kind)fail('ordinary HOLD ticket differs');return record;}
export function inspectNative(ticket){return snapshot(requireRecord(ticket,'native'));}
export function inspectOperation(ticket){return snapshot(requireRecord(ticket,'operation'));}
function fail(message){const cause=new Error(message);custody.stopped=true;custody.failures.push(cause);throw cause;}
function event(kind,record){if(custody.events.length>=8192)fail('ordinary HOLD event cap exceeded');custody.events.push({kind,record});}
function admit(){if(custody.stopped)fail('ordinary HOLD ledger stopped');if(custody.events.length>=8192)fail('ordinary HOLD event cap exceeded');}
function createTicket(record){const ticket=Object.freeze({});records.set(ticket,record);record.ticket=ticket;return ticket;}
export function reserveNative(label,kind,args,receiver){
  admit();
  // Proof: admitting storage.openSync-near failed the unknown-boundary inert consumer (exit 1; restored).
  if(!nativeLabels.has(label)||!['fd','dir','sqlite'].includes(kind)||kind==='dir'&&label!=='graph.opendirSync'||kind==='sqlite'&&!['database.readonly','database.readwrite'].includes(label)||kind==='fd'&&(label==='graph.opendirSync'||['database.readonly','database.readwrite'].includes(label)))fail('ordinary HOLD native boundary differs');
  // Proof: removing this bound admits the 513th inert acquisition in the generated ledger cap negative.
  if(custody.natives.length>=512||kind==='sqlite'&&custody.natives.filter(record=>record.kind==='sqlite').length>=64||kind==='dir'&&custody.natives.filter(record=>record.kind==='dir').length>=32)fail('ordinary HOLD native cap exceeded');
  const record={family:'native',generation:++custody.generation,label,kind,args,receiver,phase:'entered',original:undefined,acquisitionCause:undefined,nativePhase:'not-entered',productionAttempts:0,fixtureAttempts:0,nativeEntries:0,nativeReturns:0,closeCause:undefined,closeOrigin:undefined,aliases:[]};
  // Proof: removing native reservation failed the generation consumer before sentinel entry (exit 1; restored).
  const ticket=createTicket(record);custody.natives.push(record);event('native-enter',record);return ticket;
}
export function attachNative(ticket,original){
  const record=requireRecord(ticket,'native');
  if(record.phase!=='entered')fail('ordinary HOLD native attachment differs');
  const prior=nativeAliases.get(original);record.original=original;record.phase='returned';record.aliases.push(original);
  if(prior!==undefined&&requireRecord(prior,'native').nativePhase!=='returned')fail('ordinary HOLD active native alias duplicate');
  nativeAliases.set(original,ticket);return original;
}
export function retainNativeClose(ticket,savedClose,receiver,args){const record=requireRecord(ticket,'native');record.savedClose=savedClose;record.closeReceiver=receiver;record.closeArgs=[...args];}
export function retainNativeIdentity(ticket,identity){requireRecord(ticket,'native').identity=identity;}
export function throwNative(ticket,cause){const record=requireRecord(ticket,'native');record.acquisitionCause=cause;record.phase='unknown';custody.stopped=true;custody.failures.push(cause);}
export function aliasNative(ticket,alias){
  const record=requireRecord(ticket,'native');
  if(record.phase!=='returned'||nativeAliases.has(alias)&&nativeAliases.get(alias)!==ticket)fail('ordinary HOLD native alias differs');
  // Proof: omitting alias linkage failed the same native-generation/alias consumer (exit 1; restored).
  nativeAliases.set(alias,ticket);record.aliases.push(alias);return alias;
}
export function linkWrapper(wrapper,tickets,kind){if(!['connection','graph','scanner'].includes(kind)||tickets.length===0||tickets.some(ticket=>records.get(ticket)?.family!=='native')||kind==='connection'&&tickets.length!==1)fail('ordinary HOLD wrapper association differs');wrappers.set(wrapper,Object.freeze({kind,tickets:Object.freeze([...tickets])}));if(tickets.length===1)aliasNative(tickets[0],wrapper);return wrapper;}
// Proof: both independent-cleanup consumers failed at B after A UNKNOWN or event-cap STOP; removing acquisition admission restored both (exit 0).
export function attemptClose(original,origin){
  const ticket=nativeAliases.get(original);
  if(ticket===undefined||!['production','fixture'].includes(origin))fail('ordinary HOLD close original absent');
  const record=requireRecord(ticket,'native');
  // Proof: the 8193rd attempt passed before this bound and failed the cleanup-accounting consumer; fixed consumer passes.
  if(record.productionAttempts+record.fixtureAttempts>=8192)fail('ordinary HOLD close attempt cap exceeded');
  if(origin==='production')record.productionAttempts++;else record.fixtureAttempts++;
  return ticket;
}
export function enterClose(ticket,origin){
  const record=requireRecord(ticket,'native');
  // Proof: removing this guard failed the returned/unknown no-retry consumer (exit 1; restored).
  if(record.nativePhase!=='not-entered')fail('ordinary HOLD native close re-entry');
  record.nativePhase='entered';record.nativeEntries++;record.closeOrigin=origin;return ticket;
}
export function beginClose(original,origin){return enterClose(attemptClose(original,origin),origin);}
export function returnClose(ticket,returned){const record=requireRecord(ticket,'native');if(record.nativePhase!=='entered')fail('ordinary HOLD native return without entry');record.nativePhase='returned';record.nativeReturns++;record.closeReturned=returned;}
export function throwClose(ticket,cause){const record=requireRecord(ticket,'native');record.nativePhase='unknown';record.closeCause=cause;custody.stopped=true;custody.failures.push(cause);}
export function reserveOperation(label,kind,receiver,args){
  admit();if(!operationLabels.has(label)||!['sync','promise'].includes(kind))fail('ordinary HOLD operation boundary differs');
  // Proof: raising the 256-Promise cap failed the exact census consumer (exit 1; restored).
  if(kind==='promise'&&custody.operations.filter(record=>record.kind==='promise').length>=256)fail('ordinary HOLD Promise cap exceeded');
  const record={family:'operation',label,kind,receiver,args,phase:'entered',returned:undefined,original:undefined,observer:undefined,observerSettled:false,joined:false,cause:undefined};
  const ticket=createTicket(record);custody.operations.push(record);event('operation-enter',record);return ticket;
}
export function returnOperation(ticket,returned){const record=requireRecord(ticket,'operation');record.returned=returned;record.phase='returned';return returned;}
export function throwOperation(ticket,cause){const record=requireRecord(ticket,'operation');record.cause=cause;if(record.phase!=='unknown')record.phase='threw';}
export function attachPromise(ticket,original){
  const record=requireRecord(ticket,'operation');if(record.phase!=='entered')fail('ordinary HOLD Promise already attached');
  record.returned=original;record.original=original;record.phase='pending';
  try{record.observer=original.then(value=>{record.value=value;record.phase='fulfilled';record.observerSettled=true;},cause=>{record.cause=cause;record.phase='rejected';record.observerSettled=true;});}
  catch(cause){record.phase='unknown';record.cause=cause;custody.stopped=true;custody.failures.push(cause);throw cause;}
  // Proof: returning a .then projection failed the exact-original consumer (exit 1; restored).
  return original;
}
export async function joinOperation(ticket){
  const record=requireRecord(ticket,'operation');if(record.original===undefined||record.observer===undefined)fail('ordinary HOLD original observation absent');
  await Promise.allSettled([record.original,record.observer]);
  if(!record.observerSettled||!['fulfilled','rejected'].includes(record.phase))fail('ordinary HOLD original observation incomplete');record.joined=true;
}
function tap(kind,owner,ownership,record,original,observer,extra){
  const observation={kind,owner,ownership,record,original,observer,...extra};
  try{
    let frame=custody.owners.find(frame=>frame.owner===owner);
    // Proof: admitting owner nine failed the fixed owner-graph census consumer (exit 1; restored).
    if(frame===undefined){if(custody.owners.length>=8)throw Error('ordinary HOLD owner frame cap exceeded');frame={owner,ownership,observations:[]};custody.owners.push(frame);}
    if(custody.stopped||custody.events.length>=8192)throw Error('ordinary HOLD owner observation stopped or capped');
    frame.observations.push(observation);event('owner-'+kind,observation);
  }catch(cause){custody.fatalObservation=observation;custody.stopped=true;custody.failures.push(cause);}
}
export function captureSettlement(record,settlement,original,observer){try{
  const kind=settlement===record.composition?'composition':settlement===record.projection?'projection':settlement===record.runtimeAction?'runtime-action':'unassociated';
  tap(kind,record.owner,record.ownership,record,original,observer,{settlement});
  if(kind==='unassociated'){custody.stopped=true;custody.fatalObservation={record,settlement,original,observer};}
}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureSettlement',references:[record,settlement,original,observer]};custody.failures.push(cause);}}
export function captureOperation(operation,observed,original,observer){try{tap('operation',observed.preparation.owner,observed.preparation.ownership,observed,original,observer,{operation});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureOperation',references:[operation,observed,original,observer]};custody.failures.push(cause);}}
export function captureRuntimeEntry(owner,ownership,entry,original,observer){try{tap('runtime-entry',owner,ownership,entry,original,observer,{});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureRuntimeEntry',references:[owner,ownership,entry,original,observer]};custody.failures.push(cause);}}
// Proof: omitting timer identity matching failed the missing-keeper consumer (exit 1; restored).
export function captureKeeper(owner,ownership,keeper){try{tap('keeper',owner,ownership,keeper,keeper.pending,undefined,{interval:keeper.interval});if(custody.operations.filter(record=>record.label==='owner.interval'&&record.returned===keeper.interval).length!==1){custody.stopped=true;custody.fatalObservation={owner,ownership,record:keeper,original:keeper.pending};}}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureKeeper',references:[owner,ownership,keeper]};custody.failures.push(cause);}}
export function captureOriginal(preparation,original,observed){try{
  const acquisition=observed.acquisition;const acquired=acquisition.kind==='descriptor'?acquisition.descriptor:acquisition.kind==='database'?acquisition.database:acquisition.kind==='connection'?acquisition.connection:acquisition.kind==='graph'?acquisition.graph:acquisition.scanner;
  const ticket=nativeAliases.get(acquired);const wrapper=wrappers.get(acquired);
  tap('original',observed.preparation.owner,observed.preparation.ownership,observed,original,undefined,{preparation,acquisition,ticket,wrapper});
  if(ticket===undefined&&wrapper===undefined){custody.stopped=true;custody.fatalObservation={preparation,original,observed,acquired};}
}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureOriginal',references:[preparation,original,observed]};custody.failures.push(cause);}}
export function captureHold(owner,ownership,keeper){try{tap('hold',owner,ownership,keeper,keeper.pending,undefined,{interval:keeper.interval});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureHold',references:[owner,ownership,keeper]};custody.failures.push(cause);}}
`.replace('__OPERATION_LABELS__', JSON.stringify(operationLabels));
  const storage = `${root}/tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts`;
  const graph = `${root}/tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`;
  const db = `${root}/libs/wbs/adapters/store-sqlite/src/db.ts`;
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  const relative = `${root}/tools/tool-remote-scripts/src/lib/directory-file.ts`;
  return new Map([
    port('ledger', ledger),
    ...(['owner', 'storage', 'lock', 'graph', 'backup'] as const).map((name) =>
      port(`${name}-fs`, nativeFs(name)),
    ),
    ...(['participant', 'complete', 'startup', 'database', 'frontend', 'namespace'] as const).map(
      (name) => port(`setup-${name}-fs`, promiseFs(`setup.${name}`)),
    ),
    port(
      'owner-timer',
      `${ledgerImports}${fixedSync}\nexport const ordinaryHoldSetInterval=(...args)=>invoke('owner.interval',setInterval,undefined,args);\nexport const ordinaryHoldClearInterval=(...args)=>invoke('owner.clear',clearInterval,undefined,args);`,
    ),
    port(
      'storage-database',
      `import { openReadOnlyConnection as connection, openReadOnlyDatabase as database } from ${JSON.stringify(db)};\n${ledgerImports}${fixedSync}\nexport const openReadOnlyConnection=(...args)=>{const before=inspectLedger().natives.length;const returned=invoke('storage.database.connection',connection,undefined,args);const acquired=inspectLedger().natives.slice(before).filter(record=>record.label==='database.readonly');return linkWrapper(returned,acquired.map(record=>record.ticket),'connection');};\nexport const openReadOnlyDatabase=(...args)=>invoke('storage.database.database',database,undefined,args);`,
    ),
    port(
      'storage-graph',
      `import { captureInitialHandoffArtifacts as original } from ${JSON.stringify(graph)};\n${ledgerImports}${fixedSync}\nexport const captureInitialHandoffArtifacts=(...args)=>{const before=inspectLedger().natives.length;const returned=invoke('storage.graph',original,undefined,args);const acquired=inspectLedger().natives.slice(before).filter(record=>record.label.startsWith('graph.'));return linkWrapper(returned,acquired.map(record=>record.ticket),'graph');};`,
    ),
    port(
      'complete-storage',
      `import { activateDependencyStores as original, hashActivationBytes } from ${JSON.stringify(storage)};\n${ledgerImports}${fixedPromise}\nexport { hashActivationBytes };\nexport const activateDependencyStores=(...args)=>invoke('complete.storage',original,undefined,args);`,
    ),
    port(
      'complete-scanner',
      `import { scanMigrationArtifact as original } from ${JSON.stringify(scanner)};\n${ledgerImports}${fixedPromise}\nexport const scanMigrationArtifact=(...args)=>invoke('complete.scanner',original,undefined,args);`,
    ),
    port(
      'graph-relative',
      `import { openDirectoryFile as original } from ${JSON.stringify(relative)};\nimport { closeSync as nativeClose, fstatSync as nativeFstat } from 'node:fs';\n${ledgerImports}${fixedSync}\nexport const openDirectoryFile=(...args)=>{const ticket=reserveNative('graph.relative','fd',args,undefined);try{const descriptor=attachNative(ticket,Reflect.apply(original,undefined,args));retainNativeClose(ticket,nativeClose,undefined,[descriptor]);retainNativeIdentity(ticket,nativeFstat(descriptor,{bigint:true}));return descriptor;}catch(cause){throwNative(ticket,cause);throw cause;}};`,
    ),

    port(
      'child-git',
      `import {reserveChild,attachChild,throwChild,joinOrdinaryChild} from 'ordinary-hold-v1:ledger';
const spawn=Bun.spawn;
export {joinOrdinaryChild};
export function spawnOrdinaryGit(root,args){const argv=['git','--no-optional-locks','-C',root,...args];const options={stdout:'pipe',stderr:'pipe',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}};const ticket=reserveChild('git',[argv,options]);try{return attachChild(ticket,Reflect.apply(spawn,Bun,[argv,options]));}catch(cause){throwChild(ticket,cause);throw cause;}}`,
    ),
    port(
      'child-namespace',
      `import {reserveChild,attachChild,throwChild,joinOrdinaryChild} from 'ordinary-hold-v1:ledger';
const spawn=Bun.spawn;
export {joinOrdinaryChild};
export function spawnOrdinaryNamespace(credentials,emitted,nonce,argumentsForProgram){if(!(credentials.length===0||credentials.length===2&&credentials[0]==='/usr/bin/setpriv'&&credentials[1]==='--bounding-set=-dac_override,-dac_read_search'))throw Error('ordinary HOLD namespace credentials differ');const argv=[...credentials,'/usr/bin/busybox','sh','-c',emitted,'--',nonce,...argumentsForProgram];const options={stdout:'pipe',stderr:'pipe'};const ticket=reserveChild('namespace',[argv,options]);try{return attachChild(ticket,Reflect.apply(spawn,Bun,[argv,options]));}catch(cause){throwChild(ticket,cause);throw cause;}}`,
    ),
    port(
      'child-emitter',
      `import {reserveChild,attachChild,throwChild,joinOrdinaryChild} from 'ordinary-hold-v1:ledger';
const spawn=Bun.spawn;
export {joinOrdinaryChild};
export function spawnOrdinaryEmitter(sourceRoot){const argv=[process.execPath,'--no-env-file','run','apps/wbs/be-01/src/openapi/emit-openapi-cli.ts'];const options={cwd:sourceRoot,env:{PATH:process.env['PATH'],BUN_RUNTIME_TRANSPILER_CACHE_PATH:'0'},stdout:'pipe',stderr:'pipe'};const ticket=reserveChild('emitter',[argv,options]);try{return attachChild(ticket,Reflect.apply(spawn,Bun,[argv,options]));}catch(cause){throwChild(ticket,cause);throw cause;}}`,
    ),
    port(
      'child-collector',
      `import {reserveChild,attachChild,throwChild,joinOrdinaryChild,assertChildDeadline,refuseChildSemantic,decodeCollectorChild,readAuthorityCollector} from 'ordinary-hold-v1:ledger';
const spawn=Bun.spawn;
export function spawnOrdinaryCollector(program,deadline){assertChildDeadline(deadline);const argv=['/usr/bin/python3','-I','-'];const options={stdin:new TextEncoder().encode(program),stdout:'pipe',stderr:'pipe'};const ticket=reserveChild('collector',[argv,options]);try{return attachChild(ticket,Reflect.apply(spawn,Bun,[argv,options]));}catch(cause){throwChild(ticket,cause);throw cause;}}
export {readAuthorityCollector};`,
    ),
    port(
      'migration-fs',
      `import * as native from 'node:fs';
import {reserveMigrationFs,returnMigrationFs,throwMigrationFs} from 'ordinary-hold-v1:ledger';
const originals=Object.freeze({cpSync:native.cpSync,existsSync:native.existsSync,mkdtempSync:native.mkdtempSync,readdirSync:native.readdirSync,readFileSync:native.readFileSync,rmSync:native.rmSync});
${['cpSync', 'existsSync', 'mkdtempSync', 'readdirSync', 'readFileSync', 'rmSync'].map((name) => `export function ${name}(...args){const ticket=reserveMigrationFs('${name}',args);try{return returnMigrationFs(ticket,Reflect.apply(originals.${name},native,args));}catch(cause){throwMigrationFs(ticket,cause);throw cause;}}`).join('\n')}`,
    ),
    port(
      'migration-call',
      `import {runMigrations as original} from ${JSON.stringify(`${root}/libs/wbs/adapters/store-sqlite/src/migrate.ts`)};
${ledgerImports}${fixedSync}
export const runMigrations=(...args)=>invoke('setup.runMigrations',original,undefined,args);`,
    ),
    port(
      'setup-complete-write',
      `${ledgerImports}${fixedPromise}
const original=Bun.write;export function writeOrdinaryComplete(label,...args){if(!['complete.write.prod','complete.write.dev'].includes(label))throw Error('ordinary HOLD complete write label differs');return invoke(label,original,Bun,args);}`,
    ),
    port(
      'setup-namespace-write',
      `${ledgerImports}${fixedPromise}
const original=Bun.write;export function writeOrdinaryNamespace(label,...args){if(!['namespace.write.0','namespace.write.1','namespace.write.2','namespace.write.3','namespace.write.4'].includes(label))throw Error('ordinary HOLD namespace write label differs');return invoke(label,original,Bun,args);}`,
    ),
    port(
      'database-readwrite',
      `import { Database } from 'bun:sqlite';\n${ledgerImports}export const ordinaryHoldOpenReadwrite=(dbPath,isCreateAllowed)=>{const record=reserveNative('database.readwrite','sqlite',[dbPath,{create:isCreateAllowed,readwrite:true}],Database);try{const client=attachNative(record,new Database(dbPath,{create:isCreateAllowed,readwrite:true}));const savedClose=client.close;retainNativeClose(record,savedClose,client,[]);client.close=function(...args){beginClose(client,'production');try{const returned=Reflect.apply(savedClose,this,args);returnClose(record);return returned;}catch(cause){throwClose(record,cause);throw cause;}};return client;}catch(cause){throwNative(record,cause);throw cause;}};`,
    ),
    port(
      'database-readonly',
      `import { Database } from 'bun:sqlite';\n${ledgerImports}export const ordinaryHoldOpenReadonly=(dbPath)=>{const record=reserveNative('database.readonly','sqlite',[dbPath,{readonly:true,create:false}],Database);try{const client=attachNative(record,new Database(dbPath,{readonly:true,create:false}));const savedClose=client.close;retainNativeClose(record,savedClose,client,[]);client.close=function(...args){beginClose(client,'production');try{const returned=Reflect.apply(savedClose,this,args);returnClose(record);return returned;}catch(cause){throwClose(record,cause);throw cause;}};return client;}catch(cause){throwNative(record,cause);throw cause;}};`,
    ),
  ]);
}

/** Identifies only the observed closed virtual keys and cwd-relative filesystem labels. */
export function identifyOrdinaryHoldMetafilePathV1(
  sourceRoot: string,
  compilerCwd: string,
  rawPath: string,
): string {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD metadata root');
  const cwd = ordinaryHoldAbsolute(compilerCwd, 'ordinary HOLD compiler cwd');
  if (rawPath.startsWith('ordinary-hold-v1:')) {
    if (!ordinaryHoldPortSourcesV1(root).has(rawPath))
      throw new Error('ordinary HOLD virtual metadata identity differs');
    return rawPath;
  }
  if (rawPath.startsWith('node:') || rawPath.startsWith('bun:')) return rawPath;
  if (rawPath.includes(':') && !rawPath.startsWith('/'))
    throw new Error('ordinary HOLD unknown metadata namespace');
  if (rawPath.startsWith('/')) return rawPath;
  if (rawPath === '' || rawPath.includes('\0'))
    throw new Error('ordinary HOLD metadata filesystem label differs');
  return ordinaryHoldResolve(cwd, rawPath);
}

/** Admits only the fixed imports from a generated port's exact bare module ID. */
export function resolveOrdinaryHoldPortImportV1(
  sourceRoot: string,
  importerId: string,
  specifier: string,
): { readonly path: string; readonly external: boolean; readonly namespace?: string } | undefined {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD port root');
  if (!ordinaryHoldPortSourcesV1(root).has(`ordinary-hold-v1:${importerId}`))
    throw new Error('ordinary HOLD importer port absent');
  const ledger = 'ordinary-hold-v1:ledger';
  const storage = `${root}/tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts`;
  const graph = `${root}/tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`;
  const database = `${root}/libs/wbs/adapters/store-sqlite/src/db.ts`;
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  const relative = `${root}/tools/tool-remote-scripts/src/lib/directory-file.ts`;
  let allowed: readonly string[];
  if (['owner-fs', 'storage-fs', 'lock-fs', 'graph-fs', 'backup-fs'].includes(importerId))
    allowed = ['node:fs', ledger];
  else if (importerId.startsWith('setup-') && importerId.endsWith('-fs'))
    allowed = ['node:fs/promises', ledger];
  else {
    switch (importerId) {
      case 'child-git':
      case 'child-namespace':
      case 'child-emitter':
      case 'child-collector':
      case 'setup-complete-write':
      case 'setup-namespace-write':
        allowed = [ledger];
        break;
      case 'migration-call':
        allowed = [ledger, `${root}/libs/wbs/adapters/store-sqlite/src/migrate.ts`];
        break;
      case 'migration-fs':
        allowed = [ledger, 'node:fs'];
        break;
      case 'ledger':
        allowed = [];
        break;
      case 'owner-timer':
        allowed = [ledger];
        break;
      case 'database-readwrite':
      case 'database-readonly':
        allowed = [ledger, 'bun:sqlite'];
        break;
      case 'storage-database':
        allowed = [database, ledger];
        break;
      case 'storage-graph':
        allowed = [graph, ledger];
        break;
      case 'complete-storage':
        allowed = [storage, ledger];
        break;
      case 'complete-scanner':
        allowed = [scanner, ledger];
        break;
      case 'graph-relative':
        allowed = [relative, ledger, 'node:fs'];
        break;
      default:
        throw new Error('ordinary HOLD importer port absent');
    }
  }
  if (!allowed.includes(specifier)) throw new Error('ordinary HOLD port destination differs');
  if (specifier.startsWith('node:') || specifier.startsWith('bun:')) return undefined;
  if (specifier === ledger)
    return { path: 'ledger', namespace: 'ordinary-hold-v1', external: false };
  return { path: specifier, external: specifier === scanner };
}

export interface OrdinaryHoldBuildPlanV1 {
  readonly image: OrdinaryHoldImageV1;
  readonly materialized: ReadonlyMap<string, Uint8Array>;
  readonly appliedCuts: readonly {
    readonly id: string;
    readonly count: number;
  }[];
  readonly portSources: ReadonlyMap<string, string>;
}

/** Builds the closed current-source plan from fixed recipes, never caller-supplied cuts. */
export function planOrdinaryHoldBuildV1(
  sourceRoot: string,
  supplied: ReadonlyMap<string, Uint8Array>,
): OrdinaryHoldBuildPlanV1 {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD build root');
  if (supplied.size !== ordinaryHoldSourceEpochV1.pins.length)
    throw new Error('ordinary HOLD build source roster differs');
  const pins = ordinaryHoldSourceEpochV1.pins.map((pin) => ({
    path: `${root}/${pin.relative}`,
    bytes: pin.bytes,
    sha256: pin.sha256,
  }));
  const appliedCuts: { id: string; count: number }[] = [];
  const mappings: OrdinaryHoldSourceMappingV1[] = ordinaryHoldModuleModesV1.map((entry, index) => {
    const pin = pins.at(index);
    if (pin?.path !== `${root}/${entry.relative}`)
      throw new Error('ordinary HOLD build pin order differs');
    const bytes = supplied.get(pin.path);
    if (bytes === undefined) throw new Error('ordinary HOLD build source bytes absent');
    if (
      bytes.byteLength !== pin.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256
    )
      throw new Error('ordinary HOLD build source bytes differ');
    if (entry.mode !== 'transform') return { mode: entry.mode, path: pin.path, sha256: pin.sha256 };
    let source = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    const cuts = ordinaryHoldConcreteCutsV1(entry.relative, root);
    for (const cut of cuts) {
      const count = source.split(cut.before).length - 1;
      if (count !== cut.count)
        throw new Error(`ordinary HOLD fixed cut ${cut.id} cardinality differs`);
      source = source.replaceAll(cut.before, () => cut.after);
      appliedCuts.push({ id: cut.id, count });
    }
    return {
      mode: 'transform',
      path: pin.path,
      inputSha256: pin.sha256,
      outputSha256: createHash('sha256').update(new TextEncoder().encode(source)).digest('hex'),
      cuts: cuts.map(({ before, after, count }) => ({
        before,
        after,
        count,
      })),
    };
  });
  const image = decodeOrdinaryHoldImageV1({
    format: 'dependency-owner-ordinary-hold-image',
    sourceEpoch: 'ordinary-febb-custody-v1',
    version: 1,
    sourceRoot: root,
    sourceIdentity: ordinaryHoldSourceEpochV1.sourceIdentity,
    sourcePins: pins,
    mappings,
    mappingDigest: createHash('sha256').update(JSON.stringify(mappings)).digest('hex'),
    titleDigest: ordinaryHoldTitleDigestV1,
  });
  return Object.freeze({
    image,
    materialized: materializeOrdinaryHoldImageV1(image, supplied),
    appliedCuts: Object.freeze(appliedCuts),
    portSources: ordinaryHoldPortSourcesV1(root),
  });
}

export interface OrdinaryHoldBuildOnlyRequestV1 {
  readonly version: 1;
  readonly mode: 'build-only';
  readonly sourceRoot: string;
  readonly sourceEpoch: 'ordinary-febb-custody-v1';
}
interface OrdinaryHoldSetupRecordV1 {
  readonly label: string;
  readonly kind: 'promise';
  state: 'entered' | 'pending' | 'fulfilled' | 'rejected' | 'threw' | 'unknown';
  returned?: unknown;
  original?: Promise<unknown>;
  observer?: Promise<void>;
  cause?: unknown;
  joined: boolean;
}
interface OrdinaryHoldResolutionV1 {
  readonly importer: string;
  readonly specifier: string;
  readonly importerNamespace: string;
  readonly resolveDir: string;
  readonly kind: string;
  readonly path: string;
  readonly external: boolean;
  readonly destinationNamespace?: string;
}
interface OrdinaryHoldBuildProvenanceV1 {
  readonly compiler: {
    readonly version: string;
    readonly revision: string;
    readonly executable: string;
    readonly cwd: string;
  };
  readonly issuer: { readonly path: string; readonly bytes: number; readonly sha256: string };
  readonly authority: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly ports: readonly {
    readonly specifier: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly entrySource: { readonly path: string; readonly bytes: number; readonly sha256: string };
  readonly buildOptionsSha256: string;
}
/** A setup record retires only after a known no-return throw or both retained original and observer settle. */
export function hasKnownOrdinaryHoldSetupOutcomeV1(
  record: Pick<
    OrdinaryHoldSetupRecordV1,
    'state' | 'returned' | 'original' | 'observer' | 'joined'
  >,
): boolean {
  return (
    (record.state === 'threw' && record.returned === undefined) ||
    (record.joined &&
      record.original !== undefined &&
      record.observer !== undefined &&
      (record.state === 'fulfilled' || record.state === 'rejected'))
  );
}

export interface OrdinaryHoldBuiltImageV1 {
  readonly format: 'dependency-owner-ordinary-image-build';
  readonly version: 1;
  readonly status: 'built-unqualified';
  readonly sourceEpoch: 'ordinary-febb-custody-v1';
  readonly imageDigest: string;
  readonly titleDigest: string;
  readonly entryPath: string;
  readonly entrySha256: string;
  readonly metafileDigest: string;
  readonly sourceObservations: readonly OrdinaryHoldSourcePinV1[];
  readonly appliedCuts: OrdinaryHoldBuildPlanV1['appliedCuts'];
  readonly resolutions: readonly OrdinaryHoldResolutionV1[];
  readonly setupOperations: readonly OrdinaryHoldSetupRecordV1[];
  readonly provenance: OrdinaryHoldBuildProvenanceV1;
  readonly unqualified: readonly string[];
}

function ordinaryHoldBuildRequestV1(value: unknown): OrdinaryHoldBuildOnlyRequestV1 {
  const request = ordinaryHoldFields(
    value,
    ['version', 'mode', 'sourceRoot', 'sourceEpoch'],
    'ordinary HOLD build request',
  );
  if (
    request['version'] !== 1 ||
    request['mode'] !== 'build-only' ||
    request['sourceEpoch'] !== 'ordinary-febb-custody-v1'
  )
    throw new Error('ordinary HOLD build-only epoch differs');
  return {
    version: 1,
    mode: 'build-only',
    sourceRoot: ordinaryHoldAbsolute(request['sourceRoot'], 'ordinary HOLD build root'),
    sourceEpoch: 'ordinary-febb-custody-v1',
  };
}

/** Retains each original setup Promise and its observer before allowing the next build effect. */
async function ordinaryHoldSetupOperationV1<T>(
  records: OrdinaryHoldSetupRecordV1[],
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (records.length >= 96) throw new Error('ordinary HOLD setup operation cap exceeded');
  const record: OrdinaryHoldSetupRecordV1 = {
    label,
    kind: 'promise',
    state: 'entered',
    joined: false,
  };
  records.push(record);
  let returned: Promise<T>;
  try {
    returned = action();
    record.returned = returned;
  } catch (cause) {
    record.cause = cause;
    record.state = 'threw';
    throw cause;
  }
  if (!(returned instanceof Promise)) {
    record.state = 'unknown';
    throw new Error('ordinary HOLD setup original Promise absent');
  }
  record.original = returned;
  record.state = 'pending';
  try {
    record.observer = returned.then(
      () => {
        record.state = 'fulfilled';
      },
      (cause: unknown) => {
        record.cause = cause;
        record.state = 'rejected';
      },
    );
  } catch (cause) {
    record.cause = cause;
    record.state = 'unknown';
    throw cause;
  }
  const [outcome, observation] = await Promise.allSettled([returned, record.observer]);
  if (observation.status === 'rejected') {
    record.cause = observation.reason;
    record.state = 'unknown';
    throw observation.reason;
  }
  record.joined = true;
  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}

function ordinaryHoldEntryV1(sourceRoot: string): string {
  const exports = [
    ['owner', 'tools/tool-remote-scripts/src/lib/edge-ownership.ts'],
    ['storage', 'tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts'],
    ['complete', 'tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts'],
    ['graph', 'tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts'],
    ['database', 'libs/wbs/adapters/store-sqlite/src/db.ts'],
    ['snapshot', 'libs/wbs/adapters/store-sqlite/src/backup.ts'],
    ['sqliteCleanup', 'libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts'],
    ['locks', 'tools/tool-remote-scripts/src/lib/lock.ts'],
    ['scanner', 'tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts'],
    [
      'participantFixture',
      'tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts',
    ],
    ['completeFixture', 'tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts'],
    ['sourceSetup', 'tools/tool-remote-scripts/src/fixtures/source-startup.ts'],
    ['sourceDatabaseSetup', 'tools/tool-remote-scripts/src/fixtures/source-database-binding.ts'],
    ['frontendSetup', 'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts'],
    ['namespaceSetup', 'tools/tool-remote-scripts/src/fixtures/namespace-audit.ts'],
    ['directoryFile', 'tools/tool-remote-scripts/src/lib/directory-file.ts'],
    ['migrations', 'libs/wbs/adapters/store-sqlite/src/migrate.ts'],
  ] as const;
  return (
    exports
      .map(
        ([name, relative]) =>
          `export * as ${name} from ${JSON.stringify(`${sourceRoot}/${relative}`)};`,
      )
      .join('\n') + "\nexport * as ledger from 'ordinary-hold-v1:ledger';\n"
  );
}

interface OrdinaryHoldBuildAttemptV1 {
  readonly operations: OrdinaryHoldSetupRecordV1[];
  readonly observer: Promise<void>;
  outputRoot?: string;
}
const ordinaryHoldBuilderAttempts = new WeakMap<
  Promise<OrdinaryHoldBuiltImageV1>,
  OrdinaryHoldBuildAttemptV1
>();

/** The same original build Promise keys its retained setup records and observer. */
export function inspectOrdinaryHoldBuildV1(
  original: Promise<OrdinaryHoldBuiltImageV1>,
): OrdinaryHoldBuildAttemptV1 {
  const attempt = ordinaryHoldBuilderAttempts.get(original);
  if (attempt === undefined) throw new Error('ordinary HOLD build original absent');
  return attempt;
}

/** Compiles real pinned sources once, retains actual setup outcomes, and never imports the output. */
export function buildOrdinaryHoldImageV1(request: unknown): Promise<OrdinaryHoldBuiltImageV1> {
  const admitted = ordinaryHoldBuildRequestV1(request);
  const operations: OrdinaryHoldSetupRecordV1[] = [];
  const body = buildOrdinaryHoldImageBodyV1(admitted, operations, (outputRoot) => {
    const attempt = ordinaryHoldBuilderAttempts.get(body);
    if (attempt !== undefined) attempt.outputRoot = outputRoot;
  });
  const observer = body.then(
    () => undefined,
    () => undefined,
  );
  ordinaryHoldBuilderAttempts.set(body, { operations, observer });
  return body;
}

async function buildOrdinaryHoldImageBodyV1(
  request: OrdinaryHoldBuildOnlyRequestV1,
  operations: OrdinaryHoldSetupRecordV1[],
  retainOutputRoot: (outputRoot: string) => void,
): Promise<OrdinaryHoldBuiltImageV1> {
  const keeper = setInterval(() => operations, 60000);
  try {
    const root = request.sourceRoot;
    if (
      (await ordinaryHoldSetupOperationV1(operations, 'root.realpath', () =>
        ordinaryHoldRealpath(root),
      )) !== root
    )
      throw new Error('ordinary HOLD source root changed');
    const supplied = new Map<string, Uint8Array>();
    for (const pin of ordinaryHoldSourceEpochV1.pins) {
      const path = `${root}/${pin.relative}`;
      if (
        (await ordinaryHoldSetupOperationV1(operations, 'source.realpath', () =>
          ordinaryHoldRealpath(path),
        )) !== path
      )
        throw new Error('ordinary HOLD source path changed');
      supplied.set(
        path,
        await ordinaryHoldSetupOperationV1(operations, 'source.read', () => readBinaryFile(path)),
      );
    }
    const plan = planOrdinaryHoldBuildV1(root, supplied);
    const authority: { path: string; bytes: number; sha256: string }[] = [];
    for (const relative of ['tsconfig.base.json', 'package.json', 'bun.lock'] as const) {
      const bytes = await ordinaryHoldSetupOperationV1(operations, 'authority.read', () =>
        readBinaryFile(`${root}/${relative}`),
      );
      authority.push({
        path: relative,
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const issuerPath = new URL(import.meta.url).pathname;
    if (
      (await ordinaryHoldSetupOperationV1(operations, 'issuer.realpath', () =>
        ordinaryHoldRealpath(issuerPath),
      )) !== issuerPath
    )
      throw new Error('ordinary HOLD executing fixture path changed');
    const issuerBytes = await ordinaryHoldSetupOperationV1(operations, 'issuer.read', () =>
      readBinaryFile(issuerPath),
    );
    const issuer = {
      path: issuerPath,
      bytes: issuerBytes.byteLength,
      sha256: createHash('sha256').update(issuerBytes).digest('hex'),
    };
    const outputRoot = await ordinaryHoldSetupOperationV1(operations, 'output.mkdtemp', () =>
      mkdtemp(join(tmpdir(), 'puni-ordinary-image-')),
    );
    retainOutputRoot(outputRoot);
    const entryPath = join(outputRoot, 'ordinary-image-entry.ts');
    const entry = ordinaryHoldEntryV1(root);
    const ports = Array.from(plan.portSources, ([specifier, source]) => ({
      specifier,
      bytes: Buffer.byteLength(source),
      sha256: createHash('sha256').update(source).digest('hex'),
    }));
    const entrySource = {
      path: entryPath,
      bytes: Buffer.byteLength(entry),
      sha256: createHash('sha256').update(entry).digest('hex'),
    };
    await ordinaryHoldSetupOperationV1(operations, 'entry.write', () =>
      writeFile(entryPath, entry, { mode: 0o600 }),
    );
    const resolutions: OrdinaryHoldResolutionV1[] = [];
    const callbacks = new Map<string, number>();
    const plugin: BunPlugin = {
      name: 'ordinary-hold-v1-fixed-image',
      setup(builder) {
        const resolveImport = (source: {
          path: string;
          importer: string;
          namespace: string;
          resolveDir: string;
          kind: string;
        }) => {
          const observe = (resolved: { path: string; external?: boolean; namespace?: string }) => {
            resolutions.push({
              importer: source.importer,
              specifier: source.path,
              importerNamespace: source.namespace,
              resolveDir: source.resolveDir,
              kind: source.kind,
              path: resolved.path,
              external: resolved.external === true,
              destinationNamespace: resolved.namespace,
            });
            return resolved;
          };
          if (plan.portSources.has(`ordinary-hold-v1:${source.importer}`)) {
            const mapped = resolveOrdinaryHoldPortImportV1(root, source.importer, source.path);
            if (mapped === undefined) {
              observe({ path: source.path, external: true });
              return undefined;
            }
            return observe(mapped);
          }
          if (source.path.startsWith('ordinary-hold-v1:')) {
            if (!plan.portSources.has(source.path))
              throw new Error('ordinary HOLD virtual port absent');
            return observe({
              path: source.path.slice('ordinary-hold-v1:'.length),
              namespace: 'ordinary-hold-v1',
            });
          }
          if (source.path.startsWith(`${root}/`)) {
            const mapping = plan.image.mappings.find((entry) => entry.path === source.path);
            if (
              mapping !== undefined &&
              (source.importer === entryPath || source.importer.startsWith(`${root}/`))
            )
              return observe({
                path: mapping.path,
                external: mapping.mode === 'external-unchanged',
              });
          }
          if (source.importer !== '' && !source.importer.startsWith('/'))
            throw new Error('ordinary HOLD unrecognized virtual importer');
          if (!source.importer.startsWith(`${root}/`)) return undefined;
          const mapped = resolveOrdinaryHoldImportV1(root, source.importer, source.path);
          if (mapped !== undefined) return observe(mapped);
          return undefined;
        };
        builder.onResolve({ filter: /.*/ }, resolveImport);
        builder.onResolve({ filter: /.*/, namespace: 'ordinary-hold-v1' }, resolveImport);
        builder.onLoad({ filter: /.*/, namespace: 'ordinary-hold-v1' }, (source) => {
          const contents = plan.portSources.get(`ordinary-hold-v1:${source.path}`);
          if (contents === undefined) throw new Error('ordinary HOLD virtual port absent');
          return { contents, loader: 'ts' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'file' }, (source) => {
          const bytes = plan.materialized.get(source.path);
          if (bytes === undefined) return undefined;
          const mapping = plan.image.mappings.find(
            (sourceMapping) => sourceMapping.path === source.path,
          );
          if (mapping?.mode === 'external-unchanged')
            throw new Error('ordinary HOLD scanner entered bundled loader');
          callbacks.set(source.path, (callbacks.get(source.path) ?? 0) + 1);
          return { contents: bytes, loader: 'ts' };
        });
      },
    };
    const compilerCwd = process.cwd();
    const buildOptionsIdentity = {
      entrypoints: [entryPath],
      target: 'bun',
      format: 'esm',
      splitting: false,
      minify: false,
      sourcemap: 'none',
      bytecode: false,
      packages: 'bundle',
      metafile: true,
      throw: false,
      root,
      tsconfig: `${root}/tsconfig.base.json`,
      plugin: plugin.name,
    };
    const provenance: OrdinaryHoldBuildProvenanceV1 = {
      compiler: {
        version: Bun.version,
        revision: Bun.revision,
        executable: process.execPath,
        cwd: compilerCwd,
      },
      issuer,
      authority,
      ports,
      entrySource,
      buildOptionsSha256: createHash('sha256')
        .update(JSON.stringify(buildOptionsIdentity))
        .digest('hex'),
    };
    const built = await ordinaryHoldSetupOperationV1(operations, 'compiler.Bun.build', () =>
      Bun.build({
        entrypoints: [entryPath],
        target: 'bun',
        format: 'esm',
        splitting: false,
        minify: false,
        sourcemap: 'none',
        bytecode: false,
        packages: 'bundle',
        metafile: true,
        throw: false,
        root,
        tsconfig: `${root}/tsconfig.base.json`,
        plugins: [plugin],
      }),
    );
    if (process.cwd() !== compilerCwd) throw new Error('ordinary HOLD compiler cwd changed');
    if (
      !built.success ||
      built.outputs.length !== 1 ||
      built.outputs[0]?.kind !== 'entry-point' ||
      built.metafile === undefined
    )
      throw new Error('ordinary HOLD compiler output differs');
    for (const mapping of plan.image.mappings) {
      if (mapping.mode !== 'external-unchanged' && callbacks.get(mapping.path) !== 1)
        throw new Error('ordinary HOLD mapped compiler source absent or duplicated');
    }
    const meta = built.metafile;
    const inputs = Object.entries(meta.inputs);
    const normalizedInputs = inputs.map(([rawPath]) => ({
      rawPath,
      identity: identifyOrdinaryHoldMetafilePathV1(root, compilerCwd, rawPath),
    }));
    const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
    if (normalizedInputs.some((input) => input.identity === scanner))
      throw new Error('ordinary HOLD scanner bundled input differs');
    for (const mapping of plan.image.mappings) {
      if (mapping.mode === 'external-unchanged') continue;
      if (normalizedInputs.filter((input) => input.identity === mapping.path).length !== 1)
        throw new Error('ordinary HOLD classifier or mapped input identity differs');
    }
    const normalizedEdges = inputs.flatMap(([rawImporter, input]) =>
      input.imports.map((edge) => ({
        rawImporter,
        importerIdentity: identifyOrdinaryHoldMetafilePathV1(root, compilerCwd, rawImporter),
        rawPath: edge.path,
        identity:
          edge.external === true && !edge.path.startsWith('/')
            ? edge.path
            : identifyOrdinaryHoldMetafilePathV1(root, compilerCwd, edge.path),
        external: edge.external === true,
      })),
    );
    const scannerEdges = normalizedEdges.filter((edge) => edge.identity === scanner);
    if (scannerEdges.length === 0 || scannerEdges.some((edge) => !edge.external))
      throw new Error('ordinary HOLD scanner external edge differs');
    const output = built.outputs.at(0);
    if (output === undefined) throw new Error('ordinary HOLD compiler artifact absent');
    const outputEntries = Object.entries(meta.outputs);
    const outputEntry = outputEntries.at(0);
    const entryPoint = outputEntry?.[1].entryPoint;
    if (
      outputEntries.length !== 1 ||
      outputEntry?.[0] !== output.path ||
      entryPoint === undefined ||
      identifyOrdinaryHoldMetafilePathV1(root, compilerCwd, entryPoint) !== entryPath
    )
      throw new Error('ordinary HOLD compiler output label or entry identity differs');
    const artifact = new Uint8Array(
      await ordinaryHoldSetupOperationV1(operations, 'artifact.arrayBuffer', () =>
        output.arrayBuffer(),
      ),
    );
    if (artifact.byteLength < 1 || artifact.byteLength > 64 * 1024 * 1024)
      throw new Error('ordinary HOLD compiler artifact outside bound');
    const entryBundle = join(outputRoot, 'ordinary-image.js');
    await ordinaryHoldSetupOperationV1(operations, 'artifact.write', () =>
      writeFile(entryBundle, artifact, { mode: 0o600 }),
    );
    const metadata = JSON.stringify({
      image: plan.image,
      inputs: meta.inputs,
      outputs: meta.outputs,
      provenance,
      resolutions,
      normalizedInputs,
      normalizedEdges,
    });
    if (Buffer.byteLength(metadata) > 4 * 1024 * 1024)
      throw new Error('ordinary HOLD compiler metadata outside bound');
    await ordinaryHoldSetupOperationV1(operations, 'metadata.write', () =>
      writeFile(join(outputRoot, 'ordinary-image-metafile.json'), metadata, {
        mode: 0o600,
      }),
    );
    const imageDigest = createHash('sha256').update(JSON.stringify(plan.image)).digest('hex');
    return Object.freeze({
      format: 'dependency-owner-ordinary-image-build',
      version: 1,
      status: 'built-unqualified',
      sourceEpoch: request.sourceEpoch,
      imageDigest,
      titleDigest: plan.image.titleDigest,
      entryPath: entryBundle,
      entrySha256: createHash('sha256').update(artifact).digest('hex'),
      metafileDigest: createHash('sha256').update(metadata).digest('hex'),
      sourceObservations: plan.image.sourcePins,
      appliedCuts: plan.appliedCuts,
      resolutions: Object.freeze(resolutions),
      setupOperations: Object.freeze(operations),
      provenance,
      unqualified: Object.freeze([
        'runtime owner observer and keeper tap execution',
        'fixed runtime native-generation and Promise ledger qualification',
        'complete body/projection/acceptance taps',
        'setup Bun.write, migrations and four child-reader tap execution',
        'transitive source closure',
        'scanner serialized-function equivalence',
        'actual native custody and finite HOLD retirement',
      ]),
    });
  } finally {
    if (operations.every(hasKnownOrdinaryHoldSetupOutcomeV1)) clearInterval(keeper);
  }
}
