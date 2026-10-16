# Import preparation values boundary

WBS090 (`7ad9e8a6-0369-43f0-9711-8d9e687d92a6`) has an existing F7 finding on
`libs/wbs/application/core/src/module/plan-import/prepare-import.ts`. This bounded
mechanical extraction starts at actual main
`87a2b7edbfaabae889d91daa823f16f520a51cec`, independently of wave11 PR #556.

## Intent and acceptance

Move the existing prepared import value types and the exact `rowShape` and
`preparedRow` implementations into the adjacent `import-values.ts`. Preserve the
original public type exports, import refusal order and results, dependency
admission, runtime declarations, reference mapping and module ownership. Update
the existing module index. Both production files must fit the unchanged 800-line
ceiling. No schema, dependency, policy, scheduler, UI or activation changes.

This is the mechanical-refactor exception in AGENTS R4; it introduces no new
observable contract or capability. The existing diagnostic evidence packet owns
the verification record. WBS090 stays `blocked_by_proxy`; this is one finding,
with no full backend or trusted certification claim.

## Local evidence

Checks ran serially in `/tmp/puni-wbs090-import-values-sol`, using existing locked
dependencies through an ignored `node_modules` symlink. No fresh frozen install
was performed. The clone has only sample Git hooks; no hook bypass was used.

- Before and after: `bun test` over `service/prepare-import.test.ts`,
  `module/plan-import/module.test.ts`, and `http/import.routes.test.ts`:
  **72 passed, zero failed, 117 assertions**. The baseline includes the stronger
  prepared-row assertion before the extraction.
- The prepared-row assertion names every mapped scalar, list and external
  reference. Replacing `serviceTeamFileId` with `null` failed the production
  `prepares normalized names, indexes and leaf values` assertion before and after
  moving the helper. Restored source passed.
- Replacing the moved `rowShape` parent identity with `null` failed the existing
  production `complete dependency rules refuse ancestry and cycles independent
of edge order` assertion. Restored source passed.
- Bun's TypeScript transpiler emitted identical moved helper bodies and identical
  remaining module runtime, after removing the new helper import/export syntax
  and normalizing whitespace. The original prepared interface/type declarations
  were moved verbatim; their public names are reexported from the original path.
- Mounted backend document boundary and transaction-boundary suites: **22 passed,
  zero failed, 62 assertions**. Total focused coverage: **94 passing tests**.
- Pinned OpenSpec 1.12.0 all validation: **237/237**, no failures. Changed-file
  Prettier, whitespace, plaintext-secret and private-nesting checks passed.
- Final line counts: preparation **777**, adjacent values **240**, against the
  unchanged 800-line ceiling.
- Narrow native TypeScript checked both changed roots and their real feature and
  resource consumers over the imported graph with `GOMEMLIMIT=512MiB`.
- Changed TypeScript ESLint passed with a 768MiB JavaScript heap cap. Nx module
  boundary enforcement was skipped because this clone has no cached ProjectGraph.

Local execution logs are `/tmp/wbs090-import-values-{baseline,owning-before,
owning-after,final-tests,mapping-red,mapping-moved-red,hierarchy-red,runtime,
types,lint-final,mounted}.log`. These paths are execution receipts, not durable
hosted evidence. The first lint attempt correctly found incomplete extracted type
imports; the corrected imports passed. A first typecheck command referenced an
unavailable classic TypeScript binary and produced no verdict; the successful
check used the repository's native `bunx tsc` executable.

## Hosted proof and release obligations

After committing the exact source, adapt the retained command-fields hosted proof
from `0de4ef83e941b80c29fe613858a736f63e3bad40` on a separate disposable proof
branch. Pin this source SHA/tree and actual-main base SHA/tree, select the import
preparation path, and retain the existing immutable installed evaluator tarball,
external recovery policy and their digests. Run serial base/candidate F7 and full
fourteen-rule diagnostics, requiring the selected finding to disappear while
preserving unrelated findings and unevaluated rules. Commit an oversized-source
fault and watch that selected assertion fail; restore and retain all receipts.
The disposable proof workflow is excluded from the source PR.

Independent exact-source review, hosted proof receipts, exact-head CI and the
canonical h2puni gate remain separate required release evidence. No full local
Nx/Burokrat/browser gate, whole-project typecheck/build, host gate, live import,
deployment, trusted activation or row closure is claimed.
