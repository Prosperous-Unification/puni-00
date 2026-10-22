import type { commandDefinitions, PlanCommandKind } from '@wbs/contracts';
import {
  type AllowancePercent,
  allowancePercentOf,
  type AttemptOutcome,
  isAttemptOutcome,
  isCurrencyCode,
  isDependencyEndpointScope,
  isIsoDate,
  isMeasureKey,
  isMeasureKind,
  isMeasureScale,
  type IsoDate,
  isResourceKind,
  isSettableStatus,
  isStepState,
  LONGEST_NOT_BEFORE_REASON,
  type MeasureKind,
  type MeasureScale,
  MOST_MEASURE_ORDER,
  MOST_PEOPLE_AT_ONCE,
  MOST_RESOURCE_UNITS,
  parseStepNodeId,
  type ResourceKind,
} from '@wbs/domain';
export type CommandInput<Kind extends PlanCommandKind> =
  (typeof commandDefinitions)[Kind]['schema']['infer'];

type InputWith<Fields extends PropertyKey> = {
  [Kind in PlanCommandKind]: [Fields] extends [keyof CommandInput<Kind>]
    ? CommandInput<Kind>
    : never;
}[PlanCommandKind];

/** A semantic command refusal for the HTTP boundary to contextualize with its index and kind. */
export class CommandNormalizationError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/** Refuses a value that cannot safely supply the schema-named fields its caller reads. */
export function assertRecord(body: unknown): void {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CommandNormalizationError('expected_object');
  }
}

export function refuseDerivedFields(body: object): void {
  if ('number' in body || 'frozenNumber' in body) {
    throw new CommandNormalizationError('number_is_derived');
  }
}

export function asIdOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new CommandNormalizationError(`${field}_must_be_id_or_null`);
  }
  return value;
}

/** The largest own-team set one work item may carry in a single patch. */
export const MOST_TEAMS_ON_ONE_ITEM = 10;

/**
 * How many tags one work item may carry. The whole set is written per patch and
 * joined on every plan read; fifty is generous for a maintained taxonomy while
 * keeping one request and its recurring read cost bounded.
 */
export const MOST_TAGS_ON_ONE_ITEM = 50;

/**
 * How many services one work item may deliver. A service directory is a closed
 * handful rather than an open taxonomy, so ten is independently bounded.
 */
export const MOST_SERVICES_ON_ONE_ITEM = 10;

/**
 * How many work item types one row may carry: one (WBS 010.4.10). The list shape
 * and the join table stay, so several types can return without a migration; a
 * row stored with more is a type conflict that reads whole and is refused here.
 *
 * Kept exported beside the other caps: the retired `typeIds_must_be_at_most_10`
 * codes stay in the contract for the length of a blue/green swap.
 */
export const MOST_TYPES_ON_ONE_ITEM = 1;

/**
 * How many external refs one work item may carry. Ref lists are open like tag
 * taxonomies and may accumulate many PRs, so they retain the larger bound.
 */
export const MOST_REFS_ON_ONE_ITEM = 50;

/**
 * How long a link's one-line display name may be. This text bound stays
 * separate from {@link MOST_REFS_ON_ONE_ITEM}, which counts refs rather than characters.
 */
export const MOST_CHARACTERS_IN_A_REF_NAME = 300;

/**
 * The refs a patch states, validated at this boundary and precise afterwards.
 *
 * Each entry must be an object with a `systemId` and a `url`, both non-empty
 * strings. A URL is **not** parsed here and not checked against `systemOfUrl`:
 * the caller may override a derived type deliberately (design D1), and refusing
 * a mismatch would make an override impossible. What the store still refuses is
 * a `systemId` the directory does not hold.
 *
 * `name` is optional on the wire and required off it. An entry that names none
 * becomes `''` here — the column's own spelling of "nobody has named this link"
 * — so nothing downstream carries an optional field and no insert can reach
 * SQLite with the column missing. An empty string sent deliberately is the same
 * fact and is accepted as it stands, which is what makes clearing a name
 * possible at all.
 *
 * **Both the type and the length are this function's to refuse, and that was
 * measured rather than assumed.** `plan-command-shapes.ts` declares the field as
 * `'name?': 'string'`, which looks like it would refuse a number before this
 * ran — it does not. Probed against `buildApp` on 2026-09-09: a ref entry
 * carrying an **unknown key** is refused by the shape (`{"error":
 * "invalid_body"}`), and a ref entry carrying `name: 7`, `true`, `{}`, `[]` or
 * `null` reaches this parser untouched. So the shape guards the *keys* and this
 * guards the *values*, and a name that is not text gets its own refusal because
 * answering `..._is_too_long` for `name: 7` would be a wrong reason reported
 * confidently. `takes a name per external ref, and bounds its length` in
 * `work-item.controller.test.ts` holds both boundaries, with the probe's own
 * answers written into it.
 *
 * @throws {CommandNormalizationError} for a non-list, an over-long list, an entry that is not
 * `{ systemId, url }`, a `name` that is not text, or one longer than
 * {@link MOST_CHARACTERS_IN_A_REF_NAME} — a malformed request, never a 500.
 */
function asOptionalExternalRefs(
  value: CommandInput<'patchWorkItem'>['patch']['externalRefs'],
): readonly { systemId: string; url: string; name: string }[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new CommandNormalizationError('externalRefs_must_be_a_list');
  }
  if (value.length > MOST_REFS_ON_ONE_ITEM) {
    throw new CommandNormalizationError('too_many_externalRefs');
  }
  return value.map((entry) => {
    assertRecord(entry);
    const systemId = entry.systemId;
    const url = entry.url;
    const name = entry.name;
    if (typeof systemId !== 'string' || systemId === '') {
      throw new CommandNormalizationError('externalRefs_entry_needs_a_systemId');
    }
    if (typeof url !== 'string' || url === '') {
      throw new CommandNormalizationError('externalRefs_entry_needs_a_url');
    }
    if (name !== undefined && typeof name !== 'string') {
      throw new CommandNormalizationError('externalRefs_entry_name_is_not_text');
    }
    if (name !== undefined && name.length > MOST_CHARACTERS_IN_A_REF_NAME) {
      throw new CommandNormalizationError('externalRefs_entry_name_is_too_long');
    }
    return { systemId, url, name: name ?? '' };
  });
}

/**
 * The label set a patch names, whole, or `undefined` where it names none —
 * tags and, since task 10.2, services.
 *
 * **`[]` is a value and means "no tags"** — the one spelling of taking them all
 * off, and deliberately not `null`: there is no column to reset and no third
 * state, so a null arm would be a second spelling of the same fact.
 *
 * Every member must be a string, and the array must be an array: an object or a
 * bare string here is a client sending one id where the field takes a set, and
 * accepting it would write a row per character.
 *
 * Duplicates are **not** refused. The store deduplicates on the way in and the
 * primary key would refuse the pair anyway, so a payload naming one label twice
 * is a client being untidy rather than a request that means something else —
 * and a 400 for it would be this route inventing a rule the model does not have.
 */
export function asOptionalIds(
  value: unknown,
  field: string,
  most: number,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new CommandNormalizationError(`${field}_must_be_a_list_of_ids`);
  }
  if (value.length > most) {
    throw new CommandNormalizationError(`${field}_must_be_at_most_${String(most)}`);
  }
  for (const id of value) {
    if (typeof id !== 'string') {
      throw new CommandNormalizationError(`${field}_must_be_a_list_of_ids`);
    }
  }
  // Every member was checked above; Array.isArray alone retains unknown[].
  return value as readonly string[];
}

/**
 * A type list of at most {@link MOST_TYPES_ON_ONE_ITEM} distinct ids, or
 * `work_item_takes_one_type`. Distinct, because a repeated id names one type and
 * {@link asOptionalIds} accepts duplicates for every label dimension.
 *
 * This is the request's early answer only. `typeIds` and `typeRefs` together, or
 * a ref bound later in the batch, reach `WorkItemService.patch`, which holds the
 * rule for every authored write.
 */
export function asOptionalTypeIds(
  value: unknown,
  field: 'typeIds' | 'typeRefs',
): readonly string[] | undefined {
  const ids = asOptionalIds(value, field, Number.POSITIVE_INFINITY);
  // Proof: `MOST_TYPES_ON_ONE_ITEM` put back to 10 made `refuses two types at the
  // parser, before any command in the batch applies` read the name "Renamed" for
  // two typeIds (the service refused later, after the rename had run) and
  // `unknown_ref` for two typeRefs. Watched 2026-09-27.
  if (ids !== undefined && new Set(ids).size > MOST_TYPES_ON_ONE_ITEM) {
    throw new CommandNormalizationError('work_item_takes_one_type');
  }
  return ids;
}

export function asOptionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new CommandNormalizationError(`${field}_must_be_text`);
  }
  return value;
}

/**
 * Interprets recorded days without replacing the existing invalid_actual refusal.
 *
 * **`0` is accepted and is not the same as absence.** A person typing zero is
 * saying the work took no days, which is a statement they made; the absence of a
 * row is nobody having said anything, and the way to express it is `DELETE`, not
 * this route with a zero in it. Every reading surface follows the same rule —
 * see `actual` in `schema.ts`.
 *
 * Negative days are refused: nobody spends minus a day, and the number would
 * subtract from a parent's roll-up and quietly shrink a branch's recorded total.
 * A non-finite one is refused because `NaN` stored as a real comes back as a
 * number that fails every comparison it is in, including its own.
 */
export function parseActual(body: CommandInput<'setActual'>): number {
  const days = body.days;
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
    throw new CommandNormalizationError('invalid_actual');
  }
  return days;
}

/**
 * Interprets a reported measure with the same numeric rules as {@link parseActual}.
 *
 * **The body key is `value`, not `tokens` or `hours`.** The unit is in the
 * path — `/measures/token_actual/:stepId` — so a key naming one would be the
 * same fact twice, and the two could then disagree: `{"hours": 6}` sent to the
 * `token_actual` path is a request with two answers and no way to pick. One
 * route serves three metrics precisely because the number is the same shape in
 * all of them.
 *
 * The bounds are `parseActual`'s, and for its reasons: `0` is a statement that
 * the work cost nothing and is kept, absence is `DELETE`, a negative figure
 * would subtract from a parent's roll-up, and a non-finite one comes back out
 * of the column failing every comparison including its own. Nobody spends minus
 * a token either.
 *
 * `invalid_measure` rather than `invalid_actual`: a caller reading the refusal
 * has three routes it could have come from, and the one it names is the one it
 * came from.
 */
export function parseMeasure(body: CommandInput<'setMeasure'>): number {
  const value = body.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new CommandNormalizationError('invalid_measure');
  }
  return value;
}

/**
 * The one state a statement is, checked by hand for the reason at the top of
 * this file and for one of its own.
 *
 * **`not_started` is refused, and that is the point.** The absence of a
 * statement is the absence of a row: the way to say it is `DELETE` on this
 * path, never a third value in the column. Accepting it here would give two
 * spellings of "nobody has said" — one of which every reader would then have to
 * fold — and the whole design rests on there being one.
 *
 * `blocked` and `cancelled` are refused for the reason in `design.md` P2: each
 * is a question the engine must answer the day it reads this table, and it does
 * not read it yet. The `CHECK` on the column refuses them again, in the
 * database, so a body this function ever came to let through does not become a
 * row nothing folds.
 */
export function parseProgress(body: CommandInput<'setProgress'>) {
  const state = body.state;
  if (!isStepState(state)) throw new CommandNormalizationError('invalid_progress');
  return state;
}

/** The outcome an attempt ends with, one of `ATTEMPT_OUTCOMES`, checked by hand for `parseProgress`'s reason. */
export function parseOutcome(body: CommandInput<'endAttempt'>): AttemptOutcome {
  const outcome: unknown = body.outcome;
  if (!isAttemptOutcome(outcome)) throw new CommandNormalizationError('invalid_outcome');
  return outcome;
}

/**
 * An attempt's instant: a whole epoch millisecond from 0, or absent for the
 * write stamp. Whether it is in the future is the service's question, asked
 * against the stamp it writes with.
 */
export function asOptionalInstant(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CommandNormalizationError('at_must_be_an_instant');
  }
  return value;
}

/** An attempt's number: a whole number from 1, the lowest a node ever assigns. */
export function parseAttemptNumber(body: CommandInput<'removeAttempt'>): number {
  const attemptNumber: unknown = body.attemptNumber;
  if (
    typeof attemptNumber !== 'number' ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1
  ) {
    throw new CommandNormalizationError('attemptNumber_must_be_a_whole_number_from_1');
  }
  return attemptNumber;
}

export function parseStatus(body: CommandInput<'setStatus'>) {
  const status = body.status;
  if (!isSettableStatus(status)) throw new CommandNormalizationError('invalid_status');
  return status;
}

export function parseOn(body: CommandInput<'setStatus'>): IsoDate | undefined {
  const on = body.on;
  if (on === undefined) return undefined;
  if (!isIsoDate(on)) throw new CommandNormalizationError('on_must_be_a_date');
  return on;
}

/** The day the work began, for a mark that says so; refused when it is not a calendar day. */
export function parseFactStart(body: CommandInput<'setStatus'>): IsoDate | undefined {
  const factStart = body.factStart;
  if (factStart === undefined) return undefined;
  if (!isIsoDate(factStart)) throw new CommandNormalizationError('factStart_must_be_a_date');
  return factStart;
}

/**
 * A calendar day, `null` to clear the constraint, or absent to leave it.
 *
 * Validated here rather than trusted: the column is text, and a date the
 * scheduler cannot parse would throw on every later read of the project — a
 * 422 on one request beats a plan nobody can open.
 */
function asOptionalDate(value: unknown, field: string): IsoDate | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isIsoDate(value)) throw new CommandNormalizationError(`${field}_must_be_a_date`);
  return value;
}

/**
 * Why the work is held back, `null` to take the words off, or absent to leave
 * them.
 *
 * **A blank is `null`, not `''`.** Emptying the field is how a reader takes a
 * reason off, and a stored empty string would be a second spelling of "nobody
 * has said" that every reader would then have to fold — the doctrine `actual`
 * and `step_progress` both state as "the absence of a row". Trimmed for the
 * same reason a band label is: a reason of three spaces is a reason of none,
 * and the difference between them is invisible on every surface that shows it.
 *
 * Bounded at {@link LONGEST_NOT_BEFORE_REASON}, and this is the only boundary
 * a value can enter through: the column is `text`, SQLite counts no characters,
 * and the migration argues why a `CHECK` on this table would answer 500 to the
 * outgoing release mid-swap. The bound is measured **after** the trim, so
 * trailing whitespace cannot spend it.
 *
 * The pair rule — a reason needs a date — is deliberately not here. It is a
 * question about the row as it will stand, and this function has only the
 * request; `WorkItemStore.patch` asks it inside the transaction that writes.
 */
function asOptionalReason(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new CommandNormalizationError(`${field}_must_be_text`);
  }
  const trimmed = value.trim();
  if (trimmed.length > LONGEST_NOT_BEFORE_REASON) {
    throw new CommandNormalizationError(
      `${field}_must_be_at_most_${String(LONGEST_NOT_BEFORE_REASON)}_characters`,
    );
  }
  return trimmed === '' ? null : trimmed;
}

/**
 * A priority of 1 or more, `null` to leave the work with no priority, or absent to leave it
 * as it is.
 *
 * Validated here rather than trusted, for the reason the date above it is: this
 * is the only gate in front of the column. A 0, a negative or a fraction stores
 * a order the leveller will honour and nobody could have meant — the queue comes
 * out in an order with no explanation on screen, which is worse than a refusal.
 * `Number.isSafeInteger` covers the fraction, the `NaN`, the infinity and the
 * value beyond what an integer column can hold, in one question; `typeof` is
 * asked first because `true` and `'2'` are not numbers and JSON lets them
 * through.
 *
 * No ceiling. "From 1 to infinity" was the ask, and how large a planner's own
 * scale runs is not this API's to decide.
 */
export function asOptionalPriority(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new CommandNormalizationError(`${field}_must_be_a_whole_number_from_1`);
  }
  return value;
}

/**
 * How many people may be on one work item at once: a whole number of 1 to
 * {@link MOST_PEOPLE_AT_ONCE}, `null` to put it back to one at a time, or
 * absent to leave it.
 *
 * The floor is 1 and it is load-bearing rather than tidy. A 0 stored here is a
 * **width of 0**, and the engine's duration is `effort / width` — so a single
 * mistyped 0 turns every date in the plan into `Infinity`, and no screen
 * anywhere could say why. This validation is the whole of what stands between
 * that and the column.
 *
 * The ceiling is {@link MOST_PEOPLE_AT_ONCE}, and it moved into `libs/wbs/domain/domain` in
 * `capacity-per-project`: three boundaries state it now, this file's copy and
 * `directory.routes.ts`'s agreed by luck, and the third would have been where
 * they drifted. The argument for the number is on the constant.
 *
 * `Number.isSafeInteger` covers the fraction, the `NaN`, the infinity and the
 * value beyond what an integer column can hold in one question — which is why
 * the ceiling's own negative uses `1001` and not `1e999`: `1e999` parses to
 * `Infinity`, `Number.isInteger(Infinity)` is false, and a range check deleted
 * under a `1e999` probe would stay green. That exact vacuous check has shipped
 * here before (`T1 column-widths-drag`).
 */
function asOptionalParallelism(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new CommandNormalizationError(`${field}_must_be_a_whole_number_from_1`);
  }
  if (value > MOST_PEOPLE_AT_ONCE) {
    throw new CommandNormalizationError(`${field}_must_be_at_most_${String(MOST_PEOPLE_AT_ONCE)}`);
  }
  return value;
}

export function parsePatch(body: CommandInput<'patchWorkItem'>['patch']) {
  assertRecord(body);
  refuseDerivedFields(body);
  if ('teamIds' in body && 'serviceTeamId' in body) {
    throw new CommandNormalizationError('cannot_send_both_teamIds_and_serviceTeamId');
  }
  return present({
    name: asOptionalText(body.name, 'name'),
    notes: asOptionalText(body.notes, 'notes'),
    startNoEarlierThan: asOptionalDate(body.startNoEarlierThan, 'startNoEarlierThan'),
    startNoEarlierThanReason: asOptionalReason(
      body.startNoEarlierThanReason,
      'startNoEarlierThanReason',
    ),
    deadline: asOptionalDate(body.deadline, 'deadline'),
    factStart: asOptionalDate(body.factStart, 'factStart'),
    factEnd: asOptionalDate(body.factEnd, 'factEnd'),
    priority: asOptionalPriority(body.priority, 'priority'),
    serviceTeamId:
      'serviceTeamId' in body ? asIdOrNull(body.serviceTeamId, 'serviceTeamId') : undefined,
    teamIds: asOptionalIds(body.teamIds, 'teamIds', MOST_TEAMS_ON_ONE_ITEM),
    serviceIds: asOptionalIds(body.serviceIds, 'serviceIds', MOST_SERVICES_ON_ONE_ITEM),
    maxParallel: asOptionalParallelism(body.maxParallel, 'maxParallel'),
    tagIds: asOptionalIds(body.tagIds, 'tagIds', MOST_TAGS_ON_ONE_ITEM),
    typeIds: asOptionalTypeIds(body.typeIds, 'typeIds'),
    externalRefs: asOptionalExternalRefs(body.externalRefs),
  });
}

/** A string, or the field's `_must_be_text` refusal. */
export function asText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new CommandNormalizationError(`${field}_must_be_text`);
  }
  return value;
}

/** An id, or the field's `_must_be_an_id` refusal; absent is allowed for a `…Ref`. */
export function asOptionalId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new CommandNormalizationError(`${field}_must_be_an_id`);
  }
  return value;
}

/** The most characters an **Agent run** may carry; the `claim.run_id` CHECK holds the same bound. */
export const MOST_CHARACTERS_IN_A_RUN_ID = 256;

/**
 * An opaque agent run of 1 to {@link MOST_CHARACTERS_IN_A_RUN_ID} characters, or
 * absent. Never parsed: the harness formats it (`wbs-team-claims` D5).
 */
export function asOptionalRunId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Proof: with the length bound removed, `bounds a claim’s run to 1 to 256
  // characters…` (command-normalizers.test.ts) normalized 257; watched 2026-10-19.
  if (typeof value !== 'string' || value.length === 0 || value.length > MOST_CHARACTERS_IN_A_RUN_ID)
    throw new CommandNormalizationError('runId_must_be_1_to_256_characters');
  return value;
}

/**
 * A claim's or release's named steps: absent, or 1 to {@link MOST_REFS_ON_ONE_ITEM}
 * ids. An empty list names nothing to hold, and answered alreadyHeld before
 * this refused it.
 */
export function asOptionalStepIds(value: unknown): readonly string[] | undefined {
  const stepIds = asOptionalIds(value, 'steps', MOST_REFS_ON_ONE_ITEM);
  // Proof: with this refusal removed, `refuses an empty step list` (command-normalizers.test.ts)
  // normalized `steps: []`; watched 2026-10-19.
  if (stepIds?.length === 0) throw new CommandNormalizationError('steps_must_name_a_step');
  return stepIds;
}

/**
 * A claim's `resources` (`wbs-resources` R4): absent, or 1 to
 * {@link MOST_REFS_ON_ONE_ITEM} entries of `{ resourceId, units }`, each naming
 * a different resource with a whole number of units from 1 to
 * {@link MOST_RESOURCE_UNITS}. An empty list asks for nothing and is refused as
 * an empty `steps` is; a resource named twice asks for two answers at once.
 *
 * Proof: with the duplicate refusal removed, `refuses resources naming one
 * resource twice` (command-normalizers.test.ts) normalized both entries;
 * watched 2026-10-20.
 */
export function asOptionalResourceUnits(
  value: unknown,
): readonly { resourceId: string; units: number }[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new CommandNormalizationError('resources_must_be_a_list');
  const entries: readonly unknown[] = value;
  if (entries.length === 0) throw new CommandNormalizationError('resources_must_name_a_resource');
  if (entries.length > MOST_REFS_ON_ONE_ITEM)
    throw new CommandNormalizationError(
      `resources_must_be_at_most_${String(MOST_REFS_ON_ONE_ITEM)}`,
    );
  const asked = entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new CommandNormalizationError('resources_must_be_a_list');
    const resourceId = 'resourceId' in entry ? entry.resourceId : undefined;
    if (typeof resourceId !== 'string')
      throw new CommandNormalizationError('resourceId_must_be_an_id');
    const units = resourceUnitsOf(entry, 1);
    if (units === null) throw new CommandNormalizationError('units_must_be_a_whole_number_from_1');
    return { resourceId, units };
  });
  if (new Set(asked.map(({ resourceId }) => resourceId)).size !== asked.length)
    throw new CommandNormalizationError('resources_must_name_each_resource_once');
  return asked;
}

/** A boolean or absent, or the field's refusal. */
export function asOptionalFlag(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new CommandNormalizationError(`${field}_must_be_true_or_false`);
  }
  return value;
}

type Present<Fields extends Record<string, unknown>> = {
  [Key in keyof Fields as undefined extends Fields[Key] ? never : Key]: Fields[Key];
} & {
  [Key in keyof Fields as undefined extends Fields[Key] ? Key : never]?: Exclude<
    Fields[Key],
    undefined
  >;
};

/** Drops only undefined-valued fields while retaining their optional keys in the return type. */
export function present<Fields extends Record<string, unknown>>(fields: Fields): Present<Fields> {
  // Every retained entry preserves its original key and value; Object.fromEntries erases that relation.
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Present<Fields>;
}

export function normalizedTarget(workItemId: unknown, workItemRef: unknown) {
  return present({
    workItemId: asOptionalId(workItemId, 'workItemId'),
    workItemRef: asOptionalId(workItemRef, 'workItemRef'),
  });
}

export function target(raw: InputWith<'workItemId' | 'workItemRef'>) {
  return normalizedTarget(raw.workItemId, raw.workItemRef);
}

/** Normalizes either wire spelling; refuses conflicting, malformed, or unknown-encoding nodes. */
export function normalizeStepAddress(raw: InputWith<'stepId' | 'stepNodeId'>): {
  workItemId?: string;
  workItemRef?: string;
  stepId: string;
  addressedBy?: 'node';
} {
  if (raw.stepNodeId !== undefined) {
    // Proof: dropping this check made the mounted conflicting-address refusal fail:
    // Expected: 400 / Received: 200 (2026-09-27).
    // Proof (2026-10-16 extraction): forcing this guard false made
    // "refuses conflicting and invalid node addresses with command context"
    // answer 200 instead of the indexed 400; restoring it passes.
    if (raw.workItemId !== undefined || raw.workItemRef !== undefined || raw.stepId !== undefined) {
      throw new CommandNormalizationError('conflicting_step_address');
    }
    // Proof: omitting this type check made the mounted numeric node ID return 500
    // (Expected: 400 / Received: 500, 2026-09-27).
    if (typeof raw.stepNodeId !== 'string') {
      throw new CommandNormalizationError('invalid_step_node_id');
    }
    const parsed = parseStepNodeId(raw.stepNodeId);
    // Proof: rewriting sn2 to sn1 before parsing made the mounted unknown-encoding
    // refusal fail (Expected: 400 / Received: 200); replacing malformed "broken"
    // with a valid foreign node made the mounted malformed refusal return 404
    // instead of 400 (2026-09-27). Both parser faults were restored.
    if (!parsed.ok) {
      throw new CommandNormalizationError(
        parsed.reason === 'unknown_encoding'
          ? 'unknown_step_node_encoding'
          : 'invalid_step_node_id',
      );
    }
    return { ...parsed.ref, addressedBy: 'node' };
  }
  return { ...target(raw), stepId: asText(raw.stepId, 'stepId') };
}

/**
 * One text field of a typed endpoint, absent allowed.
 *
 * Read off the raw value rather than the schema's inferred type: schema-failure
 * classification calls the normalizer on bodies the schema already refused,
 * so a number where text belongs must be the endpoint's indexed refusal rather
 * than a `TypeError` inside `parseStepNodeId`.
 */
function endpointText(raw: object, field: string): string | undefined {
  const value: unknown = Reflect.get(raw, field);
  if (value === undefined) return undefined;
  // Proof: this check deleted made `refuses a missing or malformed endpoint as
  // 400` fail on `Expected: 400, Received: 500` for `stepNodeId: 7`; watched
  // 2026-09-27.
  if (typeof value !== 'string') throw new CommandNormalizationError('invalid_typed_endpoint');
  return value;
}

/** Parses one typed endpoint before batch reference binding. */
export function normalizeTypedEndpoint(raw: unknown) {
  // Proof: this object check deleted made the mounted `refuses a missing or
  // malformed endpoint as 400` fail on `Expected: 400, Received: 500` for a
  // null predecessor; watched 2026-09-27.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CommandNormalizationError('invalid_typed_endpoint');
  }
  const scope: unknown = Reflect.get(raw, 'scope');
  if (!isDependencyEndpointScope(scope)) {
    throw new CommandNormalizationError('invalid_typed_endpoint');
  }
  const workItemId = endpointText(raw, 'workItemId');
  const workItemRef = endpointText(raw, 'workItemRef');
  const stepId = endpointText(raw, 'stepId');
  const stepNodeId = endpointText(raw, 'stepNodeId');
  if (scope === 'whole') {
    // Proof: deleting this check made the mounted whole-with-step refusal return 200 instead of 400; watched 2026-09-27.
    if (
      (workItemId === undefined) === (workItemRef === undefined) ||
      stepId !== undefined ||
      stepNodeId !== undefined
    )
      throw new CommandNormalizationError('invalid_typed_endpoint');
    return present({ scope, workItemId, workItemRef });
  }
  if (scope === 'node' && stepNodeId !== undefined) {
    if (workItemId !== undefined || workItemRef !== undefined || stepId !== undefined)
      throw new CommandNormalizationError('invalid_typed_endpoint');
    const parsed = parseStepNodeId(stepNodeId);
    if (!parsed.ok)
      throw new CommandNormalizationError(
        parsed.reason === 'unknown_encoding'
          ? 'unknown_step_node_encoding'
          : 'invalid_step_node_id',
      );
    return { scope, ...parsed.ref };
  }
  if (
    (workItemId === undefined) === (workItemRef === undefined) ||
    stepId === undefined ||
    stepNodeId !== undefined
  )
    throw new CommandNormalizationError('invalid_typed_endpoint');
  return present({ scope, workItemId, workItemRef, stepId });
}

export function normalizedRef(value: unknown) {
  return present({ ref: asOptionalId(value, 'ref') });
}

export function ref(raw: InputWith<'ref'>) {
  return normalizedRef(raw.ref);
}

type NamedInput = InputWith<'ref' | 'name'>;

export function normalizeNamed<Kind extends NamedInput['kind']>(
  kind: Kind,
  raw: Extract<NamedInput, { kind: NoInfer<Kind> }>,
) {
  return { kind, ...ref(raw), name: asText(raw.name, 'name') };
}

/**
 * A command's allowance percentage, validated once at the command boundary.
 *
 * Proof: with this check passing `raw` through unvalidated, the mounted
 * `refuses an allowance over 1000% and leaves the step as it was` case
 * answered 500 — the storage converter's throw — instead of 400
 * (2026-09-27).
 */
export function stepAllowanceOf(raw: number): AllowancePercent {
  const percent = allowancePercentOf(raw);
  if (percent === null) {
    throw new CommandNormalizationError('allowancePercent_must_be_0_to_1000_with_two_decimals');
  }
  return percent;
}

/** The most characters a resource's unit label may carry; it sits beside every number of it. */
export const MOST_CHARACTERS_IN_A_UNIT_LABEL = 40;

/**
 * A resource capacity's or demand's `units`, or `null` to clear it: a whole
 * number from `floor` to {@link MOST_RESOURCE_UNITS}. Absent is refused rather
 * than read as a clear, for `capacityOf`'s reason: the command writes one field.
 * A capacity's floor is 0 (the plan may use none) and a demand's is 1 (a demand
 * of nothing is the absence of one, written `null`).
 *
 * Proof: with the integer guard reduced to a type test, `refuses units below 0
 * or above the bound at the command boundary` and the stored-demand property in
 * resource-command.test.ts failed (a capacity of -1, a demand of 0 stored); with
 * the ceiling removed the first normalized 1000000001; watched 2026-10-20.
 */
export function resourceUnitsOf(raw: object, floor: 0 | 1): number | null {
  if (!('units' in raw)) throw new CommandNormalizationError('units_required');
  const value: unknown = raw.units;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < floor) {
    throw new CommandNormalizationError(
      floor === 0 ? 'units_must_be_a_whole_number_from_0' : 'units_must_be_a_whole_number_from_1',
    );
  }
  if (value > MOST_RESOURCE_UNITS) {
    throw new CommandNormalizationError(`units_must_be_at_most_${String(MOST_RESOURCE_UNITS)}`);
  }
  return value;
}

/** A unit label, trimmed, of at most {@link MOST_CHARACTERS_IN_A_UNIT_LABEL} characters; empty is allowed. */
export function asUnitLabel(value: unknown): string {
  const label = asText(value, 'unitLabel').trim();
  if (label.length > MOST_CHARACTERS_IN_A_UNIT_LABEL) {
    throw new CommandNormalizationError('unitLabel_must_be_at_most_40_characters');
  }
  return label;
}

/**
 * A resource's kind as a create names it. Checked here although the structural
 * schema names the two literals, because a body the schema refused still reaches
 * the normalizer for its semantic refusal.
 */
export function asResourceKind(value: unknown): ResourceKind {
  if (!isResourceKind(value))
    throw new CommandNormalizationError('resourceKind_must_be_exclusive_or_divisible');
  return value;
}

/** A measure key ({@link isMeasureKey}), or `key_must_be_a_measure_key`. */
export function asMeasureKey(value: unknown): string {
  if (!isMeasureKey(value)) throw new CommandNormalizationError('key_must_be_a_measure_key');
  return value;
}

/**
 * A measure's unit label, trimmed, of at most
 * {@link MOST_CHARACTERS_IN_A_UNIT_LABEL} characters; empty is allowed, as for
 * a resource's.
 */
export function asMeasureUnit(value: unknown): string {
  const unit = asText(value, 'unit').trim();
  if (unit.length > MOST_CHARACTERS_IN_A_UNIT_LABEL) {
    throw new CommandNormalizationError('unit_must_be_at_most_40_characters');
  }
  return unit;
}

/**
 * A measure kind, checked here although the create's structural schema names
 * the three literals, for {@link asResourceKind}'s reason; a patch's schema
 * admits any text so a kind change reaches the domain's refusal.
 */
export function asMeasureKind(value: unknown): MeasureKind {
  if (!isMeasureKind(value))
    throw new CommandNormalizationError('measureKind_must_be_duration_count_or_money');
  return value;
}

/** A measure scale; see {@link asMeasureKind}. */
export function asMeasureScale(value: unknown): MeasureScale {
  if (!isMeasureScale(value)) throw new CommandNormalizationError('scale_must_be_integer_or_real');
  return value;
}

/** A definition's list position: a whole number from 0 to {@link MOST_MEASURE_ORDER}, or absent. */
export function asOptionalMeasureOrder(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MOST_MEASURE_ORDER
  )
    throw new CommandNormalizationError('order_must_be_a_whole_number_from_0_to_1000000');
  return value;
}

/**
 * A currency code ({@link isCurrencyCode}), `null` for none, or absent.
 * Whether the kind needs one is the domain's `currency_required` and
 * `currency_forbidden`, decided against the definition, not the request.
 */
export function asOptionalCurrency(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isCurrencyCode(value))
    throw new CommandNormalizationError('currency_must_be_three_capital_letters');
  return value;
}
