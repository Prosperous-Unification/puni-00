import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

/**
 * The repository root, which is where this config has to be run from.
 *
 * Relative paths in a Playwright config resolve against the config file for
 * some options and against the process's working directory for others — and
 * `webServer.cwd` is the second kind, which is the one that decides which
 * `.env` three servers read. Rather than guess, the working directory is
 * pinned: `bun run e2e` and `nx run fe-01:e2e` both run from the workspace
 * root, and anything else is refused here instead of starting a stack against
 * the wrong directory and failing forty seconds later on a signup 502.
 */
const repoRoot = process.cwd();
if (!existsSync(join(repoRoot, 'apps', 'fe-01', 'playwright.config.ts'))) {
  throw new Error(
    `The layout gate must be run from the workspace root; this is ${repoRoot}. ` +
      `Use \`bun run e2e\` (or \`nx run fe-01:e2e\`), never \`bunx playwright test\` ` +
      `from inside apps/fe-01 — the three dev servers are started relative to this path.`,
  );
}

const isCi = process.env['CI'] !== undefined;

/**
 * How far this run moves its three servers off 3100/3200/4200, from
 * `E2E_PORT_SHIFT`.
 *
 * The gate wants the ports to itself — `LLM_README.md`'s landmine is 66 tests
 * passing green against a `bun run dev` from another checkout — and a developer
 * wants their dev server to stay up. A shift gives both: `E2E_PORT_SHIFT=800`
 * runs the whole stack on 3900/4000/5000 beside a dev server holding the usual
 * three. Parallel worktrees each take a shift of their own.
 *
 * A shifted run **never** reuses a listening server (see {@link server}): the
 * shift exists precisely because something else is already up, and reuse is the
 * exact fault it is avoiding.
 *
 * @throws When `E2E_PORT_SHIFT` is set to anything but a whole number in
 * `0..40000`. A shift that silently read as `0` would start the gate on the
 * dev server's own ports, which is the failure this variable exists to prevent
 * (`AGENTS.md` R5: unknown is not OK).
 */
function readPortShift(): number {
  const asked = process.env['E2E_PORT_SHIFT'];
  if (asked === undefined || asked === '') return 0;
  const shift = Number(asked);
  if (!Number.isInteger(shift) || shift < 0 || shift > 40_000) {
    throw new Error(
      `E2E_PORT_SHIFT must be a whole number of ports between 0 and 40000; got ${asked}. ` +
        `It moves be-01/gw-01/fe-01 off 3100/3200/4200 together — 800 puts them on ` +
        `3900/4000/5000.`,
    );
  }
  return shift;
}

const portShift = readPortShift();
const bePort = 3100 + portShift;
const gwPort = 3200 + portShift;
const fePort = 4200 + portShift;

/**
 * A SQLite file this run alone will ever open.
 *
 * Never `apps/be-01/local.db`. The spec signs up a throwaway account and
 * writes a plan through the UI, and doing that to a developer's own dev
 * database means their projects list grows a new "New project" on every run —
 * and, worse, that a fault only reproducible against *their* leftover state
 * would look like a gate that fails for one person. `tmp/` is gitignored, and
 * so is `*.db`.
 */
const runDatabase = join(repoRoot, 'tmp', `e2e-${String(Date.now())}.db`);
mkdirSync(join(repoRoot, 'tmp'), { recursive: true });

/**
 * One of the three servers under test, started from its own directory.
 *
 * `cwd` is load-bearing rather than tidy: bun reads the `.env` beside the
 * process's working directory, which is how each app gets its secrets, its
 * port, and — for gw-01 and be-01 — the shared signing key they have to agree
 * on. `env` here still wins over that file: a variable already in the
 * environment is not overwritten by a `.env` (checked against bun 1.3.14),
 * which is what makes the database override below effective.
 */
const server = (app: string, command: string, url: string, env?: Record<string, string>) => ({
  command,
  cwd: join(repoRoot, 'apps', app),
  url,
  env,
  // Fresh state in CI, and a running `bun run dev` reused locally. Playwright
  // waits for 2xx/3xx here, so be-01's 503 `{status:"migrating"}` and gw-01's
  // 503 `{status:"backend_unhealthy"}` both read as "not ready yet" rather
  // than as a server that is up — which is the whole reason all three URLs are
  // waited on instead of only Vite's. A signup against a be-01 that has not
  // migrated is a 500 the spec would report as a broken table.
  //
  // A shifted run never reuses: `E2E_PORT_SHIFT` is asked for *because*
  // something else holds the default ports, so anything already listening on a
  // shifted one is another gate's stack rather than this checkout's.
  reuseExistingServer: !isCi && portShift === 0,
  timeout: 120_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
});

export default defineConfig({
  testDir: './e2e',
  // Named explicitly because CI uploads this exact path as the run's artifact,
  // and the screenshot the widths are judged from is written into it.
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  // Zero, deliberately. `.github/workflows/ci.yml` rules a retry out of the
  // gate for a reason that applies here twice over: a layout check people
  // re-run until it is green is a check that cannot fail wearing a different
  // hat. A flake in this spec is a bug in this spec.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCi
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://localhost:${String(fePort)}`,
    // The browser's region, pinned, because two checks in `keyboard.spec.ts`
    // type a date into a native `<input type="date">` digit by digit and the
    // field's segment order is the locale's. `05202026` is 20 May 2026 only
    // where the order is month-day-year; on an `en-UA` host Chrome renders
    // `dd.mm.yyyy` and the same keystrokes save 2026-02-05, so both cases fail
    // for the tester's region rather than for the code. Measured on a
    // developer's Mac, 2026-08-29: 203 passed / 3 failed, two of them these.
    //
    // `en-US` and not the host's, deliberately: this gate is a contract about
    // what the application draws, and a contract that means something different
    // per tester is not one. A check that a reader's own region is honoured
    // would be a different test, and it does not exist yet.
    locale: 'en-US',
    timezoneId: 'UTC',
    // Both of these are for determinism generally. **Neither fixes the two
    // date-typing cases in `keyboard.spec.ts`, and that was measured, not
    // assumed.** On an `en_UA` host those two type `05202026` into a native
    // `<input type="date">` and save `2026-02-05` instead of `2026-05-20`,
    // because Chrome renders the control's segment order from something
    // neither `locale` nor `--lang=en-US` reaches — both were tried, and both
    // left the pair failing identically (2 failed | 16 passed).
    //
    // So those two remain red on a non-US host and green in CI. The real fix is
    // in the tests, not here: an assertion about *chords* should not depend on
    // the order a browser draws date segments in. Until one of them stops
    // typing digits into a native control, treat that pair as environmental.
    launchOptions: { args: ['--lang=en-US'] },
    screenshot: 'only-on-failure',
    // Keep the diagnostic trace when a check fails, but do not archive a trace
    // for every passing layout assertion. With 194 passing checks, `on` made
    // the CI artifact about 540 MB and its upload dominated the job runtime.
    trace: 'retain-on-failure',
    video: 'off',
  },
  // Chromium only. One engine that can lay a table out is the whole ask; three
  // would be three times the runtime for a check about this application's
  // geometry rather than about browser differences.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // After the spread, not in the top-level `use`: a project's options
        // win over the file's, and `Desktop Chrome` carries a 1280x720
        // viewport of its own that would silently replace this one.
        //
        // The default for tests that do not care, and the screenshot the
        // widths are judged by. Since 2026-08-08 the table is `width: 100%`
        // with a minimum of about 1106px for a two-role plan, so nothing
        // scrolls sideways here at all — the tests that need a scrolling frame
        // set their own narrow viewport, and the matrix sets 1280 and 1512.
        viewport: { width: 1400, height: 900 },
      },
    },
  ],
  // Every port below is {@link portShift}ed together, and each server is told
  // where the other two are: be-01 mints the token gw-01 verifies, gw-01 calls
  // be-01, and Vite proxies `/api/*` and `/ws` to both. Miss one and the stack
  // starts on the shifted ports while pointing at the unshifted ones — which is
  // a gate talking to whatever dev server happens to be up.
  webServer: [
    server('be-01', 'bun src/main.ts', `http://localhost:${String(bePort)}/health`, {
      PORT: String(bePort),
      GW_URL: `http://localhost:${String(gwPort)}`,
      DB_PATH: runDatabase,
      // Stated rather than inherited from `.env.example`: this file is brand
      // new, so it holds no schema at all, and a developer who turned startup
      // migration off locally would otherwise get a stack that boots and 500s
      // on the first write.
      MIGRATE_ON_STARTUP: 'true',
    }),
    server('gw-01', 'bun src/main.ts', `http://localhost:${String(gwPort)}/health`, {
      PORT: String(gwPort),
      BE_URL: `http://localhost:${String(bePort)}`,
    }),
    // `--strictPort` so a busy port is a refusal rather than Vite quietly
    // taking the next one — the served app would then be on a port nothing in
    // this file is looking at, and `baseURL` would reach the other server.
    // The `VITE_*` three are read by `vite.config.ts`'s `edgeRoutes` through
    // `loadEnv`, which prefers a process variable over the `.env` beside it.
    server(
      'fe-01',
      `bunx vite --port ${String(fePort)} --strictPort`,
      `http://localhost:${String(fePort)}`,
      {
        VITE_BE_URL: `http://localhost:${String(bePort)}`,
        VITE_GW_URL: `http://localhost:${String(gwPort)}`,
        VITE_WS_URL: `ws://localhost:${String(gwPort)}/ws`,
      },
    ),
  ],
});
