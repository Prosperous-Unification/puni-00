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
// A calendar marker's automatic colour, the eight-entry palette it draws from,
// and the twenty backdrops the 3:1 bar is measured against. Pure arithmetic
// over hex strings — the fills it measures live in fe-01's theme, and this
// module reads none of them at run time.
export * from './marker-color';
export * from './not-before';
export * from './place-sibling';
export * from './priority-band';
export * from './progress';
// The value a Saved plan's input body is, and the pure fold that produces it.
// Types and one pure function: the reads it is folded from live in be-01, and
// the hash is taken over this module's serialization.
export * from './saved-plan';
// Moved out of `apps/be-01/src/service/` on 2026-09-02, once its last storage
// type was gone. 2,212 lines of pure planning that read five fields of a row
// and answer a question about a plan's shape — which is what everything else in
// here is. It reads four of its neighbours and no repository.
export * from './schedule';
export * from './workday';
