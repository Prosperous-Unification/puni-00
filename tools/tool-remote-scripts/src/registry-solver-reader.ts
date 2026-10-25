import { isAbsolute } from 'node:path';

import {
  managedImageReferences,
  readRegistrySource,
  serveRegistryReader,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { decodeSolverSupervisorConfig } from './lib/solver-supervisor-config';

const Input = type({
  configPath: type('string > 0').narrow(isAbsolute),
  registryUrl: 'string > 0',
  '+': 'reject',
});

/** Read the installed complete solver image policy, including idle callers; absence never means empty. */
export async function readSolverConsumers(input: unknown) {
  const configuration = Input(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed solver reader configuration');
  const source = await readRegistrySource(configuration.configPath);
  const policy = decodeSolverSupervisorConfig(JSON.parse(source.text) as unknown);
  return {
    sourceRevision: source.sourceRevision,
    references: managedImageReferences(policy.imageReferences, configuration.registryUrl),
  };
}

if (import.meta.main) await serveRegistryReader(readSolverConsumers);
