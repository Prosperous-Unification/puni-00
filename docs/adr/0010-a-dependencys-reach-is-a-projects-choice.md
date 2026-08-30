# A dependency's reach is a project's choice, not the system's

On 2026-08-11 Dany's rule was that a dependency waits on the predecessor's
**anchor slice** — its first estimated step — so that nothing waits on QA;
`dep-waits-on-first-role` made that the whole system's rule and argued it
carefully from his pre-wbs scheduler's hand-off convention. Having seen it
drawn, his call on 2026-08-29 is the opposite: a dependency should wait for the
predecessor's work to be **finished**. Both readings are right about a real
project and wrong about every project, so the rule becomes a stored per-project
**dependency reach** with two values — `whole-item` and `anchor-slice` — read by
the scheduler from the project being scheduled and never supplied by a client.

## Considered Options

- **Keep the anchor rule and wait for the per-edge model** ("030 needs 020·dev").
  Rejected for now: the per-edge model is still wanted and still later, and it
  would fall back to exactly this project-wide setting for every edge nobody has
  spoken about. Making that fallback a choice is the half of it that can ship
  today.
- **A boolean, `waitsOnWholeItem`.** Rejected: it reads fine until the per-edge
  model needs a third answer, at which point every call site becomes a negation.
  A named two-member enum takes a third without that.
- **Delete the anchor rule.** Rejected by Dany: it is one project's convention
  rather than a mistake, its identity tests exist, and it stays reachable. Its
  August reasoning is now the `anchor-slice` arm's justification.

## Consequences

- **The default is `whole-item` for every project, including every one that
  already exists.** The column default reaches every stored row, so every plan
  with a multi-step predecessor changes shape on the release that carries this.
  That is the intent, not a migration accident: a project that wants the August
  behaviour asks for it.
- The August identity fixtures are **kept** as the `anchor-slice` arm's oracle
  rather than deleted, which is what makes the second value tested rather than
  merely present — `schedule-shapes.test.ts`, `schedule-leveling.test.ts` and
  `schedule-identity.test.ts`'s growth property all name the reach they were
  written for. Two differentials that replay an oracle captured before the
  setting existed (`capacity-migration-identity`, `priority-band-identity`) name
  it too, and assert it where they lift it off, so a replay that quietly changed
  rules would fail rather than measure the wrong thing.
- **An unrecognised stored reach throws.** It is malformed trusted data — a
  hand-edited database, or a value a newer release wrote read by an older colour
  mid-swap — and defaulting it would schedule a plan by a rule nobody chose and
  say nothing (`AGENTS.md` R5). `ProjectRepository`'s `toProject` is the
  boundary, beside the same refusal for `estimate_method`.
- **The chart draws each arrow out of the slice the reach names**, keyed on the
  same value the engine used, so the drawing and the schedule cannot disagree.
  The failure this prevents is specific: an arrow drawn from the anchor over a
  schedule computed whole-item points at a successor that starts much later and
  reads as slack that is not there. The `Start` column's "Waits for …" sentence
  is resolved through the same walk for the same reason.
