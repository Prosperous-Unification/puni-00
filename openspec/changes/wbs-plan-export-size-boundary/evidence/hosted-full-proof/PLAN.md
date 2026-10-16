# Hosted exact-head full survey

## Intent

Complete the full-rule comparison for reviewed PR #534 without another laptop
survey. The source head is `26732f5440eed8123540202b6dc8eba966835244`, tree
`d1cf5f0e6026914eb412026b578dfb9be85487b4`; base is
`4f098bfe2bf64343b8f503b5bdebd6e1a6fa34f4`, tree
`d0b4d71f9ffa2ad8534eed6521165092f83b0882`.

The workflow exists only on `proof/wbs-plan-export-full-20261016`, triggers only
on pushes there, grants `contents:read`, persists no checkout credentials and
uses no secrets, deployment or h2puni operation. The proof checkout supplies only
the workflow and helpers; separate immutable checkouts supply the candidate and
evaluator. Both full surveys run serially in one hosted job and one installed
consumer. Twelve GiB of ephemeral runner swap supplies margin for the graph.

## Recovery identity

The historical `/tmp` evaluator, policy and raw verdict files are absent after the
reboot. Their recorded historical claims remain unchanged. This run does not
recover or alias the lost executable `3432df...`, toolkit `db3dcf...` or policy
`052a3a...` identities.

The evaluator source is independently pinned to
`ac774f0c358db369c2048e537151e263cc29361e`. It is rebuilt and packed on the hosted
runner, then installed once in an independent consumer with scripts disabled.
The verifier pins the recovery executable `92ca1424...`, toolkit `2417f876...`
and trusted dependency identity `efe81248...` previously observed in #537's
successful hosted recovery. A mismatch fails before surveys; no historical-byte
claim is inferred from matching source. Tarball bytes and full installed identity
are uploaded.

`recovery-full-policy.json.txt` is a new policy, SHA-256
`3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`, named
`wbs.plan-export.recovery.full.v1`. `policy-provenance.json` records its derivation
from the retained a478 diagnostic policy and exact #534 repository classification
policy. Relative to the retained diagnostic it changes only the policy name and
classification: five reviewed website binaries and one cert-manager consumer
relocation. All 14 rule modes, 21 relationship configs, 442 plain-source selectors,
performance authority, scenario base, 800-line ceiling and empty adoption remain
intact. No equivalence to the lost successor policy is claimed.

## Acceptance and receipts

Both commands select every registered rule, with no `--rule` filter. Command
receipts record exact argv/revision/policy digest, timestamps, wrapper exit and
signal; raw stdout and stderr remain intact. Empty/malformed stdout fails instead
of becoming an accepted result. Memory and pressure samples accompany each run.

The comparator requires the same 14 rules and policy identity in both verdicts,
the exact 994-line selected baseline finding, its absence on #534, and complete
array equality for every unrelated finding and unevaluated entry. Neither verdict
may certify. It also requires unchanged `allowed`; a correctly reported diagnostic
refusal may exit 1 and still provide useful comparison evidence.

Hosted negative proofs reuse the actual production receipts: the baseline used
as candidate must fail the selected-finding assertion, and appending unrelated
finding or unevaluated entries must fail their corresponding assertions. The
original pair is then checked again. These mutations change receipts only; the
existing committed oversized-production-file negative remains historical evidence
in the source verification packet.

Upload runs even on failure and retains receipts for 30 days. The final report
will record run URL, artifact identity/digest, both candidate identities and rule
outcomes. Remaining findings and unevaluated rules limit this to a diagnostic
comparison, never certification or WBS100 closure. No source PR head, main branch,
canonical host gate or deploy changes are included.
