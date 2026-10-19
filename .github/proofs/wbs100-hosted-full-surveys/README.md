# Hosted full surveys and standalone F7 acceptance

Both recovery delta specs require installed full F7 and all-rule surveys on the hosted
venue independently of local production-size evidence. This branch provides that venue;
the earlier four-report REL-EXTRACT fixture parity remains a separate proof.

The workflow checks out final source `d7f2129598af7a3cb7ed3c7161e06d504b586891`
at full depth. It downloads the exact successor archive from successful hosted parity
artifact 12228379062, verifies artifact metadata, ZIP digest and package digest, then
installs it in a fresh consumer. It does not rebuild or publish a package.

- Artifact ZIP SHA-256:
  `7c2941538885bdb2836ae4225272c3bf7dce79c00ba7a67cc54a340ca91fc126`.
- Successor archive SHA-256:
  `761fb162076480d4a33e58afdb55a64a768a5549cffc736584e3612188c163b6`.
- Frozen candidate-bindings SHA-256:
  `eb9cfaf9d6621e59cc6edf528d6f7dc4ab53511d48e1e68af6dc0c0820be8133`.
- Frozen all-observe policy SHA-256:
  `3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.

The incremental Git bundle carries only four commits above prerequisite
`3e8d0742154e90a606b23d305dd6e424bb9c7d06`: the already-published reference and
estimate candidates, and their two faults. Each fault changes only its selected component
back to the original published base blob. The driver imports the refs without changing
HEAD, verifies all five commit/tree bindings, and checks both restorations. The exact
patch inventory and provenance are in [the bundle receipt](review/fault-bundle-provenance.json.txt).
The binary bundle belongs only to this proof branch, not the application PR or main.

Five all-rule invocations run sequentially with no `--rule` argument. Immediately after
the baseline run, its entire parsed report must equal the published final-source baseline
SHA-256 `eedb17263aedc359fe503a2a2e9443c527f2a5b06b2685598f68554aa618dca2`
(41 findings and three explicit unevaluated entries). A shared compiler refusal or missing
compiler finding therefore stops the job before the other four runs. The exact input bytes
and their published provenance are retained in
[the baseline receipt](review/expected-base-provenance.json.txt). The unchanged
`compare-surveys.py` requires all 14 rules, exact candidate/policy identities, stable
evaluator/runtime identities, complete explicit unevaluated entries, preserved unrelated
findings, and only the selected F7 reduction/reintroduction. Five separate installed
`--rule F7` invocations follow. Their complete reports must equal the corresponding full
survey's F7 subset, retain debt effects and noncertification, and preserve the exact
29 → 28 → 29 finding relationships independently for both recoveries.

All ten invocations use the original 4 GiB process-tree RSS, 900-second and minimum
12 GiB available-memory guard. Twenty fresh before/after snapshots must equal the installed
identity observed in the earlier hosted artifact, including source revision, manifest,
descriptor, runtime and executable. Every descriptor role is checked against installed bytes.
Consumer install and frozen install retain the earlier 2 GiB / 360-second preparation guard.
No resource refusal, malformed report, unexpected child exit or comparison failure counts
as acceptance. The outer job has a finite 90-minute deadline; ten worst-case 900-second
runs need not fit, and outer cancellation leaves the proof incomplete.

The uploaded artifact retains commands, raw stdout/stderr, guard receipts, snapshots,
comparison outputs and exact proof inputs. Explicit unevaluated outcomes remain visible;
preservation does not turn them into evaluation or certification. Full CI and canonical h2
remain separate obligations.

## Review and lightweight proofs

The copied parity helper, capture helper and strict all-rule oracle retain their reviewed
bytes. Original [43 helper negatives](review/prior-parity-43-negatives.json.txt) and
[19 all-rule oracle negatives](review/prior-survey-19-negatives.json.txt) are preserved as
historical evidence, not claimed as fresh executions of this driver.

`prove-adapter.py` exercises the actual new F7 adapter and driver safety paths using small
files, tiny Git histories, synthetic identity files and tiny Python children under the real
guard. Its F7 test fixtures are projected from retained actual surveys solely to test the
adapter; they are not observed standalone hosted reports. New named negatives and restored
checks are recorded in `review/adapter-proof.json.txt`. No local evaluator, build, full
survey or heavyweight test is part of preparation.

To reproduce those lightweight checks with existing retained evidence, use a fresh output
directory as the third argument:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 prove-adapter.py \
  /tmp/puni-wbs100-survey-bindings-20261019 \
  /tmp/puni-wbs100-hosted-full-surveys-worktree-20261020 \
  /tmp/new-hosted-full-survey-adapter-proof
```

Publication requires root and peer review of this concrete workflow/driver. A push to
`integration/wbs100-hosted-full-surveys-20261020` launches verification only. No release,
registry publication or deployment is performed.
