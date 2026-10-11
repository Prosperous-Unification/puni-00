## Why

The trusted-wiki PR job requires an externally reviewed activation archive, but this repository has no configured archive. Its red `lint` check is blocking the three reviewed WBS pull requests that need to merge now.

## What Changes

- The trusted-wiki PR job is temporarily skipped in CI.
- The existing local Tool Wiki launcher and pre-commit hook remain available for operator-run checks.
- Ordinary CI lint, tests, typecheck, build, and the exact-SHA host gate continue to run.

## Non-Goals

- This does not create, fake, or certify a trusted activation.
- This does not change Tool Wiki validation behavior when invoked locally.
- This does not disable the workflow template distributed to other repositories.

## Constraints

- The temporary skip must be explicit and easy to reverse when activation is provisioned.
- The CI change must not imply that a skipped check certifies a candidate.

## Capabilities

### New Capabilities

- `temporary-tool-wiki-ci-disable`: CI skips trusted-wiki PR admission while preserving local invocation.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

GitHub Actions trusted-wiki job, its local test contract, and the WBS PR merge path.
