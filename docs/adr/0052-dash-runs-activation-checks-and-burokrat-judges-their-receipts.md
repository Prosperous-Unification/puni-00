---
status: accepted
---

# Twilight Dash runs activation checks and Twilight Burokrat judges their receipts

Both `prepare-*-activation` commands used to run the candidate's checks themselves, reading the
host clock around each one; they were the last clock reads in the Burokrat package
([ADR 0051](0051-the-activation-controller-runs-in-dash-as-a-second-authority.md)). Now
`twilight-dash run-activation-checks` runs them and writes a CheckRun ledger: one record per check,
with the candidate revision and tree identity, the wall-clock instants Dash stamped from its
injected clock, the exit status and stream digests of the check and of its `bun test` skip probe,
and the recorder `twilight-dash run-activation-checks`. Each record links the canonical digest of
the one before it, and the ledger's `head` seals the last. Both preparers take the directory as a
required `--check-runs` flag. They plan the same checks through the same derivation
(`planCandidateChecks`) and judge the ledger; they never run a check. Every broken rule is a typed
`CheckRunRefusal`. The npm CLI keeps every command, and Burokrat reads no clock.

The chain is tamper evidence, not authentication. Anyone who can write the ledger can recompute it.
The ledger is operator input, exactly as the review record and the `--resource-lane` and
`--cwd-identity` attestations are, and it carries no more trust than an operator who ran the
checks by hand. The released binary is still proved end to end: the packed-package suite prepares
from golden ledgers that Dash wrote for a reproducible candidate, and Dash's tests reproduce those
bytes from their parts. Details:
[design](../../openspec/changes/checkrun-receipts/design.md).

## Considered options

- **Keep the runners in Burokrat (ADR 0051's position).** Burokrat would keep its two clock reads
  and an allow-list that names them. The static judge would keep executing candidate code.
- **Sign each record with a Dash key.** This needs key custody, rotation and a trust root that the
  preparer pins. None exists for operator-run commands, and a signature over operator-run checks
  would claim more than it proves. It stays open as a later, additive `signature` field under a new
  schema version.
- **A Burokrat `plan-activation-checks` command that Dash reads.** This adds an npm command, plus a
  second file format between the tools. The shared derivation through `@twilight-burokrat/judge`
  needs neither.
- **One file per run.** The order and the seal would then live in file names. A single ledger keeps
  both in the bytes it hashes.

## Consequences

- An operator now runs two commands. An external consumer of the npm package needs Dash, which is
  not yet published; the consumer README says to run it from a source checkout.
- Changing the check runner's record format is a schema change in Burokrat's `contracts/records.ts`.
  It needs a regenerated golden (`apps/twilight-structure/twilight-burokrat/cli/fixtures/check-runs/`).
- The golden pins the reproducible candidate, so a Bun upgrade regenerates it.
