import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const output = join(import.meta.dir, 'dist');
const migrationSource = join(import.meta.dir, '../../../libs/website/adapters/store-sqlite/src');
const build = await Bun.build({
  entrypoints: [join(import.meta.dir, 'src/main.ts')],
  target: 'bun',
  outdir: output,
});
if (!build.success) throw new Error('Website API bundle failed');
mkdirSync(output, { recursive: true });
copyFileSync(join(migrationSource, 'migration.sql'), join(output, 'migration.sql'));
copyFileSync(join(migrationSource, 'down.sql'), join(output, 'down.sql'));
cpSync(join(migrationSource, 'migrations'), join(output, 'migrations'), { recursive: true });
