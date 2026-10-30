import { mkdir } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

for (const [platform, architecture] of [
  ['darwin', 'arm64'],
  ['linux', 'arm64'],
] as const) {
  test(`native site creation refuses unsupported ${platform}/${architecture} before creation`, async () => {
    const directory = scratchSync('site-native-platform-');
    const parent = `${directory}/caddy`;
    await mkdir(parent);
    const program = `
      import {openSync,closeSync,constants,existsSync} from 'node:fs';
      Object.defineProperty(process,'platform',{value:${JSON.stringify(platform)}});
      Object.defineProperty(process,'arch',{value:${JSON.stringify(architecture)}});
      const {openDirectoryFile}=await import(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)});
      const descriptor=openSync(${JSON.stringify(parent)},constants.O_RDONLY|constants.O_DIRECTORY);
      let refused=false;
      try {openDirectoryFile(descriptor,'private',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW);}
      catch(cause){if(!String(cause).includes('requires Linux x64'))throw cause;refused=true;}
      finally{closeSync(descriptor);}
      if(!refused || existsSync(${JSON.stringify(`${parent}/private`)}))throw new Error('unsupported ABI reached native creation');
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });
}
