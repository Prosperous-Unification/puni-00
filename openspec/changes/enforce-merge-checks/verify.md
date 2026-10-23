# Main merge-check enforcement verification

Completed live qualification on 2026-10-23 UTC. [Main merge checks, rule 25730010](https://github.com/Prosperous-Unification/puni-00/rules/25730010) is active. [PR #688](https://github.com/Prosperous-Unification/puni-00/pull/688) merged without reviews or bypass after three actual refused requests. This records the bounded W04 enforcement slice; the [operator procedure](../../../docs/findings/merge-check-enforcement-2026-10-23.md) owns recovery.

## Policy and source boundary

Baseline main was `3eb42b82b4502a6cb72ff053601ea9025432fc4e`: effective branch rules `[]`, classic protection HTTP 404. The only existing ruleset was release-tag rule 23794440. Creation began at 14:49:14 UTC (API created_at `2026-10-23T17:49:14.487+03:00`). Final readback:

| Field                 | Observed value                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Rule source           | Repository `Prosperous-Unification/puni-00`, ID 25730010, name `main merge checks`                           |
| Scope and enforcement | branch, active, include exactly `refs/heads/main`, exclude `[]`                                              |
| Bypass                | bypass_actors `[]`, current_user_can_bypass `never`                                                          |
| Pull requests         | required approvals 0; code-owner, last-push, stale-review dismissal and thread-resolution requirements false |
| Required checks       | exactly `gate` and `pixels`, each integration_id 15368 (`github-actions`)                                    |
| Freshness             | strict_required_status_checks_policy false; do_not_enforce_on_create false                                   |
| Other policy          | complete tag rule 23794440 unchanged; no queue or required leaf jobs                                         |

The exact reviewed creation payload is retained in the operator procedure and `/tmp/puni-merge-enforcement-main/payload.json`. `final-rule.json`, `final-main-effective-rules.json`, `final-rulesets.json` and `final-tag-rule.json` retain final API responses. All submitted fields match readback; the full final main rule equals its activation response. GitHub also canonicalizes `required_reviewers=[]`, disabled dismissal restriction, allowed merge methods merge/squash/rebase and `require_extra_approval_for_unattributed_changes=true`. The latter has no effect with zero required approvals, per [GitHub's rule documentation](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#additional-approval-for-unattributed-copilot-pull-requests). Successful acceptance independently records reviews `[]`.

Source contract range: baseline `3eb42b82b4502a6cb72ff053601ea9025432fc4e` through `6f72a900cc78fcbcca3a2b0d864c15ab025a1448`; this subsequent record changes only this verify file, tasks and the operator finding. The separately accepted production proof changes only `docs/findings/ci-gate-duration.md`. Application source, workflows, reducers, selectors and dependencies were not changed. Delta specs remain pending sync; no archive was requested.

## Main refusals and acceptance

These are sanitized literal request bodies, HTTP status lines and complete response bodies; authentication headers are omitted. All requests were administrator-originated, head-pinned REST merges with no bypass. The main SHA independently read before and after **each refusal** remained `3eb42b82b4502a6cb72ff053601ea9025432fc4e`.

### Missing, 14:49:50 UTC

Head `eb0aa4d2c9fbd045f12f46073772b5615c881e35` used `[skip ci]`; check response was empty. GitHub returned a null synthetic merge SHA at observation; no retrospective identity is invented.

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/688/merge
Content-Type: application/json

{"sha":"eb0aa4d2c9fbd045f12f46073772b5615c881e35","merge_method":"merge"}

HTTP/2.0 405 Method Not Allowed
{"message":"Repository rule violations found\n\n2 of 2 required status checks are expected.\n\n","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}
```

Proof: suppressing Actions with `[skip ci]` produced zero required checks and the actual request above was refused; absence blocks integration.

### Failed, 14:53:23 UTC

Head `46626fbdc210a1a5b3ef8ac26d51d3f9ba216b1f`, tested merge `d05011795284eb17b179086d06924d51bb1fcd81`, deliberately linked to absent `docs/findings/missing-merge-policy-proof-target.md`. [CI 39972998437](https://github.com/Prosperous-Unification/puni-00/actions/runs/39972998437) failed Current documents. Actual Actions gate 120481476232 failed; pixels 120480662389 succeeded.

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/688/merge
Content-Type: application/json

{"sha":"46626fbdc210a1a5b3ef8ac26d51d3f9ba216b1f","merge_method":"merge"}

HTTP/2.0 405 Method Not Allowed
{"message":"Repository rule violations found\n\nRequired status check \"gate\" is failing.\n\n","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}
```

Proof: the injected absent Markdown target failed the production document check and gate, and the exact failed head was refused. The final head removes the fault; it never merged into main.

### Native cancelled pixels, 14:58:18 UTC

Final head `36846dbbeb53d271c5456fe2271d1378997c1f71` had successful gate 120484125491 and native cancelled pixels 120484123452, both Actions 15368. Unlike the rehearsal's mixed missing/cancelled state, cancellation was the sole required-check fault.

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/688/merge
Content-Type: application/json

{"sha":"36846dbbeb53d271c5456fe2271d1378997c1f71","merge_method":"merge"}

HTTP/2.0 405 Method Not Allowed
{"message":"Repository rule violations found\n\nRequired status check \"pixels\" is cancelled.\n\n","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}
```

Proof: a bounded pixels-only rerun followed by force-cancel created an actual cancelled required check; successful gate plus cancelled pixels was refused explicitly for pixels. No deliberate failing content was needed.

### Accepted, request 15:00:16 UTC; merged 15:00:19 UTC

The same final head recovered pixels. Actual Actions 15368 gate 120484623472 and pixels 120484563131 succeeded; reviews were `[]`.

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/688/merge
Content-Type: application/json

{"sha":"36846dbbeb53d271c5456fe2271d1378997c1f71","merge_method":"merge","commit_title":"docs: record enforced main merge checks (#688)"}

HTTP/2.0 200 OK
{"sha":"e70166d28f64d0ebb81069a57ef169edd182c8f5","merged":true,"message":"Pull Request successfully merged"}
```

Main advanced only at acceptance to `e70166d28f64d0ebb81069a57ef169edd182c8f5`. Check runs attach to the PR head; queried synthetic merge check arrays are empty. The immutable plan tested `9b2eac58d2a542c1bb9272906283e772c0f2eb5b`; GitHub later regenerated `0873c5aa1e62888e52ec746ba27692776a39e8bf`. Both and the actual accepted merge have tree `10f94ed6e5dee69be21328153a90bd199d1fae0f` and ordered parents `[3eb42b82b4502a6cb72ff053601ea9025432fc4e, 36846dbbeb53d271c5456fe2271d1378997c1f71]`. Timestamp metadata changed; source/composition did not.

## Isolated causal controls and censored attempts

Temporary rule 25729375 targeted only `refs/heads/proof/enforce-merge-checks-20261023-143703-target`, with equivalent required checks, producer binding, zero reviews and loose freshness. Main policy was never weakened. All rehearsal main snapshots stayed at the baseline SHA.

### Producer binding control, PR #683

[PR #683](https://github.com/Prosperous-Unification/puni-00/pull/683) head `4926f493ccc7367607ffa5ab3e02c3a5583a8346` first received HTTP 405 for two expected checks. Same-name successful operator statuses then produced this refusal:

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/683/merge
Content-Type: application/json

{"sha":"4926f493ccc7367607ffa5ab3e02c3a5583a8346","merge_method":"merge"}

HTTP/2.0 405 Method Not Allowed
{"message":"Repository rule violations found\n\nRequired status checks \"gate\" and \"pixels\" were not set by the expected GitHub apps.\n\n","documentation_url":"https://docs.github.com/rest/pulls/pulls#merge-a-pull-request","status":"405"}
```

Only the two integration_id fields were removed from the disposable rule; the identical head then merged:

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/683/merge
Content-Type: application/json

{"sha":"4926f493ccc7367607ffa5ab3e02c3a5583a8346","merge_method":"merge"}

HTTP/2.0 200 OK
{"sha":"3c112808dd5da7c28360e9683d69a63410909c8a","merged":true,"message":"Pull Request successfully merged"}
```

Proof: successful wrong-producer statuses failed with binding present and succeeded with only binding removed. Binding was restored and read back immediately.

### Failed-check control, PR #686

[PR #686](https://github.com/Prosperous-Unification/puni-00/pull/686) head `89d4655aa3a6fbec3156ba9c5991fa931408c2d0` deliberately linked an absent Markdown target. Actual Actions gate 120477065787 failed and pixels succeeded; head-pinned PUT returned HTTP 405 with the same failing-gate response as the main failed case. Only required_status_checks was removed; the pull_request rule remained:

```http
PUT /repos/Prosperous-Unification/puni-00/pulls/686/merge
Content-Type: application/json

{"sha":"89d4655aa3a6fbec3156ba9c5991fa931408c2d0","merge_method":"merge"}

HTTP/2.0 200 OK
{"sha":"6d77d79332a460199010859e24aced83b9ae843b","merged":true,"message":"Pull Request successfully merged"}
```

Proof: the identical failing head was refused with checks present and accepted after removing only their rule, exclusively into the disposable target. The complete pinned rule was restored and read back before cleanup.

Other observed attempts and limitations:

- [PR #684](https://github.com/Prosperous-Unification/puni-00/pull/684), head `91d59ae24d39f290d9e6dbfbb643fcf05176f569`: normal cancellation of run 39971197241 cancelled selected dependencies; always() aggregates gate 120474253139 and pixels 120474253527 both reduced to failure. HTTP 405 said `2 of 2 required status checks are failing.` This proves cancellation reduction, not native cancelled aggregates.
- [PR #687](https://github.com/Prosperous-Unification/puni-00/pull/687), head `2e983f972b11afe2ceab9a2cd208a2c0be995e0b`: early force-cancel of run 39971570867 created only absence. One rerun then produced native cancelled pixels 120476235014 alongside absent gate. HTTP 405 said `2 of 2 required status checks have not succeeded: 1 expected.` This mixed state does not isolate cancellation; main #688 does.
- [PR #685](https://github.com/Prosperous-Unification/puni-00/pull/685), head `daaaa7e24a447b1a6e927c17452a9aa10008471b`, edited a runbook the selector treats as affected code. Mistaken affected run 39971205447 was cancelled when observed; PR closed unmerged. Replacement #686's downloaded plan is docs with zero projects, base `3c112808dd5da7c28360e9683d69a63410909c8a`, tested merge `76d1a25314b1884a3b802ddfcc4487823049adc4`.
- Main evidence helper initially asserted a generic cancellation message; the actual valid 405 instead named cancelled pixels. It stopped and resumed with invariant reads/recovery without a repeated merge request. A later preflight rejected changing synthetic object IDs before sending acceptance; comparing trees and ordered parents resolved the metadata-only difference. Neither helper failure changed settings or reran document checks.

Temporary rule deletion returned HTTP 204, subsequent readback HTTP 404; all six owned rehearsal refs were deleted with HTTP 204. PRs 683/686 merged only into the deleted disposable target; 684/685/687 closed unmerged. No owned rehearsal CI remained queued/running. Main #688's source ref deletion returned HTTP 204. Final main rule and unrelated release-tag rule were read back and preserved.

## Selection and measured throughput

Final [CI 39973519519](https://github.com/Prosperous-Unification/puni-00/actions/runs/39973519519), artifact **12509368709**, digest `sha256:b35d7094b7a12098e184e908bdce699f7aaa90085d86e962d48fcd46c456a330`, retains this actual downloaded attempt-1 selection:

```json
{
  "schemaVersion": 1,
  "base": "3eb42b82b4502a6cb72ff053601ea9025432fc4e",
  "head": "9b2eac58d2a542c1bb9272906283e772c0f2eb5b",
  "mode": "docs",
  "twilight": "skip",
  "projects": [],
  "workspaceProjects": [],
  "twilightProjects": [],
  "reasons": [
    "Only reviewed narrative paths and supported index memberships changed; documentation validation required"
  ],
  "tests": []
}
```

Attempt 1 executed document checks once: Format, Current documents, Secrets scan, Private nesting, Doc caps and OpenSpec passed (272 passed, 0 failed in that CI log). Workspace, Twilight and browser shard leaves deliberately skipped. Both aggregates executed and succeeded. Failed-head artifact 12508709721 separately records docs mode with zero projects and tested merge `d05011795284eb17b179086d06924d51bb1fcd81`; its document failure is preserved.

| Actual attempt-1 job/check | Created UTC | Started  | Completed | Queue | Execution |
| -------------------------- | ----------- | -------- | --------- | ----- | --------- |
| gate_mode 120482080243     | 14:53:36    | 14:53:38 | 14:53:56  | 2s    | 18s       |
| gate docs 120482247592     | 14:53:57    | 14:53:59 | 14:57:12  | 2s    | 193s      |
| pixels_mode 120482247666   | 14:53:57    | 14:53:59 | 14:54:18  | 2s    | 19s       |
| pixels 120482424007        | 14:54:18    | 14:54:20 | 14:54:22  | 2s    | 2s        |
| gate 120483863235          | 14:57:12    | 14:57:15 | 14:57:18  | 3s    | 3s        |

Positive CI creation to both required successes was **222s**, including job queues. Eligibility preceded the deliberate cancellation probe. Attempt 2 reran only pixels; the third bounded discovery poll found it queued and force-cancel returned HTTP 202. Pixels was created/started 14:57:44 and cancelled 14:57:45, with no steps. The bound was 30 half-second discovery intervals plus API latency; one cancellation attempt sufficed. Attempt 3 reran only cancelled pixels: created 14:58:36, started 14:58:39, succeeded 14:58:43 (3s queue, 4s execution).

Native partial reruns copy successful job records under new IDs; docs/gate retained original attempt-1 timestamps and were **not reexecuted**. Copied skipped rows sometimes complete before their new created_at, so they cannot supply execution measurements. The final head had one document-check execution; pixels-only cancellation/recovery was deliberate proof overhead, not a base-refresh requirement or repeated test suite.

The 96s from recovered success to merge covered evidence/tree verification, not tests or mandatory review. PR creation 14:49:48 to merge 15:00:19 was 10m31s including faults; positive CI creation to merge was 6m43s including probe/recovery. Neither is a normal docs latency benchmark and no new time threshold is claimed.

## Requirement and scenario coverage

| Delta requirement/scenario                             | Evidence and boundary                                                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Main enforced PR verdicts / failed, cancelled, absent  | Main #688's three pinned HTTP 405s, actual check identities and invariant reads above; no standing admin bypass                   |
| Other producer                                         | #683 wrong-producer refusal and binding-only removal accepted control                                                             |
| Isolated removal                                       | #686 same failed SHA refused then accepted only on disposable target                                                              |
| Existing delivery / docs pass                          | #688 HTTP 200, immutable docs plan, zero reviews, one real document execution, deliberate leaf skips and measured queue/execution |
| Unrelated main advance                                 | strict policy false in actual readback; no actual unrelated-main-advance exercise performed, no composed-tree safety claim        |
| Attributable operations / missing verdict and recovery | Before/final rule snapshots, all literal exchanges, exact SHAs, cleanup and linked operator procedure                             |

## Local checks and remaining limits

Pre-record baseline supplied by root: 23 existing reducer tests passed, 279 assertions, 1.089s; whole-repo formatter exit 0 with empty output; 273 OpenSpec items valid; existing focused docs target passed 4 tests/root migration in 10.2s. Record validation, with the new verify file staged before the docs guard:

| Command                                               | Observed outcome                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bunx nx run tool-devsync:check:docs --skip-nx-cache` | exit 0; current documents/indexes verified, 4 tests passed, root migration checked |
| `bunx nx format:check --all`                          | exit 0, empty output                                                               |
| `./node_modules/.bin/openspec validate --all --json`  | exit 0; 273 passed, 0 failed; existing warnings retained                           |
| `git diff --cached --check`                           | exit 0                                                                             |

Seven embedded HTTP request/status/body exchanges were compared directly with raw evidence and matched; local Markdown links resolve. All five tasks are checked. Supplemental final command logs and timings are `/tmp/puni-merge-enforcement-main/task3-{docs,format,openspec}.log` and their `-summary.json` companions; the commit/report is `/tmp/puni-merge-enforcement-main/task3-report.md`.

Full local Nx runtime/typecheck/build and h2/h4 host gates are **UNRUN** for this settings/prose scope; no new tests were written. No deployment, direct-push refusal or unrelated-main-advance exercise was performed. Production docs-only eligibility is proved by actual main PR #688; it does not validate these later local records or application runtime suites. Existing postmerge full CI 39974492125 was queued and Dynamic Push on main 39974490342 in progress at the final operational observation; neither was cancelled or claimed successful. Full main CI and the separate infrastructure main-cancellation gap remain unchanged.

GitHub natively accepts top-level skipped/neutral required check conclusions; existing always() reducers reject unexplained selected-leaf skips. Actions producer binding does not protect against candidate-edited workflow definitions. Loose freshness does not prove composition after later main changes. Administrators can edit rules. No immutable policy, queue qualification or complete W04 closure is claimed.

Supplemental sources: `/tmp/puni-merge-enforcement-main/report.md`, `summary.json`, exact `*-request.json`/`*-http.txt`/check snapshots, selection ZIP and `commands.jsonl`; `/tmp/puni-merge-enforcement-rehearsal/report.md` and equivalent raw responses. Read-only reviews `/tmp/puni-merge-policy-review.md`, `/tmp/puni-merge-rehearsal-review.md`, `/tmp/puni-merge-main-review.md` found the planned gap then confirmed completed main/rehearsal evidence with no material findings. Durable proof above remains reviewable without those temporary files.
