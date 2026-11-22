import type { CapacityPreviewStore, ResourceOccupancyStore } from './chain-snapshot-store';
import type { HistoryStores, PlanTransactionalStores } from './stores';
import type { UnitOfWork } from './unit-of-work';
import type { WorkPackageReportSnapshot } from './work-package-report-store';

/** Whether an opened source can currently serve requests. */
export type SourceHealth = { ok: true } | { ok: false; reason: 'unavailable' };

/** An opened persistence source and every lifetime it owns. */
export interface Source<S extends PlanTransactionalStores = PlanTransactionalStores> {
  readonly stores: S;
  readonly history: HistoryStores;
  /** Detached public organization occupancy for sources without an installed live-plan reader. */
  readonly resourceOccupancy?: ResourceOccupancyStore;
  /** Committed capacity preview for a public graph without a live-plan reader. */
  readonly capacityPreview?: CapacityPreviewStore;
  /** Committed project reporting for a public graph without a live-plan reader. */
  readonly workPackageReportSnapshot?: WorkPackageReportSnapshot;
  readonly uow: UnitOfWork<S>;
  health(): Promise<SourceHealth>;
  close(): Promise<void>;
}
