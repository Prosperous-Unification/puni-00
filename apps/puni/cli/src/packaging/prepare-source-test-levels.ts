import {createHash,randomUUID} from 'node:crypto';
import {lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,sep} from 'node:path';

import {readBuildFile,runInstallChild} from '@puni/burokrat/packaging';
import {readInstalledTestLevelAssets,verifySourceTestLevelRoot} from '@puni/burokrat/test-levels';

import type {Context as CommandContext} from '../execute-command';
import {buildWorkingPackage} from './build';
import {runInstallPuni} from './install';
import {verifyPuniSelection} from './selection';
import {createSourceTestLevelSelection} from './source-test-level-selection';
import {packageVersion} from '../version';

type BuildContext=Parameters<typeof buildWorkingPackage>[1];
interface Context extends BuildContext{
  readonly temporaryDirectory:string;
  readonly environment:CommandContext['environment'];
}
interface Request{
  readonly repository:string;
  readonly installationDirectory:string;
}
function hashBytes(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
function isWithin(root:string,path:string):boolean{
  const offset=relative(root,path);
  return offset===''||(offset!=='..'&&!offset.startsWith('..'+sep)&&!isAbsolute(offset));
}

/**
 * Provision one local development selection through the existing working-source assembler,
 * owned Bun pack and actual PUNI installer. The freshly verified package supplies the installer's
 * controller assets; no global PUNI or clean commit is required. Every acquired external root is
 * retained and reported on failure/cancellation. The fixed ignored Nx dotenv file carries only
 * an explicit byte-preserving selection; each actual source main independently re-verifies it.
 * No build/test dependency is invoked here, so the four consuming Nx targets cannot cycle back.
 */
export async function prepareSourceTestLevels(request:Request,context:Context){
  const selected={...request},captured={...context,runtime:{...context.runtime,environment:{...context.runtime.environment}},environment:{...context.environment}};
  let first:'SIGINT'|'SIGTERM'|undefined;
  const unsubscribe=captured.subscribeInterrupts(signal=>{first??=signal;});
  const cancellation=()=>first===undefined?undefined:first==='SIGINT'?130 as const:143 as const;
  let namespace:string|undefined;
  const cancelled=(status:130|143)=>({kind:'cancelled' as const,status,ownedDirectories:namespace===undefined?[]:[namespace]});
  async function produce(){
    const prior=cancellation();if(prior!==undefined)return cancelled(prior);
    const repository=realpathSync.native(selected.repository),temporary=realpathSync.native(captured.temporaryDirectory);
    namespace=mkdtempSync(join(temporary,'puni-source-test-levels-'));
    if(isWithin(repository,namespace)||isWithin(namespace,repository))throw new Error('local test-level acquired namespace overlaps source root');
    const acquired=namespace,work=join(acquired,'build'),destination=join(acquired,'package');
    const built=await buildWorkingPackage({repository,installationDirectory:selected.installationDirectory,work,destination},captured);
    if(built.kind==='cancelled'){
      const status=cancellation();if(status===undefined)throw new Error('local test-level build stopped without owning cancellation');
      return cancelled(status);
    }
    const beforePack=cancellation();if(beforePack!==undefined)return cancelled(beforePack);
    const packed=join(acquired,'packed');mkdirSync(packed,{mode:0o700});
    const packErrors:Uint8Array[]=[];
    const pack=await runInstallChild({argv:[process.execPath,'--no-env-file','--config=/dev/null','pm','pack','--ignore-scripts','--gzip-level','1','--destination',packed,'--quiet'],
      directory:destination,environment:{...captured.runtime.environment},stdout:()=>({kind:'written'}),stderr:bytes=>{packErrors.push(bytes.slice());return{kind:'written'};},subscribeInterrupts:captured.subscribeInterrupts});
    if(pack.kind==='cancelled'){
      const status=cancellation();if(status===undefined)throw new Error('local test-level pack stopped without owning cancellation');
      return cancelled(status);
    }
    if(pack.status!==0)throw new Error('local test-level package pack failed with status '+String(pack.status),{cause:new Error(Buffer.concat(packErrors).toString('utf8'))});
    const archive=join(packed,'puni-'+packageVersion+'.tgz'),archiveSha256=hashBytes(readBuildFile(archive));
    const beforeInstall=cancellation();if(beforeInstall!==undefined)return cancelled(beforeInstall);
    const installation=join(acquired,'installation'),entrypoint=join(destination,'dist/puni.mjs');
    const installed=await runInstallPuni({command:'install-puni',archive,sha256:archiveSha256,destination:installation},{
      installation:{directory:dirname(entrypoint),entrypoint},lookup:{directory:captured.runtime.directory,path:captured.runtime.environment['PATH']},
      callerDirectory:repository,runtime:process.execPath,temporaryDirectory:temporary,environment:captured.environment,
      stdout:bytes=>{process.stdout.write(bytes);},stderr:bytes=>{process.stderr.write(bytes);},
    });
    if(installed!==0){
      const status=cancellation();if(status===installed)return cancelled(status);
      throw new Error('local test-level package installation failed with status '+String(installed));
    }
    const record=readFileSync(join(installation,'puni-selection.json')),recordSha256=hashBytes(record);
    const admitted=await verifyPuniSelection(record,recordSha256,installation);
    if(admitted.record.schemaVersion!==2||admitted.record.sourceSelection.kind!=='working')throw new Error('local test-level selection is not an explicit working capture');
    const delivered=readInstalledTestLevelAssets(dirname(admitted.entrypoint));
    const current=await verifySourceTestLevelRoot({sourceRoot:repository,entrypoint:join(repository,'apps/puni/cli/src/entrypoint.ts'),manifest:delivered.sourceRoot},{runtime:captured.runtime,subscribeInterrupts:captured.subscribeInterrupts});
    if(current.kind==='cancelled'){const status=cancellation();if(status===undefined)throw new Error('local source verification stopped without owning cancellation');return cancelled(status);}
    const transport=createSourceTestLevelSelection({record,recordSha256,installationDirectory:installation,executable:admitted.entrypoint,sourceRoot:repository});
    const beforePublication=cancellation();if(beforePublication!==undefined)return cancelled(beforePublication);
    const ignored=await runInstallChild({argv:['git','-C',repository,'check-ignore','--no-index','--','tmp/puni-source-test-level.env'],directory:captured.runtime.directory,environment:{...captured.runtime.environment},stdout:()=>({kind:'written'}),stderr:()=>({kind:'written'}),subscribeInterrupts:captured.subscribeInterrupts});
    if(ignored.kind==='cancelled'){const status=cancellation();if(status===undefined)throw new Error('local source handoff ignore probe stopped without owning cancellation');return cancelled(status);}
    if(ignored.status!==0)throw new Error('local test-level handoff must be ignored by the actual source repository');
    const afterIgnore=cancellation();if(afterIgnore!==undefined)return cancelled(afterIgnore);
    const handoffDirectory=join(repository,'tmp');mkdirSync(handoffDirectory,{recursive:true,mode:0o700});
    if(!lstatSync(handoffDirectory).isDirectory()||realpathSync.native(handoffDirectory)!==handoffDirectory)throw new Error('local test-level selection directory is not the actual source tmp directory');
    const path=join(handoffDirectory,'puni-source-test-level.env'),staged=join(handoffDirectory,'puni-source-test-level.'+String(process.pid)+'.'+randomUUID()+'.env');
    const bytes=Buffer.from('PUNI_TEST_LEVEL_ROLE=source\nPUNI_SOURCE_TEST_LEVEL_SELECTION='+transport+'\n');
    writeFileSync(staged,bytes,{flag:'wx',mode:0o600});
    if(!readFileSync(staged).equals(bytes))throw new Error('local test-level selection readback differs');
    const beforeRename=cancellation();if(beforeRename!==undefined)return cancelled(beforeRename);
    renameSync(staged,path);
    if(!readFileSync(path).equals(bytes))throw new Error('published local test-level selection differs');
    return{kind:'ready' as const,namespace:acquired,path,sourceSelection:admitted.record.sourceSelection};
  }
  const settled=await produce().then(value=>({ok:true as const,value}),cause=>({ok:false as const,cause}));
  let release:{cause:unknown}|undefined;try{unsubscribe();}catch(cause){release={cause};}
  if(!settled.ok||release!==undefined){
    const causes:unknown[]=[];if(!settled.ok)causes.push(settled.cause);if(release!==undefined)causes.push(release.cause);
    throw new AggregateError(causes,'local test-level provisioning failed'+(namespace===undefined?'':'; retained '+namespace));
  }
  const status=cancellation();return status===undefined?settled.value:cancelled(status);
}
