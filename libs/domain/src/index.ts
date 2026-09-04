export * from './assumed-duration';
export * from './capacity';
export * from './dependency-reach';
// Moved out of `apps/be-01/src/service/` on 2026-09-02. Both were already pure —
// neither imported anything at all — and both answer questions about a plan's
// shape rather than about storage: what number a work item takes from where it
// sits, and where a new sibling goes. `schedule.ts` reads the first of them.
export * from './derive-numbers';
// `effective-label` is deliberately absent: it is the walk the three dimensions
// share, not a fourth thing to read a plan with.
export * from './effective-service';
export * from './effective-tag';
export * from './effective-team';
export * from './estimate';
export * from './external-system';
// One upward walk, where four copies of it stood on 2026-09-02: two in be-01
// (`canDepend`'s `isWithin` and `moveWorkItem`'s `descendsFrom`, byte-identical
// under two names) and two in fe-01. It answers a question about a plan's
// shape and reads nothing else, like everything else in here.
export * from './is-within';
export * from './label-mismatch';
// The floor and deadline folds, published rather than left inside `schedule()`
// because the solver request builder must carry the very same numbers on the
// wire. The floor half was already wrong once for a month (2026-08-10).
export * from './leaf-constraints';
export * from './not-before';
export * from './place-sibling';
export * from './priority-band';
// The dense rank the solver objective multiplies. Separate from
// `priority-band` because a band is what a priority is CALLED and this is what
// it is WORTH relative to the others in one plan.
export * from './priority-weight';
export * from './progress';
// Moved out of `apps/be-01/src/service/` on 2026-09-02, once its last storage
// type was gone. 2,212 lines of pure planning that read five fields of a row
// and answer a question about a plan's shape — which is what everything else in
// here is. It reads four of its neighbours and no repository.
export * from './schedule';
// The slice graph's edges — the intra-item step chain and the reach-decided
// join — beside the reach that decides one half of it. Here rather than in
// `schedule.ts` because the solver request builder must derive the same graph,
// and a second copy is the copy that gets the join backwards.
export * from './slice-edges';
// The grouping both `schedule()` and the solver request builder start from.
// One grouping, because an edge names its ends by leaf and POSITION and two
// groupings would disagree about which slice a position is.
export * from './slice-groups';
// The one place the solver's integer time axis is defined, and the only
// quantisation of `durationOf` anywhere. It lives here rather than in
// `schedule.ts` because the quantum is a fact about CP-SAT and not about the
// calendar: 2,212 lines of placement have no business knowing the wire's unit.
export * from './solver-quantum';
export * from './workday';
