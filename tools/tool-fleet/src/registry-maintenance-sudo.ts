import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as filesystem from 'node:fs/promises';

const executable = '/usr/bin/sudo.ws';
const sha256 = 'e53ac5247a956620a066ae8fcf5393138695fac109efb3ea15b6ae97e6d32442';

/**
 * Only the reviewed classic sudo build may invoke the fixed helper. The authority descriptor
 * crosses its standard-input socket afterward; no close-from option or extra-FD inheritance is used. Verify the fixed canonical root-owned setuid file before every
 * spawn; neither PATH, caller configuration nor a missing binary selects a fallback.
 */
export async function verifyRegistryMaintenanceSudo(): Promise<void> {
  // Proof: canonical-path guard removal accepts the aliased executable in the production verifier negative.
  if ((await filesystem.realpath(executable)) !== executable)
    throw new Error('Fixed maintenance sudo path is not canonical');
  const descriptor = await filesystem.open(
    executable,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    // Proof: metadata guard removal accepts modeled foreign ownership, hard links, non-setuid mode and non-files.
    if (
      !status.isFile() ||
      status.uid !== 0 ||
      status.gid !== 0 ||
      status.nlink !== 1 ||
      (status.mode & 0o7777) !== 0o4755 ||
      status.size <= 0 ||
      status.size > 16 * 1024 ** 2
    )
      throw new Error('Untrusted fixed maintenance sudo metadata');
    // Proof: hash guard removal accepts changed binary bytes in the production verifier negative.
    if (
      createHash('sha256')
        .update(await descriptor.readFile())
        .digest('hex') !== sha256
    )
      throw new Error('Fixed maintenance sudo differs from reviewed binary');
  } finally {
    await descriptor.close();
  }
}
