/**
 * Paths whose change a running dev environment cannot pick up by itself.
 *
 * - `bun.lock` -- `bun install` cannot run inside a live watcher.
 * - `apps/wbs/be-01/drizzle` -- migrations are not imported by any watched module,
 *   so `bun --watch` never sees them. be-01 migrates at boot in dev
 *   (MIGRATE_ON_STARTUP=true) and reports migrationsApplied=true either way,
 *   so a missed restart means new code on an old schema, reported healthy.
 * - `package.json`, `nx.json`, `apps/wbs/<tier>/project.json` -- the Nx supervisor
 *   reads the serve targets once, at startup. A changed port, command or
 *   project list leaves the old topology running while HEAD moves on.
 * - MCP OpenAPI emitter, contracts and validation sources/configs -- source
 *   serve prepares the required document once per supervisor start; Bun's
 *   runtime watcher no longer imports the HTTP registry or its validation.
 * - `apps/wbs/fe-01/vite.config.ts` -- Vite reloads app code, not its own config.
 *
 * Not covered, deliberately, because they need more than a restart: the
 * Dockerfile and compose.yml (rebuild/recreate), and the gitignored per-tier
 * .env files (not in git at all). Both are called out in LLM_README.md.
 */
export const RESTART_PATHS: readonly string[] = [
  'bun.lock',
  'package.json',
  'nx.json',
  'apps/wbs/be-01/drizzle',
  // MCP reads a prepared document rather than importing these sources. Only a
  // supervisor restart reruns its uncached Nx prepare dependency.
  // Proof: independently omitting each source/config entry made the real Git-reset
  // sync regression skip restart and MCP preparation (0/1 per fault).
  'libs/wbs/domain/contracts/src',
  // Proof: c31-integration-b-restart-permission-source; injected remove 'libs/wbs/domain/domain/src/access-role.ts', from restart inputs failed `permission vocabulary edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'libs/wbs/domain/domain/src/access-role.ts',
  // Proof: c31-integration-b-restart-permission-config; injected remove 'libs/wbs/domain/domain/tsconfig.json', from restart inputs failed `permission aliases edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'libs/wbs/domain/domain/tsconfig.json',
  'apps/wbs/be-01/src/openapi',
  'libs/wbs/domain/validation/src',
  'libs/shared/domain/validation/src',
  // Proof: omitting either shared-delivery entry made its real Git-reset
  // MCP document case report "watchers pick it up" without rerunning prepare.
  'libs/shared/domain/delivery/src',
  'libs/wbs/domain/contracts/tsconfig.json',
  'libs/wbs/domain/validation/tsconfig.json',
  'libs/shared/domain/validation/tsconfig.json',
  'libs/shared/domain/delivery/tsconfig.json',
  // Proof: c31-integration-b-restart-puni-manifest; injected remove 'apps/puni/cli/project.json', from restart inputs failed `PUNI manifest edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'apps/puni/cli/project.json',
  'apps/wbs/be-01/project.json',
  'apps/wbs/gw-01/project.json',
  'apps/wbs/fe-01/project.json',
  'apps/wbs/mcp-01/project.json',
  'apps/website/be-01/project.json',
  'apps/website/fe-01/project.json',
  // Twilight Burokrat's CLI has no serve target, but it is an app on disk and `sync.test.ts`
  // walks apps rather than trusting this list; a manifest the supervisor's project
  // graph reads at startup belongs here either way.
  // Proof: omitting it failed `names every app project.json, which the supervisor reads once
  // at startup` on `Expected to contain:
  // "apps/twilight-structure/twilight-burokrat/cli/project.json"` (2026-09-25).
  'apps/twilight-structure/twilight-burokrat/cli/project.json',
  // Proof: omitting it failed `names every app project.json, which the supervisor reads once at
  // startup` on `Expected to contain: "apps/twilight-structure/twilight-dash/cli/project.json"`
  // (2026-10-11).
  'apps/twilight-structure/twilight-dash/cli/project.json',
  // Proof: omitting it failed `names every app project.json, which the supervisor reads once at
  // startup` on `Expected to contain: "apps/twilight-structure/twilight-navigator/cli/project.json"`
  // (2026-10-11).
  'apps/twilight-structure/twilight-navigator/cli/project.json',
  'apps/wbs/fe-01/vite.config.ts',
  // TypeScript config is read once, at process start. A moved path alias
  // resolves against the old mapping in three already-running processes while
  // HEAD says otherwise, which presents as an import that exists in the editor
  // and not at runtime.
  'tsconfig.base.json',
  // Proof: c31-integration-b-restart-puni-config; injected remove 'apps/puni/cli/tsconfig.json', from restart inputs failed `PUNI aliases edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'apps/puni/cli/tsconfig.json',
  'apps/wbs/be-01/tsconfig.json',
  'apps/wbs/gw-01/tsconfig.json',
  'apps/wbs/fe-01/tsconfig.json',
  'apps/wbs/mcp-01/tsconfig.json',
  'apps/website/be-01/tsconfig.json',
  'apps/website/fe-01/tsconfig.json',
  // Proof: omitting this entry failed `names every app tsconfig, which is read once at process
  // start` on `Expected to contain:
  // "apps/twilight-structure/twilight-burokrat/cli/tsconfig.json"` (2026-09-25).
  'apps/twilight-structure/twilight-burokrat/cli/tsconfig.json',
  // Proof: omitting this entry failed `names every app tsconfig, which is read once at process
  // start` on `Expected to contain: "apps/twilight-structure/twilight-dash/cli/tsconfig.json"`
  // (2026-10-11).
  'apps/twilight-structure/twilight-dash/cli/tsconfig.json',
  // Proof: omitting this entry failed `names every app tsconfig, which is read once at process
  // start` on `Expected to contain: "apps/twilight-structure/twilight-navigator/cli/tsconfig.json"`
  // (2026-10-11).
  'apps/twilight-structure/twilight-navigator/cli/tsconfig.json',
  // A library's project.json can change what its serve-time build resolves to,
  // and the Nx supervisor read the project graph at startup like the rest.
  // Listed per library rather than as `libs`, which would restart on every
  // source edit and defeat the watchers. `sync.test.ts` fails if a library on
  // disk is missing from this list, so adding one cannot silently skip it.
  'libs/wbs/adapters/auth/project.json',
  'libs/wbs/adapters/config/project.json',
  'libs/wbs/application/conformance/project.json',
  'libs/wbs/domain/contracts/project.json',
  // Proof: restoring the pre-move nested path failed `names every library project.json`
  // on the namespaced solver-supervisor-protocol manifest.
  'libs/wbs/adapters/solver-supervisor-protocol/project.json',
  'libs/wbs/application/core/project.json',
  'libs/wbs/domain/domain/project.json',
  'libs/wbs/adapters/observability/project.json',
  'libs/wbs/adapters/realtime/project.json',
  // Proof: restoring the pre-move entry failed `names every library project.json that exists on disk`
  // on the namespaced runtime-portable manifest.
  'libs/wbs/adapters/runtime-portable/project.json',
  'libs/wbs/adapters/store-memory/project.json',
  // Proof: recursive project discovery first failed the restart coverage test
  // on conformance, then store-memory, then store-sqlite as each preceding
  // omission was restored. Watched 2026-09-10.
  'libs/wbs/adapters/store-sqlite/project.json',
  'libs/wbs/domain/validation/project.json',
  'libs/wbs/adapters/solver-py/project.json',
  // Proof: omitting this entry after creating the project failed `names every
  // library project.json that exists on disk` with `Expected to contain:
  // "libs/shared/domain/validation/project.json"` (2026-09-15).
  // Proof: omitting the failures manifest failed `names every library project.json that exists
  // on disk` with `Expected to contain: "libs/shared/domain/failures/project.json"` (2026-09-20).
  'libs/shared/domain/failures/project.json',
  // Proof: the library-manifest coverage test failed on this exact missing path
  // when the test-evidence project entered the candidate tree.
  'libs/shared/domain/test-evidence/project.json',
  'libs/shared/domain/test-levels/project.json',
  // Proof: CI run 36312821466 failed RESTART_PATHS coverage when the new portable
  // project manifests were omitted from the supervisor's startup fingerprint.
  'libs/shared/domain/portability-format/project.json',
  'libs/shared/domain/validation/project.json',
  // Proof: after restoring the adapter manifest, omitting this entry failed
  // `names every library project.json that exists on disk` on this exact domain manifest
  // (2026-10-23).
  'libs/shared/domain/delivery/project.json',
  // Proof: omitting this entry failed `names every library project.json that exists on disk`
  // with this exact missing adapter manifest (2026-10-23).
  // Proof: c31-integration-b-restart-startup-manifest; injected remove 'libs/shared/adapters/bun-startup/project.json', from restart inputs failed `Bun startup manifest edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'libs/shared/adapters/bun-output/project.json',
  'libs/shared/adapters/bun-startup/project.json',
  'libs/shared/adapters/delivery-github/project.json',
  // Proof: c31-integration-b-restart-lock-manifest; injected remove 'libs/shared/adapters/heavy-lock/project.json', from restart inputs failed `native lock manifest edits restart the dev supervisor and rerun MCP preparation`; restoration passed. First RED assertion is absent MCP producer output after real Git reset. Later Docker/artifact assertions are not reached; scheduling only.
  'libs/shared/adapters/heavy-lock/project.json',
  // Proof: CI run 39513645384 (job gate workspace) failed `names every library project.json
  // that exists on disk` when the two design-system kit manifests were omitted.
  'libs/shared/adapters/ui-core-01/project.json',
  'libs/shared/adapters/ui-saas-01/project.json',
  // Proof: omitting this manifest failed `names every library project.json that exists on disk`
  // with this exact analytics path (2026-10-26).
  'libs/website/adapters/analytics/project.json',
  'libs/website/adapters/portability-fixture/project.json',
  'libs/website/adapters/store-sqlite/project.json',
  'libs/website/domain/contracts/project.json',
];

export type Fingerprint = Record<string, string>;

/**
 * Whether the container must be restarted after a pull.
 *
 * Any difference across the manifest counts, including a path that appeared,
 * disappeared, or could not be hashed. Inferring "nothing to do" from missing
 * evidence is how dev ends up serving against a stale schema with no symptom
 * other than behaviour that does not match the code.
 */
export function needsRestart(before: Fingerprint, after: Fingerprint): boolean {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const p of paths) {
    const b = before[p];
    const a = after[p];
    if (!b || !a) return true;
    if (b !== a) return true;
  }
  return false;
}
