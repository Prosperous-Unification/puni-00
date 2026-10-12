## Why

Twilight Burokrat holds both the admission judge and the runtime lease authority: the
SQLite store, claims, generations, submission freezing, composition, queue and Git ref
publication. Its job is to judge artifacts, not to hold effects or read a clock, and the
store silently creates itself when absent, which lets a lost or wrong-clone store restart
generations at 1 and defeat old-writer fencing.

## What Changes

The runtime authority moves whole to `twilight-dash/cli/src/authority/`. Burokrat keeps the
judge in `admission-judge/` (packet codec, identity grammar, packet validation against the
pinned base, integration-candidate certification, attestation) and exposes it to Dash only
through the allow-listed alias `@twilight-burokrat/judge`. The store keeps its on-disk identity
byte for byte. Opening an absent store refuses with a typed failure naming
`twilight-dash bootstrap-authority`, distinct from unreadable and corrupt; creation happens only
through that command. The clock becomes a required dependency composed once in Dash's
entrypoint. `submit-admission` moves to Dash with an exact-identity idempotent retry, and Dash
gains `inspect-authority` and `recover-publication`. Burokrat ships no writer.

## Non-Goals

Bootstrapping a real repository's authority; a Burokrat release; a judge library extraction;
the suite contracts library; acquire, heartbeat, fence, release or certified-publish commands;
any host change.

## Constraints

Store path `<git common dir>/module-wiki/authority.sqlite`, schema `module-wiki-authority.v5`,
identities and the `refs/module-wiki/publications/` namespace stay unchanged, so rollback by
revert keeps every accepted identity. Fleet lease, release lease and heavy lock stay separate.
Every moved test moves with its owner; every new check carries a watched negative.

## Capabilities

### New Capabilities

- `dash-authority`: the relocated runtime admission authority and its Dash commands.

### Modified Capabilities

None.

## Domain Terms

Generation, Publication marker, Authority bootstrap and Lease —
docs/twilight-structure/CONTEXT.md.

## Decisions Recorded

ADR 0048 (slice S6) records the kept on-disk identity with refused absence; ADR 0021 remains
controlling for the shared Git admission authority.

## Impact

Burokrat loses `admission/` and the `submit-admission` command; Dash gains `authority/`, four
commands and the judge alias; `tsconfig.base.json`, Dash's lint policy, the devsync oracles and
the namespacing handoff digest change. The published Burokrat 0.1.0 binary can still create a
v5 store until a later release drops the command.
