import type { ProjectAddressApi } from '@/lib/wbs-api';

type Reply<Operation extends (...args: never[]) => unknown> = Awaited<ReturnType<Operation>>;
type FeatureReply<Wire> = Wire extends { kind: 'success'; body: infer Body }
  ? { kind: 'success'; body: Body }
  : Wire extends { kind: 'refusal'; status: infer Status; body: infer Body }
    ? { kind: 'refusal'; status: Status; body: Body }
    : Wire extends { kind: 'failure'; failure: infer Failure }
      ? { kind: 'failure'; failure: Failure } | { kind: 'cancelled' }
      : never;

export type ProjectDiscoveryReply = FeatureReply<Reply<ProjectAddressApi['projects']>>;
type EndpointWireReply = FeatureReply<Reply<ProjectAddressApi['candidates']>>;
type EndpointBody = Extract<EndpointWireReply, { kind: 'success' }>['body'];
type WireCandidate = EndpointBody['candidates'][number];
/** Non-whole candidates carry the observed step evidence required by Customize. */
export type AddressCandidate = WireCandidate &
  (
    | { endpoint: Extract<WireCandidate['endpoint'], { scope: 'whole' }> }
    | {
        endpoint: Exclude<WireCandidate['endpoint'], { scope: 'whole' }>;
        step: NonNullable<WireCandidate['step']>;
      }
  );
export type EndpointSearchReply =
  | Exclude<EndpointWireReply, { kind: 'success' }>
  | {
      kind: 'success';
      body: Omit<EndpointBody, 'candidates'> & { candidates: AddressCandidate[] };
    };
export type ReferenceResolutionReply = FeatureReply<Reply<ProjectAddressApi['resolve']>>;
export type AddressProject = Extract<
  ProjectDiscoveryReply,
  { kind: 'success' }
>['body']['projects'][number];

/** Read-only bounded address observations, scoped to one project runtime lifetime. */
export interface DependencyLookup {
  discoverProjects: (
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ) => Promise<ProjectDiscoveryReply>;
  searchEndpoints: (
    projectId: string,
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ) => Promise<EndpointSearchReply>;
  resolveReference: (
    projectId: string,
    reference: string,
    revision: string,
    signal?: AbortSignal,
  ) => Promise<ReferenceResolutionReply>;
}

export interface OpenedDependencyLookup {
  lookup: DependencyLookup;
  close(): void;
}
