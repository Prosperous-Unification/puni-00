import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const output = join(import.meta.dir, 'dist');
const migrationSource = join(import.meta.dir, '../../../libs/website/adapters/store-sqlite/src');
const build = await Bun.build({
  entrypoints: [
    join(import.meta.dir, 'src/main.ts'),
    join(import.meta.dir, 'src/draft-retention-cli.ts'),
    join(import.meta.dir, 'src/request-retention-cli.ts'),
  ],
  target: 'bun',
  outdir: output,
});
if (!build.success) throw new Error('Website API bundle failed');
mkdirSync(output, { recursive: true });
cpSync(join(migrationSource, 'migrations'), join(output, 'migrations'), { recursive: true });
// The private release pin copies this into its receipt; fleet-check refuses an `s3` journal for a
// release without `retention-journal/1` (design D§5, veto V13).
// Proof: dropping this write made build-smoke.ts fail with ENOENT on bundle/capabilities.json.
writeFileSync(join(output, 'capabilities.json'), `${JSON.stringify(['retention-journal/1'])}\n`);
