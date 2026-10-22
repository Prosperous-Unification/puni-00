import type { ScopedTypedDependency } from './typed-dependency';

/** A component joined by alternating incident edges and people, with unrelated projects excluded. */
export function buildConnectedBenchmark(shape: 'sparse' | 'dense') {
  const count = shape === 'sparse' ? 202 : 26;
  const projects = Array.from({ length: count }, (_, rank) => ({
    projectId: `${shape}-${String(rank)}`,
    workItemId: `${shape}-${String(rank)}-work`,
    stepId: `${shape}-${String(rank)}-step`,
    personId:
      shape === 'sparse'
        ? rank > 0 && rank < count - 1
          ? `${shape}-person-${String(Math.floor((rank - 1) / 2))}`
          : null
        : rank >= count - 2
          ? `${shape}-bridge`
          : null,
  }));
  const relationships: ScopedTypedDependency[] = [];
  for (const [before, predecessor] of projects.entries()) {
    for (const [after, successor] of projects.entries()) {
      const connects =
        shape === 'sparse'
          ? before % 2 === 0 && after === before + 1
          : before < after && after < count - 1;
      if (connects)
        relationships.push({
          id: `${shape}-edge-${String(before)}-${String(after)}`,
          predecessor: {
            projectId: predecessor.projectId,
            workItemId: predecessor.workItemId,
            scope: 'whole',
          },
          successor: {
            projectId: successor.projectId,
            workItemId: successor.workItemId,
            scope: 'whole',
          },
          type: 'FS',
        });
    }
  }
  return { projects, relationships };
}
