# Historical planning artifacts

Published copies prepared for WBS 080.18 under the 2026-09-21 decision to make
both artifacts public after a full content review. Independent content/scope
review passed; delivery remains pending. These files do not describe the current
product contract.

- [August manual UI testing plan](2026-08-11-manual-ui-testing-plan.md): the
  original 49 cases, execution notes and dated corrections. The source basename
  was `wbs-manual-tests-2026-08-11.md`.
- [Economics calculator](../../twilight-structure/research/unit-economics/factory-unit-economics.html):
  the standalone HTML from the 2026-09-08 backup, originally named
  `factory-unit-economics.html`. Open it locally. Its original model prices,
  policy claims and estimates are preserved as historical assumptions, without
  revalidation or a recommendation to act on them today.

Sanitization replaces personal names with operator/product-owner references and
synthetic person-a/person-b/person-c labels, replaces the private scratch-project
prefix with `ui probe`, removes the local checkout path, and replaces historical
authentication-location instructions with an authorized test-instance procedure.
No original account, customer records, credentials, screenshots or local source
paths are included. The economics index now links to the public copy instead of
the private artifact identifier.

The calculator retains its existing optional Google Fonts links; its calculations
and charts run locally without them. It has no API write or persistence call.
The publication adds no product behavior, deployment or migration change.

Verification before publication:

- All 49 case IDs preserved in their original order.
- Calculator JavaScript unchanged after formatting, compared using Bun's
  whitespace-normalized transpilation; SHA-256
  `14797af53e299b9a75960babb46ae230b51ae010bc6b6a1c214a3c84c7d3900a`.
- Bun/jsdom execution was unavailable: `Proxy is not allowed in the global
prototype chain`. Its empty-output comparison is invalid and not evidence.
- Chromium 153.0.8010.12: 22 comparisons of original and published outputs passed
  (defaults, all 15 serving scenarios, and six slider changes), with external
  requests blocked. Default medium-feature p50 displays `$15.53`.
- Prettier checked all four changed files and `git diff --check` passed.
- Independent Astra review found no content, fidelity or privacy findings against
  the full originals and checked all 49 cases in order. The canonical gate and
  publication remain pending. The historical UI cases have not been rerun.
  Product lint/typecheck/build and full suites have not been run for this archival
  documentation change.

OpenSpec is skipped under AGENTS.md's archival documentation exception. No new
safety check or product implementation is introduced.
