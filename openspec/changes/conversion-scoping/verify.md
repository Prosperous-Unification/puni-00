# Conversion scoping verification

Status: implementation in progress. No launch or activation claim. About and the first blog post remain user-owned.

## Shared contracts — 2026-10-25

Commit `d2bd6b2a126fbcb51858d3b30a5f0b23f6c9d3c9` adds six starting choices, the question catalogue, strict reply/intake parsers, revision-bound answer resolution and explicit public test paths.

- `bunx nx run website-contracts:test`: exit 0, 68 tests, 0 failures, then successful TypeScript check.
- `bunx nx run website-contracts:lint`, `:typecheck`, `:build`: exit 0. Lint emitted an environment color warning; no lint diagnostics.
- `bun test ./libs/website/adapters/store-sqlite/src/retention-journal-schema.test.ts --test-name-pattern 'migration lint accepts 010'`: exit 0, one public test passed. Before the path fix, Bun's substring selector collected the nested private copy too and failed there; the migration check was not weakened.
- Each of 22 parser/lookup/revision guards was bypassed independently; its production-path test failed. Restored guards have adjacent Proof comments. One surviving explanation mutant exposed missing test coverage; the additional test failed on the mutant and passed after restoration.
- Scoped review: no Critical or Important findings. API, storage, browser and real model integration remain later work.

## Durable state and retention — 2026-10-25

Commit `112f6b3ed8a67c7a29e082299c38ffa9c6e4132f` adds additive migration 011 with down.sql, explicit legacy/versioned state, revisioned edits, candidate preservation and retention coverage. Scoped review found no Critical, Important or Minor findings.

- `env -u FORCE_COLOR -u NO_COLOR bunx nx run website-store-sqlite:test`: exit 0, 230 tests, 0 failures, 964 expectations, 16 public files; 48 scoping cases. Lint, typecheck and build also exited 0 without the previous color warning.
- Production migration lint accepted both 011 SQL files. Downgrade ran only against disposable copies. Successful commit hooks passed.
- Observed negatives cover stale overwrite, legacy-write bypass, first/later candidate overwrite, claim/expiry/consumption checks, missing/invalid trusted state, transaction requirement, every new text field omitted from erasure, SQL insert/update/ownership fences, first-content coverage and safe revision bounds. Restored checks carry adjacent Proof comments.
- A real second SQLite connection exposed mixed old brief/new revision reads; one read transaction now returns a coherent snapshot.
- A pre-erasure snapshot exposed unsettled inflight accounting during journal replay; replay now applies the existing conservative settlement helper, retaining the full reservation and erasing text. Repeated replay is idempotent.
- Actual structured operation settlement/replay and HTTP/UI integration remain later work.

## Versioned intake and admission — 2026-10-25

Commits `7ddff6e3b`, `586eb25e6` and reviewed fix `10a818d81` implement versioned native/JSON intake, authorized automatic initial admission, revision-bound selections and durable raw Retry payloads in additive migration 012. Legacy behavior remains explicit.

- All 16 scoped test/lint/typecheck/build targets passed across contracts, store, API and frontend: 594 tests in the main implementation receipt. Migration lint and OpenSpec validation passed. The report identifies cached outputs; current production API tests also ran uncached.
- The full-answer pricing fault failed with expected 4,222 micro-USD versus truncated-price 3,996; restoring production passed all 71 conversation tests and API lint/typecheck. These are fixture rates, not observed live costs.
- Review found two Important defects: native choice-only forms rejected an empty textarea, and exhaustion blocked completed version-1 replay. Both were reproduced before fixing. Forms now normalize only bounded blank text for a valid starter, preserving strict JSON, exact nonblank content and the original length bound. Completed version-1 replies and body conflicts resolve before exhaustion; fresh calls remain refused and legacy behavior remains unchanged.
- Fix verification: 153 covering tests passed, then nine focused regressions passed after a test-only type annotation. API/store lint and typecheck passed all four targets uncached. Exact formatting, whitespace and commit hooks passed. Scoped re-review verified both findings addressed, with no new breakage or out-of-scope observations.
- Observed production faults cover initial identity/authorization, unknown automatic retry, stale selection/race, raw answer hash identity and persistence, full-text pricing, blank form length, replay/exhaustion ordering, trusted DTO validation, every new raw payload retention/erasure/fence/restore path and frontend Retry forwarding. Restored guards carry adjacent Proof comments.
- Live claims remain required for replay: expiry, consumption and actual erasure cannot reopen a completed operation. No replay adds provider work, reservations, turns or scoping revisions.
- Required release constraint: a pre-scoping backend cannot maintain version-1 raw Retry payloads. Release preparation must guard the minimum backend protocol and rehearse a compatible rollback; additive SQL alone is insufficient.
- No live provider call, browser journey, deployment or full host gate was part of this slice. Tool-wiki hooks explicitly reported inactive because the external activation root is absent; applicable secrets, format, lint, nesting, migration and message hooks passed without bypass.

## Structured replies, prompt and accounting — 2026-10-25

Commit `b2b81382c` adds the separately versioned `puni-scoping-v1` prompt, strict structured output, coherent admitted context/schema pricing, atomic reply/state/accounting settlement and adaptive capture counts. The independent task review approved spec compliance and quality, with one JSDoc correction handled before the next slice.

- All 16 affected test/lint/typecheck/build targets passed: contracts 69, frontend 114, store 253, API 214, totaling 650 tests. Final API/store suites ran with the final fixtures; 12 matching target outputs were cached. The API suite included an actual 30-second deadline/abort test. Verification and hook logs had no warning diagnostics.
- Nineteen temporary production faults failed their matching regressions and were restored. They cover envelope validation/bounds/truncation, pre-commit publication, fixed completion and reasoning mischarging, missing-refusal zero charging, stranded inflight settlement, reservations/pause/cap/schema pricing, duplicate/invalid capture, failure SQL/trusted/frontend validation, prompt equality and lost draft ownership.
- Known-invalid output with known usage settles actual cost and exposes a durable failure using additive migration 013. It saves fixed server-owned manual-path prose, no raw invalid text, question, candidate or capture. Missing/invalid usage, including refusal without usage, settles the full reservation. Explicit reported zero remains zero. Completed accounting is not a useful AI answer.
- Valid envelope, readable transcript, current state, capture and usage commit in one immediate transaction. Current visitor edits survive inference. Replay decodes historical prose without restoring an old current question or purchasing another call. A thrown settlement now conservatively clears inflight accounting before propagating the error.
- Exact request pricing includes the outbound schema and the same admitted history/brief/reference snapshot. Fixture costs include 502 micro-USD for 900 prompt + 60 completion tokens and 1,558 for 900 prompt + 660 completion tokens, including 600 reasoning tokens, at $0.44/$1.76 per million. These are deterministic fixture checks, not measured live costs.
- Six scripted click routes and typed/mixed/uncertain/curiosity fixtures passed. They establish shape/control behavior only. Model judgment, actual endpoint acceptance and 700-token truncation frequency remain live-evaluation work.
- Migration 013 lint and exact disposable rollback checks passed; existing retention/journal fixtures now unwind dependent migrations in order. Restored-snapshot coverage includes real versioned envelope content and erasure fences. OpenSpec validation, formatting, whitespace and applicable hooks passed; tool-wiki remains explicitly inactive because its external activation root is not provisioned.
- Browser rendering, revisioned editing/human-review UI, paid evaluation, deployment and exact-SHA host gate were not run in this slice. These are required downstream checks, not inferred from passing unit/mounted tests.

## Private source map and baseline

The licensed site is in the independently cloned private companion; its source is never copied into the public repository. Canonical public app/API/contracts/store snapshots will be refreshed only from a committed public revision.

| Surface                           | Private path                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hero and intake                   | `apps/website/site/src/pages/index.astro`, `src/components/RequestForm.astro`                                    |
| Services                          | `apps/website/site/src/content/services.ts`, `src/pages/services/index.astro`, `src/pages/services/[slug].astro` |
| Privacy                           | `apps/website/site/src/pages/privacy.astro`, `src/content/privacy-retention.ts`                                  |
| Global layout / consent placement | `apps/website/site/src/layouts/BaseLayout.astro`                                                                 |
| Existing blog                     | `apps/website/site/src/content/posts.ts`, `src/pages/blog/index.astro`, `src/pages/blog/[slug].astro`            |
| About                             | No route in the inspected source; content remains user-owned.                                                    |

Before integration, `bunx nx run-many -t test lint typecheck build -p website-site` passed all four targets uncached in 4.9 seconds.

## Release observations

Read-only HTTPS probes on 2026-10-25 found development HTTP 200 with noindex headers and a healthy API. `/release.json` reported private `f73bf92bf1ba81b37ce66e1f5d2f02233cd652b0`, public `1bde073c2b8fd8e4b84ca9c954c3b1a01a267b93`. The retained h2 Compose site/app containers are older, with its API absent; use the platform release workflow rather than historical Compose deployment instructions. Production currently serves a small placeholder.

The current committed fleet configuration enables inference, disables the retention journal and uses report-only erasure. Live cluster reconciliation was not inspected: the available regular account cannot run kubectl, and the direct administrator SSH probe had no accepted credential. This is not proof of live erasure. Do not publish automatic deletion or backup-aging guarantees without activation evidence.

The user supplied responsible person and request-review owner Danylo Fedorov, contact dany@puni.dev. No response-time promise has been approved.

The retained website provider key was checked on h2 through [OpenRouter’s current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key), keeping the credential on the server. It has a $50 monthly limit, $49.975511617 remaining at the probe, and is not a management key. Preserve this cap, which is stricter than the illustrative $100 ceiling. Its runtime file pins openai/gpt-6-luna, azure/eu, low reasoning and 700 completion tokens. Verify the current platform uses that same credential/configuration before treating this as activation evidence.

## Outstanding validation

Selectable UI, revisioned editing and human-review integration, private integration, browser journeys, actual provider quality/cost evaluation, operator receipt, release rollback and exact-SHA host gate remain outstanding. No new flow is deployed. No real request has been submitted and no outbound email sent by this work.
