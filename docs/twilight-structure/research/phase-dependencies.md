# Existing plans against the two product audiences

Inspected 2026-09-07 for the Wayfinder decision map. This is a source-grounded
phase-placement recommendation, not an approved phase boundary or an implementation
plan. The approved direction is Dany first, with delivery configurability and
quality taking priority, then potential customers. The exact personal acceptance
loop remains undecided. [User requirements](../spec.md)

The existing M0–M4 milestones describe implementation dependencies, not these two
audiences. Most of M1 already serves Dany directly. Some work filed under client
delivery also serves him directly; some client fixtures are useful prerequisites
for reliable personal operation. Moving everything named “client” to the customer
phase would change accepted requirements. [Delivery plan](../../../openspec/changes/twilight-control-plane/tasks.md),
[client repository meaning](../CONTEXT.md)

## Candidate grouping

Each placement below is a recommendation for the live decision tickets. Existing
task numbers remain references to the single implementation plan.

| Group                                         | Existing work                                                                                                                                                                                                                                 | Candidate placement and reason                                                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dany's delivery controls and feedback         | Tasks 3–5: request, artifact authoring, approval, effective configuration, model/activity choices, budgets, recovery and focus view. Tasks 6–8: actual execution, reviews, evidence, outcomes, integration and scaling.                       | Personal phase core. These let Dany choose how work runs and inspect whether the choice bought an accepted outcome. The breadth of controls still needs a decision.                                                                                                        |
| Shared prerequisites                          | Task 1 compiler/restart proof; Task 2 repository identity/planning port; Task 3 auth, migration reuse and authority; Task 4 admission/fencing/accounting; Task 6 K3s and scoped credentials; Task 8 clean fixture/default migration/recovery. | Keep dependencies with the personal loop they make reliable. Single-user operation still has several repos, worker identities, concurrent effects and restart risk. Clean fixtures can expose hidden dependence on Dany's home setup without promising customer readiness. |
| Planning experience and storage               | Existing WBS; Tasks 2/5 OpenSpec-origin planning; Tasks 9/10 Backlog storage proof, rich WBS parity, migration and rollback.                                                                                                                  | Decide separately whether Dany needs WBS connected to the first loop and when storage must change. The accepted Backlog destination remains; M1 explicitly proceeds before the refactor-gated migration.                                                                   |
| Broader controls and knowledge                | Task 11.1 second adapter, specialist critics, expanded hooks, routing, schedules; 11.2 WBS-origin automation; Task 12 cited wiki operations and measured retrieval.                                                                           | Prioritize capabilities Dany will actually use. 11.1 does not wait for Backlog; only 11.2 does. Existing linked knowledge and required knowledge handoff precede a full knowledge service.                                                                                 |
| Development acceptance and reusable operation | Task 13 dev deployment/cloud browser/release; Task 14 upgrades, self-growth and state-preserving rollback.                                                                                                                                    | Pull the required development-acceptance portion into the personal phase if that is its chosen endpoint. Identify which upgrade/recovery paths Dany needs before postponing the rest. This recommendation requires an explicit plan amendment.                             |
| Customer-specific obligations                 | Client-owned installation, revocable maintenance access, support/recovery terms, customer onboarding and upgrade/configuration preservation.                                                                                                  | Customer phase readiness. Ownership/operator direction is accepted; support hours, recovery targets and a concrete customer/problem remain open. Template/version/isolation foundations already belong to earlier work.                                                    |
| Deferred ideas                                | Per-worker memory; automatic VPS provisioning; optional OpenSandbox; knowledge indexing when baseline retrieval fails; automatic profile optimization from adequate evidence.                                                                 | Keep each deferral's existing trigger. Per-worker memory is expressly excluded; the others are later or conditional work, not all automatically customer-phase work.                                                                                                       |
| Completed pilot/tooling                       | Twilight SDLC pilot and review hardening.                                                                                                                                                                                                     | Existing foundation: workflow/schema experiments, navigation and generated workflow checks. Their recorded completion is not delivery of the factory or assistant.                                                                                                         |

Sources: [task dependencies and exits](../../../openspec/changes/twilight-control-plane/tasks.md),
[installation direction](../discovery.md#installation-operating-model),
[storage entry gate](../client-repositories.md#cutover-after-the-refactors-land),
[knowledge benchmark](../knowledge.md#the-knowledge-profile),
[parked memory](../../assistant/ideas.md),
[pilot verification](../../../openspec/changes/twilight-sdlc-pilot/verify.md),
[hardening verification](../../../openspec/changes/twilight-review-hardening/verify.md).

## Decisions the audience split does not settle

1. **What completes a personal request?** M1 reaches integrated candidate
   acceptance under an independent task oracle, with cloud acceptance disabled.
   Task 13 adds deployed-source identity, real cloud-browser acceptance and
   production authority. If Dany's endpoint is development acceptance, the current
   M1 exit alone is insufficient. Task 13 combines several concerns that need not
   share one audience boundary. [Task 8 and Task 13](../../../openspec/changes/twilight-control-plane/tasks.md),
   [user delivery sequence](../spec.md#user-level-delivery-sequence)
2. **Which delivery choices must be usable immediately?** M1 already includes
   profile overrides, model assignments, bounded escalation, critic/judge choices,
   optional browser scope, concurrency, budgets, deadlines and immutable settings
   history. Task 11 expands that catalog. Choosing a few supported controls is
   different from weakening the quality measure used to compare them.
   [Product controls](../product-experience.md#all-supported-settings-are-visible-scoped-and-versioned),
   [profiles and evaluation](../../../openspec/schemas/twilight-v1/execution.yaml)
3. **What quality is fixed, and which activities can vary?** The proposed floor
   includes integrated verification, composition, independent candidate acceptance,
   knowledge handoff, secrets checking and explicit authority/evidence. It requires
   no model-review round; organization policy can require more. Exact profile
   defaults, budget values, sample thresholds and defect windows are proposed
   settings, not fresh measurements or spending permission. The personal-quality
   decision should identify outcomes and evidence Dany trusts, then the controls he
   can vary while retaining them. [A45–A48](../assumptions.md#delivery-controls),
   [independent evaluation contract](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-outcomes-use-an-independent-evaluation-definition)
4. **What portability is needed before customers?** Task 2 tests a clean repo with
   no personal home skills; Task 8 tests the same journey and template default in
   puni-00 and a generated fixture. Task 14 adds successful upgrades preserving
   configuration and post-upgrade state. Decide the personal-phase proof boundary
   without conflating a clean fixture with a maintainable customer installation.
   [Template contract](../client-repositories.md#template-contract),
   [repository-planning specification](../../../openspec/changes/twilight-control-plane/specs/twilight/repository-planning/spec.md)
5. **Does usable WBS require Backlog cutover in the personal phase?** WBS planning
   semantics, an OpenSpec-origin plan port and Backlog persistence are separate
   concerns. The whole of Task 9, including its spike, waits for the named refactor
   closure; Task 10 then changes authority without dual writers. That migration
   must preserve existing rich planning behavior, not merely task text. Retiming it
   is a user decision; retaining SQLite indefinitely as an undisclosed planning
   authority would contradict the accepted destination.
   [Storage ownership and migration](../client-repositories.md),
   [Backlog compatibility findings](backlog-patterns.md)
6. **How does the assistant join the factory?** Direct worker conversations and
   recurring renameable identities are accepted in the assistant vocabulary.
   The factory glossary's execution worker is a different entity. Secretary
   responsiveness, all-session search, assignments and visual work events have no
   implementation slice or capability delta in the existing factory plan. The
   connection, including non-software requests, needs its own decision; it cannot
   be inferred from the factory's run timeline or role registry.
   [Assistant vocabulary](../../assistant/CONTEXT.md),
   [factory vocabulary](../CONTEXT.md),
   [current surfaces](../product-experience.md#surfaces)

K3s is not an open simplification choice in this exercise. The accepted ADR puts
one dedicated server and at least two real worker nodes in M1, with manual join
and drain and durable state outside the cluster. The audience split does not
authorize replacing it with local processes or postponing it wholesale.
[Accepted worker-pool decision](../../adr/0016-k3s-schedules-the-expandable-worker-pool.md)

## Claire lessons grounded in the current checkout

These are observations of repository source and operating instructions, not
claims about the current health of its deployed gateway or hosts.

| Lesson                                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                      | Implication for the personal product                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaningful work state must own its timestamps.                                     | [Observability design](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md:380) makes queue records authoritative and labels inferred/missing/stale lifecycle values; the [lifecycle source](/home/df/wd/personal/claire/plugins/sdlc-telemetry/lifecycle.mjs:1) keeps historical collection outside gateway ticks.                            | Show request/assignment progress and evidence freshness; an agent's last message is not sufficient operational state. Keep expensive reconstruction away from the secretary's response path.                           |
| Record task, session, model and assignee as different identities.                  | [Backlog-native design](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-backlog-native-sdlc-design.md:138) requires a real run join; [provenance design](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md:406) separates assignment history from serving models.                                                              | Renameable characters must retain stable identity and assignment/session links; changing model need not change the character or rewrite history.                                                                       |
| High-level visibility and searchable content need separate coverage.               | Claire's [dashboard design](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md:465) covers flow, reliability and economics; its [non-goals](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md:650) exclude prompt/response/tool content. The checked-in config sets `captureContent: false`. | Reuse correlation and diagnostic dimensions as lessons. This does not supply the user's all-session content search or personified work view.                                                                           |
| Binding, event emission and historical reconstruction are separate costs.          | [Telemetry wiring](/home/df/wd/personal/claire/plugins/sdlc-telemetry/index.mjs:100) binds host-supplied run identity and emits phase changes; later hooks emit usage/tool/run outcomes. [Backlog-native design](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-23-backlog-native-sdlc-design.md:33) explicitly reduces repeated manual writes.                                   | Prefer one accepted event/record with derived views over several agent-maintained summaries. Agent-authored milestones should link to the evidence they interpret.                                                     |
| A schedule or heartbeat cannot alone say a worker is making progress.              | [Wake-liveness investigation](/home/df/wd/personal/claire/docs/superpowers/specs/2026-08-30-task197-worker-wake-liveness-design.md:59) found health and dispatch predicates diverging; [current worker procedure](/home/df/wd/personal/claire/queue/WORKER.md:13) distinguishes claimed, takeable, waiting and drained work.                                                                  | Render the actual reason for waiting, last observed progress and recovery owner. Test the real wake/admission path instead of decorating a scheduled job as active.                                                    |
| Personal priorities can alter review policy, and the outcome must remain explicit. | [Current worker review rules](/home/df/wd/personal/claire/queue/WORKER.md:39) describe reduced best-effort dev reviews while retaining stricter prod/public-exposure rules; browser QA can be separate from builder completion.                                                                                                                                                               | Configurability has direct personal value. Do not silently import Claire's exceptions: Twilight's chosen quality floor and development-acceptance endpoint must decide whether missing review/browser evidence blocks. |
| Keep the relevant contract small and the rest retrievable.                         | [Light-context plan](/home/df/wd/personal/claire/docs/superpowers/plans/2026-09-05-queue-worker-light-context.md) separates a bounded worker contract from deeper exceptional guidance and requires contextual omission checks.                                                                                                                                                               | Session history can stay extensive while each worker starts from a focused assignment. This is not per-worker persistent memory.                                                                                       |

## Source conflicts and gaps to reconcile

- **Independent acceptance is described as optional in one page.** The final
  paragraph of [product experience](../product-experience.md) permits disabling
  the task-acceptance observer. The current [normative delta](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-outcomes-use-an-independent-evaluation-definition),
  Task 7 and `execution.yaml.repositoryFloor` require it and refuse disabling it.
  The parent reconciled the paragraph to the existing required floor during this
  mapping effort; this finding describes the inspected pre-correction source.
- **Milestone labels overstate some dependencies.** The M4 summary says M1–M3;
  Task 13 specifically depends on Task 8 and Task 11.1. Task 14, by contrast,
  depends on Tasks 10–13. Therefore the existing detailed plan does not make
  Backlog migration or the full wiki service a prerequisite of development
  acceptance. [Single delivery plan](../../../openspec/changes/twilight-control-plane/tasks.md)
- **Automation text retains an obsolete policy key.** Task 11 refers to
  `onTrigger.schedule.retries`; the [profile](../../../openspec/schemas/twilight-v1/execution.yaml)
  and [lifecycle contract](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-lifecycle-points-are-the-one-key-space)
  use `onTrigger.*` with `triggerKinds`. This is a documentation correction,
  not an audience decision. The parent corrected that reference during integration;
  task scope, ordering and completion status were unchanged.
- **Assistant coverage is additive.** TS-31 and the assistant glossary record the
  new direction, but the requirement-to-task table ends at TS-30 and the current
  product surfaces do not specify secretary availability, identity assignment,
  direct worker interaction or a searchable session corpus.
- **Historic research is not current integration evidence.** The initial Claire
  note inspected an older commit. Backlog findings explicitly did not establish
  version-pinned binary conformance; local helper observations retain unrerun
  parser/path-collision concerns. These remain experiments at their owning task,
  not reasons to claim an existing adapter works. [Initial inspection](initial-inspection.md),
  [Backlog findings](backlog-patterns.md), [helper observations](local-workflow-observations.md)

## Coverage and source identity

Twilight source base: `51ca3df5233e7dce010c1e574f06f0ec6fdcad7c`.
Claire source base: `3fe77be9accc489216d0233f2e4045a32ba443dc`; the named Claire
files below had no working-tree modifications when inspected. No current
upstream capability is asserted from these files: external facts are attributed
to the dated repository research, and live capability verification remains future work.

| Source inventory                                                                                                                                                                       | Coverage                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilight `spec.md`, `assumptions.md`, `discovery.md`, `product-experience.md`, `client-repositories.md`, `knowledge.md`, `sdlc-stages.md`, `CONTEXT.md`, `sdd-sources.md`, `README.md` | Full text, including the current uncommitted audience amendment and glossary terms.                                                                                                                                                   |
| Twilight research `initial-inspection.md`, `backlog-patterns.md`, `knowledge-patterns.md`, `local-workflow-observations.md`                                                            | Full text. Prior upstream claims/receipts were not rerun.                                                                                                                                                                             |
| `twilight-sdlc-pilot`, `twilight-review-hardening`, `twilight-control-plane`: each `proposal.md`, `design.md`, `tasks.md`, `verify.md`                                                 | Full text of all twelve artifacts; all fourteen control-plane task groups accounted for above.                                                                                                                                        |
| Pilot `twilight/sdlc` and `twilight/knowledge`, hardening `twilight/workflow-maintenance`, control-plane `twilight/repository-planning` capability specs                               | Full text.                                                                                                                                                                                                                            |
| Control-plane `twilight/control-plane/spec.md`                                                                                                                                         | All requirement/scenario headings; full configuration/profile, levers/evaluation, integration/speculation/scaling and observable-evidence sections. Detailed authority/runtime implementation review is outside this research ticket. |
| `openspec/schemas/twilight-v1/execution.yaml`; ADRs 0015 and 0016                                                                                                                      | Full text.                                                                                                                                                                                                                            |
| Assistant `CONTEXT.md` and `ideas.md`; Wayfinder map/research ticket                                                                                                                   | Full text of the new local records.                                                                                                                                                                                                   |
| Claire `queue/WORKER.md`; Backlog-native SDLC design; light-context plan                                                                                                               | Full text. Instructions were treated as source material, not executed.                                                                                                                                                                |
| Claire observability design                                                                                                                                                            | Goal, foundations/topology, ticket context, lifecycle, provenance, dashboards, resource/retention, failure/privacy, completion and non-goals sections. Transport/migration implementation details were not comprehensively audited.   |
| Claire wake-liveness design                                                                                                                                                            | Question/answer, evidence headings and shared-predicate proposal; not every historical review argument.                                                                                                                               |
| Claire telemetry `index.mjs`, `lifecycle.mjs`, `telemetry.mjs`; `setup/config/openclaw.json5`                                                                                          | Bounded binding/lifecycle code reads and targeted hook/identity/content-setting searches. No claim of a full code audit.                                                                                                              |
| Claire `LLM_README.md`                                                                                                                                                                 | Bounded opening only; its large operational history was not copied into this report or treated as current live-host evidence.                                                                                                         |

The active checkout also held unrelated skill edits, preserved. These SHA-256
values identify the uncommitted source records used here, rather than implying the
base commit contains them:

```text
cc3753536a6d6b1fb89ba1d0024c3420e4fcc1cb84556fa70797575764d624c3  docs/twilight-structure/spec.md
f5380ce6a20c72e0d39f6a536e9233f5008a5f927a263a3bc1f1ee8edc29341d  docs/twilight-structure/CONTEXT.md
931b2f1a486359df1e8b440d141427036ed9252ca72029138dcec0c0440519b5  docs/twilight-structure/README.md
cecf4daf9a1533414399382da5fc60a74c12bb3c5f507a1510b6db7ba8775da5  docs/assistant/CONTEXT.md
ad5a1b781e35b5d1569defae14909254f79d0d5f169090232164208d1d22b808  docs/assistant/ideas.md
3e523522730387c0df79658ea3810c44bc4adccdd90a214854a810a0c1191e66  .scratch/twilight-structure/map.md
```

Additional inspected Claire file hashes provide precise pointers to the lessons:

```text
36d1186c6c0a73d529409b71c7fb05688b014976a79de03dad968eb8b073e4cc  queue/WORKER.md
2ee4a33eb9112573c5133b7931321bf84fa69a9c7abc478d21dc3ec4020a8997  plugins/sdlc-telemetry/index.mjs
bcfda99c419ca68a422b41bfd62c72313030943860804f2b47cabb5c40236af4  plugins/sdlc-telemetry/lifecycle.mjs
0d7dbb7d970caa5556cc59f7dc1b93b7f5be86e6e99594db89aa4d2240746b1b  setup/config/openclaw.json5
3ee36cd9167391d0dc58ee8259ae9bb1546b89664edf5c798dc3b7af6ee132df  docs/superpowers/specs/2026-08-23-backlog-native-sdlc-design.md
e4189c3bdbb0c3facebacced5590b3e28ff8c2cb79d404d9901c1edcc110f079  docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md
a02cb9ec072316f305d95d64cacf1e7f7d49d69bf38837353deb5aa984f339dd  docs/superpowers/specs/2026-08-30-task197-worker-wake-liveness-design.md
4985c70f4635177e165cf279b4ee7bb98be0d9bad582b4e9b796fb088e3c1bee  docs/superpowers/plans/2026-09-05-queue-worker-light-context.md
```

No live hosts, historical gates, provider sessions, migration, deployment or
customer onboarding were exercised. This ticket changes a research document only;
runtime tests and dependency setup were not run. The parent session records the
report's formatting/navigation checks and integrates its findings into the map.
