import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readToolchain } from './contracts';

const command = process.argv[2];
const root = join(import.meta.dir, '../../..');
const toolchainPath = join(root, 'infra/versions/toolchain.json');

async function buildController(): Promise<void> {
  await readToolchain(toolchainPath);
  const destination = join(root, 'dist/tool-fleet/controller.oci');
  await mkdir(join(root, 'dist/tool-fleet'), { recursive: true });
  const build = Bun.spawnSync([
    'docker',
    'buildx',
    'build',
    '--file',
    join(root, 'infra/controller/Containerfile'),
    '--output',
    `type=oci,dest=${destination}`,
    root,
  ]);
  if (build.exitCode !== 0) {
    throw new Error(`Controller build failed: ${build.stderr.toString()}`);
  }
}

switch (command) {
  case 'check':
    await readToolchain(toolchainPath);
    break;
  case 'build':
    await buildController();
    break;
  case 'lab':
    throw new Error('Fleet lab is unavailable until F3 supplies the VM and k3d harness');
  case 'plan':
    throw new Error('Fleet planning is unavailable until F1 supplies desired-state contracts');
  case 'apply':
    throw new Error('Fleet apply is unavailable until F4 supplies persisted operation plans');
  default:
    throw new Error(`Unknown tool-fleet command: ${command}`);
}
