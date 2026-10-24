import {
  type DeliveryMeasurement,
  type DeliveryObservation,
  type DeliveryReading,
  summarizeDeliveryTiming,
} from '@shared/delivery';
import { Button } from '@ui/saas-01';
import { getWorkItemDelivery } from '@wbs/contracts';
import { type ReactNode, useEffect, useState } from 'react';

import { unreachable } from '@/lib/http';
import { followableHref } from '@/lib/wbs-api';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

const DELIVERY_SHAPES = [getWorkItemDelivery] as const;
const FRESHNESS_MS = 5 * 60 * 1000;
interface DeliveryPanelProps {
  projectId: string;
  workItemId: string;
  reference: { id: string; url: string };
}
type ReadingState =
  | { kind: 'loading'; identity: string }
  | { kind: 'failed'; identity: string }
  | { kind: 'limited'; identity: string; retryAfterSeconds: number }
  | { kind: 'busy'; identity: string }
  /** `serverAheadMs` is the server clock minus the browser clock when the reading arrived. */
  | { kind: 'ready'; identity: string; reading: DeliveryReading; serverAheadMs: number };

/**
 * Reads a saved reference only while explicitly mounted by the links editor.
 * Reference URL and resource ownership fence requests even when an ID is reused.
 * Refresh discards the previous reading; freshness updates never fetch a provider. The server
 * may answer a refresh from its short reading cache, which the unchanged `observedAt` shows.
 */
export function DeliveryPanel({ projectId, workItemId, reference }: DeliveryPanelProps) {
  const client = useResourceClient(DELIVERY_SHAPES);
  const scope = useResourceScope();
  const identity = JSON.stringify([
    scope.organization,
    projectId,
    workItemId,
    reference.id,
    reference.url,
  ]);
  const [state, setState] = useState<ReadingState>({ kind: 'loading', identity });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const abort = new AbortController();
    setState({ kind: 'loading', identity });
    void client['getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery']({
      params: { id: projectId, workItemId, refId: reference.id },
      signal: abort.signal,
    }).then((reply) => {
      if (!isCurrent || !scope.isCurrent()) return;
      switch (reply.kind) {
        case 'success':
          setState({
            kind: 'ready',
            identity,
            reading: reply.body.reading,
            serverAheadMs: Date.parse(reply.body.servedAt) - Date.now(),
          });
          return;
        case 'refusal':
          // Proof: dropping either branch made 'renders the 429 delivery refusal as its own state' or its 503 case read the generic failure (2026-10-24).
          if (reply.body.error === 'delivery_rate_limited')
            setState({
              kind: 'limited',
              identity,
              retryAfterSeconds: reply.body.retryAfterSeconds,
            });
          else if (reply.body.error === 'delivery_busy') setState({ kind: 'busy', identity });
          else setState({ kind: 'failed', identity });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') setState({ kind: 'failed', identity });
          return;
        default:
          unreachable(reply);
      }
    });
    // Proof: removing cancellation and ownership withdrawal made all four late link/URL/work/organization tests lose the current reading (task-4 context fault).
    return () => {
      isCurrent = false;
      abort.abort();
    };
  }, [client, scope, identity, projectId, workItemId, reference.id, refresh]);

  const owned = state.identity === identity ? state : { kind: 'loading' as const, identity };
  return (
    <section aria-label="Delivery observation" className="min-w-0 space-y-3 border-t pt-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Delivery</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={owned.kind === 'loading'}
          onClick={() => {
            setState({ kind: 'loading', identity });
            setRefresh((previous) => previous + 1);
          }}
        >
          Refresh delivery
        </Button>
      </div>
      {owned.kind === 'loading' ? (
        <p role="status">Loading delivery…</p>
      ) : owned.kind === 'failed' ? (
        <p role="alert" className="text-destructive">
          Delivery could not be read. Try refreshing.
        </p>
      ) : owned.kind === 'limited' ? (
        <p role="alert">
          {`Your organization has used its delivery reads for now. Try again in ${String(owned.retryAfterSeconds)} s.`}
        </p>
      ) : owned.kind === 'busy' ? (
        <p role="alert">Delivery reads are busy right now. Try again in a few seconds.</p>
      ) : (
        <Reading reading={owned.reading} serverAheadMs={owned.serverAheadMs} />
      )}
    </section>
  );
}

/** Uses the same URL policy as the links editor for every provider-supplied source. */
function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  // Proof: bypassing followableHref failed keeps unsafe source URLs unfollowable by creating a javascript anchor.
  const href = followableHref(url);
  return href === null ? (
    <span className="break-all">{children}</span>
  ) : (
    <a className="break-all underline" href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function Reading({ reading, serverAheadMs }: { reading: DeliveryReading; serverAheadMs: number }) {
  switch (reading.kind) {
    case 'unsupported':
      return (
        <div>
          <p className="font-medium">Unsupported link</p>
          <p>{reading.reason}</p>
        </div>
      );
    case 'unavailable':
      return (
        <div>
          <p className="font-medium">{`Delivery unavailable (${reading.reason})`}</p>
          <p>{reading.message}</p>
          <p className="text-muted-foreground">
            Observed <time dateTime={reading.observedAt}>{reading.observedAt}</time>
          </p>
        </div>
      );
    case 'observed':
      return (
        <Observation
          key={reading.observation.observedAt}
          observation={reading.observation}
          serverAheadMs={serverAheadMs}
        />
      );
    default:
      return unreachable(reading);
  }
}

/**
 * A one-shot display timer marks an observation stale without starting another request.
 * Age is measured on the server's clock: the browser deadline is shifted by how far the
 * server clock ran ahead when the reading was served, so a skewed browser clock cannot
 * make a fresh reading stale or a stale one fresh.
 */
function Freshness({ observedAt, serverAheadMs }: { observedAt: string; serverAheadMs: number }) {
  // Proof: dropping serverAheadMs made 'ages on the server clock, not a skewed browser clock' still read Current five server minutes after observation (2026-10-24).
  const deadline = Date.parse(observedAt) + FRESHNESS_MS - serverAheadMs;
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const delay = Math.max(0, deadline - Date.now() + 1);
    const timer = setTimeout(() => {
      setClock(Date.now());
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [deadline]);
  // Proof: forcing freshness to remain current failed ages past five minutes locally without another provider read (task-4 stale fault).
  const isStale = clock > deadline;
  return (
    <p role="status" className="text-muted-foreground">
      {isStale ? 'Stale observation — more than five minutes old' : 'Current observation'}
    </p>
  );
}

function Measurement({ label, measurement }: { label: string; measurement: DeliveryMeasurement }) {
  const duration =
    measurement.milliseconds === null
      ? 'Unknown'
      : `${String(Number((measurement.milliseconds / 1000).toFixed(3)))} s${measurement.state === 'partial' ? ' (partial)' : ''}`;
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{duration}</dd>
      {measurement.reasons.map((reason) => (
        <dd key={reason} className="text-muted-foreground text-xs">
          {reason}
        </dd>
      ))}
    </div>
  );
}

function Observation({
  observation,
  serverAheadMs,
}: {
  observation: DeliveryObservation;
  serverAheadMs: number;
}) {
  const timing = summarizeDeliveryTiming(observation);
  const hasPartialCoverage =
    observation.coverage.checks === 'partial' ||
    observation.coverage.runs === 'partial' ||
    timing.sumExecutionMs.state === 'partial' ||
    observation.runs.some(
      (run) => !run.attemptsComplete || run.attempts.some((attempt) => !attempt.executionsComplete),
    );
  return (
    <div className="min-w-0 space-y-3">
      <Freshness observedAt={observation.observedAt} serverAheadMs={serverAheadMs} />
      <p className="text-muted-foreground">
        Observed <time dateTime={observation.observedAt}>{observation.observedAt}</time>
      </p>
      <div className="space-y-1 break-all">
        <p className="font-medium">
          <SourceLink url={observation.change.source.url}>{observation.change.title}</SourceLink>
        </p>
        <p>Change state: {observation.change.state}</p>
        <p>
          Revision: <code>{observation.change.revision}</code>
        </p>
        {observation.change.mergedRevision !== null && (
          <p>
            Merge commit: <code>{observation.change.mergedRevision}</code>
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Source: {observation.change.source.provider} · {observation.change.source.nativeState}
        </p>
      </div>
      <p className="text-muted-foreground text-xs">
        This observation does not establish merge eligibility, deployment or acceptance.
      </p>
      {hasPartialCoverage && <p className="font-medium">Partial coverage</p>}
      {observation.coverage.notes.map((note, index) => (
        <p key={index} className="text-muted-foreground text-xs">
          {note}
        </p>
      ))}
      <dl className="grid grid-cols-2 gap-3">
        <Measurement label="Summed execution time" measurement={timing.sumExecutionMs} />
        <Measurement label="Elapsed span (including gaps)" measurement={timing.elapsedMs} />
      </dl>
      <div className="space-y-2">
        <h4 className="font-medium">Checks for this revision</h4>
        {observation.checks.length === 0 ? (
          <p>No checks were observed.</p>
        ) : (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th scope="col" className="p-1">
                    Check
                  </th>
                  <th scope="col" className="p-1">
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody>
                {observation.checks.map((check) => (
                  <tr
                    key={JSON.stringify([check.source.provider, check.source.id])}
                    className="border-t"
                  >
                    <td className="min-w-0 p-1 break-all">
                      <SourceLink url={check.source.url}>{check.name}</SourceLink>
                    </td>
                    <td className="p-1 align-top">
                      {check.state}
                      <span className="text-muted-foreground block">
                        {check.source.nativeState}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="font-medium">Runs and attempts</h4>
        {observation.runs.length === 0 && <p>No runs were observed.</p>}
        {observation.runs.map((run) => (
          <div
            key={JSON.stringify([run.source.provider, run.source.id])}
            className="min-w-0 space-y-2 border-t pt-2"
          >
            <p className="font-medium break-all">
              <SourceLink url={run.source.url}>{run.name}</SourceLink>
            </p>
            <p className="text-muted-foreground text-xs break-all">Run revision: {run.revision}</p>
            {run.attempts.map((attempt, index) => {
              const measured = timing.attempts.find(
                (candidate) =>
                  candidate.source.provider === attempt.source.provider &&
                  candidate.source.id === attempt.source.id,
              );
              // Proof: deleting the summary dependency's attempts reaches the Error Boundary in routes a missing trusted attempt summary.
              if (measured === undefined) throw new Error('Delivery attempt has no timing summary');
              return (
                <div
                  key={JSON.stringify([attempt.source.provider, attempt.source.id])}
                  className="min-w-0 space-y-2"
                >
                  <p>
                    <SourceLink
                      url={attempt.source.url}
                    >{`Attempt ${String(index + 1)}`}</SourceLink>
                    <span className="text-muted-foreground"> · {attempt.source.nativeState}</span>
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <Measurement
                      label="Attempt execution sum"
                      measurement={measured.sumExecutionMs}
                    />
                    <Measurement label="Attempt elapsed span" measurement={measured.elapsedMs} />
                    <Measurement
                      label="Until first execution (from attempt start)"
                      measurement={measured.waiting}
                    />
                  </dl>
                  <ul className="space-y-1 text-xs">
                    {attempt.executions.map((execution) => (
                      <li
                        key={JSON.stringify([execution.source.provider, execution.source.id])}
                        className="break-all"
                      >
                        <SourceLink url={execution.source.url}>{execution.name}</SourceLink> ·{' '}
                        {execution.state} · <span>{execution.kind}</span>
                        {execution.resource !== null && (
                          <span className="text-muted-foreground"> · {execution.resource}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Waiting measures attempt start to the first performed execution start. Runner queue
        eligibility is unknown. Carried outcomes add no execution time.
      </p>
    </div>
  );
}
