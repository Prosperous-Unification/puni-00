## Context

WBS a81d93a0 moved the activation controller to Twilight Dash, but kept the `prepare-*-activation`
check runners in Burokrat (A32). The packed suite runs them from the installed `bin.mjs`, and
moving them needed a way to carry measured instants across the tool boundary. This change is that
way. ADR 0052 records the decision and the rejected alternatives.

## Shape

```
twilight-dash run-activation-checks ──▶ <dir>/check-runs.json   (CheckRunLedger)
          │  plans through judge            <dir>/streams/<sha256>
          ▼
planCandidateCheckRuns (Burokrat, via @twilight-burokrat/judge)
          ▲
prepare-*-activation --check-runs <dir>
   planRelocationChecks → planCheckRuns → readCheckRuns(dir, plan, dashCheckRunAuthority)
   → retainCheckRuns(work) → planRelocationActivation (receipts, R16 failed/skipped) → …
```

- **One derivation.** `planCandidateChecks` (policy, declarations and tree in; commands and
  candidate identity out) is what `planRelocationChecks` returns after its base-relative
  assertions, and what Dash calls through `planCandidateCheckRuns`. `planCheckRuns` resolves skip
  probes against the Nx projects for both. Dash therefore runs exactly the argv the preparer
  expects.
- **Records.** `CheckRun` v1: `sequence`, `previous` (canonical SHA-256 of the prior run, or
  `null`), `authority {product, command}`, `candidate {revision, identity}`, `checkId`,
  `startedAt`, `endedAt`, `check {command, exitCode, stdout, stderr}`, and `skipProbe` (the same
  fields plus `cwd` and `env`, or `null`). `CheckRunLedger` v1 holds `runs` and `head`, the digest
  of the last run or `null`. The schema is structural only; order, links and binding are
  judgments with typed reasons.
- **Streams by digest.** Bytes stay out of the record, so the record hashes small and the judge
  verifies each stream against its digest. The preparers concatenate check and probe streams into
  `--work/checks/<id>.std{out,err}` as before, and measure skips on the probe's streams when one
  ran (`measured`).
- **Authority.** The judge facade's modules may not name Dash (`judge-facade.test.ts`), so
  `check-runs.ts` takes the expected recorder as a parameter. Both preparers pass
  `dashCheckRunAuthority` from `check-run-authority.ts`, and Dash writes
  `activationCheckAuthority`. The golden ledgers pin that the two agree.
- **Clock.** Dash stamps `new Date(clock.read()).toISOString()` from `DashDependencies.clock`; its
  no-ambient-clock scan is unchanged. Burokrat compares recorded instants only.

## Golden ledgers

`createRelocationCandidate({ reproducible: true })` pins Git identities, dates and configuration,
and replaces the workspace-copied validator, snapshotter and launcher with placeholders that
toolkit mode never rebuilds. The same files therefore always make revision
`16b738d9a5441cc67eaaef2359792f56e3f1176a`, or `df4480c8…` with `skippingCheck`. Only
`.bun-version` still comes from the workspace, so a Bun upgrade moves both revisions.
`relocation-fixture-cli.ts` prints such a candidate for processes that cannot import Burokrat. The
ledgers under `fixtures/check-runs/{passing,skipping}` were written by a real
`run-activation-checks` run. Three tests cover them:

- `check-run-golden.test.ts` pins their digests, binds them to the reproducible candidates and
  judges them.
- Dash's test reproduces their bytes from the recorded parts with a scripted clock and executor.
- The packed suite prepares through the installed `bin.mjs` from them.

## Risks

- **The chain does not authenticate.** It detects partial edits, reordering and truncation, but
  anyone who can write the ledger can recompute it. That is the same trust as the operator
  attestation the preparers already take. A signature is a later, additive schema version.
- **External consumers need Dash.** The npm toolkit cannot prepare without a ledger, and Dash is
  not yet published. The consumer README says to run Dash from a source checkout. A Burokrat
  release should wait for a distributable Dash runner (see the lane record).
- **Golden rot.** Fixture builder or Bun changes need a regeneration; the golden test fails naming
  the README procedure.
