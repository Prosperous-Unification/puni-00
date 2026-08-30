# The agent loop, audited — 2026-08-30

Written while landing the five outstanding items of
`openspec/DANY-REQUEST-AUDIT-2026-08-30.md` with a second Claude session and its
five agents working the same repository at the same time.

Two things are recorded here, and the second is the one worth keeping:

1. **The plan** — what Dany asked for, what is actually on `main`, who owns
   which branch, and what is left.
2. **What the loop got wrong** — six measurements that were green, or red, for
   reasons other than the ones claimed. Every one was found by checking rather
   than by reasoning, and four of them were mine.

---

## Part 1 — the plan

### The audit's own table was wrong in both directions

`DANY-REQUEST-AUDIT-2026-08-30.md` checked `main` by grepping for a shipped
symbol. That method under-reports, and it did:

| #   | Ask                                         | Audit said           | Actually                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Hover tooltip right of the project dropdown | **NO**               | **on `main`** — `ProjectOptionCard` in `project-page.tsx` portals a `HoverCard beside={anchor}` clear of the listbox's right edge, with owner, restricted, start and last-opened. Its change's only open task is "deploy to dev and Dany looks", a human item |
| 2   | Rename Phases → Steps                       | "15 open, unstarted" | 15 of 15 slices ticked; merges into `main` with **zero conflicts**; only its gate is outstanding                                                                                                                                                              |
| 7.1 | Gantt deps from all steps                   | 14 open              | branch complete, units green, gate outstanding                                                                                                                                                                                                                |
| 7.2 | Unestimated steps assume 2 days             | 9 open               | 7 of 9; the two open are gate items                                                                                                                                                                                                                           |
| 3   | One project-config modal                    | 11 open, unstarted   | correct — no code, no branch                                                                                                                                                                                                                                  |

**Outstanding is four, not five.** A `tasks.md` tick is not evidence, and
neither is its absence — which is the same error in the other direction.

### Ownership, settled between the two sessions

`.claude/worktrees/*` share **one `.git`**. A branch name resolves to exactly
one ref for every session, and every session on this machine commits under the
same git author, so `%an` distinguishes nothing. **The worktree assignment is
the only reliable signal of who owns work**, and it is not visible from the
other side.

| Branch                                          | Owner             |
| ----------------------------------------------- | ----------------- |
| `assumed-duration-schedules` (ask 7.2)          | this session      |
| `project-config-modal` (ask 3)                  | this session      |
| `work-item-types`, `external-refs`              | this session      |
| `dep-reach-whole-item` (ask 7.1)                | the other session |
| `steps-not-phases` (ask 2)                      | the other session |
| `tags-accumulate`, `plan-toolbar-controls-gate` | the other session |

**Standing rule, agreed after three violations: never commit inside
`.claude/worktrees/agent-*`.** Reading one is fine. If a branch there needs
`main` merged forward, ask its owner to do it between runs, when nothing is
measuring.

### What is left

1. `assumed-duration-schedules` — browser gate re-running clean; then merge.
2. `project-config-modal` — eleven slices, unwritten. Blocked on
   `steps-not-phases` only for naming: its section should be called `Steps`
   once rather than renamed twice.
3. `steps-not-phases` and `dep-reach-whole-item` — the other session's, both
   needing only their gates.

`steps-schema-rename` is the physical `role`→`step` table rename. It is the
second half of ask 2 in the audit's framing, but **Dany's ask is user-visible
wording**, which `steps-not-phases` satisfies on its own. Recorded as a
deliberate deferral rather than an omission.

---

## Part 2 — six measurements that meant something else

R5 says a check whose failure has never been observed is a claim, not a gate.
The loop produced a matching family: **a result whose _cause_ has never been
established is not evidence either**, whichever colour it is.

### 1. A gate that measured a checkout nobody was editing

The full browser gate ran on port shift 1500 while another agent's gate was
also on 1500. It reported **229 passed / 4 failed** and the failures had an
innocent-looking explanation, so it read as clean. It was not clean: two suites
shared one set of ports, and nothing in the number says so. Re-run serialised
under a dedicated browser lock before it was believed.

**A browser number is not evidence unless you know what else was running when
you took it.**

### 2. `git add -A` in a worktree whose owner had not been established

Commit `14a5bf5`'s message describes one JSDoc line. Its contents are **twelve
files and 388 insertions** of another agent's in-flight work. Not rewritten —
it sits under two merge commits, and a corrected record in `verify.md` naming
the hash and the true contents is worth more than a tidy history that hides
that it happened.

### 3. A `verify.md` asserting a run nobody made

It recorded `fe-01:test` at **1949 pass**. The real figure is **1899 pass, 0
fail, 60 files**. The agent that took the measurement caught its own document.
Had it not, the next merger would have read 1949 as evidence.

**This is R5's own failure wearing the costume of a passing document**, and it
is the most dangerous item on this page, because nothing about a verify table
looks like a claim.

### 4. "Fails on `main`" used as a reason not to look

Three browser checks fail on `main` on this host. Two are documented in
`apps/fe-01/playwright.config.ts` as environmental: a non-US host renders
`dd.mm.yyyy` segments, so `05202026` saves 2026-02-05 rather than 2026-05-20,
with `locale: 'en-US'` and `--lang=en-US` both tried and both failing to reach
Chrome's segment order.

The third, `deps-cell.spec.ts:432`, was on that list too — and **it was a real
bug the whole time.** Both sessions reproduced `Expected: 0 / Received: 42` on
`document.getAnimations().length` and neither could explain it, so it sat as a
third "environmental" red every agent was told to ignore.

It was not environmental. `chooseTheme` waited for the animation count to reach
zero, which that page never reaches: a **finished** `CSSTransition` is not
dropped for a subtree Chromium has stopped recalculating. Measured in
Playwright's own Chromium — 155 → 42 at ~425ms, then flat, every one `finished`
with `fill: backwards`, 36 on `BUTTON` and 6 on `INPUT`, one per animated
property. `dark-mode.spec.ts` and `priority-ramp.spec.ts` already filter on
`playState`; this file had never been brought in line. Fixed on `origin/main` at
**`26d6166`**, 10/10, negative watched at `Expected: 0 / Received: 42` — so the
two-not-three list is now true of the repo rather than only of our knowledge,
and an agent pulling that commit stops seeing the red without being told to
ignore anything.

**The known-failing list on this host is two, not three.** Being told to ignore
a red is how a real one gets ignored — and this one was, by both of us, for a
day.

### 5. A port-clearing recipe that was a loaded gun at five agents

`kill $(lsof -ti :$p)` is safe with one agent. With five it killed a
neighbour's be-01 **83 seconds into a run**, after which the log showed **134
failures at a uniform ~10.4s each, every one fictitious**. The agent reading it
correctly diagnosed a dead server rather than reporting any single failure as
real.

Two rules came out of it, both now on `main` beside the guard:

- **Check a PID is yours before killing it** — the process must live under your
  own worktree.
- **Two shifts must be more than 100 apart**, and clear of what the host itself
  listens on. `E2E_PORT_SHIFT=1700` puts fe-01 on **5900 — macOS Screen
  Sharing**, a root-owned listener invisible to a user `lsof`, so Playwright
  reports the port busy and a pre-flight check sees nothing.

**But the sequence matters more than the rules, and it is not flattering.** A
collision guard shipped; an agent immediately hit a case it did not cover; 1700
was assigned to fix that; 1700 was itself broken by a listener nobody had
checked for. Three fixes, each with the next hole in it.

**Each fix was written from the same place the bug came from — reasoning about
the port arithmetic rather than measuring the host.** The guard knows the three
defaults, which a config can know; it cannot know what else is running, and it
cannot know what the machine itself listens on. Both facts were available before
either fix was written.

### Three artefacts that look like conclusions

The verify table, the review, and the instruction to five agents all failed the
same way in one afternoon, and the failure is identical in each:

- A `verify.md` row read **1949 pass**. Nobody ran it.
- A review said the override's docstring permitted a second lane. It was quoted
  from a branch read hours earlier; the file said the opposite.
- An instruction told five agents they had two lanes. The seam had been deleted.

**A docstring quoted from memory is the "1949 pass" failure one artefact along.**
Each of the three is a claim wearing the shape of a conclusion, and **none of
them carries a marker saying which it is** — that is what makes the family
dangerous rather than merely wrong. A test at least announces its colour. A
table, a review and an instruction all read as settled by construction.

The cheap defence is the same in all three cases and costs under a minute: open
the file, run the command, read the ref. It was skipped every time by someone
who had genuinely read the thing — earlier, elsewhere, or on another branch.

### The shape they share

Four of the six are **an assertion made outside the window the fault lives
in** — `AGENTS.md`'s own R5 family, at the level of the loop rather than the
test. The green was real; what it described was not what anyone thought.

The cost of checking, every time, was under a minute. The cost of not checking
was a destroyed branch narrowly avoided, a 7-minute gate invalidated, and a
false measurement one merge from being cited as proof.

---

## What actually worked

- **Two sessions each caught the other's false premise**, within a minute, by
  running the command instead of arguing. One of them would otherwise have
  ended in `git branch -D` against a live branch.
- **An agent reported a fictitious 134-failure log as a dead server**, not as
  134 findings.
- **An agent corrected its own `verify.md`** rather than shipping the number
  that flattered it.
- **A retraction, carried by the session that proposed it.** See below; it is
  the sixth item, and it is here rather than in Part 2 only because the thing
  that caught it was the repo's own test.

---

## 6. The two-lane lock — proposed, endorsed, and wrong

The other session split heavy work into two named lanes, browser gates taking
`/tmp/wbs-heavy-browser.lock` via a `$WBS_HEAVY_LOCK` override, and asked me to
check the reasoning. **I endorsed it as "squarely within" the override's
documented purpose. It was not, and I should have read the file rather than the
branch I had seen it on hours earlier.**

`$WBS_HEAVY_LOCK` no longer exists. `bin/heavy-lock-lib.sh` now says why, and it
describes the proposal exactly:

> **No environment override, and that absence is the point.** An earlier cut of
> this took `$WBS_HEAVY_LOCK` so a test could aim two runs at a private mutex —
> and `tool-dagger/src/heavy-lock.test.ts` caught it, because a caller able to
> choose its own lock path is a caller able to opt out of the lock: two heavy
> runs set it differently, take two different mutexes, and both proceed. That is
> the exact failure this file exists to prevent, reintroduced by its own test
> seam.

Nothing was damaged in the mechanism — setting the variable is a no-op, so every
run took the canonical lock and queued. **But the throughput the lanes claimed
was never real**, and a design reviewed by two sessions survived both because
neither opened the file.

**The consequences were not a no-op.** The instruction reached five agents, and
one of them ran two heavy commands at once on the strength of it — which is
where the ten contaminated failures below came from. **A design that is a no-op
in the mechanism can still change behaviour through what people do believing it
works.**

**Consequence for reading any red from the lock suites.**
`tool-devsync`, `tool-dagger` and `tool-bootstrap` assert _contention
behaviour_ — `refuses immediately with exit 75 while another heavy operation
owns the lock` cannot survive a second lock-holding process on the machine. One
agent saw ten failures across the three, with `configure.sh` cases timing out at
60s after **293s** of wall clock: starvation, not code.

**So that suite is order- and load-sensitive by design, and any run of it beside
another heavy job is uninterpretable — including the "quiet `main` baseline"
recorded in this session.** That baseline showed `tool-bootstrap` 53/7 and
`tool-devsync` 26/2, matching the branch under test, which is still evidence
that the branch did not cause them. It is not evidence that those figures are
what a serialised machine would print.
