import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

const workspace = resolve(import.meta.dir, '../../../../..');
const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runControl(fault: string) {
  const root = mkdtempSync(join(tmpdir(), 'puni package assembly ownership '));
  roots.push(root);
  const packageRoot = join(root, 'package'),
    work = join(root, 'work'),
    sourceDirectory = join(root, 'source'),
    installation = join(root, 'installation');
  for (const path of [sourceDirectory, installation, work]) mkdirSync(path);
  const entry = join(root, 'control.mjs');
  const provider = join(
    workspace,
    'apps/twilight-structure/twilight-burokrat/cli/src/packaging-facade.ts',
  );
  const program = `
import {mock} from 'bun:test';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const actual = await import(${JSON.stringify(provider)});
const root=${JSON.stringify(root)},packageRoot=${JSON.stringify(packageRoot)},work=${JSON.stringify(work)},sourceDirectory=${JSON.stringify(sourceDirectory)},installation=${JSON.stringify(installation)},fault=${JSON.stringify(fault)};
const toolkit=join(packageRoot,'dist/toolkit');
const files={'apps/puni/cli/README.md':Buffer.from('captured README B'),'apps/puni/cli/LICENSE':Buffer.from('captured LICENSE B'),'apps/puni/cli/NOTICE':Buffer.from('captured NOTICE B')};
const source={readSnapshot:()=>({selection:{kind:'committed',revision:'a'.repeat(40),tree:'b'.repeat(40)},entries:Object.keys(files).map(path=>({path,mode:'100644',blob:'c'.repeat(40)})),untracked:[]}),readFile:path=>{const bytes=files[path];if(bytes===undefined)throw new Error('missing controlled source file');return bytes;}};
const nativeRead=actual.readBuildFile;
const observed={preflight:[],capture:[],assets:[],reads:[]};
let first,subscriptions=0;
const listeners=new Set();
const emit=signal=>{first??=signal;for(const listener of listeners)listener(first);};
const request={repository:sourceDirectory,revision:'a'.repeat(40),installationDirectory:installation,work,destination:packageRoot};
const context={callerDirectory:root,runtime:{directory:root,environment:{PATH:'/original trusted path'}},subscribeInterrupts(listener){subscriptions++;listeners.add(listener);if(first!==undefined)listener(first);if(fault==='input-aliases'&&subscriptions===1){request.repository='/mutated source';request.revision='HEAD';request.installationDirectory='/mutated installation';request.work='/mutated work';request.destination='/mutated package';context.callerDirectory='/mutated caller';context.runtime.directory='/mutated runtime';context.runtime.environment.PATH='/mutated path';}return()=>{if(fault==='terminal-cancel'){listener('SIGTERM');listener('SIGINT');}listeners.delete(listener);if(subscriptions===1&&(fault==='release'||fault==='both'||fault==='producer-release'))throw new Error('controlled release failure');if(fault==='terminal-cancel'){emit('SIGTERM');emit('SIGINT');}};}};
mock.module(${JSON.stringify(provider)},()=>({...actual,
readBuildSource:async(request,context)=>{observed.preflight.push({request,context});return fault==='unowned-preflight'?{kind:'cancelled',status:130}:{kind:'candidate',directory:sourceDirectory};},
captureCommittedSource:async(revision,context)=>{observed.capture.push({revision,context});return fault==='unowned-capture'?{kind:'cancelled',status:130}:{kind:'captured',source};},
buildPuniAssets:async(source,request,context)=>{observed.assets.push({request,context});mkdirSync(toolkit,{recursive:true});if(fault==='producer-release')throw new actual.ToolkitBuildFailure([work,packageRoot],new Error('controlled producer failure'));if(fault==='unowned-assets')return{kind:'cancelled',status:130,ownedDirectories:[work,packageRoot]};if(fault==='before-files')emit('SIGINT');return{kind:'built',toolkit:{directory:toolkit},ownedDirectories:[work,packageRoot]};},
readBuildFile:path=>{const bytes=nativeRead(path);observed.reads.push(path);if(fault==='after-first-file'&&path.endsWith('/package.json'))emit('SIGTERM');if(fault==='both'||fault==='file:'+path.split('/').at(-1))return Buffer.from('substituted delivered file');return bytes;}
}));
const {buildPackage}=await import(${JSON.stringify(join(import.meta.dir, 'build.ts'))});
function messages(cause){if(!(cause instanceof Error))return[String(cause)];return[cause.message,...(cause instanceof AggregateError?cause.errors.flatMap(messages):[]),...(cause.cause===undefined?[]:messages(cause.cause))];}
let report;try{const outcome=await buildPackage(request,context);report={kind:'returned',outcome};}catch(cause){report={kind:'refused',messages:messages(cause),ownedDirectories:cause.ownedDirectories};}
process.stdout.write(JSON.stringify({...report,observed,packageMetadata:existsSync(join(packageRoot,'package.json'))?readFileSync(join(packageRoot,'package.json'),'utf8'):null,readme:existsSync(join(packageRoot,'README.md'))?readFileSync(join(packageRoot,'README.md'),'utf8'):null,listeners:listeners.size}));
`;
  writeFileSync(entry, program);
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: workspace,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const report: unknown = JSON.parse(child.stdout.toString());
  return { report, root, packageRoot, work };
}

for (const file of ['package.json', 'README.md', 'LICENSE', 'NOTICE'])
  it('refuses broken ' + file + ' readback and retains package and work ownership', () => {
    const { report, packageRoot, work } = runControl('file:' + file);
    expect(report, JSON.stringify(report)).toMatchObject({
      kind: 'refused',
      ownedDirectories: [work, packageRoot],
      listeners: 0,
      messages: expect.arrayContaining([
        'PUNI package file differs from captured/planned bytes: ' + file,
      ]) as unknown,
    });
  });
for (const stage of ['preflight', 'capture', 'assets'])
  it('refuses ' + stage + ' cancellation without the owning package broker', () => {
    const { report } = runControl('unowned-' + stage);
    expect(report, JSON.stringify(report)).toMatchObject({
      kind: 'refused',
      listeners: 0,
      messages: expect.arrayContaining([
        'PUNI package ' +
          (stage === 'preflight' ? 'source selection' : stage) +
          ' stopped without owning interruption',
      ]) as unknown,
    });
  });
it('stops metadata delivery after producer cancellation while retaining its owned roots', () => {
  const { report, packageRoot, work } = runControl('before-files');
  expect(report, JSON.stringify(report)).toMatchObject({
    kind: 'returned',
    outcome: { kind: 'cancelled', status: 130, ownedDirectories: [work, packageRoot] },
    packageMetadata: null,
    readme: null,
    listeners: 0,
  });
});
it('stops later package files after cancellation recorded by settled first-file readback', () => {
  const { report, packageRoot, work } = runControl('after-first-file');
  expect(report, JSON.stringify(report)).toMatchObject({
    kind: 'returned',
    outcome: { kind: 'cancelled', status: 143, ownedDirectories: [work, packageRoot] },
    readme: null,
    listeners: 0,
  });
  if (
    typeof report !== 'object' ||
    report === null ||
    !('packageMetadata' in report) ||
    typeof report.packageMetadata !== 'string'
  )
    throw new Error('first settled package file absent');
  expect(JSON.parse(report.packageMetadata)).toMatchObject({ name: 'puni' });
});
it('retains first terminal package cancellation delivered during subscription release', () => {
  const { report, packageRoot, work } = runControl('terminal-cancel');
  expect(report, JSON.stringify(report)).toMatchObject({
    kind: 'returned',
    outcome: { kind: 'cancelled', status: 143, ownedDirectories: [work, packageRoot] },
    listeners: 0,
  });
});
for (const fault of ['release', 'both', 'producer-release'])
  it('preserves ' + fault + ' failures and all retained package roots', () => {
    const { report, packageRoot, work } = runControl(fault);
    const messages = ['controlled release failure'];
    if (fault === 'both')
      messages.push('PUNI package file differs from captured/planned bytes: package.json');
    if (fault === 'producer-release') messages.push('controlled producer failure');
    expect(report, JSON.stringify(report)).toMatchObject({
      kind: 'refused',
      ownedDirectories: [work, packageRoot],
      listeners: 0,
      messages: expect.arrayContaining(messages) as unknown,
    });
  });
it('captures package request caller and runtime fields before subscription aliases mutate', () => {
  const { report, root, packageRoot, work } = runControl('input-aliases');
  expect(report, JSON.stringify(report)).toMatchObject({
    kind: 'returned',
    observed: {
      preflight: [
        {
          request: { repository: join(root, 'source'), revision: 'a'.repeat(40) },
          context: {
            callerDirectory: root,
            runtime: { directory: root, environment: { PATH: '/original trusted path' } },
          },
        },
      ],
      capture: [
        {
          revision: 'a'.repeat(40),
          context: {
            repository: join(root, 'source'),
            runtime: { directory: root, environment: { PATH: '/original trusted path' } },
          },
        },
      ],
      assets: [
        {
          request: { work, destination: packageRoot },
          context: {
            sourceDirectory: join(root, 'source'),
            installationDirectory: join(root, 'installation'),
            callerDirectory: root,
          },
        },
      ],
    },
    listeners: 0,
  });
});
