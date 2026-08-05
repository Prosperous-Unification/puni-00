import type { Broadcaster, ProjectEvent } from '../service/broadcast';

export interface RecordingBroadcaster extends Broadcaster {
  readonly published: { projectId: string; event: ProjectEvent }[];
}

/** Collects what would have gone to gw-01, so a test can assert the payload shape. */
export function recordingBroadcaster(): RecordingBroadcaster {
  const published: { projectId: string; event: ProjectEvent }[] = [];
  return {
    published,
    publish(projectId, event) {
      published.push({ projectId, event });
      return Promise.resolve();
    },
  };
}
