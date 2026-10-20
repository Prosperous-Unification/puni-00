# PUNI platform plan — readout and pickup assessment

2026-10-17. Dany: _"Please pick up the work planned for PUNI-00 using the WBS
project Puni platform."_

## Where the plan lives

WBS project **"PUNI platform plan"**, id `558ec5c7-f561-4181-9d9b-055b06bc9796`,
revision 12, start 2026-09-19, owner `190c5947-…`.

Read read-only from the **dev** store on h2puni:
`/home/claw/puni1/wbs-dev/data/wbs.db` → actually
`/home/claw/… ssh h2puni:/home/puni1/wbs-dev/data/wbs.db` (860 MB, live).
Prod's `/home/puni1/wbs/data/wbs.db` is 36 KB and last written 2026-08-24 —
**prod holds no plan data; dev is the source of truth.**

No sqlite3 binary on h2puni; queried through `bun:sqlite` in readonly mode with
throwaway scripts in `/tmp`. Steps are `plan` / `impl` / `review`, unit
workdays.

## State

- 211 work items · **155 leaves fully done** · **39 leaves open** · 215 dependencies
- step_progress tally: 495 done, 42 in_progress

### Open leaves with no unfinished predecessor and no hold (13)

| path        | est  | item                                                                |
| ----------- | ---- | ------------------------------------------------------------------- |
| 2.20.80     | 1    | Design interview on the board (**marked "needs Dany"**)             |
| 2.30.110.30 | 21   | Step nodes: later stages from the design memo                       |
| 2.40.20     | 13   | Organisations, roles and invites; projects owned by an org          |
| 40.60.7     | –    | Retention stage 2+: remote journal, designation, holds, erasure     |
| 40.60.20    | 2.75 | Deployment contract, secrets and recovery proofs (WF22/M1)          |
| 40.60.30    | 2.25 | AI operations: budget, abuse, unresolved-usage dashboard (WF23/M2)  |
| 40.90       | 1.75 | Discovery: blog SEO, feed, article-to-request links (WF03/M1)       |
| 40.100      | 1.5  | Launch copy: service offer, proof, editorial drafts (WF04/M1)       |
| 50.10       | 2    | Register h4claw as the k3s server                                   |
| 50.20       | 2    | Register h3mon as the observability node                            |
| 60.40       | –    | Failure reports: lossless Elasticsearch outage                      |
| 60.250      | –    | Twilight Navigator: plan reference and receipt-to-commands          |
| 60.390      | –    | Scenario allocation and coverage ledgers beyond the test-axes pilot |

Blocked-by-hold with clear predecessors: 10.50 (package-backed trusted
activation), 40.50.40 (FE safe interactive concept renderer).

The whole of root 50 (infra) serialises behind **50.50** (k3s install + Flux +
SOPS), which itself waits on 50.40 (Ansible), which waits on 50.10 + 50.20.
So the infra chain's only true entry points are **50.10 and 50.20**.

### Repo mapping — the thing that is easy to get wrong

Root 40 reads like website work in another repo. It is not: every 40.x note
says _"Plan: openspec/changes/puni-website-funnel/ (puni-00 branch
feat/puni-website-funnel). Original private theme stays only in
puni-pr-00/apps/website/site."_ So the **code is puni-00**; only the licensed
Novaform theme is private.

But inside `openspec/changes/puni-website-funnel/tasks.md` on `origin/main`:

- Section 0 (repo foundation): 0.1–0.4 all **done**
- Section 1 (public site source/content): 1.1–1.4 open, and all four live in
  **private `puni-pr-00/apps/website/site`** — so WBS 40.90 (WF03) and 40.100
  (WF04) map to tasks 1.3 and 1.2, which are _not_ puni-00 code
- Section 2 (`apps/website/be-01`, `libs/website/*`): 2.1–2.4 all open — this
  **is** puni-00 code
- Section 3: 3.3, 3.4 done; 3.1, 3.2, 3.5 open
- Section 4 (ops for dev/manual launch): 4.1–4.4 all open; several gated on
  operator provisioning ("paid calls disabled until operator provision",
  "notification destinations chosen before activation")

## Why I did not file anything — the blocker

**puni-00 is under active development by a different execution system, right
now.** Evidence:

- 20+ open PRs, newest `#566 ui-review/integration-5` updated 2026-10-17 10:40Z
- `origin/main` at `53dfef620` (PR #565 `integrate/reviewed-sol-oct17`), merged
  ~3 hours before this readout
- Last 8 commits on main all authored by Dany's account, within 6 hours
- Branch names show a wave/batch coordinator: `integration/wbs-wave12-sol-20261016`,
  `batch-10/website-funnel-counts`, `ui-review/*`
- WBS notes corroborate it: "batch 10 lane navigator-080-20", "Astra approved
  the 4.1b.1 design", "Coordinator update", "Sol's affected suite passed"

**That system is not this gateway.** `openclaw automations list` here has
exactly one execution lane — `queue-worker-a`, every 30 days, last run 26 days
ago — and `bin/queue-report.mjs --full` reports every lane idle with a single
queued task (TASK-563, p4). Claire's queue is drained; it is not what produced
today's PRs.

So filing these WBS items into Claire's queue would put two independent
coordinators on the same openspec slices in the same repo, which produces
conflicting PRs on the same branches. That is the one failure mode worth
stopping for.

A second, softer warning sits in 2.40.20's own notes, dated 2026-10-01:
_"Sol medium broader ready-work scan: no other PUNI-00 implementation slice is
ready under an adopted design without pending user/operator input."_ Two weeks
stale, but it says the ready-work question was already asked and answered
negatively by the other fleet.

## The decision Dany owns

Which coordinator owns puni-00 execution:

1. **The other fleet keeps puni-00; Claire stays off it.** Then Claire's useful
   contribution is the two infra entry points (50.10 h4claw k3s server, 50.20
   h3mon observability node) — host work, not repo work, no PR collision — plus
   this kind of plan readout.
2. **Claire takes a carved-out slice** with an explicit branch prefix the other
   fleet will not touch. Smallest clean candidate: **section 2** of the funnel
   change (`apps/website/be-01` + `libs/website/{domain/contracts,adapters/store-sqlite}`),
   2.1→2.4, because section 1 is private-repo work and section 4 is
   operator-gated. ~4 slices, each independently testable.
3. **Claire takes over puni-00 execution entirely** and the other fleet stands
   down. Cleanest long-term, biggest switch-over cost.

Recommendation: **option 1 plus 50.10/50.20 now**, because it delivers
immediately with zero collision risk, and option 2 only once the other fleet's
branch namespace is written down somewhere both can read.

## Reproducing the readout

Scripts were throwaway. The pattern:

```
ssh h2puni 'cat > /tmp/q.ts && /usr/local/bin/bun /tmp/q.ts /home/puni1/wbs-dev/data/wbs.db' < local.ts
```

with `new Database(path, { readonly: true })`. Tables that matter: `project`,
`work_item` (`parent_id`, `position`, `hold`, `fact_end`), `step`,
`step_progress` (`state`), `estimate` (`optimistic`/`realistic`/`pessimistic`,
**not** `value`), `dependency` (`predecessor_id`/`successor_id`).
