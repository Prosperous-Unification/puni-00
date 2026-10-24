import { Button } from '@ui/saas-01';
import { useEffect, useId, useMemo, useState } from 'react';

import type { InstalledClaims } from '@/lib/plan-refresh';
import type {
  ClaimHistoryClaimView,
  ClaimHistoryEventView,
  ClaimView,
  StepView,
} from '@/lib/wbs-api';

import { zonedMoment } from './attempt-words';
import { leaseChipText, leaseViewOf } from './claim-lease-view';
import { type LeaseClock, useLeaseNow } from './lease-clock';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalTrigger } from './modal';

/** One holder's claims in the sheet, split by run in the read's order. */
interface HolderGroup {
  personId: string;
  name: string;
  runs: { runId: string | null; claims: ClaimView[] }[];
}

/**
 * The held claims grouped by holder (by name), then by run in the order the
 * claims read lists them (C16). Every claim the read lists is here, including
 * one on a row or step the installed tree does not hold yet (C11).
 */
export function groupHeldClaims(claims: readonly ClaimView[]): HolderGroup[] {
  const holders = new Map<string, HolderGroup>();
  for (const claim of claims) {
    const holder = holders.get(claim.holder.personId) ?? {
      personId: claim.holder.personId,
      name: claim.holder.name,
      runs: [],
    };
    holders.set(claim.holder.personId, holder);
    const run = holder.runs.find((each) => each.runId === claim.runId);
    if (run === undefined) holder.runs.push({ runId: claim.runId, claims: [claim] });
    else run.claims.push(claim);
  }
  return [...holders.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** What the sheet's history section shows: being read, read, or not readable. */
type HistoryState =
  | { kind: 'reading'; events: readonly ClaimHistoryEventView[] | null }
  | { kind: 'read'; events: readonly ClaimHistoryEventView[] }
  | { kind: 'failed' };

const REASON_WORDS: Readonly<Record<ClaimHistoryEventView['reason'], string | null>> = {
  claimed: null,
  released: null,
  lease_expired: 'lease expired',
  credential_revoked: 'credential revoked',
};

/** `24 Oct 10:42` in the project's zone, or null from a read without one. */
function sinceWords(epochMs: number, zone: string | null): string | null {
  if (zone === null) return null;
  const moment = zonedMoment(epochMs, zone);
  return `${moment.day} ${moment.time}`;
}

export interface ClaimsSheetProps {
  /** The installed claims read, or null before one installs. */
  claims: InstalledClaims | null;
  /** Whether the last claims read failed (C12): the sheet says so in place. */
  claimsMayBeStale: boolean;
  /**
   * The installed tree's generation. Every claim, release and reap announces
   * the tree, so a change of it while the sheet is open rereads the history
   * (C13); a heartbeat's `claims_changed` moves only `claims` and does not.
   */
  treeGeneration: number;
  /** The project's claim history read; called only while the sheet is open. */
  readHistory: () => Promise<ClaimHistoryEventView[]>;
  /** The tree's steps, to name a claim's step. */
  steps: readonly StepView[];
  /** The project's zone; null leaves the instants out. */
  zone: string | null;
  /** The plan's one lease clock, so the sheet counts as the chips do. */
  leaseClock: LeaseClock;
}

/**
 * The **Claims sheet** (`wbs-claim-display` C13, C16): who holds what now,
 * grouped by holder then run, and the recent claims and releases with why each
 * went. Display only (C15): no claim or release control.
 *
 * Its button is drawn only while a claim is held, or while the sheet is open,
 * so an unclaimed plan's toolbar is exactly what it was (design Goals); the
 * button carries the held count, and none at zero.
 *
 * The history is the sheet's own read, not a plan resource: read on open,
 * again on each tree change while open, and never while closed. A failed read
 * is said in place with its own retry, and the held list stays (C12).
 */
export function ClaimsSheet({
  claims,
  claimsMayBeStale,
  treeGeneration,
  readHistory,
  steps,
  zone,
  leaseClock,
}: ClaimsSheetProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState>({ kind: 'reading', events: null });
  const [attempt, setAttempt] = useState(0);
  const held = useMemo(() => claims?.claims ?? [], [claims]);
  const heldHeading = useId();
  const historyHeading = useId();

  useEffect(() => {
    if (!open) return;
    let current = true;
    setHistory((was) => ({ kind: 'reading', events: was.kind === 'read' ? was.events : null }));
    readHistory().then(
      (events) => {
        if (current) setHistory({ kind: 'read', events });
      },
      () => {
        // Modelled, not swallowed: the history is optional (C12) and its
        // failure is the section's rendered state, with its own retry.
        // Proof: answering an empty list here instead made `says the history
        // could not be read in place, and keeps the held list` fail on the
        // missing sentence; watched 2026-10-24.
        if (current) setHistory({ kind: 'failed' });
      },
    );
    return () => {
      current = false;
    };
    // `treeGeneration` is a dependency only to reread: a tree change while open
    // is a claim, release or reap. `claims` is deliberately not one.
    // Proof: with `claims` added here, `rereads the history on a tree change
    // while open, and not on claims_changed` failed on the heartbeat's
    // request count (`expected 2 to be 1`); with `treeGeneration` dropped, the
    // same case failed on the tree change (`expected 1 to be 2`); watched
    // 2026-10-24.
  }, [open, treeGeneration, attempt, readHistory]);

  const stepNames = useMemo(() => new Map(steps.map((step) => [step.id, step.name])), [steps]);
  const stepWords = (stepId: string | null): string =>
    stepId === null ? 'subtree' : (stepNames.get(stepId) ?? 'unlisted step');
  const groups = useMemo(() => groupHeldClaims(held), [held]);

  // Proof: with this return taken out, `is not drawn while no claim is held, so
  // an unclaimed plan pays nothing` failed on `expected <button …> to be null`;
  // watched 2026-10-24.
  if (held.length === 0 && !open) return null;
  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          aria-label={held.length === 0 ? 'Claims' : `Claims, ${String(held.length)} held`}
          data-hint="Who holds which steps now, and the recent claims and releases"
          className="gap-1.5"
        >
          <span>Claims</span>
          {held.length > 0 && (
            <span
              data-claims-count
              className="rounded-sm px-1 text-xs font-semibold tabular-nums"
              style={{ color: 'var(--claim-ink)', background: 'var(--claim-tint)' }}
            >
              {held.length}
            </span>
          )}
        </Button>
      </ModalTrigger>
      <ModalContent
        side="right"
        // The whole screen on a phone, as Project settings is (F-054): it opens
        // from the `Plan actions` sheet, which would otherwise show under it.
        className="flex max-h-dvh flex-col gap-4 overflow-y-auto max-md:w-full max-md:max-w-none max-md:border-0"
      >
        <ModalHeader>
          <ModalTitle>Claims</ModalTitle>
        </ModalHeader>
        <section aria-labelledby={heldHeading} className="flex flex-col gap-3">
          <h3
            id={heldHeading}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Held now
          </h3>
          {/* C12: the claims read's failure, in place. Proof: this line
          suppressed, `says a failed claims read in place, over the last claims
          read` failed on `expected undefined to be 'Claims could not be read.
          These are t…'`; watched 2026-10-24. */}
          {claimsMayBeStale && (
            <p data-claims-sheet-stale className="text-muted-foreground text-xs">
              Claims could not be read.
              {claims === null ? '' : ' These are the last ones read.'}
            </p>
          )}
          {held.length === 0 && claims !== null && (
            <p className="text-muted-foreground text-sm">No claims are held.</p>
          )}
          {groups.map((group) => (
            <div
              key={group.personId}
              data-claims-holder={group.name}
              className="flex flex-col gap-1.5"
            >
              <h4 className="text-sm font-semibold" style={{ color: 'var(--claim-ink)' }}>
                {group.name}
              </h4>
              {group.runs.map((run) => (
                <div
                  key={run.runId ?? ''}
                  data-claims-run={run.runId ?? ''}
                  className="flex flex-col gap-0.5 border-l pl-2"
                >
                  {run.runId !== null && (
                    <p className="text-muted-foreground font-mono text-xs break-all">
                      run {run.runId}
                    </p>
                  )}
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {run.claims.map((claim) => (
                      <HeldClaimRow
                        key={claim.claimId}
                        claim={claim}
                        step={stepWords(claim.stepId)}
                        since={sinceWords(claim.claimedAt, zone)}
                        claims={claims}
                        leaseClock={leaseClock}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
        <section aria-labelledby={historyHeading} className="flex flex-col gap-2">
          <h3
            id={historyHeading}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Recent claims and releases
          </h3>
          <ClaimHistoryList
            history={history}
            zone={zone}
            stepWords={stepWords}
            retry={() => {
              setAttempt((count) => count + 1);
            }}
          />
        </section>
      </ModalContent>
    </Modal>
  );
}

/**
 * One held claim: number, name, step or `subtree`, lease text and since. The
 * lease is read at the plan's lease clock against the claims read's own clock
 * (C6), as a chip reads it.
 */
function HeldClaimRow({
  claim,
  step,
  since,
  claims,
  leaseClock,
}: {
  claim: ClaimView;
  step: string;
  since: string | null;
  claims: InstalledClaims | null;
  leaseClock: LeaseClock;
}) {
  const now = useLeaseNow(leaseClock);
  const lease =
    claims === null
      ? null
      : leaseChipText(
          leaseViewOf(claim, { readAt: claims.readAt, installedAt: claims.installedAt }, now),
        );
  return (
    <li
      data-held-claim={claim.claimId}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 text-sm"
    >
      <span className="text-muted-foreground font-mono text-xs tabular-nums">{claim.number}</span>
      <span className="min-w-0 truncate">
        <span>{claim.name}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="text-muted-foreground">{step}</span>
      </span>
      <span className="text-muted-foreground flex gap-2 text-xs whitespace-nowrap tabular-nums">
        {lease !== null && (
          <span
            data-held-lease
            style={{ color: lease === 'releasing' ? undefined : 'var(--claim-ink)' }}
          >
            {lease}
          </span>
        )}
        {since !== null && <span>since {since}</span>}
      </span>
    </li>
  );
}

/** The names of the people one history entry names, a deleted one said as such. */
function whoWords(claims: readonly ClaimHistoryClaimView[]): string {
  const names = [...new Set(claims.map((claim) => claim.holder.name ?? 'a deleted person'))];
  return names.join(', ');
}

function ClaimHistoryList({
  history,
  zone,
  stepWords,
  retry,
}: {
  history: HistoryState;
  zone: string | null;
  stepWords: (stepId: string | null) => string;
  retry: () => void;
}) {
  if (history.kind === 'failed') {
    return (
      <p data-claim-history-failed className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Claim history could not be read.</span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-6 px-2 text-xs"
          onClick={retry}
        >
          Retry history
        </Button>
      </p>
    );
  }
  if (history.events === null) {
    return <p className="text-muted-foreground text-sm">Reading…</p>;
  }
  if (history.events.length === 0) {
    return <p className="text-muted-foreground text-sm">No claims or releases yet.</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-busy={history.kind === 'reading'}>
      {history.events.map((entry) => {
        const reason = REASON_WORDS[entry.reason];
        const when = sinceWords(entry.at, zone);
        return (
          <li
            key={`${entry.eventId}:${String(entry.act)}`}
            data-claim-history-event={entry.eventId}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-sm"
          >
            <span className="text-muted-foreground pt-px text-xs whitespace-nowrap tabular-nums">
              {when ?? ''}
            </span>
            <span className="flex min-w-0 flex-col">
              <span>
                <span className="font-medium">{whoWords(entry.claims)}</span>{' '}
                {entry.kind === 'claim' ? 'claimed' : 'released'}
              </span>
              {entry.claims.map((claim) => (
                <span key={claim.claimId} className="text-muted-foreground truncate">
                  {claim.item === null
                    ? 'a deleted item'
                    : `${claim.item.number} ${claim.item.name} · ${stepWords(claim.stepId)}`}
                </span>
              ))}
              {reason !== null && (
                <span data-claim-history-reason className="text-xs font-medium">
                  {reason}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
