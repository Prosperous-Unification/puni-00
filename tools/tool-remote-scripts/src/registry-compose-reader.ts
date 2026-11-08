import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseRegistryHistory,
  readRegistrySource,
  readTrustedEnrollment,
  registryHistorySha256,
  serveRegistryReader,
} from '@tools/registry-publication';
import { type } from 'arktype';

import {
  parseComposeRegistry,
  parseRegistryTierState,
  renderRegistryTierState,
} from './lib/registry-state';
import { type ComposeSourceConfiguration, readComposeSource } from './registry-compose-source';

const Scope = type({
  registryId: 'string > 0',
  product: 'string > 0',
  environment: 'string > 0',
  target: 'string > 0',
  '+': 'reject',
});
const Input = type({ scope: Scope, source: 'unknown', '+': 'reject' });
/** Read actual owner state and native Compose consumers; missing state never establishes first-install. */
export async function readComposeHistory(
  input: unknown,
  read: typeof readTrustedEnrollment = readTrustedEnrollment,
) {
  const configuration = Input(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed Compose history reader configuration');
  const source = configuration.source;
  const root = type({ root: 'string > 0' })(source);
  if (root instanceof type.errors || configuration.scope.target !== `compose:${root.root}`)
    throw new Error('Compose history target differs');
  const path = join(root.root, 'state', 'be.json');
  const bytes = await readRegistrySource(path);
  const state = parseRegistryTierState(bytes.text);
  const registry = parseComposeRegistry(state.registry, path);
  for (const key of ['registryId', 'product', 'environment', 'target'] as const)
    if (registry.history[key] !== configuration.scope[key])
      throw new Error('Compose history scope differs');
  const observed = await readComposeSource(source, read);
  const current = registry.history.releases.at(0);
  if (current === undefined && registry.operation === null && observed.hasReleaseEvidence)
    throw new Error('Empty Compose history contradicts release evidence');
  if (
    current === undefined &&
    registry.operation?.phase === 'protected' &&
    observed.references.some(
      (reference) =>
        !registry.operation?.references.some(
          (protectedReference) =>
            protectedReference.repository === reference.repository &&
            protectedReference.digest === reference.digest,
        ),
    )
  )
    throw new Error('First-install consumers differ from protected candidate');
  if (registry.operation === null || registry.operation.phase === 'promoted') {
    const allowed = new Set(
      current?.references.map((reference) => `${reference.repository}@${reference.digest}`) ?? [],
    );
    for (const active of Object.values(observed.active)) {
      if (active !== null && !allowed.has(active.slice(active.indexOf('/') + 1)))
        throw new Error('Compose successful history differs from actual consumers');
    }
    if (
      current !== undefined &&
      Object.values(observed.phases).some((phase) => phase !== null && phase !== 'committed')
    )
      throw new Error('Compose successful history has unresolved phase evidence');
  }
  const references = registry.operation?.phase === 'protected' ? registry.operation.references : [];
  return {
    sourceRevision: `sha256:${createHash('sha256')
      .update(JSON.stringify([bytes.sourceRevision, observed.sourceRevision]))
      .digest('hex')}`,
    references: [
      ...new Map(references.map((reference) => [JSON.stringify(reference), reference])).values(),
    ],
    currentReferences: current?.references ?? [],
    historySha256: registryHistorySha256(registry.history.releases),
    history:
      current === undefined
        ? { state: 'first-install' as const, at: registry.history.genesis.at }
        : {
            state: 'successful' as const,
            complete: true as const,
            releases: registry.history.releases.map((bundle) => bundle.operationId),
          },
  };
}
/** Explicit empty initialization in the existing backend owner state, called under the existing deploy lock. */
export async function initializeComposeHistory(
  scope: typeof Scope.infer,
  source: ComposeSourceConfiguration,
  read: typeof readTrustedEnrollment = readTrustedEnrollment,
): Promise<void> {
  const parsed = Scope(scope);
  if (parsed instanceof type.errors || parsed.target !== `compose:${source.root}`)
    throw new Error('Compose initialization target differs');
  const directory = join(source.root, 'state');
  const status = await stat(directory);
  if (
    (await realpath(directory)) !== directory ||
    !status.isDirectory() ||
    status.uid !== process.getuid?.() ||
    (status.mode & 0o777) !== 0o700
  )
    throw new Error('Compose owner state directory is not canonical and owner-only');
  const observed = await readComposeSource(source, read);
  if (observed.hasReleaseEvidence)
    throw new Error('Existing Compose release evidence prevents empty initialization');
  const path = join(directory, 'be.json');
  const history = parseRegistryHistory(
    {
      ...scope,
      schemaVersion: 1,
      source: path,
      genesis: { at: new Date().toISOString(), sourceRevision: observed.sourceRevision },
      authorityRevision: 0,
      releases: [],
      promotion: null,
    },
    path,
  );
  const descriptor = await open(path, 'wx', 0o600);
  try {
    await descriptor.writeFile(
      renderRegistryTierState({
        tier: 'be',
        activeColor: 'blue',
        lastDeployedSha: null,
        registry: { schemaVersion: 1, history, operation: null },
      }),
    );
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
  const parent = await open(directory, 'r');
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

if (import.meta.main) await serveRegistryReader(readComposeHistory, 'history');
