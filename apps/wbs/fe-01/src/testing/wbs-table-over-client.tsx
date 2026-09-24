import { type ReactNode, useEffect, useState } from 'react';

import { WbsTable, type WbsTableProps } from '@/components/wbs/wbs-table';
import type {
  OpenProjectStream,
  ProjectRuntime,
  ProjectServices,
} from '@/modules/project/contract';
import { RETIREMENT_BUDGET_MS } from '@/runtime/lifetime-slot';
import { installProjectRuntime } from '@/runtime/project-runtime';

export interface WbsTableOverClientProps extends Omit<WbsTableProps, 'project'> {
  readonly projectId: string;
  /** The suite's fake client, composed — see `projectServicesOf`. */
  readonly projectServices: ProjectServices;
  /** Opens a live subscription; absent, the table is drawn without a socket. */
  readonly subscribe?: OpenProjectStream;
}

/**
 * The table as a suite draws it: over one project runtime per project, client
 * and stream, installed by the production installer.
 *
 * What `ProjectPage`'s owner gives the table, less the owner's gate. The
 * runtime is installed **synchronously in this component's effect**, so the
 * table is on screen by the time Testing Library's `render` returns, exactly
 * as every suite has always asserted; when any of the three props changes —
 * a suite's "another project" or "another API" — the old runtime is withdrawn
 * in the effect's cleanup, the instant React retires it, and given back after,
 * and the new one is installed in the same commit.
 *
 * It does **not** hold the next runtime back until the last one's retirement
 * has succeeded, and it never shows a fatal state: that is the project owner's
 * job, proved by `runtime/project-runtime.model.test.ts` and the page's own
 * suite, which draw through the real owner. A retirement that rejects here is
 * left to reject, loudly, in the suite that caused it.
 */
export function WbsTableOverClient({
  projectId,
  projectServices,
  subscribe,
  ...table
}: WbsTableOverClientProps): ReactNode {
  const [project, setProject] = useState<ProjectRuntime | null>(null);
  useEffect(() => {
    let current = true;
    const runtime = installProjectRuntime({
      projectId,
      services: projectServices,
      subscribe,
      isCurrent: () => current,
    });
    setProject(runtime.services);
    return () => {
      current = false;
      void runtime.close({ timeoutMs: RETIREMENT_BUDGET_MS });
    };
  }, [projectId, projectServices, subscribe]);
  return project === null ? null : <WbsTable project={project} {...table} />;
}
