import {
  failureText,
  GONE,
  INVALID_REQUEST,
  isAmbiguousWriteFailure,
  refusalSentence,
} from '@/components/wbs/plan-refusal';
import { createLocalWrite } from '@/lib/local-write';
import { ALL_RESOURCES } from '@/lib/plan-refresh';

import type { PlanWriter, PlanWriterHost } from './contract';

/**
 * Builds the writer for one reader: one project, one API, one busy state.
 *
 * A plain factory and not a DI Bag module, because DI Bag is not installed in
 * this application yet. The module directory is shaped so that adding one later
 * moves no policy.
 */
export function createPlanWriter({
  readRefreshOwner,
  isActiveReader,
  rereadResources,
  busy,
  commandsIssued,
  refusals,
}: PlanWriterHost): PlanWriter {
  return {
    /**
     * One gesture: send its requests, then reread the resources each completed.
     *
     * The two halves fail differently and are reported differently, which is the
     * whole of this change's rule. A refused request is an **event** — somebody
     * asked for something and did not get it — so it is a toast that stays until
     * it is read. A reread that failed is a **state**: the request landed, and
     * what is on screen may now be behind be-01, which is the banner.
     *
     * Nothing is cleared on the way in. The old version reset the error line
     * before every request, so the reason a rename was refused vanished the
     * moment anything else worked; toasts own their own lifecycle instead.
     * Proof: the clear put back at the top of this function, `keeps a failure on
     * screen when the next action succeeds` failed with the toast gone. Watched,
     * 2026-08-06.
     *
     * A refused request contributes no new obligation: be-01 changed nothing in
     * that request. Requests already completed in the same gesture keep theirs,
     * so a create that landed before an attachment refusal remains visible.
     * {@link GONE} is the no-prefix exception: it says the row this client acted
     * on is not there any more, which is a fact about the tree on screen rather
     * than about the request. Without the reread the toast says a row is gone
     * while the row stays on screen, which is the worst of both.
     * A typed transport or response failure has an ambiguous commit outcome, so
     * it conservatively obligates every resource.
     *
     * The verdict is returned as well as toasted, because a toast is a sentence
     * and some callers need the fact. `CellInput` is the one: a refused edit
     * exists only in the box it was typed into, and the box has to be told so it
     * can hold it against the next refetch (rule 4 there). A reread that failed
     * is still `landed` — the write happened, and the banner is what says the
     * screen may be behind.
     */
    async run(action) {
      // Proof: guarding only projectId leaked one refusal toast into the new API
      // owner in `does not toast an old API mutation refusal into its replacement`.
      const owner = readRefreshOwner();
      const isCurrent = () => owner !== null && readRefreshOwner() === owner && isActiveReader();
      // Read here, synchronously, because this is the moment the gesture
      // happened. The intent compares it against where the focus is when the
      // refetch lands, and everything between the two is the window in which
      // the reader may have gone somewhere else.
      commandsIssued.publish(undefined);
      busy.raise();
      const write = createLocalWrite();
      try {
        try {
          await action(write);
        } catch (thrown: unknown) {
          // A refusal from a project the reader has left is not a refusal of
          // anything on the screen now. The old burst stops without putting
          // its toast or refetch into the next project.
          if (!isCurrent()) return 'refused';
          // Proof, two faults, both watched 2026-08-09. `refusalSentence`
          // replaced by `failureText`, `says a row that has gone is gone, and
          // rereads the tree that proves it` failed on `expected [ 'not_found' ]
          // to include 'That change could not be completed: …'`. The reread
          // below dropped, the same test failed on `expected [ '010', '020',
          // '030' ] to deeply equal [ '010', '020' ]`.
          refusals.publish({ sentence: refusalSentence(thrown) });
          // Two refusals say the screen is behind rather than that the request
          // was wrong: {@link GONE}, and a body be-01 could not read. The
          // second is the sentence's own claim — {@link INVALID_REFUSAL} says
          // the plan was read again, and a sentence that says so without doing
          // it is the worst of both.
          const refusal = failureText(thrown, '');
          // Proof: forcing this typed boundary false left the ambiguous
          // transport case with zero recovery reads instead of all resources.
          // Watched in `ambiguous transport failure has its exact recovery
          // scope`, 2026-09-13.
          const ambiguous = isAmbiguousWriteFailure(thrown);
          const completed = write.completedResources();
          // Proof: replacing the completed prefix below with `[]` made
          // `refreshes a created tag after its attachment refuses` time out
          // with one tag read instead of two. Watched, 2026-09-13.
          const resources =
            ambiguous || refusal === GONE || INVALID_REQUEST.has(refusal)
              ? ALL_RESOURCES
              : completed;
          if (resources.length > 0) await rereadResources(resources);
          return 'refused';
        }
        const completed = write.completedResources();
        // Proof: deleting this guard made `refuses a completed gesture whose feed owner
        // was replaced under it` fail with received `landed` versus expected `refused`.
        // The following reread assertion was not reached during that failing run.
        // Watched, 2026-09-20.
        if (!isCurrent()) return 'refused';
        if (completed.length > 0) await rereadResources(completed);
        // A covering read may renew the coordinator for the same reader, so
        // its identity cannot decide this outcome. A live owner and the
        // project/API pair can:
        // Proof: removing this pair check let an old Arrange success toast
        // into the API that replaced it while its tree read was held; replacing
        // it with `isCurrent()` suppressed the valid toast after a same-reader
        // subscription renewal. Watched in the two covering-read Arrange cases,
        // 2026-09-13.
        // Proof: omitting the null-owner check issued a second create with
        // afterId `w1` in `abandons queued adds when unmounted during their covering read`.
        if (readRefreshOwner() === null || !isActiveReader()) return 'refused';
        return 'landed';
      } finally {
        // A covering read may renew the coordinator while retaining the same
        // logical reader. That reader owns this busy state; a different API or
        // project does not.
        // Proof: requiring captured coordinator identity left the renewed
        // reader busy forever. Dropping the API half let the departed owner
        // clear its replacement's pending rename. Watched in the renewal and
        // busy-replacement cases, 2026-09-14.
        if (isActiveReader()) busy.lower();
      }
    },
  };
}
