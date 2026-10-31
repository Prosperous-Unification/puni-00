import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { assertObservability, renderObservability } from './observability';
const root = join(import.meta.dir, '../../..');
if (process.argv.slice(2).join(' ') === '--write') {
  for (const [path, content] of Object.entries(await renderObservability(root))) {
    const destination = join(root, 'infra/platform', path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
} else if (process.argv.length === 2) await assertObservability(root);
else throw new Error('Usage: observability-generate.ts [--write]');
