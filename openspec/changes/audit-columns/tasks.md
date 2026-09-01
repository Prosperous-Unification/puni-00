<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The write stamp reaches the store

- [x] 1.1 `WriteStamp` in `repository/index.ts` — `{ at: number; by: string }`,
      readonly, with the JSDoc carrying why it is one object and not two
      parameters, and why an act builds exactly one.
- [x] 1.2 Every mutating method on the 12 store interfaces takes it — ~37 of
      them; a pure delete does not, having no column to stamp. The proof is the
      compiler: `nx typecheck be-01` runs `tsc --build --force` against the
      source project (R5 #17), so a site that does not pass one fails the gate.
      Negative to watch: drop the argument at one call site in
      `work-item.service.ts` and read `tsc`'s complaint.
- [x] 1.3 The 19 fixtures in `src/testing/` take the stamp and **record** it, so
      a service test can assert attribution without a database.
- [x] 1.4 The whole be-01 suite stays green. This change alters no behaviour any
      existing test asserts, so an existing red is a fault in the sweep.

## 2. The columns

- [x] 2.1 One migration folder, `<stamp>_add_audit_columns`: 76
      `ALTER TABLE … ADD COLUMN`, nullable, no default, plus a `down.sql` that
      drops all 76. Watched: `readMigrationFolders` refuses an empty `down.sql`,
      so the down file is asserted non-empty by running a rollback.
- [x] 2.2 **The check the migration lint cannot make.** It has no `ADD COLUMN`
      pattern and no `NOT NULL` check, so `ADD COLUMN … NOT NULL` with no default
      passes the lint and then fails at runtime against a populated table. Add
      that pattern to `migration-lint.ts` and watch it fail on a deliberate
      `ALTER TABLE tag ADD COLUMN created_by text NOT NULL;`.
- [x] 2.3 `schema.ts`: the 76 columns, nullable, each on the table it belongs to.
- [x] 2.4 `created(stamp)` and `touched(stamp)` helpers, and every one of the 67
      write sites spreads one of them.
- [x] 2.5 The check requiring the spread, scoped to `repository/**`. Shipped as
      `audit.test.ts` reading the folder's own source rather than the ESLint rule
      first attempted — that file records why the selector could not be written
      without also firing on `map.set(key, { … })`. Negative: delete
      `...auditOnUpdate(stamp)` from one `.set()` and watch it name the site.
      **This is what stops task 2.4 from being a one-time sweep that the next
      write site quietly breaks.**

## 3. The behaviour, tested where the fault would live

- [x] 3.1 A created row carries actor and instant, and `updated_at` equals
      `created_at`. Negative: `created()` returning only `createdAt`/`createdBy`,
      watched failing on the equality.
- [x] 3.2 An update moves `updated_at` and leaves `created_at`/`created_by`
      alone. **Assert in the window the fault lives in** (R5, five bills): the
      second write must come from a **different** user and a **later** instant, or
      "unchanged author" is true of a table nobody wrote twice.
- [x] 3.3 One act, two tables, one instant. Negative: a second `this.now()` in
      the act, watched failing on two different `created_at` values.
- [x] 3.4 Item 6's own case: a tag, a work item type, a service, an external
      system, a team and a person each record their creator. Through the real
      controller, because the directory's actor is resolved there.
- [x] 3.5 A row written before the migration reads back `created_by: null` and
      nothing else. Negative: a `.default(0)`/`?? Date.now()` anywhere on the
      read path, watched failing on a non-null author for an old row.

## 4. Knowledge

- [x] 4.1 ADR 0012: the stamp is a parameter, not ambient context. Alternatives
      recorded: `AsyncLocalStorage`, SQLite triggers, drizzle `$onUpdate`, and
      deriving attribution from the existing `plan_event` / `command_journal`
      log.
- [x] 4.2 `CONTEXT.md`: **Write stamp**, **Audit columns**, and the boundary term
      for a null author.

## 5. Gate

- [x] 5.1 be-01's suite, lint, typecheck, migration lint, format,
      `openspec validate`. A live migrate-up-and-down against a copy of the dev
      database, because an exit code is not evidence the column arrived.
      Results in `verify.md`.
