# Context map

## Contexts

- [WBS](CONTEXT.md): work breakdown structures and their planning model.
- [Twilight Structure](docs/twilight-structure/CONTEXT.md): the software factory
  for building and delivering software in the monorepo.

## Relationships

- **Twilight Structure → WBS**: WBS is the chosen planning interface. Twilight
  executes accepted planning revisions and returns attributable progress.
- **Client repository → WBS**: per-repository Backlog.md is the chosen target
  planning backend, replacing SQLite planning storage after the WBS refactors
  land. The adapter, migration, and ownership contract are still proposed.
- **puni-00 → client repositories**: the same versioned Nx repository template,
  SDLC, knowledge conventions, and planning contract apply to the factory's own
  development and client projects. Client content and authority remain isolated.
- Planning includes agent and human resources. WBS planning capacity and Twilight
  runtime admission are distinct quantities; a plan carries both without
  conversion and measured usage returns as a progress receipt. The contract is in
  the [control-plane design](openspec/changes/twilight-control-plane/design.md#planning-knowledge-and-client-portability)
  and proven by Tasks 2 and 9 of its plan.
