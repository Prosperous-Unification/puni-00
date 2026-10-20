# Hosted full surveys and standalone F7 receipt

[Hosted run 39343674302](https://github.com/Prosperous-Unification/puni-00/actions/runs/39343674302)
used proof commit `9215cdf312904669b6734917bf66b81a7e1cef89` and final source
`d7f2129598af7a3cb7ed3c7161e06d504b586891`. Independent retained-artifact checks passed
for five all-rule reports, five standalone F7 reports and twenty before/after identities.
All twenty snapshot files share raw SHA-256
`bd2f4cb88ccaedcf93c1306865fa3786338998ab44079a54c62fee4074c7e3cc`.
The installed archive is the exact previously hosted successor
`761fb162076480d4a33e58afdb55a64a768a5549cffc736584e3612188c163b6`; this run did not rebuild it.

The complete baseline equals the already-published final-source report. Each recovery
removes only its selected F7 finding; each restored original component reproduces the
complete baseline findings. Every standalone report equals its corresponding full report's
F7 subset. The three explicit unevaluated outcomes remain unchanged and unevaluated;
this evidence does not certify all rules or whole-WBS acceptance.

| Invocation           | Findings | Unevaluated | Child exit | Seconds | Peak tree KiB |
| -------------------- | -------: | ----------: | ---------: | ------: | ------------: |
| full-base            |       41 |           3 |          1 | 478.054 |       3856504 |
| full-reference       |       40 |           3 |          1 | 473.509 |       3909420 |
| full-reference-fault |       41 |           3 |          1 | 476.459 |       3887924 |
| full-estimate        |       40 |           3 |          1 | 481.433 |       3936748 |
| full-estimate-fault  |       41 |           3 |          1 | 483.789 |       3891952 |
| f7-base              |       29 |           0 |          0 |   5.209 |       1555896 |
| f7-reference         |       28 |           0 |          0 |   5.347 |       1575868 |
| f7-reference-fault   |       29 |           0 |          0 |   5.281 |       1581488 |
| f7-estimate          |       28 |           0 |          0 |   5.245 |       1560304 |
| f7-estimate-fault    |       29 |           0 |          0 |   5.244 |       1569604 |

Every evaluator invocation retained the original 4 GiB / 900-second / minimum 12 GiB
available-memory guard and completed without resource termination. Child exit 1 on full
reports agrees with `allowed: false`; the guard wrapper and comparison completed with exit 0.
Consumer preparation retained its separate 2 GiB / 360-second guard. CI and canonical h2
remain independent obligations.

`raw-streams.json.txt` contains lossless UTF-8 JSON-string carriers for the artifact's text
files, including ten stdout/stderr/guard receipts, twenty identity snapshots, comparisons
and proof inputs. `manifest.json.txt` binds every original byte count and SHA-256. The
42,757-byte incremental binary fault bundle remains in the referenced original artifact and
proof commit, with its hash and location recorded; no package binaries or new gzip transport
are duplicated here. `hosted-artifact.json.txt` binds the original download.

Run `python3 reconstruct.py.txt` to validate every transported stream, or provide a fresh output
directory to reconstruct exact original UTF-8 bytes. `independent-audit.py.txt` records the
separate audit; its original local input paths are retained for provenance, not portability.

The workflow intentionally excludes package archives from this new artifact. The audit
rehashed the successor member in original artifact 12228379062. Hosted checksum evidence
is the exact retained driver checking the package before installation and again immediately
before `completion.json`; there is no separate final package-checksum receipt. Supplementary
workflow logs/API bytes, the exact workflow, and the root independent audit are also preserved.
Three watched mutations of the downloaded-artifact audit failed as intended, followed by a
restored passing audit.

`transport-proof.json.txt` records a same-length carrier corruption rejected by the
reconstructor and restored byte-identical recovery of all 121 artifact text files plus
seven supplementary receipts.
