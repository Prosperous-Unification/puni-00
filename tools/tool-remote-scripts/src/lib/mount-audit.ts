import { posix } from 'node:path';

import { assertDigestPinnedRef } from './docker';

const AUDIT_PROGRAM = `import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const [source, databaseRoot, basename] = process.argv.slice(1);
if (!source || !databaseRoot || !basename) throw new Error('audit mapping is absent');
const limit = 100000;
const maximumDepth = 64;
// Proof: disabling the deadline callback made the timed production helper negative fail.
const deadline = setTimeout(() => { console.error('mount audit deadline exceeded'); process.exit(70); }, 15000);
try {
  const family = [];
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    let identity;
    try { identity = await lstat(join(databaseRoot, basename + suffix), { bigint: true }); }
    catch (cause) {
      if (suffix !== '' && cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
      throw cause;
    }
    // Proof: omitting this guard admitted nonregular trusted family metadata.
    if (!identity.isFile()) throw new Error('database family audit identity is not a regular file');
    family.push(identity);
  }
  const pending = [{ path: source, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) throw new Error('mount audit queue is incomplete');
    nodes += 1;
    // Proof: adding a different-device shortcut missed the nested-device hardlink negative.
    const identity = await lstat(current.path, { bigint: true });
    if (identity.isFile()) {
      // Proof: omitting inode equality admitted nested main/WAL/SHM/journal hardlinks.
      if (family.some((file) => file.dev === identity.dev && file.ino === identity.ino)) throw new Error('unmanaged database family hardlink');
    } else if (identity.isDirectory()) {
      const children = await readdir(current.path);
      // Proof: omitting the entry bound admitted the oversized audit fixture.
      if (nodes + pending.length + children.length > limit) throw new Error('mount audit entry limit exceeded');
      // Proof: omitting the depth bound admitted the deep audit fixture.
      if (children.length && current.depth >= maximumDepth) throw new Error('mount audit depth limit exceeded');
      for (const child of children) pending.push({ path: join(current.path, child), depth: current.depth + 1 });
    // Proof: omitting this refusal admitted the symbolic-link alias fixture.
    } else throw new Error('mount audit cannot exclude symbolic link or special-file aliases');
  }
  console.log(JSON.stringify({ version: 1, complete: true, nodes }));
} finally { clearTimeout(deadline); }`;

/**
 * Audit every inode, including nested devices, using the daemon's read-only binds.
 * The pinned candidate must already be local. Root plus only DAC_READ_SEARCH can
 * inspect Docker-managed volumes and operator-owned files without host chmod.
 * Network, writable mounts and writable root filesystem are absent. Symlinks,
 * special files, unreadability, 100k entries, depth64 or 15s timeout fail closed.
 */
export async function auditWritableMount(
  source: string,
  databaseHostPath: string,
  image: string,
  runDocker: (args: string[]) => Promise<string>,
): Promise<void> {
  assertDigestPinnedRef(image, 'be');
  if (!/^\/[^\0,\n\r]+$/.test(source) || !/^\/[^\0,\n\r]+$/.test(databaseHostPath))
    throw new Error('mount audit bind paths are malformed');
  // Proof: breaking the local image lookup failed helper-absent before any audit run.
  await runDocker(['image', 'inspect', '--format', '{{.Id}}', image]);
  const output = await runDocker([
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--memory',
    '128m',
    '--pids-limit',
    '16',
    '--user',
    '0:0',
    '--cap-drop',
    'ALL',
    '--cap-add',
    'DAC_READ_SEARCH',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    `type=bind,source=${source},target=/audit,readonly`,
    '--mount',
    `type=bind,source=${posix.dirname(databaseHostPath)},target=/database,readonly`,
    '--entrypoint',
    'bun',
    image,
    '-e',
    AUDIT_PROGRAM,
    '/audit',
    '/database',
    posix.basename(databaseHostPath),
  ]);
  const receipt: unknown = JSON.parse(output);
  const readField = (key: string): unknown =>
    receipt !== null && typeof receipt === 'object' ? Reflect.get(receipt, key) : undefined;
  const nodes = readField('nodes');
  // Proof: omitting receipt validation admitted malformed/incomplete/oversized output.
  if (
    readField('version') !== 1 ||
    readField('complete') !== true ||
    typeof nodes !== 'number' ||
    !Number.isInteger(nodes) ||
    nodes < 1 ||
    nodes > 100000
  )
    throw new Error('mount audit did not prove complete bounded inode exclusion');
}
