import { join } from 'node:path';

import { readToolchain } from './contracts';
import { buildController } from './controller';

const command = process.argv[2];
const root = join(import.meta.dir, '../../..');
const toolchainPath = join(root, 'infra/versions/toolchain.json');

switch (command) {
  case 'check':
    await readToolchain(toolchainPath);
    break;
  case 'build':
    await buildController(root, (await readToolchain(toolchainPath)).controller.digest);
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
