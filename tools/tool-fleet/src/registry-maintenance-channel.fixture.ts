import { readdir } from 'node:fs/promises';

import { acceptMaintenanceChannel } from './registry-maintenance-channel';

/** Local native bootstrap fixture: actual current test UID, with no sudo/root effects or registry state reads. */
async function main() {
  // Boundary: an unchecked argv index does not prove the required bootstrap directory was supplied.
  const directory = process.argv[2] as string | undefined;
  const uid = process.getuid?.();
  if (!directory?.startsWith('/tmp/task8-bootstrap-') || uid === undefined)
    throw new Error('Invalid owned bootstrap fixture');
  const before = (await readdir('/proc/self/fd')).length;
  let accepted: boolean;
  try {
    const channel = await acceptMaintenanceChannel(directory, uid);
    accepted = true;
    channel.close();
  } catch {
    // The fixture reports only boolean refusal and descriptor counts, never received payloads.
    accepted = false;
  }
  const after = (await readdir('/proc/self/fd')).length;
  console.log(JSON.stringify({ accepted, descriptorDelta: after - before }));
}
if (import.meta.main) await main();
