/**
 * The repository check behind 2.1's "prose is descriptive only" claim.
 *
 * Three rounds running, an obsolete prose schema in one of the descriptive
 * artifacts was an implementation instruction contradicting the real one. 2.1
 * settled the remedy as **set equality, not a ban on prose**: a planning
 * artifact that may not name a field cannot say what the schema must contain,
 * and the earlier "no field list outside the schema" wording rejected design.md,
 * spec.md and tasks.md on the round it was written.
 *
 * Run 20 left this as a prototype run once at `af05ead1` and never re-run —
 * a statement about that head and not about any other. This module is that
 * prototype turned into a check that runs at every head, with the negative
 * fixture 2.1 names carried as a test rather than as a promise.
 *
 * ## Coverage, stated on a pass as well as a failure
 *
 * 2.1 names **four** descriptive artifacts. Three are in this repository and
 * this check covers them. The fourth — the long-form note — lives in the Claire
 * workspace as `notes/wbs-dual-optimized-scheduler-design.md` and was
 * deliberately not copied in (2.1, decided run 3): its §6 is a review ledger,
 * and a second copy would be either synced (two sources of truth for a ledger)
 * or frozen (a check enforcing against a stale artifact). So `UNCOVERED_ARTIFACT`
 * is printed by the check's own reporter every time, so that "3 of 4" is never
 * read as "4 of 4".
 *
 * ## Two refinements to 2.1's definitions, both measured rather than assumed
 *
 * 2.1 defines an enumeration as "a maximal run of three or more backticked
 * identifiers joined only by commas, `and` or `/`". Read literally that
 * definition fails on the two artifacts it exists to check:
 *
 * 1. **It does not catch 2.1's own watched-red fixture.** The superseded
 *    sentence reads "carry its `sliceKey`, an integer `durationUnits`,
 *    `width`, …": the join between the first two identifiers is `, an integer `,
 *    which is not "only a comma", so the run breaks at length one and the
 *    sentence 2.1 requires the check to reject is not even an enumeration.
 *    A list in English prose carries modifiers between its members; the
 *    connector rule here is therefore that the gap **contains** a comma, an
 *    `and` or a `/`, carries no sentence terminator and no other code span, and
 *    is short (`MAX_CONNECTOR_CHARS`).
 * 2. **It is blind to the brace form both design.md and spec.md actually use.**
 *    `` `{ wireVersion, contractVersion, … }` `` is one backticked token, not a
 *    run of them, and it is the form the schema's own `$comment` uses. A single
 *    code span whose content is a brace/bracket/paren-delimited comma-separated
 *    list of identifiers is therefore an enumeration of its members.
 *
 * Both refinements widen the check. Neither weakens it: every enumeration the
 * literal definition finds is still an enumeration here.
 *
 * ## Rule (b) does not gate the artifacts yet, and the reason is a measurement
 *
 * Rule (a) is exact: a tag names a set, so equality is decidable and any drift
 * is unambiguous — it is the shipped gate over the three covered artifacts, and
 * it is the rule that catches the defect 2.1 was actually written for, an
 * obsolete prose schema contradicting the real one three rounds running.
 *
 * Rule (b) is an attribution heuristic, and run as a gate over untagged prose at
 * `6ab005fa` it reported **seventeen** divergences of which **none** was drift.
 * Every one was a sentence mixing a vocabulary with names from a neighbouring
 * tuple that 2.1's list of eight does not contain:
 *
 * - the **domain** slice tuple (`workItemId, stepId, days, personId, width,
 *   poolIds, notBefore, depReach, deadline`) — 4 sentences, attributed to the
 *   *wire* slice because the two overlap on `personId`, `width` and `poolIds`;
 * - `solver_slot` and the fencing triple `generation, cancelEpoch,
 *   attemptToken` (3.2, 6.11) — 2 sentences, attributed to
 *   `optimization_generation`;
 * - the objective **term names** `PRIORITY, MAKESPAN, MOVEMENT`, which are not
 *   the objective-term *fields* — 3 sentences;
 * - the wire `status` enum and the cache `status` enum, whose values sit
 *   alongside the field names that carry them — 3 sentences;
 * - 3b.1's project-settings columns — 1 sentence;
 * - four one-offs: `publication` (a stored-result field) beside the term
 *   fields, `decodeOptimizedResult` (a function) beside the cache columns,
 *   `PARALLEL` (a strategy) beside `width`/`poolIds`, and the plan-read block's
 *   own name `optimization` beside its ten members.
 *
 * So rule (b) is proven here on the fixture 2.1 mandates and is available to any
 * caller, but the artifact scan passes `['a']`. Turning it on is naming those
 * six tuples, which is real work in the slices that define them and is not this
 * module's to invent: a vocabulary asserted from memory rather than from the
 * artifact that defines it is the same failure in a new place.
 */

export type VocabularyName =
  | 'request'
  | 'response'
  | 'slice'
  | 'objective-term'
  | 'cache-key'
  | 'plan-read-optimization'
  | 'optimization-generation'
  | 'solver-queue';

export interface Vocabulary {
  readonly name: VocabularyName;
  readonly members: ReadonlySet<string>;
  /** Where the tuple is defined — a schema pointer, or the tasks.md item. */
  readonly source: string;
}

/**
 * The one artifact this check cannot reach, named in its own output.
 *
 * @see UNCOVERED_ARTIFACT_REASON
 */
export const UNCOVERED_ARTIFACT =
  'notes/wbs-dual-optimized-scheduler-design.md — the long-form design note, which lives in the Claire workspace and has no copy in this repository';

export const UNCOVERED_ARTIFACT_REASON =
  '2.1, decided run 3: its §6 is a review ledger, so a copy here would be either synced (two sources of truth for a ledger) or frozen (a check enforcing a stale artifact). Whoever amends the wire amends the note in the same chunk.';

/** The three descriptive artifacts this check does cover, repo-relative. */
export const COVERED_ARTIFACTS = [
  'openspec/changes/dual-optimized-scheduler/tasks.md',
  'openspec/changes/dual-optimized-scheduler/design.md',
  'openspec/changes/dual-optimized-scheduler/specs/scheduler-optimization/spec.md',
] as const;

/**
 * Rule (c): the stored shapes have their own authority in the codec requirement
 * (4.12b) and are excluded by name, so an enumeration of a stored tuple is never
 * misattributed to the wire.
 */
export const EXCLUDED_SHAPES: readonly string[] = ['OptimizedResult', 'StoredObjectiveValue'];

/** Longest gap between two members before a run stops being one list. */
export const MAX_CONNECTOR_CHARS = 96;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface CodeSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The four wire sets, parsed from the schema rather than restated here — the
 * whole point of 2.1 is that the schema is the only definition.
 *
 * `response` is the **union** of every `required` array under `$defs/response`.
 * The base object requires `wireVersion` and `status`; the conditional `then`
 * adds `offsets` and `objectiveValues`; the `else` branch's `not/anyOf` names
 * those same two as prohibited. Taking the union is only safe while the
 * prohibited names are a subset of the required ones — otherwise a prohibition
 * would enter the vocabulary as if it were a member — so
 * `wireVocabularies` asserts that coincidence instead of relying on it.
 */
export function wireVocabularies(schema: unknown): Map<VocabularyName, Vocabulary> {
  const defs = (schema as { $defs?: Record<string, unknown> })?.$defs;
  if (!defs) throw new Error('solver-wire.v1.json has no $defs');

  const requiredAt = (name: string): string[] => {
    const node = defs[name] as { required?: unknown } | undefined;
    if (!node) throw new Error(`solver-wire.v1.json has no $defs/${name}`);
    const required = node.required;
    if (!Array.isArray(required)) throw new Error(`$defs/${name} has no required array`);
    return required as string[];
  };

  const responseUnion = new Set<string>();
  const prohibited = new Set<string>();
  collectRequired(defs['response'], responseUnion, prohibited, false);
  for (const name of prohibited) {
    if (!responseUnion.has(name)) {
      throw new Error(
        `$defs/response prohibits '${name}' without ever requiring it, so the response ` +
          'vocabulary can no longer be read as the union of its required arrays',
      );
    }
  }

  const entries: readonly Vocabulary[] = [
    {
      name: 'request',
      members: new Set(requiredAt('request')),
      source: 'solver-wire.v1.json#/$defs/request/required',
    },
    {
      name: 'response',
      members: responseUnion,
      source: 'solver-wire.v1.json#/$defs/response — union of every required array',
    },
    {
      name: 'slice',
      members: new Set(requiredAt('slice')),
      source: 'solver-wire.v1.json#/$defs/slice/required',
    },
    {
      name: 'objective-term',
      members: new Set(requiredAt('objective-term')),
      source: 'solver-wire.v1.json#/$defs/objective-term/required',
    },
  ];

  return new Map(entries.map((v) => [v.name, v]));
}

function collectRequired(
  node: unknown,
  required: Set<string>,
  prohibited: Set<string>,
  underNot: boolean,
): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRequired(child, required, prohibited, underNot);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'required' && Array.isArray(value)) {
      for (const name of value as string[]) (underNot ? prohibited : required).add(name);
      continue;
    }
    collectRequired(value, required, prohibited, underNot || key === 'not');
  }
}

/**
 * The four vocabularies this change defines that have no schema yet — there is
 * no cache table, no generation row and no plan-read DTO in the repository, so
 * these are literals carrying the tasks.md item that defines them.
 *
 * They exist so that rule (b) can attribute a table enumeration to the table it
 * describes. Without them every `projectId, inputHash, objective` run overlaps
 * the wire sets on `objective` alone and a check that does not know its own
 * vocabularies misattributes every table tuple to the wire.
 */
export const TABLE_VOCABULARIES: readonly Vocabulary[] = [
  {
    name: 'cache-key',
    members: new Set([
      'projectId',
      'inputHash',
      'objective',
      'contractVersion',
      'budgetMs',
      'generation',
      'status',
      'resultJson',
      'failureReason',
      'createdAt',
    ]),
    source: 'tasks.md 3.1 — optimized_schedule_cache, composite PK and columns',
  },
  {
    name: 'optimization-generation',
    members: new Set([
      'projectId',
      'contractVersion',
      'generation',
      'inputHash',
      'cancelEpoch',
      'admissionState',
      'updatedAt',
    ]),
    source: 'tasks.md 3.2 — optimization_generation, PK and columns',
  },
  {
    name: 'solver-queue',
    members: new Set([
      'projectId',
      'contractVersion',
      'objective',
      'budgetMs',
      'generation',
      'admittedCancelEpoch',
      'enqueuedAt',
    ]),
    source: 'tasks.md 3.2 — solver_queue, PK and columns',
  },
  {
    name: 'plan-read-optimization',
    members: new Set([
      'enabled',
      'engine',
      'objective',
      'inputHash',
      'generation',
      'contractVersion',
      'budgetMs',
      'displayed',
      'variants',
      'comparison',
    ]),
    source: 'tasks.md 7.10 — the plan-read optimization block',
  },
];

export function allVocabularies(schema: unknown): Map<VocabularyName, Vocabulary> {
  const all = wireVocabularies(schema);
  for (const v of TABLE_VOCABULARIES) all.set(v.name, v);
  return all;
}

export interface Enumeration {
  readonly file: string;
  readonly line: number;
  /** The set named by the enclosing `<!-- wire-fields:… -->` tag, if any. */
  readonly tag: string | null;
  readonly members: readonly string[];
  readonly excerpt: string;
}

export interface Divergence {
  readonly file: string;
  readonly line: number;
  readonly rule: 'a' | 'b' | 'tag';
  readonly vocabulary: string | null;
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly message: string;
}

/**
 * A tag span whose set name is `fixture` marks a quoted negative example — text
 * an artifact carries **in order to** reject it. Without it 2.1's own watched
 * red would fail the check that 2.1 requires to reject it, which is not a
 * finding, it is the artifact quoting itself.
 */
export const FIXTURE_TAG = 'fixture';

const TAG = /<!--\s*wire-fields:([A-Za-z][A-Za-z0-9-]*)\s*-->/g;

interface TagSpan {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Spans run from the tag to the end of its sentence or to the next tag,
 * whichever comes first (2.1). A tag written inside a code span is prose about
 * the syntax, not an instance of it.
 */
export function tagSpans(text: string): TagSpan[] {
  const codeSpans = inlineCodeSpans(text);
  const raw: { name: string; from: number }[] = [];
  TAG.lastIndex = 0;
  for (let m = TAG.exec(text); m !== null; m = TAG.exec(text)) {
    const at = m.index;
    if (codeSpans.some((c) => at >= c.start && at < c.end)) continue;
    raw.push({ name: m[1] as string, from: at + m[0].length });
  }
  return raw.map((tag, i) => {
    const nextTag = raw[i + 1]?.from ?? text.length;
    return { name: tag.name, start: tag.from, end: Math.min(nextTag, sentenceEnd(text, tag.from)) };
  });
}

/**
 * A sentence ends at `.`, `!` or `?` followed by whitespace or end of text.
 * `§3.4` and `Number.MAX_SAFE_INTEGER` do not end one because their period is
 * followed by a non-space; a period inside a code span never ends one either.
 */
export function sentenceEnd(text: string, from: number): number {
  const codeSpans = inlineCodeSpans(text);
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const next = text[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (codeSpans.some((c) => i >= c.start && i < c.end)) continue;
    return i + 1;
  }
  return text.length;
}

function inlineCodeSpans(text: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  const re = /`([^`\n]+)`/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    spans.push({ text: m[1] as string, start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/**
 * A gap joins two members of one list when it carries a comma, an `and` or a
 * `/`, no sentence terminator, no paragraph break, and is short. See the module
 * header for why "only by commas" is read as "containing a comma".
 */
function isConnector(gap: string): boolean {
  if (gap.length === 0 || gap.length > MAX_CONNECTOR_CHARS) return false;
  if (gap.includes('\n\n')) return false;
  if (gap.includes('<!--') || gap.includes('-->')) return false;
  if (/[.!?;:]\s/.test(gap) || /[.!?;:]$/.test(gap)) return false;
  return gap.includes(',') || gap.includes('/') || /\band\b/.test(gap);
}

/** `{ a, b, c }` in one code span is a list of its members. */
function bracedMembers(code: string): string[] | null {
  const m = /^[{[(]\s*([^{}[\]()]+?)\s*[)\]}]$/.exec(code.trim());
  if (!m) return null;
  const parts = (m[1] as string).split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  return parts.every((p) => IDENTIFIER.test(p)) ? parts : null;
}

/**
 * Every enumeration in one artifact: maximal runs of three or more identifier
 * code spans joined by connectors, plus every braced list of three or more.
 */
export function scanEnumerations(text: string, file: string): Enumeration[] {
  const spans = inlineCodeSpans(text);
  const tags = tagSpans(text);
  const tagAt = (at: number): string | null =>
    tags.find((t) => at >= t.start && at < t.end)?.name ?? null;
  const lineAt = (at: number): number => text.slice(0, at).split('\n').length;

  const found: Enumeration[] = [];
  const emit = (members: string[], at: number, excerpt: string): void => {
    const tag = tagAt(at);
    if (tag === FIXTURE_TAG) return;
    if (members.some((m) => EXCLUDED_SHAPES.includes(m))) return;
    found.push({ file, line: lineAt(at), tag, members, excerpt });
  };

  let run: CodeSpan[] = [];
  const flush = (): void => {
    if (run.length >= 3) {
      const first = run[0] as CodeSpan;
      const last = run[run.length - 1] as CodeSpan;
      emit(
        run.map((s) => s.text),
        first.start,
        text.slice(first.start, last.end),
      );
    }
    run = [];
  };

  for (const span of spans) {
    const braced = bracedMembers(span.text);
    if (braced) {
      flush();
      emit(braced, span.start, span.text);
      continue;
    }
    if (!IDENTIFIER.test(span.text)) {
      flush();
      continue;
    }
    const previous = run[run.length - 1];
    if (previous && !isConnector(text.slice(previous.end, span.start))) flush();
    run.push(span);
  }
  flush();

  return found;
}

/**
 * Rules (a) and (b) over one artifact.
 *
 * (a) a tagged enumeration equals its set exactly, reported with file, line and
 *     the symmetric difference; (b) an untagged one is attributed to the
 *     vocabulary it overlaps most and, when that overlap is two or more, must be
 *     a subset of it. A tag naming no known vocabulary is itself a failure —
 *     otherwise a typo silently disables rule (a) for that span.
 */
export function checkArtifact(
  text: string,
  file: string,
  vocabularies: ReadonlyMap<VocabularyName, Vocabulary>,
  rules: readonly ('a' | 'b')[] = ['a', 'b'],
): Divergence[] {
  const divergences: Divergence[] = [];
  const known = new Set<string>(vocabularies.keys());

  for (const tag of tagSpans(text)) {
    if (tag.name === FIXTURE_TAG || known.has(tag.name)) continue;
    divergences.push({
      file,
      line: text.slice(0, tag.start).split('\n').length,
      rule: 'tag',
      vocabulary: tag.name,
      missing: [],
      unexpected: [],
      message: `wire-fields tag names '${tag.name}', which is not one of ${[...known].sort().join(', ')}`,
    });
  }

  for (const found of scanEnumerations(text, file)) {
    const members = new Set(found.members);
    if (found.tag !== null) {
      if (!rules.includes('a')) continue;
      const vocabulary = vocabularies.get(found.tag as VocabularyName);
      if (!vocabulary) continue;
      const missing = [...vocabulary.members].filter((m) => !members.has(m)).sort();
      const unexpected = [...members].filter((m) => !vocabulary.members.has(m)).sort();
      if (missing.length === 0 && unexpected.length === 0) continue;
      divergences.push({
        file,
        line: found.line,
        rule: 'a',
        vocabulary: found.tag,
        missing,
        unexpected,
        message:
          `tagged '${found.tag}' (${vocabulary.source}) but the enumeration is not that set: ` +
          `${describeDifference(missing, unexpected)}`,
      });
      continue;
    }

    if (!rules.includes('b')) continue;
    const best = attribute(members, vocabularies);
    if (!best || best.overlap < 2) continue;
    const unexpected = [...members].filter((m) => !best.vocabulary.members.has(m)).sort();
    if (unexpected.length === 0) continue;
    divergences.push({
      file,
      line: found.line,
      rule: 'b',
      vocabulary: best.vocabulary.name,
      missing: [],
      unexpected,
      message:
        `untagged enumeration overlaps '${best.vocabulary.name}' (${best.vocabulary.source}) on ` +
        `${best.overlap} of ${members.size} names but is not a subset of it: names ${unexpected.join(', ')}`,
    });
  }

  return divergences;
}

function describeDifference(missing: readonly string[], unexpected: readonly string[]): string {
  const parts: string[] = [];
  if (unexpected.length > 0) parts.push(`names ${unexpected.join(', ')}`);
  if (missing.length > 0) parts.push(`omits ${missing.join(', ')}`);
  return parts.join('; ');
}

function attribute(
  members: ReadonlySet<string>,
  vocabularies: ReadonlyMap<VocabularyName, Vocabulary>,
): { vocabulary: Vocabulary; overlap: number } | null {
  let best: { vocabulary: Vocabulary; overlap: number } | null = null;
  for (const vocabulary of vocabularies.values()) {
    let overlap = 0;
    for (const member of members) if (vocabulary.members.has(member)) overlap += 1;
    if (overlap > (best?.overlap ?? 0)) best = { vocabulary, overlap };
  }
  return best;
}

/**
 * The reporter. It always names the artifact it could not read, on a pass as
 * well as on a failure, so that "3 of 4" is never read as "4 of 4".
 */
export function report(divergences: readonly Divergence[], covered: readonly string[]): string {
  const lines = [
    `wire-vocabulary: checked ${covered.length} of 4 descriptive artifacts`,
    ...covered.map((f) => `  covered:   ${f}`),
    `  UNCOVERED: ${UNCOVERED_ARTIFACT}`,
    `             ${UNCOVERED_ARTIFACT_REASON}`,
  ];
  if (divergences.length === 0) {
    lines.push('  no divergent enumeration');
    return lines.join('\n');
  }
  for (const d of divergences) {
    lines.push(`  ${d.file}:${d.line} [rule ${d.rule}] ${d.message}`);
  }
  return lines.join('\n');
}
