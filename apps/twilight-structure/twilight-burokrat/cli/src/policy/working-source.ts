import {lstatSync,readlinkSync,realpathSync,statSync,type Stats} from 'node:fs';
import {isAbsolute,join,sep} from 'node:path';

import {hashBytes,hashCanonical} from '../evidence/content-manifest';
import {readOperatorFile} from './preparation-inputs';
import {type PreparationGitContext,runPreparationGit} from './preparation-git';
import type {WorkingSource} from './source-files';

interface SourceEntry {readonly path:string;readonly mode:'100644'|'100755'|'120000'}
type CaptureOutcome=
  |{readonly kind:'cancelled';readonly status:130|143}
  |{readonly kind:'captured';readonly source:WorkingSource};

const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
function readPath(path:string):string{
  if(path===''||path.includes('\0')||path.split('/').some(part=>part===''||part==='.'||part==='..'))
    throw new Error('working source path is not canonical: '+path);
  return path;
}
function readNulRecords(bytes:Uint8Array):string[]{
  if(bytes.length===0)return[];
  if(bytes.at(-1)!==0)throw new Error('working source Git list lacks its NUL terminator');
  return utf8.decode(bytes).split('\0').slice(0,-1);
}
function readTracked(bytes:Uint8Array){
  const paths=new Set<string>();
  return readNulRecords(bytes).map(record=>{
    const separator=record.indexOf('\t');
    if(separator<0)throw new Error('working source index entry lacks its path separator');
    const header=record.slice(0,separator),path=readPath(record.slice(separator+1));
    if(!/^(100644|100755|120000|160000) [0-9a-f]{40} 0$/u.test(header))
      throw new Error('working source requires a valid merged SHA1 index entry: '+path);
    if(header.startsWith('160000 '))throw new Error('working source capture does not support gitlinks: '+path);
    if(paths.has(path))throw new Error('working source index path is duplicated: '+path);
    paths.add(path);
    return path;
  });
}
function readIdentity(bytes:Uint8Array):string{
  const text=utf8.decode(bytes).replace(/\n$/u,'');
  if(!/^[0-9a-f]{40}$/u.test(text))throw new Error('working source Git returned a malformed commit identity');
  return text;
}
function isAbsent(cause:unknown):boolean{
  return cause!==null&&typeof cause==='object'&&'code'in cause&&cause.code==='ENOENT';
}

/**
 * Capture actual dirty source, including nonignored untracked bytes, without changing the index,
 * creating Git objects or claiming committed provenance. The supplied repository must name its
 * actual worktree root; silently capturing an enclosing root could certify a different source main.
 * Two complete byte/mode/membership passes,
 * unchanged required index bytes and stable HEAD/root identity must agree; concurrent changes fail.
 * Git uses the existing frozen native child/cancellation owner. Stable host metadata is a premise,
 * not a concurrent hostile-filesystem snapshot. Deleted tracked files are absent working content;
 * missing untracked paths, malformed/unmerged index, nonregular files and unreadability throw.
 */
export async function captureWorkingSource(supplied:PreparationGitContext):Promise<CaptureOutcome>{
  const context:PreparationGitContext={repository:supplied.repository,runtime:{directory:supplied.runtime.directory,environment:{...supplied.runtime.environment}},subscribeInterrupts:supplied.subscribeInterrupts};
  let interrupted:'SIGINT'|'SIGTERM'|undefined;
  const release=context.subscribeInterrupts(signal=>{interrupted??=signal;});
  const cancellation=():Extract<CaptureOutcome,{kind:'cancelled'}>|undefined=>interrupted===undefined?undefined:{kind:'cancelled',status:interrupted==='SIGINT'?130:143};
  async function query(argv:readonly string[],selected:PreparationGitContext){
    const observed=await runPreparationGit(argv,selected);
    if(observed.kind==='cancelled')return observed;
    if(observed.status!==0)throw new Error('working source Git refused '+JSON.stringify(argv)+': '+Buffer.from(observed.stderr).toString());
    return{kind:'read' as const,bytes:observed.stdout};
  }
  async function capture():Promise<CaptureOutcome>{
    const prior=cancellation();if(prior!==undefined)return prior;
    if(context.repository==='')throw new Error('working source requires an explicit worktree root');
    const selected=await query(['rev-parse','--show-toplevel'],context);if(selected.kind==='cancelled')return selected;
    const spelling=utf8.decode(selected.bytes).replace(/\n$/u,'');
    if(!isAbsolute(spelling))throw new Error('working source Git returned a nonabsolute worktree root');
    const directory=realpathSync.native(spelling),before=statSync(directory,{bigint:true});
    if(!before.isDirectory())throw new Error('working source root is not a directory');
    const requested=isAbsolute(context.repository)?context.repository:context.runtime.directory+(context.runtime.directory.endsWith(sep)?'':sep)+context.repository;
    if(realpathSync.native(requested)!==directory)throw new Error('working source requires the actual worktree root');
    const ownedContext={...context,repository:directory};
    const indexQuery=await query(['rev-parse','--path-format=absolute','--git-path','index'],ownedContext);if(indexQuery.kind==='cancelled')return indexQuery;
    const indexPath=utf8.decode(indexQuery.bytes).replace(/\n$/u,'');
    if(!isAbsolute(indexPath))throw new Error('working source Git returned a nonabsolute index path');
    const initialIndex=hashBytes(readOperatorFile(indexPath));
    async function pass(){
      const selectedBase=await query(['rev-parse','--verify','--end-of-options','HEAD^{commit}'],ownedContext);if(selectedBase.kind==='cancelled')return selectedBase;
      const base=readIdentity(selectedBase.bytes);
      const cached=await query(['ls-files','--cached','--stage','-z'],ownedContext);if(cached.kind==='cancelled')return cached;
      const untracked=await query(['ls-files','--others','--exclude-standard','-z'],ownedContext);if(untracked.kind==='cancelled')return untracked;
      const tracked=readTracked(cached.bytes),additional=readNulRecords(untracked.bytes).map(readPath),paths=new Set<string>();
      for(const path of [...tracked,...additional]){
        if(paths.has(path))throw new Error('working source membership is duplicated: '+path);
        paths.add(path);
      }
      const entries:SourceEntry[]=[],files=new Map<string,Uint8Array>();
      function retain(path:string,isTracked:boolean){
        const native=join(directory,...path.split('/'));
        let status:Stats;
        try{status=lstatSync(native);}catch(cause){if(isTracked&&isAbsent(cause))return;throw cause;}
        // A formerly tracked regular file replaced by a directory is deleted content; its new nonignored descendants are listed separately.
        if(isTracked&&status.isDirectory())return;
        const components=path.split('/');
        for(let depth=1;depth<components.length;depth++){
          const parent=lstatSync(join(directory,...components.slice(0,depth)));
          if(!parent.isDirectory())throw new Error('working source path traverses a non-directory or symlink: '+path);
        }
        if(status.isSymbolicLink()){
          entries.push({path,mode:'120000'});files.set(path,Uint8Array.from(readlinkSync(native,{encoding:'buffer'})));
        }else if(status.isFile()){
          entries.push({path,mode:(status.mode&0o111)===0?'100644':'100755'});files.set(path,Uint8Array.from(readOperatorFile(native)));
        }else throw new Error('working source requires a regular file or symlink: '+path);
      }
      for(const path of tracked)retain(path,true);
      for(const path of additional)retain(path,false);
      entries.sort((left,right)=>Buffer.compare(Buffer.from(left.path),Buffer.from(right.path)));
      const present=new Set(entries.map(entry=>entry.path));
      for(const {path}of entries){
        const components=path.split('/');
        for(let depth=1;depth<components.length;depth++)if(present.has(components.slice(0,depth).join('/')))
          throw new Error('working source captured a file ancestor: '+path);
      }
      const currentBase=await query(['rev-parse','--verify','--end-of-options','HEAD^{commit}'],ownedContext);if(currentBase.kind==='cancelled')return currentBase;
      if(readIdentity(currentBase.bytes)!==base||hashBytes(readOperatorFile(indexPath))!==initialIndex)
        throw new Error('working source HEAD or index changed during capture');
      const identity=hashCanonical({format:'puni-working-source',version:1,base,files:entries.map(entry=>{
        const bytes=files.get(entry.path);if(bytes===undefined)throw new Error('working source captured bytes are absent: '+entry.path);
        return{...entry,sha256:hashBytes(bytes)};
      })});
      return{kind:'read' as const,base,identity,entries,files};
    }
    const first=await pass();if(first.kind==='cancelled')return first;
    const second=await pass();if(second.kind==='cancelled')return second;
    if(first.identity!==second.identity)throw new Error('working source changed between complete captures');
    const after=statSync(directory,{bigint:true});
    if(before.dev!==after.dev||before.ino!==after.ino)throw new Error('working source root changed during capture');
    return{kind:'captured',source:{readSelection:()=>({kind:'working',base:second.base,identity:second.identity}),
      readSnapshot:()=>({entries:second.entries.map(entry=>({...entry}))}),
      readFile(path){const bytes=second.files.get(path);if(bytes===undefined)throw new Error('captured working source path is absent: '+path);return Uint8Array.from(bytes);}}};
  }
  const completed=await capture().then(value=>({ok:true as const,value}),(cause:unknown)=>({ok:false as const,cause}));
  let cleanup:{cause:unknown}|undefined;try{release();}catch(cause){cleanup={cause};}
  if(!completed.ok){
    if(cleanup!==undefined)throw new AggregateError([completed.cause,cleanup.cause],'working source capture and interrupt release failed',{cause:cleanup.cause});
    throw completed.cause;
  }
  if(cleanup!==undefined)throw cleanup.cause;
  return cancellation()??completed.value;
}
