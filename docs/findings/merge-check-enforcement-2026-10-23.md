# Main merge checks

Main requires the stable `gate` and `pixels` verdicts produced by GitHub Actions.
The active repository ruleset is [main merge checks — 25730010](https://github.com/Prosperous-Unification/puni-00/rules/25730010),
created at 2026-10-23T17:49:14.487+03:00. Its contract belongs to
[the owning change](../../openspec/changes/enforce-merge-checks/design.md).
[Completed qualification](../../openspec/changes/enforce-merge-checks/verify.md) records
the exact refused/accepted requests, candidate identities, producer controls and timing.

## Normal delivery

1. Open a pull request targeting main and push the intended candidate.
2. Let the existing CI selection choose docs-only checks or affected runtime modules.
3. Wait for `gate` and `pixels` on the current candidate, then merge normally.

No human approval count, deployment prerequisite or merge queue is added. Optional
leaf checks are not required globally: a docs-only candidate succeeds through its
real document/security checks while application runtime, build and browser suites
remain deliberately skipped. The two aggregate jobs still execute and validate the
selection. A failed, cancelled or absent required verdict blocks merging; a new
candidate must earn its own verdicts. Repair or rerun the failed work rather than
posting a manual success status.

Proof: main PR #688 was refused with no checks, failed gate and native cancelled
pixels (successful gate). The repaired docs-only head then merged normally with zero
reviews. Isolated PR #686 merged its identical failed head only after removing the
required-check rule from the disposable target; main enforcement stayed active.

Latest-base strictness is disabled. An unrelated merge does not itself require a
base refresh or another test run. Merge conflicts still need resolution. This
policy proves the PR candidate tested by CI; it does not prove compatibility with
changes merged after that candidate's tested base. Existing full checks on main
remain enabled. Parallel PRs are not serialized by this policy.

## Read back the policy

```sh
gh api repos/Prosperous-Unification/puni-00/rules/branches/main
gh api repos/Prosperous-Unification/puni-00/rulesets
```

Check that main has both `pull_request` and `required_status_checks`, that the
required contexts are exactly `gate` and `pixels` from integration **15368**
(`github-actions`), and that the named ruleset is active with no bypass actors.
Approvals are zero and `strict_required_status_checks_policy` is false. Read the
complete ruleset by its returned ID to inspect bypass actors and branch conditions.
For the recorded activation, use `gh api repos/Prosperous-Unification/puni-00/rulesets/25730010`.
GitHub adds canonical PR defaults, including an extra unattributed-Copilot approval
setting; [that setting has no effect with zero required approvals](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#additional-approval-for-unattributed-copilot-pull-requests).
Preserve unrelated organization/repository rules; the existing Burokrat release-tag
rule is not part of this policy.

The reviewed payload is:

```json
{
  "name": "main merge checks",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "required_status_checks": [
          {
            "context": "gate",
            "integration_id": 15368
          },
          {
            "context": "pixels",
            "integration_id": 15368
          }
        ],
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false
      }
    }
  ]
}
```

## A required verdict is missing or red

Inspect the current candidate's CI jobs and selection artifact. `gate` and `pixels`
are stable aggregate names; path-filtered jobs and individual shards are not
substitutes. Check for a renamed aggregate, workflow trigger omission, cancelled
run or failed selector. A successful job on an older candidate does not validate a
new commit. A manual dispatch does not automatically satisfy a PR check.

Fix the workflow or candidate and run the applicable checks. Rerun only failed work
when GitHub supports it and the candidate is unchanged. Keep the original failure
and the rerun visible in the evidence. Never alter the policy to declare a missing
or failed check successful.

The source binding prevents another status producer from replacing GitHub Actions.
Proof: isolated PR #683 had successful same-name operator statuses and was refused
for the unexpected producer; removing only producer binding allowed the identical
head to merge on the disposable target. The binding was restored and read back.

GitHub itself accepts top-level skipped/neutral check conclusions. Current aggregate
jobs use `always()` and reducers that reject unexplained selected-leaf skips. This
is not independent protection against a candidate that deliberately edits its own
workflow to emit a misleading verdict. That trust boundary needs a separately
qualified policy.

## Attributable emergency recovery

There is no standing administrator or automation bypass. An administrator can still
edit the ruleset; that is an explicit, auditable policy change, not an immutable
security boundary. Before an emergency change, record the incident, operator,
current candidate, reason, intended window and restoration condition. Export the
current named ruleset and effective main rules before editing anything.

Prefer repairing the check or its required context. If a policy edit is necessary,
change only **main merge checks** by its recorded ID. Keep its before/after payloads,
leave all unrelated rules intact, and do not silently remove failed evidence. After
the repair, restore the reviewed active payload and read back the effective rules.
A claimed restoration without that readback is incomplete.

## Acceptance boundary

This activates the bounded enforcement portion of readiness roadmap W04. It does
not qualify merge-queue composition, protect candidate workflow edits independently,
or repair infrastructure workflow cancellation on main. Application, deployment,
fleet and release behavior is outside this change. The verification record lists
the actual live refusal/control/acceptance evidence and measured time; the payload
alone is not proof that GitHub enforces it.
