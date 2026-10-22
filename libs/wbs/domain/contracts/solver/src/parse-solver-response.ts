import {
  CONNECTED_SOLVER_RESPONSE_STATUSES,
  type ConnectedSolverRequest,
  type ConnectedSolverResponse,
  SOLVER_OBJECTIVE_TERM_KEYS,
  SOLVER_OBJECTIVE_TERMS,
  SOLVER_RESPONSE_KEYS,
  SOLVER_RESPONSE_STATUSES,
  SOLVER_STAGE_STATUSES,
  SOLVER_WIRE_VERSION,
  type SolverConnectedScopeIdentity,
  type SolverResponse,
} from './wire-types';

/**
 * 2.3 — the named framing seam.
 *
 * The solver is a short-lived process that writes one JSON line to stdout, so
 * everything between those bytes and a typed `SolverResponse` happens here and
 * nowhere else. Rejects anything that is not exactly one well-formed JSON line
 * carrying exactly one valid response.
 *
 * It returns a result rather than throwing. Every rejection is the
 * coordinator's `invalid-output` disposition, which is a value it records, and
 * an exception would make the caller re-derive that from a message.
 */

/**
 * Why a message was refused. Four codes, one per distinct thing that can be
 * wrong, and each is a different repair: nothing was written, more than one
 * line was written, the line is not JSON, or the JSON is not a response. They
 * are diagnosis, not disposition — the disposition is always `invalid-output`.
 */
export const SOLVER_PARSE_FAILURES = [
  'empty-output',
  'not-one-line',
  'malformed-json',
  'schema-violation',
] as const;
export type SolverParseFailure = (typeof SOLVER_PARSE_FAILURES)[number];

export type ParsedSolverResponse =
  | { readonly ok: true; readonly response: SolverResponse }
  | { readonly ok: false; readonly failure: SolverParseFailure; readonly detail: string };

const refuse = (
  failure: SolverParseFailure,
  detail: string,
): { readonly ok: false; readonly failure: SolverParseFailure; readonly detail: string } => ({
  ok: false,
  failure,
  detail,
});

const isSafeOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unknownKeys = (value: Record<string, unknown>, allowed: readonly string[]): string[] =>
  Object.keys(value).filter((key) => !allowed.includes(key));

/**
 * The structural half, written against the constants `wire-types.test.ts` pins
 * to `solver-wire.v5.json`. It is deliberately hand-written rather than driven
 * by a JSON Schema validator, and the golden corpus is what stops that from
 * drifting: `parse-solver-response.test.ts` runs every response fixture through
 * this function and fails if it accepts one the schema rejects or rejects one
 * the schema accepts — the contract the fixture manifest already states.
 *
 * Returns `null` when the value is a valid response, or a one-line reason.
 */
const violation = (value: unknown, expectedScope?: SolverConnectedScopeIdentity): string | null => {
  if (!isPlainObject(value)) {
    return `response is ${Array.isArray(value) ? 'an array' : typeof value}`;
  }

  const extra = unknownKeys(value, SOLVER_RESPONSE_KEYS);
  if (extra.length > 0) return `unknown key ${extra.join(', ')}`;

  if (value['wireVersion'] !== SOLVER_WIRE_VERSION) {
    return `wireVersion is ${JSON.stringify(value['wireVersion'])}, expected ${String(SOLVER_WIRE_VERSION)}`;
  }
  const scope = value['scope'];
  if (!isPlainObject(scope)) return 'response scope is not an object';
  if (expectedScope === undefined) {
    if (Object.keys(scope).length !== 1 || scope['kind'] !== 'local')
      return 'local response has invalid scope';
  } else {
    // Proof: disabling the questionHash comparison admitted a response for a
    // different connected question (13 pass / 1 fail).
    if (
      Object.keys(scope).length !== 4 ||
      scope['kind'] !== expectedScope.kind ||
      scope['projectId'] !== expectedScope.projectId ||
      scope['inputHash'] !== expectedScope.inputHash ||
      scope['questionHash'] !== expectedScope.questionHash
    )
      return 'connected response does not echo the request question identity';
  }

  const status = value['status'];
  const statuses: readonly string[] =
    expectedScope === undefined ? SOLVER_RESPONSE_STATUSES : CONNECTED_SOLVER_RESPONSE_STATUSES;
  if (typeof status !== 'string' || !statuses.includes(status)) {
    return `unknown status ${JSON.stringify(status)}`;
  }

  // The status/payload conditional, in both directions. `feasible` is the only
  // status that publishes, so it is the only one that carries offsets and
  // objectiveValues, and it carries BOTH; the other two carry NEITHER, absent
  // rather than empty.
  const publishes = status === 'feasible';
  for (const key of ['offsets', 'objectiveValues'] as const) {
    const present = Object.hasOwn(value, key);
    if (publishes && !present) return `feasible response is missing ${key}`;
    if (!publishes && present) return `${status} response carries ${key}`;
  }
  if (!publishes) return null;

  const offsets = value['offsets'];
  if (!isPlainObject(offsets)) return 'offsets is not an object';
  for (const [key, offset] of Object.entries(offsets)) {
    if (key.length === 0) return 'offsets carries an empty slice key';
    if (!isSafeOffset(offset)) return `offset ${JSON.stringify(key)} is ${JSON.stringify(offset)}`;
  }

  const objectiveValues = value['objectiveValues'];
  if (!isPlainObject(objectiveValues)) return 'objectiveValues is not an object';
  const extraTerms = unknownKeys(objectiveValues, SOLVER_OBJECTIVE_TERMS);
  if (extraTerms.length > 0) return `unknown objective term ${extraTerms.join(', ')}`;

  for (const term of SOLVER_OBJECTIVE_TERMS) {
    const entry = objectiveValues[term];
    // A stage that never ran reports `unknown` with null stageValue and bound;
    // it never omits its term, so an absent term is a violation and not a
    // shorthand for one.
    if (entry === undefined) return `missing objective term ${term}`;
    if (!isPlainObject(entry)) return `objective term ${term} is not an object`;

    const extraMembers = unknownKeys(entry, SOLVER_OBJECTIVE_TERM_KEYS);
    if (extraMembers.length > 0) return `${term} carries unknown member ${extraMembers.join(', ')}`;
    for (const member of SOLVER_OBJECTIVE_TERM_KEYS) {
      if (!Object.hasOwn(entry, member)) return `${term} is missing ${member}`;
    }

    if (!isSafeOffset(entry['value'])) return `${term}.value is ${JSON.stringify(entry['value'])}`;
    for (const member of ['stageValue', 'bound'] as const) {
      const at = entry[member];
      if (at !== null && !isSafeOffset(at)) return `${term}.${member} is ${JSON.stringify(at)}`;
    }
    const stageStatus = entry['status'];
    if (typeof stageStatus !== 'string' || !SOLVER_STAGE_STATUSES.includes(stageStatus as never)) {
      return `${term}.status is ${JSON.stringify(stageStatus)}`;
    }
  }

  return null;
};

/**
 * Parse the solver's stdout.
 *
 * Framing rules, in order: output that is empty or only whitespace is
 * `empty-output`; anything with a line break other than the single optional
 * terminator is `not-one-line`, which is what catches both a second line and
 * text after a valid one; a line that is not JSON is `malformed-json`; and a
 * JSON value that is not a response is `schema-violation`.
 */
const parseFramedResponse = (
  raw: string,
  expectedScope?: SolverConnectedScopeIdentity,
):
  | { readonly ok: true; readonly response: SolverResponse | ConnectedSolverResponse }
  | { readonly ok: false; readonly failure: SolverParseFailure; readonly detail: string } => {
  if (raw.trim().length === 0) return refuse('empty-output', 'stdout was empty');

  // Exactly one optional terminator comes off. Anything still holding a break
  // was more than one line, whatever it was: a second JSON document, a
  // traceback, or a warning the solver printed before its answer.
  const line = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
  if (/[\n\r]/.test(line)) {
    return refuse('not-one-line', `stdout carries ${String(line.split(/\r?\n/).length)} lines`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    return refuse('malformed-json', error instanceof Error ? error.message : String(error));
  }

  const detail = violation(parsed, expectedScope);
  if (detail !== null) return refuse('schema-violation', detail);

  // The strict structural guard above establishes the discriminated wire boundary.
  return { ok: true, response: parsed as SolverResponse | ConnectedSolverResponse };
};

/** Parse the local wire arm without accepting a connected identity. */
export const parseSolverResponse = (raw: string): ParsedSolverResponse => {
  const parsed = parseFramedResponse(raw);
  if (!parsed.ok) return parsed;
  // parseFramedResponse's absent expectedScope admits only the local discriminant.
  return { ok: true, response: parsed.response as SolverResponse };
};

/** Parse a connected response and require the exact request question identity. */
export const parseConnectedSolverResponse = (
  raw: string,
  request: ConnectedSolverRequest,
):
  | { readonly ok: true; readonly response: ConnectedSolverResponse }
  | { readonly ok: false; readonly failure: SolverParseFailure; readonly detail: string } => {
  const parsed = parseFramedResponse(raw, request.scope);
  if (!parsed.ok) return parsed;
  // Proof: requiring a dependency bound alone rejected a valid connected
  // occupancy-only boundary terminal (13 pass / 1 fail). The solver's initial
  // model classifies either effective fixed-boundary source the same way.
  const hasActiveBoundary =
    request.scope.boundaries.length > 0 ||
    Object.values(request.elsewhere).some((bookings) => bookings.length > 0);
  // Proof: disabling the no-active-boundary refusal accepted a fabricated
  // boundary-infeasible response with neither bound nor booking (13/1).
  if (parsed.response.status === 'boundary-infeasible' && !hasActiveBoundary) {
    return refuse('schema-violation', 'boundary-infeasible response has no active boundary');
  }
  // parseFramedResponse's expectedScope admits only the connected discriminant.
  return { ok: true, response: parsed.response as ConnectedSolverResponse };
};
