import { resolveSteps, type StepBinding, treeOrder } from '@wbs/domain';

import {
  STEP_FACT_KINDS,
  type StepFactKind,
  type StepInUsePair,
  type StepNodesInUse,
} from '../ports/step-catalogue';
import type {
  StepUsageFact,
  StepUsagePackage,
  StepUsageSnapshot,
  StepUsageWorkItem,
} from '../ports/step-usage';
export type {
  StepUsageAllocator,
  StepUsageDescendantStep,
  StepUsageEndpoint,
  StepUsageFact,
  StepUsageNode,
  StepUsagePackage,
  StepUsageSubtreeClaim,
  StepUsageWhole,
  StepUsageWorkItem,
} from '../ports/step-usage';

function required<Key, Value>(rows: ReadonlyMap<Key, Value>, key: Key, label: string): Value {
  const value = rows.get(key);
  if (value === undefined) throw new Error('step usage missing ' + label);
  return value;
}
function compareText(left: string, right: string): number {
  const encoder = new TextEncoder(),
    bytes = encoder.encode(left).values();
  for (const byte of encoder.encode(right)) {
    const next = bytes.next();
    if (next.done) return -1;
    if (next.value !== byte) return next.value - byte;
  }
  return bytes.next().done ? 0 : 1;
}

/**
 * Projects protected semantic pairs before limiting the response. Actual noninherited
 * type states and both binding captures come from one writer; no package inventory
 * substitutes for a leaf's resolveSteps result. Whole endpoints and valid null subtree
 * reservations name no step. Descendant-step protects only prechange matching leaves.
 * Allocator reservations use their own work item/direct type even on parents; all
 * ordinary node facts still require leaves. Parent reservations retain tree rank.
 * All supplied explicit facts are validated before ignoring nonvanishing pairs; no
 * active-only claim/attempt filtering occurs. No capture or caller array is changed.
 * @throws on duplicate/missing tree/endpoint identity, invalid endpoint shape, or a
 * trusted concrete fact naming an unresolved prechange step.
 */
export function projectStepNodesInUse(
  packages: readonly StepUsagePackage[],
  beforeBindings: readonly StepBinding[],
  afterBindings: readonly StepBinding[],
  facts: readonly StepUsageFact[],
): StepNodesInUse {
  return projectProtectedStepUsage(
    packages,
    beforeBindings,
    afterBindings,
    facts,
    undefined,
    undefined,
  );
}

/**
 * Projects the original leaf step nodes lost by a within-package parent change.
 *
 * The complete {@link StepUsageSnapshot} supplies actual direct types and endpoint scopes.
 * Incoming existing work acquires no destination facts. Explicit allocator
 * reservations keep their own type applicability when their owner becomes a parent;
 * ordinary node-shaped counters retain ordinary node protection. The shared
 * projector validates every prechange fact and preserves its rank/order/count/cap.
 * No snapshot row, binding or fact is mutated. Storage writers must call this on
 * their actual before state before clearing facts or changing structural state.
 * @throws for an absent moving row, absent/foreign destination, invalid candidate
 * tree, or malformed trusted prechange metadata/facts.
 */
export function projectMoveStepUsage(
  snapshot: StepUsageSnapshot,
  workItemId: string,
  parentId: string | null,
): StepNodesInUse {
  const owner = snapshot.packages.find(({ workItems }) =>
    workItems.some(({ id }) => id === workItemId),
  );
  // Proof (component diagnostic): omitting this guard changes the missing-row test to a TypeError.
  if (owner === undefined) throw new Error('move work item is absent');
  // Proof (component scope): omitting this check fails both missing/foreign destination diagnostics.
  if (parentId !== null && !owner.workItems.some(({ id }) => id === parentId))
    throw new Error('move destination is absent from its work package');
  const candidate = owner.workItems.map((row) =>
    row.id === workItemId ? { ...row, parentId } : row,
  );
  // Proof (component): skipping candidate traversal admits both self-parent and descendant cycles.
  treeOrder(candidate);
  const parents = new Set(
    candidate.flatMap(({ parentId: parent }) => (parent === null ? [] : [parent])),
  );
  return projectProtectedStepUsage(
    snapshot.packages,
    snapshot.bindings,
    snapshot.bindings,
    snapshot.facts,
    undefined,
    new Map([[owner.chain.workPackageId, parents]]),
  );
}

/**
 * Projects usage of one reachable step across currently readable actual project children.
 * Removes every binding of that step in the pure comparison, so redundant inheritance
 * never erases usage. Every captured fact is validated before privacy selection/count/cap.
 * No captured rows or authority sets are mutated; no persistence operation is performed.
 */
export function projectReadableStepUsage(
  packages: readonly StepUsagePackage[],
  bindings: readonly StepBinding[],
  facts: readonly StepUsageFact[],
  projectId: string,
  stepId: string,
  readablePackageIds: ReadonlySet<string>,
): StepNodesInUse {
  // Proof: omitting readability exposed402/private pairs instead of201/readable;
  // omitting project scope included the sibling's fact/count2 instead of1.
  // Both mounted owners passed after exact restore (verification-project-usage-read-20261119.json).
  const workPackageIds = new Set(
    packages
      .filter(
        (workPackage) =>
          workPackage.chain.projectId === projectId &&
          readablePackageIds.has(workPackage.chain.workPackageId),
      )
      .map((workPackage) => workPackage.chain.workPackageId),
  );
  // Proof: removing only one binding hid real redundant usage as count0 instead of1.
  // Filtering facts/packages here before semantic validation skipped a stored parent
  // estimate outside the selected project and changed500to200. Exact restores passed
  // the actual mounted owners (verification-project-usage-read-20261119.json).
  return projectProtectedStepUsage(
    packages,
    bindings,
    bindings.filter((binding) => binding.step.id !== stepId),
    facts,
    { stepId, workPackageIds },
    undefined,
  );
}

/** Complete protected-pair validation precedes the optional explicit response selection. */
function projectProtectedStepUsage(
  packages: readonly StepUsagePackage[],
  beforeBindings: readonly StepBinding[],
  afterBindings: readonly StepBinding[],
  facts: readonly StepUsageFact[],
  selection: { readonly stepId: string; readonly workPackageIds: ReadonlySet<string> } | undefined,
  candidateParents: ReadonlyMap<string, ReadonlySet<string>> | undefined,
): StepNodesInUse {
  const captures = new Map<
    string,
    {
      readonly workItems: ReadonlyMap<string, StepUsageWorkItem>;
      readonly children: ReadonlyMap<string, readonly StepUsageWorkItem[]>;
      readonly rank: ReadonlyMap<string, number>;
      readonly before: ReadonlyMap<string, readonly string[]>;
      readonly vanished: ReadonlyMap<string, ReadonlySet<string>>;
      readonly candidateParents: ReadonlySet<string> | undefined;
    }
  >();
  const identities = new Set<string>();
  for (const workPackage of packages) {
    const packageId = workPackage.chain.workPackageId;
    if (captures.has(packageId)) throw new Error('step usage duplicate package');
    const workItems = new Map<string, StepUsageWorkItem>();
    const children = new Map<string, StepUsageWorkItem[]>();
    for (const workItem of workPackage.workItems) {
      if (identities.has(workItem.id)) throw new Error('step usage duplicate work item');
      identities.add(workItem.id);
      workItems.set(workItem.id, workItem);
      if (workItem.parentId !== null) {
        const held = children.get(workItem.parentId);
        if (held === undefined) children.set(workItem.parentId, [workItem]);
        else held.push(workItem);
      }
    }
    const rank = treeOrder(workPackage.workItems);
    const before = new Map<string, readonly string[]>(),
      vanished = new Map<string, ReadonlySet<string>>();
    for (const workItem of workPackage.workItems) {
      const original = resolveSteps(workPackage.chain, workItem.typeState, beforeBindings).map(
        ({ stepId }) => stepId,
      );
      const after = new Set(
        resolveSteps(workPackage.chain, workItem.typeState, afterBindings).map(
          ({ stepId }) => stepId,
        ),
      );
      before.set(workItem.id, original);
      vanished.set(workItem.id, new Set(original.filter((stepId) => !after.has(stepId))));
    }
    captures.set(packageId, {
      workItems,
      children,
      rank,
      before,
      vanished,
      candidateParents: candidateParents?.get(packageId),
    });
  }
  const protectedPairs = new Map<
    string,
    { readonly pair: Omit<StepInUsePair, 'facts'>; readonly kinds: Set<StepFactKind> }
  >();
  const retain = (
    workPackageId: string,
    workItem: StepUsageWorkItem,
    stepId: string,
    kind: StepFactKind,
    isAllocator: boolean,
  ): void => {
    const capture = required(captures, workPackageId, 'fact package');
    const original = required(capture.before, workItem.id, 'fact leaf');
    if (!original.includes(stepId)) throw new Error('step usage fact names an unresolved step');
    // Proof (component): omitting candidate-parent loss returns no destination pairs for the move regressions.
    const vanishes =
      required(capture.vanished, workItem.id, 'vanished leaf').has(stepId) ||
      (!isAllocator && capture.candidateParents?.has(workItem.id) === true);
    if (!vanishes) return;
    const key = JSON.stringify([workPackageId, workItem.id, stepId]);
    const held = protectedPairs.get(key);
    if (held === undefined)
      protectedPairs.set(key, {
        pair: { id: workItem.id, name: workItem.name, stepId, workPackageId },
        kinds: new Set([kind]),
      });
    else held.kinds.add(kind);
  };
  for (const fact of facts) {
    const endpoint = fact.endpoint;
    const capture = required(captures, endpoint.workPackageId, 'endpoint package');
    const workItem = required(capture.workItems, endpoint.workItemId, 'endpoint work item');
    switch (endpoint.scope) {
      case 'whole':
        break;
      case 'subtree-claim':
        if (!capture.children.has(workItem.id))
          throw new Error('step usage subtree claim names a leaf');
        break;
      case 'allocator':
        // Proof (component): treating this as an ordinary node refuses the explicit own-type allocator move.
        retain(endpoint.workPackageId, workItem, endpoint.stepId, fact.kind, true);
        break;
      case 'node':
        if (capture.children.has(workItem.id)) throw new Error('step usage node names a parent');
        retain(endpoint.workPackageId, workItem, endpoint.stepId, fact.kind, false);
        break;
      case 'descendant-step': {
        if (!capture.children.has(workItem.id))
          throw new Error('step usage descendant step names a leaf');
        const pending = [...required(capture.children, workItem.id, 'descendants')];
        let matches = 0;
        for (const descendant of pending) {
          const children = capture.children.get(descendant.id);
          if (children !== undefined) {
            pending.push(...children);
            continue;
          }
          if (!required(capture.before, descendant.id, 'descendant leaf').includes(endpoint.stepId))
            continue;
          matches++;
          retain(endpoint.workPackageId, descendant, endpoint.stepId, fact.kind, false);
        }
        if (matches === 0) throw new Error('step usage descendant endpoint has no resolved match');
        break;
      }
    }
  }
  // Proof: applying a200pair cap before this privacy selection lost every readable
  // pair/count0 instead of201; exact restore passed the mounted402pair owner
  // (verification-project-usage-read-20261119.json).
  const ordered = [...protectedPairs.values()]
    .filter(
      ({ pair }) =>
        selection === undefined ||
        (pair.stepId === selection.stepId && selection.workPackageIds.has(pair.workPackageId)),
    )
    .sort((left, right) => {
      const packageOrder = compareText(left.pair.workPackageId, right.pair.workPackageId);
      if (packageOrder !== 0) return packageOrder;
      const capture = required(captures, left.pair.workPackageId, 'ordered package');
      const rank =
        required(capture.rank, left.pair.id, 'ordered leaf') -
        required(capture.rank, right.pair.id, 'ordered leaf');
      if (rank !== 0) return rank;
      const steps = required(capture.before, left.pair.id, 'ordered steps');
      const leftStep = steps.indexOf(left.pair.stepId),
        rightStep = steps.indexOf(right.pair.stepId);
      if (leftStep < 0 || rightStep < 0)
        throw new Error('step usage protected step is absent from order');
      return leftStep - rightStep;
    });
  return {
    count: ordered.length,
    pairs: ordered.slice(0, 200).map(({ pair, kinds }) => ({
      ...pair,
      facts: STEP_FACT_KINDS.filter((kind) => kinds.has(kind)),
    })),
  };
}
