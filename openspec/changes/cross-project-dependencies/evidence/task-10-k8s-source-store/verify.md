# Kubernetes fresh dormant-store source prerequisite — 2026-10-29

Private base: `3dfe3dffcc7921416803a9c6020791518314cb84`, worktree
`3410/puni-00`. Approved source decision SHA256:
`b3c173cdca16e0610d5da56e2c24e86d6d76a59376ebb88162eeeff2c898b3aa`.
This is a bounded task 10.2 prerequisite. Main/deploy adoption, activation,
complete B2/B3, historical compatibility and pre-exposure certification remain held.
Root reported newer main `50862bc3748ace685aad6c942ddd57a738f7f3c9` adds MCP
preflight in overlapping execute source; reconciliation and combined checks have
not run in this leaf. No live hosts, cluster, database or rollout was used.

## Owning RED and implementation

The mounted executor uses actual fileJournal, controller adapter and store adapter
with raw kubectl Job/Pod/log fixtures. First RED8297 reached source replay and
failed expected completed store count 1 versus undefined; automatic rollback then
reached the same missing-observation assertion. This proves missing invocation,
not special refusal routing. When the new adapter began executing, the fixture's
old image name `backend` failed the actual backend image contract. Correcting it
to `wbs-be-01` allowed GREEN96022 (1 pass, 7 assertions). The later dispatch
omission proof uses that corrected fixture and therefore proves the intended
consumer failure with otherwise usable transport.

Production now selects the existing store port, runs one fresh candidate-digest
Job after each of the five existing source intervals is durably drained, and
rechecks the same retained interval/Lease before the source effect. No scanner,
journal schema, evidence authority or activation code changed. Store uncertainty
interrupts before automatic recovery. Completed controller checkpoints remain in
the journal; bytes are not claimed unchanged from invocation start.

Strengthened late-drift RED83786 found PVC/controller uncertainty entering generic
rollback (`rollback-failed` instead of retained `writer-stopped`). The observation
and post-Job retained interval barrier now share interruption routing, with
existing Lease/checkpoint exceptions preserved. GREEN66102 passed all four
late-drift/rollback cases (59 assertions).

## Watched guard faults

Each pair ran the named actual mounted consumer with the guard omitted, restored
the exact original source bytes, and reran that same consumer. The proof runner
finally printed restored execute SHA256
`c3ca49d9df93ba49faf7134c0e2a9b3cae27880f76f252f67a97f65c07c6d4dd`.
The four proof pairs belong to this pre-refactor epoch. Subsequent Proof comments,
JSDoc and equivalent optional-chain formatting preceded the independently reviewed
retained-return correction below. The old proof runs are not claimed as final-byte
reruns. Raw omitted/restored logs are adjacent.

| Fault                                          | Intended observed consumer failure                                                     | Restored              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------- |
| Remove source observation dispatch             | Fresh source replay ordering lacks completed Job; ENABLED fixture incorrectly proceeds | 2 pass, 24 assertions |
| Bypass special interruption routing            | ENABLED refusal advances journal to rollback-failed instead of writer-stopped          | 1 pass, 13 assertions |
| Remove post-observation interval/Lease barrier | PVC swapped after successful logs reaches actual source replay                         | 1 pass, 10 assertions |
| Cache one previous successful observation      | Second-boundary ENABLED is never observed and unsafe release resolves                  | 1 pass, 6 assertions  |

## Pre-refactor configured checks and limits

- `bun test --preload ./tools/test/scratch/preload.ts tools/tool-deploy/src/k8s/controller-release.test.ts tools/tool-deploy/src/k8s/execute.test.ts`: original handle65844 joined, exit 0; **107 pass, 0 fail, 763 assertions, 303.07s**. Both owning files, including five-observation rollback ordering and resumed fresh refusal, passed. Scratch cleanup returned.
- Two subsequently added composition cases: `-t 'post-observation consumer|sticky heartbeat Lease loss'`, handle5218 joined exit 0; **2 pass, 18 assertions, 6.29s**. An unfiltered late source reader refuses; a successful observation cannot clear heartbeat Lease loss. Scratch cleanup returned.
- `bunx nx run tool-deploy:typecheck --skip-nx-cache`, handle37223 joined exit 0; actual `bunx tsc --build --force tools/tool-deploy/tsconfig.json` passed. Initial run caught index-signature errors in the new tests; these were corrected. `bunx tsc --project tools/tool-deploy/tsconfig.spec.json --listFilesOnly` separately listed execute, fake-cluster and both changed test files. There are no new TypeScript files.
- Scoped ESLint on the four changed Kubernetes files, handle31016 joined exit 0. Initial lint findings were corrected; no lint policy was relaxed.
- Final `bunx prettier --check` on four owned source files and five changed Markdown files passed. `bunx openspec validate cross-project-dependencies --json` passed with existing long-requirement warnings and no new source-prerequisite warning.
- Existing scanner schema/trigger/history qualification was unchanged and was not replayed. The new mounted cases exercise strict raw decoding and the actual adapter; they do not execute a live SQLite scanner Job.
- Source controller ownership, PVC/PV identity, namespace, candidate digest, actual terminal Job/owned Pod, readonly mount and coordinator command are represented in the mounted transport. No new exemption removes completed observation history from the ordinary inventory.
- No full host gate, full monorepo CI, new-main MCP preflight composition, live deploy or activation was run. Independent review and host gate remain required. Source paths that skip source work are outside this prerequisite.

## Approved retained-return correction

Astra independently accepted the four actual consumer proofs and approved exactly
`/tmp/puni-k8s-store-retained-return-candidate.patch` SHA256
`8450706640057db299ecda0adfba142157c1840a3d54c98e06a3dd3cc2460035`.
Its sealed review SHA256 is
`5579ee46b9760dd75542cf15065683893686b65e5dd28a0f7305b19582a14664`;
the unchanged report is retained as `independent-review.md` beside this note.

The applied correction returns the actual checkpointed lifecycle from existing
`establishInterval` through `controllerBarrier`, then passes that exact object to
the fresh observer and closing interval recheck. Null is returned only for
non-source steps. The redundant stage guard and duplicate five-step selector were
removed; no new authority or predicate replaced them. Forward-restoration recursion
still returns the actual rollback interval.

Final corrected execute SHA256:
`4b817a76af79fcc503fb088a4db70439d827d47444687e4ce11657ef836a0017`.
Fresh configured compiler6290, scoped lint66573 and configured Nx lint87547 all
joined exit 0. The single required final two-owning-file run75289 joined exit 0:
**109 pass, 0 fail, 781 assertions, 276.00s**, with scratch cleanup returned.
It includes all five source consumers, restoration recursion, forward/rollback,
resume, transport uncertainty, late drift and sticky Lease cases on corrected
source. The retained current log is `puni-k8s-store-return-owning.log`.
Prior 107+2 runs and four omission/restoration pairs remain historical evidence;
no proof campaign was rerun after this return-value refactor.

Final source pins are retained in `final-source-sha256.txt`. Final format and
OpenSpec checks run after the evidence update; their terminal receipts and logs
are retained. Exact corrected-source review seal, newer-main MCP composition and
host gate remain Root's next obligations, with no main/deploy adoption claim.

## Normal-hook evidence formatting

The first normal commit attempt passed lint, secret scanning and private-nesting checks but refused the copied review Markdown formatting. Root preserved the original review, verification note and manifest privately, formatted only the repository review copy, and refreshed the affected evidence hashes. Runtime source pins and all test logs are unchanged.
