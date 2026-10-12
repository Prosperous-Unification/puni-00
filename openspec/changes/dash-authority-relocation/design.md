## Context

The first 080.19 delta (`dash-local-plan-facade`) gave Twilight Dash one non-mutating command.
The runtime admission authority still lived in Burokrat's `admission/` directory beside the
judge. `attestation.ts`, which belongs to the judge, imported certification from
`integrate.ts`, whose `compose` reads the store, and `packet.ts` mixed static packet validation
with store binding; moving either file whole would have made Burokrat import Dash, which
`docs/twilight-structure/names.md` forbids. No authority store exists on any known clone and no
production caller of `submit-admission` exists; the published Burokrat 0.1.0 binary still routes
it to a store that creates itself.

## Goals / Non-Goals

Goals: one writer (Dash), one judge (Burokrat), unchanged on-disk identity, refused absence,
explicit bootstrap, a required clock, lost-response reconciliation for submission and
publication. Non-goals are in the proposal.

## Decisions

- **Split first, then move.** Slice S0 splits Burokrat's `admission/` into `admission-judge/`
  and `admission-runtime/` without behaviour change: `integrate.ts` becomes the judge's
  `integration-candidate.ts` (records, policy decoding, certification) and the runtime's
  `integration-compose.ts`; `packet.ts` becomes `packet-judgment.ts` and `packet-binding.ts`.
  The submission and claim record types move into the judge so it imports nothing from the
  runtime half. S1 then moves `admission-runtime/` whole to Dash's `authority/` keeping file
  names, so `git mv` continuity and every `Proof:` reference survive.
- **One allow-listed facade alias.** `@twilight-burokrat/judge` resolves to Burokrat's
  `judge-facade.ts`. In `@nx/eslint-plugin` the `allow` list is checked before the app-import
  rule, so an exact alias is the only way to express Dash→Burokrat without a new library; it is
  allowed for `authority/**`, `cli.ts` and tests only. `judge-facade.test.ts` pins the runtime
  export list and scans every reachable module for store, clock and network reads. A judge
  library is the later shape; the alias makes that a one-line change for Dash.
- **Records exchanged in-process.** Packets, candidate snapshots, unchecked and checked
  integration candidates and submission reports cross the facade as typed values; the
  publication marker crosses as a Git ref. Dash reserves nothing without a
  `CheckedIntegrationCandidate`.
- **Identity kept, absence refused.** Path, schema text, version string, identities and marker
  namespace are unchanged, so there is no data migration and rollback is a revert.
  `openAuthority` refuses `absent` (naming the bootstrap command) distinctly from `unreadable`,
  `legacy-store`, `not-canonical`, `corrupt`, `incompatible` and `exists`;
  `resolveAuthorityDatabasePath` stops creating the directory. `bootstrapAuthority` is the only
  creator and re-checks absence under the `.initializing` lock.
- **Clock composed once.** `AuthorityStoreOptions.clock` and `MemoryAuthorityStore`'s clock
  become required; `authority/clock.ts` is the only wall-clock read; `entrypoint.ts` composes
  it. Dash takes no `--now` flag because Dash is the tool that owns time.
- **Commands.** `bootstrap-authority`, `inspect-authority [--session]`, `submit-admission` and
  `recover-publication --integration-id`; every grammar refuses unknown or duplicate flags
  before a store opens. Acquire, heartbeat, fence, release and certified publish stay module
  functions until the control plane supplies a certifier and owner.
- **Lost responses.** An exact repeated submission returns its token without a write;
  `acquireClaims` stays strict and a lost token is read back with `inspect-authority
--session`; publication recovery is idempotent through the durable record and marker.

## Authority lifecycle concurrency model

The store is shared by every process of one common Git directory; each operation below is one
SQLite transaction or one filesystem step, and processes interleave between them.

- **States.** `absent` (no `module-wiki/authority.sqlite`); `initializing` (the
  `authority.sqlite.initializing/` lock directory exists); `present(nextGeneration, working
sessions and their claims)`.
- **Events.** `bootstrap` (mkdir the directory, take the lock, re-check absence under it, create,
  release); `open` (wait out an initializer, `lstat` the directory and file, verify schema);
  `inspect` (deferred read transaction, no write); `acquire` (immediate write transaction that
  checks session and overlap, then advances `nextGeneration`); `submit` (immediate transaction; an
  exact repeat of a committed submission writes nothing).
- **Invariants.** I1 one creator per lifetime: while absent exactly one bootstrap reports
  `bootstrapped`, every other reports `exists`. I2 absence is refused and leaves no directory.
  I3 inspection never changes the database bytes. I4 generations are consecutive and never reset.
  I5 overlapping acquisitions linearize: at most one holds an overlapping path. I6 every outcome
  is typed; `corrupt` or an untyped failure is a defect.

`authority-lifecycle.model.test.ts` checks I1–I6 with `fc.asyncModelRun` against a reference
model. Concurrent bootstraps and acquisitions run as Bun child processes. `fc.scheduler()` only
orders their spawns; a shared barrier file then releases them together, and the operating system
interleaves their transactions. The scheduler does not control that interleaving, so each
concurrent command checks every outcome a linearization allows. Five sabotages (each named in
its `Proof:`) fail it.

## Risks / Trade-offs

- The published 0.1.0 `submit-admission` can still create a v5 store; nothing on disk can fence
  it without a schema bump that would break rollback. Accepted until the next Burokrat release.
- The alias bypasses the app-import, scope and product rules for one exact specifier; the
  facade surface test and the boundaries test are its fences.
- Certification cases need a composed candidate, so after the move they run in Dash; the judge
  keeps the policy-decoding case and attestation's own suite.

## Migration Plan

S0 split (Burokrat only) → S1 move and drop Burokrat's command → S2 clock → S3 absence and
bootstrap → S4 idempotent submission → S5 recovery → S6 rollback proof, ADR and docs. Each
slice merges through the gate. No store is copied, dual-written or bootstrapped by any slice.

## Open Questions

None for S0–S3. Activation of the authority on a real repository remains slice 5.3 of
`agent-scalable-llm-wiki`.
