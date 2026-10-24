import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

/**
 * What the production entrypoint can execute, asked of the entrypoint rather
 * than of a reader.
 *
 * `apps/wbs/be-01/Dockerfile` runs `bun run src/main.ts`, so the code a production
 * process can reach is exactly `main.ts`'s import graph. Bundling that graph
 * and reading it is therefore not a proxy for the artifact — it IS the
 * reachable module set, and the only thing the image adds is files that nothing
 * imports.
 *
 * The claim under test is the one the local-solver profile rests on: selection
 * is structural. There is no environment variable that turns a local Python
 * spawn on inside `main.ts`; the two entrypoints are different files, and this
 * is what stops that from being an argument rather than a check.
 */
const REPO_ROOT = new URL('../../../..', import.meta.url).pathname;

/**
 * Bundled through the CLI rather than `Bun.build`, and from the repo root.
 *
 * The workspace's `@wbs/*` specifiers are tsconfig paths, which the programmatic
 * builder does not resolve from a test's own directory — it failed with
 * `Could not resolve: "@wbs/domain"` and would have reported an empty graph as
 * a clean one. This is the same command `be-01:build` runs, without `--outdir`,
 * so nothing stale on disk can answer for a source tree that changed.
 */
function productionGraph(): string {
  const built = Bun.spawnSync({
    cmd: ['bun', 'build', 'apps/wbs/be-01/src/main.ts', '--target=bun'],
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (built.exitCode !== 0) {
    throw new Error(`bundling the production entrypoint failed: ${built.stderr.toString()}`);
  }
  const graph = built.stdout.toString();
  // A build that emitted nothing would make every `not.toContain` below pass.
  if (graph.length < 100_000) {
    throw new Error(`the production bundle is implausibly small: ${String(graph.length)} bytes`);
  }
  return graph;
}

/**
 * Strings only the local solver defines, so a hit is a hit on that module
 * rather than on a word that happens to be common: the capability record's
 * discriminator, one of the absences it reports, the factory's name, and the
 * dev entrypoint's own refusal sentence.
 */
const LOCAL_SOLVER_MARKERS = [
  'local-solver',
  'no-immediate-termination',
  'createLocalSolverSpawner',
  'no solver environment at',
] as const;

describe('the production entrypoint', () => {
  /**
   * Every marker here is a string only the local solver defines, so a hit is a
   * hit on that module rather than on a word that happens to be common.
   *
   * Proof: giving `main.ts` the env-var selection this design exists to make
   * unspellable — `process.env['WBS_LOCAL_SOLVER'] === 'true' ?
   * createLocalSolverSpawner(...) : solverSupervisorSpawner(...)` — failed this
   * case with `Received + 5`, listing `local-solver`,
   * `no-immediate-termination` and `createLocalSolverSpawner`. The fourth
   * marker stayed absent because that injection imports the spawner without the
   * dev entrypoint, which is the narrower and more likely leak.
   */
  it('cannot reach the local solver', () => {
    const graph = productionGraph();
    // Asserted as the list of markers FOUND rather than with `not.toContain`,
    // which on failure prints the whole 2.7MB bundle and buries the one fact
    // the reader needs.
    expect(LOCAL_SOLVER_MARKERS.filter((marker) => graph.includes(marker))).toEqual([]);
  });

  /**
   * The negative's other half: the marker strings are only absent because the
   * module is unreachable, not because they were never spellable. A test whose
   * markers had been renamed away would pass for ever while the spawner sat in
   * the graph under new names.
   */
  it('does reach the supervisor spawner it is supposed to use', () => {
    const graph = productionGraph();
    expect(graph).toContain('solverSupervisorSpawner');
    expect(graph).toContain('/run/wbs-solver/supervisor.sock');
  });

  /**
   * The development server that activates an organization with fixture
   * secrets (`dev/activated-organization-server.ts`) is a separate file for
   * the same reason the local solver is; `.dockerignore` keeps `src/dev` out
   * of the image as well.
   *
   * Proof: importing that file from `main.ts` failed this case, listing both
   * markers; watched 2026-10-24.
   */
  it('cannot reach the activated organization development server', () => {
    const graph = productionGraph();
    expect(
      ['activated organization server (development only)', 'serveActivatedOrganization'].filter(
        (marker) => graph.includes(marker),
      ),
    ).toEqual([]);
  });

  /**
   * `.dockerignore` keeps `src/testing` and `src/dev` out of the image, which
   * holds only while nothing the image runs imports them: `main.ts`, the
   * `src/*-cli.ts` commands the runbooks `docker exec`, and the
   * `scripts/solver-supervisor-*-client.ts` clients that `solver-image-smoke.sh`
   * and `optimization-orphan.proc.db.test.ts` run inside the image. Each bundle
   * carries a `// <path>` comment per module, so a reached module is named.
   *
   * Proof: importing `testing/auth-fixture` from `main.ts` failed this case,
   * naming `apps/wbs/be-01/src/main.js`; watched 2026-10-25.
   * Proof: importing `../src/testing/auth-fixture` from
   * `solver-supervisor-orphan-client.ts`, which the earlier fixed list missed,
   * failed it naming that client; watched 2026-10-25.
   * Proof: importing `./dev/local-solver-spawner` from `main.ts` failed it
   * naming `apps/wbs/be-01/src/main.js`; watched 2026-10-25.
   */
  it('runs nothing from src/testing or src/dev, which the image leaves out', () => {
    const appRoot = 'apps/wbs/be-01';
    const solverClients = readdirSync(join(REPO_ROOT, appRoot, 'scripts'))
      .filter((name) => /^solver-supervisor-.+-client\.ts$/.test(name))
      .map((name) => `${appRoot}/scripts/${name}`);
    // The image and orphan clients both run in the image; a renamed pattern
    // that matched neither would quietly drop them from the guard.
    expect(solverClients.length).toBeGreaterThanOrEqual(2);
    const entrypoints = [
      `${appRoot}/src/main.ts`,
      ...readdirSync(join(REPO_ROOT, appRoot, 'src'))
        .filter((name) => name.endsWith('-cli.ts'))
        .map((name) => `${appRoot}/src/${name}`),
      ...solverClients,
    ];
    const outdir = mkdtempSync(join(tmpdir(), 'wbs-production-graph-'));
    try {
      const built = Bun.spawnSync({
        cmd: ['bun', 'build', ...entrypoints, '--target=bun', `--outdir=${outdir}`],
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (built.exitCode !== 0) {
        throw new Error(`bundling the image entrypoints failed: ${built.stderr.toString()}`);
      }
      const bundles = readdirSync(outdir, { recursive: true, encoding: 'utf8' }).filter((name) =>
        name.endsWith('.js'),
      );
      // An empty output directory would make the list below pass.
      expect(bundles).toHaveLength(entrypoints.length);
      const excluded = [`// ${appRoot}/src/testing/`, `// ${appRoot}/src/dev/`];
      expect(
        bundles.filter((name) => {
          const bundle = readFileSync(join(outdir, name), 'utf8');
          return excluded.some((marker) => bundle.includes(marker));
        }),
      ).toEqual([]);
    } finally {
      rmSync(outdir, { recursive: true, force: true });
    }
  });
});
