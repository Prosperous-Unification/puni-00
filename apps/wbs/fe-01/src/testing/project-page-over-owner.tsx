import { useMemo, useState } from 'react';

import { ProjectPage, type ProjectPageProps } from '@/components/wbs/project-page';
import type { ProjectStreamDeps } from '@/lib/project-stream';
import type { ProjectApi } from '@/lib/wbs-api';
import { projectSourceOver } from '@/modules/project/composition';
import type { ProjectCatalog } from '@/modules/project/contract';
import { createProjectCatalog } from '@/modules/project/project-catalog.feature';
import { createProjectOwner, type ProjectOwner } from '@/runtime/project-runtime';
import type { SessionProjects } from '@/runtime/session-runtime';

/**
 * The catalog and the project owner a session would hand the page, over one
 * client the suite holds and an owner of the suite's own: the session's wiring
 * without the session, which is never withdrawn here.
 *
 * `streamDeps` is the socket's wiring; left out, the stream is the browser's
 * own, as the page's suites have always drawn it.
 */
export function pageWiring(
  owner: ProjectOwner,
  api: ProjectApi,
  streamDeps?: ProjectStreamDeps,
): { catalog: ProjectCatalog; projects: SessionProjects } {
  const source = projectSourceOver(api, streamDeps);
  return {
    catalog: createProjectCatalog({ routes: api, isCurrent: () => true }),
    projects: {
      subscribe: owner.subscribe,
      snapshot: owner.snapshot,
      open: (projectId) => owner.open(projectId, source),
      leave: owner.leave,
    },
  };
}

/** The page's own props, with the client and the socket a session would hold instead. */
export type ProjectPageOverOwnerProps = Omit<ProjectPageProps, 'catalog' | 'projects'> & {
  api: ProjectApi;
  streamDeps?: ProjectStreamDeps;
};

/**
 * The project page with a project owner of its own, the way its suites have
 * always drawn it.
 *
 * In the app the catalog and the owner are the signed-in session's, handed down
 * through router context, and the session's retirement retires the project
 * first. The page's suites draw the page on its own, so this builds one owner
 * per mount and keeps it across a rerender, and wires it over the client the
 * suite hands in — a new client is a new catalog and a new source, as a new
 * session would be. What the session adds is proved by the session runtime's
 * own suites and by the router's, not here.
 */
export function ProjectPageOverOwner({
  api,
  streamDeps,
  ...props
}: ProjectPageOverOwnerProps): React.JSX.Element {
  const [owner] = useState(createProjectOwner);
  const wiring = useMemo(() => pageWiring(owner, api, streamDeps), [owner, api, streamDeps]);
  return <ProjectPage {...wiring} {...props} />;
}
