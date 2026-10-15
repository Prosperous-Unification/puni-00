import { resolve } from 'node:path';

import { readToolchain } from './contracts';
import { buildObjectStore, importObjectStore, readObjectStoreLock } from './object-store-image';

const root = resolve(import.meta.dir, '../../..');
const cluster = 'puni-f11-backup';
const toolchain = await readToolchain(resolve(root, 'infra/versions/toolchain.json'));
const lock = await readObjectStoreLock(
  resolve(root, 'infra/versions/object-store.json'),
  toolchain.runtimeImages.objectStore,
);
const archive = await buildObjectStore(root, lock);
importObjectStore(archive, lock, cluster, `k3d-${cluster}-server-0`, process.env['K3D'] ?? 'k3d');
console.log(`Imported ${lock.image}@${lock.digest} into ${cluster}`);
