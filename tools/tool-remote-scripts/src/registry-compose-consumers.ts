import { serveRegistryReader } from '@tools/registry-publication';

import { readComposeSource } from './registry-compose-source';

/** Actual desired, active, idle and retained containers are separate from successful-history evidence. */
export async function readComposeConsumers(input: unknown) {
  const observed = await readComposeSource(input);
  return { sourceRevision: observed.sourceRevision, references: observed.references };
}
if (import.meta.main) await serveRegistryReader(readComposeConsumers);
