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
    <section style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 4 }}>
        Online <small style={{ fontWeight: 400, color: '#666' }}>({status})</small>
      </h2>
      {users.length === 0 ? (
        <p style={{ color: '#666' }}>Nobody yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {users.map((u) => (
            <li key={u}>
              {u}
              {u === me && <span style={{ color: '#666' }}> (you)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
