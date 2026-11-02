# Verification Report

**Change:** `dbip-country-analytics`  
**Verified:** 2026-11-02, Codex; production remains held.

## Scope and requirements

Canonical implementation starts at `c894bc45e9299348fa6688141282840136995814`.
Runtime pin `6e71db41d413cacee237f39c0b42c831712b2d45` is mirrored into the private
consumer; subsequent public edits concern documentation and inventory policy.
The private companion contains the licensed site and its own committed verification
record. Its owner About, portrait, blog and dark-theme changes were preserved by
merging exact private main `28a2c51f00428dcd9269e248aea82c2476be385c`.

| Requirement                   | Implementation and covering evidence                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local country resolution      | `country-database.ts`, real supplied IPv4/IPv6/unmapped MMDB tests; bounded verified server-only archive                                              |
| Trusted endpoint              | `server.ts` and `analytics-region.test.ts`: selected full address, Origin refusal, windows, no-store, coarse response only                            |
| Explicit-choice precedence    | Canonical `analytics.ts`/tests: regional default is not a fabricated accepted preference; rejection/storage failure/disposal win                      |
| Bounded resolution, no replay | Canonical `browser.ts`/tests: one three-second request, fixed safe endpoint, omitted credentials/referrer, cancellation, sanitized first-page context |
| Compact accessible card       | App component tests and 16 native questionnaire cases; private site/app regional matrix with original phone sizes                                     |
| Attribution/provenance        | Linked public app credit, private shared footer/privacy, retained unchanged-provider notice/source/CC BY 4.0 and package smoke                        |
| Monthly reminder              | `docs/website/country-database.md`: next manual download **2026-12-01**; actual UTC clock-boundary test                                               |
| Packaged server asset         | Actual compiled main exercises real dataset, then refuses startup after archive removal; no archive in either browser output                          |

The configured consent group is EEA30, GB, CH and AX/GF/GP/MQ/RE/YT/MF.
Unmapped/unrecognized countries and failed lookups remain unknown. IP country is
approximate; this policy does not certify every jurisdiction's privacy rules.

## Structural validation and completion

`bunx openspec validate --all --json` passed **315/315**, all valid, zero invalid
(296 changes and 19 specs). Raw validation is retained in the task evidence.
All **23/23 implementation tasks**, **8/8 requirements** and **13/13 scenarios** have covering source/test/browser evidence. Required hosted integration checks remain a separate gate. Final structural validation with this record also passed315/315, zero failures. Final `bunx nx format:check --all` exited0 with empty stdout.

| Delta capability     | Sync                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `regional-analytics` | Pending promotion into `openspec/specs/`; active change, not archived |

Archive remains blocked while delta sync or required hosted checks are pending.

## Failure proofs

Each row records an observed fault in the real call path. Mutations were restored
before final checks. Missing files and unreadable configured files were tested
independently. Adjacent production `Proof:` comments identify the observations;
raw logs are retained under the task-specific evidence directory. No security
claim rests solely on a nominal process exit.

| Check                                   | Injected fault                                    | Covering observation                                                                                                      |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Configured archive absence              | Fall back to bundled instead of requested path    | Real-reader missing-archive test fails because expected throw disappears                                                  |
| Configured archive unreadability        | Same fallback, actual configured archive chmod000 | Separate unreadable-archive test fails; mode restored                                                                     |
| Archive SHA256                          | Remove hash guard                                 | Corrupt archive reaches wrong decompression refusal; test fails                                                           |
| Bounded decompression                   | Raise64MiB to128MiB                               | Real oversized gzip reaches extracted-hash stage; expected decompression refusal fails                                    |
| Extracted SHA256                        | Remove extracted guard                            | Mismatched extracted identity admitted; real-reader test fails                                                            |
| Decoder error propagation               | Matching-identity invalid gzip and invalid MMDB   | Actual loader throws contextual decompress/decode errors, never fallback                                                  |
| MMDB kind                               | Remove kind guard                                 | Re-encoded wrong-kind MMDB admitted; test fails                                                                           |
| Mapped record shape                     | Remove string guard                               | Re-encoded countrz record admitted; test fails                                                                            |
| Recognized country                      | Remove catalogue admission                        | Real decodedZZ becomes elsewhere; expected unknown fails                                                                  |
| Due clock                               | Force updateDue false                             | Real-reader December1 UTC boundary fails                                                                                  |
| Exact wire keys                         | Remove own-key count                              | Identifying extra fields admitted; contract test fails                                                                    |
| Wire category                           | Remove category guard                             | US category admitted; malformed-response test fails                                                                       |
| Wire metadata                           | Remove boolean guard                              | String false admitted; malformed-response test fails                                                                      |
| Next-month refresh date                 | Remove date check                                 | Invalid/non-next-month date admitted; contract test fails                                                                 |
| Trusted address selection               | Force socket-only selection                       | Trusted-hop integration test fails                                                                                        |
| Complete GeoIP address                  | Replace selected address with /64                 | Real-reader wrapper exact-address assertion fails                                                                         |
| Origin                                  | Remove region Origin refusal                      | Foreign Origin receives200 instead of403                                                                                  |
| Request windows                         | Exempt region endpoint                            | Request121 receives200 instead of429                                                                                      |
| No-store refusals                       | Remove response header                            | Missing-hop refusal lacks required no-store                                                                               |
| Actual main injection                   | Remove reader and rebuild                         | Actual package main returns unknown instead of known region                                                               |
| Emitted provenance                      | Replace built release.json with{}                 | Real package smoke refuses mismatched manifest                                                                            |
| Emitted licence                         | Remove built credit/licence                       | Real package smoke refuses notice                                                                                         |
| Packaged archive                        | Remove actual emitted archive                     | Actual compiled startup fails before listening                                                                            |
| Runtime archive dependency              | Remove copied archive after healthy requests      | Every green package smoke requires second startup refusal                                                                 |
| Conservative browser default            | Grant unknown                                     | Regional-default permission test fails                                                                                    |
| Failed preference write                 | Remove refusal latch                              | Older acceptance revives; controller test fails                                                                           |
| Disposed region                         | Remove disposed admission                         | Disposed controller region changes; test fails                                                                            |
| Region notification                     | Remove listener delivery                          | Loading-region observation fails                                                                                          |
| Enabled lookup                          | Remove enabled admission                          | Disabled visitor makes request                                                                                            |
| Supported route                         | Remove route admission                            | Operator makes request                                                                                                    |
| Saved/readable choice                   | Remove initial choice admission                   | Accepted/rejected/unreadable sessions request region                                                                      |
| One attempt                             | Remove attempted guard                            | Repeated-request assertion fails                                                                                          |
| Credentials                             | Include instead of omit                           | Native/request-options privacy assertion fails                                                                            |
| Request cache                           | Default instead of no-store                       | Wire privacy assertion fails                                                                                              |
| Destination                             | Send current location                             | Fixed destination/content assertion fails                                                                                 |
| Deadline                                | Raise3000ms to30000ms                             | Required deadline assertion fails                                                                                         |
| Abort                                   | Remove AbortController.abort                      | Pending rejection signal remains live                                                                                     |
| Late timeout                            | Remove final aborted guard                        | Noncooperative timed-out answer changes/grants region                                                                     |
| Response parser                         | Bypass with elsewhere                             | Identifying extra-field response grants instead of unknown                                                                |
| HTTP status                             | Accept elsewhere JSON with503                     | HTTP failure grants instead of unknown                                                                                    |
| Response-time route                     | Remove route fence                                | Answer applies on unsupported route                                                                                       |
| Pre-lookup disposal                     | Remove disposed guard                             | Disposed operator starts lookup after navigation                                                                          |
| Response-time preference                | Remove reread after lifecycle settled             | Cross-host rejection loses race; assertion fails                                                                          |
| Arrival visibility                      | Remove elsewhere admission                        | Card remains visible while tag loads                                                                                      |
| Failed-write recovery                   | Hide all elsewhere                                | Recovery action disappears                                                                                                |
| Visible credit                          | Remove linked DB-IP credit                        | Public footer/compact-credit test fails                                                                                   |
| Native referrer privacy                 | Remove no-referrer                                | Actual canonical-wrapper Chromium request exposes email query in Referer                                                  |
| Recovery after operator route           | Remove storage-state restoration                  | Controller/browser/component observe disabled/hidden recovery                                                             |
| Private independent region subscription | Remove subscription                               | Real site runtime binding test leaves card visible                                                                        |
| Private elsewhere visibility            | Remove admission                                  | Independent region assertion fails                                                                                        |
| Private failed-storage recovery         | Hide all elsewhere                                | Recovery assertion fails                                                                                                  |
| Cookie assertion is nonvacuous          | Seed actual puni_dev_ga while denied              | Actual browser assertion fails Cookies preceded permission,1!=0                                                           |
| Fixture context ownership               | Restore setup before try                          | Actual context survives failed route setup; lifecycle test fails                                                          |
| Fixture API ownership                   | Restore process.json before try                   | EISDIR leaves actual API alive; lifecycle test fails                                                                      |
| Cloud session ownership                 | Fail receipt write after synthetic SDK create     | Original launcher misses stop; corrected launcher stops exact owned session id                                            |
| Short-phone full controls               | Remove built short/narrow spacing rule            | Native305px classic layout fails original complete-control overlap assertion                                              |
| Exact-zero overflow                     | Inject actual5px DOM overflow                     | Corrected clientWidth metric fails5!=0; no tolerance/clamping                                                             |
| Fixture actual keyboard predicate       | Remove predicate                                  | Native missing-ring and wrong-target tests both fail their expected refusal                                               |
| Slow-reply cleanup                      | Remove both owned-route drains                    | Delayed real API reply lacks finished event; cleanup assertion fails                                                      |
| Slow-request ordering                   | Remove request guard                              | Aborted native lookup reaches later timeout rather than required earlier refusal                                          |
| Real bridge error propagation           | Remove captured-error rethrow                     | Actual stopped API exposes consumer fault instead of required ECONNREFUSED                                                |
| Exact full inventory declaration        | Remove actual archive row                         | Production classify-candidate refuses named archive; corrected full policy accepts it and refuses same-byte unlisted gzip |
| Exact bootstrap inventory declaration   | Remove actual archive row                         | Same real CLI refusal/acceptance/unlisted control under bootstrap policy                                                  |
| Fractional-scale focus width            | Revert only actual built consent width3px to2px   | Frozen native125% driver fails original>=2px predicate at1.6px; restored3px yields2.4px and54pass                         |

## Commands and actual outcomes

Evidence directory: `/tmp/puni-country-integration-20261102`, with factual task
reports in the ignored, uniquely scoped `.superpowers/sdd/dbip-country-analytics`.
Private source patches stay in the private companion, not this public repository.

- Baseline Nx tests for website API/app/contracts/analytics: all four passed.
- `bunx nx run-many -t test lint typecheck build -p website-contracts website-be-01 --skip-nx-cache`: both full test targets and builds passed; aggregate exit1 for a new test tuple typing/lint issue, subsequently corrected. This invocation is not represented as green.
- Final `bunx nx run-many -t lint typecheck -p website-contracts website-be-01 --skip-nx-cache`: exit0. Final focused reader/contracts/API:15pass,0fail,226assertions.
- `bunx nx run website-be-01:test:package --skip-nx-cache`: exit0, real compiled lookup and absent-archive startup refusal. Same actual package smoke passed in readonly/network-none `oven/bun:1.4.2-alpine`, not merely developer Bun1.4.4.
- `bunx nx run-many -t test lint typecheck build -p website-analytics website-fe-01 --skip-nx-cache`: all11 tasks passed. After review fixes, affected tests135pass and nine static/build tasks passed; final complete analytics/app test rerun113+163=276pass.
- `bun apps/website/fe-01/browser/analytics-region.mjs`: two native canonical-controller cases passed, no native Referer/cookie/body/query leak; all requests intercepted.
- `bun apps/website/fe-01/browser/arrival-choice.mjs`:16 actual native questionnaire layouts passed. A documented0.15625CSSpx native scroll rounding uses the existing1px bound; an injected11.15625px clipping fault still fails that bound.
- Private canonical snapshot: all five pinned trees and204source files match the approved pin; private frozen install/check passed.
- Private site:67tests/202assertions passed; Astro lint/typecheck passed; development-enabled static14page build and app build passed. An initial sandbox socket-denied aggregate is retained as exit1, not acceptance.
- Exact private CI OpenSpec1.12.0:41/41valid,0warnings; public locked1.14.3 also41/41 with44inherited warnings.
- Final private native matrices:54classic+54overlay passed on driver `8ea91b9d8cf5904d40712a0d31594c2a9685448ff3ce340ee1df72b6144e2afb`; all80built frontend files unchanged from the reviewed spacing repair. Focused real fixture/lifecycle9/9passed; causal mutations fail as recorded above.
- Final direct Browser Use Cloud v4: **54/54 passed**, exact original driver8ea, Task8 site build, actual compiled API/MMDB and official development tag against locally owned collectors. Independent audit:42 private-header region requests,12 permitted real-cookie cases,42 denied/no-cookie cases,57 owned Google receipts without visitor-content sentinels,6 correctly ordered slow replies and3 genuine keyboard-focus positives. SDK stopped the exact owned session; API1585852 independently probed ESRCH. Artifacts: `cloud-08bcb62a-bad4-4d71-80af-5865dd078498`, manifest SHA256 `9c34829046de8bdfa2fb66c256e41cad9ae9b8138858de511803cfb3a1853974`.
- Native125% regression: final54/54 on unchanged driver,67site tests/202assertions, Astro check and14page development build passed. Built-width-only removal reproduces1.6px failure; source/built CSS SHA256 `0446e1a3a2567107a692c4cc847433dc4b43639ba5d62190ef91115a605a4e73`.
- Exact inventory repair:24/24pilot tests/430assertions and42/42focused contracts/classification tests/404assertions passed. Both policies have actual-archive original/red, corrected/green, row-removal/red and same-byte-unlisted/red CLI receipts. Full policy classifies12,628 committed tuples. Bootstrap deliberately does not classify the entire repository: both original/corrected policies refuse the same out-of-scope `.agents/skills/.openspec-target`; that inherited scope was not widened.
- Normal latest-main merge `1e01c122cd3e138c30e35cad755bd328b262740a` includes exact owner dependency updates from `98e7b00ff247c36962d8c22b0e39d377e789cf17`; frozen install succeeded (`application-exception@0.8.1`, `di-bag@0.5.2`). Private snapshot retains its separately verified6e71 dependency pin; all204 canonical source files/five project trees remain identical.

Full local monorepo `bunx nx run-many -t test lint typecheck build` and h2/h4 gates
were not run. Hosted PR CI is a distinct required gate. Original run41370408113
failed twilight-burokrat's11pilot cases because the actual country archive lacked
an exact binary declaration; the repair and focused proof are recorded above.
Fresh hosted [run41376475116](https://github.com/Prosperous-Unification/puni-00/actions/runs/41376475116) completed successfully on source `1e01c122cd3e138c30e35cad755bd328b262740a`; both workspace/twilight gates, all four pixel shards and the aggregate gate passed. Normal exact-head PR812 merge produced main `1366cdd8ff0f2134f3b1b9c827b99b6ea223ce7b` at03:46:11UTC; no bypass/admin merge was used. Private consumer [PR74](https://github.com/Prosperous-Unification/puni-pr-00/pull/74) passed its required [source CI](https://github.com/Prosperous-Unification/puni-pr-00/actions/runs/41377918615). This evidence/tasks follow-up changes documentation only and does not supersede the runtime head under test.

Actual `bunx nx format:check --all` output was empty with exit0 (no differing
files). Scoped formatting/diff checks cover subsequent task documentation/policy.
Tool wiki hooks explicitly reported inactive/uncertified; no external activation
certification is implied. Existing Nx color/plugin-socket environment warnings
are disclosed, not normalized into warning-free output.

## Cloud evidence and limits

The Cloud browser loads the actual candidate site/app build bytes at approved
development origins through intercepted routes and forwards regional requests to
an owned actual compiled API. Trusted synthetic addresses exercise real DB-IP.
The pinned official development Google tag executes, while all vendor requests
are fulfilled locally. No real Google collection, account report, retention
configuration, live visitor geolocation or paid AI/provider call is claimed.

Original failed Cloud runs remain authentic: two expose the classic-scrollbar
layout defect; a later run fails the one-shot focus check; the next diagnostic
passes five cases then exposes the old timed slow-reply fixture. Every session
has an explicit SDK stop receipt. Cloud ultimately captured a present, focused ring resolving to1.6px. Native
forced125% reproduces that rounding; the exact Cloud launch scale remains
unobserved. A scoped3px declaration yields2.4px in final Cloud without relaxing
the original>=2px predicate. Bounded observation retains the actual target after
one genuine Tab without forcing focus/styles.

The site card is fixed bottom-left; the app card remains in normal flow for its
existing chat scroll owner. Only <=360px wide/<=600px high hero spacing moves up
32px, preserving approved fonts and complete controls with classic scrollbars.
Overflow uses scrollWidth-clientWidth and still requires exact zero. These
integration decisions are covered by actual geometry and causal negatives.

## Implementation signal and decision

Runtime range: `c894bc45e9299348fa6688141282840136995814..1e01c122cd3e138c30e35cad755bd328b262740a`, normally committed and pushed to [PR812](https://github.com/Prosperous-Unification/puni-00/pull/812). Runtime tree was clean before this documentation follow-up. Private runtime0001d4c plus documentationf5cbb29 is published to privatePR74; its five canonical trees equal the approved public6e71 pin. This verification/tasks follow-up contains no runtime source edits. Final clean status and hosted gate outcomes are recorded during normal PR integration. **Source/browser acceptance and required PR CI passed. Delta promotion remains pending; this is not an archive or deployment claim.**

The requested reminder is a committed dated maintenance note, **not a scheduled
notification or automatic download**. Inference activation, production release,
real GA account verification and the older full-launch AI-quality gate are outside
this change and remain held/unverified. No production deployment occurred.

## Final normal integration

Public [PR812](https://github.com/Prosperous-Unification/puni-00/pull/812) merged
into main at `1366cdd8ff0f2134f3b1b9c827b99b6ea223ce7b` after successful
[required workflow41376475116](https://github.com/Prosperous-Unification/puni-00/actions/runs/41376475116).
Its reviewed head is1e01c122c; CI used validated synthetic merge
`a30b921721f30dad08cb378cca581712de85f72f` against main98e7b00.
The main merge retains the reviewed runtime tree; this follow-up changes only
this verification record and completed task checkboxes.

Actual completed gate output excerpts below have ANSI color removed, not results
normalized. The complete workspace output is the retained
`nx-gate-log-workspace-1/nx-gate.log` workflow artifact; GitHub's job console
keeps only its last200lines. Local copies are
`/tmp/puni-country-integration-20261102/public-workspace-final-artifact/nx-gate.log`
and the corresponding workspace/twilight job logs.

```text
NX   Successfully ran targets test, typecheck, build for 53 projects and 9 tasks they depend on
NX   Successfully ran target lint for 53 projects and 1 task they depend on
NX   Successfully ran target lint:source for project twilight-burokrat
```

The exact recorded commands use run-many test/typecheck/build for the53project
workspace set (`elapsedMs:4476813,exitCode:0`), affected lint against the validated
base/head (`547399,0`), and uncached Burokrat source lint (`36948,0`). This is
the current split CI contract; the single unscoped local four-target command
was not run. The workflow also passed solver image smoke, heavy-lock/head-pinning
and dev-entrypoint tests, secrets/private-nesting/doc/Compose/migration/corpus
checks and both OpenSpec checks. Existing OpenSpec warnings and two unchanged
tool-devsync unused eslint-disable warnings were reported; no warning-free claim.

Actual Twilight output:

```text
2544 pass
0 fail
Ran 2544 tests across 101 files. [2281.13s]
NX   Successfully ran targets test, typecheck, build for 2 projects and 4 tasks they depend on
84 pass
0 fail
Ran 84 tests across 9 files. [255.72s]
```

Private [PR74](https://github.com/Prosperous-Unification/puni-pr-00/pull/74)
merged into main at `de9fc93b102495babdd6761b26e008d290b28a31`; required
[PR CI41377918615](https://github.com/Prosperous-Unification/puni-pr-00/actions/runs/41377918615)
and exact main's [post-merge CI41378796204](https://github.com/Prosperous-Unification/puni-pr-00/actions/runs/41378796204)
passed. Public main push workflows are separate follow-up executions; their
future outcomes are not asserted by this completed PR acceptance.

The loopback preview was restarted from private main de9fc93 and checked ready
at localhost4321(site),4201(app),3101(API). Local paid inference and analytics
are disabled; the demo may use simulated AI. The real local regional endpoint
returns200,no-store,unknown with November2026/December1 metadata. The identified
old Astro process was stopped only after exact cwd/argv ownership verification;
other previews were not signaled. No development or production deployment occurred.

Reversible integration decisions: app card stays in flow while site floats
(different placement); owner main changes retained (extra regression/build work);
shortest-phone hero moves up32px (higher tiny-screen composition); overflow uses
clientWidth (different measurement reference); focus uses bounded actual-state
observation (brief test wait); keyboard ring is3px (stronger visible outline);
Cloud maximum lifetime is15minutes (larger reservation, explicit stop at finish).
The original strict layout/privacy/focus assertions retain causal negatives.
