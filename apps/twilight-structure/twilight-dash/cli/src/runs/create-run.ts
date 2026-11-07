import { randomUUID } from 'node:crypto';

import { decodeRun } from './record-codecs';
import type { Run } from './records';

export type RunCreation = Pick<Run, 'projectId' | 'workItemId' | 'manifestDigest' | 'maxAttempts'>;

/**
 * Creates one frozen initial run with a fresh UUIDv4; retain it for creation retries.
 * @throws If project, work item, manifest digest or retry budget violates the portable run codec.
 */
export function createRun(input: RunCreation): Run {
  return Object.freeze(
    // Proof: bypassing decodeRun made all 15 `constructor validation rejects` cases return malformed runs.
    decodeRun({
      version: 1,
      runId: randomUUID(),
      revision: 0,
      projectId: input.projectId,
      workItemId: input.workItemId,
      manifestDigest: input.manifestDigest,
      maxAttempts: input.maxAttempts,
    }),
  );
}
