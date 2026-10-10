# Anonymous draft retention

Anonymous intake drafts expire after 24 hours for claim access. Expiry alone does not erase their text from SQLite. The maintenance command in the website API bundle gives an operator a reviewable count and an explicit cleanup step for expired, unconsumed drafts with no submission, software request, legacy account request or replay association.

This command has **no schedule or HTTP endpoint**. This slice does not activate deletion on a live database. The 12-month prospect/client policy, backup deletion and aggregate telemetry remain separate work.

## Inspect

Use the website API build containing `draft-retention-cli.js` and its `migrations/` directory. Select an existing website SQLite database. The command opens it read-only and does not run API startup recovery.

```sh
bun apps/website/be-01/dist/draft-retention-cli.js inspect /path/to/website.sqlite
```

The output is one JSON object with `cutoff` (UTC epoch milliseconds), `eligibleDrafts`, the anonymous conversation counts (`retainedDrafts`, `conversations`, `conversationTurns`, `completedOperations`, `retainedOperations`) and an opaque `fingerprint`. A draft whose conversation still holds an `unknown` (settled at its reserved ceiling) or in-flight operation, or any operation on or after the cutoff's UTC day, is retained with its description, brief and conversation text blanked, so that spend stays in the day's ceilings; see {@link purgeExpiredDrafts}. Such a blanked draft leaves later cohorts and keeps its accounting rows. It contains no draft text, claim, email or raw draft identifier. Save the entire output for review; note which database copy was inspected. A copied database has a different identity and needs its own inspection.

The command refuses a missing, unreadable, malformed or unsupported database, including an unexpected or edited migration. Resolve the cause rather than creating or migrating a replacement during maintenance.

## Apply a reviewed plan

After reviewing the count and cutoff, pass the exact values from the **same database**:

```sh
bun apps/website/be-01/dist/draft-retention-cli.js apply /path/to/website.sqlite CUTOFF FINGERPRINT
```

For example, replace `CUTOFF` with the printed integer and `FINGERPRINT` with the printed lowercase SHA-256 string. Application refuses a future cutoff or a changed eligible cohort. Reinspect after any refusal. It recomputes eligibility under a write transaction and reports only counts after commit: `deletedDrafts`, `retainedDrafts`, `deletedConversations`, `deletedConversationTurns`, `deletedConversationOperations` and `retainedOperations`. A failed deletion rolls back the whole cohort. No draft connected to submitted or account-owned work is removed.

Use a disposable copy when rehearsing this procedure. Deleting from the active database does not remove the same data from backups; live activation must wait for the backup lifecycle policy and the broader prospect/client retention decisions.
