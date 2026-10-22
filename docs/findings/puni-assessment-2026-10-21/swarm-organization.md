# Agent swarm organization assessment

Assessed **2026-10-22** against the [Agent swarm organization](../../../puni-assessment.md#agent-swarm-organization)
criterion added to the scope that day, at checkout `d43f4176a18ff32b22161f478eb02e62ae328667`,
as a rerun of the [2026-10-21 assessment](report.md). It combines a read-only source
inventory of this repository, dated documents in the private plan repository cited by
path, and the fresh GitHub and host reads in [live evidence](live-evidence.md#rerun-refresh--2026-10-22).
Nothing was built, run against an agent, or changed. The criteria follow the seven
questions in Josh Rosen's _Supervisors vs. Swarms_ (2026-10-16), as the scope requires.

**Assessment: the swarm is a human-supervised delegation tree, not yet a code-coordinated
one.** One operator identity opens and merges every pull request. Sessions delegate to
subagents and receive results; sessions hand over to later sessions through a private
prose file. Verification is structural by convention and enforced by nothing on `main`.
Concurrency is enforced only by the gate-host lock. The plan that moves control into
code exists in design and in the WBS, and none of it is on `main`. Delivery flow is high
and already passes through a single merging identity, which makes that identity and the
gate-host lock the scaling limits by construction. Neither is measured as such.

## How work is coordinated today

- **Operator plus orchestrating sessions.** The state of the job is the newest-first
  `RESUME.md` in the private plan repository: more than 1,000 lines whose head block
  records in-flight PRs, gate log paths, stacked plan branches, decisions and owed
  operator actions. A later session resumes by reading it and the per-topic memory.
- **Planner and executor packets.** The batch contract
  ([batch 1 rules](../../superpowers/plans/2026-09-19-batch-1/README.md)) gives an executor
  no Git authority, bounded slices, mandatory negative proofs, an off-repository attempt
  ledger and a rule that a packet refused after three review rounds is cut smaller. The
  private ledger holds 493 attempt records from 2026-09-19 to 2026-09-26.
- **External dispatcher.** Claire's queue and lane scripts are outside this repository
  ([lanes are Claire's v1](../../lanes-are-claire-v1.md)).
- **WBS claims contract v2.** The private `fleets/coordination-contract-v2.md` replaces
  branch-prefix ownership with a claim row held by an agent person under a run, a
  `startable` read per fleet team and a fleet credential pinned to a person. Its bound-claim
  proof ran on dev on 2026-10-21: two leaf claims held slots 2/2 and RAM 8/8 and a third
  claim was refused `resources_exhausted`. On `main`, [`wbs-team-claims`](../../../openspec/changes/wbs-team-claims/tasks.md)
  stands at 16 of 21 tasks; the fleet rollout tasks 4.1 to 4.3 are open, and no code in
  this repository outside WBS itself calls `claimWorkItem`, `startAttempt` or `endAttempt`.
- **Twilight.** Dash's lease authority ([claims](../../../apps/twilight-structure/twilight-dash/cli/src/authority/claims.ts))
  is built and "unactivated until the separately reviewed production bootstrap"
  ([authority store](../../../apps/twilight-structure/twilight-dash/cli/src/authority/authority-store.ts)).
  Navigator's receipt converter emits only `setProgress` and `setMeasure` and sends nothing.
  [`twilight-control-plane`](../../../openspec/changes/twilight-control-plane/tasks.md) has 0 of
  51 tasks checked. The `twilight-agentic-workflows` change is a draft pull request (#601)
  and is not on `main`.

## Criteria

| Criterion                  | Observed today                                                                                                                                                                                                                                                                                                                                                                                                                           | Gap                                                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation and handoffs    | Delegation only. Sessions brief subagents and receive a report; the [prototype harness](../../../tools/harness-example/src/harness.ts) plans, fans out implementers and revises. No agent hands control to another agent. A change request is a new slice or PR; stacked plan branches carry ordering rules such as "never ship #640 without #642" as prose.                                                                             | No executable packet or handoff schema and no validator. Session-to-session transfer depends on a private prose file and on context compaction.                                                                |
| Locus of control           | A person and the orchestrating session choose every next step. Nothing in the repository chooses the next agent step: the dispatcher is external, Dash is unactivated, WBS claims have no caller, the control plane is unstarted.                                                                                                                                                                                                        | Every decision and every merge converge on one identity. The plan's code coordinator is design only.                                                                                                           |
| Sequential and parallel    | Parallel sessions and subagents are real. Enforced limits: one `flock` heavy lock per gate host with a FIFO ticket queue and a 30-minute wait ([lock library](../../../bin/heavy-lock-lib.sh), [gate](../../../bin/h2puni-gate.sh)); CI concurrency per ref ([ci.yml](../../../.github/workflows/ci.yml)). The batch contract runs executors serially. The two-agent laptop cap is convention.                                           | No admission control for sessions or subagents outside the gate lock; nested subagent counts are unbounded; WBS `maxParallel` schedules plans, not agents.                                                     |
| Context policy             | Packets must stand alone for a medium model with no other context; `AGENTS.md` R1 caps the index at 150 lines and a hook enforces the cap; the contract asks for a per-attempt `TMPDIR` with no tokens or agent sockets. Nothing enforces isolation. Retries are re-briefed by hand.                                                                                                                                                     | Isolation is unverifiable and retry context is undefined; the plan's I1.05 is the first explicit policy.                                                                                                       |
| Identity and authority     | All 111 PRs of the last week were authored and merged by one GitHub identity; 445 of 456 commits carry the operator's git author. The [agent-trailer hook](../../../ops/agent-trailer/prepare-commit-msg) stamps `Agent-Authored-By` from environment and never fails a commit; 155 of the last 300 commits carry no model trailer. WBS has `person(kind=agent)` and credential links; a per-agent GitHub identity is a stated non-goal. | Who did what is only partly reconstructable. Authority is not scoped: an agent process holds the owner's push and merge rights. No `CODEOWNERS`, no protection, and the hook cites a note that does not exist. |
| Deciding when work is done | Done is a human judgment informed by `GATE_EXIT=0` on an exact SHA, CI's `gate` reducer job and an OpenSpec `verify.md`. No check is required by configuration because `main` is unprotected. Token, USD and agent-time caps exist in [`execution.yaml`](../../../openspec/schemas/twilight-v1/execution.yaml) with no reader; WBS attempt outcomes exist with no writer.                                                                | Termination, retry and budget are not enforced anywhere; provider usage limits are the only hard stop.                                                                                                         |
| Verification               | Structural by convention: a second model reviews before merge, the host gate runs under its lock, CI runs the gate, pixel and secrets jobs, CodeQL runs through GitHub's default setup, and Burokrat's 14 rules run in observe mode. Model-based tests exist for the authority and claim lifecycles. Reviewer and worker agent definitions live in the operator's user config, not the repository.                                       | Review evidence is PR prose, not a required check; no automated review round in CI; observe mode blocks nothing.                                                                                               |

## Scalability of development

The [seven-day flow counts](live-evidence.md#delivery-flow-seven-days-to-2026-10-22) show
111 merged PRs, a 4.8-hour median and 23-hour 90th percentile from open to merge, a median
PR of 1,089 changed lines with a 90th percentile near 12,000, three failed `ci` runs on
`main` out of 29, and four reverts in 30 days. The rate is high for one accountable person
assisted by agents, and it is produced by the structure above: every PR is reviewed,
gated and merged through one identity, and every host gate serializes behind one lock.
Adding agents therefore adds load to those two points first. The 2026-10-21 assessment
already found that no causal throughput gain per added agent is measured; this rerun adds
that the limiting resources are identifiable now and are not instrumented. Large PRs and
a prose state file are the visible coordination cost; their effect on review quality and
rework is not measured.

## Reconcile prior intent with current evidence

- **Claims contract v2** says the branch-prefix contract stays in force until slices 1 to
  3 ship and the plan is dispatched. Dev holds the proof; `main` holds 16 of 21 tasks and
  no fleet caller. The live coordination of this repository is still the operator and the
  prose file.
- **Agent attribution.** The hook's comment cites `notes/agent-attribution-2026-09-08.md`,
  which does not exist in the repository. Model trailers come from the harness, not the
  hook, and cover about half of recent commits.
- **Twilight plans.** The [platform map](../../platform-map.md) records Dash as built and
  unactivated and the control plane as proposed; this rerun confirms both. Draft PR #601
  answers all seven criteria in design: code decides transitions, WBS is the state of the
  job, context is isolated per attempt, verification is structural. The WBS project
  `eeb8e50a-6ee6-49e4-a533-e10b1e29939d` on dev holds its work, including the four items
  from the article check: I1.05 context policy for retries, I2.10 nested subagent bounds,
  I3.05 worker authority scoping and S7a.06 work-item-level termination. None is implemented.
- **Roadmap coverage.** W21 measures throughput and W04 enforces merge checks. Nothing in
  the 27 packages makes identity, admission and termination executable; W28 is added for it.

## Prioritized actions

- **P0, repository administrator; enforcement.** W04 as already planned. For this
  capability it is also the only way verification becomes structural rather than
  conventional.
- **P1, delivery operations and security owners; identity.** Make agent authorship
  attributable and authority scoped: a failing rather than stamping trailer when an agent
  environment is detected, the missing attribution note written or the citation removed,
  and fleet pushes through a scoped machine identity instead of the owner's credentials,
  as I3.05 specifies.
- **P1, Dash owner; admission and termination as code.** Count admitted processes against
  a host cap, including nested subagents, and refuse beyond it; cap revisions and token
  spend per work item; land the fleet rollout tasks 4.1 to 4.3 so the state of the job
  moves from the prose file into WBS claims. These are I2.10, S7a.06 and `wbs-team-claims`
  slice 4.
- **P2, delivery operations owner; measurement.** Run W21 with the merging identity's
  queue and the gate-lock wait recorded as explicit series, so the two known limits are
  measured rather than inferred.

## Commands and limitations

Fresh reads: `gh api repos/Prosperous-Unification/puni-00/branches/main`,
`…/branches/main/protection`, `…/rulesets`; `gh pr list --state merged --search
"merged:>=2026-10-15T08:49Z" --json …`; `gh run list --branch main --limit 60`;
`git log origin/main -300 --no-merges` with `%(trailers:key=Co-Authored-By)` and `%an`;
read-only SSH to `h1claw` (journal lines for `sqlite-backup.service`) and `h2puni`
(three state-file fields, `docker ps` names and status). The source inventory was a
read-only sweep by a delegated agent; its file references were spot-checked, not all
re-read. Private plan repository documents are cited by path.

Not done: no dev WBS read (the MCP session was revoked by the 2026-10-22 credential epoch
and needs operator re-authentication), no coordinator or agent run, no 1/2/4-agent
comparison, no reading of PR review threads, no measurement of operator minutes. Commit
and PR counts are flow, not accepted outcomes. The absence of a mechanism in this
repository is not proof of its absence in the operator's external tooling.
