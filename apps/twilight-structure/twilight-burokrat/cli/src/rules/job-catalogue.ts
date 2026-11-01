import { type } from '@shared/validation';

import {
  duplicateJobIds,
  JobCatalogueHeader,
  JobCataloguePath,
  JobType,
  splitEntrypoint,
} from '../contracts/job-catalogue';
import { readSelectedBlob } from '../inventory/read-blob';
import type { CandidateEntry } from '../inventory/read-candidate';
import type { RuleEvaluation, RuleObservation } from './rule';

const DayMillis = 24 * 60 * 60 * 1000;
const Dimensions = ['cpuCores', 'memoryGib', 'tmpDiskGib'] as const;

function isRegularFile(entry: CandidateEntry): boolean {
  return entry.mode === '100644' || entry.mode === '100755';
}

function observe(subject: string, message: string): RuleObservation {
  return { path: JobCataloguePath, subject, message };
}

/** The candidate's catalogue as JSON, or the observation that says why it is not. */
function readCatalogueJson(
  repository: string,
  entries: readonly CandidateEntry[],
  catalogue: CandidateEntry,
): { ok: true; json: unknown } | { ok: false; observation: RuleObservation } {
  if (!isRegularFile(catalogue)) {
    return { ok: false, observation: observe('catalogue', 'the catalogue is not a regular file') };
  }
  const bytes = readSelectedBlob(repository, entries, catalogue.blob, catalogue.path);
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Modeled recovery: undecodable bytes are a defect of the candidate, reported as its finding.
    return { ok: false, observation: observe('catalogue', 'the catalogue is not UTF-8') };
  }
  try {
    return { ok: true, json: JSON.parse(source) as unknown };
  } catch (cause) {
    // Modeled recovery: malformed JSON is a defect of the candidate, reported as its finding.
    const detail = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, observation: observe('catalogue', `the catalogue is not JSON: ${detail}`) };
  }
}

function entrypointIsPresent(
  repository: string,
  entries: readonly CandidateEntry[],
  entrypoint: string,
): boolean {
  const { path, keys } = splitEntrypoint(entrypoint);
  const entry = entries.find((candidateEntry) => candidateEntry.path === path);
  if (entry === undefined || !isRegularFile(entry)) return false;
  if (keys === undefined) return true;
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        readSelectedBlob(repository, entries, entry.blob, entry.path),
      ),
    ) as unknown;
  } catch {
    // Modeled recovery: a JSON entrypoint that does not parse names nothing, so it is absent.
    return false;
  }
  for (const key of keys) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return false;
    value = Reflect.get(value, key);
  }
  return typeof value === 'string';
}

/** Observations for one well-formed job type, in the order the rule's statement lists them. */
function judgeJob(
  repository: string,
  entries: readonly CandidateEntry[],
  job: JobType,
  evaluatedAt: Date,
): RuleObservation[] {
  const observations: RuleObservation[] = [];
  // Proof (2026-11-01): replacing this condition with `false` made `names an entrypoint absent at
  // the revision` and `names a package script entrypoint the package file does not declare` fail.
  if (!entrypointIsPresent(repository, entries, job.entrypoint)) {
    observations.push(observe(job.id, `entrypoint ${job.entrypoint} is absent at the revision`));
  }
  const { provenance } = job;
  if (provenance.kind === 'estimated') {
    // Valid through the last millisecond of `until`, as `inspect-manual` reads a deadline date.
    const expiresAt = Date.parse(`${provenance.until}T00:00:00.000Z`) + DayMillis;
    // Proof (2026-11-01): replacing this comparison with `false` made `fails every estimate on
    // 2026-12-02` exit 0 where 1 was expected; the fifteen other cases still passed.
    if (evaluatedAt.getTime() >= expiresAt) {
      observations.push(
        observe(
          job.id,
          `estimated envelope expired: until ${provenance.until}, judged at ${evaluatedAt.toISOString()}`,
        ),
      );
    }
  } else {
    for (const dimension of Dimensions) {
      // Proof (2026-11-01): comparing with `<=` made the at-p95 half of `names an envelope below
      // its own calibrated p95` fail with a finding; replacing it with `false` failed its first half.
      if (job.envelope[dimension] < provenance.p95[dimension]) {
        observations.push(
          observe(
            job.id,
            `envelope ${dimension} ${String(job.envelope[dimension])} is below its calibrated p95 ${String(provenance.p95[dimension])}`,
          ),
        );
      }
    }
  }
  return observations;
}

/** One malformed entry's observations: a containers value apart, every other field together. */
function judgeMalformed(
  subject: string,
  errors: InstanceType<typeof type.errors>,
): RuleObservation[] {
  const containers = errors.filter((error) => error.path[0] === 'containers');
  const others = errors.filter((error) => error.path[0] !== 'containers');
  const observations: RuleObservation[] = [];
  // Proof (2026-11-01): folding every error into the malformed observation made `names
  // containers that are neither none nor a bound` fail.
  if (containers.length > 0) {
    observations.push(
      observe(
        subject,
        `containers is neither "none" nor a bound { memoryGib, cpuCores }: ${containers.map((error) => error.message).join('; ')}`,
      ),
    );
  }
  if (others.length > 0) {
    observations.push(
      observe(subject, `malformed entry: ${others.map((error) => error.message).join('; ')}`),
    );
  }
  return observations;
}

/**
 * Judges the candidate's job catalogue (`dash-host-jobs` J2) from its revision and the supplied
 * instant alone. A candidate without a catalogue declares no host jobs and has nothing to judge;
 * a catalogue without an instant cannot be judged, because Burokrat reads no clock.
 */
export function judgeJobCatalogue(
  repository: string,
  entries: readonly CandidateEntry[],
  evaluatedAt: Date | undefined,
): RuleEvaluation {
  const catalogue = entries.find((entry) => entry.path === JobCataloguePath);
  // Proof (2026-11-01): returning not-evaluated here made `has nothing to judge in a candidate
  // without a catalogue` fail.
  if (catalogue === undefined) return { kind: 'observed', observations: [] };
  // Proof (2026-11-01): disabling this guard made `cannot judge without the evaluation instant`
  // receive the reason "undefined is not an object (evaluating 'evaluatedAt.getTime')".
  if (evaluatedAt === undefined) {
    return {
      kind: 'not-evaluated',
      reason: `${JobCataloguePath} needs the evaluation instant: pass check --now <UTC instant>; Twilight Dash supplies it`,
    };
  }
  const read = readCatalogueJson(repository, entries, catalogue);
  if (!read.ok) return { kind: 'observed', observations: [read.observation] };
  const header = JobCatalogueHeader(read.json);
  if (header instanceof type.errors) {
    return {
      kind: 'observed',
      observations: [observe('catalogue', `malformed catalogue: ${header.summary}`)],
    };
  }
  const observations: RuleObservation[] = [];
  const ids: string[] = [];
  header.jobs.forEach((candidateJob, index) => {
    const declaredId: unknown =
      typeof candidateJob === 'object' && candidateJob !== null
        ? Reflect.get(candidateJob, 'id')
        : undefined;
    const subject = typeof declaredId === 'string' ? declaredId : `jobs[${String(index)}]`;
    if (typeof declaredId === 'string') ids.push(declaredId);
    const job = JobType(candidateJob);
    // Proof (2026-11-01): pushing nothing here made `names a malformed entry with its field
    // paths`, `names an entry that is not an object by its index` and the containers case fail.
    if (job instanceof type.errors) observations.push(...judgeMalformed(subject, job));
    else observations.push(...judgeJob(repository, entries, job, evaluatedAt));
  });
  // Proof (2026-11-01): judging an empty id list here made `names a duplicate id` fail.
  for (const id of duplicateJobIds(ids)) {
    observations.push(observe(id, `duplicate job type id ${id}`));
  }
  return { kind: 'observed', observations };
}
