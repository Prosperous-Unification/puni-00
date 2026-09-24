import { createChannel } from '@/modules/channel';
import type { Store } from '@/modules/store';

/**
 * Who else has one project open, and whether the socket saying so is up.
 *
 * gw-01 scopes the list by the project the socket subscribed to, and it
 * arrives on the plan's own stream, so it is one project's and nobody else's.
 * It starts empty and disconnected: before a socket has said anything, that is
 * the honest answer, and never a previous project's list under a new
 * project's name.
 */
export interface Presence {
  readonly users: readonly string[];
  readonly connected: boolean;
}

/**
 * One project's presence: the store the header selects from, and the two
 * writes the project's stream makes into it.
 *
 * The stability rule of {@link Store}: a write that changes nothing — the same
 * list object, the same connection — leaves the snapshot the same object and
 * tells nobody; one that changes a member replaces the snapshot once and tells
 * every listener once, after the replacement. The list is compared by identity:
 * every presence frame is a new list, and a frame is a change.
 *
 * Plain TypeScript with no lifetime of its own (rule F1): nothing closes it and
 * no call on it throws a lifecycle refusal. One store per selected project; the
 * page holds it today and the project runtime of OpenSpec task 10 takes it over.
 */
export interface PresenceStore extends Store<Presence> {
  readonly reportUsers: (users: readonly string[]) => void;
  readonly reportConnection: (connected: boolean) => void;
}

/** Builds one project's presence: nobody, not connected. */
export function createPresence(): PresenceStore {
  const changes = createChannel<undefined>();
  let current: Presence = { users: [], connected: false };
  const replace = (next: Presence): void => {
    current = next;
    changes.publish(undefined);
  };
  return {
    subscribe: (onChange) => changes.subscribe(onChange),
    snapshot: () => current,
    reportUsers: (users) => {
      if (users === current.users) return;
      replace({ ...current, users });
    },
    reportConnection: (connected) => {
      if (connected === current.connected) return;
      replace({ ...current, connected });
    },
  };
}
