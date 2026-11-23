import { type ConnectedOptimizationStage, replayConnectedStage } from '@wbs/domain';
import { type } from 'arktype';

const endpoint = type({
  '+': 'reject',
  scope: "'whole'",
  workPackageId: 'string',
  workItemId: 'string',
}).or({
  '+': 'reject',
  scope: "'node' | 'descendant-step'",
  workPackageId: 'string',
  workItemId: 'string',
  stepId: 'string',
});
const edgeEnd = type({ '+': 'reject', leafId: 'string', at: 'number' });
const edge = type({
  '+': 'reject',
  predecessor: edgeEnd,
  successor: edgeEnd,
  type: "'FS'",
  provenance: "'workflow' | 'legacy'",
}).or({
  '+': 'reject',
  predecessor: edgeEnd,
  successor: edgeEnd,
  type: "'FS' | 'SS' | 'FF'",
  provenance: "'authored'",
  relationshipId: 'string',
});
const node = type({
  '+': 'reject',
  kind: "'step'",
  ref: { '+': 'reject', workItemId: 'string', stepId: 'string' },
  at: 'number',
}).or({ '+': 'reject', kind: "'boundary'", workItemId: 'string', at: 'number' });
const pair = type(['string', 'number']);
const booking = type({
  '+': 'reject',
  start: 'number',
  end: 'number',
  workPackageId: 'string',
  workItemId: 'string',
});
const stageShape = type({
  '+': 'reject',
  // Proof: outgoing1 failed 'refuses outgoing stored stage DTO1'.
  dtoVersion: '2',
  kind: "'connected-stage'",
  workPackageId: 'string',
  mode: "'isolated' | 'shared'",
  originOrdinal: 'number',
  workPackages: type({
    '+': 'reject',
    workPackageId: 'string',
    rank: 'number',
    anchorOrdinal: 'number | null',
  }).array(),
  relationships: type({
    '+': 'reject',
    id: 'string',
    type: "'FS' | 'SS' | 'FF'",
    predecessor: endpoint,
    successor: endpoint,
  }).array(),
  starts: pair.array(),
  finishes: pair.array(),
  input: {
    '+': 'reject',
    rows: type({
      '+': 'reject',
      id: 'string',
      parentId: 'string | null',
      position: 'number',
      priority: 'number | null',
      frozenNumber: 'string | null',
    }).array(),
    slices: type({
      '+': 'reject',
      workItemId: 'string',
      stepId: 'string | null',
      days: 'number | null',
      width: 'number',
      personId: 'string | null',
      poolIds: 'string[]',
      'demands?': type({ '+': 'reject', resourceId: 'string', units: 'number' }).array(),
    }).array(),
    graph: { '+': 'reject', nodes: node.array(), edges: edge.array() },
    notBefore: pair.array(),
    deadlines: pair.array(),
    poolSizes: pair.array(),
    resourceCapacities: pair.array(),
    elsewhere: type(['string', booking.array()]).array(),
    order: {
      '+': 'reject',
      kind: "'connected'",
      workPackageIdByWorkItem: type(['string', 'string']).array(),
      rankByWorkPackage: pair.array(),
    },
  },
});

/** Explicit JSON shape: required empty collections remain present; only Slice.demands is optional by domain contract. */
export type StoredConnectedStage = typeof stageShape.infer;

function restoreMap<V>(pairs: readonly (readonly [string, V])[]): Map<string, V> {
  const restored = new Map(pairs);
  // Proof: removing this guard admitted the duplicated start pair in `nested stage request response and evidence refuse unknown fields and duplicate map entries`.
  if (restored.size !== pairs.length) throw new Error('stored connected stage: duplicate map key');
  return restored;
}

/** Parse exact JSON fields before replaying the complete real composite. Throws for corrupt trusted evidence. */
export function decodeConnectedStage(raw: unknown): ConnectedOptimizationStage {
  // Proof: bypassing this schema admitted required-field omissions and unknown nested fields;
  // bypassing cloning leaked priority=999 in `standalone stage decode detaches caller-owned rows without an enclosing packet`.
  const stored = stageShape.assert(structuredClone(raw));
  const { input } = stored;
  const captured: ConnectedOptimizationStage = {
    kind: stored.kind,
    workPackageId: stored.workPackageId,
    mode: stored.mode,
    originOrdinal: stored.originOrdinal,
    workPackages: stored.workPackages,
    relationships: stored.relationships,
    starts: restoreMap(stored.starts),
    finishes: restoreMap(stored.finishes),
    input: {
      ...input,
      notBefore: restoreMap(input.notBefore),
      deadlines: restoreMap(input.deadlines),
      poolSizes: restoreMap(input.poolSizes),
      resourceCapacities: restoreMap(input.resourceCapacities),
      elsewhere: restoreMap(input.elsewhere),
      order: {
        kind: 'connected',
        workPackageIdByWorkItem: restoreMap(input.order.workPackageIdByWorkItem),
        rankByWorkPackage: restoreMap(input.order.rankByWorkPackage),
      },
    },
  };
  // Proof: removing replay admitted forged finishes in `stored stage replay independently refuses a forged finish before an envelope exists`.
  replayConnectedStage(captured);
  return captured;
}

/** Encode maps explicitly and validate the exact stored boundary before returning a detached packet. */
export function encodeConnectedStage(stage: ConnectedOptimizationStage): StoredConnectedStage {
  if (stage.input.order.kind !== 'connected')
    throw new Error('stored connected stage requires connected order');
  const input = stage.input;
  const stored = stageShape.assert(
    structuredClone({
      ...stage,
      // Proof: outgoing1 failed 'writes renamed stored stage DTO2'.
      dtoVersion: 2,
      // Proof: restoring relationship spreads rejected real scoped SQLite cache packets in `saved-plan-connected.test.ts` (unknown workPackageId).
      relationships: stage.relationships.map(({ id, type, predecessor, successor }) => ({
        id,
        type,
        predecessor,
        successor,
      })),
      starts: [...stage.starts],
      finishes: [...stage.finishes],
      input: {
        ...input,
        // Proof: restoring row spreads rejected real SQLite cache packets in `saved-plan-connected.test.ts` (unknown captured metadata).
        rows: input.rows.map(({ id, parentId, position, priority, frozenNumber }) => ({
          id,
          parentId,
          position,
          priority,
          frozenNumber,
        })),
        notBefore: [...input.notBefore],
        deadlines: [...input.deadlines],
        poolSizes: [...input.poolSizes],
        resourceCapacities: [...input.resourceCapacities],
        elsewhere: [...input.elsewhere],
        order: {
          kind: 'connected',
          workPackageIdByWorkItem: [...stage.input.order.workPackageIdByWorkItem],
          rankByWorkPackage: [...stage.input.order.rankByWorkPackage],
        },
      },
    }),
  );
  decodeConnectedStage(stored);
  return stored;
}
