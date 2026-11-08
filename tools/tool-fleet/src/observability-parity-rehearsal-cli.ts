import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

import { readLabCapacity } from './k3d-lab';
import {
  assessObservabilityRehearsalAdmission,
  prepareObservabilityRehearsal,
  validateObservabilityRehearsal,
} from './observability-parity-rehearsal';

const root = join(import.meta.dir, '../../..');
class InputRefusal extends Error {}
/** Read at most 64 KiB plus one overflow byte, before JSON parsing; only regular files are requests. */
async function readRequest(path: string): Promise<unknown> {
  let bytes: Buffer;
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      if (!(await file.stat()).isFile()) throw new InputRefusal('input-unreadable');
      const buffer = Buffer.alloc(65537);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      // Proof: oversized valid JSON previously prepared a packet (exit 0); the bounded-input negative failed.
      if (length > 65536) throw new InputRefusal('input-too-large');
      bytes = buffer.subarray(0, length);
    } finally {
      await file.close();
    }
  } catch (failure) {
    if (failure instanceof InputRefusal) throw failure;
    throw new InputRefusal('input-unreadable');
  }
  try {
    return JSON.parse(bytes.toString());
  } catch {
    throw new InputRefusal('input-malformed');
  }
}
try {
  const [action, inputPath, destination, ...extra] = process.argv.slice(2);
  // Proof: ignoring extra arguments made the CLI negative observe exit 0 instead of 1.
  if (
    !['prepare', 'validate', 'admit'].includes(action) ||
    !inputPath ||
    !destination ||
    extra.length
  )
    throw new InputRefusal('arguments-refused');
  const tools = process.env['PUNI_PARITY_TOOLS'];
  if (!tools) throw new InputRefusal('pinned-tools-absent');
  const input = await readRequest(inputPath);
  const receipt = await (
    action === 'prepare' ? prepareObservabilityRehearsal : validateObservabilityRehearsal
  )(root, tools, input, destination);
  if (action === 'admit') {
    console.log(
      JSON.stringify({
        scope: 'declared-source-capacity',
        sourceRevision: receipt.sourceRevision,
        artifactSHA256: receipt.artifactSHA256,
        declaredCapacity: receipt.declaredCapacity,
      }),
    );
    const capacity = await readLabCapacity();
    console.log(JSON.stringify({ scope: 'fresh-host-capacity', capacity }));
    console.log(JSON.stringify(assessObservabilityRehearsalAdmission(capacity)));
    process.exitCode = 2;
  } else console.log(JSON.stringify(receipt));
} catch (failure) {
  // Proof: logging the raw failure exposed PRIVATE-MARKER in the unreadable-packet CLI negative.
  console.error(
    `observability rehearsal: ${failure instanceof InputRefusal || (failure instanceof Error && failure.message.startsWith('k3d lab profile platform refused:')) ? failure.message : 'validation-refused'}`,
  );
  process.exitCode = 1;
}
