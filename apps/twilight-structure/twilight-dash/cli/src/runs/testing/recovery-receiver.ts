import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { parseOrThrow, type } from '@shared/validation';
import { fetchTransport, type RuntimeState } from '@wbs/contracts';
import { createLogger } from '@wbs/observability';
import {
  openSqliteSource,
  SqliteOrganizationAccess,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite';
import { type SQL, sql } from 'drizzle-orm';

import { buildApp } from '../../../../../../wbs/be-01/src/app';
import { bootBe01, type RunningBe } from '../../../../../../wbs/be-01/src/boot';
import { runMigrations } from '../../../../../../wbs/be-01/src/repository/migrate';
import { TEST_JWT_KEY } from '../../../../../../wbs/be-01/src/testing/auth-fixture';
import { TEST_MCP_SERVICE_SETTINGS } from '../../../../../../wbs/be-01/src/testing/machine-grant-fixture';
import { OrganizationHarness } from '../../../../../../wbs/be-01/src/testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../../../../../../wbs/be-01/src/testing/organization-limits-fixture';
import { createRuntimeClient, type RuntimeClient } from '../../bridge/runtime-client';
import type { RuntimeScope } from '../runtime-records';

export interface RecoveryReceiverFixture {
  readonly client: RuntimeClient;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
  readonly workItemId: string;
  readonly stepId: string;
  readonly actorId: string;
  readonly requests: readonly { operationId: string; commandId: string | null }[];
  pause(commandId: string): { entered: Promise<void>; release(): void };
  observeRequests(
    observer: (request: { operationId: string; commandId: string | null }) => void,
  ): void;
  revokeAccess(): void;
  dropReply(commandId: string): void;
  listen(): string;
  rewriteReply(commandId: string, rewrite: (bytes: string) => string): void;
  reopen(): Promise<void>;
  inspectEffects(): unknown;
  close(): Promise<void>;
}

interface LegacyReceiverCapture {
  readonly scope: RuntimeScope;
  readonly claimRequest: {
    readonly action: { readonly workItemId: string; readonly stepId: string };
  };
  readonly writeRequest: { readonly action: { readonly claim: { readonly claimId: string } } };
}
export interface LegacyRecoveryReceiverFixture extends RecoveryReceiverFixture {
  inspectRuntime(): unknown;
  readWorkPackage(): Promise<{ readonly status: number; readonly body: unknown }>;
  deleteRuntimeTargets(): void;
  allowReadOnly(): void;
  restoreWrite(): void;
}
type ReceiverInspection = Parameters<typeof createRecoveryReceiver>[0];
/** Preserves the fresh current setup and its existing cleanup owner. */
export async function createRecoveryReceiver(
  inspectHarness?: (
    harness: Pick<OrganizationHarness, 'token' | 'closeComposed'> & {
      readonly app: Pick<OrganizationHarness['app'], 'handle'>;
    },
  ) => void,
): Promise<RecoveryReceiverFixture> {
  return createReceiver({ kind: 'fresh' }, inspectHarness);
}
/** Restores the independently captured outgoing110 database through the actual migration owner, then grants only a distinct named current caller. Historical runtime identities are never retargeted. */
export async function createLegacyRecoveryReceiver(): Promise<LegacyRecoveryReceiverFixture> {
  const base = new URL(
    '../../../../../../../openspec/changes/wbs-work-packages/fixtures/',
    import.meta.url,
  );
  const compressed = readFileSync(new URL('legacy-runtime-database1.sqlite.gz', base));
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  if (hash(compressed) !== '8f8d37a855cca7681b95617233e2f8294dea95505c4612626c0ad741d15c9071')
    throw Error('original WBS110 compressed database changed');
  const snapshot = gunzipSync(compressed);
  if (hash(snapshot) !== 'cb070a4d59e1b8dd464279f97f09e4ca804c21d1b77ff4bdcea1861ddb0e1a77')
    throw Error('original WBS110 database bytes changed');
  // Exact producer fixture SHA guards this test-only shape; no production decoding is delegated here.
  const captureBytes = readFileSync(new URL('legacy-runtime-database1.txt', base));
  if (hash(captureBytes) !== '5a887d7358e184285324a76f15e9aacc9bd935f706f54a17bc167485f3df8868')
    throw Error('original paired WBS110 identity changed');
  const capture = JSON.parse(captureBytes.toString()) as LegacyReceiverCapture;
  return createReceiver({ kind: 'legacy', snapshot, capture });
}
/** Owns the composed SQLite/controller graph and all restarted native resources; barriers stop transport before admission. */
async function createReceiver(
  setup:
    | { readonly kind: 'fresh' }
    | {
        readonly kind: 'legacy';
        readonly snapshot: Uint8Array;
        readonly capture: LegacyReceiverCapture;
      },
  inspectHarness?: ReceiverInspection,
): Promise<LegacyRecoveryReceiverFixture> {
  const harness =
    setup.kind === 'fresh'
      ? OrganizationHarness.openComposed()
      : OrganizationHarness.openComposedWith({
          migrate(path) {
            writeFileSync(path, setup.snapshot, { flag: 'wx' });
            runMigrations(
              path,
              new URL('../../../../../../wbs/be-01/drizzle', import.meta.url).pathname,
            );
          },
        });
  const username = setup.kind === 'fresh' ? 'ada' : 'current-reader';
  console.log('Task3 receiver DB root ' + dirname(harness.databasePath()));
  let mounted: Pick<OrganizationHarness['app'], 'handle'> = harness.app;
  let restarted: RunningBe | undefined;
  let reopenedSource: ReturnType<typeof openSqliteSource> | undefined;
  let isStopped = false;
  const lostReplies = new Set<string>();
  const rewrites = new Map<string, (bytes: string) => string>();
  const servers = new Set<ReturnType<typeof Bun.serve>>();
  const barriers = new Map<
    string,
    {
      entered: ReturnType<typeof Promise.withResolvers<undefined>>;
      release: ReturnType<typeof Promise.withResolvers<undefined>>;
    }
  >();
  const pending = new Set<Promise<Awaited<ReturnType<ReturnType<typeof fetchTransport>>>>>();
  const activeReleases = new Set<ReturnType<typeof Promise.withResolvers<undefined>>>();
  const observers: ((request: { operationId: string; commandId: string | null }) => void)[] = [];
  try {
    inspectHarness?.(harness);
    await harness.register(username);
    if (setup.kind === 'fresh') harness.organization('org-a');
    harness.member('org-a', username, 'admin', ['org-admin']);
    harness.bind(username, 'org-a');
    if (setup.kind === 'fresh') harness.activate();
    else harness.grantPermissions('org-a', username, ['package.read']);
    let workPackageId: string;
    let personId: string;
    let workItemId: string;
    let stepId: string;
    if (setup.kind === 'fresh') {
      const workPackage = await harness.call(username, 'POST', '/api/work-packages', {
        name: 'Recovery',
      });
      if (workPackage.status !== 200) throw new Error(JSON.stringify(workPackage));
      workPackageId = (workPackage.body as { workPackage: { id: string } }).workPackage.id;
      async function createCommand(path: string, command: unknown) {
        const answer = await harness.call(username, 'POST', path, { commands: [command] });
        if (answer.status !== 200) throw new Error(JSON.stringify(answer));
        const identity = (answer.body as { results: { id: string }[] }).results.at(0)?.id;
        if (identity === undefined) throw new Error('fixture creation identity absent');
        return identity;
      }
      personId = await createCommand('/api/directory/commands', {
        kind: 'createPerson',
        name: 'Resolver',
        teamIds: [],
      });
      workItemId = await createCommand(`/api/work-packages/${workPackageId}/commands`, {
        kind: 'createWorkItem',
        parentId: null,
        name: 'Recover',
      });
      const step = await harness.call(
        username,
        'POST',
        `/api/work-packages/${workPackageId}/steps`,
        {
          name: 'Plan',
          code: 'plan',
        },
      );
      if (step.status !== 200) throw new Error(JSON.stringify(step));
      stepId = (step.body as { step: { id: string } }).step.id;
      // Plan is the claimed activity; default Dev and QA otherwise block it with workflow FS.
      const positioned = harness.sqlite.run(
        'UPDATE step SET position = 0 WHERE id = ? AND work_package_id = ?',
        [stepId, workPackageId],
      );
      // Proof: an absent Plan ID failed "real receiver ordered effects and sender receiver reopen
      // staged-before-post" here; restoring the ID passed the same case.
      if (positioned.changes !== 1) throw new Error('fixture Plan step position was not updated');
      harness.sqlite.run("INSERT INTO external_system (id,name) VALUES ('task3','Task3')");
      harness.sqlite.run(
        "INSERT INTO external_system_organization (resource_id,organization_id,name) VALUES ('task3','org-a','Task3')",
      );
    } else {
      workPackageId = setup.capture.scope.projectId;
      personId = setup.capture.scope.personId;
      workItemId = setup.capture.claimRequest.action.workItemId;
      stepId = setup.capture.claimRequest.action.stepId;
    }
    const scope = { organizationId: 'org-a', projectId: workPackageId, personId };
    const actorId = harness.userId(username);
    const writeGrants = harness.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=? AND role_id='org-admin'",
      )
      .all(actorId);
    if (writeGrants.length !== 1) throw Error('named receiver writer grant absent');
    const writeGrant = writeGrants.at(0);
    if (writeGrant === undefined) throw Error('named receiver writer identity absent');
    let readOnly = false;
    function select(sql: string) {
      return reopenedSource === undefined
        ? harness.sqlite.query(sql).all()
        : reopenedSource.db.all(sql);
    }
    // Both selected SQL APIs own this exact id-only projection; table names are a closed fixture set.
    function readIdentities(table: 'claim' | 'work_item' | 'access_grant') {
      const statement = 'SELECT id FROM ' + table;
      return reopenedSource === undefined
        ? harness.sqlite.query<{ id: string }, []>(statement).all()
        : reopenedSource.db.all<{ id: string }>(statement);
    }
    function execute(statement: string, bindings: readonly string[], query: SQL) {
      if (reopenedSource === undefined) harness.sqlite.run(statement, [...bindings]);
      // Proof: dash-fixture-actual-write-withdrawal: suppressing the controlled named writer-grant deletion.
      // 'current RuntimeClient replays all original1 operations after actual111 migration cold reopen and deleted references with current authorization' failed; exact restoration passed.
      // Fixture setup postcondition only, not production authorization.
      else reopenedSource.db.run(query);
    }
    const requests: { operationId: string; commandId: string | null }[] = [];
    const transport = fetchTransport('http://localhost', (url, init) =>
      Promise.resolve(mounted.handle(new Request(url, init))),
    );
    const client = createRuntimeClient((shape, input) => {
      const delivery = (async () => {
        const commandId =
          shape.method === 'POST'
            ? (input.body as { commandId: string }).commandId
            : (input.params['commandId'] ?? null);
        const request = { operationId: shape.operationId, commandId };
        requests.push(request);
        for (const observer of observers) observer(request);
        const barrier = commandId === null ? undefined : barriers.get(commandId);
        if (barrier !== undefined && commandId !== null) {
          barriers.delete(commandId);
          activeReleases.add(barrier.release);
          barrier.entered.resolve(undefined);
          try {
            await waitForReceiver(barrier.release.promise);
          } finally {
            activeReleases.delete(barrier.release);
          }
        }
        const answer = await transport(shape, {
          ...input,
          headers: {
            authorization: 'Bearer ' + harness.token(username),
            origin: 'http://localhost',
            'X-WBS-Expected-Organization': 'org-a',
          },
        });
        if (commandId !== null && lostReplies.delete(commandId)) {
          if (!(answer instanceof Response))
            throw Error('receiver transport requires actual Response');
          if (answer.status !== 200) {
            console.log(
              'Task3 receiver refused write before loss ' + (await answer.clone().text()),
            );
            return answer;
          }
          await answer.arrayBuffer();
          throw Error('owned receiver reply lost after commit');
        }
        const rewrite = commandId === null ? undefined : rewrites.get(commandId);
        if (commandId !== null && rewrite !== undefined) {
          rewrites.delete(commandId);
          if (!(answer instanceof Response))
            throw Error('receiver rewrite requires actual Response');
          return new Response(rewrite(await answer.text()), {
            status: answer.status,
            headers: answer.headers,
          });
        }
        return answer;
      })();
      pending.add(delivery);
      void delivery.then(
        () => pending.delete(delivery),
        () => pending.delete(delivery),
      );
      return delivery;
    });
    const state = await client.readState({ params: { id: workPackageId }, query: { personId } });
    if (state.reply.kind !== 'success') throw new Error('receiver discovery failed');
    return {
      client,
      scope,
      ledgerId: state.reply.body.ledgerId,
      requests,
      workItemId,
      stepId,
      actorId: harness.userId(username),
      observeRequests(observer) {
        observers.push(observer);
      },
      revokeAccess() {
        if (reopenedSource !== undefined) {
          reopenedSource.db.run(
            "DELETE FROM organization_membership WHERE organization_id = 'org-a'",
          );
          return;
        }
        harness.sqlite.run("DELETE FROM organization_membership WHERE organization_id = 'org-a'");
      },
      listen() {
        const server = Bun.serve({
          hostname: '127.0.0.1',
          port: 0,
          async fetch(request) {
            if (
              request.method === 'POST' &&
              new URL(request.url).pathname.endsWith('/runtime-commands')
            ) {
              const command = parseOrThrow(
                type({ commandId: 'string' }),
                await request.clone().json(),
              );
              requests.push({ operationId: 'applyRuntimeCommands', commandId: command.commandId });
            }
            const headers = new Headers(request.headers);
            headers.set('authorization', 'Bearer ' + harness.token(username));
            headers.set('origin', 'http://localhost');
            headers.set('X-WBS-Expected-Organization', 'org-a');
            return mounted.handle(new Request(request, { headers }));
          },
        });
        servers.add(server);
        return server.url.toString();
      },
      rewriteReply(commandId, rewrite) {
        rewrites.set(commandId, rewrite);
      },
      dropReply(commandId) {
        lostReplies.add(commandId);
      },
      async readWorkPackage() {
        const response = await mounted.handle(
          new Request('http://localhost/api/work-packages/' + workPackageId, {
            headers: {
              authorization: 'Bearer ' + harness.token(username),
              origin: 'http://localhost',
              'X-WBS-Expected-Organization': 'org-a',
            },
          }),
        );
        return { status: response.status, body: await response.json() };
      },
      inspectRuntime() {
        return Object.fromEntries(
          [
            '__drizzle_migrations',
            'runtime_ledger',
            'runtime_authority',
            'runtime_claim_binding',
            'runtime_command_receipt',
            'claim',
            'work_item',
            'command_journal',
            'plan_event',
            'step_progress',
            'event_log',
            'event_sequencer',
          ].map((table) => [table, select('SELECT * FROM ' + table + ' ORDER BY rowid')]),
        );
      },
      deleteRuntimeTargets() {
        if (setup.kind !== 'legacy')
          throw Error('historical target deletion requires legacy fixture');
        if (
          !readIdentities('claim').some(
            (row) => row.id === setup.capture.writeRequest.action.claim.claimId,
          ) ||
          !readIdentities('work_item').some((row) => row.id === workItemId)
        )
          throw Error('historical receiver deletion targets absent before controlled deletion');
        execute(
          'DELETE FROM claim WHERE id = ?',
          [setup.capture.writeRequest.action.claim.claimId],
          sql`DELETE FROM claim WHERE id = ${setup.capture.writeRequest.action.claim.claimId}`,
        );
        execute(
          'DELETE FROM work_item WHERE id = ?',
          [workItemId],
          sql`DELETE FROM work_item WHERE id = ${workItemId}`,
        );
        if (
          readIdentities('claim').some(
            (row) => row.id === setup.capture.writeRequest.action.claim.claimId,
          ) ||
          readIdentities('work_item').some((row) => row.id === workItemId)
        )
          throw Error('historical receiver targets were not deleted');
      },
      allowReadOnly() {
        if (setup.kind !== 'legacy' || readOnly)
          throw Error('named receiver read-only transition invalid');
        execute(
          'DELETE FROM access_grant WHERE id = ?',
          [writeGrant.id],
          sql`DELETE FROM access_grant WHERE id = ${writeGrant.id}`,
        );
        if (readIdentities('access_grant').some((row) => row.id === writeGrant.id))
          throw Error('named receiver writer grant was not removed');
        readOnly = true;
      },
      restoreWrite() {
        if (setup.kind !== 'legacy' || !readOnly)
          throw Error('named receiver write restoration invalid');
        execute(
          "INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES (?,'org-a','organization','org-a','user',?,'org-admin','route',1)",
          [writeGrant.id, actorId],
          sql`INSERT INTO access_grant (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES (${writeGrant.id},'org-a','organization','org-a','user',${actorId},'org-admin','route',1)`,
        );
        readOnly = false;
      },
      inspectEffects() {
        const tables = [
          'work_item',
          'step_progress',
          'step_measure',
          'work_item_external_ref',
          'claim',
          'command_journal',
          'event_log',
        ];
        return tables.map((table) => ({
          table,
          rows:
            reopenedSource === undefined
              ? harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()
              : reopenedSource.db.all('SELECT * FROM ' + table + ' ORDER BY rowid'),
        }));
      },
      async reopen() {
        if (isStopped) throw Error('receiver already restarted');
        await closeRecoveryResources([], pending);
        const actorId = harness.userId(username);
        const path = await harness.stopForRecovery();
        isStopped = true;
        console.log('Task3 receiver native connections stopped ' + path);
        restarted = await bootBe01(
          {
            dbPath: path,
            port: 0,
            appOrigin: 'http://localhost',
            logger: createLogger({ service: 'be-01', level: 'error' }),
            jwtKey: TEST_JWT_KEY,
            gwUrl: 'http://gw.invalid',
            internalAuthSecret: 's'.repeat(32),
            browserSessionAuthority: 'disabled',
            organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
            mcpService: TEST_MCP_SERVICE_SETTINGS,
          },
          {
            openSource(options) {
              reopenedSource = openSqliteSource(options);
              return reopenedSource;
            },
            makeApp(options) {
              if (reopenedSource === undefined) throw Error('receiver source missing');
              const app = buildApp({
                ...options,
                workPackageObservation: reopenedSource.createWorkPackageObservation({
                  activeOrganizationOf: () =>
                    userBoundOrganizationOf((userId) =>
                      Promise.resolve(userId === actorId ? 'org-a' : null),
                    ),
                  now: Date.now,
                }),
                organizations: new SqliteOrganizationAccess(
                  reopenedSource.db,
                  userBoundOrganizationOf((userId) =>
                    Promise.resolve(userId === actorId ? 'org-a' : null),
                  ),
                  Date.now,
                ),
              });
              app.stop = () => Promise.resolve(app);
              mounted = app;
              return app;
            },
            startListener(_app, _port, ready) {
              ready();
            },
          },
        );
        console.log('Task3 receiver reopened ' + path);
      },
      pause(commandId) {
        if (barriers.has(commandId)) throw new Error('duplicate receiver barrier');
        const entered = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        barriers.set(commandId, { entered, release });
        return {
          entered: entered.promise,
          release: () => {
            release.resolve(undefined);
          },
        };
      },
      async close() {
        for (const server of servers) await server.stop(true);
        servers.clear();
        for (const barrier of barriers.values()) barrier.release.resolve(undefined);
        for (const release of activeReleases) release.resolve(undefined);
        barriers.clear();
        await closeRecoveryResources(
          [
            {
              async close() {
                if (restarted !== undefined) {
                  await restarted.stop();
                  rmSync(dirname(harness.databasePath()), { recursive: true });
                } else if (isStopped)
                  throw Error(
                    'receiver native reopen closure unknown; retained ' + harness.databasePath(),
                  );
                else await harness.closeComposed();
                console.log('Task3 receiver closed and removed ' + dirname(harness.databasePath()));
              },
            },
          ],
          pending,
        );
      },
    };
  } catch (cause) {
    // Proof: R7F06 bypassed construction aggregation; 'receiver construction ... true' lost the original inspection failure.
    await closeRecoveryResources(
      [{ close: () => harness.closeComposed() }],
      [
        Promise.resolve().then(() => {
          throw cause;
        }),
      ],
    );
    throw cause;
  }
}

export async function readReceiverState(receiver: RecoveryReceiverFixture): Promise<RuntimeState> {
  const exchange = await receiver.client.readState({
    params: { id: receiver.scope.projectId },
    query: { personId: receiver.scope.personId, expectedLedgerId: receiver.ledgerId },
  });
  if (exchange.reply.kind !== 'success') throw new Error('receiver state refused');
  return exchange.reply.body;
}

export async function acquireReceiverAuthority(
  receiver: RecoveryReceiverFixture,
  commandId: string,
  generation: number | null,
) {
  return receiver.client.acquireAuthority({
    params: { id: receiver.scope.projectId },
    body: {
      schemaVersion: 1,
      commandId,
      personId: receiver.scope.personId,
      expectedLedgerId: receiver.ledgerId,
      ownerId: 'receiver-owner',
      expectedGeneration: generation,
    },
  });
}

/** Finite handshake deadline, not an ordering delay; successful gates settle as soon as their owner releases them. */
export async function waitForReceiver<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('receiver handshake timed out'));
        }, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Drains every owned delivery before attempting every disposal; a single failure retains identity and independent failures retain order. */
export async function closeRecoveryResources(
  resources: readonly { close(): void | Promise<void> }[],
  pending: Iterable<Promise<unknown>> = [],
): Promise<void> {
  const failures: unknown[] = [];
  // Proof: R7F02 used fail-fast draining; 'receiver cleanup waits for every actual delivery' observed close settled while its second real request remained blocked.
  const deliveries = await Promise.allSettled(pending);
  for (const delivery of deliveries)
    if (delivery.status === 'rejected') failures.push(delivery.reason);
  // Proof: R7F01 threw before disposal and observed actual harness disposals0; R7F03 skipped the second resource and the actual SQLite scope read still succeeded.
  for (const resource of resources) {
    try {
      await resource.close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  // Proof: R7F04 wrapped the single failure; 'receiver cleanup ... false' lost exact cause identity.
  if (failures.length === 1) throw failures[0];
  // Proof: R7F05 threw only the last failure; actual receiver/store cleanup tests lost their independent original causes.
  if (failures.length > 1) throw new AggregateError(failures, 'Recovery fixture cleanup failed');
}
