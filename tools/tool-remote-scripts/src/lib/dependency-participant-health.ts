import { createHash } from 'node:crypto';

import { decodeRoleDependencyCapabilities } from './dependency-capability';
import { readClosed } from './managed-cohort';

export interface ParticipantHttpObservation {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}
function inspectJson(observation: ParticipantHttpObservation): unknown {
  if (
    observation.status !== 200 ||
    !/^application\/json(?:\s*;|$)/i.test(observation.contentType) ||
    Buffer.byteLength(observation.body) > 256 * 1024
  )
    throw new Error('participant HTTP response is unavailable or unsupported');
  const parsed: unknown = JSON.parse(observation.body);
  return parsed;
}
const digest = (body: string) => createHash('sha256').update(body).digest('hex');
/** Product health explicitly reports no checkout identity; independently pinned immutable image provenance is checked separately. */
export function inspectProductBackendHealth(observation: ParticipantHttpObservation): {
  readonly sha256: string;
  readonly commit: null;
} {
  try {
    const body = readClosed(inspectJson(observation), ['status', 'commit']);
    if (body['status'] !== 'ok' || body['commit'] !== null)
      throw new Error('product health differs');
    return { sha256: digest(observation.body), commit: null };
  } catch {
    throw new Error('participant product backend health refused');
  }
}
/** Source health must identify the independently pinned checkout; immutable input and exact process checks establish the separate loaded-input binding. */
export function inspectSourceBackendHealth(
  observation: ParticipantHttpObservation,
  sourceSha: string,
): { readonly sha256: string; readonly commit: string } {
  try {
    const body = readClosed(inspectJson(observation), ['status', 'commit']);
    if (body['status'] !== 'ok' || body['commit'] !== sourceSha)
      throw new Error('source health differs');
    return { sha256: digest(observation.body), commit: sourceSha };
  } catch {
    throw new Error('participant source backend health refused');
  }
}
/** GW/MCP listener health is not backend semantic capability and never substitutes for their pinned role/configuration/process observations. */
export function inspectListenerHealth(observation: ParticipantHttpObservation): {
  readonly sha256: string;
} {
  try {
    const body = readClosed(inspectJson(observation), ['status']);
    if (body['status'] !== 'ok') throw new Error('listener health differs');
    return { sha256: digest(observation.body) };
  } catch {
    throw new Error('participant listener health refused');
  }
}
/** A fresh directly bound backend endpoint must independently advertise its actual backend role and required semantics. */
export function inspectBackendCapability(observation: ParticipantHttpObservation): {
  readonly sha256: string;
} {
  try {
    inspectJson(observation);
    const semantics = decodeRoleDependencyCapabilities(observation.body, 'backend');
    if (semantics.length !== 1) throw new Error('backend semantics absent');
    return { sha256: digest(observation.body) };
  } catch {
    throw new Error('participant backend capability refused');
  }
}
