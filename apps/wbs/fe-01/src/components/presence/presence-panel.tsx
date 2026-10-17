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

/** What the panel says while the link is down, when nobody's presence can be known. */
const UNKNOWN = 'Who else is here is not known until the link is back.';

/** What `Live` means, said in the fact card ahead of the roster (D9 amendment, F-096). */
const LIVE_MEANS = 'edits by other people and who is here arrive as they happen.';

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
 * **Below 1440px it collapses to the dot and a count** (UI review F-011): at
 * 1024 the clipped line was down to the first letter of one name, which says
 * less than a number does, and at 1280 `local-dev (you)` still lost its `)` —
 * measured 74px of room for 79px of name. From 1440 the line is shown, and it
 * **wraps rather than clips**: one line tall with the overflow hidden, so a
 * name that does not fit drops whole onto the hidden second line instead of
 * being cut mid-word. The heading and the list stay in the accessibility
 * tree (`sr-only`), and the section's fact card (`data-fact`, the app's own
 * card rather than a native `title`) carries the whole roster for a pointer.
 *
 * **Live or Reconnecting: the pill is the live link, not the server** (UI review
 * decision D9, F-078). It reports the plan's stream through gw-01 — whether other
 * people's edits and who is here arrive as they happen — and nothing about whether
 * be-01 will take a change; a refused or failed write is the table's own sentence
 * and Retry. It read `Online (open)` until F-018 and `Online` / `Offline` after,
 * and `Online` beside "The server could not complete that change" read as a
 * contradiction. `Reconnecting` is the stream's real behaviour and the table's
 * line says the same word.
 *
 * The Live fact card says what Live means before the roster (F-096): the pill's
 * one chance to teach that Live is the stream, not the server.
 *
 * **While reconnecting, presence is unknown** (F-077): no names, no count and no
 * "Nobody yet." — neither the last roster heard nor an empty one is known to be
 * true. The panel says so to a screen reader and in its fact card. Below 1440px
 * that leaves the dot alone, as the collapsed roster leaves a dot and a count: a
 * visible `Reconnecting` there wrapped the phone's first header row into two.
 * So the dot carries the state in **shape** as well as colour (F-097, WCAG
 * 1.4.1): a filled green disc while Live, a hollow grey ring while
 * Reconnecting, the same 8px box so the row does not move; the word itself is
 * on the fact card a pointer opens.
 */
export function PresencePanel({ me, users, connected }: PresencePanelProps) {
  const headingId = useId();
  const state = connected ? 'Live' : 'Reconnecting';
  const roster = users.map((user) => (user === me ? `${user} (you)` : user)).join(', ');
  return (
    <section
      aria-labelledby={headingId}
      data-fact={
        !connected
          ? `${state}: ${UNKNOWN.toLowerCase()}`
          : `${state}: ${LIVE_MEANS} Here now: ${users.length === 0 ? 'nobody yet' : roster}.`
      }
      data-fact-lead={state}
      className="flex min-w-0 items-center gap-1.5 text-xs"
    >
      <span
        aria-hidden="true"
        data-link-dot={connected ? 'live' : 'reconnecting'}
        className={cn(
          'size-2 shrink-0 rounded-full',
          connected
            ? 'bg-[var(--status-done)]'
            : 'border-muted-foreground border-[1.5px] bg-transparent',
        )}
      />
      <h2
        id={headingId}
        className="text-muted-foreground shrink-0 font-medium max-[1440px]:sr-only"
      >
        {state}
      </h2>
      {!connected ? (
        <p className="sr-only">{UNKNOWN}</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground max-[1440px]:sr-only">Nobody yet.</p>
      ) : (
        <ul className="m-0 flex h-4 max-w-48 list-none flex-wrap gap-x-2 overflow-hidden p-0 whitespace-nowrap max-[1440px]:sr-only">
          {users.map((u) => (
            <li key={u} className="max-w-full truncate">
              {u}
              {u === me && <span className="text-muted-foreground"> (you)</span>}
            </li>
          ))}
        </ul>
      )}
      {connected && (
        <span
          aria-hidden="true"
          data-presence-count
          className="text-muted-foreground min-[1440px]:hidden"
        >
          {users.length}
        </span>
      )}
    </section>
  );
}
