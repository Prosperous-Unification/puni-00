import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { mcpAuthorizationServerOf } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';

import { bootBe01, type RunningBe } from '../boot';
import { loadMcpServiceSettings } from '../config';
import { openDatabase } from '../repository/db';
import { runMigrations } from '../repository/migrate';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import {
  activateOrganizations,
  BOOTED_INTERNAL_SECRET,
  insertMembership,
  insertOrganization,
} from '../testing/booted-browser-process';
import { TEST_MACHINE_GRANT_ENV } from '../testing/machine-grant-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

/** Printed on start so a reader finds this process's banner in mixed logs. */
const BANNER = 'activated organization server (development only)';
const OWNER = { username: 'owner', password: 'correct-horse' } as const;
const ORGANIZATION = 'org-local';
/** Loopback only: the JWT key and the owner's password are public fixtures. */
const HOSTNAME = '127.0.0.1';
/** The public fixture mcp-01 must be started with, printed in the banner. */
const MCP_SECRET = TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'];

/**
 * `--port` (0 picks a free one), `--gw-url`, `--app-origin` and `--mcp-url`
 * (the `MCP_PUBLIC_URL` of the local mcp-01 agents connect to), each required.
 *
 * @throws naming the flag when one is missing, or when the port is not a
 *   non-negative integer.
 */
function listenerFromArguments(): {
  port: number;
  gwUrl: string;
  appOrigin: string;
  mcpUrl: string;
} {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      'gw-url': { type: 'string' },
      'app-origin': { type: 'string' },
      'mcp-url': { type: 'string' },
    },
    strict: true,
  });
  const required = (name: 'port' | 'gw-url' | 'app-origin' | 'mcp-url'): string => {
    const value = values[name];
    if (value === undefined || value === '') throw new Error(`--${name} is required`);
    return value;
  };
  const port = Number(required('port'));
  if (!Number.isInteger(port) || port < 0) throw new Error('--port must be a non-negative integer');
  return {
    port,
    gwUrl: required('gw-url'),
    appOrigin: new URL(required('app-origin')).origin,
    mcpUrl: required('mcp-url'),
  };
}

/**
 * Serves be-01 with one activated organization on a workstation, for running
 * agents with API keys against a local stack (issue #669 F5). Agents connect
 * over MCP: a local mcp-01 at `--mcp-url` exchanges each key for a token
 * (`wbs-mcp-agent-surface` task 7.0), so this composes machine grants with
 * {@link TEST_MACHINE_GRANT_ENV}'s public fixture secret and grant key, and
 * that mcp-01's authorization server.
 *
 * `main.ts` cannot do this alone: `AUTH_MODE=local` makes every request the
 * fixed `local-dev` identity, so an API key never authenticates, and nothing
 * creates an organization or commits the activation marker. This boots the
 * production composition (`bootBe01`, native password sessions, the browser
 * session authority) over a fresh migrated SQLite file, listening on
 * 127.0.0.1 only, registers `owner`, makes it `super_admin` of `org-local`
 * and activates.
 *
 * Development only, with fixture secrets: it lives in `src/dev`, which
 * `.dockerignore` keeps out of the image, and `production-entrypoint.test.ts`
 * asserts `main.ts` cannot reach it. Run it and the rest of the stack as
 * `docs/local-dev.md` ("An activated organization") says.
 *
 * @throws when boot or the owner's registration fails, after stopping what
 *   started and deleting the database directory; the process then exits 1.
 */
async function serveActivatedOrganization({
  port,
  gwUrl,
  appOrigin,
  mcpUrl,
}: ReturnType<typeof listenerFromArguments>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-activated-organization-'));
  const dbPath = join(directory, 'local.db');
  let running: RunningBe | undefined;
  try {
    runMigrations(dbPath, new URL('../../drizzle', import.meta.url).pathname);
    running = await bootBe01(
      {
        appOrigin,
        dbPath,
        port,
        logger: createLogger({ service: 'be-01', level: 'info' }),
        jwtKey: TEST_JWT_KEY,
        gwUrl,
        internalAuthSecret: BOOTED_INTERNAL_SECRET,
        browserSessionAuthority: 'enabled',
        organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
        // Proof: without these settings, `issues an agent's key a token at the local
        // mcp-01…` (activated-organization-server.test.ts) saw `mcp token` exit 1 on the
        // token endpoint's HTTP 502 server_error; watched 2026-10-29.
        mcpService: loadMcpServiceSettings({
          ...TEST_MACHINE_GRANT_ENV,
          WBS_MCP_AUTHORIZATION_SERVER: mcpAuthorizationServerOf(mcpUrl),
          INTERNAL_AUTH_SECRET: BOOTED_INTERNAL_SECRET,
        }),
      },
      {
        openSource: openSqliteSource,
        // Proof: with Elysia's default listener here, `serves the owner an
        // activated organization on loopback…` (activated-organization-server.test.ts)
        // reached the server on the host's LAN address; watched 2026-10-24.
        startListener: (server, listenPort, ready) =>
          server.listen({ port: listenPort, hostname: HOSTNAME }, ready),
      },
    );
    const origin = `http://${HOSTNAME}:${String(running.port)}`;
    const ownerId = await registerOwner(origin, appOrigin);
    const sqlite = openDatabase(dbPath);
    try {
      insertOrganization(sqlite, ORGANIZATION);
      insertMembership(sqlite, ORGANIZATION, ownerId, 'super_admin');
      activateOrganizations(sqlite);
    } finally {
      sqlite.close();
    }
    console.log(
      `${BANNER}: ${origin}; sign in as ${OWNER.username} / ${OWNER.password}; organization ${ORGANIZATION}; database ${dbPath}; mcp-01 at ${mcpUrl} with MCP_BE_INTERNAL_SECRET=${MCP_SECRET}`,
    );
  } catch (cause) {
    // Proof: with this cleanup removed, `deletes its database directory when
    // it cannot start` (activated-organization-server.test.ts) found
    // `wbs-activated-organization-*` left in the child's TMPDIR; watched
    // 2026-10-24.
    await running?.stop();
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }

  const stopping = running;
  async function stop(): Promise<void> {
    await stopping.stop();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void stop();
    });
  }
}

/**
 * Registers {@link OWNER} through the mounted route.
 *
 * @throws when registration does not answer 2xx with the account's id.
 */
async function registerOwner(origin: string, appOrigin: string): Promise<string> {
  const registered = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { origin: appOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(OWNER),
  });
  const account: unknown = await registered.json();
  const ownerId =
    typeof account === 'object' &&
    account !== null &&
    'user' in account &&
    typeof account.user === 'object' &&
    account.user !== null &&
    'id' in account.user &&
    typeof account.user.id === 'string'
      ? account.user.id
      : null;
  if (!registered.ok || ownerId === null)
    throw new Error(`registering ${OWNER.username} answered ${String(registered.status)}`);
  return ownerId;
}

await serveActivatedOrganization(listenerFromArguments());
