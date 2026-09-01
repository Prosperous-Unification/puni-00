# Design

## The shape of the problem

The columns are the easy half. The hard half is that **the repository layer
knows neither who is acting nor what time it is**, and 76 columns are worthless
unless every write fills them.

Measured on `main`:

| Fact                      | Where it is today                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The acting user           | `actorId: string`, on ~40 service methods. Reaches the repository in **5** methods, none of them a plan-data write. |
| The clock                 | `now?: () => number`, injected per service. Repositories have **none**.                                             |
| Writes                    | **42 inserts, 25 updates** — 67 sites across 14 files in `repository/`. No shared wrapper.                          |
| The nearest precedent     | `revision: bumpedWorkItem`, inlined at each site rather than centralised.                                           |
| Store interfaces to widen | 12, implemented by 19 in-memory fixtures in `src/testing/`.                                                         |

## The write stamp

One value object carries both facts:

```ts
/** Who is acting, and when. */
export interface WriteStamp {
  readonly at: number;
  readonly by: string;
}
```

It is built **once per act** in the service layer — where `actorId` and
`this.now()` already meet — and passed to every mutating store method as a
single parameter. `work-item.service.ts` already holds the discipline this
depends on: one `this.now()` per act, reused across the rows that act writes,
"because two `now()` calls would let one act carry two timestamps". The stamp
makes that discipline the type system's business rather than a comment's.

## Why a parameter and not ambient context

`AsyncLocalStorage` would have made this a five-file change: one `als.run()` per
request, repositories reading the store, and **no signature changes at all**.
It was rejected, and the reasoning is ADR 0012's.

The short form: a stamp that arrives as a parameter is found by the **compiler**
at every one of the 47 methods, the service call sites and the 19 fixtures,
and `nx typecheck` runs `tsc --build --force` against the source project (the R5
#17 fix), so a caller that has not been swept fails the gate. Ambient context
moves that from compile time to a runtime throw reachable only by a test that
happens to write, in a suite where the fixtures — not the real repositories — are
what most tests exercise.

Note what this argument does **not** claim. The compiler proves the stamp
reaches the store; it says nothing about the 67 write sites _inside_ the
repositories, which is a different check with a different enforcer — the next
section.

## What makes the fill impossible to forget

A required parameter proves the stamp **arrives**. It does not prove it is
**used**: `insert(row, stamp)` that never mentions `stamp.at` compiles.

So the columns are filled by one helper per shape, and the helper is the only
thing the write sites name:

```ts
const auditOnCreate = (stamp: WriteStamp) => ({
  createdAt: stamp.at,
  updatedAt: stamp.at,
  createdBy: stamp.by,
});
const auditOnUpdate = (stamp: WriteStamp) => ({ updatedAt: stamp.at });
```

`...auditOnCreate(stamp)` in every `.values()`, `...auditOnUpdate(stamp)` in
every `.set()` — and in the `set:` branch of every upsert, which is an update
wearing an insert's clothes. A third helper, `auditOnCreateBesidesCreatedAt`,
serves the two tables that already date themselves.
That is one grep-able token per site, and something has to require it. An ESLint
`no-restricted-syntax` selector was the first attempt and was **rejected**: the
rule needed is "an object literal that does _not_ contain a spread of
`auditOnCreate`", which wants `:has()` inside `:not()` over an argument at a
known position — esquery has no argument-index selector, and
`CallExpression > ObjectExpression` matches any argument, so it also failed a
plain `map.set(key, { … })` in the same folder. A rule that fires on the wrong
thing gets disabled, and a disabled rule guards nothing.

What ships instead is `audit.test.ts`, reading this folder's own source — the
precedent `styles.test.ts`, `vite-config.test.ts` and `playwright-config.test.ts`
already set — which also buys exactness a selector could not express: it knows
which five tables are exempt and why. Its negative is a write site with the
spread deleted.

**A newly created row's `updatedAt` equals its `createdAt`** rather than being
null. "Never touched" and "touched at the instant it was made" are the same
fact, and a null there would make every reader write `updatedAt ?? createdAt`.

## Nullable, and why that is not a shortcut

Additive-only forward migrations (blue and green share one SQLite file mid-swap)
forbid `NOT NULL` without a default on a populated table, and a default would be
a **lie**: it would stamp every pre-existing row with an author who did not write
it, which is exactly R5's "never convert an unknown into a default".

So the columns are `integer` / `text` **nullable**, forever, and the row types
say `createdBy: string | null`. There is no second migration that tightens them,
because `created_by` for a row written in August 2026 is not unknown-for-now, it
is unknowable. The read type carrying that is the honest boundary.

## Order of work

**One commit, not two.** Threading the stamp first and adding the columns after
was the obvious split, and it is wrong: until the columns exist the stamp has
nothing to fill, so the first half would either carry an unused parameter — which
the repo's own lint refuses — or reroute the `created_at` that `users` and
`project` already get from their row object, churning `Project` and `User` and
every reader of them for no gain. The stamp and the columns are one fact
arriving.

What that costs, measured up front so it is not discovered halfway: mutating
methods across 12 store interfaces, their 14 implementations, 19 in-memory
fixtures, the service call sites, and ~780 call sites in the existing tests.

**The count was 37 and it is 47**, because the rule "a delete has no column to
stamp" is false in this schema. Almost every delete here also _updates_: it bumps
the surviving parent's `revision` through `bumpWorkItems` / `bumpProject`, and
`DirectoryStore.removeTeam` nulls `work_item.serviceTeamId` on every work item
the team labelled. A row that survives an act and has a column written by it is a
row that act updated. So the rule is simply **every mutating store method takes a
stamp**, which is both easier to state and easier to enforce. `audit.test.ts`
found the two `revision.ts` statements this missed; nothing else would have.

`revision.ts` deserves its own sentence, because stamping it is a decision rather
than a consequence: `bumpWorkItems` moves a work item's `revision` when the thing
the reader edited was an _estimate_ in another table. Its `updated_at` moves too.
That is the answer a reader wants from "when did this work item last change" — a
plan whose figures moved yesterday did change yesterday — and it is deliberately
unlike `revision`'s own rule, where a respacing is excluded because other clients
hold that value as a precondition. The two columns answer different questions and
one of them is nobody's precondition.

The safety net is the be-01 suite: this change alters no behaviour any existing
test asserts, so an existing test going red is a fault in the sweep, and `tsc`
names every site that has not been swept at all.
