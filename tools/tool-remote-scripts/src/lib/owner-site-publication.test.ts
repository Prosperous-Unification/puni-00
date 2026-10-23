import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { envLayout } from './env';

for (const fault of ['none', 'noop', 'sync-failure', 'sibling-symlink'] as const) {
  test(`actual site publication retains ordered evidence for ${fault}`, async () => {
    const root = scratchSync('owner-site-effect-');
    const caddy = `${root}/caddy`;
    await mkdir(caddy);
    const path = `${caddy}/site.caddy`;
    await writeFile(path, 'original secret configuration');
    const foreign = `${root}/foreign-evidence`;
    await writeFile(foreign, 'foreign retained bytes');
    const layout = { ...envLayout('prod'), root, stateDir: root, siteCaddyPath: path };
    const program = `
    import * as filesystem from 'node:fs/promises';
    import { mock } from 'bun:test';
    const renameFile = filesystem.rename;
    const readDirectory = filesystem.readdir;
    const readFile = filesystem.readFile;
    const statFile = filesystem.stat;
    const openFile = filesystem.open;
    const linkFile = filesystem.symlink;
    const synchronized = new Set();
    let observed = false;
    mock.module('node:fs/promises', () => ({...filesystem, open: async (...args) => {
      if (${JSON.stringify(fault)} === 'sibling-symlink' && String(args[0]).startsWith(${JSON.stringify(caddy + '/.site.caddy.dependency-')})) await linkFile(${JSON.stringify(foreign)},args[0]);
      const file = await openFile(...args);
      const sync = file.sync.bind(file);
      file.sync = async () => { if(args[0] === ${JSON.stringify(caddy)} && ${JSON.stringify(fault)} === 'sync-failure') throw new Error('injected directory sync'); await sync(); synchronized.add(args[0]); };
      return file;
    }, rename: async (source,target) => {
      const names = await readDirectory(${JSON.stringify(root)});
      const original = names.find(name=>name.endsWith('-ingress-original.json'));
      const intent = names.find(name=>name.endsWith('-ingress-intent.json'));
      if (original === undefined || intent === undefined) throw new Error('required pre-rename evidence absent');
      for (const name of [original,intent]) {
        const contents = await readFile(${JSON.stringify(root)}+'/'+name,'utf8');
        if (!contents.includes('original secret configuration') || ((await statFile(${JSON.stringify(root)}+'/'+name)).mode & 0o777) !== 0o600) throw new Error('private exact original intent absent');
      }
      if (await readFile(${JSON.stringify(path)},'utf8') !== 'original secret configuration') throw new Error('effect preceded intent');
      if (!synchronized.has(source)) throw new Error('staged file sync absent');
      observed = true;
      if (${JSON.stringify(fault)} !== 'noop') await renameFile(source,target);
    }}));
    const {withDependencyOwner,captureOwnedSiteFile,publishOwnedSiteFile} = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
    const layout=${JSON.stringify(layout)};
    let refused=false;
    try { await withDependencyOwner({sha:'a'.repeat(40),layouts:[layout]},async owner=>{
      await publishOwnedSiteFile(owner,layout,await captureOwnedSiteFile(layout.siteCaddyPath),'maintenance');
    },${JSON.stringify(root)}); } catch(cause) {
      refused=true;
      const expected=${JSON.stringify(fault)} === 'sibling-symlink' ? 'EEXIST' : ${JSON.stringify(fault)} === 'noop' ? 'readback differs' : 'injected directory sync';
      if(!String(cause).includes(expected)) throw cause;
    }
    if(${JSON.stringify(fault)} === 'none' ? refused : !refused) throw new Error('publication refusal differs');
    if(${JSON.stringify(fault)} !== 'sibling-symlink' && !observed) throw new Error('rename effect never observed');
    if(${JSON.stringify(fault)} === 'none' && !synchronized.has(${JSON.stringify(caddy)})) throw new Error('publication directory sync absent');
  `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(await readFile(path, 'utf8')).toBe(
      fault === 'noop' || fault === 'sibling-symlink'
        ? 'original secret configuration'
        : 'maintenance',
    );
    expect(await readFile(foreign, 'utf8')).toBe('foreign retained bytes');
  });
}
