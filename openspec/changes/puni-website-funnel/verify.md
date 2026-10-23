# Verification Report

**Change**: `puni-website-funnel`

**State**: reviewed plan and local throwaway walkthrough; all production implementation tasks remain unchecked.

## Structural validation

`bunx @fission-ai/openspec@1.12.0 validate puni-website-funnel --json` exited 0 on 2026-09-27 with one change item, `valid: true`, zero issues, and summary `passed: 1, failed: 0`. Full CI format, test, lint, typecheck and build are implementation gates and have not run for this planning artifact.

## Acceptance and failure proofs

Each `tasks.md` slice names its intended acceptance test and, for a safety check, a production-path negative with the injected fault. None has been watched fail or pass yet. An implementing agent must record the exact test output and add an adjacent `Proof:` comment on each implemented check before marking a slice complete.

## Release gates

- **Repository foundation**: pinned common baseline, private Nx bootstrap, both clean-copy directions and private-source transfer refusal pass before private release; baseline bootstrap precedes licensed site import.
- **Manual funnel (M1)**: static site, browser-bound anonymous intake/resume, claim-scoped brief and idempotent opaque receipt, authenticated operator inbox, privacy lifecycle, backup/restore, multi-host browser path and accessibility checks pass. There is no prospect sign-in; inference may be disabled or paused.
- **Chat (M2)**: claim-bound conversation, approved processor wording, current compatible provider/price, dedicated key and monthly ceiling, reservation/concurrency faults, streaming settlement/cancellation, abuse corpus and pilot review pass. No paid call is part of this planning change.
- **Preview**: typed schema/renderer rejection proof, separate preview allowance, simulated-auth clarity and optional submission path pass.

## Deferred evidence

The local `docs/website/prototypes/funnel.html` walkthrough is a UX decision aid. It does not prove session security, durability, paid accounting, provider policy, notification, deployment or privacy deletion. No gate or OpenSpec apply/verify claim is made from it.

## Work performed on 2026-09-27

- Created `Prosperous-Unification/puni-pr-00` after the user selected this topology. `gh repo view Prosperous-Unification/puni-pr-00 --json nameWithOwner,isPrivate,defaultBranchRef,url` returned `isPrivate: true` and an empty default branch. This proves repository creation/privacy, not an installed management baseline.
- An independent GPT-6 Sol reviewer at medium effort approved the final plan, proposed WBS graph, private-companion ADR and prototype. The reviewer checked the known existing edges and new DAG; final live WBS reconciliation is recorded separately after applying.
- `bunx prettier --check LLM_README.md CONTEXT-MAP.md docs/adr/0037-public-and-private-monorepos-share-a-portable-project-contract.md docs/website openspec/changes/puni-website-funnel` passed after formatting the prototype. `LLM_README.md` has 132 lines.
- Final local Chromium smoke after formatting: `bun /tmp/puni-funnel-smoke.ts`, exit 0. Output: `happy: 6 steps passed`; `cancel: 4 steps passed`; `limit: 5 steps passed`; `outage: 5 steps passed`; `manual: 3 steps passed`; `user content stays text`; `desktop/mobile browser smoke passed; no page errors, network calls, or mobile overflow`. It opened the standalone file and checked the 390-pixel layout. Desktop and mobile screenshots were inspected. The script and screenshots are session scratch files, not a committed test suite.

## Failure-proof status

| Check                                                       | Injected fault / observed check                                                                                            | Status                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Prototype text rendering                                    | HTML-looking visitor prompt remained text in Chromium                                                                      | Observed smoke only; not a production security proof |
| Production auth, claim, budgets, preview and privacy guards | Named negative scenarios in the task/spec artifacts; no production paths exist yet                                         | Not implemented; no removed-guard proof claimed      |
| Whole-repository CI / h2puni gate                           | Not run: this change contains planning documents and a local throwaway HTML walkthrough, with no production implementation | Unverified; no release or merge-readiness claim      |

No private theme source was imported, no identity provider or OpenRouter key was provisioned, no paid inference occurred, and no website deployment or real proposal notification was performed.

## WBS mutation and read-back

The reviewed 211-command payload was initially refused with HTTP 400 `too_many_commands`; the server limit is 200 commands and the refusal applied no plan edits. Reused the saved before-change snapshot and submitted the same intended changes in two atomic batches: 181 commands for work items, implementation/review estimates, dependencies and names; then 30 planning estimates after resolving returned references. The sent MCP arguments matched each prepared batch exactly. Each accepted batch is one WBS undo step.

Parent-side comparison of the actual MCP read-back against the saved snapshot and reviewed command payload passed: 141 → 173 work items; 32 creations (30 leaves and two groups); 90 matching O/M/P estimate triples; the exact 202 expected native dependencies; four intended title changes; preserved pre-existing notes, parents, frozen numbers, priorities and service/scheduling constraints. The scheduler returned `scheduleError: null`, sequence 106, project revision 11, and zero waiting-for-person/capacity counts. These observations do not turn provisional effort into a promised delivery date.

The saved snapshot is `8cb74b13-9cba-466f-ba8b-90c346482006`. [Stable WBS mapping](evidence/wbs-mapping.md), [verification receipt](evidence/wbs-verification.json), and [independent plan review](evidence/plan-review.md) retain the scoped evidence. No work item was marked production-complete by the planning batch.

## Prototype foundation implementation, 2026-09-27

The follow-on morning-prototype goal implements a scoped foundation in `tools/workspace/portability.ts`, independently reviewed by a Sol 6 medium agent. It projects shared toolchain/package specifications and core Nx/compiler semantics from this public checkout to the private companion, records a content fingerprint, and preflights declared project/dependency copies. It does not complete all four production foundation slices: application-only dependencies, aliases, the complete governance suite, delegated private releases and release authorization remain separate requirements. See [the transfer contract and proofs](../../../docs/workspace/portability.md).

Eight unit tests and 26 assertions pass after eight observed failing guard-removal mutations. Public → actual private → fresh independently installed public fixtures preserve two library paths and pass their test/lint/typecheck/build targets with cache disabled. The fresh public fixture also passed `bun install --frozen-lockfile`. A default public Nx invocation returned only sandbox socket warnings and exit 0 without task evidence; it is not counted as verification. The explicit in-process run (`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test,lint,typecheck,build -p workspace-portability,portability-format,portability-fixture --skip-nx-cache --output-style=static`) visibly executed and passed all 12 tasks before the fixture paths were moved into the repository's required library layout. Post-move verification is recorded below.

The final public fixture paths are `libs/shared/domain/portability-format` and `libs/website/adapters/portability-fixture`. Their project manifests now carry the required namespace tags, and declared aliases move with the project closure. The final portability suite passes ten tests and 32 assertions. Disabling alias collision admission reproduced a failed collision assertion; disabling namespace tag admission reproduced a failed missing-ring assertion. The uncached scoped Nx run passed test, typecheck and build targets for all three projects and lint targets for the libraries. After formatting, `workspace-portability:lint` passed separately.

The follow-up portability gate uses copied `tools/workspace/eslint.portable.mjs` and `tools/workspace/prettier.portable.json` for all three project lint targets. `sync` copies the common tool/config files and ESLint package specs; `check` includes file hashes. Two new tests first failed with the unextended sync, showing that destination files stayed private and a missing source config was accepted. At that stage, the portability suite passed twelve tests and 41 assertions; the uncached 12-task Nx run passed. Removing the required ESLint config from the source-file list made the missing-source test fail. Removing file comparison made the drift test fail with a receipt mismatch in place of the named file mismatch. With the shared ESLint config removed from one library's Nx lint inputs, its warmed target returned a cache hit after an injected throwing config; restoring the input made the target execute and fail. All injected faults were restored.

An actual checked-in fixture copy then exposed `Invalid ring: tag` for `libs/website/adapters/portability-fixture`: the preflight had derived `ring:adapters`, while the source manifest correctly uses `ring:adapter`. The checked-in closure is now a regression test against the real public source. It first failed with that exact message, then passed after the directory-to-ring mapping was fixed. The suite now passes thirteen tests and 43 assertions.

## Portability closure, 2026-10-11 (batch 10, WBS 060.12-060.14)

`tools/workspace/portability.ts` now refuses undeclared or differently specified `metadata.portability.packages`, Nx Cloud settings and runner access tokens in either `nx.json`, and alias imports owned outside the declared closure. `apps/website/fe-01` declares `libs/website/domain/contracts` and its packages; the contracts library declares `@noble/hashes`. Each new test failed before its guard existed and again with the guard removed; details are in [the transfer contract](../../../docs/workspace/portability.md).

- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test tools/workspace/portability.test.ts`: 20 pass, 0 fail (after the review follow-up widening remote-cache detection).
- Clean private copy: a temporary workspace with `puni-pr-00` root configuration (`package.json`, `bun.lock`, `nx.json`, `tsconfig.base.json` without website aliases, `eslint.config.mjs`, Prettier files, `workspace.portability.json`, `tools/workspace`) and no project trees ran `portability.ts sync` and `check` from this branch. `copy … apps/website/fe-01` refused with `Missing package @types/react@^19.2.18 in …/package.json: add it, run bun install, then commit bun.lock` because the private manifest pins `19.2.18`. After setting the declared specifications, `bun install` and `bun install --frozen-lockfile` reported no changes, `copy` printed `libs/website/domain/contracts` and `apps/website/fe-01`, and `NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-contracts --skip-nx-cache --output-style=static` printed `Successfully ran targets test, lint, typecheck, build for 2 projects` (fe-01 78 tests, contracts 15 tests, Vite build of 109 modules).
- Private gate (puni-pr-00 PR #46, `.github/workflows/gate.yml`, no `secrets.` reference, `persist-credentials: false`): run 38167285803 failed `website-deploy:test` because a container test assumed host uid 1000. The test now runs the container as the host user, and run 38167759069 passed install, the anonymous pinned public fetch, `Baseline check`, OpenSpec and the Nx targets. A pushed commit altering one `.puni-baseline.json` fingerprint character failed run 38167982425 at `Baseline check` with `Baseline receipt mismatch`; it is reverted, and run 38168231673 on the final head passed.
- Not run: the h2puni host gate (the orchestrator runs it on the merged SHA).

## Operational recovery acceptance, 2026-10-18 (TASK-567)

The live `website-dev` API was Ready on image `sha256:0720e5d4136bd9b02c062cc6160b54ca390a0c9eebd272ec10746a49f7f3a97c`. The documented `sqlite-restore-drill` Job restored and verified the newest real backup without mounting the live PVC. Its complete result was:

```json
{
  "verified": "sqlite/website-dev/20261018T142300786Z.sqlite.report.json",
  "capturedAt": "2026-10-18T14:23:00.786Z",
  "ageHours": 0.18,
  "migrations": 9,
  "counts": { "intake_draft": 56, "software_request": 0, "proposal_submission": 0 }
}
```

The checked-in [disposable write proof](evidence/task-567-restore-write-job.yaml) downloaded that same versioned object into an `emptyDir`, verified the report SHA-256, started the exact deployed API image against only that copy, and posted a new intake through the production route. It printed `status: 201`, `before: 56`, `after: 57`, and SHA-256 `ea0e52eccd9a0a25a87e227a0f97fbac51d5134b49109e121bbc6a1cf2ae9efb`. The Job had no live data volume and performed no S3 write; production/dev request data was neither restored over nor written to.

At private main `76cf6eed705c45bedbf7a28cf8b43f724fd8f73a`, Bun 1.4.2 on h2puni ran `failed replacement and rollback reports the retained database and manual move`: 1 pass, 0 fail. Its deliberately injected second/third rename failures stopped replacement and printed `Manual completion while API remains stopped` followed by the exact quoted `mv -- '<retained website.sqlite.before-restore-UUID>' '<website.sqlite>'` command. The separate two-release fleet fixture `rollback re-pins the previous receipt, removes the newest and commits` also passed (1 pass, 0 fail).

The release identity contract is now explicit: `/release.json` is authoritative because the release build writes its exact private/public revisions and `live-checks.ts` compares them with the committed fleet receipt; `/api/health` is deliberately revision-free and proves liveness only. Private PR #54 corrected the deployment contract and rollback runbook before this drill. The earlier one-real-receipt state at fleet `569d99e8` remains the negative control: with only `00000000-placeholder.json` and `20261007-b9f5848bfc70.json`, the reviewed rollback command refuses `no earlier real release`.

TASK-568 then cut real releases through the documented h2puni heavy-lock build, GHCR push and fleet pin path. The first candidate, `20261019-f3dc6fc3f45b`, exposed a genuine rollback defect: the immutable Oct-07 API's startup snapshot runner rejected migration 010 as `Website migration ledger is unsupported`. Fleet `23878b4` restored the candidate without modifying request data. Private PR #55 (green CI; focused h2puni deploy suite 167 pass, 0 fail) now permits only lexically later ledgers whose schema preserves every known object byte-for-byte, retaining exact known-prefix checksums and all non-additive refusals. Private PR #56 recorded the existing same-day monotonic receipt-order contract.

The positive live pair used candidate `20261019-f73bf92bf1ba` and previous release `20261019-f3dc6fc3f45b`; the fleet also retained `20261007-b9f5848bfc70` and the placeholder. Candidate fleet `8ccdc98` reconciled Ready and `/release.json` returned private `f73bf92bf1ba81b37ce66e1f5d2f02233cd652b0`, public `1bde073c2b8fd8e4b84ca9c954c3b1a01a267b93`. The reviewed rollback command committed fleet `0938db7`, fleet-check passed, Flux reconciled Ready, and `/release.json` returned the earlier private `f3dc6fc3f45bdf7c860c14b5d0be86c63e4c96ec` with the same public revision; `/api/health` also returned 200. Finally fleet `5d47d3d` re-pinned the intended `f73bf92bf1ba` release, reconciled Ready, and both authoritative identity and health reads passed. The drill changed only immutable images, receipts and fleet pins; it did not restore over, edit, or submit any live production/dev request data.

The preserved failed Job shows both Oct-12 attempts failed at 15:23/15:24 UTC while checking S3 object existence, with `S3Error`, path-specific keys and `code: "UnknownError"`; Kubernetes recorded no explanatory event. PR #52 improves future diagnostics but cannot recover the missing provider response from those old pods, so the cause remains unknown. Hourly backups are now succeeding and daily verification is green. Using the runbook's seven-day quiet period, the observation window ends after 2026-10-19T15:24Z; no earlier closure is claimed.
