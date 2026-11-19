import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {expect,test} from 'bun:test';

import {hashBytes,serializeCanonical} from '../evidence/content-manifest';
import {bunToolkitRoles,planBunToolkit} from './bun-release';
import * as toolkit from './toolkit';
import {hashTrustedModules} from './trusted-modules';

type SourceSelection=
 |{readonly kind:'committed';readonly revision:string;readonly tree:string}
 |{readonly kind:'working';readonly base:string;readonly identity:string};
const base='a'.repeat(40);
const selections:readonly SourceSelection[]=[{kind:'committed',revision:base,tree:'b'.repeat(40)},{kind:'working',base,identity:'c'.repeat(64)}];

/** Real descriptor/role/closure bytes establish historical toolkit2 first; no fixture identity is release provenance. */
function withinToolkit(selection:SourceSelection,exercise:(fixture:{directory:string;descriptor:Record<string,unknown>;write:(descriptor:unknown)=>void})=>void){
  const directory=mkdtempSync(join(tmpdir(),'puni selected toolkit '));let primary:{cause:unknown}|undefined;
  try{
    const closure=join(directory,'trusted-node-modules');mkdirSync(closure);writeFileSync(join(closure,'actual-fixture.d.ts'),'export {};\n');
    const roleBytes={
      'launcher.mjs':Buffer.from('actual fixture launcher\n'),'snapshotter.ts':Buffer.from('actual fixture snapshotter\n'),
      'validator.mjs':Buffer.from('actual fixture validator\n'),'prepare-activation.mjs':Buffer.from('actual fixture preparation\n'),
      'prepare-relocation-activation.mjs':Buffer.from('actual fixture relocation\n'),
    };
    const previous=planBunToolkit({tag:'puni-v0.3.0',sourceRevision:base,bunVersion:Bun.version,roleBytes,trustedNodeModules:['actual-fixture'],trustedNodeModulesIdentity:hashTrustedModules(closure)});
    for(const role of bunToolkitRoles)writeFileSync(join(directory,role),roleBytes[role]);
    const path=join(directory,'toolkit.json'),write=(descriptor:unknown)=>writeFileSync(path,serializeCanonical(descriptor));
    writeFileSync(path,previous.descriptor);
    expect(toolkit.readBunToolkit(directory)).toMatchObject({schemaVersion:2,sourceRevision:base,digest:hashBytes(previous.descriptor)});
    expect(readFileSync(path)).toEqual(Buffer.from(previous.descriptor));
    const parsed:unknown=JSON.parse(Buffer.from(previous.descriptor).toString('utf8'));
    if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('actual historical toolkit descriptor malformed');
    const descriptor={...parsed,schemaVersion:3,tag:'puni-v0.4.0',sourceSelection:selection};
    write(descriptor);exercise({directory,descriptor,write});
  }catch(cause:unknown){primary={cause};}
  try{rmSync(directory,{recursive:true});}catch(cleanup:unknown){
    if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'selected toolkit owner and namespace cleanup failed',{cause:cleanup});
    throw cleanup;
  }
  if(primary!==undefined)throw primary.cause;
}

function readSelected(directory:string,selection:SourceSelection):unknown{
  const reader:unknown=Reflect.get(toolkit,'readSelectedBunToolkit');expect(typeof reader).toBe('function');
  if(typeof reader!=='function')throw new Error('required readSelectedBunToolkit is absent');
  return Reflect.apply(reader,undefined,[directory,selection]);
}
function requireCommittedReader(){
  const reader:unknown=Reflect.get(toolkit,'readCommittedBunToolkit');expect(typeof reader).toBe('function');
  if(typeof reader!=='function')throw new Error('required readCommittedBunToolkit is absent');
  return(directory:string):unknown=>Reflect.apply(reader,undefined,[directory]);
}

for(const selection of selections){
 test('toolkit3 preserves explicit '+selection.kind+' source identity and separates runtime from committed admission',()=>{
  withinToolkit(selection,({directory,descriptor})=>{
    const bytes=readFileSync(join(directory,'toolkit.json'));
    // Actual current parser rejection is the first feature boundary, after historical bytes/roles/closure passed.
    expect(toolkit.verifyToolkit(directory)).toMatchObject({schemaVersion:3,sourceRevision:base,sourceSelection:selection,digest:hashBytes(bytes)});
    expect(readSelected(directory,selection)).toMatchObject({schemaVersion:3,sourceSelection:selection});
    const readCommitted=requireCommittedReader();
    if(selection.kind==='committed')expect(readCommitted(directory)).toMatchObject({sourceSelection:selection});
    else expect(()=>readCommitted(directory)).toThrow('requires committed source selection');
    const changed=selection.kind==='committed'?{...selection,tree:'d'.repeat(40)}:{...selection,identity:'d'.repeat(64)};
    expect(()=>readSelected(directory,changed)).toThrow();
    const downgrade:SourceSelection=selection.kind==='working'?{kind:'committed',revision:base,tree:'b'.repeat(40)}:{kind:'working',base,identity:'c'.repeat(64)};
    expect(()=>readSelected(directory,downgrade)).toThrow();
    expect(()=>toolkit.readBunToolkit(directory)).toThrow('Bun execution requires toolkit schema 2');
    expect(()=>toolkit.readToolkit(directory)).toThrow('legacy execution requires toolkit schema 1');
    expect(readFileSync(join(directory,'toolkit.json'))).toEqual(bytes);
    expect(JSON.parse(bytes.toString('utf8'))).toEqual(descriptor);
  });
 });
 test('toolkit3 '+selection.kind+' source selection is required, closed and agrees with the reference revision',()=>{
  withinToolkit(selection,({directory,descriptor,write})=>{
    expect(toolkit.verifyToolkit(directory)).toMatchObject({schemaVersion:3,sourceSelection:selection});
    const missing={...descriptor};Reflect.deleteProperty(missing,'sourceSelection');
    const malformed:readonly unknown[]=[
      missing,{...descriptor,sourceRevision:'e'.repeat(40)},
      {...descriptor,sourceSelection:{kind:'committed',revision:base}},
      {...descriptor,sourceSelection:{kind:'working',base}},
      {...descriptor,sourceSelection:{...selection,extra:true}},
      {...descriptor,sourceSelection:{kind:'staged',base,identity:'c'.repeat(64)}},
      {...descriptor,sourceSelection:{kind:'working',base,identity:'not-a-digest'}},
      {...descriptor,sourceSelection:{kind:'committed',revision:'HEAD',tree:'b'.repeat(40)}},
      {...descriptor,sourceSelection:null},
    ];
    for(const corrupt of malformed){
      write(corrupt);expect(()=>toolkit.verifyToolkit(directory)).toThrow();
      write(descriptor);expect(toolkit.verifyToolkit(directory)).toMatchObject({schemaVersion:3,sourceSelection:selection});
    }
  });
 });
}
