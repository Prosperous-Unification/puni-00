# Private main integration — 2026-11-04

This draft merges main `f158ed1b79d2b38b7a5d918290f44cedc1a00fa1`
into the cross-project dependencies integration checkpoint `6db648edf5336ebddcbc12ca324e2475f63363a4`.
It does not authorize merging the feature architecture to main or deployment.

Sixteen text conflicts and eight additional caller/contract paths were reconciled.
Independent Astra source review accepted the combined prerequisite and organization-wide
capacity contracts. All 212 private and 210 incoming migration files retained their pinned bytes.

Observed checks on the resolved tree:

- Frozen Bun install with a private cache and copyfile backend: exit 0; package and lock unchanged.
- Formatting of 23 supported resolution paths: exit 0.
- Configured `wbs-be-01:typecheck` with `--skip-nx-cache`: exit 0; both module typecheck and backend TypeScript build passed.
- The first typecheck launcher used a nonexistent Nx bin path and exited before checking source.
  The corrected launcher used the installed package's declared `dist/bin/nx.js` entry point.
- Unmerged index entries: zero.

Runtime/product tests, full CI, exact-SHA host gate, native constructor acceptance and
deployment remain unverified. Prior UC2 runs have no verified successful termination;
this merge does not establish their cause or repair. Held native recipes were not rerun.

The checkpoint is published for review and preservation, with architectural commitments held.

## Published-checkpoint CI corrections

CI run `41904300471` on published head `ccd5af8d1c831f031849d2223e3887ab0873c151`
reported one TS2502 error in the parent STOP test's Function type annotation.
Renaming the shadowing signature parameter restores type checking without changing
any runtime assertion or helper behavior. The configured remote scripts typecheck
passed after the correction and again after the complete source correction.

Five remote leaves also rejected the current package/lock bytes at the existing
frontend fixture input guard. The exact latest coupled pair from PR630 commit
`795732dd96f42c057a3bc91d1e4675d98462b9cf` was added to all three existing tables.
Both historical pairs, coupled matching, producer custody and cleanup remain intact.
The owning profile tests now bind the current epoch, retain both historical mixed
negatives and reconstruct old negative bytes through literal reviewed inverse hunks
with current/intermediate/historical size and hash assertions. No Git-history lookup
is required by this reconstruction.

Selective integration also carries the AuthReset exemption and exact operation-matrix
entries from `0fbfab78a`. Main already contains the 30-second race readiness fix;
PR630's ADR renames were not applied because current numbering avoids their collisions.
Both published PR histories remain intact. Astra reviewed the selective source changes.

Observed validation on the final formatted correction:

- Existing `source-frontend-profile.test.ts`: **92 passed, 0 failed, 357 assertions**,
  exit 0. Explicit empty preloads, no env-file loading and an owned scratch root were
  used. This check launches real local Git children and imports a copied materializer;
  it starts no Vite server, producer, Graph or native constructor diagnostic.
- Existing `dependency-client.test.ts`: the missing AuthReset exemption produced
  an observed RED; after restoration **2 passed, 0 failed, 6 assertions**, exit 0,
  under explicit empty-preload controlled configuration. The RED used the repository's
  default test launch; the controlled GREEN environment is recorded separately.
- Configured `tool-remote-scripts:typecheck --skip-nx-cache`: exit 0 after all changes.
- Source and document format, normal commit hooks and OpenSpec results are recorded
  by the checkpoint's publication receipts; no full-gate success is inferred here.

No held local native recipe, host gate, main merge or deployment was executed.
Full CI on the newly pushed correction remains a separate required gate.

Repository-required `openspec validate --all --json` passed: 329/329 entries
(310 changes, 19 specs), exit 0. An additional `--strict` validation of this change
exited 1 on 49 warnings and no errors, including legacy delta-section headings and
long requirement text. Strict validation is not claimed passing; those warnings
remain visible follow-up work. This does not narrow the required repository check.
