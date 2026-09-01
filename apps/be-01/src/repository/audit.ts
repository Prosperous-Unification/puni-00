import type { WriteStamp } from './index';

/**
 * The audit columns a **new** row carries, from the act that wrote it.
 *
 * Spread into every `.values(…)` in this folder: `.values({ ...row,
 * ...auditOnCreate(stamp) })`. That is deliberately one grep-able token per
 * write site, because a required {@link WriteStamp} parameter proves the stamp
 * **arrived** and says nothing about whether it was used — `insert(row, stamp)`
 * that never mentions `stamp` compiles perfectly.
 *
 * What closes that gap is `audit.test.ts`, which reads this folder's own source
 * and fails naming any write that does not call one of these helpers. It is a
 * test rather than the ESLint rule first attempted here, and that file records
 * why: the selector needed is "an object literal that does **not** contain a
 * spread of `auditOnCreate`", which wants `:has()` inside `:not()` over an
 * argument at a known position, and esquery has no argument-index selector — so
 * the rule also fired on `map.set(key, { … })`. That test, not the parameter, is
 * what makes the fill impossible to forget at a write site added next year.
 *
 * **`updatedAt` equals `createdAt` on a new row**, rather than being left null:
 * "never changed since it was made" and "last changed when it was made" are the
 * same fact about the same row, and a null there would make every reader of the
 * two write `updatedAt ?? createdAt` forever.
 */
export const auditOnCreate = (stamp: WriteStamp) => ({
  createdAt: stamp.at,
  updatedAt: stamp.at,
  createdBy: stamp.by,
});

/**
 * {@link auditOnCreate} for a row whose table dates itself.
 *
 * Two tables and no more: `users` and `project` have carried a `NOT NULL`
 * `created_at` since they were written, supplied by the row object the service
 * builds. This fills the two columns they gained and leaves that one exactly
 * where it was, so neither table changes behaviour and neither ends up with two
 * sources for one value — a field the caller sets and the write silently
 * overrides is a trap for whoever reads it next. Mirrors
 * `schema.ts`'s `auditColumnsBesidesCreatedAt`, which is the other half of the
 * same exception.
 */
export const auditOnCreateBesidesCreatedAt = (stamp: WriteStamp) => ({
  updatedAt: stamp.at,
  createdBy: stamp.by,
});

/**
 * The audit column an **update** moves, from the act that wrote it.
 *
 * Spread into every `.set(…)`. `createdAt` and `createdBy` are absent on
 * purpose and that absence is the guarantee: they describe the act that made the
 * row, which a later act cannot have been, so an update that carried them would
 * quietly reassign authorship to whoever touched a row last.
 */
export const auditOnUpdate = (stamp: WriteStamp) => ({
  updatedAt: stamp.at,
});
