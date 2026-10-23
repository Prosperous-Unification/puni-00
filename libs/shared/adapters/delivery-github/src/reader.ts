import {
  type DeliveryAttempt,
  type DeliveryCheck,
  type DeliveryObservation,
  type DeliveryReader,
  type DeliveryReading,
  type DeliveryRun,
  type DeliverySource,
  DeliveryValidationError,
  validateDeliveryObservation,
} from '@shared/delivery';

import {
  type Check,
  ChecksSchema,
  EventsSchema,
  type Job,
  JobsSchema,
  parseRecord,
  ProviderFailure,
  type Pull,
  PullSchema,
  type Run,
  RunSchema,
  RunsSchema,
} from './records';
import { createTransport, type GitHubDeliveryFetch } from './transport';

export type { GitHubDeliveryFetch } from './transport';

interface PullIdentity {
  repository: string;
  number: number;
  web: string;
  path: string;
}

/** Canonical public PR links only; URLs never become transport destinations. */
function detectPull(url: string): PullIdentity | null {
  // Proof: admitting HTTP failed unsupported URL causes no traffic for http://github.com/a/b/pull/1.
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_][A-Za-z0-9_.-]*)\/pull\/([1-9]\d*)\/?$/.exec(
      url,
    );
  // Proof: removing the safe-integer guard made the oversized-PR unsupported URL negative send a request.
  if (match === null || !Number.isSafeInteger(Number(match[3]))) return null;
  const repository = `${match[1]}/${match[2]}`;
  return {
    repository,
    number: Number(match[3]),
    web: `https://github.com/${repository}`,
    path: `/repos/${repository}`,
  };
}

/**
 * Anonymous read-only public GitHub reader. Caller aborts reject with AbortError;
 * provider refusals, malformed records and bounded-read failures are unavailable.
 * Fetch and wall-clock seams are injectable; no credential configuration exists.
 */
export function createGitHubDeliveryReader(
  options: { fetcher?: GitHubDeliveryFetch; clock?: () => number } = {},
): DeliveryReader {
  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const clock = options.clock ?? Date.now;
  return {
    async read(url, callerSignal) {
      const identity = detectPull(url);
      if (identity === null)
        return {
          kind: 'unsupported',
          reason: 'Only canonical public GitHub pull request URLs are supported',
        };
      const now = clock();
      // Proof: removing clock validation failed invalid trusted clock with a RangeError instead of the named trusted-state error.
      if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000)
        throw new Error('Delivery clock must return a valid epoch millisecond');
      const observedAt = new Date(now).toISOString();
      const controller = new AbortController();
      const signal =
        callerSignal === undefined
          ? controller.signal
          : AbortSignal.any([callerSignal, controller.signal]);
      const timeoutFailure = new ProviderFailure(
        'timeout',
        'GitHub delivery read exceeded 30 seconds',
      );
      // Proof: delaying this timer to 300 seconds failed whole-read timer bounds an uncooperative fetch at 200ms.
      const timeout = setTimeout(() => {
        controller.abort(timeoutFailure);
      }, 30_000);
      let rejectAbort: () => void = () => {
        throw new Error('Abort listener not initialized');
      };
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => {
          reject(
            callerSignal?.aborted
              ? new DOMException('Delivery read cancelled', 'AbortError')
              : timeoutFailure,
          );
        };
        // Proof: removing this listener failed caller cancellation settles before provider completion.
        signal.addEventListener('abort', rejectAbort, { once: true });
        if (signal.aborted) rejectAbort();
      });
      try {
        const transport = createTransport(fetcher, clock, signal);
        return await Promise.race([observePull(identity, observedAt, transport), aborted]);
      } catch (failure) {
        // Proof: removing the rethrow failed unexpected internal failures with a fabricated unavailable reading.
        if (!(failure instanceof ProviderFailure)) throw failure;
        return {
          kind: 'unavailable',
          reason: failure.reason,
          message: failure.message,
          observedAt,
        };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', rejectAbort);
        // Proof: removing cleanup abort failed failed reads abort outstanding provider response work after a body-budget fault.
        controller.abort();
      }
    },
  };
}

type Transport = (path: string) => Promise<unknown>;

/** Reads numbered pages from constructed paths, never provider Link destinations. */
async function readPages<Record extends { id: number }>(
  read: Transport,
  path: string,
  parsePage: (input: unknown) => { total: number; records: Record[] },
): Promise<{ records: Record[]; complete: boolean }> {
  const records: Record[] = [];
  const identities = new Set<number>();
  let total: number | null = null;
  // Proof: permitting page 6 failed five-page check scan instead of returning its 500-record partial inventory.
  for (let page = 1; page <= 5; page++) {
    const parsed = parsePage(
      await read(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${String(page)}`),
    );
    // Proof: removing size/count stability checks independently failed oversized page and changing collection counts.
    if (parsed.records.length > 100 || (total !== null && total !== parsed.total))
      throw new ProviderFailure(
        'invalid-response',
        'GitHub collection count changed or exceeded its page size',
      );
    total = parsed.total;
    for (const record of parsed.records) {
      // Proof: removing duplicate detection failed rejects collection duplicate identity.
      if (identities.has(record.id))
        throw new ProviderFailure('invalid-response', 'GitHub repeated a record identity');
      identities.add(record.id);
      records.push(record);
    }
    // Proof: removing count/absence checks independently failed impossible count and missing records.
    if (records.length > total || (parsed.records.length === 0 && records.length < total))
      throw new ProviderFailure(
        'invalid-response',
        'GitHub collection count contradicted its records',
      );
    if (records.length === total) return { records, complete: true };
  }
  return { records, complete: false };
}

/** Resolves the removed PR merge field from a complete, issue-scoped public event scan. */
async function readMergedRevision(
  identity: PullIdentity,
  repository: string,
  read: Transport,
): Promise<{ revision: string; eventId: number; url: string }> {
  const identities = new Set<number>();
  let merge:
    | { kind: 'none' | 'ambiguous' }
    | { kind: 'one'; revision: string; eventId: number; url: string } = { kind: 'none' };
  const origin = `https://api.github.com/repos/${repository}`;
  // Proof: permitting event page 6 failed bounded-out issue events never establish a unique merged revision.
  for (let page = 1; page <= 5; page++) {
    const events = parseRecord(
      EventsSchema,
      await read(
        `${identity.path}/issues/${String(identity.number)}/events?per_page=100&page=${String(page)}`,
      ),
    );
    // Proof: removing this bound failed rejects oversized issue event pages before any continuation request.
    if (events.length > 100)
      throw new ProviderFailure(
        'invalid-response',
        'GitHub issue event page exceeded its page size',
      );
    for (const event of events) {
      // Proof: removing duplicate/event URL checks independently failed duplicate issue event identities and event association negatives.
      if (identities.has(event.id) || event.url !== `${origin}/issues/events/${String(event.id)}`)
        throw new ProviderFailure(
          'invalid-response',
          'GitHub issue event identity did not match the requested repository',
        );
      identities.add(event.id);
      // Proof: treating non-merge events as merge candidates failed merge event pagination preserves canonical provenance.
      if (event.event !== 'merged') continue;
      // Proof: removing commit presence/URL joins independently failed missing/foreign/different merge commit association negatives.
      if (
        typeof event.commit_id !== 'string' ||
        event.commit_url !== `${origin}/commits/${event.commit_id}`
      )
        throw new ProviderFailure(
          'invalid-response',
          'GitHub merge event did not identify its repository commit',
        );
      // Proof: retaining the last of multiple merge events failed refuses ambiguous merged revision before reading execution history.
      merge =
        merge.kind === 'none'
          ? {
              kind: 'one',
              revision: event.commit_id,
              eventId: event.id,
              url: `${origin}/issues/events/${String(event.id)}`,
            }
          : { kind: 'ambiguous' };
    }
    // Proof: accepting a full page as complete failed bounded-out issue events even with one observed candidate.
    if (events.length < 100) {
      // Proof: removing the exact-one refusal failed refuses missing merged revision before reading execution history.
      if (merge.kind !== 'one')
        throw new ProviderFailure(
          'invalid-response',
          'GitHub merged PR needs exactly one attributed merge event',
        );
      return merge;
    }
  }
  throw new ProviderFailure(
    'budget-exceeded',
    'GitHub merge event history exceeded the five-page scan',
  );
}

function assertPull(pull: Pull, identity: PullIdentity): void {
  // Proof: removing each PR number, repository or public check failed its wrong-association reader negative.
  if (
    pull.number !== identity.number ||
    pull.base.repo.full_name.toLowerCase() !== identity.repository.toLowerCase() ||
    pull.base.repo.private
  )
    throw new ProviderFailure(
      'invalid-response',
      'GitHub PR identity did not match the requested public repository',
    );
  // Proof: removing merged-state validation admitted an open merged PR in malformed merged state.
  if (pull.merged && pull.state !== 'closed')
    throw new ProviderFailure('invalid-response', 'GitHub merged PR state was incomplete');
}

function assertRun(run: Run, identity: PullIdentity, revision: string): void {
  // Proof: removing revision, repository or public checks independently failed run head/repository/private negatives.
  if (
    run.head_sha !== revision ||
    run.repository.full_name.toLowerCase() !== identity.repository.toLowerCase() ||
    run.repository.private
  )
    throw new ProviderFailure(
      'invalid-response',
      'GitHub workflow run did not match the public repository revision',
    );
}

/** Missing check suites remain visible; check coverage excludes statuses and merge policy. */
async function observePull(
  identity: PullIdentity,
  observedAt: string,
  read: Transport,
): Promise<DeliveryReading> {
  const pullPath = `${identity.path}/pulls/${String(identity.number)}`;
  const pull = parseRecord(PullSchema, await read(pullPath));
  assertPull(pull, identity);
  const merged = pull.merged
    ? await readMergedRevision(identity, pull.base.repo.full_name, read)
    : null;
  const checks = await readPages<Check>(
    read,
    `${identity.path}/commits/${pull.head.sha}/check-runs?filter=latest`,
    (input) => {
      const page = parseRecord(ChecksSchema, input);
      return { total: page.total_count, records: page.check_runs };
    },
  );
  const listedRuns = await readPages<Run>(
    read,
    `${identity.path}/actions/runs?head_sha=${pull.head.sha}`,
    (input) => {
      const page = parseRecord(RunsSchema, input);
      return { total: page.total_count, records: page.workflow_runs };
    },
  );
  const notes = new Set<string>([
    'Check coverage includes current check runs only; legacy commit statuses and repository merge policy are not evaluated.',
    'Runner queue eligibility and enqueue timestamps are unavailable; waiting uses attempt start to performed execution start.',
    'Attempt completion timestamps are unavailable; updated_at is not an execution endpoint.',
  ]);
  if (merged !== null)
    notes.add(
      `Merged revision attributed to GitHub issue event ${String(merged.eventId)}: ${merged.url}`,
    );
  const createSource = (id: string, url: string, nativeState: string): DeliverySource => ({
    provider: 'github',
    id: `${identity.repository}:${id}`,
    url,
    nativeState,
    observedAt,
  });
  const mappedChecks: DeliveryCheck[] = checks.records.map((check) => {
    // Proof: removing this guard failed stale check rejection prevents execution inventory reads, despite final semantic validation.
    if (check.head_sha !== pull.head.sha)
      throw new ProviderFailure(
        'invalid-response',
        'GitHub current check revision did not match the PR head',
      );
    const interval = readInterval(check, notes);
    return {
      source: createSource(
        `check:${String(check.id)}`,
        `${identity.web}/pull/${String(identity.number)}/checks?check_run_id=${String(check.id)}`,
        readNativeState(check),
      ),
      name: check.name,
      revision: check.head_sha,
      state: mapState(check),
      ...interval,
    };
  });
  const suites = new Set(checks.records.map((check) => check.check_suite.id));
  for (const run of listedRuns.records) assertRun(run, identity, pull.head.sha);
  // Proof: accepting unrelated suites failed unassociated workflow suites never acquire execution history.
  const selectedRuns = listedRuns.records.filter((run) => suites.has(run.check_suite_id));
  // Proof: omitting checks.complete failed partial checks force partial associated execution inventory.
  let runsComplete = checks.complete && listedRuns.complete && selectedRuns.length <= 10;
  if (!listedRuns.complete || selectedRuns.length > 10)
    notes.add('Workflow run inventory was truncated by the bounded scan.');
  if (!checks.complete) notes.add('Current check inventory was truncated by the bounded scan.');
  const selectedSuites = new Set(selectedRuns.slice(0, 10).map((run) => run.check_suite_id));
  // Proof: unmatched external suites retains its check but fails if missing execution coverage is labeled complete.
  if ([...suites].some((suite) => !selectedSuites.has(suite))) {
    runsComplete = false;
    notes.add(
      'Some current check suites have no associated Actions execution inventory; external or missing executions remain unavailable.',
    );
  }
  const runs: DeliveryRun[] = [];
  // Proof: allowing an eleventh run failed eleven matching workflows are capped to ten with partial inventory.
  for (const run of selectedRuns.slice(0, 10)) {
    const attempts: DeliveryAttempt[] = [];
    const prior = new Map<string, string | null>();
    let previousStart: number | null = null;
    let originalsComplete = true;
    // Proof: allowing attempt 11 failed attempt truncation keeps chronological history and explicit partial total.
    for (let ordinal = 1; ordinal <= Math.min(run.run_attempt, 10); ordinal++) {
      const attempt = parseRecord(
        RunSchema,
        await read(`${identity.path}/actions/runs/${String(run.id)}/attempts/${String(ordinal)}`),
      );
      assertRun(attempt, identity, pull.head.sha);
      // Proof: removing each run/ordinal/suite association failed its wrong attempt identity/ordinal/suite negative.
      if (
        attempt.id !== run.id ||
        attempt.run_attempt !== ordinal ||
        attempt.check_suite_id !== run.check_suite_id
      )
        throw new ProviderFailure(
          'invalid-response',
          'GitHub attempt did not match its workflow run and ordinal',
        );
      const startedAt = attempt.run_started_at;
      // Proof: removing chronological ordering failed attempt chronology and private run responses are rejected.
      if (startedAt !== null && previousStart !== null && Date.parse(startedAt) < previousStart)
        throw new ProviderFailure(
          'invalid-response',
          'GitHub attempt starts were not chronological',
        );
      if (startedAt !== null) previousStart = Date.parse(startedAt);
      const jobs = await readPages<Job>(
        read,
        `${identity.path}/actions/runs/${String(run.id)}/attempts/${String(ordinal)}/jobs`,
        (input) => {
          const page = parseRecord(JobsSchema, input);
          return { total: page.total_count, records: page.jobs };
        },
      );
      const executions = jobs.records.map((job) => {
        // Proof: removing each run/attempt/revision association independently failed wrong job run/attempt/head negatives.
        if (job.run_id !== run.id || job.run_attempt !== ordinal || job.head_sha !== pull.head.sha)
          throw new ProviderFailure(
            'invalid-response',
            'GitHub job did not match its run, attempt and revision',
          );
        const interval = readInterval(job, notes);
        const fingerprint = JSON.stringify([
          job.name,
          job.started_at,
          job.completed_at,
          job.conclusion,
        ]);
        const originalId = prior.get(fingerprint);
        let attribution:
          | { kind: 'performed' | 'carried'; executionId: string }
          | { kind: 'unknown' | 'not-performed'; executionId: null };
        // Proof: removing skipped classification failed skipped inverted intervals stay not-performed with unknown timing.
        if (job.conclusion === 'skipped')
          attribution = { kind: 'not-performed', executionId: null };
        // Proof: removing unknown-timing attribution failed missing execution timing remains unknown rather than zero.
        else if (startedAt === null || job.started_at === null)
          attribution = { kind: 'unknown', executionId: null };
        // Proof: treating copied timestamps as performed failed unique copied execution resolves original identity without counting twice.
        else if (Date.parse(job.started_at) < Date.parse(startedAt)) {
          // Proof: ignoring original-history completeness failed truncated original history cannot establish unique copied execution attribution.
          attribution =
            originalsComplete && typeof originalId === 'string'
              ? { kind: 'carried', executionId: originalId }
              : { kind: 'unknown', executionId: null };
        } else {
          attribution = {
            kind: 'performed',
            executionId: `${identity.repository}:run:${String(run.id)}:job:${String(job.id)}`,
          };
        }
        if (attribution.kind === 'unknown')
          notes.add(
            'Execution attribution is uncertain; copied or missing job timing could not be resolved uniquely.',
          );
        if (attribution.kind === 'performed') {
          // Proof: retaining the last duplicate instead of ambiguity failed ambiguous copied execution stays unknown.
          prior.set(fingerprint, originalId === undefined ? attribution.executionId : null);
        }
        const fields = {
          source: createSource(
            `run:${String(run.id)}:job:${String(job.id)}`,
            `${identity.web}/actions/runs/${String(run.id)}/job/${String(job.id)}`,
            readNativeState(job),
          ),
          name: job.name,
          resource: job.runner_name === '' ? null : job.runner_name,
          state: mapState(job),
          ...interval,
        };
        return { ...fields, ...attribution };
      });
      originalsComplete = originalsComplete && jobs.complete;
      attempts.push({
        source: createSource(
          `run:${String(run.id)}:attempt:${String(ordinal)}`,
          `${identity.web}/actions/runs/${String(run.id)}/attempts/${String(ordinal)}`,
          readNativeState(attempt),
        ),
        startedAt,
        completedAt: null,
        // Proof: ignoring unknown attribution failed ambiguous copied execution makes inventory partial.
        // Proof: ignoring jobs.complete failed truncated job inventory propagates partial performed totals.
        executionsComplete:
          jobs.complete && !executions.some((execution) => execution.kind === 'unknown'),
        executions,
      });
      if (!jobs.complete) notes.add('Execution inventory was truncated by the bounded scan.');
    }
    if (run.run_attempt > 10)
      notes.add('Attempt inventory was truncated after 10 chronological attempts.');
    runs.push({
      source: createSource(
        `run:${String(run.id)}`,
        `${identity.web}/actions/runs/${String(run.id)}`,
        readNativeState(run),
      ),
      name: run.name,
      revision: run.head_sha,
      attemptsComplete: run.run_attempt <= 10,
      attempts,
    });
  }
  const latest = parseRecord(PullSchema, await read(pullPath));
  assertPull(latest, identity);
  // Proof: removing the head comparison failed re-reading the PR rejects a changed head and identity.
  if (
    latest.id !== pull.id ||
    latest.head.sha !== pull.head.sha ||
    latest.state !== pull.state ||
    latest.merged !== pull.merged
  )
    throw new ProviderFailure(
      'revision-changed',
      'The PR changed while GitHub delivery was being read; refresh to retry',
    );
  const observation: DeliveryObservation = {
    version: 1,
    observedAt,
    change: {
      source: createSource(
        `pull:${String(pull.id)}`,
        `${identity.web}/pull/${String(identity.number)}`,
        pull.merged ? 'merged' : pull.state,
      ),
      title: pull.title,
      revision: pull.head.sha,
      state: pull.merged ? 'merged' : pull.state,
      mergedRevision: merged === null ? null : merged.revision,
    },
    checks: mappedChecks,
    runs,
    coverage: {
      checks: checks.complete ? 'complete' : 'partial',
      runs: runsComplete ? 'complete' : 'partial',
      notes: [...notes],
    },
  };
  try {
    // Proof: bypassing semantic validation admitted negative job duration in rejects wrong negative duration.
    return { kind: 'observed', observation: validateDeliveryObservation(observation) };
  } catch (failure) {
    // Proof: removing this typed-error rethrow failed unexpected observation validator dependency faults reject the production reader.
    if (!(failure instanceof DeliveryValidationError)) throw failure;
    throw new ProviderFailure(
      'invalid-response',
      'GitHub delivery records had invalid timing or identities',
    );
  }
}

function readNativeState(record: { status: string; conclusion: string | null }): string {
  return `${record.status}:${record.conclusion ?? 'none'}`;
}
function mapState(record: { status: string; conclusion: string | null }): DeliveryCheck['state'] {
  if (record.status !== 'completed')
    return record.status === 'in_progress'
      ? 'running'
      : ['queued', 'requested', 'waiting', 'pending'].includes(record.status)
        ? 'pending'
        : 'unknown';
  switch (record.conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
    case 'timed_out':
    case 'action_required':
    case 'startup_failure':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}
function readInterval(
  record: { conclusion: string | null; started_at: string | null; completed_at: string | null },
  notes: Set<string>,
) {
  // Proof: retaining native skipped endpoints failed skipped inverted intervals for both check and execution records.
  if (record.conclusion === 'skipped') {
    notes.add(
      'Skipped records did not perform work; provider timestamps are omitted because copied skips may have inverted endpoints.',
    );
    return { startedAt: null, completedAt: null };
  }
  return { startedAt: record.started_at, completedAt: record.completed_at };
}
