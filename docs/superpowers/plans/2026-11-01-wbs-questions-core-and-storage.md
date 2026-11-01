# WBS Questions: Core and Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sections 1 and 2 of `openspec/changes/wbs-questions/tasks.md`: the pure question core in `@wbs/domain` and the storage layer (migrations, schema, ports, SQLite and memory adapters, conformance cases), with no behaviour reachable from a route yet.

**Architecture:** Section 1 is pure functions and parsers in `libs/wbs/domain/domain/src` with no I/O: vocabularies, the policy and basis parsers, `disposeQuestion`, reach, priority and counts. Section 2 adds six additive SQLite migrations with guarded `down.sql`, mirrors them in `schema.ts`, declares four new store ports in `@wbs/core`, implements them twice (store-sqlite, store-memory) and certifies both through the conformance case manifest. Section 3 (submit, guards, review, resolve) is a later plan and waits on the permission catalogue PR #736.

**Tech Stack:** Bun, Nx, TypeScript, drizzle-orm over `bun:sqlite`, `bun:test`.

**Spec:** `openspec/changes/wbs-questions/design.md` (D1, D3, D5, D6, D10, D11, D14), `openspec/changes/wbs-questions/specs/wbs-domain/spec.md`, `openspec/changes/wbs-questions/tasks.md` sections 1 and 2, ADR `docs/adr/0062-a-question-is-a-satellite-fact-judged-by-the-plan.md`, glossary entries **Question** through **Unnoticed question** in `CONTEXT.md`.

## Global Constraints

- Bun and Nx only. Run tests with `bun test <file>` from the project directory; gate targets are `bunx nx run <project>:test` and `bunx nx run <project>:typecheck`. Project names: `wbs-domain`, `wbs-core`, `wbs-store-sqlite`, `wbs-store-memory`, `wbs-conformance`.
- Run tests with `env -u CLAUDECODE bun test …`: thirteen output tests fail only under `CLAUDECODE=1`.
- No `any`, unchecked casts, `!` or eslint-disable outside tests without an adjacent comment naming the boundary.
- Missing, unreadable or malformed trusted state throws. Never default it. Parsers of stored JSON throw naming the row (`design.md` D11).
- Every new safety check (parser refusal, CHECK, guard) needs a production-path negative. Watch it fail with the check removed, then add an adjacent `// Proof:` comment naming the injected fault, the observed failing test and the date. Form: `// Proof: <fault>; <test name> failed on <what>; watched 2026-11-DD.`
- Forward migrations are additive (`tools/tool-git-hooks/src/hooks/migration-lint.ts`): no `DROP TABLE`, `DROP COLUMN`, `RENAME COLUMN`, `TRUNCATE`, or `ADD COLUMN … NOT NULL` without `DEFAULT`. A table rebuild needs both markers `-- foreign-keys-off-rebuild` and `-- migration-lint: compatible-table-rebuild` and the `_new` / `DROP` / `RENAME` / `pragma_foreign_key_check` shape. Every `migration.sql` ships beside `down.sql`.
- Migration folders live in `apps/wbs/be-01/drizzle/<YYYYMMDDHHMMSS>_<snake_name>/`. The runner sorts by folder name; statements are separated by `--> statement-breakpoint`. Every database, test databases included, is built by `runMigrations()`; `schema.ts` only types queries, and `schema-indexes.db.test.ts` asserts that its index names equal the migrated database's. CHECK names in `schema.ts` are kept in step with the SQL by hand.
- About fifty tests pin the ordered migration list by name. Find them with `grep -rl 20261028100100_widen_organization_audit_agent_pools --include=*.ts apps libs` and extend each one (Task 5, Step 9).
- Names: shortest unambiguous scoped name, verb-object functions, predicate booleans. Never `data`, `result`, `obj`, `tmp`, `item`, `handle`. JSDoc on every exported symbol; no file headers.
- Before every commit: `bun x prettier --write <files>` then `bun x prettier --check <files>`; `git add -A` then `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` (exit 0; an "unindexed candidate path in <README>" line means that README's index must list the new file). Never `--no-verify`.
- Instants are epoch milliseconds, the unit of `WriteStamp.at` (`libs/wbs/application/core/src/ports/write-stamp.ts`) and of every `now: () => number = Date.now` in the services. Ages in the policy are minutes.
- Branches: one PR per section. Section 1 is branch `feat/wbs-questions-1-core`; section 2 is `feat/wbs-questions-2-storage` stacked on it. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Record every watched negative in `openspec/changes/wbs-questions/verify.md`'s proofs table (command, result, date) and tick the task in `tasks.md` when its PR merges.

## File Structure

Section 1, all under `libs/wbs/domain/domain/src/` (package `@wbs/domain`, re-exported from `index.ts`):

- `question.ts`: vocabularies (`RISK_FACTS`, `HARD_GATES`, kinds, causes, dispositions, verdicts, phases, modes, submitter kinds), `FactCondition`, `PhaseProfile`, `QuestionTopic`, `QuestionPolicy`, `DEFAULT_QUESTION_POLICY`, `QuestionPolicyError`, `parseQuestionPolicy`, `parseWrongFacts`, the `Question` and `QuestionReview` record types.
- `question-basis.ts`: `Basis`, `PolicySourceRef`, `parseBasis`, `basisOf`, `disposeQuestion`.
- `question-priority.ts`: `downstreamReach`, `QuestionPriority`, `compareQuestionPriority`, `QuestionCountInput`, `QuestionCounts`, `QuestionCountsReading`, `foldQuestionCounts`.
- `notice.ts`: `NoticePayload`, `parseNoticePayload`, `NoticeReport`, `parseNoticeReports`, the `Notice` and `ProjectReviewer` record types and their vocabularies.
- One `*.test.ts` beside each.

Section 2:

- `apps/wbs/be-01/drizzle/20261103100000_add_step_phase/`, `…100100_add_question_policy/`, `…100200_add_question/`, `…100300_add_notice/`, `…100400_add_project_reviewer/`, `…100500_widen_organization_audit_questions/` (the task list's `extend_organization_audit_vocabulary`; the folder follows the existing `widen_organization_audit_<topic>` names), each `migration.sql` + `down.sql`.
- `libs/wbs/adapters/store-sqlite/src/schema.ts`: `step.phase`, tables `questionPolicy`, `question`, `notice`, `projectReviewer`, widened `organizationAudit` CHECKs.
- `libs/wbs/application/core/src/ports/organization-audit.ts`: two actions, one subject kind.
- `libs/wbs/application/core/src/ports/question-store.ts`, `question-policy-store.ts`, `notice-store.ts`, `project-reviewer-store.ts`; `stores.ts` gains four families; `step-store.ts` gains `phase`.
- `libs/wbs/adapters/store-sqlite/src/question.ts`, `question-policy.ts`, `notice.ts`, `project-reviewer.ts`, `question-migration.db.test.ts`, `question-corruption.db.test.ts`; `build-stores.ts` wires them; `step.ts` reads and writes `phase`.
- `libs/wbs/adapters/store-memory/src/question-fixture.ts`, `question-policy-fixture.ts`, `notice-fixture.ts`, `project-reviewer-fixture.ts`; `memory-stores.ts`, `in-memory-source.ts` and `step-fixture.ts` updated.
- `libs/wbs/application/conformance/src/case-manifest.ts` (four `PORT_NAMES`, their case ids), `stores/questions.ts`, `stores/question-policies.ts`, `stores/notices.ts`, `stores/project-reviewers.ts`, `source-conformance.ts`; openers in `store-sqlite/src/testing/source-conformance.db.test.ts` and `store-memory/src/testing/source-conformance.test.ts`.

---

## Section 1: the pure core

### Task 1: Question vocabularies, policy parser and record types

**Files:**

- Create: `libs/wbs/domain/domain/src/question.ts`
- Create: `libs/wbs/domain/domain/src/question.test.ts`
- Modify: `libs/wbs/domain/domain/src/index.ts` (add `export * from './question';` beside line 162 `export * from './step-blockage';`)

**Interfaces:**

- Consumes: nothing from this plan.
- Produces: `RISK_FACTS`, `RiskFact`, `RiskFacts`, `HARD_GATES`, `QUESTION_KINDS`, `QuestionKind`, `BLOCKER_CAUSES`, `BlockerCause`, `DISPOSITIONS`, `Disposition`, `VERDICTS`, `Verdict`, `STEP_PHASES`, `StepPhase`, `POLICY_MODES`, `PolicyMode`, `SUBMITTER_KINDS`, `SubmitterKind`, `FactCondition`, `PhaseProfile`, `QuestionTopic`, `QuestionPolicy`, `DEFAULT_QUESTION_POLICY`, `QuestionPolicyRefusal`, `QuestionPolicyError`, `parseQuestionPolicy(raw: unknown, where: string): QuestionPolicy`, `parseWrongFacts(raw: unknown, where: string): readonly RiskFact[]`, `isRiskFact`, `isStepPhase`, `isDisposition`, `isVerdict`, `isSubmitterKind`, `Question`, `QuestionReview`.

- [ ] **Step 1: Write the failing tests**

```ts
// libs/wbs/domain/domain/src/question.test.ts
import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_QUESTION_POLICY,
  HARD_GATES,
  parseQuestionPolicy,
  parseWrongFacts,
  QuestionPolicyError,
} from './question';

const where = 'question_policy project/p1';

describe('question policy parser', () => {
  it('round-trips the deployment default', () => {
    expect(parseQuestionPolicy(DEFAULT_QUESTION_POLICY, where)).toEqual(DEFAULT_QUESTION_POLICY);
  });

  it('hard gates cannot be written', () => {
    for (const gate of HARD_GATES) {
      const profiles = {
        ...DEFAULT_QUESTION_POLICY.profiles,
        planning: { blocks: [{ fact: gate, value: true }], notifies: [] },
      };
      let caught: unknown;
      try {
        parseQuestionPolicy({ ...DEFAULT_QUESTION_POLICY, profiles }, where);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(QuestionPolicyError);
      expect((caught as QuestionPolicyError).reason).toBe('hard_gate_not_writable');
      expect((caught as QuestionPolicyError).message).toContain(where);
    }
  });

  it('refuses a hard gate under notifies too', () => {
    const profiles = {
      ...DEFAULT_QUESTION_POLICY.profiles,
      implementation: { blocks: [], notifies: [{ fact: 'spends', value: true }] },
    };
    expect(() => parseQuestionPolicy({ ...DEFAULT_QUESTION_POLICY, profiles }, where)).toThrow(
      'hard_gate_not_writable',
    );
  });

  it.each([
    [
      'an unknown fact',
      {
        profiles: {
          ...DEFAULT_QUESTION_POLICY.profiles,
          planning: { blocks: [{ fact: 'cheap', value: true }], notifies: [] },
        },
      },
      'unknown_fact',
    ],
    [
      'a missing profile',
      { profiles: { planning: DEFAULT_QUESTION_POLICY.profiles.planning } },
      'missing_profile',
    ],
    [
      'an unknown phase',
      { profiles: { ...DEFAULT_QUESTION_POLICY.profiles, review: { blocks: [], notifies: [] } } },
      'unknown_phase',
    ],
    ['a digest hour of 24', { digestHour: 24 }, 'digest_hour_out_of_range'],
    ['a zero unanswered age', { unansweredMinutes: 0 }, 'age_not_positive'],
    ['a negative unnoticed age', { unnoticedMinutes: -1 }, 'age_not_positive'],
    ['an unknown mode', { mode: 'loose' }, 'malformed'],
    [
      'a duplicate topic',
      {
        topics: [
          { name: 'product', push: { planning: true, implementation: false } },
          { name: 'product', push: { planning: false, implementation: false } },
        ],
      },
      'duplicate_topic',
    ],
    [
      'a topic without a push flag',
      { topics: [{ name: 'product', push: { planning: true } }] },
      'malformed',
    ],
  ])('refuses %s', (_, patch, reason) => {
    let caught: unknown;
    try {
      parseQuestionPolicy({ ...DEFAULT_QUESTION_POLICY, ...patch }, where);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(QuestionPolicyError);
    expect((caught as QuestionPolicyError).reason).toBe(reason);
  });

  it('refuses text that is not a policy, naming the row', () => {
    expect(() => parseQuestionPolicy('not a profile', where)).toThrow(where);
    expect(() => parseQuestionPolicy(null, where)).toThrow(where);
  });
});

describe('wrong facts parser', () => {
  it('reads an empty list and a list of facts', () => {
    expect(parseWrongFacts([], 'question q1')).toEqual([]);
    expect(parseWrongFacts(['outward', 'spends'], 'question q1')).toEqual(['outward', 'spends']);
  });

  it('throws on a fact outside the six, naming the row', () => {
    expect(() => parseWrongFacts(['cheap'], 'question q1')).toThrow('question q1');
    expect(() => parseWrongFacts('outward', 'question q1')).toThrow('question q1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question.test.ts`
Expected: FAIL, "Cannot find module './question'".

- [ ] **Step 3: Write the module**

```ts
// libs/wbs/domain/domain/src/question.ts

/** The six declared risk facts of a question, in the order the glossary lists them. */
export const RISK_FACTS = [
  'reversible',
  'outward',
  'spends',
  'touchesProduction',
  'destructive',
  'changesAccess',
] as const;
export type RiskFact = (typeof RISK_FACTS)[number];
/** Every fact declared, none defaulted (design D2: `risk_fact_missing`). */
export type RiskFacts = Readonly<Record<RiskFact, boolean>>;

/**
 * The facts that block in every mode and profile and that no policy may name
 * (design D1, D3). Frozen: a deployment changes it only by a release, and a
 * stored basis carries the set that was in force (D10).
 */
export const HARD_GATES: readonly RiskFact[] = Object.freeze([
  'spends',
  'touchesProduction',
  'destructive',
  'changesAccess',
]);

export const QUESTION_KINDS = ['decision', 'blocker'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const BLOCKER_CAUSES = ['authorization', 'external', 'missing_input'] as const;
export type BlockerCause = (typeof BLOCKER_CAUSES)[number];
export const DISPOSITIONS = ['queued', 'notified', 'blocked'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const VERDICTS = ['accepted', 'overturned', 'resolved'] as const;
export type Verdict = (typeof VERDICTS)[number];
export const STEP_PHASES = ['planning', 'implementation'] as const;
export type StepPhase = (typeof STEP_PHASES)[number];
export const POLICY_MODES = ['by_step', 'offline'] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];
export const SUBMITTER_KINDS = ['user', 'machine', 'consent'] as const;
export type SubmitterKind = (typeof SUBMITTER_KINDS)[number];

const oneOf =
  <T extends string>(words: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (words as readonly string[]).includes(value);
export const isRiskFact = oneOf(RISK_FACTS);
export const isStepPhase = oneOf(STEP_PHASES);
export const isDisposition = oneOf(DISPOSITIONS);
export const isVerdict = oneOf(VERDICTS);
export const isSubmitterKind = oneOf(SUBMITTER_KINDS);
export const isQuestionKind = oneOf(QUESTION_KINDS);
export const isBlockerCause = oneOf(BLOCKER_CAUSES);
const isPolicyMode = oneOf(POLICY_MODES);

/** One line of a phase profile: the fact and the value that matches. */
export interface FactCondition {
  readonly fact: RiskFact;
  readonly value: boolean;
}

/** What one phase blocks on and what it notifies about (design D3). */
export interface PhaseProfile {
  readonly blocks: readonly FactCondition[];
  readonly notifies: readonly FactCondition[];
}

/** A named topic and the phases in which naming it pushes a notice. */
export interface QuestionTopic {
  readonly name: string;
  readonly push: Readonly<Record<StepPhase, boolean>>;
}

/** A question policy as written by a project or organization, or the deployment default. */
export interface QuestionPolicy {
  readonly mode: PolicyMode;
  readonly profiles: Readonly<Record<StepPhase, PhaseProfile>>;
  readonly topics: readonly QuestionTopic[];
  readonly unansweredMinutes: number;
  readonly unnoticedMinutes: number;
  readonly digestOn: boolean;
  readonly digestHour: number;
}

/** The deployment default (design D3): planning blocks what implementation only notifies. */
export const DEFAULT_QUESTION_POLICY: QuestionPolicy = Object.freeze({
  mode: 'by_step',
  profiles: {
    planning: {
      blocks: [
        { fact: 'outward', value: true },
        { fact: 'reversible', value: false },
      ],
      notifies: [],
    },
    implementation: {
      blocks: [],
      notifies: [
        { fact: 'outward', value: true },
        { fact: 'reversible', value: false },
      ],
    },
  },
  topics: [],
  unansweredMinutes: 240,
  unnoticedMinutes: 7 * 24 * 60,
  digestOn: true,
  digestHour: 8,
});

export type QuestionPolicyRefusal =
  | 'malformed'
  | 'unknown_fact'
  | 'unknown_phase'
  | 'missing_profile'
  | 'hard_gate_not_writable'
  | 'duplicate_topic'
  | 'digest_hour_out_of_range'
  | 'age_not_positive';

/**
 * Why a value is not a question policy. `reason` is the word a route answers
 * (section 4) and `where` names the row or request so a stored-row failure
 * reads as malformed trusted state (design D11).
 */
export class QuestionPolicyError extends Error {
  constructor(
    readonly reason: QuestionPolicyRefusal,
    readonly where: string,
    detail: string,
  ) {
    super(`${where}: ${reason}: ${detail}`);
    this.name = 'QuestionPolicyError';
  }
}

function asRecord(value: unknown, where: string, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new QuestionPolicyError('malformed', where, `${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function parseCondition(value: unknown, where: string, list: string): FactCondition {
  const condition = asRecord(value, where, `a condition under ${list}`);
  const { fact, value: match } = condition;
  if (!isRiskFact(fact)) {
    throw new QuestionPolicyError('unknown_fact', where, `${String(fact)} under ${list}`);
  }
  // Proof: this guard removed; `hard gates cannot be written` failed on `spends`; watched 2026-11-DD.
  if (HARD_GATES.includes(fact)) {
    throw new QuestionPolicyError('hard_gate_not_writable', where, `${fact} under ${list}`);
  }
  if (typeof match !== 'boolean') {
    throw new QuestionPolicyError('malformed', where, `${fact} under ${list} has no boolean value`);
  }
  return { fact, value: match };
}

function parseConditions(value: unknown, where: string, list: string): readonly FactCondition[] {
  if (!Array.isArray(value)) {
    throw new QuestionPolicyError('malformed', where, `${list} is not a list`);
  }
  return value.map((condition) => parseCondition(condition, where, list));
}

function parseProfiles(value: unknown, where: string): Readonly<Record<StepPhase, PhaseProfile>> {
  const profiles = asRecord(value, where, 'profiles');
  for (const phase of Object.keys(profiles)) {
    if (!isStepPhase(phase)) throw new QuestionPolicyError('unknown_phase', where, phase);
  }
  const parsed = {} as Record<StepPhase, PhaseProfile>;
  for (const phase of STEP_PHASES) {
    const profile = profiles[phase];
    if (profile === undefined) throw new QuestionPolicyError('missing_profile', where, phase);
    const { blocks, notifies } = asRecord(profile, where, `the ${phase} profile`);
    parsed[phase] = {
      blocks: parseConditions(blocks, where, `${phase}.blocks`),
      notifies: parseConditions(notifies, where, `${phase}.notifies`),
    };
  }
  return parsed;
}

function parseTopics(value: unknown, where: string): readonly QuestionTopic[] {
  if (!Array.isArray(value))
    throw new QuestionPolicyError('malformed', where, 'topics is not a list');
  const names = new Set<string>();
  return value.map((entry) => {
    const topic = asRecord(entry, where, 'a topic');
    if (typeof topic['name'] !== 'string' || topic['name'].length === 0) {
      throw new QuestionPolicyError('malformed', where, 'a topic has no name');
    }
    const name = topic['name'];
    if (names.has(name)) throw new QuestionPolicyError('duplicate_topic', where, name);
    names.add(name);
    const push = asRecord(topic['push'], where, `the push flags of ${name}`);
    const flags = {} as Record<StepPhase, boolean>;
    for (const phase of STEP_PHASES) {
      const flag = push[phase];
      if (typeof flag !== 'boolean') {
        throw new QuestionPolicyError('malformed', where, `${name} has no ${phase} push flag`);
      }
      flags[phase] = flag;
    }
    return { name, push: flags };
  });
}

function parseAge(value: unknown, where: string, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new QuestionPolicyError('malformed', where, `${what} is not an integer`);
  }
  // Proof: `<= 0` relaxed to `< 0`; `refuses a zero unanswered age` failed; watched 2026-11-DD.
  if (value <= 0) throw new QuestionPolicyError('age_not_positive', where, what);
  return value;
}

/**
 * Reads a policy off a request body or a stored row (design D3, D11).
 *
 * @throws {QuestionPolicyError} naming `where` and the refusal: a hard gate
 * under either list, an unknown fact or phase, a missing profile, a duplicate
 * topic, a digest hour outside 0 to 23, a non-positive age, or any other shape.
 */
export function parseQuestionPolicy(raw: unknown, where: string): QuestionPolicy {
  const policy = asRecord(raw, where, 'the policy');
  const mode = policy['mode'];
  if (!isPolicyMode(mode)) throw new QuestionPolicyError('malformed', where, 'mode');
  const digestOn = policy['digestOn'];
  if (typeof digestOn !== 'boolean') throw new QuestionPolicyError('malformed', where, 'digestOn');
  const digestHour = policy['digestHour'];
  if (typeof digestHour !== 'number' || !Number.isSafeInteger(digestHour)) {
    throw new QuestionPolicyError('malformed', where, 'digestHour');
  }
  // Proof: upper bound raised to 24; `refuses a digest hour of 24` failed; watched 2026-11-DD.
  if (digestHour < 0 || digestHour > 23) {
    throw new QuestionPolicyError('digest_hour_out_of_range', where, String(digestHour));
  }
  return {
    mode,
    profiles: parseProfiles(policy['profiles'], where),
    topics: parseTopics(policy['topics'], where),
    unansweredMinutes: parseAge(policy['unansweredMinutes'], where, 'unansweredMinutes'),
    unnoticedMinutes: parseAge(policy['unnoticedMinutes'], where, 'unnoticedMinutes'),
    digestOn,
    digestHour,
  };
}

/**
 * Reads the `wrong_facts` column (design D11).
 *
 * @throws naming `where` when the value is not a list of risk facts.
 */
export function parseWrongFacts(raw: unknown, where: string): readonly RiskFact[] {
  // Proof: `isRiskFact` replaced by `typeof === 'string'`; `throws on a fact outside the six` failed; watched 2026-11-DD.
  if (!Array.isArray(raw) || !raw.every(isRiskFact)) {
    throw new Error(`${where}: wrong_facts is not a list of risk facts`);
  }
  return raw;
}

/** A reviewer's verdict on a question, with what it found wrong (design D1). */
export interface QuestionReview {
  readonly verdict: Verdict;
  readonly answer: string | null;
  readonly reviewedByUserId: string;
  readonly reviewedAt: number;
  readonly wrongFacts: readonly RiskFact[];
  /** A plain id: whether the work item still exists is derived on read. */
  readonly followUpWorkItemId: string | null;
}

/** One stored question: the satellite fact beside a step node and its attempt (ADR 0062). */
export interface Question {
  readonly id: string;
  readonly workItemId: string;
  readonly stepId: string;
  readonly attemptNumber: number;
  readonly projectId: string;
  readonly submittedByKind: SubmitterKind;
  readonly submittedById: string;
  readonly executorPersonId: string;
  readonly kind: QuestionKind;
  readonly cause: BlockerCause | null;
  readonly text: string;
  readonly proposedAnswer: string;
  readonly facts: RiskFacts;
  readonly topics: readonly string[];
  readonly disposition: Disposition;
  /** The snapshot the disposition replays from; typed in `question-basis.ts`. */
  readonly basis: unknown;
  readonly submittedAt: number;
  readonly blockedAt: number | null;
  readonly review: QuestionReview | null;
}
```

Then narrow `basis` once Task 3 exists: change `readonly basis: unknown;` to `readonly basis: Basis;` with `import type { Basis } from './question-basis';` (Task 3, Step 5 does this).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Watch each proof negative fail, then restore it**

For each `// Proof:` in `question.ts`: apply the named fault, rerun the file, confirm the named test fails on the named value, revert the fault, fill in the date. Record the four in `openspec/changes/wbs-questions/verify.md`.

- [ ] **Step 6: Typecheck and commit**

Run: `bunx nx run wbs-domain:typecheck` → exit 0.

```bash
git add libs/wbs/domain/domain/src/question.ts libs/wbs/domain/domain/src/question.test.ts libs/wbs/domain/domain/src/index.ts openspec/changes/wbs-questions/verify.md
bun x prettier --check libs/wbs/domain/domain/src/question.ts libs/wbs/domain/domain/src/question.test.ts
git commit -F - <<'EOF'
feat(wbs-domain): question vocabularies and the policy parser

Task 1.1 of wbs-questions: the six risk facts, the frozen hard-gate set, the
kinds, causes, dispositions, verdicts, phases and modes, the deployment
default policy, and the parser that refuses a hard gate under either list.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 2: Notice parsers and record types

**Files:**

- Create: `libs/wbs/domain/domain/src/notice.ts`
- Create: `libs/wbs/domain/domain/src/notice.test.ts`
- Modify: `libs/wbs/domain/domain/src/index.ts` (add `export * from './notice';`)

**Interfaces:**

- Consumes: nothing.
- Produces: `NOTICE_REASONS`, `NoticeReason`, `NOTICE_STATES`, `NoticeState`, `NOTICE_CHANNELS`, `NoticeChannel`, `UNDELIVERABLE_REASONS`, `UndeliverableReason`, `REPORT_OUTCOMES`, `NoticePayload`, `parseNoticePayload(raw: unknown, where: string): NoticePayload`, `NoticeReport`, `parseNoticeReports(raw: unknown, where: string): readonly NoticeReport[]`, `Notice`, `ProjectReviewer`.

- [ ] **Step 1: Write the failing tests**

```ts
// libs/wbs/domain/domain/src/notice.test.ts
import { describe, expect, it } from 'bun:test';

import { parseNoticePayload, parseNoticeReports } from './notice';

const where = 'notice n1';

describe('notice payload parser', () => {
  it('reads a digest payload', () => {
    const payload = {
      count: 4,
      oldestAgeMinutes: 90,
      top: [
        { questionId: 'q1', number: '1.2' },
        { questionId: 'q2', number: '1.3' },
      ],
    };
    expect(parseNoticePayload(payload, where)).toEqual(payload);
  });

  it('throws on more than three top entries, naming the row', () => {
    const top = ['a', 'b', 'c', 'd'].map((questionId) => ({ questionId, number: '1' }));
    expect(() => parseNoticePayload({ count: 4, oldestAgeMinutes: 1, top }, where)).toThrow(where);
  });

  it('throws on a count that is not an integer', () => {
    expect(() => parseNoticePayload({ count: '4', oldestAgeMinutes: 1, top: [] }, where)).toThrow(
      where,
    );
  });
});

describe('notice reports parser', () => {
  it('reads an empty list and recorded attempts', () => {
    const reports = [
      { number: 1, token: 't1', at: 1000, outcome: 'error', error: 'gateway down' },
      { number: 2, token: 't2', at: 2000, outcome: 'lost' },
      { number: 3, token: 't3', at: 3000, outcome: 'ok' },
    ];
    expect(parseNoticeReports([], where)).toEqual([]);
    expect(parseNoticeReports(reports, where)).toEqual(reports);
  });

  it('throws on an outcome outside ok, error and lost, naming the row', () => {
    expect(() =>
      parseNoticeReports([{ number: 1, token: 't', at: 1, outcome: 'retry' }], where),
    ).toThrow(where);
  });

  it('throws on a repeated attempt number', () => {
    const twice = [
      { number: 1, token: 'a', at: 1, outcome: 'ok' },
      { number: 1, token: 'b', at: 2, outcome: 'ok' },
    ];
    expect(() => parseNoticeReports(twice, where)).toThrow('attempt 1 recorded twice');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/notice.test.ts`
Expected: FAIL, "Cannot find module './notice'".

- [ ] **Step 3: Write the module**

```ts
// libs/wbs/domain/domain/src/notice.ts

export const NOTICE_REASONS = ['opened', 'aged', 'digest'] as const;
export type NoticeReason = (typeof NOTICE_REASONS)[number];
export const NOTICE_STATES = ['queued', 'leased', 'delivered', 'failed', 'undeliverable'] as const;
export type NoticeState = (typeof NOTICE_STATES)[number];
export const NOTICE_CHANNELS = ['openclaw'] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];
export const UNDELIVERABLE_REASONS = ['no_address', 'no_access'] as const;
export type UndeliverableReason = (typeof UNDELIVERABLE_REASONS)[number];
export const REPORT_OUTCOMES = ['ok', 'error', 'lost'] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];
/** The notice retry cap (design D8): the fifth failure or expiry ends retries. */
export const NOTICE_ATTEMPT_CAP = 5;

const isWord =
  <T extends string>(words: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (words as readonly string[]).includes(value);
export const isNoticeReason = isWord(NOTICE_REASONS);
export const isNoticeState = isWord(NOTICE_STATES);
export const isNoticeChannel = isWord(NOTICE_CHANNELS);
export const isUndeliverableReason = isWord(UNDELIVERABLE_REASONS);
const isReportOutcome = isWord(REPORT_OUTCOMES);

function asRecord(value: unknown, where: string, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: ${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asInteger(value: unknown, where: string, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${where}: ${what} is not an integer`);
  }
  return value;
}

/** What a digest notice says: how many, how old the oldest is, the top three by priority. */
export interface NoticePayload {
  readonly count: number;
  readonly oldestAgeMinutes: number;
  readonly top: readonly { readonly questionId: string; readonly number: string }[];
}

/**
 * Reads the `payload` column of a digest notice (design D11).
 *
 * @throws naming `where` on any shape but a payload with at most three top entries.
 */
export function parseNoticePayload(raw: unknown, where: string): NoticePayload {
  const payload = asRecord(raw, where, 'payload');
  const top = payload['top'];
  // Proof: the length bound removed; `throws on more than three top entries` failed; watched 2026-11-DD.
  if (!Array.isArray(top) || top.length > 3) {
    throw new Error(`${where}: payload.top is not a list of at most three`);
  }
  return {
    count: asInteger(payload['count'], where, 'payload.count'),
    oldestAgeMinutes: asInteger(payload['oldestAgeMinutes'], where, 'payload.oldestAgeMinutes'),
    top: top.map((entry) => {
      const { questionId, number } = asRecord(entry, where, 'a top entry');
      if (typeof questionId !== 'string' || typeof number !== 'string') {
        throw new Error(`${where}: a top entry lacks questionId or number`);
      }
      return { questionId, number };
    }),
  };
}

/** One delivery attempt's record (design D8): the token proves which lease reported it. */
export interface NoticeReport {
  readonly number: number;
  readonly token: string;
  readonly at: number;
  readonly outcome: ReportOutcome;
  readonly error?: string;
}

/**
 * Reads the `reports` column (design D11).
 *
 * @throws naming `where` on any entry outside the record shape, and on an
 * attempt number recorded twice: each number is consumed exactly once (D8).
 */
export function parseNoticeReports(raw: unknown, where: string): readonly NoticeReport[] {
  if (!Array.isArray(raw)) throw new Error(`${where}: reports is not a list`);
  const numbers = new Set<number>();
  return raw.map((entry) => {
    const report = asRecord(entry, where, 'a report');
    const number = asInteger(report['number'], where, 'report.number');
    // Proof: the set check removed; `throws on a repeated attempt number` failed; watched 2026-11-DD.
    if (numbers.has(number)) throw new Error(`${where}: attempt ${String(number)} recorded twice`);
    numbers.add(number);
    const { token, outcome, error } = report;
    if (typeof token !== 'string') throw new Error(`${where}: report.token is not a string`);
    // Proof: `isReportOutcome` replaced by a string check; `throws on an outcome outside` failed; watched 2026-11-DD.
    if (!isReportOutcome(outcome)) throw new Error(`${where}: report.outcome ${String(outcome)}`);
    if (error !== undefined && typeof error !== 'string') {
      throw new Error(`${where}: report.error is not a string`);
    }
    const at = asInteger(report['at'], where, 'report.at');
    return error === undefined
      ? { number, token, at, outcome }
      : { number, token, at, outcome, error };
  });
}

/** One queued message to one reviewer about one question or one day's digest (design D1, D8). */
export interface Notice {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly reason: NoticeReason;
  readonly questionId: string | null;
  readonly digestDay: string | null;
  readonly payload: NoticePayload | null;
  readonly channel: NoticeChannel;
  readonly address: string | null;
  readonly state: NoticeState;
  readonly undeliverableReason: UndeliverableReason | null;
  readonly attemptCount: number;
  readonly dueAt: number;
  readonly leaseUntil: number | null;
  readonly leaseToken: string | null;
  readonly reports: readonly NoticeReport[];
  readonly createdAt: number;
}

/** An account a project lists to receive its notices, with where to send them (design D6). */
export interface ProjectReviewer {
  readonly projectId: string;
  readonly userId: string;
  readonly channel: NoticeChannel;
  readonly address: string | null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/notice.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Watch the three proof negatives fail, restore, date them, record in verify.md**

- [ ] **Step 6: Typecheck and commit**

```bash
bunx nx run wbs-domain:typecheck
git add libs/wbs/domain/domain/src/notice.ts libs/wbs/domain/domain/src/notice.test.ts libs/wbs/domain/domain/src/index.ts openspec/changes/wbs-questions/verify.md
git commit -F - <<'EOF'
feat(wbs-domain): notice payload and report parsers

Task 1.1 of wbs-questions, the notice half: reasons, states, the one channel,
the digest payload and the per-attempt report records, each parser throwing
with the row's identity on corruption.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 3: The basis snapshot and `disposeQuestion`

**Files:**

- Create: `libs/wbs/domain/domain/src/question-basis.ts`
- Create: `libs/wbs/domain/domain/src/question-basis.test.ts`
- Modify: `libs/wbs/domain/domain/src/question.ts` (`basis: Basis`)
- Modify: `libs/wbs/domain/domain/src/index.ts` (add `export * from './question-basis';`)

**Interfaces:**

- Consumes: `QuestionPolicy`, `PhaseProfile`, `RiskFact`, `RiskFacts`, `StepPhase`, `PolicyMode`, `Disposition`, `HARD_GATES`, `isRiskFact`, `isStepPhase`, `DEFAULT_QUESTION_POLICY` from Task 1.
- Produces: `PolicySource`, `PolicySourceRef`, `Basis`, `parseBasis(raw: unknown, where: string): Basis`, `basisOf(policy: QuestionPolicy, source: PolicySourceRef, phase: StepPhase, hardGates?: readonly RiskFact[]): Basis`, `disposeQuestion(basis: Basis, facts: RiskFacts, topics: readonly string[]): Disposition`, `factsNamed(named: Partial<RiskFacts>): RiskFacts` (test helper exported for the fixture rule "the rest are false, except reversible").

- [ ] **Step 1: Write the failing tests**

The five witnesses carry the spec's scenario titles, one per precedence boundary (design D14). The fixture rule: a scenario that names some facts means the rest are `false`, except `reversible`, which is `true` unless named.

```ts
// libs/wbs/domain/domain/src/question-basis.test.ts
import { describe, expect, it } from 'bun:test';

import { DEFAULT_QUESTION_POLICY, HARD_GATES, type QuestionPolicy } from './question';
import { basisOf, disposeQuestion, factsNamed, parseBasis } from './question-basis';

const withTopic = (
  policy: QuestionPolicy,
  planning: boolean,
  implementation: boolean,
): QuestionPolicy => ({
  ...policy,
  topics: [{ name: 'product', push: { planning, implementation } }],
});
const offline = (policy: QuestionPolicy): QuestionPolicy => ({ ...policy, mode: 'offline' });
const project = { source: 'project', scopeId: 'p1', version: 3 } as const;

describe('disposition follows hard gates, then offline, then the phase profile, then topics', () => {
  it('a hard gate blocks before offline', () => {
    const basis = basisOf(offline(DEFAULT_QUESTION_POLICY), project, 'implementation');
    expect(disposeQuestion(basis, factsNamed({ destructive: true }), [])).toBe('blocked');
  });

  it('offline queues before the profile', () => {
    const basis = basisOf(
      offline(withTopic(DEFAULT_QUESTION_POLICY, true, true)),
      project,
      'planning',
    );
    expect(disposeQuestion(basis, factsNamed({ outward: true }), ['product'])).toBe('queued');
  });

  it('a blocking condition wins over a pushed topic', () => {
    const basis = basisOf(withTopic(DEFAULT_QUESTION_POLICY, true, false), project, 'planning');
    expect(disposeQuestion(basis, factsNamed({ outward: true }), ['product'])).toBe('blocked');
  });

  it('a notifying condition wins over queued', () => {
    const basis = basisOf(DEFAULT_QUESTION_POLICY, project, 'implementation');
    expect(disposeQuestion(basis, factsNamed({ reversible: false }), [])).toBe('notified');
  });

  it('a pushed topic notifies with no condition matched', () => {
    const basis = basisOf(
      withTopic(DEFAULT_QUESTION_POLICY, false, true),
      project,
      'implementation',
    );
    expect(disposeQuestion(basis, factsNamed({ reversible: true }), ['product'])).toBe('notified');
  });

  it('planning blocks what implementation only notifies', () => {
    const facts = factsNamed({ outward: true });
    expect(disposeQuestion(basisOf(DEFAULT_QUESTION_POLICY, project, 'planning'), facts, [])).toBe(
      'blocked',
    );
    expect(
      disposeQuestion(basisOf(DEFAULT_QUESTION_POLICY, project, 'implementation'), facts, []),
    ).toBe('notified');
  });

  it('a topic the policy does not push changes nothing', () => {
    const basis = basisOf(DEFAULT_QUESTION_POLICY, project, 'implementation');
    expect(disposeQuestion(basis, factsNamed({}), ['product'])).toBe('queued');
  });

  it('a topic never blocks', () => {
    const basis = basisOf(withTopic(DEFAULT_QUESTION_POLICY, true, true), project, 'planning');
    expect(disposeQuestion(basis, factsNamed({}), ['product'])).toBe('notified');
  });
});

describe('the basis replays by itself', () => {
  it('a hard-gate change leaves the basis replayable', () => {
    const stored = basisOf(DEFAULT_QUESTION_POLICY, project, 'implementation');
    const facts = factsNamed({ spends: true });
    expect(disposeQuestion(stored, facts, [])).toBe('blocked');
    const withoutSpends = HARD_GATES.filter((gate) => gate !== 'spends');
    const later = basisOf(DEFAULT_QUESTION_POLICY, project, 'implementation', withoutSpends);
    expect(disposeQuestion(later, facts, [])).toBe('queued');
    expect(disposeQuestion(stored, facts, [])).toBe('blocked');
  });

  it('records the source, version, phase, mode, profile and pushed topics', () => {
    const basis = basisOf(withTopic(DEFAULT_QUESTION_POLICY, true, false), project, 'planning');
    expect(basis).toEqual({
      source: 'project',
      scopeId: 'p1',
      policyVersion: 3,
      hardGates: [...HARD_GATES],
      phase: 'planning',
      mode: 'by_step',
      profile: DEFAULT_QUESTION_POLICY.profiles.planning,
      pushedTopics: ['product'],
    });
    expect(basisOf(DEFAULT_QUESTION_POLICY, { source: 'default' }, 'planning')).toMatchObject({
      source: 'default',
      scopeId: null,
      policyVersion: null,
    });
  });

  it('round-trips through the parser', () => {
    const basis = basisOf(
      withTopic(DEFAULT_QUESTION_POLICY, true, true),
      project,
      'implementation',
    );
    expect(parseBasis(JSON.parse(JSON.stringify(basis)), 'question q1')).toEqual(basis);
  });

  it('throws on a basis whose phase is unknown, naming the row', () => {
    const basis = basisOf(DEFAULT_QUESTION_POLICY, project, 'planning');
    expect(() => parseBasis({ ...basis, phase: 'review' }, 'question q1')).toThrow('question q1');
  });

  it('throws on a basis without a hard-gate list', () => {
    const { hardGates: _, ...rest } = basisOf(DEFAULT_QUESTION_POLICY, project, 'planning');
    expect(() => parseBasis(rest, 'question q1')).toThrow('hardGates');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question-basis.test.ts`
Expected: FAIL, "Cannot find module './question-basis'".

- [ ] **Step 3: Write the module**

```ts
// libs/wbs/domain/domain/src/question-basis.ts
import {
  HARD_GATES,
  isRiskFact,
  isStepPhase,
  POLICY_MODES,
  RISK_FACTS,
  type Disposition,
  type FactCondition,
  type PhaseProfile,
  type PolicyMode,
  type QuestionPolicy,
  type RiskFact,
  type RiskFacts,
  type StepPhase,
} from './question';

/** Where an effective policy came from (design D3). */
export type PolicySource = 'project' | 'organization' | 'default';

/** The row an effective policy was read from, or the default. */
export type PolicySourceRef =
  | { readonly source: 'default' }
  | {
      readonly source: 'project' | 'organization';
      readonly scopeId: string;
      readonly version: number;
    };

/**
 * Everything `disposeQuestion` reads, snapshotted at submit (design D10), so
 * a replay after any policy, default or hard-gate change gives the stored
 * disposition.
 */
export interface Basis {
  readonly source: PolicySource;
  readonly scopeId: string | null;
  readonly policyVersion: number | null;
  readonly hardGates: readonly RiskFact[];
  readonly phase: StepPhase;
  readonly mode: PolicyMode;
  readonly profile: PhaseProfile;
  readonly pushedTopics: readonly string[];
}

/** The basis of a question submitted on `phase` under `policy` read from `source`. */
export function basisOf(
  policy: QuestionPolicy,
  source: PolicySourceRef,
  phase: StepPhase,
  hardGates: readonly RiskFact[] = HARD_GATES,
): Basis {
  return {
    source: source.source,
    scopeId: source.source === 'default' ? null : source.scopeId,
    policyVersion: source.source === 'default' ? null : source.version,
    hardGates: [...hardGates],
    phase,
    mode: policy.mode,
    profile: policy.profiles[phase],
    pushedTopics: policy.topics.filter((topic) => topic.push[phase]).map((topic) => topic.name),
  };
}

/**
 * The disposition of a question with `facts` naming `topics`, judged by its
 * basis alone: a hard gate blocks; else `offline` queues; else the profile's
 * `blocks`, then its `notifies`, then a pushed topic; else queued (D2, D14).
 */
export function disposeQuestion(
  basis: Basis,
  facts: RiskFacts,
  topics: readonly string[],
): Disposition {
  const matches = (condition: FactCondition): boolean => facts[condition.fact] === condition.value;
  // Proof: gate and offline swapped; `a hard gate blocks before offline` read queued; watched 2026-11-DD.
  if (basis.hardGates.some((gate) => facts[gate])) return 'blocked';
  // Proof: offline and profile swapped; `offline queues before the profile` read blocked; watched 2026-11-DD.
  if (basis.mode === 'offline') return 'queued';
  // Proof: blocks and topics swapped; `a blocking condition wins over a pushed topic` read notified; watched 2026-11-DD.
  if (basis.profile.blocks.some(matches)) return 'blocked';
  // Proof: notifies and queued swapped; `a notifying condition wins over queued` read queued; watched 2026-11-DD.
  if (basis.profile.notifies.some(matches)) return 'notified';
  // Proof: topic push removed; `a pushed topic notifies with no condition matched` read queued; watched 2026-11-DD.
  if (topics.some((topic) => basis.pushedTopics.includes(topic))) return 'notified';
  return 'queued';
}

function asRecord(value: unknown, where: string, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: ${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function parseConditions(value: unknown, where: string, list: string): readonly FactCondition[] {
  if (!Array.isArray(value)) throw new Error(`${where}: basis.profile.${list} is not a list`);
  return value.map((entry) => {
    const { fact, value: match } = asRecord(entry, where, `a ${list} condition`);
    if (!isRiskFact(fact) || typeof match !== 'boolean') {
      throw new Error(`${where}: basis.profile.${list} holds a malformed condition`);
    }
    return { fact, value: match };
  });
}

/**
 * Reads the `basis` column (design D11).
 *
 * @throws naming `where` on any shape `basisOf` could not have written.
 */
export function parseBasis(raw: unknown, where: string): Basis {
  const basis = asRecord(raw, where, 'basis');
  const { source, scopeId, policyVersion, hardGates, phase, mode, pushedTopics } = basis;
  if (source !== 'project' && source !== 'organization' && source !== 'default') {
    throw new Error(`${where}: basis.source ${String(source)}`);
  }
  if (scopeId !== null && typeof scopeId !== 'string') throw new Error(`${where}: basis.scopeId`);
  if (policyVersion !== null && !Number.isSafeInteger(policyVersion)) {
    throw new Error(`${where}: basis.policyVersion`);
  }
  // Proof: this guard removed; `throws on a basis without a hard-gate list` passed a basis with none; watched 2026-11-DD.
  if (!Array.isArray(hardGates) || !hardGates.every(isRiskFact)) {
    throw new Error(`${where}: basis.hardGates is not a list of risk facts`);
  }
  // Proof: `isStepPhase` replaced by a string check; `throws on a basis whose phase is unknown` failed; watched 2026-11-DD.
  if (!isStepPhase(phase)) throw new Error(`${where}: basis.phase ${String(phase)}`);
  if (typeof mode !== 'string' || !(POLICY_MODES as readonly string[]).includes(mode)) {
    throw new Error(`${where}: basis.mode ${String(mode)}`);
  }
  const profile = asRecord(basis['profile'], where, 'basis.profile');
  if (!Array.isArray(pushedTopics) || !pushedTopics.every((topic) => typeof topic === 'string')) {
    throw new Error(`${where}: basis.pushedTopics is not a list of names`);
  }
  return {
    source,
    scopeId: scopeId as string | null,
    policyVersion: policyVersion as number | null,
    hardGates,
    phase,
    mode: mode as PolicyMode,
    profile: {
      blocks: parseConditions(profile['blocks'], where, 'blocks'),
      notifies: parseConditions(profile['notifies'], where, 'notifies'),
    },
    pushedTopics,
  };
}

/** The spec fixture's rule: unnamed facts are false, except `reversible`, which is true. */
export function factsNamed(named: Partial<RiskFacts>): RiskFacts {
  const facts = {} as Record<RiskFact, boolean>;
  for (const fact of RISK_FACTS) facts[fact] = named[fact] ?? fact === 'reversible';
  return facts;
}
```

The two `as` casts after the guards are narrowed by the lines above them; add the comment `// narrowed by the guard above; TypeScript loses the union through the destructure` beside each, or restructure into `typeof` checks that narrow in place.

- [ ] **Step 4: Narrow `Question.basis`**

In `question.ts` change `readonly basis: unknown;` to `readonly basis: Basis;` with `import type { Basis } from './question-basis';` at the top. There is no import cycle at runtime: `question-basis.ts` imports values from `question.ts`, `question.ts` imports only a type.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question-basis.test.ts src/question.test.ts`
Expected: PASS, 13 + 14 tests.

- [ ] **Step 6: Watch each precedence negative fail**

For each adjacent pair in `disposeQuestion`, swap the two `if` lines (or remove the topic line), run the file, confirm exactly the named witness fails with the named reading, revert. Do the same for the two parser guards. Fill in the dates and record all seven in `verify.md`.

- [ ] **Step 7: Typecheck and commit**

```bash
bunx nx run wbs-domain:typecheck
git add libs/wbs/domain/domain/src/question-basis.ts libs/wbs/domain/domain/src/question-basis.test.ts libs/wbs/domain/domain/src/question.ts libs/wbs/domain/domain/src/index.ts openspec/changes/wbs-questions/verify.md
git commit -F - <<'EOF'
feat(wbs-domain): basis snapshot and disposeQuestion

Task 1.2 of wbs-questions: basisOf freezes what the disposition reads, and
disposeQuestion judges hard gates, then offline, then the phase profile, then
pushed topics, each boundary proven by its own swapped-order witness.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 4: Downstream reach, question priority and counts

**Files:**

- Create: `libs/wbs/domain/domain/src/question-priority.ts`
- Create: `libs/wbs/domain/domain/src/question-priority.test.ts`
- Modify: `libs/wbs/domain/domain/src/index.ts` (add `export * from './question-priority';`)

**Interfaces:**

- Consumes: `NodeReading` from `./node-reading`; `Disposition`, `Verdict`, `SubmitterKind` from Task 1.
- Produces: `downstreamReach(start: string, successorsOf: (node: string) => Iterable<string>, readingOf: (node: string) => NodeReading | undefined): number`, `QuestionPriority`, `compareQuestionPriority(a, b): number`, `QuestionCountInput`, `QuestionCounts`, `QuestionCountsReading`, `submitterKey(kind, id): string`, `foldQuestionCounts(questions, now, unnoticedMinutes): QuestionCountsReading`.

The graph is abstract on purpose: section 3 feeds it step-node keys from `resolveStepNodeGraph` (`slice-edges.ts`) and readings from the live fold, so this module never re-derives step order (design D5, D13).

- [ ] **Step 1: Write the failing tests**

```ts
// libs/wbs/domain/domain/src/question-priority.test.ts
import { describe, expect, it } from 'bun:test';

import type { NodeReading } from './node-reading';
import {
  compareQuestionPriority,
  downstreamReach,
  foldQuestionCounts,
  type QuestionCountInput,
  submitterKey,
} from './question-priority';

const graph = (edges: Record<string, readonly string[]>) => (node: string) => edges[node] ?? [];
const readings = (map: Record<string, NodeReading>) => (node: string) => map[node];
const waiting = (...nodes: string[]): Record<string, NodeReading> =>
  Object.fromEntries(nodes.map((node) => [node, 'waiting']));

describe('downstream reach', () => {
  it('a diamond counts each node once', () => {
    const successors = graph({ a: ['b', 'c'], b: ['d'], c: ['d'] });
    expect(downstreamReach('a', successors, readings(waiting('a', 'b', 'c', 'd')))).toBe(3);
  });

  it('done successors do not count', () => {
    const successors = graph({ a: ['b', 'c'] });
    expect(downstreamReach('a', successors, readings({ ...waiting('a', 'b'), c: 'done' }))).toBe(1);
  });

  it('skipped nodes do not count but are traversed', () => {
    const successors = graph({ a: ['b'], b: ['c'] });
    expect(downstreamReach('a', successors, readings({ ...waiting('a', 'c'), b: 'skipped' }))).toBe(
      1,
    );
  });

  it('a cycle back to the start neither loops nor counts the start', () => {
    const successors = graph({ a: ['b'], b: ['a'] });
    expect(downstreamReach('a', successors, readings(waiting('a', 'b')))).toBe(1);
  });

  it('a node with no reading throws rather than counting', () => {
    expect(() => downstreamReach('a', graph({ a: ['b'] }), readings(waiting('a')))).toThrow('b');
  });
});

describe('question priority', () => {
  const at = (leafPriority: number | null, reach: number, submittedAt: number) => ({
    leafPriority,
    reach,
    submittedAt,
  });

  it('the bigger reach sorts first among equals', () => {
    const sorted = [at(1, 0, 10), at(1, 3, 20)].sort(compareQuestionPriority);
    expect(sorted.map((entry) => entry.reach)).toEqual([3, 0]);
  });

  it('a lower leaf priority sorts first and an absent one last', () => {
    const sorted = [at(null, 9, 1), at(2, 0, 1), at(1, 0, 1)].sort(compareQuestionPriority);
    expect(sorted.map((entry) => entry.leafPriority)).toEqual([1, 2, null]);
  });

  it('the earlier submission sorts first when priority and reach tie', () => {
    const sorted = [at(1, 2, 30), at(1, 2, 10)].sort(compareQuestionPriority);
    expect(sorted.map((entry) => entry.submittedAt)).toEqual([10, 30]);
  });
});

describe('question counts', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 100 * DAY;
  const question = (patch: Partial<QuestionCountInput>): QuestionCountInput => ({
    submittedByKind: 'machine',
    submittedById: 'cred-1',
    disposition: 'queued',
    verdict: null,
    submittedAt: now - DAY,
    reviewedAt: null,
    wrongFactCount: 0,
    ...patch,
  });

  it('unnoticed counts age, not verdict, and not blocked', () => {
    const counts = foldQuestionCounts(
      [
        question({ submittedAt: now - 8 * DAY }),
        question({ submittedAt: now - 2 * DAY }),
        question({ submittedAt: now - 30 * DAY, verdict: 'accepted', reviewedAt: now - DAY }),
        question({ submittedAt: now - 10 * DAY, disposition: 'blocked' }),
      ],
      now,
      7 * 24 * 60,
    );
    expect(counts.overall.unnoticed).toBe(1);
  });

  it('rates are absent before any verdict', () => {
    const counts = foldQuestionCounts([question({}), question({})], now, 7 * 24 * 60);
    expect(counts.overall.overturnRate).toBeNull();
    expect(counts.overall.wrongFactRate).toBeNull();
  });

  it('rates divide verdicts, resolved counting for wrong facts only', () => {
    const counts = foldQuestionCounts(
      [
        question({ verdict: 'accepted', reviewedAt: now, wrongFactCount: 1 }),
        question({ verdict: 'overturned', reviewedAt: now }),
        question({ disposition: 'blocked', verdict: 'resolved', reviewedAt: now }),
      ],
      now,
      7 * 24 * 60,
    );
    expect(counts.overall.overturnRate).toBe(0.5);
    expect(counts.overall.wrongFactRate).toBeCloseTo(1 / 3);
  });

  it('blocked time sums resolve-or-now minus submit, in minutes', () => {
    const counts = foldQuestionCounts(
      [
        question({ disposition: 'blocked', submittedAt: now - 2 * DAY }),
        question({
          disposition: 'blocked',
          submittedAt: now - 4 * DAY,
          verdict: 'resolved',
          reviewedAt: now - 3 * DAY,
        }),
      ],
      now,
      7 * 24 * 60,
    );
    expect(counts.overall.blockedMinutes).toBe(3 * 24 * 60);
  });

  it('folds per submitter under one key', () => {
    const counts = foldQuestionCounts(
      [
        question({ submittedById: 'cred-1', submittedAt: now - 8 * DAY }),
        question({ submittedByKind: 'user', submittedById: 'u1', submittedAt: now - 8 * DAY }),
        question({ submittedById: 'cred-1' }),
      ],
      now,
      7 * 24 * 60,
    );
    expect(counts.overall.unnoticed).toBe(2);
    expect(counts.bySubmitter.get(submitterKey('machine', 'cred-1'))?.unnoticed).toBe(1);
    expect(counts.bySubmitter.get(submitterKey('user', 'u1'))?.unnoticed).toBe(1);
    expect(counts.bySubmitter.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question-priority.test.ts`
Expected: FAIL, "Cannot find module './question-priority'".

- [ ] **Step 3: Write the module**

```ts
// libs/wbs/domain/domain/src/question-priority.ts
import type { NodeReading } from './node-reading';
import type { Disposition, SubmitterKind, Verdict } from './question';

const MINUTE = 60_000;

/**
 * How many distinct nodes `start` reaches over `successorsOf`, transitively,
 * whose reading is neither `done` nor `skipped` (design D5). Diamonds count
 * once; the start never counts itself; done and skipped nodes are traversed
 * but not counted.
 *
 * @throws when a reached node has no reading: a graph and a fold that
 * disagree are malformed trusted state, not a zero.
 */
export function downstreamReach(
  start: string,
  successorsOf: (node: string) => Iterable<string>,
  readingOf: (node: string) => NodeReading | undefined,
): number {
  const seen = new Set<string>([start]);
  const queue = [start];
  let reach = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] as string;
    for (const next of successorsOf(node)) {
      // Proof: `seen` check removed; `a diamond counts each node once` read 4; watched 2026-11-DD.
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
      const reading = readingOf(next);
      if (reading === undefined) throw new Error(`step node ${next} has no reading`);
      if (reading !== 'done' && reading !== 'skipped') reach += 1;
    }
  }
  return reach;
}

/** The tuple the review queue sorts by (design D5); nothing of it is stored. */
export interface QuestionPriority {
  /** The leaf's priority; `null` is absent and sorts last. */
  readonly leafPriority: number | null;
  readonly reach: number;
  readonly submittedAt: number;
}

/** Leaf priority ascending with absent last, reach descending, then submitted ascending. */
export function compareQuestionPriority(a: QuestionPriority, b: QuestionPriority): number {
  if (a.leafPriority !== b.leafPriority) {
    if (a.leafPriority === null) return 1;
    if (b.leafPriority === null) return -1;
    return a.leafPriority - b.leafPriority;
  }
  if (a.reach !== b.reach) return b.reach - a.reach;
  return a.submittedAt - b.submittedAt;
}

/** What the counts fold reads of each question. */
export interface QuestionCountInput {
  readonly submittedByKind: SubmitterKind;
  readonly submittedById: string;
  readonly disposition: Disposition;
  readonly verdict: Verdict | null;
  readonly submittedAt: number;
  readonly reviewedAt: number | null;
  readonly wrongFactCount: number;
}

/** The four figures of design D5; a rate is `null` when nothing divides it. */
export interface QuestionCounts {
  readonly unnoticed: number;
  readonly overturnRate: number | null;
  readonly wrongFactRate: number | null;
  readonly blockedMinutes: number;
}

export interface QuestionCountsReading {
  readonly overall: QuestionCounts;
  readonly bySubmitter: ReadonlyMap<string, QuestionCounts>;
}

/** The key `bySubmitter` uses for one credential or account. */
export function submitterKey(kind: SubmitterKind, id: string): string {
  return `${kind}:${id}`;
}

interface Tally {
  unnoticed: number;
  accepted: number;
  overturned: number;
  resolved: number;
  withWrongFacts: number;
  blockedMinutes: number;
}

const tally = (): Tally => ({
  unnoticed: 0,
  accepted: 0,
  overturned: 0,
  resolved: 0,
  withWrongFacts: 0,
  blockedMinutes: 0,
});

function countsOf(t: Tally): QuestionCounts {
  const judged = t.accepted + t.overturned;
  const all = judged + t.resolved;
  return {
    unnoticed: t.unnoticed,
    // Proof: `judged === 0` branch removed; `rates are absent before any verdict` read NaN; watched 2026-11-DD.
    overturnRate: judged === 0 ? null : t.overturned / judged,
    wrongFactRate: all === 0 ? null : t.withWrongFacts / all,
    blockedMinutes: t.blockedMinutes,
  };
}

/**
 * Folds the readable questions of a project into the counts (design D5):
 * unnoticed is `queued` or `notified`, unreviewed and older than
 * `unnoticedMinutes`; blocked questions are excluded from it and contribute
 * their open time instead.
 */
export function foldQuestionCounts(
  questions: readonly QuestionCountInput[],
  now: number,
  unnoticedMinutes: number,
): QuestionCountsReading {
  const overall = tally();
  const perSubmitter = new Map<string, Tally>();
  for (const question of questions) {
    const key = submitterKey(question.submittedByKind, question.submittedById);
    const own = perSubmitter.get(key) ?? tally();
    perSubmitter.set(key, own);
    for (const t of [overall, own]) {
      if (question.disposition === 'blocked') {
        t.blockedMinutes += ((question.reviewedAt ?? now) - question.submittedAt) / MINUTE;
      } else if (
        question.verdict === null &&
        // Proof: `>` relaxed to `>=` with a question exactly at the age; `unnoticed counts age` read 2; watched 2026-11-DD.
        now - question.submittedAt > unnoticedMinutes * MINUTE
      ) {
        t.unnoticed += 1;
      }
      if (question.verdict !== null) {
        t[question.verdict] += 1;
        if (question.wrongFactCount > 0) t.withWrongFacts += 1;
      }
    }
  }
  return {
    overall: countsOf(overall),
    bySubmitter: new Map([...perSubmitter].map(([key, t]) => [key, countsOf(t)])),
  };
}
```

For the `>=` proof, add a question at exactly `now - 7 * DAY` to the unnoticed test's input first (it must not count), so the relaxed comparison is observable.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/wbs/domain/domain && env -u CLAUDECODE bun test src/question-priority.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Watch the three proof negatives fail, restore, date, record in verify.md**

The dedup negative is the one the task list names: with the `seen` check removed, `a diamond counts each node once` must read 4.

- [ ] **Step 6: Run the whole domain project, typecheck, commit, open the section 1 PR**

```bash
bunx nx run wbs-domain:test
bunx nx run wbs-domain:typecheck
git add libs/wbs/domain/domain/src/question-priority.ts libs/wbs/domain/domain/src/question-priority.test.ts libs/wbs/domain/domain/src/index.ts openspec/changes/wbs-questions/verify.md
git commit -F - <<'EOF'
feat(wbs-domain): downstream reach, question priority and counts

Task 1.3 of wbs-questions: reach over an abstract successor graph counting
not-done nodes once, the three-key priority comparator, and the counts fold
whose rates are absent, not zero, before any verdict.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git push -u origin feat/wbs-questions-1-core
gh pr create --title "feat(wbs-domain): questions core — vocabularies, basis, disposition, reach and counts (wbs-questions section 1)" --body-file <(cat <<'EOF'
## Summary

Section 1 of `openspec/changes/wbs-questions/tasks.md`: pure functions in `@wbs/domain`, nothing reachable from a route.

- 1.1 vocabularies, `HARD_GATES`, `DEFAULT_QUESTION_POLICY`, `parseQuestionPolicy` (refuses `hard_gate_not_writable`), `parseBasis`, `parseWrongFacts`, `parseNoticePayload`, `parseNoticeReports`, each throwing with the row's identity.
- 1.2 `basisOf` and `disposeQuestion`, the five precedence witnesses and the replay test.
- 1.3 `downstreamReach`, `compareQuestionPriority`, `foldQuestionCounts`.

## Proofs

Every `// Proof:` comment names a fault watched failing its test; the table in `openspec/changes/wbs-questions/verify.md` lists them with dates.

## Checks

- `bunx nx run wbs-domain:test`, `bunx nx run wbs-domain:typecheck`: exit 0.
- prettier check and `check-indexes`: clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

Tick 1.1, 1.2 and 1.3 in `tasks.md` in a follow-up commit on the same PR.

---

## Section 2: storage

Branch `feat/wbs-questions-2-storage` from `feat/wbs-questions-1-core` (rebase onto main once section 1 merges). Migration timestamps below assume the branch is cut on 2026-11-03; if a later migration has landed on main with a greater timestamp, renumber all six to sort after it and update every name below.

### Task 5: Six migrations, their schema mirror and the audit vocabulary

**Files:**

- Create: `apps/wbs/be-01/drizzle/20261103100000_add_step_phase/{migration.sql,down.sql}`
- Create: `apps/wbs/be-01/drizzle/20261103100100_add_question_policy/{migration.sql,down.sql}`
- Create: `apps/wbs/be-01/drizzle/20261103100200_add_question/{migration.sql,down.sql}`
- Create: `apps/wbs/be-01/drizzle/20261103100300_add_notice/{migration.sql,down.sql}`
- Create: `apps/wbs/be-01/drizzle/20261103100400_add_project_reviewer/{migration.sql,down.sql}`
- Create: `apps/wbs/be-01/drizzle/20261103100500_widen_organization_audit_questions/{migration.sql,down.sql}`
- Create: `libs/wbs/adapters/store-sqlite/src/question-migration.db.test.ts`
- Modify: `libs/wbs/adapters/store-sqlite/src/schema.ts` (`step` at line 781; new tables after `stepBlockage` at line 3975; `organizationAudit` CHECKs at lines 3516-3550)
- Modify: `libs/wbs/application/core/src/ports/organization-audit.ts` (`ORGANIZATION_AUDIT_ACTIONS` near line 36, `OrganizationAuditSubjectKind` near line 51)
- Modify: every test pinning the migration list (Step 9), `docs/runbook-prod-deploy.md` lines 412-414 (guarded `down.sql` list)

**Interfaces:**

- Consumes: nothing from code; the SQL mirrors `design.md` D1.
- Produces: tables `question_policy`, `question`, `notice`, `project_reviewer`, column `step.phase`, audit actions `question_policy_changed` and `project_reviewers_changed`, subject kind `question_policy`; drizzle tables `questionPolicy`, `question`, `notice`, `projectReviewer` and row types `QuestionPolicyRow`, `QuestionRow`, `NoticeRow`, `ProjectReviewerRow`.

- [ ] **Step 1: Write the failing migration test**

Model it on `step-blockage-migration.db.test.ts` (same `FOLDER`, `runMigrations`, `rollbackTo`, `withDatabase`). The seed needs a user, a project, two steps, one leaf work item and a running attempt, because `question` carries a composite foreign key to `step_node_attempt`.

```ts
// libs/wbs/adapters/store-sqlite/src/question-migration.db.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { rollbackTo } from './migrate-down';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const BASELINE = '20261028100100_widen_organization_audit_agent_pools';
const STEP_PHASE = '20261103100000_add_step_phase';
const QUESTION_POLICY = '20261103100100_add_question_policy';
const QUESTION = '20261103100200_add_question';
const NOTICE = '20261103100300_add_notice';
const PROJECT_REVIEWER = '20261103100400_add_project_reviewer';
const AUDIT = '20261103100500_widen_organization_audit_questions';
let directory: string;
let path: string;

type Sqlite = ReturnType<typeof openDatabase>;

function withDatabase<T>(use: (sqlite: Sqlite) => T): T {
  const sqlite = openDatabase(path);
  try {
    return use(sqlite);
  } finally {
    sqlite.close();
  }
}

const BASIS = JSON.stringify({
  source: 'default',
  scopeId: null,
  policyVersion: null,
  hardGates: ['spends', 'touchesProduction', 'destructive', 'changesAccess'],
  phase: 'implementation',
  mode: 'by_step',
  profile: { blocks: [], notifies: [] },
  pushedTopics: [],
});

/** A complete question row; `patch` overrides columns by name. */
function insertQuestion(sqlite: Sqlite, id: string, patch: Record<string, unknown> = {}): void {
  const row: Record<string, unknown> = {
    id,
    work_item_id: 'a',
    step_id: 'dev',
    attempt_number: 1,
    project_id: 'p',
    submitted_by_kind: 'machine',
    submitted_by_id: 'cred-1',
    executor_person_id: 'person-a',
    kind: 'decision',
    cause: null,
    text: 'Which colour?',
    proposed_answer: 'Blue',
    reversible: 1,
    outward: 0,
    spends: 0,
    touches_production: 0,
    destructive: 0,
    changes_access: 0,
    topics: '[]',
    disposition: 'queued',
    basis: BASIS,
    submitted_at: 1000,
    blocked_at: null,
    verdict: null,
    answer: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    wrong_facts: '[]',
    follow_up_work_item_id: null,
    created_at: 1000,
    ...patch,
  };
  const columns = Object.keys(row);
  sqlite.run(
    `INSERT INTO question (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    columns.map((column) => row[column] as string | number | null),
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-question-migration-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  withDatabase((sqlite) => {
    sqlite.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('u','owner','x',1)",
    );
    sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org','Org',1)");
    sqlite.run(
      "INSERT INTO project (id,name,owner_id,revision,created_at) VALUES ('p','Plan','u',0,1)",
    );
    sqlite.run("UPDATE project SET organization_id = 'org' WHERE id = 'p'");
    sqlite.run(
      "INSERT INTO step (id,project_id,name,position) VALUES ('design','p','Design',1),('dev','p','Dev',2)",
    );
    sqlite.run(
      "INSERT INTO work_item (id,project_id,name,position,revision) VALUES ('a','p','A',1,0)",
    );
    sqlite.run(
      "INSERT INTO step_node_attempt (work_item_id,step_id,attempt_number,started_at,created_at) VALUES ('a','dev',1,900,900)",
    );
  });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
```

If the `organization` or `project.organization_id` columns differ from the names above, read `schema.ts`'s `organization` and `project` tables and seed what their NOT NULL columns require; the point is one organization that owns project `p`, because the audit rows reference it.

```ts
describe('step.phase', () => {
  it('defaults every existing step to implementation and refuses a third word', () => {
    withDatabase((sqlite) => {
      const phases = sqlite.query('SELECT phase FROM step ORDER BY position').all() as {
        phase: string;
      }[];
      expect(phases).toEqual([{ phase: 'implementation' }, { phase: 'implementation' }]);
      sqlite.run("UPDATE step SET phase = 'planning' WHERE id = 'design'");
      // Proof: the CHECK dropped from the ADD COLUMN; this admitted 'review'; watched 2026-11-DD.
      expect(() => sqlite.run("UPDATE step SET phase = 'review' WHERE id = 'dev'")).toThrow(
        /CHECK/,
      );
    });
  });

  it('refuses rollback while a step is in planning, keeping it', () => {
    withDatabase((sqlite) => sqlite.run("UPDATE step SET phase = 'planning' WHERE id = 'design'"));
    expect(() => rollbackTo(path, FOLDER, BASELINE)).toThrow('steps in planning exist');
    withDatabase((sqlite) => {
      expect(sqlite.query("SELECT phase FROM step WHERE id = 'design'").get()).toEqual({
        phase: 'planning',
      });
    });
  });
});

describe('question', () => {
  it('stores a complete decision and a complete blocker', () => {
    withDatabase((sqlite) => {
      insertQuestion(sqlite, 'q1');
      insertQuestion(sqlite, 'q2', {
        kind: 'blocker',
        cause: 'external',
        disposition: 'blocked',
        blocked_at: 1000,
      });
      expect(sqlite.query('SELECT COUNT(*) AS n FROM question').get()).toEqual({ n: 2 });
    });
  });

  it.each([
    ['a fact outside 0 and 1', { outward: 2 }],
    ['a cause on a decision', { cause: 'external' }],
    ['a blocker without a cause', { kind: 'blocker' }],
    ['blocked_at on a queued question', { blocked_at: 5 }],
    ['blocked without blocked_at', { disposition: 'blocked' }],
    ['a verdict without a reviewer', { verdict: 'accepted', reviewed_at: 2000 }],
    ['a verdict without an instant', { verdict: 'accepted', reviewed_by_user_id: 'u' }],
    [
      'resolved on a queued question',
      { verdict: 'resolved', answer: 'x', reviewed_by_user_id: 'u', reviewed_at: 2000 },
    ],
    [
      'accepted on a blocked question',
      {
        disposition: 'blocked',
        blocked_at: 1000,
        verdict: 'accepted',
        reviewed_by_user_id: 'u',
        reviewed_at: 2000,
      },
    ],
    [
      'overturned without an answer',
      { verdict: 'overturned', reviewed_by_user_id: 'u', reviewed_at: 2000 },
    ],
    [
      'a follow-up on an accepted question',
      {
        verdict: 'accepted',
        reviewed_by_user_id: 'u',
        reviewed_at: 2000,
        follow_up_work_item_id: 'b',
      },
    ],
    ['a submitter kind outside the three', { submitted_by_kind: 'robot' }],
    ['an unknown disposition', { disposition: 'parked' }],
    ['an attempt that does not exist', { attempt_number: 2 }],
  ])('refuses %s', (_, patch) => {
    withDatabase((sqlite) => {
      // Proof: each CHECK replaced by `CHECK (1)` in turn admitted exactly its own row; watched 2026-11-DD.
      expect(() => insertQuestion(sqlite, 'q1', patch)).toThrow(/CHECK|FOREIGN KEY/);
    });
  });

  it('a mounted partial index refuses a second unresolved blocked question', () => {
    withDatabase((sqlite) => {
      insertQuestion(sqlite, 'q1', { disposition: 'blocked', blocked_at: 1000 });
      // Proof: the index's WHERE dropped; this failed on the second queued insert below instead; watched 2026-11-DD.
      expect(() =>
        insertQuestion(sqlite, 'q2', { disposition: 'blocked', blocked_at: 1001 }),
      ).toThrow(/UNIQUE/);
      insertQuestion(sqlite, 'q3');
      sqlite.run(
        "UPDATE question SET verdict = 'resolved', answer = 'done', reviewed_by_user_id = 'u', reviewed_at = 2000 WHERE id = 'q1'",
      );
      insertQuestion(sqlite, 'q4', { disposition: 'blocked', blocked_at: 3000 });
    });
  });

  it("follows the attempt on the outgoing writer's cascade", () => {
    withDatabase((sqlite) => {
      insertQuestion(sqlite, 'q1');
      sqlite.run("DELETE FROM work_item WHERE id = 'a'");
      expect(sqlite.query('SELECT COUNT(*) AS n FROM question').get()).toEqual({ n: 0 });
    });
  });

  it('refuses rollback while a question exists, keeping it', () => {
    withDatabase((sqlite) => insertQuestion(sqlite, 'q1'));
    // Proof: the guard's count replaced by `0 = 0`; this saw the table dropped; watched 2026-11-DD.
    expect(() => rollbackTo(path, FOLDER, QUESTION_POLICY)).toThrow('questions exist');
    withDatabase((sqlite) => {
      expect(sqlite.query('SELECT COUNT(*) AS n FROM question').get()).toEqual({ n: 1 });
    });
  });
});

describe('question_policy, notice and project_reviewer', () => {
  const policy = (patch: Record<string, unknown> = {}) => ({
    scope: 'project',
    scope_id: 'p',
    version: 1,
    mode: 'by_step',
    profiles: '{}',
    topics: '[]',
    unanswered_minutes: 240,
    unnoticed_minutes: 10080,
    digest_on: 1,
    digest_hour: 8,
    created_at: 1,
    ...patch,
  });
  const insertPolicy = (sqlite: Sqlite, patch: Record<string, unknown> = {}) => {
    const row = policy(patch);
    const columns = Object.keys(row);
    sqlite.run(
      `INSERT INTO question_policy (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      columns.map((column) => row[column] as string | number | null),
    );
  };

  it.each([
    ['a scope outside the two', { scope: 'space' }],
    ['a zero version', { version: 0 }],
    ['an unknown mode', { mode: 'loose' }],
    ['a zero age', { unanswered_minutes: 0 }],
    ['a digest hour of 24', { digest_hour: 24 }],
    ['a digest flag of 2', { digest_on: 2 }],
  ])('question_policy refuses %s', (_, patch) => {
    withDatabase((sqlite) => {
      expect(() => insertPolicy(sqlite, patch)).toThrow(/CHECK/);
    });
  });

  const insertNotice = (sqlite: Sqlite, id: string, patch: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      id,
      project_id: 'p',
      user_id: 'u',
      reason: 'opened',
      question_id: 'q1',
      digest_day: null,
      payload: null,
      channel: 'openclaw',
      address: '+100',
      state: 'queued',
      undeliverable_reason: null,
      attempt_count: 0,
      due_at: 1000,
      lease_until: null,
      lease_token: null,
      reports: '[]',
      created_at: 1000,
      ...patch,
    };
    const columns = Object.keys(row);
    sqlite.run(
      `INSERT INTO notice (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      columns.map((column) => row[column] as string | number | null),
    );
  };

  it('notice refuses each forbidden pairing and the duplicate per reviewer and reason', () => {
    withDatabase((sqlite) => {
      insertQuestion(sqlite, 'q1');
      insertNotice(sqlite, 'n1');
      for (const [name, patch] of [
        ['a digest with a question', { reason: 'digest', digest_day: '2026-11-03', payload: '{}' }],
        ['an opened notice without a question', { question_id: null }],
        ['an opened notice with a digest day', { digest_day: '2026-11-03' }],
        ['a digest without a day', { reason: 'digest', question_id: null, payload: '{}' }],
        [
          'a digest without a payload',
          { reason: 'digest', question_id: null, digest_day: '2026-11-03' },
        ],
        ['undeliverable without a reason', { state: 'undeliverable' }],
        ['a reason on a queued notice', { undeliverable_reason: 'no_address' }],
        ['leased without a token', { state: 'leased', lease_until: 2000 }],
        ['a token without an expiry', { lease_token: 't', state: 'leased' }],
        ['a token on a queued notice', { lease_token: 't', lease_until: 2000 }],
        ['a sixth attempt', { attempt_count: 6 }],
        ['a channel outside openclaw', { channel: 'email' }],
      ] as const) {
        // Proof: each CHECK replaced by `CHECK (1)` in turn admitted exactly its own row; watched 2026-11-DD.
        expect(() => insertNotice(sqlite, `bad-${name}`, { ...patch }), name).toThrow(/CHECK/);
      }
      expect(() => insertNotice(sqlite, 'n2')).toThrow(/UNIQUE/);
      insertNotice(sqlite, 'n3', { reason: 'aged' });
      insertNotice(sqlite, 'd1', {
        reason: 'digest',
        question_id: null,
        digest_day: '2026-11-03',
        payload: '{"count":1,"oldestAgeMinutes":1,"top":[]}',
      });
      expect(() =>
        insertNotice(sqlite, 'd2', {
          reason: 'digest',
          question_id: null,
          digest_day: '2026-11-03',
          payload: '{}',
        }),
      ).toThrow(/UNIQUE/);
    });
  });

  it('project_reviewer cascades with its project and refuses a second channel word', () => {
    withDatabase((sqlite) => {
      sqlite.run(
        "INSERT INTO project_reviewer (project_id,user_id,channel,address,created_at) VALUES ('p','u','openclaw','+100',1)",
      );
      expect(() =>
        sqlite.run(
          "INSERT INTO project_reviewer (project_id,user_id,channel,address,created_at) VALUES ('p','u','email','x',1)",
        ),
      ).toThrow(/CHECK|UNIQUE/);
      sqlite.run("DELETE FROM project WHERE id = 'p'");
      expect(sqlite.query('SELECT COUNT(*) AS n FROM project_reviewer').get()).toEqual({ n: 0 });
    });
  });
});

describe('organization_audit vocabulary', () => {
  const insertAudit = (sqlite: Sqlite, id: string, action: string, kind: string) =>
    sqlite.run(
      'INSERT INTO organization_audit (id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, 'org', 'u', action, kind, 'p', '{}', 1],
    );

  it('admits the two question actions and refuses a stranger', () => {
    withDatabase((sqlite) => {
      insertAudit(sqlite, 'a1', 'question_policy_changed', 'question_policy');
      insertAudit(sqlite, 'a2', 'project_reviewers_changed', 'project');
      // Proof: the two words left out of the rebuild; the two inserts above failed on the CHECK; watched 2026-11-DD.
      expect(() => insertAudit(sqlite, 'a3', 'question_answered', 'project')).toThrow(/CHECK/);
      expect(() => sqlite.run("DELETE FROM organization_audit WHERE id = 'a1'")).toThrow(
        /append-only/,
      );
    });
  });

  it('refuses rollback over a question audit row and rolls the rest back and forward', () => {
    withDatabase((sqlite) =>
      insertAudit(sqlite, 'a1', 'question_policy_changed', 'question_policy'),
    );
    expect(() => rollbackTo(path, FOLDER, PROJECT_REVIEWER)).toThrow('question audit rows exist');
  });

  it('rolls all six back to the baseline and forward again on an empty database', () => {
    rollbackTo(path, FOLDER, BASELINE);
    withDatabase((sqlite) => {
      const tables = sqlite
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('question','question_policy','notice','project_reviewer')",
        )
        .all();
      expect(tables).toEqual([]);
      expect(() => sqlite.query('SELECT phase FROM step').all()).toThrow(/no such column/);
    });
    runMigrations(path, FOLDER);
    withDatabase((sqlite) => {
      const names = (
        sqlite.query('SELECT name FROM __drizzle_migrations ORDER BY name').all() as {
          name: string;
        }[]
      ).map((row) => row.name);
      expect(names.slice(-6)).toEqual([
        STEP_PHASE,
        QUESTION_POLICY,
        QUESTION,
        NOTICE,
        PROJECT_REVIEWER,
        AUDIT,
      ]);
    });
  });
});
```

If `__drizzle_migrations` stores names in another column, read `migration-ledger.ts` and use its column; the assertion is that the six names are the newest six in order.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/wbs/adapters/store-sqlite && env -u CLAUDECODE bun test src/question-migration.db.test.ts`
Expected: FAIL on the first `step.phase` query, "no such column: phase".

- [ ] **Step 3: Write `20261103100000_add_step_phase`**

`migration.sql`:

```sql
-- A step definition's phase (`wbs-questions` D1, task 2.1): which question
-- profile the plan applies to questions raised on the step. Additive: the
-- column has a default, so the outgoing release's INSERT still works and
-- every existing step reads `implementation`. The CHECK is column-level so
-- SQLite accepts it on ADD COLUMN, as `20261012130000_add_step_estimate_unit`.
--
-- Proof: the CHECK dropped; `defaults every existing step to implementation
-- and refuses a third word` (question-migration.db.test.ts) admitted
-- 'review'; watched 2026-11-DD.
ALTER TABLE `step` ADD COLUMN `phase` TEXT NOT NULL DEFAULT 'implementation' CONSTRAINT step_phase CHECK (`phase` IN ('planning', 'implementation'));
```

`down.sql`:

```sql
-- Reverses `20261103100000_add_step_phase`.
--
-- A phase someone set is never silently forgotten: the first statement fails
-- its CHECK while any step is in planning, and the runner reverts this script
-- and its ledger row in one transaction.
--
-- Proof: with the guard's filter replaced by `WHERE 0`, `refuses rollback
-- while a step is in planning, keeping it` saw the column dropped; watched
-- 2026-11-DD.
CREATE TEMP TABLE `step_phase_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "steps in planning exist: a rollback never forgets a phase" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `step_phase_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `step` WHERE `phase` = 'planning') = 0;
--> statement-breakpoint
DROP TABLE `step_phase_down_check`;
--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `phase`;
```

- [ ] **Step 4: Write `20261103100100_add_question_policy`**

`migration.sql`:

```sql
-- A project's or organization's own question policy (`wbs-questions` D1, D3,
-- task 2.1). Additive: one new table nothing of the outgoing release reads.
-- A missing row inherits (project → organization → the deployment default
-- constant); `scope_id` is the project or organization id and carries no
-- foreign key because it names one of two tables. `profiles` and `topics`
-- are JSON read by one parser each (D11), which is why they are only
-- NOT NULL here.
--
-- Proof: each CHECK replaced by `CHECK (1)` in turn admitted exactly its own
-- row in `question_policy refuses …` (question-migration.db.test.ts);
-- watched 2026-11-DD.
CREATE TABLE `question_policy` (
	`scope` text NOT NULL CHECK (`scope` IN ('organization', 'project')),
	`scope_id` text NOT NULL,
	`version` integer NOT NULL CHECK (typeof(`version`) = 'integer' AND `version` >= 1),
	`mode` text NOT NULL CHECK (`mode` IN ('by_step', 'offline')),
	`profiles` text NOT NULL,
	`topics` text NOT NULL,
	`unanswered_minutes` integer NOT NULL CHECK (typeof(`unanswered_minutes`) = 'integer' AND `unanswered_minutes` >= 1),
	`unnoticed_minutes` integer NOT NULL CHECK (typeof(`unnoticed_minutes`) = 'integer' AND `unnoticed_minutes` >= 1),
	`digest_on` integer NOT NULL CHECK (`digest_on` IN (0, 1)),
	`digest_hour` integer NOT NULL CHECK (typeof(`digest_hour`) = 'integer' AND `digest_hour` BETWEEN 0 AND 23),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`scope`, `scope_id`)
);
```

`down.sql`: the same guard shape as the agent pool one, constraint text `"question policies exist: a rollback never discards a written policy"`, counting `question_policy`, then `DROP TABLE \`question_policy\`;`.

- [ ] **Step 5: Write `20261103100200_add_question`**

`migration.sql`:

```sql
-- A question: the satellite fact beside a step node and the attempt that
-- raised it (ADR 0062; `wbs-questions` D1, task 2.1). Additive: one new
-- table. The composite foreign key to `step_node_attempt` cascades so the
-- outgoing release's work-item deletion and attempt restore keep working
-- mid-swap; the new writer refuses first (D7) and never reaches it.
-- `submitted_by_id` and `executor_person_id` are plain ids so a revoked
-- credential or a removed person keeps the history. `follow_up_work_item_id`
-- is a plain id: whether the work item exists is derived on read.
-- `topics`, `basis` and `wrong_facts` are JSON with one reader each (D11).
--
-- Proof: each CHECK replaced by `CHECK (1)` in turn admitted exactly its own
-- row in `question refuses …`; the partial index's WHERE dropped made
-- `a mounted partial index refuses a second unresolved blocked question` fail
-- on the queued insert (question-migration.db.test.ts); watched 2026-11-DD.
CREATE TABLE `question` (
	`id` text PRIMARY KEY NOT NULL,
	`work_item_id` text NOT NULL,
	`step_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`project_id` text NOT NULL REFERENCES `project`(`id`),
	`submitted_by_kind` text NOT NULL CHECK (`submitted_by_kind` IN ('user', 'machine', 'consent')),
	`submitted_by_id` text NOT NULL,
	`executor_person_id` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('decision', 'blocker')),
	`cause` text CHECK (`cause` IN ('authorization', 'external', 'missing_input')),
	`text` text NOT NULL CHECK (length(`text`) >= 1),
	`proposed_answer` text NOT NULL CHECK (length(`proposed_answer`) >= 1),
	`reversible` integer NOT NULL CHECK (`reversible` IN (0, 1)),
	`outward` integer NOT NULL CHECK (`outward` IN (0, 1)),
	`spends` integer NOT NULL CHECK (`spends` IN (0, 1)),
	`touches_production` integer NOT NULL CHECK (`touches_production` IN (0, 1)),
	`destructive` integer NOT NULL CHECK (`destructive` IN (0, 1)),
	`changes_access` integer NOT NULL CHECK (`changes_access` IN (0, 1)),
	`topics` text NOT NULL,
	`disposition` text NOT NULL CHECK (`disposition` IN ('queued', 'notified', 'blocked')),
	`basis` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`blocked_at` integer,
	`verdict` text CHECK (`verdict` IN ('accepted', 'overturned', 'resolved')),
	`answer` text,
	`reviewed_by_user_id` text REFERENCES `users`(`id`),
	`reviewed_at` integer,
	`wrong_facts` text NOT NULL DEFAULT '[]',
	`follow_up_work_item_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `question_cause_iff_blocker` CHECK ((`cause` IS NULL) = (`kind` = 'decision')),
	CONSTRAINT `question_blocked_at_iff_blocked` CHECK ((`blocked_at` IS NULL) = (`disposition` <> 'blocked')),
	CONSTRAINT `question_review_pair` CHECK ((`verdict` IS NULL) = (`reviewed_by_user_id` IS NULL) AND (`verdict` IS NULL) = (`reviewed_at` IS NULL)),
	CONSTRAINT `question_verdict_fits_disposition` CHECK (`verdict` IS NULL OR (`verdict` = 'resolved') = (`disposition` = 'blocked')),
	CONSTRAINT `question_answer_required` CHECK (`verdict` IS NULL OR `verdict` = 'accepted' OR `answer` IS NOT NULL),
	CONSTRAINT `question_follow_up_only_overturned` CHECK (`follow_up_work_item_id` IS NULL OR `verdict` = 'overturned'),
	FOREIGN KEY (`work_item_id`, `step_id`, `attempt_number`) REFERENCES `step_node_attempt`(`work_item_id`, `step_id`, `attempt_number`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_unresolved_blocked` ON `question` (`work_item_id`, `step_id`) WHERE `disposition` = 'blocked' AND `verdict` IS NULL;
--> statement-breakpoint
CREATE INDEX `question_by_project` ON `question` (`project_id`, `submitted_at`);
--> statement-breakpoint
CREATE INDEX `question_by_node` ON `question` (`work_item_id`, `step_id`);
--> statement-breakpoint
CREATE INDEX `question_by_step` ON `question` (`step_id`);
```

`down.sql`: guard constraint text `"questions exist: a rollback never discards a retained question"` over `question`, then `DROP INDEX` the four in reverse, then `DROP TABLE \`question\`;`.

- [ ] **Step 6: Write `20261103100300_add_notice`**

`migration.sql`:

```sql
-- The notice outbox (`wbs-questions` D1, D8, task 2.1): one row per reviewer
-- per question (opened, aged) or per day (digest), leased out to the Dash
-- activity. Additive. `question_id` cascades with the question for the same
-- outgoing-writer reason the question cascades with its attempt. `payload`
-- and `reports` are JSON with one reader each (D11).
--
-- Proof: each CHECK replaced by `CHECK (1)` in turn admitted exactly its own
-- row in `notice refuses each forbidden pairing …`; each unique index
-- dropped admitted its duplicate (question-migration.db.test.ts); watched
-- 2026-11-DD.
CREATE TABLE `notice` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL REFERENCES `project`(`id`),
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`reason` text NOT NULL CHECK (`reason` IN ('opened', 'aged', 'digest')),
	`question_id` text REFERENCES `question`(`id`) ON DELETE CASCADE,
	`digest_day` text CHECK (`digest_day` IS NULL OR `digest_day` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	`payload` text,
	`channel` text NOT NULL CHECK (`channel` IN ('openclaw')),
	`address` text,
	`state` text NOT NULL CHECK (`state` IN ('queued', 'leased', 'delivered', 'failed', 'undeliverable')),
	`undeliverable_reason` text CHECK (`undeliverable_reason` IN ('no_address', 'no_access')),
	`attempt_count` integer NOT NULL DEFAULT 0 CHECK (typeof(`attempt_count`) = 'integer' AND `attempt_count` BETWEEN 0 AND 5),
	`due_at` integer NOT NULL,
	`lease_until` integer,
	`lease_token` text,
	`reports` text NOT NULL DEFAULT '[]',
	`created_at` integer NOT NULL,
	CONSTRAINT `notice_question_iff_not_digest` CHECK ((`question_id` IS NULL) = (`reason` = 'digest')),
	CONSTRAINT `notice_day_iff_digest` CHECK ((`digest_day` IS NULL) = (`reason` <> 'digest')),
	CONSTRAINT `notice_payload_iff_digest` CHECK ((`payload` IS NULL) = (`reason` <> 'digest')),
	CONSTRAINT `notice_undeliverable_reason` CHECK ((`undeliverable_reason` IS NULL) = (`state` <> 'undeliverable')),
	CONSTRAINT `notice_lease_pair` CHECK ((`lease_token` IS NULL) = (`lease_until` IS NULL)),
	CONSTRAINT `notice_lease_iff_leased` CHECK ((`lease_token` IS NULL) = (`state` <> 'leased'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notice_question_reviewer_reason` ON `notice` (`question_id`, `user_id`, `reason`) WHERE `reason` IN ('opened', 'aged');
--> statement-breakpoint
CREATE UNIQUE INDEX `notice_digest_day` ON `notice` (`project_id`, `user_id`, `digest_day`) WHERE `reason` = 'digest';
--> statement-breakpoint
CREATE INDEX `notice_due` ON `notice` (`state`, `due_at`);
--> statement-breakpoint
CREATE INDEX `notice_by_project` ON `notice` (`project_id`);
```

`down.sql`: guard `"notices exist: a rollback never discards an outbox"` over `notice`, four `DROP INDEX` in reverse, `DROP TABLE \`notice\`;`.

- [ ] **Step 7: Write `20261103100400_add_project_reviewer` and `20261103100500_widen_organization_audit_questions`**

`add_project_reviewer/migration.sql`:

```sql
-- The accounts a project lists to receive its notices (`wbs-questions` D1,
-- D6, task 2.1). Additive; cascades with the project and the account because
-- the list is the project's, not evidence.
--
-- Proof: the channel CHECK dropped admitted 'email' in `project_reviewer
-- cascades with its project and refuses a second channel word`; watched
-- 2026-11-DD.
CREATE TABLE `project_reviewer` (
	`project_id` text NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`channel` text NOT NULL CHECK (`channel` IN ('openclaw')),
	`address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`project_id`, `user_id`)
);
```

Its `down.sql` has no guard (the list is settings, re-enterable): `DROP TABLE \`project_reviewer\`;` with a two-line comment saying so.

`widen_organization_audit_questions/migration.sql`: copy `20261028100100_widen_organization_audit_agent_pools/migration.sql` whole, then:

- replace the header with one naming `wbs-questions` D1 and task 2.1, the two actions `question_policy_changed` (subject kind `question_policy`, subject id the scope id) and `project_reviewers_changed` (existing subject kind `project`), and the Proof line `-- Proof: the two words left out of this rebuild; admits the two question actions and refuses a stranger (question-migration.db.test.ts) failed on the CHECK; watched 2026-11-DD.`;
- append `'question_policy_changed',` and `'project_reviewers_changed'` to the `action` list and `'question_policy'` to the `subject_kind` list;
- keep the markers on lines 1 and 2, the copy, the `DROP`, the `RENAME`, the two append-only triggers, the `pragma_foreign_key_check` guard and the two machine-token partial unique indexes byte for byte; rename the temp guard table to `organization_audit_questions_fk_guard`.

Its `down.sql`: copy the agent-pools `down.sql`, rename the guard table to `organization_audit_questions_down_check` with constraint text `"question audit rows exist: audit evidence is never discarded by a rollback"`, count rows whose `action IN ('question_policy_changed', 'project_reviewers_changed') OR subject_kind = 'question_policy'`, and rebuild with the agent-pools vocabulary (the 28 actions and 10 kinds listed in that migration).

- [ ] **Step 8: Mirror the six in `schema.ts` and the audit port**

In `schema.ts`:

- `step` (line 781): add `phase: text('phase', { enum: STEP_PHASES }).notNull().default('implementation'),` and `check('step_phase', sql\`${t.phase} IN ('planning', 'implementation')\`)`, importing `STEP_PHASES`from`@wbs/domain`beside`ATTEMPT_OUTCOMES`.
- After `stepBlockage`, add four tables whose column names, CHECK names, index names and foreign keys match the SQL above exactly (the index names are asserted by `schema-indexes.db.test.ts`). Pattern, for `question`:

```ts
/** The satellite fact beside a step node and its attempt (ADR 0062, `wbs-questions` D1). */
export const question = sqliteTable(
  'question',
  {
    id: text('id').primaryKey(),
    workItemId: text('work_item_id').notNull(),
    stepId: text('step_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id),
    submittedByKind: text('submitted_by_kind', { enum: SUBMITTER_KINDS }).notNull(),
    submittedById: text('submitted_by_id').notNull(),
    executorPersonId: text('executor_person_id').notNull(),
    kind: text('kind', { enum: QUESTION_KINDS }).notNull(),
    cause: text('cause', { enum: BLOCKER_CAUSES }),
    text: text('text').notNull(),
    proposedAnswer: text('proposed_answer').notNull(),
    reversible: integer('reversible').notNull(),
    outward: integer('outward').notNull(),
    spends: integer('spends').notNull(),
    touchesProduction: integer('touches_production').notNull(),
    destructive: integer('destructive').notNull(),
    changesAccess: integer('changes_access').notNull(),
    topics: text('topics').notNull(),
    disposition: text('disposition', { enum: DISPOSITIONS }).notNull(),
    basis: text('basis').notNull(),
    submittedAt: integer('submitted_at').notNull(),
    blockedAt: integer('blocked_at'),
    verdict: text('verdict', { enum: VERDICTS }),
    answer: text('answer'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    reviewedAt: integer('reviewed_at'),
    wrongFacts: text('wrong_facts').notNull().default('[]'),
    followUpWorkItemId: text('follow_up_work_item_id'),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.workItemId, t.stepId, t.attemptNumber],
      foreignColumns: [
        stepNodeAttempt.workItemId,
        stepNodeAttempt.stepId,
        stepNodeAttempt.attemptNumber,
      ],
    }).onDelete('cascade'),
    uniqueIndex('question_unresolved_blocked')
      .on(t.workItemId, t.stepId)
      .where(sql`${t.disposition} = 'blocked' AND ${t.verdict} IS NULL`),
    index('question_by_project').on(t.projectId, t.submittedAt),
    index('question_by_node').on(t.workItemId, t.stepId),
    index('question_by_step').on(t.stepId),
    check('question_cause_iff_blocker', sql`(${t.cause} IS NULL) = (${t.kind} = 'decision')`),
    check(
      'question_blocked_at_iff_blocked',
      sql`(${t.blockedAt} IS NULL) = (${t.disposition} <> 'blocked')`,
    ),
    check(
      'question_review_pair',
      sql`(${t.verdict} IS NULL) = (${t.reviewedByUserId} IS NULL) AND (${t.verdict} IS NULL) = (${t.reviewedAt} IS NULL)`,
    ),
    check(
      'question_verdict_fits_disposition',
      sql`${t.verdict} IS NULL OR (${t.verdict} = 'resolved') = (${t.disposition} = 'blocked')`,
    ),
    check(
      'question_answer_required',
      sql`${t.verdict} IS NULL OR ${t.verdict} = 'accepted' OR ${t.answer} IS NOT NULL`,
    ),
    check(
      'question_follow_up_only_overturned',
      sql`${t.followUpWorkItemId} IS NULL OR ${t.verdict} = 'overturned'`,
    ),
  ],
);
export type QuestionRow = typeof question.$inferSelect;
```

`foreignKey` comes from `drizzle-orm/sqlite-core`. Write `questionPolicy` (primary key `(scope, scopeId)`), `notice` (the two partial unique indexes and two plain indexes named as in the SQL) and `projectReviewer` the same way, and export `QuestionPolicyRow`, `NoticeRow`, `ProjectReviewerRow`. Add the two actions and the subject kind to `organizationAudit`'s CHECKs (lines 3516-3550) and to the JSDoc list of widening migrations above it.

In `libs/wbs/application/core/src/ports/organization-audit.ts`: append `'question_policy_changed'` and `'project_reviewers_changed'` to `ORGANIZATION_AUDIT_ACTIONS` and `| 'question_policy'` to `OrganizationAuditSubjectKind`.

- [ ] **Step 9: Extend every pinned migration list**

```bash
grep -rl 20261028100100_widen_organization_audit_agent_pools --include=*.ts apps libs
```

For each file: a newest-first list (rollback strings such as `rolled back: 20261028100100_…, 20261028100000_…`) gets the six new names prepended in reverse order (`20261103100500_…, 20261103100400_…, …, 20261103100000_…`); an oldest-first list gets them appended in order; a pin such as `expect(baselineLedger.at(-1)?.name).toBe('20261028100100_…')` moves to `20261103100500_widen_organization_audit_questions`. Add the three guarded `down.sql` scripts (step phase, question policy, question, notice, audit) to the list in `docs/runbook-prod-deploy.md` lines 412-414.

Run: `bunx nx run-many -t test -p wbs-store-sqlite,wbs-be-01 --parallel=2` and fix every remaining pin the grep missed.

- [ ] **Step 10: Run the migration test and the schema parity test**

Run: `cd libs/wbs/adapters/store-sqlite && env -u CLAUDECODE bun test src/question-migration.db.test.ts src/schema-indexes.db.test.ts`
Expected: PASS. If `schema-indexes` lists a name on one side only, the SQL and `schema.ts` disagree; fix the name, never the test.

- [ ] **Step 11: Watch the proof negatives fail**

For each Proof line in the six `migration.sql`, the five `down.sql` and the test: inject the fault, rerun the test file, confirm the named test fails as named, revert, date. Record each in `verify.md`. Run the migration lint on the new folders:

```bash
bun tools/tool-git-hooks/src/hooks/migration-lint.ts
```

(If the hook takes arguments, read its header; it must exit 0 and name no forbidden statement.)

- [ ] **Step 12: Commit**

```bash
git add apps/wbs/be-01/drizzle/20261103* libs/wbs/adapters/store-sqlite/src/schema.ts libs/wbs/adapters/store-sqlite/src/question-migration.db.test.ts libs/wbs/application/core/src/ports/organization-audit.ts docs/runbook-prod-deploy.md openspec/changes/wbs-questions/verify.md $(grep -rl 20261103100500_widen_organization_audit_questions --include=*.ts apps libs)
git commit -F - <<'EOF'
feat(wbs-store-sqlite): question tables, step phase and the audit words

Task 2.1 of wbs-questions: six additive migrations with guarded rollbacks,
their schema.ts mirror, the two audit actions, and every pinned migration
list extended. The question table's composite attempt key cascades for the
outgoing writer; its partial unique index makes one unresolved blocked
question per node a constraint.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 6: The step phase through the `Step` port

**Files:**

- Modify: `libs/wbs/application/core/src/ports/step-store.ts` (`Step` at line 8, `NewStep` near line 46)
- Modify: `libs/wbs/adapters/store-sqlite/src/step.ts` (`StepRepository`, line 99: every select of step columns and the insert)
- Modify: `libs/wbs/adapters/store-memory/src/step-fixture.ts` (`stepRow` at line 13, `inMemorySteps` at line 53)
- Modify: `libs/wbs/application/conformance/src/stores/steps.ts` (one case reads the phase back)
- Test: the existing `steps` conformance cases run through `bunx nx run wbs-store-sqlite:test:conformance` and `bunx nx run wbs-store-memory:test:conformance`

**Interfaces:**

- Consumes: `StepPhase`, `STEP_PHASES` from Task 1.
- Produces: `Step.phase: StepPhase`; `NewStep.phase?: StepPhase` (absent means `implementation`); `StepStore.patch` (or whatever the existing update method is called; read the interface) accepts `phase`.

- [ ] **Step 1: Add a failing conformance case**

In `libs/wbs/application/conformance/src/stores/steps.ts`, register `steps.add:phase-defaults-and-round-trips` in the same `storeCase('steps', …)` form the file already uses:

```ts
storeCase('steps', 'steps.add:phase-defaults-and-round-trips', open, async ({ port, seed }) => {
  const projectId = seed.projectIds[0];
  const added = await port.add({ id: 'step-phase-default', projectId, name: 'Review' }, seed.stamps[0]);
  expect(added).toMatchObject({ phase: 'implementation' });
  const planning = await port.add(
    { id: 'step-phase-planning', projectId, name: 'Design', phase: 'planning' },
    seed.stamps[0],
  );
  expect(planning).toMatchObject({ phase: 'planning' });
  const listed = await port.listByProject(projectId);
  expect(listed.find((step) => step.id === 'step-phase-planning')?.phase).toBe('planning');
}),
```

Adapt `port.add`'s argument shape and return to what `StepStore` declares (read `step-store.ts` first; if `add` answers an outcome object, assert through `listByProject`). Add the case id to `CASE_MANIFEST.steps` in `case-manifest.ts`.

- [ ] **Step 2: Run both conformance suites to verify the case fails**

Run: `bunx nx run wbs-store-memory:test:conformance` and `bunx nx run wbs-store-sqlite:test:conformance`
Expected: FAIL, `phase` undefined (memory) or not selected (sqlite).

- [ ] **Step 3: Carry the phase through the port and both adapters**

`step-store.ts`: add `readonly phase: StepPhase;` to `Step` with the JSDoc `/** Which question profile applies to questions raised on the step (\`wbs-questions\` D1). */`, and `phase?: StepPhase`to`NewStep`(keep its`Omit`and add`phase?`beside`code?`). If the store has a patch/update method, add `phase?: StepPhase` to its change type.

`store-sqlite/src/step.ts`: add `phase: step.phase` to every `select({...})` that builds a `Step`, write `phase: input.phase ?? 'implementation'` on insert, and include `phase` in the patch's `set` when present.

`store-memory/src/step-fixture.ts`: `stepRow` carries `phase: input.phase ?? 'implementation'`; the patch path copies `phase` when given.

- [ ] **Step 4: Run both conformance suites, the step db tests and typecheck**

Run: `bunx nx run-many -t test:conformance -p wbs-store-sqlite,wbs-store-memory --parallel=2`, then `cd libs/wbs/adapters/store-sqlite && env -u CLAUDECODE bun test src/step.db.test.ts`, then `bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance --parallel=2`.
Expected: PASS, exit 0. Any other compile error names a `Step` literal in a test that now lacks `phase`: add `phase: 'implementation'` there.

- [ ] **Step 5: Commit**

```bash
git add libs/wbs/application/core/src/ports/step-store.ts libs/wbs/adapters/store-sqlite/src/step.ts libs/wbs/adapters/store-memory/src/step-fixture.ts libs/wbs/application/conformance/src/stores/steps.ts libs/wbs/application/conformance/src/case-manifest.ts
git add -u
git commit -F - <<'EOF'
feat(wbs-core): a step definition carries its phase

Task 2.1 of wbs-questions, the port half: Step.phase defaults to
implementation through both adapters and round-trips planning, certified by
one conformance case.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 7: The four ports, the store registry and the memory adapters

**Files:**

- Create: `libs/wbs/application/core/src/ports/question-store.ts`
- Create: `libs/wbs/application/core/src/ports/question-policy-store.ts`
- Create: `libs/wbs/application/core/src/ports/notice-store.ts`
- Create: `libs/wbs/application/core/src/ports/project-reviewer-store.ts`
- Modify: `libs/wbs/application/core/src/ports/stores.ts` (`PlanTransactionalStores`, after `blockages` at line 73) and the core `index.ts` that re-exports ports (grep `step-blockage-store` in `libs/wbs/application/core/src/index.ts`)
- Create: `libs/wbs/adapters/store-memory/src/question-fixture.ts`, `question-policy-fixture.ts`, `notice-fixture.ts`, `project-reviewer-fixture.ts`
- Create: `libs/wbs/adapters/store-memory/src/question-fixture.test.ts`
- Modify: `libs/wbs/adapters/store-memory/src/memory-stores.ts` (tables at lines 126-163, snapshot copy near lines 294-315), `in-memory-source.ts` (line 98 area)

**Interfaces:**

- Consumes: `Question`, `QuestionReview`, `QuestionPolicy`, `Notice`, `ProjectReviewer`, `PolicySource`, `StepPhase` from Tasks 1 to 3; `WriteStamp`.
- Produces (exact):

```ts
// question-store.ts
export type QuestionScope =
  | { readonly kind: 'work_items'; readonly ids: readonly string[] }
  | { readonly kind: 'step'; readonly stepId: string }
  | {
      readonly kind: 'attempt';
      readonly workItemId: string;
      readonly stepId: string;
      readonly attemptNumber: number;
    };
export interface QuestionStore {
  add(question: Question, stamp: WriteStamp): Promise<void>;
  findById(id: string): Promise<Question | undefined>;
  listByProject(projectId: string): Promise<Question[]>;
  listByNode(workItemId: string, stepId: string): Promise<Question[]>;
  review(
    id: string,
    review: QuestionReview,
    stamp: WriteStamp,
  ): Promise<'written' | 'not_found' | 'already_reviewed'>;
  holdsAny(scope: QuestionScope): Promise<boolean>;
}

// question-policy-store.ts
export type PolicyScope = 'organization' | 'project';
export interface StoredQuestionPolicy {
  readonly scope: PolicyScope;
  readonly scopeId: string;
  readonly version: number;
  readonly policy: QuestionPolicy;
}
export interface EffectiveQuestionPolicy {
  readonly policy: QuestionPolicy;
  readonly source: PolicySource;
  readonly scopeId: string | null;
  readonly version: number | null;
}
export interface PolicyAudit {
  readonly auditId: string;
  readonly organizationId: string;
  readonly actorId: string;
}
export interface QuestionPolicies {
  readEffective(projectId: string): Promise<EffectiveQuestionPolicy>;
  read(scope: PolicyScope, scopeId: string): Promise<StoredQuestionPolicy | undefined>;
  write(
    scope: PolicyScope,
    scopeId: string,
    policy: QuestionPolicy,
    audit: PolicyAudit,
    stamp: WriteStamp,
  ): Promise<{ readonly version: number } | 'unchanged'>;
}

// notice-store.ts
export type NewNotice = Omit<
  Notice,
  'state' | 'attemptCount' | 'leaseUntil' | 'leaseToken' | 'reports'
> & { readonly state: 'queued' | 'undeliverable' };
export interface NoticeStore {
  add(notices: readonly NewNotice[], stamp: WriteStamp): Promise<void>;
  findById(id: string): Promise<Notice | undefined>;
  listByQuestion(questionId: string): Promise<Notice[]>;
  listByProject(projectId: string): Promise<Notice[]>;
}

// project-reviewer-store.ts
export interface ProjectReviewers {
  list(projectId: string): Promise<ProjectReviewer[]>;
  replace(
    projectId: string,
    reviewers: readonly Omit<ProjectReviewer, 'projectId'>[],
    stamp: WriteStamp,
  ): Promise<void>;
}
```

Section 5 extends `NoticeStore` with lease, report and sweep (design D8); section 3 extends `QuestionStore` with nothing (submit uses `add`, resolve and review use `review`). `QuestionPolicies.write` writes the audit row in the same transaction (D3) and takes the organization id from the caller because an organization row has no project to look it up through; permission checks are the service's (section 4).

- [ ] **Step 1: Write the ports**

Each file: the interface above with JSDoc on every member, `@throws` on the reads that parse JSON ("when a stored `basis`, `topics`, `wrong_facts`, `profiles`, `topics`, `payload` or `reports` value does not parse: malformed trusted state, named by row"), and on `add` ("when the row violates a constraint the service must have checked first: a second unresolved blocked question on the node, an attempt that does not exist").

`stores.ts`, after `blockages`:

```ts
/** Questions raised on step nodes (ADR 0062). */
questions: QuestionStore;
/** The effective question policy per project, inherited, parsed on read (`wbs-questions` D3). */
questionPolicies: QuestionPolicies;
/** The notice outbox the Dash activity leases from (`wbs-questions` D8). */
notices: NoticeStore;
/** Who a project tells about its questions (`wbs-questions` D6). */
projectReviewers: ProjectReviewers;
```

Add the four to the core package's `index.ts` exports beside the other ports.

- [ ] **Step 2: Run typecheck to see what the registry change breaks**

Run: `bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance --parallel=2`
Expected: FAIL in `build-stores.ts`, `memory-stores.ts`/`in-memory-source.ts`, and `case-manifest.ts` (`PORT_NAMES` must cover every key). Tasks 7 to 9 close them in turn; the sqlite ones stay red until Task 8.

- [ ] **Step 3: Write the memory fixture test**

```ts
// libs/wbs/adapters/store-memory/src/question-fixture.test.ts
import type { Question } from '@wbs/domain';
import { basisOf, DEFAULT_QUESTION_POLICY, factsNamed } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import { inMemoryQuestions, memoryQuestionTable } from './question-fixture';

const stamp = { at: 1000, by: 'u' };
const question = (patch: Partial<Question>): Question => ({
  id: 'q1',
  workItemId: 'a',
  stepId: 'dev',
  attemptNumber: 1,
  projectId: 'p',
  submittedByKind: 'machine',
  submittedById: 'cred-1',
  executorPersonId: 'person-a',
  kind: 'decision',
  cause: null,
  text: 'Which colour?',
  proposedAnswer: 'Blue',
  facts: factsNamed({}),
  topics: [],
  disposition: 'queued',
  basis: basisOf(DEFAULT_QUESTION_POLICY, { source: 'default' }, 'implementation'),
  submittedAt: 1000,
  blockedAt: null,
  review: null,
  ...patch,
});

describe('in-memory questions', () => {
  it('stores, lists by project and node, and reviews once', async () => {
    const store = inMemoryQuestions(memoryQuestionTable());
    await store.add(question({}), stamp);
    expect((await store.listByProject('p')).map((q) => q.id)).toEqual(['q1']);
    expect((await store.listByNode('a', 'dev')).map((q) => q.id)).toEqual(['q1']);
    const review = {
      verdict: 'accepted',
      answer: null,
      reviewedByUserId: 'u',
      reviewedAt: 2000,
      wrongFacts: [],
      followUpWorkItemId: null,
    } as const;
    expect(await store.review('q1', review, stamp)).toBe('written');
    expect(await store.review('q1', review, stamp)).toBe('already_reviewed');
    expect(await store.review('q9', review, stamp)).toBe('not_found');
    expect((await store.findById('q1'))?.review).toEqual(review);
  });

  it('refuses a second unresolved blocked question on the node', async () => {
    const store = inMemoryQuestions(memoryQuestionTable());
    await store.add(question({ id: 'q1', disposition: 'blocked', blockedAt: 1000 }), stamp);
    // Proof: the partial-uniqueness guard removed; this stored two; watched 2026-11-DD.
    await expect(
      store.add(question({ id: 'q2', disposition: 'blocked', blockedAt: 1001 }), stamp),
    ).rejects.toThrow('unresolved blocked');
  });

  it.each([
    ['a cause on a decision', { cause: 'external' }],
    ['a blocker without a cause', { kind: 'blocker' }],
    ['blocked without blockedAt', { disposition: 'blocked' }],
    ['blockedAt on a queued question', { blockedAt: 1 }],
  ] as const)('refuses %s like the mounted CHECK', async (_, patch) => {
    const store = inMemoryQuestions(memoryQuestionTable());
    // Proof: `refuseQuestionPairing` call removed; all four stored; watched 2026-11-DD.
    await expect(store.add(question({ ...patch }), stamp)).rejects.toThrow('question q1');
  });

  it('answers holdsAny per scope', async () => {
    const store = inMemoryQuestions(memoryQuestionTable());
    await store.add(question({}), stamp);
    expect(await store.holdsAny({ kind: 'work_items', ids: ['a', 'z'] })).toBe(true);
    expect(await store.holdsAny({ kind: 'work_items', ids: ['z'] })).toBe(false);
    expect(await store.holdsAny({ kind: 'step', stepId: 'dev' })).toBe(true);
    expect(
      await store.holdsAny({ kind: 'attempt', workItemId: 'a', stepId: 'dev', attemptNumber: 2 }),
    ).toBe(false);
  });
});
```

- [ ] **Step 4: Write the four memory fixtures**

`question-fixture.ts`:

```ts
import type { QuestionScope, QuestionStore, WriteStamp } from '@wbs/core';
import type { Question, QuestionReview } from '@wbs/domain';

/** Mutable table used by fixture snapshots and corruption tests. */
export interface MemoryQuestionTable {
  readonly rows: Question[];
}
export function memoryQuestionTable(): MemoryQuestionTable {
  return { rows: [] };
}

/** The pairings the mounted CHECKs refuse (`wbs-questions` D1), mirrored so memory and sqlite agree. */
export function refuseQuestionPairing(question: Question): string | null {
  if ((question.cause === null) !== (question.kind === 'decision'))
    return 'cause is set iff the kind is blocker';
  if ((question.blockedAt === null) !== (question.disposition !== 'blocked'))
    return 'blockedAt is set iff blocked';
  const review = question.review;
  if (review === null) return null;
  if ((review.verdict === 'resolved') !== (question.disposition === 'blocked'))
    return 'resolved fits only a blocked question';
  if (review.verdict !== 'accepted' && review.answer === null)
    return 'overturned and resolved carry an answer';
  if (review.followUpWorkItemId !== null && review.verdict !== 'overturned')
    return 'only an overturn has a follow-up';
  return null;
}

const unresolvedBlocked = (q: Question): boolean =>
  q.disposition === 'blocked' && q.review === null;

/** Questions in memory with the sqlite constraints; audit columns are not modelled. */
export function inMemoryQuestions(table = memoryQuestionTable()): QuestionStore {
  const { rows } = table;
  const assertStorable = (question: Question): void => {
    // Proof: `refuseQuestionPairing` call removed; `refuses a cause on a decision like the mounted CHECK` stored it; watched 2026-11-DD.
    const refusal = refuseQuestionPairing(question);
    if (refusal !== null) throw new Error(`question ${question.id}: ${refusal}`);
  };
  return {
    async add(question, _stamp: WriteStamp) {
      assertStorable(question);
      if (rows.some((row) => row.id === question.id))
        throw new Error(`question ${question.id} exists`);
      // Proof: this guard removed; `refuses a second unresolved blocked question on the node` stored two; watched 2026-11-DD.
      if (
        unresolvedBlocked(question) &&
        rows.some(
          (row) =>
            unresolvedBlocked(row) &&
            row.workItemId === question.workItemId &&
            row.stepId === question.stepId,
        )
      ) {
        throw new Error(
          `question ${question.id}: the node already holds an unresolved blocked question`,
        );
      }
      rows.push(question);
    },
    async findById(id) {
      return rows.find((row) => row.id === id);
    },
    async listByProject(projectId) {
      return rows
        .filter((row) => row.projectId === projectId)
        .sort((a, b) => a.submittedAt - b.submittedAt);
    },
    async listByNode(workItemId, stepId) {
      return rows
        .filter((row) => row.workItemId === workItemId && row.stepId === stepId)
        .sort((a, b) => a.submittedAt - b.submittedAt);
    },
    async review(id, review: QuestionReview, _stamp) {
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return 'not_found';
      const current = rows[index] as Question;
      if (current.review !== null) return 'already_reviewed';
      const next = { ...current, review };
      assertStorable(next);
      rows[index] = next;
      return 'written';
    },
    async holdsAny(scope: QuestionScope) {
      switch (scope.kind) {
        case 'work_items':
          return rows.some((row) => scope.ids.includes(row.workItemId));
        case 'step':
          return rows.some((row) => row.stepId === scope.stepId);
        case 'attempt':
          return rows.some(
            (row) =>
              row.workItemId === scope.workItemId &&
              row.stepId === scope.stepId &&
              row.attemptNumber === scope.attemptNumber,
          );
      }
    },
  };
}
```

`question-policy-fixture.ts`: a `Map<string, StoredQuestionPolicy>` keyed `${scope}/${scopeId}`; `readEffective(projectId)` needs the project's organization id: take a `readers: { organizationOf(projectId: string): Promise<string | undefined> }` argument (wire it from the memory project table the way `inMemoryStepBlockages` takes `workItems`), throw `project ${projectId} is unknown` when undefined, then project row → organization row → `DEFAULT_QUESTION_POLICY` with `source: 'default'`. `write` stores `version: (existing?.version ?? 0) + 1`, answers `'unchanged'` when `JSON.stringify(existing.policy) === JSON.stringify(policy)`, and appends the audit tuple to a `MemoryQuestionPolicyTables.audit: PolicyAudit[]` list (memory models no audit table; the sqlite adapter is the one tested for the audit row in section 4).

`notice-fixture.ts`: rows with `state`, `attemptCount: 0`, `leaseUntil: null`, `leaseToken: null`, `reports: []` filled on `add`; `add` refuses a duplicate `(questionId, userId, reason)` for `opened`/`aged` and a duplicate `(projectId, userId, digestDay)` for `digest` with `notice ${id}: duplicate …` (Proof comments as above); the three reads filter and sort by `createdAt`.

`project-reviewer-fixture.ts`: `replace` filters the project's rows out and pushes the new ones; `list` filters and sorts by `userId`.

- [ ] **Step 5: Wire the memory catalog**

`memory-stores.ts`: add `questions: MemoryQuestionTable`, `questionPolicies: MemoryQuestionPolicyTables`, `notices: MemoryNoticeTable`, `projectReviewers: MemoryProjectReviewerTable` to the tables interface (near line 126), construct them in the factory (near line 154), and copy them in the snapshot restore (near line 294: `replaceArray(this.tables.questions.rows, next.tables.questions.rows)` and so on; `replaceMap` for the policy map).

`in-memory-source.ts`: beside `blockages: inMemoryStepBlockages(workItems, …)` (line 98) add `questions: inMemoryQuestions(tables.questions)`, `questionPolicies: inMemoryQuestionPolicies(tables.questionPolicies, { organizationOf })`, `notices: inMemoryNotices(tables.notices)`, `projectReviewers: inMemoryProjectReviewers(tables.projectReviewers)`, following how that file reaches the project table for `organizationOf`.

- [ ] **Step 6: Run the fixture test and the memory project**

Run: `cd libs/wbs/adapters/store-memory && env -u CLAUDECODE bun test src/question-fixture.test.ts`, then `bunx nx run wbs-store-memory:test:unit` and `bunx nx run-many -t typecheck -p wbs-core,wbs-store-memory --parallel=2`.
Expected: PASS; typecheck of `wbs-store-memory` passes once `case-manifest.ts` lists the four families (do Task 9 Step 1 now if the conformance package's types block it).

- [ ] **Step 7: Watch the three memory proofs fail, date, record; commit**

```bash
git add libs/wbs/application/core/src/ports libs/wbs/application/core/src/index.ts libs/wbs/adapters/store-memory/src openspec/changes/wbs-questions/verify.md
git commit -F - <<'EOF'
feat(wbs-core): question, policy, notice and reviewer ports with memory adapters

Task 2.2 of wbs-questions, first half: the four store ports in the
transactional catalog and their in-memory adapters, mirroring the mounted
pairings and the one-unresolved-blocked-per-node rule.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 8: The SQLite adapters and the corruption witnesses

**Files:**

- Create: `libs/wbs/adapters/store-sqlite/src/question.ts`, `question-policy.ts`, `notice.ts`, `project-reviewer.ts`
- Create: `libs/wbs/adapters/store-sqlite/src/question-corruption.db.test.ts`
- Modify: `libs/wbs/adapters/store-sqlite/src/build-stores.ts` (imports; the catalog after `blockages:` at line 65)

**Interfaces:**

- Consumes: the four ports (Task 7), the drizzle tables and row types (Task 5), the parsers (Tasks 1 to 3), `auditOnCreate`, `auditOnUpdate` from `./audit`, `Drizzle` from `./db`, `Gate` from `./gate`, `appendOrganizationAudit` from `./organization-audit-log` (signature at that file's line 41: `(tx, { id, organizationId, actorId, action, subjectKind, subjectId, detail, at })`).
- Produces: `QuestionRepository`, `QuestionPolicyRepository`, `NoticeRepository`, `ProjectReviewerRepository`, each `(db: Drizzle, gate: Gate)` like `StepBlockageRepository`; one `rowToQuestion(row: QuestionRow): Question` export used by the corruption test.

- [ ] **Step 1: Write the failing corruption test**

```ts
// libs/wbs/adapters/store-sqlite/src/question-corruption.db.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { openDatabase } from './db';
import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'wbs-question-corruption-'));
  path = join(directory, 'plan.db');
  runMigrations(path, FOLDER);
  const sqlite = openDatabase(path);
  try {
    // the same seed as question-migration.db.test.ts: user u, organization org, project p, steps, leaf a, attempt 1
  } finally {
    sqlite.close();
  }
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function corrupt(sql: string): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run(sql);
  } finally {
    sqlite.close();
  }
}

describe('a malformed row throws rather than inherits', () => {
  it('question_policy.profiles that is not a profile throws naming the row', async () => {
    corrupt(
      "INSERT INTO question_policy (scope,scope_id,version,mode,profiles,topics,unanswered_minutes,unnoticed_minutes,digest_on,digest_hour,created_at) VALUES ('project','p',1,'by_step','\"not a profile\"','[]',240,10080,1,8,1)",
    );
    const source = openSqliteSource({ dbPath: path });
    try {
      // Proof: the throw replaced by `return default`; this resolved to the default; watched 2026-11-DD.
      await expect(source.stores.questionPolicies.readEffective('p')).rejects.toThrow(
        'question_policy project/p',
      );
    } finally {
      await source.close();
    }
  });

  it.each([
    ['basis', 'UPDATE question SET basis = \'{"source":"default"}\' WHERE id = \'q1\'', 'basis'],
    ['topics', "UPDATE question SET topics = '{}' WHERE id = 'q1'", 'topics'],
    [
      'wrong_facts',
      "UPDATE question SET wrong_facts = '[\"cheap\"]' WHERE id = 'q1'",
      'wrong_facts',
    ],
  ])('question.%s that does not parse throws naming the row', async (_, sql, column) => {
    // insert q1 through raw SQL as question-migration.db.test.ts does, then:
    corrupt(sql);
    const source = openSqliteSource({ dbPath: path });
    try {
      await expect(source.stores.questions.findById('q1')).rejects.toThrow(`question q1`);
      await expect(source.stores.questions.findById('q1')).rejects.toThrow(column);
    } finally {
      await source.close();
    }
  });

  it.each([
    ['payload', "UPDATE notice SET payload = '[]' WHERE id = 'd1'", 'd1', 'payload'],
    ['reports', "UPDATE notice SET reports = '{\"number\":1}' WHERE id = 'n1'", 'n1', 'reports'],
  ])('notice.%s that does not parse throws naming the row', async (_, sql, id, column) => {
    // insert n1 (opened) and d1 (digest) through raw SQL, then:
    corrupt(sql);
    const source = openSqliteSource({ dbPath: path });
    try {
      await expect(source.stores.notices.findById(id)).rejects.toThrow(`notice ${id}`);
      await expect(source.stores.notices.findById(id)).rejects.toThrow(column);
    } finally {
      await source.close();
    }
  });
});
```

Read `source.ts` for the exact `openSqliteSource` options and how a test reaches `stores` (the step-parallel conformance test at `step-parallel-conformance.db.test.ts` shows the shape); if stores are only reachable inside a unit of work, open one the way that test does. Move the raw inserts from the migration test into a shared `testing/question-rows.ts` helper rather than copying them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/wbs/adapters/store-sqlite && env -u CLAUDECODE bun test src/question-corruption.db.test.ts`
Expected: FAIL, `questionPolicies` undefined on the catalog.

- [ ] **Step 3: Write the four repositories**

`question.ts`:

```ts
import type { QuestionScope, QuestionStore, WriteStamp } from '@wbs/core';
import {
  isBlockerCause,
  isDisposition,
  isQuestionKind,
  isSubmitterKind,
  isVerdict,
  parseBasis,
  parseWrongFacts,
  type Question,
  type QuestionReview,
  type RiskFacts,
} from '@wbs/domain';
import { and, eq, inArray } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { Gate } from './gate';
import { question, type QuestionRow } from './schema';

function parseJson(text: string, where: string, column: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${where}: ${column} is not JSON`);
  }
}

function parseTopics(raw: unknown, where: string): readonly string[] {
  // Proof: this guard removed; `question.topics that does not parse` resolved; watched 2026-11-DD.
  if (!Array.isArray(raw) || !raw.every((topic) => typeof topic === 'string')) {
    throw new Error(`${where}: topics is not a list of names`);
  }
  return raw;
}

const bit = (value: number, where: string, column: string): boolean => {
  if (value !== 0 && value !== 1) throw new Error(`${where}: ${column} is not 0 or 1`);
  return value === 1;
};

/**
 * One stored row as a question (design D11): every JSON column through its
 * one parser, every word through its guard.
 *
 * @throws naming `question <id>` and the column on any value no writer could have stored.
 */
export function rowToQuestion(row: QuestionRow): Question {
  const where = `question ${row.id}`;
  if (!isSubmitterKind(row.submittedByKind)) throw new Error(`${where}: submitted_by_kind`);
  if (!isQuestionKind(row.kind)) throw new Error(`${where}: kind`);
  if (row.cause !== null && !isBlockerCause(row.cause)) throw new Error(`${where}: cause`);
  if (!isDisposition(row.disposition)) throw new Error(`${where}: disposition`);
  const facts: RiskFacts = {
    reversible: bit(row.reversible, where, 'reversible'),
    outward: bit(row.outward, where, 'outward'),
    spends: bit(row.spends, where, 'spends'),
    touchesProduction: bit(row.touchesProduction, where, 'touches_production'),
    destructive: bit(row.destructive, where, 'destructive'),
    changesAccess: bit(row.changesAccess, where, 'changes_access'),
  };
  let review: QuestionReview | null = null;
  if (row.verdict !== null) {
    if (!isVerdict(row.verdict)) throw new Error(`${where}: verdict`);
    if (row.reviewedByUserId === null || row.reviewedAt === null)
      throw new Error(`${where}: review pair`);
    review = {
      verdict: row.verdict,
      answer: row.answer,
      reviewedByUserId: row.reviewedByUserId,
      reviewedAt: row.reviewedAt,
      wrongFacts: parseWrongFacts(parseJson(row.wrongFacts, where, 'wrong_facts'), where),
      followUpWorkItemId: row.followUpWorkItemId,
    };
  }
  return {
    id: row.id,
    workItemId: row.workItemId,
    stepId: row.stepId,
    attemptNumber: row.attemptNumber,
    projectId: row.projectId,
    submittedByKind: row.submittedByKind,
    submittedById: row.submittedById,
    executorPersonId: row.executorPersonId,
    kind: row.kind,
    cause: row.cause,
    text: row.text,
    proposedAnswer: row.proposedAnswer,
    facts,
    topics: parseTopics(parseJson(row.topics, where, 'topics'), where),
    disposition: row.disposition,
    basis: parseBasis(parseJson(row.basis, where, 'basis'), where),
    submittedAt: row.submittedAt,
    blockedAt: row.blockedAt,
    review,
  };
}

/** Questions on SQLite; the mounted CHECKs and the partial index refuse what the service must have checked. */
export class QuestionRepository implements QuestionStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  async add(q: Question, stamp: WriteStamp): Promise<void> {
    await this.gate.write(async () => {
      await this.db.insert(question).values({
        id: q.id,
        workItemId: q.workItemId,
        stepId: q.stepId,
        attemptNumber: q.attemptNumber,
        projectId: q.projectId,
        submittedByKind: q.submittedByKind,
        submittedById: q.submittedById,
        executorPersonId: q.executorPersonId,
        kind: q.kind,
        cause: q.cause,
        text: q.text,
        proposedAnswer: q.proposedAnswer,
        reversible: q.facts.reversible ? 1 : 0,
        outward: q.facts.outward ? 1 : 0,
        spends: q.facts.spends ? 1 : 0,
        touchesProduction: q.facts.touchesProduction ? 1 : 0,
        destructive: q.facts.destructive ? 1 : 0,
        changesAccess: q.facts.changesAccess ? 1 : 0,
        topics: JSON.stringify(q.topics),
        disposition: q.disposition,
        basis: JSON.stringify(q.basis),
        submittedAt: q.submittedAt,
        blockedAt: q.blockedAt,
        verdict: q.review?.verdict ?? null,
        answer: q.review?.answer ?? null,
        reviewedByUserId: q.review?.reviewedByUserId ?? null,
        reviewedAt: q.review?.reviewedAt ?? null,
        wrongFacts: JSON.stringify(q.review?.wrongFacts ?? []),
        followUpWorkItemId: q.review?.followUpWorkItemId ?? null,
        ...auditOnCreate(stamp),
      });
    });
  }

  async findById(id: string): Promise<Question | undefined> {
    const rows = await this.db.select().from(question).where(eq(question.id, id));
    return rows[0] === undefined ? undefined : rowToQuestion(rows[0]);
  }

  async listByProject(projectId: string): Promise<Question[]> {
    const rows = await this.db
      .select()
      .from(question)
      .where(eq(question.projectId, projectId))
      .orderBy(question.submittedAt, question.id);
    return rows.map(rowToQuestion);
  }

  async listByNode(workItemId: string, stepId: string): Promise<Question[]> {
    const rows = await this.db
      .select()
      .from(question)
      .where(and(eq(question.workItemId, workItemId), eq(question.stepId, stepId)))
      .orderBy(question.submittedAt, question.id);
    return rows.map(rowToQuestion);
  }

  async review(
    id: string,
    review: QuestionReview,
    stamp: WriteStamp,
  ): Promise<'written' | 'not_found' | 'already_reviewed'> {
    return this.gate.write(async () => {
      const current = await this.findById(id);
      if (current === undefined) return 'not_found';
      if (current.review !== null) return 'already_reviewed';
      await this.db
        .update(question)
        .set({
          verdict: review.verdict,
          answer: review.answer,
          reviewedByUserId: review.reviewedByUserId,
          reviewedAt: review.reviewedAt,
          wrongFacts: JSON.stringify(review.wrongFacts),
          followUpWorkItemId: review.followUpWorkItemId,
          ...auditOnUpdate(stamp),
        })
        .where(and(eq(question.id, id), isNull(question.verdict)));
      return 'written';
    });
  }

  async holdsAny(scope: QuestionScope): Promise<boolean> {
    const condition =
      scope.kind === 'work_items'
        ? scope.ids.length === 0
          ? undefined
          : inArray(question.workItemId, [...scope.ids])
        : scope.kind === 'step'
          ? eq(question.stepId, scope.stepId)
          : and(
              eq(question.workItemId, scope.workItemId),
              eq(question.stepId, scope.stepId),
              eq(question.attemptNumber, scope.attemptNumber),
            );
    if (condition === undefined) return false;
    const rows = await this.db.select({ id: question.id }).from(question).where(condition).limit(1);
    return rows.length > 0;
  }
}
```

Read `gate.ts` for the exact name of the write method (`StepBlockageRepository.set` shows how `gate` is used; copy that form) and `audit.ts` for `auditOnCreate`'s argument (stamp or `stamp.at`). Add `isNull` to the drizzle import.

`question-policy.ts`:

- `rowToPolicy(row: QuestionPolicyRow): StoredQuestionPolicy` builds the object `{ mode, profiles: parseJson(row.profiles), topics: parseJson(row.topics), unansweredMinutes, unnoticedMinutes, digestOn: row.digestOn === 1, digestHour }` and passes it through `parseQuestionPolicy(candidate, \`question_policy ${row.scope}/${row.scopeId}\`)`, so one parser reads both JSON columns and the words (D11). The Proof comment sits on the `parseQuestionPolicy`call:`// Proof: replaced by a cast; `question_policy.profiles that is not a profile throws` resolved; watched 2026-11-DD.`
- `readEffective(projectId)`: select the project's `organizationId` (throw `project ${projectId} is unknown` on no row); select the project row → `{ source: 'project', scopeId, version, policy }`; else the organization row → `source: 'organization'`; else `{ policy: DEFAULT_QUESTION_POLICY, source: 'default', scopeId: null, version: null }`.
- `write(scope, scopeId, policy, audit, stamp)`: inside `this.db.transaction(async (tx) => …)` under the gate: read the row; if present and `JSON.stringify(rowToPolicy(row).policy) === JSON.stringify(policy)` return `'unchanged'`; insert or update with `version + 1`, `profiles: JSON.stringify(policy.profiles)`, `topics: JSON.stringify(policy.topics)`, `digestOn: policy.digestOn ? 1 : 0`; then `appendOrganizationAudit(tx, { id: audit.auditId, organizationId: audit.organizationId, actorId: audit.actorId, action: 'question_policy_changed', subjectKind: 'question_policy', subjectId: scopeId, detail: { scope, version }, at: stamp.at })`; return `{ version }`. Read `organization-audit-log.ts` for the `OrganizationAuditDetail` shape and `OrganizationLimitsRepository.set` (organization-limits.ts lines 400 to 480) for how it runs the row write and the audit append in one transaction and lets an audit throw roll the row back.

`notice.ts`: `rowToNotice(row: NoticeRow): Notice` with `isNoticeReason`, `isNoticeState`, `isNoticeChannel`, `isUndeliverableReason` guards, `payload: row.payload === null ? null : parseNoticePayload(parseJson(row.payload, where, 'payload'), where)`, `reports: parseNoticeReports(parseJson(row.reports, where, 'reports'), where)`; `add` inserts every notice in one `insert(notice).values([...])` under the gate with `attemptCount: 0`, `leaseUntil: null`, `leaseToken: null`, `reports: '[]'`; the three reads order by `createdAt, id`.

`project-reviewer.ts`: `list` orders by `userId`; `replace` deletes the project's rows and inserts the new ones in one transaction under the gate with `auditOnCreate(stamp)`.

`build-stores.ts`: import the four and add after `blockages:`:

```ts
    questions: new QuestionRepository(db, gate),
    questionPolicies: new QuestionPolicyRepository(db, gate),
    notices: new NoticeRepository(db, gate),
    projectReviewers: new ProjectReviewerRepository(db, gate),
```

- [ ] **Step 4: Run the corruption test, the migration test and typecheck**

Run: `cd libs/wbs/adapters/store-sqlite && env -u CLAUDECODE bun test src/question-corruption.db.test.ts src/question-migration.db.test.ts`, then `bunx nx run wbs-store-sqlite:typecheck`.
Expected: PASS, exit 0.

- [ ] **Step 5: Watch the proofs fail (policy parser bypass, topics guard), date, record; commit**

```bash
git add libs/wbs/adapters/store-sqlite/src openspec/changes/wbs-questions/verify.md
git commit -F - <<'EOF'
feat(wbs-store-sqlite): question, policy, notice and reviewer repositories

Task 2.2 of wbs-questions, second half: the SQLite adapters, each JSON column
through its one parser, a malformed row throwing with its identity rather
than inheriting the default.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 9: Conformance cases for the four families

**Files:**

- Modify: `libs/wbs/application/conformance/src/case-manifest.ts` (`PORT_NAMES` after `'blockages'`, `CASE_MANIFEST` after `blockages:` at line 162)
- Create: `libs/wbs/application/conformance/src/stores/questions.ts`, `question-policies.ts`, `notices.ts`, `project-reviewers.ts`
- Modify: `libs/wbs/application/conformance/src/source-conformance.ts` (the registration spread near line 195)
- Modify: `libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts` (openers near line 889, capabilities near line 950)
- Modify: `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts` (`openMemoryCase` seeding near line 385, openers near line 958, capabilities near line 1107)

**Interfaces:**

- Consumes: the ports (Task 7), both adapters (Tasks 7 and 8), `storeCase`, `OpenCase`, `CaseRegistration`, `DETERMINISTIC_SEED`.
- Produces: case ids `questions.add:read-by-node-and-project`, `questions.review:once-and-pairings`, `questions.holdsAny:scopes`, `questionPolicies.readEffective:project-organization-default`, `questionPolicies.write:version-and-unchanged`, `notices.add:read-and-uniqueness`, `projectReviewers.replace:list`.

- [ ] **Step 1: Register the families and case ids**

`case-manifest.ts`: add `'questions'`, `'questionPolicies'`, `'notices'`, `'projectReviewers'` to `PORT_NAMES` after `'blockages'`, and to `CASE_MANIFEST`:

```ts
  questions: [
    'questions.add:read-by-node-and-project',
    'questions.review:once-and-pairings',
    'questions.holdsAny:scopes',
  ],
  questionPolicies: [
    'questionPolicies.readEffective:project-organization-default',
    'questionPolicies.write:version-and-unchanged',
  ],
  notices: ['notices.add:read-and-uniqueness'],
  projectReviewers: ['projectReviewers.replace:list'],
```

Run `cd libs/wbs/application/conformance && env -u CLAUDECODE bun test src/case-manifest.test.ts src/existing.test.ts` and read what the manifest tests demand of a new family (the Proof at line 163 says the complete-source inventory fails until both sources offer it).

- [ ] **Step 2: Write the registrations**

`stores/questions.ts`, in the form of `stores/attempts.ts`:

```ts
import type { Question } from '@wbs/domain';
import { basisOf, DEFAULT_QUESTION_POLICY, factsNamed } from '@wbs/domain';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

/** A queued decision on the seed's first node, attempt 1 (started by the opener). */
export const questionOn = (
  id: string,
  workItemId: string,
  stepId: string,
  projectId: string,
  patch: Partial<Question> = {},
): Question => ({
  id,
  workItemId,
  stepId,
  attemptNumber: 1,
  projectId,
  submittedByKind: 'machine',
  submittedById: 'conformance-credential',
  executorPersonId: 'conformance-person',
  kind: 'decision',
  cause: null,
  text: 'Which colour?',
  proposedAnswer: 'Blue',
  facts: factsNamed({}),
  topics: ['product'],
  disposition: 'queued',
  basis: basisOf(DEFAULT_QUESTION_POLICY, { source: 'default' }, 'implementation'),
  submittedAt: 1000,
  blockedAt: null,
  review: null,
  ...patch,
});

export function questionRegistrations(open: OpenCase<'questions'>): readonly CaseRegistration[] {
  return [
    storeCase(
      'questions',
      'questions.add:read-by-node-and-project',
      open,
      async ({ port, seed }) => {
        const [projectA, projectB] = seed.projectIds;
        const [[leafA], [leafB]] = seed.workItemIds;
        const [[devA], [devB]] = seed.stepIds;
        await port.add(questionOn('q1', leafA, devA, projectA), seed.stamps[0]);
        await port.add(
          questionOn('q2', leafA, devA, projectA, { submittedAt: 2000 }),
          seed.stamps[0],
        );
        await port.add(questionOn('q3', leafB, devB, projectB), seed.stamps[0]);
        expect((await port.listByProject(projectA)).map((q) => q.id)).toEqual(['q1', 'q2']);
        expect((await port.listByNode(leafA, devA)).map((q) => q.id)).toEqual(['q1', 'q2']);
        expect(await port.findById('q3')).toMatchObject({
          projectId: projectB,
          topics: ['product'],
        });
        expect((await port.findById('q1'))?.basis).toEqual(
          questionOn('q1', leafA, devA, projectA).basis,
        );
      },
    ),
    storeCase('questions', 'questions.review:once-and-pairings', open, async ({ port, seed }) => {
      const [projectA] = seed.projectIds;
      const [[leafA]] = seed.workItemIds;
      const [[devA]] = seed.stepIds;
      await port.add(questionOn('q1', leafA, devA, projectA), seed.stamps[0]);
      await port.add(
        questionOn('b1', leafA, devA, projectA, { disposition: 'blocked', blockedAt: 1000 }),
        seed.stamps[0],
      );
      await expect(
        port.add(
          questionOn('b2', leafA, devA, projectA, { disposition: 'blocked', blockedAt: 1001 }),
          seed.stamps[0],
        ),
      ).rejects.toThrow();
      const accepted = {
        verdict: 'accepted',
        answer: null,
        reviewedByUserId: seed.ownerIds[0],
        reviewedAt: 3000,
        wrongFacts: ['outward'],
        followUpWorkItemId: null,
      } as const;
      expect(await port.review('q1', accepted, seed.stamps[0])).toBe('written');
      expect(await port.review('q1', accepted, seed.stamps[0])).toBe('already_reviewed');
      expect(await port.review('missing', accepted, seed.stamps[0])).toBe('not_found');
      expect((await port.findById('q1'))?.review).toEqual(accepted);
      await expect(port.review('b1', accepted, seed.stamps[0])).rejects.toThrow();
      const resolved = { ...accepted, verdict: 'resolved', answer: 'Unblocked' } as const;
      expect(await port.review('b1', resolved, seed.stamps[0])).toBe('written');
      await port.add(
        questionOn('b2', leafA, devA, projectA, { disposition: 'blocked', blockedAt: 4000 }),
        seed.stamps[0],
      );
    }),
    storeCase('questions', 'questions.holdsAny:scopes', open, async ({ port, seed }) => {
      const [projectA] = seed.projectIds;
      const [[leafA, otherA]] = seed.workItemIds;
      const [[devA, qaA]] = seed.stepIds;
      expect(await port.holdsAny({ kind: 'work_items', ids: [leafA] })).toBe(false);
      await port.add(questionOn('q1', leafA, devA, projectA), seed.stamps[0]);
      expect(await port.holdsAny({ kind: 'work_items', ids: [otherA, leafA] })).toBe(true);
      expect(await port.holdsAny({ kind: 'work_items', ids: [otherA] })).toBe(false);
      expect(await port.holdsAny({ kind: 'work_items', ids: [] })).toBe(false);
      expect(await port.holdsAny({ kind: 'step', stepId: devA })).toBe(true);
      expect(await port.holdsAny({ kind: 'step', stepId: qaA })).toBe(false);
      expect(
        await port.holdsAny({ kind: 'attempt', workItemId: leafA, stepId: devA, attemptNumber: 1 }),
      ).toBe(true);
      expect(
        await port.holdsAny({ kind: 'attempt', workItemId: leafA, stepId: devA, attemptNumber: 2 }),
      ).toBe(false);
    }),
  ];
}
```

Both openers must start attempt 1 on the seed's two first nodes (`leafA/devA`, `leafB/devB`) before a `questions` or `notices` case runs, through `seeded.stores.attempts.start({ workItemId, stepId, executorPersonId: null, reference: null, note: null, startedAt: 100 }, DETERMINISTIC_SEED.stamps[0])`, the way `openMemoryCase` seeds `progress` and `dependencies` (line 389) and the sqlite opener does for its families.

`stores/question-policies.ts`: case 1 writes an organization row in mode `offline` (the seed's first organization; read how `organizationLimits` cases find it, `LIMITS_FIXTURE.organizationIds`), asserts `readEffective(projectA)` answers `{ source: 'organization', policy.mode: 'offline', version: 1 }`, writes a project row for `projectA`, asserts `source: 'project'`, and asserts `readEffective(projectB)` answers `source: 'default'` with `DEFAULT_QUESTION_POLICY`. Case 2 writes the same policy twice and asserts `{ version: 1 }` then `'unchanged'`, then a changed one and `{ version: 2 }`. The `PolicyAudit` argument carries `auditId: 'conformance-audit-1'`, the organization id and `seed.ownerIds[0]`.

`stores/notices.ts`: one case adds a question, then three notices (`opened` for two users, `aged` for one), asserts `listByQuestion` and `listByProject` orders and the filled defaults (`attemptCount: 0`, `reports: []`), adds a digest with a payload and asserts `findById` returns it parsed, then asserts a duplicate `opened` for the same user and a second digest for the same day both reject. Users: `seed.ownerIds`.

`stores/project-reviewers.ts`: one case replaces the list with two reviewers, lists them sorted by `userId`, replaces with one, lists one, replaces with none, lists none.

`source-conformance.ts`: spread the four registrations beside `...attemptRegistrations(openers.attempts)`.

- [ ] **Step 3: Offer the families from both sources**

In both `source-conformance` test files, add openers (`questions: (caseId) => openSqliteCase('questions', caseId)` and the memory twin) and capabilities (`questions: { kind: 'offered', gaps: [], open: openers.questions }`) for the four families, and the attempt seeding described above.

- [ ] **Step 4: Run both conformance suites and the manifest tests**

Run: `bunx nx run-many -t test:conformance -p wbs-store-sqlite,wbs-store-memory --parallel=2` and `bunx nx run wbs-conformance:test`.
Expected: PASS, every case certified on both sources, no gaps.

- [ ] **Step 5: Full section gate, commit, PR**

```bash
bunx nx run-many -t test typecheck -p wbs-domain,wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance,wbs-be-01 --parallel=2
git add libs/wbs/application/conformance/src libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts
git commit -F - <<'EOF'
test(wbs-conformance): certify the question store families on both sources

Task 2.2 of wbs-questions, last part: seven cases across questions, policies,
notices and reviewers, offered by store-sqlite and store-memory alike.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git push -u origin feat/wbs-questions-2-storage
gh pr create --base main --title "feat(wbs): question storage — migrations, ports, adapters, conformance (wbs-questions section 2)" --body-file <(cat <<'EOF'
## Summary

Section 2 of `openspec/changes/wbs-questions/tasks.md`. No route changes; nothing submits a question yet (section 3, one PR, after the permission catalogue lands).

- 2.1 six additive migrations with guarded `down.sql` (step phase, question policy, question, notice, project reviewer, audit vocabulary), their `schema.ts` mirror, the two audit actions, every pinned migration list extended.
- 2.1 `Step.phase` through the port and both adapters.
- 2.2 ports `QuestionStore`, `QuestionPolicies`, `NoticeStore`, `ProjectReviewers`; SQLite and memory adapters; seven conformance cases certified on both.

## Proofs

Each `// Proof:` and `-- Proof:` names a fault watched failing its test; `openspec/changes/wbs-questions/verify.md` lists them with dates. The partial unique index is proven by two inserts against a mounted database; each CHECK by `CHECK (1)` in turn; each guarded rollback by `0 = 0`.

## Checks

- `bunx nx run-many -t test typecheck -p wbs-domain,wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance,wbs-be-01`: exit 0.
- migration lint, prettier check, `check-indexes`: clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

Tick 2.1 and 2.2 in `tasks.md` on the same PR, then run `bin/h2puni-gate.sh <sha>` from a clean h2puni worktree before merging (the gate on h4claw refuses the `#735` namespace test; use h2puni).

---

## Self-review against the spec

- **Coverage.** Spec scenarios owned by sections 1 and 2: the five precedence witnesses and `planning blocks what implementation only notifies` (Task 3); `a hard-gate change leaves the basis replayable` (Task 3); `hard gates cannot be written` (Task 1); `a malformed row throws rather than inherits` (Task 8); `a diamond counts each node once`, `the bigger reach sorts first among equals`, `done successors do not count`, `unnoticed counts age, not verdict, and not blocked`, `rates are absent before any verdict` (Task 4); `a mounted partial index refuses a second unresolved blocked question` (Task 5). Scenarios that need a service (`a project without its own row reads the organization's` as a route, the audit-together scenario, every submit/review/resolve/notice scenario) belong to sections 3 to 5; the store-level halves are certified by the Task 9 cases.
- **Placeholders.** Every `2026-11-DD` is filled in when the negative is watched; it is the only deferred value, by design of the Proof rule.
- **Names used across tasks.** `basisOf(policy, source, phase, hardGates?)`, `disposeQuestion(basis, facts, topics)`, `factsNamed`, `parseBasis`, `parseWrongFacts`, `parseQuestionPolicy`, `parseNoticePayload`, `parseNoticeReports`, `downstreamReach`, `compareQuestionPriority`, `foldQuestionCounts`, `submitterKey`; ports `QuestionStore` (`add`, `findById`, `listByProject`, `listByNode`, `review`, `holdsAny`), `QuestionPolicies` (`readEffective`, `read`, `write`), `NoticeStore` (`add`, `findById`, `listByQuestion`, `listByProject`), `ProjectReviewers` (`list`, `replace`); catalog keys `questions`, `questionPolicies`, `notices`, `projectReviewers`; repositories `QuestionRepository`, `QuestionPolicyRepository`, `NoticeRepository`, `ProjectReviewerRepository`; memory `inMemoryQuestions`, `inMemoryQuestionPolicies`, `inMemoryNotices`, `inMemoryProjectReviewers`. Tasks 7, 8 and 9 use these spellings only.
- **Known uncertainties for the executor.** The exact `Gate` write method name, `auditOnCreate`'s argument, `openSqliteSource`'s options and the `organization`/`project` seed columns are read from the named files at execution; the plan names where each lives.
