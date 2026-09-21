# Design

The package contract is defined by [the delivery design](../../../docs/superpowers/specs/2026-09-17-twilight-burokrat-and-fleet-design.md) and implemented by P0–P4 of [the package plan](../../../docs/superpowers/plans/2026-09-17-twilight-burokrat-package.md).

The current source stays in `apps/wiki/cli` through P4 because `agent-scalable-llm-wiki` tasks 6.1 and 7.5 have not completed their operational freeze/adoption. This is a temporary freeze exception to the target map below; adoption later moves the paths to their agreed `apps/twilight-burokrat` destinations. Nx exposes the project as `twilight-burokrat`; build output is a package-local `dist/` assembled from an explicit allowlist. `bin.mjs` resolves toolkit assets from its installed module URL. The build bundles shared validation and ArkType so the tarball has no workspace import at runtime.

The outer package manifest binds version, source SHA, and the digest of the inner toolkit manifest. Package identity names reusable bytes; `TOOL_WIKI_ACTIVATION_VERSION` continues to name a reviewed consumer commit. The release workflow transfers the tested tarball and verifies its digest before publication.

## Rename map

| Concern                                            | Current                        | Target                                      |
| -------------------------------------------------- | ------------------------------ | ------------------------------------------- |
| Source                                             | `apps/wiki/cli`                | `apps/twilight-burokrat/cli`                |
| Product lint                                       | `apps/wiki/eslint.product.mjs` | `apps/twilight-burokrat/eslint.product.mjs` |
| Consumer docs/template                             | `apps/wiki/consumer`           | `apps/twilight-burokrat/consumer`           |
| Nx project                                         | `wiki-cli`                     | `twilight-burokrat`                         |
| Product tag                                        | `product:wiki`                 | `product:twilight-burokrat`                 |
| npm name/bin                                       | absent                         | `twilight-burokrat`                         |
| New release tags                                   | `wiki-v*`                      | `twilight-burokrat-v*`                      |
| Stored check/module IDs, role names, env variables | version 1                      | unchanged                                   |

Historical evidence remains byte-for-byte intact. The compatibility script
`bin/tool-wiki-lint.sh` remains until every caller has migrated.
