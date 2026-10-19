## Candidate scope

Base main `87a2b7edbfaabae889d91daa823f16f520a51cec` in isolated
`/tmp/wbs-organization-smtp-sol`. Planning commit
`f3bd6a1d68dd640114e69631f151b8e0d694e5e4` and configuration checkpoint
`6c1df143b4ed9394f835cac8deb1e45f17f60d5c` preceded transport implementation.
Astra approved the exact verification-only design and pinned client boundary
before the disposable probe and production TDD. Source review is pending.

The implementation enables only password-email verification. Invitation and join
approval still refuse under enabled SMTP, revoke the pending offer, and preserve
join-request compensation. No invitation migration, live activation, external
relay credentials, trusted sender authority or inbox receipt is supplied. This
slice does not complete WBS010.5.4.

## Production TDD and watched faults

Initial adapter/boot runs failed before their implementation/binding; purpose
capture initially failed before the harness/port change. Receipts include
`/tmp/smtp-purpose-green.log`, `/tmp/smtp-transport-disabled-green.log` and
`/tmp/smtp-boot-red.log` (configured boot returned503 instead of201).

**54 serial production mutations exited nonzero**, then their source bytes were
restored. Adjacent `Proof:` comments name consuming oracles. These are scoped
controls, not a full gate or arbitrary-fault guarantee.

| Boundary                       | Watched faults                                                                                                                                                       | Receipt prefix                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Configuration                  | 20 required/grammar/CA/source-sanitization faults listed below                                                                                                       | `/tmp/smtp-config-faults.log`          |
| Purpose port                   | Three route purpose swaps                                                                                                                                            | `/tmp/smtp-purpose-fault-`             |
| Transport                      | 16 initial guards: invitation/recipient/token/TLS/CA/final code/recipient count/identity/rejections/bytes/clock/native ACK/destroy/no resend/body-only success/timer | `/tmp/smtp-transport-faults.log`       |
| Authentication and late events | Explicit auth, PLAIN method, terminal work guard, frozen outcome                                                                                                     | `/tmp/smtp-transport-extra-faults.log` |
| Partial/aggregate limits       | Latest-chunk-only accounting; weakened client partial limit                                                                                                          | `/tmp/smtp-fragment-faults.log`        |
| DATA transition                | Omitted lazy body-read clock check:460 body bytes instead of0 after354 crosses cutoff                                                                                | `/tmp/smtp-data-transition-fault.log`  |
| Cleanup eligibility            | Renewed total cleanup budget; omitted publication clock                                                                                                              | `/tmp/smtp-cleanup-faults.log`         |
| Boot/compensation              | Refusing binding, false delivered state, omitted failed update, swallowed compensation error, omitted delivered update, invitation dispatch bypass                   | `/tmp/smtp-boot-faults.log`            |

The initial authentication-method omission survived because the client preferred
PLAIN when both methods were advertised. A LOGIN-only fixture exposed the actual
fallback: removing explicit PLAIN produced `AUTH OTHER`, so the strengthened
oracle failed. Fragment accounting is independently observed by temporarily
raising the public client partial limit in the fixture; latest-chunk-only
accounting then falsely accepts. Complete oversized final250 also refuses.

Automatic approval review rejected a proposed removal of the `settled` guard;
that removal never executed and was not retried. The safe alternative retains
the guard and adds late-connect and late-error lifecycle controls. Both passed
(`/tmp/smtp-transport-late-green.log`); separate terminal-work/frozen-outcome
mutations failed while `settled` remained intact. No settled-removal proof is
claimed.

## Final serial verification

Commands use Bun1.4.2 and serial execution (`--max-concurrency 1`), with bounded
process timeouts and `NODE_OPTIONS=--max-old-space-size=768` where applicable.
That setting is not a Bun/native compiler RSS cap. No concurrent heavy scan was
run. Local loopback TLS tests require approved sandbox elevation; the initial
disposable probe sandbox bind failure is recorded below.

- Adapter: **36 tests, 129 assertions, 15.86s**, RSS **55,812KiB**;
  `/tmp/smtp-adapter-final.log`.
- Boot SMTP lifecycle: **8 tests, 36 assertions, 14.01s**, RSS **620,792KiB**;
  `/tmp/smtp-boot-final.log`.
- Existing verification: **14 tests, 59 assertions, 3.83s**, RSS **577,500KiB**;
  `/tmp/smtp-verification-final.log`. Run from `apps/wbs/be-01`, the declared Nx
  cwd. The initial repo-root invocation failed one existing spawned Bun eval
  alias lookup (`@wbs/store-sqlite/db`); using the project cwd resolved it without
  a source workaround.
- Existing invitation: **20 tests, 57 assertions, 3.62s**, RSS **571,376KiB**;
  `/tmp/smtp-invitation-final.log`.
- Existing join request: **26 tests, 104 assertions, 6.06s**, RSS **633,992KiB**;
  `/tmp/smtp-join-final.log`.
- Production/dev startup refusal: **2 tests, 8 assertions, 3.57s**;
  `/tmp/smtp-startup-green.log`.
- Configuration final checkpoint: **65 tests, 97 assertions, 277ms**;
  `/tmp/smtp-config-checkpoint.log`.
- Production be-01 TypeScript (`bunx tsc -p apps/wbs/be-01/tsconfig.lib.json
--noEmit`, timeout45s): **exit0, 5.56s, RSS2,650,244KiB**;
  `/tmp/smtp-be-typecheck.log`. The native compiler ignores the Node heap cap;
  this one-off process ended, with MemAvailable21,407,880KiB afterward. It was
  not repeated.
- Scoped ESLint on all18 changed TypeScript files: **exit0**;
  `/tmp/smtp-lint-final.log`. Nx module-boundary rule skipped for missing cached
  graph, as disclosed below. Prettier formatted all25 supported changed files;
  `/tmp/smtp-format-final.log`; `git diff --check` passed.
- OpenSpec1.12.0 strict change validation: **valid**;
  `/tmp/smtp-openspec-final.log`, using the existing cached scoped
  `@fission-ai/openspec` CLI through Bun. Initial unscoped `bunx openspec` could
  not use its read-only temporary directory, and a guessed global path was
  absent; neither was a validation success.
- Normal implementation hooks passed at commit
  `2467dbae17adb2437c8b709cb7898bfd519c6b2c`, tree
  `c7327b3ce167d42b9f8c56faccfcc62aefbe3e69`;
  `/tmp/smtp-implementation-commit.log`: ESLint, format, plaintext secrets,
  private nesting and agent trailer passed. Tool Wiki hook explicitly reported
  inactive/not certified because external activation root is not provisioned;
  no migration/doc-cap files matched. Exact source review requested from Astra.
  MemAvailable after the hook window: **20,284,984KiB**.

Full local Nx, browser, Docker, Burokrat, full build, exact hosted CI and canonical
h2 gate were not run for this candidate. Cached Nx module-boundary lint is
unavailable in this isolated checkout; the explicit lint diagnostic is recorded,
not a passing boundary claim. CI and canonical h2 gate remain required before
release. Live relay/inbox and operator CA/sender/credential acceptance remain
external and unverified.

## Disposable maintained-client probe

Planning packet committed with normal hooks as
`f3bd6a1d68dd640114e69631f151b8e0d694e5e4`, tree
`a9495ade87877cf9c7019518f614ce493a95a1aa`. Astra approved the exact design
(no remaining P0–P3) before the probe/production TDD began.

Bun1.4.2 installed exact Nodemailer10.1.2 into the separate disposable
`/tmp/wbs-smtp-client-probe`; no production dependency was added in this checkpoint.
Package integrity:
`sha512-rnQn9Rzh8RAwcp42MVsIvxbsv6YZ2a2/av+uyJ/LPU1+2QSlrRgFsWWZTKenyRUqkIl8urOI0c4+CEcmFdsvQw==`.
Probe source SHA-256:
`4d4af422e8ec56190ff9edccc57c22948e55401f9c92e0705f864dfef0cb6a2a`.

`bun test ./probe.test.ts --timeout 5000` passed **9 tests, 43 assertions,
586ms**, peak RSS **48,556KiB** (`/tmp/smtp-client-probe.log`). Controlled native
TLS fixtures cover immediate220 paused-socket handoff, explicit none/PLAIN,
final250/native close, final550 and withheld ACK without resend, synthetic
complete one-chunk overflow/expired input before the same event's later parser
listener, fragmented input refusal and wrong CA/name before credentials/body.
The fragmented case can hit the client's partial guard before the aggregate
limit; it is not yet a production aggregate-fragmentation proof.

Watched disposable faults: removing the aggregate guard changed expected overflow
to deadline (`/tmp/smtp-probe-fault-byte-cap.log`); omitting transition clock
checks changed expected deadline to cleanup (`/tmp/smtp-probe-fault-clock.log`).
Restored probe bytes match the hash above. These prove the feasibility boundary,
not production R5 completion. Initial sandbox loopback binding failed
(`/tmp/smtp-client-probe-sandbox.log`); an approved elevated loopback run passed.
No external relay or credentials were used.

## Configuration TDD checkpoint

New parser/config-loader tests first failed for the absent module/binding
(`/tmp/smtp-config-red.log`, `/tmp/smtp-config-load-red.log`). Restored focused
configuration suites passed **65 tests, 97 assertions, 284ms**
(`/tmp/smtp-config-restored.log`). Native CA fixtures are generated with the
required local `openssl` tool; tests do not embed production keys or certificates.

Twenty watched production-parser faults each exited1 in the serial runner
(`/tmp/smtp-config-faults.log` and `/tmp/smtp-config-fault-<name>.log`):
absent-mode handling, required values, host, port, TLS mode, server name, EHLO,
sender, credentials under none, credential bounds, unknown auth mode, absolute CA
path, actual CA read, DER parsing, DNS total length/FQDN, mailbox/local-part
length, raw-error sanitization and extra bytes outside PEM. Adjacent Proof
comments name their consuming loader cases. An initial relative-path mutant
survived because its fixture file was missing; the corrected fixture reaches a
valid CA through a relative path and removing the guard now fails. Missing,
unreadable, empty, malformed PEM/DER and extra-byte CA cases remain distinct.

Scoped ESLint passed after formatting/type-safe array access cleanup, with
`@nx/enforce-module-boundaries` explicitly skipped because the isolated checkout
has no cached graph (`/tmp/smtp-config-lint.log`). A narrow standalone TypeScript
check of the two new runtime config files passed with `--ignoreConfig --types
bun-types --strict --skipLibCheck` (`/tmp/smtp-config-tsc.log`); the initial
`--types bun` invocation could not find that definition and was corrected to the
repository's actual bun-types package. This is not project-wide typecheck.

The configuration checkpoint preceded the transport and boot evidence above; it
made no runtime delivery or WBS completion claim.

## Independent source review: DATA boundary correction

Astra found a P2 at candidate `b668db28a8715ed65320ff7be4a9f0f7713c6027`:
passing a complete string to `smtp.send` checked the clock before MAIL/RCPT,
not at the maintained client's later DATA/body transition. A real TLS regression
advances the runtime clock on354 after wrapper accounting but before the public
client's parser listener; no cutoff timer callback runs first. Original source
refused eventually but still released one complete message body (RED,
`/tmp/smtp-data-transition-red.log`).

The correction uses the supported lazy `Readable` body with a clock/state guard
in its read callback. Focused GREEN:1test/7assertions,130ms,RSS49,696KiB
(`/tmp/smtp-data-transition-green.log`). Watching only that guard's removal
failed with **460 body bytes versus required0**, not just the eventual timeout
(`/tmp/smtp-data-transition-fault.log`); restored immediately. No private client
API or handwritten protocol parser was introduced.

Cleanup-failure composition limit: withheld native-close acknowledgement is
covered directly by the production adapter tests, not by a separate boot-mounted
fixture. Boot-mounted cases cover final refusal, missing final ACK and durable
compensation; task4.2 now distinguishes the adapter cleanup scope. No boot-close
withholding proof is claimed.

Restored successor checks, serial:

- Adapter **37pass,136assertions,15.36s**, RSS56,164KiB;
  `/tmp/smtp-adapter-data-final.log`.
- Boot **8pass,36assertions,14.05s**, RSS570,288KiB;
  `/tmp/smtp-boot-data-final.log`.
- Scoped TypeScript of the three changed source/test files and their imports
  passed in4.18s,RSS862,968KiB (`/tmp/smtp-data-typecheck.log`). An ephemeral
  config extended be-01's spec config, included only these files and removed
  references; it was deleted afterward. Native Go compiler settings
  `GOMEMLIMIT=768MiB GOMAXPROCS=2` constrained GC/concurrency; this is still not
  a hard RSS limit. No full be-01 typecheck was repeated.
- Scoped ESLint passed (`/tmp/smtp-data-lint.log`), with the same missing cached
  Nx boundary-rule diagnostic. Prettier formatted the five changed files
  (`/tmp/smtp-data-format.log`); strict OpenSpec validation reported valid
  (`/tmp/smtp-data-openspec.log`); diffcheck passed. The successor commit runs
  normal hooks; their exact outcome is recorded in
  `/tmp/smtp-data-commit.log` and the committed handoff. Earlier
  controller/config/startup checks were not repeated because those source paths
  did not change in this correction.

## Source and merge reconciliation — 2026-10-19

[The parent reconciliation](../organization-ownership-and-access/verify.md#source-and-merge-reconciliation--2026-10-19)
verifies SMTP successor `17f83ffde` is in main through PR #565. Current
`bootBe01` binds `createEmailDelivery` with explicit configuration; the
production dispatcher still refuses every invitation/join purpose. The
verification adapter is implemented, while its historical receipts remain
scoped to the exact candidates above.

Invitation delivery still requires a separately reviewed release under the
[eligibility contract](invitation-eligibility.md), including predecessor-binary
compatibility and rollback. Relay/sender/CA authority, real inbox evidence and
organization activation remain open. No live SMTP or new runtime/gate result
is claimed, and task 5.2 remains unchanged.
