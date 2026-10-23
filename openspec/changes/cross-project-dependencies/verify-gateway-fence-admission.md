# Bounded gateway fence admission prerequisite (2026-10-23)

Intent: a backend-only writer barrier cannot prevent a later gateway-only or
frontend-only swap from recreating a stopped gateway. Refuse ordinary Compose
swap admission whenever separate deploy-owned gateway fence intent is retained.
This packet reads intent only; it neither creates/clears intent nor stops any
process. Physical exclusion, participant inventory, semantic activation and
live deployment remain outside this packet and parent 10.1/10.2 remain open.

Implementation: `assertNoGatewayFence` reads
`state/dependency-gateway-fence.json`. Its closed v1 grammar has exactly
`format: dependency-gateway-fence` and `version: 1`. Presence is conservative
admission refusal, never proof of exclusion. `runSwaps` reads under the existing
deploy lock before observing/planning any tier; direct `execute` reads before
phase/configuration/Docker IO. Only absent marker plus an existing readable
state directory admits ordinary execution. A future lifecycle must publish
under the same lock and independently prove physical exclusion.

## Red/green and R5

- Initial production-path red: 48 tests, 40 fail, eight absence controls pass.
  Gateway-only, frontend-only, backend-only and mixed selections reach effects
  with retained/malformed/unreadable intent or unavailable trusted state.
- Independent `runSwaps` guard removal: 32 refusal negatives fail and tier
  observation/execution proceeds under the lock. Restore.
- Independent direct `execute` guard removal: 32 refusal negatives fail and
  commit writes proceed. Restore.
- State-directory validation removal: all eight missing-root negatives fail.
  Restore.
- Unconditional retained-marker refusal removal: all eight valid-marker
  negatives fail and ordinary effects proceed. Restore.
- Accept-all read-error fault: sixteen unreadable marker/root negatives fail.
  Restore. Final suite also separately covers a permission-denied regular marker.
- Closed grammar validation removal: twenty-four extra-field/wrong-version/array
  diagnostic negatives fail (they are misclassified as valid retained intent;
  unconditional presence still refuses). Restore.
- Final focused matrix: **88 pass, zero fail**, including valid retained bytes,
  malformed JSON, extra fields, wrong version, arrays, directory-as-marker,
  permission-denied marker, missing/file/unreadable roots and absence controls.
  Command: `bun test tools/tool-remote-scripts/src/swap-gateway-fence.test.ts --preload ./tools/test/scratch/preload.ts`.
- Existing swap/writer-barrier/maintenance/migration regression run plus the
  earlier 72-case matrix: **373 pass, zero fail**, 79.35 seconds. Command:
  `bun test tools/tool-remote-scripts/src/swap-gateway-fence.test.ts tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-remote-scripts/src/swap-maintenance.db.test.ts tools/tool-remote-scripts/src/swap-migration.db.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000`.
  Existing host-IO fixtures now explicitly supply disposable trusted state roots.

## Configured checks and limits

Configured Nx `tool-remote-scripts:lint`, `:typecheck` and `:build` passed with
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; default plugin sockets are denied by
this sandbox, so plugin isolation was disabled for these scoped checks. Direct
`bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json` also exited zero.
Changed-file Prettier and diff checks are recorded with the commit packet.

Configured `tool-remote-scripts:test` was attempted and blocked at its required
`:test:caddy` prerequisite: Docker socket permission denied; image preparation
exited 1. The configured project test therefore did not run. Targeted source
checks above ran independently; no Caddy integration claim is made.

`bunx openspec validate cross-project-dependencies --json` passed with 18
warnings. Strict validation fails on those same 18 pre-existing warnings;
replacing the delta spec with its `14dc0d448` version produced byte-equivalent
issue arrays. This packet adds no validation warning. Strict integrated OpenSpec
validation remains outstanding.

No host gate, installed bundle acceptance, live process observation, physical
exclusion, marker lifecycle, activation, push or deployment was performed. The
isolated integrated exact-SHA host gate and independent review remain required.
