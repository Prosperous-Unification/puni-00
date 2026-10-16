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

Known upstream limit: reviewed DNS source #562 has a hosted Twilight failure for
codec-review/reproduce.mjs matching two classification rules. PM assigned its
source-membership repair separately. This aggregate intentionally does not invent
or incorporate that unreviewed successor; release acceptance remains pending.

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
