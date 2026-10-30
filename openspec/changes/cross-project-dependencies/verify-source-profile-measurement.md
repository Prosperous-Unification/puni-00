# Source profile measurement integration

This packet integrates the independently reviewed source measurement artifact
`8c7892e1` and tracked rehearsal compiler configuration `314c1e10`. All three
source/profile/test/document blobs match their final reviewed bytes exactly.
The artifact records measurement evidence only: admission stays `not-granted`,
and absent provider or execution authority stays `unexecuted`. It adds no
production source validator, readiness grant or full restoration entry point.

The first review of `58b6d41d` found a concrete complete-roster defect. Three
actual decoder/binder regressions demonstrated acceptance of a missing init
observation, a contradictory init start and a non-init process claiming inner
PID1. The corrected packet requires one full init row, matching its declared
identity and namespaces; every non-init parent chain joins actual observed
rows to it, only init may have an external parent, and the full init observation
remains in the stable identity latch. The original three regressions now pass.

Independent Astra verification passed thirty pure tests with eighty assertions
and independently reproduced all twenty-seven actual-function omission
negatives as assertion failures. This includes nineteen original guards and
eight init/ancestry/latch corrections. No compiler/import error substitutes for
a negative proof. The artifact's adjacent comments and document preserve the
specific cases and source-only limits.

The tracked configuration was combined with the final source before root
verification. Its originating branch did not contain the source files and
therefore supplied no combined typecheck claim. Root observed:

- The actual compiler file list contains both source-profile TypeScript files.
- `bunx --no-install tsc --project tools/tool-remote-scripts/rehearsals/tsconfig.json`
  completed successfully.
- Explicit ESLint over both rehearsal TypeScript files completed successfully
  with the root project graph available.
- The source-profile suite passed thirty tests with eighty assertions in 93ms.
- Combined source-profile and scratch suites passed thirty-six tests with 104
  assertions in 6.51s, using the actual scratch preload.
- Configured uncached lint/typecheck for tool-test-scratch and
  tool-remote-scripts completed all four targets in 18.8s.
- OpenSpec validation passed this change with 28 existing requirement-length
  warnings. No warning is relabeled as a clean report.

The normal tool-remote-scripts Nx test/lint/typecheck inputs do not automatically
cover this rehearsal directory. The explicit rehearsal compiler, file-list,
lint and Bun commands above are separate required evidence. A default gate
result alone cannot certify the complete provider or rehearsal implementation.

The source measurement still requires the separately reviewed complete fixture
provider, finite private transport and retained ownership. Real source startup,
the complete four-role Docker/kernel/FD/listener/output census, same-UID1000
helper permissions, genuine positive measurement orchestration, unchanged
cold/running monitor compatibility, physical stop/join and attributed cleanup
remain unexecuted. The reviewed packet cannot manufacture that evidence or
turn raw captures into production admission. Final composite review, explicit
execution approval and actual native evidence remain prerequisites.

The separately integrated [scratch diagnostics](verify-ci-hook-diagnostics.md)
retain the existing cleanup behavior and test budgets. Their fixed start/return
markers identify the actual global cleanup interval on the next hosted run;
they do not claim to fix or explain the earlier CI timeout. Final canonical
exact-SHA host gate, full green CI, complete participant restoration and
activation/deployment remain open.
