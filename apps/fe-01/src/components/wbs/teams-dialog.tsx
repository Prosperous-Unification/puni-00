import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal';
import { capacityRefusalSentence, type TeamCapacityView, type TeamView } from '@/lib/wbs-api';

/** One team on the plan, and what the plan says about how many of them work at once. */
export interface TeamOnThePlan {
  id: string;
  name: string;
  /** `null` for **unstated**: this plan does not limit that team's work at all. */
  stated: number | null;
  /** How many rows draw from this team's pool — its own labels and everything inheriting them. */
  rows: number;
}

/**
 * The teams this plan's work is labelled with, and what each of them is stated at.
 *
 * **Effective labels**, so a team only an ancestor carries is here: its pool is
 * what the leaves below it spend, and a list of stored labels would leave "why did
 * this row move when somebody typed a number" with no answer anywhere on screen.
 * The reading is `effectiveTeamOf`'s, computed by the table and handed down —
 * never a second copy, which is the rule C1 put that function in `libs/domain`
 * for.
 *
 * Sorted by name, because a list that reshuffles between two reads reads as a
 * different answer.
 *
 * Proof: the caller's effective reading replaced by each row's stored
 * `serviceTeamId`, so the four rows arrive as four nulls, and `lists a team only
 * an ancestor carries` failed on `expected [] to deeply equal [ { id:
 * 't-backend', …(3) } ]` — a plan whose pool bounds four rows offering nowhere at
 * all to state the number. Watched 2026-08-13.
 *
 * Proof: `statedFor.get(team.id) ?? null` written as `?? team.size` — the
 * fallback to the retired global column, which is the one wrong answer this change
 * is most likely to be written with — and `never reads the team's retired global
 * size` failed on `expected 7 to be null`. Watched 2026-08-13.
 */
export function teamsOnThePlan(
  teams: readonly TeamView[],
  capacities: readonly TeamCapacityView[],
  /** Each row's **effective** team id, or null — one entry per row on the plan. */
  effective: readonly (string | null)[],
): TeamOnThePlan[] {
  const rowsPerTeam = new Map<string, number>();
  for (const teamId of effective) {
    if (teamId === null) continue;
    rowsPerTeam.set(teamId, (rowsPerTeam.get(teamId) ?? 0) + 1);
  }
  const statedFor = new Map(capacities.map((each) => [each.serviceTeamId, each.size]));
  return teams
    .filter((team) => rowsPerTeam.has(team.id))
    .map((team) => ({
      id: team.id,
      name: team.name,
      stated: statedFor.get(team.id) ?? null,
      rows: rowsPerTeam.get(team.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TeamsDialogProps {
  /** The teams this plan's work is labelled with, from {@link teamsOnThePlan}. */
  teams: readonly TeamOnThePlan[];
  /** States a number, or clears to unstated on `null`. Throws be-01's refusal code. */
  setCapacity: (teamId: string, size: number | null) => Promise<void>;
  /** Re-reads the plan, which is what moves the dates the new number produced. */
  onChanged: () => Promise<void>;
}

/**
 * How many of each team on this plan may be at work at once.
 *
 * **This is where C3's directory size box went.** C3 put it in the directory,
 * beside the team's name, and that was right for a global number: the directory is
 * the global page. Dany's call on 2026-08-13 made the number a **project's**, and
 * the directory page has no project — so a box there could only ever have meant
 * "the plan you last had open", which reads as global and is not. The full argument
 * is `capacity-per-project`'s design.md D5.
 *
 * `PhasesDialog` is the precedent one button along, and the shape is deliberately
 * its: a project's own list, edited from the plan's toolbar, on a surface whose
 * **trigger** lives in this component because Radix restores focus to the trigger
 * on close and to nothing at all without one.
 *
 * **Nothing here is optimistic.** Every write re-reads the plan through
 * `onChanged`, and a refused change leaves the box as it was with the refusal on
 * the surface — the same rule the table behind it keeps. Refusals are sentences on
 * this surface rather than toasts in the corner of a page this dialog is covering,
 * because every one of them is about the box somebody is typing in.
 */
export function TeamsDialog({ teams, setCapacity, onChanged }: TeamsDialogProps) {
  const [open, setOpen] = useState(false);
  /**
   * The numbers being typed over the plan's own, by team id.
   *
   * Only the ones somebody has touched: an absent entry means "as be-01 has it",
   * so a capacity a peer changed redraws rather than being held at whatever this
   * browser last read. An entry of `''` is a **real draft** — the emptied box —
   * which is why this cannot collapse to `?? ''` over one record.
   */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = (team: TeamOnThePlan): string =>
    team.id in typed ? (typed[team.id] ?? '') : team.stated === null ? '' : String(team.stated);

  const forget = (teamId: string): void => {
    setTyped((current) => {
      const { [teamId]: gone, ...rest } = current;
      void gone;
      return rest;
    });
  };

  /**
   * Sends the number typed over this plan's, if it says something different.
   *
   * **The number is not validated here.** `capacity-per-project` owns what a
   * capacity may be, at be-01's boundary, and a second copy of that rule in this
   * component is a rule free to disagree with it — so `0`, `-1`, `1.5` and `1001`
   * are all sent and answered on. C3's D6, one tier along, and the Prio column's
   * bargain before that.
   *
   * Two things this box does decide, because be-01 cannot see either:
   *
   * 1. **An empty box.** `Number('')` is `0`, which is a *refusal* — and a pool of
   *    0 slots is a plan of `Infinity` dates. An emptied box means _unstated_
   *    (`null`), which limits that team's work not at all.
   * 2. **A non-finite draft.** JSON has no literal for `NaN` or `Infinity`, so a
   *    typed `1e999` arrives as `null` — which here is the clear, so sending it
   *    would silently unlimit a team that was limited while looking to the reader
   *    like a refusal. Refused locally instead.
   *
   * Proof, both watched 2026-08-13 and injected separately. The empty-box arm
   * replaced by a bare `Number(draft)`: `an emptied box unlimits the team rather
   * than asking for nobody` failed on `expected "spy" to be called with arguments:
   * [ 't-backend', null ]` — it was called with `0`, which be-01 refuses and which
   * would be a plan of `Infinity` dates if it did not. The `Number.isFinite` arm
   * deleted: `refuses a number too big to send rather than unlimiting the team`
   * failed on `expected "spy" to not be called at all, but actually been called 1
   * times` — `1e999` on its way out as `{ size: null }`, unlimiting a limited team
   * with nothing on screen said about it.
   */
  function commit(team: TeamOnThePlan): void {
    const draft = shown(team).trim();
    if (draft === '' && team.stated === null) {
      forget(team.id);
      return;
    }
    const asNumber = draft === '' ? null : Number(draft);
    if (asNumber !== null && !Number.isFinite(asNumber)) {
      setProblem(capacityRefusalSentence('size_must_be_a_whole_number_from_1'));
      return;
    }
    if (asNumber === team.stated) {
      forget(team.id);
      return;
    }
    void attempt(team.id, asNumber);
  }

  async function attempt(teamId: string, size: number | null): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await setCapacity(teamId, size);
      forget(teamId);
      await onChanged();
    } catch (thrown: unknown) {
      // The draft is deliberately **kept** on a refusal: the number on screen is
      // what the reader typed and what the sentence beside it is about, and
      // resetting it to be-01's would leave a sentence explaining a value nobody
      // could see.
      setProblem(capacityRefusalSentence(thrown instanceof Error ? thrown.message : 'request_failed'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Escape over a **draft** abandons the draft; Escape anywhere else dismisses the
   * surface, which is Radix's own behaviour.
   *
   * The nested reading, and the only one that lets somebody undo a typo without
   * losing the panel they were working in. It has to be here, on Radix's
   * `onEscapeKeyDown`, and **not** on the box's `onKeyDown`: Radix's
   * `DismissableLayer` listens on `document`, so React's `stopPropagation` on a
   * synthetic event does not reach it and the surface closes anyway.
   *
   * `preventDefault` only when there is a draft to abandon — swallowing it
   * unconditionally would make Escape do nothing at all with the focus in a box,
   * which is a surface that cannot be dismissed from the only control it holds.
   *
   * Proof: written on the box's own `onKeyDown` with `event.stopPropagation()`,
   * and `Escape puts the box back to what the plan says` failed on `Unable to find
   * a label with the text of: How many of Backend at once` — the whole surface
   * gone where one draft should have been. That is `DismissableLayer` listening
   * past React, and it is why this is on Radix's prop. Watched 2026-08-13.
   */
  function onEscape(event: KeyboardEvent): void {
    const aimedAt = event.target;
    if (!(aimedAt instanceof HTMLElement)) return;
    const teamId = aimedAt.dataset['capacityTeam'];
    if (teamId === undefined || !(teamId in typed)) return;
    event.preventDefault();
    forget(teamId);
  }

  /** Opens and closes, and leaves nothing half-answered behind on the way out. */
  function onOpenChange(next: boolean): void {
    setOpen(next);
    if (next) return;
    setProblem(null);
    setTyped({});
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          title="Say how many of each team on this plan are at work at once"
        >
          Teams
        </Button>
      </ModalTrigger>
      <ModalContent onEscapeKeyDown={onEscape}>
        <ModalHeader>
          <ModalTitle>Teams on this plan</ModalTitle>
          <ModalDescription>
            How many of each team are at work at once, on this plan. Empty means this plan does not
            limit them. Every number is this plan’s own — another plan sharing a team is not
            affected.
          </ModalDescription>
        </ModalHeader>

        {problem !== null && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}

        {teams.length === 0 ? (
          /*
            Said out loud rather than left as an empty panel, which reads as a
            list that failed to load. A plan with no team labels has nothing to
            limit, and the sentence names the thing to do about it.
          */
          <p className="text-muted-foreground text-sm">
            No work on this plan is labelled with a team yet. Label a row in its Service/team column
            and it will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={team.name}>
                  {team.name}
                </span>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {team.rows} {team.rows === 1 ? 'row' : 'rows'}
                </span>
                <Input
                  className="h-8 w-16 shrink-0 text-right"
                  aria-label={`How many of ${team.name} at once`}
                  // Which team's box the Escape above landed on. A `data-`
                  // attribute rather than a ref per row: the handler is Radix's
                  // and is handed the DOM node, not a React key.
                  data-capacity-team={team.id}
                  inputMode="numeric"
                  placeholder="—"
                  title={
                    team.stated === null
                      ? `This plan does not limit how many of ${team.name} work at once. Type a number to limit it.`
                      : `At most ${String(team.stated)} of ${team.name} are at work at once on this plan.`
                  }
                  value={shown(team)}
                  disabled={busy}
                  onChange={(event) => {
                    const draft = event.currentTarget.value;
                    setTyped((current) => ({ ...current, [team.id]: draft }));
                  }}
                  onBlur={() => {
                    commit(team);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    commit(team);
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        <ModalFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
