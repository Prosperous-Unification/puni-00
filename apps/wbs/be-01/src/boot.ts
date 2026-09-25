import { buildOidcVerifier } from '@wbs/auth';
import type { Logger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { DiBag } from 'di-bag';

import { buildApp } from './app';
import type { OidcRouteOptions } from './controller/oidc-options';
import { readDeployedCommit } from './deployed-commit';
import { OPEN } from './repository/gate';
import { probeSchema } from './repository/health-probe';
import { runMigrations } from './repository/migrate';
import { UserRepository } from './repository/user';
import type { AuthenticatedUser } from './service/auth.service';
import { type BeServices, buildServices, type OptimizerRuntime } from './services';

export interface BootOptions {
  appOrigin: string;
  dbPath: string;
  port: number;
  logger: Logger;
  jwtKey: string;
  gwUrl: string;
  internalAuthSecret: string;
  oidc?: OidcRouteOptions;
  localIdentity?: AuthenticatedUser;
  version?: string;
  /**
   * Local dev only, and off by default.
   *
   * A deployed container must not migrate at startup: blue and green share one
   * SQLite file during the swap overlap, so migrating on boot means green starts
   * rewriting the schema the instant the container is up — before the swap
   * executor's discrete `migrate` step, before the health gate, while blue is
   * still serving against it. The deploy path runs `migrate-cli.ts` as its own
   * step instead, strictly before anything polls `/health`.
   */
  migrateOnStartup?: boolean;
  migrationsFolder?: string;
  /**
   * Where to start looking for the checkout `/health` should name the commit of.
   *
   * Defaults to the process's working directory, which for a served tier is
   * `apps/wbs/be-01` — the reader walks up from there. It is an option only so a
   * test can point it at a repository it built itself; nothing in a deployment
   * sets it.
   */
  commitDir?: string;
  /** The installed solver process boundary, absent only in tests that do not exercise it. */
  optimizer?: OptimizerRuntime;
}

export interface RunningBe {
  services: BeServices;
  port: number;
  stop: () => Promise<void>;
}

interface BootDependencies {
  /** Opens the source whose lifetime this boot owns. */
  readonly openSource: typeof openSqliteSource;
}

/** The opened source, named through the seam so a test double satisfies the same type. */
type OwnedSource = ReturnType<BootDependencies['openSource']>;

/** The mounted application, named without restating Elysia's generic instantiation. */
type BuiltApp = ReturnType<typeof buildApp>;

/**
 * Everything between an empty process and a serving be-01.
 *
 * It is a function, and it is tested. `retention.start()` living in a top-level
 * script meant "the timer is running in production" was a claim no test could
 * reach — the same shape of gap as the `runRetention` that had no caller at all.
 *
 * **It owns what it acquires.** The bag below opens the source, composes the
 * services, starts the retention timer and mounts the listener, in that order,
 * and releases them in the reverse of it. A step that fails takes the whole
 * startup down with it and gives back every resource the earlier steps took;
 * that is why this is `async` — `source.close()` and `retention.stop()` are
 * promises, and a synchronous boot could not wait for them before rethrowing.
 * It rejects with `DiBagStartupError`, whose `cause` is the original failure.
 */
export async function bootBe01(
  opts: BootOptions,
  dependencies: BootDependencies = { openSource: openSqliteSource },
): Promise<RunningBe> {
  const state = { migrationsApplied: false };
  const bag = await DiBag.createBuilder()
    .withServices({
      // One connection for the process, opened through `openDrizzle` so the
      // per-connection pragmas (WAL, busy_timeout) are set and asserted.
      // Proof: on 2026-09-20, dropping this disposal made the occupied-port
      // test report `Expected: 1`, `Received: 0` source closes (0 pass, 1 fail).
      source: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(
          (): OwnedSource => dependencies.openSource({ dbPath: opts.dbPath }),
          { factoryReturnKind: 'sync-value' },
        ),
        // Proof: on 2026-09-20, swallowing this refusal produced no cleanup
        // error: expected `DiBagCleanupError`, received `undefined`.
        disposeService: (source) => source.close(),
      }),
      services: DiBag.createProvider(
        ({ source }: { source: OwnedSource }): BeServices =>
          buildServices({
            source,
            logger: opts.logger,
            jwtKey: opts.jwtKey,
            gwUrl: opts.gwUrl,
            internalAuthSecret: opts.internalAuthSecret,
            pushFetch: globalThis.fetch,
            oidc:
              opts.oidc === undefined
                ? undefined
                : buildOidcVerifier(opts.oidc.verifier, opts.oidc),
            passwordSessions: opts.oidc !== undefined && opts.oidc.passwordLoginEnabled !== false,
            localIdentity: opts.localIdentity,
            optimizer: opts.optimizer,
          }),
        { factoryReturnKind: 'sync-value' },
      ),
      // Registered rather than started beside `listen`: a timer nobody stops
      // outlives the file it sweeps, so what starts it is now what the bag can
      // stop, and it stops before the source closes because it depends on it.
      retention: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(
          ({ services }: { services: BeServices }): BeServices['retention'] => {
            services.retention.start();
            return services.retention;
          },
          { factoryReturnKind: 'sync-value' },
        ),
        // Proof: on 2026-09-20, dropping this disposal made the refused-release
        // test report `Expected: false`, `Received: true` for timer activity.
        disposeService: (retention) => retention.stop(),
      }),
      // The listener is the last thing acquired and the first thing released.
      // `providerWithDisposal` owns the app this returns; the pushed disposers own what
      // the factory took on the way, so a failure between `listen` and the
      // optimizer releases both at once instead of leaving a bound socket.
      // Pushed disposers run last first, after the `providerWithDisposal` one: app.stop,
      // optimizer.stop, retention.stop, source.close — the order this process
      // has always shut down in.
      server: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(
          (
            {
              source,
              services,
              retention: _retention,
            }: {
              source: OwnedSource;
              services: BeServices;
              // Read for its edge, not its value: it is what puts the timer's
              // disposer after the listener's. Drop it and the timer is never
              // started at all.
              // Proof: on 2026-09-20, dropping this edge made the timer test
              // report `Expected: true`, `Received: false` (0 pass, 1 fail).
              retention: BeServices['retention'];
            },
            factoryCtx,
          ): BuiltApp => {
            const db = source.db;
            const app = buildApp({
              appOrigin: opts.appOrigin,
              clock: services.clock,
              get migrationsApplied() {
                return state.migrationsApplied;
              },
              auth: services.auth,
              // Proof: constructing a second LoginThrottle here made
              // boot.db.test.ts receive HTTP 401 instead of 429 (0 pass, 1 fail,
              // 13 filtered).
              loginThrottle: services.loginThrottle,
              oidc: opts.oidc,
              projects: services.projects,
              steps: services.steps,
              calendarMarkers: services.calendarMarkers,
              workItems: services.workItems,
              optimizer: services.optimizer,
              savedPlans: services.savedPlans,
              directory: services.directory,
              capacity: services.capacity,
              priorityBands: services.priorityBands,
              history: services.history,
              replay: services.replay,
              probeDatabase: () => probeSchema(db),
              writes: {
                imports: services.imports,
                uow: services.uow,
                // The batch's own services, over stores that hold no turn: the
                // runner takes the process's one turn for the whole batch, and
                // a store of its own that asked for another would wait for the
                // batch itself.
                batch: services.batch,
                announcements: services.announcements,
              },
              // Read per call, not captured here: dev's deploy is a `git reset`
              // under live watchers, so this process outlives the commit it
              // started on.
              deployedCommit: () => readDeployedCommit(opts.commitDir),
              internalAuthSecret: opts.internalAuthSecret,
              version: opts.version,
            });
            // Pushed before `listen`, because from here on there is something
            // to give back. On the clean path the `providerWithDisposal` below stops the
            // app and this sees `service-disposed` and does nothing.
            // Proof: on 2026-09-20, deleting this push made startup rollback
            // report `Expected: true`, `Received: false` for a refused port.
            factoryCtx.pushDisposer(async (disposerCtx) => {
              if (disposerCtx.reason !== 'service-disposed') await app.stop();
            });
            // Elysia runs this callback inline, before `listen` returns, so the
            // schema step and the identity write happen exactly where they did —
            // and a throw in either still leaves this factory, which is now what
            // releases the socket above.
            app.listen(opts.port, () => {
              if (opts.migrateOnStartup !== true) {
                opts.logger.info(
                  { port: opts.port },
                  'be-01 listening (schema managed by the deploy pipeline)',
                );
              } else {
                opts.logger.info({ port: opts.port }, 'be-01 listening (migrating)');
                runMigrations(opts.dbPath, opts.migrationsFolder ?? './drizzle');
              }
              if (opts.localIdentity !== undefined) {
                // The one write in the tree whose author is the row it writes:
                // the fixed local-mode account brings itself into existence, so
                // it is its own `created_by`. `Date.now()` rather than an
                // injected clock because boot is not a service and has none —
                // the rule the stamp exists for is that the *repository* reads
                // no clock, and this is the caller.
                //
                // **This has to finish before the first write, and it does.**
                // Every audit column's `created_by` references `users(id)` with
                // foreign keys on, so a write attributed to this identity before
                // its row exists is a `FOREIGN KEY constraint failed` rather
                // than a quiet null. `/health` answers 503 `migrating` until the
                // flag below, and both things that send the first request wait
                // for a 200 first: Playwright's `webServer` does, and so does
                // the deploy poller before it routes traffic to green. `OPEN`:
                // this runs before the first request is served, so there is no
                // batch for this write to land inside and no turn to wait for.
                new UserRepository(db, OPEN).ensureLocalIdentity(opts.localIdentity, {
                  at: Date.now(),
                  by: opts.localIdentity.id,
                });
              }
            });
            services.optimizer?.start();
            factoryCtx.pushDisposer(async () => {
              await services.optimizer?.stop();
            });
            state.migrationsApplied = true;
            if (opts.migrateOnStartup === true) opts.logger.info('migrations applied');
            return app;
          },
          { factoryReturnKind: 'sync-value', factoryReceivesContext: true },
        ),
        // A block body, not `(app) => app.stop()`: Elysia's `stop()` resolves to
        // the application, and a disposer must resolve to nothing.
        // Proof: on 2026-09-20, replacing `app.stop()` with a resolved promise
        // made source close observe `Expected: true`, `Received: false`.
        disposeService: async (app) => {
          await app.stop();
        },
      }),
    })
    .buildContainer()
    .ensureServicesReady(['server']);

  const services = bag.resolve('services');
  const app = bag.resolve('server');

  return {
    services,
    port: app.server?.port ?? opts.port,
    /**
     * Releases in the reverse of the start order: the listener stops accepting,
     * then the optimizer, then the retention sweep is waited out, then the file
     * is closed.
     *
     * Proof: closing first made the boot lifecycle test observe both
     * `optimizerRunning: true` and `retentionRunning: true` at source close
     * (0 pass, 1 fail, 14 filtered, 1 assertion).
     *
     * A disposer that rejects makes this reject with `DiBagDisposalError`, whose
     * `failures` name the resource; every other release is still attempted.
     * Repeated calls do not rerun disposers. They replay the first close's
     * outcome, including its cleanup error.
     */
    stop: () => bag.close(),
  };
}
