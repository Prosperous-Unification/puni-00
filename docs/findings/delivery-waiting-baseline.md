# Planning evidence

Planning inspection: 2026-10-25. Repository base: `830e774d2`. This packet is a proposal, not implemented observability or an improvement claim.

## Existing work to preserve

- [Change-aware CI](../../openspec/changes/change-aware-ci/design.md): reviewed docs-only paths, conservative affected-module selection and opt-in file selection. Full push/manual/host gates intentionally remain full.
- [Gate duration findings](ci-gate-duration.md): prior parallel workspace/Twilight work and historical bottlenecks.
- [Delivery tracking](../../openspec/changes/track-work-delivery/design.md): provider-neutral observations and retry attribution, without durable deployment timing history.
- [Gate hosts](../infra/gate-hosts.md) and [FIFO lock](../../openspec/changes/fifo-heavy-lock/proposal.md): two hosts with independent locks; FIFO within each host, no capacity priorities.
- `libs/shared/domain/delivery/src/timing.ts`: attempt-start waiting is not scheduler queue waiting; parallel work and elapsed span are distinct.
- `apps/twilight-structure/twilight-burokrat/cli/src/contracts/records.ts` (`ElapsedReceipt`) and `src/experiments/accounting.ts`: retained intervals, failed/censored attempts and recomputable trial accounting. Dash review telemetry consumes those contracts; its activation store is a separate authority.

## Retained historical example

The sanitized snapshot below retains source identities, timestamp fields, job URLs and SHA-256 identities of original files. CI timestamps support direct recomputation. Host queue durations are an operator receipt, not new structured instrumentation.

| Observation                                                                                                  | Measured interval                                       | Interpretation                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Workspace job](https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665171528) | 21:27:20–22:39:41 UTC, 2026-10-23: 72m21s               | Entire job, including its setup and verification phases; not a single test duration                 |
| [Twilight job](https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665171527)  | 21:27:20–22:16:25 UTC: 49m05s                           | Overlaps workspace; durations must not be summed as end-to-end time                                 |
| Verification request to gate completion                                                                      | Run created 21:26:50 to gate completed 22:39:45: 72m55s | Historical request-to-verdict proxy with its explicit endpoints; not pure execution or runner queue |
| Dev tooling-image lock waits, 2026-10-24                                                                     | 1800s timeout + 926s to acquisition = 45m26s            | Includes unsuccessful wait; excludes unknown retry gap and image build time                         |

These observations do not establish the current workload distribution, a critical path inside Nx, queue demand on other hosts, or a matched baseline. The earlier 72m56s figure used run `updated_at`; use the actual gate completion endpoint above instead. That one-second distinction demonstrates why the measurement basis must travel with every number.

## Planning validation

- `openspec validate measure-delivery-waiting --strict --json`: 1 passed, 0 failed, no issues. Initial long-requirement warnings were corrected before this result.
- `openspec validate --all --json`: 286 passed, 0 failed (268 changes, 18 specs).
- Prettier check of all seven changed files: passed. `git diff --cached --check`: passed.
- Whole-repository `nx format:check --all`: requested; final outcome is recorded in the PR because it was still running when this receipt was written.
- Runtime tests, builds, live collection/deployment and safety mutation proofs: not run for this documentation-only change. No new runtime check is implemented or claimed proved.

`verify.md` is deliberately deferred until apply, as required by the active OpenSpec schema. All implementation tasks remain unchecked; the CLI therefore still reports the overall change incomplete and it is not ready to archive. The PR records the final commit's CI selection and status without an evidence-only commit that would restart CI.

## Historical source snapshot

This is a sanitized planning sample, not the proposed receipt wire format.

```json
{
  "kind": "historical-planning-evidence",
  "implementationBaseline": false,
  "reviewedOn": "2026-10-25",
  "sourceRevision": "c538ad196a8e8d4d016bf6d9c53d02cbbc3acf7f",
  "sourceFiles": [
    {
      "name": "run-c538-attempt-1.json",
      "sha256": "6f1f0965f303f4679cd115e0d5a5a98553e86a776697e3186ce35b74c7c4ecbf"
    },
    {
      "name": "jobs-c538-attempt-1.json",
      "sha256": "1f3739a91de5a0fe0e9c149bb68d0ebc37201a71c65515d58f86f0417d60461b"
    },
    {
      "name": "puni-dev-deployment-20261024.md",
      "sha256": "1033dfff8311caf3085379b83096a932f69e5e0fcab26b0a90864401a7a088bb"
    }
  ],
  "run": {
    "id": 40026823644,
    "run_attempt": 1,
    "head_sha": "c538ad196a8e8d4d016bf6d9c53d02cbbc3acf7f",
    "created_at": "2026-10-23T21:26:50Z",
    "run_started_at": "2026-10-23T21:26:50Z",
    "updated_at": "2026-10-23T22:39:46Z",
    "conclusion": "success",
    "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644"
  },
  "jobs": [
    {
      "id": 120664980927,
      "name": "gate_mode",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:26:52Z",
      "completed_at": "2026-10-23T21:27:18Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120664980927"
    },
    {
      "id": 120665171527,
      "name": "gate twilight",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:20Z",
      "completed_at": "2026-10-23T22:16:25Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665171527"
    },
    {
      "id": 120665171528,
      "name": "gate workspace",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:20Z",
      "completed_at": "2026-10-23T22:39:41Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665171528"
    },
    {
      "id": 120665171645,
      "name": "pixels_mode",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:20Z",
      "completed_at": "2026-10-23T21:27:44Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665171645"
    },
    {
      "id": 120665174237,
      "name": "gate docs",
      "status": "completed",
      "conclusion": "skipped",
      "started_at": "2026-10-23T21:27:18Z",
      "completed_at": "2026-10-23T21:27:18Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665174237"
    },
    {
      "id": 120665350144,
      "name": "pixels shard 2/4",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:46Z",
      "completed_at": "2026-10-23T21:54:28Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665350144"
    },
    {
      "id": 120665350161,
      "name": "pixels shard 4/4",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:46Z",
      "completed_at": "2026-10-23T21:50:42Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665350161"
    },
    {
      "id": 120665350189,
      "name": "pixels shard 3/4",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:46Z",
      "completed_at": "2026-10-23T21:42:35Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665350189"
    },
    {
      "id": 120665350194,
      "name": "pixels shard 1/4",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:27:46Z",
      "completed_at": "2026-10-23T21:47:04Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120665350194"
    },
    {
      "id": 120675892408,
      "name": "pixels",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T21:54:31Z",
      "completed_at": "2026-10-23T21:54:35Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120675892408"
    },
    {
      "id": 120692299980,
      "name": "gate",
      "status": "completed",
      "conclusion": "success",
      "started_at": "2026-10-23T22:39:43Z",
      "completed_at": "2026-10-23T22:39:45Z",
      "html_url": "https://github.com/Prosperous-Unification/puni-00/actions/runs/40026823644/job/120692299980"
    }
  ],
  "hostQueue": {
    "sourceKind": "retained-operator-receipt",
    "date": "2026-10-24",
    "waitsSeconds": [1800, 926],
    "outcomes": ["timed-out", "acquired"],
    "retryGapSeconds": null,
    "currentBaseline": false
  },
  "limits": [
    "Single historical CI attempt, not a matched cohort.",
    "Run updated_at is retained as provenance, not used as completion.",
    "Host wait figures are from an operator receipt; no structured enqueue/acquisition records retained here.",
    "No provider queue eligibility evidence.",
    "No instrumentation, comparison implementation or speedup proved by this file."
  ]
}
```
