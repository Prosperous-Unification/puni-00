import { useEffect, useRef, useState } from 'react';

import { websocketUrl } from '@/lib/api';

type Status = 'connecting' | 'open' | 'closed';

/**
 * Who else is in this project, in the header bar.
 *
 * Presence is push-only after the first frame: the gateway broadcasts the
 * roster whenever anyone joins or leaves. `who` is sent once on open so a
 * client that connects into a quiet room still sees who is already there
 * rather than an empty list until the next join.
 *
 * **The socket does not reconnect, and `H header-fits-a-row` deliberately did
 * not fix that.** A dropped connection leaves `closed` in the heading and the
 * roster frozen at whoever was there when it went; only a reload starts
 * another socket. That is the pre-existing caveat, carried across the move into
 * the header unchanged so the move is a move and not a behaviour change wearing
 * one — `openspec/changes/header-fits-a-row/proposal.md` names it as a
 * non-goal. It is pinned by `says the connection has closed, and starts no
 * other`, so the day somebody adds a reconnect they will be changing an
 * assertion rather than discovering one.
 *
 * The shape is a header row's: the heading is the small grey label, the roster
 * is one clipped line beside it. Bounded width is structural rather than
 * cosmetic — an unbounded list of names is the one thing in the bar that grows
 * with the world rather than with the layout, and it would wrap the header onto
 * a second row for a busy project, which is exactly what this change exists to
 * stop.
 */
export function PresencePanel({ token, me }: { token: string; me: string }) {
  const [users, setUsers] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(websocketUrl(token));
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      ws.send(JSON.stringify({ type: 'who' }));
    };
    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string; users?: string[] };
        if (msg.type === 'presence' && Array.isArray(msg.users)) setUsers(msg.users);
      } catch {
        // A frame this client does not understand is not a reason to tear the
        // connection down.
      }
    };
    ws.onclose = () => {
      setStatus('closed');
    };

    return () => {
      ws.close();
    };
  }, [token]);

  return (
    <section className="flex min-w-0 items-center gap-2 text-xs">
      <h2 className="text-muted-foreground shrink-0 font-medium">
        Online <small className="font-normal">({status})</small>
      </h2>
      {users.length === 0 ? (
        <p className="text-muted-foreground">Nobody yet.</p>
      ) : (
        <ul className="m-0 flex max-w-48 list-none gap-2 overflow-hidden p-0 whitespace-nowrap">
          {users.map((u) => (
            <li key={u}>
              {u}
              {u === me && <span className="text-muted-foreground"> (you)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
