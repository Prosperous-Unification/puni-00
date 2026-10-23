# Hosted explicit estimate TypeScript 6

[Run 39345173154](https://github.com/Prosperous-Unification/puni-00/actions/runs/39345173154)
completed successfully at proof revision
`bf5aba88cfe0bf230c253f3b2ee691b540570dd6`, independently checking source
`d7f2129598af7a3cb7ed3c7161e06d504b586891`. Job 118375915716 uploaded artifact
12230922085; its original 23,999-byte ZIP has SHA256
`4cab00032ce438e11d3d75c78f3523d88e521024575030fe4f2f1c850f91cda3`.
The ZIP remains outside the repository; all 40 extracted UTF-8 files are retained
losslessly here, including the unchanged historical scope, guard and compiler
identity receipt. Source, proof and artifact identities are distinct.

The actual command was:

```sh
bun node_modules/typescript/bin/tsc6 -p .estimate-recovery-scope.tsconfig.json --noEmit
```

It exited zero with empty stdout/stderr and no guard stop in 11.460 seconds,
peak process-tree RSS 1,453,972 KiB. The unchanged retained guard required
2,097,152 KiB maximum RSS, 360 seconds and at least 12,582,912 KiB available;
14,545,228 KiB was available before the compiler invocation. Fresh frozen Bun
1.4.2 installation also passed (4.689 seconds, 438,876 KiB). All four guarded
install/version/resolve/typecheck invocations exited zero without a stop.

Actual version output is `Version 6.0.3`. Resolved entry, facade, `lib/tsc.js` and
`lib/_tsc.js` hashes match the earlier public TS6 identity; the actual compiler
hash is `1c59e77a54b186ec43fa7f3e0d3c4bb15ca5eb5ba43e96b1d3a267139eddd3e3`.
Before/after source/config/compiler snapshots are byte-identical at SHA256
`72600672799db9086f67e1e0e033a7b759978896b2df959bd13660436f5dbeea`.
The two selected production files match both d7f212959 and recovered source
4a98e809. The original local proof remains local; this later hosted execution
satisfies the missing venue component of historical estimate task 1.5. It does
not establish full frontend CI, all-rule survey, browser or h2puni acceptance.

The adapter ran 38 integrity-input negatives and five actual acceptance
orchestration negatives on the hosted runner. They substitute external
observations/invocation and retain real validators; wrong source/compiler,
child one, guard failure and after-drift refuse without acceptance. Local
removed-check mutations independently broke the same proof and passed after
restoration. These are adapter-integrity proofs, not compiler negatives.

[manifest.json.txt](manifest.json.txt) maps 50 original files to byte counts and
SHA256 identities. [raw-streams.json.txt](raw-streams.json.txt) stores 37 unique
UTF-8 JSON strings keyed by digest. Decoding and UTF-8 encoding restores exact
bytes, including raw logs and the frozen proof README; no formatting is applied
to those payloads. The audit records bind the hosted metadata, proof bytes,
source/chain identities and all command receipts. Local checks and normal-hook
commit output are separately named `local-adapter/*`.

```sh
python3 openspec/changes/wbs-estimate-presentation-boundary/evidence/hosted-ts6-2026-10-20/verify-packet.py.txt openspec/changes/wbs-estimate-presentation-boundary/evidence/hosted-ts6-2026-10-20
```

Add `--check-sources` while the retained original paths exist to compare every
decoded byte. The [transport proof](transport-integrity.json.txt) records that
comparison, watched carrier/payload/length/source corruption and restoration.
These transport checks neither rerun the compiler nor replace its hosted proof.
