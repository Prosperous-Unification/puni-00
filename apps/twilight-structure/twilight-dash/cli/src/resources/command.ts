import { readFileSync } from 'node:fs';

import type { DashRequest } from '../cli-parser';
import type { WallClock } from '../clock';
import type { ApiKey, McpEndpoint } from '../mcp/machine-token';
import type { WbsTools } from '../mcp/wbs-tools';
import { dockerContainerEvidence, findDocker } from './container-evidence';
import type { LegacyLock } from './legacy-lock';
import {
  type CreationRequest,
  linuxHostFacts,
  loadResourceConfiguration,
  ResourceRuntime,
  ResourceWbsUnavailable,
} from './runtime';
import { SingletonGuard } from './singleton-guard';

/** A sweep's `docker ps` runs under the ledger's write lock: shorter than a launcher's 30 s. */
const SWEEP_DOCKER_DEADLINE_MS = 5_000;

/**
 * Runs one parsed `resources` action (its grammar is `cli-parser.ts`'s, parsed before this reads
 * credentials or opens the ledger). `connect` opens WBS's tools for the configured MCP endpoint
 * and key; it is called once, and the tools are closed before the command returns. `legacyLock`
 * is resolved only when watch's singleton guard needs the host lock. The guard settles before
 * its ledger closes; every acquired capability is closed independently, retaining the operation
 * and all cleanup failures. A single failure retains its original identity.
 */
export async function runResources(
  request: DashRequest<'resources'>,
  clock: WallClock,
  write: (text: string) => unknown,
  connect: (endpoint: McpEndpoint, key: ApiKey) => WbsTools,
  legacyLock: () => LegacyLock | Promise<LegacyLock>,
): Promise<number> {
  const configuration = loadResourceConfiguration(request.config);
  const runtime =
    request.action === 'init'
      ? ResourceRuntime.initialize(configuration, clock, linuxHostFacts)
      : ResourceRuntime.open(configuration, clock);
  // Every action gets the reading; only the ones that sweep use it. Its deadline is shorter than
  // a launcher's because sweeps read inside the ledger's write transaction (S15-A4).
  // Proof: without it `resources sweep settles a job with a declared containers bound through a
  // docker on PATH` (sweep-container-evidence.test.ts) left the job `held`, the h4claw leak of
  // 2026-11-17 (verify.md).
  const docker = findDocker(process.env);
  if (docker !== null)
    runtime.useContainerEvidence(
      dockerContainerEvidence(docker, process.env, SWEEP_DOCKER_DEADLINE_MS),
    );
  const report = (value: unknown): void => {
    write(`${JSON.stringify(value)}\n`);
  };
  const failures = new Set<unknown>();
  const transport: { connection: { kind: 'unopened' } | { kind: 'opened'; tools: WbsTools } } = {
    connection: { kind: 'unopened' },
  };
  let guard: SingletonGuard | undefined;
  const cancellation = new AbortController();
  const cancel = (): void => {
    cancellation.abort();
  };
  process.once('SIGTERM', cancel);
  process.once('SIGINT', cancel);
  /** Failed inspection cannot authorize a cleanup request; sweep and final observation remain independent. */
  function cleanUse(id: string, reason: string): void {
    let latest: ReturnType<ResourceRuntime['inspect']> | undefined;
    try {
      latest = runtime.inspect(id);
    } catch (cause) {
      // Proof: rethrowing this cleanup fault lost the run primary in the inspect-before control; recording it restored both failures (2026-11-11).
      failures.add(cause);
    }
    if (latest !== undefined && !latest.sealed && latest.state !== 'released') {
      try {
        runtime.requestCleanup(latest.id, latest.revision, latest.incarnation, reason);
      } catch (cause) {
        failures.add(cause);
      }
    }
    try {
      runtime.sweep();
    } catch (cause) {
      failures.add(cause);
    }
    try {
      report(runtime.inspect(id));
    } catch (cause) {
      failures.add(cause);
    }
  }
  const runAction = async (): Promise<number> => {
    const tools = connect(configuration.endpoint, configuration.credential);
    transport.connection = { kind: 'opened', tools };
    if (request.action === 'init') {
      report({
        initialized: true,
        root: configuration.root,
        authorityId: configuration.authorityId,
        coverage: 'linux-cooperating-managed-commands',
      });
      return 0;
    }
    if (request.action === 'inspect') {
      const id = request.use;
      report(id === undefined ? runtime.list() : runtime.inspect(id));
      return 0;
    }
    if (request.action === 'create' || request.action === 'exec') {
      let creation: unknown;
      try {
        creation = JSON.parse(readFileSync(request.request, 'utf8'));
      } catch {
        throw new Error('resource request file unreadable or malformed');
      }
      // ResourceRuntime.create validates this untrusted JSON once at its public boundary.
      const use = await runtime.create(creation as CreationRequest, tools);
      if (request.action === 'create') {
        report(use);
        return 0;
      }
      // Proof: reporting before this ownership scope skipped cleanup of the created use on write failure; the creation-report control now observes cleanup (2026-11-11).
      try {
        report(use);
        return await runtime.run(use.id, request.argv, cancellation.signal);
      } finally {
        cleanUse(use.id, 'managed session ended');
      }
    }
    if (request.action === 'run') {
      const id = request.use;
      try {
        return await runtime.run(id, request.argv, cancellation.signal);
      } finally {
        cleanUse(id, 'managed command ended');
      }
    }
    if (request.action === 'cleanup') {
      report(
        runtime.requestCleanup(request.use, request.revision, request.incarnation, request.reason),
      );
      report(runtime.sweep());
      return 0;
    }
    if (request.action === 'sweep') {
      report(runtime.sweep());
      // Dead tickets go too, so neither a switch's drain nor the guard's demand waits on them
      // (review K3).
      runtime.reclaimDeadTickets((line) => {
        process.stderr.write(`${line}\n`);
      });
      // The operator's one-shot release of legacy holds whose work has settled (review H1): on a
      // host without `watch`, the only remedy for a hold its launcher could not end.
      // Proof: without it `resources sweep releases the orphan hold of a settled job`
      // (host-pool-mode.test.ts) left the holder holding (2026-11-02, review H1).
      const holds = await new SingletonGuard(runtime, legacyLock, process.env, (line) => {
        process.stderr.write(`${line}\n`);
      }).releaseSettledHolds();
      report({ legacyHolds: holds });
      return 0;
    }
    if (request.action === 'sync') {
      await runtime.synchronize(tools);
      report({ cursor: runtime.requestCursor(), pendingEvents: runtime.outbox().length });
      return 0;
    }
    const owner = new SingletonGuard(runtime, legacyLock, process.env, (line) => {
      process.stderr.write(`${line}\n`);
    });
    guard = owner;
    while (!cancellation.signal.aborted) {
      report(runtime.sweep());
      // Proof: without it `resources watch holds the guard for a queued job and lets go when
      // the pool empties` (host-pool-mode.test.ts) timed out waiting for admission (2026-11-02).
      await owner.tick();
      try {
        await runtime.synchronize(tools);
      } catch (cause) {
        // WBS unavailable is a durable retry obligation; refusals and malformed trusted replies
        // stop the controller.
        if (!(cause instanceof ResourceWbsUnavailable)) throw cause;
        report({ publication: 'pending', reason: 'WBS unavailable; durable outbox retained' });
      }
      await Bun.sleep(1000);
    }
    return 0;
  };
  const execution = await runAction().then(
    (status) => ({ kind: 'returned' as const, status }),
    // Proof: returning success from this rejection branch made the undefined-throw control return 0; restoring the tagged failure preserved undefined (2026-11-11).
    (cause: unknown) => ({ kind: 'threw' as const, cause }),
  );
  if (guard !== undefined) {
    try {
      // Proof: dropping await closed the ledger before guard stop settled in the healthy-watch control; restoration passed (2026-11-11).
      await guard.stop();
    } catch (cause) {
      failures.add(cause);
    }
  }
  // Proof: omitting ledger close leaked its capability after connect threw; the exact connection-failure control observed the missing close (2026-11-11).
  try {
    runtime.close();
  } catch (cause) {
    // Proof: rethrowing here skipped transport close and lost its error in the two-close control; restoration retained both failures (2026-11-11).
    failures.add(cause);
  }
  const connection = transport.connection;
  if (connection.kind === 'opened') {
    try {
      await connection.tools.close();
    } catch (cause) {
      failures.add(cause);
    }
  }
  // Proof: c32-command-listener-settlement-lifetime; replaying early removal caused native exits 130/143 in four gated guard/transport controls; restoring late removal passed (2026-11-11).
  // Proof: omitting listener removal left both signal counts elevated in the connection-failure control; restoration passed (2026-11-11).
  process.removeListener('SIGTERM', cancel);
  process.removeListener('SIGINT', cancel);
  if (execution.kind === 'threw') {
    // Proof: keeping the repeated guard tick/stop value aggregated one original failure twice; identity-preserving deduplication restored the repeated-guard control (2026-11-11).
    failures.delete(execution.cause);
    // Proof: forcing aggregation here replaced the single run failure identity; restoring this branch passed the single-primary control (2026-11-11).
    if (failures.size === 0) throw execution.cause;
    throw new AggregateError(
      // Proof: removing execution.cause lost the primary sweep error from the four-failure watch control; restoration passed (2026-11-11).
      [execution.cause, ...failures],
      'resource command and cleanup failed',
      { cause: execution.cause },
    );
  }
  // Proof: omitting this branch returned success after a lone transport-close failure; the single-cleanup control failed until restoration (2026-11-11).
  if (failures.size === 1) throw failures.values().next().value;
  if (failures.size > 1) {
    const causes = [...failures];
    throw new AggregateError(causes, 'resource command cleanup failed', { cause: causes[0] });
  }
  return execution.status;
}
