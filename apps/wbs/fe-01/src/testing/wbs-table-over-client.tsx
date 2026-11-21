import { type ReactNode, useEffect, useState } from 'react';

import { WbsTable, type WbsTableProps } from '@/components/wbs/wbs-table';
import type {
  OpenWorkPackageStream,
  WorkPackageRuntime,
  WorkPackageServices,
} from '@/modules/work-package/contract';
import { RETIREMENT_BUDGET_MS } from '@/runtime/lifetime-slot';
import { installWorkPackageRuntime } from '@/runtime/work-package-runtime';

export interface WbsTableOverClientProps extends Omit<WbsTableProps, 'workPackage'> {
  readonly workPackageId: string;
  /** The suite's fake client, composed — see `workPackageServicesOf`. */
  readonly workPackageServices: WorkPackageServices;
  /** Opens a live subscription; absent, the table is drawn without a socket. */
  readonly subscribe?: OpenWorkPackageStream;
}

/**
 * The table as a suite draws it: over one work package runtime per work package, client
 * and stream, installed by the production installer.
 *
 * What `WorkPackagePage`'s owner gives the table, less the owner's gate. The
 * runtime is installed **synchronously in this component's effect**, so the
 * table is on screen by the time Testing Library's `render` returns, exactly
 * as every suite has always asserted; when any of the three props changes —
 * a suite's "another work package" or "another API" — the old runtime is withdrawn
 * in the effect's cleanup, the instant React retires it, and given back after,
 * and the new one is installed in the same commit.
 *
 * It does **not** hold the next runtime back until the last one's retirement
 * has succeeded, and it never shows a fatal state: that is the work package owner's
 * job, proved by `runtime/work-package-runtime.model.test.ts` and the page's own
 * suite, which draw through the real owner. A retirement that rejects here is
 * left to reject, loudly, in the suite that caused it.
 */
export function WbsTableOverClient({
  workPackageId,
  workPackageServices,
  subscribe,
  ...table
}: WbsTableOverClientProps): ReactNode {
  const [workPackage, setWorkPackage] = useState<WorkPackageRuntime | null>(null);
  useEffect(() => {
    let current = true;
    const runtime = installWorkPackageRuntime({
      workPackageId,
      services: workPackageServices,
      subscribe,
      isCurrent: () => current,
    });
    setWorkPackage(runtime.services);
    return () => {
      current = false;
      void runtime.close({ timeoutMs: RETIREMENT_BUDGET_MS });
    };
  }, [workPackageId, workPackageServices, subscribe]);
  return workPackage === null ? null : <WbsTable workPackage={workPackage} {...table} />;
}
