import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

import { buildApp } from './app';
import { bootBe01, type BootOptions, type RunningBe } from './boot';
import { openDatabase } from './repository/db';
import { runMigrations } from './repository/migrate';
import { DnsUnavailableError } from './runtime/authoritative-dns/failures';
import type { DnsTransport } from './runtime/authoritative-dns/resolver';
import { DnsCleanupError } from './runtime/authoritative-dns/transport';
import { startDomainProofWorker } from './runtime/domain-proof-worker';

let directory: string;
let sqlite: ReturnType<typeof openDatabase>;
let running: RunningBe | undefined;
let options: BootOptions;
let listenerStops = 0;
const old = Date.now() - 14 * 86_400_000 - 1_000;

beforeEach(() => {
  listenerStops = 0;
  directory = mkdtempSync(join(tmpdir(), 'wbs-domain-proof-boot-'));
  const dbPath = join(directory, 'boot.db');
  runMigrations(dbPath, new URL('../drizzle', import.meta.url).pathname);
  sqlite = openDatabase(dbPath);
  options = {
    dbPath,
    port: 0,
    appOrigin: 'http://localhost:4200',
    logger: createLogger({ service: 'domain-proof-boot-test', level: 'error' }),
    jwtKey: 'domain-proof-test-key-32-characters-long',
    gwUrl: 'http://localhost:3200',
    internalAuthSecret: 'internal-secret-with-at-least-32-characters',
    browserSessionAuthority: 'disabled',
    organizationDnsResolvers: ['10.0.0.53'],
  };
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
  sqlite.close();
  rmSync(directory, { recursive: true });
});

function boot(configured: BootOptions, dependencies: Parameters<typeof bootBe01>[1]) {
  return bootBe01(configured, {
    makeApp: (composition) => {
      const app = buildApp(composition);
      app.stop = () => {
        listenerStops += 1;
        return Promise.resolve(app);
      };
      return app;
    },
    startListener: (_app, _port, ready) => {
      ready();
    },
    ...dependencies,
  });
}

function plantProof(activated: boolean): void {
  sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'A', 1)");
  if (activated)
    sqlite.run(
      "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
    );
  sqlite.run(
    "INSERT INTO organization_domain_claim (id, organization_id, domain, status, proof_digest, last_success_at, last_checked_at, created_at, updated_at) VALUES ('claim-a', 'org-a', 'example.org', 'verified', ?, ?, ?, ?, ?)",
    ['a'.repeat(64), old, old, old, old],
  );
}

function readProof() {
  return sqlite
    .query('SELECT status, last_checked_at, last_success_at FROM organization_domain_claim')
    .get();
}

function createWait() {
  const entered = Promise.withResolvers<undefined>();
  let waits = 0;
  return {
    entered,
    count: () => waits,
    wait: (_milliseconds: number, signal: AbortSignal): Promise<void> =>
      new Promise((resolve) => {
        waits += 1;
        entered.resolve(undefined);
        signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      }),
  };
}

describe('boot-owned retained proof scheduling', () => {
  test('enabled scheduling without authoritative DNS opens no source or listener', async () => {
    let opens = 0;
    let listeners = 0;
    const failure = await boot(
      {
        ...options,
        organizationDnsResolvers: undefined,
        organizationDomainProofScheduling: 'enabled',
      },
      {
        openSource: (configured) => {
          opens += 1;
          return openSqliteSource(configured);
        },
        startListener: () => {
          listeners += 1;
        },
      },
    ).catch((cause: unknown) => cause);
    expect(failure instanceof Error).toBe(true);
    expect(opens).toBe(0);
    expect(listeners).toBe(0);
  });

  for (const configured of ['disabled', 'absent'] as const) {
    test(`disabled scheduling creates no worker, lookup or wait for ${configured}`, async () => {
      plantProof(true);
      let workers = 0;
      let lookups = 0;
      running = await boot(
        {
          ...options,
          organizationDnsResolvers:
            configured === 'absent' ? undefined : options.organizationDnsResolvers,
          organizationDomainProofScheduling: configured === 'disabled' ? 'disabled' : undefined,
        },
        {
          openSource: openSqliteSource,
          dnsTransport: {
            exchange: () => {
              lookups += 1;
              return Promise.reject(new DnsUnavailableError('outage'));
            },
          },
          startProofWorker: (schedule) => {
            workers += 1;
            return startDomainProofWorker(schedule);
          },
        },
      );
      expect(workers).toBe(0);
      expect(lookups).toBe(0);
      expect(readProof()).toEqual({
        status: 'verified',
        last_checked_at: old,
        last_success_at: old,
      });
    });
  }

  for (const activated of [true, false]) {
    test(`immediate configured sweep honors organization activation ${String(activated)}`, async () => {
      plantProof(activated);
      const clock = createWait();
      let workers = 0;
      let lookups = 0;
      running = await boot(options, {
        openSource: openSqliteSource,
        dnsTransport: {
          exchange: () => {
            lookups += 1;
            return Promise.reject(new DnsUnavailableError('outage'));
          },
        },
        startProofWorker: (schedule) => {
          workers += 1;
          return startDomainProofWorker({ ...schedule, wait: clock.wait });
        },
      });
      expect(workers).toBe(1);
      const failed = Promise.withResolvers<never>();
      running.backgroundFailure.observe((failure) => {
        failed.reject(failure.cause);
      });
      await Promise.race([clock.entered.promise, failed.promise]);
      expect(clock.count()).toBe(1);
      expect(lookups > 0).toBe(activated);
      const claim = readProof();
      if (activated) expect(claim).toMatchObject({ status: 'suspended', last_success_at: old });
      else
        expect(claim).toEqual({ status: 'verified', last_checked_at: old, last_success_at: old });
      expect(
        sqlite.query('SELECT state FROM organization_activation WHERE singleton = 1').get(),
      ).toEqual({ state: activated ? 'activated' : 'pre_activation' });
    });
  }

  test('missing organization marker fails the worker without DNS or recreating the marker', async () => {
    plantProof(false);
    sqlite.run('DROP TRIGGER organization_activation_no_delete');
    sqlite.run('DELETE FROM organization_activation');
    let lookups = 0;
    running = await boot(options, {
      openSource: openSqliteSource,
      dnsTransport: {
        exchange: () => {
          lookups += 1;
          return Promise.reject(new DnsUnavailableError('outage'));
        },
      },
    });
    const observed = Promise.withResolvers<unknown>();
    running.backgroundFailure.observe((failure) => {
      observed.resolve(failure.cause);
    });
    expect((await observed.promise) instanceof Error).toBe(true);
    expect(lookups).toBe(0);
    expect(sqlite.query('SELECT count(*) AS markers FROM organization_activation').get()).toEqual({
      markers: 0,
    });
    expect((await running.stop().catch((cause: unknown) => cause)) instanceof Error).toBe(true);
    running = undefined;
  });

  test('failed synchronous listener startup starts no proof resource and closes storage', async () => {
    let workers = 0;
    let closes = 0;
    const failure = await boot(options, {
      openSource: (configured) => {
        const source = openSqliteSource(configured);
        return {
          ...source,
          close: async () => {
            closes += 1;
            await source.close();
          },
        };
      },
      startListener: () => {
        throw new Error('listener startup failed');
      },
      startProofWorker: (schedule) => {
        workers += 1;
        return startDomainProofWorker(schedule);
      },
    }).catch((cause: unknown) => cause);
    expect(failure instanceof Error).toBe(true);
    expect(workers).toBe(0);
    expect(closes).toBe(1);
  });

  test('failed schema admission starts no worker', async () => {
    sqlite.run('DROP TRIGGER step_blockage_admit_insert');
    let workers = 0;
    const failure = await boot(options, {
      openSource: openSqliteSource,
      startProofWorker: (schedule) => {
        workers += 1;
        return startDomainProofWorker(schedule);
      },
    }).catch((cause: unknown) => cause);
    expect(failure instanceof Error).toBe(true);
    expect(workers).toBe(0);
  });

  test('stop aborts DNS but keeps storage open until cleanup joins', async () => {
    plantProof(true);
    const entered = Promise.withResolvers<AbortSignal>();
    const reply = Promise.withResolvers<never>();
    const order: string[] = [];
    const transport: DnsTransport = {
      exchange: (request) => {
        entered.resolve(request.signal);
        request.signal.addEventListener(
          'abort',
          () => {
            order.push('abort');
          },
          { once: true },
        );
        return reply.promise;
      },
    };
    running = await boot(options, {
      dnsTransport: transport,
      openSource: (configured) => {
        const source = openSqliteSource(configured);
        return {
          ...source,
          close: async () => {
            order.push('close');
            await source.close();
          },
        };
      },
    });
    const signal = await entered.promise;
    const stopping = running.stop();
    await Bun.sleep(0);
    expect(listenerStops).toBe(1);
    expect(signal.aborted).toBe(true);
    expect(order).toEqual(['abort']);
    reply.reject(new DnsUnavailableError('cancelled after controlled cleanup'));
    await stopping;
    expect(order).toEqual(['abort', 'close']);
    expect(running.backgroundFailure.current()).toBeUndefined();
    expect(readProof()).toEqual({ status: 'verified', last_checked_at: old, last_success_at: old });
    await running.stop();
    expect(order).toEqual(['abort', 'close']);
  });

  test('stop joins a queued write before closing SQLite', async () => {
    plantProof(true);
    const held = Promise.withResolvers<undefined>();
    const queued = Promise.withResolvers<undefined>();
    const order: string[] = [];
    let holding: Promise<undefined> | undefined;
    running = await boot(options, {
      dnsTransport: { exchange: () => Promise.reject(new DnsUnavailableError('outage')) },
      openSource: (configured) => {
        const source = openSqliteSource(configured);
        holding = source.gate.enter(() => held.promise);
        const enter = source.gate.enter.bind(source.gate);
        spyOn(source.gate, 'enter').mockImplementation((work) => {
          queued.resolve(undefined);
          return enter(work);
        });
        return {
          ...source,
          close: async () => {
            order.push('close');
            await source.close();
          },
        };
      },
    });
    try {
      await queued.promise;
      let stopped = false;
      const stopping = running.stop().then(() => {
        stopped = true;
      });
      await Bun.sleep(0);
      expect(listenerStops).toBe(1);
      expect(stopped).toBe(false);
      expect(order).toEqual([]);
      held.resolve(undefined);
      await holding;
      await stopping;
      expect(order).toEqual(['close']);
      expect(readProof()).toEqual({
        status: 'verified',
        last_checked_at: old,
        last_success_at: old,
      });
    } finally {
      held.resolve(undefined);
      await holding;
    }
  });

  test('unexpected DNS cleanup failure remains terminal during stop', async () => {
    plantProof(true);
    const entered = Promise.withResolvers<undefined>();
    const reply = Promise.withResolvers<never>();
    running = await boot(options, {
      openSource: openSqliteSource,
      dnsTransport: {
        exchange: () => {
          entered.resolve(undefined);
          return reply.promise;
        },
      },
    });
    const be = running;
    await entered.promise;
    const stopping = be.stop().catch((cause: unknown) => cause);
    const fault = new DnsCleanupError('controlled resource cleanup failure');
    reply.reject(fault);
    expect((await stopping) instanceof Error).toBe(true);
    expect(be.backgroundFailure.current()?.cause).toBe(fault);
    expect(be.services.retention.isRunning()).toBe(false);
    expect(readProof()).toEqual({ status: 'verified', last_checked_at: old, last_success_at: old });
    running = undefined;
  });

  for (const fails of [true, false]) {
    test(`latches unexpected worker ${fails ? 'rejection' : 'normal completion'}`, async () => {
      const fault = new Error('unexpected proof worker failure');
      running = await boot(options, {
        openSource: openSqliteSource,
        startProofWorker: () => ({
          completed: fails ? Promise.reject(fault) : Promise.resolve(),
          stop: () => Promise.resolve(),
        }),
      });
      const failure = running.backgroundFailure.current();
      expect(failure).toBeDefined();
      if (fails) expect(failure?.cause).toBe(fault);
      else expect(failure?.cause).toBeInstanceOf(Error);
      await running.stop();
    });
  }
});
