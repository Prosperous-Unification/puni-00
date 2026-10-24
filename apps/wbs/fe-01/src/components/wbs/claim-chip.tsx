import type { CSSProperties } from 'react';

import type { ClaimView } from '@/lib/wbs-api';

import { zonedMoment } from './attempt-words';
import {
  type ClaimsClock,
  leaseCardWords,
  leaseChipText,
  type LeaseView,
  leaseViewOf,
} from './claim-lease-view';
import { initialsOf } from './initials';
import { type LeaseClock, useLeaseNow } from './lease-clock';

/**
 * One claim the table or the cards draw: the claim, the subtree claim it is
 * delegated under (null when none), the clock its read was taken on, the
 * plan's one lease clock it is read at, and the project's zone its instant is
 * printed in (null from a read that predates the zone, which leaves the instant
 * out rather than printing the reader's own).
 */
export interface DrawnClaim {
  claim: ClaimView;
  parent: ClaimView | null;
  clock: ClaimsClock;
  leaseClock: LeaseClock;
  zone: string | null;
}

/**
 * What a folded step cell keeps for its claim chip, **only in a column where
 * some drawn row holds a claim** (`wbs-claim-display` C7), as
 * `ASSIGNEE_SLOT_PX` is kept only where somebody is assigned: an unclaimed plan
 * pays nothing. The widest initials, `WW`, are a 27px chip at 10px bold with
 * the folded form's padding and its 3px hold edge (`CO` is 22px; Chromium,
 * 2026-10-24), plus the 3px gap before it. What a narrow cell gives up for it
 * is the trio, dropped whole to the card as it is for the assignee's slot.
 */
export const CLAIM_SLOT_PX = 30;

/**
 * The room the Name cell keeps on its right for a subtree claim's chip (C8),
 * sized for its widest form, `XX releasing`, so the name does not reflow when a
 * lease ends.
 */
export const NAME_CLAIM_PX = 78;

/**
 * The whole sentence a claim says (C9), the card's claim line and every chip's
 * accessible name: `Claimed by codex since 24 Oct 10:42, run r-7, under
 * claire's claim on 080; lease 14 min left`.
 */
export function claimSentence(drawn: DrawnClaim, lease: LeaseView): string {
  const { claim, parent, zone } = drawn;
  const since =
    zone === null
      ? ''
      : (() => {
          const moment = zonedMoment(claim.claimedAt, zone);
          return ` since ${moment.day} ${moment.time}`;
        })();
  const run = claim.runId === null ? '' : `, run ${claim.runId}`;
  const under = parent === null ? '' : `, under ${parent.holder.name}'s claim on ${parent.number}`;
  const words = leaseCardWords(lease);
  return `Claimed by ${claim.holder.name}${since}${run}${under}${words === null ? '' : `; ${words}`}`;
}

/**
 * The chip's shape and ink: bordered, with a heavier left edge as its hold mark.
 * `tap` is the phone card's size, beside 14px words a thumb reads at arm's
 * length; the table's is the caption size of the cells around it.
 */
function chipStyle(releasing: boolean, tap: boolean, folded: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 3,
    flex: 'none',
    boxSizing: 'border-box',
    padding: tap ? '0 4px 0 3px' : folded ? '0 2px 0 1px' : '0 3px 0 2px',
    border: `1px ${releasing ? 'dashed' : 'solid'} ${
      releasing ? 'var(--muted-foreground)' : 'var(--claim-ink)'
    }`,
    // The hold mark: a chip differs from the assignee beside it by shape, not
    // only by colour (C7).
    borderLeftWidth: 3,
    borderRadius: 3,
    fontSize: tap ? 12 : 10,
    fontWeight: 600,
    lineHeight: tap ? '18px' : '14px',
    whiteSpace: 'nowrap',
    color: releasing ? 'var(--muted-foreground)' : 'var(--claim-ink)',
    background: releasing ? 'transparent' : 'var(--claim-tint)',
    cursor: 'default',
  };
}

/**
 * A **Claim chip**: the holder's initials and, in the `full` form, the lease's
 * minutes or `releasing` (C7, C8, C10). Display only: no action and no tab stop.
 *
 * `role="img"` with the whole sentence as its name, so the folded form, which
 * shows two letters, withholds nothing from a screen reader (C9). The `full`
 * form also carries the sentence as its instant fact card; the folded form
 * leaves that to the cell's own step card, the folded cell's one hint.
 */
export function ClaimChip({
  drawn,
  form,
  tap = false,
}: {
  drawn: DrawnClaim;
  form: 'initials' | 'full';
  /** Drawn at the phone card's size. */
  tap?: boolean;
}) {
  const now = useLeaseNow(drawn.leaseClock);
  const lease = leaseViewOf(drawn.claim, drawn.clock, now);
  const sentence = claimSentence(drawn, lease);
  const text = form === 'full' ? leaseChipText(lease) : null;
  return (
    <span
      role="img"
      // Proof: dropping this label made `names the claim in full as the chip’s
      // accessible name` fail on `Unable to find role="img" and name "Claimed
      // by codex since 24 Oct 10:42, …"`; watched 2026-10-24.
      aria-label={sentence}
      data-claim-chip={drawn.claim.claimId}
      data-lease={lease.kind}
      data-fact={form === 'full' ? sentence : undefined}
      style={chipStyle(lease.kind === 'releasing', tap, form === 'initials')}
    >
      <span aria-hidden="true">{initialsOf(drawn.claim.holder.name)}</span>
      {text !== null && (
        <span aria-hidden="true" data-claim-lease style={{ fontWeight: 400 }}>
          {text}
        </span>
      )}
    </span>
  );
}

/** The claim line of a step's hover card: the chip's sentence, in words (C9). */
export function ClaimLine({ drawn }: { drawn: DrawnClaim }) {
  const now = useLeaseNow(drawn.leaseClock);
  const lease = leaseViewOf(drawn.claim, drawn.clock, now);
  return (
    <div data-card-claim={drawn.claim.claimId} style={{ color: 'var(--claim-ink)' }}>
      {claimSentence(drawn, lease)}
    </div>
  );
}
