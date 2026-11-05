# PostgreSQL evidence classification repair review

Reviewed on 2026-11-05. Source checkout: `/home/df/.codex/worktrees/bfde/puni-00`, HEAD `b1fd7fd15f59e8064d6e9286f0ba82cc723c880f` (B1). Review covers its three uncommitted tracked paths only: the two shipped wiki policies and `pilot-policy.test.ts`. No source, index, HEAD, branch, or fixture mutation was performed by this reviewer. This report is the only written artifact.

## Assessment

No Critical, Important, or Minor findings. The exact policy repair is suitable for the root's subsequent publication and required validation. This is not a merge, current-gate, future-documentation, evidence-publication, or PostgreSQL-provider acceptance certification.

The changes restore the existing precise classification contract: ten named binary archives receive `application/gzip`, an existing direct consumer, and external historical regeneration authority in both policy variants. No wildcard permission, content rule, reserved evidence root, validator, schema, assertion, SDK pin, or architecture changed. The only TypeScript change is the adjacent six-line `Proof` comment at `pilot-policy.test.ts:503`.

## Strengths and exact-source checks

- Fresh read-only Git inspection confirmed B1 and the three reported tracked edits. A structural comparison of each shipped JSON policy against its retained original and `git show B1:<policy>` proved that removing the ten new rows restores the original document exactly as a JSON value. Existing declarations and all other policy fields are preserved.
- Independently enumerated binary rows from `git diff --numstat 89b2c2eb..B1 -- openspec/changes/workflow-postgres-provider/evidence/`; the resulting ten paths exactly match the new declarations. Each new path appears once per policy. All ten on-disk archives equal B1 Git blob bytes and match the retained byte counts and SHA-256 identities; their gzip magic is present.
- The declared consumers are existing direct references to the corresponding exact archive: the two SDK release-delta documents, the integration/cleanup publication, the index packet manifest, the observer/operation-order/parallel-fixture/session publications, and the acceptance inventory document. The manifest's `file` field directly names the index packet. The external-authority strings describe historical capture regeneration as a new receipt, consistent with these consumers' historical evidence role.
- The production classifier selects binary declarations by exact path, retains the undeclared-binary refusal, and emits the declared metadata. The existing schema permits the selected external authority shape and rejects duplicate declaration paths. The reviewed change does not modify either mechanism.

The fresh source audit completed with:

```json
{
  "sourceAudit": "passed",
  "baseline": "b1fd7fd15f59e8064d6e9286f0ba82cc723c880f",
  "paths": 10,
  "exactPolicies": 2,
  "unchangedOtherPolicyFields": true,
  "archiveBytesMatchBaseline": true,
  "consumersCiteExactArchive": true,
  "allOmissionInputsExact": true,
  "ciRun": 41931100840
}
```

## Negative provenance and recorded test evidence

Read the frozen experiment, native capture helper, launcher, executed audit, declaration writer, and the relevant production CLI/classifier/schema and pilot fixture construction. Then performed a separate read-only Bun audit; did not rerun the worker's mutation experiment or tests.

For all 82 captures referenced by `audit-summary.json`, independently recomputed receipt, stdout/stderr, frozen helper, launcher, and harness hashes; checked captured argv, source-set identity, observed null signals, and closed-output-FD records. Bound both recorded source sets to current files or the original B1 pilot source, checking 506 source identities. Checked all input-policy hashes and before/after identities. The three changed input identities belong exactly to the authorized two-policy declaration write and proof-comment write; the original pilot's policy inputs bind to B1 originals. All 25 nonzero exits are the expected two original-policy refusals, one original pilot RED, twenty omission refusals, and two unlisted controls.

For every one of the twenty policy/path combinations, the retained omission input equals the corrected classification policy with only that path's row removed. Its native production CLI receipt exits 1, has empty stdout, and emits exactly `undeclared binary content at <omitted path>`. Every corresponding restoration exits 0 and emits all ten exact paths with full binary/application-gzip/consumer/external-authority metadata. The frozen experiment also compares the complete restored payload with its initial accepted payload.

Both unlisted sibling controls exit 1 naming the unlisted path. The retained Git `rev-parse` outputs for declared and unlisted paths contain the same blob ID, and the frozen experiment creates the sibling by copying the declared bytes before committing it. This supports exact-path classification, not blanket gzip acceptance. The owned classifier fixture is absent after recorded cleanup.

The separate audit completed with:

```json
{
  "reviewAudit": "passed",
  "captures": 82,
  "expectedNonzero": 25,
  "authorizedInputMutations": 3,
  "sourceSets": 2,
  "checkedSourceIdentities": 506,
  "omissions": 20,
  "restorations": 20,
  "unlistedControls": 2,
  "fixtureAbsent": true
}
```

The directory now also contains the later audit/report-finalization captures; the number 82 refers to the explicit audit-summary snapshot, not every subsequently created receipt.

Read original CI job/log captures identifying failed run `41931100840`, job `126928791083`, and the first undeclared SDK archive. Read the original pilot RED stderr: the unchanged diagnostic assertion expected the prose-authority refusal but received the undeclared archive refusal (0 pass / 1 fail / 13 assertions). Read recorded full classification+pilot output (50 pass / 0 fail / 726 assertions) and final formatted key-pilot output (2 pass / 0 fail / 73 assertions), including both passing case names. Those command receipts and source identities are included in the independently audited snapshot. `createCandidate` clones B1, overlays both working-tree policy files, and commits its own immutable candidate, so these tests do not need a root commit checkpoint to observe the repair.

The proof comment accurately describes these observations. The omission controls exercise existing policy dependencies; this repair introduces no executable safety guard requiring a separate guard-removal mutation.

## Read boundaries and remaining checks

Read AGENTS, LLM_README orientation, the code-review skill/template, the exact three-file diff, worker report and native/audit/green summaries, enumerated paths and archive identities, retained per-control input policies, all 82 listed capture receipts/streams and source snapshots, frozen capture/experiment/audit helpers, direct consumer reference passages, production `classifyCandidate`, `classifyOrdinary`/`classifyEntries`, classification schema, binary-refusal test passages, and pilot fixture/trust construction plus the two affected pilot cases.

This review did not deeply assess compressed PostgreSQL evidence contents, replay historical archived runners, audit the original hosted artifact ZIP, examine unrelated runtime code, or approve the broader provider design. It did not run tests, lint, typecheck, build, whole-workspace formatting, OpenSpec validation, hooks, hosted CI, or canonical host gates. Root owns publication, statics, commit, and the remaining required current-source validations. Future changed documentation or evidence is outside this report's read boundary.
