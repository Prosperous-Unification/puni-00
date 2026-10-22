import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { ROOT } from './lib/docker';
import { planSwap } from './lib/reconcile';
import { execute, type SwapExecutionIo } from './swap';

const backend = new URL('../../../apps/wbs/be-01/', import.meta.url).pathname;
const activation = '20261014140000_add_step_blockage_activation';
const oldId = 'a'.repeat(64);
const maintenanceId = 'd'.repeat(64);
const image = `registry/wbs-be-01@sha256:${'b'.repeat(64)}`;

for (const fault of ['none', 'migration-interruption'] as const) {
  test(`authentic predecessor maintenance ${fault} precedes nonmigrating application boot`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'compose-predecessor-'));
    const database = join(root, 'plan.db');
    try {
      cpSync(join(backend, 'drizzle'), join(root, 'drizzle'), { recursive: true });
      rmSync(join(root, 'drizzle', activation), { recursive: true });
      rmSync(join(root, 'drizzle', '20261015100000_add_step_blockage_activation_receipt'), {
        recursive: true,
      });
      const cli = (file: string, args: string[]) =>
        Bun.spawnSync([process.execPath, 'run', join(backend, file), ...args], {
          cwd: root,
          env: { ...process.env, DB_PATH: database },
          stdout: 'pipe',
          stderr: 'pipe',
        });
      const predecessor = cli('src/migrate-cli.ts', []);
      expect(predecessor.exitCode).toBe(0);
      const bootProgram = `
        import { bootBe01 } from ${JSON.stringify(join(backend, 'src/boot.ts'))};
        import { buildApp } from ${JSON.stringify(join(backend, 'src/app.ts'))};
        import { createLogger } from ${JSON.stringify(new URL('../../../libs/wbs/adapters/observability/src/index.ts', import.meta.url).pathname)};
        import { openSqliteSource } from ${JSON.stringify(new URL('../../../libs/wbs/adapters/store-sqlite/src/source.ts', import.meta.url).pathname)};
        try {
          const running = await bootBe01({ appOrigin: 'http://localhost', dbPath: ${JSON.stringify(database)}, port: 0, logger: createLogger({ service: 'be-01' }), jwtKey: 'k'.repeat(32), gwUrl: 'http://gw.invalid', internalAuthSecret: 's'.repeat(32), browserSessionAuthority: 'disabled', organizationDefaultLimits: { maxAgentPersons: 50, maxConcurrentClaims: 200, maxCapacityUnitsPerResource: 10000 }, migrateOnStartup: false }, {
            openSource: openSqliteSource,
            makeApp: options => { const app = buildApp(options); app.stop = () => Promise.resolve(app); return app; },
            startListener: (_app, _port, ready) => ready(),
          });
          await running.stop();
          console.log('BOOT_COMPLETE');
        } catch (failure) {
          for (let cause = failure; cause instanceof Error; cause = cause.cause) console.error(cause.message);
          process.exit(1);
        }
      `;
      const boot = () =>
        Bun.spawnSync([process.execPath, '--eval', bootProgram], {
          cwd: root,
          env: process.env,
          stdout: 'pipe',
          stderr: 'pipe',
        });
      const premature = boot();
      expect(premature.exitCode).toBe(1);
      expect(premature.stderr.toString()).toContain('missing step blockage activation migration');
      cpSync(join(backend, 'drizzle', activation), join(root, 'drizzle', activation), {
        recursive: true,
      });
      const order: string[] = [];
      let stopped = false;
      let booted = false;
      const command = (args: string[]): string => {
        if (args[0] === 'image' && args[3] === '{{json .}}')
          return JSON.stringify({ Id: `sha256:${'b'.repeat(64)}` });
        if (args[0] === 'image') return image;
        if (args[0] === 'run') return '[]';
        if (args[0] === 'ps') return oldId;
        if (
          args[0] === 'inspect' &&
          (args[1] === oldId || (args[1] === '--type' && args[3] === oldId))
        )
          return JSON.stringify([
            {
              Id: oldId,
              Image: `sha256:${'b'.repeat(64)}`,
              Name: '/be-01-blue',
              Config: { Image: image, Env: ['DB_PATH=/data/plan.db'] },
              Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, Destination: '/data', RW: true }],
            },
          ]);
        if (args[0] === 'stop') {
          if (args[1] === oldId) stopped = true;
          else {
            expect(args[1]).toBe(maintenanceId);
            order.push('stop-maintenance');
          }
          return '';
        }
        if (args[0] === 'inspect')
          return JSON.stringify({
            Id: args[3] === maintenanceId ? maintenanceId : oldId,
            State: {
              Running: args[3] === maintenanceId ? false : !stopped,
              Paused: false,
              Restarting: false,
              Status: stopped ? 'exited' : 'running',
            },
          });
        if (args.includes('printenv')) return '/data/plan.db';
        if (args[0] === 'exec') {
          expect(args[1]).toBe(maintenanceId);
          const file = args.at(4);
          if (file === undefined) throw new Error('missing real maintenance CLI');
          const cliArgs = args.slice(5);
          if (file === 'src/backup-db-cli.ts') {
            order.push('backup');
            cliArgs[0] = join(root, 'snapshot.db');
          }
          if (file === 'src/migrate-cli.ts') {
            order.push('migrate');
            expect(readFileSync(join(root, 'be-writer-migration.json'), 'utf8')).toContain(
              'sha256',
            );
            expect(() => readFileSync(join(root, 'be-writer-exposure.json'))).toThrow();
          }
          const child = cli(file, cliArgs);
          if (child.exitCode !== 0) throw new Error(child.stderr.toString());
          if (file === 'src/backup-db-cli.ts') {
            const report: unknown = JSON.parse(child.stdout.toString());
            if (report === null || typeof report !== 'object')
              throw new Error('snapshot report malformed');
            return JSON.stringify({ ...report, path: args.at(-1) });
          }
          if (file === 'src/migrate-cli.ts' && fault === 'migration-interruption')
            throw new Error('interrupted after forward migration');
          return child.stdout.toString();
        }
        throw new Error(`unexpected command ${args.join(' ')}`);
      };
      const io: SwapExecutionIo = {
        barrierStateDir: root,
        captureStateDir: root,
        namespaceProof: () => Promise.resolve(),
        resolveMount: (path) => Promise.resolve(path),
        readPhase: () => Promise.resolve('committed'),
        writePhase: () => Promise.resolve(),
        writeAtomic: () => Promise.resolve(),
        prepareBackend: () =>
          Promise.resolve({
            databasePath: '/data/plan.db',
            databaseHostPath: `${ROOT}/data/plan.db`,
            imageId: `sha256:${'b'.repeat(64)}`,
            snapshots: {
              application: { path: '/app.json', sha256: 'e'.repeat(64) },
              maintenance: { path: '/maintenance.json', sha256: 'f'.repeat(64) },
            },
            startMaintenance: () => {
              order.push('maintenance');
              return Promise.resolve(maintenanceId);
            },
            verifyMaintenance: (identity) => {
              expect(identity).toBe(maintenanceId);
              return Promise.resolve();
            },
            start: () => {
              order.push('boot');
              expect(readFileSync(join(root, 'be-writer-exposure.json'), 'utf8')).toContain(image);
              const application = boot();
              if (application.exitCode !== 0) throw new Error(application.stderr.toString());
              expect(application.stdout.toString()).toContain('BOOT_COMPLETE');
              booted = true;
              return Promise.resolve();
            },
          }),
        sh: (args) => Promise.resolve(command(args)),
      };
      const plan = planSwap('be', {
        routedColor: 'blue',
        recordedColor: 'blue',
        runningColors: ['blue'],
        phase: 'committed',
      });
      const transition = execute(
        { ...plan, steps: plan.steps.slice(0, plan.steps.indexOf('stored-vocabularies')) },
        image,
        'predecessor',
        io,
      );
      if (fault === 'migration-interruption') {
        let failure = '';
        try {
          await transition;
        } catch (cause) {
          failure = String(cause);
        }
        expect(failure).toContain('interrupted after forward migration');
        expect(order).toEqual(['maintenance', 'backup', 'migrate']);
        expect(booted).toBe(false);
        expect(readFileSync(join(root, 'be-writer-migration.json'), 'utf8')).toContain(image);
        expect(() => readFileSync(join(root, 'be-writer-exposure.json'))).toThrow();
      } else {
        await transition;
        expect(order).toEqual(['maintenance', 'backup', 'migrate', 'stop-maintenance', 'boot']);
        expect(booted).toBe(true);
      }
      const sqlite = new Database(database, { readonly: true });
      try {
        expect(sqlite.query('SELECT state FROM step_blockage_activation').get()).toEqual({
          state: 'DISABLED',
        });
      } finally {
        sqlite.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}
