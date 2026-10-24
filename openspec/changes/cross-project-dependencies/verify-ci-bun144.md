# Bun 1.4.4 CI workspace repair evidence

Base: `2c18bb67beec39cae548292f93f59d20c11a09ce`. This packet repairs the observed CI 767 workspace failures in fixtures, declared inputs, and tool provisioning. It does not change production admission or authentication.

## Diagnoses and changes

- The MCP document-stage fixture split on `FROM oven/bun:1.4.2-alpine AS runtime`; both Dockerfiles use 1.4.4. The split therefore included runtime `COPY --from=deps` and tried to copy a host path named `--from=deps`. The fixture now stops at the next runtime stage, independent of its Bun patch version.
- `tool-remote-scripts:test` reads installed `node_modules/nx/dist/src` through `source-dev-inputs.test.ts`, which the workspace target had not declared. The exact path is now an input; the outside-read scan remains intact.
- The native image fixture previously ran a shell as the runner's UID while its fake passwd entry and production image command required UID 1000. It now runs real shell, `id`, `getent`, and Bun under a bubblewrap UID/GID 1000 user namespace with a fixture passwd file. The production image command is unchanged.
- The migration subprocess fixture likewise now maps bubblewrap's inner UID/GID to 1000. CI's workspace provisioning now installs and executes BusyBox, the binary the image-shaped fixture invokes. The native preflight and refusal assertions are unchanged.
- The shared-store revocation case uses two real sibling Bun processes. On CI it reached 10.072 seconds against a 10-second default; local runs at this base took 6.70 and 8.66 seconds for the case. Each sibling now has an 8-second kill signal, with exact zero exit and stderr checks, and the case declares a 25-second budget. The old pair, revocation, and unrelated-credential assertions are unchanged.
- The bundled peer negative cases exited 1 on CI, while source cases passed. CI did not capture the child's stderr. The assertion now reports stderr on failure without accepting another exit or error. Forty local repetitions of the three bundled cases all passed; the CI cause remains unproved.
- CI's unnamed 11.37-second hook timeout followed `edge-policy.test.ts`. That file has no local hooks; the test preload registers process-root cleanup in `afterAll`. The file with preload passed locally in 1.38 seconds. A full-suite cleanup cause remains unproved, so no timeout or cleanup behavior was changed.

## Local commands and outcomes

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, 1801 installs checked.
- `BUN_TMPDIR=/tmp bun test apps/wbs/mcp-01/src/startup-document.test.ts --test-name-pattern 'Docker document stage' --timeout=10000`: 1 pass. Deleting the emitter `COPY` from the actual MCP Dockerfile made it fail with `Module not found`; restored and passed.
- `BUN_TMPDIR=/tmp NX_ISOLATE_PLUGINS=false bun test tools/tool-devsync/src/workspace-targets.test.ts --test-name-pattern 'names every file a suite reads'`: 1 pass. Omitting the Nx input made it fail naming `node_modules/nx/dist/src`; restored and passed.
- `BUN_TMPDIR=/tmp bun test tools/tool-devsync/src/toolchain-pins.test.ts --test-name-pattern 'provisions usable bubblewrap'`: 1 pass. Removing BusyBox from the CI install command made the test fail; restored.
- Under an outer bubblewrap namespace with UID/GID 1001, the four source native image/homedir cases passed after restoration. Injecting inner UID 1001 made the native image config probe refuse; restoring UID 1000 passed. This exercises the runner identity difference without canned `id` output.
- `BUN_TMPDIR=/tmp bun test tools/tool-remote-scripts/src/lib/source-dev-inputs.test.ts --timeout=10000` outside the sandbox: 55 pass, 430 assertions.
- Under the same outer UID/GID 1001 namespace, all 16 migration subprocess tests passed. Removing the inner UID/GID mapping made the pinned Bun scanner positive exit 1; restoring the mapping passed all 16.
- `BUN_TMPDIR=/tmp bun test apps/wbs/be-01/src/controller/organization-selection.controller.db.test.ts --test-name-pattern 'a committed revocation refuses' --timeout=10000` outside the sandbox: 1 pass, 14 assertions, 8.66-second case. The sandboxed run was invalidated by an `EPERM` on the sibling reader's write.
- `BUN_TMPDIR=/tmp bun test tools/tool-remote-scripts/src/lib/edge-policy.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000`: 31 pass.
- The three bundled peer process cases passed 40 consecutive local runs with their exact exit, no stderr, server refusal, and no-run assertions.
- Targeted Prettier check, targeted ESLint, `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json`, and `bunx tsc --build --force apps/wbs/be-01/tsconfig.json apps/wbs/mcp-01/tsconfig.json`: exit 0.

## Limits

No Docker, SSH, host gate, or full CI run was performed in this repair worktree. The CI bundled peer close failure and unnamed cleanup timeout remain unresolved pending a reproduction with child stderr and cleanup timing. Mainline integration and the canonical h2puni gate are owned by the parent lane.

## Release configuration matrix repair (2026-10-24)

The two per-tier missing-key and invalid-value process loops in `docker.test.ts` now use one real Bun child per tier. Each child imports the unchanged BE `loadConfig` and OIDC options, or GW `loadConfig`, once; it calls them on fresh per-row environments. The exact previous demanded-key and invalid-value rows remain, with separately indexed IDs, production preflight messages, three admitted controls, and the existing independent cold-import and production local-mode refusal cases. The existing 120-second aggregate allowance remains; child timeout is 100 seconds with bounded stdout/stderr. No product code changed.

The combined BE/GW matrix and fresh controls passed in the 18-case focused suite: 18 pass, 0 fail, 109 assertions, 90.85 seconds. BE combined matrix was 3.70 seconds, GW 0.21 seconds. The former value-shape-only local case measured 79.84 seconds; these local measurements do not establish hosted timing. The actual emitted child fault tests passed for missing, duplicate, extra, reordered/wrong-index, wrong-ID, wrong-tier and unknown-status rows, malformed output, stderr, nonzero exit after valid JSON, timeout, output overflow, non-Error throw, and import/manifest errors. Reverse/mixed row order retained verdicts.

Watched omissions of parent exit, stderr, tier, indexed ID, outcome, deadline, and output allowance guards each made a corresponding focused case RED before restoration. Actual child omission of BE/GW loaders or BE OIDC options, and blanket refusal, each made a named matrix assertion RED. Bun 1.4.4 sometimes kills an oversized child and sometimes returns truncated stdout with exit 0; both paths are now rejected. Targeted Prettier, ESLint and forced `tool-remote-scripts` TypeScript build exited 0. Normal hooks run on the commit below.

## MCP document clone closure repair (2026-10-24)

The CI `tool-devsync` test failed in its cloned fixture's real `wbs-mcp-01:prepare` beforeAll: `delivery-shapes.ts` imported `@shared/delivery`, but the source roster omitted `libs/shared/domain/delivery`. The same unmodified failure reproduced locally. The clone now copies that library's `src` and `tsconfig.json`. `tool-devsync:test` already declares `{workspaceRoot}/**/*` and `^production`; `wbs-mcp-01:prepare` is uncached, so no target input declaration needed changing.

The Git-reset watch matrix now edits both a shared-delivery runtime file and its alias configuration and proves `sync` restarts the supervisor and reruns actual Nx preparation. `RESTART_PATHS` includes these two read-once inputs. All 66 focused `mcp-document-sync` and `sync` cases passed with 246 assertions. Removing the new source copy reproduced the exact `Cannot find module '@shared/delivery'` prepare failure. Omitting either new restart entry made its case RED with `watchers pick it up, nothing restarted`; restoration passed. Targeted Prettier, ESLint and forced `tool-devsync` TypeScript build passed. No Docker daemon was contacted.
