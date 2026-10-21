# Startable WBS leaves vs `origin/main` — 2026-10-21

TASK-567. Read-only reconciliation of the **17 leaves the plan reports as
startable** against the tree. Companion to Claire's
`notes/puni-plan-code-reconciliation-2026-10-17.md` task note, which covered
13 _code_ items and is now stale: `origin/main` has advanced from that pass
through roughly twenty merged PRs.

**Everything below was read at exactly `origin/main` =
`2bec392baf5398e52edf46f8e93dabd89f30e0fe`** ("Merge pull request #605 from
`feat/ansible-gate-host`"). The WBS side was read over SSH against
`/home/puni1/wbs-dev/data/wbs.db` with `bun:sqlite` in readonly mode. **Nothing
was written to the WBS store** — mcp-01 advertises only `authorization_code` and
`refresh_token`, with no `client_credentials` grant
(`apps/wbs/mcp-01/src/http.ts:53`), so Claire has no write path and the digests
in §3 are for Dany to paste.

## 1. How the startable set was derived

Project "PUNI platform plan" (`558ec5c7-f561-4181-9d9b-055b06bc9796`):
217 work items, 199 leaves, 219 dependency edges. A leaf is startable here when
it has no children, no `fact_end`, and every predecessor has a `fact_end`.

|                                           | count  |
| ----------------------------------------- | ------ |
| leaves                                    | 199    |
| open leaves (no `fact_end`)               | 55     |
| **startable (no unfinished predecessor)** | **17** |

## 2. The headline

**None of the 17 is a startable implementation slice.** Every item has exactly
one verdict from TASK-567's fixed set:

| verdict           | count | items                                            |
| ----------------- | ----- | ------------------------------------------------ |
| `done-on-main`    | 5     | 060.03, 060.11, 070.02, 070.03, 080.29.01        |
| `owned-elsewhere` | 4     | 010.4.13.3, 010.5.4, 080.25, 080.39              |
| `needs-dany`      | 4     | 010.3.08, 060.06.5, 060.10, unnumbered interview |
| `blocked`         | 4     | 030.6, 060.05.4, 060.06.2, 080.04                |
| `startable`       | 0     | —                                                |

The §3 pre-start check was applied to every row below before assigning a
verdict. The branch query is global, so one invocation is the complete answer
for all 17; the PR query used `--state all`, then matched each item number,
owning change and known branch family:

- `git ls-remote --heads origin 'refs/heads/task-*'` →
  `task-558-scroll-repro` (`35b5c7af`, unrelated) and this task's own
  `task-567-startable-reconciliation` (`964df767`). No other Claire task branch
  owns an item below.
- `gh pr list --state all --limit 1000` → **618 PRs scanned, 43 open**. The only
  open `task-*` PR is this reconciliation (#619). Item-specific live ownership
  is recorded below; merged and closed PRs were not misreported as active.

The public evidence is pinned to `2bec392baf5398e52edf46f8e93dabd89f30e0fe`.
For the three private-site rows, the owning OpenSpec pair was also read at
private `puni-pr-00` `origin/main` =
`03ece81ca07171dcc6e2294f0362ba63c03b0c69`. In the paths column, `tasks` and
`verify` mean that change's `tasks.md` and `verify.md`; both were read.

| item             | verdict           | owning OpenSpec evidence, tree result and contradiction                                                                                                                                                                                                                                                                                                                                                                                              | all-state ownership result                                       |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 010.3.08         | `needs-dany`      | `read-only-step-board/{tasks,verify}.md`: tasks 3.1–3.2 still say focused acceptance/review/gate are open; `verify.md` says independent review, host gate and exact-head CI remain pending. The Board itself is on main via #274/#286, while the WBS title still asks for Dany's broader design interview.                                                                                                                                           | no live owner PR                                                 |
| 010.4.13.3       | `owned-elsewhere` | `set-step-node-parallelism`, `add-step-node-blocking` and `step-node-attempts` `{tasks,verify}.md` retain later-stage work and exact integration limits.                                                                                                                                                                                                                                                                                             | open #408, #411, #494 plus the wider step-node family            |
| 010.5.4          | `owned-elsewhere` | `organization-ownership-and-access/{tasks,verify}.md` retains activation, invitation, DNS, gateway and MCP work; `verify.md` explicitly says deployment wiring and the rest of 2.5 are not done.                                                                                                                                                                                                                                                     | open #407 and #413; other slices merged/closed                   |
| 030.6            | `blocked`         | `automatic-trusted-activation/tasks.md` has 54 unchecked entries and its `verify.md` says implementation, bootstrap and activation are NOT VERIFIED; the `set-step-node-parallelism/verify.md` receipt separately records Tool Wiki as `inactive`, `certified:false`. The WBS row independently carries `hold=blocked`.                                                                                                                              | #328/#348 merged; no replacement owner PR found                  |
| 060.03           | `done-on-main`    | Public `puni-website-funnel/{tasks,verify}.md` and private `puni-website-prototype/{tasks,verify}.md`: task 1.1 remains unchecked, but private `verify.md` records the site target, static routes, publication scan and portability checks passing. The private tree contains `apps/website/site`; private #35/#40 and the WBS receipt record the dev release. The prototype tasks file itself warns that unchecked boxes are not claims of absence. | private main owns it; no competing public owner PR               |
| 060.05.4         | `blocked`         | `puni-website-funnel/{tasks,verify}.md` section 6.1–6.3 remains unchecked; the WBS row carries `hold=blocked` pending the 30-day Funnel-panel baseline.                                                                                                                                                                                                                                                                                              | no live owner PR                                                 |
| 060.06.2         | `blocked`         | `website-request-retention-lifecycle/{tasks,verify}.md`: 2.2 and 4.1–4.3 remain open; migration 010 exists, but the external activation/head witness and restore drill do not.                                                                                                                                                                                                                                                                       | #292/#318 merged; component PRs closed; no live successor owner  |
| 060.06.5         | `needs-dany`      | `puni-website-funnel/{tasks,verify}.md` 5.1–5.5 remain unchecked. Task 5.1 explicitly requires provider/privacy approval and a dedicated key with a $100/month ceiling; merged #329/#348 covers the guardrails half only.                                                                                                                                                                                                                            | no live owner PR                                                 |
| 060.10           | `needs-dany`      | Public `puni-website-funnel/{tasks,verify}.md` and private `puni-website-prototype/{tasks,verify}.md` leave publication work unchecked while private evidence proves filtered approved-post publication. #338/#348 and private #47/#49 delivered three `approved:false` drafts and the response-time guard; approval and dates remain Dany-only.                                                                                                     | no live implementation owner PR                                  |
| 060.11           | `done-on-main`    | Private `puni-website-prototype/{tasks,verify}.md` leaves 0.1–0.4 unchecked, but `verify.md` records 13 portability tests, bidirectional clean-copy checks and the governed baseline. Public #277/#336 and private main contain the companion and contract. This is a checkbox/tree contradiction.                                                                                                                                                   | private main owns it; no competing owner PR                      |
| 070.02           | `done-on-main`    | `enroll-existing-hosts/{tasks,verify}.md`: #568 proves the named host registration. Tasks 8/8c and six absent operator Secrets block the broader production graph, not the h4claw registration item; the WBS note is stale.                                                                                                                                                                                                                          | no live owner PR                                                 |
| 070.03           | `done-on-main`    | Same pair: #567/#572 prove the named h3mon registration, resize, reboot persistence and service probes. Tasks 8/8c and six operator Secrets remain a separate activation blocker; the WBS note is stale.                                                                                                                                                                                                                                             | no live owner PR                                                 |
| 080.04           | `blocked`         | `log-failure-records/{tasks,verify}.md`: 2.5–2.6 remain open; `verify.md` quotes the 49/900 loss and confirms upstream issue #46970 was still open through collector v0.163.0.                                                                                                                                                                                                                                                                       | #345/#348 merged; no live owner PR                               |
| 080.25           | `owned-elsewhere` | `progress-receipt-authority/{tasks,verify}.md`: all seven tasks remain unchecked and `verify.md` explicitly claims no live authority, publication or activation.                                                                                                                                                                                                                                                                                     | #441 open; #601 merged; #555 closed                              |
| 080.29.01        | `done-on-main`    | `puni-website-funnel/{tasks,verify}.md` task 2.1 is unchecked, while the tree contains the API, contracts, store and paired migrations 001–010; #119/#285 merged them. This is the direct checkbox/tree contradiction.                                                                                                                                                                                                                               | no live owner PR                                                 |
| 080.39           | `owned-elsewhere` | `test-axes/{tasks,verify}.md` keeps parent tasks 2.1, 2.2, 2.2a and 4.1 open; `verify.md` limits the latest evidence to a child slice. This contradicts WBS `readiness=ready`, not the tree's in-flight status.                                                                                                                                                                                                                                      | open #414, #419–#423 and #426; #574 merged only a recovery slice |
| unnumbered D1–D8 | `needs-dany`      | `wbs-team-claims/{tasks,verify}.md` says a real M2M token has no `wbs_groups` and records the credentials-exchange choice as “Decision owed to Dany”. `add-work-item-statuses/{tasks,verify}.md` proves plan document v6 landed, so that half of the WBS note is stale.                                                                                                                                                                              | no live owner PR                                                 |

## 3. Paste-ready WBS-note digests

Each entry below is deliberately self-contained and uses only the fixed verdict
set.

- **010.3.08 — `needs-dany`.** Exact public main `2bec392ba`. The read-only
  Board is merged (#274/#286), but the WBS item asks for the broader R9 design
  interview; `read-only-step-board` also leaves review/gate close-out 3.1–3.2
  open. Dany must decide the richer status/write-policy scope before dispatch.
- **010.4.13.3 — `owned-elsewhere`.** Exact public main `2bec392ba`. The
  step-node changes retain later stages, with live PRs #408, #411 and #494 plus
  their branch family. Do not dispatch a duplicate lane.
- **010.5.4 — `owned-elsewhere`.** Exact public main `2bec392ba`.
  `organization-ownership-and-access` still owns activation, invitations, DNS,
  gateway and MCP work; #407 and #413 are open. Do not dispatch a duplicate.
- **030.6 — `blocked`.** Exact public main `2bec392ba`. The WBS row says
  `hold=blocked`; `automatic-trusted-activation` has 54 open tasks and its
  verification says implementation, bootstrap and activation are NOT VERIFIED.
  The `set-step-node-parallelism` receipt separately records Tool Wiki as
  `inactive`, `certified:false`.
- **060.03 — `done-on-main`.** Exact public main `2bec392ba`; exact private
  main `03ece81ca`. The private tree contains the governed Astro/Novaform site,
  static-route/publication checks and portability proof; private #35/#40 record
  the dev release. The unchecked roadmap box is stale, not absent code.
- **060.05.4 — `blocked`.** Exact public main `2bec392ba`. Funnel tasks
  6.1–6.3 remain open and the WBS row says `hold=blocked` pending the 30-day
  Funnel-panel baseline.
- **060.06.2 — `blocked`.** Exact public main `2bec392ba`. Migration 010 is
  merged, but retention tasks 2.2 and 4.1–4.3 still require the external
  activation/head witness and a successful restore drill.
- **060.06.5 — `needs-dany`.** Exact public main `2bec392ba`. Guardrails,
  caps, pause/resume, alerts and the panel are merged (#329/#348). Remaining
  task 5.1 needs provider/privacy approval and a dedicated $100/month key before
  5.2–5.5 can proceed.
- **060.10 — `needs-dany`.** Exact public main `2bec392ba`; exact private
  main `03ece81ca`. Three evidence-backed drafts and the no-false-SLA guard
  landed (#338/#348; private #47/#49), but each draft still needs approval and
  a publication date.
- **060.11 — `done-on-main`.** Exact public main `2bec392ba`; exact private
  main `03ece81ca`. The private companion, governed baseline, 13 portability
  tests and bidirectional clean-copy proof are present (#277/#336). Roadmap
  tasks 0.1–0.4 remain unchecked despite the verified tree.
- **070.02 — `done-on-main` with stale note.** Exact public main
  `2bec392ba`. PR #568 proves h4claw is k3s Ready and
  `localhost:3000` returns 200. Tick this host-registration item to release
  successors; separately track tasks 8/8c and the six operator Secrets that
  block production observability activation.
- **070.03 — `done-on-main` with stale note.** Exact public main
  `2bec392ba`. PRs #567/#572 prove h3mon registration, 15,602 MiB, reboot
  persistence and six service probes. Tick this host-registration item; the
  same separate tasks 8/8c and six operator Secrets still block activation.
- **080.04 — `blocked`.** Exact public main `2bec392ba`. The immediate alert
  is merged (#345/#348), but 2.5–2.6 remain open: the live pipeline depends on
  070.07/070.08 and upstream issue #46970 still lacks the timeout-retry fix.
- **080.25 — `owned-elsewhere`.** Exact public main `2bec392ba`. All seven
  `progress-receipt-authority` tasks remain open; #441 is the live owner and
  issuer/custody/policy/rotation/publication choices still need owner approval.
- **080.29.01 — `done-on-main`.** Exact public main `2bec392ba`. The API,
  contracts, SQLite store and paired migrations 001–010 exist and were merged
  through #119/#285. Funnel task 2.1 is an unchecked checkbox/tree
  contradiction; do not rebuild it.
- **080.39 — `owned-elsewhere`.** Exact public main `2bec392ba`. WBS says
  `readiness=ready`, but parent test-axes tasks 2.1/2.2/2.2a/4.1 remain open;
  #414, #419–#423 and #426 are live, while #574 merged only a recovery slice.
- **Unnumbered D1–D8 — `needs-dany`.** Exact public main `2bec392ba`. Plan
  document v6 is already merged, but a real Auth0 M2M token has no
  `wbs_groups`; `wbs-team-claims/verify.md` records the credentials-exchange
  choice as “Decision owed to Dany”.

## 4. Detailed evidence

### 080.29.01 — BE: request contracts, store and reversible migrations

**`done-on-main`. The checkbox is wrong, and this is the contradiction the
coordination contract §3 warns about.**

`puni-website-funnel/tasks.md` leaves **2.1 unchecked**, and 2.1 reads "Create
`apps/website/be-01`, `libs/website/domain/contracts`, and
`libs/website/adapters/store-sqlite` … Ship additive `migration.sql` beside
`down.sql`". At the pinned sha the tree contains all three:

```
apps/website/            -> be-01  fe-01
libs/website/            -> adapters  domain
libs/website/domain/     -> contracts
libs/website/adapters/store-sqlite/src/migrations/
  001_initial 002_m2 003_account_submission 004_request_scope
  005_chat_operation 006_retention_subject 007_conversation
  008_refusal 009_guardrails 010_retention_journal
```

Pairing verified by spot check — `001_initial`, `009_guardrails` and
`010_retention_journal` each hold both `migration.sql` and `down.sql`. The
item's own WBS note already said so ("merged by #119/#285 … paired 001-009
SQL"); the tree is now one migration further along at **010**.

> **Digest for the WBS note:** 2026-10-21, exact main `2bec392ba`. Implemented
> and merged. `apps/website/be-01`, `libs/website/domain/contracts` and
> `libs/website/adapters/store-sqlite` all exist; migrations run 001–010, each
> with paired `migration.sql` + `down.sql`, one beyond the 001–009 recorded on
> 2026-10-08. `puni-website-funnel/tasks.md` task 2.1 is still unchecked and
> disagrees with the tree — do not dispatch an implementation for this item.

### 070.02 — Register h4claw as the k3s server · 070.03 — Register h3mon as the observability node

**`done-on-main` for the two named host-registration items, with a separate
production-activation blocker.**

What Claire's own tasks proved: TASK-564 closed with PR #568 merged, exact-head
CI green, k3s **Ready** and `localhost:3000` returning 200. TASK-565 closed with
PRs #567 and #572 merged, h3mon resized to 15,602 MiB, reboot persistence and
the six service probes passing (VictoriaMetrics/Logs/Traces, Grafana, MLflow,
OTel listener), and private-port exposure checked from h2puni.

What is still open, read at the pinned sha in
`openspec/changes/enroll-existing-hosts/tasks.md`:

```
- [ ] 8.  Real hosts: run the runbook after Dany authorizes it; record results here.
- [ ] 8c. Join tokens into the controller vars, `join.yml` on h3mon twice,
          validation, final
```

And `verify.md` ends on the hard prerequisite:

> "The production observability graph was not activated. Flux reported
> `platform=False` (`HealthCheckFailed`) and `observability=False`
> (`DependencyNotReady`), with the registry Pod Pending. Each externally
> provided Secret documented by the runbook was absent:
> `observability/{alertmanager-puni,elastic-s3-credentials}`,
> `puni-backup/{velero-credentials,velero-repo-credentials}`, and
> `puni-registry/{registry-auth,registry-ca}`. The memory prerequisite is now
> satisfied, but these operator-owned credentials remain a separate hard
> prerequisite."

So the memory blocker that held 070.03 for weeks is genuinely gone, and the
host-level facts are proven — but six operator-owned Secrets are missing and
step 8c never ran. No lane can clear that.

> **Digest for the WBS note (both items):** 2026-10-21, exact main
> `2bec392ba`. Host-level work done and merged: h4claw k3s Ready with
> `localhost:3000` → 200 (PR #568); h3mon registered, resized to 15,602 MiB,
> reboot persistence and six service probes green (PRs #567, #572). The earlier
> Elastic-headroom blocker is falsified and closed. **Still open:**
> `enroll-existing-hosts` tasks 8 and 8c — join tokens into controller vars,
> `join.yml` on h3mon twice, validation and final two-host preflight. Production
> observability is **not** activated: Flux `platform=False`,
> `observability=False`, registry Pod Pending, and six operator-provided Secrets
> absent (`alertmanager-puni`, `elastic-s3-credentials`, `velero-credentials`,
> `velero-repo-credentials`, `registry-auth`, `registry-ca`). These need Dany,
> not a lane.

### 060.06.5 — AI operations: budget, abuse and unresolved-usage dashboard

**`needs-dany`, and the gate is a paid credential.**

The guardrails half is merged — the item's note records #281/#285 (caps,
pause/resume, alerts, `guardrails-panel.tsx`, `guardrail-store.ts`) and #329 via
#348 (`21a6bd537`, "In flight now"). What remains is `puni-website-funnel`
section 5, open at the pinned sha as **5.1 through 5.5**, and 5.1 gates the
rest: "vet one current OpenRouter model/provider for price, ZDR,
data-collection denial and required parameters, and **provision a dedicated key
with a $100/month ceiling**."

Per the 2026-10-12 receipt the per-visitor/reconciliation counters were taken
**out by decision**, so the only remaining non-code acceptance is choosing and
subscribing the alert receiver plus one pause/resume delivery check.

> **Digest:** 2026-10-21, exact main `2bec392ba`. Guardrails, caps,
> pause/resume, alerts and the Guardrails panel are merged. Remaining scope is
> funnel tasks 5.1–5.5, and 5.1 requires a vetted OpenRouter model plus a
> dedicated key with a $100/month ceiling — an owner decision with a cost, so
> 5.2–5.5 cannot be proven before it. Separately, the alert receiver still needs
> choosing and one pause/resume delivery verifying; per-visitor and
> reconciliation counters remain out by the 2026-10-12 decision.

### 060.06.2 — Retention stage 2+

**`blocked` on the external witness authority; stage-2 schema has landed.**

`website-request-retention-lifecycle` open items at the pinned sha are 2.2, 4.1,
4.2 and 4.3. Task 2.2 requires a "private release/restore preflight against the
external activation/head witness before enabling any journal event" — the
protected external authority recorded as blocking on 2026-10-17 and unchanged.
Evidence that the schema side moved anyway: migration **010_retention_journal**
now exists with its `down.sql`.

> **Digest:** 2026-10-21, exact main `2bec392ba`. The stage-2 journal migration
> (`010_retention_journal`, paired with `down.sql`) is merged. Open: 2.2, 4.1,
> 4.2, 4.3. Task 2.2 is gated on the protected external activation/head witness,
> which does not exist yet, so no journal event can be enabled and the backup
> aging in 4.2 cannot start until the restore drill passes. Unchanged from
> 2026-10-17.

### 080.04 — Failure reports: lossless Elasticsearch outage

**`blocked` upstream, unchanged.** `log-failure-records` open items are 2.5
("Real-pipeline acceptance on the production platform, gated on WBS 070.07 and
070.08") and 2.6, which names the upstream dependency: the exporter does not
retry `context.DeadlineExceeded`, the first k3d drill lost 49 of 900 lines, and
upstream issue #46970 is open.

> **Digest:** 2026-10-21, exact main `2bec392ba`. Unchanged. 2.6 waits on an
> upstream collector-contrib release containing the timeout retry (issue
> #46970); 2.5 is gated on WBS 070.07/070.08. The immediate-alert packet
> (#360, `a4b1a24f`, task 2.7) remains the merged part.

### 010.4.13.3 · 010.5.4 · 080.25 · 080.39 — `owned-elsewhere`

Each has live other-fleet branches at the pinned sha; dispatching any of them
would duplicate work in flight.

| item                                  | owning change                                                               | open there | other fleet's open PRs |
| ------------------------------------- | --------------------------------------------------------------------------- | ---------- | ---------------------- |
| 010.4.13.3 step nodes, later stages   | `set-step-node-parallelism`, `add-step-node-blocking`, `step-node-attempts` | —          | #408, #411, #494       |
| 010.5.4 organisations, roles, invites | `organization-ownership-and-access`                                         | 22         | #407, #413             |
| 080.25 Twilight Navigator             | `progress-receipt-authority`                                                | 7 of 7     | #441                   |
| 080.39 scenario/coverage ledgers      | `test-axes`                                                                 | 17         | #414, #419–#423, #426  |

080.39's WBS `readiness` is literally `ready`, which is how this one would trap
a fleet reading the plan alone. 080.25 additionally needs Dany: the adopted
`progress-receipt-authority` design leaves issuer scope, custody/invocation,
protected policy selection, rotation/revocation, accepted-plan
publisher/freshness and publication/replay to the owner — six decisions, zero of
seven tasks checked.

### 030.6 · 060.05.4 — `blocked` by their own hold

Both carry `hold=blocked` in the plan. 030.6 maps to
`automatic-trusted-activation`, which has **54 open tasks** and whose
trusted-wiki CI step is still `if:false` — ordinary green CI does not prove
independent trusted activation. 060.05.4 is funnel section 6 (safe interactive
concept renderer), whose 6.1–6.3 are open and which the 2026-10-11 decision
defers until a 30-day Funnel-panel baseline.

### 010.3.08 and the unnumbered interview item — `needs-dany`

010.3.08 is titled "Design interview on the board, shared with the step status
interview R9 (needs Dany)" and maps to `read-only-step-board`, whose only open
items are 3.1 and 3.2 — a focused suite run and a gate/CI/merge step, i.e. the
already-shipped read-only Board's close-out, not the broader interview. The
unnumbered item is the 2026-10-19 D1–D8 interview record asking to verify the
Auth0 M2M groups claim and plan document v6.

### 060.03 and 060.11 — `done-on-main`; 060.10 — `needs-dany`

All three use private `puni-pr-00` evidence at exact main `03ece81ca`. The
Astro/Novaform site and the companion/portability contract are verified in the
private tree despite stale unchecked roadmap boxes, so 060.03 and 060.11 are
`done-on-main`. The launch-copy implementation and false-SLA guard are also
landed, but draft approval and publication dates are owner decisions, so 060.10
is `needs-dany`.

## 5. What this changes

1. **The plan's startable count is not actionable.** 17 reported, 0 real. A
   fleet that trusts `readiness` or the dependency graph alone will either
   rebuild merged code (080.29.01, 080.39) or stall on an owner decision it
   cannot see.
2. **Two items are ready to tick with one caveat each** (070.02, 070.03) — and
   ticking them releases their successors, which is the cheapest unblocking
   available right now.
3. **The six missing operator Secrets are the single highest-leverage blocker**
   in this set: they hold the entire production observability activation, which
   070.02/070.03 both feed.
4. **No new queue task was filed for implementation**, per TASK-567 AC #6,
   because nothing came back `startable`.
