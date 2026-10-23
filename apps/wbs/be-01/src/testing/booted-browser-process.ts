import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WorkItemService,
  type WorkItemServiceOptions,
} from '@wbs/core/module/work-item/work-item.resource';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';

import { type AppOptions, buildApp } from '../app';
import { bootBe01, type BootOptions, type RunningBe } from '../boot';
import type { DelegationKeys } from '../config';
import type { OidcRouteOptions } from '../controller/oidc-options';
import { openDatabase } from '../repository/db';
import { runMigrations } from '../repository/migrate';
import type { DnsTransport } from '../runtime/authoritative-dns/resolver';
import type { EmailDeliveryConfig } from '../runtime/email-delivery-config';
import { TEST_JWT_KEY } from './auth-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './organization-limits-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** The trusted origin every request from {@link BootedBrowserProcess} carries. */
export const BOOTED_ORIGIN = 'http://localhost';

/** The gateway secret the booted composition checks on internal routes. */
export const BOOTED_INTERNAL_SECRET = 'x'.repeat(32);

/**
 * be-01 as `bootBe01` composes it for production, over a fresh migrated file.
 *
 * By default only the socket is skipped: requests reach `bootBe01`'s composed
 * app through `handle`. The optional synthetic-command callback replaces the
 * app's batch work-item authoring and dependency-client admission only in this
 * test fixture; it does not change the production boot composition.
 */
export class BootedBrowserProcess {
  private readonly tokens = new Map<string, string>();
  private readonly ids = new Map<string, string>();

  private constructor(
    private readonly dir: string,
    private readonly running: RunningBe,
    readonly app: ReturnType<typeof buildApp>,
    /** The options boot handed to `buildApp`, for composition assertions. */
    readonly options: AppOptions,
    /** A raw connection the app does not hold, as a second process would. */
    readonly sqlite: ReturnType<typeof openDatabase>,
  ) {}

  static async open(
    browserSessionAuthority: BootOptions['browserSessionAuthority'],
    oidc?: OidcRouteOptions,
    appOrigin = BOOTED_ORIGIN,
    dns?: { readonly resolvers?: readonly string[]; readonly transport?: DnsTransport },
    emailDelivery?: EmailDeliveryConfig,
    delegationKeys?: DelegationKeys,
    syntheticExternalCommands?: () => boolean,
  ): Promise<BootedBrowserProcess> {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-booted-browser-'));
    const dbPath = join(dir, 'test.db');
    runMigrations(dbPath, FOLDER);
    let composed: { app: ReturnType<typeof buildApp>; options: AppOptions } | undefined;
    const running = await bootBe01(
      {
        appOrigin: oidc?.appOrigin ?? appOrigin,
        dbPath,
        port: 0,
        logger: createLogger({ service: 'be-01', level: 'error' }),
        jwtKey: TEST_JWT_KEY,
        gwUrl: 'http://gw.invalid',
        internalAuthSecret: BOOTED_INTERNAL_SECRET,
        browserSessionAuthority,
        organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
        emailDelivery,
        delegationKeys,
        oidc,
        commitDir: dir,
        organizationDnsResolvers: dns?.resolvers,
      },
      {
        openSource: openSqliteSource,
        dnsTransport: dns?.transport,
        makeApp: (options) => {
          const composedOptions: AppOptions =
            syntheticExternalCommands === undefined
              ? options
              : {
                  ...options,
                  // Only this fixture substitutes the activation client gate: the installed
                  // backend intentionally advertises no connected semantics yet.
                  admitDependencyClient: (claim) =>
                    syntheticExternalCommands() ? null : options.admitDependencyClient(claim),
                  writes: {
                    ...options.writes,
                    batch: (...args) => {
                      const services = options.writes.batch(...args);
                      if (!syntheticExternalCommands()) return services;
                      // This fixture receives the concrete WorkItemService built by boot's
                      // batch factory. Its constructor retains these options; clone them so
                      // only this admitted command scope gets synthetic authoring authority.
                      const retainedOptions: unknown = Reflect.get(services.workItems, 'opts');
                      if (typeof retainedOptions !== 'object' || retainedOptions === null)
                        throw new Error('booted batch did not retain work-item options');
                      // The boot batch factory constructed this exact class and stores its
                      // constructor argument as `opts`; the shape check above guards absence.
                      const workItemOptions = retainedOptions as WorkItemServiceOptions;
                      return {
                        ...services,
                        workItems: new WorkItemService({
                          ...workItemOptions,
                          externalDependencyAuthoring: { state: 'active' },
                        }),
                      };
                    },
                  },
                };
          const app = buildApp(composedOptions);
          // No socket was opened, so there is no server for Elysia to stop.
          app.stop = () => Promise.resolve(app);
          composed = { app, options: composedOptions };
          return app;
        },
        startListener: (_app, _port, ready) => {
          ready();
        },
      },
    );
    if (composed === undefined) throw new Error('boot did not compose an app');
    return new BootedBrowserProcess(
      dir,
      running,
      composed.app,
      composed.options,
      openDatabase(dbPath),
    );
  }

  /** The migrated file the booted app serves, for a CLI run as a separate process. */
  databasePath(): string {
    return join(this.dir, 'test.db');
  }

  async close(): Promise<void> {
    this.sqlite.close();
    await this.running.stop();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** Registers `username` through the mounted route and keeps its native token. */
  async register(username: string): Promise<void> {
    const res = await this.app.handle(
      new Request(`${this.options.appOrigin}/api/auth/register`, {
        method: 'POST',
        headers: { origin: this.options.appOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: 'correct-horse' }),
      }),
    );
    const body = (await res.json()) as { token?: unknown; user?: { id?: unknown } };
    if (typeof body.token !== 'string' || typeof body.user?.id !== 'string')
      throw new Error(`register did not answer with a token and user: ${JSON.stringify(body)}`);
    this.tokens.set(username, body.token);
    this.ids.set(username, body.user.id);
  }

  token(username: string): string {
    const found = this.tokens.get(username);
    if (found === undefined) throw new Error(`${username} was never registered`);
    return found;
  }

  userId(username: string): string {
    const found = this.ids.get(username);
    if (found === undefined) throw new Error(`${username} was never registered`);
    return found;
  }

  organization(id: string): void {
    this.sqlite.run('INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1)', [id, id]);
  }

  member(organizationId: string, username: string, role: string): void {
    this.sqlite.run(
      'INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES (?, ?, ?, 1)',
      [organizationId, this.userId(username), role],
    );
  }

  activate(): void {
    this.sqlite.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  }
}
