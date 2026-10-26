import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { DiBagServiceReadinessError } from 'di-bag';

import { buildApp } from './app';
import { bootBe01, type BootOptions, type RunningBe } from './boot';
import type { McpServiceSettings } from './config';
import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';
import { addAgentPerson, issueApiKey } from './testing/machine-credential-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;
const SECRET = 'm'.repeat(32);
const AUTHORIZATION_SERVER = 'https://wbs.example/mcp/oauth';
const SETTINGS: McpServiceSettings = {
  internalSecret: SECRET,
  grantSigningKeys: { current: 'grant-key-g-0123456789abcdefghijklmn', previous: null },
  authorizationServer: AUTHORIZATION_SERVER,
};

const dirs: string[] = [];
let running: RunningBe | undefined;

afterEach(async () => {
  await running?.stop();
  running = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A migrated store with ada as org-a's admin and claire her agent, activated when asked. */
function store(activated: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-machine-grant-boot-'));
  dirs.push(dir);
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  const seed = openDatabase(dbPath);
  try {
    seed.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('ada', 'ada', 'x', 1)",
    );
    seed.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
    seed.run(
      "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'admin', 1)",
    );
    addAgentPerson(seed, 'claire', 'org-a', 'ada');
    if (activated)
      seed.run(
        "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
      );
  } finally {
    seed.close();
  }
  return dbPath;
}

function options(dbPath: string, mcpService?: McpServiceSettings): BootOptions {
  return {
    appOrigin: 'http://localhost',
    dbPath,
    port: 0,
    logger: createLogger({ service: 'be-01' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    browserSessionAuthority: 'disabled',
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    ...(mcpService === undefined ? {} : { mcpService }),
  };
}

/** Boots without a socket, answering the composed app. */
async function boot(
  dbPath: string,
  mcpService?: McpServiceSettings,
): Promise<{ app: ReturnType<typeof buildApp>; listened: () => boolean }> {
  let mounted: ReturnType<typeof buildApp> | undefined;
  let listened = false;
  running = await bootBe01(options(dbPath, mcpService), {
    openSource: openSqliteSource,
    makeApp: (composed) => {
      const app = buildApp(composed);
      app.stop = () => Promise.resolve(app);
      mounted = app;
      return app;
    },
    startListener: (_app, _port, ready) => {
      listened = true;
      ready();
    },
  });
  if (mounted === undefined) throw new Error('boot did not compose an app');
  return { app: mounted, listened: () => listened };
}

/**
 * Boot's side of machine grants (`wbs-mcp-agent-surface` task 1.2, M3): an
 * activated store needs mcp-01's secret, the grant key and the authorization
 * server, and the composition it then serves issues and admits grants.
 */
describe('machine grants at boot', () => {
  // Proof: with the readiness refusal in `bootBe01` disabled, boot resolved
  // and this saw no failure; watched 2026-10-26.
  it('refuses an activated store without the machine grant settings, naming them', async () => {
    const dbPath = store(true);
    let failure: unknown;
    let listened = false;
    try {
      running = await bootBe01(options(dbPath), {
        openSource: openSqliteSource,
        startListener: (_app, _port, ready) => {
          listened = true;
          ready();
        },
      });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(DiBagServiceReadinessError);
    const message = String((failure as DiBagServiceReadinessError).cause);
    for (const name of [
      'MCP_BE_INTERNAL_SECRET',
      'WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT',
      'WBS_MCP_AUTHORIZATION_SERVER',
    ])
      expect(message).toContain(name);
    expect(listened).toBe(false);
  });

  it('boots a store before activation without them', async () => {
    const { listened } = await boot(store(false));
    expect(listened()).toBe(true);
  });

  // Proof: with `machineGrantComposition` left out of the app options, the
  // grant request answered 401; watched 2026-10-26.
  it('issues a grant once activated and admits it on the next call', async () => {
    const dbPath = store(true);
    const seed = openDatabase(dbPath);
    const { key } = await issueApiKey(seed, {
      organizationId: 'org-a',
      personId: 'claire',
      issuedBy: 'ada',
    });
    seed.close();
    const { app } = await boot(dbPath, SETTINGS);
    const issued = await app.handle(
      new Request('http://localhost/internal/mcp/machine-grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [MCP_INTERNAL_SECRET_HEADER]: SECRET },
        body: JSON.stringify({
          issuer: AUTHORIZATION_SERVER,
          credential: { kind: 'api_key', key },
          expiresAt: Math.floor(Date.now() / 1000) + 600,
        }),
      }),
    );
    expect(issued.status).toBe(200);
    const { grant } = (await issued.json()) as { grant: string };
    const listed = await app.handle(
      new Request('http://localhost/api/projects', {
        headers: { authorization: `Bearer ${grant}`, [MCP_INTERNAL_SECRET_HEADER]: SECRET },
      }),
    );
    expect(listed.status).toBe(200);
  });
});
