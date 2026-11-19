import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

import {readBuildRuntime,runBuildOperation} from '@puni/burokrat/packaging';

import {prepareSourceTestLevels} from './prepare-source-test-levels';

/**
 * Fixed workspace Nx prerequisite. It provisions current edited source through the ordinary
 * package/installation owners, then publishes the explicit ignored source-selection transport.
 * No argv launch operand, global PUNI, implicit package download or build/test task is selected.
 * Native outputs and partial roots belong to this operation until its returned exit status.
 */
export async function prepareTestLevelAssets():Promise<number>{
  const repository=resolve(import.meta.dir,'../../../../..'),environment={...process.env};
  const temporaryDirectory=tmpdir();
  return await runBuildOperation(async execution=>{
    const path=environment['PATH'];if(path===undefined)throw new Error('local test-level provisioning requires trusted executable PATH');
    const lookup=readBuildRuntime(path,repository);
    const selection=await prepareSourceTestLevels({repository,installationDirectory:repository},{callerDirectory:repository,runtime:lookup,temporaryDirectory,environment,subscribeInterrupts:execution.subscribeInterrupts});
    const written=await execution.outputs.reportDiagnostic(Buffer.from(selection.kind==='ready'
      ?'PUNI source test-level selection ready: '+selection.path+'; retained assets: '+selection.namespace+'\n'
      :'PUNI source test-level provisioning cancelled; retained: '+selection.ownedDirectories.join(', ')+'\n'));
    if(written.kind==='abandoned')return 1;
    return selection.kind==='ready'?0:selection.status;
  });
}

if(import.meta.main){
  if(process.argv.length!==2)throw new Error('local test-level provisioning takes no command operands');
  process.exit(await prepareTestLevelAssets());
}
