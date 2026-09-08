# Claude efficiency-question ranking

On 2026-09-08, the Claude CLI reviewed the hash-pinned Twilight packet with
`claude-fable-5-1` at `xhigh` effort. The main model used 24,448 thinking tokens;
the invocation cost $6.35987975 and returned 120 schema-valid rankings. The
[complete CLI receipt](claude-efficiency-ranking-receipt.json) preserves all
top-level metadata, all 120 reasons, and every proposed refinement. The original
one-line stdout SHA-256 is
`918804aefaaf6a67575474d6e0ad844ab7374713a64ef545389c5ab2ccd91c17`; the
Nx-formatted repository copy is
`c9d54ccbe200531101518f77631d1e113494720fcb4c7ee3ef58cf0769b2b00f`.

Claude returned `NOT PASS` only because the deliberately read-only tool set did
not expose a hashing command. A separate local `sha256sum --check --strict` then
matched all 11 manifest entries. The rankings were evaluated as external review
feedback rather than applied blindly; each low-rank basis was checked against the
current manifest-backed plan.

## Complete ranking

- Rank 1: 117, 119
- Rank 2: 3, 12, 18, 30, 52, 53, 90, 109, 113, 118
- Rank 3: 1, 5, 6, 8, 9, 13, 17, 19, 20, 22, 23, 26, 27, 28, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 49, 50, 54, 55, 56, 57, 58, 64, 65, 70, 72, 74, 75, 76, 77, 80, 81, 82, 85, 87, 88, 89, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 112, 114, 115, 116, 120
- Rank 4: 2, 4, 7, 10, 15, 16, 21, 24, 25, 29, 33, 44, 48, 59, 60, 61, 62, 63, 66, 68, 69, 71, 78, 79, 83, 86, 91, 92, 111
- Rank 5: 11, 14, 51, 67, 73, 84

The scale is least useful (1) to most useful (5).

## Low-rank dispositions

| Question | Rank | Review reason                                                                                    |
| -------: | ---: | ------------------------------------------------------------------------------------------------ |
|        3 |    2 | Adoption metrics are disproportionate for one operator, and the customer phase is already gated. |
|       12 |    2 | It duplicated question 11 and used `Adapt`, outside the four declared resolutions.               |
|       18 |    2 | It incorrectly treated the coordinator and secretary as activity classes.                        |
|       30 |    2 | It said reasoning-effort defaults were absent although `execution.yaml` pins them.               |
|       52 |    2 | It used non-canonical `Adapt` and omitted the deliberate absence of starting thresholds.         |
|       53 |    2 | It deferred a driver view already owned by M1 Tasks 5, 7.2, and 8.1.                             |
|       90 |    2 | It omitted correctness, traceability, and effort already present in the knowledge benchmark.     |
|      109 |    2 | It was vague about existing publication and interrupt boundaries.                                |
|      113 |    2 | It repeated questions 19 and 56 without naming the publication capability.                       |
|      117 |    1 | It restated question 54 without a new criterion.                                                 |
|      118 |    2 | It largely repeated questions 19 and 56 and existing dynamic-routing deferral.                   |
|      119 |    1 | It restated rejections already made in questions 6, 22, 26, and 60.                              |

Only these 12 answers were refined. Question text and answers ranked 3–5 were
left unchanged.
