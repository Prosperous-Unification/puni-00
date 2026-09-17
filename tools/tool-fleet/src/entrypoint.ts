import { join } from 'node:path';

import { runPlan } from './cli';
import { readToolchain } from './contracts';
import { buildController } from './controller';
import { runDiscover } from './discover';

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
    await runPlan(process.argv.slice(3));
    break;
  case 'discover':
    await runDiscover(process.argv.slice(3), root);
    break;
  case 'apply':
    throw new Error('Fleet apply is unavailable until F4 supplies persisted operation plans');
  default:
    throw new Error(`Unknown tool-fleet command: ${command}`);
}
