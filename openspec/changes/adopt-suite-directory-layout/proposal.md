## Why

Twilight Burokrat, the first product of the Twilight Structure suite, still lives in `apps/wiki`,
named for a product that no longer exists, and the namespace layout gate excuses it by a frozen
exception. On 2026-09-23 Dany decided that the suite's products live under one directory,
`apps/twilight-structure/`, so the gate has to know a suite level before the product can move.

## What Changes

**Application layout**

- From: every application at `apps/<product>/<project>`; `apps/wiki/cli` excused as product
  `twilight-burokrat`.
- To: a declared list of suite directories. An application in a listed suite sits at
  `apps/<suite>/<product>/<project>` and takes its product and qualified name from the product
  directory; every other `apps/<directory>` is a product as before. Twilight Burokrat keeps the
  Nx name `twilight-burokrat` through a name exception on its exact root.
- Impact: non-breaking; WBS projects are unaffected.

**Product lint policies**

- From: `apps/<product>/eslint.product.mjs` only.
- To: also `apps/<suite>/<product>/eslint.product.mjs`; a policy directly in a suite directory
  is refused by name, and Nx treats every such policy as a lint cache input.

**The directory**

- From: `apps/wiki/{cli,consumer,eslint.product.mjs}`.
- To: `apps/twilight-structure/twilight-burokrat/{cli,consumer,eslint.product.mjs}`, with every
  current reference following it: project configuration, the release workflow, the bootstrap
  policy, mapping and relationship facts, devsync pins and current documents. A check keeps the
  retired root out of everything but historical records, and survives their archiving.

## Non-Goals

- No change to the npm name, bin names, packed files, Nx project name, product tag, version-1
  check and module ids, `TOOL_WIKI_*` variables or `bin/tool-wiki-*.sh`.
- `apps/wbs` stays where it is.
- No release, tag or activation is published; preparing the relocation activation is operator
  work under the activation runbook.
- Historical records are not rewritten.

## Constraints

- The bootstrap boundary moves by selector: `selector` names the new root, `sourceSelector`
  keeps `tools/tool-wiki`, where its reviewed baselines are.
- Checks that read the repository at `HEAD` pass only once the move is committed.

## Capabilities

### New Capabilities

- `suite-directory-layout`: suites under `apps/`, their products' lint policies, the moved
  Twilight Burokrat and the retired `apps/wiki` root.

### Modified Capabilities

- none

## Domain Terms

- Suite, Product

## Decisions Recorded

- none: a directory layout is reversed by another move, and the decision is Dany's, recorded here.

## Impact

`tools/tool-devsync`, `nx.json`, `apps/twilight-structure/twilight-burokrat`, the Twilight
Burokrat release workflow, `docs/wiki-policy`, current documents.
