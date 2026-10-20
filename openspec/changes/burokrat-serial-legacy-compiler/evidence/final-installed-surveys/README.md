# Final local installed surveys

Five local full-rule surveys completed with the separately installed evaluator
from exact source `d7f2129598af7a3cb7ed3c7161e06d504b586891`. The unchanged strict
five-report comparator passed. This establishes local finding preservation and
actual compiler-rule evaluation; hosted full-survey and final gate acceptance
remain separate.

## Identity and scope

- Local archive SHA256: `5dfc97149a59511d843f5f39e39c57e731c4b898cfbe2aa43920f05e5f088dee`.
- Installed executable: `bb91e9a0644f11045bf9a585d55e4d049f0512212d6c29e461cdc523fad21046`.
- Validator: `1ae8d7286375ff07dc8c5d82f2edabcc94e3025c4cb942c65aa1d71fccdd6ba8`.
- Toolkit descriptor: `d7fa64d79790bae6e40aa77f48994e28d5b2288919b3e0124565611267502309`.
- Frozen external policy: `3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.
- All ten distinct before/after snapshots are byte-identical at SHA256
  `2ca9d2dba56d0c9c273586a991078e7e1c6832d0e8e09479f437c9a71f200579`.

The local archive is distinct from the hosted bounded-parity archive
`761fb162076480d4a33e58afdb55a64a768a5549cffc736584e3612188c163b6`, also built
from d7f212959. The [hosted parity packet](../hosted-installed-parity/README.md.txt)
proves its own bounded REL-EXTRACT comparison; it is not the archive used for
these local surveys and does not establish hosted full-rule acceptance.
`hosted-parity/*` payloads retain that distinction, not replacement local proofs.
The historical archive `f287bc11…` and its earlier resource failures remain
unchanged and are not relabelled as either successor.

## Complete reports

Each command used direct installed `twib check committed`, the same external
policy, and all fourteen selected rule IDs. The existing sampled process-tree
guard remained 4,194,304 KiB / 900 seconds, with at least 12,582,912 KiB available
before every invocation. The baseline ran first. Two independent lanes then ran
reference/fault and estimate/fault sequentially within each lane, with at most
two guarded evaluators concurrently. No guard stopped a run.

| Selection       | Exact commit                               | Findings |  F7 | Seconds | Peak KiB |
| --------------- | ------------------------------------------ | -------: | --: | ------: | -------: |
| Base            | `3e8d0742154e90a606b23d305dd6e424bb9c7d06` |       41 |  29 | 409.759 |  4098020 |
| Reference       | `40d40ff6219aae3d2115dd39eee6ca36f1cd9e61` |       40 |  28 | 437.390 |  4141452 |
| Reference fault | `d6026f83be7c0af4c325406961ebc3eacb58363c` |       41 |  29 | 414.951 |  4123484 |
| Estimate        | `4a98e8092fe4af14ffd5ceefac5d27dd42998ba0` |       40 |  28 | 439.198 |  4133748 |
| Estimate fault  | `1b1a39e7fe4858b7a2a168d67a30dddc1fcbc7d5` |       41 |  29 | 415.397 |  4101988 |

Each source removes only its intended F7 record: 1125 lines in
`reference-set-field.tsx`, or 1095 lines in `plan-columns/estimates.tsx`, against
the unchanged ceiling of 800. Every other finding is preserved. Each actual
committed oversized fault restores the entire baseline findings exactly.

F1, K2–K6 and REL-EXTRACT evaluated without the earlier DNS/SMTP compiler
refusals. All five reports retain `allowed:false`, `certifies:false` and the
same three unevaluated records: INV-CLASSIFY refuses undeclared gzip content,
PERF-THRESHOLD refuses changed reviewed config content, and SPEC-SCENARIOS
refuses a competing overlay. Their exact reasons are in the raw reports. No
policy relaxation, certification or universal RSS guarantee follows. The
largest local peak leaves only 52,852 KiB below the recorded ceiling.

## Comparator proof boundaries

`authority/compare-surveys.py` is unchanged at SHA256
`6652e594f7d6b7016fa3a38c2cc63ae2d81bc10dbbebdff9827ec3dd9f37716a`.
`runs/comparison.*` retain its actual final invocation and successful output.
`runs/actual-fault-assertions.json` records the same whole-findings equality
helper rejecting both real committed fault reports and passing after reselecting
the retained good reports. These comparisons did not rerun the evaluator.

The nineteen watched comparator mutations in `historical/*` belong to the
[initial 0e444 survey proof](../initial-installed-surveys/README.md), which had
ten unevaluated rules. They proved this unchanged comparator's failure paths on
those retained reports; they were not repeated against d7f212959 and are not
nineteen new production fault runs. Their exact original summary, driver and
acceptance note are retained here; the original packet preserves the individual
negative logs and restoration proof.

## Lossless transport and checking

[manifest.json.txt](manifest.json.txt) maps all 54 original paths to byte counts
and SHA256 identities. [raw-streams.json.txt](raw-streams.json.txt) stores 39
unique payloads as UTF-8 JSON strings keyed by their original-byte digest.
Reconstruct a named file by reading its manifest digest, selecting the matching
`payloads` string, and encoding that string as UTF-8. This deduplicates identical
snapshots and empty streams without normalization or gzip. The manifest records
the entire carrier digest. Original absolute paths identify provenance; they
are not required merely to reconstruct the payloads.

```sh
python3 openspec/changes/burokrat-serial-legacy-compiler/evidence/final-installed-surveys/verify-packet.py.txt openspec/changes/burokrat-serial-legacy-compiler/evidence/final-installed-surveys
```

Add `--check-sources` while the retained original paths are available to compare
every reconstructed byte against its source. The
[transport proof](transport-integrity.json.txt) records that full comparison,
watched carrier/payload/length/source faults, and successful restoration. These
are transport checks, not evaluator or rule-comparator proofs. The retained
oracle still requires its recorded installed evaluator and Git/source context
for an exact invocation; this packet does not claim a fresh standalone rerun.
