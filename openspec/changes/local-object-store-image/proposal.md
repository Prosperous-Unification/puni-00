## Why

The pinned Quay MinIO image is inaccessible in the disposable backup rehearsal, blocking WBS 070.09 F10 runtime proof. A reproducible PUNI image using authenticated upstream release binaries makes the local object store available without changing production storage.

## What Changes

The local object store uses a PUNI image built from locked MinIO and mc binaries, verified checksums and minisign signatures, a digest-pinned BusyBox shell, and a pinned BuildKit builder. The backup rehearsal imports the exact image archive into its own k3d cluster before applying the local manifest.

## Non-Goals

Production storage adoption, public mirror substitution, upstream version upgrades, and real-host cold recovery.

## Constraints

Keep reviewed PR #459 schedule isolation. Target linux/amd64. Reject checksum, signature, build, and manifest mismatches. Preserve the current nonroot server and bucket Job contract. Prove real Pod image identity, four buckets, versioning, lifecycle configuration, two retained generations, and the backup rehearsal. Heavy host work uses the canonical lock.

## Capabilities

### New Capabilities

- `local-object-store`: Authenticated, reproducible local S3 target for disposable rehearsals.

### Modified Capabilities

None.

## Domain Terms

None; use the existing local object store language.

## Decisions Recorded

None; this reversible local image packaging follows the existing locked controller build.

## Impact

Local backup manifest, image lock and recipe, tool-fleet image builder, tool-deploy backup rehearsal, recovery runbook.
