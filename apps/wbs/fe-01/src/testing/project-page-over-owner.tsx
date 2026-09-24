import { useState } from 'react';

import { ProjectPage, type ProjectPageProps } from '@/components/wbs/project-page';
import { createProjectOwner } from '@/runtime/project-runtime';

/** The page's own props, without the project owner a session hands it. */
export type ProjectPageOverOwnerProps = Omit<ProjectPageProps, 'projectOwner'>;

/**
 * The project page with a project owner of its own, the way its suites have
 * always drawn it.
 *
 * In the app the owner is the signed-in session's, handed down through router
 * context, and the session's retirement retires it first. The page's suites
 * draw the page on its own, so this builds one owner per mount — exactly what
 * the page itself built before the session owned it — and keeps it across a
 * rerender. What the session adds is proved by the session runtime's own suites
 * and by the router's, not here.
 */
export function ProjectPageOverOwner(props: ProjectPageOverOwnerProps): React.JSX.Element {
  const [projectOwner] = useState(createProjectOwner);
  return <ProjectPage projectOwner={projectOwner} {...props} />;
}
