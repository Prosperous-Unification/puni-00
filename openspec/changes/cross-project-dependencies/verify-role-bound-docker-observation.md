# Role-bound Docker binary observation prerequisite — 2026-10-23

Isolated clone `/tmp/puni-role-observe`, exact source head
`7ec0e703542e57e18078e8c57d50ffab3700f90c`. This bounded 10.2 packet
adds `decodeRoleDependencyCapabilities` and `observeDependencyCapabilities`,
with explicit `backend | gateway | mcp` roles. Image names bind those roles to
`be | gw | mcp` before Docker. The existing backend decoder remains a backend-only
wrapper; the backend candidate/retained transport delegates independently,
including equal images. MCP is not added to the deployable `Tier` contract.

No product declaration changes: all three actual executables still advertise
empty semantics. No activation writer, participant discovery/fencing proof,
authoring grant, deployment caller or rollback expansion is added. The primitive
returns image-attributed binary semantics only. Parent 10.1/10.2 remain open.

## TDD and production-path coverage

The initial import failed for the missing observation export. A temporary throwing
observation stub then produced **2 pass / 35 fail**, with actual role observations,
wrong-tier refusals and config-free import expectations failing. Implementation
then produced **81 pass / 0 fail / 44 assertions** across
`dependency-role-observation.test.ts`, `dependency-capability.test.ts` and
`dependency-preflight.test.ts`. The final restored focused control has the same
counts (`/tmp/role-final-focused.log`).

Tests invoke actual backend, gateway and MCP executables in Bun subprocesses
through the production observation primitive. Each exact Docker argument array
asserts no networking, mount, DB_PATH or startup command. All six cross-role
pairs refuse. All six wrong-tier pairs refuse before any Docker invocation.
Each role separately exercises actual missing, unreadable, malformed, nonzero
and stalled executables; unreadability runs as non-root. Exact observations
retain requested image and semantics, distinct images retain asymmetric support,
equal backend images are called twice with different outputs, and existing
first-install coverage invokes candidate only. Actual non-backend outputs still
refuse through the backend-only decoder. A poisoned Bun loader rejects any
configuration/startup import by the observation module and verifies no unexpected
working-directory artifacts.

## Watched, individually restored faults

Each mutation ran the same three focused files. Original sources were restored
in a `finally` block before the next fault. Every run exited 1 with behavioral
assertion failures, followed by the clean 81-case control. Logs are named
`/tmp/role-mutation-<fault>.log`.

| Injected fault                                                  | Observed failing tests                                                                                                  | Pass / fail |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| `role`: remove expected-role equality                           | All six real cross-role subprocess cases, both real non-backend wrapper cases, existing backend malformed-role controls | 70 / 11     |
| `tier`: replace role/image-name comparison with false           | All six wrong-tier-before-Docker cases report missing expected rejection                                                | 75 / 6      |
| `digest`: admit mutable `:latest` references                    | All three role mutable-ref cases and existing backend mutable-ref control report missing expected rejection             | 77 / 4      |
| `image`: return `foreign-image` attribution                     | Three actual role observations, distinct/equal backend pairs, first-install and import observation equality fail        | 74 / 7      |
| `equal-dedupe`: deduplicate candidate/retained image list       | Equal backend image test receives only one observation instead of two independently observed semantics                  | 80 / 1      |
| `failure-fallback`: return empty semantics on observation error | Missing/unreadable/malformed/nonzero failures are accepted; existing malformed backend subprocess controls also fail    | 32 / 49     |
| `deadline`: replace caller deadline with a fresh 5s budget      | All three actual stalled executable cases and shared backend budget resolve instead of rejecting                        | 77 / 4      |
| `config-import`: import `./docker` from observation module      | Poisoned loader catches transitive `env.ts` import; child exit is 1 instead of 0                                        | 80 / 1      |
| `network`: replace Docker `none` with `bridge`                  | Three exact actual-role commands and existing distinct backend command trace mismatch                                   | 77 / 4      |

Adjacent production `Proof:` comments record the watched role, image, tier,
digest, independent equal-image, failure and deadline guards. Existing closed
protocol/version/key/semantic/duplicate guard proofs are preserved.

## Verification

- Focused restored control: **81 pass / 0 fail / 44 assertions**.
- Compose writer barrier/migration plus Kubernetes dependency observation/release
  workflow and focused controls: **379 pass / 0 fail / 4,593 assertions**, using
  `bun test --preload ./tools/test/scratch/preload.ts --timeout=10000` with the seven
  explicit files. Log: `/tmp/role-regressions-unrestricted.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck,build -p tool-remote-scripts --skip-nx-cache --output-style=static`: passed all configured targets and three build prerequisites.
- `bunx --no-install openspec validate cross-project-dependencies --json`: valid,
  zero errors, existing long-requirement warnings. Log: `/tmp/role-openspec-validate.json`.
- `bunx --no-install openspec validate --all --json`: all 253 changes and 18 specs passed, zero failures; warnings remain. Log: `/tmp/role-openspec-all.json`.
- Explicit changed-file Prettier check and `git diff --check`: passed.

The first sandboxed configured test attempt stopped at Caddy's Docker socket
permission denial; an approved unrestricted rerun exercises the real pinned
Caddy container. The first direct regression attempt lacked configured preload
and used Bun's 5s default: one migration case timed out, and three local fake
registry listeners hit sandbox EPERM. The configured-preload, 10s unrestricted
regression rerun passed all 379 cases; these earlier failures are not hidden.
Initial configured lint found sort ordering and unnecessary test callback async;
these were corrected before the passing configured run.

Independent review and exact integrated-SHA isolated host gate remain parent-owned
and unrun here. No push, merge or deployment was performed. No live registry image
observation, Kubernetes cluster observation or complete participant exclusion is
claimed by local subprocess and transport tests.
