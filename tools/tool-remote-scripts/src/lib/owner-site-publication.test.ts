import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { envLayout } from './env';

for (const fault of ['none', 'noop', 'sync-failure', 'sibling-symlink', 'public-mode'] as const) {
  test(`actual site publication retains ordered evidence for ${fault}`, async () => {
    const root = scratchSync('owner-site-effect-');
    await writeFile(`${root}/edge.lock`, '');
    const caddy = `${root}/caddy`;
    await mkdir(caddy);
    const path = `${caddy}/site.caddy`;
    await writeFile(path, 'original secret configuration');
    const foreign = `${root}/foreign-evidence`;
    await writeFile(foreign, 'foreign retained bytes');
    const layout = { ...envLayout('prod'), root, stateDir: root, siteCaddyPath: path };
    const program = `
    import * as filesystem from 'node:fs';
    import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
    import {join} from 'node:path';
    import { mock } from 'bun:test';
    const openRelative = relative.openDirectoryFile;
    const renameRelative = relative.renameDirectoryFile;
    const sync = filesystem.fsyncSync;
    const synchronized = new Set();
    const staged = new Set();
    let renamed = false;
    let observed = false;
    let directorySynced = false;
    let faultDelivered = false;
    let callbackEntered = false;
    mock.module('node:fs',()=>({...filesystem,fsyncSync:(descriptor)=>{
      if(renamed && !staged.has(descriptor)) {
        if(${JSON.stringify(fault)} === 'sync-failure'){faultDelivered=true;throw new Error('injected directory sync');}
        directorySynced=true;
      }
      sync(descriptor); synchronized.add(descriptor);
    }}));
    mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)},()=>({...relative,
      openDirectoryFile:(descriptor,name,flags)=>{
        if(name.startsWith('.site.caddy.dependency-')) {
          if(${JSON.stringify(fault)} === 'sibling-symlink'){filesystem.symlinkSync(${JSON.stringify(foreign)},join(${JSON.stringify(caddy)},name));faultDelivered=true;}
          const opened=openRelative(descriptor,name,flags);
          if(${JSON.stringify(fault)} === 'public-mode'){filesystem.fchmodSync(opened,0o644);faultDelivered=true;}
          staged.add(opened);return opened;
        }
        return openRelative(descriptor,name,flags);
      },
      renameDirectoryFile:(descriptor,source,target)=>{
        const names = filesystem.readdirSync(${JSON.stringify(root)});
        const original = names.find(name=>name.endsWith('-ingress-original.json'));
        const intent = names.find(name=>name.endsWith('-ingress-intent.json'));
        if (original === undefined || intent === undefined) throw new Error('required pre-rename evidence absent');
        for (const name of [original,intent]) {
          const path=join(${JSON.stringify(root)},name);
          const contents = filesystem.readFileSync(path,'utf8');
          if (!contents.includes('original secret configuration') || (filesystem.statSync(path).mode & 0o777) !== 0o600) throw new Error('private exact original intent absent');
        }
        if (filesystem.readFileSync(${JSON.stringify(path)},'utf8') !== 'original secret configuration') throw new Error('effect preceded intent');
        if (![...staged].some(fd=>synchronized.has(fd))) throw new Error('staged file sync absent');
        if ((filesystem.statSync(join(${JSON.stringify(caddy)},source)).mode & 0o777) !== 0o600) throw new Error('native creation was not private');
        observed = true;
        if (${JSON.stringify(fault)} === 'noop') faultDelivered=true;
        if (${JSON.stringify(fault)} !== 'noop') {renameRelative(descriptor,source,target);renamed=true;}
      }
    }));
    const {withDependencyOwner,captureOwnedSiteFile,publishOwnedSiteFile} = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
    const layout=${JSON.stringify(layout)};
    let refused=false;
    try { await withDependencyOwner({sha:'a'.repeat(40),layouts:[layout]},async owner=>{
      callbackEntered=true;
      await publishOwnedSiteFile(owner,layout,await captureOwnedSiteFile(layout.siteCaddyPath),'maintenance');
    },${JSON.stringify(root)}); } catch(cause) {
      refused=true;
      const expected=${JSON.stringify(fault)} === 'public-mode' ? 'private creation mode differs' : ${JSON.stringify(fault)} === 'sibling-symlink' ? 'exclusive relative open failed' : ${JSON.stringify(fault)} === 'noop' ? 'readback differs' : 'injected directory sync';
      if(!String(cause).includes(expected)) throw cause;
    }
    if(!callbackEntered || (${JSON.stringify(fault)} !== 'none' && !faultDelivered)) throw new Error('intended publication fault boundary not reached');
    if(${JSON.stringify(fault)} === 'none' ? refused : !refused) throw new Error('publication refusal differs');
    if(!['sibling-symlink','public-mode'].includes(${JSON.stringify(fault)}) && !observed) throw new Error('rename effect never observed');
    if(${JSON.stringify(fault)} === 'none' && !directorySynced) throw new Error('publication directory sync absent');
  `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(await readFile(path, 'utf8')).toBe(
      fault === 'noop' || fault === 'sibling-symlink' || fault === 'public-mode'
        ? 'original secret configuration'
        : 'maintenance',
    );
    expect(await readFile(foreign, 'utf8')).toBe('foreign retained bytes');
  });
}
