# Verify — caret-gutter-and-initials

## Commands

| Command                                                         | Result                          |
| --------------------------------------------------------------- | ------------------------------- |
| `bunx nx format:check --all`                                    | pass, exit 0                    |
| `bunx nx run-many -t test lint typecheck build --parallel=2`    | pass, exit 0, 21 projects       |
| `bunx playwright test --config apps/fe-01/playwright.config.ts` | **130 passed, 4 failed** of 134 |
| `openspec validate --all --json`                                | 0 failed                        |

`bunx nx lint fe-01` failed once, and it was right: `const [first, second] = words`
gives two `string`s without `noUncheckedIndexedAccess`, so `first === undefined`
and `second === undefined` are conditions the types say can never hold —
`@typescript-eslint/no-unnecessary-condition`. A test asserting a branch the
types call unreachable is the shape of a check that cannot fail. Rewritten to
branch on `words.length`, and the three negatives below re-watched against the
rewrite rather than trusted from the version before it.

## Which checkout the browser gate measured

`reuseExistingServer: !isCi` (`LLM_README.md`'s landmine). Read from the
listening process's own working directory:

```
$ for p in $(lsof -nP -iTCP:4200 -sTCP:LISTEN -t); do lsof -a -p $p -d cwd -Fn | grep ^n; done
n/Users/danylofedorov/wd/puni/wbs-tool-v1/apps/fe-01
```

## Failure proof

| Fault injected                                | Test that failed                                                       | Observed failure                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| single-word `slice(0, 2)` → `slice(0, 1)`     | `names a one-word assignee by its first two letters`                   | `expected 'V' to be 'VA'`                                            |
| two-word branch collapsed to the one-word one | `takes one letter from each of a two-word name`                        | `expected 'KA' to be 'KN'`                                           |
| `toLocaleUpperCase()` dropped                 | `upper-cases what it takes`                                            | `expected 'va' to be 'VA'`                                           |
| `filter(Boolean)` dropped                     | `reads a name padded with spaces as the name`                          | `expected 'V' to be 'VA'`                                            |
| the throw replaced with `return ''`           | `refuses a name with nothing in it`                                    | `expected [Function] to throw an error`                              |
| the cell prints `doing.name` again            | 10 in `wbs-table.test.tsx`                                             | `expected '· Ada' to be '· AD'`, `expected '· (Ada)' to be '· (AD)'` |
| the caret gutter's `width` removed            | **browser**: `lines up the number of a parent and a childless sibling` | `Expected: 44, Received: 56.515625` — the caret's own 12.5px         |
| the lock swapped back before the number       | **browser**: `holds a number still when its row's number is frozen`    | `Expected: 56, Received: 76`                                         |

## Two lines that could not fail, and what happened to them

**A `trim()` in `initialsOf`.** Written, and its negative — `reads a name padded
with spaces as the name` — watched **passing** with the `trim()` deleted:
splitting on `/\s+/` puts an empty string at each end and `filter(Boolean)`
drops them either way. The `trim()` is deleted and the test watches the filter,
which was then watched failing on `expected 'V' to be 'VA'`. `column-widths-drag`
one change ago, again.

**The first frozen-lock injection.** The swap was written as "remove the number
span, re-insert it before the lock" — which puts it back exactly where it was.
It was watched **passing**, and only the real swap (`lock` before `number`)
failed, on `Expected: 56, Received: 76`. An injection that does nothing is a
proof that proves nothing.

## A decision reverted rather than reversed

A `title` carrying the whole name was added to the folded assignee and then
taken back out. `wbs-table.test.tsx`'s `leaves the assignee no title of its own
to say it twice` records a decision from 2026-08-09 — a native tooltip is one
line and a second late, and `folded-role-card.tsx` already names the assignee in
full on hover. Initials make that card more load-bearing; they do not make the
tooltip more welcome. The delta spec was corrected to keep the decision, and it
now carries `the cell adds no tooltip of its own` as a scenario.

## Known-failing, unrelated

The same four as `hover-full-note`, and pre-existing for the same reason — the
shared `apps/be-01/local.db` has accumulated 8 people and 6 service teams, so
`layout.spec.ts:1733` types `@Kat` and waits for a _create_ option that is never
offered because `Kat` already exists. Proven there by stashing the change and
re-running; nothing in this change touches the directory either.

- `directory.spec.ts:131`, `:217`, `:258`
- `layout.spec.ts:1733`
