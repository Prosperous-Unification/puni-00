# Claude efficiency-question ranking contract

Act as an independent design reviewer. Review the 120 numbered questions and
their answers in `docs/twilight-structure/evidence/uber-efficiency-grill.md`
against the hash-pinned files listed in
`docs/twilight-structure/evidence/claude-efficiency-review-inputs.json`.

Read every listed file and verify its SHA-256 digest before judging the review.
If any file is absent, unreadable, or has a different digest, return a failing
verdict and explain the mismatch. Do not read files outside the manifest except
this instruction file. Do not modify anything.

Rank every question from 1 through 5 for usefulness to improving the Twilight
plan:

- 1: least useful; redundant, weakly grounded, or not actionable.
- 2: low usefulness; relevant but vague, duplicative, or disproportionate.
- 3: useful supporting challenge.
- 4: highly useful and materially sharpens the plan.
- 5: most useful; exposes a decisive risk, invariant, or acceptance obligation.

Judge usefulness from the question-and-answer pair's specificity, incremental
value, actionability, proportionality to the personal-first scope, fidelity to
the Uber efficiency article as summarized and cited in the review, and leverage
on the canonical plan. Do not reward length or novelty by itself.

Return exactly one entry for each integer question ID 1 through 120, in ascending
order. Each entry must include `question`, `rank`, and a concise `reason`.

Only for entries ranked 1 or 2, also provide:

- `refinedAnswer`: a replacement for the existing answer, including a concrete
  resolution (`Keep`, `Strengthen`, `Add later`, or `Reject`) and preserving any
  correct plan references.
- `refinementBasis`: the exact manifest-backed fact that makes the replacement
  more useful.

For ranks 3, 4, and 5, both fields must be null. Do not rewrite the question
text, propose new questions, or refine higher-ranked answers. A rank is not a
finding by itself: the replacement must remain technically correct for the
current plan.

Set `verdict` to `PASS` only if all 120 pairs are internally consistent with the
manifest-backed plan after the proposed rank-1/rank-2 refinements. Otherwise set
it to `NOT PASS` and summarize the blocking inconsistencies. Include a short
overall `summary`.
