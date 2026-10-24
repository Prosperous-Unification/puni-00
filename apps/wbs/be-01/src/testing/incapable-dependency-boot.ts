import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from '@wbs/store-sqlite/testing/dependency-capability';
import { mock } from 'bun:test';

import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './organization-limits-fixture';

const dbPath = process.argv.at(2);
const migrate = process.argv.at(3);
const migrationsFolder = process.argv.at(4);
if (
  dbPath === undefined ||
  migrationsFolder === undefined ||
  (migrate !== 'true' && migrate !== 'false')
)
  throw new Error('incapable binary fixture requires database, migration choice and folder');
// A separate process models installed old binary bytes, never a deployment configuration switch.
await mock.module(new URL('../runtime/dependency-support.ts', import.meta.url).pathname, () => ({
  BACKEND_DEPENDENCY_CAPABILITY: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
}));
const { bootBe01 } = await import('../boot');
const { buildApp } = await import('../app');
const starts: string[] = [];
let closes = 0;
let failed = false;
const causes: string[] = [];
let running: Awaited<ReturnType<typeof bootBe01>> | undefined;
try {
  running = await bootBe01(
    {
      appOrigin: 'http://localhost',
      dbPath,
      port: 0,
      logger: createLogger({ service: 'be-01', level: 'error' }),
      jwtKey: 'k'.repeat(32),
      gwUrl: 'http://gw.invalid',
      internalAuthSecret: 's'.repeat(32),
      browserSessionAuthority: 'disabled',
      organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
      organizationDomainProofScheduling: 'disabled',
      migrateOnStartup: migrate === 'true',
      migrationsFolder,
      localIdentity: { id: 'local-dev', username: 'local-dev', scopes: ['read', 'write'] },
    },
    {
      openSource: (configuration) => {
        const source = openSqliteSource(configuration);
        return {
          ...source,
          get stores() {
            starts.push('services');
            return source.stores;
          },
          get gate() {
            starts.push('browser');
            return source.gate;
          },
          close: async () => {
            closes++;
            await source.close();
          },
        };
      },
      makeApp: (configuration) => {
        starts.push('app');
        const app = buildApp(configuration);
        app.stop = () => Promise.resolve(app);
        return app;
      },
      startListener: (_app, _port, ready) => {
        starts.push('listener');
        ready();
      },
    },
  );
} catch (cause) {
  failed = true;
  let current: unknown = cause;
  while (current instanceof Error) {
    causes.push(current.message);
    current = current.cause;
  }
}
await running?.stop();
console.log(JSON.stringify({ failed, starts, closes, causes }));
