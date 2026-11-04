import {
  chmod,
  link,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { createRegistryClientWorkspace } from './registry-client-workspace';
import { requireRejection } from './registry-rejection.fixture';

if (process.getuid?.() !== 0)
  throw new Error('Native client workspace fixture requires mapped root');
process.umask(0o077);
const parent = process.argv.at(2);
if (parent === undefined) throw new Error('Missing workspace fixture parent');
const pool = join(parent, 'pool'),
  external = join(parent, 'external');
await mkdir(pool, { mode: 0o711 });
await chmod(pool, 0o711);
const cases: string[] = [];
const workspace = await createRegistryClientWorkspace(pool);
if ((await readdir(pool)).length !== 1) throw new Error('Owned client job absent');
await workspace.close();
if ((await readdir(pool)).length !== 0) throw new Error('Owned client job remained');
cases.push('fresh-owned-workspace');
await chmod(pool, 0o777);
await requireRejection(createRegistryClientWorkspace(pool));
await chmod(pool, 0o711);
cases.push('wrong-pool-mode');
const alias = join(parent, 'alias');
await symlink(pool, alias);
await requireRejection(createRegistryClientWorkspace(alias));
cases.push('symlink-pool');
const linked = await createRegistryClientWorkspace(pool);
const linkedPath = await realpath(linked.path);
await symlink(external, join(linked.path, 'redirect'));
await requireRejection(linked.close());
if ((await readFile(join(external, 'keep'), 'utf8')) !== 'preserved')
  throw new Error('Cleanup crossed symlink');
await rm(join(linkedPath, 'redirect'));
await rm(linkedPath, { recursive: true });
cases.push('symlink-child-preserves-external');
const hardlinked = await createRegistryClientWorkspace(pool);
const hardlinkedPath = await realpath(hardlinked.path);
await link(join(external, 'keep'), join(hardlinked.path, 'linked'));
await requireRejection(hardlinked.close());
await rm(join(hardlinkedPath, 'linked'));
await rm(hardlinkedPath, { recursive: true });
cases.push('hardlink-child-refuses');
const special = await createRegistryClientWorkspace(pool);
const specialPath = await realpath(special.path);
const child = Bun.spawn(['/usr/bin/mkfifo', '/proc/self/fd/3/fifo'], {
  stdio: ['ignore', 'ignore', 'pipe', special.descriptor.fd],
});
if ((await child.exited) !== 0)
  throw new Error('Cannot create real FIFO: ' + (await new Response(child.stderr).text()));
await requireRejection(special.close());
await rm(join(specialPath, 'fifo'));
await rm(specialPath, { recursive: true });
cases.push('special-file-refuses');
const nested = await createRegistryClientWorkspace(pool);
await mkdir(join(nested.path, 'one/two'), { recursive: true, mode: 0o700 });
await writeFile(join(nested.path, 'one/two/file'), 'owned');
await nested.close();
cases.push('ordinary-nested-cleanup');
const moved = await createRegistryClientWorkspace(pool);
const held = join(parent, 'held-pool');
await rename(pool, held);
await symlink(external, pool);
await mkdir(join(moved.path, 'setup-after-rename'), { mode: 0o700 });
await writeFile(join(moved.path, 'setup-after-rename/owned'), 'anchored', { mode: 0o600 });
await moved.close();
if (
  (await readdir(held)).length !== 0 ||
  (await readFile(join(external, 'keep'), 'utf8')) !== 'preserved'
)
  throw new Error('Cleanup followed replacement pool');
await rm(pool);
await rename(held, pool);
cases.push('renamed-pool-path-preserves-setup-and-cleanup');
const openPaths = [];
for (const fd of await readdir('/proc/self/fd')) {
  try {
    const { readlink } = await import('node:fs/promises');
    const path = await readlink('/proc/self/fd/' + fd);
    if (path.startsWith(pool) || path.startsWith(held)) openPaths.push(path);
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
  }
}
if (openPaths.length !== 0) throw new Error('Workspace descriptors remained open');
console.log(JSON.stringify({ cases, closed: true }));
