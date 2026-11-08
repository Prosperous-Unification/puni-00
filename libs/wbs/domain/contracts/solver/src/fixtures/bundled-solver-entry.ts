import { type ConnectedOptimizationStage, sliceKey } from '@wbs/domain';

import { buildConnectedSolverRequestPair } from '../build-connected-solver-request';
import { revalidateSolverResult } from '../revalidate-solver-result';

const key = sliceKey('b', null);
const stage: ConnectedOptimizationStage = {
  kind: 'connected-stage',
  projectId: 'B',
  mode: 'isolated',
  originOrdinal: 0,
  projects: [{ projectId: 'B', rank: 0, anchorOrdinal: 0 }],
  input: {
    rows: [{ id: 'b', parentId: null, position: 0, priority: 0, frozenNumber: null }],
    slices: [{ workItemId: 'b', stepId: null, days: 1, width: 1, personId: null, poolIds: [] }],
    graph: { nodes: [{ kind: 'boundary', workItemId: 'b', at: 0 }], edges: [] },
    notBefore: new Map(),
    deadlines: new Map(),
    poolSizes: new Map(),
    resourceCapacities: new Map(),
    elsewhere: new Map(),
    order: {
      kind: 'connected',
      projectIdByWorkItem: new Map([['b', 'B']]),
      rankByProject: new Map([['B', 0]]),
    },
  },
  relationships: [],
  starts: new Map([[key, 0]]),
  finishes: new Map([[key, 1]]),
};

if (typeof revalidateSolverResult !== 'function') throw new Error('local revalidator is absent');
const pair = buildConnectedSolverRequestPair(
  stage,
  { inputHash: 'input', questionHashes: { pri: 'pri-hash', time: 'time-hash' } },
  { solverVersion: '0.4.0', budgetMs: 1000 },
);
if (pair.pri.kind !== 'request' || pair.time.kind !== 'request')
  throw new Error('connected preparation did not return requests');
if (pair.pri.request.scope.questionHash !== 'pri-hash')
  throw new Error('connected question identity was not retained');
process.stdout.write('local=function connected=request\n');
