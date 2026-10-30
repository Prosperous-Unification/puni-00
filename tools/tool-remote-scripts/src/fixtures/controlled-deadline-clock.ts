import { spyOn } from 'bun:test';

/** Test-only logical deadlines; filesystem IO and child processes keep their native event loop. */
export function controlDeadlineClock() {
  let now = performance.now();
  const nativeNow = performance.now.bind(performance);
  const setTimer = globalThis.setTimeout;
  const clearTimer = globalThis.clearTimeout;
  const scheduled = new Map<
    ReturnType<typeof setTimeout>,
    { at: number; fire: () => void; origin: string }
  >();
  const clock = spyOn(performance, 'now').mockImplementation(() => now);
  // Bun's native object handles also satisfy the runtime contract; the cast
  // reconciles the unused DOM numeric overload with the recorded native handles.
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(
    Object.assign(
      (callback: unknown, milliseconds = 0, ...args: unknown[]) => {
        if (typeof callback !== 'function') throw new Error('deadline requires a callback');
        const origin = new Error().stack;
        if (origin === undefined) throw new Error('deadline timer origin absent');
        const token = setTimer(() => undefined, 2_147_483_647);
        scheduled.set(token, {
          at: now + milliseconds,
          fire: () => {
            Reflect.apply(callback, undefined, args);
          },
          origin,
        });
        return token;
      },
      { __promisify__: setTimer.__promisify__ },
    ) as typeof setTimeout,
  );
  const cancellation = spyOn(globalThis, 'clearTimeout').mockImplementation((token) => {
    Reflect.apply(clearTimer, globalThis, [token]);
    for (const pending of scheduled.keys()) if (pending === token) scheduled.delete(pending);
  });
  const turn = () =>
    new Promise<void>((resolve) => {
      setTimer(resolve, 0);
    });
  return {
    now: () => now,
    timers: () => [...scheduled.values()].map(({ at, origin }) => ({ at, origin })),
    turn,
    waitFor: async (ready: () => Promise<boolean>, milliseconds: number) => {
      const deadline = nativeNow() + milliseconds;
      while (!(await ready())) {
        if (nativeNow() >= deadline)
          throw new Error('controlled deadline readiness did not settle');
        await turn();
      }
    },
    advance: async (at: number) => {
      if (!Number.isFinite(at) || at < now)
        throw new Error('controlled deadline cannot go backward');
      now = at;
      let fired = 0;
      for (;;) {
        const due = [...scheduled.entries()]
          .filter(([, pending]) => pending.at <= now)
          .sort(([, left], [, right]) => left.at - right.at)
          .at(0);
        if (due === undefined) break;
        if (++fired > 100) throw new Error('controlled deadline did not converge');
        const [token, pending] = due;
        scheduled.delete(token);
        clearTimer(token);
        pending.fire();
        await turn();
      }
      await turn();
    },
    restore: () => {
      cancellation.mockRestore();
      timer.mockRestore();
      clock.mockRestore();
      for (const token of scheduled.keys()) clearTimer(token);
    },
  };
}
