import { buildOidcVerifier, oidcCredentialEvidence } from '@wbs/auth';
import type { DelegationIssuer } from '@wbs/core';
import type { AuthenticatedUser } from '@wbs/core/service/auth.service';
import type { Logger } from '@wbs/observability';
import {
  DomainClaimRepository,
  EmailVerificationRepository,
  EnterpriseConnectionRepository,
  InvitationRepository,
  JoinRequestRepository,
  NO_BOUND_ORGANIZATION,
  OnboardingRepository,
  openSqliteSource,
  OrganizationRepository,
  ProvisioningTokenRepository,
  ScimUserRepository,
  SessionPolicyRepository,
  SharedPeopleRestoreApprovalRepository,
  SpaceRepository,
  SqliteBrowserAuthLifecycle,
  SqliteBrowserCredentialRevocations,
  SqliteOrganizationAccess,
  SqliteOrganizationSelection,
} from '@wbs/store-sqlite';
import { canonicalOidcEmail } from '@wbs/store-sqlite/canonical-oidc-email';
import { DrizzleEventLogStore } from '@wbs/store-sqlite/event-log';
import { readStepBlockageActivation } from '@wbs/store-sqlite/step-blockage-activation';
import { backfillStepCodes } from '@wbs/store-sqlite/step-code-backfill';
import { DiBag } from 'di-bag';

import { type AppOptions, buildApp } from './app';
import type { DelegationKeys } from './config';
import type { OidcRouteOptions } from './controller/oidc-options';
import { readDeployedCommit } from './deployed-commit';
import { OPEN } from './repository/gate';
import { probeSchema } from './repository/health-probe';
import { runMigrations } from './repository/migrate';
import { UserRepository } from './repository/user';
import { AuthoritativeDnsResolver, type DnsTransport } from './runtime/authoritative-dns/resolver';
import { SocketDnsTransport } from './runtime/authoritative-dns/transport';
import { type BackgroundFailureSource, createBackgroundFailure } from './runtime/be-supervisor';
import { REFUSE_DELEGATIONS } from './runtime/delegation';
import { REFUSE_DELEGATION_ISSUANCE } from './runtime/delegation-issuer';
import { importDelegationKeys } from './runtime/delegation-keys';
import { runDomainProofWorker, startDomainProofWorker } from './runtime/domain-proof-worker';
import { refusingEmailDelivery } from './runtime/email-delivery';
import { organizationCookieBinding } from './runtime/organization-cookie';
import {
  nativeBrowserCredentialEvidence,
  organizationCredentialEvidence,
} from './runtime/organization-credential';
import { organizationSelection } from './runtime/organization-selection';
import { type BeServices, buildServices, type OptimizerRuntime } from './services';

export interface BootOptions {
  appOrigin: string;
  dbPath: string;
  port: number;
  logger: Logger;
  jwtKey: string;
  gwUrl: string;
  internalAuthSecret: string;
  /**
   * Operator configuration, required with no default.
   *
   * `enabled` composes the shared durable browser session authority: logout,
   * OIDC refresh and credential replacement commit through the lifecycle and
   * credential revocations, and the browser organization cookie is read and
   * issued. Both are one setting because the cookie's immediate invalidation
   * on logout (decision D2) is exactly what the lifecycle provides; a bound
   * cookie without it would outlive the logout that should end it.
   *
   * `disabled` keeps the legacy routes, `NO_BOUND_ORGANIZATION` and refusing
   * selection. Before the organization activation marker both answer every
   * organization request identically, because access resolution reads the
   * marker before any binding.
   */
  browserSessionAuthority: 'enabled' | 'disabled';
  delegationKeys?: DelegationKeys;
  /** Explicit recursive IPs; absence retains the refusing domain resolver. */
  organizationDnsResolvers?: readonly string[];
  /** Defaults to enabled exactly when authoritative DNS is configured. */
  organizationDomainProofScheduling?: 'enabled' | 'disabled';
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

/**
 * The browser identity half of the app composition, chosen by
 * {@link BootOptions.browserSessionAuthority}.
 *
 * Enabled, one lifecycle, token store and provider revocation are shared by
 * the OIDC routes and the browser session authority (`app.ts` refuses any
 * disagreement), and organization selection reads the same revocation table
 * logout writes.
 */
function browserComposition(
  opts: BootOptions,
  services: BeServices,
  db: ReturnType<typeof openSqliteSource>['db'],
): Pick<AppOptions, 'oidc' | 'browserSession' | 'organizationSelection' | 'organizations'> {
  // Proof: composing the authority whatever the setting failed `keeps the
  // legacy browser composition when disabled` and the native-logout 404 case
  // in boot-browser-session.db.test.ts (3 pass, 2 fail, 2026-10-11).
  if (opts.browserSessionAuthority === 'disabled')
    return {
      oidc: opts.oidc,
      // Proof: wiring legacy access here instead made `refuses the
      // project and directory lists after activation until a session
      // binds an organization` in `boot.db.test.ts` receive 200 instead
      // of 403; watched 2026-09-27.
      organizations: new SqliteOrganizationAccess(db, NO_BOUND_ORGANIZATION, () =>
        services.clock.now(),
      ),
    };
  const revocations = new SqliteBrowserCredentialRevocations(db, services.gate);
  const lifecycle =
    opts.oidc === undefined ? undefined : new SqliteBrowserAuthLifecycle(db, services.gate);
  const oidc =
    opts.oidc === undefined || lifecycle === undefined
      ? undefined
      : // Proof: mounting `opts.oidc` unchanged made boot reject with "browser
        // lifecycle composition disagrees with OIDC routes" (`shares one
        // durable lifecycle…`, 4 pass, 1 fail, 2026-10-11).
        { ...opts.oidc, browserLifecycle: lifecycle };
  const selection = organizationSelection(
    // Proof: a marker-blind choice list made the pre-activation matrix differ
    // from the disabled composition (3 pass, 2 fail, 2026-10-11).
    new SqliteOrganizationSelection(db),
    // The native session key, under its own token type and audience, so a
    // selection cannot be presented as an access token or the reverse.
    organizationCookieBinding(opts.jwtKey),
    // Proof: a lookup that never answers revoked let the old access and
    // organization cookie pair list projects after its logout committed
    // (`refuses the whole old token…`, 4 pass, 1 fail, 2026-10-11).
    revocations,
    // The same rule evaluation resolution applies, read with membership.
    (principal, organizationId) => organizations.admitTo(principal, organizationId),
  );
  const organizations: SqliteOrganizationAccess = new SqliteOrganizationAccess(
    db,
    selection.activeOrganizationOf,
    () => services.clock.now(),
  );
  return {
    oidc,
    browserSession: {
      lifecycle,
      tokens: oidc?.tokens,
      revokeProvider: oidc?.client.revoke,
      revocations,
      verifyNativeBrowserCredential: nativeBrowserCredentialEvidence(services.auth, opts.jwtKey),
    },
    organizationSelection: selection.endpoints,
    // Proof: keeping NO_BOUND_ORGANIZATION here refused the freshly selected
    // pair with 403 before any logout (`refuses the whole old token…`, 4 pass,
    // 1 fail, 2026-10-11).
    organizations,
  };
}

export interface RunningBe {
  /** Terminal worker failure; observation immediately replays an already-latched cause. */
  readonly backgroundFailure: BackgroundFailureSource;
  services: BeServices;
  /** Remains refusing even when a matching delegation key pair is configured. */
  delegationIssuer: DelegationIssuer;
  port: number;
  stop: () => Promise<void>;
}

interface BootDependencies {
  /** Injects the scheduler clock/lifecycle while retaining the boot-owned sweep. */
  readonly startProofWorker?: typeof startDomainProofWorker;
  /** Local protocol fixtures keep the production adapter, codec and destination guards. */
  readonly dnsTransport?: DnsTransport;
  /** Opens the source whose lifetime this boot owns. */
  readonly openSource: typeof openSqliteSource;
  /** Test seam for inspecting the production app composition before listening. */
  readonly makeApp?: typeof buildApp;
  /** Test seam for exercising boot without a host socket. */
  readonly startListener?: (app: BuiltApp, port: number, ready: () => void) => void;
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
 * services, starts retention, mounts the listener and starts configured proof scheduling, in that order,
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
  // Keys are parsed even while production refuses delegation, so a broken
  // configured pair cannot hide until a later activation.
  if (opts.delegationKeys !== undefined) await importDelegationKeys(opts.delegationKeys);
  const schedulesProofs =
    opts.organizationDomainProofScheduling === undefined
      ? opts.organizationDnsResolvers !== undefined
      : opts.organizationDomainProofScheduling === 'enabled';
  // Proof: removing this guard made `enabled scheduling without authoritative
  // DNS` open SQLite and reach the listener instead of refusing configuration.
  if (schedulesProofs && opts.organizationDnsResolvers === undefined)
    throw new Error('domain proof scheduling requires authoritative DNS configuration');
  const backgroundFailure = createBackgroundFailure();
  const domainResolver =
    opts.organizationDnsResolvers === undefined
      ? undefined
      : new AuthoritativeDnsResolver(
          opts.organizationDnsResolvers,
          dependencies.dnsTransport ?? new SocketDnsTransport(),
        );
  const state = { migrationsApplied: false, stopping: false };
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
            // Proof: removing this resolver binding made the activated
            // `immediate configured sweep` fail instead of recording DNS absence.
            const domains = new DomainClaimRepository(db, services.gate, undefined, domainResolver);
            const browser = browserComposition(opts, services, db);
            const app = (dependencies.makeApp ?? buildApp)({
              appOrigin: opts.appOrigin,
              clock: services.clock,
              get migrationsApplied() {
                return state.migrationsApplied;
              },
              auth: services.auth,
              credentialEvidence: organizationCredentialEvidence(
                services.auth,
                opts.jwtKey,
                opts.oidc === undefined
                  ? undefined
                  : oidcCredentialEvidence(opts.oidc.verifier, opts.oidc),
              ),
              // Proof: constructing a second LoginThrottle here made
              // boot.db.test.ts receive HTTP 401 instead of 429 (0 pass, 1 fail,
              // 13 filtered).
              loginThrottle: services.loginThrottle,
              ...browser,
              projects: services.projects,
              memberships: new OrganizationRepository(db, services.gate),
              sharedPeopleRestoreApprovals: new SharedPeopleRestoreApprovalRepository(
                db,
                services.gate,
              ),
              // Proof: omitted binding answered configured boot's real TXT
              // acceptance with 503 dns_unavailable instead of 200 (2026-10-16).
              domains,
              sessionPolicies: new SessionPolicyRepository(db, services.gate),
              pendingMemberships: new ScimUserRepository(db, services.gate),
              enterpriseConnections: new EnterpriseConnectionRepository(db, services.gate),
              // Proof: omitting this binding made `serves SCIM provisioning
              // from the shared database once activated` (boot.db.test.ts)
              // answer a stored token 401 instead of 200; watched 2026-10-12.
              provisioning: {
                tokens: new ProvisioningTokenRepository(db, services.gate),
                users: new ScimUserRepository(db, services.gate),
                clock: services.clock,
                canonicalUserName: canonicalOidcEmail,
              },
              onboarding: new OnboardingRepository(db, services.gate),
              emailVerification: new EmailVerificationRepository(db, services.gate),
              invitations: new InvitationRepository(db, services.gate),
              joinRequests: new JoinRequestRepository(db, services.gate),
              spaces: new SpaceRepository(db, services.gate),
              // Proof: replacing this bound service with the raw rank repository
              // left the cold boot rank move without its second durable a2 event
              // in boot.db.test.ts (R5 boot-rank-binding).
              projectRanks: services.projectRanks,
              emailDelivery: refusingEmailDelivery,
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
                // Proof: omitting boot's delivery forwarding made the booted
                // cold shared command return 500 and record no downstream row.
                committedFanout: services.committedFanout,
              },
              // Read per call, not captured here: dev's deploy is a `git reset`
              // under live watchers, so this process outlives the commit it
              // started on.
              deployedCommit: () => readDeployedCommit(opts.commitDir),
              internalAuthSecret: opts.internalAuthSecret,
              // Proof: replacing this with an accepting verifier failed
              // `validates configured delegation keys before opening storage
              // and keeps issuance inactive` at the production composition
              // assertion (2026-09-28).
              delegation: REFUSE_DELEGATIONS,
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
            const startListener =
              dependencies.startListener ??
              ((server: BuiltApp, port: number, ready: () => void) => server.listen(port, ready));
            startListener(app, opts.port, () => {
              if (opts.migrateOnStartup !== true) {
                opts.logger.info(
                  { port: opts.port },
                  'be-01 listening (schema managed by the deploy pipeline)',
                );
              } else {
                opts.logger.info({ port: opts.port }, 'be-01 listening (migrating)');
                runMigrations(opts.dbPath, opts.migrationsFolder ?? './drizzle');
                // Proof: post-migration admission check omitted; missing-marker boot completed instead of refusing readiness (2026-10-14).
                readStepBlockageActivation(db);
                // The swap's post-`stop-blue` step, here because a process that
                // migrates itself has no older colour left to wait for.
                const coded = backfillStepCodes(db, new DrizzleEventLogStore(db, OPEN), Date.now());
                opts.logger.info({ coded: coded.length }, 'step codes backfilled');
              }
              if (opts.migrateOnStartup !== true) readStepBlockageActivation(db);
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
            // Proof: bypassing this selection started workers in both
            // `disabled scheduling` cases. Removing the binding made `immediate
            // configured sweep` see zero workers. Moving startup before ready
            // made failed-listener and failed-schema tests observe one worker.
            if (schedulesProofs) {
              const worker = (dependencies.startProofWorker ?? startDomainProofWorker)({
                sweep: async (signal, limit) => {
                  await runDomainProofWorker(
                    domains,
                    services.clock.now(),
                    () => services.clock.now(),
                    limit,
                    signal,
                  );
                },
              });
              factoryCtx.pushDisposer(async () => {
                state.stopping = true;
                // Proof: omitting this release left DNS un-aborted in
                // `stop aborts DNS`; removing await closed SQLite while that
                // test still held cleanup. It spans an event-loop turn because
                // ten microtasks let the missing-await mutation survive.
                await worker.stop();
              });
              void worker.completed.then(
                () => {
                  // Proof: suppressing this report hid `latches unexpected
                  // worker normal completion`; reporting during expected stop
                  // broke `stop aborts DNS`'s empty-failure assertion.
                  if (!state.stopping)
                    backgroundFailure.report(
                      new Error('domain proof worker completed before shutdown'),
                    );
                },
                (cause: unknown) => {
                  // Proof: omitting this observer hid `latches unexpected
                  // worker rejection`. Cleanup failure during stop remains terminal.
                  backgroundFailure.report(cause);
                },
              );
            }
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
        // Proof: replacing this disposer with Promise.resolve() made
        // `stop aborts DNS` observe listenerStops 0 instead of 1. The valid
        // omission reached that assertion before controlled DNS cleanup joined.
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
    backgroundFailure: backgroundFailure.source,
    services,
    // Proof (2026-09-28): replacing this binding with an accepting function
    // failed boot.db.test.ts's configured-key issuer refusal assertion.
    delegationIssuer: REFUSE_DELEGATION_ISSUANCE,
    port: app.server?.port ?? opts.port,
    /**
     * Releases in the reverse of the start order: the listener stops accepting,
     * then the proof scheduler is aborted and joined, then the optimizer and
     * retention sweep are waited out, then the file
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
    stop: () => {
      state.stopping = true;
      return bag.close();
    },
  };
}
