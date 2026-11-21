import type { WorkPackageAddressApi } from '@/lib/wbs-api';

type Reply<Operation extends (...args: never[]) => unknown> = Awaited<ReturnType<Operation>>;
type FeatureReply<Wire> = Wire extends { kind: 'success'; body: infer Body }
  ? { kind: 'success'; body: Body }
  : Wire extends { kind: 'refusal'; status: infer Status; body: infer Body }
    ? { kind: 'refusal'; status: Status; body: Body }
    : Wire extends { kind: 'failure'; failure: infer Failure }
      ? { kind: 'failure'; failure: Failure } | { kind: 'cancelled' }
      : never;

export type WorkPackageDiscoveryReply = FeatureReply<Reply<WorkPackageAddressApi['workPackages']>>;
type EndpointWireReply = FeatureReply<Reply<WorkPackageAddressApi['candidates']>>;
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
export type ReferenceResolutionReply = FeatureReply<Reply<WorkPackageAddressApi['resolve']>>;
export type AddressWorkPackage = Extract<
  WorkPackageDiscoveryReply,
  { kind: 'success' }
>['body']['workPackages'][number];

/** Read-only bounded address observations, scoped to one work package runtime lifetime. */
export interface DependencyLookup {
  discoverWorkPackages: (
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ) => Promise<WorkPackageDiscoveryReply>;
  searchEndpoints: (
    workPackageId: string,
    query: string,
    cursor: string | null,
    signal?: AbortSignal,
  ) => Promise<EndpointSearchReply>;
  resolveReference: (
    workPackageId: string,
    reference: string,
    revision: string,
    signal?: AbortSignal,
  ) => Promise<ReferenceResolutionReply>;
}

export interface OpenedDependencyLookup {
  lookup: DependencyLookup;
  close(): void;
}
