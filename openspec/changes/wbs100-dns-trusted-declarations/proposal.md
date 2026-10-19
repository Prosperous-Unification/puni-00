## Why

The installed all-rule WBS survey now completes within its memory guard, but seven relationship-dependent rules refuse the already locked dns-packet import because the release-owned trusted roots omit both its runtime package and @types/dns-packet. This prevents compiler diagnostics, declaration emission and public DNS surfaces from being evaluated.

## What Changes

Enroll dns-packet and @types/dns-packet explicitly in the existing finite release-owned declaration roots. The unchanged dependency closure includes @leichtgewicht/ip-codec transitively. Extend the installed vendor oracle with real named and type imports, the existing DNS codec augmentation shape, and public DNS types.

## Non-Goals

No automatic discovery, resolver change, candidate-driven trust, policy relaxation, dependency or lockfile change, WBS100 completion, deployment or historical artifact relabeling.

## Constraints

Use the existing shared package/toolkit/relocation closure and authentication. Preserve missing, altered and untrusted dependency refusals. Preserve the serial-only archive and installed consumers, and identify each rebuilt successor separately. Tests and packaging run serially under a 2 GiB process-tree RSS/360-second guard with at least 12 GiB available memory. Full all-rule and hosted acceptance remain coordinator obligations.

## Impact

Only trusted-module roots, closure tests and the existing installed-consumer fixture change. Existing domain terms and architecture apply; no glossary or ADR is required.
