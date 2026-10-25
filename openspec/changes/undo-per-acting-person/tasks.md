## 1. Journal keyed by acting person

- [x] 1.1 Red: `journal.append:acting-person-stacks` on both stores (redo kept across stacks, the
      prune ranked within a stack past the gaps, a cross-stack flip refused). Green: `UndoStack`
      on the port, SQLite `person_id IS ?` and a ranked prune, the memory twin. R5 faults: the
      pair-wide `max(seq) - 49` prune; the person predicate dropped; `=` for `IS`; the flip
      unkeyed; the flip's changes check removed; each watched.
- [x] 1.2 Migration `20261026120000_add_command_journal_person` with a refusing `down.sql`.
      R5 fault: the guard inserting 0; watched.
- [x] 1.3 Core: `actingPersonOf`; the batch records onto, and reports, the credential's stack; the
      undo, redo and tree routes read the principal's stack. R5 faults: `null` in each of the
      three places; watched over HTTP.
- [x] 1.4 Mid-swap: an outgoing-colour insert lands on the account's own stack.
