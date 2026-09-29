import { Link } from '@tanstack/react-router';
import { type ClientReply, readOrganizationLoad } from '@wbs/contracts';
import { useEffect, useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

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
  | { kind: 'ready'; totals: ReadonlyMap<string, { booked: number; overlapping: number }> };

/**
 * Reads `GET /api/people/load` for `window` once, and sums each person's weeks.
 *
 * @throws through the render (to the route's fault boundary) when the read
 * itself throws rather than answering, which the shared client never does for
 * a modeled failure.
 */
export function usePeopleLoad(window: LoadWindow): PeopleLoadView {
  const [view, setView] = useState<PeopleLoadView>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);
  useEffect(() => {
    let current = true;
    people
      .getApiPeopleLoad({ query: { from: window.from, to: window.to } })
      .then((reply) => {
        if (!current) return;
        switch (reply.kind) {
          case 'success':
            setView({ kind: 'ready', totals: totalsOf(reply.body) });
            return;
          case 'failure':
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
            return;
          case 'refusal':
            setView({ kind: 'failure', message: 'The load could not be read.' });
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
  }, [window.from, window.to]);
  if (fault !== null) throw fault;
  return view;
}

function totalsOf(load: OrganizationLoad): Map<string, { booked: number; overlapping: number }> {
  return new Map(
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
  );
}

/** Workdays to one decimal, dropping a trailing `.0`. */
function days(workdays: number): string {
  return `${String(Math.round(workdays * 10) / 10)} d`;
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
  const text = (() => {
    switch (view.kind) {
      case 'loading':
        return 'Load…';
      case 'failure':
        return view.message === '' ? 'Load unavailable' : `Load unavailable: ${view.message}`;
      case 'ready': {
        // A person added after the read: not a person who books nothing.
        const total = view.totals.get(personId);
        if (total === undefined) return 'Load not read yet';
        return `${days(total.booked)} booked, ${days(total.overlapping)} overlapping`;
      }
      default:
        return unreachable(view);
    }
  })();
  return (
    <p className="text-muted-foreground text-xs">
      <Link
        to="/people/$personId/load"
        params={{ personId }}
        aria-label={`Load of ${personName}`}
        className="underline"
      >
        {text}
      </Link>
    </p>
  );
}
