# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 (bun:test)   263 pass  0 fail
      fe-01 (vitest)     205 pass  0 fail (3 new)
      libs/domain         22 pass  0 fail (11 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
18 items, 0 invalid — calendar-dates valid
```

## The checks, and the faults that broke them

| Check                                                     | Fault injected                                          | What the run reported                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| The constraint reaches the schedule (`work-item.service`) | `notBefore` dropped from the `schedule(...)` call       | `pushes an item later when it may not start before a date` failed — the item started on day zero; restored, 33 pass       |
| Weekends are skipped (`workday.ts`)                       | `addWorkdays` made to add calendar days                 | 6 tests failed across the domain and the service, including the Friday→Monday step and the round-trip; restored, all pass |
| A stored non-day is refused (`project.service`)           | (its own test) `2026-02-31` matches the route's pattern | the service refuses it and the route answers 422, so it never reaches a text column the scheduler would later throw on    |

`endsOn` was wrong on the first attempt and a test caught it. The last day was
computed as `finish - Number.EPSILON`, which is smaller than the gap between
representable doubles at 4 — the subtraction rounded straight back and a
two-day task claimed a third day. It is `Math.ceil(finish) - 1` now, which is
the day containing the finish rather than a nudge away from it.

## What is not watched here

The date pickers themselves, and whether "Not before" belongs where it was put
(immediately before the dates it constrains). jsdom has no layout and no native
date widget — the tests drive `type="date"` inputs by value. Needs Dany's
screen.

Holidays are a stated non-goal, so a plan that crosses one will read a day
early for whoever observes it. That is a known limitation, not a defect.
