import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmdirSync,
  rmSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { isSqliteCleanupUnknown } from '@wbs/store-sqlite/sqlite-cleanup';
import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';

import { bootBe01, type BootOptions, type RunningBe } from '../boot';
import { loadConfig } from '../config';
import { installSolverLauncher } from '../module/solver-launcher/check';
import { installSolverSupervisor } from '../module/solver-supervisor/check';
import { openDatabase } from '../repository/db';
import { type BackgroundFailure, superviseBe } from '../runtime/be-supervisor';
import {
  activateOrganizations,
  insertMembership,
  insertOrganization,
} from './booted-browser-process';

/** Required fixture settings are selected explicitly; ambient .env cannot enable another authority. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`${name} is required for the ordinary browser fixture`);
  return value;
}

/** The public fixture credentials are served only on canonical HTTP loopback origins. */
function requireLoopbackOrigin(value: string, name: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.origin !== value ||
    url.port === ''
  ) {
    throw new Error(`${name} must be a canonical HTTP loopback origin with an explicit port`);
  }
  return value;
}

/** Only absence is an expected optional-node outcome; unreadable paths still throw. */
function readNode(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT')
      return undefined;
    throw cause;
  }
}

/** Throws chronological failures without discarding a thrown undefined or a secondary close failure. */
function throwFailures(failures: readonly unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Ordinary browser fixture failed', { cause: failures[0] });
}

if (required('E2E_CURRENT_COHORT') !== 'current')
  throw new Error('E2E_CURRENT_COHORT must be current');
if (required('AUTH_MODE') !== 'local' || required('BROWSER_SESSION_AUTHORITY') !== 'enabled') {
  throw new Error(
    'The ordinary fixture requires local-origin configuration and enabled native browser authority',
  );
}
const configuration = loadConfig({
  AUTH_MODE: 'local',
  BROWSER_SESSION_AUTHORITY: 'enabled',
  APP_ORIGIN: requireLoopbackOrigin(required('APP_ORIGIN'), 'APP_ORIGIN'),
  GW_URL: requireLoopbackOrigin(required('GW_URL'), 'GW_URL'),
  PORT: required('PORT'),
  DB_PATH: required('DB_PATH'),
  LOG_LEVEL: required('LOG_LEVEL'),
  JWT_SIGNING_KEY_CURRENT: required('JWT_SIGNING_KEY_CURRENT'),
  INTERNAL_AUTH_SECRET: required('INTERNAL_AUTH_SECRET'),
  ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: required('ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS'),
  ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: required(
    'ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS',
  ),
  ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: required(
    'ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE',
  ),
  MCP_BE_INTERNAL_SECRET: required('MCP_BE_INTERNAL_SECRET'),
  WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: required('WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT'),
  WBS_MCP_AUTHORIZATION_SERVER: required('WBS_MCP_AUTHORIZATION_SERVER'),
  ORGANIZATION_DOMAIN_PROOF_SCHEDULING: 'disabled',
  SOLVER_BUDGET_MS: required('SOLVER_BUDGET_MS'),
  SOLVER_SEARCH_WORKERS: required('SOLVER_SEARCH_WORKERS'),
  SOLVER_MEMORY_LIMIT_MB: required('SOLVER_MEMORY_LIMIT_MB'),
});
const callerId = required('HOSTNAME');
const dbPath = configuration.DB_PATH;
if (
  !isAbsolute(dbPath) ||
  resolve(dbPath) !== dbPath ||
  configuration.PORT < 1 ||
  configuration.PORT > 65535
) {
  throw new Error(
    'The ordinary fixture requires a canonical absolute database path and a valid nonzero listener port',
  );
}
const directory = `${dbPath}.ordinary`;
const origin = `http://localhost:${String(configuration.PORT)}`;
const organizationId = 'ordinary-organization';
const grantId = crypto.randomUUID();
const runId = crypto.randomUUID();
const logger = createLogger({ service: 'be-01', level: configuration.LOG_LEVEL });
interface OrdinaryReadiness {
  readonly version: 1;
  readonly runId: string;
  readonly databasePath: string;
  readonly stateDirectory: string;
  readonly origin: string;
  readonly appOrigin: string;
  readonly gwUrl: string;
  readonly accountId: string;
  readonly organizationId: string;
}
let running: RunningBe | undefined;
let stopAttempted = false;
let canRelease = true;
let directoryIdentity: Stats | undefined;
let databaseIdentity: Stats | undefined;
let readiness: OrdinaryReadiness | undefined;
let supervisor: ReturnType<typeof superviseBe> | undefined;
let terminalFailure: BackgroundFailure | undefined;
let isCancelled = false;
const cancellation = new Error('Ordinary bootstrap cancelled');
const failures: unknown[] = [];

/** Reads callback-mutated failure identity after awaited boot and disposal. */
function isObservedFailure(cause: unknown): boolean {
  return terminalFailure !== undefined && Object.is(cause, terminalFailure.cause);
}

/** Cancellation waits for the pending boot/disposal to transfer its actual owner before cleanup. */
function throwIfTerminated(): void {
  if (terminalFailure !== undefined) throw terminalFailure.cause;
  if (isCancelled) throw cancellation;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    isCancelled = true;
    readiness = undefined;
    if (supervisor !== undefined) void supervisor.stop();
  });
}

/** Reads each reached resource once and preserves operation/close failures in order. */
function useDatabase(operation: (sqlite: ReturnType<typeof openDatabase>) => void): void {
  let sqlite: ReturnType<typeof openDatabase> | undefined;
  const failures: unknown[] = [];
  try {
    sqlite = openDatabase(dbPath);
    operation(sqlite);
  } catch (cause) {
    if (isSqliteCleanupUnknown(cause)) canRelease = false;
    failures.push(cause);
  }
  if (sqlite !== undefined) {
    try {
      sqlite.close(true);
    } catch (cause) {
      canRelease = false;
      failures.push(cause);
    }
  }
  throwFailures(failures);
}

/**
 * Removes only the reserved file, known SQLite sidecars and the finite private state roster.
 * This fixture assumes exclusive same-user custody; replaced or unexpected nodes are retained.
 */
function releaseOwnedFiles(): void {
  if (directoryIdentity === undefined) return;
  const observedDirectory = lstatSync(directory);
  if (
    !observedDirectory.isDirectory() ||
    observedDirectory.dev !== directoryIdentity.dev ||
    observedDirectory.ino !== directoryIdentity.ino
  ) {
    throw new Error(`Ordinary fixture directory identity changed; retained ${directory}`);
  }
  const nodes = new Map<string, Stats>();
  const permitted = ['readiness.json', 'cookies.json', 'context.json'];
  for (const name of readdirSync(directory)) {
    if (!permitted.includes(name))
      throw new Error(`Unexpected ordinary state node; retained ${directory}`);
    const path = `${directory}/${name}`;
    const node = lstatSync(path);
    if (
      !node.isFile() ||
      node.nlink !== 1 ||
      node.uid !== observedDirectory.uid ||
      (node.mode & 0o777) !== 0o600
    ) {
      throw new Error(`Ordinary state node is not a private regular file; retained ${directory}`);
    }
    nodes.set(path, node);
  }
  if (databaseIdentity !== undefined) {
    const database = lstatSync(dbPath);
    if (
      !database.isFile() ||
      database.dev !== databaseIdentity.dev ||
      database.ino !== databaseIdentity.ino ||
      database.nlink !== 1
    ) {
      throw new Error(`Ordinary database identity changed; retained ${directory}`);
    }
    nodes.set(dbPath, database);
    for (const path of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      const sidecar = readNode(path);
      if (sidecar === undefined) continue;
      if (!sidecar.isFile() || sidecar.nlink !== 1 || sidecar.uid !== database.uid)
        throw new Error(`Unexpected SQLite sidecar; retained ${directory}`);
      nodes.set(path, sidecar);
    }
  }
  for (const [path, expected] of nodes) {
    const observed = lstatSync(path);
    if (observed.dev !== expected.dev || observed.ino !== expected.ino)
      throw new Error(`Ordinary cleanup node was replaced; retained ${directory}`);
    unlinkSync(path);
  }
  rmdirSync(directory);
}

/** Reads shutdown state changed by awaited boot/disposal callbacks. */
function hasStopAttempted(): boolean {
  return stopAttempted;
}

/** A failed stop retains the store; this owner never repeats an uncertain native close. */
async function stopBackend(): Promise<void> {
  readiness = undefined;
  if (running === undefined) return;
  if (stopAttempted) throw new Error(`Ordinary backend stop is uncertain; retained ${directory}`);
  stopAttempted = true;
  try {
    await running.stop();
    running = undefined;
  } catch (cause) {
    canRelease = false;
    throw cause;
  }
}

/** The same complete native/MCP/solver composition is used before and after activation. */
async function startBackend(options: BootOptions): Promise<RunningBe> {
  let booted: RunningBe;
  try {
    booted = await bootBe01(options, {
      openSource: openSqliteSource,
      startListener: (server, port, ready) => {
        server.get('/_ordinary/ready', () =>
          readiness === undefined
            ? new Response('Ordinary bootstrap is not ready', { status: 503 })
            : Response.json(readiness),
        );
        server.listen({ hostname: '127.0.0.1', port }, ready);
      },
    });
  } catch (cause) {
    // Failed boot owns its disposal internally; without a returned owner this fixture retains uncertain custody.
    canRelease = false;
    throw cause;
  }
  running = booted;
  stopAttempted = false;
  booted.backgroundFailure.observe((failure) => {
    readiness = undefined;
    if (terminalFailure === undefined) {
      terminalFailure = failure;
      failures.push(failure.cause);
    }
  });
  throwIfTerminated();
  return booted;
}

/** A successful HTTP registration supplies the persisted account; no fixed identity enters boot. */
async function registerAccount(): Promise<string> {
  const response = await fetch(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { origin: configuration.appOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'local-dev', password: 'ordinary-browser-password' }),
    signal: AbortSignal.timeout(3000),
  });
  const account: unknown = await response.json();
  if (
    response.status !== 200 ||
    typeof account !== 'object' ||
    account === null ||
    !('user' in account) ||
    typeof account.user !== 'object' ||
    account.user === null ||
    !('id' in account.user) ||
    typeof account.user.id !== 'string' ||
    account.user.id === '' ||
    account.user.id === 'local-dev'
  ) {
    throw new Error(
      `Ordinary native registration did not produce an actual account (HTTP ${String(response.status)})`,
    );
  }
  return account.user.id;
}

try {
  mkdirSync(directory, { mode: 0o700 });
  try {
    directoryIdentity = lstatSync(directory);
  } catch (cause) {
    canRelease = false;
    throw cause;
  }
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (readNode(path) !== undefined)
      throw new Error(`Ordinary fixture refuses existing store state: ${path}`);
  }
  const reservation = openSync(dbPath, 'wx', 0o600);
  const reservationFailures: unknown[] = [];
  try {
    databaseIdentity = fstatSync(reservation);
  } catch (cause) {
    canRelease = false;
    reservationFailures.push(cause);
  }
  try {
    closeSync(reservation);
  } catch (cause) {
    canRelease = false;
    reservationFailures.push(cause);
  }
  throwFailures(reservationFailures);
  try {
    const migrationDirectory = mkdtempSync(directory + '/migration-');
    const custody = { hasUnknownOwner: false };
    const migrationFailures: unknown[] = [];
    try {
      migrateEmptyCatalogueFixture(
        { path: dbPath, directory: migrationDirectory, reportedAt: Date.now() },
        custody,
      );
    } catch (cause) {
      migrationFailures.push(cause);
    }
    // Proof: an actual catalogue close refusal retained the DB and migration files;
    // omitting this guard deleted them and failed the ordinary-process retention case
    // (verification-package-step-e2e-20261120.json). Both sources were restored.
    if (custody.hasUnknownOwner) canRelease = false;
    else {
      try {
        rmSync(migrationDirectory, { recursive: true });
      } catch (cause) {
        canRelease = false;
        migrationFailures.push(cause);
      }
    }
    throwFailures(migrationFailures);
  } catch (cause) {
    if (isSqliteCleanupUnknown(cause)) canRelease = false;
    throw cause;
  }
  const { solverLauncher } = installSolverLauncher({});
  const solverVersion = solverLauncher.readRuntimeVersion(process.env.NODE_ENV);
  const options: BootOptions = {
    appOrigin: configuration.appOrigin,
    dbPath,
    port: configuration.PORT,
    logger,
    jwtKey: configuration.JWT_SIGNING_KEY_CURRENT,
    gwUrl: configuration.GW_URL,
    internalAuthSecret: configuration.INTERNAL_AUTH_SECRET,
    browserSessionAuthority: 'enabled',
    organizationDefaultLimits: configuration.organizationDefaultLimits,
    organizationDnsResolvers: configuration.organizationDnsResolvers,
    organizationDomainProofScheduling: configuration.ORGANIZATION_DOMAIN_PROOF_SCHEDULING,
    emailDelivery: configuration.emailDelivery,
    delegationKeys: configuration.delegationKeys,
    mcpService: configuration.mcpService,
    version: 'ordinary-browser',
    optimizer: {
      solverVersion,
      budgetMs: configuration.SOLVER_BUDGET_MS,
      spawn: installSolverSupervisor({
        unix: '/run/wbs-solver/supervisor.sock',
        callerId,
        searchWorkers: configuration.SOLVER_SEARCH_WORKERS,
        memoryLimitMb: configuration.SOLVER_MEMORY_LIMIT_MB,
      }).spawner,
    },
  };
  throwIfTerminated();
  await startBackend(options);
  const accountId = await registerAccount();
  throwIfTerminated();
  await stopBackend();
  throwIfTerminated();
  useDatabase((sqlite) => {
    sqlite.transaction(() => {
      insertOrganization(sqlite, organizationId);
      insertMembership(sqlite, organizationId, accountId, 'super_admin');
      sqlite.run(
        "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES(?,?,'organization',?,'user',?,'org-super-admin','route',?)",
        [grantId, organizationId, organizationId, accountId, Date.now()],
      );
      activateOrganizations(sqlite);
    })();
  });
  throwIfTerminated();
  const restarted = await startBackend(options);
  useDatabase((sqlite) => {
    const account = sqlite
      .query<{ id: string; username: string }, [string]>(
        'SELECT id, username FROM users WHERE id = ?',
      )
      .get(accountId);
    const membership = sqlite
      .query<{ role: string }, [string, string]>(
        'SELECT role FROM organization_membership WHERE organization_id = ? AND user_id = ?',
      )
      .get(organizationId, accountId);
    const grant = sqlite
      .query<{ subject_id: string; scope_id: string; role_id: string }, [string]>(
        "SELECT subject_id, scope_id, role_id FROM access_grant WHERE id = ? AND subject_kind = 'user' AND scope_kind = 'organization'",
      )
      .get(grantId);
    const activation = sqlite
      .query<{ state: string }, []>('SELECT state FROM organization_activation WHERE singleton = 1')
      .get();
    if (
      account?.id !== accountId ||
      account.username !== 'local-dev' ||
      membership?.role !== 'super_admin' ||
      grant?.subject_id !== accountId ||
      grant.scope_id !== organizationId ||
      grant.role_id !== 'org-super-admin' ||
      activation?.state !== 'activated'
    ) {
      throw new Error(
        'Ordinary restart did not retain the actual account, membership, direct grant and activation',
      );
    }
  });
  throwIfTerminated();
  readiness = {
    version: 1,
    runId,
    databasePath: dbPath,
    stateDirectory: directory,
    origin,
    appOrigin: configuration.appOrigin,
    gwUrl: configuration.GW_URL,
    accountId,
    organizationId,
  };
  writeFileSync(`${directory}/readiness.json`, JSON.stringify(readiness) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  supervisor = superviseBe(
    {
      backgroundFailure: restarted.backgroundFailure,
      stop: async () => {
        await stopBackend();
        releaseOwnedFiles();
      },
    },
    {
      exit: (code) => {
        process.exit(code);
      },
      report: (cause) => {
        readiness = undefined;
        logger.error({ err: cause }, 'Ordinary browser backend disposal or background failure');
      },
    },
  );
} catch (primary) {
  if (primary !== cancellation && !isObservedFailure(primary)) failures.push(primary);
  if (running !== undefined && !hasStopAttempted()) {
    try {
      await stopBackend();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (canRelease) {
    try {
      releaseOwnedFiles();
    } catch (cause) {
      failures.push(cause);
    }
  } else failures.push(new Error(`Ordinary fixture custody is uncertain; retained ${directory}`));
  throwFailures(failures);
  process.exit(0);
}
