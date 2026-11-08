import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { type } from 'arktype';

import { connectRegistryAuthority } from './registry-enrollment';
import { parseRegistryPromotionReceipt, type RegistryPromotionReceipt } from './registry-history';
import type { RegistryJournal } from './registry-managed-journal';
import type { RegistryAuthority } from './registry-publication';
import { managedImageReferences } from './registry-reader';
import { selectDeploymentEnrollment, selectEnvironmentEnrollment } from './registry-selection';

const Identity = type('0 < string <= 256');
const Digest = type(/^sha256:[0-9a-f]{64}$/);
const References = type({ repository: Identity, digest: Digest, '+': 'reject' })
  .array()
  .atLeastLength(1);
const Enrollment = type({
  registryId: Identity,
  registryUrl: Identity,
  owner: Identity,
  product: Identity,
  environment: Identity,
  target: Identity,
  sshHost: /^[a-zA-Z0-9][a-zA-Z0-9.@-]*$/,
  requiredRepositories: Identity.array().atLeastLength(1),
  publicationReceiptPath: Identity.narrow(isAbsolute),
  '+': 'reject',
});
const Receipt = type({
  registryId: Identity,
  operationId: Identity,
  owner: Identity,
  product: Identity,
  roots: Digest.array().atLeastLength(1),
  references: References,
  receipt: { state: "'completed'|'promoted'", at: Identity, '+': 'reject' },
  '+': 'reject',
});
export type DeploymentEnrollment = typeof Enrollment.infer;
export interface RegistryDeployment {
  readonly operationId: string;
  readonly registryId: string;
  readonly product: string;
  readonly environment: string;
  readonly target: string;
  readonly references: readonly { repository: string; digest: string }[];
  /** Only the caller's verified success or explicit reconciled rollback may release its pending owner. */
  finish(
    outcome: 'promoted' | 'reconciled' | 'recovery-required',
  ): Promise<RegistryPromotionReceipt | undefined>;
}

/** Explicit managed selection refuses missing/untrusted input; absence preserves the legacy route. */
export async function readDeploymentEnrollment(
  images: readonly string[],
  target: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DeploymentEnrollment | undefined> {
  const selected = await selectDeploymentEnrollment(images, target, env);
  if (selected === undefined) return undefined;
  return parseDeploymentEnrollment(selected);
}

function parseDeploymentEnrollment(selected: unknown): DeploymentEnrollment {
  const enrollment = Enrollment(selected);
  if (enrollment instanceof type.errors)
    throw new Error('Malformed registry deployment enrollment');
  const endpoint = new URL(enrollment.registryUrl);
  if (
    !['https:', 'http:'].includes(endpoint.protocol) ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.pathname !== '/' ||
    endpoint.search !== '' ||
    endpoint.hash !== ''
  )
    throw new Error('Invalid deployment registry endpoint');
  return enrollment;
}

/** Bind local completed publication evidence to the authority before a native consumer can change. */
export async function prepareManagedDeployment(
  operationId: string,
  images: readonly string[],
  currentImages: readonly string[] | null,
  target: string,
  env: NodeJS.ProcessEnv = process.env,
  recovers?: string,
): Promise<RegistryDeployment | undefined> {
  const enrollment = await readDeploymentEnrollment(
    [...images, ...(currentImages ?? [])],
    target,
    env,
  );
  if (enrollment === undefined) return undefined;
  if (enrollment.target !== target) throw new Error('Deployment target differs from enrollment');
  const descriptor = await open(
    enrollment.publicationReceiptPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let receipt: unknown;
  try {
    const status = await descriptor.stat();
    if (!status.isFile() || status.size > 65536)
      throw new Error('Invalid publication receipt file');
    receipt = JSON.parse(await descriptor.readFile('utf8'));
  } finally {
    await descriptor.close();
  }
  return protectDeployment(
    enrollment,
    receipt,
    images,
    currentImages,
    operationId,
    connectRegistryAuthority(enrollment),
    recovers,
  );
}

function referenceKeys(references: readonly { repository: string; digest: string }[]) {
  return references.map((reference) => `${reference.repository}@${reference.digest}`).sort();
}
function sameReferences(
  left: readonly { repository: string; digest: string }[],
  right: readonly { repository: string; digest: string }[],
) {
  return JSON.stringify(referenceKeys(left)) === JSON.stringify(referenceKeys(right));
}

/**
 * Reuse a completed bundle and an existing environment under the same journal authority.
 * No publication reservation or upload-capacity admission occurs. A failed native operation
 * retains its capability and every desired, observed, candidate and rollback image.
 */
export async function protectDeployment(
  enrollment: DeploymentEnrollment,
  input: unknown,
  images: readonly string[],
  currentImages: readonly string[] | null,
  operationId: string,
  invoke: RegistryAuthority,
  recovers?: string,
  existingOnly = false,
): Promise<
  RegistryDeployment & {
    phase: RegistryJournal['deployments'][number]['phase'];
    promotion: RegistryPromotionReceipt | null;
  }
> {
  const receipt = Receipt(input);
  if (
    receipt instanceof type.errors ||
    receipt.registryId !== enrollment.registryId ||
    receipt.product !== enrollment.product
  )
    throw new Error('Invalid or foreign deployment publication receipt');
  const references = managedImageReferences(images, enrollment.registryUrl);
  if (
    references.length !== images.length ||
    !sameReferences(references, receipt.references) ||
    JSON.stringify(references.map((reference) => reference.repository).sort()) !==
      JSON.stringify([...enrollment.requiredRepositories].sort())
  )
    throw new Error('Deployment images differ from complete publication receipt');
  const initial = await invoke({ command: 'read' });
  if (
    initial.state.enrollment.registryId !== enrollment.registryId ||
    initial.state.maintenance !== null
  )
    throw new Error('Deployment authority identity differs or maintenance owns it');
  const bundle = initial.state.bundles.find((bundle) => bundle.operationId === receipt.operationId);
  if (
    bundle?.owner !== receipt.owner ||
    bundle.product !== receipt.product ||
    !['completed', 'promoted'].includes(bundle.receipt.state) ||
    !sameReferences(bundle.references, receipt.references) ||
    JSON.stringify([...bundle.roots].sort()) !== JSON.stringify([...receipt.roots].sort())
  )
    throw new Error('Publication receipt differs from durable completed bundle');
  const environment = initial.state.environments.find(
    (environment) => environment.environment === enrollment.environment,
  );
  if (
    environment?.owner !== enrollment.owner ||
    environment.product !== enrollment.product ||
    environment.retiredAt !== null
  )
    throw new Error('Missing or foreign enrolled deployment environment');
  const existing = initial.state.deployments.find(
    (deployment) => deployment.operationId === operationId,
  );
  // Proof: removing existing-only refusal makes the resume test create missing ownership.
  if (existingOnly && existing === undefined)
    throw new Error('Missing existing deployment operation');
  if (existingOnly && existing?.recovers !== (recovers ?? null))
    throw new Error('Existing deployment recovery binding differs');
  const recovery = recovers ?? existing?.recovers ?? undefined;
  const interrupted =
    recovery === undefined
      ? undefined
      : initial.state.deployments.find((deployment) => deployment.operationId === recovery);
  if (
    recovery !== undefined &&
    (interrupted?.owner !== enrollment.owner || interrupted.environment !== enrollment.environment)
  )
    throw new Error('Missing or foreign recovery operation');
  const current =
    existing !== undefined
      ? existing.current
      : interrupted === undefined
        ? (environment.releases.at(0) ?? null)
        : interrupted.candidate;
  if (current === null) {
    if (currentImages !== null)
      throw new Error('First-install environment unexpectedly has current images');
  } else {
    const outgoing = initial.state.bundles.find((bundle) => bundle.operationId === current);
    if (
      outgoing === undefined ||
      currentImages === null ||
      !sameReferences(
        managedImageReferences(currentImages, enrollment.registryUrl),
        outgoing.references,
      )
    )
      throw new Error('Current images differ from rollback bundle');
  }
  const admitted =
    existing === undefined
      ? await invoke({
          command: 'begin-deployment',
          expectedRevision: initial.state.revision,
          operationId,
          owner: enrollment.owner,
          environment: enrollment.environment,
          candidate: bundle.operationId,
          current,
          ...(recovery === undefined ? {} : { recovers: recovery }),
        })
      : initial;
  const deployment = admitted.state.deployments.find(
    (deployment) => deployment.operationId === operationId,
  );
  const protection = admitted.state.protections.find(
    (protection) => protection.operationId === operationId,
  );
  if (
    deployment?.owner !== enrollment.owner ||
    deployment.environment !== enrollment.environment ||
    deployment.candidate !== bundle.operationId ||
    deployment.current !== current ||
    deployment.recovers !== (recovery ?? null) ||
    (!['promoted', 'reconciled'].includes(deployment.phase) &&
      protection?.token !== deployment.token) ||
    (deployment.phase === 'promoted' && environment.releases.at(0) !== bundle.operationId)
  )
    throw new Error('Missing durable deployment protection receipt');
  return {
    phase: deployment.phase,
    promotion:
      deployment.phase === 'promoted'
        ? promotionReceipt(admitted.state, enrollment, operationId)
        : null,
    operationId,
    registryId: enrollment.registryId,
    product: enrollment.product,
    environment: enrollment.environment,
    target: enrollment.target,
    references: deployment.references,
    async finish(outcome) {
      const fresh = await invoke({ command: 'read' });
      const settled = fresh.state.deployments.find(
        (candidate) => candidate.operationId === operationId,
      );
      if (
        fresh.state.enrollment.registryId !== enrollment.registryId ||
        settled?.owner !== enrollment.owner ||
        settled.environment !== enrollment.environment ||
        settled.token !== deployment.token
      )
        throw new Error('Completion authority differs from protected operation');
      if (settled.phase === outcome && outcome !== 'recovery-required')
        return outcome === 'promoted'
          ? promotionReceipt(fresh.state, enrollment, operationId)
          : undefined;
      const completed = await invoke({
        command: 'finish-deployment',
        expectedRevision: fresh.state.revision,
        operationId,
        owner: enrollment.owner,
        token: deployment.token,
        outcome,
        reconciled: outcome !== 'recovery-required',
      });
      return outcome === 'promoted'
        ? promotionReceipt(completed.state, enrollment, operationId)
        : undefined;
    },
  };
}

function promotionReceipt(
  state: RegistryJournal,
  enrollment: DeploymentEnrollment,
  operationId: string,
): RegistryPromotionReceipt {
  const environment = state.environments.find(
    (environment) => environment.environment === enrollment.environment,
  );
  const operation = state.deployments.find((operation) => operation.operationId === operationId);
  if (
    environment?.owner !== enrollment.owner ||
    environment.product !== enrollment.product ||
    operation?.phase !== 'promoted' ||
    operation.owner !== enrollment.owner ||
    operation.environment !== enrollment.environment ||
    environment.releases.at(0) !== operation.candidate
  )
    throw new Error('Authority completion omitted the verified environment promotion');
  const releases = environment.releases.map((operationId) => {
    const bundle = state.bundles.find((bundle) => bundle.operationId === operationId);
    if (bundle?.product !== enrollment.product || bundle.receipt.state !== 'promoted')
      throw new Error('Authority history omitted a trusted promoted bundle');
    return { operationId, references: bundle.references, receipt: bundle.receipt };
  });
  return parseRegistryPromotionReceipt({
    registryId: state.enrollment.registryId,
    product: environment.product,
    environment: environment.environment,
    target: enrollment.target,
    authorityRevision: state.revision,
    releases,
    promotion: { operationId, candidate: operation.candidate, at: operation.finishedAt },
  });
}

/** Verify a returned completion against the same SSH authority; no caller status can mint success. */
export async function verifyRegistryPromotion(
  enrollment: DeploymentEnrollment,
  input: unknown,
  invoke: RegistryAuthority = connectRegistryAuthority(enrollment),
): Promise<RegistryPromotionReceipt> {
  const receipt = parseRegistryPromotionReceipt(input);
  const fresh = await invoke({ command: 'read' });
  if (fresh.state.enrollment.registryId !== enrollment.registryId)
    throw new Error('Promotion receipt authority differs');
  const verified = promotionReceipt(fresh.state, enrollment, receipt.promotion.operationId);
  if (
    receipt.authorityRevision > verified.authorityRevision ||
    JSON.stringify({ ...receipt, authorityRevision: 0 }) !==
      JSON.stringify({ ...verified, authorityRevision: 0 })
  )
    throw new Error('Promotion receipt differs from current trusted authority');
  return verified;
}

/** Read a mandatory explicit environment enrollment for supported owner-history initialization/transfer. */
export async function readEnvironmentEnrollment(target: string): Promise<DeploymentEnrollment> {
  return parseDeploymentEnrollment(await selectEnvironmentEnrollment(target));
}

/** Reconcile a locally retained publication after lost persistence without reserve/upload or deployment side effects. */
export async function verifyCompletedPublication(
  enrollment: Pick<
    DeploymentEnrollment,
    'registryId' | 'owner' | 'product' | 'requiredRepositories'
  >,
  input: unknown,
  invoke: RegistryAuthority,
) {
  const receipt = Receipt(input);
  if (
    receipt instanceof type.errors ||
    receipt.registryId !== enrollment.registryId ||
    receipt.owner !== enrollment.owner ||
    receipt.product !== enrollment.product ||
    JSON.stringify(receipt.references.map((reference) => reference.repository).sort()) !==
      JSON.stringify([...enrollment.requiredRepositories].sort())
  )
    throw new Error('Malformed or incomplete publication receipt');
  const current = await invoke({ command: 'read' });
  const bundle = current.state.bundles.find(
    (candidate) => candidate.operationId === receipt.operationId,
  );
  if (
    current.state.enrollment.registryId !== enrollment.registryId ||
    bundle?.owner !== receipt.owner ||
    bundle.product !== receipt.product ||
    !['completed', 'promoted'].includes(bundle.receipt.state) ||
    !sameReferences(bundle.references, receipt.references) ||
    JSON.stringify([...bundle.roots].sort()) !== JSON.stringify([...receipt.roots].sort())
  )
    throw new Error('Publication receipt differs from durable authority');
  return receipt;
}
