import { createHash } from 'node:crypto';

import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import { inspectDependencyIngress } from './dependency-ingress';
import { resolveParticipantHttpEndpoint } from './dependency-participant-endpoint';
import {
  inspectBackendCapability,
  inspectListenerHealth,
  inspectProductBackendHealth,
} from './dependency-participant-health';
import { readParticipantHttp } from './dependency-participant-http';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import {
  observeSelectedProductRole,
  type ProductProcessObservation,
} from './dependency-product-process';

type ProductHealth =
  | { readonly role: 'backend'; readonly capabilitySha256: string }
  | { readonly role: 'gateway'; readonly capabilitySha256: null };
export type ProductParticipantReadiness = ProductHealth & {
  readonly observation: ProductProcessObservation;
  readonly healthSha256: string;
  readonly sha256: string;
};

/** Reads only the exact selected product role under a genuine consumed context. Each HTTP response is followed immediately by the actual observer's private no-rebind inspection and verified helper cleanup. No supplied observation or ready callback can enter this composition; startup convergence and final collector membership remain the coordinator's separate obligations. */
export async function observeProductParticipantReadiness(
  context: FinalizedParticipantRestorationContext,
  role: 'backend' | 'gateway',
): Promise<ProductParticipantReadiness> {
  try {
    // The actual observer validates context before any context fields or transport are used here.
    let observation = await observeSelectedProductRole(context, role);
    // Proof: omitting initial evidence inspection allowed health HTTP after same-byte backup replacement; the genuine PRE negative failed Expected0 / Received1.
    await context.storage.evidence.inspect();
    // Proof: omitting initial artifact inspection allowed health HTTP after valid artifact-root mode drift; the genuine PRE negative failed Expected0 / Received1.
    context.artifact.verify();
    // Proof: omitting initial stores inspection allowed health HTTP after same-byte SQLite main replacement; the genuine PRE negative failed Expected0 / Received1.
    await context.storage.stores.inspect();
    const port = role === 'backend' ? 3100 : 3200;
    const endpoint = resolveParticipantHttpEndpoint(
      context.originals[role],
      observation.runtime,
      context.layouts.prod.network,
      observation.localAddresses,
      observation.listeners,
      port,
    );
    const response = await readParticipantHttp(endpoint.address, port, '/health', context.deadline);
    const health =
      role === 'backend' ? inspectProductBackendHealth(response) : inspectListenerHealth(response);
    // Proof: omitting this immediate health bracket dispatched capability HTTP after modeled process-object drift; its actual HTTP negative failed Expected0 / Received1.
    observation = await observeSelectedProductRole(context, role);
    let semantics: ProductHealth;
    if (role === 'backend') {
      const capability = inspectBackendCapability(
        await readParticipantHttp(
          endpoint.address,
          port,
          '/api/runtime/dependency-capability',
          context.deadline,
        ),
      );
      // Proof: omitting this capability bracket returned readiness after process-object drift; its genuine-context negative failed Missing expected rejection.
      observation = await observeSelectedProductRole(context, role);
      semantics = { role, capabilitySha256: capability.sha256 };
    } else semantics = { role, capabilitySha256: null };
    // Proof: omitting final evidence inspection accepted same-byte backup replacement injected by actual final HTTP; the genuine POST negative lost its required refusal.
    await context.storage.evidence.inspect();
    // Proof: omitting final artifact inspection accepted valid artifact-root mode drift injected by actual final HTTP; the genuine POST negative lost its required refusal.
    context.artifact.verify();
    // Proof: omitting final stores inspection accepted same-byte SQLite main replacement injected by actual final HTTP; the genuine POST negative lost its required refusal.
    await context.storage.stores.inspect();
    // Proof: omitting final ingress inspection accepted actual retained site drift after HTTP; the POST ingress negative lost its required refusal.
    await inspectDependencyIngress(
      context.owner,
      [context.layouts.prod, context.layouts.dev],
      context.ports.docker,
      context.deadline,
    );
    // Proof: omitting final context inspection accepted a same-byte fenced-record replacement during the last actual admin response; the POST context negative lost its required refusal.
    await assertParticipantRestorationContext(context);
    const evidence = { ...semantics, observation, healthSha256: health.sha256 };
    return Object.freeze({
      ...evidence,
      sha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    });
  } catch {
    throw new Error('product participant readiness refused');
  }
}
