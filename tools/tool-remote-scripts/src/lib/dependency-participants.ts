import { createHash } from 'node:crypto';

import { inspectBackendFenceUnderLock } from './backend-exclusion';
import { type DependencyTopology, inspectDependencyTopology } from './dependency-topology';
import type { RunDocker } from './docker-deadline';
import type { EnvLayout } from './env';
import { withLock } from './lock';

/** An observation carries unresolved obligations; it cannot authorize activation or replace fencing. */
export interface DependencyParticipantObservation {
  format: 'dependency-participant-observation';
  version: 1;
  environment: EnvLayout['env'];
  activation: 'blocked';
  retainedBackendAndGatewaySha256: string;
  topology: DependencyTopology;
  unresolved: readonly [
    'ingress-closure',
    'restart-authority',
    'mcp-processes',
    'retained-clients',
    'host-processes',
    'continuous-exclusion',
  ];
}

function hashEvidence(evidence: object): string {
  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

/**
 * Acquire the selected deploy lock exactly once, refresh retained backend/gateway proof and census
 * twice, then refuse drift. The injected inspector must inspect current retained proof under this
 * caller-owned lock; it must never acquire it again. No records or deployment state are published.
 * Observations are inherently bounded readbacks, not continuous physical exclusion or activation.
 * @see docs/runbook-prod-deploy.md#compose-dependency-participant-observation
 */
export async function inspectDependencyParticipants(
  layout: EnvLayout,
  runDocker: RunDocker,
  // Proof: omitting the third argument made the production default-inspector subprocess fail its deadline guard.
  inspectRetained: (deadline: number) => Promise<object> = async (deadline) =>
    await inspectBackendFenceUnderLock(layout, runDocker, deadline),
): Promise<DependencyParticipantObservation> {
  // Proof: removing real flock acquisition admitted the concurrent held-lock production observer negative.
  return await withLock(`${layout.stateDir}/deploy.lock`, async () => {
    const deadline = performance.now() + 60000;
    const retained = hashEvidence(await inspectRetained(deadline));
    const topology = await inspectDependencyTopology(runDocker, deadline);
    const refreshedRetained = hashEvidence(await inspectRetained(deadline));
    const refreshedTopology = await inspectDependencyTopology(runDocker, deadline);
    // Proof: omitting equality admitted retained-proof, restart-policy, Caddy-alternate and process-identity drift.
    if (
      retained !== refreshedRetained ||
      hashEvidence(topology) !== hashEvidence(refreshedTopology)
    )
      throw new Error('dependency participant identity or evidence changed during observation');
    return {
      format: 'dependency-participant-observation',
      version: 1,
      environment: layout.env,
      activation: 'blocked',
      retainedBackendAndGatewaySha256: retained,
      topology,
      unresolved: [
        'ingress-closure',
        'restart-authority',
        'mcp-processes',
        'retained-clients',
        'host-processes',
        'continuous-exclusion',
      ],
    };
  });
}

/** Dedicated read-only preflight cannot mix with deployment, images or mutation flags. */
export function parseDependencyParticipantInvocation(args: string[]): boolean {
  if (!args.some((arg) => arg.startsWith('--inspect-dependency-participants'))) return false;
  // Proof: early CLI admission restored eight watched subprocess refusals before Docker/image/planning work.
  if (args.length !== 2 || args[0] !== 'be' || args[1] !== '--inspect-dependency-participants')
    throw new Error('participant inspection requires exactly be --inspect-dependency-participants');
  return true;
}
