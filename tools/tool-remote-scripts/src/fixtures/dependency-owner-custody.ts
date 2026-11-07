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

export interface OrdinaryHoldLoadExpectationV1 {
  readonly namespace: 'file' | 'ordinary-hold-v1';
  readonly identity: string;
  readonly mode: 'transform' | 'pinned-pass-through' | 'virtual';
  readonly loader: 'ts';
  readonly bytes: number;
  readonly sha256: string;
}
export interface OrdinaryHoldLoadReceiptV1 extends OrdinaryHoldLoadExpectationV1 {
  readonly returned: true;
  readonly settledSha256: string;
}
interface OrdinaryHoldLoadReturnV1 {
  contents: Uint8Array | string;
  loader: unknown;
}

/** Validates a presealed independent table; discovered callback bytes never authorize themselves. */
function decodeOrdinaryHoldLoadExpectationsV1(
  sourceRoot: string,
  value: unknown,
  digest: unknown,
): readonly OrdinaryHoldLoadExpectationV1[] {
  // Proof: omitting the inert table consistency block admitted a zero digest and made 'UC2 ordinary load expectation admission refuses changed seal and closed roster' fail; restoration passed (2026-11-05). This is not fixed packet authority.
  if (
    ordinaryHoldSha(digest, 'ordinary HOLD load digest') !==
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  )
    throw new Error('ordinary HOLD load expectation digest differs');
  // Proof: omitting only 44-row cardinality admitted 43 rows and made 'UC2 ordinary load expectation admission refuses changed seal and closed roster' fail; restoration passed (2026-11-05, inert table).
  if (!Array.isArray(value) || value.length !== 44)
    throw new Error('ordinary HOLD load expectation roster differs');
  const classes = new Map<string, OrdinaryHoldLoadExpectationV1['mode']>();
  for (const entry of ordinaryHoldModuleModesV1)
    if (entry.mode !== 'external-unchanged')
      classes.set(`${sourceRoot}/${entry.relative}`, entry.mode);
  for (const identity of ordinaryHoldPortSourcesV1(sourceRoot).keys())
    classes.set(identity.slice('ordinary-hold-v1:'.length), 'virtual');
  const seen = new Set<string>();
  return Object.freeze(
    value.map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['namespace', 'identity', 'mode', 'loader', 'bytes', 'sha256'],
        'ordinary HOLD load expectation',
      );
      const identity = row['identity'];
      // Coverage: foreign identity fails 'ordinary load expectation admission'.
      if (
        typeof identity !== 'string' ||
        seen.has(identity) ||
        !classes.has(identity) ||
        classes.get(identity) !== row['mode'] ||
        row['loader'] !== 'ts' ||
        row['namespace'] !== (row['mode'] === 'virtual' ? 'ordinary-hold-v1' : 'file') ||
        typeof row['bytes'] !== 'number' ||
        !Number.isSafeInteger(row['bytes']) ||
        row['bytes'] < 0 ||
        row['bytes'] > 16 * 1024 * 1024
      )
        throw new Error('ordinary HOLD load expectation identity or shape differs');
      seen.add(identity);
      const mode = classes.get(identity);
      if (mode === undefined) throw new Error('ordinary HOLD load expectation class absent');
      return Object.freeze({
        namespace: mode === 'virtual' ? ('ordinary-hold-v1' as const) : ('file' as const),
        identity,
        mode,
        loader: 'ts' as const,
        bytes: row['bytes'],
        sha256: ordinaryHoldSha(row['sha256'], 'ordinary HOLD load expectation'),
      });
    }),
  );
}

/** Retains exact callback objects privately; the exported seam permits inert recorder proofs only. */
export function createOrdinaryHoldLoadRecorderV1(
  sourceRoot: string,
  expected: unknown,
  digest: unknown,
) {
  const rows = decodeOrdinaryHoldLoadExpectationsV1(
    ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD load root'),
    expected,
    digest,
  );
  const expectations = new Map(rows.map((row) => [row.identity, row]));
  const retained = new Map<
    string,
    { returned: OrdinaryHoldLoadReturnV1; contents: Uint8Array | string }
  >();
  let settled = false;
  const fingerprint = (returned: OrdinaryHoldLoadReturnV1) => {
    // Proof: omitting the loader predicate let post-record ts-to-js drift escape 'UC2 ordinary load receipts reject actual callback loader drift'; restoration passed (2026-11-05, inert recorder). Contents-shape predicates were not isolated.
    if (
      returned.loader !== 'ts' ||
      !(typeof returned.contents === 'string' || returned.contents instanceof Uint8Array)
    )
      throw new Error('ordinary HOLD load returned shape differs');
    return {
      bytes:
        typeof returned.contents === 'string'
          ? Buffer.byteLength(returned.contents)
          : returned.contents.byteLength,
      sha256: createHash('sha256').update(returned.contents).digest('hex'),
    };
  };
  return Object.freeze({
    record<T extends OrdinaryHoldLoadReturnV1>(
      namespace: OrdinaryHoldLoadExpectationV1['namespace'],
      identity: string,
      returned: T,
    ): T {
      if (settled) throw new Error('ordinary HOLD load recorder already settled');
      const expectation = expectations.get(identity);
      // Coverage: unknown callback identity refusal is exercised by 'UC2 ordinary load receipts refuse duplicate unknown missing and changed callback contents'; its guard omission remains unproved.
      if (expectation?.namespace !== namespace)
        throw new Error('ordinary HOLD load unknown identity');
      // Proof: omitting retained-key refusal admitted a second identical return and made 'UC2 ordinary load receipts refuse duplicate unknown missing and changed callback contents' fail; restoration passed (2026-11-05, inert recorder).
      if (retained.has(identity)) throw new Error('ordinary HOLD load duplicate identity');
      const observed = fingerprint(returned);
      // Proof: omitting this entire admission block admitted changed seven-byte contents and made 'UC2 ordinary load receipts refuse duplicate unknown missing and changed callback contents' fail; restoration passed (2026-11-05, inert recorder). Its length/hash/type conjuncts were not isolated.
      if (
        observed.bytes !== expectation.bytes ||
        observed.sha256 !== expectation.sha256 ||
        (namespace === 'file'
          ? !(returned.contents instanceof Uint8Array)
          : typeof returned.contents !== 'string')
      )
        throw new Error('ordinary HOLD load expectation bytes differ');
      retained.set(identity, { returned, contents: returned.contents });
      // Proof: returning a shallow copy made 'UC2 ordinary load receipts retain callback identity and publish frozen post-join hashes' fail its exact-object assertion; restoration passed (2026-11-05, inert recorder).
      return returned;
    },
    settle(): readonly OrdinaryHoldLoadReceiptV1[] {
      // Coverage: omitted generated returns are refused in 'UC2 ordinary load receipts refuse duplicate unknown missing and changed callback contents'; this count guard's omission was masked and remains unproved.
      if (retained.size !== rows.length) throw new Error('ordinary HOLD load missing identity');
      const receipts = rows.map((row) => {
        const retainedReturn = retained.get(row.identity);
        if (retainedReturn === undefined) throw new Error('ordinary HOLD load missing identity');
        // Proof: omitting contents-reference identity let identical-byte replacement escape 'UC2 ordinary load receipts refuse replacement of the retained contents reference'; restoration passed (2026-11-05, inert recorder).
        if (retainedReturn.returned.contents !== retainedReturn.contents)
          throw new Error('ordinary HOLD load contents reference drift');
        const observed = fingerprint(retainedReturn.returned);
        // Proof: omitting only SHA comparison let same-length retained-byte mutation escape 'UC2 ordinary load receipts detect retained-object drift at the post-join finish boundary'; restoration passed (2026-11-05, inert recorder finish, no compiler execution). Length comparison was not isolated.
        if (observed.bytes !== row.bytes || observed.sha256 !== row.sha256)
          throw new Error('ordinary HOLD load contents drift after compiler join');
        return Object.freeze({ ...row, returned: true as const, settledSha256: observed.sha256 });
      });
      settled = true;
      return Object.freeze(receipts);
    },
  });
}

const ORDINARY_HOLD_LOAD_PACKET_SHA256_V1 =
  '776d5585c05b6d420144392d2308520252ac5635daf8e7cb22691fbe570a37e2';

/** The reviewed raw packet digest is authority; an adjacent caller digest is never accepted. */
export function decodeOrdinaryHoldLoadPacketV1(
  sourceRoot: string,
  value: unknown,
): readonly OrdinaryHoldLoadExpectationV1[] {
  // Proof: omitting only raw SHA comparison admitted same-length valid JSON with 44 rows and one changed valid hash, failing 'UC2 ordinary load packet refuses same-length valid hash corruption before acquisition'; restoration passed (2026-11-05, pure decoder).
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) !== 11851 ||
    createHash('sha256').update(value).digest('hex') !== ORDINARY_HOLD_LOAD_PACKET_SHA256_V1
  )
    throw new Error('ordinary HOLD load packet digest differs');
  const packet = ordinaryHoldFields(
    JSON.parse(value),
    ['format', 'sourceRoot', 'sourceEpoch', 'rows'],
    'ordinary HOLD load packet',
  );
  if (
    packet['format'] !== 'ordinary-hold-load-expectations-v1' ||
    packet['sourceRoot'] !== sourceRoot ||
    packet['sourceEpoch'] !== 'ordinary-febb-custody-v1'
  )
    throw new Error('ordinary HOLD load packet root or epoch differs');
  return decodeOrdinaryHoldLoadExpectationsV1(
    sourceRoot,
    packet['rows'],
    createHash('sha256').update(JSON.stringify(packet['rows'])).digest('hex'),
  );
}

export interface OrdinaryHoldBuildOnlyRequestV1 {
  readonly version: 1;
  readonly mode: 'build-only';
  readonly sourceRoot: string;
  readonly sourceEpoch: 'ordinary-febb-custody-v1';
  readonly loadExpectations: string;
  readonly closureManifest: OrdinaryHoldClosureManifestV1;
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
  readonly loadReceipts: readonly OrdinaryHoldLoadReceiptV1[];
  readonly loadExpectationsSha256: string;
  readonly resolutions: readonly OrdinaryHoldResolutionV1[];
  readonly setupOperations: readonly OrdinaryHoldSetupRecordV1[];
  readonly closureOperations: readonly {
    readonly key: string;
    readonly state: OrdinaryHoldSetupRecordV1['state'];
    readonly joined: boolean;
  }[];
  readonly closureManifestSha256: string;
  readonly closureReadLeaseAssumption: string;
  readonly provenance: OrdinaryHoldBuildProvenanceV1;
  readonly unqualified: readonly string[];
}

function ordinaryHoldBuildRequestV1(value: unknown): OrdinaryHoldBuildOnlyRequestV1 {
  const request = ordinaryHoldFields(
    value,
    ['version', 'mode', 'sourceRoot', 'sourceEpoch', 'loadExpectations', 'closureManifest'],
    'ordinary HOLD build request',
  );
  if (
    request['version'] !== 1 ||
    request['mode'] !== 'build-only' ||
    request['sourceEpoch'] !== 'ordinary-febb-custody-v1'
  )
    throw new Error('ordinary HOLD build-only epoch differs');
  const sourceRoot = ordinaryHoldAbsolute(request['sourceRoot'], 'ordinary HOLD build root');
  const loadExpectations = request['loadExpectations'];
  decodeOrdinaryHoldLoadPacketV1(sourceRoot, loadExpectations);
  if (typeof loadExpectations !== 'string')
    throw new Error('ordinary HOLD load packet text absent');
  return {
    loadExpectations,
    closureManifest: decodeOrdinaryHoldClosurePacketV1(sourceRoot, request['closureManifest']),
    version: 1,
    mode: 'build-only',
    sourceRoot: ordinaryHoldAbsolute(request['sourceRoot'], 'ordinary HOLD build root'),
    sourceEpoch: 'ordinary-febb-custody-v1',
  };
}

/** Retains each original setup Promise and its observer before allowing the next build effect. */
export async function ordinaryHoldSetupOperationV1<T>(
  records: OrdinaryHoldSetupRecordV1[],
  label: string,
  action: () => Promise<T>,
  budget = 96,
  retain?: (
    record: OrdinaryHoldSetupRecordV1,
    original: Promise<T>,
    observer: Promise<void>,
  ) => void,
): Promise<T> {
  if (records.length >= budget) throw new Error('ordinary HOLD setup operation cap exceeded');
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
  const observer = record.observer;
  retain?.(record, returned, observer);
  const [outcome, observation] = await Promise.allSettled([returned, observer]);
  if (observation.status === 'rejected') {
    // Proof: replacing aggregation with observer.reason lost the first setup-route primary Error in 'UC2 ordinary tracked setup and closure preserve both actual distinct rejection causes as unknown'; restoration passed (2026-11-05, inert consumer). Later closure-route and undefined-primary cases have positive coverage, not independent omission proof.
    const cause: unknown =
      outcome.status === 'rejected' && !Object.is(outcome.reason, observation.reason)
        ? new AggregateError(
            [outcome.reason, observation.reason],
            'ordinary HOLD original and observer failed',
          )
        : observation.reason;
    record.cause = cause;
    record.state = 'unknown';
    throw cause;
  }
  record.joined = true;
  if (outcome.status === 'rejected') throw outcome.reason;
  return outcome.value;
}

/** Checks the separately resolved canonical file before its byte read. */
export function assertOrdinaryHoldClosureFileIdentityV1(
  expected: { readonly canonical: string; readonly mode: number; readonly bytes: number },
  canonical: string,
  regular: boolean,
  mode: number,
  size: number,
): void {
  // Proof: four separate omissions of canonical, regular-file, mode and size predicates failed their respective supplied-scalar assertions in 'UC2 ordinary closure file guards reject canonical kind mode size and byte drift'; each restoration passed (2026-11-05, inert consumer, no filesystem fault).
  if (
    canonical !== expected.canonical ||
    !regular ||
    mode !== expected.mode ||
    size !== expected.bytes
  )
    throw new Error('ordinary HOLD closure file identity differs');
}

/** Compares the actual read bytes against the independently sealed file row. */
export function assertOrdinaryHoldClosureBytesV1(
  expected: { readonly bytes: number; readonly sha256: string },
  bytes: Uint8Array,
): void {
  // Proof: omitting only SHA comparison admitted equal-length changed 13-byte contents, failing 'UC2 ordinary closure file guards reject canonical kind mode size and byte drift'; restoration passed (2026-11-05, inert bytes). Length comparison was not isolated.
  if (
    bytes.byteLength !== expected.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== expected.sha256
  )
    throw new Error('ordinary HOLD closure file bytes differ');
}

/** The generated entry is one exact run path; discovered inputs cannot extend the admitted set. */
export function assertOrdinaryHoldClosureInputsV1(
  manifest: {
    readonly sourceRoot: string;
    readonly compilerInputs: readonly string[];
    readonly virtualInputs: readonly string[];
  },
  entryPath: string,
  identities: readonly string[],
): void {
  const expected = new Set([
    ...manifest.compilerInputs.map((identity) => `${manifest.sourceRoot}/${identity}`),
    ...manifest.virtualInputs,
    entryPath,
  ]);
  // Proof: separate cardinality and membership omissions admitted a missing subset and a same-size foreign generated-entry path respectively, failing 'UC2 ordinary closure input set binds generated entry exact path and rejects missing extra duplicate inputs'; each restoration passed (2026-11-05, inert consumer). Duplicate-input uniqueness was not isolated.
  if (
    identities.length !== expected.size ||
    new Set(identities).size !== identities.length ||
    identities.some((identity) => !expected.has(identity))
  )
    throw new Error('ordinary HOLD closure compiler input set differs');
}

export type OrdinaryHoldClosureRoleV1 = 'compiler' | 'scanner' | 'authority' | 'package';
export interface OrdinaryHoldClosureFileV1 {
  readonly identity: string;
  readonly canonical: string;
  readonly mode: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly roles: readonly OrdinaryHoldClosureRoleV1[];
  readonly compilerMode?: 'default' | 'transform' | 'pinned-pass-through';
}
export interface OrdinaryHoldClosureDirectoryV1 {
  readonly identity: string;
  readonly mode: number;
}
export interface OrdinaryHoldClosureSymlinkV1 {
  readonly identity: string;
  readonly target: string;
  readonly mode: number;
}
export interface OrdinaryHoldClosureAbsenceV1 {
  readonly identity: string;
}
export interface OrdinaryHoldClosureGeneratedEntryV1 {
  readonly role: 'generated-entry';
  readonly mode: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly template: {
    readonly format: 'ordinary-hold-entry-v1';
    readonly exports: readonly (readonly [string, string])[];
    readonly ledger: string;
  };
}
export interface OrdinaryHoldClosureManifestV1 {
  readonly format: 'ordinary-hold-input-closure';
  readonly version: 1;
  readonly sourceEpoch: string;
  readonly sourceRoot: string;
  readonly sourceRootCanonical: string;
  readonly compilerCwd: string;
  readonly readLeaseAssumption: string;
  readonly files: readonly OrdinaryHoldClosureFileV1[];
  readonly directories: readonly OrdinaryHoldClosureDirectoryV1[];
  readonly symlinks: readonly OrdinaryHoldClosureSymlinkV1[];
  readonly absences: readonly OrdinaryHoldClosureAbsenceV1[];
  readonly compilerInputs: readonly string[];
  readonly virtualInputs: readonly string[];
  readonly generatedEntry: OrdinaryHoldClosureGeneratedEntryV1;
  readonly historicalSourcePins: readonly {
    readonly relative: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly census: {
    readonly F: number;
    readonly D: number;
    readonly L: number;
    readonly A: number;
  };
  readonly closureOperationCount: number;
}
function ordinaryHoldClosureStringV1(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0'))
    throw new Error('ordinary HOLD closure string differs');
  return value;
}
function ordinaryHoldClosureIntegerV1(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new Error('ordinary HOLD closure integer differs');
  return value;
}
function ordinaryHoldClosurePathV1(value: unknown, absolute: boolean): string {
  const identity = ordinaryHoldClosureStringV1(value);
  if (
    identity.includes('\\') ||
    identity.startsWith('/') !== absolute ||
    (identity !== '/' &&
      (identity.endsWith('/') ||
        identity.includes('//') ||
        identity
          .split('/')
          .some((part) => part === '.' || part === '..' || (!absolute && part === ''))))
  )
    throw new Error('ordinary HOLD closure path differs');
  return identity;
}
function ordinaryHoldClosureArrayV1(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('ordinary HOLD closure array differs');
  return value;
}
function ordinaryHoldClosureUniqueV1(identities: readonly string[]): void {
  if (new Set(identities).size !== identities.length)
    throw new Error('ordinary HOLD closure duplicate identity');
}
function ordinaryHoldClosureRoleV1(value: unknown): OrdinaryHoldClosureRoleV1 {
  if (value !== 'compiler' && value !== 'scanner' && value !== 'authority' && value !== 'package')
    throw new Error('ordinary HOLD closure role differs');
  return value;
}
/** Decodes inert closure rows only; the private build boundary separately admits the fixed raw-byte digest. */
export function decodeOrdinaryHoldClosureManifestV1(value: unknown): OrdinaryHoldClosureManifestV1 {
  const packet = ordinaryHoldFields(
    value,
    [
      'format',
      'version',
      'sourceEpoch',
      'sourceRoot',
      'sourceRootCanonical',
      'compilerCwd',
      'readLeaseAssumption',
      'files',
      'directories',
      'symlinks',
      'absences',
      'compilerInputs',
      'virtualInputs',
      'generatedEntry',
      'historicalSourcePins',
      'census',
      'closureOperationCount',
    ],
    'ordinary HOLD closure manifest',
  );
  if (
    packet['format'] !== 'ordinary-hold-input-closure' ||
    packet['version'] !== 1 ||
    packet['sourceEpoch'] !== 'ordinary-febb-custody-v1'
  )
    throw new Error('ordinary HOLD closure format or epoch differs');
  const sourceRoot = ordinaryHoldClosurePathV1(packet['sourceRoot'], true);
  const sourceRootCanonical = ordinaryHoldClosurePathV1(packet['sourceRootCanonical'], true);
  const compilerCwd = ordinaryHoldClosurePathV1(packet['compilerCwd'], true);
  if (sourceRoot === '/' || sourceRootCanonical === '/' || compilerCwd !== sourceRoot)
    throw new Error('ordinary HOLD closure root differs');
  const readLeaseAssumption = ordinaryHoldClosureStringV1(packet['readLeaseAssumption']);
  const files = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['files']).map(
      (candidate: unknown): OrdinaryHoldClosureFileV1 => {
        const shape = ordinaryHoldFields(
          candidate,
          Object.prototype.hasOwnProperty.call(candidate, 'compilerMode')
            ? ['identity', 'canonical', 'mode', 'bytes', 'sha256', 'roles', 'compilerMode']
            : ['identity', 'canonical', 'mode', 'bytes', 'sha256', 'roles'],
          'ordinary HOLD closure file',
        );
        const identity = ordinaryHoldClosurePathV1(shape['identity'], false);
        const canonical = ordinaryHoldClosurePathV1(shape['canonical'], true);
        if (!canonical.startsWith(sourceRootCanonical + '/'))
          throw new Error('ordinary HOLD closure file leaves canonical root');
        const roles = Object.freeze(
          ordinaryHoldClosureArrayV1(shape['roles']).map(ordinaryHoldClosureRoleV1),
        );
        ordinaryHoldClosureUniqueV1(roles);
        if (roles.length === 0) throw new Error('ordinary HOLD closure empty file roles');
        const row = {
          identity,
          canonical,
          mode: ordinaryHoldClosureIntegerV1(shape['mode'], 0o7777),
          bytes: ordinaryHoldClosureIntegerV1(shape['bytes']),
          sha256: ordinaryHoldSha(shape['sha256'], 'ordinary HOLD closure file'),
          roles,
        };
        if (roles.includes('compiler')) {
          const compilerMode = shape['compilerMode'];
          if (
            compilerMode !== 'default' &&
            compilerMode !== 'transform' &&
            compilerMode !== 'pinned-pass-through'
          )
            throw new Error('ordinary HOLD closure compiler mode differs');
          return Object.freeze({ ...row, compilerMode });
        }
        if (Object.hasOwn(shape, 'compilerMode'))
          throw new Error('ordinary HOLD closure noncompiler mode');
        return Object.freeze(row);
      },
    ),
  );
  const directories = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['directories']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['identity', 'mode'],
        'ordinary HOLD closure directory',
      );
      return Object.freeze({
        identity: ordinaryHoldClosurePathV1(row['identity'], true),
        mode: ordinaryHoldClosureIntegerV1(row['mode'], 0o7777),
      });
    }),
  );
  const symlinks = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['symlinks']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['identity', 'target', 'mode'],
        'ordinary HOLD closure symlink',
      );
      return Object.freeze({
        identity: ordinaryHoldClosurePathV1(row['identity'], true),
        target: ordinaryHoldClosureStringV1(row['target']),
        mode: ordinaryHoldClosureIntegerV1(row['mode'], 0o7777),
      });
    }),
  );
  const absences = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['absences']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(candidate, ['identity'], 'ordinary HOLD closure absence');
      return Object.freeze({ identity: ordinaryHoldClosurePathV1(row['identity'], true) });
    }),
  );
  ordinaryHoldClosureUniqueV1([
    ...files.map((row) => sourceRoot + '/' + row.identity),
    ...directories.map((row) => row.identity),
    ...symlinks.map((row) => row.identity),
    ...absences.map((row) => row.identity),
  ]);
  const compilerInputs = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['compilerInputs']).map((identity) =>
      ordinaryHoldClosurePathV1(identity, false),
    ),
  );
  ordinaryHoldClosureUniqueV1(compilerInputs);
  if (
    compilerInputs.length !== 255 ||
    JSON.stringify(compilerInputs) !== JSON.stringify([...compilerInputs].sort())
  )
    throw new Error('ordinary HOLD closure compiler roster differs');
  const compilerFiles = files.filter((row) => row.roles.includes('compiler'));
  if (
    compilerFiles.length !== 255 ||
    compilerFiles.some((row) => !compilerInputs.includes(row.identity)) ||
    compilerFiles.filter((row) => row.compilerMode === 'default').length !== 239 ||
    compilerFiles.filter((row) => row.compilerMode === 'transform').length !== 14 ||
    compilerFiles.filter((row) => row.compilerMode === 'pinned-pass-through').length !== 2
  )
    throw new Error('ordinary HOLD closure compiler class census differs');
  if (
    files.filter((row) => row.roles.includes('scanner')).length !== 1 ||
    files.some((row) => row.roles.includes('scanner') && row.roles.includes('compiler'))
  )
    throw new Error('ordinary HOLD closure scanner class differs');
  const virtualInputs = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['virtualInputs']).map(ordinaryHoldClosureStringV1),
  );
  ordinaryHoldClosureUniqueV1(virtualInputs);
  if (
    virtualInputs.length !== 28 ||
    virtualInputs.some((identity) => !/^ordinary-hold-v1:[a-z][a-z-]*$/.test(identity)) ||
    JSON.stringify(virtualInputs) !== JSON.stringify([...virtualInputs].sort()) ||
    virtualInputs.some((identity) => !ordinaryHoldPortSourcesV1(sourceRoot).has(identity))
  )
    throw new Error('ordinary HOLD closure virtual roster differs');
  const generated = ordinaryHoldFields(
    packet['generatedEntry'],
    ['role', 'mode', 'bytes', 'sha256', 'template'],
    'ordinary HOLD closure generated entry',
  );
  const template = ordinaryHoldFields(
    generated['template'],
    ['format', 'exports', 'ledger'],
    'ordinary HOLD closure entry template',
  );
  if (
    generated['role'] !== 'generated-entry' ||
    generated['mode'] !== 0o600 ||
    template['format'] !== 'ordinary-hold-entry-v1' ||
    template['ledger'] !== "export * as ledger from 'ordinary-hold-v1:ledger';\n"
  )
    throw new Error('ordinary HOLD closure generated class differs');
  const exports = Object.freeze(
    ordinaryHoldClosureArrayV1(template['exports']).map((candidate: unknown) => {
      const tuple = ordinaryHoldClosureArrayV1(candidate);
      if (tuple.length !== 2) throw new Error('ordinary HOLD closure export tuple differs');
      const name = ordinaryHoldClosureStringV1(tuple[0]);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
        throw new Error('ordinary HOLD closure export name differs');
      return Object.freeze([name, ordinaryHoldClosurePathV1(tuple[1], false)] as const);
    }),
  );
  ordinaryHoldClosureUniqueV1(exports.map((tuple) => tuple[0]));
  ordinaryHoldClosureUniqueV1(exports.map((tuple) => tuple[1]));
  if (
    exports.length !== 17 ||
    JSON.stringify(exports) !== JSON.stringify(ordinaryHoldClosureEntryExportsV1)
  )
    throw new Error('ordinary HOLD closure fixed exports differ');
  const generatedEntry: OrdinaryHoldClosureGeneratedEntryV1 = Object.freeze({
    role: 'generated-entry',
    mode: 0o600,
    bytes: ordinaryHoldClosureIntegerV1(generated['bytes']),
    sha256: ordinaryHoldSha(generated['sha256'], 'ordinary HOLD closure generated entry'),
    template: Object.freeze({
      format: 'ordinary-hold-entry-v1',
      exports,
      ledger: "export * as ledger from 'ordinary-hold-v1:ledger';\n",
    }),
  });
  const historicalSourcePins = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['historicalSourcePins']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['relative', 'bytes', 'sha256'],
        'ordinary HOLD closure historical pin',
      );
      return Object.freeze({
        relative: ordinaryHoldClosurePathV1(row['relative'], false),
        bytes: ordinaryHoldClosureIntegerV1(row['bytes']),
        sha256: ordinaryHoldSha(row['sha256'], 'ordinary HOLD closure historical pin'),
      });
    }),
  );
  ordinaryHoldClosureUniqueV1(historicalSourcePins.map((pin) => pin.relative));
  if (
    historicalSourcePins.length !== 17 ||
    JSON.stringify(historicalSourcePins) !== JSON.stringify(ordinaryHoldSourceEpochV1.pins) ||
    historicalSourcePins.some(
      (pin) =>
        !files.some(
          (row) =>
            row.identity === pin.relative && row.bytes === pin.bytes && row.sha256 === pin.sha256,
        ),
    )
  )
    throw new Error('ordinary HOLD closure historical pins differ');
  const counts = ordinaryHoldFields(
    packet['census'],
    ['F', 'D', 'L', 'A'],
    'ordinary HOLD closure census',
  );
  const census = Object.freeze({
    F: ordinaryHoldClosureIntegerV1(counts['F']),
    D: ordinaryHoldClosureIntegerV1(counts['D']),
    L: ordinaryHoldClosureIntegerV1(counts['L']),
    A: ordinaryHoldClosureIntegerV1(counts['A']),
  });
  if (
    census.F !== 268 ||
    census.D !== 39 ||
    census.L !== 0 ||
    census.A !== 122 ||
    files.length !== census.F ||
    directories.length !== census.D ||
    symlinks.length !== census.L ||
    absences.length !== census.A ||
    packet['closureOperationCount'] !== 1936 ||
    2 * (3 * (census.F + 1) + census.D + 2 * census.L + census.A) !==
      packet['closureOperationCount']
  )
    throw new Error('ordinary HOLD closure operation census differs');
  return Object.freeze({
    format: 'ordinary-hold-input-closure',
    version: 1,
    sourceEpoch: 'ordinary-febb-custody-v1',
    sourceRoot,
    sourceRootCanonical,
    compilerCwd,
    readLeaseAssumption,
    files,
    directories,
    symlinks,
    absences,
    compilerInputs,
    virtualInputs,
    generatedEntry,
    historicalSourcePins,
    census,
    closureOperationCount: 1936,
  });
}

const ordinaryHoldClosureEntryExportsV1 = [
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
import { lstat as ordinaryHoldLstat, readlink as ordinaryHoldReadlink } from 'node:fs/promises';

type OrdinaryHoldClosureLedgerV1 = ReturnType<typeof createOrdinaryHoldClosureLedgerV1>;
type OrdinaryHoldClosurePhaseV1 = 'before' | 'after';

function ordinaryHoldClosureKeyV1(
  phase: OrdinaryHoldClosurePhaseV1,
  identity: string,
  operation: string,
): string {
  return JSON.stringify([phase, identity, operation]);
}

function ordinaryHoldClosureKeysV1(manifest: OrdinaryHoldClosureManifestV1): readonly string[] {
  const keys: string[] = [];
  for (const phase of ['before', 'after'] as const) {
    for (const row of [...manifest.files, { identity: 'generated-entry' }])
      for (const operation of ['realpath', 'lstat', 'read'])
        keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, operation));
    for (const row of manifest.directories)
      keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'));
    for (const row of manifest.symlinks)
      for (const operation of ['lstat', 'readlink'])
        keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, operation));
    for (const row of manifest.absences)
      keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'));
  }
  if (keys.length !== manifest.closureOperationCount)
    throw new Error('ordinary HOLD closure operation budget differs');
  return Object.freeze(keys);
}

/** Each sealed key wraps exactly one actual filesystem Promise; default-loader resolution remains untouched. */
async function observeOrdinaryHoldClosureV1(
  manifest: OrdinaryHoldClosureManifestV1,
  ledger: OrdinaryHoldClosureLedgerV1,
  phase: OrdinaryHoldClosurePhaseV1,
  entryPath: string,
): Promise<void> {
  for (const row of [
    ...manifest.files,
    { ...manifest.generatedEntry, identity: 'generated-entry', canonical: entryPath },
  ]) {
    const logical =
      row.identity === 'generated-entry' ? entryPath : `${manifest.sourceRoot}/${row.identity}`;
    const canonical = await ledger.run(
      ordinaryHoldClosureKeyV1(phase, row.identity, 'realpath'),
      () => ordinaryHoldRealpath(logical),
    );
    if (canonical !== row.canonical)
      throw new Error('ordinary HOLD closure canonical identity differs');
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(canonical),
    );
    assertOrdinaryHoldClosureFileIdentityV1(
      row,
      canonical,
      stat.isFile(),
      stat.mode & 0o7777,
      stat.size,
    );
    const bytes = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'read'), () =>
      readBinaryFile(canonical),
    );
    assertOrdinaryHoldClosureBytesV1(row, bytes);
  }
  for (const row of manifest.directories) {
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(row.identity),
    );
    if (!stat.isDirectory() || (stat.mode & 0o7777) !== row.mode)
      throw new Error('ordinary HOLD closure directory layout differs');
  }
  for (const row of manifest.symlinks) {
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(row.identity),
    );
    if (!stat.isSymbolicLink() || (stat.mode & 0o7777) !== row.mode)
      throw new Error('ordinary HOLD closure symlink layout differs');
    const target = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'readlink'), () =>
      ordinaryHoldReadlink(row.identity),
    );
    if (target !== row.target) throw new Error('ordinary HOLD closure symlink target differs');
  }
  for (const row of manifest.absences) {
    try {
      await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
        ordinaryHoldLstat(row.identity),
      );
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
    throw new Error('ordinary HOLD closure expected absence is present');
  }
}

const ORDINARY_HOLD_CLOSURE_PACKET_SHA256_V1 =
  '3947771e856124427559a77a842a24f6da5048840cb109c2f7079b8da7bce7f4';

/** Fixed raw-byte authority is separate from the externally established exclusive no-writer lease. */
export function decodeOrdinaryHoldClosurePacketV1(
  sourceRoot: string,
  value: unknown,
): OrdinaryHoldClosureManifestV1 {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) !== 138430 ||
    createHash('sha256').update(value).digest('hex') !== ORDINARY_HOLD_CLOSURE_PACKET_SHA256_V1
  )
    throw new Error('ordinary HOLD closure packet digest differs');
  const manifest = decodeOrdinaryHoldClosureManifestV1(JSON.parse(value));
  if (manifest.sourceRoot !== sourceRoot || manifest.sourceRootCanonical !== sourceRoot)
    throw new Error('ordinary HOLD closure packet root differs');
  return manifest;
}

export interface OrdinaryHoldClosureObservationV1 {
  readonly key: string;
  readonly label: string;
  readonly kind: 'promise';
  readonly state: OrdinaryHoldSetupRecordV1['state'];
  readonly joined: boolean;
  readonly returned?: unknown;
  readonly original?: Promise<unknown>;
  readonly observer?: Promise<void>;
}

/** Closed keys reserve each real effect once; the inert seam does not establish a filesystem lease. */
export function createOrdinaryHoldClosureLedgerV1(keys: readonly string[]) {
  const allowed = new Set(keys);
  // Proof: omitting admitted-key uniqueness let duplicate construction succeed, failing 'UC2 ordinary closure ledger refuses unknown duplicate and missing keys before sentinel effects'; restoration passed (2026-11-05, inert ledger).
  if (allowed.size !== keys.length) throw new Error('ordinary HOLD closure duplicate admitted key');
  const records: OrdinaryHoldSetupRecordV1[] = [];
  const reserved = new Set<string>();
  return Object.freeze({
    async run<T>(key: string, action: () => Promise<T>): Promise<T> {
      // Proof: omitting unknown-key refusal made invocation fulfill and failed the refusal assertion in 'UC2 ordinary closure ledger refuses unknown duplicate and missing keys before sentinel effects'; restoration passed (2026-11-05, inert ledger). The later sentinel-count assertion was not reached.
      if (!allowed.has(key)) throw new Error('ordinary HOLD closure unknown key');
      // Proof: omitting reserved-key refusal made the second invocation fulfill and failed the refusal assertion in 'UC2 ordinary closure ledger refuses unknown duplicate and missing keys before sentinel effects'; restoration passed (2026-11-05, inert ledger). The later sentinel-count assertion was not reached.
      if (reserved.has(key)) throw new Error('ordinary HOLD closure duplicate key');
      reserved.add(key);
      return ordinaryHoldSetupOperationV1(records, key, action, keys.length);
    },
    inspect(): readonly OrdinaryHoldClosureObservationV1[] {
      return Object.freeze(
        records.map((record) =>
          Object.freeze({
            key: record.label,
            label: record.label,
            kind: record.kind,
            state: record.state,
            joined: record.joined,
            returned: record.returned,
            original: record.original,
            observer: record.observer,
          }),
        ),
      );
    },
    hasKnownOutcomes(): boolean {
      return records.every(hasKnownOrdinaryHoldSetupOutcomeV1);
    },
    assertComplete(): void {
      // Proof: omitting this entire completeness block let a missing after key escape 'UC2 ordinary closure ledger refuses unknown duplicate and missing keys before sentinel effects'; restoration passed (2026-11-05, inert ledger). Individual conjuncts and pending-provider behavior were not isolated.
      if (
        reserved.size !== allowed.size ||
        records.length !== keys.length ||
        !records.every(hasKnownOrdinaryHoldSetupOutcomeV1)
      )
        throw new Error('ordinary HOLD closure missing or unjoined keys');
    },
  });
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
  readonly closureOperations: () => readonly OrdinaryHoldClosureObservationV1[];
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
  const closureLedger = createOrdinaryHoldClosureLedgerV1(
    ordinaryHoldClosureKeysV1(admitted.closureManifest),
  );
  const body = buildOrdinaryHoldImageBodyV1(admitted, operations, closureLedger, (outputRoot) => {
    const attempt = ordinaryHoldBuilderAttempts.get(body);
    if (attempt !== undefined) attempt.outputRoot = outputRoot;
  });
  const observer = body.then(
    () => undefined,
    () => undefined,
  );
  ordinaryHoldBuilderAttempts.set(body, {
    operations,
    observer,
    closureOperations: closureLedger.inspect,
  });
  return body;
}

async function buildOrdinaryHoldImageBodyV1(
  request: OrdinaryHoldBuildOnlyRequestV1,
  operations: OrdinaryHoldSetupRecordV1[],
  closureLedger: OrdinaryHoldClosureLedgerV1,
  retainOutputRoot: (outputRoot: string) => void,
): Promise<OrdinaryHoldBuiltImageV1> {
  let retainedLoadRecorder: ReturnType<typeof createOrdinaryHoldLoadRecorderV1> | undefined;
  const keeper = setInterval(() => ({ operations, retainedLoadRecorder, closureLedger }), 60000);
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
    assertOrdinaryHoldClosureBytesV1(
      request.closureManifest.generatedEntry,
      new TextEncoder().encode(entry),
    );
    if (process.cwd() !== request.closureManifest.compilerCwd)
      throw new Error('ordinary HOLD closure compiler cwd differs');
    await observeOrdinaryHoldClosureV1(request.closureManifest, closureLedger, 'before', entryPath);
    const resolutions: OrdinaryHoldResolutionV1[] = [];
    const callbacks = new Map<string, number>();
    const loadExpectations = decodeOrdinaryHoldLoadPacketV1(root, request.loadExpectations);
    const loadRecorder = createOrdinaryHoldLoadRecorderV1(
      root,
      loadExpectations,
      createHash('sha256').update(JSON.stringify(loadExpectations)).digest('hex'),
    );
    retainedLoadRecorder = loadRecorder;
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
          const returned = { contents, loader: 'ts' as const };
          return loadRecorder.record('ordinary-hold-v1', source.path, returned);
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
          const returned = { contents: new Uint8Array(bytes), loader: 'ts' as const };
          return loadRecorder.record('file', source.path, returned);
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
    const compilerIndex = operations.length;
    let compilerCustody:
      | {
          readonly record: OrdinaryHoldSetupRecordV1;
          readonly original: Promise<unknown>;
          readonly observer: Promise<void>;
        }
      | undefined;
    const built = await ordinaryHoldSetupOperationV1(
      operations,
      'compiler.Bun.build',
      () => {
        return Bun.build({
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
        });
      },
      96,
      (record, original, observer) => {
        compilerCustody = Object.freeze({ record, original, observer });
      },
    );
    // This continuation follows the helper's actual await of its original and observer, never a caller token.
    const compiler = operations.at(compilerIndex);
    if (
      compiler === undefined ||
      compiler !== operations.at(-1) ||
      compiler !== compilerCustody?.record ||
      compiler.label !== 'compiler.Bun.build' ||
      compiler.original !== compilerCustody.original ||
      compiler.returned !== compilerCustody.original ||
      compiler.observer !== compilerCustody.observer ||
      !compiler.joined ||
      compiler.state !== 'fulfilled'
    )
      throw new Error('ordinary HOLD actual compiler join identity differs');
    const loadReceipts = loadRecorder.settle();
    await observeOrdinaryHoldClosureV1(request.closureManifest, closureLedger, 'after', entryPath);
    closureLedger.assertComplete();
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
    assertOrdinaryHoldClosureInputsV1(
      request.closureManifest,
      entryPath,
      normalizedInputs.map((input) => input.identity),
    );
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
    const closureOperations = Object.freeze(
      closureLedger
        .inspect()
        .map((record) =>
          Object.freeze({ key: record.key, state: record.state, joined: record.joined }),
        ),
    );
    const metadata = JSON.stringify({
      closureManifestSha256: ORDINARY_HOLD_CLOSURE_PACKET_SHA256_V1,
      closureReadLeaseAssumption: request.closureManifest.readLeaseAssumption,
      closureGeneratedEntry: { path: entryPath, ...request.closureManifest.generatedEntry },
      closureCompilerCwd: request.closureManifest.compilerCwd,
      closureOperations,
      image: plan.image,
      inputs: meta.inputs,
      outputs: meta.outputs,
      provenance,
      resolutions,
      normalizedInputs,
      normalizedEdges,
      loadReceipts,
      loadExpectationsSha256: ORDINARY_HOLD_LOAD_PACKET_SHA256_V1,
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
      loadReceipts,
      loadExpectationsSha256: ORDINARY_HOLD_LOAD_PACKET_SHA256_V1,
      resolutions: Object.freeze(resolutions),
      closureOperations,
      closureManifestSha256: ORDINARY_HOLD_CLOSURE_PACKET_SHA256_V1,
      closureReadLeaseAssumption: request.closureManifest.readLeaseAssumption,
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
    if (operations.every(hasKnownOrdinaryHoldSetupOutcomeV1) && closureLedger.hasKnownOutcomes())
      clearInterval(keeper);
  }
}

export type OrdinaryKnownCompositionCaseV1 =
  'known-initial-prepared-release' | 'known-preawait-manifest-refusal';

/** Source-only prospective controller epoch; old ordinary recipes remain independently usable. */
export const ordinaryCoupledSourceEpochV1 = 'ordinary-uc2-coupled-r2-v1' as const;

/** Generates the coupled ledger additions without importing or invoking any prospective module. */
function ordinaryCoupledLedgerExtensionV1(): string {
  return `
const controllerLabels=new Set(['fixture','owner-action','outer-owner','completion']);
const controllerFailures=[],knownJoinOutcomes=[];
const controllerControls=[],controllerTickets=new WeakMap(),controllerPreparations=[],controllerPreparationMap=new WeakMap(),scannerObligations=[],scannerTickets=new WeakMap(),scannerCalls=[];
function stopController(cause,references){custody.stopped=true;custody.failures.push(cause);custody.fatalObservation={kind:'coupled-controller',references};}
export function reserveControllerControl(label){admit();if(!controllerLabels.has(label)||controllerControls.some(control=>control.label===label))fail('coupled control label or repetition differs');const ticket=Object.freeze({});const control={ticket,label,phase:'entered',original:undefined,observer:undefined,observerSettled:false,joined:false};controllerControls.push(control);controllerTickets.set(ticket,control);return ticket;}
export function attachControllerControl(ticket,original){const control=controllerTickets.get(ticket);if(control===undefined||control.phase!=='entered')fail('coupled control attachment differs');control.original=original;control.phase='pending';try{control.observer=original.then(value=>{control.value=value;control.phase='fulfilled';control.observerSettled=true;},cause=>{control.cause=cause;control.phase='rejected';control.observerSettled=true;});}catch(cause){control.phase='unknown';stopController(cause,[control,original]);throw cause;}return original;}
export function throwControllerControl(ticket,cause){const control=controllerTickets.get(ticket);if(control===undefined)fail('coupled control throw absent');control.phase='unknown';control.cause=cause;stopController(cause,[control]);}
export function capturePreparation(preparation,record){try{if(controllerPreparations.length!==0||controllerPreparationMap.has(preparation))throw Error('coupled preparation repeated');const frame={preparation,record};controllerPreparations.push(frame);controllerPreparationMap.set(preparation,record);}catch(cause){stopController(cause,[preparation,record]);}}
export function requireControllerPreparation(preparation){const record=controllerPreparationMap.get(preparation);if(record===undefined)fail('coupled preparation identity absent');return record;}
export function reserveCompletion(preparation){const record=requireControllerPreparation(preparation);const ticket=reserveControllerControl('completion');controllerTickets.get(ticket).preparation=preparation;controllerTickets.get(ticket).record=record;return ticket;}
export function reserveScannerCall(args){admit();if(scannerCalls.length>=5)fail('coupled scanner call cap exceeded');const call={args:[...args],phase:'entered',original:undefined,observer:undefined};scannerCalls.push(call);return call;}
export function attachScannerCall(call,original){call.original=original;call.phase='pending';try{call.observer=original.then(value=>{call.phase='fulfilled';},cause=>{call.phase='unknown';call.cause=cause;stopController(cause,[call,original]);});}catch(cause){call.phase='unknown';call.cause=cause;stopController(cause,[call,original]);throw cause;}return original;}
export function throwScannerCall(call,cause){call.phase='unknown';call.cause=cause;stopController(cause,[call]);}
export function reserveScanner(args){admit();if(args.length!==3||args[2]!==true||scannerObligations.length!==0)fail('coupled retained scanner boundary differs');const ticket=Object.freeze({});const record={ticket,args:[...args],phase:'entered',original:undefined,scanOriginal:undefined,observer:undefined,observerSettled:false,nativePhase:'not-entered',nativeEntries:0,productionAttempts:0,fixtureAttempts:0};scannerTickets.set(ticket,record);scannerObligations.push(record);return ticket;}
export function attachScannerPromise(ticket,original){const record=scannerTickets.get(ticket);if(record===undefined||record.phase!=='entered')fail('coupled scanner attachment differs');record.scanOriginal=original;record.phase='pending';try{record.observer=original.then(monitor=>{record.original=monitor;record.phase='returned';try{const close=monitor.close;if(typeof close!=='function')throw Error('coupled scanner close absent');record.savedClose=close;record.closeReceiver=monitor;wrappers.set(monitor,Object.freeze({kind:'scanner',obligation:record}));monitor.close=function(...args){record.productionAttempts++;if(this!==monitor)fail('coupled scanner receiver differs');if(record.nativePhase!=='not-entered')fail('coupled scanner close re-entry');record.nativePhase='entered';record.nativeEntries++;record.closeArgs=[...args];try{const returned=Reflect.apply(close,this,args);record.closeReturned=returned;record.nativePhase='returned';return returned;}catch(cause){record.nativePhase='unknown';record.closeCause=cause;stopController(cause,[record,monitor]);throw cause;}};}catch(cause){record.phase='unknown';stopController(cause,[record,monitor]);}record.observerSettled=true;},cause=>{record.phase='unknown';record.scanCause=cause;record.observerSettled=true;stopController(cause,[record,original]);});}catch(cause){record.phase='unknown';stopController(cause,[record,original]);throw cause;}return original;}
export function throwScanner(ticket,cause){const record=scannerTickets.get(ticket);if(record===undefined)fail('coupled scanner throw absent');record.phase='unknown';record.scanCause=cause;stopController(cause,[record]);}
export function retainControllerFailure(kind,cause){if(kind!=='semantic'&&kind!=='release')fail('coupled failure attribution differs');controllerFailures.push({kind,cause});}
export function inspectKnownComposition(){return Object.freeze({failures:Object.freeze(controllerFailures.map(snapshot)),joinOutcomes:Object.freeze(knownJoinOutcomes.map(snapshot)),controls:Object.freeze(controllerControls.map(snapshot)),preparations:Object.freeze(controllerPreparations.map(frame=>Object.freeze({...frame}))),scannerCalls:Object.freeze(scannerCalls.map(snapshot)),scanners:Object.freeze(scannerObligations.map(snapshot))});}
export function assertKnownCase(caseId){if(caseId!=='known-initial-prepared-release'&&caseId!=='known-preawait-manifest-refusal')fail('coupled known case differs');if(controllerControls.length!==0||controllerPreparations.length!==0)fail('coupled controller already entered');}
export function assertKnownPrepared(context){if(controllerPreparations.length!==1)fail('coupled preparation census differs');const record=controllerPreparations[0].record;if(context!==record.context||record.storage!==context.storage||record.owner!==context.owner||context.purpose!=='initial-handoff'||context.storage.purpose!=='initial-handoff'||context.attempt!==record.attempt||context.pending.contents!==record.pending)fail('coupled genuine context association differs');return record;}
export function assertManifestRefusal(cause,baseline){if(!Number.isSafeInteger(baseline)||baseline<0||baseline>custody.natives.length)fail('coupled refusal baseline differs');if(controllerPreparations.length!==1)fail('coupled refusal preparation absent');const record=controllerPreparations[0].record;const completion=controllerControls.find(control=>control.label==='completion');if(record.composition.outcome.phase!=='rejected'||record.composition.outcome.cause!==cause||record.projection===undefined||record.projection.outcome.phase!=='rejected'||record.projection.outcome.cause!==cause||completion===undefined||completion.phase!=='rejected'||completion.cause!==cause||record.prepared!==undefined||record.context!==undefined||record.storage!==undefined||record.runtimeLock!==undefined||record.runtimeAction!==undefined||custody.owners.some(frame=>frame.observations.some(observation=>observation.kind==='runtime-entry'||observation.kind==='runtime-action'))||custody.operations.some(operation=>operation.label==='complete.scanner')||record.originals.size!==0||custody.natives.slice(baseline).some(native=>native.label.startsWith('storage.')||native.label.startsWith('graph.')||native.label.startsWith('backup.')||native.label==='database.readonly')||custody.operations.some(operation=>operation.label==='complete.storage')||scannerObligations.length!==0)fail('coupled exact manifest refusal differs');}
export async function joinKnownComposition(){
 const controls=[...controllerControls];if(controls.length!==4||controllerPreparations.length!==1)fail('coupled known control census differs');
 const preparedRecord=controllerPreparations[0].record;
 if(custody.owners.length!==1||custody.owners[0].owner!==preparedRecord.owner||custody.owners[0].ownership!==preparedRecord.ownership)fail('coupled owner observation missing');
 for(const kind of ['composition','projection']){const captures=custody.owners[0].observations.filter(observation=>observation.kind===kind);const settlement=kind==='composition'?preparedRecord.composition:preparedRecord.projection;if(captures.length!==1||settlement===undefined||captures[0].record!==preparedRecord||captures[0].original!==settlement.original||captures[0].observer!==settlement.observer)fail('coupled owner observation binding differs');}
 const pending=[],observers=[];for(const control of controls){if(control.original===undefined||control.observer===undefined)fail('coupled control observer missing');pending.push(control.original,control.observer);observers.push(control.observer);}
 for(const operation of custody.operations)if(operation.kind==='promise'){if(operation.original===undefined||operation.observer===undefined)fail('coupled operation observer missing');pending.push(operation.original,operation.observer);observers.push(operation.observer);}
 for(const frame of custody.owners)for(const observation of frame.observations)if(['composition','projection','runtime-action','runtime-entry','operation'].includes(observation.kind)){if(observation.original===undefined||observation.observer===undefined)fail('coupled owner observer missing');pending.push(observation.original,observation.observer);observers.push(observation.observer);}
 for(const call of scannerCalls){if(call.original===undefined||call.observer===undefined)fail('coupled scanner call observer missing');pending.push(call.original,call.observer);observers.push(call.observer);}
 for(const scanner of scannerObligations){if(scanner.scanOriginal===undefined||scanner.observer===undefined)fail('coupled scanner observer missing');pending.push(scanner.scanOriginal,scanner.observer);observers.push(scanner.observer);}
 const settled=await Promise.allSettled(pending);for(let index=0;index<pending.length;index++)knownJoinOutcomes.push({original:pending[index],outcome:settled[index]});
 const observerSettled=await Promise.allSettled(observers);for(let index=0;index<observers.length;index++)knownJoinOutcomes.push({observer:observers[index],outcome:observerSettled[index]});
 if(observerSettled.some(outcome=>outcome.status!=='fulfilled'))fail('coupled original observer rejected');
 for(const child of children){if(child.original===undefined)fail('coupled child original missing');await joinOrdinaryChild(child.original);if(child.joinObserver===undefined)fail('coupled child join observer missing');await child.joinObserver;}
 for(const control of controls){if(!control.observerSettled||!['fulfilled','rejected'].includes(control.phase))fail('coupled control unsettled');control.joined=true;}
 for(const operation of custody.operations)if(operation.kind==='promise')await joinOperation(operation.ticket);
 if(custody.stopped||custody.fatalObservation!==undefined||custody.natives.some(native=>native.phase!=='returned'||native.nativePhase!=='returned'||native.nativeEntries!==1||native.nativeReturns!==1)||scannerObligations.some(scanner=>scanner.phase!=='returned'||scanner.nativePhase!=='returned'||scanner.nativeEntries!==1)||children.some(child=>!child.joined)||migrationRoots.some(root=>root.removalPhase!=='returned'))fail('coupled known originals not closed');
 const keeperCaptures=custody.owners[0].observations.filter(observation=>observation.kind==='keeper');if(keeperCaptures.length!==1)fail('coupled production keeper capture missing');const keeper=keeperCaptures[0].record;const intervals=custody.operations.filter(operation=>operation.label==='owner.interval'),clears=custody.operations.filter(operation=>operation.label==='owner.clear');if(intervals.length!==1||intervals[0].phase!=='returned'||intervals[0].returned!==keeper.interval||intervals[0].args.length!==2||typeof intervals[0].args[0]!=='function'||intervals[0].args[1]!==60000||clears.length!==1||clears[0].phase!=='returned'||clears[0].args.length!==1||clears[0].args[0]!==keeper.interval)fail('coupled production keeper retirement differs');
 const record=controllerPreparations[0].record;if(record.phase!=='closed'||record.ownership.state==='unknown'||record.originals.size!==0&&[...record.originals].some(original=>original.state!=='closed'))fail('coupled production preparation not closed');
}
`;
}

/** Emits only fixed sources; no controller entry or scanner runs during generation. */
export function ordinaryCoupledPortSourcesV1(sourceRoot: string): ReadonlyMap<string, string> {
  const root = ordinaryHoldAbsolute(sourceRoot, 'coupled source root');
  const ports = new Map(ordinaryHoldPortSourcesV1(root));
  const ledger = ports.get('ordinary-hold-v1:ledger');
  if (ledger === undefined) throw new Error('coupled base ledger absent');
  const scannerAssociation =
    '  if(ticket===undefined&&wrapper===undefined){custody.stopped=true;custody.fatalObservation={preparation,original,observed,acquired};}';
  if (ledger.split(scannerAssociation).length !== 2)
    throw new Error('coupled scanner association cut differs');
  ports.set(
    'ordinary-hold-v1:ledger',
    ledger.replace(
      scannerAssociation,
      "  if(acquisition.kind==='scanner'?(wrapper?.kind!=='scanner'||wrapper.obligation===undefined||wrapper.obligation.original!==acquired):(ticket===undefined&&wrapper===undefined)){custody.stopped=true;custody.fatalObservation={preparation,original,observed,acquired};}",
    ) + ordinaryCoupledLedgerExtensionV1(),
  );
  const owner = `${root}/tools/tool-remote-scripts/src/lib/edge-ownership.ts`;
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  ports.set(
    'ordinary-hold-v1:complete-acceptance',
    `import { assertPreparationCompletion as original } from ${JSON.stringify(owner)};\nimport {reserveCompletion,attachControllerControl,throwControllerControl} from 'ordinary-hold-v1:ledger';\nexport function assertPreparationCompletion(...args:Parameters<typeof original>):ReturnType<typeof original>{const ticket=reserveCompletion(args[0]);try{return attachControllerControl(ticket,Reflect.apply(original,undefined,args));}catch(cause){throwControllerControl(ticket,cause);throw cause;}}`,
  );
  ports.set(
    'ordinary-hold-v1:complete-scanner',
    `import {scanMigrationArtifact as original} from ${JSON.stringify(scanner)};\nimport {reserveOperation,attachPromise,throwOperation,reserveScanner,attachScannerPromise,throwScanner,reserveScannerCall,attachScannerCall,throwScannerCall} from 'ordinary-hold-v1:ledger';\nexport function scanMigrationArtifact(...args:Parameters<typeof original>):ReturnType<typeof original>{const scanner=args[2]===true?reserveScanner(args):undefined;const operation=reserveOperation('complete.scanner','promise',undefined,args);const call=reserveScannerCall(args);try{const returned=attachScannerCall(call,attachPromise(operation,Reflect.apply(original,undefined,args)));return scanner===undefined?returned:attachScannerPromise(scanner,returned);}catch(cause){throwOperation(operation,cause);throwScannerCall(call,cause);if(scanner!==undefined)throwScanner(scanner,cause);throw cause;}}`,
  );
  ports.set(
    'ordinary-hold-v1:graph-layout',
    `import type {EnvLayout} from ${JSON.stringify(`${root}/tools/tool-remote-scripts/src/lib/env.ts`)};\nexport type EnvName = 'prod' | 'dev';\nlet bound:Readonly<{prod:EnvLayout;dev:EnvLayout}>|undefined;\nexport function bindGraphLayouts(layouts:Readonly<{prod:EnvLayout;dev:EnvLayout}>){if(bound!==undefined)throw Error('coupled layouts already bound');if(layouts===null||typeof layouts!=='object'||layouts.prod===undefined||layouts.dev===undefined)throw Error('coupled layouts absent');bound=Object.freeze({prod:Object.freeze({...layouts.prod}),dev:Object.freeze({...layouts.dev})});}\nexport function envLayout(name:string|undefined):EnvLayout{if(bound===undefined)throw Error('coupled layouts unbound');if(name!=='prod'&&name!=='dev')throw Error('coupled layout name differs');return bound[name];}`,
  );
  const graphPort = ports.get('ordinary-hold-v1:storage-graph');
  if (graphPort === undefined) throw new Error('coupled graph port absent');
  ports.set(
    'ordinary-hold-v1:storage-graph',
    graphPort +
      `\nexport type {InitialHandoffArtifactObservation} from ${JSON.stringify(`${root}/tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`)};`,
  );
  ports.set('ordinary-hold-v1:controller', ordinaryKnownControllerSourceV1(root));
  typeOrdinaryCoupledPortsV1(ports);
  ports.set('ordinary-hold-v1:ledger', ordinaryCoupledTypedLedgerSourceV1());
  return ports;
}

/** Fixed genuine composition source. Its imports and calls are inert until a later native lease. */
function ordinaryKnownControllerSourceV1(root: string): string {
  return `import {participantActivationFixture} from ${JSON.stringify(`${root}/tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts`)};
import {withDependencyOwner} from ${JSON.stringify(`${root}/tools/tool-remote-scripts/src/lib/edge-ownership.ts`)};
import {prepareInitialDependencyHandoffUnderOwner,consumePreparedDependencyActivation,assertParticipantRestorationContext,releasePreparedDependencyActivation} from ${JSON.stringify(`${root}/tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts`)};
import {bindGraphLayouts} from 'ordinary-hold-v1:graph-layout';
import {assertKnownCase,reserveControllerControl,attachControllerControl,throwControllerControl,inspectLedger,inspectKnownComposition,assertKnownPrepared,assertManifestRefusal,joinKnownComposition,retainControllerFailure} from 'ordinary-hold-v1:ledger';
function check(condition:unknown,code:string):asserts condition{if(!condition)throw Error(code);}
function hash(contents:string){return new Bun.CryptoHasher('sha256').update(contents).digest('hex');}
export async function runOrdinaryKnownComposition(caseId: 'known-initial-prepared-release' | 'known-preawait-manifest-refusal'){
 assertKnownCase(caseId);
 const fixtureTicket=reserveControllerControl('fixture');let fixtureOriginal:ReturnType<typeof participantActivationFixture>;
 try{fixtureOriginal=attachControllerControl(fixtureTicket,participantActivationFixture(['prod']));}catch(cause){throwControllerControl(fixtureTicket,cause);throw cause;}
 const fixture=await fixtureOriginal;bindGraphLayouts(fixture.layouts);process.env['WBS_EDGE_STATE']=fixture.root;
 const request=caseId==='known-preawait-manifest-refusal'?{...fixture.request,authorities:{...fixture.request.authorities,writerManifestContents:'x'.repeat(262145)}}:fixture.request;
 const deadline=performance.now()+180000;let baseline:number|undefined;let exposed=false;let refusal:unknown;let refused=false;
 async function ownerAction(owner:Parameters<typeof prepareInitialDependencyHandoffUnderOwner>[0]){
  baseline=inspectLedger().natives.length;
  const prepared=await prepareInitialDependencyHandoffUnderOwner(owner,request,fixture.layouts,deadline,fixture.root,fixture.ports);
  exposed=true;let failed=false;let primary:unknown;let releaseFailed=false;let releaseCause:unknown;
  try{
   check(caseId==='known-initial-prepared-release','COUPLED_MANIFEST_EXPOSED_PREPARATION');
   const context=await consumePreparedDependencyActivation(owner,prepared);
   const record=assertKnownPrepared(context);
   if(context.purpose!=='initial-handoff')throw Error('COUPLED_INITIAL_PURPOSE_DIFFERS');
   check(context.storage.artifacts.selected.length===1&&context.storage.artifacts.selected[0].environment==='prod','COUPLED_SELECTED_PROD_DIFFERS');
   check(context.participants!==undefined&&context.attempt===record.attempt&&context.pending.contents===record.pending,'COUPLED_DURABLE_ASSOCIATION_DIFFERS');
   const selected=context.storage.artifacts.selected[0];
   const captures=context.storage.records.map(publication=>({publication,envelope:JSON.parse(publication.contents)}));
   check(captures.every(({envelope})=>envelope.owner===context.pending.contents),'COUPLED_PUBLICATION_OWNER_DIFFERS');
   const intent=captures.find(({envelope})=>envelope.record.format==='dependency-activation-intent');
   const committed=captures.find(({envelope})=>envelope.record.format==='dependency-activation-committed');
   const backup=captures.find(({envelope})=>envelope.record.format==='dependency-activation-backup');
   check(intent!==undefined&&committed!==undefined&&backup!==undefined,'COUPLED_PROVENANCE_ABSENT');
   check(hash(selected.captureContents)===intent.envelope.record.capture.sha256&&backup.envelope.record.captureSha256===intent.envelope.record.capture.sha256&&committed.envelope.record.captureSha256===intent.envelope.record.capture.sha256,'COUPLED_CAPTURE_HASH_DIFFERS');
   check(selected.backup.sha256===backup.envelope.record.snapshot.sha256&&selected.backup.bytes===backup.envelope.record.snapshot.bytes&&selected.backup.name===backup.envelope.record.snapshot.name,'COUPLED_BACKUP_DIFFERS');
   check(intent.envelope.record.receipt.participantProofSha256===context.storage.participantRecord.sha256&&intent.envelope.record.receipt.migrationCaptureSha256===intent.envelope.record.capture.sha256&&JSON.stringify(committed.envelope.record.receipt)===JSON.stringify(intent.envelope.record.receipt),'COUPLED_RECEIPT_DIFFERS');
   await context.storage.evidence.inspect();await context.storage.stores.inspect();await assertParticipantRestorationContext(context);
  }catch(cause){failed=true;primary=cause;retainControllerFailure('semantic',cause);}
  finally{try{releasePreparedDependencyActivation(owner,prepared);}catch(cause){releaseFailed=true;releaseCause=cause;retainControllerFailure('release',cause);}}
  if(failed&&releaseFailed)throw new AggregateError([primary,releaseCause],'coupled controller semantic and release failure');
  if(failed)throw primary;if(releaseFailed)throw releaseCause;
 }
 function forwardOwnerAction(owner:Parameters<typeof prepareInitialDependencyHandoffUnderOwner>[0]){const ticket=reserveControllerControl('owner-action');try{return attachControllerControl(ticket,ownerAction(owner));}catch(cause){throwControllerControl(ticket,cause);throw cause;}}
 const outerTicket=reserveControllerControl('outer-owner');let outer;
 try{outer=attachControllerControl(outerTicket,withDependencyOwner(request.owner,forwardOwnerAction,fixture.root));}catch(cause){throwControllerControl(outerTicket,cause);throw cause;}
 try{await outer;}catch(cause){refused=true;refusal=cause;}
 await joinKnownComposition();
 if(caseId==='known-preawait-manifest-refusal'){
  check(refused&&!exposed&&refusal instanceof Error&&refusal.message==='initial manifest byte limit exceeded','COUPLED_EXACT_MANIFEST_REFUSAL_ABSENT');assertManifestRefusal(refusal,baseline);
 }else{if(refused)throw refusal;check(exposed,'COUPLED_PREPARATION_NOT_EXPOSED');}
 return Object.freeze({format:'dependency-owner-known-composition',version:1,sourceEpoch:'ordinary-uc2-coupled-r2-v1',caseId,production:refused?'known-refusal':'known-prepared',retirement:'production-originals-closed',controls:inspectKnownComposition().controls.map(control=>Object.freeze({label:control.label,phase:control.phase,joined:control.joined}))});
}
`;
}

/** Generates an unlaunched helper bootstrap that owns its import original before native module entry. */
export function ordinaryKnownBootstrapSourceV1(imagePath: string, caseId: unknown): string {
  const path = ordinaryHoldAbsolute(imagePath, 'coupled bootstrap image');
  if (caseId !== 'known-initial-prepared-release' && caseId !== 'known-preawait-manifest-refusal')
    throw new Error('coupled bootstrap case differs');
  return `type Image=typeof import(${JSON.stringify(path)});
type Packet=Awaited<ReturnType<Image['runOrdinaryKnownComposition']>>;
type State='starting'|'pending'|'fulfilled'|'rejected';
const retained:{importOriginal?:Promise<Image>;importObserver?:Promise<void>;namespace?:Image;ledger?:Image['inspectKnownComposition'];controllerOriginal?:Promise<Packet>;controllerObserver?:Promise<void>;packet?:Packet;entry?:Promise<Packet>;entryObserver?:Promise<void>;entryState:State;importState:State;controllerState:State;outputOriginal?:Promise<void>;outputObserver?:Promise<void>;outputState:State;outputWrite?:typeof process.stdout.write;outputReceiver?:typeof process.stdout;outputFrame?:string;outputReturned?:boolean;outputCause?:unknown;entryOutcomes?:PromiseSettledResult<unknown>[];outputOutcomes?:PromiseSettledResult<unknown>[];failure?:unknown;finalizer?:Promise<void>;finalizerObserver?:Promise<void>;finalizerState:State;finalizerCause?:unknown;complete:boolean}={entryState:'starting',importState:'starting',controllerState:'starting',outputState:'starting',finalizerState:'starting',complete:false};
const keeper=setInterval(()=>retained,60000);
async function main():Promise<Packet>{
 const original=import(${JSON.stringify(path)});retained.importOriginal=original;
 retained.importState='pending';const observer=original.then(namespace=>{retained.namespace=namespace;retained.importState='fulfilled';},(cause:unknown)=>{retained.failure=cause;retained.importState='rejected';});retained.importObserver=observer;
 const namespace=await original;await observer;
 if(typeof namespace.inspectKnownComposition!=='function'||typeof namespace.runOrdinaryKnownComposition!=='function')throw Error('coupled image exports absent');
 retained.ledger=namespace.inspectKnownComposition;
 const controller=namespace.runOrdinaryKnownComposition(${JSON.stringify(caseId)});retained.controllerOriginal=controller;
 retained.controllerState='pending';const controllerObserver=controller.then(packet=>{retained.packet=packet;retained.controllerState='fulfilled';},(cause:unknown)=>{retained.failure=cause;retained.controllerState='rejected';});retained.controllerObserver=controllerObserver;
 const packet=await controller;await controllerObserver;return packet;
}
const entry=main();retained.entry=entry;const entryObserver=entry.then(packet=>{retained.packet=packet;retained.entryState='fulfilled';},(cause:unknown)=>{retained.failure=cause;retained.entryState='rejected';});retained.entryObserver=entryObserver;
async function finalize():Promise<void>{
 const entryOutcomes=await Promise.allSettled([entry,entryObserver]);retained.entryOutcomes=entryOutcomes;
 if(entryOutcomes[0]?.status!=='fulfilled'||entryOutcomes[1]?.status!=='fulfilled')throw Error('coupled bootstrap entry observation refused');
 if(retained.entryState!=='fulfilled'||retained.importState!=='fulfilled'||retained.controllerState!=='fulfilled')throw Error('coupled bootstrap original refused');
 const packet=retained.packet;if(packet===undefined||packet.format!=='dependency-owner-known-composition'||packet.sourceEpoch!=='ordinary-uc2-coupled-r2-v1'||packet.retirement!=='production-originals-closed'||packet.caseId!==${JSON.stringify(caseId)})throw Error('coupled bootstrap packet differs');
 const frame='UC2_KNOWN_COMPOSITION:'+JSON.stringify(packet)+'\\n';if(new TextEncoder().encode(frame).byteLength>32768)throw Error('coupled bootstrap frame oversized');
 const output=new Promise<void>((resolve,reject)=>{retained.outputWrite=process.stdout.write;retained.outputReceiver=process.stdout;retained.outputFrame=frame;retained.outputReturned=Reflect.apply(retained.outputWrite,retained.outputReceiver,[frame,(cause?:Error|null)=>{if(cause!==null&&cause!==undefined)reject(cause);else resolve();}]);});retained.outputOriginal=output;
 const outputObserver=output.then(()=>{retained.outputState='fulfilled';},(cause:unknown)=>{retained.outputCause=cause;retained.outputState='rejected';});retained.outputObserver=outputObserver;
 const outputOutcomes=await Promise.allSettled([output,outputObserver]);retained.outputOutcomes=outputOutcomes;if(outputOutcomes[0]?.status!=='fulfilled'||outputOutcomes[1]?.status!=='fulfilled'||retained.outputState!=='fulfilled')throw Error('coupled bootstrap output refused');
 retained.complete=true;clearInterval(keeper);
}
const finalizer=finalize();retained.finalizer=finalizer;retained.finalizerObserver=finalizer.then(()=>{retained.finalizerState='fulfilled';},(cause:unknown)=>{retained.finalizerCause=cause;retained.finalizerState='rejected';});
`;
}
export interface CoupledFileIdentity {
  readonly path: string;
  readonly baseSha256: string;
  readonly proposedSha256: string;
  readonly baseLength: number;
  readonly proposedLength: number;
  readonly hunkCount: number;
}

const coupledFileIdentities: readonly CoupledFileIdentity[] = [
  {
    path: 'tools/tool-remote-scripts/src/lib/edge-ownership.ts',
    baseSha256: 'd979452d02089652c12515af8bfcaeede1fa13bc458a66013f5463555b528f68',
    proposedSha256: '7e900fbd23ec048f677154f8659bfe8137af810c1309f534aa9b5a9ad7962de3',
    baseLength: 83874,
    proposedLength: 84821,
    hunkCount: 3,
  },
  {
    path: 'tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts',
    baseSha256: 'e8ac098736b6cc538693437ae9c923819f5783fb8df61285d4f217a0f1b2154a',
    proposedSha256: '02bcd70bc6312065bd2978821b8d36e86c87bc9257866f08dee0d2251d7d96f0',
    baseLength: 34665,
    proposedLength: 41141,
    hunkCount: 36,
  },
  {
    path: 'tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts',
    baseSha256: 'ab7766c66a8a53fb84f11f3e0262802295ad823854b1cb4df13899bfddd2b798',
    proposedSha256: '8ba74d629156382f53b9eb7440714fbdb8255e6e1a616cc961a9a50eebbeee25',
    baseLength: 43658,
    proposedLength: 55686,
    hunkCount: 10,
  },
];

function hashCoupledBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Rejects malformed UTF-8, BOMs, CR line endings and missing final LF; these are fixed LF source artifacts. */
function decodeCoupledLines(bytes: Uint8Array): string[] {
  if (!(bytes instanceof Uint8Array)) throw new Error('coupled bytes required');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.startsWith('\uFEFF') || text.includes('\r') || !text.endsWith('\n')) {
    throw new Error('coupled source encoding');
  }
  return text.slice(0, -1).split('\n');
}

interface CoupledHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly string[];
}

interface CoupledFilePatch {
  readonly path: string;
  readonly hunks: readonly CoupledHunk[];
}

function requireCoupledLine(lines: readonly string[], position: number): string {
  const line = lines.at(position);
  if (line === undefined) throw new Error('coupled truncated patch');
  return line;
}

/** Parses only the reviewed unified-diff grammar: no indexes, renames, binary sections or missing-newline markers. */
function parseCoupledPatch(
  lines: readonly string[],
  identities: readonly CoupledFileIdentity[],
): CoupledFilePatch[] {
  const patches: CoupledFilePatch[] = [];
  let position = 0;
  for (const identity of identities) {
    if (
      requireCoupledLine(lines, position++) !==
        `diff --git a/${identity.path} b/${identity.path}` ||
      requireCoupledLine(lines, position++) !== `--- a/${identity.path}` ||
      requireCoupledLine(lines, position++) !== `+++ b/${identity.path}`
    ) {
      throw new Error('coupled path allowlist/order');
    }
    const hunks: CoupledHunk[] = [];
    while (position < lines.length && requireCoupledLine(lines, position).startsWith('@@')) {
      const header = requireCoupledLine(lines, position++);
      const match = /^@@ -([1-9][0-9]*),([1-9][0-9]*) \+([1-9][0-9]*),([1-9][0-9]*) @@$/.exec(
        header,
      );
      if (match === null) throw new Error('coupled hunk header');
      const fields = [1, 2, 3, 4].map((index) => {
        const field = match.at(index);
        if (field === undefined) throw new Error('coupled hunk field');
        const count = Number(field);
        if (!Number.isSafeInteger(count)) throw new Error('coupled hunk integer');
        return count;
      });
      const oldStart = fields.at(0),
        oldCount = fields.at(1),
        newStart = fields.at(2),
        newCount = fields.at(3);
      if (
        oldStart === undefined ||
        oldCount === undefined ||
        newStart === undefined ||
        newCount === undefined
      ) {
        throw new Error('coupled hunk fields');
      }
      const contents: string[] = [];
      let removed = 0;
      let added = 0;
      while (position < lines.length) {
        const line = requireCoupledLine(lines, position);
        if (line.startsWith('@@') || line.startsWith('diff --git ')) break;
        const prefix = line[0];
        if (prefix !== ' ' && prefix !== '+' && prefix !== '-')
          throw new Error('coupled hunk line');
        if (prefix !== '+') removed++;
        if (prefix !== '-') added++;
        contents.push(line);
        position++;
      }
      // Coverage: hunk-counts removal makes the malformed-count negative fail.
      if (removed !== oldCount || added !== newCount) throw new Error('coupled hunk counts');
      hunks.push({ oldStart, oldCount, newStart, newCount, lines: contents });
    }
    if (hunks.length !== identity.hunkCount) throw new Error('coupled hunk cardinality');
    patches.push({ path: identity.path, hunks });
  }
  if (position !== lines.length) throw new Error('coupled extra patch files');
  return patches;
}

/** Applies exact coordinates in either direction, comparing every consumed context/removal; never searches for a match. */
function renderCoupledPatch(
  source: readonly string[],
  hunks: readonly CoupledHunk[],
  reverse: boolean,
): Uint8Array {
  const output: string[] = [];
  let cursor = 0;
  for (const hunk of hunks) {
    const start = (reverse ? hunk.newStart : hunk.oldStart) - 1;
    const expectedStart = (reverse ? hunk.oldStart : hunk.newStart) - 1;
    if (start < cursor || start > source.length) throw new Error('coupled hunk position');
    output.push(...source.slice(cursor, start));
    cursor = start;
    if (output.length !== expectedStart) throw new Error('coupled hunk output position');
    for (const line of hunk.lines) {
      const prefix = line[0];
      const text = line.slice(1);
      const consumes = prefix === ' ' || prefix === (reverse ? '+' : '-');
      const produces = prefix === ' ' || prefix === (reverse ? '-' : '+');
      if (consumes) {
        // Coverage: exact-context removal makes the modified-context negative fail.
        if (source[cursor] !== text) throw new Error('coupled hunk context');
        cursor++;
      }
      if (produces) output.push(text);
    }
  }
  output.push(...source.slice(cursor));
  return new TextEncoder().encode(output.join('\n') + '\n');
}

function isCoupledMap(value: unknown): boolean {
  return value instanceof Map;
}
function isCoupledArray(value: unknown): boolean {
  return Array.isArray(value);
}

/**
 * Structural test seam only: supplied identities confer no reviewed production authority.
 * Requires exactly the fixed three paths; validates byte identities, coordinates and reverse byte reconstruction.
 */
export function applyPatchStructure(
  baseMap: ReadonlyMap<string, Uint8Array>,
  rawPatch: Uint8Array,
  expectedFiles: readonly CoupledFileIdentity[],
): ReadonlyMap<string, Uint8Array> {
  if (
    !isCoupledMap(baseMap) ||
    baseMap.size !== 3 ||
    !isCoupledArray(expectedFiles) ||
    expectedFiles.length !== 3
  ) {
    throw new Error('coupled three-file boundary');
  }
  for (let index = 0; index < expectedFiles.length; index++) {
    const identity = expectedFiles.at(index);
    const fixed = coupledFileIdentities.at(index);
    if (
      fixed === undefined ||
      identity?.path !== fixed.path ||
      !/^[a-f0-9]{64}$/.test(identity.baseSha256) ||
      !/^[a-f0-9]{64}$/.test(identity.proposedSha256) ||
      !Number.isSafeInteger(identity.baseLength) ||
      identity.baseLength <= 0 ||
      !Number.isSafeInteger(identity.proposedLength) ||
      identity.proposedLength <= 0 ||
      !Number.isSafeInteger(identity.hunkCount) ||
      identity.hunkCount <= 0
    ) {
      throw new Error('coupled file identity boundary');
    }
  }
  const patches = parseCoupledPatch(decodeCoupledLines(rawPatch), expectedFiles);
  const proposed = new Map<string, Uint8Array>();
  for (let index = 0; index < expectedFiles.length; index++) {
    const identity = expectedFiles.at(index);
    const patch = patches.at(index);
    if (identity === undefined || patch === undefined) throw new Error('coupled file association');
    const base = baseMap.get(identity.path);
    // Coverage: base-identity removal makes the wrong-base negative fail.
    if (
      !(base instanceof Uint8Array) ||
      base.byteLength !== identity.baseLength ||
      hashCoupledBytes(base) !== identity.baseSha256
    ) {
      throw new Error('coupled base identity');
    }
    const bytes = renderCoupledPatch(decodeCoupledLines(base), patch.hunks, false);
    // Coverage: proposed-identity removal makes the wrong-proposed negative fail.
    if (
      bytes.byteLength !== identity.proposedLength ||
      hashCoupledBytes(bytes) !== identity.proposedSha256
    ) {
      throw new Error('coupled proposed identity');
    }
    const restored = renderCoupledPatch(decodeCoupledLines(bytes), patch.hunks, true);
    // Coverage: reverse-dependency corrupts restored[0]; the fixed trusted-archive positive fails here.
    if (
      restored.byteLength !== base.byteLength ||
      !restored.every((byte, offset) => byte === base[offset])
    ) {
      throw new Error('coupled reverse identity');
    }
    proposed.set(identity.path, bytes);
  }
  return proposed;
}

/**
 * Fixed reviewed revision-2 authority. Digests are source constants, never adjacent caller metadata.
 * Coverage: modified raw patch/manifest refusal tests exercise this production boundary before structural parsing.
 * Pure byte transformation only; neither filesystem access nor target module execution occurs.
 */
export function applyCoupledArchive(
  baseMap: ReadonlyMap<string, Uint8Array>,
  rawPatch: Uint8Array,
  rawManifest: Uint8Array,
): ReadonlyMap<string, Uint8Array> {
  if (
    !(rawPatch instanceof Uint8Array) ||
    rawPatch.byteLength !== 118791 ||
    hashCoupledBytes(rawPatch) !==
      '2d9fdbb243080b724eef49b2791e89bc4b306101e75af06716c1be7f98d5185a'
  ) {
    throw new Error('coupled patch authority');
  }
  if (
    !(rawManifest instanceof Uint8Array) ||
    hashCoupledBytes(rawManifest) !==
      'ea42aed5edff42f2dc0e4198a3b7282815b82ff52977ceb2d95df1c67835b846'
  ) {
    throw new Error('coupled manifest authority');
  }
  decodeCoupledLines(rawManifest);
  return applyPatchStructure(baseMap, rawPatch, coupledFileIdentities);
}

export interface CoupledOverlayReceipt {
  readonly path: string;
  readonly physical: { readonly sha256: string; readonly bytes: number };
  readonly proposed: { readonly sha256: string; readonly bytes: number };
  readonly reverseChecked: true;
}

/** Returns verified receipts only after the fixed authority and each reverse byte comparison pass. */
export function applyCoupledOverlay(
  baseMap: ReadonlyMap<string, Uint8Array>,
  rawPatch: Uint8Array,
  rawManifest: Uint8Array,
): {
  readonly proposedMap: ReadonlyMap<string, Uint8Array>;
  readonly files: readonly CoupledOverlayReceipt[];
} {
  const proposedMap = applyCoupledArchive(baseMap, rawPatch, rawManifest);
  const files = coupledFileIdentities.map((identity): CoupledOverlayReceipt => ({
    path: identity.path,
    physical: { sha256: identity.baseSha256, bytes: identity.baseLength },
    proposed: { sha256: identity.proposedSha256, bytes: identity.proposedLength },
    reverseChecked: true,
  }));
  return { proposedMap, files };
}

export interface OrdinaryCoupledBuildPlanV1 {
  readonly sourceEpoch: typeof ordinaryCoupledSourceEpochV1;
  readonly layers: readonly {
    readonly path: string;
    readonly physicalSha256: string;
    readonly proposedSha256: string;
    readonly renderedSha256: string;
  }[];
  readonly materialized: ReadonlyMap<string, Uint8Array>;
  readonly appliedCuts: readonly { readonly id: string; readonly count: number }[];
  readonly portSources: ReadonlyMap<string, string>;
  readonly entrySource: string;
}

/** Applies only the fixed reviewed overlay in memory, keeping physical closure identities separate. */
export function planOrdinaryCoupledBuildV1(
  sourceRoot: string,
  supplied: ReadonlyMap<string, Uint8Array>,
  rawPatch: Uint8Array,
  rawManifest: Uint8Array,
): OrdinaryCoupledBuildPlanV1 {
  const root = ordinaryHoldAbsolute(sourceRoot, 'coupled source root');
  // Physical admission uses the unchanged old source pins, never a proposed byte as filesystem evidence.
  planOrdinaryHoldBuildV1(root, supplied);
  const bases = new Map<string, Uint8Array>();
  for (const identity of coupledFileIdentities) {
    const bytes = supplied.get(`${root}/${identity.path}`);
    if (bytes === undefined) throw new Error('coupled physical source absent');
    bases.set(identity.path, bytes);
  }
  const proposed = applyCoupledArchive(bases, rawPatch, rawManifest);
  const materialized = new Map<string, Uint8Array>();
  const layers: {
    path: string;
    physicalSha256: string;
    proposedSha256: string;
    renderedSha256: string;
  }[] = [];
  const appliedCuts: { id: string; count: number }[] = [];
  for (const role of ordinaryHoldModuleModesV1) {
    const path = `${root}/${role.relative}`;
    const physical = supplied.get(path);
    if (physical === undefined) throw new Error('coupled physical source absent');
    const production = proposed.get(role.relative) ?? physical;
    let source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(production);
    const reversals: { position: number; before: string; after: string }[] = [];
    const cuts =
      role.mode === 'transform' ? [...ordinaryHoldConcreteCutsV1(role.relative, root)] : [];
    if (role.relative.endsWith('/edge-ownership.ts')) {
      const imported = cuts.find((cut) => cut.id === 'owner.observation-import');
      if (imported === undefined) throw new Error('coupled owner import cut absent');
      cuts[cuts.indexOf(imported)] = {
        ...imported,
        after: imported.after.replace('captureHold }', 'captureHold, capturePreparation }'),
      };
      cuts.push({
        id: 'owner.preparation',
        before:
          '  preparations.set(preparation, record);\n  ownership.preparations.add(record);\n  ownership.composition = record;',
        after:
          '  preparations.set(preparation, record);\n  ownership.preparations.add(record);\n  ownership.composition = record;\n  capturePreparation(preparation, record);',
        count: 1,
      });
    }
    if (role.relative.endsWith('/complete-dependency-exclusion.ts')) {
      cuts.push({
        id: 'complete.acceptance',
        before: '  assertPreparationCompletion,\n',
        after: '',
        count: 1,
      });
      cuts.push({
        id: 'complete.acceptance-import',
        before: "} from './edge-ownership';",
        after:
          "} from './edge-ownership';\nimport { assertPreparationCompletion } from 'ordinary-hold-v1:complete-acceptance';",
        count: 1,
      });
    }
    if (role.relative.endsWith('/initial-handoff-graph.ts'))
      cuts.push({
        id: 'graph.layout',
        before: "import { envLayout, type EnvName } from './env';",
        after: "import { envLayout, type EnvName } from 'ordinary-hold-v1:graph-layout';",
        count: 1,
      });
    for (const cut of cuts) {
      if (source.split(cut.before).length - 1 !== cut.count)
        throw new Error(`coupled fixed cut ${cut.id} cardinality differs`);
      let start = 0;
      for (let ordinal = 0; ordinal < cut.count; ordinal++) {
        const position = source.indexOf(cut.before, start);
        reversals.push({ position, before: cut.before, after: cut.after });
        source = source.slice(0, position) + cut.after + source.slice(position + cut.before.length);
        start = position + cut.after.length;
      }
      appliedCuts.push({ id: cut.id, count: cut.count });
    }
    let reversed = source;
    for (const splice of [...reversals].reverse()) {
      if (reversed.slice(splice.position, splice.position + splice.after.length) !== splice.after)
        throw new Error('coupled rendered reverse mismatch');
      reversed =
        reversed.slice(0, splice.position) +
        splice.before +
        reversed.slice(splice.position + splice.after.length);
    }
    if (reversed !== new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(production))
      throw new Error('coupled production reverse mismatch');
    const rendered = new TextEncoder().encode(source);
    materialized.set(path, rendered);
    const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    layers.push(
      Object.freeze({
        path,
        physicalSha256: sha(physical),
        proposedSha256: sha(production),
        renderedSha256: sha(rendered),
      }),
    );
  }
  return Object.freeze({
    sourceEpoch: ordinaryCoupledSourceEpochV1,
    layers: Object.freeze(layers),
    materialized,
    appliedCuts: Object.freeze(appliedCuts),
    portSources: ordinaryCoupledPortSourcesV1(root),
    entrySource:
      ordinaryHoldEntryV1(root) +
      "export {runOrdinaryKnownComposition} from 'ordinary-hold-v1:controller';\nexport {inspectKnownComposition} from 'ordinary-hold-v1:ledger';\n",
  });
}

/** Resolves prospective virtual imports through an exact fixed table, preserving canonical classifiers. */
export function resolveOrdinaryCoupledPortImportV1(
  sourceRoot: string,
  importerId: string,
  specifier: string,
) {
  const root = ordinaryHoldAbsolute(sourceRoot, 'coupled resolver root');
  const owner = `${root}/tools/tool-remote-scripts/src/lib/edge-ownership.ts`;
  const additions: Readonly<Record<string, readonly string[]>> = {
    'complete-acceptance': [owner, 'ordinary-hold-v1:ledger'],
    'graph-layout': [`${root}/tools/tool-remote-scripts/src/lib/env.ts`],
    controller: [
      owner,
      `${root}/tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts`,
      `${root}/tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.ts`,
      'ordinary-hold-v1:graph-layout',
      'ordinary-hold-v1:ledger',
    ],
  };
  if (!Object.hasOwn(additions, importerId))
    return resolveOrdinaryHoldPortImportV1(root, importerId, specifier);
  if (!additions[importerId].includes(specifier))
    throw new Error('coupled port destination differs');
  if (specifier.startsWith('ordinary-hold-v1:'))
    return {
      path: specifier.slice('ordinary-hold-v1:'.length),
      namespace: 'ordinary-hold-v1',
      external: false,
    };
  return { path: specifier, external: false };
}

/** Adds checked canonical ABI annotations only to prospective forwarding copies. */
function typeOrdinaryCoupledPortsV1(ports: Map<string, string>): void {
  const replace = (source: string, before: string, after: string): string => {
    if (source.split(before).length !== 2)
      throw new Error('coupled forwarding type boundary differs');
    return source.replace(before, () => after);
  };
  const untypedSync =
    "const invoke=(label,original,receiver,args)=>{const record=reserveOperation(label,'sync',receiver,args);try{return returnOperation(record,Reflect.apply(original,receiver,args));}catch(cause){throwOperation(record,cause);throw cause;}};";
  const typedSync =
    "// The canonical function, receiver and unmodified tuple fix the Reflect.apply return ABI.\nconst invoke=<Fn extends (...args:never[])=>unknown>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>{const record=reserveOperation(label,'sync',receiver,args);try{return returnOperation(record,Reflect.apply(original,receiver,args) as ReturnType<Fn>);}catch(cause){throwOperation(record,cause);throw cause;}};";
  const untypedPromise =
    "const invoke=(label,original,receiver,args)=>{const record=reserveOperation(label,'promise',receiver,args);try{return attachPromise(record,Reflect.apply(original,receiver,args));}catch(cause){throwOperation(record,cause);throw cause;}};";
  const typedPromise =
    "// The canonical async function and unchanged tuple fix this exact original Promise ABI.\nconst invoke=<Fn extends (...args:never[])=>Promise<unknown>>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>{const record=reserveOperation(label,'promise',receiver,args);try{return attachPromise(record,Reflect.apply(original,receiver,args) as ReturnType<Fn>);}catch(cause){throwOperation(record,cause);throw cause;}};";
  for (const [specifier, originalSource] of ports) {
    if (
      [
        'ordinary-hold-v1:ledger',
        'ordinary-hold-v1:controller',
        'ordinary-hold-v1:graph-layout',
        'ordinary-hold-v1:complete-scanner',
        'ordinary-hold-v1:complete-acceptance',
      ].includes(specifier)
    )
      continue;
    let source = originalSource;
    if (source.includes(untypedSync)) source = replace(source, untypedSync, typedSync);
    if (source.includes(untypedPromise)) source = replace(source, untypedPromise, typedPromise);
    if (/^ordinary-hold-v1:(owner|storage|lock|graph|backup)-fs$/.test(specifier)) {
      source = source
        .split('\n')
        .map((line) => {
          const match = /^export const ([a-zA-Z]+)=\(\.\.\.args\)=>/.exec(line);
          if (match === null) return line;
          const name = match.at(1);
          if (name === undefined) throw new Error('coupled native type export absent');
          let annotated = line.replace(
            `export const ${name}=(...args)=>`,
            `export const ${name}=((...args:Parameters<typeof native.${name}>)=>`,
          );
          if (name === 'opendirSync')
            annotated = annotated.replace(
              'function(...closeArgs)',
              'function(this:typeof directory,...closeArgs:Parameters<typeof savedClose>)',
            );
          if (!annotated.endsWith(';'))
            throw new Error('coupled native declaration ending differs');
          // The wrapper delegates this named canonical function unchanged; its overload options still choose the actual return.
          return `// Exact native.${name} forwarding preserves its canonical overload ABI.\n${annotated.slice(0, -1)}) as typeof native.${name};`;
        })
        .join('\n');
    } else if (/^ordinary-hold-v1:setup-[a-z]+-fs$/.test(specifier)) {
      source = source
        .split('\n')
        .map((line) => {
          const match = /^export const ([a-zA-Z]+)=\(\.\.\.args\)=>/.exec(line);
          if (match === null) return line;
          const name = match.at(1);
          if (name === undefined || !line.endsWith(';'))
            throw new Error('coupled async type export absent');
          const annotated = line.replace(
            `export const ${name}=(...args)=>`,
            `export const ${name}=((...args:Parameters<typeof native.${name}>)=>`,
          );
          return `// Exact native.${name} forwarding preserves its canonical overload ABI.\n${annotated.slice(0, -1)}) as typeof native.${name};`;
        })
        .join('\n');
    } else {
      const boundaries: Readonly<Record<string, readonly [string, string][]>> = {
        'ordinary-hold-v1:owner-timer': [
          [
            'ordinaryHoldSetInterval=(...args)=>',
            'ordinaryHoldSetInterval=(...args:Parameters<typeof setInterval>):ReturnType<typeof setInterval>=>',
          ],
          [
            'ordinaryHoldClearInterval=(...args)=>',
            'ordinaryHoldClearInterval=(...args:Parameters<typeof clearInterval>):ReturnType<typeof clearInterval>=>',
          ],
        ],
        'ordinary-hold-v1:storage-database': [
          [
            'openReadOnlyConnection=(...args)=>',
            'openReadOnlyConnection=(...args:Parameters<typeof connection>):ReturnType<typeof connection>=>',
          ],
          [
            'openReadOnlyDatabase=(...args)=>',
            'openReadOnlyDatabase=(...args:Parameters<typeof database>):ReturnType<typeof database>=>',
          ],
        ],
        'ordinary-hold-v1:storage-graph': [
          [
            'captureInitialHandoffArtifacts=(...args)=>',
            'captureInitialHandoffArtifacts=(...args:Parameters<typeof original>):ReturnType<typeof original>=>',
          ],
        ],
        'ordinary-hold-v1:complete-storage': [
          [
            'activateDependencyStores=(...args)=>',
            'activateDependencyStores=(...args:Parameters<typeof original>):ReturnType<typeof original>=>',
          ],
        ],
        'ordinary-hold-v1:migration-call': [
          [
            'runMigrations=(...args)=>',
            'runMigrations=(...args:Parameters<typeof original>):ReturnType<typeof original>=>',
          ],
        ],
        'ordinary-hold-v1:graph-relative': [
          [
            'openDirectoryFile=(...args)=>',
            'openDirectoryFile=(...args:Parameters<typeof original>):ReturnType<typeof original>=>',
          ],
        ],
        'ordinary-hold-v1:child-git': [
          ['spawnOrdinaryGit(root,args)', 'spawnOrdinaryGit(root:string,args:readonly string[])'],
        ],
        'ordinary-hold-v1:child-namespace': [
          [
            'spawnOrdinaryNamespace(credentials,emitted,nonce,argumentsForProgram)',
            'spawnOrdinaryNamespace(credentials:readonly string[],emitted:string,nonce:string,argumentsForProgram:readonly string[])',
          ],
        ],
        'ordinary-hold-v1:child-emitter': [
          ['spawnOrdinaryEmitter(sourceRoot)', 'spawnOrdinaryEmitter(sourceRoot:string)'],
        ],
        'ordinary-hold-v1:child-collector': [
          [
            'spawnOrdinaryCollector(program,deadline)',
            'spawnOrdinaryCollector(program:string,deadline:number)',
          ],
        ],
        'ordinary-hold-v1:setup-complete-write': [
          [
            'writeOrdinaryComplete(label,...args)',
            'writeOrdinaryComplete(label:string,...args:Parameters<typeof original>):ReturnType<typeof original>',
          ],
        ],
        'ordinary-hold-v1:setup-namespace-write': [
          [
            'writeOrdinaryNamespace(label,...args)',
            'writeOrdinaryNamespace(label:string,...args:Parameters<typeof original>):ReturnType<typeof original>',
          ],
        ],
        'ordinary-hold-v1:database-readwrite': [
          [
            'ordinaryHoldOpenReadwrite=(dbPath,isCreateAllowed)=>',
            'ordinaryHoldOpenReadwrite=(dbPath:string,isCreateAllowed:boolean)=>',
          ],
          [
            'function(...args)',
            'function(this:typeof client,...args:Parameters<typeof savedClose>)',
          ],
        ],
        'ordinary-hold-v1:database-readonly': [
          ['ordinaryHoldOpenReadonly=(dbPath)=>', 'ordinaryHoldOpenReadonly=(dbPath:string)=>'],
          [
            'function(...args)',
            'function(this:typeof client,...args:Parameters<typeof savedClose>)',
          ],
        ],
      };
      for (const [before, after] of boundaries[specifier] ?? [])
        source = replace(source, before, after);
      if (
        specifier === 'ordinary-hold-v1:setup-complete-write' ||
        specifier === 'ordinary-hold-v1:setup-namespace-write'
      )
        source = replace(
          source,
          'const original=Bun.write;',
          '// All seven fixed producer call sites pass their genuine string path and string contents; Bun.write checks this overload assignment.\nconst original:(destination:string,input:string)=>ReturnType<typeof Bun.write>=Bun.write;',
        );
      if (specifier.startsWith('ordinary-hold-v1:child-'))
        source = replace(
          source,
          '};const ticket=reserveChild(',
          '} as const;const ticket=reserveChild(',
        );
      if (specifier === 'ordinary-hold-v1:migration-fs') {
        source = source.replace(
          /export function ([a-zA-Z]+)\(\.\.\.args\)/g,
          (_match: string, name: string) =>
            `export function ${name}(...args:Parameters<typeof originals.${name}>):ReturnType<typeof originals.${name}>`,
        );
        source = source
          .split('\n')
          .map((line) => {
            const match = /^export function (readdirSync|readFileSync|mkdtempSync)\(/.exec(line);
            if (match === null) return line;
            const name = match.at(1);
            if (name === undefined || !line.endsWith('}'))
              throw new Error('coupled migration overload boundary differs');
            const named = line.replace(
              `export function ${name}(`,
              `export const ${name}=(function ${name}(`,
            );
            return `// Exact originals.${name} delegation preserves its native overloads; only the export binding form changes.\n${named}) as typeof originals.${name};`;
          })
          .join('\n');
      }
    }
    ports.set(specifier, source);
  }
}

/** Emits the checked prospective ledger; canonical imports are erased types and its one scanner guard delta is explicit. */
function ordinaryCoupledTypedLedgerSourceV1(): string {
  return "import type { DependencyOwner, DependencyPreparation, PreparationOperation, PreparationOriginal } from '../tools/tool-remote-scripts/src/lib/edge-ownership';\nimport type { activateDependencyStores, ActivationReadOnlyDatabase, ActivationReadOnlyConnection } from '../tools/tool-remote-scripts/src/lib/dependency-activation-storage';\nimport type { PreparedDependencyActivation } from '../tools/tool-remote-scripts/src/lib/complete-dependency-exclusion';\nimport type { FinalizedParticipantRestorationContext } from '../tools/tool-remote-scripts/src/lib/dependency-participant-preparation';\nimport type { InitialHandoffArtifactObservation } from '../tools/tool-remote-scripts/src/lib/initial-handoff-graph';\nimport type { scanMigrationArtifact } from '../tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner';\nimport type { EnvLayout } from '../tools/tool-remote-scripts/src/lib/env';\ntype Ticket = object;\ntype Phase = 'not-entered'|'entered'|'returned'|'unknown'|'pending'|'fulfilled'|'rejected'|'threw';\ntype NativeKind = 'fd'|'dir'|'sqlite';\ntype Origin = 'production'|'fixture';\ntype NativeRecord = {family:'native'; ticket?:Ticket; generation:number;label:string;kind:NativeKind;args:readonly unknown[];receiver:unknown;phase:Phase;original:unknown;acquisitionCause:unknown;nativePhase:Phase;productionAttempts:number;fixtureAttempts:number;nativeEntries:number;nativeReturns:number;closeCause:unknown;closeOrigin:Origin|undefined;aliases:unknown[];savedClose?:((...args:never[])=>unknown);closeReceiver?:unknown;closeArgs?:unknown[];identity?:unknown;closeReturned?:unknown};\ntype OperationRecord = {family:'operation';ticket?:Ticket;label:string;kind:'sync'|'promise';receiver:unknown;args:readonly unknown[];phase:Phase;returned:unknown;original:Promise<unknown>|undefined;observer:Promise<void>|undefined;observerSettled:boolean;joined:boolean;cause:unknown;value?:unknown};\ntype LedgerRecord = NativeRecord|OperationRecord;\ninterface MigrationRoot {path:unknown;acquisition:Ticket;removalPhase:Phase}\ninterface MigrationCall {ticket:Ticket;name:keyof typeof migrationLimits;args:unknown[];phase:Phase;root?:MigrationRoot;returned?:unknown;cause?:unknown}\ntype Child = {exited:Promise<number>;stdout:ReadableStream<Uint8Array>;stderr:ReadableStream<Uint8Array>};\ntype ChildJoin = readonly [string,string,number];\ntype PromiseKey = 'exited'|'closed'|'pump'|'original'|'join';\ninterface PromiseValues {exited:number;closed:void;pump:void;original:Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>;join:ChildJoin}\ntype PromiseSlots = {phase?:Phase;cause?:unknown} & {[Key in PromiseKey as `${Key}State`]?:'pending'|'fulfilled'|'rejected'} & {[Key in PromiseKey as `${Key}Value`]?:PromiseValues[Key]} & {[Key in PromiseKey as `${Key}Cause`]?:unknown} & {[Key in PromiseKey as `${Key}Observer`]?:Promise<void>} & {[Key in Exclude<PromiseKey,'original'>]?:Promise<PromiseValues[Key]>};\ntype ChildPromiseSlots<Key extends PromiseKey> = {phase?:Phase;cause?:unknown} & Partial<Record<Key,Promise<PromiseValues[Key]>>> & Partial<Record<`${Key}State`,'pending'|'fulfilled'|'rejected'>> & Partial<Record<`${Key}Value`,PromiseValues[Key]>> & Partial<Record<`${Key}Cause`,unknown>> & Partial<Record<`${Key}Observer`,Promise<void>>>;\ntype ChildPromiseStorage = {phase?:Phase;cause?:unknown;original?:unknown} & {[Key in Exclude<PromiseKey,'original'>]?:Promise<PromiseValues[PromiseKey]>} & {[Key in PromiseKey as `${Key}State`]?:'pending'|'fulfilled'|'rejected'} & {[Key in PromiseKey as `${Key}Value`]?:PromiseValues[PromiseKey]} & {[Key in PromiseKey as `${Key}Cause`]?:unknown} & {[Key in PromiseKey as `${Key}Observer`]?:Promise<void>};\ntype CapturedChildStream = ChildStream & {reader:ReadableStreamDefaultReader<Uint8Array>};\ntype JoinedChildRecord = ChildRecord & {streams:[CapturedChildStream,CapturedChildStream]};\ntype ReservedOperationRecord = OperationRecord & {ticket:Ticket};\ntype ReservedNativeRecord = NativeRecord & {ticket:Ticket};\ninterface ChildRead extends PromiseSlots {original?:ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>;phase:Phase;chunk?:Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>;cause?:unknown}\ninterface ChildStream extends PromiseSlots {name:string;stream:ReadableStream<Uint8Array>;reads:ChildRead[];chunks:Uint8Array[];eof:boolean;releasePhase:Phase;reader?:ReadableStreamDefaultReader<Uint8Array>;releaseReturned?:void;phase?:Phase;cause?:unknown}\ninterface ChildRecord extends PromiseSlots {ticket:Ticket;label:keyof typeof childLimits;args:readonly unknown[];phase:Phase;streams:ChildStream[];joined:boolean;original?:Child;stdout?:ReadableStream<Uint8Array>;stderr?:ReadableStream<Uint8Array>;exitedValue?:number;join?:Promise<ChildJoin>;cause?:unknown;semanticCause?:unknown}\ninterface ControlRecord {args?:readonly unknown[];aliases?:readonly unknown[];ticket:Ticket;label:string;phase:Phase;original:Promise<unknown>|undefined;observer:Promise<void>|undefined;observerSettled:boolean;joined:boolean;value?:unknown;cause?:unknown;preparation?:DependencyPreparation;record?:PreparationRecord}\ntype Monitor = Awaited<ReturnType<typeof scanMigrationArtifact>>;\ninterface ScannerCall {args:unknown[];phase:Phase;original:Promise<unknown>|undefined;observer:Promise<void>|undefined;cause?:unknown}\ninterface ScannerRecord {ticket:Ticket;args:unknown[];phase:Phase;original:Monitor|undefined;scanOriginal:Promise<Monitor>|undefined;observer:Promise<void>|undefined;observerSettled:boolean;nativePhase:Phase;nativeEntries:number;productionAttempts:number;fixtureAttempts:number;savedClose?:Monitor['close'];closeReceiver?:Monitor;closeArgs?:unknown[];closeReturned?:unknown;closeCause?:unknown;scanCause?:unknown}\ntype Wrapper = {kind:'scanner';obligation:ScannerRecord;tickets?:never}|{kind:'connection'|'graph'|'scanner';tickets:readonly Ticket[];obligation?:never};\ninterface ObservedRecord {interval?:ReturnType<typeof setInterval>;owner?:DependencyOwner;original?:Promise<unknown>;preparation?:PreparationRecord;pending?:Promise<void>|string}\ninterface Observation {kind:string;owner:DependencyOwner;ownership:Ownership;record:ObservedRecord;original:unknown;observer:Promise<void>|undefined;args?:readonly unknown[];aliases?:readonly unknown[]}\ninterface OwnerFrame {owner:DependencyOwner;ownership:Ownership;observations:Observation[]}\ntype FatalObservation = object;\ninterface Custody {natives:ReservedNativeRecord[];operations:ReservedOperationRecord[];owners:OwnerFrame[];events:{kind:string;record:LedgerRecord|Observation}[];stopped:boolean;failures:unknown[];generation:number;fatalObservation:FatalObservation|undefined}\ninterface Ownership {\n  directory: string;\n  publication: string;\n  locks: { path: string; descriptor: number }[];\n  layouts: readonly EnvLayout[];\n  sequence: number;\n  sha: string;\n  attempt: string;\n  state: 'active' | 'closing' | 'unknown';\n  preparations: Set<PreparationRecord>;\n  composition: PreparationRecord | undefined;\n  keeper: PreparationKeeper | undefined;\n  runtimeEntries: Set<RuntimeEntry>;\n}\ninterface RuntimeEntry {\n  readonly original: Promise<unknown>;\n  observer: Promise<void> | undefined;\n  outcome: OperationOutcome;\n}\ntype PreparationAcquisition =\n  | {\n      readonly kind: 'descriptor';\n      readonly role:\n        | 'anchor-parent'\n        | 'anchor-main'\n        | 'capture-read'\n        | 'backup-read'\n        | 'backup-finalizer'\n        | 'state'\n        | 'evidence';\n      readonly descriptor: number;\n    }\n  | {\n      readonly kind: 'database';\n      readonly role: 'authority-read' | 'backup-read';\n      readonly database: ActivationReadOnlyDatabase;\n    }\n  | {\n      readonly kind: 'connection';\n      readonly role: 'authority-read';\n      readonly connection: ActivationReadOnlyConnection;\n    }\n  | {\n      readonly kind: 'graph';\n      readonly role: 'initial-evidence';\n      readonly graph: InitialHandoffArtifactObservation;\n    }\n  | {\n      readonly kind: 'scanner';\n      readonly role: 'restoration-artifact';\n      readonly scanner: Awaited<ReturnType<typeof scanMigrationArtifact>>;\n    };\ntype PreparationPhase =\n  'preparing' | 'runtime-evidence' | 'prepared' | 'consumed' | 'closing' | 'closed' | 'unknown';\ntype OperationOutcome =\n  | { readonly phase: 'starting' }\n  | { readonly phase: 'pending' }\n  | { readonly phase: 'fulfilled' }\n  | { readonly phase: 'rejected'; readonly cause: unknown };\ninterface OriginalRecord {\n  readonly preparation: PreparationRecord;\n  readonly acquisition: PreparationAcquisition;\n  state: 'open' | 'closing' | 'closed' | 'unknown';\n  failure: unknown;\n}\ninterface PreparationOperationRecord {\n  readonly preparation: PreparationRecord;\n  readonly kind: PreparationOperationKind;\n  original: Promise<unknown> | undefined;\n  observer: Promise<void> | undefined;\n  outcome: OperationOutcome;\n}\ninterface CompositionSettlement {\n  original: Promise<unknown> | undefined;\n  observer: Promise<void> | undefined;\n  outcome: OperationOutcome;\n}\ninterface PreparationKeeper {\n  readonly interval: ReturnType<typeof setInterval>;\n  readonly pending: Promise<void>;\n  reported: boolean;\n  reportFailure: unknown;\n}\ninterface PreparationRecord {\n  readonly owner: DependencyOwner;\n  readonly ownership: Ownership;\n  readonly purpose: PreparationPurpose;\n  readonly attempt: string;\n  readonly pending: string;\n  readonly layouts: readonly EnvLayout[];\n  readonly deadline: number;\n  readonly locks: readonly Ownership['locks'][number][];\n  readonly originals: Set<OriginalRecord>;\n  readonly operations: Set<PreparationOperationRecord>;\n  readonly composition: CompositionSettlement;\n  readonly failures: { readonly boundary: PreparationBoundary; readonly cause: unknown }[];\n  readonly inherited: unknown[];\n  phase: PreparationPhase;\n  closeRequested: boolean;\n  closeBoundary: PreparationBoundary | undefined;\n  runtimeLock: Ownership['locks'][number] | undefined;\n  runtimeReleased: boolean;\n  runtimeAction: CompositionSettlement | undefined;\n  runtimeRefusalSettled: boolean;\n  storage: Awaited<ReturnType<typeof activateDependencyStores>> | undefined;\n  prepared: PreparedDependencyActivation | undefined;\n  context: FinalizedParticipantRestorationContext | undefined;\n  projection: CompositionSettlement | undefined;\n}\ntype PreparationPurpose = 'fenced'|'restoration'|'initial-handoff';\ntype PreparationBoundary = 'operation'|'runtime-finalizer'|'complete-finalizer'|'consume'|'release'|'owner-return';\ntype PreparationOperationKind = 'storage-activation'|'evidence-inspection'|'stores-inspection'|'preparation-consume'|'context-assertion';\nconst custody:Custody={natives:[],operations:[],owners:[],events:[],stopped:false,failures:[],generation:0,fatalObservation:undefined};\nconst records=new WeakMap<Ticket,LedgerRecord>(),nativeAliases=new Map<unknown,Ticket>(),wrappers=new Map<unknown,Wrapper>();\nconst migrationCalls:MigrationCall[]=[],migrationRoots:MigrationRoot[]=[],migrationTickets=new WeakMap<Ticket,MigrationCall>();\nconst migrationLimits=Object.freeze({mkdtempSync:2,cpSync:210,rmSync:2,readdirSync:2,existsSync:214,readFileSync:214});\nexport function reserveMigrationFs(name:keyof typeof migrationLimits,args:readonly unknown[]){\n if(!Object.hasOwn(migrationLimits,name))fail('ordinary HOLD migration boundary differs');\n let root;\n if(name==='rmSync'){\n  root=migrationRoots.find(root=>root.path===args[0]);\n// Proof: omitting the one-shot removal guard failed the RETURNED-removal branch; UNKNOWN has ordinary coverage only (triplet 0/1/0).\n  if(root===undefined||root.removalPhase!=='not-entered')fail('ordinary HOLD migration removal differs');\n }else admit();\n// Proof: widening the filesystem cap failed the first mkdtemp2 branch; later constants lack separate physical credit (triplet 0/1/0).\n if(migrationCalls.filter(call=>call.name===name).length>=migrationLimits[name])fail('ordinary HOLD migration call cap exceeded');\n const ticket=Object.freeze({});const call:MigrationCall={ticket,name,args:[...args],phase:'entered',root};\n// Proof: omitting call reservation failed the staging-before-entry consumer; finite triplet 0/1/0.\n if(root!==undefined)root.removalPhase='entered';migrationTickets.set(ticket,call);migrationCalls.push(call);return ticket;\n}\nexport function returnMigrationFs<Returned>(ticket:Ticket,returned:Returned){const call=migrationTickets.get(ticket);if(call===undefined||call.phase!=='entered')fail('ordinary HOLD migration ticket differs');call.returned=returned;call.phase='returned';if(call.name==='mkdtempSync'){const root:MigrationRoot={path:returned,acquisition:ticket,removalPhase:'not-entered'};migrationRoots.push(root);call.root=root;}if(call.name==='rmSync')/* reserveMigrationFs checked and stored this exact rmSync root before returning its private ticket; no writer replaces that association. */(call.root as MigrationRoot).removalPhase='returned';return returned;}\nexport function throwMigrationFs(ticket:Ticket,cause:unknown){const call=migrationTickets.get(ticket);if(call===undefined)fail('ordinary HOLD migration ticket differs');call.phase='unknown';call.cause=cause;if(call.name==='rmSync')/* reserveMigrationFs checked and stored this exact rmSync root before returning its private ticket; no writer replaces that association. */(call.root as MigrationRoot).removalPhase='unknown';custody.stopped=true;custody.failures.push(cause);}\nexport function inspectMigrationStaging(){return Object.freeze({limits:migrationLimits,calls:Object.freeze(migrationCalls.map(call=>Object.freeze({...call,args:Object.freeze([...call.args]),root:call.root===undefined?undefined:Object.freeze({...call.root})}))),roots:Object.freeze(migrationRoots.map(root=>Object.freeze({...root})))});}\n\nconst childRecords=new WeakMap<Ticket,ChildRecord>(),children:ChildRecord[]=[],childByOriginal=new WeakMap<Child,ChildRecord>();\nconst childLimits=Object.freeze({git:8,namespace:16,emitter:2,collector:6});\nlet childReadCount=0,childDeliveredBytes=0,childAcceptedBytes=0,childReadsStopped=false;\nconst unknownChildPending=new Promise<never>(()=>{});\nfunction stopChild(record:{phase?:Phase;cause?:unknown},cause:unknown){record.phase='unknown';record.cause=cause;custody.stopped=true;custody.failures.push(cause);}\nfunction observeChildPromise<Key extends PromiseKey>(record:ChildPromiseSlots<Key>,key:Key,original:Promise<PromiseValues[NoInfer<Key>]>):Promise<void>;\n/* The closed-key overload binds each caller to its actual original's value; the checked implementation shares the same reaction across those five slots without asserting any fulfilled state or value. */\nfunction observeChildPromise(record:ChildPromiseStorage,key:PromiseKey,original:Promise<PromiseValues[PromiseKey]>){\n record[key]=original;record[key+'State' as `${PromiseKey}State`]='pending';\n const observer=original.then(value=>{record[key+'State' as `${PromiseKey}State`]='fulfilled';record[key+'Value' as `${PromiseKey}Value`]=value;},cause=>{record[key+'State' as `${PromiseKey}State`]='rejected';record[key+'Cause' as `${PromiseKey}Cause`]=cause;stopChild(record,cause);});\n record[key+'Observer' as `${PromiseKey}Observer`]=observer;return observer;\n}\nexport function reserveChild(label:keyof typeof childLimits,args:readonly unknown[]){\n admit();if(!Object.hasOwn(childLimits,label))fail('ordinary HOLD child boundary differs');\n// Proof: widening the family cap failed the first Git8 branch; other family constants lack separate physical credit (triplet 0/1/0).\n if(children.length>=32||children.filter(record=>record.label===label).length>=childLimits[label])fail('ordinary HOLD child cap exceeded');\n const ticket=Object.freeze({});const record:ChildRecord={ticket,label,args:[...args],phase:'entered',streams:[],joined:false};childRecords.set(ticket,record);// Proof: omitting child reservation failed the same generated reservation consumer; finite triplet 0/1/0.\nchildren.push(record);return ticket;\n}\nexport function throwChild(ticket:Ticket,cause:unknown){const record=childRecords.get(ticket);if(record===undefined)fail('ordinary HOLD child ticket differs');stopChild(record,cause);}\nfunction childStreamSnapshot(stream:ChildStream){return Object.freeze({...stream,reads:Object.freeze(stream.reads.map(read=>Object.freeze({...read}))),chunks:Object.freeze([...stream.chunks])});}\nexport function inspectChildren(){return Object.freeze(children.map(record=>Object.freeze({...record,args:Object.freeze([...record.args]),streams:Object.freeze(record.streams.map(childStreamSnapshot))})));}\nfunction captureChildStream(record:ChildRecord,name:string,stream:ReadableStream<Uint8Array>){\n const captured:ChildStream={name,stream,reads:[],chunks:[],eof:false,releasePhase:'not-entered'};record.streams.push(captured);\n if(stream===undefined||stream===null)throw Error('ordinary HOLD child stream absent');\n// Proof: substituting ready closed failed the retained-reader identity consumer; finite triplet 0/1/0.\n captured.reader=stream.getReader();observeChildPromise(captured,'closed',captured.reader.closed);/* This constructor returns normally only after assigning the actual getReader() return and observing that reader.closed; failure retains a partial stream and marks the child unknown. */return captured as CapturedChildStream;\n}\nasync function pumpChild(record:ChildRecord,stream:CapturedChildStream){\n for(;;){\n  if(childReadsStopped)return await unknownChildPending;\n// Proof: omitting read refusal failed the finite 8193-chunk UNKNOWN consumer; triplet 0/1/0.\n  if(childReadCount>=8192){childReadsStopped=true;stopChild(record,Error('ordinary HOLD child read cap exceeded'));return await unknownChildPending;}\n  const read:ChildRead={phase:'entered'};childReadCount++;stream.reads.push(read);\n  let chunk;\n  try{const original=stream.reader.read();observeChildPromise(read,'original',original);chunk=await original;await read.originalObserver;read.phase='returned';read.chunk=chunk;}\n  catch(cause){read.phase='unknown';read.cause=cause;stopChild(record,cause);return await unknownChildPending;}\n  if(chunk.done){stream.eof=true;return;}\n  childDeliveredBytes+=chunk.value.byteLength;\n // Proof: omitting byte refusal failed the finite oversized-read UNKNOWN consumer; triplet 0/1/0.\n if(childDeliveredBytes>33554432){childReadsStopped=true;stopChild(record,Error('ordinary HOLD child byte cap exceeded'));return await unknownChildPending;}\n  childAcceptedBytes+=chunk.value.byteLength;stream.chunks.push(chunk.value);\n }\n}\nexport function attachChild<Original extends Child>(ticket:Ticket,child:Original){\n const record=childRecords.get(ticket);if(record===undefined||record.phase!=='entered')fail('ordinary HOLD child attachment differs');\n record.original=child;record.phase='returned';childByOriginal.set(child,record);\n try{\n  // Proof: substituting an exit projection failed the original-identity consumer; finite triplet 0/1/0.\nobserveChildPromise(record,'exited',child.exited);\n  record.stdout=child.stdout;record.stderr=child.stderr;\n  const stdout=captureChildStream(record,'stdout',record.stdout),stderr=captureChildStream(record,'stderr',record.stderr);\n  observeChildPromise(stdout,'pump',pumpChild(record,stdout));observeChildPromise(stderr,'pump',pumpChild(record,stderr));\n  return child;\n }catch(cause){stopChild(record,cause);throw cause;}\n}\nfunction decodeChildStream(stream:ChildStream,fatal:boolean){const length=stream.chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0);const bytes=new Uint8Array(length);let offset=0;for(const chunk of stream.chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal}).decode(bytes);}\n// Proof: omitting actual releaseLock failed the known-join consumer's unlocked-stream oracle; finite triplet 0/1/0.\nasync function joinChildBody(record:ChildRecord):Promise<ChildJoin>{\n const waits=[record.exited,record.exitedObserver];\n for(const stream of record.streams)waits.push(stream.pump,stream.pumpObserver,stream.closed,stream.closedObserver);\n await Promise.allSettled(waits);\n if(record.phase==='unknown'||record.streams.length!==2||record.exitedState!=='fulfilled'||record.streams.some(stream=>!stream.eof||stream.closedState!=='fulfilled'||stream.pumpState!=='fulfilled'||stream.reads.some(read=>read.originalState!=='fulfilled')))return await unknownChildPending;\n for(const stream of record.streams){\n  if(stream.releasePhase!=='not-entered'){stopChild(record,Error('ordinary HOLD child reader release re-entry'));return await unknownChildPending;}\n  stream.releasePhase='entered';try{stream.releaseReturned=(/* The preceding known-child guard excludes capture failure; only successfully captured readers can start these EOF/fulfilled pumps. Actual release outcome remains recorded below. */stream as CapturedChildStream).reader.releaseLock();stream.releasePhase='returned';}catch(cause){stream.releasePhase='unknown';stopChild(record,cause);return await unknownChildPending;}\n }\n record.joined=true;return Object.freeze([decodeChildStream(record.streams[0],false),decodeChildStream(record.streams[1],false),(/* The actual typed child.exited observer writes this number in the same reaction that writes fulfilled, required above after joining original and observer. */record.exitedValue as number)]);\n}\n// Proof: returning a join projection failed exact original join identity; finite triplet 0/1/0.\nexport function joinOrdinaryChild(child:Child){const record=childByOriginal.get(child);if(record===undefined)fail('ordinary HOLD child original absent');if(record.join!==undefined)return record.join;const original=joinChildBody(record);observeChildPromise(record,'join',original);return original;}\nexport function inspectChildLimits(){return Object.freeze({children:32,readers:64,reads:8192,bytes:33554432,families:childLimits,readCount:childReadCount,deliveredBytes:childDeliveredBytes,acceptedBytes:childAcceptedBytes});}\nexport function refuseChildSemantic(child:Child,cause:unknown):never{const record=childByOriginal.get(child);if(record===undefined)fail('ordinary HOLD child original absent');record.semanticCause=cause;custody.stopped=true;custody.failures.push(cause);throw cause;}\nexport function assertChildDeadline(deadline:number){admit();if(!Number.isFinite(deadline)||performance.now()>=deadline)fail('ordinary HOLD child deadline exceeded');}\n// Proof: removing fatal decoding failed the invalid-UTF8 collector consumer after known joins; finite triplet 0/1/0.\nexport function decodeCollectorChild(child:Child){const record=childByOriginal.get(child);if(record===undefined||!record.joined)fail('ordinary HOLD collector join absent');try{return decodeChildStream(record.streams[0],true);}catch(cause){return refuseChildSemantic(child,cause);}}\n// Proof: omitting raw-stderr refusal accepted BOM-only stderr after known joins; same consumer triplet 0/1/0.\nfunction collectorStderrByteLength(child:Child){return (/* Private caller readAuthorityCollector reaches here only after successful joinOrdinaryChild established this exact child and both captured streams; the private map never deletes entries. */childByOriginal.get(child) as JoinedChildRecord).streams[1].chunks.reduce((bytes,chunk)=>bytes+chunk.byteLength,0);}\nexport async function readAuthorityCollector(child:Child,deadline:number){const [stdout,stderr,code]=await joinOrdinaryChild(child);if(performance.now()>=deadline)return refuseChildSemantic(child,Error('authority collector deadline exceeded'));if(collectorStderrByteLength(child)>0)return refuseChildSemantic(child,Error('authority collector reported failure'));if(code!==0)return refuseChildSemantic(child,Error('authority collector exited unsuccessfully'));return decodeCollectorChild(child);}\n\nconst nativeLabels=new Set(['owner.openSync','storage.openSync','lock.openSync','graph.openSync','backup.openSync','graph.opendirSync','graph.relative','database.readonly','database.readwrite']);\nconst operationLabels=new Set([\"owner.closeSync\",\"owner.fstatSync\",\"owner.fsyncSync\",\"owner.readFileSync\",\"owner.readSync\",\"owner.writeFileSync\",\"owner.fchmodSync\",\"owner.lstatSync\",\"owner.openSync\",\"owner.readdirSync\",\"owner.realpathSync\",\"owner.mkdirSync\",\"owner.ftruncateSync\",\"owner.statSync\",\"owner.writeSync\",\"owner.opendirSync\",\"owner.copyFileSync\",\"owner.existsSync\",\"owner.renameSync\",\"owner.rmSync\",\"storage.closeSync\",\"storage.fstatSync\",\"storage.fsyncSync\",\"storage.readFileSync\",\"storage.readSync\",\"storage.writeFileSync\",\"storage.fchmodSync\",\"storage.lstatSync\",\"storage.openSync\",\"storage.readdirSync\",\"storage.realpathSync\",\"storage.mkdirSync\",\"storage.ftruncateSync\",\"storage.statSync\",\"storage.writeSync\",\"storage.opendirSync\",\"storage.copyFileSync\",\"storage.existsSync\",\"storage.renameSync\",\"storage.rmSync\",\"lock.closeSync\",\"lock.fstatSync\",\"lock.fsyncSync\",\"lock.readFileSync\",\"lock.readSync\",\"lock.writeFileSync\",\"lock.fchmodSync\",\"lock.lstatSync\",\"lock.openSync\",\"lock.readdirSync\",\"lock.realpathSync\",\"lock.mkdirSync\",\"lock.ftruncateSync\",\"lock.statSync\",\"lock.writeSync\",\"lock.opendirSync\",\"lock.copyFileSync\",\"lock.existsSync\",\"lock.renameSync\",\"lock.rmSync\",\"graph.closeSync\",\"graph.fstatSync\",\"graph.fsyncSync\",\"graph.readFileSync\",\"graph.readSync\",\"graph.writeFileSync\",\"graph.fchmodSync\",\"graph.lstatSync\",\"graph.openSync\",\"graph.readdirSync\",\"graph.realpathSync\",\"graph.mkdirSync\",\"graph.ftruncateSync\",\"graph.statSync\",\"graph.writeSync\",\"graph.opendirSync\",\"graph.copyFileSync\",\"graph.existsSync\",\"graph.renameSync\",\"graph.rmSync\",\"backup.closeSync\",\"backup.fstatSync\",\"backup.fsyncSync\",\"backup.readFileSync\",\"backup.readSync\",\"backup.writeFileSync\",\"backup.fchmodSync\",\"backup.lstatSync\",\"backup.openSync\",\"backup.readdirSync\",\"backup.realpathSync\",\"backup.mkdirSync\",\"backup.ftruncateSync\",\"backup.statSync\",\"backup.writeSync\",\"backup.opendirSync\",\"backup.copyFileSync\",\"backup.existsSync\",\"backup.renameSync\",\"backup.rmSync\",\"setup.participant.chmod\",\"setup.participant.cp\",\"setup.participant.lstat\",\"setup.participant.mkdir\",\"setup.participant.mkdtemp\",\"setup.participant.readdir\",\"setup.participant.symlink\",\"setup.participant.writeFile\",\"setup.participant.readFile\",\"setup.participant.rename\",\"setup.participant.stat\",\"setup.participant.link\",\"setup.participant.rm\",\"setup.complete.chmod\",\"setup.complete.cp\",\"setup.complete.lstat\",\"setup.complete.mkdir\",\"setup.complete.mkdtemp\",\"setup.complete.readdir\",\"setup.complete.symlink\",\"setup.complete.writeFile\",\"setup.complete.readFile\",\"setup.complete.rename\",\"setup.complete.stat\",\"setup.complete.link\",\"setup.complete.rm\",\"setup.startup.chmod\",\"setup.startup.cp\",\"setup.startup.lstat\",\"setup.startup.mkdir\",\"setup.startup.mkdtemp\",\"setup.startup.readdir\",\"setup.startup.symlink\",\"setup.startup.writeFile\",\"setup.startup.readFile\",\"setup.startup.rename\",\"setup.startup.stat\",\"setup.startup.link\",\"setup.startup.rm\",\"setup.database.chmod\",\"setup.database.cp\",\"setup.database.lstat\",\"setup.database.mkdir\",\"setup.database.mkdtemp\",\"setup.database.readdir\",\"setup.database.symlink\",\"setup.database.writeFile\",\"setup.database.readFile\",\"setup.database.rename\",\"setup.database.stat\",\"setup.database.link\",\"setup.database.rm\",\"setup.frontend.chmod\",\"setup.frontend.cp\",\"setup.frontend.lstat\",\"setup.frontend.mkdir\",\"setup.frontend.mkdtemp\",\"setup.frontend.readdir\",\"setup.frontend.symlink\",\"setup.frontend.writeFile\",\"setup.frontend.readFile\",\"setup.frontend.rename\",\"setup.frontend.stat\",\"setup.frontend.link\",\"setup.frontend.rm\",\"setup.namespace.chmod\",\"setup.namespace.cp\",\"setup.namespace.lstat\",\"setup.namespace.mkdir\",\"setup.namespace.mkdtemp\",\"setup.namespace.readdir\",\"setup.namespace.symlink\",\"setup.namespace.writeFile\",\"setup.namespace.readFile\",\"setup.namespace.rename\",\"setup.namespace.stat\",\"setup.namespace.link\",\"setup.namespace.rm\",\"owner.interval\",\"owner.clear\",\"storage.database.connection\",\"storage.database.database\",\"storage.graph\",\"complete.storage\",\"complete.scanner\",\"setup.runMigrations\",\"complete.write.prod\",\"complete.write.dev\",\"namespace.write.0\",\"namespace.write.1\",\"namespace.write.2\",\"namespace.write.3\",\"namespace.write.4\"]);\n// Proof: removing snapshot freezing let the inspection consumer manufacture native completion (exit 1; restored).\nfunction snapshot<RecordShape extends {args?:readonly unknown[];aliases?:readonly unknown[]}>(record:RecordShape){return Object.freeze({...record,args:record.args===undefined?undefined:Object.freeze([...record.args]),aliases:record.aliases===undefined?undefined:Object.freeze([...record.aliases])});}\nexport function inspectLedger(){return Object.freeze({stopped:custody.stopped,fatalObservation:custody.fatalObservation===undefined?undefined:Object.freeze({...custody.fatalObservation}),natives:Object.freeze(custody.natives.map(snapshot)),operations:Object.freeze(custody.operations.map(snapshot)),owners:Object.freeze(custody.owners.map(frame=>Object.freeze({...frame,observations:Object.freeze(frame.observations.map(snapshot))}))),events:Object.freeze(custody.events.map(event=>Object.freeze({kind:event.kind,record:snapshot(event.record)}))),failures:Object.freeze([...custody.failures])});}\nfunction requireRecord(ticket:Ticket,kind:'native'):NativeRecord;\nfunction requireRecord(ticket:Ticket,kind:'operation'):OperationRecord;\nfunction requireRecord(ticket:Ticket,kind:LedgerRecord['family']){const record=records.get(ticket);if(record===undefined||record.family!==kind)fail('ordinary HOLD ticket differs');return record;}\nexport function inspectNative(ticket:Ticket){return snapshot(requireRecord(ticket,'native'));}\nexport function inspectOperation(ticket:Ticket){return snapshot(requireRecord(ticket,'operation'));}\nfunction fail(message:string):never{const cause=new Error(message);custody.stopped=true;custody.failures.push(cause);throw cause;}\nfunction event(kind:string,record:LedgerRecord|Observation){if(custody.events.length>=8192)fail('ordinary HOLD event cap exceeded');custody.events.push({kind,record});}\nfunction admit(){if(custody.stopped)fail('ordinary HOLD ledger stopped');if(custody.events.length>=8192)fail('ordinary HOLD event cap exceeded');}\nfunction createTicket(record:LedgerRecord){const ticket=Object.freeze({});records.set(ticket,record);record.ticket=ticket;return ticket;}\nexport function reserveNative(label:string,kind:NativeKind,args:readonly unknown[],receiver:unknown){\n  admit();\n  // Proof: admitting storage.openSync-near failed the unknown-boundary inert consumer (exit 1; restored).\n  if(!nativeLabels.has(label)||!['fd','dir','sqlite'].includes(kind)||kind==='dir'&&label!=='graph.opendirSync'||kind==='sqlite'&&!['database.readonly','database.readwrite'].includes(label)||kind==='fd'&&(label==='graph.opendirSync'||['database.readonly','database.readwrite'].includes(label)))fail('ordinary HOLD native boundary differs');\n  // Proof: removing this bound admits the 513th inert acquisition in the generated ledger cap negative.\n  if(custody.natives.length>=512||kind==='sqlite'&&custody.natives.filter(record=>record.kind==='sqlite').length>=64||kind==='dir'&&custody.natives.filter(record=>record.kind==='dir').length>=32)fail('ordinary HOLD native cap exceeded');\n  const record:NativeRecord={family:'native',generation:++custody.generation,label,kind,args,receiver,phase:'entered',original:undefined,acquisitionCause:undefined,nativePhase:'not-entered',productionAttempts:0,fixtureAttempts:0,nativeEntries:0,nativeReturns:0,closeCause:undefined,closeOrigin:undefined,aliases:[]};\n  // Proof: removing native reservation failed the generation consumer before sentinel entry (exit 1; restored).\n  const ticket=createTicket(record);custody.natives.push(/* createTicket wrote this exact ticket before insertion; this refines bookkeeping identity only. */record as ReservedNativeRecord);event('native-enter',record);return ticket;\n}\nexport function attachNative<Original>(ticket:Ticket,original:Original){\n  const record=requireRecord(ticket,'native');\n  if(record.phase!=='entered')fail('ordinary HOLD native attachment differs');\n  const prior=nativeAliases.get(original);record.original=original;record.phase='returned';record.aliases.push(original);\n  if(prior!==undefined&&requireRecord(prior,'native').nativePhase!=='returned')fail('ordinary HOLD active native alias duplicate');\n  nativeAliases.set(original,ticket);return original;\n}\nexport function retainNativeClose(ticket:Ticket,savedClose:((...args:never[])=>unknown),receiver:unknown,args:readonly unknown[]){const record=requireRecord(ticket,'native');record.savedClose=savedClose;record.closeReceiver=receiver;record.closeArgs=[...args];}\nexport function retainNativeIdentity(ticket:Ticket,identity:unknown){requireRecord(ticket,'native').identity=identity;}\nexport function throwNative(ticket:Ticket,cause:unknown){const record=requireRecord(ticket,'native');record.acquisitionCause=cause;record.phase='unknown';custody.stopped=true;custody.failures.push(cause);}\nexport function aliasNative<Alias>(ticket:Ticket,alias:Alias){\n  const record=requireRecord(ticket,'native');\n  if(record.phase!=='returned'||nativeAliases.has(alias)&&nativeAliases.get(alias)!==ticket)fail('ordinary HOLD native alias differs');\n  // Proof: omitting alias linkage failed the same native-generation/alias consumer (exit 1; restored).\n  nativeAliases.set(alias,ticket);record.aliases.push(alias);return alias;\n}\nexport function linkWrapper<Original extends object>(wrapper:Original,tickets:readonly Ticket[],kind:'connection'|'graph'|'scanner'){if(!['connection','graph','scanner'].includes(kind)||tickets.length===0||tickets.some(ticket=>records.get(ticket)?.family!=='native')||kind==='connection'&&tickets.length!==1)fail('ordinary HOLD wrapper association differs');wrappers.set(wrapper,Object.freeze({kind,tickets:Object.freeze([...tickets])}));if(tickets.length===1)aliasNative(tickets[0],wrapper);return wrapper;}\n// Proof: both independent-cleanup consumers failed at B after A UNKNOWN or event-cap STOP; removing acquisition admission restored both (exit 0).\nexport function attemptClose(original:unknown,origin:Origin){\n  const ticket=nativeAliases.get(original);\n  if(ticket===undefined||!['production','fixture'].includes(origin))fail('ordinary HOLD close original absent');\n  const record=requireRecord(ticket,'native');\n  // Proof: the 8193rd attempt passed before this bound and failed the cleanup-accounting consumer; fixed consumer passes.\n  if(record.productionAttempts+record.fixtureAttempts>=8192)fail('ordinary HOLD close attempt cap exceeded');\n  if(origin==='production')record.productionAttempts++;else record.fixtureAttempts++;\n  return ticket;\n}\nexport function enterClose(ticket:Ticket,origin:Origin){\n  const record=requireRecord(ticket,'native');\n  // Proof: removing this guard failed the returned/unknown no-retry consumer (exit 1; restored).\n  if(record.nativePhase!=='not-entered')fail('ordinary HOLD native close re-entry');\n  record.nativePhase='entered';record.nativeEntries++;record.closeOrigin=origin;return ticket;\n}\nexport function beginClose(original:unknown,origin:Origin){return enterClose(attemptClose(original,origin),origin);}\nexport function returnClose(ticket:Ticket,returned?:unknown){const record=requireRecord(ticket,'native');if(record.nativePhase!=='entered')fail('ordinary HOLD native return without entry');record.nativePhase='returned';record.nativeReturns++;record.closeReturned=returned;}\nexport function throwClose(ticket:Ticket,cause:unknown){const record=requireRecord(ticket,'native');record.nativePhase='unknown';record.closeCause=cause;custody.stopped=true;custody.failures.push(cause);}\nexport function reserveOperation(label:string,kind:'sync'|'promise',receiver:unknown,args:readonly unknown[]){\n  admit();if(!operationLabels.has(label)||!['sync','promise'].includes(kind))fail('ordinary HOLD operation boundary differs');\n  // Proof: raising the 256-Promise cap failed the exact census consumer (exit 1; restored).\n  if(kind==='promise'&&custody.operations.filter(record=>record.kind==='promise').length>=256)fail('ordinary HOLD Promise cap exceeded');\n  const record:OperationRecord={family:'operation',label,kind,receiver,args,phase:'entered',returned:undefined,original:undefined,observer:undefined,observerSettled:false,joined:false,cause:undefined};\n  const ticket=createTicket(record);custody.operations.push(/* createTicket wrote this exact ticket before the record is inserted; this refines bookkeeping identity only. */record as ReservedOperationRecord);event('operation-enter',record);return ticket;\n}\nexport function returnOperation<Returned>(ticket:Ticket,returned:Returned){const record=requireRecord(ticket,'operation');record.returned=returned;record.phase='returned';return returned;}\nexport function throwOperation(ticket:Ticket,cause:unknown){const record=requireRecord(ticket,'operation');record.cause=cause;if(record.phase!=='unknown')record.phase='threw';}\nexport function attachPromise<Original extends Promise<unknown>>(ticket:Ticket,original:Original){\n  const record=requireRecord(ticket,'operation');if(record.phase!=='entered')fail('ordinary HOLD Promise already attached');\n  record.returned=original;record.original=original;record.phase='pending';\n  try{record.observer=original.then(value=>{record.value=value;record.phase='fulfilled';record.observerSettled=true;},cause=>{record.cause=cause;record.phase='rejected';record.observerSettled=true;});}\n  catch(cause){record.phase='unknown';record.cause=cause;custody.stopped=true;custody.failures.push(cause);throw cause;}\n  // Proof: returning a .then projection failed the exact-original consumer (exit 1; restored).\n  return original;\n}\nexport async function joinOperation(ticket:Ticket){\n  const record=requireRecord(ticket,'operation');if(record.original===undefined||record.observer===undefined)fail('ordinary HOLD original observation absent');\n  await Promise.allSettled([record.original,record.observer]);\n  if(!record.observerSettled||!['fulfilled','rejected'].includes(record.phase))fail('ordinary HOLD original observation incomplete');record.joined=true;\n}\nfunction tap(kind:string,owner:DependencyOwner,ownership:Ownership,record:ObservedRecord,original:unknown,observer:Promise<void>|undefined,extra:object){\n  const observation={kind,owner,ownership,record,original,observer,...extra};\n  try{\n    let frame=custody.owners.find(frame=>frame.owner===owner);\n    // Proof: admitting owner nine failed the fixed owner-graph census consumer (exit 1; restored).\n    if(frame===undefined){if(custody.owners.length>=8)throw Error('ordinary HOLD owner frame cap exceeded');frame={owner,ownership,observations:[]};custody.owners.push(frame);}\n    if(custody.stopped||custody.events.length>=8192)throw Error('ordinary HOLD owner observation stopped or capped');\n    frame.observations.push(observation);event('owner-'+kind,observation);\n  }catch(cause){custody.fatalObservation=observation;custody.stopped=true;custody.failures.push(cause);}\n}\nexport function captureSettlement(record:PreparationRecord,settlement:CompositionSettlement,original:Promise<unknown>,observer:Promise<void>){try{\n  const kind=settlement===record.composition?'composition':settlement===record.projection?'projection':settlement===record.runtimeAction?'runtime-action':'unassociated';\n  tap(kind,record.owner,record.ownership,record,original,observer,{settlement});\n  if(kind==='unassociated'){custody.stopped=true;custody.fatalObservation={record,settlement,original,observer};}\n}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureSettlement',references:[record,settlement,original,observer]};custody.failures.push(cause);}}\nexport function captureOperation(operation:PreparationOperation,observed:PreparationOperationRecord,original:Promise<unknown>,observer:Promise<void>){try{tap('operation',observed.preparation.owner,observed.preparation.ownership,observed,original,observer,{operation});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureOperation',references:[operation,observed,original,observer]};custody.failures.push(cause);}}\nexport function captureRuntimeEntry(owner:DependencyOwner,ownership:Ownership,entry:RuntimeEntry,original:Promise<unknown>,observer:Promise<void>){try{tap('runtime-entry',owner,ownership,entry,original,observer,{});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureRuntimeEntry',references:[owner,ownership,entry,original,observer]};custody.failures.push(cause);}}\n// Proof: omitting timer identity matching failed the missing-keeper consumer (exit 1; restored).\nexport function captureKeeper(owner:DependencyOwner,ownership:Ownership,keeper:PreparationKeeper){try{tap('keeper',owner,ownership,keeper,keeper.pending,undefined,{interval:keeper.interval});if(custody.operations.filter(record=>record.label==='owner.interval'&&record.returned===keeper.interval).length!==1){custody.stopped=true;custody.fatalObservation={owner,ownership,record:keeper,original:keeper.pending};}}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureKeeper',references:[owner,ownership,keeper]};custody.failures.push(cause);}}\nexport function captureOriginal(preparation:DependencyPreparation,original:PreparationOriginal,observed:OriginalRecord){try{\n  const acquisition=observed.acquisition;const acquired=acquisition.kind==='descriptor'?acquisition.descriptor:acquisition.kind==='database'?acquisition.database:acquisition.kind==='connection'?acquisition.connection:acquisition.kind==='graph'?acquisition.graph:acquisition.scanner;\n  const ticket=nativeAliases.get(acquired);const wrapper=wrappers.get(acquired);\n  tap('original',observed.preparation.owner,observed.preparation.ownership,observed,original,undefined,{preparation,acquisition,ticket,wrapper});\n  if(acquisition.kind==='scanner'?(wrapper?.kind!=='scanner'||wrapper.obligation===undefined||wrapper.obligation.original!==acquired):(ticket===undefined&&wrapper===undefined)){custody.stopped=true;custody.fatalObservation={preparation,original,observed,acquired};}\n}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureOriginal',references:[preparation,original,observed]};custody.failures.push(cause);}}\nexport function captureHold(owner:DependencyOwner,ownership:Ownership,keeper:PreparationKeeper){try{tap('hold',owner,ownership,keeper,keeper.pending,undefined,{interval:keeper.interval});}catch(cause){custody.stopped=true;custody.fatalObservation={kind:'captureHold',references:[owner,ownership,keeper]};custody.failures.push(cause);}}\n\nconst controllerLabels=new Set(['fixture','owner-action','outer-owner','completion']);\nconst controllerFailures:{kind:'semantic'|'release';cause:unknown;args?:readonly unknown[];aliases?:readonly unknown[]}[]=[],knownJoinOutcomes:({original?:unknown;observer?:Promise<void>;outcome:PromiseSettledResult<unknown>;args?:readonly unknown[];aliases?:readonly unknown[]})[]=[];\nconst controllerControls:ControlRecord[]=[],controllerTickets=new WeakMap<Ticket,ControlRecord>(),controllerPreparations:{preparation:DependencyPreparation;record:PreparationRecord}[]=[],controllerPreparationMap=new WeakMap<DependencyPreparation,PreparationRecord>(),scannerObligations:ScannerRecord[]=[],scannerTickets=new WeakMap<Ticket,ScannerRecord>(),scannerCalls:ScannerCall[]=[];\nfunction stopController(cause:unknown,references:unknown[]){custody.stopped=true;custody.failures.push(cause);custody.fatalObservation={kind:'coupled-controller',references};}\nexport function reserveControllerControl(label:string){admit();if(!controllerLabels.has(label)||controllerControls.some(control=>control.label===label))fail('coupled control label or repetition differs');const ticket=Object.freeze({});const control:ControlRecord={ticket,label,phase:'entered',original:undefined,observer:undefined,observerSettled:false,joined:false};controllerControls.push(control);controllerTickets.set(ticket,control);return ticket;}\nexport function attachControllerControl<Original extends Promise<unknown>>(ticket:Ticket,original:Original){const control=controllerTickets.get(ticket);if(control===undefined||control.phase!=='entered')fail('coupled control attachment differs');control.original=original;control.phase='pending';try{control.observer=original.then(value=>{control.value=value;control.phase='fulfilled';control.observerSettled=true;},cause=>{control.cause=cause;control.phase='rejected';control.observerSettled=true;});}catch(cause){control.phase='unknown';stopController(cause,[control,original]);throw cause;}return original;}\nexport function throwControllerControl(ticket:Ticket,cause:unknown){const control=controllerTickets.get(ticket);if(control===undefined)fail('coupled control throw absent');control.phase='unknown';control.cause=cause;stopController(cause,[control]);}\nexport function capturePreparation(preparation:DependencyPreparation,record:PreparationRecord){try{if(controllerPreparations.length!==0||controllerPreparationMap.has(preparation))throw Error('coupled preparation repeated');const frame={preparation,record};controllerPreparations.push(frame);controllerPreparationMap.set(preparation,record);}catch(cause){stopController(cause,[preparation,record]);}}\nexport function requireControllerPreparation(preparation:DependencyPreparation){const record=controllerPreparationMap.get(preparation);if(record===undefined)fail('coupled preparation identity absent');return record;}\nexport function reserveCompletion(preparation:DependencyPreparation){const record=requireControllerPreparation(preparation);const ticket=reserveControllerControl('completion');(/* reserveControllerControl synchronously stores this exact returned ticket, with no intervening callback, await or deletion. */controllerTickets.get(ticket) as ControlRecord).preparation=preparation;(/* Same immediate reserveControllerControl producer postcondition; this refinement is confined to its returned ticket. */controllerTickets.get(ticket) as ControlRecord).record=record;return ticket;}\nexport function reserveScannerCall(args:readonly unknown[]){admit();if(scannerCalls.length>=5)fail('coupled scanner call cap exceeded');const call:ScannerCall={args:[...args],phase:'entered',original:undefined,observer:undefined};scannerCalls.push(call);return call;}\nexport function attachScannerCall<Original extends Promise<unknown>>(call:ScannerCall,original:Original){call.original=original;call.phase='pending';try{call.observer=original.then(value=>{call.phase='fulfilled';},cause=>{call.phase='unknown';call.cause=cause;stopController(cause,[call,original]);});}catch(cause){call.phase='unknown';call.cause=cause;stopController(cause,[call,original]);throw cause;}return original;}\nexport function throwScannerCall(call:ScannerCall,cause:unknown){call.phase='unknown';call.cause=cause;stopController(cause,[call]);}\nexport function reserveScanner(args:readonly unknown[]){admit();if(args.length!==3||args[2]!==true||scannerObligations.length!==0)fail('coupled retained scanner boundary differs');const ticket=Object.freeze({});const record:ScannerRecord={ticket,args:[...args],phase:'entered',original:undefined,scanOriginal:undefined,observer:undefined,observerSettled:false,nativePhase:'not-entered',nativeEntries:0,productionAttempts:0,fixtureAttempts:0};scannerTickets.set(ticket,record);scannerObligations.push(record);return ticket;}\nexport function attachScannerPromise<Original extends Promise<Monitor>>(ticket:Ticket,original:Original){const record=scannerTickets.get(ticket);if(record===undefined||record.phase!=='entered')fail('coupled scanner attachment differs');record.scanOriginal=original;record.phase='pending';try{record.observer=original.then(monitor=>{record.original=monitor;record.phase='returned';try{const close=monitor.close;if(typeof close!=='function')throw Error('coupled scanner close absent');record.savedClose=close;record.closeReceiver=monitor;wrappers.set(monitor,Object.freeze({kind:'scanner',obligation:record}));monitor.close=function(...args){record.productionAttempts++;if(this!==monitor)fail('coupled scanner receiver differs');if(record.nativePhase!=='not-entered')fail('coupled scanner close re-entry');record.nativePhase='entered';record.nativeEntries++;record.closeArgs=[...args];try{const returned=Reflect.apply(close,this,args);record.closeReturned=returned;record.nativePhase='returned';return returned;}catch(cause){record.nativePhase='unknown';record.closeCause=cause;stopController(cause,[record,monitor]);throw cause;}};}catch(cause){record.phase='unknown';stopController(cause,[record,monitor]);}record.observerSettled=true;},cause=>{record.phase='unknown';record.scanCause=cause;record.observerSettled=true;stopController(cause,[record,original]);});}catch(cause){record.phase='unknown';stopController(cause,[record,original]);throw cause;}return original;}\nexport function throwScanner(ticket:Ticket,cause:unknown){const record=scannerTickets.get(ticket);if(record===undefined)fail('coupled scanner throw absent');record.phase='unknown';record.scanCause=cause;stopController(cause,[record]);}\nexport function retainControllerFailure(kind:'semantic'|'release',cause:unknown){if(kind!=='semantic'&&kind!=='release')fail('coupled failure attribution differs');controllerFailures.push({kind,cause});}\nexport function inspectKnownComposition(){return Object.freeze({failures:Object.freeze(controllerFailures.map(snapshot)),joinOutcomes:Object.freeze(knownJoinOutcomes.map(snapshot)),controls:Object.freeze(controllerControls.map(snapshot)),preparations:Object.freeze(controllerPreparations.map(frame=>Object.freeze({...frame}))),scannerCalls:Object.freeze(scannerCalls.map(snapshot)),scanners:Object.freeze(scannerObligations.map(snapshot))});}\nexport function assertKnownCase(caseId:string){if(caseId!=='known-initial-prepared-release'&&caseId!=='known-preawait-manifest-refusal')fail('coupled known case differs');if(controllerControls.length!==0||controllerPreparations.length!==0)fail('coupled controller already entered');}\nexport function assertKnownPrepared(context:FinalizedParticipantRestorationContext){if(controllerPreparations.length!==1)fail('coupled preparation census differs');const record=controllerPreparations[0].record;if(context!==record.context||record.storage!==context.storage||record.owner!==context.owner||context.purpose!=='initial-handoff'||context.storage.purpose!=='initial-handoff'||context.attempt!==record.attempt||context.pending.contents!==record.pending)fail('coupled genuine context association differs');return record;}\nexport function assertManifestRefusal(cause:unknown,baseline:unknown){\n// Number.isSafeInteger can return true only for a primitive integer number. Each range operand and slice is dominated by that existing guard and fail-never; these refinements assert no custody state.\nif(!Number.isSafeInteger(baseline)||(baseline as number)<0||(baseline as number)>custody.natives.length)fail('coupled refusal baseline differs');if(controllerPreparations.length!==1)fail('coupled refusal preparation absent');const record=controllerPreparations[0].record;const completion=controllerControls.find(control=>control.label==='completion');if(record.composition.outcome.phase!=='rejected'||record.composition.outcome.cause!==cause||record.projection===undefined||record.projection.outcome.phase!=='rejected'||record.projection.outcome.cause!==cause||completion===undefined||completion.phase!=='rejected'||completion.cause!==cause||record.prepared!==undefined||record.context!==undefined||record.storage!==undefined||record.runtimeLock!==undefined||record.runtimeAction!==undefined||custody.owners.some(frame=>frame.observations.some(observation=>observation.kind==='runtime-entry'||observation.kind==='runtime-action'))||custody.operations.some(operation=>operation.label==='complete.scanner')||record.originals.size!==0||custody.natives.slice(baseline as number).some(native=>native.label.startsWith('storage.')||native.label.startsWith('graph.')||native.label.startsWith('backup.')||native.label==='database.readonly')||custody.operations.some(operation=>operation.label==='complete.storage')||scannerObligations.length!==0)fail('coupled exact manifest refusal differs');}\nexport async function joinKnownComposition(){\n const controls=[...controllerControls];if(controls.length!==4||controllerPreparations.length!==1)fail('coupled known control census differs');\n const preparedRecord=controllerPreparations[0].record;\n if(custody.owners.length!==1||custody.owners[0].owner!==preparedRecord.owner||custody.owners[0].ownership!==preparedRecord.ownership)fail('coupled owner observation missing');\n for(const kind of ['composition','projection']){const captures=custody.owners[0].observations.filter(observation=>observation.kind===kind);const settlement=kind==='composition'?preparedRecord.composition:preparedRecord.projection;if(captures.length!==1||settlement===undefined||captures[0].record!==preparedRecord||captures[0].original!==settlement.original||captures[0].observer!==settlement.observer)fail('coupled owner observation binding differs');}\n const pending:unknown[]=[],observers:Promise<void>[]=[];for(const control of controls){if(control.original===undefined||control.observer===undefined)fail('coupled control observer missing');pending.push(control.original,control.observer);observers.push(control.observer);}\n for(const operation of custody.operations)if(operation.kind==='promise'){if(operation.original===undefined||operation.observer===undefined)fail('coupled operation observer missing');pending.push(operation.original,operation.observer);observers.push(operation.observer);}\n for(const frame of custody.owners)for(const observation of frame.observations)if(['composition','projection','runtime-action','runtime-entry','operation'].includes(observation.kind)){if(observation.original===undefined||observation.observer===undefined)fail('coupled owner observer missing');pending.push(observation.original,observation.observer);observers.push(observation.observer);}\n for(const call of scannerCalls){if(call.original===undefined||call.observer===undefined)fail('coupled scanner call observer missing');pending.push(call.original,call.observer);observers.push(call.observer);}\n for(const scanner of scannerObligations){if(scanner.scanOriginal===undefined||scanner.observer===undefined)fail('coupled scanner observer missing');pending.push(scanner.scanOriginal,scanner.observer);observers.push(scanner.observer);}\n const settled=await Promise.allSettled(pending);for(let index=0;index<pending.length;index++)knownJoinOutcomes.push({original:pending[index],outcome:settled[index]});\n const observerSettled=await Promise.allSettled(observers);for(let index=0;index<observers.length;index++)knownJoinOutcomes.push({observer:observers[index],outcome:observerSettled[index]});\n if(observerSettled.some(outcome=>outcome.status!=='fulfilled'))fail('coupled original observer rejected');\n for(const child of children){if(child.original===undefined)fail('coupled child original missing');await joinOrdinaryChild(child.original);if(child.joinObserver===undefined)fail('coupled child join observer missing');await child.joinObserver;}\n for(const control of controls){if(!control.observerSettled||!['fulfilled','rejected'].includes(control.phase))fail('coupled control unsettled');control.joined=true;}\n for(const operation of custody.operations)if(operation.kind==='promise')await joinOperation(operation.ticket);\n if(custody.stopped||custody.fatalObservation!==undefined||custody.natives.some(native=>native.phase!=='returned'||native.nativePhase!=='returned'||native.nativeEntries!==1||native.nativeReturns!==1)||scannerObligations.some(scanner=>scanner.phase!=='returned'||scanner.nativePhase!=='returned'||scanner.nativeEntries!==1)||children.some(child=>!child.joined)||migrationRoots.some(root=>root.removalPhase!=='returned'))fail('coupled known originals not closed');\n const keeperCaptures=custody.owners[0].observations.filter(observation=>observation.kind==='keeper');if(keeperCaptures.length!==1)fail('coupled production keeper capture missing');const keeper=keeperCaptures[0].record;const intervals=custody.operations.filter(operation=>operation.label==='owner.interval'),clears=custody.operations.filter(operation=>operation.label==='owner.clear');if(intervals.length!==1||intervals[0].phase!=='returned'||intervals[0].returned!==keeper.interval||intervals[0].args.length!==2||typeof intervals[0].args[0]!=='function'||intervals[0].args[1]!==60000||clears.length!==1||clears[0].phase!=='returned'||clears[0].args.length!==1||clears[0].args[0]!==keeper.interval)fail('coupled production keeper retirement differs');\n const record=controllerPreparations[0].record;if(record.phase!=='closed'||record.ownership.state==='unknown'||record.originals.size!==0&&[...record.originals].some(original=>original.state!=='closed'))fail('coupled production preparation not closed');\n}\n";
}

interface OrdinaryCoupledInputV1 {
  readonly identity: string;
  readonly mode: string;
  readonly bytes: number;
  readonly sha256: string;
}

function ordinaryCoupledOmissionsV1(root: string): readonly string[] {
  return [
    `${root}/tools/tool-remote-scripts/src/lib/solver-reader-preparation.ts`,
    `${root}/node_modules/drizzle-orm/sql/functions/aggregate.js`,
    `${root}/node_modules/drizzle-orm/sql/functions/vector.js`,
  ];
}

/** Compares independently sealed predictions with conservative coverage; observations grant no authority. */
export function assertOrdinaryCoupledPredictionV1(
  root: string,
  coverage: readonly OrdinaryCoupledInputV1[],
  prediction: readonly OrdinaryCoupledInputV1[],
  physical: readonly string[],
): void {
  if (coverage.length !== 290 || prediction.length !== 287)
    throw new Error('coupled prediction census differs');
  ordinaryHoldClosureUniqueV1(coverage.map((row) => row.identity));
  ordinaryHoldClosureUniqueV1(prediction.map((row) => row.identity));
  const omissions = ordinaryCoupledOmissionsV1(root);
  for (const identity of omissions) {
    // Proof: removing this physical-coverage block admitted a missing fixed omission; KCT5 prediction test failed and restoration passed (2026-11-07, inert production guard).
    if (!physical.includes(identity) || !coverage.some((row) => row.identity === identity))
      throw new Error('coupled physical omission coverage absent');
  }
  const candidates = coverage.filter((row) => !omissions.includes(row.identity));
  if (
    candidates.length !== prediction.length ||
    prediction.some((row) => !candidates.some((candidate) => candidate.identity === row.identity))
  )
    throw new Error('coupled prediction identity differs');
  for (const row of prediction) {
    const covered = candidates.find((candidate) => candidate.identity === row.identity);
    if (covered?.mode !== row.mode || covered.bytes !== row.bytes || covered.sha256 !== row.sha256)
      throw new Error('coupled prediction bytes differ');
  }
}

/** Requires the exact precommitted compiler set, including absence of the three covered omissions. */
export function assertOrdinaryCoupledCompilerInputsV1(
  predicted: readonly string[],
  observed: readonly string[],
): void {
  // Proof: removing this entire set predicate admitted the first removed-input case; KCT5 compiler identity test failed and restoration passed (2026-11-07, inert production guard).
  if (
    predicted.length !== 287 ||
    observed.length !== 287 ||
    new Set(predicted).size !== 287 ||
    new Set(observed).size !== 287 ||
    observed.some((identity) => !predicted.includes(identity))
  )
    throw new Error('coupled compiler prediction identities differ');
}

/** Coverage: closed roster and row validation are exercised by fixed-packet admission; individual guard omissions remain unproved. */
function decodeOrdinaryCoupledLoadExpectationsV1(
  sourceRoot: string,
  value: unknown,
  digest: unknown,
): readonly OrdinaryHoldLoadExpectationV1[] {
  if (
    ordinaryHoldSha(digest, 'coupled load digest') !==
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  )
    throw new Error('coupled load expectation digest differs');
  if (!Array.isArray(value) || value.length !== 47)
    throw new Error('coupled load expectation roster differs');
  const classes = new Map<string, OrdinaryHoldLoadExpectationV1['mode']>();
  for (const entry of ordinaryHoldModuleModesV1)
    if (entry.mode !== 'external-unchanged')
      classes.set(`${sourceRoot}/${entry.relative}`, entry.mode);
  for (const identity of ordinaryCoupledPortSourcesV1(sourceRoot).keys())
    classes.set(identity.slice('ordinary-hold-v1:'.length), 'virtual');
  const seen = new Set<string>();
  return Object.freeze(
    value.map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['namespace', 'identity', 'mode', 'loader', 'bytes', 'sha256'],
        'coupled load expectation',
      );
      const identity = row['identity'];
      if (
        typeof identity !== 'string' ||
        seen.has(identity) ||
        !classes.has(identity) ||
        classes.get(identity) !== row['mode'] ||
        row['loader'] !== 'ts' ||
        row['namespace'] !== (row['mode'] === 'virtual' ? 'ordinary-hold-v1' : 'file') ||
        typeof row['bytes'] !== 'number' ||
        !Number.isSafeInteger(row['bytes']) ||
        row['bytes'] < 0 ||
        row['bytes'] > 16 * 1024 * 1024
      )
        throw new Error('coupled load expectation identity or shape differs');
      seen.add(identity);
      const mode = classes.get(identity);
      if (mode === undefined) throw new Error('coupled load expectation class absent');
      return Object.freeze({
        namespace: mode === 'virtual' ? ('ordinary-hold-v1' as const) : ('file' as const),
        identity,
        mode,
        loader: 'ts' as const,
        bytes: row['bytes'],
        sha256: ordinaryHoldSha(row['sha256'], 'coupled load expectation'),
      });
    }),
  );
}

/** Retains exact callback objects privately; the exported seam permits inert recorder proofs only. */
export function createOrdinaryCoupledLoadRecorderV1(
  sourceRoot: string,
  expected: unknown,
  digest: unknown,
) {
  const rows = decodeOrdinaryCoupledLoadExpectationsV1(
    ordinaryHoldAbsolute(sourceRoot, 'coupled load root'),
    expected,
    digest,
  );
  const expectations = new Map(rows.map((row) => [row.identity, row]));
  const retained = new Map<
    string,
    { returned: OrdinaryHoldLoadReturnV1; contents: Uint8Array | string }
  >();
  let settled = false;
  const fingerprint = (returned: OrdinaryHoldLoadReturnV1) => {
    // Proof: removing this shape block admitted retained ts-to-js loader drift; KCT5 recorder test failed and restoration passed (2026-11-07, inert callbacks). Other shape conjuncts were not isolated.
    if (
      returned.loader !== 'ts' ||
      !(typeof returned.contents === 'string' || returned.contents instanceof Uint8Array)
    )
      throw new Error('coupled load returned shape differs');
    return {
      bytes:
        typeof returned.contents === 'string'
          ? Buffer.byteLength(returned.contents)
          : returned.contents.byteLength,
      sha256: createHash('sha256').update(returned.contents).digest('hex'),
    };
  };
  return Object.freeze({
    /** Copies diagnostic bytes only; this does not settle or authorize any compiler observation. Proof: returning the private byte reference allowed diagnostic mutation to change the retained load and failed KCT5 recorder; restoration passed (2026-11-07, inert evidence). */
    inspect() {
      return Object.freeze(
        rows.flatMap((row) => {
          const captured = retained.get(row.identity);
          // A partial attempt has not yet returned every expected callback. Missing returns stay absent here and still fail settle().
          if (captured === undefined) return [];
          const observed = fingerprint(captured.returned);
          return [
            Object.freeze({
              ...row,
              contents:
                typeof captured.returned.contents === 'string'
                  ? captured.returned.contents
                  : new Uint8Array(captured.returned.contents),
              observedSha256: observed.sha256,
              observedBytes: observed.bytes,
              contentsReferencePreserved: captured.returned.contents === captured.contents,
            }),
          ];
        }),
      );
    },
    record<T extends OrdinaryHoldLoadReturnV1>(
      namespace: OrdinaryHoldLoadExpectationV1['namespace'],
      identity: string,
      returned: T,
    ): T {
      if (settled) throw new Error('coupled load recorder already settled');
      const expectation = expectations.get(identity);
      if (expectation?.namespace !== namespace) throw new Error('coupled load unknown identity');
      if (retained.has(identity)) throw new Error('coupled load duplicate identity');
      const observed = fingerprint(returned);
      if (
        observed.bytes !== expectation.bytes ||
        observed.sha256 !== expectation.sha256 ||
        (namespace === 'file'
          ? !(returned.contents instanceof Uint8Array)
          : typeof returned.contents !== 'string')
      )
        throw new Error('coupled load expectation bytes differ');
      retained.set(identity, { returned, contents: returned.contents });
      // Proof: returning a shallow copy failed the KCT5 recorder exact-object assertion; restoration passed (2026-11-07, inert callbacks).
      return returned;
    },
    settle(): readonly OrdinaryHoldLoadReceiptV1[] {
      if (retained.size !== rows.length) throw new Error('coupled load missing identity');
      const receipts = rows.map((row) => {
        const retainedReturn = retained.get(row.identity);
        if (retainedReturn === undefined) throw new Error('coupled load missing identity');
        if (retainedReturn.returned.contents !== retainedReturn.contents)
          throw new Error('coupled load contents reference drift');
        const observed = fingerprint(retainedReturn.returned);
        if (observed.bytes !== row.bytes || observed.sha256 !== row.sha256)
          throw new Error('coupled load contents drift after compiler join');
        return Object.freeze({ ...row, returned: true as const, settledSha256: observed.sha256 });
      });
      settled = true;
      return Object.freeze(receipts);
    },
  });
}

export interface OrdinaryCoupledClosureManifestV1 extends Omit<
  OrdinaryHoldClosureManifestV1,
  'format' | 'sourceEpoch' | 'generatedEntry'
> {
  readonly format: 'ordinary-coupled-input-closure-v1';
  readonly sourceEpoch: typeof ordinaryCoupledSourceEpochV1;
  readonly generatedEntry: Omit<OrdinaryHoldClosureGeneratedEntryV1, 'template'> & {
    readonly template: {
      readonly format: 'ordinary-coupled-entry-v1';
      readonly exports: readonly (readonly [string, string])[];
      readonly ledger: string;
      readonly controller: string;
    };
  };
}

export interface OrdinarySetupCustodyClosureManifestV1 extends Omit<
  OrdinaryCoupledClosureManifestV1,
  'format' | 'sourceEpoch'
> {
  readonly format: 'ordinary-setup-input-closure-v1';
  readonly sourceEpoch: typeof ordinarySetupCustodySourceEpochV1;
}
type OrdinaryCompilerClosureV1 =
  OrdinaryCoupledClosureManifestV1 | OrdinarySetupCustodyClosureManifestV1;

/** Coverage: independently sealed F/D/L/A admission is exercised; new layout/schema guard omission proofs remain open. */
export function decodeOrdinaryCoupledClosureManifestV1(
  value: unknown,
): OrdinaryCoupledClosureManifestV1 {
  const closure = decodeOrdinaryCompilerClosureV1(value, ordinaryCoupledPolicyV1);
  return Object.freeze({
    ...closure,
    format: ordinaryCoupledPolicyV1.closureFormat,
    sourceEpoch: ordinaryCoupledPolicyV1.sourceEpoch,
  });
}

function decodeOrdinaryCompilerClosureV1(value: unknown, policy: OrdinaryCompilerPolicyV1) {
  const packet = ordinaryHoldFields(
    value,
    [
      'format',
      'version',
      'sourceEpoch',
      'sourceRoot',
      'sourceRootCanonical',
      'compilerCwd',
      'readLeaseAssumption',
      'files',
      'directories',
      'symlinks',
      'absences',
      'compilerInputs',
      'virtualInputs',
      'generatedEntry',
      'historicalSourcePins',
      'census',
      'closureOperationCount',
    ],
    'coupled closure manifest',
  );
  // Proof: omitting only the closure epoch comparison admitted an undefined epoch through the historical decoder; SPC4 fixed setup admission failed and exact restoration passed (0/1/0, 2026-11-07). The later setup/near-epoch cases and format/version predicates were not independently reached by this fault.
  if (
    packet['format'] !== policy.closureFormat ||
    packet['version'] !== 1 ||
    packet['sourceEpoch'] !== policy.sourceEpoch
  )
    throw new Error('coupled closure format or epoch differs');
  const sourceRoot = ordinaryHoldClosurePathV1(packet['sourceRoot'], true);
  const sourceRootCanonical = ordinaryHoldClosurePathV1(packet['sourceRootCanonical'], true);
  const compilerCwd = ordinaryHoldClosurePathV1(packet['compilerCwd'], true);
  if (sourceRoot === '/' || sourceRootCanonical === '/' || compilerCwd !== sourceRoot)
    throw new Error('coupled closure root differs');
  const readLeaseAssumption = ordinaryHoldClosureStringV1(packet['readLeaseAssumption']);
  const files = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['files']).map(
      (candidate: unknown): OrdinaryHoldClosureFileV1 => {
        const shape = ordinaryHoldFields(
          candidate,
          Object.prototype.hasOwnProperty.call(candidate, 'compilerMode')
            ? ['identity', 'canonical', 'mode', 'bytes', 'sha256', 'roles', 'compilerMode']
            : ['identity', 'canonical', 'mode', 'bytes', 'sha256', 'roles'],
          'coupled closure file',
        );
        const identity = ordinaryHoldClosurePathV1(
          shape['identity'],
          typeof shape['identity'] === 'string' && shape['identity'].startsWith('/'),
        );
        const canonical = ordinaryHoldClosurePathV1(shape['canonical'], true);
        if (
          !canonical.startsWith(sourceRootCanonical + '/') &&
          !(
            identity === canonical &&
            Array.isArray(shape['roles']) &&
            shape['roles'].length === 1 &&
            shape['roles'][0] === 'authority'
          )
        )
          throw new Error('coupled closure file leaves canonical root');
        const roles = Object.freeze(
          ordinaryHoldClosureArrayV1(shape['roles']).map(ordinaryHoldClosureRoleV1),
        );
        ordinaryHoldClosureUniqueV1(roles);
        if (roles.length === 0) throw new Error('coupled closure empty file roles');
        const row = {
          identity,
          canonical,
          mode: ordinaryHoldClosureIntegerV1(shape['mode'], 0o7777),
          bytes: ordinaryHoldClosureIntegerV1(shape['bytes']),
          sha256: ordinaryHoldSha(shape['sha256'], 'coupled closure file'),
          roles,
        };
        if (roles.includes('compiler')) {
          const compilerMode = shape['compilerMode'];
          if (
            compilerMode !== 'default' &&
            compilerMode !== 'transform' &&
            compilerMode !== 'pinned-pass-through'
          )
            throw new Error('coupled closure compiler mode differs');
          return Object.freeze({ ...row, compilerMode });
        }
        if (Object.hasOwn(shape, 'compilerMode'))
          throw new Error('coupled closure noncompiler mode');
        return Object.freeze(row);
      },
    ),
  );
  const directories = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['directories']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(candidate, ['identity', 'mode'], 'coupled closure directory');
      return Object.freeze({
        identity: ordinaryHoldClosurePathV1(row['identity'], true),
        mode: ordinaryHoldClosureIntegerV1(row['mode'], 0o7777),
      });
    }),
  );
  const symlinks = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['symlinks']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['identity', 'target', 'mode'],
        'coupled closure symlink',
      );
      return Object.freeze({
        identity: ordinaryHoldClosurePathV1(row['identity'], true),
        target: ordinaryHoldClosureStringV1(row['target']),
        mode: ordinaryHoldClosureIntegerV1(row['mode'], 0o7777),
      });
    }),
  );
  const absences = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['absences']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(candidate, ['identity'], 'coupled closure absence');
      return Object.freeze({ identity: ordinaryHoldClosurePathV1(row['identity'], true) });
    }),
  );
  ordinaryHoldClosureUniqueV1([
    ...files.map((row) =>
      row.identity.startsWith('/') ? row.identity : sourceRoot + '/' + row.identity,
    ),
    ...directories.map((row) => row.identity),
    ...symlinks.map((row) => row.identity),
    ...absences.map((row) => row.identity),
  ]);
  const compilerInputs = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['compilerInputs']).map((identity) =>
      ordinaryHoldClosurePathV1(identity, false),
    ),
  );
  ordinaryHoldClosureUniqueV1(compilerInputs);
  if (
    compilerInputs.length !== 258 ||
    JSON.stringify(compilerInputs) !== JSON.stringify([...compilerInputs].sort())
  )
    throw new Error('coupled closure compiler roster differs');
  const compilerFiles = files.filter((row) => row.roles.includes('compiler'));
  if (
    compilerFiles.length !== 258 ||
    compilerFiles.some((row) => !compilerInputs.includes(row.identity)) ||
    compilerFiles.filter((row) => row.compilerMode === 'default').length !== 242 ||
    compilerFiles.filter((row) => row.compilerMode === 'transform').length !== 16 ||
    compilerFiles.filter((row) => row.compilerMode === 'pinned-pass-through').length !== 0
  )
    throw new Error('coupled closure compiler class census differs');
  if (
    files.filter((row) => row.roles.includes('scanner')).length !== 1 ||
    files.some((row) => row.roles.includes('scanner') && row.roles.includes('compiler'))
  )
    throw new Error('coupled closure scanner class differs');
  const virtualInputs = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['virtualInputs']).map(ordinaryHoldClosureStringV1),
  );
  ordinaryHoldClosureUniqueV1(virtualInputs);
  if (
    virtualInputs.length !== 31 ||
    virtualInputs.some((identity) => !/^ordinary-hold-v1:[a-z][a-z-]*$/.test(identity)) ||
    JSON.stringify(virtualInputs) !== JSON.stringify([...virtualInputs].sort()) ||
    virtualInputs.some((identity) => !ordinaryCoupledPortSourcesV1(sourceRoot).has(identity))
  )
    throw new Error('coupled closure virtual roster differs');
  const generated = ordinaryHoldFields(
    packet['generatedEntry'],
    ['role', 'mode', 'bytes', 'sha256', 'template'],
    'coupled closure generated entry',
  );
  const template = ordinaryHoldFields(
    generated['template'],
    ['format', 'exports', 'ledger', 'controller'],
    'coupled closure entry template',
  );
  if (
    generated['role'] !== 'generated-entry' ||
    generated['mode'] !== 0o600 ||
    template['format'] !== 'ordinary-coupled-entry-v1' ||
    template['controller'] !==
      "export {runOrdinaryKnownComposition} from 'ordinary-hold-v1:controller';\nexport {inspectKnownComposition} from 'ordinary-hold-v1:ledger';\n" ||
    template['ledger'] !== "export * as ledger from 'ordinary-hold-v1:ledger';\n"
  )
    throw new Error('coupled closure generated class differs');
  const exports = Object.freeze(
    ordinaryHoldClosureArrayV1(template['exports']).map((candidate: unknown) => {
      const tuple = ordinaryHoldClosureArrayV1(candidate);
      if (tuple.length !== 2) throw new Error('coupled closure export tuple differs');
      const name = ordinaryHoldClosureStringV1(tuple[0]);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
        throw new Error('coupled closure export name differs');
      return Object.freeze([name, ordinaryHoldClosurePathV1(tuple[1], false)] as const);
    }),
  );
  ordinaryHoldClosureUniqueV1(exports.map((tuple) => tuple[0]));
  ordinaryHoldClosureUniqueV1(exports.map((tuple) => tuple[1]));
  if (
    exports.length !== 17 ||
    JSON.stringify(exports) !== JSON.stringify(ordinaryHoldClosureEntryExportsV1)
  )
    throw new Error('coupled closure fixed exports differ');
  const generatedEntry: OrdinaryCoupledClosureManifestV1['generatedEntry'] = Object.freeze({
    role: 'generated-entry',
    mode: 0o600,
    bytes: ordinaryHoldClosureIntegerV1(generated['bytes']),
    sha256: ordinaryHoldSha(generated['sha256'], 'coupled closure generated entry'),
    template: Object.freeze({
      format: 'ordinary-coupled-entry-v1',
      controller:
        "export {runOrdinaryKnownComposition} from 'ordinary-hold-v1:controller';\nexport {inspectKnownComposition} from 'ordinary-hold-v1:ledger';\n",
      exports,
      ledger: "export * as ledger from 'ordinary-hold-v1:ledger';\n",
    }),
  });
  const historicalSourcePins = Object.freeze(
    ordinaryHoldClosureArrayV1(packet['historicalSourcePins']).map((candidate: unknown) => {
      const row = ordinaryHoldFields(
        candidate,
        ['relative', 'bytes', 'sha256'],
        'coupled closure historical pin',
      );
      return Object.freeze({
        relative: ordinaryHoldClosurePathV1(row['relative'], false),
        bytes: ordinaryHoldClosureIntegerV1(row['bytes']),
        sha256: ordinaryHoldSha(row['sha256'], 'coupled closure historical pin'),
      });
    }),
  );
  ordinaryHoldClosureUniqueV1(historicalSourcePins.map((pin) => pin.relative));
  if (
    historicalSourcePins.length !== 17 ||
    JSON.stringify(historicalSourcePins) !== JSON.stringify(ordinaryHoldSourceEpochV1.pins) ||
    historicalSourcePins.some(
      (pin) =>
        !files.some(
          (row) =>
            row.identity === pin.relative && row.bytes === pin.bytes && row.sha256 === pin.sha256,
        ),
    )
  )
    throw new Error('coupled closure historical pins differ');
  const counts = ordinaryHoldFields(
    packet['census'],
    ['F', 'D', 'L', 'A'],
    'coupled closure census',
  );
  const census = Object.freeze({
    F: ordinaryHoldClosureIntegerV1(counts['F']),
    D: ordinaryHoldClosureIntegerV1(counts['D']),
    L: ordinaryHoldClosureIntegerV1(counts['L']),
    A: ordinaryHoldClosureIntegerV1(counts['A']),
  });
  if (
    files.length !== census.F ||
    directories.length !== census.D ||
    symlinks.length !== census.L ||
    absences.length !== census.A ||
    2 * (3 * (census.F + 1) + census.D + 2 * census.L + census.A) !==
      packet['closureOperationCount']
  )
    throw new Error('coupled closure operation census differs');
  return Object.freeze({
    format: policy.closureFormat,
    version: 1,
    sourceEpoch: policy.sourceEpoch,
    sourceRoot,
    sourceRootCanonical,
    compilerCwd,
    readLeaseAssumption,
    files,
    directories,
    symlinks,
    absences,
    compilerInputs,
    virtualInputs,
    generatedEntry,
    historicalSourcePins,
    census,
    closureOperationCount: ordinaryHoldClosureIntegerV1(packet['closureOperationCount']),
  });
}

export function ordinaryCoupledClosureKeysV1(
  manifest: OrdinaryCompilerClosureV1,
): readonly string[] {
  const keys: string[] = [];
  for (const phase of ['before', 'after'] as const) {
    for (const row of [...manifest.files, { identity: 'generated-entry' }])
      for (const operation of ['realpath', 'lstat', 'read'])
        keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, operation));
    for (const row of manifest.directories)
      keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'));
    for (const row of manifest.symlinks)
      for (const operation of ['lstat', 'readlink'])
        keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, operation));
    for (const row of manifest.absences)
      keys.push(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'));
  }
  if (keys.length !== manifest.closureOperationCount)
    throw new Error('ordinary HOLD closure operation budget differs');
  return Object.freeze(keys);
}

/** Each sealed key wraps exactly one actual filesystem Promise; default-loader resolution remains untouched. */
/** Coverage: uses the existing ledger/file guards; the new full real-filesystem sweeps remain unexecuted before driver review. */
async function observeOrdinaryCoupledClosureV1(
  manifest: OrdinaryCompilerClosureV1,
  ledger: OrdinaryHoldClosureLedgerV1,
  phase: OrdinaryHoldClosurePhaseV1,
  entryPath: string,
): Promise<void> {
  for (const row of [
    ...manifest.files,
    { ...manifest.generatedEntry, identity: 'generated-entry', canonical: entryPath },
  ]) {
    const logical =
      row.identity === 'generated-entry'
        ? entryPath
        : row.identity.startsWith('/')
          ? row.identity
          : `${manifest.sourceRoot}/${row.identity}`;
    const canonical = await ledger.run(
      ordinaryHoldClosureKeyV1(phase, row.identity, 'realpath'),
      () => ordinaryHoldRealpath(logical),
    );
    if (canonical !== row.canonical)
      throw new Error('ordinary HOLD closure canonical identity differs');
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(canonical),
    );
    assertOrdinaryHoldClosureFileIdentityV1(
      row,
      canonical,
      stat.isFile(),
      stat.mode & 0o7777,
      stat.size,
    );
    const bytes = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'read'), () =>
      readBinaryFile(canonical),
    );
    assertOrdinaryHoldClosureBytesV1(row, bytes);
  }
  for (const row of manifest.directories) {
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(row.identity),
    );
    if (!stat.isDirectory() || (stat.mode & 0o7777) !== row.mode)
      throw new Error('ordinary HOLD closure directory layout differs');
  }
  for (const row of manifest.symlinks) {
    const stat = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
      ordinaryHoldLstat(row.identity),
    );
    if (!stat.isSymbolicLink() || (stat.mode & 0o7777) !== row.mode)
      throw new Error('ordinary HOLD closure symlink layout differs');
    const target = await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'readlink'), () =>
      ordinaryHoldReadlink(row.identity),
    );
    if (target !== row.target) throw new Error('ordinary HOLD closure symlink target differs');
  }
  for (const row of manifest.absences) {
    try {
      await ledger.run(ordinaryHoldClosureKeyV1(phase, row.identity, 'lstat'), () =>
        ordinaryHoldLstat(row.identity),
      );
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
    throw new Error('ordinary HOLD closure expected absence is present');
  }
}

const ordinaryCoupledPacketPinsV1 = Object.freeze({
  loadExpectations: {
    bytes: 12575,
    sha256: 'f50dc76477909c64189fc4a84b2eccaafb7bb99b54b94c3aec7dba6042248f18',
  },
  coverage: {
    bytes: 502224,
    sha256: 'b54481e48ddb1470b9c08c3614c7ef59a54b3447c8b5faa87ae27b8cbaec4ee2',
  },
  prediction: {
    bytes: 70195,
    sha256: 'a60f56382123d4346129cdc009fac1a10e4bc2f3b2969b5df4aba73ba142e7bc',
  },
  closureManifest: {
    bytes: 146047,
    sha256: 'ae42f514a5acfe28de4a34fefc425345d30ee466db20f0cfc0b0076bd2a33488',
  },
});
const ordinarySetupCustodyPacketPinsV1 = Object.freeze({
  loadExpectations: {
    bytes: 12576,
    sha256: '1369da47ecc3f0a1315ffe05842d6f9e08a3be4999407719eb23506e63add932',
  },
  coverage: {
    bytes: 502225,
    sha256: 'aad5072f0188f6c82196123f373b52470894bf03f6e59eb9af7b8a2182b29dfd',
  },
  prediction: {
    bytes: 70196,
    sha256: '771e340b665a33684f796efad83ac4688ea062136d35ef23750e0b87be43c74c',
  },
  closureManifest: {
    bytes: 146048,
    sha256: '21f6889a07aece7d23b7456269ee0927bbdad0e001ddcbd941cb8f9d2c9514cb',
  },
});
const ordinaryCoupledPolicyV1 = Object.freeze({
  kind: 'coupled-r2',
  sourceEpoch: 'ordinary-uc2-coupled-r2-v1',
  pins: ordinaryCoupledPacketPinsV1,
  loadFormat: 'ordinary-coupled-load-expectations-v1',
  coverageFormat: 'ordinary-coupled-conservative-coverage-v1',
  predictionFormat: 'ordinary-coupled-compiler-prediction-v1',
  closureFormat: 'ordinary-coupled-input-closure-v1',
  builtFormat: 'dependency-owner-ordinary-coupled-image-build',
} as const);
const ordinarySetupCustodyPolicyV1 = Object.freeze({
  kind: 'setup-custody',
  sourceEpoch: 'ordinary-uc2-coupled-setup-v1',
  pins: ordinarySetupCustodyPacketPinsV1,
  loadFormat: 'ordinary-setup-load-expectations-v1',
  coverageFormat: 'ordinary-setup-conservative-coverage-v1',
  predictionFormat: 'ordinary-setup-compiler-prediction-v1',
  closureFormat: 'ordinary-setup-input-closure-v1',
  builtFormat: 'dependency-owner-ordinary-setup-custody-image-build',
} as const);
type OrdinaryCompilerPolicyV1 =
  typeof ordinaryCoupledPolicyV1 | typeof ordinarySetupCustodyPolicyV1;

interface OrdinaryCompilerPacketProvenanceV1 {
  readonly loadExpectationsSha256: string;
  readonly closureManifestSha256: string;
  readonly coverageSha256: string;
  readonly predictionSha256: string;
}

/** Checks emitted digest provenance against the fixed epoch without granting builder authority. */
export function assertOrdinaryCompilerPacketProvenanceV1(
  sourceEpoch: unknown,
  provenance: OrdinaryCompilerPacketProvenanceV1,
): void {
  // Proof: substituting historical pins for setup pins failed SPC4 packet provenance; exact restoration passed (0/1/0, finite digests, 2026-11-07).
  const pins =
    sourceEpoch === ordinaryCoupledPolicyV1.sourceEpoch
      ? ordinaryCoupledPolicyV1.pins
      : sourceEpoch === ordinarySetupCustodyPolicyV1.sourceEpoch
        ? ordinarySetupCustodyPolicyV1.pins
        : undefined;
  // Proof: omitting this guard replaced modeled unknown-epoch refusal with a property-access TypeError; SPC4 packet provenance failed its required message and exact restoration passed (0/1/0). This proves failure classification, not additional acceptance prevention.
  if (pins === undefined) throw new Error('ordinary compiler packet provenance epoch differs');
  // Proof: omitting only the coverage digest comparison admitted a changed digest and failed SPC4 packet provenance; restoration passed (0/1/0). Other comparisons were not independently omitted.
  if (
    provenance.loadExpectationsSha256 !== pins.loadExpectations.sha256 ||
    provenance.closureManifestSha256 !== pins.closureManifest.sha256 ||
    provenance.coverageSha256 !== pins.coverage.sha256 ||
    provenance.predictionSha256 !== pins.prediction.sha256
  )
    throw new Error('ordinary compiler packet provenance differs');
}

interface OrdinaryCoupledEdgeV1 {
  readonly from: string;
  readonly specifier: string;
  readonly kind: string;
  readonly line: number;
  readonly destination: string;
  readonly rule: string;
  readonly external: boolean;
}
interface OrdinaryCoupledCoverageInputV1 extends OrdinaryCoupledInputV1 {
  readonly imports: readonly OrdinaryCoupledEdgeV1[];
}
interface OrdinaryCoupledBuildRequestV1 {
  readonly version: 1;
  readonly mode: 'build-only';
  readonly sourceEpoch: typeof ordinaryCoupledSourceEpochV1;
  readonly sourceRoot: string;
  readonly loadExpectations: readonly OrdinaryHoldLoadExpectationV1[];
  readonly closureManifest: OrdinaryCoupledClosureManifestV1;
  readonly coverage: readonly OrdinaryCoupledCoverageInputV1[];
  readonly prediction: readonly OrdinaryCoupledInputV1[];
  readonly external: readonly string[];
  readonly compiler: {
    readonly version: string;
    readonly revision: string;
    readonly executable: string;
  };
  readonly buildOptions: Readonly<Record<string, unknown>>;
  readonly patch: Uint8Array;
  readonly manifest: Uint8Array;
}

export interface OrdinarySetupCustodyBuildRequestV1 extends Omit<
  OrdinaryCoupledBuildRequestV1,
  'sourceEpoch' | 'closureManifest'
> {
  readonly sourceEpoch: typeof ordinarySetupCustodySourceEpochV1;
  readonly closureManifest: OrdinarySetupCustodyClosureManifestV1;
}
type OrdinaryCompilerAuthorityV1 =
  | {
      readonly kind: 'coupled-r2';
      readonly request: OrdinaryCoupledBuildRequestV1;
      readonly policy: typeof ordinaryCoupledPolicyV1;
    }
  | {
      readonly kind: 'setup-custody';
      readonly request: OrdinarySetupCustodyBuildRequestV1;
      readonly policy: typeof ordinarySetupCustodyPolicyV1;
    };

function ordinaryCoupledPacketV1(
  name: keyof typeof ordinaryCoupledPacketPinsV1,
  value: unknown,
  policy: OrdinaryCompilerPolicyV1,
): unknown {
  const pin = policy.pins[name];
  // Proof: omitting this block admitted semantically identical same-length setup packet spellings; SPC4 raw spelling failed and exact restoration passed (0/1/0, pure decoder, 2026-11-07).
  // Proof: removing this raw admission block admitted same-length valid load JSON with a changed hash; KCT5 fixed packet test failed and restoration passed (2026-11-07, pure decoder). Other packet predicates were not isolated.
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value) !== pin.bytes ||
    sha(value) !== pin.sha256
  )
    throw new Error(`coupled ${name} raw authority differs`);
  return JSON.parse(value);
}

function decodeOrdinaryCoupledInputV1(value: unknown, imports: boolean): OrdinaryCoupledInputV1 {
  const row = ordinaryHoldFields(
    value,
    imports
      ? ['identity', 'mode', 'bytes', 'sha256', 'imports']
      : ['identity', 'mode', 'bytes', 'sha256'],
    'coupled input',
  );
  const mode = ordinaryHoldClosureStringV1(row['mode']);
  if (!['default', 'transform', 'virtual', 'generated'].includes(mode))
    throw new Error('coupled input mode differs');
  return Object.freeze({
    identity: ordinaryHoldClosureStringV1(row['identity']),
    mode,
    bytes: ordinaryHoldClosureIntegerV1(row['bytes']),
    sha256: ordinaryHoldSha(row['sha256'], 'coupled input'),
  });
}

/** Admits only four source-fixed raw packets and the fixed reviewed r2 archive before any setup effect. */
export function decodeOrdinaryCoupledBuildRequestV1(value: unknown): OrdinaryCoupledBuildRequestV1 {
  const request = decodeOrdinaryCompilerBuildRequestV1(value, ordinaryCoupledPolicyV1);
  return Object.freeze({
    ...request,
    sourceEpoch: ordinaryCoupledPolicyV1.sourceEpoch,
    closureManifest: Object.freeze({
      ...request.closureManifest,
      format: ordinaryCoupledPolicyV1.closureFormat,
      sourceEpoch: ordinaryCoupledPolicyV1.sourceEpoch,
    }),
  });
}

/** Admits only the independently sealed setup packets before acquiring any setup effect. */
export function decodeOrdinarySetupCustodyBuildRequestV1(
  value: unknown,
): OrdinarySetupCustodyBuildRequestV1 {
  const request = decodeOrdinaryCompilerBuildRequestV1(value, ordinarySetupCustodyPolicyV1);
  return Object.freeze({
    ...request,
    sourceEpoch: ordinarySetupCustodyPolicyV1.sourceEpoch,
    closureManifest: Object.freeze({
      ...request.closureManifest,
      format: ordinarySetupCustodyPolicyV1.closureFormat,
      sourceEpoch: ordinarySetupCustodyPolicyV1.sourceEpoch,
    }),
  });
}

function decodeOrdinaryCompilerBuildRequestV1(value: unknown, policy: OrdinaryCompilerPolicyV1) {
  const request = ordinaryHoldFields(
    value,
    [
      'version',
      'mode',
      'sourceRoot',
      'sourceEpoch',
      'loadExpectations',
      'closureManifest',
      'coverage',
      'prediction',
      'patch',
      'manifest',
    ],
    'coupled build request',
  );
  // Proof: omitting the request epoch comparison admitted a wrong-epoch pure request; SPC4 fixed setup admission failed and exact restoration passed (0/1/0, 2026-11-07).
  if (
    request['version'] !== 1 ||
    request['mode'] !== 'build-only' ||
    request['sourceEpoch'] !== policy.sourceEpoch
  )
    throw new Error('coupled build request epoch differs');
  const root = ordinaryHoldAbsolute(request['sourceRoot'], 'coupled root');
  const decode = (
    name: keyof typeof ordinaryCoupledPacketPinsV1,
    fields: readonly string[],
    format: string,
  ) => {
    const packet = ordinaryHoldFields(
      ordinaryCoupledPacketV1(name, request[name], policy),
      fields,
      `coupled ${name}`,
    );
    if (
      packet['format'] !== format ||
      packet['sourceRoot'] !== root ||
      packet['sourceEpoch'] !== policy.sourceEpoch
    )
      throw new Error(`coupled ${name} root or epoch differs`);
    return packet;
  };
  const load = decode(
    'loadExpectations',
    ['format', 'sourceRoot', 'sourceEpoch', 'rows'],
    policy.loadFormat,
  );
  const coverage = decode(
    'coverage',
    ['format', 'sourceRoot', 'sourceEpoch', 'compiler', 'buildOptions', 'rows', 'external'],
    policy.coverageFormat,
  );
  const prediction = decode(
    'prediction',
    ['format', 'sourceRoot', 'sourceEpoch', 'rows', 'omissions'],
    policy.predictionFormat,
  );
  const closureManifest = decodeOrdinaryCompilerClosureV1(
    ordinaryCoupledPacketV1('closureManifest', request['closureManifest'], policy),
    policy,
  );
  if (closureManifest.sourceRoot !== root || closureManifest.sourceRootCanonical !== root)
    throw new Error('coupled closure canonical root differs');
  const predictions = Object.freeze(
    ordinaryHoldClosureArrayV1(prediction['rows']).map((row) =>
      decodeOrdinaryCoupledInputV1(row, false),
    ),
  );
  const covered = Object.freeze(
    ordinaryHoldClosureArrayV1(coverage['rows']).map(
      (candidate): OrdinaryCoupledCoverageInputV1 => {
        const row = ordinaryHoldFields(
          candidate,
          ['identity', 'mode', 'bytes', 'sha256', 'imports'],
          'coupled covered input',
        );
        return Object.freeze({
          ...decodeOrdinaryCoupledInputV1(candidate, true),
          imports: Object.freeze(
            ordinaryHoldClosureArrayV1(row['imports']).map((candidate) => {
              const edge = ordinaryHoldFields(
                candidate,
                ['from', 'specifier', 'kind', 'line', 'destination', 'rule', 'external'],
                'coupled edge',
              );
              if (typeof edge['external'] !== 'boolean')
                throw new Error('coupled edge classification differs');
              return Object.freeze({
                from: ordinaryHoldClosureStringV1(edge['from']),
                specifier: ordinaryHoldClosureStringV1(edge['specifier']),
                kind: ordinaryHoldClosureStringV1(edge['kind']),
                line: ordinaryHoldClosureIntegerV1(edge['line']),
                destination: ordinaryHoldClosureStringV1(edge['destination']),
                rule: ordinaryHoldClosureStringV1(edge['rule']),
                external: edge['external'],
              });
            }),
          ),
        });
      },
    ),
  );
  const physical = closureManifest.files
    .filter((row) => row.roles.includes('compiler'))
    .map((row) => `${root}/${row.identity}`);
  assertOrdinaryCoupledPredictionV1(root, covered, predictions, physical);
  const omissions = ordinaryHoldClosureArrayV1(prediction['omissions']).map(
    ordinaryHoldClosureStringV1,
  );
  if (
    JSON.stringify([...omissions].sort()) !==
    JSON.stringify([...ordinaryCoupledOmissionsV1(root)].sort())
  )
    throw new Error('coupled fixed omissions differ');
  const external = Object.freeze(
    ordinaryHoldClosureArrayV1(coverage['external']).map(ordinaryHoldClosureStringV1),
  );
  ordinaryHoldClosureUniqueV1(external);
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  if (
    !external.includes(scanner) ||
    covered.some((row) => row.identity === scanner) ||
    closureManifest.files
      .filter((row) => row.roles.includes('scanner'))
      .some((row) => `${root}/${row.identity}` !== scanner)
  )
    throw new Error('coupled canonical external scanner differs');
  for (const row of covered) {
    if (row.mode === 'default' || row.mode === 'transform') {
      const physicalRow = closureManifest.files.find(
        (file) => `${root}/${file.identity}` === row.identity && file.roles.includes('compiler'),
      );
      if (
        physicalRow === undefined ||
        (row.mode === 'default' &&
          (row.bytes !== physicalRow.bytes || row.sha256 !== physicalRow.sha256))
      )
        throw new Error('coupled input physical coverage differs');
    }
    for (const edge of row.imports)
      if (
        edge.from !== row.identity ||
        (edge.external
          ? !external.includes(edge.destination)
          : !covered.some((candidate) => candidate.identity === edge.destination))
      )
        throw new Error('coupled conservative edge closure differs');
  }
  const compiler = ordinaryHoldFields(
    coverage['compiler'],
    ['version', 'revision', 'executable'],
    'coupled compiler',
  );
  const buildOptions = ordinaryHoldFields(
    coverage['buildOptions'],
    [
      'target',
      'format',
      'splitting',
      'minify',
      'sourcemap',
      'bytecode',
      'packages',
      'metafile',
      'throw',
      'root',
      'tsconfig',
      'plugin',
    ],
    'coupled options',
  );
  const patch = request['patch'],
    manifest = request['manifest'];
  if (
    !(patch instanceof Uint8Array) ||
    patch.byteLength !== 118791 ||
    sha(patch) !== '2d9fdbb243080b724eef49b2791e89bc4b306101e75af06716c1be7f98d5185a' ||
    !(manifest instanceof Uint8Array) ||
    sha(manifest) !== 'ea42aed5edff42f2dc0e4198a3b7282815b82ff52977ceb2d95df1c67835b846'
  )
    throw new Error('coupled r2 raw authority differs');
  return Object.freeze({
    version: 1,
    mode: 'build-only',
    sourceRoot: root,
    sourceEpoch: policy.sourceEpoch,
    loadExpectations: decodeOrdinaryCoupledLoadExpectationsV1(
      root,
      load['rows'],
      sha(JSON.stringify(load['rows'])),
    ),
    closureManifest,
    coverage: covered,
    prediction: predictions,
    external,
    compiler: Object.freeze({
      version: ordinaryHoldClosureStringV1(compiler['version']),
      revision: ordinaryHoldClosureStringV1(compiler['revision']),
      executable: ordinaryHoldAbsolute(compiler['executable'], 'coupled compiler'),
    }),
    buildOptions: Object.freeze(buildOptions),
    patch: new Uint8Array(patch),
    manifest: new Uint8Array(manifest),
  });
}

/** Enumerates actual setup effects independently of the separate sealed filesystem ledger. */
export const ordinaryCoupledSetupLabelsV1: readonly string[] = Object.freeze([
  'root.realpath',
  ...ordinaryHoldSourceEpochV1.pins.flatMap((pin) => [
    `source.realpath:${pin.relative}`,
    `source.read:${pin.relative}`,
  ]),
  ...['tsconfig.base.json', 'package.json', 'bun.lock'].map(
    (relative) => `authority.read:${relative}`,
  ),
  'issuer.realpath',
  'issuer.read',
  'output.mkdtemp',
  'entry.write',
  'compiler.Bun.build',
  'diagnostics.write',
  'artifact.arrayBuffer',
  'artifact.write',
  'metadata.write',
]);
function assertOrdinaryCoupledSetupCensusV1(
  operations: readonly OrdinaryHoldSetupRecordV1[],
): void {
  if (
    JSON.stringify(operations.map((operation) => operation.label)) !==
      JSON.stringify(ordinaryCoupledSetupLabelsV1) ||
    operations.some((operation) => !hasKnownOrdinaryHoldSetupOutcomeV1(operation))
  )
    throw new Error('coupled setup success census differs');
}

/** Validates independently expected rendered/virtual/generated bytes before any compiler invocation. */
export function assertOrdinaryCoupledPlanV1(
  request: Pick<OrdinaryCoupledBuildRequestV1, 'coverage' | 'loadExpectations' | 'sourceRoot'> & {
    readonly closureManifest: OrdinaryCompilerClosureV1;
  },
  plan: OrdinaryCoupledBuildPlanV1 | OrdinarySetupCustodyBuildPlanV1,
): void {
  if (plan.layers.length !== 17 || plan.portSources.size !== 31 || plan.materialized.size !== 17)
    throw new Error('coupled plan census differs');
  for (const row of request.coverage) {
    const contents =
      row.mode === 'transform'
        ? plan.materialized.get(row.identity)
        : row.mode === 'virtual'
          ? plan.portSources.get(row.identity)
          : row.mode === 'generated'
            ? plan.entrySource
            : undefined;
    if (
      row.mode !== 'default' &&
      (contents === undefined ||
        Buffer.byteLength(contents) !== row.bytes ||
        sha(contents) !== row.sha256)
    )
      throw new Error('coupled planned coverage bytes differ');
  }
  for (const row of request.loadExpectations) {
    const contents =
      row.namespace === 'file'
        ? plan.materialized.get(row.identity)
        : plan.portSources.get(`ordinary-hold-v1:${row.identity}`);
    if (
      contents === undefined ||
      Buffer.byteLength(contents) !== row.bytes ||
      sha(contents) !== row.sha256
    )
      throw new Error('coupled planned load bytes differ');
  }
  assertOrdinaryHoldClosureBytesV1(
    request.closureManifest.generatedEntry,
    new TextEncoder().encode(plan.entrySource),
  );
}

/** Closed SDK spellings from the accepted old metadata and unchanged source importer pins. */
const ordinaryCoupledHistoricalRelativeV1 = Object.freeze([
  {
    importer: 'node_modules/drizzle-orm/bun-sqlite/index.js',
    bytes: 208,
    sha256: 'f6dda1d755517112c1480a2ef9b697403ab39c0bc674592e6ffdead0e1b6c7cb',
    specifiers: ['./session.js'],
  },
  {
    importer: 'node_modules/drizzle-orm/index.js',
    bytes: 5091,
    sha256: 'c3615a7f031a2f486a45b05ec69b7ab83735d8ec4bdc228cc0a61bf408ef40d0',
    specifiers: [
      './query-promise.js',
      './entity.js',
      './column.js',
      './table.js',
      './errors.js',
      './sql/expressions/conditions.js',
      './sql/expressions/select.js',
      './subquery.js',
      './view-common.js',
      './alias.js',
      './utils.js',
      './relations.js',
      './column-builder.js',
      './logger.js',
      './sql/functions/aggregate.js',
      './sql/functions/vector.js',
    ],
  },
  {
    importer: 'node_modules/drizzle-orm/sqlite-core/query-builders/index.js',
    bytes: 538,
    sha256: 'a5f9925517c289c624dff5c4d46f8a6b409af4536777218d3db8aff8dd9b8069',
    specifiers: ['./delete.js'],
  },
  {
    importer: 'node_modules/drizzle-orm/sql/index.js',
    bytes: 1437,
    sha256: '4a8ebd013007165d1298cb2ac54c5cbe5ac619311d21e29dd04fa211f3abaaca',
    specifiers: ['./expressions/select.js', './functions/aggregate.js', './functions/vector.js'],
  },
  {
    importer: 'node_modules/drizzle-orm/sqlite-core/columns/index.js',
    bytes: 1513,
    sha256: 'bcb176677f6acd60ca5223823303dce4c461f5aaa1ce4ad62b248a361ca00a21',
    specifiers: [
      './blob.js',
      './custom.js',
      './integer.js',
      './numeric.js',
      './real.js',
      './text.js',
    ],
  },
]);

interface OrdinaryCoupledRawMetadataEdgeV1 {
  readonly rawImporter: string;
  readonly rawPath: string;
  readonly original?: string | undefined;
  readonly external?: boolean;
  readonly kind: string;
}
interface OrdinaryCoupledMetadataAssociationV1 extends OrdinaryCoupledRawMetadataEdgeV1 {
  readonly originalPresent: boolean;
  readonly importerIdentity: string;
  readonly identity: string;
  readonly sourceExternal: boolean;
  readonly sealedSpecifier: string;
  readonly representation: 'direct' | 'node-prefix' | 'historical-relative';
}

/** Associates raw SDK records with sealed source semantics without resolving or reading files.
 * The closed relative roster derives from accepted metadata SHA310ec432d8d6e83a2609e7a816766d1d7f2a0fa9d294a13971430f8faf430fdd
 * and the unchanged conservative coverage SHAb54481e48ddb1470b9c08c3614c7ef59a54b3447c8b5faa87ae27b8cbaec4ee2.
 * Raw SDK flags and original presence survive independently of sourceExternal; present originals must be strings, and historical relatives require absence.
 * Throws for unsealed importers, unsupported representations or incompatible semantic ambiguity.
 */
export function associateOrdinaryCoupledMetadataEdgesV1(
  request: Pick<OrdinaryCoupledBuildRequestV1, 'sourceRoot' | 'coverage'> & {
    readonly closureManifest: OrdinaryCompilerClosureV1;
  },
  compilerCwd: string,
  entryPath: string,
  edges: readonly OrdinaryCoupledRawMetadataEdgeV1[],
): readonly OrdinaryCoupledMetadataAssociationV1[] {
  // Proof: omitting the sealed cwd comparison admitted an absolute scanner record under a foreign cwd; the pure cwd negative failed and restoration passed (2026-11-07).
  if (compilerCwd !== request.closureManifest.compilerCwd)
    throw new Error('coupled compiler cwd differs');
  const canonical = (rawPath: string) => {
    const identity = identifyOrdinaryCoupledMetafilePathV1(
      request.sourceRoot,
      compilerCwd,
      rawPath,
    );
    return identity === entryPath ? 'generated:ordinary-image-entry.ts' : identity;
  };
  return Object.freeze(
    edges.map((edge) => {
      const originalPresent = Object.prototype.hasOwnProperty.call(edge, 'original');
      const importerIdentity = canonical(edge.rawImporter);
      const importer = request.coverage.find((row) => row.identity === importerIdentity);
      if (importer === undefined) throw new Error('coupled compiler edge importer differs');
      const rawIdentity =
        edge.external === true && !edge.rawPath.startsWith('/')
          ? edge.rawPath
          : canonical(edge.rawPath);
      const associations = new Map<string, OrdinaryCoupledMetadataAssociationV1>();
      for (const sealed of importer.imports) {
        // Proof: restoring both old value-based original checks admitted a direct own-present undefined original; the portable presence refusal failed, then passed after exact restoration (2026-11-07). Historical own-undefined refusal is coverage, not isolated proof.
        // Proof: removing the exact kind comparison admitted changed node kind; the isolated pure test failed and restoration passed (2026-11-07).
        if (
          sealed.from !== importerIdentity ||
          sealed.kind !== edge.kind ||
          (originalPresent &&
            (typeof edge.original !== 'string' || edge.original !== sealed.specifier))
        )
          continue;
        let representation: OrdinaryCoupledMetadataAssociationV1['representation'] | undefined;
        // Proof: removing the direct external comparison admitted bundled-scanner metadata; the pure scanner negative failed and restoration passed (2026-11-07).
        if (rawIdentity === sealed.destination && (edge.external === true) === sealed.external)
          representation = 'direct';
        // Proof: removing single-prefix path equality admitted a forged Node path; the isolated pure negative failed and restoration passed (2026-11-07). Missing original refusal remains covered.
        else if (
          edge.external === true &&
          sealed.external &&
          sealed.specifier.startsWith('node:') &&
          sealed.destination === sealed.specifier &&
          edge.original === sealed.specifier &&
          edge.rawPath === sealed.specifier.slice(5)
        )
          representation = 'node-prefix';
        else {
          const historical = ordinaryCoupledHistoricalRelativeV1.find(
            (contract) => importerIdentity === `${request.sourceRoot}/${contract.importer}`,
          );
          const physical = request.closureManifest.files.find(
            (file) =>
              `${request.sourceRoot}/${file.identity}` === importerIdentity &&
              file.roles.includes('compiler'),
          );
          // Proof: isolated omissions admitted an unrostered existing relative, changed default/closure importer hash, changed lexical target, or missing coverage target; each pure negative failed and restoration passed (2026-11-07).
          if (
            historical !== undefined &&
            historical.specifiers.includes(edge.rawPath) &&
            edge.external === true &&
            !originalPresent &&
            edge.kind === 'import-statement' &&
            importer.mode === 'default' &&
            importer.bytes === historical.bytes &&
            importer.sha256 === historical.sha256 &&
            physical?.bytes === historical.bytes &&
            physical.sha256 === historical.sha256 &&
            sealed.specifier === edge.rawPath &&
            sealed.rule === 'default-bun-resolveSync' &&
            !sealed.external &&
            ordinaryHoldResolve(importerIdentity, '..', edge.rawPath) === sealed.destination &&
            request.coverage.some((row) => row.identity === sealed.destination)
          )
            representation = 'historical-relative';
        }
        if (representation === undefined) continue;
        const association = Object.freeze({
          ...edge,
          originalPresent,
          importerIdentity,
          identity: sealed.destination,
          sourceExternal: sealed.external,
          sealedSpecifier: sealed.specifier,
          representation,
        });
        associations.set(
          JSON.stringify([sealed.destination, sealed.specifier, sealed.external, representation]),
          association,
        );
      }
      // Proof: admitting more than one association accepted incompatible scanner specifiers; the pure ambiguity negative failed and restoration passed (2026-11-07).
      if (associations.size !== 1)
        throw new Error('coupled compiler edge destination or classification differs');
      const association = associations.values().next().value;
      if (association === undefined) throw new Error('coupled compiler edge association absent');
      return association;
    }),
  );
}

export function identifyOrdinaryCoupledMetafilePathV1(
  sourceRoot: string,
  compilerCwd: string,
  rawPath: string,
): string {
  const root = ordinaryHoldAbsolute(sourceRoot, 'ordinary HOLD metadata root');
  const cwd = ordinaryHoldAbsolute(compilerCwd, 'ordinary HOLD compiler cwd');
  if (rawPath.startsWith('ordinary-hold-v1:')) {
    if (!ordinaryCoupledPortSourcesV1(root).has(rawPath))
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

/** Compares actual compiler metadata bytes with the independently predicted source rows. */
export function assertOrdinaryCoupledCompilerRowsV1(
  prediction: readonly OrdinaryCoupledInputV1[],
  observed: readonly { readonly identity: string; readonly bytes: number }[],
): void {
  assertOrdinaryCoupledCompilerInputsV1(
    prediction.map((row) => row.identity),
    observed.map((row) => row.identity),
  );
  // Proof: removing this byte comparison admitted changed actual metadata length; KCT5 compiler rows test failed and restoration passed (2026-11-07, inert production guard).
  if (
    observed.some(
      (row) =>
        prediction.find((expected) => expected.identity === row.identity)?.bytes !== row.bytes,
    )
  )
    throw new Error('coupled compiler input bytes differ');
}

interface OrdinaryCoupledCompilerCustodyV1 {
  readonly record: OrdinaryHoldSetupRecordV1;
  readonly original: Promise<unknown>;
  readonly observer: Promise<void>;
}
/** The builder calls this only with its private retention callback, after the actual setup join. */
export function assertOrdinaryCoupledCompilerJoinV1(
  operations: readonly OrdinaryHoldSetupRecordV1[],
  compilerIndex: number,
  custody: OrdinaryCoupledCompilerCustodyV1 | undefined,
): void {
  const compiler = operations.at(compilerIndex);
  // Proof: removing this entire association predicate admitted a replacement original; KCT5 compiler finish test failed and restoration passed (2026-11-07, inert setup original, no Bun.build). Individual conjunct omissions were not isolated.
  if (
    compiler === undefined ||
    compiler !== operations.at(-1) ||
    compiler !== custody?.record ||
    compiler.label !== 'compiler.Bun.build' ||
    compiler.original !== custody.original ||
    compiler.returned !== custody.original ||
    compiler.observer !== custody.observer ||
    !compiler.joined ||
    compiler.state !== 'fulfilled'
  )
    throw new Error('coupled actual compiler join identity differs');
}

export interface OrdinaryCoupledBuiltImageV1 extends Omit<
  OrdinaryHoldBuiltImageV1,
  'format' | 'sourceEpoch'
> {
  readonly format: 'dependency-owner-ordinary-coupled-image-build';
  readonly sourceEpoch: typeof ordinaryCoupledSourceEpochV1;
  readonly coverageSha256: string;
  readonly predictionSha256: string;
}
export interface OrdinarySetupCustodyBuiltImageV1 extends Omit<
  OrdinaryCoupledBuiltImageV1,
  'format' | 'sourceEpoch'
> {
  readonly format: 'dependency-owner-ordinary-setup-custody-image-build';
  readonly sourceEpoch: typeof ordinarySetupCustodySourceEpochV1;
}
type OrdinaryCompilerBuiltImageV1 = OrdinaryCoupledBuiltImageV1 | OrdinarySetupCustodyBuiltImageV1;

type OrdinaryCoupledLoadObservationsV1 = ReturnType<
  ReturnType<typeof createOrdinaryCoupledLoadRecorderV1>['inspect']
>;
interface OrdinaryCompilerInspectionV1 extends OrdinaryHoldBuildAttemptV1 {
  readonly original: Promise<unknown>;
  failure?: unknown;
  completed?: Pick<OrdinaryCompilerBuiltImageV1, 'setupOperations'>;
  readonly kind: OrdinaryCompilerAuthorityV1['kind'];
  state: 'pending' | 'fulfilled' | 'rejected';
  loadObservations?: () => OrdinaryCoupledLoadObservationsV1;
}
interface OrdinaryCompilerBuildAttemptV1 extends OrdinaryCompilerInspectionV1 {
  completed?: OrdinaryCompilerBuiltImageV1;
}
const ordinaryCompilerAttemptsV1 = new WeakMap<
  Promise<OrdinaryCompilerBuiltImageV1>,
  OrdinaryCompilerBuildAttemptV1
>();

/** The same original build Promise keys its retained setup records and observer. */
/** Diagnostic snapshots never expose the private mutable onLoad objects or grant settlement. Shape failure throws while all private references remain retained. */
export function inspectOrdinaryCoupledBuildV1(original: Promise<OrdinaryCoupledBuiltImageV1>) {
  return inspectOrdinaryCompilerBuildV1(original, 'coupled-r2');
}

/** Inspects only the genuine setup variant original; getters retain live failure state. */
export function inspectOrdinarySetupCustodyBuildV1(
  original: Promise<OrdinarySetupCustodyBuiltImageV1>,
) {
  return inspectOrdinaryCompilerBuildV1(original, 'setup-custody');
}

function inspectOrdinaryCompilerBuildV1(
  original: Promise<OrdinaryCompilerBuiltImageV1>,
  kind: OrdinaryCompilerAuthorityV1['kind'],
) {
  return inspectOrdinaryCompilerAttemptV1(original, kind, ordinaryCompilerAttemptsV1.get(original));
}

/** Pure diagnostic association/snapshot seam; cannot register attempts, callbacks or settlement authority. */
export function inspectOrdinaryCompilerAttemptV1(
  original: Promise<unknown>,
  kind: OrdinaryCompilerAuthorityV1['kind'],
  attempt: OrdinaryCompilerInspectionV1 | undefined,
) {
  // Proof: independently omitting original identity and variant equality failed SPC4 inert inspection; each exact restoration passed (0/1/0, data-only frames, 2026-11-07). No private attempt was registered.
  if (attempt?.original !== original || attempt.kind !== kind)
    throw new Error('coupled build original absent');
  return Object.freeze({
    observer: attempt.observer,
    get state() {
      return attempt.state;
    },
    get outputRoot() {
      return attempt.outputRoot;
    },
    get failure() {
      return attempt.failure;
    },
    get operations() {
      return attempt.completed === undefined
        ? Object.freeze(attempt.operations.map((record) => Object.freeze({ ...record })))
        : attempt.completed.setupOperations;
    },
    get loads() {
      const observe = attempt.loadObservations;
      return observe === undefined
        ? Object.freeze({ status: 'not-entered' as const })
        : Object.freeze({ status: 'retained' as const, observations: observe() });
    },
    closureOperations: () =>
      Object.freeze(attempt.closureOperations().map((record) => Object.freeze({ ...record }))),
  });
}

/** Compiles real pinned sources once, retains actual setup outcomes, and never imports the output. */
export function buildOrdinaryCoupledImageV1(
  request: unknown,
): Promise<OrdinaryCoupledBuiltImageV1> {
  return startOrdinaryCompilerBuildV1({
    kind: 'coupled-r2',
    request: decodeOrdinaryCoupledBuildRequestV1(request),
    policy: ordinaryCoupledPolicyV1,
  });
}

/** Starts the same genuine compiler body with the independently sealed setup authority. */
export function buildOrdinarySetupCustodyImageV1(
  request: unknown,
): Promise<OrdinarySetupCustodyBuiltImageV1> {
  return startOrdinaryCompilerBuildV1({
    kind: 'setup-custody',
    request: decodeOrdinarySetupCustodyBuildRequestV1(request),
    policy: ordinarySetupCustodyPolicyV1,
  });
}

function startOrdinaryCompilerBuildV1(
  authority: Extract<OrdinaryCompilerAuthorityV1, { kind: 'coupled-r2' }>,
): Promise<OrdinaryCoupledBuiltImageV1>;
function startOrdinaryCompilerBuildV1(
  authority: Extract<OrdinaryCompilerAuthorityV1, { kind: 'setup-custody' }>,
): Promise<OrdinarySetupCustodyBuiltImageV1>;
function startOrdinaryCompilerBuildV1(
  authority: OrdinaryCompilerAuthorityV1,
): Promise<OrdinaryCompilerBuiltImageV1> {
  const admitted = authority.request;
  const operations: OrdinaryHoldSetupRecordV1[] = [];
  const closureLedger = createOrdinaryHoldClosureLedgerV1(
    ordinaryCoupledClosureKeysV1(admitted.closureManifest),
  );
  const body = buildOrdinaryCompilerImageBodyV1(
    authority,
    operations,
    closureLedger,
    (outputRoot, loadObservations) => {
      const attempt = ordinaryCompilerAttemptsV1.get(body);
      if (attempt === undefined) throw new Error('coupled private build attempt absent');
      attempt.outputRoot = outputRoot;
      if (loadObservations !== undefined) attempt.loadObservations = loadObservations;
    },
  );
  const observer = body.then(
    (packet) => {
      const attempt = ordinaryCompilerAttemptsV1.get(body);
      if (attempt === undefined) throw new Error('coupled private build attempt absent');
      attempt.completed = packet;
      attempt.state = 'fulfilled';
    },
    (cause: unknown) => {
      const attempt = ordinaryCompilerAttemptsV1.get(body);
      if (attempt === undefined) throw new Error('coupled private build attempt absent');
      attempt.failure = cause;
      attempt.state = 'rejected';
    },
  );
  ordinaryCompilerAttemptsV1.set(body, {
    original: body,
    kind: authority.kind,
    operations,
    observer,
    state: 'pending',
    closureOperations: closureLedger.inspect,
  });
  return body;
}

async function buildOrdinaryCompilerImageBodyV1(
  resolved: OrdinaryCompilerAuthorityV1,
  operations: OrdinaryHoldSetupRecordV1[],
  closureLedger: OrdinaryHoldClosureLedgerV1,
  retainOutputRoot: (
    outputRoot: string,
    loadObservations?: () => OrdinaryCoupledLoadObservationsV1,
  ) => void,
): Promise<OrdinaryCompilerBuiltImageV1> {
  const { request, policy } = resolved;
  let retainedLoadRecorder: ReturnType<typeof createOrdinaryCoupledLoadRecorderV1> | undefined;
  const keeper = setInterval(() => ({ operations, retainedLoadRecorder, closureLedger }), 60000);
  try {
    const root = request.sourceRoot;
    if (
      Bun.version !== request.compiler.version ||
      Bun.revision !== request.compiler.revision ||
      process.execPath !== request.compiler.executable ||
      process.cwd() !== request.closureManifest.compilerCwd
    )
      throw new Error('coupled pinned compiler identity differs');
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
        (await ordinaryHoldSetupOperationV1(operations, `source.realpath:${pin.relative}`, () =>
          ordinaryHoldRealpath(path),
        )) !== path
      )
        throw new Error('ordinary HOLD source path changed');
      supplied.set(
        path,
        await ordinaryHoldSetupOperationV1(operations, `source.read:${pin.relative}`, () =>
          readBinaryFile(path),
        ),
      );
    }
    const plan =
      resolved.kind === 'coupled-r2'
        ? planOrdinaryCoupledBuildV1(root, supplied, request.patch, request.manifest)
        : planOrdinarySetupCustodyBuildV1(
            root,
            supplied,
            request.patch,
            request.manifest,
            resolved.request.sourceEpoch,
          );
    const mappings = ordinaryHoldModuleModesV1.map((role) => ({
      path: `${root}/${role.relative}`,
      mode: role.mode,
    }));
    assertOrdinaryCoupledPlanV1(request, plan);
    const authority: { path: string; bytes: number; sha256: string }[] = [];
    for (const relative of ['tsconfig.base.json', 'package.json', 'bun.lock'] as const) {
      const bytes = await ordinaryHoldSetupOperationV1(
        operations,
        `authority.read:${relative}`,
        () => readBinaryFile(`${root}/${relative}`),
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
      mkdtemp(join(tmpdir(), 'puni-ordinary-coupled-image-')),
    );
    retainOutputRoot(outputRoot);
    const entryPath = join(outputRoot, 'ordinary-image-entry.ts');
    const entry = plan.entrySource;
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
    assertOrdinaryHoldClosureBytesV1(
      request.closureManifest.generatedEntry,
      new TextEncoder().encode(entry),
    );
    if (process.cwd() !== request.closureManifest.compilerCwd)
      throw new Error('ordinary HOLD closure compiler cwd differs');
    await observeOrdinaryCoupledClosureV1(
      request.closureManifest,
      closureLedger,
      'before',
      entryPath,
    );
    const resolutions: OrdinaryHoldResolutionV1[] = [];
    const callbacks = new Map<string, number>();
    const loadExpectations = request.loadExpectations;
    const loadRecorder = createOrdinaryCoupledLoadRecorderV1(
      root,
      loadExpectations,
      createHash('sha256').update(JSON.stringify(loadExpectations)).digest('hex'),
    );
    retainedLoadRecorder = loadRecorder;
    retainOutputRoot(outputRoot, loadRecorder.inspect);
    const plugin: BunPlugin = {
      name: 'ordinary-coupled-v1-fixed-image',
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
            const mapped = resolveOrdinaryCoupledPortImportV1(root, source.importer, source.path);
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
            const mapping = mappings.find((entry) => entry.path === source.path);
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
          const returned = { contents, loader: 'ts' as const };
          return loadRecorder.record('ordinary-hold-v1', source.path, returned);
        });
        builder.onLoad({ filter: /.*/, namespace: 'file' }, (source) => {
          const bytes = plan.materialized.get(source.path);
          if (bytes === undefined) return undefined;
          const mapping = mappings.find((sourceMapping) => sourceMapping.path === source.path);
          if (mapping?.mode === 'external-unchanged')
            throw new Error('ordinary HOLD scanner entered bundled loader');
          callbacks.set(source.path, (callbacks.get(source.path) ?? 0) + 1);
          const returned = { contents: new Uint8Array(bytes), loader: 'ts' as const };
          return loadRecorder.record('file', source.path, returned);
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
    if (
      JSON.stringify(
        Object.entries(buildOptionsIdentity).filter(([key]) => key !== 'entrypoints'),
      ) !== JSON.stringify(Object.entries(request.buildOptions))
    )
      throw new Error('coupled pinned compiler options differ');
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
    const compilerIndex = operations.length;
    let compilerCustody:
      | {
          readonly record: OrdinaryHoldSetupRecordV1;
          readonly original: Promise<unknown>;
          readonly observer: Promise<void>;
        }
      | undefined;
    const built = await ordinaryHoldSetupOperationV1(
      operations,
      'compiler.Bun.build',
      () => {
        return Bun.build({
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
        });
      },
      96,
      (record, original, observer) => {
        compilerCustody = Object.freeze({ record, original, observer });
      },
    );
    // This continuation follows the helper's actual await of its original and observer, never a caller token.
    assertOrdinaryCoupledCompilerJoinV1(operations, compilerIndex, compilerCustody);
    const loadReceipts = loadRecorder.settle();
    await ordinaryHoldSetupOperationV1(operations, 'diagnostics.write', () =>
      writeFile(
        join(outputRoot, 'ordinary-coupled-diagnostics.json'),
        JSON.stringify({
          success: built.success,
          logs: built.logs.map((log) => ({
            name: log.name,
            message: log.message,
            position: log.position,
            level: log.level,
          })),
          metafile: built.metafile,
        }),
        { mode: 0o600 },
      ),
    );
    await observeOrdinaryCoupledClosureV1(
      request.closureManifest,
      closureLedger,
      'after',
      entryPath,
    );
    closureLedger.assertComplete();
    if (process.cwd() !== compilerCwd) throw new Error('ordinary HOLD compiler cwd changed');
    if (
      !built.success ||
      built.outputs.length !== 1 ||
      built.outputs[0]?.kind !== 'entry-point' ||
      built.metafile === undefined
    )
      throw new Error('ordinary HOLD compiler output differs');
    for (const mapping of mappings) {
      if (mapping.mode !== 'external-unchanged' && callbacks.get(mapping.path) !== 1)
        throw new Error('ordinary HOLD mapped compiler source absent or duplicated');
    }
    const meta = built.metafile;
    const inputs = Object.entries(meta.inputs);
    const normalizedInputs = inputs.map(([rawPath]) => ({
      rawPath,
      identity: identifyOrdinaryCoupledMetafilePathV1(root, compilerCwd, rawPath),
    }));
    assertOrdinaryCoupledCompilerRowsV1(
      request.prediction,
      inputs.map(([rawPath, input]) => ({
        identity:
          rawPath === entryPath
            ? 'generated:ordinary-image-entry.ts'
            : identifyOrdinaryCoupledMetafilePathV1(root, compilerCwd, rawPath) === entryPath
              ? 'generated:ordinary-image-entry.ts'
              : identifyOrdinaryCoupledMetafilePathV1(root, compilerCwd, rawPath),
        bytes: input.bytes,
      })),
    );
    const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
    if (normalizedInputs.some((input) => input.identity === scanner))
      throw new Error('ordinary HOLD scanner bundled input differs');
    for (const mapping of mappings) {
      if (mapping.mode === 'external-unchanged') continue;
      if (normalizedInputs.filter((input) => input.identity === mapping.path).length !== 1)
        throw new Error('ordinary HOLD classifier or mapped input identity differs');
    }
    const normalizedEdges = associateOrdinaryCoupledMetadataEdgesV1(
      request,
      compilerCwd,
      entryPath,
      inputs.flatMap(([rawImporter, input]) =>
        input.imports.map((edge) => ({
          rawImporter,
          rawPath: edge.path,
          kind: edge.kind,
          ...('original' in edge ? { original: edge.original } : {}),
          ...('external' in edge ? { external: edge.external } : {}),
        })),
      ),
    );
    const scannerEdges = normalizedEdges.filter((edge) => edge.identity === scanner);
    if (scannerEdges.length === 0 || scannerEdges.some((edge) => edge.external !== true))
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
      identifyOrdinaryCoupledMetafilePathV1(root, compilerCwd, entryPoint) !== entryPath
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
    const closureOperations = Object.freeze(
      closureLedger
        .inspect()
        .map((record) =>
          Object.freeze({ key: record.key, state: record.state, joined: record.joined }),
        ),
    );
    const packetProvenance = Object.freeze({
      loadExpectationsSha256: policy.pins.loadExpectations.sha256,
      closureManifestSha256: policy.pins.closureManifest.sha256,
      coverageSha256: policy.pins.coverage.sha256,
      predictionSha256: policy.pins.prediction.sha256,
    });
    assertOrdinaryCompilerPacketProvenanceV1(request.sourceEpoch, packetProvenance);
    const metadata = JSON.stringify({
      ...packetProvenance,
      closureReadLeaseAssumption: request.closureManifest.readLeaseAssumption,
      closureGeneratedEntry: { path: entryPath, ...request.closureManifest.generatedEntry },
      closureCompilerCwd: request.closureManifest.compilerCwd,
      closureOperations,
      artifact: { path: entryBundle, bytes: artifact.byteLength, sha256: sha(artifact) },
      qualification:
        'built-unqualified: compiler agreement does not grant runtime or scanner execution',
      layers: plan.layers,
      inputs: meta.inputs,
      outputs: meta.outputs,
      provenance,
      resolutions,
      normalizedInputs,
      normalizedEdges,
      loadReceipts,
    });
    if (Buffer.byteLength(metadata) > 4 * 1024 * 1024)
      throw new Error('ordinary HOLD compiler metadata outside bound');
    await ordinaryHoldSetupOperationV1(operations, 'metadata.write', () =>
      writeFile(join(outputRoot, 'ordinary-image-metafile.json'), metadata, {
        mode: 0o600,
      }),
    );
    assertOrdinaryCoupledSetupCensusV1(operations);
    const imageDigest = createHash('sha256').update(JSON.stringify(plan.layers)).digest('hex');
    const receipt = {
      ...packetProvenance,
      version: 1 as const,
      status: 'built-unqualified' as const,
      imageDigest,
      titleDigest: ordinaryHoldTitleDigestV1,
      entryPath: entryBundle,
      entrySha256: createHash('sha256').update(artifact).digest('hex'),
      metafileDigest: createHash('sha256').update(metadata).digest('hex'),
      sourceObservations: ordinaryHoldSourceEpochV1.pins.map((pin) => ({
        path: `${root}/${pin.relative}`,
        bytes: pin.bytes,
        sha256: pin.sha256,
      })),
      appliedCuts: plan.appliedCuts,
      loadReceipts,
      resolutions: Object.freeze(resolutions),
      closureOperations,
      closureReadLeaseAssumption: request.closureManifest.readLeaseAssumption,
      setupOperations: Object.freeze(operations.map((record) => Object.freeze({ ...record }))),
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
    };
    return resolved.kind === 'coupled-r2'
      ? Object.freeze({
          ...receipt,
          format: resolved.policy.builtFormat,
          sourceEpoch: resolved.request.sourceEpoch,
        })
      : Object.freeze({
          ...receipt,
          format: resolved.policy.builtFormat,
          sourceEpoch: resolved.request.sourceEpoch,
        });
  } finally {
    if (operations.every(hasKnownOrdinaryHoldSetupOutcomeV1) && closureLedger.hasKnownOutcomes())
      clearInterval(keeper);
  }
}

/** Separate prospective source identity; no compiler authority is issued by planning it. */
export const ordinarySetupCustodySourceEpochV1 = 'ordinary-uc2-coupled-setup-v1' as const;

/**
 * Conservative two-known-case recipe bounds, not observed call counts or all39HOLD capacity.
 * Three modes walks: startup lstat946/chmod1564/readdir621 include bounded Git contents.
 * Git must use the reviewed empty template/config recipe and pinned executable; the helper
 * must inherit verified soft=hard NOFILE1024 with no inherited descriptor at or above it.
 * Complete metadata preflights are bounded by six admitted collectors plus the first refusal.
 * Non-traversal startup mkdir6/mkdtemp1/write12/symlink1 follows the four-tier seed.
 * Database cp2/mkdtemp1/write11/mkdir3/chmod4 follows the two DBs and four tier inputs.
 * Frontend read/mkdir/write18 and symlink1 follow the fixed profile roster.
 * Participant mkdir2/write2/read1 follows the prod-only restoration fixture.
 * Namespace mkdir10/stat4/link4/write8+2 follows two roots and four destinations.
 * Complete cp1/mkdir3/rename1/write19 and two Bun writes follow the manifest recipe;
 * seven metadata preflights contribute lstat56/readdir7 and adaptation contributes read21.
 * The two synchronous migrations retain their separate existing native migration ledger.
 * Full derivation: openspec/changes/cross-project-dependencies/ordinary-setup-custody-design-20261107.md.
 * Zero means outside this fixed recipe, including retained-root deletion and fault-only writes.
 */
export const ordinarySetupCustodyLimitsV1 = Object.freeze({
  'setup.participant.chmod': 0,
  'setup.participant.cp': 0,
  'setup.participant.lstat': 0,
  'setup.participant.mkdir': 2,
  'setup.participant.mkdtemp': 0,
  'setup.participant.readdir': 0,
  'setup.participant.symlink': 0,
  'setup.participant.writeFile': 2,
  'setup.participant.readFile': 1,
  'setup.participant.rename': 0,
  'setup.participant.stat': 0,
  'setup.participant.link': 0,
  'setup.participant.rm': 0,
  'setup.complete.chmod': 0,
  'setup.complete.cp': 1,
  'setup.complete.lstat': 56,
  'setup.complete.mkdir': 3,
  'setup.complete.mkdtemp': 0,
  'setup.complete.readdir': 7,
  'setup.complete.symlink': 0,
  'setup.complete.writeFile': 19,
  'setup.complete.readFile': 21,
  'setup.complete.rename': 1,
  'setup.complete.stat': 7168, // 7 metadata preflights * helper NOFILE1024
  'setup.complete.link': 0,
  'setup.complete.rm': 0,
  'setup.startup.chmod': 1564,
  'setup.startup.cp': 0,
  'setup.startup.lstat': 946,
  'setup.startup.mkdir': 6,
  'setup.startup.mkdtemp': 1,
  'setup.startup.readdir': 621,
  'setup.startup.symlink': 1,
  'setup.startup.writeFile': 12,
  'setup.startup.readFile': 0,
  'setup.startup.rename': 0,
  'setup.startup.stat': 0,
  'setup.startup.link': 0,
  'setup.startup.rm': 0,
  'setup.database.chmod': 4,
  'setup.database.cp': 2,
  'setup.database.lstat': 0,
  'setup.database.mkdir': 3,
  'setup.database.mkdtemp': 1,
  'setup.database.readdir': 0,
  'setup.database.symlink': 0,
  'setup.database.writeFile': 11,
  'setup.database.readFile': 0,
  'setup.database.rename': 0,
  'setup.database.stat': 0,
  'setup.database.link': 0,
  'setup.database.rm': 0,
  'setup.frontend.chmod': 0,
  'setup.frontend.cp': 0,
  'setup.frontend.lstat': 0,
  'setup.frontend.mkdir': 18,
  'setup.frontend.mkdtemp': 0,
  'setup.frontend.readdir': 0,
  'setup.frontend.symlink': 1,
  'setup.frontend.writeFile': 18,
  'setup.frontend.readFile': 18,
  'setup.frontend.rename': 0,
  'setup.frontend.stat': 0,
  'setup.frontend.link': 0,
  'setup.frontend.rm': 0,
  'setup.namespace.chmod': 0,
  'setup.namespace.cp': 0,
  'setup.namespace.lstat': 0,
  'setup.namespace.mkdir': 10,
  'setup.namespace.mkdtemp': 0,
  'setup.namespace.readdir': 0,
  'setup.namespace.symlink': 0,
  'setup.namespace.writeFile': 0,
  'setup.namespace.readFile': 0,
  'setup.namespace.rename': 0,
  'setup.namespace.stat': 4,
  'setup.namespace.link': 4,
  'setup.namespace.rm': 0,
  'complete.write.prod': 1,
  'complete.write.dev': 1,
  'namespace.write.0': 0,
  'namespace.write.1': 8,
  'namespace.write.2': 0,
  'namespace.write.3': 2,
  'namespace.write.4': 0,
  'setup.runMigrations': 2,
});
/** One setup reservation record is its event; no duplicate setup event stream consumes core8192. */
export const ordinarySetupCustodyTotalV1 = Object.values(
  ordinarySetupCustodyLimitsV1,
).reduce<number>((total, maximum) => total + maximum, 0);

export interface OrdinarySetupCustodyBuildPlanV1 extends Omit<
  OrdinaryCoupledBuildPlanV1,
  'sourceEpoch'
> {
  readonly sourceEpoch: typeof ordinarySetupCustodySourceEpochV1;
}

/** Validates the explicit prospective epoch before the unchanged in-memory production overlay. */
export function planOrdinarySetupCustodyBuildV1(
  sourceRoot: string,
  supplied: ReadonlyMap<string, Uint8Array>,
  rawPatch: Uint8Array,
  rawManifest: Uint8Array,
  sourceEpoch: unknown,
): OrdinarySetupCustodyBuildPlanV1 {
  // Proof: omitting the epoch guard admitted a wrong epoch with valid inputs; SC1 prospective planner failed (0/1/0).
  if (sourceEpoch !== ordinarySetupCustodySourceEpochV1)
    throw new Error('setup custody source epoch differs');
  const plan = planOrdinaryCoupledBuildV1(sourceRoot, supplied, rawPatch, rawManifest);
  return Object.freeze({
    ...plan,
    sourceEpoch: ordinarySetupCustodySourceEpochV1,
    portSources: ordinarySetupCustodyPortSourcesV1(sourceRoot),
  });
}

/** Generates a new packet expectation while retaining the historical bootstrap byte for byte. */
export function ordinarySetupCustodyBootstrapSourceV1(imagePath: string, caseId: unknown): string {
  return ordinaryKnownBootstrapSourceV1(imagePath, caseId).replaceAll(
    ordinaryCoupledSourceEpochV1,
    ordinarySetupCustodySourceEpochV1,
  );
}

/** Keeps setup reservations in a finite strong ledger, apart from core Promise and event capacities. */
function ordinarySetupCustodyLedgerExtensionV1(): string {
  return `
const setupLimits=Object.freeze(${JSON.stringify(ordinarySetupCustodyLimitsV1)});
type SetupBoundary=keyof typeof setupLimits;
type SetupRecord=OperationRecord & {provider:(...args:never[])=>unknown;originalOutcome?:PromiseSettledResult<unknown>;observerOutcome?:PromiseSettledResult<unknown>};
const setupRecords:SetupRecord[]=[];
// Proof: omitting the record snapshot freeze failed SC1 original identity; this proves record immutability, not deep freezing of original values (0/1/0).
export function inspectSetupLedger(){return Object.freeze({limits:setupLimits,total:${String(ordinarySetupCustodyTotalV1)},records:Object.freeze(setupRecords.map(record=>Object.freeze({...snapshot(record),originalOutcome:record.originalOutcome===undefined?undefined:Object.freeze({...record.originalOutcome}),observerOutcome:record.observerOutcome===undefined?undefined:Object.freeze({...record.observerOutcome})})))});}
function reserveSetupOperation(label:string,kind:'sync'|'promise',provider:(...args:never[])=>unknown,receiver:unknown,args:readonly unknown[]){
 // Proof: omitting closed-key admission entered an unknown-label sentinel; SC1 closed labels failed (0/1/0).
 if(!Object.hasOwn(setupLimits,label))fail('ordinary setup boundary differs');
 // Proof: omitting STOP admission entered a finite provider after kind refusal; SC1 STOP and fixed kinds failed (0/1/0).
 if(custody.stopped)fail('ordinary setup acquisition stopped');
 // Object.hasOwn above establishes this closed key; callers cannot select a bucket or capacity.
 const boundary=label as SetupBoundary;
 // Proof: omitting kind admission entered the Promise provider under the sync migration label; SC1 STOP and fixed kinds failed (0/1/0).
 if(kind!==(boundary==='setup.runMigrations'?'sync':'promise'))fail('ordinary setup kind differs');
 // Proof: omitting this bound entered the zero-cap boundary sentinel; SC1 boundary caps failed (0/1/0); the same consumer exhausts all86 exact limits.
 if(setupRecords.filter(record=>record.label===boundary).length>=setupLimits[boundary])fail('ordinary setup boundary cap exceeded');
 const record:SetupRecord={family:'operation',label:boundary,kind,receiver,args:Object.freeze([...args]),provider,phase:'entered',returned:undefined,original:undefined,observer:undefined,observerSettled:false,joined:false,cause:undefined};
 // Proof: omitting strong reservation failed the provider's pre-entry record census; SC1 original identity failed (0/1/0).
 setupRecords.push(record);return record;
}
export function invokeSetupSync<Returned>(label:string,provider:(...args:never[])=>Returned,receiver:unknown,args:readonly unknown[]):Returned{
 const record=reserveSetupOperation(label,'sync',provider,receiver,args);
 try{const returned=Reflect.apply(provider,receiver,args);record.returned=returned;record.phase='returned';return returned;}
 catch(cause){record.cause=cause;record.phase='unknown';custody.stopped=true;custody.failures.push(cause);throw cause;}
}
export function invokeSetupPromise<Returned extends Promise<unknown>>(label:string,provider:(...args:never[])=>Returned,receiver:unknown,args:readonly unknown[]):Returned{
 const record=reserveSetupOperation(label,'promise',provider,receiver,args);
 try{
  const original=Reflect.apply(provider,receiver,args);record.returned=original;record.original=original;record.phase='pending';
  record.observer=original.then((value:unknown)=>{record.value=value;record.phase='fulfilled';record.observerSettled=true;},(cause:unknown)=>{record.cause=cause;record.phase='rejected';record.observerSettled=true;});
  // Proof: returning a then-projection failed SC1 original identity (0/1/0).
  return original;
 }catch(cause){record.cause=cause;record.phase='unknown';custody.stopped=true;custody.failures.push(cause);throw cause;}
}
export async function joinSetupOperations(){
 for(const record of setupRecords){
  // Proof: omitting returned-phase admission joined a thrown sync original; SC1 synchronous setup failure failed (0/1/0).
  if(record.kind==='sync'){if(record.phase!=='returned')fail('ordinary setup sync observation incomplete');record.joined=true;continue;}
  // Proof: suppressing observer storage left a genuine original without its observer; SC1 finite setup traversals failed and restoration passed (0/1/0).
  if(record.original===undefined||record.observer===undefined)fail('ordinary setup original observation absent');
  // The intrinsic observes the actual Promise even if the separate observer attachment was faulty.
  // Proof: replacing this join with a resolved acknowledgement completed before a deferred original; SC1 observer fulfillment alone failed (0/1/0).
  // Explicit call generics body-check both settled-result callbacks against the Promise intrinsic; no assertion replaces that check.
  const originalJoin:Promise<PromiseSettledResult<unknown>>=Promise.prototype.then.call<Promise<unknown>,[(value:unknown)=>PromiseFulfilledResult<unknown>,(reason:unknown)=>PromiseRejectedResult],Promise<PromiseSettledResult<unknown>>>(record.original,(value:unknown)=>({status:'fulfilled' as const,value}),(reason:unknown)=>({status:'rejected' as const,reason}));
  const [originalOutcome,observerOutcomes]=await Promise.all([originalJoin,Promise.allSettled([record.observer])]);
  record.originalOutcome=originalOutcome;record.observerOutcome=observerOutcomes[0];
  // Proof: omitting this combined completion predicate admitted an independently rejected observer; SC1 independent observer rejection failed (0/1/0). Individual conjunct omissions are not claimed.
  if(record.observerOutcome.status!=='fulfilled'||!record.observerSettled||!['fulfilled','rejected'].includes(record.phase))fail('ordinary setup original observation incomplete');
  record.joined=true;
 }
}
function reserveOwnedIntervalClear(kind:'sync'|'promise',receiver:unknown,args:readonly unknown[]){
 const intervals=custody.operations.filter(record=>record.label==='owner.interval');
 // Proof: omitting this combined binding admitted an unrelated interval; SC1 production interval first clear failed (0/1/0). Individual conjunct omissions are not claimed.
 if(kind!=='sync'||receiver!==undefined||args.length!==1||intervals.length!==1||intervals[0].phase!=='returned'||args[0]!==intervals[0].returned||custody.operations.some(record=>record.label==='owner.clear'))fail('ordinary owned interval clear differs');
 const record:OperationRecord={family:'operation',label:'owner.clear',kind,receiver,args:Object.freeze([...args]),phase:'entered',returned:undefined,original:undefined,observer:undefined,observerSettled:false,joined:false,cause:undefined};
 const ticket=createTicket(record);
 // createTicket synchronously assigned this ticket before insertion; only the internal bookkeeping is refined.
 custody.operations.push(record as ReservedOperationRecord);return ticket;
}
`;
}

/** Reuses fixed historical ports, changing only the closed setup forwarding, known join, and epoch. */
export function ordinarySetupCustodyPortSourcesV1(sourceRoot: string): ReadonlyMap<string, string> {
  const ports = new Map(ordinaryCoupledPortSourcesV1(sourceRoot));
  for (const [specifier, source] of ports) {
    if (specifier === 'ordinary-hold-v1:ledger') {
      // Proof: removing only the clear dispatcher failed first cleanup after STOP; removing only the setup/core exclusion admitted a setup label through the core bucket (separate SC1 triplets0/1/0).
      let ledger = replaceOnce(
        source,
        "export function reserveOperation(label:string,kind:'sync'|'promise',receiver:unknown,args:readonly unknown[]){",
        "export function reserveOperation(label:string,kind:'sync'|'promise',receiver:unknown,args:readonly unknown[]){\n if(label==='owner.clear')return reserveOwnedIntervalClear(kind,receiver,args);\n if(Object.hasOwn(setupLimits,label))fail('ordinary HOLD operation boundary differs');",
      );
      ledger = replaceOnce(
        ledger,
        'export function inspectKnownComposition(){return Object.freeze({failures:',
        'export function inspectKnownComposition(){return Object.freeze({setup:inspectSetupLedger(),failures:',
      );
      ledger = replaceOnce(
        ledger,
        ' const settled=await Promise.allSettled(pending);',
        ' // Proof: omitting this genuine setup join completed the inert known case before a deferred original; SC1 known composition join failed (0/1/0).\n await joinSetupOperations();\n const settled=await Promise.allSettled(pending);',
      );
      ports.set(specifier, ledger + ordinarySetupCustodyLedgerExtensionV1());
    } else if (specifier === 'ordinary-hold-v1:controller') {
      ports.set(
        specifier,
        source.replaceAll(ordinaryCoupledSourceEpochV1, ordinarySetupCustodySourceEpochV1),
      );
    } else if (specifier === 'ordinary-hold-v1:migration-call') {
      const forwarded = replaceOnce(
        source,
        "const invoke=<Fn extends (...args:never[])=>unknown>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>{const record=reserveOperation(label,'sync',receiver,args);try{return returnOperation(record,Reflect.apply(original,receiver,args) as ReturnType<Fn>);}catch(cause){throwOperation(record,cause);throw cause;}};",
        '// The canonical provider and unchanged tuple fix this exact return ABI.\nconst invoke=<Fn extends (...args:never[])=>unknown>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>invokeSetupSync(label,original,receiver,args) as ReturnType<Fn>;',
      );
      ports.set(
        specifier,
        forwarded.replace('import {inspectLedger,', 'import {invokeSetupSync,inspectLedger,'),
      );
    } else if (
      [
        'ordinary-hold-v1:setup-participant-fs',
        'ordinary-hold-v1:setup-complete-fs',
        'ordinary-hold-v1:setup-startup-fs',
        'ordinary-hold-v1:setup-database-fs',
        'ordinary-hold-v1:setup-frontend-fs',
        'ordinary-hold-v1:setup-namespace-fs',
        'ordinary-hold-v1:setup-complete-write',
        'ordinary-hold-v1:setup-namespace-write',
      ].includes(specifier)
    ) {
      let forwarded = replaceOnce(
        source,
        "const invoke=<Fn extends (...args:never[])=>Promise<unknown>>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>{const record=reserveOperation(label,'promise',receiver,args);try{return attachPromise(record,Reflect.apply(original,receiver,args) as ReturnType<Fn>);}catch(cause){throwOperation(record,cause);throw cause;}};",
        'const invoke=<Fn extends (...args:never[])=>Promise<unknown>>(label:string,original:Fn,receiver:unknown,args:Parameters<Fn>):ReturnType<Fn>=>invokeSetupPromise(label,original,receiver,args) as ReturnType<Fn>;',
      );
      forwarded = forwarded.replace(
        'import {inspectLedger,',
        'import {invokeSetupPromise,inspectLedger,',
      );
      ports.set(specifier, forwarded);
    }
  }
  return ports;
}
