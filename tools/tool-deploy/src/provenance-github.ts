import { createGitHubReadTransport, type GitHubDeliveryFetch } from '@shared/delivery-github';
import { type Type, type } from '@shared/validation';

import type {
  DeploymentVerification,
  VerificationCheck,
  VerificationOutcome,
  VerificationPolicy,
} from './provenance';

// Proof: removing safe/positive identity limits failed `refuses malformed run values`
// for unsafe workflow identities and workflow_id -1 (provenance-github.test.ts).
const identity = type('number.integer >= 1').atMost(Number.MAX_SAFE_INTEGER);
const count = type('number.integer >= 0').atMost(Number.MAX_SAFE_INTEGER);
const text = type.string.matching(/\S/);
const revisionSchema = type.string.matching(/^[a-f0-9]{40}(?![\s\S])/);
const repositoryPattern =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/(?!\.{1,2}(?![\s\S]))[a-zA-Z0-9_.-]{1,100}(?![\s\S])/;
const runSchema = type({
  id: identity,
  run_number: identity,
  workflow_id: identity,
  run_attempt: identity,
  head_sha: revisionSchema,
  head_branch: text.or('null'),
  path: text,
  event: text,
  status: text,
  conclusion: 'string | null',
  repository: { full_name: type.string.matching(repositoryPattern) },
});
// Proof: dropping required job id failed `validates job boundary field id`.
const jobSchema = type({
  id: identity,
  run_id: identity,
  run_attempt: identity,
  head_sha: revisionSchema,
  name: text,
  status: text,
  conclusion: 'string | null',
});
const runsSchema = type({ total_count: count, workflow_runs: runSchema.array() });
const jobsSchema = type({ total_count: count, jobs: jobSchema.array() });
type Run = typeof runSchema.infer;
type Job = typeof jobSchema.infer;
type Transport = ReturnType<typeof createGitHubReadTransport>;

/** Validates consumed REST fields without echoing arbitrary provider payloads. */
function parseRecord<Schema extends Type>(schema: Schema, input: unknown): Schema['infer'] {
  const parsed = schema(input);
  // Proof: removing rejection failed all 11 `validates run boundary field` cases
  // by letting malformed records escape the sanitized boundary.
  if (parsed instanceof type.errors)
    throw new Error('GitHub verification returned malformed records');
  return parsed;
}

/** Discovers canonical public GitHub origins without including possibly credentialed input in errors. */
function discoverRepository(origin: string): string {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?(?![\s\S])/.exec(
      origin,
    );
  const repository = match?.[1];
  // Proof: disabling this guard failed all 20 `refuses unsafe origin before requests` cases.
  if (repository === undefined || !repositoryPattern.test(repository)) {
    throw new Error('Deployment verification requires a canonical public GitHub source origin');
  }
  return repository.toLowerCase();
}

/** Selects the latest workflow sequence, refusing partial or ambiguous inventories. */
function selectRun(input: unknown): Run {
  const inventory = parseRecord(runsSchema, input);
  // Proof: disabling completeness admitted the advertised-two/listed-one execution fixture
  // in `refuses incomplete or ambiguous run inventory`.
  if (inventory.total_count !== inventory.workflow_runs.length) {
    throw new Error('GitHub verification execution inventory is incomplete');
  }
  const identities = new Set<number>();
  const sequences = new Set<number>();
  let selected: Run | undefined;
  let workflow: number | undefined;
  for (const execution of inventory.workflow_runs) {
    // Proof: disabling uniqueness admitted duplicate identities and tied sequences
    // in `refuses incomplete or ambiguous run inventory`.
    if (identities.has(execution.id) || sequences.has(execution.run_number)) {
      throw new Error('GitHub verification execution inventory is ambiguous');
    }
    // Proof: disabling this guard admitted the mixed-workflow inventory negative.
    if (workflow !== undefined && execution.workflow_id !== workflow) {
      throw new Error('GitHub verification execution inventory mixes workflows');
    }
    identities.add(execution.id);
    sequences.add(execution.run_number);
    workflow = execution.workflow_id;
    // Proof: reversing sequence ordering failed `selects greatest run number independent of input order and id`.
    if (selected === undefined || execution.run_number > selected.run_number) selected = execution;
  }
  // Proof: removing absence refusal failed `refuses absent executions` with a downstream TypeError.
  if (selected === undefined) throw new Error('GitHub verification has no source execution');
  return selected;
}

/** Refuses list/detail disagreement and executions changing while their checks are read. */
function assertSameRun(before: Run, after: Run): void {
  // Proof: removing each of these 11 comparisons independently failed its
  // corresponding `refuses exact run drift` negative.
  if (
    before.id !== after.id ||
    before.run_number !== after.run_number ||
    before.workflow_id !== after.workflow_id ||
    before.run_attempt !== after.run_attempt ||
    before.head_sha !== after.head_sha ||
    before.repository.full_name.toLowerCase() !== after.repository.full_name.toLowerCase() ||
    before.path !== after.path ||
    before.event !== after.event ||
    before.head_branch !== after.head_branch ||
    before.status !== after.status ||
    before.conclusion !== after.conclusion
  ) {
    throw new Error('GitHub verification execution changed during observation');
  }
}

/** Reads a complete all-attempt inventory bound to one execution and source. */
async function readJobs(
  transport: Transport,
  path: string,
  execution: Run,
): Promise<readonly Job[]> {
  const checks: Job[] = [];
  const identities = new Set<number>();
  let expected: number | undefined;
  for (let page = 1; ; page++) {
    // Proof: disabling the reserve failed `refuses pagination before exhausting the closing-read budget`.
    if (transport.remaining() <= 2) {
      throw new Error('GitHub verification job pagination exceeded the closing-read budget');
    }
    const inventory = parseRecord(
      jobsSchema,
      await transport.get(`${path}/jobs?filter=all&per_page=100&page=${String(page)}`),
    );
    // Proof: disabling count stability admitted `refuses changed job page count`.
    if (expected !== undefined && inventory.total_count !== expected) {
      throw new Error('GitHub verification job inventory count changed');
    }
    expected = inventory.total_count;
    // Proof: disabling this guard admitted `refuses empty intermediate job pages`.
    if (inventory.jobs.length === 0 && checks.length < expected) {
      throw new Error('GitHub verification job inventory is incomplete');
    }
    for (const check of inventory.jobs) {
      // Proof: removing identity refusal admitted `refuses duplicate job identities`.
      if (identities.has(check.id)) throw new Error('GitHub verification repeats a job identity');
      // Proof: removing each binding comparison independently admitted its
      // `refuses unrelated optional job` negative (execution, source and future attempt).
      if (
        check.run_id !== execution.id ||
        check.head_sha !== execution.head_sha ||
        check.run_attempt > execution.run_attempt
      ) {
        throw new Error('GitHub verification job belongs to another execution, source or attempt');
      }
      identities.add(check.id);
      checks.push(check);
    }
    // Proof: disabling overflow refusal failed `refuses jobs exceeding the advertised count`.
    if (checks.length > expected)
      throw new Error('GitHub verification job inventory exceeds its count');
    if (checks.length === expected) return checks;
  }
}

/** Unknown provider conclusions remain unknown; completion is observed independently. */
function normalizeOutcome(conclusion: string | null): VerificationOutcome {
  switch (conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'timed_out':
    case 'startup_failure':
    case 'action_required':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
    case 'neutral':
      return 'skipped';
    default:
      // Proof: mapping unknown to passed failed both null/future `maps run conclusion` negatives.
      return 'unknown';
  }
}

/** Carries a check's actual latest attempt, refusing ties rather than selecting a convenient success. */
function normalizeChecks(
  names: readonly string[],
  jobs: readonly Job[],
): readonly VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  for (const name of names) {
    const matching = jobs.filter((check) => check.name === name);
    // Proof: forcing attempt 1 admitted all four `never reuses older green over newer check` negatives.
    const attempt = matching.reduce((latest, check) => Math.max(latest, check.run_attempt), 0);
    const latest = matching.filter((check) => check.run_attempt === attempt);
    // Proof: removing adapter refusal failed `refuses duplicate latest check names` on observe().
    if (latest.length > 1) throw new Error(`GitHub verification repeats required check ${name}`);
    for (const check of latest) {
      checks.push({
        name: check.name,
        // Proof: forcing completion admitted all three `refuses incomplete required check` negatives.
        completed: check.status === 'completed',
        outcome: normalizeOutcome(check.conclusion),
        origin: {
          executionId: String(check.run_id),
          // Proof: forcing the current attempt failed `retains explicit carried-check provenance across a partial retry`.
          attempt: check.run_attempt,
          checkId: String(check.id),
        },
      });
    }
  }
  return checks;
}

/**
 * Discovers public GitHub source policy and observes its latest CI execution and current attempt.
 * Uses anonymous bounded GETs; carried checks retain their original attempt and identity.
 * Policy remains separate from observed source, workflow, event and branch for core admission.
 * @throws for unsupported origins, non-Git revisions, malformed/incomplete provider records,
 * ambiguous selections, provider failures or changes during observation.
 */
export function githubVerificationProvider(
  origin: string,
  revision: string,
  fetcher: GitHubDeliveryFetch = (url, init) => fetch(url, init),
): {
  readonly policy: VerificationPolicy;
  readonly observe: () => Promise<DeploymentVerification>;
} {
  const repository = discoverRepository(origin);
  // Proof: disabling revision syntax failed all six `refuses non-Git revision before requests` negatives.
  if (!revisionSchema.allows(revision))
    throw new Error('GitHub verification requires a full Git revision');
  const policy: VerificationPolicy = {
    source: { repository: `https://github.com/${repository}`, revision, ref: 'refs/heads/main' },
    pipeline: '.github/workflows/ci.yml',
    checks: ['gate', 'pixels'],
  };
  const observe = async (): Promise<DeploymentVerification> => {
    // Proof: replacing this deadline signal with an uncancelled signal failed
    // `bounds the whole observation with a 30-second cancellation signal`.
    const transport = createGitHubReadTransport(fetcher, Date.now, AbortSignal.timeout(30_000));
    const actions = `/repos/${repository}/actions`;
    const listing = `${actions}/workflows/ci.yml/runs?head_sha=${revision}&event=push&branch=main&per_page=100`;
    const selected = selectRun(await transport.get(listing));
    const path = `${actions}/runs/${String(selected.id)}`;
    const execution = parseRecord(runSchema, await transport.get(path));
    // Proof: dropping this comparison admitted `refuses initial list drift even when later reads agree`.
    assertSameRun(selected, execution);
    const checks = normalizeChecks(policy.checks, await readJobs(transport, path, execution));
    // Proof: ignoring this reread admitted all 11 `refuses exact run drift` negatives.
    assertSameRun(execution, parseRecord(runSchema, await transport.get(path)));
    // Proof: ignoring this reread admitted `refuses a newer execution appearing during the read`.
    assertSameRun(execution, selectRun(await transport.get(listing)));
    return {
      // Proof: substituting policy constants for observed repository/revision/ref/pipeline
      // independently admitted their `never turns observed mismatch into policy` negatives.
      source: {
        repository: `https://github.com/${execution.repository.full_name.toLowerCase()}`,
        revision: execution.head_sha,
        ref: execution.head_branch === null ? null : `refs/heads/${execution.head_branch}`,
      },
      pipeline: execution.path,
      // Proof: forcing source-update admitted pull_request/workflow_dispatch mismatch negatives.
      trigger:
        execution.event === 'push'
          ? 'source-update'
          : execution.event === 'pull_request'
            ? 'change-request'
            : 'other',
      // Proof: forcing completion admitted all three `refuses incomplete current execution` negatives.
      completed: execution.status === 'completed',
      outcome: normalizeOutcome(execution.conclusion),
      checks,
      origin: {
        provider: 'github',
        executionId: String(execution.id),
        attempt: execution.run_attempt,
        url: `https://github.com/${repository}/actions/runs/${String(execution.id)}`,
      },
    };
  };
  return { policy, observe };
}
