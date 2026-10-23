import { type Type, type } from 'arktype';

// Proof: removing the safe integer limit failed rejects wrong unsafe identity.
const id = type('number.integer >= 1').atMost(Number.MAX_SAFE_INTEGER);
const count = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const text = type.string.matching(/\S/);
// Proof: relaxing revision syntax failed malformed revision is refused before constructing provider paths.
const revision = type.string.matching(/^[a-f0-9]{40}$/);
const repository = type({ full_name: text, private: 'boolean' });
const status = { status: text, conclusion: text.or('null') };
const interval = { started_at: text.or('null'), completed_at: text.or('null') };

/** Pinned 2026-03-10 REST shape; merge_commit_sha was removed from public pull responses. */
// Proof: restoring the legacy required field failed pinned API merged PR omits legacy merge field and resolves its issue merge event.
export const PullSchema = type({
  id,
  number: id,
  title: 'string',
  state: "'open' | 'closed'",
  merged: 'boolean',
  head: { sha: revision },
  base: { repo: repository },
});
export const CheckSchema = type({
  id,
  name: text,
  head_sha: revision,
  ...status,
  ...interval,
  check_suite: { id },
});
export const RunSchema = type({
  id,
  name: text,
  head_sha: revision,
  check_suite_id: id,
  run_attempt: id,
  run_started_at: text.or('null'),
  ...status,
  repository,
});
export const JobSchema = type({
  id,
  run_id: id,
  run_attempt: id,
  head_sha: revision,
  name: text,
  ...status,
  ...interval,
  runner_name: 'string | null',
});
export const EventSchema = type({
  id,
  event: text,
  url: text,
  'commit_id?': revision.or('null'),
  'commit_url?': text.or('null'),
});
export const EventsSchema = EventSchema.array();
export type IssueEvent = typeof EventSchema.infer;
export const ChecksSchema = type({ total_count: count, check_runs: CheckSchema.array() });
export const RunsSchema = type({ total_count: count, workflow_runs: RunSchema.array() });
export const JobsSchema = type({ total_count: count, jobs: JobSchema.array() });
export type Pull = typeof PullSchema.infer;
export type Check = typeof CheckSchema.infer;
export type Run = typeof RunSchema.infer;
export type Job = typeof JobSchema.infer;
export type FailureReason =
  | 'inaccessible'
  | 'rate-limited'
  | 'missing'
  | 'timeout'
  | 'invalid-response'
  | 'revision-changed'
  | 'budget-exceeded'
  | 'provider-unavailable';

/** Only modeled provider failures cross the reader as unavailable readings. */
export class ProviderFailure extends Error {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super(message);
  }
}

/** Validates the untrusted REST boundary without leaking provider payloads into errors. */
export function parseRecord<Schema extends Type>(schema: Schema, input: unknown): Schema['infer'] {
  // Proof: replacing schema(input) with unvalidated input failed schema rejection stops before dependent reads.
  const parsed = schema(input);
  if (parsed instanceof type.errors)
    throw new ProviderFailure('invalid-response', 'GitHub returned malformed records');
  return parsed;
}
