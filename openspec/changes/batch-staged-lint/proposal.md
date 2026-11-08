## Why

The observability branch cannot record its resolved main integration because a single typed ESLint process exhausts both the default heap and a 6 GiB heap across hundreds of staged source paths. This blocks verification and delivery despite the other commit checks passing.

## What Changes

Pre-commit lint runs the same supplied source paths in sequential processes grouped by their nearest existing Nx project. Workspace files form an explicit root batch. Every batch retains the existing ESLint configuration and diagnostics; failures still reject the commit.

## Non-Goals

CI selection, test scope, lint rules, caching, heap tuning, dependency additions, host resizing and observability runtime acceptance.

## Constraints

Use Bun and the installed ESLint. Preserve the existing staged glob, workspace working directory and all other hooks. Never omit unmatched project paths: send them to the root batch. Preserve filenames as arguments. Missing tools and malformed or unreadable trusted state fail. Keep the pending observability merge untouched until this repair is reviewed. Batching reduces retained project state but does not promise a fixed memory ceiling for one project.

## Capabilities

### New Capabilities

- `staged-lint-batches`: Sequential project lint processes with complete staged-path coverage and blocking failures.

### Modified Capabilities

None.

## Domain Terms

None. This change uses existing Nx project and staged-file concepts.

## Decisions Recorded

None. The process grouping is readily reversible and does not change domain architecture.

## Impact

`lefthook.yml`, `tools/tool-git-hooks`, and this OpenSpec change. No deployment behavior or external access changes.
