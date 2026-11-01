## 0. Spikes that decide the shape (time-boxed, outcomes in verify.md)

- [ ] 0.1 (verify.md, 2026-10-21: session created on `ai-sdk-sandbox-local`; live prompt not run, needs a spend go) `HarnessAgent` with `@ai-sdk/harness-claude-code` under Bun on the laptop, sandbox
      from `ai-sdk-sandbox-local` and from a 40-line own `HarnessV1SandboxProvider` over a
      git worktree; one prompt that creates a file — record which provider ran, exit, and the
      stream parts seen. Fallback named in design A7.
- [x] 0.2 (verify.md, 2026-10-21: runs under Bun and Node, host tools called from QuickJS) `@ai-sdk/code-mode` under Bun with two fake tools routed through
      `experimental_toolCallers` — record whether QuickJS loads and the exact `ai` pin it forces.
- [ ] 0.3 (verify.md, 2026-10-21: installs clean, typechecks; the devsync pin test is slice 2 work) Pin set: `ai`, `@ai-sdk/harness`, `harness-claude-code`, `harness-codex`,
      `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@openrouter/ai-sdk-provider`,
      `@agentclientprotocol/sdk` 2.x — one install, `bun run typecheck` green, versions in
      verify.md. Test: `tools/tool-devsync` pin test extended for the new exact pins.

## 1. Workflow binding (Burokrat)

Tasks 1.1–1.2 are expanded in [binding tasks](binding-tasks.md), implementing the
[binding design](binding-design.md). Their checkboxes remain the parent acceptance gate;
repository defaults and I1 approval/budget declarations are separate work.

- [x] 1.1 Red: `workflow-binding.test.ts` — accepts the complete illustrative binding; refuses unknown
      version, unknown executor kind, bare model id, absent prompt file, step code outside the
      given list. Each refusal is a named code.
- [x] 1.2 Green: ArkType schema and `twib validate workflow-binding <file> --steps <codes>`
      printing the digest. Negative: remove the step-code check and the `qa` case passes;
      watched; `Proof:` comment.
- [ ] 1.3 `.twilight/workflows.yaml` and `.twilight/prompts/*.md` for puni-00 with the five
      classes of design A6, validated in the gate (`twib validate workflow-binding` added to
      `bin/h2puni-gate-steps.sh` and CI). Test: the gate-entrypoints test pins the command.

## 2. The port and the api-model adapter (Dash)

The three [executor tasks](executor-tasks.md) implement [executor design](executor-design.md).
These parent gates stay open until that packet is accepted. They do not complete other
adapters, durable coordinator dispatch, S0.08 recovery or S7a.

- [x] 2.1 Red/green: shared executor identities, immutable request/locator snapshots and
      real accepted Burokrat selection against actual installed SDK registry capabilities.
      Session-to-WBS-agent-run persistence remains later host integration.
- [x] 2.2 Red/green: real SDK turns preserve per-step measured/unknown usage, distinct
      output/step limits, zero automatic retries and correlated uncertain/throwing outcomes.
      Bare model IDs fail at accepted-binding/registry boundaries; newly owned guards need
      isolated production fault proofs rather than masked duplicate prefix checks.
- [x] 2.3 Green: concrete API-model adapter with injected model registry/tools, owned local
      sessions, payload-bound retries, cancellation/listener lifecycle and honest unsupported
      durable recovery. No production provider factory or live command is enabled.

## 3. The cli-harness adapter

- [ ] 3.1 Red: `cli-harness-adapter.test.ts` against a fake `HarnessV1` — permission mode
      mapped from the binding, session id recorded, parts forwarded, cancellation closes the
      session.
- [ ] 3.2 Green per spike 0.1's answer; the real Claude Code run is an env-gated integration
      test (`TWILIGHT_HARNESS_LIVE=1`) that writes one file in a scratch worktree and asserts
      it exists. Skipped visibly otherwise, never silently.

## 4. The acp adapter

- [ ] 4.1 Move `tools/harness-example/src/{acp,fake-acp-agent,log}.ts` into
      `twilight-dash/cli/src/agents/acp/`; upgrade to `@agentclientprotocol/sdk` 2.x; the
      existing tests move with them and stay green.
- [ ] 4.2 Red then green: the adapter returns `Usage.unknown('acp-v1-no-usage')`; the
      permission seam refuses when no allow option exists (existing proof retained);
      `session/load` replay exposed as `recall(session)` for the Board.

## 5. The WBS run bridge

- [ ] 5.1 Red: `wbs-bridge.test.ts` against a booted be-01 (`*.boot.db.test.ts` pattern,
      as `swarm-rehearsal.boot.db.test.ts`) with one machine credential (pinned to the coordinator's agent person): startable read,
      claim with run id, `setProgress`, `setMeasure` only when measured, release, external
      refs. Each code of the unions is one case; an unlisted code throws.
- [ ] 5.2 Green: the client over `@wbs/contracts` shapes; the race case through two
      credentials; negative: drop the `person_not_bound` mapping and the write is retried
      forever — watched, bounded, `Proof:`.

- [ ] 5.3 Publish the exact portable request codec and one unchanged batch bound through
      [runtime request tasks](runtime-request-tasks.md); packet acceptance does not complete
      the sender/outbox, receipt authentication or durable coordinator.

- [ ] 5.4 Publish complete shared receipt correspondence through
      [receipt tasks](runtime-receipt-tasks.md); matching content does not establish
      transport authenticity, current authority or durable sender acceptance.

- [ ] 5.5 Reconcile current main organization limits through
      [limits integration tasks](limits-integration-tasks.md), preserving separately owned
      policy/defaults and proving actual conditional claim refusal/replay consumption.

- [ ] 5.6 Retain exact authority intent, immutable acceptance and local-epoch mapping through
      [runtime authority tasks](runtime-authority-tasks.md). This internal persistence slice
      does not enable dispatch or complete durable sender/coordinator acceptance.

## 6a. Safe initial coordinator (S7a; required before deployment/dogfood)

G2 is decided: [ADR 0061](../../../docs/adr/0061-execution-facts-survive-coordinator-restart.md) selects durable execution records and reconciliation while rebuilding scheduling from WBS. The earlier WBS-only G2 direction restored by PR 749 is superseded. Direction approval closes no implementation checkbox; the owner's subsequent commit/push/merge authorization remains subject to required evidence, review and release gates.

Tasks 6a.1–6a.2 are expanded in [storage tasks](storage-tasks.md), implementing the
[storage design](storage-design.md). Their checkboxes remain the parent acceptance gate.

The S0 [provider lifecycle prerequisite](provider-lifecycle-tasks.md) prepares observed
cleanup for another durable store. WBS030.04/030.12 require second-provider conformance
during S0; the deployment choice and paused-writer transfer in6b.3 remain required before
claiming portability. Neither prerequisite alone closes S0 or S7a.

- [x] 6a.1 Red: shared RunStore/ArtifactStore conformance tests for atomic admission,
      capacity, revision and owner conflicts, immutable manifests, outcome/outbox atomicity,
      inbox deduplication and receipt reconciliation. No SQL or engine-specific schema in ports.
- [x] 6a.2 Green: semantic ports and memory fixture, then the currently selected durable
      adapter (SQLite). Keep physical schema/migrations in that adapter and select it by configuration.
- [ ] 6a.3 Red/green: binding manifest retention and integrity, pinned prompt/tool-policy
      versions, restart after working-tree edits, explicit revocation and provenance-aware re-pinning.
      Retained recovery is expanded in [binding recovery tasks](binding-recovery-tasks.md);
      that internal slice does not close revocation or provenance-aware re-pinning.
- [ ] 6a.4 Red/green: native CTT 0.12 materialize/prepare adapter over legacy step chains,
      independent `createWorkSession({ completedWork })`, `advance()` work tickets,
      accepted-WBS-only `completeWork` (`accepted`/`alreadyAccepted`) and callback-free summary.
      Require complete disconnected topology validation and preserve distinct W/C milestones.
      Filter current WBS eligibility and durable waits/running/retry state before atomic
      RunStore admission; admission never completes work. Reconstruct independent sessions
      from accepted WBS facts and durable attempt history, rejecting old tickets and avoiding
      duplicate running admission. The [native integration tasks](../ctt-work-session-integration/tasks.md)
      track this bounded local component; exact remote claim, intent-before-launch ordering
      and coordinator CLI composition remain open, so this full checkbox stays unchecked.
      The [execution-history tasks](execution-history-tasks.md) implement the bounded persistence
      foundation for6a.5. External dispatch ordering and exact outcome/write/release remain later
      phases and the parent checkbox stays open.

- [ ] 6a.5 Red/green: persist admission/launch intent, exact claim receipts and operation-key
      locators; commit outcomes and outbox atomically, reconcile WBS acceptance before successors.
      The next production connection is [preparation dispatch](preparation-dispatch-tasks.md):
      verified intent precedes session creation and committed locator precedes live-session
      publication. This slice leaves claim transport, turn dispatch and exact outcome delivery open.
      [Runtime dispatch](runtime-dispatch-tasks.md) then connects authority/claim receipt
      delivery and one fresh turn through the existing ports. Its client capture does not
      complete outcome/release, supported recovery or the coordinator.
- [ ] 6a.6 Red: coordinator-only crash with worker surviving, effect-before-result-save,
      progress-before-ack/outcome-before-reply, duplicate signals, stale local owner, stale WBS
      claim and unresolved worker/effect state. Fault injection must catch bypassed local
      fencing or receiver claim checks, duplicate replacement and premature capacity release.
- [ ] 6a.7 Green: ownership acquisition/fencing, worker lookup/reattach or verified quiescence,
      receipt/effect reconciliation and explicit unresolved operator path. Never mass-mark running
      attempts interrupted or cancelled merely because the coordinator restarted.
- [ ] 6a.8 Provide run-coordinator, inspect-runs, resume-attempt, cancel-attempt and
      reconcile-attempt operations over adapter configuration and the guarded WBS bridge.
      Demonstrate safe compatibility
      execution with fake adapters before I5.02 deployment or I5.04 real dogfood.

## 6b. Type-specific workflows and provider proof (S7b)

- [ ] 6b.1 After S7a and W6/W9, consume pinned type-workflow instances and occurrence IDs
      through the same hints/runtime path; no second interpreter and no flattened column chain.
- [ ] 6b.2 Prove parallel joins, graph-aware claim races, repair epochs, adoption/re-pinning,
      retained artifacts and stale-result refusal across restart.
- [ ] 6b.3 Run identical storage contracts against a second durable adapter chosen for deployment;
      any conformant store is eligible. Prove versioned transfer with paused writers before claiming portability.
      A second WBS deployment or WBS export alone does not prove execution-store portability.
- [ ] 6b.4 Finish W0–W12 product acceptance: distinct type DAGs in one project, migrated facts,
      schedules, editor/boards, imports/exports and full recovery. Compatibility dogfood is not this gate.

## 7. Twilight flows as activity classes

- [ ] 7.1 `tool` adapter: `twin plan-reference`, `twib validate …`, `bin/h2puni-gate.sh`
      under `with-heavy-lock`, the merge command; argv built from the attempt; exit code and
      output captured; a missing tool throws. Test per command with a fake binary on PATH.
- [ ] 7.2 `human` adapter: `waiting_for_person`, claim held, `resume-attempt` with a note that
      lands on the WBS work item.
- [ ] 7.3 Prompts for `plan` and `review` that read the work item through the bridge and
      write the OpenSpec artifacts; one golden run against the fake model per prompt.

## 8. Compatibility dogfood and staged governance cutover

- [ ] 8.1 WBS: the puni-00 project's work item types and step codes match the binding; the
      a machine credential (source `api_key`) created for the coordinator's agent person in
      organization settings.
- [ ] 8.2 `docs/runbook-agentic-workflows.md`: start, inspect, resume, cancel, what each
      refusal means; linked from `docs/twilight-structure/README.md` and `LLM_README.md`.
- [ ] 8.3 After S7a recovery proofs, I1–I4 bindings/adapters/bridge and a supervised deployment, dogfood (design A11): one small real work item claimed, run through `plan`,
      `impl`, `review`, `verify`, `integrate`, merged; attempts, claims, measures and the PR
      recorded in verify.md.
- [ ] 8.4 Amend the control-plane proposal and Tasks 1 and 6, and the runtime-patterns note,
      as design "What this amends" lists; `openspec validate --all --json` green.

- [ ] 8.5 Record separate compatibility and type-DAG milestones in the operator runbook.
      New-work cutover has an explicit fallback to manual; full type-DAG completion requires S7b/W12.

## Receiver implementation packet

Follow [receiver-tasks.md](receiver-tasks.md) for the six S0.05–S0.07 slices.
Completing receiver HTTP/client behavior alone does not complete parent 5 or 6a.5–7:
Dash durable pin/grant mapping, executor ordering and coordinator integration remain required.
