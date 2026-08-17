# verify — `openapi-document`

Branch `change/openapi-emit`, cut from `origin/main` @ `1a17190` (#70, #71, #72
merged) on 2026-08-17. PR **#74**, gate head **`20ce9d8`**. **Not merged.**

**Run under the PoC-mode contract** (`notes/delivery-modes.md`, amended
2026-08-14): no `design.md`, no citation table, no R5 fault table, `nx affected`
locally instead of the full gate, **`nx format:check --all` in it** per that
file's own amendment, and **CI is the gate of record**. Watched reds are for new
guards only — there are three new guards here and all three were watched.

Nothing was built or tested on h1claw. Every run below is on **h2puni**, in
`/home/puni1/wd/puni/wt-openapi` (a worktree of `/home/puni1/wbs-reds`), under
bun **1.3.14** from `~/wbs-dark/.bun-1314/bin` — the version CI pins, rather than
that box's default 1.2.20.

## What the document holds

| fact                                                | number                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| operations in `apps/be-01/openapi.json`             | **42** over **32** paths                                    |
| operations carrying a `summary` and a written body  | **8** — the hand-parsed writes                              |
| operations still shape-only (path params, no prose) | **34**                                                      |
| body-carrying operations                            | **18** — 10 declared to Elysia, **8** described in `detail` |
| operations carrying a documented **response**       | **0** — A2                                                  |

The 42 includes `GET /health`, `GET /metrics` (the observability plugin's, which
is registered _before_ the openapi plugin and appears anyway — the emitter reads
the finished route table, not what follows it), `POST /api/smoke/echo` and the two
`/internal/*` routes. Nothing is excluded; what a token may _reach_ is A3's
question, not this document's. `GET /api/openapi.json` does not document itself:
the plugin marks its own route `hide: true`.

## The three watched reds

Each injection was run, not predicted. All three are in
`apps/be-01/src/openapi/openapi-document.test.ts`, which has 3 tests green at the
gate head.

| #   | fault injected                                                                                                                                                       | result                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /projects/:id/work-items` → `/projects/:id/work-item`, committed document left alone                                                                           | **2 fail / 1 pass**. Diff named `"operationId": "postApiProjectsByIdWork-item"` where `…Work-items` was owed   |
| 2   | `body: t.Object({ personId: t.Optional(t.Union([t.String(), t.Null()])) })` on the assignees PUT, `detail` left in place, **document re-emitted** so #1 stayed green | **1 fail / 2 pass** on `describes every hand-parsed body without declaring it`                                 |
| 3   | `.use(openApiPlugin())` commented out of `buildApp`                                                                                                                  | **0 pass / 3 fail**, `documentFromApp` throwing `/api/openapi.json answered 404, so no document could be read` |

**#2 is the one worth reading, because it settles what the brief could only
predict.** Elysia's generated body **replaces** `detail.requestBody` rather than
sitting beside it: after the injection the operation's request body had lost the
"documentation, not validation" sentence entirely and arrived under **three**
media types (`application/json`, `application/x-www-form-urlencoded`,
`multipart/form-data`) instead of one. So a declared body is visible in the
document, and the check can see it.

## The finding: a guard with no test of its own

**The same injection left `work-item.controller.test.ts` at 33 pass / 0 fail.**

`asIdOrNull` refuses a non-string with `<field>_must_be_id_or_null`, and
**nothing in this repo sends one** — grep for `_must_be_id_or_null` across `apps`
and `libs` returns the throw itself and this change's own prose, and no test. It
guards four fields on three routes: `personId` (assignees PUT), `parentId` and
`afterId` (create and move), `serviceTeamId` (patch).

So on the assignees PUT, declaring the body would have moved a `400
personId_must_be_id_or_null` to Elysia's `422` with **nothing red anywhere**.
After this change the document check is what notices. That is a hole worth
closing with four ordinary negatives; it is **not fixed here** — this change adds
no test to a controller suite it does not otherwise touch, and the fix belongs
beside A2's annotation pass, which reads all of those routes anyway.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` — 21 projects
affected, because `package.json` moved.

| run                                        | result                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nx affected -t test lint typecheck` (1st) | **failed**: `fe-01:lint` and `be-01:test`, both under `--parallel` contention                                                                                  |
| `be-01:test` alone                         | **742 pass / 0 fail / 62 files**, 25,097 `expect()`, 17.83s                                                                                                    |
| `fe-01:lint` alone                         | **green**                                                                                                                                                      |
| `nx affected …` (2nd)                      | green — **but 63 of 63 tasks came from cache**, so it re-ran nothing and is not evidence                                                                       |
| `nx affected … --skip-nx-cache` (3rd)      | **green, 21 projects, nothing from cache** — be-01 **742 / 0 / 62 files** (50.4s under parallel load), fe-01 **1405 / 0 / 53 files**, lint and typecheck clean |
| `nx format:check --all`                    | clean, exit 0                                                                                                                                                  |
| `openspec validate --all`                  | **57 passed, 0 failed**, `change/openapi-document` among them                                                                                                  |

fe-01 is untouched by this change and its suite reported **1405 pass / 53 files**
in the first run. be-01 is **742**, of which **three are new here**; main's own
number at `1a17190` was not re-measured, so 739 is arithmetic rather than a
reading.

**The first run's two failures are h2puni's, not this branch's**, and both are on
the record already: `fe-01:lint` flakiness under load is in `LLM_README.md`'s
landmines, and nx labelled both tasks flaky itself after each passed alone. `/tmp`
was at 23% throughout (854M of 3.8G) and `TMPDIR=/var/tmp` since 2026-08-14, so
this is not the tmpfs failure that class usually means. Said plainly: **the
isolated runs are the evidence for those two targets, and CI below is the gate of
record.**

## CI

**Run 32023194973** at the gate head `20ce9d8`. Job `gate` **success** —
`format:check --all`, the full `run-many -t test lint typecheck build`, the
secrets scan, doc caps, compose config, migration lint and `openspec validate`.
Job `pixels` **success** as well — 3m42s and 9m31s, **both green first attempt**,
which on this repo's record is worth stating: `pixels` has flaked six times, twice
on markdown-only diffs.

The freshness check needs **no workflow change**: it is a `bun test` in be-01's
own suite, and CI's `gate` runs `run-many -t test` unconditionally, so a PR that
moves a route and not the document reddens `gate`. A separate step would have
duplicated an existing one for a nicer name.

## What was decided rather than asked

Three, all reversible in one line, recorded because a reviewer will otherwise
read them as oversights:

1. **`provider: null`.** The default (`'scalar'`) serves an HTML page whose
   `<script src>` is `cdn.jsdelivr.net`, which gives this API a third-party origin
   it does not have today. The deliverable is a document an agent reads; any local
   viewer renders it.
2. **`info.version` is a constant, `'0.0.0'`, not `AppOptions.version`.** The
   document is committed and diffed; a per-build version would move the file on
   every deploy and turn the freshness check into one nobody can keep green.
3. **`apps/be-01/openapi.json` is in `.prettierignore`.** Prettier collapses a
   short array onto one line and `JSON.stringify(…, null, 2)` does not, so
   formatting it would redden the check on a file nobody edited — the same fight
   the drizzle snapshots are already ignored for. The alternative, running
   prettier inside both the writer and the test, buys nothing and costs a
   dependency in the test path.

## Wall clock

Stamped from the branch reflog, file mtimes, the commit, the PR and the CI run —
not from a log kept per step, so the two bracketed rows are bounds rather than
readings.

| moment                                             | UTC (2026-08-17) |
| -------------------------------------------------- | ---------------- |
| task received, first read                          | 10:45            |
| worktree and branch cut from `origin/main`         | 10:47            |
| `openapi-plugin.ts` written                        | 10:51            |
| first document emitted on h2puni (spike, no prose) | 10:51 – 10:57    |
| the three watched reds run                         | 10:57 – 11:02    |
| commit `20ce9d8`                                   | 11:04            |
| PR #74 open                                        | 11:05            |
| CI `gate` green / `pixels` green                   | 11:09 / 11:14    |
| this record finished                               | 11:22            |

**Branch cut to PR open: 18 minutes. Task received to record finished: 37
minutes.** Split, as well as it can be reconstructed: roughly **10 minutes
reading** — the workspace brief, the six controllers, `libs/domain`'s estimate and
priority-band rules, `place-sibling.ts`, and the plugin's own `dist` to learn that
`provider: null` registers exactly one route and that the emitter reads the
finished route table; roughly **12 minutes code** — the plugin, the reader, the
writer, the check and the eight `detail` blocks, which are most of it; roughly
**15 minutes record and gate**, most of it after the PR was already open.

Against #63's 15 minutes for a four-line copy change, and C4's 40 minutes under
full prod mode: this is a larger change (13 files, a dependency, a generated
artifact, three new guards) at roughly the same cost, which is the "fewer, bigger
PRs" lever `notes/delivery-modes.md` predicted rather than a second data point on
writing less down.

## What the lighter contract cost

- **Skipping `design.md` cost nothing.** The two shape decisions (where the writer
  lives, why the document is prettier-ignored) each fit in a JSDoc paragraph and
  are above.
- **The `affected` run earned its place again.** It is what surfaced that a green
  second run had come **entirely from cache** — a gate that reported success
  having executed nothing. Without `--skip-nx-cache` this record would have
  quoted it as evidence.
- **The uncomfortable part is that eight prose blocks are not covered by
  anything.** The freshness check proves the document matches the routes; nothing
  proves a _description_ matches the guard it describes. Two claims in those
  blocks were fixed while writing them — `afterId: null` puts a row **first** in
  its group (read from `placeAfter`, not guessed), and the estimate route's
  refusal is `invalid_estimate` from the shared arktype schema rather than a
  hand-parsed code — and both were caught by reading, not by a test. A2 is going
  to write 34 more of these; that is where the risk concentrates.
- **A wart found while documenting, not fixed:** an `afterId` naming a work item
  that is not a sibling under the destination `parentId` makes `placeAfter`
  **throw**, and neither controller models it — so it leaves as a 500 rather than
  a 4xx. The descriptions say the id must already sit under `parentId`; they do
  not claim a refusal code, because there is not one.
