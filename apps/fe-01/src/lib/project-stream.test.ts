import { describe, expect, it } from 'vitest';

import {
  type OpenSocket,
  type ProjectStreamDeps,
  type SocketHandlers,
  subscribeToProject,
} from './project-stream';

const PROJECT = '11111111-2222-3333-4444-555555555555';

/** These tests assert on what the stream sent, not on what it called back. */
const ignore = (): void => undefined;
const SUBSCRIPTION = `project:${PROJECT}`;

interface FakeSocket {
  sent: string[];
  handlers: SocketHandlers;
  closed: boolean;
}

/**
 * A socket factory that records every socket it opened, plus a scheduler whose
 * pending callback a test runs by hand. Nothing here waits on real time — a
 * backoff test that slept would be the slowest file in the suite and flaky on a
 * loaded machine.
 */
function harness() {
  const sockets: FakeSocket[] = [];
  const scheduled: { fn: () => void; ms: number; handle: number }[] = [];
  let nextHandle = 0;
  let cancelled = 0;

  const openSocket: OpenSocket = (_url, handlers) => {
    const socket: FakeSocket = { sent: [], handlers, closed: false };
    sockets.push(socket);
    return {
      send: (data) => socket.sent.push(data),
      close: () => {
        socket.closed = true;
      },
    };
  };

  const deps: ProjectStreamDeps = {
    openSocket,
    schedule: (fn, ms) => {
      const handle = nextHandle++;
      scheduled.push({ fn, ms, handle });
      return handle;
    },
    cancel: (handle) => {
      cancelled += 1;
      // Modelled on `clearTimeout`: a cancelled callback does not run. A fake
      // that only counted the call would let a missing `cancel` pass.
      const index = scheduled.findIndex((entry) => entry.handle === handle);
      if (index !== -1) scheduled.splice(index, 1);
    },
    // Fixed at the top of the jitter window so the delays a test asserts are
    // the undiluted curve.
    random: () => 0.999999,
  };

  const latest = () => sockets.at(-1)!;
  const frames = (socket: FakeSocket) =>
    socket.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  const runNextTimer = () => {
    const next = scheduled.shift();
    if (next === undefined) throw new Error('nothing scheduled');
    next.fn();
  };

  return {
    sockets,
    scheduled,
    deps,
    latest,
    frames,
    runNextTimer,
    cancelledCount: () => cancelled,
  };
}

describe('subscribeToProject', () => {
  it('subscribes and resumes from the sequence the caller read at', () => {
    const h = harness();
    subscribeToProject({ token: 't', projectId: PROJECT, sinceSeq: 7, onChange: ignore }, h.deps);

    h.latest().handlers.onOpen();

    expect(h.frames(h.latest())).toEqual([
      { type: 'subscribe', subscription: SUBSCRIPTION },
      { type: 'resume', resume_points: { [SUBSCRIPTION]: 7 } },
    ]);
  });

  it('calls back on an event for its own project and ignores others', () => {
    const h = harness();
    let changes = 0;
    subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: () => (changes += 1) },
      h.deps,
    );
    h.latest().handlers.onOpen();

    h.latest().handlers.onMessage(
      JSON.stringify({ subscription: SUBSCRIPTION, seq: 0, message: {} }),
    );
    h.latest().handlers.onMessage(JSON.stringify({ subscription: 'project:other', seq: 9 }));
    h.latest().handlers.onMessage('not json at all');
    h.latest().handlers.onMessage(JSON.stringify({ type: 'presence', users: [] }));

    expect(changes).toBe(1);
  });

  it('reopens after a close it did not ask for, and resumes from what it saw', () => {
    const h = harness();
    subscribeToProject({ token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore }, h.deps);
    h.latest().handlers.onOpen();
    h.latest().handlers.onMessage(
      JSON.stringify({ subscription: SUBSCRIPTION, seq: 4, message: {} }),
    );

    h.latest().handlers.onClose();
    expect(h.sockets).toHaveLength(1);
    h.runNextTimer();

    expect(h.sockets).toHaveLength(2);
    h.latest().handlers.onOpen();
    expect(h.frames(h.latest())).toEqual([
      { type: 'subscribe', subscription: SUBSCRIPTION },
      { type: 'resume', resume_points: { [SUBSCRIPTION]: 4 } },
    ]);
  });

  it('backs off exponentially and stops growing at the cap', () => {
    const h = harness();
    subscribeToProject({ token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore }, h.deps);

    const delays: number[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      h.latest().handlers.onClose();
      delays.push(h.scheduled.at(-1)!.ms);
      h.runNextTimer();
    }

    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });

  it('resets the backoff once a socket opens', () => {
    const h = harness();
    subscribeToProject({ token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore }, h.deps);

    h.latest().handlers.onClose();
    h.runNextTimer();
    h.latest().handlers.onClose();
    h.runNextTimer();
    expect(h.scheduled).toHaveLength(0);

    h.latest().handlers.onOpen();
    h.latest().handlers.onClose();

    expect(h.scheduled.at(-1)!.ms).toBe(500);
  });

  it('jitters the delay so a gateway restart does not reconnect every client at once', () => {
    const h = harness();
    const jittered: ProjectStreamDeps = { ...h.deps, random: () => 0 };
    subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      jittered,
    );

    h.latest().handlers.onClose();

    expect(h.scheduled.at(-1)!.ms).toBe(250);
  });

  it('stops reconnecting once the caller unsubscribes', () => {
    const h = harness();
    const stream = subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      h.deps,
    );
    h.latest().handlers.onOpen();

    stream.unsubscribe();
    h.latest().handlers.onClose();

    expect(h.scheduled).toHaveLength(0);
    expect(h.sockets).toHaveLength(1);
    expect(h.sockets[0].closed).toBe(true);
  });

  it('cancels a pending reconnect when the caller unsubscribes while waiting', () => {
    const h = harness();
    const stream = subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      h.deps,
    );
    h.latest().handlers.onClose();

    stream.unsubscribe();

    expect(h.cancelledCount()).toBe(1);
    expect(h.scheduled).toHaveLength(0);
    expect(h.sockets).toHaveLength(1);
  });

  it('opens nothing when a reconnect fires after the caller unsubscribed', () => {
    // `cancel` cannot unfire a callback already handed to the event loop, so the
    // flag is checked again on the way in.
    const h = harness();
    const stream = subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      h.deps,
    );
    h.latest().handlers.onClose();
    const pending = h.scheduled[0].fn;

    stream.unsubscribe();
    pending();

    expect(h.sockets).toHaveLength(1);
  });

  it('asks the caller to refetch when the server refuses the resume', () => {
    const h = harness();
    let changes = 0;
    subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: 2, onChange: () => (changes += 1) },
      h.deps,
    );
    h.latest().handlers.onOpen();

    h.latest().handlers.onMessage(
      JSON.stringify({ type: 'resume_denied', subscription: SUBSCRIPTION, reason: 'out_of_range' }),
    );

    expect(changes).toBe(1);
  });

  it('resumes from a sequence the caller reports after refetching', () => {
    const h = harness();
    const stream = subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      h.deps,
    );
    h.latest().handlers.onOpen();

    // The refetch the denial triggered came back at sequence 12; without this
    // the next resume would ask for a range retention has already dropped and
    // be denied again, forever.
    stream.seen(12);
    h.latest().handlers.onClose();
    h.runNextTimer();
    h.latest().handlers.onOpen();

    expect(h.frames(h.latest()).at(-1)).toEqual({
      type: 'resume',
      resume_points: { [SUBSCRIPTION]: 12 },
    });
  });

  it('never moves its resume point backwards', () => {
    const h = harness();
    const stream = subscribeToProject(
      { token: 't', projectId: PROJECT, sinceSeq: -1, onChange: ignore },
      h.deps,
    );
    h.latest().handlers.onOpen();
    h.latest().handlers.onMessage(
      JSON.stringify({ subscription: SUBSCRIPTION, seq: 9, message: {} }),
    );

    // A read that started before the event landed reports an older sequence.
    stream.seen(3);
    h.latest().handlers.onClose();
    h.runNextTimer();
    h.latest().handlers.onOpen();

    expect(h.frames(h.latest()).at(-1)).toEqual({
      type: 'resume',
      resume_points: { [SUBSCRIPTION]: 9 },
    });
  });

  it('reports the connection going down and coming back', () => {
    const h = harness();
    const seen: boolean[] = [];
    subscribeToProject(
      {
        token: 't',
        projectId: PROJECT,
        sinceSeq: -1,
        onChange: ignore,
        onConnectionChange: (connected) => seen.push(connected),
      },
      h.deps,
    );

    h.latest().handlers.onOpen();
    h.latest().handlers.onClose();
    h.runNextTimer();
    h.latest().handlers.onOpen();

    expect(seen).toEqual([true, false, true]);
  });
});
