# PUNI entities delivery handoff

PR #917 is open and awaiting the required `gate` and `pixels` checks.
The delivery goal is to merge the WBS entity and catalogue work and the
existing PUNI CLI integration. Broader CLI and client-script inventory work
is deferred. The approved catalogue design uses a stopped-service window.
Live migration and deployment remain outside delivery.

## Current checkpoint

- Published head `46a9b35fd56c90541ca7f6a71fc4c0cb9ef0c6c2` on
  `feat/puni-entities-cli`. Verify the live PR head if it has advanced.
- Current hosted CI run
  [45027102609](https://github.com/Prosperous-Unification/puni-00/actions/runs/45027102609).
- Authoritative working checkout
  `/tmp/puni-combined-proposal-v1/fixture-check-09a`
  on branch `proposal/puni-fixture-repairs-09a`. The checkout under
  `/home/df/wd/puni/puni-00` holds unrelated work. Preserve it.
- At the published head, 530 focused SQLite tests passed across the follow-up
  commits. The production blockage regression and all 35 activation and
  blockage cases passed. Devsync passed its uncached Nx lint and three
  native checkout cases after the workspace lint repair.
- The previous run
  [45023017951](https://github.com/Prosperous-Unification/puni-00/actions/runs/45023017951)
  recorded 564 SQLite failures. Published fixes cover suites that accounted
  for 402 of them in that run, leaving 162 recorded results across 55
  untouched suites as a triage list. The partial backend and Twilight
  artifacts also recorded failures before the push superseded those jobs.
- The exact previous failure lists are in
  `/tmp/puni-33ed-sqlite-failure-owners.json`,
  `/tmp/puni-33ed-backend-failure-owners.json`, and
  `/tmp/puni-33ed-twilight-failure-owners.json`. Matching readable logs are
  next to the JSON files. Remote Source failed when its single 310-second
  watchdog covered both child cases. The unchanged wrapper passed locally
  in 254 seconds. Preserve the per-case native evidence when verifying any
  wrapper repair.
- Use Nx affected selection and focused owner tests for local iterations.
  The hosted PR checks validate the exact source that will merge. Keep the
  normal hooks enabled and publish only reviewed and locally verified fixes.
  Merge only when both required checks pass at the exact PR head.

The sections below record the earlier paused checkout. Use their evidence
paths and background as historical context.

## Earlier checkpoint locations

- PR: <https://github.com/Prosperous-Unification/puni-00/pull/917>.
- Local delivery checkout: `/tmp/puni-combined-proposal-v1/tree`.
- Local branch: `proposal/puni-entities-integrated-v1`.
- Published branch: `feat/puni-entities-cli`.
- GitHub remote: `git@github.com:Prosperous-Unification/puni-00.git`.
- Last published commit before this WIP checkpoint:
  `06b653337eaa41047e73d861d4eaddf58712e82f`.
- Integrated main: `4142dcdc06c90c7329b92892e27c2b88bea87405`.
- Session/goal thread: `01a1bf46-5f02-7180-9334-2c9fdf85c37e`.

The commit containing this document supersedes that last published commit. Read
the actual PR head before continuing. `origin` in the delivery checkout points at
the protected local clone `/tmp/puni-step-source-git-isolation-v1`, not GitHub.
Use the explicit GitHub remote for publishing; do not reconfigure or force-push
the protected clone.

`/home/df/wd/puni/puni-00` contains unrelated website work. Preserve its HEAD,
index and changes. Six original inventories contain 21,635 records; protected
command wrappers check them before and after each command. Do not reset, clean,
rebaseline or modify the original snapshot inventories or historical captures.

## What this checkpoint contains

The published frontend checkpoint has the current entity/CLI changes and the
reviewed rendering repairs: `puni navigator` (`nav`, `n`), `puni burokrat` (`bur`,
`b`), and `puni dash` (`d`). See the existing
[catalogue verification record](../openspec/changes/wbs-step-catalogue/verify.md)
for earlier delivery fixes and the 500-row rendering fixture.

The additional WIP changes are:

- Move 21 shared catalogue support files from core `src/module/step-catalogue`
  to `src/step-catalogue`, updating 16 callers and 83 import/export specifiers.
  These helpers borrow existing source lifetimes; they do not form another sealed
  DI module. No fake module, wiki pilot or unsealed exception was added. Existing
  lint sorting subsequently moves exports within the two existing barrel groups
  and sorts three service import lists. Export membership and behavior statements
  remain unchanged.
- Preserve the original `slice-leveling-v4` identity and `f0145c81759486b5` digest.
  A genuine historical plain1 corpus is validated and projected forward through
  the production reader on the expected side. Raw current outputs are compared
  completely; they are not normalized or re-pinned. Details are in
  [work-package verification](../openspec/changes/wbs-work-packages/verify.md).
- Repair current Devsync inventories: two feature classifications, exact provider
  importer lists, four required static edges with exact owning files, and the
  independent ESLint activation/recovery rosters. Production import policy is
  unchanged. The live namespace corpus now records 332 reviewed contexts; all
  historical inventories retain their original identities.
- Give the Devsync CI heavy leaf the existing Twilight executable-specific
  AppArmor profile and runner-account namespace probe. No host-wide restriction
  is disabled. Actual hosted provisioning still needs the new CI run.
- Run each of the 28 job-control scenarios in a fresh Bun worker. The shared
  parent must retain subreaper flag zero, and every worker must return zero and a
  matching witness after its native assertions and cleanup. The native fixture
  uses two real 1 GiB disk units; its previous 16 GiB calibration budget could not
  be admitted on a filesystem with about 13.9 GB free. Production admission and
  all deadlines remain unchanged.
- Isolate only system/global Git configuration in owned document fixtures,
  preserving explicit configuration-count inputs and the production filter
  refusal. The direct synchronous check restores both keys, including absence
  and empty values.
- Complete the copied MCP fixture with its actual `step-fact` dependency and the
  repository's earliest pre-grant migration directory. The fixture commits that
  release inventory before either immutable revision is admitted. SQL is never
  executed, and the production migration-admission guard is unchanged.

## Verification at pause

These are scoped results, not a passing final repository gate:

| Check                                                | Observed result                                         |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Final rendering fault owner                          | 23 passed                                               |
| Full 500-row/five-step Board case                    | Passed; 2,500 cards, original deadline and full PNG     |
| Published `06b6533` browser CI                       | All eight shards and aggregate passed                   |
| Historical schedule/rename/weighted/elsewhere owners | 59 passed; domain Nx typecheck passed                   |
| Core and both storage adapter typecheck targets      | Four required tasks passed, uncached                    |
| Core boundary and relocated usage owners             | 65 passed                                               |
| Relocated directory's own tsconfig                   | Passed explicitly                                       |
| Memory catalogue conformance after export sorting    | 81 passed; 2,678 assertions                             |
| Final relocation/guard scoped lint                   | 41 files passed with zero warnings                      |
| Module labels and service kinds                      | 23 passed                                               |
| Job-control plus independent parent-isolation case   | 29 passed; all 28 native captures and cleanup verified  |
| Gated observations                                   | 16 passed with real namespaces and original deadlines   |
| Documents CLI under disposable global/system filters | 18 passed                                               |
| Actual docs-target owner                             | All six cases passed                                    |
| MCP document-sync owner                              | 18 passed                                               |
| CI toolchain owner with pinned Node PATH             | 37 passed                                               |
| Independent working-filter owner                     | 18 passed                                               |
| Final uncached workspace graph owner                 | 18 passed; five real faults each refused and restored   |
| Current namespace corpus                             | Passed; an unrelated injected legacy root still refused |
| Full Devsync target                                  | Interrupted for user pause; no pass or complete result  |

The interrupted target was `delivery-full-devsync-owner-v404`, started with
`nx run tool-devsync:test --skip-nx-cache`. The verified owned launcher received
SIGTERM on pause. Its existing supervisor recorded exit 130, `originalObserved:
true`, settled/reaped ownership, closed descriptors and no cleanup failures.
This is cancellation evidence, not test success. No local test actor remains.
All subagents are idle. Do not resume a stale process/session handle.

An earlier combined lint/working-filter run had one environment-only failure:
direct `tsc` could not find Node on the sparse wrapper PATH. The entire toolchain
owner subsequently passed with the existing Node 24.20.0 directory on PATH.
The original eight failed calibration captures, failed corpus pins and intermediate
graph/MCP failures remain preserved; do not overwrite them or treat them as the
final healthy observations.

## CI and remaining work

At the last pre-pause read, PR #917 was open, mergeable and blocked. The published
`06b6533` CI run was `45004146162`; its infra run was `45004146173`.
These observations will become stale after this WIP push. Read the new head and
its actual checks rather than transferring old CI credit.

The last completed failures were:

| Job                                     | Job ID       |
| --------------------------------------- | ------------ |
| fleet-check                             | 137151943967 |
| gate workspace                          | 137152068725 |
| gate workspace-heavy (tool-devsync)     | 137152068781 |
| gate workspace-heavy (wbs-store-sqlite) | 137152068777 |
| gate remote                             | 137152068756 |
| gate frontend                           | 137152068732 |

Backend `137152068746` and Twilight `137152068752` were still running.
The core, fleet heavy leaf, all seven remote isolated leaves and browser checks
had passed. Do not infer that the WIP fixes cover every failed job.

After an explicit resume:

1. Read `LLM_README.md` and the applicable `AGENTS.md`. Verify the actual checkout,
   PR head and clean/dirty state before using this handoff.
2. Rerun the complete Devsync target; its previous run was cancelled. Use the
   existing Bun/Nx target and original timeouts, with the installed Node directory
   on PATH. Do not weaken guards, add skips or increase deadlines.
3. Triage the completed workspace, SQLite, remote, frontend and infra failures
   against the actual new CI head. A SQLite log was downloaded before pause;
   frontend failure counts were not inspected. The attempted frontend log file
   is empty because that installed `gh` rejected `--allow-escape-sequences`.
   Use the supported raw `gh api repos/.../actions/jobs/<id>/logs` endpoint or
   inspect current CLI help; do not treat the empty file as a product log.
4. Complete the required PR checks and update the verification records. Follow
   [release validation](runbook-release-validation.md) for product releases.
   Use the canonical host launcher for repository-wide validation, as described
   in [gate hosts](infra/gate-hosts.md).
5. Push reviewed repairs through normal hooks and merge only after the required
   evidence is complete. No live migration/deployment is part of this pause or
   handoff. Regroup the broader CLI/client-script goal after this delivery scope.

## Local evidence locations

Most detailed evidence is private under `/tmp`; the code and this document are
the recoverable published checkpoint. Important local handoffs are:

- `/tmp/puni-combined-proposal-v1/control/` — protected command receipts/logs.
- `/tmp/puni-pixel-rendering-final-v365.json` — final rendering sources and proofs.
- `/tmp/puni-schedule-identity-candidate-v1/installed-handoff.json` — applied v4 repair.
- `/tmp/puni-step-catalogue-support-mbyKWjuf/evidence.json` — original relocation
  and resolution proof, before lint-required import/export sorting.
- `/tmp/puni-job-control-native-29-budget2.egxNJqDj/final-handoff.json` and
  `roster.json` — corrected native run; the first failed run is retained separately.
- `/tmp/puni-gated-observation-native-16.hMe1Mh53/roster.json` — 16 real cases.
- `/tmp/puni-mcp-document-admission-candidate-v1/owner.receipt.json` — 18 MCP cases.
- `/tmp/puni-astra-static-importer-matrix-jaypo105/restoration.json` — graph fault proofs.
- `/tmp/current-06b-ci-triage-v396/sqlite-job-137152068777.raw.log` — untriaged
  completed SQLite failure log.
- `/tmp/puni-combined-snapshot-trees-v1/report.json` — original preservation inventory.

The normal hooks previously used
`PUNI_EXECUTABLE=/tmp/puni-source-test-levels-IlsrGE/installation/consumer/node_modules/puni/dist/puni.mjs`.
If that selection is unavailable, provision the required tool through its existing
installation workflow; do not bypass hooks or invent a replacement identity.
