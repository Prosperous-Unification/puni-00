import { parseOrThrow, type } from '@shared/validation';

import { IsoInstant, RelativePath, SchemaVersion } from './records';

/** Where every repository keeps the catalogue of its own job types (`dash-host-jobs` J2). */
export const JobCataloguePath = 'infra/jobs/catalogue.json';

const JobId = type(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
/** Upper-cased into `DASH_JOB_UNIT_<ID>`, so it is one identifier word. */
const ExclusiveId = type(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
const WholeUnits = type('number.integer>=1');

/**
 * A repository path, or a JSON file and the dotted key path of one value inside it
 * (`package.json#scripts.test:queued`), for a job that starts from a package script.
 */
const Entrypoint = type('string>=1').narrow((entrypoint, context) => {
  const { path, keys } = splitEntrypoint(entrypoint);
  if (RelativePath(path) instanceof type.errors) return context.mustBe('a repository path');
  if (keys === undefined) return true;
  return path.endsWith('.json') && keys.every((key) => key.length > 0)
    ? true
    : context.mustBe('a JSON file path followed by a nonempty dotted key path');
});

const ShaPlaceholder = '<sha>';
const FullSha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const LiteralArgument = /^[A-Za-z0-9._:=/,+@-]+$/;

/**
 * Space-separated tokens matched one to one against a job's arguments: a literal token, or
 * `<sha>` for one full commit id. The empty profile takes no arguments. There is no optional
 * token: a different argument shape is a different measurement partition (J9), so it is a
 * different profile.
 */
const ArgumentProfile = type('string').narrow((profile, context) =>
  profileTokens(profile).every((token) => token === ShaPlaceholder || LiteralArgument.test(token))
    ? true
    : context.mustBe('space-separated literal tokens or <sha>'),
);

const JobEnvelope = type({
  cpuCores: WholeUnits,
  memoryGib: WholeUnits,
  tmpDiskGib: type('number.integer>=0'),
  exclusive: ExclusiveId.array(),
})
  .onUndeclaredKey('reject')
  .narrow((envelope, context) =>
    new Set(envelope.exclusive).size === envelope.exclusive.length
      ? true
      : context.mustBe('unique exclusive ids'),
  );

/** `none`, or the bound every container the job starts runs under (J16). */
export const JobContainers = type("'none'").or(
  type({ memoryGib: WholeUnits, cpuCores: WholeUnits }).onUndeclaredKey('reject'),
);

/** A calendar date, read as valid through its last UTC millisecond. */
const CalendarDate = type(/^\d{4}-\d{2}-\d{2}$/).narrow((date, context) => {
  const millis = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === date
    ? true
    : context.mustBe('a real calendar date');
});

const EstimatedProvenance = type({
  kind: "'estimated'",
  basis: type('string>=1'),
  until: CalendarDate,
}).onUndeclaredKey('reject');

const CalibratedProvenance = type({
  kind: "'calibrated'",
  hostClass: type('string>=1'),
  calibratedAt: IsoInstant,
  recordCount: WholeUnits,
  p95: type({
    cpuCores: type('number>=0'),
    memoryGib: type('number>=0'),
    tmpDiskGib: type('number>=0'),
  }).onUndeclaredKey('reject'),
  recordIds: type('string>=1').array(),
})
  .onUndeclaredKey('reject')
  .narrow((provenance, context) =>
    new Set(provenance.recordIds).size === provenance.recordCount &&
    provenance.recordIds.length === provenance.recordCount
      ? true
      : context.mustBe('as many unique record ids as its record count'),
  );

/** One declared job type: what it runs, what it reserves and where that figure came from. */
export const JobType = type({
  id: JobId,
  entrypoint: Entrypoint,
  argumentProfile: ArgumentProfile,
  envelope: JobEnvelope,
  containers: JobContainers,
  enforcement: "'observe'|'cap'",
  provenance: EstimatedProvenance.or(CalibratedProvenance),
}).onUndeclaredKey('reject');
export type JobType = typeof JobType.infer;

/** The catalogue file before its entries are judged one by one. */
export const JobCatalogueHeader = type({
  schemaVersion: SchemaVersion,
  jobs: 'unknown[]',
}).onUndeclaredKey('reject');

const JobCatalogue = type({
  schemaVersion: SchemaVersion,
  jobs: JobType.array(),
})
  .onUndeclaredKey('reject')
  .narrow((catalogue, context) => {
    const duplicates = duplicateJobIds(catalogue.jobs.map((job) => job.id));
    return duplicates.length === 0
      ? true
      : context.mustBe(`a catalogue without duplicate ids (repeated: ${duplicates.join(', ')})`);
  });
export type JobCatalogue = typeof JobCatalogue.infer;

/** Each id that appears more than once, once, in order of its first repetition. */
export function duplicateJobIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

/**
 * Parses a job catalogue for a consumer that will act on it, such as Twilight Dash admitting a
 * host job. It checks shape and unique ids only; the dated and revision-bound judgments are the
 * `JOB-CATALOGUE` rule's.
 * @throws ValidationError naming each failing field path.
 */
export function parseJobCatalogue(input: unknown): JobCatalogue {
  return parseOrThrow(JobCatalogue, input);
}

/** The repository path an entrypoint names, and the JSON key path inside it when it has one. */
export function splitEntrypoint(entrypoint: string): { path: string; keys?: string[] } {
  const hash = entrypoint.indexOf('#');
  return hash < 0
    ? { path: entrypoint }
    : { path: entrypoint.slice(0, hash), keys: entrypoint.slice(hash + 1).split('.') };
}

function profileTokens(profile: string): string[] {
  return profile === '' ? [] : profile.split(' ');
}

/**
 * Returns the arguments when they match the job type's argument profile, token for token.
 * @throws Error naming the job type, its profile and the refused arguments.
 */
export function parseJobArguments(jobType: JobType, args: readonly string[]): readonly string[] {
  const tokens = profileTokens(jobType.argumentProfile);
  // Proof (2026-11-01): forcing this to `true` made `refuses arguments outside the argument
  // profile` and `the empty profile takes no arguments` fail.
  const matches =
    tokens.length === args.length &&
    tokens.every((token, index) => {
      const argument = args[index];
      return token === ShaPlaceholder ? FullSha.test(argument) : argument === token;
    });
  if (!matches) {
    throw new Error(
      `job type ${jobType.id}: arguments ${JSON.stringify(args)} do not match its argument profile "${jobType.argumentProfile}"`,
    );
  }
  return args;
}
