# Final whole-branch review — I2.01 shared executor lifecycle oracle

Reviewed 2026-11-05. Base `7a97b74804781fa04c46da3f82bd5be6475c01ae`; source HEAD `5196fda5419073261db88ca158f96cbc58bca2fb`, plus the four frozen publication paths. Followed the requesting-code-review template. No subagents, source/index/HEAD/ref changes, archived-helper execution, runtime test/mutation replay, external calls or paid-provider work.

## Strengths

- The two-file source diff is a bounded extraction of the exact nine original public lifecycle cases. `agents/testing/executor-contract.ts:21` supplies real executors and independent expectations; `api-model-adapter.test.ts:171` supplies the actual Burokrat/registry/installed-SDK fixture, literal identity, Hi/end_turn, measured120/30 and text parts. Registration occurs exactly once at `api-model-adapter.test.ts:195`. No invented executor kinds, fake port methods, skipped adapter registrations, production changes or new dependency/import-policy expansion.
- Original assertion intent is preserved, including immutable replay, no duplicate UI/backend dispatch, changed-payload precedence, caller mutability with detached recorded requests, foreign/deserialized attachment ownership and closed-session rejection. The held case at `executor-contract.ts:191` observes real dependency entry, releases in finally, drains admitted operations, and preserves primary, settlement and close failures. Cancellation is not mistaken for physical exit. No injected close-rejection proof is claimed.
- Independent byte comparison confirmed all ten remaining concrete case bodies unchanged and ten other original agent files unchanged, including all four neighboring test files and the production adapter. All twelve current source hashes match the required evidence vector. Concrete SDK history, callbacks/signals, exceptions/quarantine and seven unsupported recovery capabilities remain covered by their existing stronger cases.
- `executor-conformance-verify.md:1` accurately limits this to an adapters foundation; the dated `tasks.md:50` paragraph preserves every parent checkbox. Full five-kind acceptance, durable recovery, provider/host integration and current canonical gates stay open.
- Publication preserves original evidence rather than retroactively repairing old launcher/index claims. The stronger serialized required-review omission has a separate finite supplement; its assertion is distinguished from the older direct missing-get selfcheck. Frozen scripts remain inert evidence bytes.

## Issues

### Critical

None found in the reviewed source/publication scope.

### Important

None found. The original Important1 immediate-child-launcher gap is resolved by the retained thirteen absolute-child bound-v2 captures. Pending final CI/canonical gates are release obligations, not a defect in this source extraction or evidence publication.

### Minor

No new Minor finding. Previously deferred SDK/color diagnostic noise and historical unattributed raw-index drift remain explicitly recorded. This review neither assigns an actor to historical index changes nor claims full inherited-environment or Nx-descendant provenance.

## Independent verification

New read-only Bun readers `/tmp/executor-final-review-check.mjs` and `/tmp/executor-final-review-preservation.mjs` completed with exit0. Their summaries are `/tmp/executor-final-review-check.json` and `/tmp/executor-final-review-preservation.json`. These are newly written independent readers, not executions of archived helpers.

- Reconstructed and SHA256/byte-count checked all **527 packet entries +77 publication attachments +51 supplemental entries**. Compared captured originals to current retained originals; duplicate paths agree byte-for-byte. Checked packet inventory, chunk hashes/counts, declared byte sums and all three finite cutoffs. Original packet SHA256 remains `0ad39e0746e6ebae4888325de0a194476389619cad756d241b067e08d613352c`; final manifest SHA256 is `1e39c609050b17936219d164712e646d8e5ac23062b51075da6555623b307df9`.
- Wrote every one of those **655 decoded entries** to an owned scratch directory and invoked the actual production `tools/tool-git-hooks/src/hooks/plaintext-secrets.ts` scanner on those existing files: **0 findings**. Scanner SHA256 `b6fc5cb630d6e4d78908061d877485d2543ddcce7595924a4f9061e607890ec9`. Scratch directory removed in finally. No scanner policy was changed; this is not a claim to have retested its unreadability behavior.
- Resolved the required campaign completion/manifest/audit, both reviews, twelve source entries and all thirteen native receipt companion families. Checked manifest argv correspondence; intent/start/final agreement; actual absolute `/home/df/.bun/bin/bun` identity/hash before/after; version1.4.4 streams; native exit/signal; helper identity; regular FD closure; output byte/hash correspondence; source dependency hashes and index-vector bindings. Also independently checked the seven original publication families' native outcomes, stream/helper/script identities and source stability.
- Retained cohort stderr gives **99 pass,0 fail,787 expect calls**. Retained uncached lint, forced typecheck and changed-source formatting receipts are0/null. Independently inspected each actual production fault stderr: active exclusion reaches Expected1/Received2 at shared line215; removed recorded comparison resolves instead of rejecting at line140; mutable alias causes the original replay to throw conflicting turn key at line167. Each distinct guard retains native before/fault/restored **0/null,1/null,0/null** and exact-byte restoration. Product guard count remains three.
- Supplement contains the actual serialized fixture, four completed capture families and frozen dependency bytes. Independently reconstructed all526 fault-corpus entries, checked packet/manifest/cutoff inventory and hashes, confirmed every remaining entry equals the normal corpus, confirmed unchanged chunk corpus/required graph, and confirmed only the declared `task-1-review-fix1.md` entry is absent. The required-review declaration remains intact.
- Supplement native setup/before/fault/after status is **0/null,0/null,1/null,0/null**. Both normal controls invoke frozen verifier SHA256 `5f60795a9da13cae8522bdd15094a227a1bb4e2f3093213a14d3924454c2e109`; the frozen fault wrapper only redirects the three actual serialized reads and imports that exact verifier. Fault stdout binds those reads; stderr reaches unchanged `get()` and review loop line68 with `required dependency absent`, rather than parser/hash/count/setup failure. Normal controls record604 decoded scans,0 findings and13 required families. Archived script/source correspondence was read, not executed.
- Read-only Git used `GIT_OPTIONAL_LOCKS=0` and `git --no-optional-locks`. Independent body/name comparison confirmed19 original cases become9 shared plus10 identical concrete cases. Source commit changes exactly the expected two paths; parent checkbox vector is identical to base.

## Recommendations and assessment

**Approved for the bounded I2.01 source and evidence publication; ready for normal commit/push and a draft PR.** No corrective source or publication edit is required by this review.

**Ready to merge? Not certified by this review.** Root still owns completion and publication of the current full formatting/OpenSpec checks, normal hooks, remote commit/PR/head verification, and required current exact-SHA CI/canonical hosted gates before merge. This reviewer deliberately did not rerun runtime tests, mutants, lint/typecheck/build, OpenSpec validation or hosted gates already delegated/evidenced. Full five-kind/provider/durable-recovery/host behavior, live paid execution, full environment capture, Nx descendant identity and injected close-rejection cleanup remain outside this bounded acceptance. No recursive future-capture completeness requirement is introduced.
