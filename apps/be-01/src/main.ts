import { createLogger } from '@wbs/observability';

import { buildApp } from './app';
import { loadConfig } from './config';
import { runMigrations } from './repository/migrate';

const cfg = loadConfig();
const logger = createLogger({ service: 'be-01', level: cfg.LOG_LEVEL });

const state = { migrationsApplied: false };
const app = buildApp({
  get migrationsApplied() {
    return state.migrationsApplied;
  },
  internalAuthSecret: cfg.INTERNAL_AUTH_SECRET,
  version: process.env['VERSION'],
});

app.listen(cfg.PORT, () => {
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
