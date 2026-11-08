import { mkdtemp } from 'node:fs/promises';

/**
 * Allocates inside FixtureOwnership's fixed synthetic namespace, independently of TMPDIR.
 * Proof: restoring tmpdir() made edge-init-factory-root.test.ts's /var/tmp child
 * fail at the unchanged ownership constructor (puni-factory-root-wrong-parent-red.log).
 */
export async function allocateFactoryRoot(): Promise<string> {
  return mkdtemp('/tmp/edge-init-factory-');
}
