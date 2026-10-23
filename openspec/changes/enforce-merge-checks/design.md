## Context

The 2026-10-23 API baseline reports no active main rules, no classic branch protection, and administrator access for the current operator. Existing `gate` and `pixels` checks are produced by GitHub Actions integration 15368. Their production reducers already fail on failed, cancelled, absent or unexpectedly skipped selected dependencies; a fresh 23-test baseline passed.

## Goals / Non-Goals

Enforce those existing verdicts while preserving docs-only selection, affected modules, parallel PRs and zero mandatory reviews. This is a reversible repository-settings activation with documentation, not a new CI service. It is the bounded enforcement slice of roadmap W04, not full W04 acceptance.

## Decisions

Create one active branch ruleset for exactly `refs/heads/main`. Require pull requests with zero approvals and both contexts pinned to integration 15368. Use no bypass actors. Add no queue, status publisher, required leaf jobs or new runner work. Leave other rulesets and repository merge methods unchanged.

Disable latest-base strictness to avoid repeated builds after unrelated merges. This is loose required-check enforcement. The tested synthetic PR merge remains authoritative for that run; full main checks remain as implemented. The earlier CI source commentary describes a merge queue as a prerequisite for proving composed trees. This activation does not satisfy that premise or claim composed-tree proof. Qualifying a merge queue is outside this explicit no-serialization scope.

Use head-pinned REST merge requests for live refusal and acceptance evidence. Exercise faults using disposable branches and harmless prose changes. Deliberately invalid prose must never merge to main. Prove rule-removal causality on a separate disposable target, then delete the temporary policy or narrow it away without touching main enforcement. Record exact HTTP responses rather than interpreting only CLI exit codes.

## Risks / Trade-offs

GitHub natively accepts top-level skipped or neutral checks; the current aggregates use `always()` and their own reducers to reject unexplained leaf skips. Pinning GitHub Actions prevents another producer from replacing a missing Actions verdict, but does not establish independent trust in candidate-edited workflow definitions. Administrators can edit policy; no immutable administrator boundary is claimed.

Loose enforcement can accept a PR whose tested base predates the latest main. New incompatible combinations can therefore fail after merge. No automatic approval, queue or repeated full gate is introduced to hide that trade-off. Existing infrastructure CI main-run cancellation and protected workflow policy remain separate W04 gaps; neither is changed or claimed fixed here.

## Migration Plan

Capture current settings and the intended payload before activation. Rehearse the same policy on a disposable target, including actual refusals and a rule-removed control. Activate main only after the contexts and a successful rehearsal are established. Exercise harmless main refusals and a real passing docs-only merge. Read back all effective rules afterward and record timing and recovery commands.

## Open Questions

None blocks the bounded activation. Full composed-tree qualification, independent workflow authority and complete infrastructure verdict retention remain explicit W04 work.
