import type { ProjectApi } from '@/lib/wbs-api';

/**
 * A {@link ProjectApi} whose every method refuses, except the ones a test
 * states.
 *
 * Four suites had each written this stand-in out by hand — `app-router`,
 * `page-shortcuts`, `project-page`, `plan-cards` — and every copy had drifted
 * the same way: seven methods the interface has grown since
 * (`setPriorityBands`, `setTeamCapacity`, `setDepReach`,
 * `setEstimateArithmetic`, `renameTag`, `removeTag`, `addWorkItemType`) were
 * missing from all four, and three carried stubs under names it had renamed
 * away (`create`, `patch`, `assign`, `move`, `remove`, `duplicate`, `freeze`,
 * `unfreeze`). No `typecheck` target compiled a test file here until
 * 2026-09-02, so nothing said so.
 *
 * One of those dead names made a **shipped proof vacuous**:
 * `page-shortcuts.test.tsx` asserts that a command chord behind a modal never
 * reaches the write, and it was watching a spy named `create` — a method
 * `ProjectApi` stopped having. The recorded proof says that assertion was once
 * seen failing on "`api.create` called once", and it could not have failed
 * again after the rename.
 *
 * A `Proxy` rather than 43 written-out refusals, so it cannot drift again:
 * anything the interface grows is refused here the day it is added, and a test
 * that reaches a method it did not state says so out loud instead of passing
 * against a silent default.
 */
/** What makes an object thenable, and so must read as absent here. */
const PROMISE_PROTOCOL = new Set(['then', 'catch', 'finally']);

export function refusingApi(answers: Partial<ProjectApi>): ProjectApi {
  return new Proxy(answers as ProjectApi, {
    get(target, key) {
      const stated: unknown = Reflect.get(target, key);
      if (stated !== undefined) return stated;
      // Absent, not refused, for anything that is not a method name this api
      // could have. `then` is the one that matters: a proxy handing back a
      // function for it **is** a thenable, so awaiting anything that holds this
      // object calls it — 34 of `plan-cards.test.tsx`'s 118 cases failed on
      // `api.then is not one this test answers`, watched 2026-09-02, before
      // this line existed.
      if (typeof key !== 'string' || PROMISE_PROTOCOL.has(key)) return undefined;
      return () => Promise.reject(new Error(`api.${key} is not one this test answers`));
    },
  });
}
