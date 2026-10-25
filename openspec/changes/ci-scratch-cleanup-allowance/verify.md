## Scope

Fresh main `830e774d2302d852432c51ded1e1b38e85728f66`; cleanup hook only. No feature code, tracing, CI split, job or phase budgets, migrations or serialized formats are adopted.

## Checks (Bun 1.4.4, 2026-10-25)

- Initial actual-preload tests against main: 0 pass, 2 fail. The finite 100ms `rmSync` delay exceeded the inherited 20ms child hook deadline.
- `bun test --preload ./tools/test/scratch/preload.ts tools/test/scratch --timeout=30000`: 7 pass, 40 assertions. Existing subprocess-output cases need real child-process access: sandbox run passed 4 but failed 3 missing child-output cases; authorized unsandboxed replay passed all 7.
- Remove only the explicit cleanup allowance, run the first new regression: 0 pass, 1 fail (expected child exit 0, received 1). Restore the hook: both new tests pass, 27 assertions.
- Child controls retain inherited and reduced 50ms hook failures, two ordinary hangs timing out at 20ms, and absence of both real scratch directories after every child is joined. The delay is injected into a copy of the actual remover at its exact `rmSync` boundary; the actual preload is copied without replacing its callback.
- `bun x tsc --build --force tools/test/scratch/tsconfig.json`: exit 0.
- Configured `nx run tool-test-scratch:lint --skip-nx-cache`: exit 0, including the Nx graph. Initial direct ESLint had no graph and warned the boundary rule was skipped; the configured run supersedes that partial check.
- `nx run tool-devsync:test-levels:verify --skip-nx-cache`: exit 0.
- Prettier on both source files, budget documentation and change artifacts: pass.
- `openspec validate ci-scratch-cleanup-allowance --strict`: pass; `openspec validate --all --json`: 286/286 pass.

## Limits

The short-delay controls establish hook scoping, finite failure and physical cleanup; they do not measure a loaded hosted filesystem. Synchronous hook overruns are reported after return and cannot interrupt a blocked syscall. The existing best-effort remover error policy is unchanged. Hosted CI and a host-wide gate remain separate, unrun checks. AstraHigh independently approved the frozen seven paths: 7 tests / 40 assertions passed, actual single-line allowance omission failed as intended, and the restored new tests passed 2 / 27. Both runtime hashes matched the reviewed bytes. Normal staged pre-commit hooks passed lint, format, plaintext secrets and private nesting; migration, website and document-cap hooks had no matching paths. Tool Wiki reported inactive/uncertified because its external activation root is not provisioned; this is not a certification claim.
