import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
import { httpProjectApi } from '@/lib/wbs-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { ProjectPageOverOwner } from '@/testing/project-page-over-owner';

// eslint-disable-next-line @nx/enforce-module-boundaries -- Runner-free production presenter supplies wire snapshots; only transport is injected.
import { createConnectedBlockageTree } from '../../../../../../libs/wbs/application/core/src/testing/connected-blockage.fixture';

publishApplicationRuntimeForEachTest();
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function held<T>() {
  let release!: (answer: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function scenario() {
  let seq = 11;
  let reading: 'unknown' | 'waiting' = 'unknown';
  let fail = false;
  const gates: ReturnType<typeof held<Response>>[] = [];
  const captured: Response[] = [];
  const requests: string[] = [];
  const sockets: { handlers: SocketHandlers; sent: string[] }[] = [];
  const timers: (() => void)[] = [];
  const wire = () => {
    const tree = createConnectedBlockageTree('clear');
    return {
      ...tree,
      seq,
      workItems: tree.workItems.map((row) => ({ ...row, nodeReadings: { build: reading } })),
    };
  };
  const sample = wire();
  const project = {
    id: 'C',
    name: 'Successor C',
    abbreviation: 'CCC',
    ownerId: 'owner',
    restricted: false,
    estimateMethod: sample.estimateMethod,
    depReach: sample.depReach,
    pertWeights: sample.pertWeights,
    estimateRounding: sample.estimateRounding,
    startDate: sample.startDate,
    solutionRef: null,
    revision: 7,
    createdAt: 0,
    optimizationEnabled: false,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      requests.push(path);
      if (path === '/api/projects')
        return Response.json({
          projects: [{ ...project, lastOpenedAt: null, ownerName: 'Owner' }],
        });
      if (path === '/api/projects/C/opened') return new Response(null, { status: 204 });
      if (path === '/api/projects/C/work-items') {
        const answer = fail
          ? new Response('fixture unavailable', { status: 503 })
          : Response.json(wire());
        captured.push(answer);
        const gate = gates.shift();
        if (gate !== undefined) return gate.promise;
        return answer;
      }
      if (path === '/api/projects/C')
        return Response.json({
          project: {
            id: 'C',
            name: 'Successor C',
            abbreviation: 'CCC',
            ownerId: 'owner',
            restricted: false,
            estimateMethod: sample.estimateMethod,
            depReach: sample.depReach,
            pertWeights: sample.pertWeights,
            estimateRounding: sample.estimateRounding,
            startDate: sample.startDate,
            solutionRef: null,
            revision: 7,
            createdAt: 0,
            optimizationEnabled: false,
            scheduleEngine: 'fast',
            scheduleObjective: 'pri',
          },
          steps: sample.steps,
        });
      if (path === '/api/projects/C/calendar-markers') return Response.json({ markers: [] });
      const names: Record<string, string | undefined> = {
        '/api/teams': 'teams',
        '/api/tags': 'tags',
        '/api/services': 'services',
        '/api/work-item-types': 'workItemTypes',
        '/api/external-systems': 'externalSystems',
        '/api/people': 'people',
      };
      const name = names[path];
      if (name === undefined) throw new Error(`unmodeled route ${path}`);
      return Response.json({ [name]: [] });
    }),
  );
  const streamDeps: ProjectStreamDeps = {
    openSocket(handlers) {
      const socket = { handlers, sent: [] as string[] };
      sockets.push(socket);
      return {
        send: (frame) => {
          socket.sent.push(frame);
        },
        close: () => undefined,
      };
    },
    schedule(callback) {
      timers.push(callback);
      return callback;
    },
    cancel(callback) {
      const index = timers.indexOf(callback as () => void);
      if (index >= 0) timers.splice(index, 1);
    },
    random: () => 0.5,
  };
  const latest = () => {
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error('no admitted stream');
    return socket;
  };
  const deliver = (subscription = 'project:C', sequence = seq) => {
    latest().handlers.onMessage(
      JSON.stringify({
        subscription,
        seq: sequence,
        message: { type: 'elsewhere_changed', causeProjectId: 'A', projectId: 'C' },
      }),
    );
  };
  return {
    requests,
    captured,
    sockets,
    mount: () =>
      render(<ProjectPageOverOwner api={httpProjectApi('session')} streamDeps={streamDeps} />),
    async select() {
      await screen.findByLabelText('Project');
      fireEvent.focus(screen.getByLabelText('Project'));
      fireEvent.keyDown(screen.getByLabelText('Project'), { key: 'ArrowDown' });
      const option = await screen.findByRole('option', { name: /Successor C/ });
      fireEvent.click(option);
      await screen.findByDisplayValue('c');
      await waitFor(() => {
        expect(sockets).toHaveLength(1);
      });
      act(() => {
        latest().handlers.onOpen();
        latest().handlers.onMessage(
          JSON.stringify({ type: 'resume_ack', replayed: { 'project:C': 0 } }),
        );
      });
    },
    advance(word: 'unknown' | 'waiting') {
      seq += 1;
      reading = word;
    },
    deliver,
    hold() {
      const gate = held<Response>();
      gates.push(gate);
      return gate;
    },
    fail(value: boolean) {
      fail = value;
    },
    reconnect() {
      act(() => {
        latest().handlers.onClose();
      });
      const connect = timers.shift();
      if (connect === undefined) throw new Error('missing reconnect');
      act(() => {
        connect();
        latest().handlers.onOpen();
      });
      return latest()
        .sent.map(
          (frame) => JSON.parse(frame) as { type: string; resume_points?: Record<string, number> },
        )
        .find((frame) => frame.type === 'resume')?.resume_points?.['project:C'];
    },
    async replay() {
      await act(async () => {
        await Promise.resolve();
        deliver();
        latest().handlers.onMessage(
          JSON.stringify({ type: 'resume_ack', replayed: { 'project:C': 1 } }),
        );
      });
    },
  };
}

const corner = () => document.querySelector('[data-node-reading]');
const trees = (fixture: ReturnType<typeof scenario>) =>
  fixture.requests.filter((path) => path.endsWith('/work-items')).length;

// Proof: suppressing invalidate left one GET instead of two; suppressing tree delivery hid the first editor.
// Removing subscription equality caused three GETs instead of one before the owned frame (2026-10-23).
it('installs only its covering HTTP tree after an elsewhere frame and ignores unrelated subscriptions', async () => {
  const fixture = scenario();
  fixture.mount();
  await fixture.select();
  expect(corner()).toHaveAttribute('data-node-reading', 'unknown');
  const count = trees(fixture);
  fixture.advance('waiting');
  await act(async () => {
    await Promise.resolve();
    fixture.deliver('project:unrelated');
    fixture.deliver('project:foreign');
  });
  expect(trees(fixture)).toBe(count);
  const gate = fixture.hold();
  act(() => {
    fixture.deliver();
  });
  await waitFor(() => {
    expect(trees(fixture)).toBe(count + 1);
  });
  expect(corner()).toHaveAttribute('data-node-reading', 'unknown');
  const answer = fixture.captured.at(-1);
  if (answer === undefined) throw new Error('no covering response');
  await act(async () => {
    await Promise.resolve();
    gate.release(answer);
  });
  await waitFor(() => expect(corner()).toHaveAttribute('data-node-reading', 'waiting'));
  expect(fixture.reconnect()).toBe(12);
});

// Proof: removing the generation guard displayed waiting from the superseded read while its covering read was held.
// Advancing resume on frame receipt sent 13 instead of the installed 11 (2026-10-23).
it('keeps a superseded old response out of the mounted tree until the trailing covering read installs', async () => {
  const fixture = scenario();
  fixture.mount();
  await fixture.select();
  const older = fixture.hold();
  fixture.advance('waiting');
  act(() => {
    fixture.deliver();
  });
  await waitFor(() => {
    expect(trees(fixture)).toBe(2);
  });
  const oldAnswer = fixture.captured.at(-1);
  if (oldAnswer === undefined) throw new Error('no old response');
  const covering = fixture.hold();
  fixture.advance('unknown');
  act(() => {
    fixture.deliver();
  });
  await act(async () => {
    await Promise.resolve();
    older.release(oldAnswer);
  });
  await waitFor(() => {
    expect(trees(fixture)).toBe(3);
  });
  expect(corner()).toHaveAttribute('data-node-reading', 'unknown');
  expect(fixture.reconnect()).toBe(11);
  const answer = fixture.captured.at(-1);
  if (answer === undefined) throw new Error('no covering response');
  await act(async () => {
    await Promise.resolve();
    covering.release(answer);
  });
  expect(fixture.reconnect()).toBe(13);
});

// Proof: advancing resume on receipt sent 12 instead of 11 after the visible failed refresh (2026-10-23).
it('replays from installed coverage after a failed refresh and visibly recovers the mounted plan', async () => {
  const fixture = scenario();
  fixture.mount();
  await fixture.select();
  fixture.advance('waiting');
  fixture.fail(true);
  await act(async () => {
    await Promise.resolve();
    fixture.deliver();
  });
  const warning = await waitFor(() => {
    const banner = document.querySelector('[data-stale-tree]');
    expect(banner).not.toBeNull();
    return banner;
  });
  expect(warning).toHaveTextContent('The server could not complete that change. Try again.');
  expect(corner()).toHaveAttribute('data-node-reading', 'unknown');
  expect(fixture.reconnect()).toBe(11);
  fixture.fail(false);
  await fixture.replay();
  await waitFor(() => expect(corner()).toHaveAttribute('data-node-reading', 'waiting'));
  expect(document.querySelector('[data-stale-tree]')).toBeNull();
  expect(fixture.reconnect()).toBe(12);
});
