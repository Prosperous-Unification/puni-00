# Serial legacy compiler extraction

## Intent

The installed all-rule WBS baseline survey exceeded 8 GiB before returning a report. Its filesystem relationship extractor retains 21 TypeScript programs simultaneously. A bounded diagnostic reached 2 GiB while constructing the third program; the index pass also contributes substantial resident memory.

Run the filesystem compatibility extractor with one compiler program in scope at a time while preserving relationship identities, complete checks and their phase precedence. Reconstruct programs between phases and measure elapsed wall time and sampled resident memory. Keep the bounded-source runner and all callback accounting unchanged in behavior.

This change does not promise a universal RSS bound, alter policy, certify WBS100, weaken compiler checks, change the bounded-source contract or relabel the historical installed artifact. Acceptance uses an explicitly identified successor artifact for both base and candidate. A committed synthetic workload supplies the memory regression; real all-rule acceptance remains separately required.

## Impact

The filesystem wrapper selects a serial runner. The shared source-admission loop is extracted without changing bounded callback order; imports, declarations and the bounded runner remain unchanged. New production CLI resource and equivalence cases prove the behavior.
