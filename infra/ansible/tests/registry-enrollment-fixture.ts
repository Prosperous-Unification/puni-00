import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import {
  admitExportScratch,
  checkExportScratch,
  readPublicationEnrollment,
} from '../../../tools/tool-fleet/src/registry-enrollment';
const endpoint = process.argv.at(2);
if (endpoint === undefined) throw new Error('Missing fixture endpoint');
const enrollment = await readPublicationEnrollment(endpoint);
if (enrollment === undefined) throw new Error('Managed enrollment unexpectedly absent');
const scratch = await admitExportScratch(enrollment);
console.log(JSON.stringify({ identity: scratch.identity, maximumBytes: scratch.maximumBytes }));

if (process.argv[3] === 'oversize') {
  const path = join(enrollment.builder.path, 'oversize-export');
  try {
    await Bun.write(path, new Uint8Array(2 * 1024 * 1024));
    try {
      await checkExportScratch(enrollment, scratch);
      throw new Error('Oversize scratch was admitted');
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('Insufficient scratch budget'))
        throw cause;
    }
    console.log('PASS actual exported bytes exceed scratch envelope before upload');
  } finally {
    await unlink(path);
  }
}
