## Context

The existing hook invokes one typed ESLint process for hundreds of staged paths. Two actual normal commit attempts exhausted approximately 4 GiB and 6 GiB heaps. The pending observability main merge remains preserved separately.

## Goals / Non-Goals

Reduce accumulated TypeScript project-service state between project groups while preserving lint coverage, rules and commit failure. CI, lint caching, heap changes and hard memory ceilings are outside this repair.

## Decisions

A Bun CLI in tool-git-hooks accepts the existing lefthook path list. A small planner groups paths by their nearest existing project.json, with an explicit workspace group. Each project manifest encountered must be readable JSON describing an object; ordinary ENOENT continues the parent search. Only grouping is consumed, so this hook does not revalidate unrelated Nx target or tag policy. The runner invokes the installed ESLint sequentially with an argument array and the same workspace cwd. It uses no shell interpolation and no network installation. Every source path reaches exactly one process on a successful run. A nonzero exit or signal stops the hook and blocks the commit.

## Risks / Trade-offs

Repeated process/config initialization adds overhead. A single project's typed dependency closure can still exceed the available heap; the actual merged-file commit is the acceptance experiment. This is not a fixed RSS guarantee. Fail-fast execution can omit later diagnostics after a failure, as ESLint itself can on fatal errors; it never turns failure into success.

## Migration Plan

Change only the lint command in lefthook after focused real-ESLint tests and R5 fault proofs. Preserve all other hooks. Independently review the bounded diff before applying it to the observability integration. Revert the hook and helper together if necessary; no stored-state migration is involved.

## Open Questions

None blocking implementation. Peak memory and elapsed time of the real large integration remain measurements to collect, not assumptions.
