import { resolve } from 'node:path';

import { readToolchain } from './contracts';
import { buildObjectStore, readObjectStoreLock } from './object-store-image';

const root = resolve(import.meta.dir, '../../..');
const toolchain = await readToolchain(resolve(root, 'infra/versions/toolchain.json'));
const lock = await readObjectStoreLock(
  resolve(root, 'infra/versions/object-store.json'),
  toolchain.runtimeImages.objectStore,
);
console.log(await buildObjectStore(root, lock));
