/**
 * The compute provider port (`compute-providers` P8): what fulfils a WBS resource's units and
 * runs agents against it. WBS stores only the instance id on the resource and the latest
 * {@link Measurement} a reporter sends; leases, expiry and measured usage stay in Dash.
 */

/** Every kind WBS registers; only `ssh_host` has an adapter in this slice. */
export const PROVIDER_KINDS = ['ssh_host', 'docker', 'kubernetes', 'puni_pool'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** What a binding measures, always in the resource's own unit, converted by the adapter only. */
export const MEASURES = ['memory_gib', 'disk_gib', 'cpu_cores', 'agent_slots'] as const;
export type Measure = (typeof MEASURES)[number];

/**
 * One WBS resource a provider instance measures. `path` is present exactly for `disk_gib` (the
 * mount to measure) and `slots` exactly for `agent_slots` (the operator's ceiling); the loader
 * refuses any other combination.
 */
export interface ResourceBinding {
  readonly resourceId: string;
  readonly measure: Measure;
  readonly path?: string;
  readonly slots?: number;
}

/**
 * One observation. `measured` units are whole numbers in the resource's unit; `evidence` names
 * the transport and the raw lines read and stays in Dash. `unreachable` is a typed transport
 * fault only: an unparseable answer from a reachable host throws instead.
 */
export type Measurement =
  | {
      readonly kind: 'measured';
      readonly capacityUnits: number;
      readonly usageUnits: number;
      readonly observedAt: number;
      readonly evidence: string;
    }
  | { readonly kind: 'unreachable'; readonly reason: string; readonly observedAt: number };

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
  run(request: AgentRunRequest, now: number): Promise<AgentRunHandle>;
  onRunChange(listener: () => void): () => void;
}
