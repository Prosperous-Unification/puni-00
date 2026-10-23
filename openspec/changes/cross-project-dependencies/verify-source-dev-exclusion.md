# Whole source-dev exclusion source receipt

This source-only prerequisite extends task 10.2/O4. It grants no activation,
restoration, live installed-writer adoption or host authority claim. ADR 0059
continues to apply. No host operations or Compose edits were performed.

## Implemented boundary

`withSourceDevExcluded` requires the exact same live joint prod/dev owner and
SHA, captures the fixed `wbs-dev-src:1`/`dev-src` source contract, resolves the tag
to immutable image ID and independently matches inherited image entrypoint. It
binds complete effective config/argv, exact source/data/runtime mounts, private PID
namespace, network membership and process-start/restart identity. Typed null/false
init remains supported. Restart inhibition, exact-ID bounded stop and fresh
coherent terminal/PID-zero evidence precede token issuance. Terminal network
snapshots remain exact; transition identity uses stable network IDs because
Docker clears endpoint addresses on stop.

The private-symbol/WeakMap source token is callback scoped. Intent/completion are
exclusive, fsynced and byte-bound; full configuration is retained only as hashes.
New credential-bearing Docker boundary receipts retain response hashes. Every
exit retains current Docker state/evidence and expires the token after final
inspection, including failure.

Solver drain now issues a matching runtime-lock-scoped opaque token. Existing
zero-argument callback callers remain compatible. Native full inspection is
projected through the existing strict solver parser, then full Config/HostConfig,
mounts, argv and networks are captured in memory and bound by durable hashes.
The original unit/cgroup/installed tuple/cohort drain checks remain in force.

Owner-only backend audit recognition verifies source and optional solver tokens
against the **same full inventory**, independently rereads current exclusion and
recognizes only exact raw object references. Every backend before/after, restart,
stop and completion observation carries this context. Ordinary audit behavior is
unchanged; unrelated stopped mounted containers still refuse.

The explicit callable orders joint owner → both-site ingress → solver drain →
source-dev stop → prod gateway/backend fences → fresh inspections → awaited
continuation → fresh inspections → source final/expiry → solver final/expiry →
owner expiry. It never calls dev colour fences and refuses transitional dev
backend/gateway topology. The return keeps activation blocked.

## Local checks

- TDD RED: missing decoder/token APIs, absent owner audit and absent coordinator
  each failed their production-call tests before implementation. Decoder and
  live source/solver/backend composition then passed.
- `bun test tools/tool-remote-scripts/src/lib/{source-dev-cohort,source-dev-exclusion,solver-exclusion,backend-exclusion,gateway-exclusion,dependency-ingress,edge-ownership,mount-audit,solver-cohort}.test.ts --preload ./tools/test/scratch/preload.ts --timeout=60000`:
  **343 pass, 0 fail**, 2931 expectations, 9 files (17.24 seconds).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`:
  passed fresh after omission sources were restored.
- Same environment, `bunx nx run tool-remote-scripts:build --skip-nx-cache`:
  passed fresh with all four production bundles and dependencies.
- `bunx openspec validate --all --json`: 277 items, zero invalid before the final
  source-recognition delta scenarios were added; final rerun recorded below.

The Nx default socket path was unavailable in this sandbox. An initial default
Nx lint returned zero without running a target, and was discarded as evidence.
Daemon/plugin isolation was then disabled explicitly. A full lint invocation
passed before later source changes; final lint evidence is recorded below.

## Watched production omissions

[Exact omission receipts](evidence/source-dev-exclusion/omissions.txt) record the initial 24
independent injected faults, each restored immediately after its observed failure.
All initial 24 runs exited 1 with named failed tests, rather than a syntax/import error. A later transitional-member omission initially survived because its test was exercising full-ID drift; the receipt retains that exit-zero finding. The corrected test supplies the genuine source plus a distinct dev backend and now fails when the transitional guard is removed. A subsequent privacy-boundary refactor was also re-proven by removing hashing.

Source proofs cover removed restart/stop effects, removed terminal and private-PID
checks, owner comparison, token expiry, retained byte equality, inventory identity,
conflicting source membership, final inspection, tag resolution, inherited
entrypoint binding, exact mounts, network mode and inspection-response secrecy.
Solver proofs cover owner/lifetime, complete Config/mount/start/image identity,
missing/new members, retained bytes, final inspection and private PID. Removing
backend raw-reference recognition fails the owner composition success test.
Adjacent `Proof:` comments name the injected fault and observed production test.

The combined coordinator fixture keeps the retained solver attempt's real command
shape (`--tmpfs /tmp`) in the full inventory alongside stopped source, prod
managed members and running Caddy. It passes only through exact live recognition;
Caddy still runs the ordinary initialized namespace census. Separate tests retain
ordinary stopped mounted refusal and reject an unrelated stopped source-shaped
member. These are controlled IO fixtures, not actual Docker serving evidence.

## Separate review and physical acceptance

Independent architecture review is pending final source inspection. No disposable
Docker/systemd runner was executed here. Physical acceptance requires a separately
reviewed runner and explicit execution authorization. The complete source composition
requires a disposable isolated Linux host or VM with its own Docker daemon and
UID-1000 user manager/runtime: the supported source container name, image tag,
runtime bind and supervisor service are fixed and cannot be renamed into a safe
fixture on the live shared daemon. Inside that isolated host use scratch canonical
roots and source/data content running the supported command, independently pinned
copied image bytes and the canonical owner lock. Never retag or touch production's
daemon, runtime directory or installed service. It must observe
actual descendant exit/PID-zero, restart inhibition, retained solver tmpfs members,
source/solver token recognition, unrelated-container refusal and exact owned
cleanup. No actual dev/prod container or installed supervisor may be stopped by
that fixture. Full live authority/adoption audit remains separately pending user
approval; no placeholder pin or guessed live identity is acceptable.

The exact-SHA canonical host gate and CI remain unrun. Parent S1/S2/O4/10.2,
activation and compatible restoration remain open.

Final lint: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:lint --skip-nx-cache --output-style=static` passed (10.4 seconds) after directly identifying and removing one unnecessary test assertion. The earlier silent nonzero Nx lint output was a failure and supplies no passing evidence.

Final strict OpenSpec rerun: 277 items, zero invalid, including the source-recognition scenarios.

Post-commit own review added a composed environment sentinel: the fresh gateway inspector still used raw owner Docker retention. The real composed test failed before switching that inspector to hashed retention and passed afterward; reverting that call independently failed again. Source lifecycle review also added running/created/exited timestamp coherence; unfinished exits, zero-start running and finish-before-start each failed before the guard, passed afterward, and failed together when the new guard was removed. Fixtures now supply actual coherent finished timestamps. These follow-up receipts are appended to the omission record.

## Independent review corrections

Review of `fd9056faa` reproduced incomplete caller inventory recognition, malformed
inspection parser excerpts, composed Caddy environment retention, rejection of
normal restarted source state, and an in-flight recognition finishing after token
expiry. The review follow-up addresses each through the existing production paths.

Source recognition now compares the caller's complete inventory identity with an
independent fresh complete inventory, including unrelated effective configuration,
mounts and process identity. The existing backend identity projection is shared;
no ID allowlist or stopped-container exemption was introduced. Omitting an
unrelated mounted container and erasing its mounts independently fail. Retained
source equality additionally checks coherent terminal finish/exit-code drift that
the inventory projection excludes. Source/solver proof methods recheck the exact
WeakMap scope after their final await. Gated real owner IO negatives start while
live, let callback/final checks expire tokens, then release the pending inspection;
all three refuse proof after expiry.

Full source/image, solver and managed inventory JSON is decoded through a private
parser boundary that discards credential-bearing SyntaxError excerpts and causes.
Caddy Docker observations and immutable config retain hashes. Original adapted/live
and completed expected configurations retain hashes too: a secret expanded from an
environment reference can otherwise leak even when Config.Env itself is hashed.
Live configuration stays in memory for exact inspection; required authored file
snapshots remain private original bytes. The actual initialized owner exec
DONE/REAPED receipts remain unchanged and are exercised by the composition suite.

Normal running source containers may retain historical FinishedAt across restart,
as confirmed in [Moby v28.5.1's running/stopped state transitions](https://github.com/moby/moby/blob/v28.5.1/container/state.go#L249-L293).
Both decoder and whole-owner source exclusion accept coherent historical finish
while refusing future finish; terminal finish still must follow current start.
The reviewer accepted exact declared mount paths under the canonical owner root
for whole private PID namespace extinction; separate leaf realpath probes are not
needed for this bounded exclusion claim.

Fresh independent omission receipts are appended under `review-*`: complete
inventory equality, sanitized parser, Caddy config hash, Docker readback hash,
original and completed adapted configuration hashes, actual initial transitional
topology, source and solver final lifetime, running historical ordering, and
retained terminal member identity each failed the intended named test separately.
Earlier source id/start/restart-count and caller-only transitional proof receipts
are historical stages: the stronger complete-inventory guard now rejects those
caller mismatches first. Current independent proofs use actual initial dev topology
and coherent terminal finish/exit-code drift, so the guards remain separately
provable in the reviewed implementation.

Review follow-up fresh checks: the focused command above plus `docker-inspection-json.test.ts` passed **357 tests, zero failures, 3024 expectations across 10 files (22.11 seconds)**. Full uncached Nx lint (10.0 seconds), typecheck and production build passed with daemon/plugin isolation disabled. Strict OpenSpec validation passed all 277 items. Both pending lifetime methods and source terminal equality have current independent omission receipts. Final independent review of this follow-up remains separate. Normal commit hooks execute lint/format/secrets/private nesting; migration/doc-cap hooks have no matching files, and Tool Wiki reports inactive/uncertified because the external activation root is not provisioned. No canonical host gate, CI, live audit, physical runner or activation was run.
