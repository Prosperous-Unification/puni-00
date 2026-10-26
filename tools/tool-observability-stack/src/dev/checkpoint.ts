import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import { type } from 'arktype';

import type { ProbeObservation } from './probe';

const Checkpoint = type({
  source: type({ kind: "'local-http-rehearsal'" })
    .or({ kind: "'ssh-dev-container'", containerValidated: 'false', containerId: 'null' })
    .or({ kind: "'ssh-dev-container'", containerValidated: 'true', containerId: /^[a-f0-9]{64}$/ }),
  observationId: 'string',
  traceId: /^[a-f0-9]{32}$/,
  parentSpanId: /^[a-f0-9]{16}$/,
  childSpanId: /^[a-f0-9]{16}$/,
  environment: "'dev'",
  service: "'be-01'",
  producerVersion: 'string',
  revision: type(/^[a-f0-9]{40}$/).or('null'),
  success: 'boolean',
  reason: 'string | null',
  startedAt: 'number',
  finishedAt: 'number',
  observedAt: 'number',
  requestStartedAt: 'number',
  requestFinishedAt: 'number',
  requestDurationMs: 'number | null',
  transportDurationMs: 'number | null',
  publication: type({ state: "'acknowledged'" }).or({ state: "'failed'", reason: 'string' }),
}).or({ state: "'empty'" });

/** Explicit first start creates an exclusive checkpoint; missing/unreadable/malformed existing state throws. */
export function readCheckpoint(path: string, initialize = false): ProbeObservation | undefined {
  if (initialize)
    writeFileSync(path, JSON.stringify({ state: 'empty' }), { flag: 'wx', mode: 0o600 });
  // Proof: actual absent path and mode-000 file throw independently, never produce empty state.
  const text = readFileSync(path, 'utf8');
  // Proof: actual missing/malformed/oversized/future checkpoint tests fail when boundary validation is bypassed.
  if (Buffer.byteLength(text) > 8192) throw new Error('Checkpoint exceeds size bound');
  // Proof: bypassing schema validation accepts the corrupt state tag in the malformed checkpoint test.
  const checked = Checkpoint.assert(JSON.parse(text));
  if ('state' in checked) return undefined;
  // Proof: removing future-time refusal accepts a whole otherwise-consistent observation shifted into the future.
  if (
    checked.observationId.trim() === '' ||
    checked.producerVersion.trim() === '' ||
    checked.childSpanId === checked.parentSpanId ||
    [
      checked.startedAt,
      checked.finishedAt,
      checked.observedAt,
      checked.requestStartedAt,
      checked.requestFinishedAt,
    ].some((time) => !Number.isFinite(time) || time < 0 || time > Date.now()) ||
    checked.startedAt > checked.finishedAt ||
    checked.requestStartedAt > checked.requestFinishedAt ||
    checked.observedAt !== checked.requestFinishedAt ||
    (checked.success && (checked.revision === null || checked.reason !== null))
  )
    throw new Error('Invalid checkpoint observation');
  return checked;
}

/** One bounded checkpoint, atomically replaced; no telemetry history or request bodies are retained. */
export function writeCheckpoint(path: string, observation: ProbeObservation): void {
  const text = JSON.stringify(observation);
  // Proof: removing write bound accepts oversized producer metadata and overwrites the previous checkpoint.
  if (Buffer.byteLength(text) > 8192) throw new Error('Checkpoint exceeds size bound');
  const staging = `${path}.next`;
  writeFileSync(staging, text, { mode: 0o600 });
  renameSync(staging, path);
}
