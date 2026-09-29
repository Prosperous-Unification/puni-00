import { Link } from '@tanstack/react-router';
import { type ClientReply, readOrganizationLoad } from '@wbs/contracts';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';
import type { DirectoryManagement } from '@/modules/directory-management/contract';

import { loadRefusalWords } from './load-refusal';
import type { LoadWindow } from './load-window';

const people = browserClient([readOrganizationLoad]);

type OrganizationLoad = Extract<
  ClientReply<typeof readOrganizationLoad>,
  { kind: 'success' }
>['body'];

/** Every person's load over one window, as the directory reads it once for all rows. */
export type PeopleLoadView =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | {
      kind: 'ready';
      totals: ReadonlyMap<string, { booked: number; overlapping: number }>;
      /**
       * Readable projects whose bookings could not be read, for anybody. The
       * organization read does not say whom they name, so every line carries
       * the caveat rather than a figure that reads as complete.
       */
      unavailable: number;
    };

/**
 * Reads `GET /api/people/load` for `window` whenever the directory it sits
 * under reads again: on arrival, after each of the page's own writes, and when
 * the window is focused or the tab shown. Those are the moments an assignment
 * may have been dropped or a person added, so the line follows the rows it is
 * drawn under. Reads started while a write is in flight are skipped; the
 * write's own re-read follows.
 *
 * Proof: the directory snapshot left out of the effect's dependencies made
 * `reads the load again when the directory reads again` in
 * `people-load-summary.test.tsx` see one read instead of two; watched
 * 2026-09-29.
 *
 * @throws through the render (to the route's fault boundary) when the read
 * itself throws rather than answering, which the shared client never does for
 * a modeled failure.
 */
export function usePeopleLoad(
  window: LoadWindow,
  directory: Pick<DirectoryManagement, 'subscribe' | 'snapshot'>,
): PeopleLoadView {
  const shown = useSyncExternalStore(directory.subscribe, directory.snapshot);
  const [view, setView] = useState<PeopleLoadView>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);
  useEffect(() => {
    if (shown.busy) return;
    let current = true;
    people
      .getApiPeopleLoad({ query: { from: window.from, to: window.to } })
      .then((reply) => {
        if (!current) return;
        switch (reply.kind) {
          case 'success':
            setView(readyOf(reply.body));
            return;
          case 'failure':
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
            return;
          case 'refusal':
            setView({ kind: 'failure', message: loadRefusalWords(reply.body.error) });
            return;
          default:
            return unreachable(reply);
        }
      })
      .catch((cause: unknown) => {
        if (current) setFault(new Error('Unexpected people load failure', { cause }));
      });
    return () => {
      current = false;
    };
  }, [window.from, window.to, shown]);
  if (fault !== null) throw fault;
  return view;
}

function readyOf(load: OrganizationLoad): PeopleLoadView {
  return {
    kind: 'ready',
    totals: new Map(
      load.people.map((person) => [
        person.id,
        person.weeks.reduce(
          (sum, week) => ({
            booked: sum.booked + week.booked,
            overlapping: sum.overlapping + week.overlapping,
          }),
          { booked: 0, overlapping: 0 },
        ),
      ]),
    ),
    unavailable: load.unavailable.length,
  };
}

/** Workdays to one decimal, dropping a trailing `.0`. */
function days(workdays: number): string {
  return `${String(Math.round(workdays * 10) / 10)} d`;
}

/**
 * The words of one directory row's load line.
 *
 * Proof: the `unavailable` caveat dropped made `says the load is partly
 * unknown when a project could not be read` (`people-load-summary.test.tsx`)
 * read `0 d booked, 0 d overlapping` for a person whose only project was
 * unreadable; watched 2026-09-29.
 */
export function loadLineOf(view: PeopleLoadView, personId: string): string {
  switch (view.kind) {
    case 'loading':
      return 'Load…';
    case 'failure':
      return view.message === '' ? 'Load unavailable' : `Load unavailable: ${view.message}`;
    case 'ready': {
      // A person added after the read: not a person who books nothing.
      const total = view.totals.get(personId);
      if (total === undefined) return 'Load not read yet';
      const figures = `${days(total.booked)} booked, ${days(total.overlapping)} overlapping`;
      if (view.unavailable === 0) return figures;
      const projects =
        view.unavailable === 1 ? '1 project' : `${String(view.unavailable)} projects`;
      return `${figures}; partly unknown: ${projects} unavailable`;
    }
    default:
      return unreachable(view);
  }
}

/**
 * One directory row's booked and overlapping workdays, linked to the person's
 * load page.
 */
export function PersonLoadSummary({
  view,
  personId,
  personName,
}: {
  view: PeopleLoadView;
  personId: string;
  personName: string;
}): React.JSX.Element {
  const line = loadLineOf(view, personId);
  return (
    <p className="text-muted-foreground text-xs">
      <Link
        to="/people/$personId/load"
        params={{ personId }}
        // The visible words, whole, after the person's name (WCAG label in
        // name), so a screen reader hears the figures and whose they are.
        // Proof: the label cut to `Load of ${personName}` made `sums each
        // person’s weeks into a link whose name carries the figures` and two
        // more cases in `people-load-summary.test.tsx` find no such link;
        // watched 2026-09-29.
        aria-label={`Load of ${personName}: ${line}`}
        className="underline"
      >
        {line}
      </Link>
    </p>
  );
}
