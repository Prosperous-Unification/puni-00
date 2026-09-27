/**
 * How many workdays the Gantt draws a slice nobody has estimated.
 *
 * **A drawing span only, never schedule time.** An unestimated slice takes zero
 * scheduling duration in Fast and in the solver ({@link durationOf}): it keeps
 * its dependency node and its real floors, and it delays no successor, occupies
 * no assignee, spends no pool and moves no projected date. The Gantt draws it
 * this many workdays wide from its scheduled start as a dotted, translucent
 * placeholder with a question mark, so the unknown work stays visible without
 * becoming planning time (OpenSpec `unestimated-steps-take-no-schedule-time`).
 *
 * Nothing writes an estimate for it: the days column and roll-up stay blank,
 * the readiness badge still counts the gap, the export still says unestimated,
 * and the dependency anchor still walks past the slice to the first one
 * somebody actually estimated.
 *
 * Lives in the domain rather than beside the Gantt so that the one rule about
 * what an unknown length means sits next to {@link durationOf}, which is the
 * rule that keeps it out of the schedule.
 *
 * Deliberately not configurable.
 */
export const ASSUMED_SLICE_WORKDAYS = 2;
