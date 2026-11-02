/**
 * The compute provider port (`compute-providers` P8): what fulfils a WBS resource's units and
 * runs agents against it. WBS stores only the instance id on the resource and the latest
 * {@link Measurement} a reporter sends; leases, expiry and measured usage stay in Dash.
 */

/**
 * Every kind WBS registers. `ssh_host` and `docker` have adapters, `kubernetes` a stub the loader
 * refuses, and `puni_pool` is a slot with no adapter (`compute-providers` P9).
 */
export const PROVIDER_KINDS = ['ssh_host', 'docker', 'kubernetes', 'puni_pool'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** What a binding measures, always in the resource's own unit, converted by the adapter only. */
export const MEASURES = ['memory_gib', 'disk_gib', 'cpu_cores', 'agent_slots'] as const;
export type Measure = (typeof MEASURES)[number];

/**
 * One WBS resource a provider instance measures. `slots` is present exactly for `agent_slots`
 * (the operator's ceiling). A `disk_gib` binding carries `path` (the mount an `ssh_host`
 * measures) or, for a `docker` instance, `ceilingGib` (the operator's ceiling, since
 * `docker system df` states usage only); the loader refuses any other combination.
 *
 * `source: 'host_pool'` with a `dimension` (`dash-host-jobs` J10) adds what this host's
 * managed-resource ledger reserves of that dimension as the report's `reservedUnits`; the
 * adapter's measurement stays `usageUnits`. `cpuCores` pairs with `cpu_cores`, `memoryGib` with
 * `memory_gib`, `tmpDiskGib` with `disk_gib`, an exclusive id with `agent_slots`.
 */
export interface ResourceBinding {
  readonly resourceId: string;
  readonly measure: Measure;
  readonly path?: string;
  readonly slots?: number;
  readonly ceilingGib?: number;
  readonly source?: 'host_pool';
  readonly dimension?: string;
}

/** What a stub adapter answers from every method; WBS accepts no report carrying it. */
export interface NotImplemented {
  readonly kind: 'not_implemented';
}

/**
 * One observation. `measured` units are whole numbers in the resource's unit; `evidence` names
 * the transport and the raw lines read and stays in Dash. `unreachable` is a typed transport
 * fault only: an unparseable answer from a reachable host throws instead. `not_implemented` comes
 * only from a stub, which the loader refuses before any observation.
 */
export type Measurement =
  | {
      readonly kind: 'measured';
      readonly capacityUnits: number;
      readonly usageUnits: number;
      readonly observedAt: number;
      readonly evidence: string;
    }
  | { readonly kind: 'unreachable'; readonly reason: string; readonly observedAt: number }
  | (NotImplemented & { readonly observedAt: number });

/**
 * An agent run: an argv executed on the provider. `environment` keys must be in the adapter's
 * allow-list; nothing of the reporter's own environment, and never its WBS credential, is passed.
 */
export interface AgentRunRequest {
  readonly command: readonly [string, ...string[]];
  readonly environment: Readonly<Record<string, string>>;
}

/** A started run; `exited` settles once with the remote exit code and its captured stdout. */
export interface AgentRunHandle {
  readonly kind: 'started';
  readonly startedAt: number;
  readonly exited: Promise<{ readonly exitCode: number; readonly stdout: string }>;
}

/**
 * A provider instance as Dash drives it. `observe` answers `unreachable` for a typed transport
 * fault and throws for anything else. `onRunChange` calls its listener when a run this instance
 * started begins or ends, so the reporter reports outside its cadence; it returns the unsubscribe.
 * Every instant arrives as `now` from the caller's injected clock.
 */
export interface ComputeProvider {
  readonly kind: ProviderKind;
  readonly instanceId: string;
  readonly capabilities: { readonly measures: ReadonlySet<Measure>; readonly runs: boolean };
  observe(binding: ResourceBinding, now: number): Promise<Measurement>;
  run(request: AgentRunRequest, now: number): Promise<AgentRunHandle | NotImplemented>;
  onRunChange(listener: () => void): () => void;
}
