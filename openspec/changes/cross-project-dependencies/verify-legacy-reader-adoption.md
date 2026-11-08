# Existing legacy-reader adoption verification

The separate `--adopt-legacy-reader --host=… --selection=…` route defaults to dry run. It uses the actual initializer/origin receipt and original created lock, never executes the unsupported old reader, and replaces only the reader. Existing first-reader, transition and normal installer routes retain their authority checks. Operator materialization/execute/readback instructions and exact effect boundaries are in [the design](legacy-reader-adoption-design.md#attended-operator-sequence).

## Fresh owning evidence

Local evidence directory: `/tmp/puni-legacy-reader-evidence-20261108`. No host adoption, policy/service mutation, remote publication, deployment or native owner harness was performed by this unit.

- `initializer-red.log`: both selected original lock/parent drift cases failed because the original initializer published instead of rejecting. `initializer-green.log`: both refuse before publication.
- `opening-observation-red.log`: actual successful isolated adoption lacked required opening.json (ENOENT). `opening-observation-green.log`: the same consumer passes with the complete original tuple retained.
- `regression-final.log`: six actual test files, **274 pass / 0 fail / 1,226 assertions**, 105.25s. Covers initializer/CLI, fresh preparation, historical old-reader transition, normal installer and new adoption. Real healthy controls prove lock exclusion/release and staged/installed singleton success. The legacy fixture throws if executed, proving adoption does not use an invented old flag. The existing real historical transition control still executes its old authority check.
- `test-typing-focused.log`: **10 pass / 0 fail / 15 assertions**, 4.97s after test-only overloaded-read forwarding and optional assertion-predicate typing corrections. No production behavior or refusal assertion changed.
- `types-final2.log`: uncached `NX_DAEMON=false bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`, exit0, 6.7s.
- `lint-final.log` and `lint-test-final2.log`: configured ESLint rules on all seven changed source/test paths; exit0. `openspec-final.log`: scoped OpenSpec validation exit0. Final all-change validation (`openspec-all-final.json`, every entry valid), formatting (`format-final.log`) and diff checks pass; normal commit hooks are recorded in the handover receipt.

The same local tests initially exposed two environment constraints: hardlinking the installed Bun into a distinct `/tmp` filesystem gives EXDEV, and sandbox UID remapping makes `/tmp` appear owned by65534 so the existing ancestry guard correctly refuses. The successful run used an identical private Bun copy on the scratch filesystem (both SHA256 `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`) outside that remapping. It used the repository runner's configured `--timeout=10000`; production deadlines and safety assertions were unchanged. Initial failed receipts remain available rather than being treated as success.

## R5 receipts and limits

`proof-pairs.json` records **32 watched fault families**, each owning consumer exit1 with the selected source fault and exit0 after exact restoration. It records exact needles, replacements, test selectors and scope. Adjacent source `Proof:` comments name those consumers. The restored production/test hashes are in `source-freeze.json`.

Twenty-one families prove an owning admission/effect refusal: initializer original tuple and existing-only lock acquisition, target, selection digest, selected parents/artifacts, exact created staging, original reader/evidence/lock/policy/receipt continuity, pre-create parent, private observation inode/readback, actual transport staging, dry-run default, original selection descriptor metadata and short read, production account, local candidate pin and closed CLI.

Eleven families prove the reached refusal boundary/classification while downstream checks may independently refuse: selection shape and safe parent, fixed layout, deadline, created-staging shape, lock mode, private observation parent, selection-file bounds/canonical path, genuine absence, and captured selected parent. They do **not** claim an independent activation or admission bypass. The bounded-file omission causes a downstream JSON error inside the owning assertion; it is not a test-loader syntax failure.

The first transport fault control rejected an unexpected SCP before observing an unsafe effect and therefore did not fail when the guard was removed. That false oracle was rejected. The corrected control runs actual owned SCP/chunk transport and detects forbidden later effects/calls after staging replacement; the watched guard omission now fails and restoration passes. Original driver logs retain that refinement. A generic proof-log filter initially rejected the bounded-file classification because its assertion included the downstream JSON SyntaxError text; it was corrected to require an actual owning assertion failure and reject loader errors/timeouts.

Finite existing child-observation controls cover rejection/pending custody without claiming native UNKNOWN settlement. No private/full39 qualification, activation, fresh-reader designation, automatic retry/inverse or broad controller coupling was added. Final aggregate CI and the canonical exact actual-main host gate, including unchanged required storage cases, remain the coordinator's shipping obligations.
