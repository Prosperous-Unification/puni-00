# Intent

## Problem

The reusable repository-admission toolkit is built inside `apps/wiki/cli` and distributed as a bespoke archive. Its executable and trusted assets cannot yet be installed, tested, or released as an independent package.

## Desired outcome

Ship `twilight-burokrat@0.1.0` as a Bun-compatible npm package with a `twilight-burokrat` executable, bundled validation/runtime dependencies, immutable toolkit assets, and no lifecycle scripts. Prove the packed tarball in a clean repository outside this checkout, and make the release workflow publish the exact tested tarball.

## Non-goals

- Moving the package to another Git repository.
- Certifying a consumer commit merely by installing a package.
- Renaming historical stored activations or evidence.
- Publishing without verified registry authority and protected credentials.

## Constraints

Bun and Nx remain the only package manager and task runner. The installed package must not resolve monorepo aliases or ship WBS sources, consumer policy, attestations, secrets, or selected activations. Missing or corrupted trusted assets fail before validator execution. The physical corpus remains under `apps/wiki/cli` until the unfinished exhaustive freeze and adoption tasks permit relocation.
