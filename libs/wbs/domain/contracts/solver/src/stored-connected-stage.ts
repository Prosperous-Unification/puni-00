import { type ConnectedOptimizationStage, replayConnectedStage } from '@wbs/domain';
import { type } from 'arktype';

const endpoint = type({
  '+': 'reject',
  scope: "'whole'",
  projectId: 'string',
  workItemId: 'string',
}).or({
  '+': 'reject',
  scope: "'node' | 'descendant-step'",
  projectId: 'string',
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
  projectId: 'string',
  workItemId: 'string',
});
const stageShape = type({
  '+': 'reject',
  dtoVersion: '1',
  kind: "'connected-stage'",
  projectId: 'string',
  mode: "'isolated' | 'shared'",
  originOrdinal: 'number',
  projects: type({
    '+': 'reject',
    projectId: 'string',
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
      projectIdByWorkItem: type(['string', 'string']).array(),
      rankByProject: pair.array(),
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
    projectId: stored.projectId,
    mode: stored.mode,
    originOrdinal: stored.originOrdinal,
    projects: stored.projects,
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
        projectIdByWorkItem: restoreMap(input.order.projectIdByWorkItem),
        rankByProject: restoreMap(input.order.rankByProject),
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
      dtoVersion: 1,
      starts: [...stage.starts],
      finishes: [...stage.finishes],
      input: {
        ...input,
        notBefore: [...input.notBefore],
        deadlines: [...input.deadlines],
        poolSizes: [...input.poolSizes],
        resourceCapacities: [...input.resourceCapacities],
        elsewhere: [...input.elsewhere],
        order: {
          kind: 'connected',
          projectIdByWorkItem: [...stage.input.order.projectIdByWorkItem],
          rankByProject: [...stage.input.order.rankByProject],
        },
      },
    }),
  );
  decodeConnectedStage(stored);
  return stored;
}
