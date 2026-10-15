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

## Reviewed declaration closure (2026-10-15)

`trustedDeclarationRoots` owns the finite supported set derived from all 21 selected WBS
TypeScript configs, including their recursively imported production and testing helpers.
Elysia and Testing Library need three explicit declaration-peer supplements: `@sinclair/typebox`,
`openapi-types` and `@testing-library/dom`. Optional peers do not automatically enter the closure.
All package, toolkit release and relocation producers use `trustedModuleNames`, which follows
mandatory dependencies from each installed importer and records nested instance paths.
Only those instances are copied; a package's unrelated nested installation is excluded.

The bundled compiler's pinned alias delegates to `@typescript/old`. Standard libraries are
materialized from that authenticated compiler package inside the same physical copy as vendor
declarations. Its version must equal the bundled compiler version. Both compiler-host library
hooks use that directory; there is no source-installation library exception.

Bun `pm pack` omits five installed metadata paths even under the `dist/` allowlist:
`elysia/bunfig.toml`, `exact-mirror/bunfig.toml`, `memoirist/bunfig.toml`, `isexe/.npmignore`
and `stackback/.npmignore`. The three TOML files only set the install registry; the ignore files
only select coverage/installation artifacts. The shared copier excludes exactly those five relative paths before the closure digest is computed, so the descriptor pins the
bytes Bun actually transports. Other TOML files, hidden files, declarations and runtime assets
retain their installed bytes. The final tarball remains controlled by Bun pack, and installed
acceptance checks its complete closure digest.

The reviewed set currently produces 348 package instances, about 179 MB unpacked and 31 MB
compressed. This increases install/CI transfer cost. No registry publication or hosted CI quota
has been exercised by this repair; existing release acceptance must still transfer and verify
the exact tarball before any publication.
