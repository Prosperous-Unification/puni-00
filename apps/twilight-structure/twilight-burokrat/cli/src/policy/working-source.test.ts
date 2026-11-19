import {createHash} from 'node:crypto';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,test} from 'bun:test';
import * as packaging from '../packaging-facade';
import {readLintRuntime} from '../lint-runtime';
import {type PreparationGitContext,runPreparationGit} from './preparation-git';

interface WorkingFiles {
  readSelection():{readonly kind:'working';readonly base:string;readonly identity:string};
  readSnapshot():{readonly entries:readonly {readonly path:string;readonly mode:'100644'|'100755'|'120000'|'160000'}[]};
  readFile(path:string):Uint8Array;
}
type CaptureWorking=(context:PreparationGitContext)=>Promise<
  |{readonly kind:'captured';readonly source:WorkingFiles}
  |{readonly kind:'cancelled';readonly status:130|143}>;

function digest(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}

/** Every real Git query uses the production native owner; unknown settlement retains its actual fixture root. */
async function withinRepository(exercise:(fixture:{root:string;repository:string;base:string;capture:()=>ReturnType<CaptureWorking>;git:(...argv:string[])=>Promise<string>})=>Promise<void>){
  const root=mkdtempSync(join(tmpdir(),'puni working capture ')),repository=join(root,'candidate'),runtimeDirectory=join(root,'runtime');
  let known=true,primary:{cause:unknown}|undefined;
  try{
    mkdirSync(repository);mkdirSync(runtimeDirectory);
    const context:PreparationGitContext={repository,runtime:readLintRuntime('/usr/bin:/bin',runtimeDirectory),subscribeInterrupts:()=>()=>undefined};
    async function git(...argv:string[]){
      known=false;
      const query=await runPreparationGit(argv,context);
      known=true;
      if(query.kind!=='exited'||query.status!==0)
        throw new Error('working-source fixture Git refused '+JSON.stringify(argv)+': '+Buffer.from(query.stderr).toString());
      return new TextDecoder('utf-8',{fatal:true}).decode(query.stdout).replace(/\n$/u,'');
    }
    await git('init','--initial-branch=main');await git('config','user.name','PUNI Working Capture');await git('config','user.email','working@example.test');
    writeFileSync(join(repository,'tracked.txt'),'committed\n');writeFileSync(join(repository,'deleted.txt'),'to delete\n');writeFileSync(join(repository,'.gitignore'),'ignored/\n');
    await git('add','--all');await git('commit','-m','baseline');const base=await git('rev-parse','HEAD');
    expect(base).toMatch(/^[0-9a-f]{40}$/u);
    async function capture(){
      const operation=captureWorking();
      known=false;
      const captured=await operation(context);
      known=true;
      return captured;
    }
    await exercise({root,repository,base,capture,git});
  }catch(cause:unknown){primary={cause};}
  if(known){
    try{rmSync(root,{recursive:true});}catch(cleanup:unknown){
      if(primary!==undefined)throw new AggregateError([primary.cause,cleanup],'working-source exercise and namespace cleanup failed',{cause:cleanup});
      throw cleanup;
    }
  }
  if(primary!==undefined){
    if(!known)throw new Error('working-source native custody is unknown; retained '+root,{cause:primary.cause});
    throw primary.cause;
  }
  if(!known)throw new Error('working-source native custody is unknown; retained '+root);
}

/** Required API absence is initial scaffolding only; the capability is exercised through the real facade once present. */
function captureWorking():CaptureWorking{
  const capture:unknown=Reflect.get(packaging,'captureWorkingSource');
  expect(typeof capture).toBe('function');
  if(typeof capture!=='function')throw new Error('required captureWorkingSource is absent');
  // Test-only boundary: the required public facade operation has the explicit WorkingFiles contract above.
  return capture as CaptureWorking;
}

test('working source captures edited tracked and untracked bytes/modes without changing HEAD or index',async()=>{
  await withinRepository(async({repository,base,capture,git})=>{
    writeFileSync(join(repository,'tracked.txt'),'edited local source\n');rmSync(join(repository,'deleted.txt'));
    writeFileSync(join(repository,'new-source.ts'),'export const local = true;\n');
    writeFileSync(join(repository,'run.ts'),'executable source\n');chmodSync(join(repository,'run.ts'),0o755);
    symlinkSync('tracked.txt',join(repository,'source-link'));
    mkdirSync(join(repository,'ignored'));writeFileSync(join(repository,'ignored','secret.txt'),'not admitted\n');
    const beforeIndex=digest(readFileSync(join(repository,'.git','index'))),beforeEntries=await git('ls-files','--stage','-z');
    expect(await git('show','HEAD:tracked.txt')).toBe('committed');
    const captured=await capture();
    if(captured.kind!=='captured')throw new Error('ordinary working capture unexpectedly cancelled');
    expect(captured.source.readSelection()).toMatchObject({kind:'working',base,identity:expect.stringMatching(/^[0-9a-f]{64}$/u)});
    expect(captured.source.readSnapshot().entries).toEqual([
      {path:'.gitignore',mode:'100644'},{path:'new-source.ts',mode:'100644'},{path:'run.ts',mode:'100755'},
      {path:'source-link',mode:'120000'},{path:'tracked.txt',mode:'100644'},
    ]);
    expect(captured.source.readFile('tracked.txt')).toEqual(Buffer.from('edited local source\n'));
    expect(captured.source.readFile('new-source.ts')).toEqual(Buffer.from('export const local = true;\n'));
    expect(captured.source.readFile('source-link')).toEqual(Buffer.from('tracked.txt'));
    expect(()=>captured.source.readFile('ignored/secret.txt')).toThrow();
    expect(()=>captured.source.readFile('deleted.txt')).toThrow();
    expect(await git('rev-parse','HEAD')).toBe(base);expect(await git('ls-files','--stage','-z')).toBe(beforeEntries);
    expect(digest(readFileSync(join(repository,'.git','index')))).toBe(beforeIndex);
  });
},30000);

test('working capture owns binary/path/link bytes and later edits change identity without changing earlier capture',async()=>{
  await withinRepository(async({repository,base,capture})=>{
    const path=' spaces \n\u96ea\uFEFF.bin',bytes=Uint8Array.from([0,255,10,13,128]);
    writeFileSync(join(repository,path),bytes);
    symlinkSync(path,join(repository,'binary-link'));
    const first=await capture();
    if(first.kind!=='captured')throw new Error('ordinary first working capture unexpectedly cancelled');
    const selected=first.source.readSelection();expect(selected).toMatchObject({kind:'working',base});
    expect(first.source.readFile(path)).toEqual(bytes);expect(first.source.readFile('binary-link')).toEqual(Buffer.from(path));
    first.source.readFile(path).fill(0);
    const exposed=first.source.readSnapshot().entries.find(entry=>entry.path===path);
    if(exposed===undefined)throw new Error('actual captured binary entry is absent');
    Reflect.set(exposed,'path','caller-mutated');
    expect(first.source.readFile(path)).toEqual(bytes);
    expect(first.source.readSnapshot().entries.some(entry=>entry.path===path)).toBe(true);
    writeFileSync(join(repository,path),'new local bytes');
    const second=await capture();
    if(second.kind!=='captured')throw new Error('ordinary second working capture unexpectedly cancelled');
    expect(second.source.readSelection().base).toBe(base);
    expect(second.source.readSelection().identity).not.toBe(selected.identity);
    expect(second.source.readFile(path)).toEqual(Buffer.from('new local bytes'));
    expect(first.source.readFile(path)).toEqual(bytes);
  });
},30000);
