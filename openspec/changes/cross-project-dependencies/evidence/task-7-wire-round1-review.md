# Solver correction re-review: two remaining blockers

**Verdict: changes required.** Astra reviewed frozen source `388fb5410` over
`05a5b85d5`; all nine source hashes matched before and after. Neither commit
is integrated. [Full review](task-7-wire-round1-review-proofs/puni-connected-solver-wire-round1-review.md.txt)
and [exact proof artifacts](task-7-wire-round1-review-proofs/) preserve the
reproductions, retained request/process result and restored checks.

1. **P1: bundled callers fail during schema loading.** The new validator reads
   a schema relative to its module at initialization. Bun preserves the read
   relative to the output bundle, whose required schema is not shipped. An
   existing local revalidator import works from source but the built artifact
   exits1/ENOENT. The artifact test has one passing source case and one real
   failed bundle assertion. This does not demonstrate failure of the current
   source-run Docker image.
2. **P1: preparation and receiver disagree on retained foreign occupancy.**
   A finite long C slice belonging to a person absent locally produces the
   ordinary lower10/upper9 terminal with horizon58. Bun skips its quantization
   before checking range; Python checks every retained holder first. The exact
   retained request exits64 with an occupancy range refusal. Evidence is a
   real installed-CLI assertion failure, not a setup failure. Foreign evidence
   must remain complete; finite representability refusal must precede request
   or terminal classification.

All six original repro cases now pass. Fresh independent checks: contracts516,
Python276, adapted original/installed probes11 with49 assertions, contracts
types and lint. Astra independently repeated the foreign-owner mutation and
observed the actual exit0-versus64 assertion failure. These focused successes
do not erase the two failed artifact/request tests.

The mutation audit confirms meaningful failures in the eleven author logs.
Removing the semantic block proves the block-level negative, not independent
removal of each constituent guard. Likewise the malformed-budget assertion
fails before fractional origin executes in that mutant. Round2 must preserve
these limits and add individual semantic-guard proof where reachable. The
three algebraically masked formula terms retain their prior honest limits.

Original Sol resumed the same worktree for both fixes and proof refinement.
It will execute built local and connected callers, preserve the receiver's
all-retained-holder numeric checks with typed horizon-overflow preparation,
and repeat real builder/installed receiver coverage. Independent re-review
remains required. Backend active fixture reconciliation, runtime/cache/history,
activation, full gates and delivery remain open. No task7 checkbox is closed.
