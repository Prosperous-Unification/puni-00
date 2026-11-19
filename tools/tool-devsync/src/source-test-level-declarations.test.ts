import {expect,it} from 'bun:test';

import * as declarations from './test-levels';
import {assertBrowserAggregateMembers,readManifest} from './test-levels';

const dependency=[{target:'prepare-test-level-assets',projects:['puni-cli'],params:'ignore' as const}];
/** Prospective JSON is external to the existing declaration type; call the actual boundary without a cast. */
function assertBrowserDeclarations(manifests:ReadonlyMap<string,unknown>):void{
  Reflect.apply(assertBrowserAggregateMembers,undefined,[manifests]);
}
function target(words:string){
  return{executor:'nx:run-commands',cache:false,dependsOn:dependency,options:{
    command:'bun --no-env-file --config=/dev/null apps/puni/cli/src/entrypoint.ts dash '+words+' --repository .',
    envFile:'tmp/puni-source-test-level.env',env:{PUNI_TEST_LEVEL_ROLE:'source'},forwardAllArgs:false,
  }};
}
async function currentSourceDeclarations(){
  const frontend=await readManifest('apps/wbs/fe-01'),core=await readManifest('libs/wbs/application/core'),puni=await readManifest('apps/puni/cli');
  const sourceFrontend={...frontend,targets:{...frontend.targets,
    'test:performance:level':target('performance'),'test:browser:ordinary:level':target('browser ordinary'),'test:browser:packaged:level':target('browser packaged')}};
  const sourceCore={...core,targets:{...core.targets,'test:browser:portable:level':target('browser portable')}};
  const sourcePuni={...puni,targets:{...puni.targets,'prepare-test-level-assets':{executor:'nx:run-commands',cache:false,options:{
    command:'bun --no-env-file --config=/dev/null apps/puni/cli/src/packaging/prepare-test-level-assets-cli.ts',forwardAllArgs:false,
  }}}};
  return{frontend:sourceFrontend,core:sourceCore,puni:sourcePuni,manifests:new Map<string,unknown>([['apps/wbs/fe-01',sourceFrontend],['libs/wbs/application/core',sourceCore]])};
}
function requireProvisioningVerifier(){
  const verify:unknown=Reflect.get(declarations,'assertSourceTestLevelProvisioning');expect(typeof verify).toBe('function');
  if(typeof verify!=='function')throw new Error('required source test-level provisioning verifier is absent');
  return(frontend:unknown,puni:unknown)=>Reflect.apply(verify,undefined,[frontend,puni]);
}

it('declares all three actual Browser aggregate members through the selected source root',async()=>{
  const current=await currentSourceDeclarations();expect(()=>assertBrowserDeclarations(current.manifests)).not.toThrow();
});

it('refuses source Browser members without the explicit ignored selection or prerequisite',async()=>{
  const current=await currentSourceDeclarations();expect(()=>assertBrowserDeclarations(current.manifests)).not.toThrow();
  const healthy=current.core.targets['test:browser:portable:level'];if(healthy===undefined)throw new Error('actual portable declaration absent');
  const missingTransport={...healthy,options:{...healthy.options,envFile:undefined}};
  for(const corrupted of [{...healthy,dependsOn:[]},missingTransport,{...healthy,cache:true},{...healthy,options:{...healthy.options,forwardAllArgs:true}},{...healthy,options:{...healthy.options,env:{PUNI_TEST_LEVEL_ROLE:'installed'}}}]){
    const changed=new Map(current.manifests);changed.set('libs/wbs/application/core',{...current.core,targets:{...current.core.targets,'test:browser:portable:level':corrupted}});
    expect(()=>assertBrowserDeclarations(changed)).toThrow('wbs-core:test:browser:portable:level differs from declaration');
  }
});

it('declares Performance and the uncached no-forwarding PUNI prerequisite without a build cycle',async()=>{
  const current=await currentSourceDeclarations();expect(()=>assertBrowserDeclarations(current.manifests)).not.toThrow();
  const verify=requireProvisioningVerifier();expect(()=>verify(current.frontend,current.puni)).not.toThrow();
  const prepare=current.puni.targets['prepare-test-level-assets'];if(prepare===undefined)throw new Error('actual prerequisite absent');
  for(const corrupted of [{...prepare,dependsOn:['build']},{...prepare,cache:true},{...prepare,options:{...prepare.options,forwardAllArgs:true}},{...prepare,options:{...prepare.options,command:'bun source-forwarding-runner.ts'}}])
    expect(()=>verify(current.frontend,{...current.puni,targets:{...current.puni.targets,'prepare-test-level-assets':corrupted}})).toThrow('puni-cli:prepare-test-level-assets differs');
  expect(()=>verify({...current.frontend,targets:{...current.frontend.targets,'test:performance:level':{...target('performance'),dependsOn:[]}}},current.puni)).toThrow('wbs-fe-01:test:performance:level differs');
});
