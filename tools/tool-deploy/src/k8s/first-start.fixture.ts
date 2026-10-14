import { fixtureCutoverIdentity } from './cutover-replay.fixture';
import type { FirstStartRequest } from './first-start';

export function fixtureFirstStartRequest(): FirstStartRequest {
  const identity = fixtureCutoverIdentity();
  const exported = {
    path: '/export/wbs-export.sqlite',
    integrity: ['ok'],
    foreignKeyViolations: 0,
    migrations: ['m1'],
    counts: { project: 1 },
    known: { known: true },
    sha256: 'c'.repeat(64),
    ownerUid: 0,
    replay: {
      ...identity,
      version: 1,
      inventory: [{ kind: 'move_progress_v1', count: 1 }],
      capabilities: ['move_progress_v1'],
      exportSha256: 'c'.repeat(64),
    },
  };
  return {
    environment: 'local',
    identity,
    exported,
    restored: { ...exported, path: '/data/wbs.sqlite', ownerUid: 10001 },
    cluster: { context: 'lab', uid: 'cluster' },
    namespaces: { app: 'wbs', backend: 'wbs-solver', appUid: 'app', backendUid: 'backend' },
    pvc: { name: 'wbs-data', uid: 'volume', path: '/data/wbs.sqlite' },
    restore: { name: 'wbs-cutover-restore', uid: 'restore' },
    flux: {
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'wbs',
      desiredRevision: 'a'.repeat(40),
      previousRevision: 'b'.repeat(40),
    },
  };
}
