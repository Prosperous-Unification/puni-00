import { createHash } from 'node:crypto';

import { inspectInstalledWriters, readWriterBytes } from './lib/installed-writers';

/** Offline, read-only inventory. A successful exit denotes matching captured bytes, never adoption. */
export async function inspectWriterCapture(argv: string[]): Promise<void> {
  const [manifestPath, root, ...extra] = argv;
  if (!manifestPath || !root || extra.length !== 0)
    throw new Error('expected <reviewed-manifest.json> <capture-root>');
  const bytes = await readWriterBytes(manifestPath);
  const manifest: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const observation = await inspectInstalledWriters(root, manifest);
  const after = await readWriterBytes(manifestPath);
  // Proof: manifest readback omission admitted the real CLI manifest-drift fault.
  if (!Buffer.from(bytes).equals(Buffer.from(after)))
    throw new Error('manifest changed during observation');
  console.log(
    JSON.stringify({
      ...observation,
      reviewedManifestSha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
}
if (import.meta.main) await inspectWriterCapture(process.argv.slice(2));
