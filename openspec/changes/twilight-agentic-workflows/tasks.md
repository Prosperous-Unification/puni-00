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
      as `swarm-rehearsal.boot.db.test.ts`) with one linked fleet credential: startable read,
      claim with run id, `setProgress`, `setMeasure` only when measured, release, external
      refs. Each listed refusal code is one case; an unlisted code throws.
- [ ] 5.2 Green: the client over `@wbs/contracts` shapes; the race case through two
      credentials; negative: drop the `person_not_bound` mapping and the write is retried
      forever — watched, bounded, `Proof:`.

## 6. Run store and interpreter

- [ ] 6.1 Red: `run-store.db.test.ts` — schema `user_version 1`, attempt identity, every
      transition in the design table, refusal of an unknown transition.
- [ ] 6.2 Red: `coordinator.model.test.ts` with `fc.asyncModelRun` over admit, finish, fail,
      kill, resume and the cap; sabotage proofs: cap removed, restart marking removed, retry
      budget removed — each watched failing.
- [ ] 6.3 Green: the interpreter over an ordered step-node list; `run-coordinator
--repository --project --binding --store --max-active [--once]`, `inspect-runs`,
      `resume-attempt`, `cancel-attempt`. The prototype's plan→implement→revise flow re-run
      through it with the fake ACP agent; same assertions pass; LangGraph removed and
      `tools/harness-example` retired (design A10).

## 7. Twilight flows as activity classes

- [ ] 7.1 `tool` adapter: `twin plan-reference`, `twib validate …`, `bin/h2puni-gate.sh`
      under `with-heavy-lock`, the merge command; argv built from the attempt; exit code and
      output captured; a missing tool throws. Test per command with a fake binary on PATH.
- [ ] 7.2 `human` adapter: `waiting_for_person`, claim held, `resume-attempt` with a note that
      lands on the WBS work item.
- [ ] 7.3 Prompts for `plan` and `review` that read the work item through the bridge and
      write the OpenSpec artifacts; one golden run against the fake model per prompt.

## 8. Governance cutover

- [ ] 8.1 WBS: the puni-00 project's work item types and step codes match the binding; the
      coordinator's fleet credential linked on dev per `docs/auth-integration.md`.
- [ ] 8.2 `docs/runbook-agentic-workflows.md`: start, inspect, resume, cancel, what each
      refusal means; linked from `docs/twilight-structure/README.md` and `LLM_README.md`.
- [ ] 8.3 Dogfood (design A11): one small real work item claimed, run through `plan`,
      `impl`, `review`, `verify`, `integrate`, merged; attempts, claims, measures and the PR
      recorded in verify.md.
- [ ] 8.4 Amend the control-plane proposal and Tasks 1 and 6, and the runtime-patterns note,
      as design "What this amends" lists; `openspec validate --all --json` green.
