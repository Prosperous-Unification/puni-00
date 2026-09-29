import { type ClientReply, readPersonLoad } from '@wbs/contracts';
import { type ReactNode, useEffect, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { type LoadWindow, placeInWindow } from './load-window';

const people = browserClient([readPersonLoad]);

type PersonLoad = Extract<ClientReply<typeof readPersonLoad>, { kind: 'success' }>['body'];
type ProjectLoad = PersonLoad['projects'][number];
type Booking = ProjectLoad['bookings'][number];
type UnavailableReason = PersonLoad['unavailable'][number]['reason'];

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'absent' }
  | { kind: 'ready'; load: PersonLoad };

/**
 * Why a project's bookings could not be read, in the reader's words. Keyed by
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
};

/** The key that names one booking in an overlap and in a lane alike. */
function bookingKey(projectId: string, workItemId: string, stepId: string | null): string {
  return `${projectId}\u0000${workItemId}\u0000${stepId ?? ''}`;
}

export interface PersonLoadPageProps {
  personId: string;
  window: LoadWindow;
  nav?: ReactNode;
  account?: ReactNode;
}

/**
 * One person's bookings across every project the reader can open, one lane
 * per project on a shared workday axis, with the stretches where two
 * bookings run at once hatched (`openspec/changes/share-people-across-projects`,
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
                : { kind: 'failure', message: refusalWords(reply.body.error) },
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
  }, [personId, window.from, window.to]);

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

function refusalWords(error: string): string {
  switch (error) {
    case 'no_active_organization':
      return 'Choose an organization to see its people’s load.';
    case 'not_a_member':
      return 'You are no longer a member of this organization.';
    default:
      return 'The load could not be read. Try again.';
  }
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
        bookingKey(booking.projectId, booking.workItemId, booking.stepId),
      ),
    ),
  );
  const nothing =
    load.projects.length === 0 && load.undated.length === 0 && load.unavailable.length === 0;
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
        {load.projects.length > 0 ? (
          <ul aria-label="Projects" className="flex flex-col gap-2">
            {load.projects.map((project) => (
              <li key={project.projectId} className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  {project.name}
                  {project.engine === 'optimized' ? ' (optimized)' : ''}
                </span>
                <Lane
                  project={project}
                  window={window}
                  isOverlapping={(booking) =>
                    overlapping.has(
                      bookingKey(project.projectId, booking.workItemId, booking.stepId),
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
            {load.undated.map((project) => project.name).join(', ')}.
          </p>
        ) : null}
        {load.unavailable.length > 0 ? (
          <ul aria-label="Unavailable projects" className="text-sm">
            {load.unavailable.map((project) => (
              <li key={project.projectId}>
                {project.name} could not be read: {REASON_WORDS[project.reason]}.
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * One project's bookings as bars across the window. A bar is hatched when
 * be-01 named it in an overlap, and only then.
 *
 * Proof: hatching by whole-day intersection (`a.startsOn <= b.endsOn &&
 * b.startsOn <= a.endsOn`) instead of overlap membership made `does not hatch
 * a hand-off inside one day` (`person-load-page.test.tsx`) hatch both bars;
 * watched 2026-09-29.
 */
function Lane({
  project,
  window,
  isOverlapping,
}: {
  project: ProjectLoad;
  window: LoadWindow;
  isOverlapping: (booking: Booking) => boolean;
}): React.JSX.Element {
  return (
    <div
      role="list"
      aria-label={`Bookings in ${project.name}`}
      className="bg-muted relative h-7 rounded"
    >
      {project.bookings.map((booking) => {
        const place = placeInWindow(window, booking.startsOn, booking.endsOn);
        if (place === null) return null;
        const hatched = isOverlapping(booking);
        return (
          <div
            key={`${booking.workItemId}:${booking.stepId ?? ''}`}
            role="listitem"
            aria-label={`${booking.number} ${booking.name}, ${booking.startsOn} to ${booking.endsOn}${hatched ? ', booked twice' : ''}`}
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
