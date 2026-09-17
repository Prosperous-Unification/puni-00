# Design

The package contract is defined by [the delivery design](../../../docs/superpowers/specs/2026-09-17-twilight-bureaucrat-and-fleet-design.md) and implemented by P0–P4 of [the package plan](../../../docs/superpowers/plans/2026-09-17-twilight-bureaucrat-package.md).

The current source stays in `apps/wiki/cli` through P4 because `agent-scalable-llm-wiki` tasks 6.1 and 7.5 have not completed their operational freeze/adoption. Nx exposes the project as `twilight-bureaucrat`; build output is a package-local `dist/` assembled from an explicit allowlist. `bin.mjs` resolves toolkit assets from its installed module URL. The build bundles shared validation and ArkType so the tarball has no workspace import at runtime.

The outer package manifest binds version, source SHA, and the digest of the inner toolkit manifest. Package identity names reusable bytes; `TOOL_WIKI_ACTIVATION_VERSION` continues to name a reviewed consumer commit. The release workflow transfers the tested tarball and verifies its digest before publication.

## Rename map

| Current route                                | Current route after this change                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Product/tool name `tool-wiki`                | `Twilight Bureaucrat`                                                                        |
| Nx project `wiki-cli`                        | `twilight-bureaucrat`                                                                        |
| Executable `wiki-cli`                        | `twilight-bureaucrat`                                                                        |
| Source `apps/wiki/cli`                       | Retained temporarily; later move to `packages/twilight-bureaucrat` after exhaustive adoption |
| Historical evidence identities               | Preserved byte-for-byte                                                                      |
| Compatibility script `bin/tool-wiki-lint.sh` | Preserved until every caller is migrated                                                     |
