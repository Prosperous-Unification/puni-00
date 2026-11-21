import type { RequestFailure } from './endpoint';

/** Missing/null parent is distinct only when every structural issue names that field. */
export function classifyParentBodyFailure(
  failure: Pick<Extract<RequestFailure, { part: 'body' }>, 'code' | 'rejected' | 'issues'>,
) {
  if (failure.code === 'invalid_json')
    return { ok: false, status: 400, body: { error: 'invalid_json' } } as const;
  const rejected = failure.rejected;
  const missing =
    typeof rejected === 'object' &&
    rejected !== null &&
    !Array.isArray(rejected) &&
    (!('projectId' in rejected) || rejected.projectId === null);
  const issues = failure.issues;
  if (issues === undefined || issues.length === 0)
    return { ok: false, status: 422, body: { error: 'invalid_body' } } as const;
  const parentOnly = issues.every((issue) => {
    const path = issue.path;
    if (path?.length !== 1) return false;
    const segment = path[0];
    return (typeof segment === 'object' ? segment.key : segment) === 'projectId';
  });
  return missing && parentOnly
    ? ({ ok: false, status: 422, body: { error: 'project_required' } } as const)
    : ({ ok: false, status: 422, body: { error: 'invalid_body' } } as const);
}
