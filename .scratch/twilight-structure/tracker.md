# Twilight decision tracker

This effort uses Wayfinder's local Markdown tracker. It records planning
decisions; OpenSpec retains specifications and the authored implementation plan.

## Wayfinding operations

- The map is `map.md`, labelled `wayfinder:map`. It indexes resolved decisions
  and links to their owning tickets; it does not list open tickets.
- Each child is `issues/NN-<slug>.md`. Its `Parent` links to the map; `Type` is
  `research`, `prototype`, `grilling`, or `task`; its label is `wayfinder:<type>`.
- `Status` is `open`, `claimed`, or `resolved`. Claim before work by setting
  `Status: claimed` and naming Dany as assignee and the agent as researcher when
  applicable. Open, unassigned tickets are unclaimed.
- `Blocked by` lists ticket numbers, or `none`. All listed tickets must be
  resolved before work begins. The frontier is open, unclaimed, unblocked
  children in number order; phase labels do not create implicit dependencies.
- Resolve by appending a dated resolution under `## Answer`, setting
  `Status: resolved`, and adding a named link and one-line gist to the map's
  Decisions so far. Append later conversation under `## Comments`.
- Research reports are linked assets, not decisions on behalf of the user.
  Record inspected revisions and distinguish facts, proposals and unrun proofs.
- New tickets are created before their blocking links are wired. A ticket
  removed from scope is closed with a reason and linked from Out of scope.

Historical decisions stay in their existing source documents. This map does not
recast them as newly resolved tickets or duplicate their detail.
