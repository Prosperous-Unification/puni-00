# Manual Editor Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement each reviewed task. The autonomous launch goal authorizes this bounded defect repair and normal reviewed development updates.

**Goal:** Make the actual scoped manual editor readable through editing, review and confirmation, while preserving the night conversation editor.

**Architecture:** Keep the existing shared RequestEditor and light manual body. Scope existing light-role tokens to the manual panel, without changing behavior or global night tokens. Extend the existing screen audit with real scoped-v1 states rather than a CSS-string mirror test.

**Tech Stack:** Bun, Nx, React, Vite, existing Playwright screen fixture, canonical h2 gate and GitOps.

**Spec:** openspec/changes/restore-manual-editor-contrast/specs/website-app-screens/spec.md

## Global Constraints

- Work only in the reused clean managed public worktree /home/df/.codex/worktrees/143d/puni-00, branch fix/puni-manual-contrast, baseline458570bebdfc26d772c33b1f58d069565dd11562. Preserve the unrelated dirty root, previous private/fleet/visual worktrees and original frozen65b1 tree.
- Use existing light palette roles on the manual form panel. Normal text at least4.5:1, field/focus at least3:1; existing44px controls and no overflow at1440/768/390/320.
- Keep the dark conversation editor's existing night palette. No new kit, nav/layout/copy/behavior/API/migration/inference/analytics/hero composition change.
- Public canonical app source first; private five-project snapshot must equal the reviewed public trees. Licensed site/media stay private; do not transfer private docs/assets into public.
- Bun/Nx only. No paid model, production, h4 test/build/drill, operator/customer data or new source-IP/cap workaround.
- Heavy gates/builds only on h2 under its canonical lock. Changed public CSS requires a fresh exact-SHA gate; historical458 gate is not sufficient.
- Existing reviewed dev Git/registry authorization persists. Review source/package before publication; no force, main merge or hook bypass.
- Google account reports, acquisition campaign coverage, live unload-event observability and paid-provider acceptance remain separate open launch work. New hero variants remain local/unselected. About/new blog are owner-owned.

### Task 1: Public CSS restoration and real scoped-state regression proof

**Files:** Modify apps/website/fe-01/src/style.css and apps/website/fe-01/browser/screens.mjs; update only this plan and restore-manual-editor-contrast artifacts. A small browser-only helper is allowed only if necessary to keep the existing audit clear; report it explicitly. No unrelated refactor.
**Consumes:** public458 source, existing screen fixture, real local API, scoped-v1 RequestEditor and current light/night tokens.
**Produces:** committed public revision, exact source diff and retained RED/GREEN/fault/restoration/render receipts suitable for independent review.

- [x] Read LLM_README, linked UI design, app CSS, RequestEditor, both /manual and paused-thread callers, browser/screens.mjs and browser/request-editor.mjs before edits. The website app still owns its pre-kit CSS; do not adopt the future agency kit as part of a bugfix.
- [x] Install locked Bun dependencies frozen and run focused baseline app tests. Reuse the existing managed worktree; it already has dependencies. If setup is denied by sandbox/cache policy, retain the failure and retry with appropriate scoped execution permission, not altered source.
- [x] Extend screen fixture intake setup to accept an explicit startingChoice for ONLY new scoped cases, preserving legacy defaults. Use startingChoice:improve/startConversation:true with a disposable local API/store. Add named states manual-scoped-edit, manual-scoped-preview, manual-scoped-receipt and build-scoped-review. In manual states follow Change this before editing, open Optional references, fill a brief/reference, Review request, fill Email and submit only for receipt. Use clearly synthetic .test email and no paid provider. The dark positive can use the AI-off paused thread's already-open scoped editor.
- [x] Add actual DOM/render contrast checks for visible scoped editor text/labels/entered values/receipt and field/focus boundaries. Measure the actual surface, not just string/color equality; reuse existing math where appropriate. State any gradient/media limitation. Keep normal threshold4.5 and boundary/focus3; do not lower thresholds. Cover dark palette preservation as an independent positive. Existing PUNI_SCREENS_ONLY selection must actually execute all expected new states; retain nonzero capture counts and screenshots, not merely process exit.
- [x] Build baseline app on owned loopback fixtures and run new selected cases. Retain actual failing ratios/screenshots before production CSS changes. Fixture setup/selector errors are not RED for the product defect; correct and retain them separately.
- [x] Restore the manual editor's complete relevant foreground/control palette with existing tokens under the light panel: preview/reference, labels, entered values, explanatory/validation text, links/actions and receipt. Preserve dark card treatment outside the manual panel. Do not change RequestEditor behavior, copy or API.
- [x] Run selected actual cases with PUNI_SCREENS_ONLY=manual-scoped-edit,manual-scoped-preview,manual-scoped-receipt,build-scoped-review and PUNI_SCREENS_STRICT=1 at the existing four viewports. Record every executed state/viewport. Inject removal of the actual fix from owned built CSS, observe the same production-path contrast failure, restore byte-for-byte and pass again; add adjacent Proof comment naming the fault and actual check.
- [x] Run appropriate uncached website-fe-01 test/lint/typecheck/build, named formatting, gitdiffcheck, new strict OpenSpec and ordinary all-change validation. The app browser script is outside src lint scope; explicitly lint it with actual runtime globals as needed, without suppressions. Do not run a raw full Nx host gate. Retain every failure/skip and source scope.
- [x] Update actual verification/tasks, commit named files normally, inspect your diff and clean up owned loopback processes. Write full task report, return DONE with commits/one-line checks/concerns. No push, private projection, h2 build/gate or live Cloud action in Task1; root obtains independent task review.

### Task 2: Canonical gate, byte-identical private projection and reviewed dev delivery

**Files:** Private five-project projection/baseline docs, dev release evidence and development-only Fleet pins/receipt; public/private verification docs as needed.
**Consumes:** independently approved Task1 public SHA and proof, prior private docs89cbdab40ec2329b05531197bdc5f0092544fe63, Fleetcbc0498531d159b7979a0ff3a58d04f5f574e8b6/order6.
**Produces:** reviewed actual dev runtime and Cloud readability evidence; broader goal remains active until its other requirements are met.

- [ ] After root source review, use a clean isolated h2 tree and bin/h2puni-gate.sh EXACT_SHA; the script acquires lock and checks out SHA. Observe the same durable handle to terminal. No h4 tests, raw full Nx or duplicate gate. Retain actual printed running SHA/exit/log; handle transient observation by repolling, never restart solely on timeout.
- [ ] Verify private/fleet remote ancestry and existing source PR branches. Perform the normal canonical public project projection into an isolated private worktree, prove five-tree byte equality and exact source snapshot before normal reviewed dev Git updates/CI. Keep licensed site tree unchanged from private89c.
- [ ] Use existing builder/pinner with new UTC-date/SHA release ID, environment development, analytics true/dev ID G-R0JM3R4SSV and AI0. H2 normal heavy lock only; actual published RepoDigests, manifests and compiled assets required. Preserve full13 ledger, API bytes, retention/activation/Secrets and compatible order6 rollback.
- [ ] Generate new development-only pin/order7 from fresh Fleet main, retain pinner selfcommit, format receipt separately preserving parsed equality. Focused Fleet tests/policy/format/OpenSpec, exact diff, concrete rollback and whole-package review precede normal publication. Stop on remote drift for root ruling; no force or unreviewed merge.
- [ ] Observe exact CI/automatic rehearsal/Flux/pods and actual served app CSS/source hashes, TLS/noindex/health and protected-state preservation. No manual h4 Job/drill/restart or production mutation.
- [ ] After actual ready, use standalone Browser Use Cloud v4 with existing secure key to verify night and manual edit/preview/email/receipt readability at desktop/mobile. Synthetic .test content only, no paid calls or operator credential, at most one labeled no-contact proposal for this repair acceptance. Track actual case outcomes and screenshots; stop the SDK session explicitly and verify stopped/cost. Do not claim complete analytics/account acceptance from this UI run.
- [ ] Independently review final development evidence, publish reviewed dev docs normally, preserve failure receipts and classify native-goal progress. Do not mark broader launch complete while pending requirements remain.
