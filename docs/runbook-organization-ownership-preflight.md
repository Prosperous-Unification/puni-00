# Organization ownership preflight

This report inspects a database copy; its output is one prerequisite for the broader ownership migration.

Run against an explicitly supplied disposable or consistently copied WBS SQLite database. Use the repository's established SQLite backup procedure to obtain a consistent copy; copying only a live main file can omit WAL contents. This report does not obtain or identify a production database.

From the repository root, run:

```sh
DB_PATH=/absolute/path/to/copied-plan.db bun apps/wbs/be-01/src/organization-ownership-preflight-cli.ts
```

No arguments are accepted. `DB_PATH` must be nonempty. The CLI opens the existing file read-only, creates no database, closes its connection, and prints one JSON document only when inspection completes. A completed report exits zero even when findings exist. Refused input or unreadable trusted state exits nonzero with stderr and no stdout report. Treat the reported arrays themselves as the findings; a zero exit is only completed inspection.

| Report field         | Existing inspection                                                                   |
| -------------------- | ------------------------------------------------------------------------------------- |
| `marker`             | Validated durable organization activation state, `pre_activation` or `activated`      |
| `unmappedRoots`      | `findUnmappedRoots`: roots without an organization mapping                            |
| `catalogNameDrift`   | `findCatalogNameDrift`: legacy catalog mapping names differing from roots             |
| `ownershipConflicts` | `findOwnershipConflicts`: supported relational conflicts and unresolved event streams |

Every field describes the same deferred SQLite read snapshot. Later writes belong to a later report. Missing/unreadable/malformed marker state and unreadable required query schema stop inspection rather than becoming empty arrays.

The report covers exactly this marker and these three queries. It does not parse opaque journal payloads or captured saved-plan bodies, establish reviewed production identity/access mappings, prove old processes have drained and cannot restart, or inspect the MCP credential epoch or actual activation. Empty arrays do not authorize activation or claim rollout readiness. Parent `organization-ownership-and-access` tasks 1.1 and 7.1 and WBS010.5.4 remain open. Ownership backfill, repair and deployment are separate work; activation is [its own runbook](runbook-organization-activation.md).
