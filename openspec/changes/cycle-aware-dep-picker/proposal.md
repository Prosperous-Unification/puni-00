# The Depends on picker greys what be-01 would refuse

## Why

Both UX reviews put this in their top seven, 2026-08-06. The picker offers
every row it is not certain about, so choosing one that would loop — or one
that contains the row being edited — is a click, a request, and an error
message underneath the table. The refusal is correct and arrives too late to
be a lesson: the person has already decided, and what they learn is that the
tool lets them do things it then complains about.

This **reverses a decision** stated twice: `pickerEntries`' JSDoc ("rows be-01
would refuse as a cycle or an ancestor are offered; the refusal carries a
reason and the UI already relays it, whereas guessing the graph here would be
a second implementation of that judgement") and `pick-deps-and-keep-the-project`'s
non-goal "No validity filtering in the picker". The objection stands and is
answered rather than ignored: the rule is **ported**, not guessed — the same
tree expansion, the same Kahn — and the port is held to be-01's own test cases,
copied into fe-01 so the two cannot drift apart unwatched.

## What Changes

**The list marks the rows it cannot take, and says why**

- From: every row that is not self and not already taken is offered and
  clickable; be-01 refuses; a message appears.
- To: those rows are still **offered**, greyed, `aria-disabled`, unclickable,
  with the reason after the name — `— would loop`, `— contains this row`,
  `— inside this row`. ArrowDown/ArrowUp step over them and Enter never takes
  one.
- Showing rather than hiding, deliberately: a row that silently vanishes from
  a list reads as a bug in the tool, and the reader has no way to ask why. A
  row visibly refused, with a reason, teaches the shape of the plan.
- Impact: fe-01 only. A new pure `dep-graph.ts` predicts; be-01's `canDepend`
  is untouched and still decides. The prediction is re-derived from the rows on
  every render — a peer's edit can make an open list's entry a loop, and it goes
  grey when the tree arrives.

## Non-Goals

- **No pre-judging the typed path.** `010, 020` still goes to be-01 and still
  reports what came back, partial successes included. It works, and knowing
  the answer early is not a reason to write a second place that answers.
- **No client authority.** A prediction that disagrees with be-01 is a bug in
  the prediction; the server's refusal is still the one that matters.
- **No change to what is excluded.** The row itself and its existing
  predecessors are still absent, not greyed: neither is a plan anyone is
  trying to express.
