import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const output = join(import.meta.dir, '../../../../dist/libs/website/adapters/store-sqlite');
const source = join(import.meta.dir, 'src');
const build = await Bun.build({
  entrypoints: [join(source, 'store.ts')],
  target: 'bun',
  outdir: output,
});
if (!build.success) throw new Error('Website SQLite adapter bundle failed');
mkdirSync(output, { recursive: true });
cpSync(join(source, 'migrations'), join(output, 'migrations'), { recursive: true });
