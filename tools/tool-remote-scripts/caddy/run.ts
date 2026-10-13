import { join } from 'node:path';

import { CADDY_IMAGE } from './image';

const binary = process.env['MCP_CADDY_BINARY'];
// Proof: removing this guard failed caddy-target.test.ts's CI override test.
if (process.env['CI'] && binary !== undefined) {
  throw new Error('CI must exercise the pinned Caddy container');
}
// Proof: removing this guard failed caddy-target.test.ts's absent-binary test.
if (binary !== undefined && Bun.which(binary) === null) {
  throw new Error(`required Caddy binary is absent: ${binary}`);
}
if (binary === undefined) {
  const pull = Bun.spawn(['docker', 'pull', CADDY_IMAGE], { stdout: 'inherit', stderr: 'inherit' });
  const status = await pull.exited;
  // Proof: removing this refusal failed caddy-target.test.ts with a Docker exit-17 fault.
  if (status !== 0) throw new Error(`required Caddy image preparation failed (${String(status)})`);
}
const test = Bun.spawn(
  [
    process.execPath,
    'test',
    '--preload',
    join(import.meta.dir, '../../test/scratch/preload.ts'),
    join(import.meta.dir, 'mcp-body-limit.test.ts'),
  ],
  { stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await test.exited);
