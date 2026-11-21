import type { ScopedTypedDependency } from './typed-dependency';

/** A component joined by alternating incident edges and people, with unrelated work packages excluded. */
export function buildConnectedBenchmark(shape: 'sparse' | 'dense') {
  const count = shape === 'sparse' ? 202 : 26;
  const workPackages = Array.from({ length: count }, (_, rank) => ({
    workPackageId: `${shape}-${String(rank)}`,
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
  for (const [before, predecessor] of workPackages.entries()) {
    for (const [after, successor] of workPackages.entries()) {
      const connects =
        shape === 'sparse'
          ? before % 2 === 0 && after === before + 1
          : before < after && after < count - 1;
      if (connects)
        relationships.push({
          id: `${shape}-edge-${String(before)}-${String(after)}`,
          predecessor: {
            workPackageId: predecessor.workPackageId,
            workItemId: predecessor.workItemId,
            scope: 'whole',
          },
          successor: {
            workPackageId: successor.workPackageId,
            workItemId: successor.workItemId,
            scope: 'whole',
          },
          type: 'FS',
        });
    }
  }
  return { workPackages, relationships };
}
