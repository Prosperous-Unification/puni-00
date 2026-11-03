import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { envLayout } from './env';

for (const replacement of ['symlink', 'directory'] as const) {
  test(`parent ${replacement} replacement never redirects site publication into foreign directory`, async () => {
    const root = scratchSync('owner-parent-race-');
    const parent = `${root}/caddy`;
    const foreign = `${root}/foreign`;
    const retained = `${root}/retained`;
    await mkdir(parent);
    await mkdir(foreign);
    await writeFile(`${parent}/site.caddy`, 'selected original');
    await writeFile(`${foreign}/site.caddy`, 'foreign original');
    const layout = {
      ...envLayout('prod'),
      root,
      stateDir: root,
      siteCaddyPath: `${parent}/site.caddy`,
    };
    const program = `
      import * as filesystem from 'node:fs';
      import * as asynchronous from 'node:fs/promises';
      import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
      import { basename, join } from 'node:path';
      import { mock } from 'bun:test';
      const renameRelative = relative.renameDirectoryFile;
      const renameAsync = asynchronous.rename;
      function replaceParent(source) {
        filesystem.renameSync(${JSON.stringify(parent)}, ${JSON.stringify(retained)});
        if (${JSON.stringify(replacement)} === 'symlink') filesystem.symlinkSync(${JSON.stringify(foreign)}, ${JSON.stringify(parent)});
        else filesystem.renameSync(${JSON.stringify(foreign)}, ${JSON.stringify(parent)});
        filesystem.writeFileSync(join(${JSON.stringify(parent)}, basename(source)), 'foreign staged sibling');
      }
      mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({
        ...relative,
        renameDirectoryFile: (descriptor, source, target) => {
          replaceParent(source);
          renameRelative(descriptor, source, target);
        },
      }));
      // Also exercise the original path-based production implementation in the watched regression.
      mock.module('node:fs/promises', () => ({
        ...asynchronous,
        rename: async (source, target) => {
          replaceParent(source);
          await renameAsync(source, target);
        },
      }));
      const { withDependencyOwner, captureOwnedSiteFile, publishOwnedSiteFile } = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
      const layout = ${JSON.stringify(layout)};
      let refused = false;
      try {
        await withDependencyOwner({ sha: 'a'.repeat(40), layouts: [layout] }, async owner => {
          await publishOwnedSiteFile(owner, layout, await captureOwnedSiteFile(layout.siteCaddyPath), 'maintenance');
        }, ${JSON.stringify(root)});
      } catch { refused = true; }
      if (!refused) throw new Error('parent replacement did not refuse');
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(
      await readFile(`${replacement === 'symlink' ? foreign : parent}/site.caddy`, 'utf8'),
    ).toBe('foreign original');
  });
}
