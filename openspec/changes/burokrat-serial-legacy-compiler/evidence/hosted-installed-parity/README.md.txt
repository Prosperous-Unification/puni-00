# Hosted installed parity for final source d7f2129

[Workflow run 39340870682](https://github.com/Prosperous-Unification/puni-00/actions/runs/39340870682)
completed successfully on 2026-10-19. Proof commit
`f4d74e1fbd6ac64e047e0e10d6462396be58a55e` checked out evaluator source
`d7f2129598af7a3cb7ed3c7161e06d504b586891` separately, built its uncached Nx package,
and installed historical and successor archives into fresh consumers using Bun 1.4.2.
The driver step ran from 23:19:57 to 23:20:51 UTC; artifact upload completed at 23:20:54.

All four complete reports equal the retained historical expectations. Positive runs are
allowed with no findings or unevaluated rules; negative runs preserve exactly the expected
missing-public-entrypoint REL-EXTRACT refusal. All reports have `certifies: false`.
Eight before/after snapshots are equal within each invocation and across each package's
two invocations. The hosted successor archive independently matches the captured installed
manifest, descriptor, executable and every descriptor role hash.

| Installed package / policy | Child exit | Seconds | Peak process-tree KiB |
| --- | ---: | ---: | ---: |
| Historical / positive | 0 | 5.411 | 1,237,176 |
| Historical / missing public entrypoint | 1 | 4.874 | 1,299,852 |
| Successor / positive | 0 | 8.187 | 986,360 |
| Successor / missing public entrypoint | 1 | 7.343 | 1,060,984 |

All four fixture guards retained the 2 GiB / 60-second limits and minimum 12 GiB
available memory. Source installation, uncached pack, and both consumers' add/frozen-install
commands completed with child exit 0 under the retained 2 GiB / 360-second preparation
guard. All ten receipts have `stopReason: null`; wrapper success was not substituted for
the child result. Full commands, runtime identities and receipts are retained below.

The two package archives are distinct and must not be relabeled:

- Historical source `ac774f0c358db369c2048e537151e263cc29361e`, archive SHA-256
  `f287bc11f43f628b70ecd01e11eb6784c55fd4b2fb8cbb9e439dee8e685297fd`.
- Hosted successor source `d7f2129598af7a3cb7ed3c7161e06d504b586891`, archive SHA-256
  `761fb162076480d4a33e58afdb55a64a768a5549cffc736584e3612188c163b6`.

Uploaded artifact **12228379062**, named
`wbs100-hosted-parity-d7f2129598af7a3cb7ed3c7161e06d504b586891-1`, is 32,569,755 bytes
with ZIP SHA-256 `7c2941538885bdb2836ae4225272c3bf7dce79c00ba7a67cc54a340ca91fc126`.
Its downloaded ZIP digest and size were verified before inspection. The historical package
comes from immutable artifact 12029728928, not a rebuilt archive.

This is hosted bounded fixture parity evidence for task 4.1. It does not certify all-rule
acceptance, the complete package isolation suite, full CI, or the canonical h2 gate.
Historical installed role files were checked by the hosted driver but are not separately
uploaded; the retained historical identity hashes and snapshots bind that observation.

## Lossless evidence transport

- [Audit](audit.json.txt) gives the four complete reports, eight snapshot references,
  ten guard receipts and artifact/package/source identities.
- [Original file manifest](original-file-manifest.json.txt) binds every original text
  file's UTF-8 byte length and SHA-256, and the two binary members omitted from this packet.
- [Raw streams](raw-streams.json.txt) maps original paths to JSON strings containing their
  exact text bytes, including logs, reports, all snapshots, proof inputs and guards. Decode
  each value and encode it as UTF-8 to reconstruct the original bytes. No whitespace was
  normalized. All 87 text files round-tripped successfully. An in-memory appended space
  changed the expected report digest; the unchanged carrier still round-tripped cleanly.
- [Reconstruction check](reconstruct-check.py.txt) validates those bytes without executing
  any package. Run `python3 reconstruct-check.py.txt` from this packet directory.

The successor archive and binary fixture bundle remain in the uploaded artifact and the
downloaded ZIP; their original hashes are retained without duplicating them here. This
packet creates no new gzip files. Approval-review receipts remain outside product evidence.
