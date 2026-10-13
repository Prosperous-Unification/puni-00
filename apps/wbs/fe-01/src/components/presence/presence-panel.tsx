import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * Who else is in this project, and whether the socket saying so is up.
 *
 * Presence is push-only after the first frame: gw-01 broadcasts the roster
 * whenever anyone joins or leaves, and the `who` the stream sends on open is
 * what a client entering a quiet room is answered with.
 *
 * **The roster is a project's**, scoped by the `subscribe` frame — gw-01's
 * roster was every username connected to the *gateway* until F4, so a project
 * one second old listed accounts that had never opened it (observed live
 * 2026-08-09).
 */
export interface Roster {
  users: readonly string[];
  /** Whether the socket carrying the roster is up — see {@link PresencePanel}. */
  connected: boolean;
}

export interface PresencePanelProps extends Roster {
  me: string;
}

/**
 * The roster, in the header bar.
 *
 * **It opens no socket, and that is the change of 2026-09-02.** It held its own
 * WebSocket per project until then — a second connection per browser, a second
 * `subscribe`, a second entry in the gateway's fan-out, to be told the same
 * thing by the same gateway the table was already listening to. The roster
 * arrives on the plan's own stream now (`subscribeToProject`'s `onPresence`),
 * and `ProjectPage` holds it because it renders both halves of the screen.
 *
 * Two things follow, and the second was a caveat this file used to carry:
 *
 * - A page with no project open shows nobody, because nothing subscribes.
 * - **A dropped connection recovers.** The old socket did not reconnect, so the
 *   roster froze at whoever was there and only a reload started another; the
 *   stream reconnects, resubscribes and asks again.
 *
 * The shape is a header row's: a dot that is the connection, the heading
 * that says it in a word, and the roster as one clipped line beside it. Bounded
 * width is structural rather than cosmetic — an unbounded list of names is the
 * one thing in the bar that grows with the world rather than with the layout.
 *
 * **Below `xl` it collapses to the dot and a count** (UI review F-011): at
 * 1024 the clipped line was down to the first letter of one name, which says
 * less than a number does. The heading and the list stay in the accessibility
 * tree (`sr-only`), and the section's fact card (`data-fact`, the app's own
 * card rather than a native `title`) carries the whole roster for a pointer.
 *
 * **Online or Offline, not the channel's state** (F-018). The heading read
 * `Online (open)`: `open` is the socket's word, and to a reader it meant
 * nothing. Offline is what a dropped stream is to them, and the roster shown
 * beside it is the last one heard.
 */
export function PresencePanel({ me, users, connected }: PresencePanelProps) {
  const headingId = useId();
  const state = connected ? 'Online' : 'Offline';
  const roster = users.map((user) => (user === me ? `${user} (you)` : user)).join(', ');
  return (
    <section
      aria-labelledby={headingId}
      data-fact={users.length === 0 ? `${state}: nobody yet` : `${state}: ${roster}`}
      className="flex min-w-0 items-center gap-1.5 text-xs"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          connected ? 'bg-[var(--status-done)]' : 'bg-muted-foreground',
        )}
      />
      <h2 id={headingId} className="text-muted-foreground shrink-0 font-medium max-xl:sr-only">
        {state}
      </h2>
      {users.length === 0 ? (
        <p className="text-muted-foreground max-xl:sr-only">Nobody yet.</p>
      ) : (
        <ul className="m-0 flex max-w-48 list-none gap-2 overflow-hidden p-0 whitespace-nowrap max-xl:sr-only">
          {users.map((u) => (
            <li key={u}>
              {u}
              {u === me && <span className="text-muted-foreground"> (you)</span>}
            </li>
          ))}
        </ul>
      )}
      <span aria-hidden="true" data-presence-count className="text-muted-foreground xl:hidden">
        {users.length}
      </span>
    </section>
  );
}
