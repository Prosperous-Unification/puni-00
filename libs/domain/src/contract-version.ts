/**
 * The version of **Fast's own semantics** — everything a cached optimized
 * result silently assumes about how this engine turns a plan into dates.
 *
 * It is not the solver's version and not the wire's. `contractVersion` on the
 * wire is `"<SCHEDULER_CONTRACT_VERSION>+<solverVersion>"`, and both halves are
 * needed because the Python package version describes none of this: durations,
 * the leaf expansion and `baselineOffsets` are produced by Bun and by this
 * library. A cache keyed on the solver alone would serve a row computed by a
 * different function.
 *
 * **Bump it for any change to:** Fast semantics, {@link ASSUMED_SLICE_WORKDAYS},
 * `snapWorkdays`, dependency reach, numbering semantics, resource tie-breaks,
 * the canonicalizer, {@link SOLVER_QUANTUM}, or the duration rule. The bump is
 * what evicts every pre-existing cached result; there is no migration of stored
 * schedules, because a stale row is not a row in an old shape — it is an answer
 * to a question nobody asked any more.
 *
 * **`7` because this slice performs one such bump.** The seventh canonical
 * scheduling argument, the `deadlineUnits` wire field and the materialiser
 * change together, so every row computed before them describes a different
 * function. The number is also not free at this point: both request fixtures in
 * the golden corpus were checked in carrying `"7+0.1.0"`, and
 * `wire-contract-version.test.ts` in `libs/contracts` pins the constant to that
 * prefix — so a change here without a change there is a red test rather than a
 * cache that quietly keeps its old rows.
 *
 * The corpus re-key that makes an *unbumped* domain change fail is task 1.6 and
 * is not this constant's own guard: nothing here can notice that
 * `ASSUMED_SLICE_WORKDAYS` moved. Stated so the next reader does not mistake the
 * fixture pin above for that proof.
 */
export const SCHEDULER_CONTRACT_VERSION = 7;
