import type { ResourceAccess } from './organization-access';
import type { PlanTree } from './plan-tree';
import type { EngineUnavailable } from './scheduler';
import type { AccessRefused } from './shared-people-values';

/**
 * Project tree reads through the caller's resolved access, independent of the resource.
 *
 * Proof: restoring the concrete resource Pick directly or through a neutral-looking
 * port re-export made the committed production K6 boundary oracle fail with
 * `concrete space tree resource edge remains`; watched 2026-10-16. Commands and
 * fault patches: `openspec/changes/space-tree-port-boundary/verify.md`.
 */
export interface TreeRead {
  /** The project page's tree, with scoped assignee names and existing read refusals. */
  treeWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<PlanTree | EngineUnavailable | null | AccessRefused>;

  /** A shared or isolated connected aggregate, detached before load and space presentation. */
  sharedTreesWithin(
    actorId: string,
    access: ResourceAccess,
  ): Promise<
    | AccessRefused
    | { readonly kind: 'isolated' }
    | {
        readonly kind: 'isolated-connected';
        readonly entries: readonly {
          readonly projectId: string;
          readonly name: string;
          readonly rank: number;
          readonly revision: number;
          readonly seq: number;
          readonly basis: string | null;
          readonly tree: PlanTree | EngineUnavailable;
        }[];
      }
    | {
        readonly kind: 'shared';
        readonly entries: readonly {
          readonly projectId: string;
          readonly name: string;
          readonly rank: number;
          readonly revision: number;
          readonly seq: number;
          readonly basis: string | null;
          readonly tree: PlanTree | EngineUnavailable;
        }[];
      }
  >;
}
