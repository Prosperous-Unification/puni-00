import { useEffect, useRef, useState } from 'react';

import { websocketUrl } from '@/lib/api';

type Status = 'connecting' | 'open' | 'closed';

/**
 * Presence is push-only after the first frame: the gateway broadcasts the
 * roster whenever anyone joins or leaves. `who` is sent once on open so a
 * client that connects into a quiet room still sees who is already there
 * rather than an empty list until the next join.
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
    <section className="mt-6">
      <h2 className="mb-1 text-base font-semibold tracking-tight">
        Online <small className="text-muted-foreground font-normal">({status})</small>
      </h2>
      {users.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nobody yet.</p>
      ) : (
        <ul className="m-0 list-disc pl-5 text-sm">
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
