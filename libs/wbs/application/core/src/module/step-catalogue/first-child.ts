import type { IncidentNodeReceipt } from '../../ports/incident-node-transition';
import type { StepNodesInUse } from '../../ports/step-catalogue';
import type { StoredTypedDependency } from '../../ports/typed-dependency-store';
import type { Repositioned, WorkItem } from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import { readFirstChildRecord } from './first-child-history';

/**
 * Current first-child journal identity. Facts are moved from the current writer,
 * never replayed by overwriting captured claim leases, revocations or occupancy.
 * The command's ordinary revision/permission checks still admit replay; this
 * descriptor grants neither authority nor permission to replace another child.
 */
export interface FirstChildRecord {
  readonly version: 1;
  readonly child: WorkItem & { readonly parentId: string };
  readonly parentStatements: Pick<WorkItem, 'readiness' | 'hold'>;
  readonly stepIds: readonly string[];
}

/**
 * One structural write after the existing local/remote relationship admission.
 * Down creates the explicitly untyped child and transfers its parent's work;
 * up requires that exact sole leaf child and transfers current work back before
 * deleting it. No supplied scalar snapshot replaces live claim satellites.
 *
 * Local relationships are complete original incident rows, captured before any
 * mutation. The writer checks them against its own current rows. Detached remote
 * receipts belong to the existing incident transition owner; they are checked
 * as usage evidence and never used to manufacture foreign write authority.
 */
interface FirstChildAdmission {
  readonly respaced: readonly Repositioned[];
  readonly localDependencies: readonly StoredTypedDependency[];
  readonly detachedIncidents: readonly IncidentNodeReceipt[];
}

export type FirstChildWrite = FirstChildAdmission &
  (
    | { readonly kind: 'fresh'; readonly child: WorkItem & { readonly parentId: string } }
    | {
        readonly kind: 'replay';
        readonly direction: 'down' | 'up';
        readonly record: FirstChildRecord;
      }
  );

export type FirstChildWriteOutcome =
  | { readonly kind: 'written'; readonly record: FirstChildRecord }
  | { readonly kind: 'not_found' | 'stale_transition' }
  | ({ readonly kind: 'step_nodes_in_use' } & StepNodesInUse);

/** Plain inputs are retained before any actual Source queue or asynchronous admission. */
export function retainFirstChildWrite(write: FirstChildWrite, stamp: WriteStamp) {
  const retained = structuredClone(write);
  if (retained.kind === 'fresh') {
    readFirstChildRecord({
      version: 1,
      child: retained.child,
      parentStatements: { readiness: retained.child.readiness, hold: retained.child.hold },
      stepIds: [],
    });
  }
  return { write: retained, stamp: { ...stamp } };
}
