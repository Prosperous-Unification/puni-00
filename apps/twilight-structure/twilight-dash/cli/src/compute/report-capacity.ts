import { type } from '@shared/validation';

import type { WallClock } from '../clock';
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
const REQUEST_TIMEOUT_MS = 30_000;
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
  /** One HTTP exchange; the composition root passes `fetch`, tests a fake WBS. */
  readonly send: (request: Request) => Promise<Response>;
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

/** The body of one report: the measurement without its Dash-only evidence. */
function reportBody(measurement: Measurement, cadenceSeconds: number): string {
  const outcome =
    measurement.kind === 'measured'
      ? {
          kind: 'measured',
          capacityUnits: measurement.capacityUnits,
          usageUnits: measurement.usageUnits,
        }
      : { kind: 'unreachable', reason: measurement.reason };
  return JSON.stringify({ observedAt: measurement.observedAt, cadenceSeconds, outcome });
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Sends one report and classifies WBS's answer; a malformed `200` throws. */
async function putReport(
  configuration: ReporterConfiguration,
  instanceId: string,
  binding: ResourceBinding,
  measurement: Measurement,
  stop: AbortSignal,
  deps: ReporterDependencies,
): Promise<ReportAnswer> {
  const url = `${configuration.wbsOrigin}/api/compute-providers/${encodeURIComponent(
    instanceId,
  )}/resources/${encodeURIComponent(binding.resourceId)}/capacity-report`;
  let response: Response;
  try {
    response = await deps.send(
      new Request(url, {
        method: 'PUT',
        headers: {
          authorization: configuration.credential.authorization(),
          'content-type': 'application/json',
        },
        body: reportBody(measurement, configuration.cadenceSeconds),
        // A redirect is refused rather than followed with the credential.
        redirect: 'manual',
        signal: AbortSignal.any([stop, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      }),
    );
  } catch (cause) {
    if (stop.aborted) throw cause;
    const name = cause instanceof Error ? cause.name : 'unknown';
    return { kind: 'transient', detail: `transport fault ${name}` };
  }
  const body = await readJson(response);
  if (response.status === 200) {
    const stored = StoredReport(body);
    if (stored instanceof type.errors) {
      throw new Error(
        `WBS answered 200 without a stored report for resource ${binding.resourceId}`,
      );
    }
    return { kind: 'stored' };
  }
  if (response.status === 409) {
    const superseded = Superseded(body);
    if (!(superseded instanceof type.errors)) {
      return { kind: 'superseded', storedObservedAt: superseded.storedObservedAt };
    }
  }
  if (response.status >= 500) {
    return { kind: 'transient', detail: `HTTP ${String(response.status)}` };
  }
  return { kind: 'refused', detail: describeRefusal(response.status, body) };
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
): Promise<void> {
  const streaks = new Map<string, BindingStreaks>(
    instance.bindings.map((binding) => [binding.resourceId, { superseded: 0, transient: 0 }]),
  );
  let wake = new AbortController();
  const unsubscribe = instance.provider.onRunChange(() => {
    wake.abort();
  });
  try {
    for (;;) {
      for (const binding of instance.bindings) {
        if (stop.aborted) return;
        const measurement = await instance.provider.observe(binding, deps.clock.read());
        const answer = await putReport(
          configuration,
          instance.instanceId,
          binding,
          measurement,
          stop,
          deps,
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
      if (stop.aborted) return;
      await deps.sleep(configuration.cadenceSeconds * 1000, AbortSignal.any([wake.signal, stop]));
      if (wake.signal.aborted) wake = new AbortController();
    }
  } finally {
    unsubscribe();
  }
}

/**
 * Runs one reporting loop per configured instance until the first ends; the others stop at their
 * next step and the first end is thrown. It never returns normally and never prints the credential.
 * @throws ReporterExit for `another_reporter`, a WBS refusal, or WBS unavailable after one retry;
 * a provider's error for a measurement it could not parse.
 */
export async function runReporter(
  configuration: ReporterConfiguration,
  deps: ReporterDependencies,
): Promise<never> {
  const stop = new AbortController();
  let first: { readonly cause: unknown } | undefined;
  await Promise.all(
    configuration.instances.map((instance) =>
      reportInstance(configuration, instance, stop.signal, deps).catch((cause: unknown) => {
        first ??= { cause };
        stop.abort();
      }),
    ),
  );
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
    interrupt.addEventListener('abort', wake, { once: true });
  });
}

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
    throw new Error('usage: twilight-dash report-capacity --config <owner-only file>');
  }
  const configuration = await loadReporterConfiguration(path, adapters);
  return runReporter(configuration, deps);
}
