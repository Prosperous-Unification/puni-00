import { websocketUrl } from './api';

/**
 * Subscribes to a project's edits and calls `onChange` when any arrive.
 *
 * The payload is deliberately ignored. be-01 sends either the changed work items
 * or the whole tree, and applying either one locally would be a second
 * implementation of the numbering and the roll-up — the two things most likely
 * to disagree with the server. Refetching is one request and always right.
 *
 * Returns the unsubscribe.
 */
export function subscribeToProject(
  token: string,
  projectId: string,
  onChange: () => void,
): () => void {
  const socket = new WebSocket(websocketUrl(token));
  const subscription = `project:${projectId}`;

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'subscribe', subscription }));
  });
  socket.addEventListener('message', (event: MessageEvent<string>) => {
    try {
      const message = JSON.parse(event.data) as { subscription?: string };
      if (message.subscription === subscription) onChange();
    } catch {
      // gw-01 also sends presence and control frames; anything unparseable or
      // for another subscription is not this component's business.
    }
  });

  return () => {
    socket.close();
  };
}
