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
// The one place the solver's integer time axis is defined, and the only
// quantisation of `durationOf` anywhere. It lives here rather than in
// `schedule.ts` because the quantum is a fact about CP-SAT and not about the
// calendar: 2,212 lines of placement have no business knowing the wire's unit.
export * from './solver-quantum';
export * from './workday';
