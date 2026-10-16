## Candidate evidence

Isolated checkout: `/tmp/wbs-dns-smtp-integration-sol`.
Exact scheduler base457a919eedb91c39b138a9c07e37513528955fc1,
tree40b5cfa1d65ad54b52657e6177709a7a8969a9e7; exact SMTP
17f83ffdecf86867175e338c9dd4c516cbae3215,
treeada532e4462f313aa7668e6478aef889d04ab42d. Both source checkouts were clean.

Six textual conflicts: boot.ts, config.ts, config.test.ts, main.ts, dev/main.ts
and testing/booted-browser-process.ts. Resolved as the documented union;
organization-harness/package/lock merged automatically and were inspected.
No old signal handler was restored. The helper uses DNS fourth/SMTP fifth;
its SMTP caller is adjusted. No migration or dependency version upgrade.

Initial dependency reuse lacked dns-packet and the first focused invocation
failed during module loading, before any assertion. Replaced only the new
clone's ignored node_modules link with an isolated top-level link directory to
the scheduler dependencies plus SMTP's exact nodemailer. No source checkout's
install was changed; no frozen-install or release artifact claim follows.

Combined boot initial GREEN:1test/7assertions,2.01s,RSS568,212KiB;
`/tmp/dns-smtp-composition-green.log`. Watched binding omissions failed:
SMTP forced disabled throws `email submission disabled`
(`/tmp/dns-smtp-fault-smtp-binding.log`); scheduling forced off observes0workers
instead of1 (`/tmp/dns-smtp-fault-proof-scheduling.log`). Both restored and
adjacent Proof comments added.

Serial restored batch: **330pass,830assertions across15 files**; maximum observed
RSS624,184KiB. `/tmp/dns-smtp-focused-summary.log` and numbered
`/tmp/dns-smtp-focused-1.log` through `-15.log` record exact commands/counts/RSS.
SMTP boot8, authoritative DNS boot16, scheduler boot14, SMTP adapter37,
SMTP config40, shared config27, DNS address/packet/resolver/transport158,
scheduler runtime/repository19, supervisor7, entrypoints2 and startup2 all pass.
Each process has50s timeout and `--max-concurrency 1`; Node heap768MiB is not
claimed as a hard Bun RSS limit. No overlapping local test/static process.

Entrypoint controls were then strengthened to require SMTP/resolver/scheduling
forwarding simultaneously before their existing latched-failure disposal oracle.
Fresh GREEN2pass/6assertions,3.26s,RSS535,620KiB
(`/tmp/dns-smtp-entrypoints-green.log`). The marker-presence oracle was then made explicit: omission must fail
`Expected:true / Received:false`, rather than relying on an ENOENT read.
Fresh restored controls2pass/8assertions,3.64s,RSS535,068KiB
(`/tmp/dns-smtp-entrypoints-restored.log`). Six watched faults each omit one
of emailDelivery/organizationDnsResolvers/organizationDomainProofScheduling
from main or dev main; each fails the named disposal-marker assertion
(`/tmp/dns-smtp-fault-{main,dev}-<field>.log`). Sources restore in finally.
Together with the two boot-binding faults there are **eight watched composition
negatives**. Source-union audit and static/hook receipts follow below.
Full local Nx/browser/Burokrat/Docker, hosted CI,
canonical h2 gate and live DNS/SMTP authority are not run/established.

## Source preservation and scoped typing

Source union audit `/tmp/dns-smtp-source-union.json` compares all7101 source mode/
blob records from common base87a2b7ed and both exact heads. Outside12 declared
reconciled paths there are zero differences; the only six extra files are this
OpenSpec packet. The nine overlapping paths are the six conflicts plus the
organization harness, package.json and bun.lock. Three further owned test paths
are deliberately adjusted: SMTP boot helper call, combined scheduler boot proof,
and entrypoint forwarding controls. Exact full ancestry is checked after commit.

Initial scoped typecheck failed three existing scheduler test typings
(`/tmp/dns-smtp-typecheck.log`): widened override loop string, unregistered logger
service name and optional second-parameter type in the boot helper. Narrow fixes:

- config.test.ts: add `as const` to enabled/disabled override values.
- domain-proof.boot.db.test.ts: use registered logger service `be-01` and
  `NonNullable<Parameters<typeof bootBe01>[1]>` for required helper dependencies.

No scheduler runtime contract changes. The first scoped lint also found a new
combined-test shorthand returning void; changed it to a braced callback. Its
initial diagnostic is retained in `/tmp/dns-smtp-lint.log`.

Corrected scoped typecheck of11 selected reconciled source/test/declaration files
and their imports passed **exit0,10.00s,RSS1,315,744KiB**
(`/tmp/dns-smtp-typecheck-restored.log`). An ephemeral config extended be-01's spec
config, disabled references, selected only those files and was removed afterward.
Native Go settings GOMEMLIMIT768MiB/GOMAXPROCS2 constrain GC/concurrency, not hard
RSS. No full local be-01/Nx typecheck or broad gate was run. Final affected tests,
scoped lint/format/OpenSpec and normal hook outcomes follow in the handoff.

Historical limit at initial aggregate0073f520: reviewed DNS source #562 had a hosted Twilight failure for
codec-review/reproduce.mjs matching two classification rules. PM assigned its
source-membership repair separately. That checkpoint intentionally did not invent or incorporate an unreviewed
successor. The reviewed repair is now incorporated as recorded below; exact
aggregate release acceptance remains pending.

## Final local controls

After the typing/lint correction and restored forwarding faults, the three
changed test files passed **43tests,113assertions,6.25s,RSS617,724KiB**
(`/tmp/dns-smtp-final-controls.log`). The six final forwarding fault receipts each
show the explicit marker assertion Expected:true/Received:false, not syntax or
module-load failure. Corrected scoped ESLint exits0
(`/tmp/dns-smtp-lint-restored.log`); the Nx module-boundary rule explicitly skips
because this isolated clone has no cached ProjectGraph. This rule is not claimed
as verified.

Prettier formatted40 supported changed paths (`/tmp/dns-smtp-format.log`);
diffcheck passed. Strict OpenSpec1.12.0 validation passed for composition,
SMTP, scheduler and authoritative DNS (`/tmp/dns-smtp-openspec.log`). No full
OpenSpec-all/repository gate claim follows. The normal-hook merge commit outcome
and exact SHA/tree are recorded in `/tmp/dns-smtp-merge-commit.log` and the final
handoff. Source branches remain untouched and no public push is performed.

Normal merge hooks passed at source merge
`ffe81c6d834a41c689b94a4a2835e097ebe99955`, tree
`cc31ef7cade27c257d73391d3beb32fb61d03c85`:
lint, format, plaintext secrets, private nesting and agent trailers passed.
Tool Wiki explicitly reported inactive/not certified because the external
activation root is not provisioned; no certification claim. Migration/doc-cap
hooks had no matching paths. The new clone required `bunx lefthook install`
before committing; no hook was bypassed. MemAvailable afterward21,183,812KiB.
This receipt-only follow-up changes no source/test blobs; exact final review
head/tree are supplied in the handoff.

## Reviewed source successors

New isolated successor checkout `/tmp/wbs-dns-smtp-release-sol` starts at exact
aggregate0073f52008c865a7763e46f8ba4b26105d96cc32/tree
3335385892cfd153e9e77bb33c27a8247c249bce. Both source checkouts were clean and
matched their pinned heads before any merge. No source checkout was modified.

- DNS classification repair5bc9c2b550f312ef5c4b8f2f0097752e43b66978/tree
  3b1343c14e5bd384698d7090c53bd99af64b123c was merged without fast-forward as
  cdc4f16cf56b5324040a85ecc581ef91eefc4987.
- Scheduler corrected source1b074a931a5b711115e9618745f12ac38c892367/tree
  7c13a8cbd5b50b0c4ddef6238322e193f1468b97 was merged without fast-forward as
  a9fac0b3539cab439d7a80b3adae513efc50ce2e. This merge is tree-identical to its
  first parent because the initial aggregate already carried the same typing
  fixes; this retains the corrected reviewed-source ancestry without replacing
  the combined boot/entrypoint tests.

No conflicts. Source-union audit `/tmp/organization-release-source-union.json`
confirms exactly the four DNS repair paths changed from the base and match their
reviewed repair blobs byte-for-byte; every other base blob remains unchanged.
Both corrected source heads, original scheduler457a919e and SMTP17f83ffd are
ancestors. The tree after source merges is
193bcf60d6fad9153efe0732ed627da25296ceeb. Further changes are limited to these
composition tasks/verification receipts.

Focused repaired classification cases passed4tests/32assertions in1.046s,
RSS317,672KiB (`/tmp/organization-release-classification-green.log`). Removing
the source-exclusion selector from each policy separately failed its production
CLI oracle with `matched 2 classification rules`, exit1
(`/tmp/organization-release-fault-{policy,bootstrap-policy}.json.log`). Original
policy bytes were restored in finally. The classifier's ambiguity guard was not
changed. The original repair's reviewed R5 receipts remain in the DNS verify
record; no full pilot-policy or Burokrat survey is claimed for this aggregate.

Serial boot/config/SMTP/entrypoint, scoped typecheck/format/OpenSpec and restored
classification outcomes follow in the final handoff. Both no-ff merge commits
ran normal hooks (`/tmp/organization-release-{dns,scheduler}-merge.log`); final
evidence commit hooks also run normally. No public push occurs: automatic review
rejected source publication, and specific approval remains pending with PM.
Full local Nx/browser/solver, aggregate hosted CI/canonical h2 gate and external
SMTP/DNS activation remain unverified.

Restored classification rerun:4pass/32assertions,1.033s,RSS314,840KiB
(`/tmp/organization-release-classification-restored.log`). Serial focused backend
reruns passed **104tests/360assertions** across six files; exact per-file
counts/commands/RSS are in `/tmp/organization-release-focused-summary.log` and
numbered receipts1–6. SMTP boot8/36assertions, authoritative DNS boot16/75,
scheduler boot14/55, config27/50, entrypoints2/8 and SMTP adapter37/136.
Maximum observed test RSS595,860KiB. Every file ran alone with a bounded process
timeout; no local test/static process overlap. This does not rerun the prior full
330-test focused packet or the DNS source's44-case pilot/classification packet;
those receipts belong to their earlier exact checkpoints.

Scoped TypeScript passed **exit0,12.85s,RSS1,578,560KiB**
(`/tmp/organization-release-typecheck.log`):11 composition source/test/declaration
files plus the repaired classification test and their imports, using an ephemeral
spec-derived config with references disabled. It was removed afterward. Native
Go GOMEMLIMIT768MiB/GOMAXPROCS2 and Node heap768MiB constrain GC/concurrency,
not a hard RSS limit. Scoped classification ESLint passed
(`/tmp/organization-release-lint.log`), with the Nx module-boundary rule skipped because no cached graph exists. No full project typecheck or Nx gate is claimed.

Changed-six-path Prettier check passed
(`/tmp/organization-release-format.log`); diffcheck passed. Strict OpenSpec
validation passed for composition, SMTP, scheduler and DNS
(`/tmp/organization-release-openspec.log`). Source merge hooks passed normally;
the evidence-only commit also runs normal hooks with its outcome in
`/tmp/organization-release-evidence-commit.log`. Exact successor review remains
pending; no hosted-gate, full local gate, publication or external activation
acceptance is inferred from these local results.
