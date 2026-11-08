import { chmod, lstat, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCAL_DOCKER =
  '#!/bin/sh\nprintf "%s" "$$" > "$4"\n/bin/cat "$3"\nIFS= read -r answer || exit 76\n[ "$answer" = "ACK $2" ] || exit 77\nprintf "PRIVATE_EOF"\n[ "$5" != "stderr" ] || printf "PRIVATE_STDERR_SENTINEL" >&2\n';

/** Fixed test-only CLI installed in the model child's startup environment. Never invokes Docker. */
export async function createProductByteTransportFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'product-byte-cli-'));
  const path = join(directory, 'docker');
  await Bun.write(path, LOCAL_DOCKER);
  await chmod(path, 0o700);
  const identity = await lstat(path, { bigint: true });
  return {
    directory,
    environment: {
      ...process.env,
      PATH: `${directory}:/usr/bin:/bin`,
      PRODUCT_MODEL_DOCKER: path,
      PRODUCT_MODEL_DOCKER_IDENTITY: `${String(identity.dev)}:${String(identity.ino)}`,
    },
  };
}

/** Refuses missing, replaced or misresolved fixture mappings before the production byte transport. */
export async function assertProductByteTransportFixture(): Promise<void> {
  const path = process.env['PRODUCT_MODEL_DOCKER'];
  const expected = process.env['PRODUCT_MODEL_DOCKER_IDENTITY'];
  // Proof: fixture-resolution omission accepted an installed-CLI PATH; byte fixture resolution failed without executing any CLI.
  if (path === undefined || expected === undefined || Bun.which('docker') !== path)
    throw new Error('local product byte CLI mapping absent or misresolved');
  const identity = await lstat(path, { bigint: true });
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('local product byte CLI requires host UID observation');
  // Proof: fixture-content/identity predicate omissions independently admitted changed bytes or a replacement inode; respective fixture negatives failed.
  if (
    !identity.isFile() ||
    identity.uid !== BigInt(uid) ||
    (identity.mode & 0o777n) !== 0o700n ||
    `${String(identity.dev)}:${String(identity.ino)}` !== expected ||
    (await realpath(path)) !== path ||
    (await readFile(path, 'utf8')) !== LOCAL_DOCKER
  )
    throw new Error('local product byte CLI identity or content changed');
}
