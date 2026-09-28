import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const output = join(import.meta.dir, 'dist');
const migrationSource = join(import.meta.dir, '../../../libs/website/adapters/store-sqlite/src');
const build = await Bun.build({
  entrypoints: [
    join(import.meta.dir, 'src/main.ts'),
    join(import.meta.dir, 'src/draft-retention-cli.ts'),
  ],
  target: 'bun',
  outdir: output,
});
if (!build.success) throw new Error('Website API bundle failed');
mkdirSync(output, { recursive: true });
cpSync(join(migrationSource, 'migrations'), join(output, 'migrations'), { recursive: true });
