import { beforeRoundingDays, combinedDays, type EstimateRule } from '@wbs/domain/estimate';
import type { KeyboardEvent } from 'react';

import type { Days, PlanRead } from '@/lib/wbs-api';

import type { Point } from './estimate-draft';
import { HoverCard } from './hover-card';
import type { CardAssignee } from './plan-cards';
import type { Toast } from './toasts';

/**
 * A figure the charge is audited by, to four decimals rather than the table's
 * one: `2.0002` before rounding is why a +0.01% allowance charges 3 days, and
 * `2` would hide it.
 */
const auditDays = (days: number): string => String(Math.round(days * 10_000) / 10_000);

/** One of the three points, as the row holds it: `''` where nobody typed one. */
export interface FoldedStepPoint {
  point: Point;
  days: string;
}

/**
 * What the folded cell says about itself when there is nothing to complain
 * about. Lives on the card, not in a native `title`: the hover preview is the
 * one positioned surface a mark shows (CONTEXT.md), and a browser tooltip
 * racing it over the same cell was two hints disagreeing about one figure.
 */
export const SHORTHAND_HELP =
  'Days as optimistic/realistic/pessimistic — 2/3/8. One number means all three. Empty clears it. ' +
  '@ looks somebody up to do it.';

export interface FoldedStepCardProps {
  stepName: string;
  /** The project the copied node belongs to, so a reopened link can select it. */
  projectId: string;
  /** Null means an older read omitted node metadata or a parent has no node: hide node details. A present node with `reference: null` is uncoded and still offers Copy link. */
  stepNode: NonNullable<PlanRead['stepNodes']>[number] | null;
  /** Returns keyboard focus from the card actions to their folded step cell. */
  onExitActions: () => void;
  /** Keeps a hover-opened card while the pointer arrives from its cell. */
  onPointerArrives: () => void;
  pushToast: (toast: Toast) => void;
  /** The work item's number, so a card over a busy table says whose it is. */
  number: string;
  /**
   * The card's id, which the folded cell's box points `aria-describedby` at.
   *
   * The one card in this table that is a description as well as a hover, which
   * is why it carries no label: see {@link HoverCard}'s `label` for what a
   * label does to a description.
   */
  id: string;
  points: readonly FoldedStepPoint[];
  /** The figure the folded cell shows — `''` where there is nothing to show. */
  final: string;
  estimate?: Days;
  allowancePercent: number;
  rule: EstimateRule;
  doing: CardAssignee | null;
  /**
   * The cell's complaint, where it holds one — a typed trio that saves
   * nothing. On the card because the card is the cell's one hint: the native
   * `title` that used to carry it fought the card on hover.
   */
  problem: string | null;
}

/**
 * What one folded step column cell folds away, in full.
 *
 * The cell at rest is `4.8 · Ka…` in 96px: one computed figure, and a person's
 * name cut to about four characters. The trio behind the figure is only on
 * screen while the step is unfolded — and unfolding one folds another, so a
 * plan cannot be read with every trio open. This is where the folded ones are
 * read.
 *
 * Everything here is already on the row the client holds, which is the whole
 * of "hover asks the server for nothing": the three points, the final figure,
 * who is doing it and whether anybody said so.
 *
 * It is also the folded cell's `aria-describedby`, so that a reader with no
 * pointer is not simply told less. That is why the step and the number are the
 * first line of the card rather than an `aria-label` on it — a label would be
 * read out *instead of* everything under it.
 *
 * A focused step cell offers F2 to enter its copy actions. Tab walks those
 * actions and returns to the cell after the last one; Escape returns at once.
 * Copy reference uses the canonical code when present. Copy link writes the
 * project and node IDs in the URL so opening it can select the plan, reveal
 * and focus this cell.
 */
export function FoldedStepCard({
  stepName,
  projectId,
  stepNode,
  onExitActions,
  onPointerArrives,
  pushToast,
  number,
  id,
  points,
  final,
  estimate,
  allowancePercent,
  rule,
  doing,
  problem,
}: FoldedStepCardProps) {
  const estimated = points.some((each) => each.days.trim() !== '');
  // Proof: rendering 010.s1-dev instead of the canonical reference made
  // `names a coded leaf step in its open detail` fail: expected `010.dev · Dev`,
  // received `Dev for 010010.s1-dev · DevCopy referenceCopy link...`.
  // Watched 2026-09-27.
  const reference = stepNode?.reference ?? null;
  const copyText = (text: string, copied: string, failed: string) => {
    // The DOM type requires clipboard, but browsers omit it on insecure origins.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    // Proof: bypassing this guard made `renders and announces an unavailable
    // clipboard` fail with `Cannot read properties of undefined (reading
    // 'writeText')` instead of the rendered alert. Watched 2026-09-27.
    if (clipboard === undefined) {
      pushToast({ kind: 'error', text: failed });
      return;
    }
    void clipboard.writeText(text).then(
      () => {
        pushToast({ kind: 'info', text: copied });
      },
      () => {
        pushToast({ kind: 'error', text: failed });
      },
    );
  };
  const onActionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onExitActions();
      return;
    }
    if (event.key !== 'Tab') return;
    const parent = event.currentTarget.parentElement;
    if (parent === null) throw new Error('Step card action has no action group');
    const actions = [...parent.querySelectorAll('button')];
    const current = actions.indexOf(event.currentTarget);
    const next = current + (event.shiftKey ? -1 : 1);
    event.preventDefault();
    if (next < 0 || next >= actions.length) onExitActions();
    else actions[next]?.focus();
  };
  return (
    // Placed diagonally — past this cell and past this row — like every other
    // card a plan cell opens. {@link sidewaysPlacement} picks the side.
    <HoverCard id={id} takesPointer={stepNode !== null} onPointerArrives={onPointerArrives}>
      <div style={{ fontWeight: 600 }}>
        {stepName} for {number}
      </div>
      {stepNode !== null && (
        <div>
          <div>{reference === null ? 'Uncoded step' : `${reference} · ${stepName}`}</div>
          {reference !== null && (
            <button
              type="button"
              onKeyDown={onActionKeyDown}
              onClick={() => {
                copyText(
                  reference,
                  `Copied step reference ${reference}.`,
                  'Could not copy step reference.',
                );
              }}
            >
              Copy reference
            </button>
          )}
          <button
            type="button"
            onKeyDown={onActionKeyDown}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('project', projectId);
              url.searchParams.set('stepNode', stepNode.id);
              copyText(url.href, 'Copied step link.', 'Could not copy step link.');
            }}
          >
            Copy link
          </button>
        </div>
      )}
      {/*
        Said in words, not as `2/3/8`: the shorthand is what an estimator types
        into the cell, and a card is read by whoever is looking at the plan.
      */}
      <div>
        {estimated
          ? points.map((each) => `${each.point} ${each.days === '' ? '—' : each.days}`).join(' · ')
          : 'No estimate yet'}
      </div>
      {estimate !== undefined && allowancePercent !== 0 ? (
        <>
          <div>Base estimate {auditDays(combinedDays(estimate, rule))} days</div>
          <div>Allowance +{String(allowancePercent)}%</div>
          <div>
            Before rounding {auditDays(beforeRoundingDays(estimate, rule, allowancePercent))} days
          </div>
          <div>Charged {final} days</div>
        </>
      ) : (
        final !== '' && <div>Final {final} days</div>
      )}
      {doing !== null && (
        <div>
          {doing.name}
          {doing.assumed &&
            ' — assumed: they are the only person assigned, so they are taken to be doing this step too'}
        </div>
      )}
      {/*
        Task 7.2's assignee sentence, on the card because the folded cell has no
        `title` to put it in — the decision above `data-folded-assignee`, taken
        2026-08-09 when a native tooltip raced this card over the same pixels.
        The mark beside the initials is what says there is something to read;
        this is what it says.

        Muted and below the name, not `--destructive` like the complaint under
        it: a person outside the team is a fact about the plan, and the trio
        that saves nothing is the tool refusing to store what somebody typed.
        Colouring them alike would make one of the two a lie.
      */}
      {doing?.outside != null && (
        <div style={{ color: 'var(--muted-foreground)' }}>{doing.outside}</div>
      )}
      {/*
        Proof: this line deleted, four tests failed — `a folded step cannot
        hide a complaint`, `sends nothing for a trio that runs backwards, and
        says why`, `lets a box replace what the folded cell was holding`,
        `marks the folded cell when the boxes hold a trio that saves nothing`
        — each on the complaint missing from the card. And the fault the
        removal of the native `title` guards against: the `title` put back on
        the folded wrapper, `a folded step cannot hide a complaint` failed on
        `expected 'Fill all three…' to be null`. Both watched, 2026-08-09.
      */}
      {problem !== null && <div style={{ color: 'var(--destructive)' }}>{problem}</div>}
      {/*
        The typing help rides the same card so the cell has exactly one hint.
        Last and muted: whoever hovers is reading the plan first and an
        estimator second.
      */}
      <div style={{ color: 'var(--muted-foreground)' }}>{SHORTHAND_HELP}</div>
    </HoverCard>
  );
}
