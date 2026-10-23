## Why

Change-aware CI is merged, but main has no active branch rules or required checks. Failed or absent CI verdicts therefore do not prevent integration. Future platform work needs an enforceable merge boundary without another full test run, a review queue, or a deployment prerequisite.

## What Changes

Require pull requests and the existing stable `gate` and `pixels` checks from GitHub Actions on main, including for administrators. Keep approvals at zero, retain parallel PRs, and accept checks against the PR's tested merge tree without requiring a refresh after every unrelated main update. Preserve the existing docs-only and affected-module selection.

Retain live policy readback, actual refused merge requests for failed/cancelled/missing checks, a passing docs-only merge, timings, and a safe disposable-branch control showing enforcement disappears when the rule is removed. Provide an operator runbook and explicit recovery procedure.

## Non-Goals

No application, deployment, fleet, test-selection or release changes. No merge queue, mandatory human review, new CI service, or claim of proving composition with changes merged after a PR's tested base. This bounded W04 slice does not close all W04 concurrency or protected-policy requirements.

## Constraints

Use existing aggregate verdicts, not optional or path-filtered leaf jobs. Pin their producer to GitHub Actions. Do not add a standing bypass. Preserve unrelated rules and running CI. Restore any temporary proof policy before completion; never merge deliberate faults into main. Record stale-base composition, candidate-workflow authority and native skipped/neutral check semantics honestly.

## Capabilities

### New Capabilities

- `merge-check-enforcement`: enforced main merge eligibility with production negative and throughput evidence.

### Modified Capabilities

None.

## Domain Terms

None; required checks, verdicts and pull requests use existing CI terminology.

## Decisions Recorded

None. Repository rules are reversible operational settings.

## Impact

GitHub repository rules and an operator runbook. Existing CI source, application code and dependencies remain unchanged.
