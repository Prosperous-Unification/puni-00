import { Card, CardContent, CardHeader, CardTitle } from '@ui/saas-01';
import { type ClientReply, readPersonLoad } from '@wbs/contracts';
import { type ReactNode, useEffect, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { loadRefusalWords } from './load-refusal';
import { type LoadWindow, placeInWindow } from './load-window';

const PEOPLE_SHAPES = [readPersonLoad] as const;

type PersonLoad = Extract<ClientReply<typeof readPersonLoad>, { kind: 'success' }>['body'];
type WorkPackageLoad = PersonLoad['workPackages'][number];
type Booking = WorkPackageLoad['bookings'][number];
type UnavailableReason = PersonLoad['unavailable'][number]['reason'];

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'absent' }
  | { kind: 'ready'; load: PersonLoad };

/**
 * Why a work package's bookings could not be read, in the reader's words. Keyed by
 * the contract's closed reason list: a reason the contract does not name never
 * reaches this page, because the shared shape refuses the response and the
 * page shows its query-failure state instead.
 *
 * Proof: `reason` widened to `'string'` in `person-load-shapes.ts` made `shows
 * the query failure for a reason the contract does not name, not a blank lane`
 * (`person-load-page.test.tsx`) find no alert; watched 2026-09-29.
 */
const REASON_WORDS: Readonly<Record<UnavailableReason, string>> = {
  engine_unavailable: 'its schedule engine is not available here',
  cycle: 'its dependencies run in a circle',
  calendar_range: 'its dates run past the calendar',
  // Proof: omitting this key rendered a valid connected calendar refusal as "Platform could not be read: ." in the mounted page test.
  dependency_calendar_missing: 'a connected work package has no scheduling calendar',
};

/** The key that names one booking in an overlap and in a lane alike. */
function bookingKey(workPackageId: string, workItemId: string, stepId: string | null): string {
  return `${workPackageId}\u0000${workItemId}\u0000${stepId ?? ''}`;
}

export interface PersonLoadPageProps {
  personId: string;
  window: LoadWindow;
  nav?: ReactNode;
  account?: ReactNode;
}

/**
 * One person's bookings across every work package the reader can open, one lane
 * per work package on a shared workday axis, with the stretches where two
 * bookings run at once hatched (`openspec/changes/share-people-across-work-packages`,
 * slice 2).
 *
 * Reads only. Which bookings overlap is be-01's answer, never recomputed from
 * the dates here: dates are whole days, and two bookings that hand off in the
 * middle of one day share it without overlapping.
 */
export function PersonLoadPage({
  personId,
  window,
  nav,
  account,
}: PersonLoadPageProps): React.JSX.Element {
  const people = useResourceClient(PEOPLE_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);

  useEffect(() => {
    let current = true;
    setView({ kind: 'loading' });
    people
      .getApiPeopleByPersonIdLoad({
        params: { personId },
        query: { from: window.from, to: window.to },
      })
      .then((reply) => {
        if (!current) return;
        switch (reply.kind) {
          case 'success':
            setView({ kind: 'ready', load: reply.body });
            return;
          case 'failure':
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
            return;
          case 'refusal':
            setView(
              reply.body.error === 'not_found'
                ? { kind: 'absent' }
                : { kind: 'failure', message: loadRefusalWords(reply.body.error) },
            );
            return;
          default:
            return unreachable(reply);
        }
      })
      .catch((cause: unknown) => {
        if (current) setFault(new Error('Unexpected person load failure', { cause }));
      });
    return () => {
      current = false;
    };
  }, [people, personId, window.from, window.to]);

  if (fault !== null) throw fault;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader nav={nav} account={account} />
      <main className="flex flex-col gap-3 p-3">
        <Body view={view} window={window} />
      </main>
    </div>
  );
}

function Body({ view, window }: { view: View; window: LoadWindow }): React.JSX.Element {
  switch (view.kind) {
    case 'loading':
      return <p className="text-muted-foreground text-sm">Loading load…</p>;
    case 'failure':
      return (
        <p role="alert" className="text-destructive text-sm">
          {view.message === '' ? 'The load could not be read.' : view.message}
        </p>
      );
    case 'absent':
      return <p className="text-sm">This person is not in your organization’s directory.</p>;
    case 'ready':
      return <Ready load={view.load} window={window} />;
    default:
      return unreachable(view);
  }
}

function Ready({ load, window }: { load: PersonLoad; window: LoadWindow }): React.JSX.Element {
  const overlapping = new Set(
    load.overlaps.flatMap((overlap) =>
      overlap.bookings.map((booking) =>
        bookingKey(booking.workPackageId, booking.workItemId, booking.stepId),
      ),
    ),
  );
  const nothing =
    load.workPackages.length === 0 && load.undated.length === 0 && load.unavailable.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {load.person.name} — {window.from} to {window.to}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-4">
        {nothing ? (
          <p className="text-muted-foreground text-sm">Nothing booked in these weeks.</p>
        ) : null}
        {load.overlaps.length > 0 ? (
          <p className="text-sm">
            Booked twice on{' '}
            {load.overlaps
              .map((overlap) =>
                overlap.startsOn === overlap.endsOn
                  ? overlap.startsOn
                  : `${overlap.startsOn} to ${overlap.endsOn}`,
              )
              .join(', ')}
            .
          </p>
        ) : null}
        {load.workPackages.length > 0 ? (
          <ul aria-label="Work packages" className="flex flex-col gap-2">
            {load.workPackages.map((workPackage) => (
              <li key={workPackage.workPackageId} className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {workPackage.name}
                  {workPackage.engine === 'optimized' ? ' (optimized)' : ''}
                </span>
                <Lane
                  workPackage={workPackage}
                  window={window}
                  isOverlapping={(booking) =>
                    overlapping.has(
                      bookingKey(workPackage.workPackageId, booking.workItemId, booking.stepId),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
        {load.undated.length > 0 ? (
          <p className="text-sm">
            No start date, so nothing booked yet:{' '}
            {load.undated.map((workPackage) => workPackage.name).join(', ')}.
          </p>
        ) : null}
        {load.unavailable.length > 0 ? (
          <ul aria-label="Unavailable work packages" className="text-sm">
            {load.unavailable.map((workPackage) => (
              <li key={workPackage.workPackageId}>
                {workPackage.name} could not be read: {REASON_WORDS[workPackage.reason]}.
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One work package's bookings as bars across the window. A bar is hatched when
 * be-01 named it in an overlap, and only then.
 *
 * Proof: hatching by whole-day intersection (`a.startsOn <= b.endsOn &&
 * b.startsOn <= a.endsOn`) instead of overlap membership made `does not hatch
 * a hand-off inside one day` (`person-load-page.test.tsx`) hatch both bars;
 * watched 2026-09-29.
 */
function Lane({
  workPackage,
  window,
  isOverlapping,
}: {
  workPackage: WorkPackageLoad;
  window: LoadWindow;
  isOverlapping: (booking: Booking) => boolean;
}): React.JSX.Element {
  return (
    <div
      role="list"
      aria-label={`Bookings in ${workPackage.name}`}
      className="bg-muted relative h-7 rounded"
    >
      {workPackage.bookings.map((booking) => {
        const place = placeInWindow(window, booking.startsOn, booking.endsOn);
        if (place === null) return null;
        const hatched = isOverlapping(booking);
        return (
          <div
            key={`${booking.workItemId}:${booking.stepId ?? ''}`}
            role="listitem"
            aria-label={`${booking.number} ${booking.name}, ${booking.startsOn} to ${booking.endsOn}${hatched ? ', booked twice' : ''}`}
            title={`${booking.number} ${booking.name}`}
            data-overlapping={hatched ? 'true' : 'false'}
            className="bg-primary/70 absolute top-1 bottom-1 rounded-sm"
            style={{
              left: `${String(place.left * 100)}%`,
              width: `${String(place.width * 100)}%`,
              ...(hatched
                ? {
                    backgroundImage:
                      'repeating-linear-gradient(45deg, transparent 0 4px, rgb(0 0 0 / 0.35) 4px 8px)',
                  }
                : {}),
            }}
          />
        );
      })}
    </div>
  );
}
