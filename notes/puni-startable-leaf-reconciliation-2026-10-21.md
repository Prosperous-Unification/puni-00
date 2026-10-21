# Startable WBS leaves vs `origin/main` — 2026-10-21

TASK-567. Read-only reconciliation of the **17 leaves the plan reports as
startable** against the tree. Companion to
`notes/puni-plan-code-reconciliation-2026-10-17.md`, which covered 13 _code_
items and is now stale: `origin/main` has advanced from that pass through
roughly twenty merged PRs.

**Everything below was read at exactly `origin/main` =
`2bec392baf5398e52edf46f8e93dabd89f30e0fe`** ("Merge pull request #605 from
`feat/ansible-gate-host`"). The WBS side was read read-only over SSH against
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

**None of the 17 is a startable implementation slice.** Every one resolves to
already-merged work, another fleet's open branch, an owner decision, or a hold.
The verdicts:

| verdict                                           | count | items                                                             |
| ------------------------------------------------- | ----- | ----------------------------------------------------------------- |
| `done-on-main`, checkbox stale                    | 1     | 080.29.01                                                         |
| `partially-done`, blocked on operator credentials | 2     | 070.02, 070.03                                                    |
| `owned-elsewhere` (other fleet branches open)     | 4     | 010.4.13.3, 010.5.4, 080.25, 080.39                               |
| `needs-dany`                                      | 5     | 010.3.08, 060.06.5, 060.10, 060.11, the unnumbered interview item |
| `blocked` (hold or upstream)                      | 4     | 030.6, 060.05.4, 060.06.2, 080.04                                 |
| out of this repo (private `puni-pr-00`)           | 1     | 060.03                                                            |
| **genuinely `startable`**                         | **0** | —                                                                 |

The §3 pre-start check was run once for the whole set rather than per item,
because its two queries are global:

- `git ls-remote --heads origin 'refs/heads/task-*'` → one ref only,
  `task-558-scroll-repro` (`35b5c7af`, unmerged, deliberately preserved). No
  Claire lane holds any item below.
- `gh pr list --state open` → **42 open PRs, none in the `task-*` namespace.**
  Every one carries another fleet's prefix (`feat/*`, `batch-10/*`,
  `integration/*`, `ui-review/*`, `plan/*`, `docs/*`, `fix/*`, `followup/*`).

## 3. Per-item verdicts and paste-ready digests

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

**`partially-done`, then blocked on operator-owned credentials. Correcting an
overstatement I made earlier today: these are _not_ simply done.**

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

| item                                  | owning change                                                               | open there | other fleet's open PRs                                     |
| ------------------------------------- | --------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| 010.4.13.3 step nodes, later stages   | `set-step-node-parallelism`, `add-step-node-blocking`, `step-node-attempts` | —          | #407, #408, #411, #416, #418, #424, #433, #436, #439, #443 |
| 010.5.4 organisations, roles, invites | `organization-ownership-and-access`                                         | 22         | #407, #413, #476                                           |
| 080.25 Twilight Navigator             | `progress-receipt-authority`                                                | 7 of 7     | #441, #601                                                 |
| 080.39 scenario/coverage ledgers      | `test-axes`                                                                 | 17         | #419–#423, #426; #574 merged as `3d00159d`                 |

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

### 060.03 · 060.10 · 060.11 — outside this repo

All three live in private `puni-pr-00/apps/website/site` (Astro/Novaform site,
launch copy, private companion and portability contract). Editorial approval,
publication dates and the `puni.dev` cutover are owner decisions; the public
repo carries only the runbook and live-check side via #348.

## 4. What this changes

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
