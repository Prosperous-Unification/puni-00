import { createLogger } from '@wbs/observability';

import { buildApp } from './app';
import { loadConfig } from './config';
import { openDrizzle } from './repository/db';
import { runMigrations } from './repository/migrate';
import { UserRepository } from './repository/user';
import { AuthService } from './service/auth.service';

const cfg = loadConfig();
const logger = createLogger({ service: 'be-01', level: cfg.LOG_LEVEL });

// One connection for the process, opened through `openDatabase` so the
// per-connection pragmas (WAL, busy_timeout) are set and asserted. Migrations
// below still open their own, briefly, and close it.
const db = openDrizzle(cfg.DB_PATH);
const auth = new AuthService({
  users: new UserRepository(db),
  jwtKey: cfg.JWT_SIGNING_KEY_CURRENT,
});

// Design decision 8: a deployed container must NOT migrate at startup.
// Blue and green share one SQLite file during the swap overlap, and
// migrating on boot means green starts rewriting the schema the instant
// `docker compose up` returns — before the swap executor's discrete
// `migrate` step, before the health gate, while blue is still serving reads
// and writes against it. Idempotence (re-running converges) says nothing
// about blue's in-flight queries staying compatible with the schema
// mid-migration; ordering is what decision 8 protects.
//
// The deploy path (tools/tool-remote-scripts/src/swap.ts) instead execs
// `migrate-cli.ts` as its own step, strictly before the health gate ever
// polls this process — so by the time anything checks `/health`, the schema
// is already guaranteed current by that external ordering, not by this
// process having migrated it. Nothing here needs to wait for it.
//
// Local dev (`nx run be-01:serve`) still wants the old one-process
// convenience, so it's opt-in via an env var that defaults OFF — the unsafe
// behaviour requires explicit opt-in, not the safe one. `apps/be-01/.env(.example)`
// sets MIGRATE_ON_STARTUP=true for local dev.
const migrateOnStartup = process.env['MIGRATE_ON_STARTUP'] === 'true';

const state = { migrationsApplied: false };
const app = buildApp({
  get migrationsApplied() {
    return state.migrationsApplied;
  },
  auth,
  internalAuthSecret: cfg.INTERNAL_AUTH_SECRET,
  version: process.env['VERSION'],
});

app.listen(cfg.PORT, () => {
  if (!migrateOnStartup) {
    logger.info({ port: cfg.PORT }, 'be-01 listening (schema managed by the deploy pipeline)');
    state.migrationsApplied = true;
    return;
  }
  logger.info({ port: cfg.PORT }, 'be-01 listening (migrating)');
  try {
    runMigrations(cfg.DB_PATH, './drizzle');
    state.migrationsApplied = true;
    logger.info('migrations applied');
  } catch (err) {
    logger.error({ err }, 'migrations failed');
    process.exit(1);
  }
});
