# Controlled h2 image proof attempt — 2026-10-23

Commit `bb8ec1a91fef94640c1b49413a7af80d10fbb6a5`; isolated checkout
`/home/puni1/task7-image-proof-bb8ec1a91`. The canonical wrapper acquired the
h2 heavy lock with label `task7-image-proof:bb8ec1a91`, holder PID 955523.
The runner exited **1**. This is a retained failed attempt, not complete
acceptance of Tasks 7.3/7.4 or the integrated host gate.

Observed sequence:

- Full built-image smoke: exit 0, composed installed Python publication and reuse.
- Retained baseline published as
  `127.0.0.1:33134/wbs-be-01@sha256:5e6cd85f98ecc28eec1ae24e9d8c6ada9895c94ad50136b7198bc2945f881dd9`.
- Full supplied-image smoke of that digest: exit 0.
- Independent source-binding derivative: exit 1 at composed placement, with
  `complete placement absent`, before the expected terminal-ledger assertion.
  The strict classifier refused this earlier Error rather than accepting it as
  the intended AssertionError. The other three derivatives were not attempted.
- The identical baseline digest was restored and passed again, exit 0.
- Every completed nested recovery recorded stopped supervisor and caller,
  stable admission inventory and zero cleanup failures. Outer cleanup read back
  absence of its registry and all three recorded tags, with zero failures.
  A subsequent canonical lock query reported `holder none`.

The [inventory](inventory.log) is the unchanged host `inventory.json`, retained
with a log suffix to preserve its bytes. It records command status, derivative digest/source
hash, per-smoke receipt paths, nested ownership and cleanup readbacks. Stage logs:
[built](built-green.log), [supplied](supplied-green.log),
[mutant](source-binding.log), [restored](source-binding-restored.log).
The absolute paths in those immutable records identify the original h2 receipts.

The dependency tree was reused from the isolated gate checkout. Both checkouts
have identical `package.json` and `bun.lock` bytes across the tested range;
this attempt did not perform a fresh install. Host Bun reported 1.4.2.
No production service, store, activation or deployment was changed.

The earlier attempt at `4eeef9704` stopped before Docker because its host guard
mistook SSH alias `h2puni` for the actual hostname `ubuntu-8gb-hel1-1`. Its
exit was 1 and the lock was released. The reviewed hostname correction is part
of this attempt's exact commit. Correcting the composed fixture assertion and
rerunning the full controlled proof remain required.
