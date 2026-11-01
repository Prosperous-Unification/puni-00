import { type } from '@shared/validation';

import type { WallClock } from '../clock';
import type { ApiKey, McpEndpoint } from '../mcp/machine-token';
import { type ToolAnswer, type WbsTools, WbsUnreachable } from '../mcp/wbs-tools';
import {
  loadReporterConfiguration,
  type ProviderAdapters,
  type ReporterConfiguration,
  type ReporterInstance,
} from './configuration';
import type { Measurement, ResourceBinding } from './provider';

/** Three consecutive `report_superseded` on one binding mean another reporter (P10). */
const SUPERSEDED_LIMIT = 3;
/** One retry after a cadence, then exit: bounded convergence for `5xx` and transport faults. */
const TRANSIENT_LIMIT = 2;
/** Each tool call's deadline: a call past it is a transport fault. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** The capacity report tool mcp-01 derives from be-01's route (`compute-providers` P5). */
export const CAPACITY_REPORT_TOOL =
  'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report';
/** mcp-01's reasons for an uncompleted call that a retry cannot change: the credential's. */
const REFUSING_REASONS = new Set(['machine_credential_refused', 'insufficient_scope']);
const ErrorCode = /^[A-Za-z][A-Za-z_]{0,63}$/;

export type ReporterExitReason = 'another_reporter' | 'refused' | 'wbs_unavailable';

/** The reporter stopped on a modelled outcome; the message names the instance and resource. */
export class ReporterExit extends Error {
  public constructor(
    public readonly reason: ReporterExitReason,
    message: string,
  ) {
    super(`${reason}: ${message}`);
    this.name = 'ReporterExit';
  }
}

export interface ReporterDependencies {
  readonly clock: WallClock;
  /**
   * WBS's tools for the configured endpoint and key; the composition root passes an
   * `McpWbsTools` factory, tests a fake WBS.
   */
  readonly connect: (endpoint: McpEndpoint, key: ApiKey) => WbsTools;
  /** Waits `milliseconds`, resolving early once `interrupt` aborts. */
  readonly sleep: (milliseconds: number, interrupt: AbortSignal) => Promise<void>;
  readonly write: (text: string) => void;
}

/** How WBS answered one `PUT` (`compute-providers` P5, P10). */
type ReportAnswer =
  | { readonly kind: 'stored' }
  | { readonly kind: 'superseded'; readonly storedObservedAt: number }
  | { readonly kind: 'transient'; readonly detail: string }
  | { readonly kind: 'refused'; readonly detail: string };

const StoredReport = type({ providerId: 'string', observedAt: 'number' });
const Superseded = type({ error: "'report_superseded'", storedObservedAt: 'number' });
const RefusalBody = type({ error: 'string', 'providerId?': 'string | null', 'skewMs?': 'number' });

/**
 * The input of one report tool call: the path's ids and the measurement without its Dash-only
 * evidence. A stub's `not_implemented` is carried as it is, which WBS refuses `400 invalid_body`;
 * the loader refuses a stub before any observation, so only a broken loader reaches that refusal.
 */
function reportInput(
  instanceId: string,
  binding: ResourceBinding,
  measurement: Measurement,
  cadenceSeconds: number,
): Record<string, unknown> {
  let outcome: Record<string, unknown>;
  switch (measurement.kind) {
    case 'measured':
      outcome = {
        kind: 'measured',
        capacityUnits: measurement.capacityUnits,
        usageUnits: measurement.usageUnits,
      };
      break;
    case 'unreachable':
      outcome = { kind: 'unreachable', reason: measurement.reason };
      break;
    case 'not_implemented':
      outcome = { kind: 'not_implemented' };
      break;
  }
  return {
    providerId: instanceId,
    resourceId: binding.resourceId,
    observedAt: measurement.observedAt,
    cadenceSeconds,
    outcome,
  };
}

/**
 * The refusal as one bounded line: status and WBS's error code, with the one field each modelled
 * refusal carries. Nothing else of the body is echoed, and the request is never quoted.
 */
function describeRefusal(status: number, body: unknown): string {
  const refusal = RefusalBody(body);
  if (refusal instanceof type.errors || !ErrorCode.test(refusal.error)) {
    return `HTTP ${String(status)}`;
  }
  const detail =
    refusal.error === 'provider_mismatch'
      ? ` (resource names ${String(refusal.providerId ?? null)})`
      : refusal.error === 'observedAt_in_future' && refusal.skewMs !== undefined
        ? ` (skew ${String(refusal.skewMs)} ms)`
        : '';
  return `HTTP ${String(status)} ${refusal.error}${detail}`;
}

/**
 * Sends one report as a tool call and classifies the answer. No answer ({@link WbsUnreachable}),
 * and an uncompleted call a retry may change (`rate_limited`, `server_error`, …), is transient;
 * an uncompleted call the credential causes is refused. A malformed or unattributable answer
 * throws.
 */
async function putReport(
  configuration: ReporterConfiguration,
  instanceId: string,
  binding: ResourceBinding,
  measurement: Measurement,
  stop: AbortSignal,
  tools: WbsTools,
): Promise<ReportAnswer> {
  let answer: ToolAnswer;
  try {
    answer = await tools.call(
      CAPACITY_REPORT_TOOL,
      reportInput(instanceId, binding, measurement, configuration.cadenceSeconds),
    );
  } catch (cause) {
    // Only a call that got no answer is transient; an answer the client cannot read is a fault.
    // Proof: treating every rejection as transient made `exits on an answer the tool client
    // cannot attribute, never retrying it` retry it (2026-10-29).
    if (stop.aborted || !(cause instanceof WbsUnreachable)) throw cause;
    const name = cause.cause instanceof Error ? cause.cause.name : 'unknown';
    return { kind: 'transient', detail: `transport fault ${name}` };
  }
  switch (answer.kind) {
    case 'answered': {
      const stored = StoredReport(answer.body);
      // Proof: answering `stored` for any 200 made `throws on a 200 that carries no stored
      // report` keep reporting (2026-10-22).
      if (stored instanceof type.errors) {
        throw new Error(
          `WBS answered 200 without a stored report for resource ${binding.resourceId}`,
        );
      }
      return { kind: 'stored' };
    }
    case 'refused': {
      if (answer.status === 409) {
        const superseded = Superseded(answer.body);
        if (!(superseded instanceof type.errors)) {
          return { kind: 'superseded', storedObservedAt: superseded.storedObservedAt };
        }
      }
      return { kind: 'refused', detail: describeRefusal(answer.status, answer.body) };
    }
    case 'not_called':
      // Proof: retrying every uncompleted call made `exits when mcp-01 answers
      // machine_credential_refused…` and `…insufficient_scope…` retry (2026-10-29).
      return REFUSING_REASONS.has(answer.reason)
        ? { kind: 'refused', detail: `mcp-01 ${answer.reason}` }
        : { kind: 'transient', detail: `mcp-01 ${answer.reason}` };
  }
}

interface BindingStreaks {
  superseded: number;
  transient: number;
}

/**
 * One instance's loop: every binding observed and reported once per tick, a tick every
 * `cadenceSeconds` and right after a run starts or ends. Returns only when `stop` aborts; every
 * other end throws: a {@link ReporterExit} for a modelled refusal, the provider's own error for an
 * observation it could not parse.
 */
async function reportInstance(
  configuration: ReporterConfiguration,
  instance: ReporterInstance,
  stop: AbortSignal,
  deps: ReporterDependencies,
  tools: WbsTools,
): Promise<void> {
  const streaks = new Map<string, BindingStreaks>(
    instance.bindings.map((binding) => [binding.resourceId, { superseded: 0, transient: 0 }]),
  );
  // One controller per sleep, aborted by a run change or by `stop`; `stop` carries exactly one
  // listener for the whole loop, whatever the number of ticks.
  // Proof: composing `AbortSignal.any([wake.signal, stop])` per sleep again made `adds a fixed
  // number of abort listeners whatever the number of ticks` count 16 composites instead of 0
  // (2026-10-22).
  let wake = new AbortController();
  const unsubscribe = instance.provider.onRunChange(() => {
    wake.abort();
  });
  const onStop = (): void => {
    wake.abort();
  };
  stop.addEventListener('abort', onStop, { once: true });
  // A function, not the property: narrowing would treat `stop.aborted` as fixed across awaits.
  const stopped = (): boolean => stop.aborted;
  try {
    for (;;) {
      for (const binding of instance.bindings) {
        if (stopped()) return;
        const measurement = await instance.provider.observe(binding, deps.clock.read());
        const answer = await putReport(
          configuration,
          instance.instanceId,
          binding,
          measurement,
          stop,
          tools,
        );
        const streak = streaks.get(binding.resourceId);
        if (streak === undefined) throw new Error(`no streak for ${binding.resourceId}`);
        const subject = `instance ${instance.instanceId} resource ${binding.resourceId}`;
        deps.write(
          `${JSON.stringify({
            instanceId: instance.instanceId,
            resourceId: binding.resourceId,
            observedAt: measurement.observedAt,
            measurement: measurement.kind,
            answer: answer.kind,
            ...(measurement.kind === 'measured' ? { evidence: measurement.evidence } : {}),
            ...(measurement.kind === 'unreachable' ? { reason: measurement.reason } : {}),
            ...(answer.kind === 'transient' || answer.kind === 'refused'
              ? { detail: answer.detail }
              : {}),
          })}\n`,
        );
        switch (answer.kind) {
          case 'stored':
            streak.superseded = 0;
            streak.transient = 0;
            break;
          case 'superseded':
            streak.superseded += 1;
            streak.transient = 0;
            if (streak.superseded >= SUPERSEDED_LIMIT) {
              throw new ReporterExit(
                'another_reporter',
                `${subject}: ${String(SUPERSEDED_LIMIT)} consecutive report_superseded`,
              );
            }
            break;
          case 'transient':
            // Superseded answers separated by a transient one are not consecutive.
            // Proof: keeping the count here made `counts only consecutive report_superseded`
            // exit `another_reporter` (2026-10-22).
            streak.superseded = 0;
            streak.transient += 1;
            if (streak.transient >= TRANSIENT_LIMIT) {
              throw new ReporterExit(
                'wbs_unavailable',
                `${subject}: ${answer.detail} after a retry`,
              );
            }
            break;
          case 'refused':
            // Proof: turning this exit into a logged `break` made `exits on 401 and sends nothing
            // further` fail, the revoked credential still sending on every later tick (2026-10-22).
            throw new ReporterExit('refused', `${subject}: ${answer.detail}`);
        }
      }
      if (stopped()) return;
      await deps.sleep(configuration.cadenceSeconds * 1000, wake.signal);
      if (stopped()) return;
      if (wake.signal.aborted) wake = new AbortController();
    }
  } finally {
    stop.removeEventListener('abort', onStop);
    unsubscribe();
  }
}

/**
 * Runs one reporting loop per configured instance until the first ends; the others stop at their
 * next step and the first end is thrown. A loop notices the stop at its next step, so it may end
 * up to one request timeout plus one observation late. An observation runs up to three commands
 * one after another, each under its own command deadline (a `docker` memory or cores observation:
 * `info`, `ps`, `stats`), so with the hard-coded 30 s constants that is up to 30 s + 90 s. It
 * never returns normally and never prints the credential.
 * @throws ReporterExit for `another_reporter`, a WBS refusal, or WBS unavailable after one retry;
 * a provider's error for a measurement it could not parse.
 */
export async function runReporter(
  configuration: ReporterConfiguration,
  deps: ReporterDependencies,
): Promise<never> {
  const stop = new AbortController();
  let first: { readonly cause: unknown } | undefined;
  const tools = deps.connect(configuration.endpoint, configuration.credential);
  try {
    await Promise.all(
      configuration.instances.map((instance) =>
        reportInstance(configuration, instance, stop.signal, deps, tools).catch(
          (cause: unknown) => {
            first ??= { cause };
            stop.abort();
          },
        ),
      ),
    );
  } finally {
    await tools.close();
  }
  if (first === undefined) throw new Error('every reporting loop stopped without a cause');
  throw first.cause;
}

/** Resolves after `milliseconds`, or as soon as `interrupt` aborts. */
export function sleepUnlessInterrupted(
  milliseconds: number,
  interrupt: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (interrupt.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      interrupt.removeEventListener('abort', wake);
      resolve();
    }, milliseconds);
    function wake(): void {
      clearTimeout(timer);
      resolve();
    }
    // Proof: dropping this listener made `resolves when the interrupt aborts, long before the
    // timer` time out (2026-10-22).
    interrupt.addEventListener('abort', wake, { once: true });
  });
}

/** The one line `report-capacity` refuses with when its grammar is wrong. */
export const usage = 'usage: twilight-dash report-capacity --config <owner-only file>';

/**
 * `report-capacity --config <file>`: loads the owner-only configuration through `adapters`, then
 * runs {@link runReporter}. The grammar is exactly one `--config` and its path.
 * @throws Error `usage: …` for any other argv, before the file is read.
 */
export async function reportCapacityCommand(
  argv: readonly string[],
  adapters: ProviderAdapters,
  deps: ReporterDependencies,
): Promise<never> {
  const path = argv.at(1);
  if (argv.length !== 2 || argv.at(0) !== '--config' || path === undefined || path.length === 0) {
    throw new Error(usage);
  }
  const configuration = await loadReporterConfiguration(path, adapters);
  return runReporter(configuration, deps);
}
