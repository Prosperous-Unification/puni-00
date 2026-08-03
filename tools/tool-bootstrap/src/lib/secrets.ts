/**
 * `REGISTRY_PASS`'s env var name, as a constant rather than a repeated
 * string literal — used both to read it (`requireRegistryPassword`) and to
 * name it in `push.ts`'s `buildPlan` (which must know the KEY without ever
 * touching the VALUE, so it stays testable without a real secret).
 *
 * Not imported from `tools/tool-dagger/src/main.ts`, which defines the same
 * shape (`requireRegistryPassword(env)`) for the exact same env var: that
 * project has no `@wbs/*` public entry point, matching the reasoning
 * `tools/tool-deploy/src/deploy.ts` and `tools/tool-remote-scripts/src/install.ts`
 * already give for duplicating small cross-project constants instead of
 * adding one.
 */
export const REGISTRY_PASS_ENV_VAR = 'REGISTRY_PASS';

/**
 * Reads the registry password from the environment, failing loudly rather
 * than letting `push.ts` silently pipe an empty/undefined value into
 * `configure.sh`'s `docker login`. Checked once, before any host is touched
 * — design decision 10's "abort before anything starts" shape, reused here.
 */
export function requireRegistryPassword(env: NodeJS.ProcessEnv): string {
  const pass = env[REGISTRY_PASS_ENV_VAR];
  if (pass === undefined || pass === '') {
    throw new Error(
      `${REGISTRY_PASS_ENV_VAR} must be set to authenticate configure.sh's docker login — refusing to provision without it`,
    );
  }
  return pass;
}
