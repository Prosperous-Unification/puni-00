## 0. Spikes that decide the shape (time-boxed, outcomes in verify.md)

- [ ] 0.1 (verify.md, 2026-10-21: session created on `ai-sdk-sandbox-local`; live prompt not run, needs a spend go) `HarnessAgent` with `@ai-sdk/harness-claude-code` under Bun on the laptop, sandbox
      from `ai-sdk-sandbox-local` and from a 40-line own `HarnessV1SandboxProvider` over a
      git worktree; one prompt that creates a file — record which provider ran, exit, and the
      stream parts seen. Fallback named in design A7.
- [x] 0.2 (verify.md, 2026-10-21: runs under Bun and Node, host tools called from QuickJS) `@ai-sdk/code-mode` under Bun with two fake tools routed through
      `experimental_toolCallers` — record whether QuickJS loads and the exact `ai` pin it forces.
- [x] 0.3 (verify.md, 2026-10-21: installs clean, typechecks; the devsync pin test is slice 2 work) Pin set: `ai`, `@ai-sdk/harness`, `harness-claude-code`, `harness-codex`,
      `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@openrouter/ai-sdk-provider`,
      `@agentclientprotocol/sdk` 2.x — one install, `bun run typecheck` green, versions in
      verify.md. Test: `tools/tool-devsync` pin test extended for the new exact pins.

## 1. Workflow binding (Burokrat)

- [ ] 1.1 Red: `workflow-binding.test.ts` — accepts the sample binding; refuses unknown
      version, unknown executor kind, bare model id, absent prompt file, step code outside the
      given list. Each refusal is a named code.
- [ ] 1.2 Green: ArkType schema and `twib validate workflow-binding <file> --steps <codes>`
      printing the digest. Negative: remove the step-code check and the `qa` case passes;
      watched; `Proof:` comment.
- [ ] 1.3 `.twilight/workflows.yaml` and `.twilight/prompts/*.md` for puni-00 with the five
      classes of design A6, validated in the gate (`twib validate workflow-binding` added to
      `bin/h2puni-gate-steps.sh` and CI). Test: the gate-entrypoints test pins the command.

## 2. The port and the api-model adapter (Dash)

- [ ] 2.1 Red: `activity-executor.test.ts` — the port contract against a fake adapter: session
      id becomes agent run, parts arrive in order, usage measured or unknown with reason.
- [ ] 2.2 Red: `api-model-adapter.test.ts` with the AI SDK mock language model — measured
      usage, `stopWhen` honoured, bare model id refused before any request. Negative: remove
      the prefix check and the request reaches the mock; watched.
- [ ] 2.3 Green: provider registry (`anthropic`, `openai`, `openrouter`), `Agent` loop,
      limits from the class. The website's `ProviderFetch` seam pattern reused for tests.

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

## 6a. Safe initial coordinator (S7a; required before deployment/dogfood)

- [ ] 6a.1 Red: reconcile-loop tests over a fake WBS bridge: a tick rebuilds the frontier from
      claims, attempts and progress; a running attempt is never admitted twice; a restart with
      an empty working directory reaches the same frontier (G2, 2026-10-25).
- [ ] 6a.2 Green: the loop over the bridge; no store of its own and no SQL in Dash.
- [ ] 6a.3 Red/green: binding manifest retention and integrity, pinned prompt/tool-policy
      versions, restart after working-tree edits, explicit revocation and provenance-aware re-pinning.
- [ ] 6a.4 Red/green: unified CTT hints adapter over legacy step chains, completed-work seeds,
      DEFER_READY, generation-checked settlement and callback-free summary. Require complete
      discovery/validation and filter durable waits/running/retry state before admission.
- [ ] 6a.5 Red/green: admission as one claim-and-attempt batch before launch, the locator on the
      attempt's `reference`, the outcome as one batch retried next tick while unacknowledged;
      successors wait for acceptance.
- [ ] 6a.6 Red: coordinator-only crash with worker surviving, effect-before-result-save,
      outcome-before-reply, duplicate signals, stale claim and unresolved worker/effect state.
      Fault injection must catch a bypassed claim check, duplicate replacement and premature capacity release.
- [ ] 6a.7 Green: worker lookup by attempt reference, reattach or verified quiescence, effect
      reconciliation and the explicit unresolved operator path. Never mass-cancel running
      attempts merely because the coordinator restarted.
- [ ] 6a.8 Provide run-coordinator, inspect-runs, resume-attempt, cancel-attempt and
      reconcile-attempt operations over the WBS bridge. Demonstrate safe compatibility
      execution with fake adapters before I5.02 deployment or I5.04 real dogfood.

## 6b. Type-specific workflows and provider proof (S7b)

- [ ] 6b.1 After S7a and W6/W9, consume pinned type-workflow instances and occurrence IDs
      through the same hints/runtime path; no second interpreter and no flattened column chain.
- [ ] 6b.2 Prove parallel joins, graph-aware claim races, repair epochs, adoption/re-pinning,
      retained artifacts and stale-result refusal across restart.
- [ ] 6b.3 Run the loop against a second WBS deployment (dev and a local be-01) with paused
      writers; the only portability is WBS's own export (G2).
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
