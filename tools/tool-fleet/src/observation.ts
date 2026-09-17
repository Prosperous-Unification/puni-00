import { createHash } from 'node:crypto';

import type { Capability } from './contracts';

export type DiscoverySource =
  | `provider:${string}`
  | `kubernetes-nodes:${string}`
  | `kubernetes-pvcs:${string}`
  | `kubernetes-pvs:${string}`
  | `kubernetes-volumeattachments:${string}`
  | `ssh-facts:${string}`;

export type ObservedNodeState =
  'enrolled' | 'discovered-unenrolled' | 'missing' | 'ready' | 'not-ready' | 'retiring';

export interface ObservedNode {
  readonly clusterId: string;
  readonly desiredNodeId?: string;
  readonly displayName: string;
  readonly providerIdentity: string;
  readonly privateAddress?: string;
  readonly machineId?: string;
  readonly kubernetesNodeUid?: string;
  readonly kubernetesProviderId?: string;
  readonly capabilities: readonly Capability[];
  readonly states: readonly ObservedNodeState[];
  readonly storageAttachments: readonly string[];
}

export interface FleetObservationBody {
  readonly schemaVersion: 1;
  readonly desiredRevision: string;
  readonly observedAt: string;
  readonly complete: true;
  readonly sources: readonly {
    readonly name: DiscoverySource;
    readonly observedAt: string;
  }[];
  readonly clusters: readonly {
    readonly id: string;
    readonly state: 'ready' | 'not-bootstrapped';
  }[];
  readonly nodes: readonly ObservedNode[];
}

export interface FleetObservation extends FleetObservationBody {
  readonly digest: string;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function serializeObservation(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(serializeObservation).join(',')}]`;
  if (isRecord(input)) {
    return `{${Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${JSON.stringify(key)}:${serializeObservation(value)}`)
      .join(',')}}`;
  }
  return JSON.stringify(input);
}

/** Bind every detailed observation field to the identity consumed by planning. */
export function digestObservation(body: FleetObservationBody): string {
  return createHash('sha256').update(serializeObservation(body)).digest('hex');
}
