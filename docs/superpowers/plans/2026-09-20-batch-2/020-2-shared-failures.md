# 020.2 Shared failures module: limits, key list, policy builder, never-throw wrapper

|                                               |                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item                                     | 020.2, parent 020 "DI Bag, caught-object-report-json, application-exception into the WBS backend"                                                                                                                        |
| Size class                                    | M                                                                                                                                                                                                                        |
| Planning tokens (top model, high effort)      | 3,000,000                                                                                                                                                                                                                |
| Implementation tokens (mid model, mid effort) | 9,000,000                                                                                                                                                                                                                |
| Review tokens (top model, high effort)        | 4,000,000                                                                                                                                                                                                                |
| Design it serves                              | Slice 2 of the [package adoption plan](../2026-09-17-personal-package-adoption.md), "Build and prove the shared reporting policy", as its 2026-09-19 amendment rewrote it. Read the amendment first; it opens the file.  |
| Execution contract                            | [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor" and "Standard blocks every packet uses". Not copied here; exact commands are written out where they matter. |

**You execute one slice and stop.** The end of your instructions names which. Section 7 gives each
slice its own step 0, its own completion checklist and its own hand-over list. Section 9 says which
commands are the planner's rather than yours.

**Every number in this packet is relative.** Main has moved since it was written and will move
again before it is dispatched. Nothing here pins a line number you must match, and every count is
"what you recorded in this slice's step 0, plus what this slice adds". Where a fact names a symbol
(`RESTART_PATHS`, `EXPECTED_PRODUCT_PROJECTS`), find it by name. Test **titles** are exact and are
quoted so you can filter by them; test **totals** are always yours.

**Slice B deliberately leaves the repository red.** It adds an Nx project that five devsync checks
do not yet know about. Slice C repairs each of them, by name. C's step 0 therefore expects an exact
set of failures, not a green tree, and C is dispatched into B's clone with `--resume`.

## 1. Goal and non-goals

**Goal.** A new Nx library `shared-failures` at `libs/shared/domain/failures`, alias
`@shared/failures`, exporting the four things the three published packages cannot decide for this
repository: the report limits, the sensitive key list, a redaction policy builder over
caller-owned secrets, and a wrapper around `toReports` that models reporting loss instead of
throwing. The project is registered everywhere this repository counts its projects, so nothing
about it is discovered later by a broken check.

**Non-goals.** No caller adopts it here: the observability serializer, the log schema, the backend
error boundary, the MCP server and the frontend fault boundary are slice 3 of the adoption plan,
and no batch 2 packet does them. No exception kinds are defined for production code. No DI Bag. No
browser execution of `@shared/failures` — section 4 records that requirement as **unassigned**,
not as done. No `tools/tool-devsync/src/package-adoption.ts` inventory: work item 020.1 landed only
the version pins, so there is no inventory file to extend.

## 2. Read first

| File                                                        | Why                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                 | R1 to R5. R5 governs this packet: reporting loss is modelled and visible, never a silent success, and every check has a negative. |
| `../2026-09-19-batch-1/README.md`                           | Execution contract, the standard blocks, and "counts are relative, never absolute".                                               |
| `../2026-09-19-batch-1/ASSUMPTIONS.md`                      | What batch 1 settled by assumption instead of asking.                                                                             |
| `../2026-09-17-personal-package-adoption.md`                | The amendment at the top, the published baseline table, and slice 2, whose proposed surface this packet implements.               |
| `libs/shared/domain/validation/`                            | The whole project: four configuration files, `README.md`, `src/`. It is the shape this packet copies.                             |
| `node_modules/application-exception/docs/agent/api-card.md` | `toReports`, `createRedactionPolicy`, `AppexCorjOptions`, `CapturedReports`, `RedactionPolicy`. The authority on every signature. |
| `node_modules/caught-object-report-json/index.d.ts`         | The `CorjOptions` type: what `maxReportSize`, `maxDepth`, `maxChildren` and `inspection` mean and default to.                     |
| `tools/tool-devsync/workspace-projects.mjs`                 | `findNamespaceLayoutViolations`: why the root decides the project name and the product tag.                                       |

Slice C additionally reads the four devsync test files its steps name.

## 3. Verified facts, 2026-09-20

Every fact below was read or executed in the worktree at `batch-2/planning`, most of them by
building the whole project on disk, running its targets, injecting each mutation, and then
restoring the tree and proving it with `git status`. Symbol names, test titles and behaviour are
stable; **counts are what the planner saw that day and are superseded by your own step 0**.

### 3.1 The packages

- `package.json` pins `application-exception` `0.5.0`, `caught-object-report-json` `11.0.1` and
  `di-bag` `0.4.0` as exact dependencies, held by `OWNER_PACKAGES` in
  `tools/tool-devsync/src/toolchain-pins.test.ts`. All three are installed. **Nothing installs
  anything in this packet.**
- `tools/tool-devsync/src/package-adoption.ts` does **not** exist. Work item 020.1 implemented the
  version pins only, so the "36 projects" inventory the plan mentions has nothing to update.
- `application-exception` exports exactly: `APPEX_ERROR_CODES`, `DIAGNOSTIC_REPORT_VERSION`,
  `PUBLIC_REPORT_VERSION`, `createRedactionPolicy`, `createTrustRealm`, `decodePublicReport`,
  `defineException`, `isTrustedException`, `isTypedException`, `restoreExpectedValues`,
  `toDiagnosticReport`, `toPublicReport`, `toReports`.
- Its `CapturedReports` interface requires a top-level `occurrence_id` beside `diagnostic` and
  `public`. A mutation replacing the one `toReports` call must still produce that field.
- Its package exports map publishes `./schemas/diagnostic-report-v5.json` and
  `./schemas/public-report-v4.json`; both import cleanly.
- `ajv` `8.20.0` is a root dependency. Its default export **cannot** compile those schemas —
  `no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`. `ajv/dist/2020`
  compiles both.
- **The module and the complete test file were built on disk and run.**
  `bunx nx run shared-failures:typecheck`, `:lint` and `:test` all exited 0, the test file
  reporting `20 pass` / `0 fail` / `56 expect() calls`. `prettier --check` passed on both files.
- **The section 5 JSDoc as first drafted failed lint.** `bunx eslint libs/shared/domain/failures/src`
  reported two `jsdoc/check-param-names` errors, `Missing @param "options.redact"` and
  `Missing @param "options.context"`, because `reportFailure`'s `options` is destructured in the
  documentation. Section 5 now documents `options`, `options.redact` and `options.context`
  separately, and the same command then exited 0.

### 3.2 Measured behaviour of the libraries

- `toReports(new Error('boom', { cause: revokedProxy }), …)` **throws**
  `TypeError: Array.isArray cannot be called on a Proxy that has been revoked`, raised inside
  `caught-object-report-json/index.js` and re-thrown through `toReports`. The never-throw wrapper
  is not hypothetical.
- A revoked Proxy passed as the **caught value itself** does not throw, and
  `isTypedException(revokedProxy)` returns `false` without throwing.
- String entries in a policy's `keys` match **case-sensitively**: with
  `keys: ['authorization', 'set-cookie']` a property named `Authorization` survived and lowercase
  `authorization` was redacted. Anchored case-insensitive `RegExp` keys redact both. HTTP headers
  arrive capitalised, so section 5 compiles `SENSITIVE_KEYS` into anchored `/^key$/i` patterns.
- `patterns` scrub text wherever it appears: a secret compiled to a global pattern turned the
  stack's first line into `Error: token was [redacted]` and the same secret inside `context` into
  `[redacted]`.
- **The public report's selected details are redacted too.** A kind whose `public.details`
  selector returns `{ user }` disclosed `as_json: { user: '[redacted]' }` when the address was a
  caller-owned secret; with `redact` dropped from the public bag the address was disclosed in
  full. This is the only case that exercises public redaction: a report with no disclosure policy
  selects nothing.
- `inspection: 'no-invoke'` reports a throwing getter as `as_json: { boom: '[not-inspected]' }`
  with **no** `reporting_errors`. Without it the report carries a `reporting_errors` entry whose
  `error` is `"Error: ran"` — the getter ran.
- `maxReportSize: 32_768` bounds the compact JSON at exactly **32768 UTF-8 bytes**; removing it
  left the same value at 80,305 bytes with no `truncated` field.
- `maxDepth: 4` reports `$.cause` down to `$.cause.cause.cause.cause` and marks the deepest child
  `children_omitted: 'max_depth'`. `maxChildren: 16` on an `AggregateError` of twenty reports
  sixteen children and marks the **root** `children_omitted: 'max_children'`. Removing either
  limit leaves the corresponding `children_omitted` **undefined**, which is what the tests of
  slice F assert first.
- A context that is merely large is **truncated, not omitted**: the library's own
  `maxContextSize` defaults to 16384. `context_omitted: 'max_size'` appears only when the whole
  report is over budget — a 30,000 character message with an 8,000 character context produced
  `context_omitted: 'max_size'`, `truncated: true` and no `context` key.
- `reporting_errors_omitted: 'max_size'` is reachable: a policy whose `transform` throws only for
  the `as_json` key, a 33,000 character message and a 1,000 character context produced it, with
  no `reporting_errors` key, at 32,766 bytes.
- **Truncating both reports at once** needs oversized _disclosed details_, not an oversized
  context: a `SignInFailed` whose `user` detail is 40,000 characters produced
  `diagnostic.truncated === true` **and** `public.truncated === true`, and `ajv/dist/2020`
  validated both against the installed schemas. An 8,000 character context alone leaves an
  8,446-byte report with `truncated` undefined, which is why slice F's schema case uses the long
  detail.
- `toReports` shares one occurrence id: for the primitive `'boom'`,
  `diagnostic.occurrence_id === public.occurrence_id`. Two separate calls to `toDiagnosticReport`
  and `toPublicReport` on the same primitive produced two different `AE_…` ids; on an `Error` they
  still agreed, so the shared-call negative must use a primitive.
- A value with no public policy discloses `code: 'INTERNAL_ERROR'` and
  `message: 'Something went wrong'` and nothing else. A public report of a stackless primitive
  carries no `fingerprint`; one of an `Error` does.
- Compact reports omit fields holding their expected value. `undefined` reports
  `typeof: 'undefined'`; **`null` reports no `typeof` field at all**, because `'object'` is the
  expected value.

### 3.3 What slice B breaks, by name

With the project on disk and no registration done, each devsync file was run alone. These are the
**exact** titles slice C repairs; the pass totals are the planning day's and are yours to record.

| File                                                 | Failing test titles                                                                                                                                                                     | That day        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `tools/tool-devsync/src/workspace-projects.test.ts`  | `readProjects > pins every product root and qualified Nx identity in the destination map` and `readProjects > activates the product axis of its own directory on every app and library` | 15 pass, 2 fail |
| `tools/tool-devsync/src/sync.test.ts`                | `RESTART_PATHS coverage > names every library project.json that exists on disk`                                                                                                         | 40 pass, 1 fail |
| `tools/tool-devsync/src/workspace-inventory.test.ts` | `pins the complete moved depth-sensitive configuration inventory`                                                                                                                       | 3 pass, 1 fail  |
| `tools/tool-devsync/src/namespace-layout.test.ts`    | none — the manifest of B1 already satisfies it                                                                                                                                          | 19 pass, 0 fail |
| `tools/tool-devsync/src/workspace-targets.test.ts`   | none — the manifest of B1 already satisfies it                                                                                                                                          | 18 pass, 0 fail |

**One failing assertion reveals one count.** In `workspace-inventory.test.ts` the row assertion
precedes the distinct-file assertion in the same test, so the first failure hides the second.
Observed: the first run failed with `Received length: 167`; only after the row pin was updated did
the next run fail with `Received length: 84`. C3 is therefore two edits and three runs.

`shared-validation` added four files carrying four parent-relative values — `project.json`'s
`$schema`, `tsconfig.json`'s `extends`, and the two `outDir`s — so both counts move by **+4**,
which is exactly what 163 → 167 and 80 → 84 were on the planning day.

### 3.4 The current-document sweep, measured

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` scans every tracked or untracked
Markdown under `docs/`, at the repository root, and every `apps`, `libs` or `tools` `README.md`.
It holds thirteen tests.

- **Bun needs a path, not a repository-relative filter.** Passing
  `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` from inside `tools/tool-devsync`
  selects nothing: Bun prints `The following filters did not match any test files` and the run
  executes zero tests. Passing `./src/repo-namespacing-handoff.test.ts` from there ran `1 pass`,
  `12 filtered out`. Every command in slice C uses the `./src/…` form.
- **Adding the library README moved `applicationLibraryToolReadmes` from 23 to 24**, and left
  `digest` and `occurrences` untouched, because a `.md` file is excluded from the legacy-root
  scan.
- **Adding the re-pin comment in `workspace-inventory.test.ts` moved the `digest`** — observed
  `c6f0ee2f…` to `c78deb0a…` — and left `occurrences` at 257. That file's last test quotes the two
  recursive tsconfig globs, which sit below the pins, so any inserted line shifts them.
- `staleSelectorFailures` refuses any `nx run <name>:` naming a project that does not exist. Two
  documents are exempted in `docs/findings/current-document-check-exemptions.json` for exactly one
  reason each, and `shared-failures` is that reason:
  `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` and
  `docs/superpowers/plans/2026-09-19-batch-1/020-1-pin-and-install.md`. Computed with the test's
  own regular expression and `readProjects`: `shared-failures` is their only offending selector.
  The case `every exemption names a tracked document that still needs each excuse` fails on an
  excuse a document no longer needs, so **both entries must go in the same slice that creates the
  project.**
- The case `the production index checker resolves current Markdown links and anchors` spawns the
  Twilight Bureaucrat command-line, which runs `git write-tree`. **You cannot run it**; your
  `.git` is read-only. Run tests by name; never the whole file.
- `every routed current document resolves its local links and anchors` **passed** on the planning
  worktree on 2026-09-20 with all eight batch 2 packets present. An earlier failure from packet
  010.6's file has been repaired. Step 0 baselines this case anyway, because it is the one case
  another packet's document can break.
- `LLM_README.md` is under 150 lines and the index checker refuses it over 150. This packet edits
  one existing line and adds none.

### 3.5 House rules the new files must satisfy

- `libs/wbs/domain/domain/project.json` and `libs/shared/domain/validation/project.json` both
  carry a `type:` tag beside the four axes. Nothing validates it; it is the convention.
- `@typescript-eslint/consistent-type-imports` is configured with
  `fixStyle: 'separate-type-imports'`, but an inline `type` specifier satisfies it, and
  `libs/wbs/domain/domain/src/canonical-schedule-input.ts` is the house example. The import blocks
  in this packet were linted as written and produced no `simple-import-sort/imports` diagnostic;
  if one appears, apply the order it prints.
- `jsdoc/check-param-names` is an error and counts destructured members — see 3.1.
- `unicorn/filename-case` requires kebab-case.
- `@typescript-eslint/no-non-null-assertion` and `no-explicit-any` are off in test files only.
- The module and the test file of this packet are byte-identical to `prettier` output at
  `printWidth: 100`.

## 4. Unknowns and what is left undone

- **`@shared/failures` has no browser proof, and no batch 2 packet gives it one.** Packet 040.1's
  Chromium probe imports `application-exception`, `caught-object-report-json` and `di-bag`
  directly; it never imports this module. Step H3 splits the adoption plan's combined checkbox so
  the local verification can be ticked while the browser fixture stays explicitly unticked and
  unassigned. Nothing this packet writes claims browser execution.
- Whether `SENSITIVE_KEYS` is the right list for boundaries nobody has adopted yet. It is the
  plan's list; a caller that needs another key adds it with the adoption that needs it.

## 5. Interfaces

The final content of `libs/shared/domain/failures/src/report-failure.ts`. Slice B writes the
constants, slice D the policy builder, slice E the wrapper. This exact text passed
`shared-failures:typecheck`, `shared-failures:lint` and `prettier --check` on disk.

```ts
import {
  type AppexCorjOptions,
  type CapturedReports,
  createRedactionPolicy,
  type RedactionPolicy,
  toReports,
} from 'application-exception';

/**
 * The one options bag every reporting call in this repository shares. It is a module constant
 * because the library caches one report maker per options object; building it per call throws
 * that cache away.
 *
 * `maxReportSize` bounds the whole compact diagnostic report in UTF-8 bytes — `occurrence_id`,
 * `fingerprint`, `context` and `reporting_errors` included. Over budget the library drops
 * `context` whole and records `context_omitted: 'max_size'`, then drops `reporting_errors` and
 * records `reporting_errors_omitted`, and only then trims error content; `occurrence_id`,
 * `fingerprint` and `v` are never trimmed. A context that is merely large is truncated instead,
 * by the library's own 16 KiB context cap, and leaves `context_omitted` absent. `maxDepth` stops
 * the cause walk and marks the deepest child `children_omitted: 'max_depth'`; `maxChildren`
 * marks the root `children_omitted: 'max_children'`. `inspection: 'no-invoke'` is what keeps a
 * throwing getter from running while a failure is being reported: such a property is reported as
 * `'[not-inspected]'`.
 */
export const FAILURE_REPORT_LIMITS: AppexCorjOptions = {
  maxReportSize: 32_768,
  maxDepth: 4,
  maxChildren: 16,
  inspection: 'no-invoke',
};

/**
 * Property names skipped in both reports, at any depth, whatever their capitalisation.
 *
 * A skip hides the value and not its text elsewhere: a secret quoted inside a message or a stack
 * survives every key rule, which is why {@link createFailureRedaction} also compiles the caller's
 * own secrets into pattern rules. Exported as plain names so a caller can read the list; the
 * policy matches them case-insensitively, because HTTP headers arrive capitalised.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'jwtKey',
  'internalAuthSecret',
];

/**
 * What a caller is told when reporting itself failed. Fixed text: the thrown message may quote
 * the very value the policy was protecting.
 */
const REPORTING_LOST_REASON =
  'reporting threw; the failure stands and both of its reports are lost';

/** The literal form of `text` inside a regular expression. */
function quoteForPattern(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

// Proof: WRITTEN IN SLICE D, STEP D4.
const SENSITIVE_KEY_PATTERNS = SENSITIVE_KEYS.map(
  (key) => new RegExp(`^${quoteForPattern(key)}$`, 'i'),
);

/**
 * A redaction policy over the secrets the calling boundary owns, for both reports of a failure.
 *
 * Build it once at startup and share it: the library caches one report maker per policy. Pass
 * only the secrets the caller actually holds — never a whole configuration, request or
 * environment object, because a secret nobody named cannot be detected. An empty list is correct
 * where the caller owns no secret, and leaves the key rules in force. The policy applies to the
 * public report as well, and it sees only what a kind's disclosure selector returned, so a
 * mistaken selector cannot get past it.
 *
 * @param secrets Secret values to scrub from messages, stacks, `as_string`, `as_json`, `context`
 *   and `reporting_errors` wherever they appear. Empty strings are ignored.
 * @returns A reusable policy accepted as `redact` by both reports.
 */
export function createFailureRedaction(secrets: readonly string[]): RedactionPolicy {
  return createRedactionPolicy({
    // Proof: WRITTEN IN SLICE D, STEP D3.
    keys: SENSITIVE_KEY_PATTERNS,
    // Proof: WRITTEN IN SLICE D, STEP D5.
    patterns: secrets
      .filter((secret) => secret.length > 0)
      .map((secret) => new RegExp(quoteForPattern(secret), 'g')),
  });
}

/**
 * Both reports of one failure, or a visible refusal saying that reporting itself failed.
 *
 * Reporting loss is modelled and never silent, and it is never a successful operation: the
 * original failure is unchanged and still the caller's to handle.
 */
export type FailureReporting =
  | { readonly reported: true; readonly reports: CapturedReports }
  | { readonly reported: false; readonly occurrenceId: string; readonly reason: string };

/** Losses in this process, so two of them never share a correlation handle. */
let unreportedFailures = 0;

/**
 * Report one caught value to both audiences under this repository's limits and the caller's
 * policy, without ever throwing.
 *
 * One `toReports` call resolves the occurrence id once and shares it, so the operator's record
 * and the answer given to a user or an agent correlate even for a thrown primitive. The same
 * policy and the same limits go to both bags, so the public report is redacted too. Reporting can
 * still fail — a revoked `Proxy` as a cause makes the library throw — and a boundary that is
 * already handling a failure must not be handed a second one, so that outcome comes back as
 * `reported: false` with a local handle and a fixed reason. The reporter is not called again, and
 * nothing is read off the caught value afterwards: reading it is what threw.
 *
 * @param caught The value that was thrown. Any value, including primitives, `null` and hostile
 *   objects.
 * @param options What the calling boundary brings to the report.
 * @param options.redact The policy both reports share, built once at startup.
 * @param options.context Caller data reported beside the caught value, dropped whole when the
 *   report is over budget.
 * @returns Both reports, or the modelled loss.
 */
export function reportFailure(
  caught: unknown,
  options: { readonly redact: RedactionPolicy; readonly context?: unknown },
): FailureReporting {
  const bag = { redact: options.redact, corj: FAILURE_REPORT_LIMITS };
  try {
    // Proof: WRITTEN IN SLICE G, STEP G1.
    return {
      reported: true,
      reports: toReports(caught, {
        diagnostic: { ...bag, context: options.context },
        public: bag,
      }),
    };
    // Proof: WRITTEN IN SLICE E, STEP E4.
  } catch {
    unreportedFailures += 1;
    return {
      reported: false,
      occurrenceId: `UNREPORTED_${String(unreportedFailures)}`,
      reason: REPORTING_LOST_REASON,
    };
  }
}
```

`Proof: WRITTEN IN SLICE …` is a placeholder in this document only. You replace each one with the
dated sentence naming the fault you injected and the failure you watched, **after** watching it.
No placeholder text survives into the repository. Slice E adds a second proof comment beside the
`toReports` call for E5, and slice G adds three beside the fields of `FAILURE_REPORT_LIMITS`.
**Eleven proofs are owed:** C2, D3, D4, D5, E4, E5, G1, G2, G3, G4, G5.

`src/index.ts` is the whole public surface, and grows with the module:

```ts
export {
  createFailureRedaction,
  FAILURE_REPORT_LIMITS,
  type FailureReporting,
  reportFailure,
  SENSITIVE_KEYS,
} from './report-failure';
```

## 6. File plan

| File                                                      | Slice      | Create/modify | Responsibility                                                                                     |
| --------------------------------------------------------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-failure-reporting/**`             | A, H       | create        | The change this contract is added under: proposal, delta spec, tasks, design, verification record. |
| `libs/shared/domain/failures/project.json`                | B          | create        | Nx project `shared-failures`, its tags and its five targets.                                       |
| `libs/shared/domain/failures/tsconfig.json`               | B          | create        | Solution config referencing both sub-configs.                                                      |
| `libs/shared/domain/failures/tsconfig.lib.json`           | B          | create        | Source project.                                                                                    |
| `libs/shared/domain/failures/tsconfig.spec.json`          | B          | create        | Spec project, `bun-types`.                                                                         |
| `libs/shared/domain/failures/src/report-failure.ts`       | B, D, E    | create        | The four exports of section 5.                                                                     |
| `libs/shared/domain/failures/src/report-failure.test.ts`  | B, D, E, F | create        | All twenty acceptance cases.                                                                       |
| `libs/shared/domain/failures/src/index.ts`                | B, D, E    | create        | The public surface.                                                                                |
| `libs/shared/domain/failures/README.md`                   | B          | create        | What the library is, what it refuses, how to run it.                                               |
| `tsconfig.base.json`                                      | B          | modify        | The `@shared/failures` alias.                                                                      |
| `tools/tool-devsync/src/workspace-projects.test.ts`       | C          | modify        | One row in `EXPECTED_PRODUCT_PROJECTS`.                                                            |
| `tools/tool-devsync/src/sync.ts`                          | C          | modify        | One entry in `RESTART_PATHS`, with its watched proof.                                              |
| `tools/tool-devsync/src/workspace-inventory.test.ts`      | C          | modify        | The two pinned counts, with their re-pin comment.                                                  |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` | C          | modify        | The README count pin if it is still a literal, and the digest.                                     |
| `docs/findings/current-document-check-exemptions.json`    | C          | modify        | Remove the exemptions that `shared-failures` existing makes stale.                                 |
| `LLM_README.md`                                           | C          | modify        | One existing table row names the new library.                                                      |
| `../2026-09-17-personal-package-adoption.md`              | H          | modify        | Split and tick the slice 2 boxes this packet completed.                                            |

**Out of lane.** `package.json`, `bun.lock` and `tools/tool-devsync/src/toolchain-pins.test.ts`
(020.1 landed them). `tools/tool-devsync/project.json` (020.8 owns it; its `inputs` already
declare every library project manifest, every library tsconfig and every library source file with
recursive globs, so it needs no edit — confirm by reading, do not change). `nx.json` (section 9).
Every `libs/wbs` and `apps` file. `eslint.config.js` and every `eslint.product.mjs`: product lint
policy discovery passes over a product that ships none, which is how `shared-validation` works
today. Any other batch 2 packet's document.

**Neighbouring batch 2 packets.**

| Packet                     | Shared ground                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 110.6 retire upstream sync | **Lands first** (its own section asks for it). It owns `repo-namespacing-handoff.test.ts`: its slice B replaces the README count with a derived check, it **keeps** the `digest` and `occurrences` literals — its revision proved the digest still guards a same-count substitution — and it **defers the file rename**. So after 110.6 the README pin is gone and the digest pin is not. C4 handles both README states by reading the file. |
| 040.4 plan feed            | **Also conditionally edits the same README count pin**, and its stop conditions reject a pin whose value is not the one it recorded. Whichever of 020.2 and 040.4 runs second must re-read that pin at its own step 0 rather than trusting a recorded literal. The planner sequences them; neither may assume.                                                                                                                               |
| 040.1 Chromium proof       | **Also modifies `../2026-09-17-personal-package-adoption.md`**: it replaces the amendment's browser bullet near the top, while step H3 edits slice 2's checkboxes far below. The two hunks do not overlap; whichever runs second re-reads the file first. Its probe imports the three libraries directly and never imports `@shared/failures` (section 4).                                                                                   |
| 110.1 test axes            | Adds files under `tools/tool-devsync/src/` and edits none of the files above. Its new checks bind only to targets whose command carries a `$( … )` file selector, which neither target of B1 has.                                                                                                                                                                                                                                            |
| 020.7 backend startup      | **Not a consumer.** It puts `libs/shared/domain/failures` and the adoption plan explicitly out of lane and adopts no reporting. The first consumer of this interface is the reporting adoption of plan slice 3, which no batch 2 packet plans.                                                                                                                                                                                               |
| 010.6, 010.7               | Touch no file above.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 7. Slices

Eight slices, A to H, dispatched one at a time. **B and C are reviewed separately and committed
together**, and C resumes B's clone, because B leaves the five devsync checks of 3.3 red on
purpose.

### Two words this packet uses precisely

- **Packet baseline** — what slice A's step 0 recorded, before anything existed. Report it at the
  end of every slice; the planner passes it forward in the next slice note.
- **Slice baseline** — what _this_ slice's step 0 records. Every expectation is against the slice
  baseline unless it says "packet baseline".

### Step 0 — baseline, at the start of every slice

No step in this packet uses `|| true`. Where a command's non-zero status is a real answer, the
status is captured and the allowed values are named; anything else propagates.

- [ ] 0a. Record the tree and the sweep pins. From the repository root:

  ```sh
  set -euo pipefail
  mkdir -p "$TMPDIR/evidence"
  git status --short --untracked-files=all >"$TMPDIR/evidence/status-before.txt"
  cat "$TMPDIR/evidence/status-before.txt"
  sweep=tools/tool-devsync/src/repo-namespacing-handoff.test.ts
  test -f "$sweep"
  readmes=0
  grep -n "applicationLibraryToolReadmes: [0-9]" "$sweep" >"$TMPDIR/evidence/readme-pin.txt" \
    || readmes=$?
  test "$readmes" -le 1
  digests=0
  grep -n "digest: '" "$sweep" >"$TMPDIR/evidence/digest-pin.txt" || digests=$?
  test "$digests" -le 1
  printf 'readme pin present: %s (0 yes, 1 no); digest pin present: %s\n' "$readmes" "$digests"
  grep -n "toHaveLength(" tools/tool-devsync/src/workspace-inventory.test.ts \
    >"$TMPDIR/evidence/inventory-pins.txt"
  cat "$TMPDIR/evidence/inventory-pins.txt"
  ```

  `grep` exits 1 when it matches nothing, which is a real answer here — 110.6 removes the README
  pin — so only statuses 0 and 1 are accepted and anything else stops the block. Expected: a
  packet-only status; `digest pin present: 0`, because 110.6 keeps it; the README pin present or
  not. Write both inventory numbers down.

- [ ] 0b. Record every suite this packet touches, **one file at a time**, because slice C compares
      per file:

  ```sh
  set -euo pipefail
  for file in workspace-projects sync workspace-inventory namespace-layout workspace-targets; do
    status=0
    (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts "./src/$file.test.ts") \
      >"$TMPDIR/evidence/$file-before.txt" 2>&1 || status=$?
    printf '%s status=%s %s\n' "$file" "$status" \
      "$(tail -4 "$TMPDIR/evidence/$file-before.txt" | tr '\n' ' ')"
  done
  status=0
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/repo-namespacing-handoff.test.ts \
     -t 'every routed current document resolves its local links and anchors') \
     >"$TMPDIR/evidence/links-before.txt" 2>&1 || status=$?
  printf 'links status=%s %s\n' "$status" "$(tail -4 "$TMPDIR/evidence/links-before.txt" | tr '\n' ' ')"
  ```

  The `./src/…` form is required: a repository-relative path handed to Bun from inside
  `tools/tool-devsync` matches no test file and runs nothing. Expected in slices A and B: every
  status 0. Expected in slices C to H: the failures of 3.3 in the three files slice C repairs,
  until C repairs them. The links case passed on 2026-09-20; if it fails here, record its
  complete diagnostic — C6 compares against exactly this output and continues only for an
  unchanged failure set.

- [ ] 0c. Record the OpenSpec baseline with the batch README's OpenSpec validation block.
      Expected: exit 0, `"failed": 0`. **In slice A this is the packet baseline; in every later
      slice the change already exists and the expectation is "unchanged".**

### The standard fault block

Every negative proof uses this shape and nothing else. It was run end to end on disk on
2026-09-20: captured status 1, `cmp` clean, evidence containing the named string, green rerun.
`command >file; echo "status=$?"` does **not** work: under `set -euo pipefail` the failing command
exits the shell before the status is read and before anything is restored.

```sh
set -euo pipefail
subject=libs/shared/domain/failures/src/report-failure.ts   # or the file the step names
name=<proof-name>
cp "$subject" "$TMPDIR/passing-$name"
# ... apply the mutation the step names, with an editor ...
if diff -u "$TMPDIR/passing-$name" "$subject" >"$TMPDIR/evidence/$name.patch"; then
  echo "nothing was injected" >&2; exit 1
else
  test $? -eq 1
fi
status=0
(cd libs/shared/domain/failures && bun test src/report-failure.test.ts -t '<exact title>') \
  >"$TMPDIR/evidence/$name.out" 2>&1 || status=$?
cp "$TMPDIR/passing-$name" "$subject"
cmp "$TMPDIR/passing-$name" "$subject"
test "$status" -ne 0
grep -F '(fail) <exact title>' "$TMPDIR/evidence/$name.out"
grep -F '<the diagnostic the step names>' "$TMPDIR/evidence/$name.out"
(cd libs/shared/domain/failures && bun test src/report-failure.test.ts)
```

Both greps are required: the first proves the named test is the one that failed, the second proves
it failed for the named reason. `bun test src/report-failure.test.ts` works from that directory
because the path is relative to it. Restoration happens **before** the status is asserted, so a
proof that fails to fail still leaves a clean tree. The last line must report `0 fail`. A run
reporting `matched 0 tests`, `did not match any test files`, or a zero test count is a failure to
stop on. If the fault also fails tests beyond the named one, that is **not** a stop: keep the whole
output, list the extra failures beside the proof, and go on.

### Slice A — the OpenSpec change, before any file of the module

Rule R4: a new Nx project, a new path alias and a new exported contract are architecture and
contract, whether or not a caller has adopted them.

- [ ] A1. Create the change with the repository's schema:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-failure-reporting --schema sdd-lean
  grep -n "schema: sdd-lean" openspec/changes/adopt-failure-reporting/.openspec.yaml
  ```

  Expected: the second command prints one line. If it prints nothing, STOP.

- [ ] A2. Write `proposal.md`, under 400 words by `wc -w`, with the headings of
      `openspec/changes/service-taxonomy/proposal.md`. It says: the workspace has several
      unrelated ways to turn a caught value into text and no shared policy; the three published
      libraries now provide the reports, one shared occurrence id, one reusable redaction policy
      and one byte budget, so this repository adds only what they cannot decide for it — the
      limits, the sensitive key list, a policy builder over caller-owned secrets, and a wrapper
      that models reporting loss. Under **New Capabilities** name exactly one:
      `failure-reporting`. Under **Non-Goals**: no caller adopts it in this change's first slice,
      no exception kinds in production code, no DI Bag, no browser claim, no new telemetry
      endpoint, no change to any HTTP status, WebSocket frame or MCP envelope.

- [ ] A3. Write `specs/failure-reporting/spec.md` under `## ADDED Requirements`. Each requirement
      uses `SHALL`; each scenario is a real `#### Scenario:` heading with `- **GIVEN**`,
      `- **WHEN**`, `- **THEN**` bullets — OpenSpec validation checks the headings only, so the
      bullets are yours to get right. One requirement per behaviour this packet proves:

  1. One reporting call produces both reports of one occurrence under one shared occurrence id,
     for object and primitive failures alike.
  2. A failure without a disclosure policy discloses `INTERNAL_ERROR`, a generic message and
     nothing read off the value.
  3. Named sensitive properties are skipped in both reports at any depth and in any
     capitalisation.
  4. A secret the calling boundary owns is scrubbed from message, stack and context text, not only
     from the property that held it, and from what a disclosure policy selected into the public
     report.
  5. One byte budget and the depth and breadth limits bound the diagnostic report and say in the
     report which one bit.
  6. Reporting never executes the caught value's property accessors.
  7. Reporting that fails is returned as a visible loss with a correlation handle and a reason,
     never as a throw and never as a success.
  8. Both reports validate against the installed report schemas after redaction and truncation.

- [ ] A4. Write `tasks.md` in the shape of `openspec/changes/service-taxonomy/tasks.md`: ordered
      slices, each naming its test and its negative. Task 1 is this packet — the module, its tests
      and its eleven negatives — and stays **unticked until step H2**. Task 2 is the reporting
      adoption of plan slice 3 (observability serializer, log schema, backend boundary, MCP
      server), unticked, owned by nobody in batch 2. Task 3 is the browser fixture for this
      module, unticked and explicitly unassigned (section 4). Add a `## References` section with
      one link to slices 2 and 3 of the package adoption plan, spelled relative to `tasks.md`'s
      own directory — three levels up, then
      `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` — and check it resolves
      from there, the way `service-taxonomy`'s `## References` section does.

- [ ] A5. Write `design.md`: why the options bag and the policy are module constants (the library
      caches one maker per object), why `SENSITIVE_KEYS` is a string list compiled into anchored
      case-insensitive patterns (measured: string keys are case-sensitive, and headers arrive
      capitalised), why the loss branch invents its own handle instead of reading an id off the
      caught value (reading it is what threw), why the reason text is fixed (the thrown message
      may quote the protected value), and why the schema check uses `ajv/dist/2020` rather than
      ajv's default export (the schemas are draft 2020-12).

- [ ] A6. Create `verify.md` with the headings of `openspec/changes/service-taxonomy/verify.md`,
      filling only the structural-validation counts from step 0c and A7 and the intent word count.
      **Every later slice appends its own evidence to this file as it goes**, because each attempt
      gets a fresh `$TMPDIR` and cannot read an earlier one's; step H1 only completes and checks
      it.

- [ ] A7. Run the batch README's OpenSpec validation block. Expected: exit 0, `failed` 0, `passed`
      exactly the packet baseline plus one.

- [ ] A8. Format and check:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-failure-reporting
  GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: both exit 0.

**Hand-over, slice A.** `git status --short --untracked-files=all` shows the change's files as
untracked under `openspec/changes/adopt-failure-reporting/`, and nothing else. Report the packet
baseline: the OpenSpec `passed` total, the two inventory numbers, the README-pin presence, and the
five per-file suite results of step 0b. Subject:

```
docs(openspec): open adopt-failure-reporting for the shared reporting contract
```

### Slice B — the project, its alias and the two constants, tests first

Step 0b in this slice is the one that matters most: it is the **last** green reading of the five
devsync files, and slice C compares against it.

- [ ] B1. Create `libs/shared/domain/failures/project.json`, exactly:

  ```json
  {
    "name": "shared-failures",
    "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
    "sourceRoot": "libs/shared/domain/failures/src",
    "projectType": "library",
    "tags": [
      "scope:shared",
      "type:failures",
      "runtime:isomorphic",
      "ring:domain",
      "product:shared"
    ],
    "targets": {
      "lint": {
        "executor": "nx:run-commands",
        "options": { "command": "bunx eslint libs/shared/domain/failures/src" }
      },
      "lint:fast": {
        "executor": "nx:run-commands",
        "options": {
          "command": "bunx eslint libs/shared/domain/failures/src --cache --cache-location .nx/eslintcache-shared-failures"
        }
      },
      "test": {
        "executor": "nx:run-commands",
        "options": {
          "command": "bun test --coverage --coverage-reporter=lcov",
          "cwd": "libs/shared/domain/failures"
        },
        "outputs": ["{projectRoot}/coverage"]
      },
      "test:unit": {
        "executor": "nx:run-commands",
        "options": {
          "command": "bun test --coverage --coverage-reporter=lcov",
          "cwd": "libs/shared/domain/failures"
        },
        "outputs": ["{projectRoot}/coverage"]
      },
      "typecheck": {
        "executor": "nx:run-commands",
        "options": {
          "command": "bunx tsc --build --force libs/shared/domain/failures/tsconfig.json"
        }
      }
    }
  }
  ```

  Add no other target. This exact manifest satisfies `namespace-layout.test.ts` and
  `workspace-targets.test.ts` without any edit to them (3.3), and its two test-running target
  names are the ones section 9 checks for agent-variable defaults.

- [ ] B2. Create the three TypeScript configuration files as byte-for-byte copies of
      `libs/shared/domain/validation/tsconfig.json`, `tsconfig.lib.json` and `tsconfig.spec.json`.
      None contains a project name. Confirm:

  ```sh
  for name in tsconfig.json tsconfig.lib.json tsconfig.spec.json; do
    diff -u "libs/shared/domain/validation/$name" "libs/shared/domain/failures/$name"
  done
  ```

  Expected: no output, exit 0.

- [ ] B3. **Tests first.** Create `libs/shared/domain/failures/src/report-failure.test.ts` with
      its complete import block and two cases:

  ```ts
  import { expect, test } from 'bun:test';

  import { FAILURE_REPORT_LIMITS, SENSITIVE_KEYS } from './report-failure';

  test('bounds the whole report and refuses to run the caught value', () => {
    expect(FAILURE_REPORT_LIMITS).toEqual({
      maxReportSize: 32_768,
      maxDepth: 4,
      maxChildren: 16,
      inspection: 'no-invoke',
    });
  });

  test('names every property both reports skip', () => {
    expect([...SENSITIVE_KEYS]).toEqual([
      'authorization',
      'cookie',
      'set-cookie',
      'password',
      'token',
      'access_token',
      'refresh_token',
      'secret',
      'jwtKey',
      'internalAuthSecret',
    ]);
  });
  ```

- [ ] B4. Watch it fail, **before** the module exists:

  ```sh
  set -euo pipefail
  status=0
  (cd libs/shared/domain/failures && bun test src/report-failure.test.ts) \
    >"$TMPDIR/evidence/b4-red.txt" 2>&1 || status=$?
  test "$status" -ne 0
  grep -F 'report-failure' "$TMPDIR/evidence/b4-red.txt"
  ```

  Expected: non-zero, and the output names the unresolvable module `./report-failure`. Record the
  line. If it passes, STOP: something already supplies that module.

- [ ] B5. Create `libs/shared/domain/failures/src/report-failure.ts` with the import line,
      `FAILURE_REPORT_LIMITS` and `SENSITIVE_KEYS` from section 5, with their JSDoc. Import only
      the type you use now:

  ```ts
  import type { AppexCorjOptions } from 'application-exception';
  ```

  The rest of the imports arrive with the code that uses them; an unused import fails
  `unused-imports/no-unused-imports`.

- [ ] B6. Create `libs/shared/domain/failures/src/index.ts` exporting only what exists:

  ```ts
  export { FAILURE_REPORT_LIMITS, SENSITIVE_KEYS } from './report-failure';
  ```

- [ ] B7. Add the alias to `tsconfig.base.json`, in the `@shared/` group before
      `@shared/validation`:

  ```json
  "@shared/failures": ["./libs/shared/domain/failures/src/index.ts"],
  ```

- [ ] B8. Create `libs/shared/domain/failures/README.md`, following
      `libs/shared/domain/validation/README.md`: what the library is and what its tags mean, the
      files, what it refuses, the landmines, and a `## Test` block containing

  ```sh
  bunx nx run shared-failures:test
  ```

  It must state, in its own words: that this library holds only what the three published packages
  cannot decide for this repository; that a key rule hides a value and not its text, which is why
  a caller passes the secrets it owns and never a whole configuration or request object; that the
  same policy redacts the public report, including whatever a disclosure selector returned; and
  that reporting can fail, and `reported: false` is a modelled loss, never a successful operation.
  Do not claim browser execution. Keep every link in it resolvable — the current-document check
  reads this file.

- [ ] B9. Verify, and append every command and result to
      `openspec/changes/adopt-failure-reporting/verify.md`, B4's red line included:

  ```sh
  NX_DAEMON=false bunx nx run shared-failures:typecheck
  NX_DAEMON=false bunx nx run shared-failures:lint
  NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache
  GSETTINGS_BACKEND=memory bunx prettier --write libs/shared/domain/failures tsconfig.base.json
  GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: typecheck exit 0; lint exit 0 with no problems; the test target exit 0 reporting
  `2 pass` / `0 fail`; prettier exit 0 twice. **Do not run the devsync files here**: three of them
  are now red by design, and slice C repairs them.

**Hand-over, slice B.** Beyond slice A's change directory, `git status --short
--untracked-files=all` shows the eight files under `libs/shared/domain/failures/` as untracked,
` M tsconfig.base.json` and ` M openspec/changes/adopt-failure-reporting/verify.md`. **Nothing is
committed yet.** Report the three failing test titles you expect slice C to repair, and the five
per-file results of this slice's step 0b: slice C's contract is built on them.

### Slice C — register the project everywhere this repository counts projects

Dispatched with `--resume` into B's clone. **This slice starts red.** Its step 0b will report
`workspace-projects`, `sync` and `workspace-inventory` failing with exactly the titles of 3.3, and
`namespace-layout` and `workspace-targets` green. Any other shape is a stop.

- [ ] C1. `tools/tool-devsync/src/workspace-projects.test.ts`: add one row to
      `EXPECTED_PRODUCT_PROJECTS`, immediately before the `validation` row, so the list stays
      sorted by root:

  ```ts
  ['libs/shared/domain/failures', 'shared-failures'],
  ```

  Step 0b already captured the two failures this repairs:
  `readProjects > pins every product root and qualified Nx identity in the destination map` and
  `readProjects > activates the product axis of its own directory on every app and library`. Now
  rerun the whole file:

  ```sh
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/workspace-projects.test.ts)
  ```

  Expected: exit 0, `0 fail`, and the **same total executed count** as this slice's step 0b run of
  the file, with the two failures now passing.

- [ ] C2. `tools/tool-devsync/src/sync.ts`, `RESTART_PATHS`. Step 0b already watched
      `RESTART_PATHS coverage > names every library project.json that exists on disk` fail; confirm
      the diagnostic names the absent path:

  ```sh
  grep -F 'libs/shared/domain/failures/project.json' "$TMPDIR/evidence/sync-before.txt"
  ```

  Then save the pre-edit bytes and add the entry beside the `libs/shared/domain/validation` one:

  ```sh
  cp tools/tool-devsync/src/sync.ts "$TMPDIR/omitted-restart-entry.ts"
  ```

  ```ts
  // Proof: <what you saw, dated>.
  'libs/shared/domain/failures/project.json',
  ```

  Rerun the whole file: exit 0, `0 fail`, the same total as step 0b. Then produce the proof's
  patch artifact, which the execution contract requires and step H1 cites, by diffing the passing
  file against the saved omitted state:

  ```sh
  set -euo pipefail
  if diff -u tools/tool-devsync/src/sync.ts "$TMPDIR/omitted-restart-entry.ts" \
       >"$TMPDIR/evidence/restart-entry-omitted.patch"; then
    echo "nothing was injected" >&2; exit 1
  else
    test $? -eq 1
  fi
  cp "$TMPDIR/evidence/sync-before.txt" "$TMPDIR/evidence/restart-entry-omitted.out"
  ```

  The patch turns the repaired file back into the state step 0b measured, and the copied output is
  the failure that state produced. Only now write the dated `Proof:` comment above the entry.

- [ ] C3. `tools/tool-devsync/src/workspace-inventory.test.ts`. **One failing assertion reveals one
      count** (3.3), so this is three runs:

  ```sh
  set -euo pipefail
  run() {
    status=0
    (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       ./src/workspace-inventory.test.ts) >"$TMPDIR/evidence/inventory-$1.txt" 2>&1 || status=$?
    printf '%s status=%s\n' "$1" "$status"
    grep -F 'Received length' "$TMPDIR/evidence/inventory-$1.txt" || test $? -eq 1
  }
  run rows
  ```

  Expected: non-zero, one `Received length:` equal to your step 0a row number **plus four**.
  Update the row pin to that value, add one dated re-pin comment line above it naming this
  library, then `run files`: non-zero again, one `Received length:` equal to your step 0a file
  number **plus four**. Update the file pin. Then `run green`: exit 0, `0 fail`, and the same
  total as step 0b.

  **Stop** if either observed value is not exactly baseline plus four — do not accept it because
  the diff looks right — or if the diff shows anything other than the project's four new
  configuration files.

- [ ] C4. `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the README count and the
      digest. Step 0a already recorded whether the README pin exists. 110.6 lands first and
      **keeps** the digest, so `digest pin present: 0` is the expected reading; a missing digest
      pin means something changed and is a stop.
  - **README pin present** — this packet's new library README moves it by exactly one. 040.4 may
    have moved it first, so take the literal from the file, never from another document.
  - **README pin absent** — 110.6's derived check is in place; change nothing for it.

  The digest moved because C3 inserted a comment line above the two recursive tsconfig globs in
  `workspace-inventory.test.ts` (3.4). Run the pin case and read the observed values:

  ```sh
  set -euo pipefail
  status=0
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/repo-namespacing-handoff.test.ts \
     -t 'every legacy source occurrence and relevant text family is pinned') \
     >"$TMPDIR/evidence/doc-pins.out" 2>&1 || status=$?
  printf 'status=%s\n' "$status"
  grep -F 'occurrences' "$TMPDIR/evidence/doc-pins.out" || test $? -eq 1
  ```

  Expected: non-zero, `1 fail`, a new `"digest"` value in the diff, and — if the pin is present —
  `applicationLibraryToolReadmes` received one above the literal. Re-pin each existing literal to
  its observed value with a dated comment naming what moved it, then rerun: exit 0, `1 pass`,
  `12 filtered out`. **`occurrences` must not move**: a `.md` file is excluded from that scan. If
  it moved, STOP and report — something in this lane reached a source file it should not have.

- [ ] C5. `docs/findings/current-document-check-exemptions.json`: remove the two entries whose only
      reason was that `shared-failures` did not exist —
      `docs/superpowers/plans/2026-09-17-personal-package-adoption.md` and
      `docs/superpowers/plans/2026-09-19-batch-1/020-1-pin-and-install.md`. If an entry for
      `docs/superpowers/plans/2026-09-20-batch-2/020-2-shared-failures.md` is present (the planner
      adds one so the planning branch stays green, section 9), remove it too. Remove nothing else:
      `110-5-reword-current-documents.md` still needs its `nx-selector` excuse for six Twilight
      selectors naming projects nobody has created. Then:

  ```sh
  set -euo pipefail
  for title in \
    'every exemption names a tracked document that still needs each excuse' \
    'every current document that trips a check carries an exemption for that check' \
    'current Nx commands select existing qualified projects'; do
    (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
       ./src/repo-namespacing-handoff.test.ts -t "$title") | tail -4
  done
  ```

  Expected: each run reports `1 pass`, `12 filtered out`, `0 fail`. A `matched 0 tests`,
  `did not match any test files` or a zero test count is a failure to stop on.

- [ ] C6. `LLM_README.md`: extend the existing `libs/shared/domain/validation` row of the "More"
      table so it also names `libs/shared/domain/failures` and `@shared/failures` in one clause —
      one shared reporting policy every product and tool may import. **Add no line.** Then compare
      the link case against the baseline step 0b captured, without letting a failure abort the
      step:

  ```sh
  set -euo pipefail
  status=0
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/repo-namespacing-handoff.test.ts \
     -t 'every routed current document resolves its local links and anchors') \
     >"$TMPDIR/evidence/links-after.txt" 2>&1 || status=$?
  printf 'links status=%s\n' "$status"
  grep -E '^Ran 1 test across 1 file\.' "$TMPDIR/evidence/links-after.txt"
  sed -E 's/\[[0-9]+\.[0-9]+ms\]/[<ms>]/g' "$TMPDIR/evidence/links-before.txt" \
    >"$TMPDIR/evidence/links-before.notiming.txt"
  sed -E 's/\[[0-9]+\.[0-9]+ms\]/[<ms>]/g' "$TMPDIR/evidence/links-after.txt" \
    >"$TMPDIR/evidence/links-after.notiming.txt"
  diff -u "$TMPDIR/evidence/links-before.notiming.txt" "$TMPDIR/evidence/links-after.notiming.txt" \
    || test $? -eq 1
  wc -l LLM_README.md
  ```

  Expected: `links status=0`, exactly one named test executed (the `Ran 1 test across 1 file.`
  line), `0 fail`, and at most 150 lines in `LLM_README.md`. Preserve both raw outputs;
  elapsed-time differences are expected and do not constitute changed diagnostics — the timing
  bracket is stripped before diffing for exactly that reason. If step 0b recorded a failure, the
  only acceptable outcome is either a green run here or the **same** named test failing solely on
  the identical set of source/destination link diagnostics, naming the same file, which is another
  packet's document: record it and continue. Stop on zero tests, any new or changed failing link
  diagnostic, or any different failure cause. Never edit another packet's document.

- [ ] C7. Verify the alias and the two files B1's manifest already satisfies:

  ```sh
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/repo-namespacing-handoff.test.ts \
     -t 'every alias has an allowed prefix and resolves to a tracked file') | tail -4
  (cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts \
     ./src/namespace-layout.test.ts ./src/workspace-targets.test.ts) | tail -4
  NX_DAEMON=false bunx nx run tool-devsync:typecheck
  NX_DAEMON=false bunx nx run tool-devsync:lint
  GSETTINGS_BACKEND=memory bunx prettier --write tools/tool-devsync/src/workspace-projects.test.ts \
    tools/tool-devsync/src/sync.ts tools/tool-devsync/src/workspace-inventory.test.ts \
    tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    docs/findings/current-document-check-exemptions.json LLM_README.md
  GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: the alias case `1 pass`; the two files `0 fail` with the same totals as step 0b;
  typecheck and lint exit 0; both prettier commands exit 0. Append every command and result to
  `verify.md`.

**Hand-over, slices B and C together.** The planner commits these paths, which are what `git
status --short --untracked-files=all` shows beyond slice A's change directory:

```
libs/shared/domain/failures/README.md
libs/shared/domain/failures/project.json
libs/shared/domain/failures/src/index.ts
libs/shared/domain/failures/src/report-failure.test.ts
libs/shared/domain/failures/src/report-failure.ts
libs/shared/domain/failures/tsconfig.json
libs/shared/domain/failures/tsconfig.lib.json
libs/shared/domain/failures/tsconfig.spec.json
LLM_README.md
docs/findings/current-document-check-exemptions.json
openspec/changes/adopt-failure-reporting/verify.md
tools/tool-devsync/src/repo-namespacing-handoff.test.ts
tools/tool-devsync/src/sync.ts
tools/tool-devsync/src/workspace-inventory.test.ts
tools/tool-devsync/src/workspace-projects.test.ts
tsconfig.base.json
```

Subject:

```
feat(shared-failures): add the shared failure reporting library and register it
```

### Slice D — the redaction policy, and three proofs that it is doing something

- [ ] D1. Add the failing tests first. Replace the test file's import block with this one — it is
      the complete block for this slice, and `toReports` is called directly because
      `reportFailure` does not exist yet:

  ```ts
  import { toReports } from 'application-exception';
  import { expect, test } from 'bun:test';

  import { createFailureRedaction, FAILURE_REPORT_LIMITS, SENSITIVE_KEYS } from './report-failure';
  ```

  Then append:

  ```ts
  test('skips a sensitive property whatever its capitalisation', () => {
    const failure = new Error('header rejected');
    Object.assign(failure, { Authorization: 'Bearer live-token', password: 'p' });
    const redact = createFailureRedaction([]);
    const { diagnostic } = toReports(failure, {
      diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
      public: { redact, corj: FAILURE_REPORT_LIMITS },
    });

    expect(diagnostic.as_json).toEqual({ Authorization: '[redacted]', password: '[redacted]' });
  });

  test('scrubs a caller-owned secret from message and stack, not only from its property', () => {
    const redact = createFailureRedaction(['hunter2']);
    const { diagnostic } = toReports(new Error('token was hunter2'), {
      diagnostic: { redact, context: { note: 'hunter2' }, corj: FAILURE_REPORT_LIMITS },
      public: { redact, corj: FAILURE_REPORT_LIMITS },
    });

    expect(diagnostic.stack?.[0]).toBe('Error: token was [redacted]');
    expect(JSON.stringify(diagnostic.context)).not.toContain('hunter2');
  });

  test('treats a secret as literal text, not as a pattern', () => {
    const secret = 'a.b*c+(d)[e]';
    const redact = createFailureRedaction([secret]);
    const { diagnostic } = toReports(new Error(`leaked ${secret} here`), {
      diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
      public: { redact, corj: FAILURE_REPORT_LIMITS },
    });

    expect(diagnostic.stack?.[0]).toBe('Error: leaked [redacted] here');
  });

  test('an empty secret list leaves the key rules in force', () => {
    const failure = new Error('x');
    Object.assign(failure, { cookie: 'a=b' });
    const redact = createFailureRedaction([]);
    const { diagnostic } = toReports(failure, {
      diagnostic: { redact, corj: FAILURE_REPORT_LIMITS },
      public: { redact, corj: FAILURE_REPORT_LIMITS },
    });

    expect(diagnostic.as_json).toEqual({ cookie: '[redacted]' });
  });
  ```

- [ ] D2. Watch them fail, then implement. Run the file; expected: non-zero, and the failure names
      `createFailureRedaction` as not exported by `./report-failure`. Record the line. Then add
      `quoteForPattern`, `SENSITIVE_KEY_PATTERNS` and `createFailureRedaction` from section 5,
      extend the module's import to `createRedactionPolicy` and `type RedactionPolicy`, and export
      `createFailureRedaction` from `src/index.ts`. Rerun: `6 pass` / `0 fail`.

- [ ] D3. Negative proof `keys-removed`, using the standard fault block. Mutation: replace
      `keys: SENSITIVE_KEY_PATTERNS,` with `keys: [],`. Named test:
      `skips a sensitive property whatever its capitalisation`. Observed on 2026-09-20: it fails
      with `expect(received).toEqual(expected)`, a diff reading `Received  + 2`, and the
      unredacted `Bearer live-token`. Grep for `(fail) skips a sensitive property whatever its
capitalisation` and for `Bearer live-token`. Restore, `cmp`, rerun green, then write the dated
      `Proof:` comment beside `keys:`.

- [ ] D4. Negative proof `keys-case-sensitive`. Mutation: replace the `SENSITIVE_KEY_PATTERNS`
      declaration with the plain string list the plan's prose describes,
      `const SENSITIVE_KEY_PATTERNS = [...SENSITIVE_KEYS];`. Named test: the same one. Observed:
      it fails with a diff reading `Received  + 1` — only `Authorization` survives, `password`
      stays `[redacted]` — and the output again contains `Bearer live-token`. That `+ 1` against
      D3's `+ 2` is how the two proofs are told apart; grep for both `Bearer live-token` and
      `Received  + 1`. Restore, `cmp`, rerun green, write the proof above the declaration.

- [ ] D5. Negative proof `patterns-removed`. Mutation: replace the whole `patterns:` expression
      with `patterns: [],`. Named test:
      `scrubs a caller-owned secret from message and stack, not only from its property`. Observed:
      `Expected: "Error: token was [redacted]"` against `Received: "Error: token was hunter2"`.
      Grep for `Error: token was hunter2`. Restore, `cmp`, rerun green, write the proof beside
      `patterns:`.

- [ ] D6. Verify: `shared-failures:typecheck`, `shared-failures:lint`,
      `shared-failures:test --skip-nx-cache` (`6 pass` / `0 fail`), prettier `--write` on the two
      module files and `nx format:check --all`. Append D2's red line and the three proofs, with
      their `$TMPDIR/evidence` paths, to `verify.md`.

**Hand-over, slice D.** ` M` on `libs/shared/domain/failures/src/index.ts`,
`libs/shared/domain/failures/src/report-failure.test.ts`,
`libs/shared/domain/failures/src/report-failure.ts` and
`openspec/changes/adopt-failure-reporting/verify.md`. Subject:

```
feat(shared-failures): build the redaction policy from keys and caller-owned secrets
```

### Slice E — the never-throw wrapper, and the public report

- [ ] E1. Replace the test file's import block with this one:

  ```ts
  import { defineException, toReports } from 'application-exception';
  import { expect, test } from 'bun:test';

  import {
    createFailureRedaction,
    FAILURE_REPORT_LIMITS,
    reportFailure,
    SENSITIVE_KEYS,
  } from './report-failure';
  ```

  Then append the kind and four tests. The first two are the adoption plan's own, unchanged:

  ```ts
  const SignInFailed = defineException({
    tag: 'probe/SignInFailed',
    message: ({ user }: { user: string }) => `sign-in failed for ${user}`,
    public: {
      code: 'SIGN_IN_FAILED',
      message: 'Sign-in failed.',
      details: ({ user }) => ({ user }),
    },
  });

  test('correlates a primitive failure without publishing its contents', () => {
    const redact = createFailureRedaction(['private-marker']);
    const reporting = reportFailure('private-marker leaked', { redact });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const { diagnostic, public: disclosed } = reporting.reports;
    expect(disclosed.occurrence_id).toBe(diagnostic.occurrence_id);
    expect(disclosed.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(reporting.reports)).not.toContain('private-marker');
  });

  test('a cause that cannot be inspected is reported as reporting loss, not as a throw', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const reporting = reportFailure(new Error('boom', { cause: proxy }), {
      redact: createFailureRedaction([]),
    });

    expect(reporting.reported).toBe(false);
  });

  test('two losses in one process do not share a handle', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const redact = createFailureRedaction([]);
    const first = reportFailure(new Error('a', { cause: proxy }), { redact });
    const second = reportFailure(new Error('b', { cause: proxy }), { redact });

    expect(first.reported).toBe(false);
    expect(second.reported).toBe(false);
    if (first.reported || second.reported) return;
    expect(first.occurrenceId).not.toBe(second.occurrenceId);
    expect(first.reason).toBe(second.reason);
  });

  test('redacts a secret the disclosure policy selected into the public report', () => {
    const reporting = reportFailure(new SignInFailed({ details: { user: 'alice@example.com' } }), {
      redact: createFailureRedaction(['alice@example.com']),
    });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.public.code).toBe('SIGN_IN_FAILED');
    expect(reporting.reports.public.as_json).toEqual({ user: '[redacted]' });
  });
  ```

  The typed kind is defined in the test file only. This packet defines no exception kind in
  production code, and this is the one case that can show public redaction at all.

- [ ] E2. Watch all four fail — `reportFailure` is not exported — and record the line.

- [ ] E3. Add `REPORTING_LOST_REASON`, `FailureReporting`, `unreportedFailures` and
      `reportFailure` from section 5; extend the module's import to `toReports` and
      `type CapturedReports`; export `reportFailure` and `type FailureReporting` from
      `src/index.ts`. Rerun: `10 pass` / `0 fail`.

- [ ] E4. Negative proof `wrapper-removed`, using the standard fault block. Mutation: turn the
      `try` into a bare block and move the loss branch below it, so nothing is left unused and the
      file still compiles — this exact shape was run on 2026-09-20:

  ```ts
  const bag = { redact: options.redact, corj: FAILURE_REPORT_LIMITS };
  {
    return {
      reported: true,
      reports: toReports(caught, {
        diagnostic: { ...bag, context: options.context },
        public: bag,
      }),
    };
  }
  unreportedFailures += 1;
  return { reported: false, occurrenceId: 'never', reason: REPORTING_LOST_REASON };
  ```

  Named test: `a cause that cannot be inspected is reported as reporting loss, not as a throw`.
  Observed: `TypeError: Array.isArray cannot be called on a Proxy that has been revoked`, thrown
  through `toReports` and out of `reportFailure`. Grep for
  `Array.isArray cannot be called on a Proxy that has been revoked`. Restore, `cmp`, rerun green,
  write the proof beside the `catch`.

- [ ] E5. Negative proof `public-redact-removed`. Mutation: replace `public: bag,` inside the
      `toReports` call with `public: { corj: FAILURE_REPORT_LIMITS },`. Named test:
      `redacts a secret the disclosure policy selected into the public report`. Observed: it fails
      with `expect(received).toEqual(expected)` and the diff discloses `alice@example.com`. Grep
      for `alice@example.com`. Restore, `cmp`, rerun green, write a second proof comment beside the
      `toReports` call, above the one step G1 will add.

- [ ] E6. This slice adds a type a later packet consumes, so the type check runs **here**:
      `NX_DAEMON=false bunx nx run shared-failures:typecheck`, expected exit 0. Then lint,
      `test --skip-nx-cache` (`10 pass` / `0 fail`), prettier `--write` and
      `nx format:check --all`. All exit 0; lint was confirmed clean on this exact JSDoc on
      2026-09-20. Append E2's red line and both proofs to `verify.md`.

**Hand-over, slice E.** Same three module paths as slice D, plus `verify.md`. Subject:

```
feat(shared-failures): model reporting loss instead of throwing from a boundary
```

### Slice F — the coverage the plan requires

All through `reportFailure`. **The assertion order in these tests is deliberate**: each limit case
asserts its omission field before its length, so that removing the limit in slice G fails on the
diagnostic the proof names rather than on a length. This whole file ran `20 pass` / `0 fail` on
2026-09-20.

- [ ] F1. Replace the test file's import block with the final one:

  ```ts
  import Ajv2020 from 'ajv/dist/2020';
  import { createRedactionPolicy, defineException, toReports } from 'application-exception';
  import diagnosticSchema from 'application-exception/schemas/diagnostic-report-v5.json';
  import publicSchema from 'application-exception/schemas/public-report-v4.json';
  import { expect, test } from 'bun:test';

  import {
    createFailureRedaction,
    FAILURE_REPORT_LIMITS,
    reportFailure,
    SENSITIVE_KEYS,
  } from './report-failure';
  ```

  and add, beside the `SignInFailed` kind:

  ```ts
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validateDiagnostic = ajv.compile(diagnosticSchema);
  const validatePublic = ajv.compile(publicSchema);
  ```

  `ajv` is a root dependency at `8.20.0`; its **default** export cannot compile these draft
  2020-12 schemas and `ajv/dist/2020` can. This block linted and type-checked clean on disk.

- [ ] F2. Append the cause, breadth and depth cases:

  ```ts
  test('reports a cause chain by path and redacts a key nested inside it', () => {
    const redact = createFailureRedaction([]);
    const inner = { authorization: 'Bearer zzz' };
    const reporting = reportFailure(
      new Error('outer', { cause: new Error('mid', { cause: inner }) }),
      { redact },
    );

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const paths = (reporting.reports.diagnostic.children ?? []).map((child) => child.path);
    expect(paths).toEqual(['$.cause', '$.cause.cause']);
    expect(JSON.stringify(reporting.reports)).not.toContain('Bearer zzz');
  });

  test('keeps the order of an aggregate failure and reports a circular value', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular['self'] = circular;
    const failure = new AggregateError([new Error('first'), new Error('second')], 'both failed', {
      cause: circular,
    });
    const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const children = reporting.reports.diagnostic.children ?? [];
    expect(children.map((child) => child.path)).toEqual(['$.cause', '$.errors[0]', '$.errors[1]']);
    expect(JSON.stringify(children[0].as_json)).toContain('[circular]');
  });

  test('stops the cause walk at the depth limit and says so on the deepest child', () => {
    let failure = new Error('level5');
    for (const level of [4, 3, 2, 1, 0]) {
      failure = new Error(`level${String(level)}`, { cause: failure });
    }
    const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const children = reporting.reports.diagnostic.children ?? [];
    expect(children.at(-1)?.children_omitted).toBe('max_depth');
    expect(children.at(-1)?.path).toBe('$.cause.cause.cause.cause');
    expect(children).toHaveLength(4);
  });

  test('stops at the child limit and says so on the root', () => {
    const failure = new AggregateError(
      Array.from({ length: 20 }, (_, index) => new Error(`e${String(index)}`)),
      'many',
    );
    const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.diagnostic.children_omitted).toBe('max_children');
    expect(reporting.reports.diagnostic.children).toHaveLength(16);
  });
  ```

- [ ] F3. Append the value-shape, inspection, budget and schema cases:

  ```ts
  test('reports a thrown undefined, null and BigInt rather than losing them', () => {
    const redact = createFailureRedaction([]);
    const shapes = [undefined, null, 10n].map((value) => {
      const reporting = reportFailure(value, { redact });
      return reporting.reported ? reporting.reports.diagnostic : undefined;
    });

    // A compact report omits a field holding its expected value, so `null` carries no `typeof`.
    expect(shapes.map((report) => report?.as_string)).toEqual(['undefined', 'null', '10']);
    expect(shapes[0]?.typeof).toBe('undefined');
    expect(shapes[1]?.typeof).toBeUndefined();
    expect(shapes[2]?.typeof).toBe('bigint');
  });

  test('does not run a throwing getter while reporting', () => {
    const failure = new Error('getter');
    Object.defineProperty(failure, 'boom', {
      enumerable: true,
      get() {
        throw new Error('ran');
      },
    });
    const reporting = reportFailure(failure, { redact: createFailureRedaction([]) });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.diagnostic.reporting_errors).toBeUndefined();
    expect(reporting.reports.diagnostic.as_json).toEqual({ boom: '[not-inspected]' });
  });

  test('bounds a very long Unicode message and marks it truncated', () => {
    const reporting = reportFailure(new Error('🙂'.repeat(20_000)), {
      redact: createFailureRedaction([]),
    });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.diagnostic.truncated).toBe(true);
    const bytes = new TextEncoder().encode(JSON.stringify(reporting.reports.diagnostic)).length;
    expect(bytes).toBeLessThanOrEqual(32_768);
  });

  test('drops the context whole when the report is over budget', () => {
    const reporting = reportFailure(new Error('m'.repeat(30_000)), {
      redact: createFailureRedaction([]),
      context: { note: 'y'.repeat(8_000) },
    });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.diagnostic.context_omitted).toBe('max_size');
    expect(reporting.reports.diagnostic.context).toBeUndefined();
  });

  test('drops the reporting errors after the context when both cannot fit', () => {
    // A policy that throws is the only way to make reporting errors under `no-invoke`; it is a
    // test fixture, never a production policy.
    const throwing = createRedactionPolicy({
      transform: (value, context) => {
        if (context.key === 'as_json') throw new Error('nope');
        return value;
      },
    });
    const reporting = reportFailure(new Error('m'.repeat(33_000)), {
      redact: throwing,
      context: { note: 'z'.repeat(1_000) },
    });

    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    expect(reporting.reports.diagnostic.reporting_errors_omitted).toBe('max_size');
    expect(reporting.reports.diagnostic.reporting_errors).toBeUndefined();
  });

  test('both reports validate against the installed schemas after redaction and truncation', () => {
    const redact = createFailureRedaction(['alice@example.com']);
    const small = reportFailure(new Error('boom', { cause: { password: 'x' } }), {
      redact,
      context: { runId: 'run-1' },
    });
    // Oversized *disclosed details*, not an oversized context: only they truncate both reports.
    const truncated = reportFailure(
      new SignInFailed({ details: { user: `alice@example.com ${'u'.repeat(40_000)}` } }),
      { redact, context: { note: 'y'.repeat(8_000) } },
    );

    expect(small.reported).toBe(true);
    expect(truncated.reported).toBe(true);
    if (!small.reported || !truncated.reported) return;
    expect(truncated.reports.diagnostic.truncated).toBe(true);
    expect(truncated.reports.public.truncated).toBe(true);
    for (const reports of [small.reports, truncated.reports]) {
      expect(validateDiagnostic(reports.diagnostic)).toBe(true);
      expect(validatePublic(reports.public)).toBe(true);
    }
  });
  ```

- [ ] F4. Run the file. Expected: `20 pass` / `0 fail`, which is what this exact file produced on
      2026-09-20; if your total differs, record it and use it, because slice G compares against
      your number. Then typecheck, lint, prettier `--write` and `nx format:check --all`, all exit 0. Append the total to `verify.md`.

**Hand-over, slice F.** ` M libs/shared/domain/failures/src/report-failure.test.ts` and
` M openspec/changes/adopt-failure-reporting/verify.md`. Subject:

```
test(shared-failures): cover causes, limits, inspection and both report schemas
```

### Slice G — the five limit proofs

Each uses the standard fault block with
`subject=libs/shared/domain/failures/src/report-failure.ts`. Every diagnostic below was observed
by running that exact named test against that exact mutation on 2026-09-20.

- [ ] G1. `shared-call-split`. Mutation: replace the `toReports` call with two separate calls that
      still satisfy `CapturedReports`, which requires a top-level `occurrence_id`, and add
      `toDiagnosticReport` and `toPublicReport` to the module's import for the duration:

  ```ts
  const diagnostic = toDiagnosticReport(caught, { ...bag, context: options.context });
  const disclosed = toPublicReport(caught, bag);
  return {
    reported: true,
    reports: { occurrence_id: diagnostic.occurrence_id, diagnostic, public: disclosed },
  };
  ```

  Named test: `correlates a primitive failure without publishing its contents` — a **primitive**,
  because two separate calls on an `Error` still agree. Observed:
  `expect(received).toBe(expected)` with two different `AE_…` ids. Grep for `AE_`. The mutation
  leaves `toReports` unused, so lint would complain; the proof runs the named test only, and lint
  is run again after restoration. Restore, `cmp`, rerun green, write the proof beside the
  `toReports` call.

- [ ] G2. `inspection-default`. Mutation: delete `inspection: 'no-invoke',` from
      `FAILURE_REPORT_LIMITS`. Named test: `does not run a throwing getter while reporting`.
      Observed: the **first** assertion fails, `expect(received).toBeUndefined()` with a
      `reporting_errors` array whose entry reads `error: "Error: ran"` — the getter ran. Grep for
      `Error: ran`. `bounds the whole report and refuses to run the caught value` also fails under
      this fault; record it beside the proof and go on. Restore, `cmp`, rerun green, write the
      proof beside the field.

- [ ] G3. `budget-removed`. Mutation: delete `maxReportSize: 32_768,`. Named test:
      `bounds a very long Unicode message and marks it truncated`. Observed:
      `Expected: true` against `Received: undefined` — no `truncated` field at all. Grep for
      `(fail) bounds a very long Unicode message and marks it truncated`, which is the unambiguous
      marker here, and for `Received: undefined`. `bounds the whole report and refuses to run the
caught value` also fails; record it. Restore, `cmp`, rerun green, write the proof.

- [ ] G4. `depth-removed`. Mutation: delete `maxDepth: 4,`. Named test:
      `stops the cause walk at the depth limit and says so on the deepest child`. Observed:
      `Expected: "max_depth"` against `Received: undefined`, on the first assertion. Grep for
      `max_depth`. The constants test also fails; record it. Restore, `cmp`, rerun green, write
      the proof.

- [ ] G5. `children-removed`. Mutation: delete `maxChildren: 16,`. Named test:
      `stops at the child limit and says so on the root`. Observed: `Expected: "max_children"`
      against `Received: undefined`, on the first assertion. Grep for `max_children`. The
      constants test also fails; record it. Restore, `cmp`, rerun green, write the proof.

- [ ] G6. Verify: typecheck, lint, `test --skip-nx-cache` (F4's total, `0 fail`), prettier
      `--write` and `nx format:check --all`. Every `Proof:` comment in the module is now dated and
      describes what you saw; no placeholder remains — grep for `WRITTEN IN SLICE` and expect
      nothing. Append all five proofs, with their evidence paths, to `verify.md`.

**Hand-over, slice G.** ` M libs/shared/domain/failures/src/report-failure.ts` and
` M openspec/changes/adopt-failure-reporting/verify.md`. Subject:

```
test(shared-failures): prove each report limit with a watched production negative
```

### Slice H — complete the record and hand over

- [ ] H1. Complete `openspec/changes/adopt-failure-reporting/verify.md` from what earlier slices
      appended: structural validation counts, the intent word count, task state, and one
      failure-proof table row per proof — C2, D3, D4, D5, E4, E5, G1 to G5 — with the fault, the
      named test, the failing line and the `$TMPDIR/evidence` patch and output paths. Name every
      check **not** run and why: the whole `tool-devsync:test` target, `bin/h2puni-gate.sh`, and
      any browser execution.

- [ ] H2. Tick task 1 in `openspec/changes/adopt-failure-reporting/tasks.md`. Leave tasks 2 and 3
      unticked.

- [ ] H3. In [the adoption plan](../2026-09-17-personal-package-adoption.md) slice 2, tick the
      boxes this packet completed: opening the change, the two acceptance cases, keeping the module
      free of Pino, Node/Bun globals, network and filesystem access, building the options and the
      policy as constants, and the coverage list. Its **last** checkbox combines the three
      verification targets with the browser fixture; **split it in two**, so that the verification
      half can be ticked and the browser half cannot be ticked by accident:

  ```md
  - [x] Verify with `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`,
        `shared-failures:typecheck`, and `shared-failures:lint`.
  - [ ] Add a browser execution fixture for `@shared/failures` to the portable test path; Vite
        build success alone is insufficient. **Unassigned:** packet 040.1 proves the three
        libraries in Chromium and never imports this module, so nothing in batch 2 discharges
        this.
  ```

  Re-read the file first — packet 040.1 edits the amendment near the top of it — and change
  nothing else.

- [ ] H4. Run the batch README's OpenSpec validation block. Expected: exit 0, `failed` 0, and
      `passed` **unchanged from this slice's step 0c** — the change already exists by now, and
      only slice A's run is a `+1`.

- [ ] H5. Format and check:

  ```sh
  GSETTINGS_BACKEND=memory bunx prettier --write \
    openspec/changes/adopt-failure-reporting \
    docs/superpowers/plans/2026-09-17-personal-package-adoption.md
  GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
  ```

  Expected: both exit 0.

**Hand-over, slice H.** ` M openspec/changes/adopt-failure-reporting/tasks.md`,
` M openspec/changes/adopt-failure-reporting/verify.md` and
` M docs/superpowers/plans/2026-09-17-personal-package-adoption.md`. Subject:

```
docs(openspec): record the shared failures proofs and tick the plan's slice 2
```

**Cumulative delivery.** Across the seven commits the packet delivers the eight files under
`libs/shared/domain/failures/`, the files under `openspec/changes/adopt-failure-reporting/`, and
edits to `tsconfig.base.json`, `LLM_README.md`,
`docs/findings/current-document-check-exemptions.json`,
`docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
`tools/tool-devsync/src/workspace-projects.test.ts`, `tools/tool-devsync/src/sync.ts`,
`tools/tool-devsync/src/workspace-inventory.test.ts` and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`.

## 8. Verification table

Run from the repository root unless a command carries its own `cd`. Every count is against the
slice's own step 0; the parenthesised numbers are the planning day's.

| Command                                                                                         | Slice         | Expected                                                               |
| ----------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| The batch README's OpenSpec validation block                                                    | 0c, A, H      | exit 0; `failed` 0; packet baseline +1 in A; unchanged in H            |
| `wc -w openspec/changes/adopt-failure-reporting/proposal.md`                                    | A             | below 400                                                              |
| `NX_DAEMON=false bunx nx run shared-failures:typecheck`                                         | B, D, E, F, G | exit 0, no diagnostics                                                 |
| `NX_DAEMON=false bunx nx run shared-failures:lint`                                              | B, D, E, F, G | exit 0, no problems                                                    |
| `NX_DAEMON=false bunx nx run shared-failures:test --skip-nx-cache`                              | B, D, E, F, G | exit 0; `2`, then `6`, then `10`, then F4's total (20), `0 fail`       |
| `(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts ./src/<file>.test.ts)` | 0b, C         | each file: exit 0 and `0 fail` after its repair, same total as step 0b |
| Each named case of C4 to C7                                                                     | C             | `1 pass`, `12 filtered out`, `0 fail`                                  |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck` and `:lint`                                | C             | exit 0                                                                 |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all`                           | every         | exit 0                                                                 |
| `wc -l LLM_README.md`                                                                           | C             | at most 150                                                            |
| `grep -rn 'WRITTEN IN SLICE' libs/shared/domain/failures`                                       | G             | no match; the grep's status 1 is the pass                              |

**What none of this proves.** That `@shared/failures` runs in a browser — nothing in batch 2 does
(section 4). That any WBS boundary reports anything: no caller imports the alias when this packet
ends, so the project has no dependents, which is expected. That the whole `tool-devsync:test`
target passes — it spawns the Twilight Bureaucrat index checker, which writes Git objects.

## 9. Not the executor's: the planner's prerequisites and checks

- **Dispatch.** `puni-plan/exec/run-executor.sh` already takes `--batch batch-2`, which selects the
  clone root `/home/df/wd/puni/batch-2`, the branch prefix `batch-2/`, the temporary root
  `/tmp/puni-batch2` and the packet directory `docs/superpowers/plans/2026-09-20-batch-2`. No
  launcher change is owed. Dispatch each slice as its own attempt:

  ```sh
  puni-plan/exec/run-executor.sh 020-2-shared-failures A <base> --batch batch-2 \
    --slice-note 'Slice A: the OpenSpec change only'
  puni-plan/exec/run-executor.sh 020-2-shared-failures B <base> --batch batch-2 \
    --slice-note 'Slice B: the project and the two constants; leaves three devsync files red'
  puni-plan/exec/run-executor.sh 020-2-shared-failures C <base> --batch batch-2 --resume \
    --slice-note 'Slice C: register the project; B is uncommitted in this clone'
  ```

  Slices D to H follow one at a time, each from the reviewed predecessor, without `--resume`.

- **Sequencing.** Land 110.6 first: it derives the README pin and keeps the digest, which is the
  state C4's cheaper branch expects. Sequence 040.4 explicitly, because it conditionally edits the
  same README pin and its own stop condition rejects a pin it did not record.

- **The agent-variable defaults are not in the tree yet.** `nx.json` has no `CLAUDECODE` or `AGENT`
  defaults today and `tools/tool-devsync/src/workspace-targets.test.ts` has no case demanding
  them; both were read on 2026-09-20. The fix branch that adds them is a **prerequisite to be
  confirmed, not an assumption**: before dispatching slice B, either pass its commit with
  `--require-ancestor`, or run

  ```sh
  grep -n 'CLAUDECODE' nx.json
  ```

  and, if it matches, confirm that `test` and `test:unit` are among the names it covers — B1
  declares only those two, so nothing is owed either way. If it does not match, the branch has not
  landed and B1 is still correct.

- **This packet's own exemption.** Its file names `nx run shared-failures:…`, so until slice B
  lands, `current Nx commands select existing qualified projects` fails on those lines wherever
  this document is checked out. Add one entry to
  `docs/findings/current-document-check-exemptions.json` for
  `docs/superpowers/plans/2026-09-20-batch-2/020-2-shared-failures.md`, excusing `nx-selector`
  only, reason "task packet naming the shared failures project it creates". Step C5 removes it
  again, because an excuse a document no longer needs is itself a failure.

- **The whole `tool-devsync:test` target.** Its index-checker case runs `git write-tree` in the
  clone. After staging, run `NX_DAEMON=false bunx nx run tool-devsync:test` outside the sandbox and
  compare its total with the pre-merge total: this packet adds no devsync test.

- **`bin/h2puni-gate.sh`.** Not run on any other machine. Report that it was not run.

- **Chromium.** Nobody's, in batch 2. Section 4.

## 10. Stop conditions

Each is false on the tree this packet was written against, so meeting one means something changed.

- Step 0a's status shows a modified file this packet does not own.
- Step 0a finds the `digest: '` pin absent. 110.6 keeps it; its absence means the plan underneath
  this packet changed.
- Step 0b in slice A or B reports any failure. Step 0b in slice C reports anything other than the
  three files and the exact titles of 3.3 failing, with `namespace-layout` and `workspace-targets`
  green.
- Any Bun run reports `matched 0 tests`, `did not match any test files`, or a zero test count.
- `tools/tool-devsync/src/package-adoption.ts` exists. 020.1 did not create it; if something else
  did, it holds a project inventory that must now cover `shared-failures`, outside this file plan.
- **At the start of slice B only:** `libs/shared/domain/failures` already exists, or
  `tsconfig.base.json` already carries a `@shared/failures` entry. In slices C to H the opposite
  holds — both must exist, and their absence is the stop.
- A negative proof's named test **passes**, or fails without the diagnostic the step names, or the
  mutation does not compile. Extra tests failing under the same fault is not a stop: record them
  beside the proof and go on.
- C3's observed row or file value is not exactly your step 0a number plus four, or the diff shows
  anything other than the project's four new configuration files.
- C4 finds `occurrences` has moved.
- C6 executes zero tests, introduces or changes a failing link diagnostic, or fails for a
  different cause. Elapsed-time differences and a previously failing case becoming green are
  allowed.
- `shared-failures:lint` reports `@nx/enforce-module-boundaries`. A `ring:domain`,
  `product:shared` library importing npm packages should produce none; a boundary diagnostic means
  the tags are wrong.

## 11. Assumptions recorded during planning

Each was decided rather than asked. Any can be reopened.

- **`SENSITIVE_KEYS` stays a string list and the policy compiles it into anchored
  case-insensitive patterns.** The plan says the names are "passed as the policy's `keys`" and
  "matched case-insensitively"; measured, those two sentences contradict each other. The exported
  contract keeps the plan's `readonly string[]`, and the matching keeps its case-insensitivity.
- **A reporting loss gets a local handle, `UNREPORTED_<n>`, not an occurrence id.** Reading an id
  off the caught value is exactly what threw, and a reused constant would make two losses look
  like one occurrence. The prefix deliberately does not imitate the library's `AE_` ids.
- **The reason text is fixed and does not quote the throw.** The library withholds a redaction
  policy's thrown message for the same reason: it may quote what the policy was protecting.
- **The one typed exception kind lives in the test file.** Public redaction cannot be exercised
  without a disclosure policy, and defining a production kind here would contradict the non-goals.
- **The schema check uses `ajv/dist/2020` and the installed schema files**, with an oversized
  disclosed detail so that both reports actually truncate.
- **Each limit test asserts its omission field before its length**, so the slice G mutations fail
  on the diagnostic the proof names instead of on a length.
- **The project carries `type:failures` beside the four axis tags.** The plan lists four; every
  library in the repository carries a fifth naming itself, and nothing validates it.
- **The library gets a `README.md`.** `shared-validation` has one and this is the second library
  any product or tool may import. It costs one pinned count, which C4 moves when the pin exists.
- **Slice B is allowed to leave the tree red.** The alternative — one slice creating the project
  and repairing five checks — is too large for one attempt. B and C are one commit.
- **`tsconfig.base.json` gains the alias in slice B, not slice C**, so the project type-checks as
  a unit from the moment it exists.

## 12. Review dispositions

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

| Finding                                                       | Disposition | What changed                                                                                                              |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Launcher builds a batch 1 path and cannot dispatch         | Fixed       | Section 9 now gives the three `--batch batch-2` invocations; the launcher gained that flag.                               |
| 2. Alias stop condition true after B                          | Fixed       | Both existence stops are scoped to the start of slice B.                                                                  |
| 3. C4's 110.6 branch is wrong                                 | Fixed       | C4 reads each pin at step 0a and branches only on the README pin; 110.6's revision keeps the digest.                      |
| 4. `>evidence; echo "status=$?"` prevents restoration         | Fixed       | One standard fault block captures the status after the command, restores, `cmp`s, then asserts.                           |
| 5. Cross-slice baselines and G's `+1`                         | Fixed       | Packet and slice baselines are defined; H expects the OpenSpec total unchanged; every slice appends to `verify.md`.       |
| 6. D1/E1 missing test imports                                 | Fixed       | Each slice gives the complete import block and a mandatory red run.                                                       |
| 7. F's prose, `typeof` for `null`, the split mutation         | Fixed       | Exact bodies and titles; G1 gives the compiling split mutation.                                                           |
| 8. Public redaction, depth/breadth limits, C2 without a proof | Fixed       | Typed kind with secret-bearing public details, depth and breadth cases, and C2's watched red run plus its patch artifact. |
| 9. Schema validation and `reporting_errors_omitted` omitted   | Fixed       | Both prescribed, with `ajv/dist/2020` and a fixture that truncates.                                                       |
| 10. B implements before it tests                              | Fixed       | B3 writes the tests, B4 watches them fail, B5 implements.                                                                 |
| 11. 040.1 ownership and the browser fixture                   | Fixed       | Section 6 records the shared file; H3 splits the checkbox and leaves the browser half unassigned.                         |
| 12. Absolute `12 filtered out` / `13 pass`                    | Fixed       | Focused expectations are "the named case passes" or "unchanged from step 0".                                              |
| 13. Hand-over status cannot occur                             | Fixed       | Per-slice hand-over lists plus a cumulative-delivery paragraph; `tasks.md` ticked in H2.                                  |
| 14. C6's green result already unavailable                     | Fixed       | Step 0b baselines the link case; C6 compares against it.                                                                  |
| 15. Section references and proof accounting                   | Fixed       | References corrected; the eleven proofs enumerated and each tied to its step.                                             |
| 16. 020.7 is not the next consumer                            | Fixed       | Section 6 says the first consumer is plan slice 3.                                                                        |

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Everything below was checked by building the project on disk in the planning worktree, running its
targets, injecting each disputed mutation, then restoring the tree and proving it with `cmp` and
`git status`.

| Finding                                                     | Disposition | What changed                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1. C cannot start under a `0 fail` baseline                | Fixed       | Reproduced exactly: with the project present, `workspace-projects` 15/2, `sync` 40/1, `workspace-inventory` 3/1, the other two green. 3.3 names every failing title; step 0b runs the five files **one at a time**; C's opening paragraph and step 0b expect that red set, and each repair restores the step 0b total. |
| C2. Sweep commands select no tests                          | Fixed       | Reproduced: a repository-relative path from `tools/tool-devsync` printed `The following filters did not match any test files`. Every C command now uses `./src/repo-namespacing-handoff.test.ts`, which ran `1 pass` / `12 filtered out`. The `$sweep` variable is gone.                                               |
| C3. The wrapper fails `jsdoc/check-param-names`             | Fixed       | Reproduced: two errors, `Missing @param "options.redact"` and `Missing @param "options.context"`. Section 5 now documents `options`, `options.redact` and `options.context`; `bunx eslint libs/shared/domain/failures/src` then exited 0.                                                                              |
| C4. G2, G4, G5 fail before their named diagnostic           | Fixed       | Reproduced all three. The three tests in F2 and F3 now assert the omission or reporting-error field **first**; re-run against each mutation they fail with `error: "Error: ran"`, `Expected: "max_depth"` and `Expected: "max_children"` respectively. Each G step quotes its observed diagnostic and grep target.     |
| I5. One run cannot reveal both inventory counts             | Fixed       | Reproduced: first run `Received length: 167`, and only after the row pin was updated did the next run show `Received length: 84`. C3 is now a three-run loop, and its stop is "either delta is not +4 **or** the diff is unexpected".                                                                                  |
| I6. The schema fixture never truncates                      | Fixed       | Reproduced: an 8,000-character context gives an 8,446-byte report. The fixture now uses a 40,000-character disclosed detail, which produced `diagnostic.truncated === true` and `public.truncated === true`; both still validated. The test asserts both markers.                                                      |
| I7. Blanket `                                               |             | true`                                                                                                                                                                                                                                                                                                                  | Fixed | No step uses it. Step 0a captures each `grep` status and accepts only 0 or 1; every other capture names the allowed statuses. |
| I8. The known link failure is neither baselined nor handled | Fixed       | Step 0b now runs that named case and stores its whole output; C6 captures its status and diffs against that file. Also re-measured: the case **passes** on the planning tree today — 010.6's document was repaired — so the expected outcome is green, with the unchanged-failure path kept.                           |
| I9. Neighbour ownership and ordering are misstated          | Fixed       | Verified both: 040.4 conditionally edits the same README pin and rejects a pin it did not record; 110.6 deleted its slice D, keeps the digest and defers the rename. Section 6's table and C4 now say exactly that, and section 9 asks for 110.6 first and 040.4 sequenced.                                            |
| I10. B's hand-over omits the verification record            | Fixed       | B9 names `verify.md` explicitly and B's hand-over lists ` M openspec/changes/adopt-failure-reporting/verify.md`.                                                                                                                                                                                                       |
| I11. C2 has no patch artifact                               | Fixed       | C2 saves the pre-edit bytes, and after the green run diffs the repaired file against them under the standard `if diff … else test $? -eq 1` form, keeping the step 0b output as the matching failure.                                                                                                                  |
| M12. Launcher instructions are stale                        | Fixed       | Section 9 gives three exact invocations, including C's `--resume`.                                                                                                                                                                                                                                                     |
| M13. The agent-variable prerequisite is unverifiable        | Fixed       | Confirmed absent from `nx.json` and from `workspace-targets.test.ts` today. Section 9 makes it a planner check with `--require-ancestor` or a `grep`, and notes B1 owes nothing either way because it declares only `test` and `test:unit`.                                                                            |
| M14. The plan has no separate browser checkbox              | Fixed       | Confirmed: one checkbox combines both. H3 prescribes the exact split, ticking the verification half and leaving the browser half unticked and marked unassigned.                                                                                                                                                       |

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH

The verdict is DISPATCH: slice A can run now, unconditionally. The only blocking
finding was scoped to slice C's C6 step, and the planner applied it by hand:
C6's script now strips Bun's `[NN.NNms]` timing brackets from both the before
and after link-check outputs before diffing, so an elapsed-time-only
difference no longer stops a correct run, and it asserts the `Ran 1 test
across 1 file.` line directly instead of a raw byte-for-byte comparison. The
matching prose, and section 10's C6 stop condition, were rewritten to the
review's exact wording: zero tests, a new or changed failing link diagnostic,
or a different failure cause are stops; elapsed-time differences and a
previously failing case turning green are not. This C-scoped fix was made now,
before slice C is dispatched, even though this review authorizes only slice A
today. The three non-blocking notes (C2's patch reapplication, retiring a
stale clone path before B/D–H, and section 9's packet exemption staying until
C removes it) are planner-side verification and sequencing reminders, not
one-line document edits, so none was applied; they are carried forward for the
planner to check after the relevant slice returns.
