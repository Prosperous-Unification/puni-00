import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { createObservabilitySource } from './observability-source';
import {
  assertObservabilitySourceParity,
  reviewObservabilitySourceDifferences,
} from './observability-source-parity';
import {
  assertRenderedObservabilitySource,
  renderObservabilitySource,
} from './observability-source-render';
const Requests = type({ local: 'unknown', production: 'unknown', '+': 'reject' });
const digest = (source: unknown) =>
  createHash('sha256').update(JSON.stringify(source)).digest('hex');
/** Complete desired-source command boundary. Explicit network input and pinned artifacts are required; no runtime or actual target state is inferred. */
export async function validateObservabilitySources(root: string, tools: string, input: unknown) {
  const requests = Requests(input);
  if (requests instanceof type.errors) throw new Error('Invalid observability source requests');
  const local = await createObservabilitySource(root, requests.local),
    production = await createObservabilitySource(root, requests.production);
  const left = await renderObservabilitySource(root, tools, local),
    right = await renderObservabilitySource(root, tools, production);
  const differences = reviewObservabilitySourceDifferences(local, production);
  const parity = assertObservabilitySourceParity(local, left, production, right, differences);
  const policy = (source: typeof local) => ({
    network: source.network,
    instances: source.instances.map((instance) => ({
      authority: instance.authority,
      security: instance.security,
      requiredSecrets: instance.requiredSecrets,
    })),
    platformAuthority: source.platformAuthority,
    handoffs: source.handoffs,
    retainedListeners: source.retainedListeners,
  });
  return {
    scope: 'full-service-source-validation' as const,
    sourceSecurityPolicy: true as const,
    ...parity,
    effectiveAuthorityVerified: false as const,
    retainedReaderSourceObserved: false as const,
    operatorAdmissionVerified: false as const,
    claimsBound: false as const,
    capacityObserved: false as const,
    controllerHandoverExecuted: false as const,
    activationReady: false as const,
    externalBindingsVerified: false as const,
    local: assertRenderedObservabilitySource(local, left),
    production: assertRenderedObservabilitySource(production, right),
    sourceSHA256: { local: digest(local), production: digest(production) },
    policySHA256: { local: digest(policy(local)), production: digest(policy(production)) },
    renderedSHA256: { local: digest(left), production: digest(right) },
    requiredHandoffs: production.handoffs.map((handoff) => ({
      owner: handoff.owner,
      path: handoff.path,
      applied: false as const,
    })),
    migrationPrerequisites: production.migrationPrerequisites,
  };
}
