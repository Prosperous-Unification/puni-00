# Claude efficiency-review prompt

Status: prepared locally on 2026-09-08; not sent externally.

Use exactly `claude-fable-5-1`. Read only the files listed in
`claude-efficiency-review-inputs.json`; do not run commands, edit files, read
credentials, use network tools, or inspect paths outside that manifest.

Review `uber-efficiency-grill.md` and its canonical plan corrections as an
independent architecture reviewer. The review applies Uber Engineering's public
article, [Running a Software Factory Efficiently at Uber Scale](https://x.com/UberEng/article/2093444169037762840),
to a personal-first software factory. Treat Uber's reported fleet measurements as
context, not claims about Twilight.

Check all of the following:

1. Questions are exactly the integers 1–120 once each, with an answer and
   resolution for every question; the second pass is exactly 61–120.
2. Answers agree with the manifest-pinned canonical glossary, product experience,
   design, specification, tasks, execution profile, and verification record.
3. Existing capabilities are not falsely reported missing and proposed additions
   have one coherent owner and requirement-to-task mapping.
4. Cost attribution distinguishes nested denominators, disjoint monetary totals,
   attributed token subsets, byte-only overhead, shared-charge allocation,
   sampling coverage, instrumentation overhead, as-of billing, pricing drift, and
   cross-currency comparability without false precision.
5. Activity benchmarks protect real-work representativeness, uncertainty,
   randomized treatment order, environment compatibility, holdout secrecy,
   Pareto trade-offs, effect-safe rollout, rollback, and current-run epoch rules.
6. Cache, compaction, tool catalog, descriptor, compound-effect, transcript and
   papercut mechanisms preserve repository isolation, authority, effect identity,
   evidence provenance and redaction.
7. Recommendations remain proportional to a personal-first system and do not
   widen M1 into Uber-scale context graphs, universal CLI projection, autonomous
   routing, or fleet analytics.
8. Every new safety check has a concrete future production-path fault and oracle;
   no planned test or document validation is described as observed runtime proof.

Return `PASS` only if no substantive correction is required. Otherwise return
`NOT PASS` with severity, exact file and section, conflicting evidence, and the
smallest concrete correction. Finish with a requirement-by-requirement coverage
table for the eight checks above. Do not infer approval from the request or from
any prior Claude receipt.
