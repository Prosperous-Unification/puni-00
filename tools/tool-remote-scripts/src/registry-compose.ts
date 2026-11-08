import { createHash } from 'node:crypto';

import {
  advanceRegistryHistory,
  connectRegistryAuthority,
  type DeploymentEnrollment,
  managedImageReferences,
  protectDeployment,
  readDeploymentEnrollment,
  readRegistrySource,
  readTrustedEnrollment,
  type RegistryDeployment,
  type RegistryPromotionReceipt,
} from '@tools/registry-publication';
import { type } from 'arktype';

import { writeAtomic } from './lib/atomic';
import { assertDigestPinnedRef, CURRENT_ENV, EDGE_CONTAINER, ROOT } from './lib/docker';
import {
  parseComposeRegistry,
  parseRegistryTierState,
  type RegistryTierState,
  renderRegistryTierState,
} from './lib/registry-state';
import { type Tier } from './lib/state';
import { pinComposeSmoke, runComposeSmoke } from './registry-compose-smoke';
import { type ComposeObservation, readComposeSource } from './registry-compose-source';
import { DockerHost } from './registry-docker-consumers';

export interface ComposeRegistrySession {
  readonly skip?: boolean;
  complete(): Promise<RegistryPromotionReceipt | undefined>;
  preserveState(state: RegistryTierState): RegistryTierState;
}
export interface ComposeRegistryPorts {
  select: typeof readDeploymentEnrollment;
  prepareSmoke: () => Promise<() => Promise<void>>;
  read: (path: string) => Promise<string>;
  write: (path: string, contents: string) => Promise<void>;
  observe: (enrollment: DeploymentEnrollment) => Promise<ComposeObservation>;
  protect: (
    enrollment: DeploymentEnrollment,
    receipt: unknown,
    images: readonly string[],
    current: readonly string[] | null,
    operationId: string,
  ) => Promise<RegistryDeployment>;
}
async function installedComposeConfiguration() {
  const configuration = type({
    schemaVersion: '1',
    host: DockerHost,
    docker: { path: 'string > 0', sha256: /^[0-9a-f]{64}$/, '+': 'reject' },
    smokeSha256: /^[0-9a-f]{64}$/,
    '+': 'reject',
  })(await readTrustedEnrollment('/etc/puni/registry-compose.json'));
  if (configuration instanceof type.errors)
    throw new Error('Malformed installed Compose reader/smoke configuration');
  return configuration;
}
const native: ComposeRegistryPorts = {
  prepareSmoke: async () => {
    const configuration = await installedComposeConfiguration();
    const artifact = await pinComposeSmoke(`${ROOT}/bin/smoke.js`, configuration.smokeSha256);
    return () => runComposeSmoke(artifact, configuration.docker);
  },
  select: readDeploymentEnrollment,
  read: async (path) => (await readRegistrySource(path)).text,
  write: (path, contents) => writeAtomic(path, contents, 0o600),
  observe: async (enrollment) => {
    const configuration = await installedComposeConfiguration();
    return readComposeSource({
      scope: {
        registryId: enrollment.registryId,
        owner: enrollment.owner,
        product: enrollment.product,
        environment: enrollment.environment,
        target: enrollment.target,
      },
      host: configuration.host,
      root: ROOT,
      prefix: CURRENT_ENV.containerPrefix,
      siteAddress: CURRENT_ENV.siteAddress,
      edgeContainer: EDGE_CONTAINER,
      registryUrl: enrollment.registryUrl,
      docker: configuration.docker,
    });
  },
  protect: (enrollment, receipt, images, current, operationId) =>
    protectDeployment(
      enrollment,
      receipt,
      images,
      current,
      operationId,
      connectRegistryAuthority(enrollment),
    ),
};
const Complete = type({ be: 'string > 0', gw: 'string > 0', fe: 'string > 0', '+': 'reject' });
const Receipt = type({
  operationId: 'string > 0',
  references: type({ repository: 'string > 0', digest: /^sha256:[0-9a-f]{64}$/ })
    .array()
    .atLeastLength(1),
});
const tiers: Tier[] = ['be', 'gw', 'fe'];
function imageFor(
  enrollment: DeploymentEnrollment,
  reference: { repository: string; digest: string },
) {
  return `${new URL(enrollment.registryUrl).host}/${reference.repository}@${reference.digest}`;
}

/** Protect a complete three-consumer environment using its full four-image publication under the caller's lock. */
export async function prepareComposeImages(
  selected: Tier[],
  requested: Partial<Record<Tier, string>>,
  sha: string,
  ports: ComposeRegistryPorts = native,
): Promise<ComposeRegistrySession | undefined> {
  const target = `compose:${ROOT}`;
  const enrollment = await ports.select(Object.values(requested), target);
  if (enrollment === undefined) return undefined;
  if (enrollment.target !== target) throw new Error('Compose enrollment target differs');
  const images = Complete(requested);
  // Proof: removing the selected-tier check admitted a be-only request with all image arguments.
  if (
    images instanceof type.errors ||
    selected.length !== 3 ||
    new Set(selected).size !== 3 ||
    !tiers.every((tier) => selected.includes(tier))
  )
    throw new Error('Managed Compose requires all configured be,gw,fe consumers');
  for (const tier of tiers) assertDigestPinnedRef(images[tier], tier);
  const path = `${ROOT}/state/be.json`;
  let owner = parseRegistryTierState(await ports.read(path));
  let registry = parseComposeRegistry(owner.registry, path);
  if (
    registry.history.registryId !== enrollment.registryId ||
    registry.history.product !== enrollment.product ||
    registry.history.environment !== enrollment.environment ||
    registry.history.target !== target
  )
    throw new Error('Compose owner history differs from enrollment');
  const receiptInput: unknown = JSON.parse(await ports.read(enrollment.publicationReceiptPath));
  const receipt = Receipt(receiptInput);
  if (receipt instanceof type.errors)
    throw new Error('Malformed complete Compose publication receipt');
  const full = receipt.references.map((reference) => imageFor(enrollment, reference));
  if (!Object.values(images).every((image) => full.includes(image)))
    throw new Error('Compose consumer differs from complete publication bundle');
  const operationId = `compose-${createHash('sha256')
    .update(JSON.stringify([target, receipt.operationId, sha]))
    .digest('hex')
    .slice(0, 32)}`;
  const previous = registry.history.releases.at(0);
  const current =
    registry.operation?.operationId === operationId
      ? registry.operation.current
      : previous === undefined
        ? null
        : previous.references.map((reference) => imageFor(enrollment, reference));
  const observed = await ports.observe(enrollment);
  const existing = registry.operation;
  if (existing !== null && existing.phase === 'protected' && existing.operationId !== operationId)
    throw new Error('Compose has an unresolved protected deployment');
  if (
    existing?.operationId === operationId &&
    (existing.sha !== sha || JSON.stringify(existing.images) !== JSON.stringify(images))
  )
    throw new Error('Compose resumed candidate changed');
  const allowed = new Set([
    ...(current ?? []),
    ...(existing?.operationId === operationId ? full : []),
  ]);
  for (const tier of tiers) {
    const active = observed.active[tier];
    if (active === null ? previous !== undefined : !allowed.has(active))
      throw new Error('Compose active consumers differ from complete outgoing history');
  }
  const smoke = await ports.prepareSmoke();
  const deployment = await ports.protect(enrollment, receiptInput, full, current, operationId);
  if (
    existing?.operationId === operationId &&
    JSON.stringify(existing.references) !== JSON.stringify(deployment.references)
  )
    throw new Error('Compose durable protection differs from authority');
  registry = {
    ...registry,
    operation: {
      operationId,
      sha,
      current,
      images,
      references: [...deployment.references],
      phase: 'protected',
    },
  };
  owner = { ...owner, registry };
  await ports.write(path, renderRegistryTierState(owner));
  const preserved = () => registry;
  return {
    skip:
      existing?.operationId === operationId &&
      tiers.every(
        (tier) =>
          observed.active[tier] === images[tier] &&
          observed.running[tier] &&
          observed.phases[tier] === 'committed',
      ),
    preserveState(state) {
      return { ...state, registry: preserved() };
    },
    async complete() {
      const verified = await ports.observe(enrollment);
      // Proof: omission promoted before all three active refs and commit phases verified.
      for (const tier of tiers)
        if (
          verified.active[tier] !== images[tier] ||
          !verified.running[tier] ||
          verified.phases[tier] !== 'committed'
        )
          throw new Error('Complete Compose environment is not verified running and committed');
      // Proof: omission promoted despite the shared-smoke failure in registry-compose.test.
      await smoke();
      const receipt = await deployment.finish('promoted');
      if (receipt === undefined) throw new Error('Compose promotion omitted authority history');
      const history = advanceRegistryHistory(registry.history, receipt);
      registry = {
        ...registry,
        history,
        operation: {
          operationId,
          sha,
          current,
          images,
          references: [...deployment.references],
          phase: 'promoted',
        },
      };
      owner = parseRegistryTierState(await ports.read(path));
      await ports.write(path, renderRegistryTierState({ ...owner, registry }));
      if (
        JSON.stringify(
          parseComposeRegistry(parseRegistryTierState(await ports.read(path)).registry, path),
        ) !== JSON.stringify(registry)
      )
        throw new Error('Compose history persistence readback differs');
      return receipt;
    },
  };
}

export interface ComposeRecoveryPorts {
  select: typeof readDeploymentEnrollment;
  read: (path: string) => Promise<string>;
  authority: typeof connectRegistryAuthority;
}
/** Attended backend diagnostics may reuse unresolved whole-environment ownership, but never create or finish it. */
export async function verifyComposeRecovery(
  previous: string,
  candidate: string,
  ports: ComposeRecoveryPorts = {
    select: readDeploymentEnrollment,
    read: native.read,
    authority: connectRegistryAuthority,
  },
): Promise<void> {
  const target = `compose:${ROOT}`;
  const enrollment = await ports.select([previous, candidate], target);
  if (enrollment === undefined) return;
  const path = `${ROOT}/state/be.json`;
  const registry = parseComposeRegistry(
    parseRegistryTierState(await ports.read(path)).registry,
    path,
  );
  if (
    enrollment.target !== target ||
    registry.history.registryId !== enrollment.registryId ||
    registry.history.product !== enrollment.product ||
    registry.history.environment !== enrollment.environment ||
    registry.history.target !== target ||
    registry.operation?.phase !== 'protected' ||
    registry.operation.images.be !== candidate ||
    !registry.operation.current?.includes(previous)
  )
    throw new Error('Compose recovery lacks matching unresolved owner binding');
  const response = await ports.authority(enrollment)({ command: 'read' });
  const state = response.state;
  const environment = state.environments.find(
    (environment) => environment.environment === enrollment.environment,
  );
  const operation = state.deployments.find(
    (operation) => operation.operationId === registry.operation?.operationId,
  );
  const protection = state.protections.find(
    (protection) => protection.operationId === registry.operation?.operationId,
  );
  const bundle = state.bundles.find((bundle) => bundle.operationId === operation?.candidate);
  const outgoing = state.bundles.find((bundle) => bundle.operationId === operation?.current);
  const keys = (references: readonly { repository: string; digest: string }[]) =>
    references
      .map((reference) => `${reference.repository}@${reference.digest}`)
      .sort()
      .join('\n');
  const candidateRefs = managedImageReferences(
    Object.values(registry.operation.images),
    enrollment.registryUrl,
  );
  const diagnosticRefs = managedImageReferences([previous, candidate], enrollment.registryUrl);
  if (
    state.enrollment.registryId !== enrollment.registryId ||
    state.maintenance !== null ||
    environment?.owner !== enrollment.owner ||
    environment.product !== enrollment.product ||
    environment.retiredAt !== null ||
    operation?.owner !== enrollment.owner ||
    operation.environment !== enrollment.environment ||
    !['protected', 'recovery-required'].includes(operation.phase) ||
    operation.reconciledBy !== null ||
    protection?.owner !== enrollment.owner ||
    protection.token !== operation.token ||
    bundle?.product !== enrollment.product ||
    outgoing?.product !== enrollment.product ||
    keys(operation.references) !== keys(registry.operation.references) ||
    keys(protection.references) !== keys(operation.references) ||
    !candidateRefs.every((reference) =>
      bundle.references.some(
        (candidate) =>
          candidate.repository === reference.repository && candidate.digest === reference.digest,
      ),
    ) ||
    keys(managedImageReferences(registry.operation.current, enrollment.registryUrl)) !==
      keys(outgoing.references) ||
    diagnosticRefs.length !== 2 ||
    !diagnosticRefs.every((reference) =>
      protection.references.some(
        (protectedRef) =>
          protectedRef.repository === reference.repository &&
          protectedRef.digest === reference.digest,
      ),
    )
  )
    throw new Error('Compose recovery authority ownership is missing, terminal or mismatched');
}
