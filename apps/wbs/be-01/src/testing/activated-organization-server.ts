import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createLogger } from '@wbs/observability';

import { bootBe01 } from '../boot';
import { openDatabase } from '../repository/db';
import { runMigrations } from '../repository/migrate';
import { TEST_JWT_KEY } from './auth-fixture';
import { BOOTED_INTERNAL_SECRET } from './booted-browser-process';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './organization-limits-fixture';

/** Printed on start so a reader finds this process's banner in mixed logs. */
const BANNER = 'activated organization server (development only)';
const OWNER = { username: 'owner', password: 'correct-horse' } as const;
const ORGANIZATION = 'org-local';

/**
 * `--port`, `--gw-url` and `--app-origin`, each required.
 *
 * @throws naming the flag when one is missing, or when the port is not a
 *   positive integer.
 */
function listenerFromArguments(): { port: number; gwUrl: string; appOrigin: string } {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      'gw-url': { type: 'string' },
      'app-origin': { type: 'string' },
    },
    strict: true,
  });
  const required = (name: 'port' | 'gw-url' | 'app-origin'): string => {
    const value = values[name];
    if (value === undefined || value === '') throw new Error(`--${name} is required`);
    return value;
  };
  const port = Number(required('port'));
  if (!Number.isInteger(port) || port <= 0) throw new Error('--port must be a positive integer');
  return { port, gwUrl: required('gw-url'), appOrigin: new URL(required('app-origin')).origin };
}

/**
 * Serves be-01 with one activated organization on a workstation, for running
 * agents with API keys against a local stack (issue #669 F5).
 *
 * `main.ts` cannot do this alone: `AUTH_MODE=local` makes every request the
 * fixed `local-dev` identity, so an API key never authenticates, and nothing
 * creates an organization or commits the activation marker. This boots the
 * production composition (`bootBe01`, a real listener, native password
 * sessions, the browser session authority) over a fresh migrated SQLite file,
 * registers `owner`, makes it `super_admin` of `org-local` and activates.
 *
 * Development only, with fixture secrets: `main.ts` does not import this file,
 * and `production-entrypoint.test.ts` asserts the production graph never
 * reaches it. Run it and the rest of the stack as `docs/local-dev.md`
 * ("An activated organization") says.
 *
 * @throws when boot or the owner's registration fails; the process then
 *   exits 1.
 */
async function serveActivatedOrganization({
  port,
  gwUrl,
  appOrigin,
}: ReturnType<typeof listenerFromArguments>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-activated-organization-'));
  const dbPath = join(directory, 'local.db');
  runMigrations(dbPath, new URL('../../drizzle', import.meta.url).pathname);
  const running = await bootBe01({
    appOrigin,
    dbPath,
    port,
    logger: createLogger({ service: 'be-01', level: 'info' }),
    jwtKey: TEST_JWT_KEY,
    gwUrl,
    internalAuthSecret: BOOTED_INTERNAL_SECRET,
    browserSessionAuthority: 'enabled',
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
  });

  const registered = await fetch(`http://localhost:${String(running.port)}/api/auth/register`, {
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

  const sqlite = openDatabase(dbPath);
  sqlite.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [
    ORGANIZATION,
    ORGANIZATION,
  ]);
  sqlite.run(
    'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
    [ORGANIZATION, ownerId, 'super_admin'],
  );
  sqlite.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 1 WHERE singleton = 1",
  );
  sqlite.close();

  console.log(
    `${BANNER}: http://localhost:${String(running.port)}; sign in as ${OWNER.username} / ${OWNER.password}; organization ${ORGANIZATION}; database ${dbPath}`,
  );

  async function stop(): Promise<void> {
    await running.stop();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void stop();
    });
  }
}

await serveActivatedOrganization(listenerFromArguments());
