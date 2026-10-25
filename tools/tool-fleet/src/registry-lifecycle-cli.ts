import { type } from 'arktype';

import {
  protectDeployment,
  readDeploymentEnrollment,
  readEnvironmentEnrollment,
  verifyCompletedPublication,
  verifyRegistryPromotion,
} from './registry-deployment';
import {
  type DockerPublicationImage,
  publishNativeDockerBundle,
} from './registry-docker-publication';
import {
  connectRegistryAuthority,
  type ManagedRegistry,
  readPublicationEnrollment,
  readTrustedEnrollment,
} from './registry-enrollment';
import {
  advanceRegistryHistory,
  parseRegistryHistory,
  registryHistorySha256,
} from './registry-history';
import type { RegistryAuthority } from './registry-publication';
import { readRegistryBytes } from './registry-stream';

const Text = type('0 < string <= 1024');
const base = { protocol: "'registry-lifecycle/1'" } as const;
const publication = { ...base, registryUrl: Text, target: Text };
const deployment = {
  ...base,
  target: Text,
  images: Text.array().atLeastLength(1),
  currentImages: Text.array().or('null'),
  operationId: Text,
  publication: 'unknown',
  'recovers?': Text,
} as const;
const Request = type.or(
  { ...base, command: "'hello'", '+': 'reject' },
  { ...base, command: "'select-environment'", target: Text, '+': 'reject' },
  { ...publication, command: "'select-publication'", '+': 'reject' },
  { ...publication, command: "'verify-publication'", publication: 'unknown', '+': 'reject' },
  {
    ...publication,
    command: "'publish-docker'",
    images: type({ repository: Text, tag: Text, imageId: /^sha256:[0-9a-f]{64}$/, '+': 'reject' })
      .array()
      .atLeastLength(1),
    '+': 'reject',
  },
  {
    ...base,
    command: "'select-deployment'",
    target: Text,
    images: Text.array().atLeastLength(1),
    '+': 'reject',
  },
  { ...deployment, command: "'protect'|'resume'", '+': 'reject' },
  {
    ...deployment,
    command: "'finish'",
    outcome: "'promoted'|'reconciled'|'recovery-required'",
    '+': 'reject',
  },
  { ...base, command: "'verify-promotion'", target: Text, receipt: 'unknown', '+': 'reject' },
  { ...base, command: "'validate-history'", source: Text, history: 'unknown', '+': 'reject' },
  { ...base, command: "'advance-history'", history: 'unknown', receipt: 'unknown', '+': 'reject' },
);
export interface RegistryLifecyclePorts {
  publication: (registry: string, target: string) => Promise<ManagedRegistry | undefined>;
  deployment: typeof readDeploymentEnrollment;
  environment: typeof readEnvironmentEnrollment;
  publish: (
    enrollment: ManagedRegistry,
    images: readonly DockerPublicationImage[],
  ) => Promise<unknown>;
  authority: (enrollment: { sshHost: string }) => RegistryAuthority;
}
const native: RegistryLifecyclePorts = {
  publication: (registry, target) =>
    readPublicationEnrollment(registry, process.env, readTrustedEnrollment, target),
  deployment: readDeploymentEnrollment,
  environment: readEnvironmentEnrollment,
  publish: publishNativeDockerBundle,
  authority: connectRegistryAuthority,
};

/** Bundled JSON-stdin adapter to the existing authority; private callers never write a second journal. */
export async function executeRegistryLifecycle(
  input: unknown,
  ports: RegistryLifecyclePorts = native,
): Promise<unknown> {
  const request = Request(input);
  if (request instanceof type.errors)
    throw new Error('Unknown registry lifecycle protocol or malformed command');
  const identity = { protocol: 'registry-lifecycle/1', command: request.command };
  if (request.command === 'hello') return { ...identity, status: 'ready' };
  if (request.command === 'select-environment') {
    const enrollment = await ports.environment(request.target);
    return {
      ...identity,
      registryId: enrollment.registryId,
      registryUrl: enrollment.registryUrl,
      product: enrollment.product,
      environment: enrollment.environment,
      target: enrollment.target,
    };
  }
  if (request.command === 'validate-history') {
    const history = parseRegistryHistory(request.history, request.source);
    return { ...identity, history, historySha256: registryHistorySha256(history.releases) };
  }
  if (request.command === 'advance-history')
    return { ...identity, history: advanceRegistryHistory(request.history, request.receipt) };
  if (
    request.command === 'select-publication' ||
    request.command === 'publish-docker' ||
    request.command === 'verify-publication'
  ) {
    const enrollment = await ports.publication(request.registryUrl, request.target);
    if (request.command === 'select-publication')
      return enrollment === undefined
        ? { ...identity, managed: false }
        : {
            ...identity,
            managed: true,
            registryId: enrollment.registryId,
            registryUrl: enrollment.registryUrl,
            product: enrollment.product,
            requiredRepositories: enrollment.requiredRepositories,
          };
    if (enrollment === undefined)
      throw new Error('Managed Docker publication requires installed selection');
    if (request.command === 'verify-publication')
      return {
        ...identity,
        publication: await verifyCompletedPublication(
          enrollment,
          request.publication,
          ports.authority(enrollment),
        ),
      };
    return { ...identity, publication: await ports.publish(enrollment, request.images) };
  }
  if (request.command === 'verify-promotion') {
    const enrollment = await ports.environment(request.target);
    return {
      ...identity,
      receipt: await verifyRegistryPromotion(
        enrollment,
        request.receipt,
        ports.authority(enrollment),
      ),
    };
  }
  const enrollment = await ports.deployment(
    [...request.images, ...('currentImages' in request ? (request.currentImages ?? []) : [])],
    request.target,
  );
  if (request.command === 'select-deployment')
    return enrollment === undefined
      ? { ...identity, managed: false }
      : {
          ...identity,
          managed: true,
          registryId: enrollment.registryId,
          registryUrl: enrollment.registryUrl,
          product: enrollment.product,
          environment: enrollment.environment,
          target: enrollment.target,
        };
  if (enrollment === undefined)
    throw new Error('Managed deployment lifecycle requires installed selection');
  const session = await protectDeployment(
    enrollment,
    request.publication,
    request.images,
    request.currentImages,
    request.operationId,
    ports.authority(enrollment),
    request.recovers,
    request.command === 'resume',
  );
  if (request.command === 'resume')
    return { ...identity, phase: session.phase, receipt: session.promotion };
  if (request.command === 'finish')
    return { ...identity, receipt: await session.finish(request.outcome) };
  return {
    ...identity,
    registryId: session.registryId,
    product: session.product,
    environment: session.environment,
    target: session.target,
    operationId: session.operationId,
    references: session.references,
  };
}
if (import.meta.main) {
  const bytes = await readRegistryBytes(
    Bun.stdin.stream(),
    2 * 1024 ** 2,
    'Registry lifecycle request',
  );
  const reply = await executeRegistryLifecycle(
    JSON.parse(new TextDecoder().decode(bytes)) as unknown,
  );
  process.stdout.write(`${JSON.stringify(reply)}\n`);
}
