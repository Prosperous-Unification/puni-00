import { expect, it } from 'bun:test';

import type { SolverSupervisorAttempt } from '../src/module/solver-supervisor/solver-supervisor.repository';
import { runInstalledSolverClient } from './solver-installed-client';

function fixture(
  decision = 'bound',
  terminal = { type: 'terminal' as const, exitCode: 0, deadlineKilled: false, oomKilled: false },
) {
  const events: string[] = [];
  const attempt: SolverSupervisorAttempt = {
    pid: 321,
    stdout: new Blob([
      JSON.stringify({
        wireVersion: 4,
        status: 'feasible',
        offsets: { 'A\u0000one': 0, 'A\u0000two': 10, 'A\u0000three': 20 },
        objectiveValues: {
          makespan: { value: 30, stageValue: null, bound: null, status: 'feasible' },
          priority: { value: 0, stageValue: null, bound: null, status: 'feasible' },
          movement: { value: 0, stageValue: null, bound: null, status: 'feasible' },
        },
      }),
    ]).stream(),
    stderr: new Blob([]).stream(),
    terminal: Promise.resolve(terminal),
    verdict: async (verdict) => {
      await Promise.resolve();
      events.push(verdict);
    },
    kill: () => Promise.resolve(),
  };
  return {
    events,
    attempt,
    ports: {
      connect: () => Promise.resolve(attempt),
      emit: (frame: unknown) => {
        events.push(JSON.stringify(frame));
      },
      decision: () => Promise.resolve(decision),
    },
  };
}
const options = {
  unix: '/run/wbs-solver/supervisor.sock',
  callerId: 'a'.repeat(12),
  scenario: 'baseline' as const,
  attemptToken: '11111111-1111-4111-8111-111111111111',
};
it('reports started identity and waits for host inspection before binding and revalidating', async () => {
  const fixtureClient = fixture();
  const receipt = await runInstalledSolverClient(options, fixtureClient.ports);
  expect(JSON.parse(fixtureClient.events[0])).toEqual({
    type: 'started',
    scenario: 'baseline',
    attemptToken: options.attemptToken,
    callerId: options.callerId,
    pid: 321,
  });
  expect(fixtureClient.events[1]).toBe('bound');
  expect(receipt.status).toBe('feasible');
});
it('aborts when host refuses the inspected child', async () => {
  const fixtureClient = fixture('abort');
  await expectRefusal(runInstalledSolverClient(options, fixtureClient.ports), 'host refused');
  expect(fixtureClient.events.at(-1)).toBe('abort');
});
it.each([
  { exitCode: 1, deadlineKilled: false, oomKilled: false },
  { exitCode: 0, deadlineKilled: true, oomKilled: false },
  { exitCode: 0, deadlineKilled: false, oomKilled: true },
])('refuses unsuccessful terminal evidence %j', async (terminal) => {
  const fixtureClient = fixture('bound', { type: 'terminal', ...terminal });
  await expectRefusal(
    runInstalledSolverClient(options, fixtureClient.ports),
    'unsuccessful terminal',
  );
});
it('rejects a shared-person answer that overlaps the sent fixed booking', async () => {
  const fixtureClient = fixture();
  const request = await import('./solver-image-scenario');
  const key = request.sharedPersonRequest().slices[0].key;
  const stdout = new Blob([
    JSON.stringify({
      wireVersion: 4,
      status: 'feasible',
      offsets: { [key]: 0 },
      objectiveValues: {
        makespan: { value: 48, stageValue: null, bound: null, status: 'feasible' },
        priority: { value: 0, stageValue: null, bound: null, status: 'feasible' },
        movement: { value: 49, stageValue: null, bound: null, status: 'feasible' },
      },
    }),
  ]).stream();
  await expectRefusal(
    runInstalledSolverClient(
      { ...options, scenario: 'shared-person' },
      {
        ...fixtureClient.ports,
        connect: () => Promise.resolve({ ...fixtureClient.attempt, stdout }),
      },
    ),
    'assignee-double-booked',
  );
});

async function expectRefusal(action: Promise<unknown>, message = ''): Promise<void> {
  let failure: unknown;
  try {
    await action;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).toContain(message);
}

it.each(
  [
    ['/wrong/socket', 'baseline', '11111111-1111-4111-8111-111111111111'],
    ['/run/wbs-solver/supervisor.sock', 'other', '11111111-1111-4111-8111-111111111111'],
    ['/run/wbs-solver/supervisor.sock', 'baseline', '-'.repeat(36)],
    [
      '/run/wbs-solver/supervisor.sock',
      'baseline',
      '11111111-1111-4111-8111-111111111111',
      'extra',
    ],
  ].map((argv) => ({ argv })),
)('refuses malformed client CLI before connecting %j', async ({ argv }) => {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/solver-installed-client.ts`, ...argv],
    { env: { ...process.env, HOSTNAME: 'a'.repeat(12) }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).not.toBe(0);
  expect(await new Response(child.stderr).text()).toContain(
    'expected mounted socket, scenario, UUID token and Docker hostname',
  );
});
