import { createHash } from 'node:crypto';

/**
 * Load a copied byte snapshot already authenticated by the caller's selected archive boundary.
 * The digest names that snapshot and its module-cache identity; it grants no public provenance.
 * No source pathname is reopened by import, and no caller-supplied URL is accepted.
 */
export async function loadForgeRuntime(
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<unknown> {
  const retained = Uint8Array.from(bytes);
  const sha256 = createHash('sha256').update(retained).digest('hex');
  if (sha256 !== expectedSha256)
    throw new Error('retained Forge runtime bytes differ from their authenticated digest');
  const moduleURL =
    'data:text/javascript;sha256=' + sha256 + ';base64,' + Buffer.from(retained).toString('base64');
  return await import(moduleURL);
}
