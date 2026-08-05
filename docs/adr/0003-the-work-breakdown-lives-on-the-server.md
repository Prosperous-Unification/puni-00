# The work breakdown lives on the server, not in the browser

`init-spec-prompt.md` asked for a local-first tool: all state in the browser, with optional
server sync through TanStack DB and two modes to choose between. That is not what gets
built. be-01 owns the work breakdown, every mutation is an HTTP request it validates and
commits, and clients learn about each other's edits through gw-01. Lines 14 and 15 of that
prompt are superseded.

The deciding argument was that the two designs disagree about who arbitrates, and the code
already standing had picked a side. be-01 opens the database and signs the tokens gw-01
verifies; gw-01 keeps a live presence roster over real sockets. A local-first model would
have made that infrastructure decorative and replaced it with conflict resolution — the
part of local-first that is genuinely hard, paid for up front, before the tool can hold a
single work item.

## Consequences

Offline editing is gone, and not deferred: there is no local write path to extend later.
Restoring it means introducing conflict resolution, which is the work this decision avoids.
Anyone who wants it should expect to redesign the write path rather than add to it.

Collaboration became nearly free instead of nearly impossible. Two people editing one
project is a solved problem here — SQLite serializes the transactions, the second writer
reads what the first committed, and the existing sequenced event log replays what a
reconnecting client missed.

It also removed a technique before it was written. Sibling ordering was going to use
fractional index strings, the standard answer when clients must invent an order without an
arbiter. Under a server authority there is no lost-update race for them to prevent, so
position is a plain integer spaced in tens, renumbered within its sibling group when the
gaps run out. Twenty row updates inside one transaction, rarely.

The rejected alternative was to keep local-first and treat the server as a sync target,
which would have honoured the original prompt and given offline editing for free. It was
rejected because every downstream feature — derived numbering, freeze, roll-up — asks "who
decides?", and answering that question once, in be-01, is cheaper than answering it in
merge logic for each of them.
