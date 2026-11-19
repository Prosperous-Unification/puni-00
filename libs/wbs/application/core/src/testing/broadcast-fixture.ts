import type { Broadcaster, WorkPackageEvent } from '../ports/work-package-event';

export interface RecordingBroadcaster extends Broadcaster {
  readonly published: { workPackageId: string; event: WorkPackageEvent }[];
}

/** Collects what would have gone to gw-01, so a test can assert the payload shape. */
export function recordingBroadcaster(): RecordingBroadcaster {
  const published: { workPackageId: string; event: WorkPackageEvent }[] = [];
  return {
    published,
    publish(workPackageId, event) {
      published.push({ workPackageId, event });
      return Promise.resolve();
    },
    latestSeq(workPackageId) {
      // One sequence per work package, counting from zero, so this mirrors what the
      // real sequencer would have assigned rather than a shared counter.
      const forWorkPackage = published.filter((entry) => entry.workPackageId === workPackageId);
      return Promise.resolve(forWorkPackage.length - 1);
    },
  };
}
