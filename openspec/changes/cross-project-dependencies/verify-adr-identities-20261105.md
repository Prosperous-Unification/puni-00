# ADR identity repair after the fresh-main union

Current baseline is `5614dc96db7deffbde10ba29869d20cf6c6ec04b`.
Run41930921822, workspace job126928187073, failed the unchanged ADR index
assertion and three dependent actual-document-target tests. Uploaded artifact
13374106963 contains the failure; the overall run was still live, so the job-log
endpoint was unavailable and supplied no evidence. The uploaded artifact was
successfully downloaded and inspected instead.

Fresh `origin/main` is `89b2c2ebf9d12721315c87a37ab39fc1da8190a2`.
It owns ADR0066 journaled recovery,0067 workflow private keys and0068 staged
runtime writes. The union had retained feature decisions with those same numbers.
Astra High approved the mechanical mapping below and preservation of the
historical0063→0066 renumber event. No decision or status changes.

| Feature ADR                                                | Current number | Bytes | SHA-256 of unchanged decision file                                 |
| ---------------------------------------------------------- | -------------- | ----- | ------------------------------------------------------------------ |
| Supervisor exclusion without identity broker, formerly0066 | 0071           | 944   | `a78035cc833c704fe20eb15b73d662eef6fcf0142fa43eb76647eccd309ce2b7` |
| Runtime-launch pins, formerly0067                          | 0072           | 1120  | `423b064ea01c91d495ef8de9a3bea88fa5a8342ceeffb25cfb8a58eeaf504305` |
| Original-context terminal handoff, formerly0068            | 0073           | 1252  | `49fe82e15bc646f4fed67a37e6442ff2fe9d2f381336c44e4a8adc08d7ea5386` |

Root independently compared every renamed file byte-for-byte with its baseline
Git blob and all three main decisions with fresh main: exact equality. Only live
navigation paths and their matching labels change. The old0063→0066 historical
event remains recorded, with its link pointing to0071 and an explicit current
number annotation. Archived evidence, retained patches and historical executed
commands remain unchanged. The guard implementation is unchanged.

The exact existing `adr-index.test.ts` failed before edits:0passed/1failed,
duplicate66–68. The same consumer passed after edits:1passed/0failed. The actual
`check-documents-target.test.ts` copies committed HEAD; running it against an
uncommitted repair would test the old duplicate tree. Its post-commit result and
final configured checks will be recorded only after observation.

This is a mechanical document identity repair in a separate private draft branch.
It does not qualify native execution, change source pins, adopt architecture on
main or deploy. Broader CI and exact-SHA h2 gate remain required.

## Committed-tree verification

Commit `51267bb3489343436b89376abca89ba0202d96c4` passed normal repository
hooks. Root staged the exact renames before running the current-tree document
checker; it exited0 with `Verified current documents and indexes`.
The earlier unstaged check could not read deleted cached old paths and supplies
no pass credit.

Root then ran the unchanged ADR index and complete document-target integration
file against that committed HEAD with explicit empty Bun configuration, configured
scratch preload, isolated fixture caches and60000ms per-test allowance:
**7passed,0failed,41assertions across2files**,70.69seconds overall.
This includes actual configured document-target execution, runtime-selection
cleanliness and broken local-link, ADR-numbering, retired-root and root-migration
payload refusals. Scratch teardown returned. No native/helper/storage recipe was
invoked. Fresh `openspec validate --all --json` again exited0 with333/333 passed
(313 changes,20 specs).

Astra High independently reviewed the final mechanical diff and confirmed exact
decision/main-identity preservation, historical numbering and unchanged evidence.
This evidence update is a documentation-only follow-up on the same branch;
full CI and exact-SHA host gate remain unqualified.
