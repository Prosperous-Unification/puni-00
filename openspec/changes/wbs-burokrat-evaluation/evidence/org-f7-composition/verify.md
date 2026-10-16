# Local organization and F7 composition — 2026-10-16

Isolated clone: `/tmp/puni-org-f7-composition-sol-20261016`. This is an unpublished
composition for exact review. No source checkout was changed, rewritten or pushed.
The ignored `node_modules` link reuses the reviewed organization aggregate's
dependencies; no frozen install, release artifact or dependency reproducibility
claim follows. Commands ran serially; no local typecheck, build or full Nx gate ran.

## Source ancestry and reconciliation

The exact prerequisite is `9fbd972477f878ec3a847e4452f380cdca89b2cd`, tree
`27975228823fd38ff40fb7e682117f1a60afcace`. Two normal no-fast-forward merges retain:

- F7 `c46cb8313848f498722d0b7a47e7c7cdf9380354`, tree
  `f12ce6c763c01effef4659a031f2b3c3c8627bc5`, merged as
  `c3c9c2fa8459f844a9f9c262dd95cee5c19de546`.
- Organization `7f52ba5093030c40f765a2197c55203b18d1bd89`, tree
  `a5d5591c2393dda6d7a2a11240a2911c4bd8d86f`, merged as
  `6da1e00a3d528ea4a31291c0b69a32fdcc4467c7`, tree
  `04999f7f556789e5b00f4c761b2a763db7f91ca4`.

Both merges completed without textual conflicts. [Source union](source-union.json)
checks 7,239 mode/blob paths against common base `87a2b7ed`; 7,235 match their
single changed source or base exactly, with zero unexpected paths. The four
multiple-source paths are CONTEXT.md, both wiki policy JSONs and domain-claim.ts.
The latter combines F7 snapshot delegation with organization cancellation and
scheduling documentation. CONTEXT retains the prerequisite terms and adds the
two SMTP terms. Before the declaration repair, each policy is semantically
exactly its prerequisite JSON plus the DNS OpenSpec source exclusion. The native
relay classification and prerequisite corpus repair remain present.

The new clone initially had only sample hooks. The two merge commits therefore
had no installed repository hooks; neither used `--no-verify`. Normal hooks were
installed before the final commit; its complete outcome is retained separately
in `/tmp/puni-org-f7-receipts-20261016/commit.log`. No merge history was rewritten.

## Declaration repair and watched failures

The first full pilot-policy run observed 13 pass, 11 fail, 395 assertions. Its
positive production CLI refused unindexed `memory-stores.ts`; several negative
cases instead encountered undeclared WBS120 gzip evidence before their intended
assertion. The raw failing output is embedded in [checks](checks.json).

Following architect review, the memory adapter README adds exactly the new
`memory-stores.ts` member. Both policies add exact binary declarations for
`installed-green-pack.log.gz` and `installed-red-pack.log.gz`, using
`application/gzip`. Their consumer and source regeneration authority are the
WBS120 verify.md, which documents pack commands, the retained runner and lossless
compression. No wildcard, classifier, frozen baseline, source revision, module
mapping, gzip bytes or installed-proof receipt changed. This restores the
existing membership and inventory contracts; it introduces no new behavior or
safety guard and needs no new OpenSpec proposal.

Production `check-indexes working <clone> 6da1e00a...` now exits 0. Its report
visibly retains memory adapter review debt: 41 direct entries against limit 40.
Production `classify-candidate committed` with the repaired full policy also
accepts the entire immutable merge candidate. The narrower bootstrap policy
cannot classify that whole repository: its existing rules omit
`.agents/skills/.openspec-target`. No selector was broadened to suppress this.

Both policy copies were separately exercised through the production classifier
against one committed fixture containing the exact source blobs of both gzip
artifacts, their consumer document, relay.c and the DNS OpenSpec review script.
Both GREEN runs classify the artifacts as binary/application-gzip. Removing each
exact declaration independently produces exit 1 and the exact omitted artifact's
`undeclared binary content` diagnostic: four watched negatives. Source and fixture
identities, commands, mode/blob classifications and outputs are in checks.json.
Existing production assertions have adjacent Proof comments naming the faults.

## Fresh checks and memory bounds

The restored backend packet passes **416 tests, 1,119 assertions across 17 files**:
verification capture, organization store, queued proof cancellation, proof timer,
combined SMTP/proof boot, authoritative DNS boot, SMTP boot, supervisor,
entrypoints, startup failure, SMTP adapter/config, shared config and DNS codec /
resolver / transport. Fourteen bounded commands ran one at a time; peak reported
RSS is **652,660 KiB**. The initial sandbox attempt failed a localhost SMTP bind
(13 pass, 1 fail in that boot file); the complete serial rerun with loopback access
passed. The initial numbered raw log was overwritten by that rerun; its diagnostic
is retained in the tool transcript and summarized in checks.json.

The named legacy-source corpus check passes before and after the declaration
repair, 1 test / 1 assertion. Its existing digest and Proof chain are unchanged.
The four DNS classification controls pass, 32 assertions. These source CLI checks
do not establish installed or activated Tool Wiki acceptance.

The initial full pilot process peaked at 1,128,736 KiB. A repaired focused positive
was stopped at its first memory threshold without a verdict. Subsequent tests ran
individually with process-group sampling and a 10 GiB available-memory floor.
The first 1,400,000 KiB cap stopped case 8. One approved bounded rerun of case 8
passed, 1 test / 13 assertions, at sampled group RSS 1,752,696 KiB and minimum
available memory 11,400,856 KiB. The final approved cap was 2,000,000 KiB with a
10,000,000 KiB available-memory floor. The positive case then hit group RSS
2,001,216 KiB at 10.019 seconds and was terminated, with 17,737,068 KiB available.
The sampler's historical `maximumProcessRss` field names that group ceiling for
these later runs; its code compares summed descendant RSS. Peaks are samples,
not an operating-system hard memory limit, and can overshoot between samples.

Final repaired pilot coverage is **7 of 24 cases passed** (cases 1 and 3–8),
case 2 terminated without a verdict, cases 9–24 unrun. No full pilot GREEN is
claimed and no further limit escalation was attempted. Raw sampling and bounded
runner sources remain in `/tmp/puni-org-f7-receipts-20261016`; checks.json retains
exact commands, monitor summaries, stop events and coverage.

Pinned OpenSpec 1.12.0 gate-contract `validate --all --json` passes **246/246**.
An extra `--strict` run fails six existing main-spec Purpose placeholder warnings;
all 228 changes are valid. Affected main specs: dev-deploy, live-plan-snapshot,
plan-command-registry, plan-import, saved-plans and scheduler-optimization. No
unrelated spec was changed. Scoped overlap/declaration formatting passes.

The prerequisite-to-merge `git diff --check` remains exit 2 for the same 16
inherited whitespace warnings in four reviewed F7 source receipt files. Their
mode/blobs remain unchanged. This failure is retained and is not waived or
reported as passing; composition-added paths are checked separately.

## Acceptance limits

No local static typecheck, full Nx gate, browser, solver, Docker, installed F7
assessment, hosted CI, canonical h2puni gate or live DNS/SMTP acceptance ran.
The remaining full acceptance path is the canonical exact-SHA host gate after
authorized publication or controlled host transfer. Public source publication
was previously rejected by automatic approval review; this composition is local
only and does not imply approval to push. WBS F7 remains `blocked_by_proxy`;
DNS, SMTP and scheduler remain unaccepted live. No certification claim follows.
