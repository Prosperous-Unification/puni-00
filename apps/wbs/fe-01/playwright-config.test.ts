// @vitest-environment node
//
// `vite-config.test.ts`'s reason, and the same regex reads this tag: importing
// the Playwright config pulls in `@playwright/test`, and a config module has no
// DOM to test. Kept beside that file rather than under `src/` because both are
// about a config at the root of this app rather than about the app.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The workspace root, which the config under test refuses to run outside of.
 *
 * Computed from this file rather than read from `process.cwd()`: the suite is
 * launched from the workspace root today, and a test that quietly depended on
 * that would fail for the next person who runs it from `apps/wbs/fe-01`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface WebServerEntry {
  reuseExistingServer?: boolean;
  timeout?: number;
  command?: string;
  cwd?: string;
  url: string;
  env?: Record<string, string>;
}

async function loadPackagedConfig(root: string) {
  vi.resetModules();
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  const { default: config } = await import('./playwright.packaged.config');
  return config;
}

async function loadConfig(shift?: string) {
  vi.resetModules();
  if (shift === undefined) delete process.env['E2E_PORT_SHIFT'];
  else process.env['E2E_PORT_SHIFT'] = shift;
  const { default: config } = await import('./playwright.config');
  return config;
}

async function loadOrganizationConfig() {
  vi.resetModules();
  const { default: config } = await import('./playwright.organization.config');
  return config;
}

function serversOf(config: { webServer?: unknown }): WebServerEntry[] {
  const { webServer } = config;
  if (!Array.isArray(webServer)) throw new Error('the config starts no servers to assert on');
  return webServer as WebServerEntry[];
}

interface ProjectEntry {
  name?: string;
  testIgnore?: RegExp | RegExp[];
  testMatch?: RegExp | RegExp[];
  use?: { channel?: string };
}

/**
 * Loads the config with `PLAYWRIGHT_CHROMIUM_REGULAR` set or absent — the one
 * environment variable that decides whether `chromium-regular` exists in
 * `projects` at all (`playwright.config.ts`, section 4.7 of the 050-7-e plan).
 */
async function loadConfigWithChromiumRegular(set: boolean) {
  vi.resetModules();
  delete process.env['E2E_PORT_SHIFT'];
  if (set) process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = '1';
  else delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
  const { default: config } = await import('./playwright.config');
  return config;
}

function projectsOf(config: { projects?: unknown }): ProjectEntry[] {
  const { projects } = config;
  if (!Array.isArray(projects))
    throw new Error('the config declares no work packages to assert on');
  return projects as ProjectEntry[];
}

const matches = (pattern: RegExp | RegExp[] | undefined, value: string): boolean => {
  if (pattern === undefined) return false;
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  return patterns.some((one) => one.test(value));
};

function runOriginProbe(script: string, timeout: number, env: NodeJS.ProcessEnv): string {
  return execFileSync('bun', ['--no-env-file', '--eval', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    env: { PATH: process.env['PATH'], ...env },
  });
}

describe('the browser gate’s port shift', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['E2E_PORT_SHIFT'];
  });

  it('runs on the documented ports when nothing asks it to move', async () => {
    const servers = serversOf(await loadConfig());
    expect(servers.map((server) => server.url)).toEqual([
      'http://localhost:3100/_ordinary/ready',
      'http://localhost:3200/health',
      'http://localhost:4200',
    ]);
  });

  it('writes a JUnit report for the ordinary Browser suite', async () => {
    const previousCi = process.env['CI'];
    try {
      for (const ci of [false, true]) {
        if (ci) process.env['CI'] = '1';
        else delete process.env['CI'];
        // Proof: removing the ordinary JUnit reporter from each branch separately made this
        // case fail on the local and CI configurations, respectively (2026-10-09).
        expect((await loadConfig()).reporter).toContainEqual([
          'junit',
          { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.ordinary.xml') },
        ]);
      }
    } finally {
      if (previousCi === undefined) delete process.env['CI'];
      else process.env['CI'] = previousCi;
    }
  });

  it('starts every tier from its namespaced application root', async () => {
    const servers = serversOf(await loadConfig());
    // Proof: removing the `wbs` segment from the production server helper
    // failed with all three received roots under `apps/<app>` (2026-09-14).
    expect(servers.map((server) => server.cwd)).toEqual(
      ['be-01', 'gw-01', 'fe-01'].map((app) => join(repoRoot, 'apps', 'wbs', app)),
    );
  });

  it('moves all three tiers together, and every URL they hold about each other', async () => {
    // **Together** is the whole assertion. A shift that moved a listener
    // without moving what points at it boots three servers that cannot talk:
    // be-01 mints tokens for a gw-01 it cannot reach, and the failure arrives
    // forty seconds later as a socket that never opens rather than as a
    // misconfiguration. So the cross-tier URLs are asserted, not only the
    // ports.
    //
    // Proof: `GW_URL` dropped from be-01's env block, this failed on
    // `expected undefined to be 'http://localhost:3700'`; the `VITE_*`
    // block dropped from fe-01's, on the same shape. Watched, 2026-08-29.
    const servers = serversOf(await loadConfig('500'));
    // Or a config that started two servers would satisfy every assertion
    // below about the two it did start.
    expect(servers).toHaveLength(3);
    const [backend, gateway, frontend] = servers;
    expect(backend.url).toBe('http://localhost:3600/_ordinary/ready');
    expect(backend.env?.['PORT']).toBe('3600');
    expect(backend.env?.['GW_URL']).toBe('http://localhost:3700');
    expect(gateway.url).toBe('http://localhost:3700/health');
    expect(gateway.env?.['PORT']).toBe('3700');
    expect(gateway.env?.['BE_URL']).toBe('http://localhost:3600');
    expect(frontend.url).toBe('http://localhost:4700');
    expect(frontend.env?.['PORT']).toBe('4700');
    expect(frontend.env?.['VITE_BE_URL']).toBe('http://localhost:3600');
    expect(frontend.env?.['VITE_GW_URL']).toBe('http://localhost:3700');
    expect(frontend.env?.['VITE_WS_URL']).toBe('ws://localhost:3700/ws');
  });

  it('uses the ordinary server descriptors shared with the Performance runner', async () => {
    const { ordinaryServerDescriptors } = await import('./playwright.ordinary-servers');
    const config = await loadConfig('500');
    const descriptors = ordinaryServerDescriptors(
      repoRoot,
      500,
      true,
      join(repoRoot, 'tmp', 'proof.db'),
    );
    const configured = serversOf(config);
    expect(
      configured.map(({ command, cwd, url, env }) => ({
        command,
        cwd,
        url,
        env: { ...env, DB_PATH: 'proof.db' },
      })),
    ).toEqual(
      descriptors.map(({ command, cwd, url, env }) => ({
        command,
        cwd,
        url,
        env: { ...env, DB_PATH: 'proof.db' },
      })),
    );
  });

  it('points the browser at the frontend it actually started', async () => {
    const config = (await loadConfig('500')) as { use?: { baseURL?: string } };
    expect(config.use?.baseURL).toBe('http://localhost:4700');
  });

  it('serves the built frontend instead of a source-module graph', async () => {
    const [, , frontend] = serversOf(await loadConfig('500'));

    // A source Vite page fetched more than 100 modules per navigation. A host
    // network notification canceled one batch with `net::ERR_NETWORK_CHANGED`
    // and left only an empty `#root`, twice in two whole-browser runs.
    // Proof: replacing this with `bunx vite` failed on `expected
    // "bunx vite" to be "bunx vite build --minify=false && bunx vite
    // preview"`.
    expect(frontend.command).toBe('bun ordinary-browser-frontend.ts');
  });

  /**
   * How long the out-of-process origin probe below may take, and how long the
   * case that owns it may take.
   *
   * TASK-405 measured every `apps/wbs/fe-01` case against vitest's 5000ms default.
   * This one is the tightest in the app by a wide gap — 2813 / 2799 / 2649 /
   * 2485 / 2881ms across five runs on h2puni at load ~8-9, against 350ms for
   * the next slowest case in this file — and it is tight for a reason that
   * cannot be split away: one `bun --eval` that loads be-01's config and app
   * fixture cold. Unlike the four-mount case that opened that task, there is
   * no smaller shape to cut this into.
   *
   * The two budgets are ordered deliberately. Before this, the probe's own
   * 10000ms guard sat inside a case vitest killed at 5000ms, so the guard
   * could never surface first: a hung probe reported `Test timed out in
   * 5000ms` and named nothing. (`execFileSync` is synchronous, so vitest could
   * not actually interrupt it either — watched 2026-09-08, that arm reported
   * 5000ms after burning 9852ms of runner wall clock.) With the case budget
   * above the probe budget, the probe reports first and says which command ran
   * out: `spawnSync bun ETIMEDOUT`.
   *
   * TASK-405 kept vitest's 5000ms default work-package-wide; WBS 080.16 replaced
   * it with the measured 30 s on the target's command line after the gate
   * timed out healthy cases at 5 s (docs/test-budgets.md). This case still
   * states its own budget, because it has to stay above the probe's.
   */
  // The 2026-10-24 hosted run exhausted the probe's own 20 s bound. Its 4.8 s
  // focused idle case and that overrun require max(3 × 4.8, 2 × 20) = 40 s;
  // 45 s is the next policy step. The 60 s case stays above the child guard.
  const PROBE_TIMEOUT_MS = 45_000;
  const PROBE_CASE_TIMEOUT_MS = 60_000;

  it('terminates and joins an origin probe child before its late success', () => {
    const directory = mkdtempSync(join(tmpdir(), 'origin-probe-timeout-'));
    const pidFile = join(directory, 'pid');
    try {
      const script = `
          import { writeFileSync } from 'node:fs';
          writeFileSync(process.env['ORIGIN_PROBE_PID_FILE'], String(process.pid));
          process.on('SIGTERM', () => {});
          setTimeout(() => { console.log('401'); process.exit(0); }, 4000);
        `;
      let probeError: unknown;
      try {
        runOriginProbe(script, 1000, { ORIGIN_PROBE_PID_FILE: pidFile });
      } catch (error) {
        probeError = error;
      }
      // Proof: removing the wrapper deadline failed the ETIMEDOUT assertion
      // after the child reached its late output; removing SIGKILL made the intercepted
      // SIGTERM settle with a null signal; printing 401 before the deadline
      // failed the empty-stdout assertion (2026-10-24).
      expect(probeError).toMatchObject({ code: 'ETIMEDOUT', signal: 'SIGKILL' });
      const pid = Number(readFileSync(pidFile, 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
      expect(probeError).toMatchObject({ stdout: '' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 6000);

  it(
    'lets a shifted browser login reach authentication through the configured backend origin',
    async () => {
      const [backend] = serversOf(await loadConfig('500'));
      const env = {
        AUTH_MODE: 'local',
        BROWSER_SESSION_AUTHORITY: 'disabled',
        ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
        ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
        ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
        NODE_ENV: 'development',
        LOG_LEVEL: 'error',
        INTERNAL_AUTH_SECRET: 's'.repeat(32),
        JWT_SIGNING_KEY_CURRENT: 'k'.repeat(32),
        ...backend.env,
      };
      const script = `
      import { loadConfig } from './apps/wbs/be-01/src/config.ts';
      import { testApp } from './apps/wbs/be-01/src/testing/app-fixture.ts';
      const config = loadConfig(JSON.parse(process.env['ORIGIN_PROBE_CONFIG']));
      const app = testApp({appOrigin: config.appOrigin});
      const response = await app.handle(new Request('http://localhost:3600/api/auth/login', {
        method:'POST', headers:{'content-type':'application/json',origin:'http://localhost:4700'},
        body:JSON.stringify({username:'origin-probe',password:'incorrect'}),
      }));
      console.log(response.status);
    `;
      const status = runOriginProbe(script, PROBE_TIMEOUT_MS, {
        ORIGIN_PROBE_CONFIG: JSON.stringify(env),
      });
      expect(status.trim()).toBe('401');
    },
    PROBE_CASE_TIMEOUT_MS,
  );

  it('refuses a shift it cannot use rather than reading it as zero', async () => {
    // Unknown is not OK (`AGENTS.md`, R5). A shift silently read as zero is a
    // run against whatever holds the usual ports — a dev server, or another
    // checkout — wearing the costume of an isolated one, which is the exact
    // fault the shift exists to end.
    //
    // Proof: the `Number.isInteger` guard replaced by `Number(asked) || 0`,
    // this failed on `promise resolved instead of rejecting`. Watched,
    // 2026-08-29.
    await expect(loadConfig('half')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('-1')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('1.5')).rejects.toThrow('E2E_PORT_SHIFT');
    await expect(loadConfig('10000')).rejects.toThrow('E2E_PORT_SHIFT');
  });

  it('refuses a shift that lands one tier on another tier’s usual port', async () => {
    // The three tiers sit at 3100/3200/4200, so 100 puts be-01 on gw-01's port
    // and 1000 puts gw-01 on fe-01's. An agent asked for 1000 and got
    // `http://localhost:4200/health is already used` from a gateway that had
    // collided with a frontend — and on a developer's machine 4200 is the dev
    // server this whole mechanism exists to run beside (2026-08-30).
    //
    // Refused rather than nudged: the shift is written into runbooks and agent
    // instructions, and a silently adjusted 1000 means something other than
    // what the person typed.
    //
    // Proof: the guard removed, this failed on `promise resolved … instead of
    // rejecting`, and a real run on 1000 died on the gateway's health URL.
    await expect(loadConfig('1000')).rejects.toThrow('4200');
    await expect(loadConfig('100')).rejects.toThrow('3200');
    await expect(loadConfig('1100')).rejects.toThrow('4200');
    // And a shift that clears all three is still accepted, or the guard would
    // be refusing everything and this file could not tell.
    const servers = serversOf(await loadConfig('500'));
    expect(servers).toHaveLength(3);
  });

  it('gives each run a database of its own, under the workspace root', async () => {
    // Never `apps/wbs/be-01/local.db`: the specs sign up throwaway accounts and
    // write plans, and doing that to a developer's own dev database is how a
    // gate starts failing for one person only.
    const [backend] = serversOf(await loadConfig());

    expect(backend.env?.['DB_PATH']).toContain(join(repoRoot, 'tmp'));
  });

  it('binds native browser state to its exact run database without reading setup state during discovery', async () => {
    const previous = process.env['E2E_TEST_DATABASE'];
    const database = join(repoRoot, 'tmp', 'ordinary-state-config-proof.db');
    try {
      process.env['E2E_TEST_DATABASE'] = database;
      const config = await loadConfig('500');
      expect(config.use?.storageState).toBe(database + '.ordinary/cookies.json');
      expect(config.globalSetup).toBe('./ordinary-global-setup.ts');
      expect(serversOf(config).at(0)?.env?.['DB_PATH']).toBe(database);
    } finally {
      if (previous === undefined) delete process.env['E2E_TEST_DATABASE'];
      else process.env['E2E_TEST_DATABASE'] = previous;
    }
  });

  it.each(['relative.db', '/tmp/../tmp/ordinary.db', ''])(
    'refuses a noncanonical run database %s before starting a browser stack',
    async (database) => {
      const previous = process.env['E2E_TEST_DATABASE'];
      try {
        process.env['E2E_TEST_DATABASE'] = database;
        await expect(loadConfig('500')).rejects.toThrow('E2E_TEST_DATABASE');
      } finally {
        if (previous === undefined) delete process.env['E2E_TEST_DATABASE'];
        else process.env['E2E_TEST_DATABASE'] = previous;
      }
    },
  );

  it('starts an owned native-session organization fixture rather than reusing a local identity stack', async () => {
    const servers = serversOf(await loadConfig('500'));
    const [backend, gateway] = servers;

    expect(backend).toMatchObject({
      command: 'bun src/testing/ordinary-browser-server.ts',
      url: 'http://localhost:3600/_ordinary/ready',
      reuseExistingServer: false,
      env: {
        APP_ORIGIN: 'http://localhost:4700',
        GW_URL: 'http://localhost:3700',
        HOSTNAME: 'e2e000000000',
      },
    });
    expect(gateway).toMatchObject({
      command: 'bun src/testing/ordinary-browser-gateway.ts',
      url: 'http://localhost:3700/health',
      reuseExistingServer: false,
      env: { APP_ORIGIN: 'http://localhost:4700', BE_URL: 'http://localhost:3600' },
    });
    expect(
      servers.every(
        (server) => 'reuseExistingServer' in server && server.reuseExistingServer === false,
      ),
    ).toBe(true);
  });

  it('gives the source backend a deterministic supervisor caller identity', async () => {
    // A CI shell need not export HOSTNAME. Production containers still supply
    // their authenticated Docker hostname; this value belongs only to the
    // isolated browser stack, which must boot before it can run any case.
    const [backend] = serversOf(await loadConfig());
    const callerId = backend.env?.['HOSTNAME'];

    expect(callerId).toBe('e2e000000000');
    expect(callerId).toMatch(/^[0-9a-f]{12}$/);
  });
});

it('runs activated organization acceptance only under its dedicated browser config', async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  try {
    const ordinary = await loadConfig();
    const organization = await loadOrganizationConfig();
    const spec = 'e2e/organization-context.real.spec.ts';
    const [defaultProject] = projectsOf(ordinary);
    expect(matches(defaultProject.testIgnore, spec)).toBe(true);
    expect(organization.testMatch).toBe('organization-context.real.spec.ts');
  } finally {
    vi.restoreAllMocks();
  }
});

it('runs cross-work-package refresh and normal-root acceptance only under their dedicated browser config', async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  try {
    const ordinary = await loadConfig();
    const { default: connected } = await import('./playwright.cross-work-package.config');
    const [defaultProject] = projectsOf(ordinary);
    for (const spec of [
      'cross-work-package-refresh.real.spec.ts',
      'cross-work-package-root.real.spec.ts',
    ])
      expect(matches(defaultProject.testIgnore, `e2e/${spec}`)).toBe(true);
    expect(connected.testMatch).toEqual([
      'cross-work-package-refresh.real.spec.ts',
      'cross-work-package-root.real.spec.ts',
    ]);
  } finally {
    vi.restoreAllMocks();
  }
});

/**
 * The organization fixture listens on IPv4 loopback only (issue #717), so
 * its health check and Vite's proxy must name 127.0.0.1: `localhost` passes
 * where it resolves to 127.0.0.1 first and times out where ::1 comes first.
 *
 * Proof: reverting both URLs to `localhost:7300` failed this case; watched
 * 2026-10-25.
 */
it('reaches the loopback-only organization fixture by its IPv4 address', async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  try {
    const [fixture, frontend] = serversOf(await loadOrganizationConfig());
    expect(fixture.command).toBe(
      'bun apps/wbs/be-01/src/testing/organization-browser-server.ts --port 7300',
    );
    expect(fixture.url).toBe('http://127.0.0.1:7300/health');
    expect(frontend.command).toContain('VITE_BE_URL=http://127.0.0.1:7300 ');
  } finally {
    vi.restoreAllMocks();
  }
});

describe('the Performance browser selection', () => {
  let priorDatabase: string | undefined;
  beforeEach(() => {
    priorDatabase = process.env['E2E_TEST_DATABASE'];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['E2E_PORT_SHIFT'];
    if (priorDatabase === undefined) delete process.env['E2E_TEST_DATABASE'];
    else process.env['E2E_TEST_DATABASE'] = priorDatabase;
  });

  it('points its real fixture at the shifted ordinary frontend', async () => {
    vi.resetModules();
    process.env['E2E_PORT_SHIFT'] = '6000';
    process.env['E2E_TEST_DATABASE'] = join(repoRoot, 'tmp', 'performance-config.db');
    const { default: config } = await import('./playwright.performance.config');
    expect(config.use?.baseURL).toBe('http://localhost:10200');
    expect(config.use?.viewport).toEqual({ width: 1400, height: 900 });
  });

  it('declares run-bound current setup and storage without reading state during discovery', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'performance-config-contract-'));
    const database = join(directory, 'store.db');
    try {
      vi.resetModules();
      process.env['E2E_PORT_SHIFT'] = '6000';
      process.env['E2E_TEST_DATABASE'] = database;
      const { default: config } = await import('./playwright.performance.config');
      expect(config.globalSetup).toBe('./ordinary-global-setup.ts');
      expect(config.use?.storageState).toBe(database + '.ordinary/cookies.json');
      expect(config.workers).toBe(1);
      expect(config.retries).toBe(0);
      expect(config.timeout).toBe(120_000);
      expect(config.projects?.map((project) => project.name)).toEqual(['chromium']);
      expect(existsSync(database)).toBe(false);
      expect(existsSync(database + '.ordinary')).toBe(false);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['relative', 'store.db'],
    ['noncanonical', '/tmp/../tmp/store.db'],
  ] as const)('refuses %s Performance database before state setup', async (_name, database) => {
    vi.resetModules();
    process.env['E2E_PORT_SHIFT'] = '6000';
    if (database === undefined) delete process.env['E2E_TEST_DATABASE'];
    else process.env['E2E_TEST_DATABASE'] = database;
    await expect(import('./playwright.performance.config')).rejects.toThrow(
      'E2E_TEST_DATABASE must be a canonical absolute path for this browser run',
    );
  });
});

describe('the chromium-regular work package gate', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
  });

  it('does not exist when PLAYWRIGHT_CHROMIUM_REGULAR is unset — the default gate', async () => {
    const projects = projectsOf(await loadConfigWithChromiumRegular(false));

    // Proof: on 2026-09-23, adding `chromium-regular` to `projects`
    // unconditionally (removing the `PLAYWRIGHT_CHROMIUM_REGULAR === '1'`
    // guard in `playwright.config.ts`) made this assertion fail: `expected 2
    // to be 1` — the exact shape a silent gate regression would take, since
    // every ordinary `bunx playwright test` run — CI's included — would then
    // also run this one narrow bfcache regression under the regular Chromium
    // channel, not because that channel is unavailable (CI installs it), but
    // because that scope decision belongs to a planner, not to every run.
    expect(projects).toHaveLength(1);
    expect(projects.map((project) => project.name)).toEqual(['chromium']);
  });

  it('exists, gated to the bfcache spec, only when a planner opts in', async () => {
    const projects = projectsOf(await loadConfigWithChromiumRegular(true));
    const regular = projects.find((project) => project.name === 'chromium-regular');

    expect(projects).toHaveLength(2);
    if (regular === undefined) throw new Error('chromium-regular was not added');
    // Proof: on 2026-09-23, corrupting this work package's own `testMatch` to a
    // pattern matching nothing made this assertion fail: `expected false to
    // be true` — the project would exist but never actually select the spec
    // it owns.
    expect(matches(regular.testMatch, 'e2e/lifetime-bfcache.spec.ts')).toBe(true);
    expect(matches(regular.testMatch, 'e2e/dark-mode.spec.ts')).toBe(false);
    // Proof: on 2026-09-23, dropping `channel: 'chromium'` from this
    // work package's own `use` made this assertion fail: `expected undefined to
    // be 'chromium'` — the project would exist and match the right spec, but
    // launch the default (headless-shell) channel that cannot restore from
    // bfcache at all, silently defeating the whole point of the work package.
    expect(regular.use?.channel).toBe('chromium');
  });

  it('the default work package excludes the bfcache spec either way', async () => {
    for (const config of [
      await loadConfigWithChromiumRegular(false),
      await loadConfigWithChromiumRegular(true),
    ]) {
      const [defaultProject] = projectsOf(config);
      // Proof: on 2026-09-23, removing the default work package's own
      // `testIgnore` made this assertion fail: `expected false to be true` —
      // the default `chromium` work package (headless-shell) would then also try
      // to run the bfcache spec itself and fail it under the wrong browser.
      expect(matches(defaultProject.testIgnore, 'e2e/lifetime-bfcache.spec.ts')).toBe(true);
    }
  });
});

describe('the packaged browser gate', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('serves the namespaced build with the namespaced Caddy configuration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-packaged-config-'));
    roots.push(root);
    const appRoot = join(root, 'apps', 'wbs', 'fe-01');
    const site = join(root, 'dist', 'apps', 'wbs', 'fe-01');
    mkdirSync(join(appRoot, 'e2e-packaged'), { recursive: true });
    mkdirSync(site, { recursive: true });
    writeFileSync(join(appRoot, 'playwright.packaged.config.ts'), 'fixture');
    writeFileSync(join(appRoot, 'Caddyfile'), 'fixture');
    writeFileSync(join(site, 'index.html'), '<!doctype html>');

    const config = await loadPackagedConfig(root);
    const servers = serversOf(config);
    // Proof: restoring the packaged site's `dist/apps/fe-01` path made the
    // production config refuse that absent index before this assertion
    // (`.../dist/apps/fe-01 holds no index.html`, 2026-09-14).
    expect(config.testDir).toBe(join(appRoot, 'e2e-packaged'));
    expect(config.outputDir).toBe(join(appRoot, 'test-results-packaged'));
    // Proof: removing this reporter made the packaged config case fail with reporter [["list"]]
    // instead of the expected JUnit path (2026-10-09).
    expect(config.reporter).toContainEqual([
      'junit',
      { outputFile: join(root, 'tmp', 'junit', 'wbs-fe-01.browser.packaged.xml') },
    ]);
    expect(servers).toHaveLength(1);
    expect(servers[0]?.command).toContain(`-v ${site}:/srv/www:ro`);
    expect(servers[0]?.command).toContain(
      `-v ${join(appRoot, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`,
    );
  });
});

type WorkerContextFault = 'missing' | 'stale' | 'malformed' | 'private' | 'valid';

/** Uses Home's actual imported test producer, so replacing that import changes executable worker behavior. */
function ordinaryTestProducer(): { specifier: string; modulePath: string } {
  const home = join(repoRoot, 'apps/wbs/fe-01/e2e/home.spec.ts');
  const source = readFileSync(home, 'utf8');
  // Test parser boundary: installed TypeScript exposes its diagnostic array beyond the public SourceFile declaration.
  const parsed = ts.createSourceFile(
    home,
    source,
    ts.ScriptTarget.Latest,
    true,
  ) as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] };
  if (parsed.parseDiagnostics.length !== 0) throw new Error('Canonical ordinary spec is malformed');
  const imports = parsed.statements.filter(ts.isImportDeclaration).filter((declaration) => {
    const bindings = declaration.importClause?.namedBindings;
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (binding) => (binding.propertyName?.text ?? binding.name.text) === 'test',
      )
    );
  });
  const selected = imports.at(0);
  if (
    imports.length !== 1 ||
    selected === undefined ||
    !ts.isStringLiteral(selected.moduleSpecifier)
  )
    throw new Error('Canonical ordinary spec must import one actual test producer');
  const specifier = selected.moduleSpecifier.text;
  return {
    specifier,
    modulePath: specifier.startsWith('.')
      ? resolve(dirname(home), specifier + '.ts')
      : createRequire(home).resolve(specifier),
  };
}

const ordinaryWorkerDriver = String.raw`
import { readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
const request = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { createPerformanceProcessOwner } = await import(request.ownerModule);
let owner: ReturnType<typeof createPerformanceProcessOwner> | undefined;
let stdout: Awaited<ReturnType<typeof open>> | undefined;
let stderr: Awaited<ReturnType<typeof open>> | undefined;
let child: Bun.Subprocess | undefined;
let original: { exitCode: number; signalCode: unknown; observedAt: string } | null = null;
let primaryOccurred = false, primary: unknown;
const cleanupFailures: unknown[] = [];
let stopPromise: Promise<void> | undefined, stopAttempts = 0, settled = false;
let stdoutClosed = false, stderrClosed = false;
let deadline: ReturnType<typeof setTimeout> | undefined;
const encode = (failure: unknown): unknown => failure instanceof Error
  ? { name: failure.name, message: failure.message, cause: failure.cause === undefined ? null : encode(failure.cause) }
  : { type: typeof failure, value: String(failure) };
const stop = () => {
  if (owner === undefined) return Promise.resolve();
  if (stopPromise === undefined) { stopAttempts++; stopPromise = owner.stop(); }
  return stopPromise;
};
const startedAt = new Date().toISOString();
let originalBeforeCleanup: typeof original = null;
try {
  stdout = await open(request.stdout, 'wx', 0o600);
  stderr = await open(request.stderr, 'wx', 0o600);
  owner = createPerformanceProcessOwner();
  child = owner.spawn(request.argv, request.cwd, request.environment, { stdout: stdout.fd, stderr: stderr.fd });
  writeFileSync(request.dispatch, JSON.stringify({ pid: child.pid, argv: request.argv, dispatchedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
  const observed = child.exited.then(exitCode => { original = { exitCode, signalCode: child?.signalCode, observedAt: new Date().toISOString() }; });
  await Promise.race([observed, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Ordinary worker probe exceeded 10000ms')), 10000); })]);
} catch (failure) { primaryOccurred = true; primary = failure; }
finally {
  if (deadline !== undefined) clearTimeout(deadline);
  originalBeforeCleanup = original;
  try { await stop(); settled = stopPromise !== undefined; } catch (failure) { cleanupFailures.push(failure); }
  if (stdout !== undefined) try { await stdout.close(); stdoutClosed = true; } catch (failure) { cleanupFailures.push(failure); }
  if (stderr !== undefined) try { await stderr.close(); stderrClosed = true; } catch (failure) { cleanupFailures.push(failure); }
}
const receipt = {
  startedAt, endedAt: new Date().toISOString(), argv: request.argv, cwd: request.cwd,
  original: originalBeforeCleanup,
  afterCleanup: child === undefined ? null : { exitCode: child.exitCode, signalCode: child.signalCode },
  primary: primaryOccurred ? encode(primary) : null, cleanupFailures: cleanupFailures.map(encode),
  owner: { acquired: owner !== undefined, stopAttempts, settled },
  fds: { stdoutAcquired: stdout !== undefined, stderrAcquired: stderr !== undefined, stdoutClosed, stderrClosed },
};
writeFileSync(request.receipt, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
if (primaryOccurred || cleanupFailures.length !== 0 || originalBeforeCleanup === null || !settled || !stdoutClosed || !stderrClosed) process.exitCode = 1;
`;

/** Runs only a no-page worker against constructed private protocol files, retaining every native/raw receipt. */
function runOrdinaryWorkerProbe(fault: WorkerContextFault, list = false) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-ordinary-worker-'));
  const databasePath = join(directory, 'source.db'),
    stateDirectory = databasePath + '.ordinary',
    runId = 'ordinary-worker-control',
    accountId = 'constructed-account',
    organizationId = 'constructed-organization';
  mkdirSync(stateDirectory, { mode: 0o700 });
  const ready = {
    version: 1,
    runId,
    databasePath,
    stateDirectory,
    origin: 'http://localhost:3100',
    appOrigin: 'http://localhost:4200',
    gwUrl: 'http://localhost:3200',
    accountId,
    organizationId,
  };
  const storageStatePath = join(stateDirectory, 'cookies.json');
  const contextPath = join(stateDirectory, 'context.json');
  writeFileSync(join(stateDirectory, 'readiness.json'), JSON.stringify(ready), {
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(
    storageStatePath,
    JSON.stringify({
      cookies: ['__Host-wbs_access', '__Host-wbs_organization'].map((name) => ({
        name,
        value: 'constructed-protocol-value',
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      })),
      origins: [],
    }),
    { flag: 'wx', mode: 0o600 },
  );
  if (fault !== 'missing') {
    writeFileSync(
      contextPath,
      fault === 'malformed'
        ? '{'
        : JSON.stringify({
            version: 1,
            runId: fault === 'stale' ? 'another-run' : runId,
            databasePath,
            stateDirectory,
            beOrigin: ready.origin,
            appOrigin: ready.appOrigin,
            gwOrigin: ready.gwUrl,
            accountId,
            organizationId,
            projectId: 'constructed-project',
            storageStatePath,
          }),
      { flag: 'wx', mode: 0o600 },
    );
    if (fault === 'private') chmodSync(contextPath, 0o644);
  }
  const producer = ordinaryTestProducer();
  const beforeAll = join(directory, 'before-all.effect'),
    body = join(directory, 'body.effect');
  writeFileSync(
    join(directory, 'worker.spec.ts'),
    `import { test } from ${JSON.stringify(producer.modulePath)};
import { writeFileSync } from 'node:fs';
test.beforeAll(() => { writeFileSync(${JSON.stringify(beforeAll)}, 'beforeAll', { flag: 'wx', mode: 0o600 }); });
test('ordinary worker effects', async () => { writeFileSync(${JSON.stringify(body)}, 'body', { flag: 'wx', mode: 0o600 }); });
`,
    { flag: 'wx' },
  );
  const config = join(directory, 'playwright.config.ts');
  writeFileSync(
    config,
    `export default { testDir: '.', testMatch: 'worker.spec.ts', workers: 1, fullyParallel: false, retries: 0, timeout: 10000, outputDir: './artifacts', reporter: [['json']], projects: [{ name: 'worker' }] };\n`,
    { flag: 'wx' },
  );
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? directory,
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    CI: '1',
    E2E_TEST_DATABASE: databasePath,
    E2E_CURRENT_RUN_ID: runId,
    E2E_PORT_SHIFT: '0',
  };
  const receiptPath = join(directory, 'receipt.json');
  const request = {
    argv: [
      'bun',
      '--no-env-file',
      '--config=/dev/null',
      join(repoRoot, 'node_modules/playwright/cli.js'),
      'test',
      '--config',
      config,
      ...(list ? ['--list'] : []),
    ],
    cwd: repoRoot,
    environment,
    ownerModule: join(repoRoot, 'tools/tool-devsync/src/performance-processes.ts'),
    stdout: join(directory, 'stdout'),
    stderr: join(directory, 'stderr'),
    receipt: receiptPath,
    dispatch: join(directory, 'dispatch.json'),
  };
  const requestPath = join(directory, 'request.json'),
    driver = join(directory, 'driver.ts');
  writeFileSync(requestPath, JSON.stringify(request, null, 2), { flag: 'wx' });
  writeFileSync(driver, ordinaryWorkerDriver, { flag: 'wx' });
  execFileSync('bun', ['--no-env-file', '--config=/dev/null', driver, requestPath], {
    cwd: repoRoot,
    env: environment,
    timeout: 25_000,
    encoding: 'utf8',
  });
  const receipt: unknown = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    !('primary' in receipt) ||
    receipt.primary !== null ||
    !('cleanupFailures' in receipt) ||
    !Array.isArray(receipt.cleanupFailures) ||
    receipt.cleanupFailures.length !== 0 ||
    !('original' in receipt) ||
    typeof receipt.original !== 'object' ||
    receipt.original === null ||
    !('exitCode' in receipt.original) ||
    typeof receipt.original.exitCode !== 'number' ||
    !('signalCode' in receipt.original) ||
    receipt.original.signalCode !== null ||
    !('owner' in receipt) ||
    typeof receipt.owner !== 'object' ||
    receipt.owner === null ||
    !('acquired' in receipt.owner) ||
    receipt.owner.acquired !== true ||
    !('stopAttempts' in receipt.owner) ||
    receipt.owner.stopAttempts !== 1 ||
    !('settled' in receipt.owner) ||
    receipt.owner.settled !== true ||
    !('fds' in receipt) ||
    typeof receipt.fds !== 'object' ||
    receipt.fds === null ||
    !('stdoutClosed' in receipt.fds) ||
    receipt.fds.stdoutClosed !== true ||
    !('stderrClosed' in receipt.fds) ||
    receipt.fds.stderrClosed !== true
  )
    throw new Error(
      'Ordinary worker native ownership/output remained unknown; retained ' + directory,
    );
  return {
    directory,
    producer,
    exitCode: receipt.original.exitCode,
    beforeAllExists: existsSync(beforeAll),
    bodyExists: existsSync(body),
    stdout: readFileSync(request.stdout, 'utf8'),
    stderr: readFileSync(request.stderr, 'utf8'),
  };
}

describe('ordinary worker state before actual effects', () => {
  for (const fault of ['missing', 'stale', 'malformed', 'private'] as const)
    it('refuses ' + fault + ' context before worker beforeAll and body effects', () => {
      const probe = runOrdinaryWorkerProbe(fault);
      expect(probe.beforeAllExists, 'actual beforeAll effect retained at ' + probe.directory).toBe(
        false,
      );
      expect(probe.bodyExists, 'actual body effect retained at ' + probe.directory).toBe(false);
      expect(probe.exitCode).toBe(1);
      const diagnostic =
        fault === 'missing'
          ? 'ENOENT'
          : fault === 'stale'
            ? 'Ordinary browser context belongs to a different run or authority'
            : fault === 'malformed'
              ? 'Ordinary browser state JSON is malformed'
              : 'Ordinary browser state must be a private owned regular file';
      expect(probe.stdout + probe.stderr).toContain(diagnostic);
    });

  it('lets one real worker reach its effects with matching constructed private protocol state', () => {
    const probe = runOrdinaryWorkerProbe('valid');
    expect(probe.exitCode, probe.stderr).toBe(0);
    expect(probe.beforeAllExists).toBe(true);
    expect(probe.bodyExists).toBe(true);
  });

  it('discovers the actual test producer with missing state without worker effects', () => {
    const probe = runOrdinaryWorkerProbe('missing', true);
    expect(probe.exitCode, probe.stderr).toBe(0);
    expect(probe.beforeAllExists).toBe(false);
    expect(probe.bodyExists).toBe(false);
    expect(probe.stdout).toContain('ordinary worker effects');
    expect(probe.stdout + probe.stderr).not.toContain('Ordinary browser state');
  });
});

it('keeps the three local quiet-load cases outside ordinary current workers', async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
  const previousRegular = process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
  const previousShift = process.env['E2E_PORT_SHIFT'];
  const previousDatabase = process.env['E2E_TEST_DATABASE'];
  try {
    for (const regular of [false, true]) {
      const ordinary = await loadConfigWithChromiumRegular(regular);
      const defaultProject = projectsOf(ordinary).find((project) => project.name === 'chromium');
      if (defaultProject === undefined) throw new Error('ordinary chromium project is absent');
      expect(matches(defaultProject.testIgnore, 'e2e/quiet-load.spec.ts')).toBe(true);
      expect(matches(defaultProject.testIgnore, 'e2e/quiet-load-extra.spec.ts')).toBe(false);
      expect(matches(defaultProject.testIgnore, 'e2e/home.spec.ts')).toBe(false);
      const regularProject = projectsOf(ordinary).find(
        (project) => project.name === 'chromium-regular',
      );
      if (regular) {
        if (regularProject === undefined) throw new Error('opted-in regular chromium is absent');
        expect(matches(regularProject.testMatch, 'e2e/quiet-load.spec.ts')).toBe(false);
        expect(matches(regularProject.testMatch, 'e2e/lifetime-bfcache.spec.ts')).toBe(true);
      } else expect(regularProject).toBeUndefined();
    }
  } finally {
    vi.restoreAllMocks();
    if (previousRegular === undefined) delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
    else process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = previousRegular;
    if (previousShift === undefined) delete process.env['E2E_PORT_SHIFT'];
    else process.env['E2E_PORT_SHIFT'] = previousShift;
    if (previousDatabase === undefined) delete process.env['E2E_TEST_DATABASE'];
    else process.env['E2E_TEST_DATABASE'] = previousDatabase;
  }
});

async function loadLocalConfig() {
  vi.resetModules();
  const { default: config } = await import('./playwright.local.config');
  return config;
}

describe('the dedicated local quiet-load profile', () => {
  const keys = ['CI', 'E2E_PORT_SHIFT', 'E2E_TEST_DATABASE', 'TMPDIR'] as const;
  let previous: Record<string, string | undefined>;
  const roots: string[] = [];

  beforeEach(() => {
    previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
    delete process.env['CI'];
    delete process.env['E2E_PORT_SHIFT'];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of keys) {
      if (previous[key] === undefined) expect(Reflect.deleteProperty(process.env, key)).toBe(true);
      else process.env[key] = previous[key];
    }
    for (const root of roots.splice(0)) rmSync(root, { recursive: true });
  });

  it('selects only local quiet-load with real local main gateway and Vite settings', async () => {
    process.env['E2E_PORT_SHIFT'] = '500';
    const config = await loadLocalConfig();
    expect(config.testDir).toBe('./e2e');
    expect(config.testMatch).toBe('quiet-load.spec.ts');
    expect(config.globalSetup).toBeUndefined();
    expect(config.use?.storageState).toBeUndefined();
    expect(config.workers).toBe(1);
    expect(config.retries).toBe(0);
    expect(config.timeout).toBe(60_000);
    expect(config.expect?.timeout).toBe(10_000);
    expect(projectsOf(config).map((project) => project.name)).toEqual(['chromium']);
    expect(config.use?.baseURL).toBe('http://localhost:4700');
    expect(config.use?.locale).toBe('en-US');
    expect(config.use?.timezoneId).toBe('UTC');
    const servers = serversOf(config);
    expect(servers.map((server) => server.command)).toEqual([
      'bun src/testing/local-browser-server.ts',
      'bun src/main.ts',
      'bun ordinary-browser-frontend.ts',
    ]);
    expect(servers.map((server) => server.cwd)).toEqual(
      ['be-01', 'gw-01', 'fe-01'].map((app) => join(repoRoot, 'apps', 'wbs', app)),
    );
    expect(servers.map((server) => server.url)).toEqual([
      'http://localhost:3600/health',
      'http://localhost:3700/health',
      'http://localhost:4700',
    ]);
    for (const server of servers) {
      expect(server.reuseExistingServer).toBe(false);
      expect(server.timeout).toBe(120_000);
      expect(server.env?.['E2E_CURRENT_COHORT']).toBeUndefined();
    }
    const [backend, gateway, frontend] = servers;
    expect(backend.env).toEqual({
      NODE_ENV: 'development',
      AUTH_MODE: 'local',
      BROWSER_SESSION_AUTHORITY: 'disabled',
      APP_ORIGIN: 'http://localhost:4700',
      PORT: '3600',
      GW_URL: 'http://localhost:3700',
      HOSTNAME: 'e2e000000001',
      LOG_LEVEL: 'error',
      JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
      INTERNAL_AUTH_SECRET: 'local-internal-secret-0123456789abcdef',
      ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
      ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
      ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
      MCP_BE_INTERNAL_SECRET: 'mcp-secret-0123456789abcdefghijklmn',
      WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'grant-key-g-0123456789abcdefghijklmn',
      WBS_MCP_AUTHORIZATION_SERVER: 'https://wbs.example/mcp/oauth',
      SOLVER_BUDGET_MS: '60000',
      SOLVER_SEARCH_WORKERS: '2',
      SOLVER_MEMORY_LIMIT_MB: '512',
    });
    expect(gateway.env).toEqual({
      AUTH_MODE: 'local',
      PORT: '3700',
      BE_URL: 'http://localhost:3600',
      LOG_LEVEL: 'error',
      JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
      INTERNAL_AUTH_SECRET: 'local-internal-secret-0123456789abcdef',
    });
    expect(frontend.env).toEqual({
      PORT: '4700',
      VITE_BE_URL: 'http://localhost:3600',
      VITE_GW_URL: 'http://localhost:3700',
      VITE_WS_URL: 'ws://localhost:3700/ws',
    });
  });

  it('retains local and CI budgets and distinct local evidence paths', async () => {
    for (const ci of [false, true]) {
      if (ci) process.env['CI'] = '1';
      else delete process.env['CI'];
      const config = await loadLocalConfig();
      expect(config.timeout).toBe(ci ? 120_000 : 60_000);
      expect(config.expect?.timeout).toBe(ci ? 30_000 : 10_000);
      expect(config.retries).toBe(0);
      expect(config.outputDir).toBe('./test-results-local');
      expect(config.reporter).toContainEqual([
        'junit',
        { outputFile: join(repoRoot, 'tmp', 'junit', 'wbs-fe-01.browser.local.xml') },
      ]);
      if (ci)
        expect(config.reporter).toContainEqual([
          'html',
          { outputFolder: 'playwright-report-local', open: 'never' },
        ]);
    }
  });

  it('keeps local setup sequential and excludes Playwright arguments from dev setup', () => {
    // Boundary: this owning test reads the declared project file; exact target assertions follow.
    const project = JSON.parse(
      readFileSync(join(repoRoot, 'apps/wbs/fe-01/project.json'), 'utf8'),
    ) as {
      readonly targets: Record<
        'lint' | 'lint:fast',
        { readonly options: { readonly command: string } }
      > & {
        readonly 'e2e-local': unknown;
      };
    };
    expect(project.targets['e2e-local']).toEqual({
      executor: 'nx:run-commands',
      cache: false,
      options: {
        commands: [
          { command: 'bun run tools/dev/setup.ts', forwardAllArgs: false },
          {
            command: 'bunx playwright test --config apps/wbs/fe-01/playwright.local.config.ts',
            forwardAllArgs: true,
          },
        ],
        parallel: false,
      },
    });
    for (const target of ['lint', 'lint:fast'] as const) {
      expect(project.targets[target].options.command.split(' ')).toContain(
        'apps/wbs/fe-01/playwright.local.config.ts',
      );
    }
  });

  it('does not allocate a local database or ordinary state during config discovery', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'wbs-local-config-'));
    roots.push(directory);
    process.env['TMPDIR'] = directory;
    const database = join(directory, 'not-created.db');
    process.env['E2E_TEST_DATABASE'] = database;
    expect(readdirSync(directory)).toEqual([]);
    const config = await loadLocalConfig();
    expect(readdirSync(directory)).toEqual([]);
    expect(process.env['E2E_TEST_DATABASE']).toBe(database);
    expect(config.globalSetup).toBeUndefined();
    expect(config.use?.storageState).toBeUndefined();
    expect(serversOf(config).at(0)?.env?.['DB_PATH']).toBeUndefined();
  });

  it('refuses the local profile outside the workspace root', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir());
    await expect(loadLocalConfig()).rejects.toThrow(
      'local quiet-load profile must run from the workspace root',
    );
  });

  it('declares fresh startup-only database selection before dynamically importing real main', () => {
    const path = join(repoRoot, 'apps/wbs/be-01/src/testing/local-browser-server.ts');
    const source = readFileSync(path, 'utf8');
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const imports: ts.CallExpression[] = [];
    const allocations: ts.CallExpression[] = [];
    const selections: ts.BinaryExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node))
        expect(node.moduleSpecifier.getText(parsed)).not.toMatch(/main/);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        imports.push(node);
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'mkdtemp'
      )
        allocations.push(node);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken)
        selections.push(node);
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    expect(imports).toHaveLength(1);
    expect(allocations).toHaveLength(1);
    expect(imports[0].arguments[0].getText(parsed)).toBe("'../main'");
    const environmentSelections = selections.filter(
      (node) =>
        ts.isElementAccessExpression(node.left) &&
        ts.isPropertyAccessExpression(node.left.expression) &&
        node.left.expression.expression.getText(parsed) === 'process' &&
        node.left.expression.name.text === 'env',
    );
    expect(environmentSelections.map((node) => node.left.getText(parsed))).toEqual([
      "process.env['DB_PATH']",
      "process.env['MIGRATE_ON_STARTUP']",
    ]);
    expect(environmentSelections[0].right.getText(parsed)).toBe("join(directory, 'test.db')");
    expect(environmentSelections[1].right.getText(parsed)).toBe("'true'");
    expect(allocations[0].pos).toBeLessThan(environmentSelections[0].pos);
    expect(environmentSelections[1].end).toBeLessThan(imports[0].pos);
    expect(parsed.statements.at(-1)?.getText(parsed)).toBe('await startLocalBrowser();');
  });
});
