## 1. Exact source/check acceptance

- [x] 1.1 Implement provider-neutral deployment verification and selected-image claim predicates — tests: provenance.test.ts accepts equivalent providers; negative: wrong source/reference/pipeline/trigger, failed/cancelled/incomplete/absent/duplicate verdicts and wrong tier/digest/tag; watch guard removal fail.
- [x] 1.2 Add supported-origin discovery and bounded GitHub normalization over the existing shared transport — tests: provenance-github.test.ts complete latest execution/attempt; negative: unsupported origin, missing/malformed/unavailable/incomplete records, earlier green retry, carried-check identities and changing observations; watch dependency and guard-removal proofs.

## 2. Image admission and production call path

- [x] 2.1 Reuse digest-verified OCI metadata under one selected-image budget and authority-bound existing credentials — tests: provenance-images.test.ts; negative: absent/wrong frontend label, corrupt manifest/config, credential destination mismatch and redirect. Observe fault/removal proofs.
- [x] 2.2 Integrate immutable selected release entries and provider/image verification into the supported CLI before remote preflight/swap — tests: provenance-cli.test.ts and legacy-delivery.test.ts; negative: invalid release, wrong/missing/failed/cancelled verification, stale executor and frontend-only mismatch all leave swap trace empty. Dry-run remains visibly unverified.

## 3. Verification and release

- [ ] 3.1 Complete production-path fault/removal proofs and adjacent Proof comments, run affected tests/lint/type/build, OpenSpec/current docs/format and canonical host gate; record actual evidence and limitations in verify.md.
- [x] 3.2 Update owning runbook and get independent safety/spec review; prepare clean commits/PR with passing exact-head required CI verdicts.
- [ ] 3.3 Push and merge the implementation, including its reviewed prior audit artifacts; verify main ancestry, final source/check state and release scope. Application rollout, if requested, must meet the existing candidate, executor, env/migration/solver and recovery prerequisites.
