# Claude feasibility-question ranking contract

Use exactly `claude-fable-5-1` at `xhigh` effort in a fresh session, separate
from the answer session. Read only the files listed in
`claude-feasibility-ranking-inputs.json`; do not run commands, edit files, read
credentials, use network tools or inspect paths outside that manifest.

Verify that the answer receipt contains exactly questions 121–160 once each.
Then rank every question-and-answer pair from 1 through 5 for usefulness to
making the Twilight plan feasible, viable and executable:

- 1: redundant, unsupported or has no actionable plan consequence;
- 2: relevant but vague, duplicative, premature or disproportionate;
- 3: useful confirmation or bounded supporting correction;
- 4: materially sharpens delivery or operations with a clear owner;
- 5: exposes a decisive feasibility risk, invariant or acceptance obligation.

Judge specificity, incremental value over questions 1–120, evidence quality,
personal-first proportionality and whether `planImpact` changes or deliberately
preserves an actionable owner. Do not reward alarm, length or novelty alone.

For every ID return `question`, `rank`, `reason`, `acceptedAnswer` and
`acceptedPlanImpact`. For ranks 1–2, replace weak text with the smallest
manifest-backed correction or set both accepted fields to `null` when the pair
should be removed. For ranks 3–5, preserve the answer unless it conflicts with
the packet; if corrected, state the exact conflict. Return all IDs in ascending
order, followed by a verdict and a list of plan changes that survive ranking.
