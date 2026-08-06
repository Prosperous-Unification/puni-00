import type { Days } from '@/lib/wbs-api';

export const POINTS = ['optimistic', 'realistic', 'pessimistic'] as const;
export type Point = (typeof POINTS)[number];

/** What is in the three boxes of one row-and-role trio, exactly as typed. */
export type TypedTrio = Record<Point, string>;

/** Which boxes are wrong, and what to tell the person about them. */
export interface TrioProblem {
  points: Point[];
  message: string;
}

/**
 * What is wrong with a trio as typed, or null when nothing is.
 *
 * This replaces the old `keepOrdered`, which silently rewrote the two numbers
 * you did not type so the request would pass be-01's ordering rule. Dany,
 * 2026-08-06: "when inputing estimates they must not autoedit". Editing
 * somebody's estimate to make it valid is the tool asserting a number nobody
 * chose, and the number then reads as theirs.
 *
 * So nothing is rewritten and nothing is sent until the trio can stand on its
 * own. Four states:
 *
 * 1. **All three empty** — no estimate yet. Not a problem; a row nobody has
 *    estimated is ordinary and must not glow red.
 * 2. **Something unparseable or negative** — those boxes are wrong.
 * 3. **Some filled, some empty** — the empty ones are wrong. be-01 stores a
 *    trio or nothing, so a half-filled one saves nothing, and an unsaved
 *    estimate that looks saved is worse than a visible complaint.
 * 4. **Out of order** — both members of each pair that breaks
 *    `optimistic <= realistic <= pessimistic`. Which single box is "wrong" in
 *    `5 / 3 / 10` is not answerable; the pair is.
 */
export function trioProblem(typed: TypedTrio): TrioProblem | null {
  const filled = POINTS.filter((point) => typed[point].trim() !== '');
  if (filled.length === 0) return null;

  const unparseable = filled.filter((point) => {
    const value = Number(typed[point]);
    return !Number.isFinite(value) || value < 0;
  });
  if (unparseable.length > 0) {
    return { points: unparseable, message: 'Days must be a number, zero or more.' };
  }

  const empty = POINTS.filter((point) => typed[point].trim() === '');
  if (empty.length > 0) {
    return { points: empty, message: 'Fill all three, or this estimate is not saved.' };
  }

  const value = (point: Point): number => Number(typed[point]);
  const broken = new Set<Point>();
  if (value('optimistic') > value('realistic')) {
    broken.add('optimistic');
    broken.add('realistic');
  }
  if (value('realistic') > value('pessimistic')) {
    broken.add('realistic');
    broken.add('pessimistic');
  }
  if (broken.size === 0) return null;
  return {
    points: POINTS.filter((point) => broken.has(point)),
    message: 'Must read optimistic ≤ realistic ≤ pessimistic.',
  };
}

/**
 * The trio to send, or null when there is nothing to send.
 *
 * Null covers both "nothing typed yet" and "typed but wrong": neither is a
 * request, and the difference between them is {@link trioProblem}'s to
 * report. Never returns a repaired trio — that is the whole point.
 */
export function sendableTrio(typed: TypedTrio): Days | null {
  if (trioProblem(typed) !== null) return null;
  if (POINTS.every((point) => typed[point].trim() === '')) return null;
  return {
    optimistic: Number(typed.optimistic),
    realistic: Number(typed.realistic),
    pessimistic: Number(typed.pessimistic),
  };
}
