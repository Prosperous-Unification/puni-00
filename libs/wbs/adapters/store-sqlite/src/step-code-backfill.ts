import { type ProjectEvent, subscriptionFor } from '@wbs/core';
import { suggestStepCodes } from '@wbs/domain';
import { and, eq, isNull } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import type { EventLogTransactionalWrite } from './event-log';
import { bumpProject } from './revision';
import { step } from './schema';

/** One step the backfill gave a code to. */
export interface CodedStep {
  projectId: string;
  stepId: string;
  code: string;
}

/**
 * Codes every uncoded step, project by project, in step order — the post-swap
 * half of `20260927150000_add_step_code`.
 *
 * An uncoded step is one an older release inserted while blue and green shared
 * the file: its `INSERT` did not name `code`. The swap runs this once the old
 * colour has stopped, so nothing is left that can write another one; until then
 * the store reads NULL as the modeled uncoded state rather than defaulting it.
 *
 * Each project is one `IMMEDIATE` transaction: the write lock is taken before
 * the project's codes are read, so a step the serving release adds between the
 * read and the update cannot take a code this run is about to give out — and if
 * one did, `step_project_code` refuses the second rather than letting two steps
 * share it. A project that gained codes moves its revision once, because its
 * steps now read differently; a project with nothing uncoded is not touched.
 *
 * Idempotent: only `code IS NULL` rows are read or written, so a rerun after a
 * partial failure codes what is left and a rerun after success codes nothing.
 *
 * Each coded step is announced in the project's durable event log, inside the
 * same transaction, as `step_renamed` carrying the whole step: the event every
 * client already applies as "this step now reads so", which is exactly what a
 * code arriving is. This runs in a CLI with no route to gw-01, so nothing is
 * pushed live; a client picks the events up from the log when it next replays.
 *
 * @returns the steps coded, in the order they were coded.
 * @throws the driver's error on any failure; projects already committed stay coded.
 */
export function backfillStepCodes(
  db: Drizzle,
  eventLog: EventLogTransactionalWrite,
  at: number,
): CodedStep[] {
  const pending = db
    .selectDistinct({ projectId: step.projectId })
    .from(step)
    .where(isNull(step.code))
    .orderBy(step.projectId)
    .all();
  return pending.flatMap(({ projectId }) =>
    db.transaction(
      (tx) => {
        const steps = tx
          .select({ id: step.id, name: step.name, code: step.code, position: step.position })
          .from(step)
          .where(eq(step.projectId, projectId))
          .orderBy(step.position, step.id)
          .all();
        const taken = new Set(steps.flatMap((each) => (each.code === null ? [] : [each.code])));
        const uncoded = steps.filter((each) => each.code === null);
        if (uncoded.length === 0) return [];
        const suggested = suggestStepCodes(
          uncoded.map((each) => each.name),
          taken,
        );
        const coded = uncoded.map((each, index) => ({
          projectId,
          stepId: each.id,
          // Same length by construction: one suggestion per name.
          code: suggested[index],
        }));
        const subscription = subscriptionFor(projectId);
        uncoded.forEach((each, index) => {
          const code = suggested[index];
          tx.update(step)
            .set({ code, ...auditOnUpdate({ at }) })
            .where(and(eq(step.id, each.id), isNull(step.code)))
            .run();
          const announced: ProjectEvent = {
            type: 'step_renamed',
            step: { id: each.id, projectId, name: each.name, position: each.position, code },
          };
          eventLog.recordEventIn(tx, subscription, announced, at);
        });
        bumpProject(tx, projectId, { at });
        return coded;
      },
      { behavior: 'immediate' },
    ),
  );
}
