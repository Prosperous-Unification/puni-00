import { type ReactNode, type SubmitEvent, useEffect, useRef, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';
import { CreatablePicker } from '@/components/wbs/creatable-picker';
import {
  type DirectoryEffect,
  directoryRefusalSentence,
  type DirectoryUsage,
  isPersonKind,
  type PersonKindView,
  type PersonView,
  type ServiceView,
  type TeamView,
} from '@/lib/wbs-api';
import type { DirectoryKind, DirectoryManagement } from '@/modules/directory-management/contract';
import { useDirectoryManagement } from '@/modules/directory-management/view/use-directory-management';

export interface DirectoryPageProps {
  /** The signed-in session's directory, from router context. */
  directory: DirectoryManagement;
  /** The two-page navigation, from router context. */
  nav?: ReactNode;
  /** The account menu, from router context. */
  account?: ReactNode;
}

export type { DirectoryKind };

/** A removal be-01 refused, and the decision the reader has not made yet. */
interface Confirming {
  kind: DirectoryKind;
  id: string;
  name: string;
  usage: DirectoryUsage;
}

/**
 * The **assumed assignee**'s name, or the word `null` stands for.
 *
 * `unassigned` is printed rather than left as a blank, because a removal that
 * takes a work item's sole assignee is exactly the thing somebody confirming
 * needs told — an absence in the sentence would read as "no change".
 */
const assumedName = (name: string | null): string => name ?? 'unassigned';

/**
 * Where one effect is being printed: the row it is listed under, and how to
 * name another row of the same confirmation.
 *
 * `capacity_released` is the arm that needs it. The payload names the row whose
 * label puts this one on the pool, and where that is an ancestor the sentence
 * has to say so — a bare "no longer limited to 4 at a time" on a row carrying
 * no label reads as a claim about a write that will not happen there.
 */
export interface EffectContext {
  /** The work item this effect is listed under. */
  workItemId: string;
  /**
   * Which vocabulary the entry being removed belongs to.
   *
   * `label_removed` is the arm that needs it, and it needs it because be-01
   * emits that **one** kind for two dimensions: a tag's labelling row and,
   * since task 10.2, a service's. The payload carries no discriminator — the
   * kind says what happened to the labelling row, not which vocabulary it was —
   * so the confirmation reads it off the removal the reader actually asked for.
   *
   * Without this, removing a service confirmed with a sentence about tags.
   */
  removing: DirectoryKind;
  /**
   * `010 Backend` for a row id, or null where the confirmation does not list
   * it.
   *
   * Null is reachable and modeled rather than thrown on: the usage payload
   * lists the rows a removal *touches*, and a labelled ancestor whose own
   * effects are empty need not be among them.
   */
  rowNamed: (id: string) => string | null;
}

/**
 * What one effect of a removal does, in the words of somebody reading a plan.
 *
 * Built from the payload's own `kind` and nothing else: be-01 names each arm
 * **and what that arm does** precisely so this page never has to derive an
 * impact from a count.
 */
export function effectSentence(effect: DirectoryEffect, on: EffectContext): string {
  switch (effect.kind) {
    case 'assignment_dropped':
      return `The ${effect.step.name} assignment goes.`;
    case 'label_nulled':
      return 'The team label is cleared.';
    case 'label_removed':
      // Its own sentence and not the team's, because nothing is *cleared*:
      // neither dimension has a column to null, so what goes is the labelling
      // row itself. And it says what these two removals cannot do — no dates
      // move — because the sentence beside it for a team says they may, and a
      // reader comparing the two confirmations is entitled to the difference.
      //
      // Named off `removing` rather than off the effect: `label_removed` is
      // what be-01 sends for a tag **and** for a service, and a confirmation
      // that answered "the tag comes off this item" to somebody removing
      // `Payments` would be naming a dimension they never touched.
      return `The ${on.removing === 'service' ? 'service' : 'tag'} comes off this item. No dates move.`;
    case 'capacity_released':
      // Two sentences from one arm, and the split is `fromId` against the row
      // it is listed under — be-01's own way of saying "inherited" without a
      // second flag beside it. A row that inherits the label loses a bound it
      // never carried, and a confirmation saying "the label is cleared" about
      // it would be describing a write that never happens there.
      return effect.fromId === on.workItemId
        ? `No longer limited to ${String(effect.size)} at a time. Dates may move earlier.`
        : `No longer limited to ${String(effect.size)} at a time — the limit it inherits from ${
            on.rowNamed(effect.fromId) ?? 'a row above it'
          }. Dates may move earlier.`;
    case 'assumed_assignee_changed':
      return `Assumed to be doing all of it: ${assumedName(effect.assumedNow)} now, ${assumedName(
        effect.assumedAfter,
      )} afterwards.`;
  }
}

/** How many of a thing, named singly or plurally — `1 member`, `2 members`. */
const count = (howMany: number, thing: string): string =>
  `${String(howMany)} ${thing}${howMany === 1 ? '' : 's'}`;

/**
 * Every control a thumb has to hit is 44px in both dimensions, which the phone
 * spec asserts **as rendered** rather than assumes.
 *
 * `h-11` is 2.75rem, which is 44 at the root font size this app never changes.
 * The picker's own `<input>` carries no class of its own — it is a shared
 * component the table renders too, and the change proposal rules a change to it
 * out — so the height is reached through a descendant variant on the box around
 * it. `e2e/directory.spec.ts` measures the boxes; nothing here is trusted.
 */
const TAP = 'h-11';
const TAP_SQUARE = 'h-11 w-11 shrink-0 p-0';
const TAP_PICKER = '[&_input]:h-11 [&_input]:rounded-md [&_input]:border [&_input]:px-2';

/**
 * The directory: every person, team, tag and service on this deployment.
 *
 * It renders its own {@link AppHeader}, which is the contract
 * `openspec/changes/directory-page/` pins — the account and the navigation come
 * from router context, and the project controls stay in `ProjectPage`, which
 * owns the picker's list, its selection and the rename in progress. A header
 * drawn once above both routes would have to reach back into the project page
 * for state it does not hold, and the two pages disagree about what the bar
 * carries.
 *
 * **No socket.** This page opens no subscription of its own: it re-reads on
 * arrival, after each of its own writes, and when the window is focused or the
 * tab becomes visible again. A change somebody else makes while it sits open
 * and focused is therefore seen on the next of those rather than the moment it
 * happens — a stated cost. `directory_changed` reaching open projects is
 * `directory-crud`'s job and not this page's.
 *
 * **Nothing here is optimistic.** Every write re-reads and both panels redraw
 * from what came back, so a refused change leaves the screen as it was with the
 * refusal on it.
 */
export function DirectoryPage({ directory: management, nav, account }: DirectoryPageProps) {
  const shown = useDirectoryManagement(management);
  const { people, teams, tags, services, workItemTypes, busy, problem } = shown;

  const [newTag, setNewTag] = useState('');
  const [newWorkItemType, setNewWorkItemType] = useState('');
  const [newService, setNewService] = useState('');
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [newPerson, setNewPerson] = useState('');
  const [newTeam, setNewTeam] = useState('');
  /**
   * The names being typed over the directory's own, by entry id.
   *
   * Only the ones somebody has touched: an entry absent from here reads as
   * be-01 has it, so a person renamed elsewhere redraws rather than being held
   * at the name this browser last read.
   */
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  /**
   * The chip to put the focus on once the panels have redrawn, or null.
   *
   * A ref rather than state: it is read once, in the effect that watches the
   * redraw, and a re-render of its own would be a second one for every keyboard
   * removal.
   */
  const focusChipAfterRedraw = useRef<string | null>(null);
  const chipNodes = useRef(new Map<string, HTMLButtonElement>());
  const chipKey = (personId: string, teamId: string): string => `${personId}:${teamId}`;

  /**
   * Coming back to the page, by either of the two ways a browser reports it.
   *
   * Both, because they are not the same event: `focus` fires for a window
   * brought forward, and `visibilitychange` for a tab switched back to inside a
   * window that never lost focus. A page that sat open all afternoon would
   * otherwise still be showing the morning's directory, which is the whole
   * reason arrival alone was not enough.
   */
  useEffect(() => {
    const again = () => {
      void management.read().catch(management.reportFailedRead);
    };
    const whenVisible = () => {
      if (document.visibilityState === 'visible') again();
    };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [management]);

  /**
   * Puts the focus on the chip a keyboard removal left, once the panels have
   * redrawn **and** the controls are live again.
   *
   * `busy` is a dependency rather than noise: the redraw lands one render
   * before the write finishes, and every chip is `disabled` until it does — and
   * `focus()` on a disabled button does nothing at all, silently. Watched: with
   * `[people]` alone, `are removable from the keyboard, and the focus lands on
   * the neighbour` failed with the focus on `<body>`.
   */
  useEffect(() => {
    const wanted = focusChipAfterRedraw.current;
    if (wanted === null || busy) return;
    focusChipAfterRedraw.current = null;
    const node = chipNodes.current.get(wanted);
    // A neighbour that is no longer on screen means the redraw disagreed with
    // what was on it a moment ago — somebody else edited this person. That is a
    // state rather than a fault, and moving the focus somewhere arbitrary would
    // be worse than leaving it where the browser put it.
    if (node !== undefined) node.focus();
  }, [people, busy]);

  const withoutDraft = (current: Record<string, string>, id: string): Record<string, string> =>
    Object.fromEntries(Object.entries(current).filter(([at]) => at !== id));

  /**
   * Drops the entry's name draft — what a **commit** leaves behind, and what
   * **Escape** means.
   *
   * Dropping it is deliberate rather than tidiness: a write refetches the whole
   * directory, so a draft left standing over a value that has just come back
   * would hold the box at what this browser typed and hide what be-01 answered.
   *
   * One function, because since `capacity-per-project` the name is the only
   * draft this page holds: the size box that made this two — `forgetDraft` for a
   * commit and `forgetNameDraft` for Escape, identical by then — moved to the
   * plan's own `TeamsPanel` with the number it edits.
   */
  const forgetDraft = (id: string) => {
    setRenamed((current) => withoutDraft(current, id));
  };

  const nameShown = (entry: { id: string; name: string }): string =>
    renamed[entry.id] ?? entry.name;

  function commitRename(kind: DirectoryKind, entry: { id: string; name: string }): void {
    const outcome = management.renameEntry(kind, entry, nameShown(entry), () => {
      forgetDraft(entry.id);
    });
    if (outcome === 'unchanged') forgetDraft(entry.id);
  }

  /*
    `sizeShown` and `commitSize` lived here, with C3's whole argument about what
    an empty box and a non-finite draft mean. They are in
    `components/wbs/teams-panel.tsx` now, because the number is one plan's rather
    than the deployment's — `capacity-per-project`, Dany 2026-08-13, design.md D5.
    The two local decisions and both of their watched negatives moved with them.
  */

  function commitKind(person: PersonView, kind: PersonKindView): void {
    management.chooseKind(person, kind);
  }

  function setMemberships(person: PersonView, teamIds: readonly string[]): void {
    management.setMemberships(person, teamIds);
  }

  /** The teams a person is in, in be-01's own order rather than the order they joined. */
  const teamsOf = (person: PersonView): TeamView[] =>
    teams.filter((team) => person.teamIds.includes(team.id));

  /**
   * The chip the focus should land on once `teamId`'s has gone: the next one,
   * or the one before it when the last chip is the one leaving.
   */
  function neighbourChip(person: PersonView, teamId: string): string | null {
    const held = teamsOf(person);
    const at = held.findIndex((team) => team.id === teamId);
    // Written out rather than `held.at(at + 1) ?? held.at(at - 1)`, which from
    // the **first** chip answers the last one — and from a person with one
    // membership answers the chip that is leaving.
    if (at === -1) return null;
    if (at + 1 < held.length) return chipKey(person.id, held[at + 1]?.id ?? '');
    if (at > 0) return chipKey(person.id, held[at - 1]?.id ?? '');
    return null;
  }

  function removeMembership(person: PersonView, teamId: string): void {
    setMemberships(
      person,
      person.teamIds.filter((held) => held !== teamId),
    );
  }

  function submitNewPerson(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    management.addPerson(newPerson, () => {
      setNewPerson('');
    });
  }

  function submitNewTeam(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    management.addTeam(newTeam, () => {
      setNewTeam('');
    });
  }

  function submitNewTag(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    management.addTag(newTag, () => {
      setNewTag('');
    });
  }

  function submitNewWorkItemType(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    management.addWorkItemType(newWorkItemType, () => {
      setNewWorkItemType('');
    });
  }

  function submitNewService(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    management.addService(newService, () => {
      setNewService('');
    });
  }

  function askToRemove(kind: DirectoryKind, entry: { id: string; name: string }): void {
    management.askToRemove(kind, entry, (usage) => {
      setConfirming({ kind, id: entry.id, name: entry.name, usage });
    });
  }

  function confirmRemoval(): void {
    if (confirming === null) return;
    const asked = confirming;
    management.confirmRemoval(asked.kind, asked.id, () => {
      setConfirming(null);
    });
  }

  function setOwnedServices(team: TeamView, serviceIds: readonly string[]): void {
    management.setOwnedServices(team, serviceIds);
  }

  /**
   * The services a team owns, in the **directory's** order rather than the
   * order somebody claimed them — {@link teamsOf}'s rule, so two teams owning
   * the same pair list them the same way round.
   */
  const servicesOf = (team: TeamView): ServiceView[] =>
    services.filter((service) => (team.serviceIds ?? []).includes(service.id));

  const membersOf = (team: TeamView): number =>
    people.filter((person) => person.teamIds.includes(team.id)).length;

  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <h2 className="sr-only">Directory</h2>
        {problem !== null && (
          <p role="alert" className="text-destructive text-sm">
            {directoryRefusalSentence(problem)}
          </p>
        )}
        {/*
          One column below 768px and two at and above it. `md` is Tailwind's 768
          — the same number `app-header.tsx` stops wrapping at and
          `plan-renderer.ts` swaps the renderer at, deliberately the same one.
        */}
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {people.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nobody is in the directory yet. Add the first person below.
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {people.map((person) => (
                    <li key={person.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          className={`${TAP} min-w-0 flex-1`}
                          aria-label={`Name of ${person.name}`}
                          value={nameShown(person)}
                          disabled={busy}
                          onChange={(event) => {
                            const typed = event.currentTarget.value;
                            setRenamed((current) => ({ ...current, [person.id]: typed }));
                          }}
                          onBlur={() => {
                            commitRename('person', person);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitRename('person', person);
                            }
                            if (event.key === 'Escape') forgetDraft(person.id);
                          }}
                        />
                        {/*
                          A `<select>` and not a pair of buttons or a switch:
                          the two arms are a classification with no default
                          reading — an agent is not "a person, on" — and the
                          `Plan with` control one screen over already spells
                          this gesture out for a closed set.

                          Its own control rather than a column on the row,
                          because `kind` is directory data about a person and
                          not a label on anybody's work: it travels with them
                          into every plan, exactly as their teams do.
                        */}
                        <select
                          className="border-input bg-background h-11 shrink-0 rounded-md border px-2 text-sm"
                          aria-label={`Kind of ${person.name}`}
                          value={person.kind}
                          disabled={busy}
                          onChange={(event) => {
                            const chosen = event.currentTarget.value;
                            // The narrowing is the only thing between this page
                            // and a 400: be-01 takes `kind` as a `string` so
                            // that `invalid_kind` is reachable through the API,
                            // which means an unnarrowed value would be sent and
                            // refused rather than refused here.
                            if (isPersonKind(chosen)) commitKind(person, chosen);
                          }}
                        >
                          <option value="person">Person</option>
                          <option value="agent">Agent</option>
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          className={TAP_SQUARE}
                          aria-label={`Remove ${person.name}`}
                          disabled={busy}
                          onClick={() => {
                            askToRemove('person', person);
                          }}
                        >
                          <span aria-hidden="true">✕</span>
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {teamsOf(person).map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            data-chip={chipKey(person.id, team.id)}
                            ref={(node) => {
                              const key = chipKey(person.id, team.id);
                              if (node === null) chipNodes.current.delete(key);
                              else chipNodes.current.set(key, node);
                            }}
                            aria-label={`Remove ${team.name} from ${person.name}`}
                            className="border-input bg-background hover:bg-accent inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm"
                            disabled={busy}
                            onClick={() => {
                              removeMembership(person, team.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Delete' && event.key !== 'Backspace') return;
                              // Taken from the browser as well as from the
                              // page: Backspace on a page with nothing focused
                              // is a "back" on some browsers, and a chip is
                              // very much focused here.
                              event.preventDefault();
                              focusChipAfterRedraw.current = neighbourChip(person, team.id);
                              removeMembership(person, team.id);
                            }}
                          >
                            {team.name}
                            <span aria-hidden="true">✕</span>
                          </button>
                        ))}
                        <span className={`inline-flex min-w-40 flex-1 ${TAP_PICKER}`}>
                          <CreatablePicker
                            label={`Add a team for ${person.name}`}
                            // Only what they are **not** already in. Offering a
                            // team they hold is how a duplicate membership is
                            // sent, and be-01 would take it.
                            entries={teams.filter((team) => !person.teamIds.includes(team.id))}
                            // Single-select, held at null on purpose: this
                            // picker is being used as what it is — one choose
                            // adds one membership, and the chips are the set.
                            value={null}
                            placeholder="Add a team…"
                            onChoose={(teamId) => {
                              setMemberships(person, [...person.teamIds, teamId]);
                            }}
                            onCreate={(name) => {
                              management.addTeamForPerson(person, name);
                            }}
                            onClear={() => {
                              // Unreachable: the ✕ is drawn only for a chosen
                              // entry and this picker holds none. The chips are
                              // what clears a membership.
                            }}
                          />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex items-center gap-2" onSubmit={submitNewPerson}>
                <Input
                  className={`${TAP} min-w-0 flex-1`}
                  aria-label="New person"
                  placeholder="Name"
                  value={newPerson}
                  disabled={busy}
                  onChange={(event) => {
                    setNewPerson(event.currentTarget.value);
                  }}
                />
                <Button type="submit" className={TAP} disabled={busy}>
                  Add person
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No teams yet. Add the first one below.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {teams.map((team) => (
                    <li key={team.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          className={`${TAP} min-w-0 flex-1`}
                          aria-label={`Name of ${team.name}`}
                          value={nameShown(team)}
                          disabled={busy}
                          onChange={(event) => {
                            const typed = event.currentTarget.value;
                            setRenamed((current) => ({ ...current, [team.id]: typed }));
                          }}
                          onBlur={() => {
                            commitRename('team', team);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitRename('team', team);
                            }
                            if (event.key === 'Escape') forgetDraft(team.id);
                          }}
                        />
                        {/*
                        No size box. How many of a team are at work at once is a
                        fact about one **plan** since `capacity-per-project`
                        (Dany, 2026-08-13: "The global number should not matter,
                        only per project capacity configuration matters"), and
                        this page has no plan — a box here could only have meant
                        "the plan you last had open", which reads as global and is
                        not. It is the `Teams` dialog in the plan's own toolbar.

                        Removed rather than disabled or left showing a number from
                        somewhere: a control that writes a value no schedule reads
                        is worse than no control at all. design.md D4 and D5.
                      */}
                        <span className="text-muted-foreground shrink-0 text-sm">
                          {count(membersOf(team), 'member')}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className={TAP_SQUARE}
                          aria-label={`Remove ${team.name}`}
                          disabled={busy}
                          onClick={() => {
                            askToRemove('team', team);
                          }}
                        >
                          <span aria-hidden="true">✕</span>
                        </Button>
                      </div>
                      {/*
                        **The ownership map, and the team row is where it is
                        edited** — Dany, 2026-08-20 23:18: "one team can be
                        responsible for several services - it must be
                        configurable in the directory."

                        On the team row rather than on the Services card,
                        because a list of teams drawn under a service would read
                        as a property of the service — and a service that
                        "has" teams is one step from a service that schedules
                        them, which decision 2 rules out.

                        The person row's membership chips, reused as they stand:
                        one picker adds one claim, the chips are the set, and
                        the ✕ takes one off. What it deliberately does **not**
                        carry is the person row's Delete/Backspace focus walk —
                        see the code below.
                      */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground shrink-0 text-sm">
                          Responsible for
                        </span>
                        {servicesOf(team).map((service) => (
                          <button
                            key={service.id}
                            type="button"
                            aria-label={`${team.name} no longer owns ${service.name}`}
                            className="border-input bg-background hover:bg-accent inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm"
                            disabled={busy}
                            onClick={() => {
                              setOwnedServices(
                                team,
                                (team.serviceIds ?? []).filter((held) => held !== service.id),
                              );
                            }}
                          >
                            {service.name}
                            <span aria-hidden="true">✕</span>
                          </button>
                        ))}
                        {/*
                          **No Delete/Backspace focus walk here**, stated rather
                          than forgotten. Each chip is a button, so a keyboard
                          removes one with Enter or Space; what is missing is
                          the person row's move-to-the-neighbour afterwards,
                          which needs `neighbourChip` and it is written against
                          a person's own membership list. A second copy for a
                          second dimension is the thing tasks 7.4 and 7.5 have
                          twice folded rather than duplicated, and generalising
                          it is its own change.
                        */}
                        <span className={`inline-flex min-w-40 flex-1 ${TAP_PICKER}`}>
                          <CreatablePicker
                            label={`Make ${team.name} responsible for a service`}
                            // Only what it does **not** already own: offering a
                            // service it holds is how a duplicate claim is sent.
                            entries={services.filter(
                              (service) => !(team.serviceIds ?? []).includes(service.id),
                            )}
                            value={null}
                            placeholder="Add a service…"
                            onChoose={(serviceId) => {
                              setOwnedServices(team, [...(team.serviceIds ?? []), serviceId]);
                            }}
                            onCreate={(name) => {
                              management.addServiceForTeam(team, name);
                            }}
                            onClear={() => {
                              // Unreachable, `Add a team for …`'s reason: the ✕
                              // is drawn for a chosen entry and this picker
                              // holds none. The chips are what clears a claim.
                            }}
                          />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex items-center gap-2" onSubmit={submitNewTeam}>
                <Input
                  className={`${TAP} min-w-0 flex-1`}
                  aria-label="New team"
                  placeholder="Name"
                  value={newTeam}
                  disabled={busy}
                  onChange={(event) => {
                    setNewTeam(event.currentTarget.value);
                  }}
                />
                <Button type="submit" className={TAP} disabled={busy}>
                  Add team
                </Button>
              </form>
            </CardContent>
          </Card>

          {/*
            Tags: a **sibling** section beside Service teams rather than a second
            tab of it, and what makes that the right shape is what is missing
            from every row below.

            **No capacity column and no membership chips.** A team row carries a
            member count because people belong to teams and a removal takes those
            memberships with it; nobody belongs to a tag. A team's *size* is a
            fact about one plan and lives in that plan's own dialog; a tag has no
            size anywhere, in this page or in the schema, and never had one.

            That visible absence is the model rule taught rather than stated: a
            reader who notices this section has one fewer column than the one
            above it has learned that a tag says what kind of thing the work is
            and nothing about who does it or how fast.
          */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {tags.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No tags yet. Add the first one below — the plan&rsquo;s Tags column appears once
                  one exists.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {tags.map((tag) => (
                    <li key={tag.id} className="flex items-center gap-2">
                      <Input
                        className={`${TAP} min-w-0 flex-1`}
                        aria-label={`Name of ${tag.name}`}
                        value={nameShown(tag)}
                        disabled={busy}
                        onChange={(event) => {
                          const typed = event.currentTarget.value;
                          setRenamed((current) => ({ ...current, [tag.id]: typed }));
                        }}
                        onBlur={() => {
                          commitRename('tag', tag);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename('tag', tag);
                          }
                          if (event.key === 'Escape') forgetDraft(tag.id);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className={TAP_SQUARE}
                        aria-label={`Remove ${tag.name}`}
                        disabled={busy}
                        onClick={() => {
                          askToRemove('tag', tag);
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex items-center gap-2" onSubmit={submitNewTag}>
                <Input
                  className={`${TAP} min-w-0 flex-1`}
                  aria-label="New tag"
                  placeholder="Name"
                  value={newTag}
                  disabled={busy}
                  onChange={(event) => {
                    setNewTag(event.currentTarget.value);
                  }}
                />
                <Button type="submit" className={TAP} disabled={busy}>
                  Add tag
                </Button>
              </form>
            </CardContent>
          </Card>

          {/*
            Work item types: the fourth sibling, and it has the Tags card's
            shape for the Tags card's reasons — no capacity column, no
            membership chips, because nothing about a type is ever spent and
            nobody belongs to one.

            **The empty-state sentence is the one line that differs from the
            Tags card's, and it differs because the column does.** Tags say
            "the plan's Tags column appears once one exists"; the Types column
            is hidden by default and appears from `Columns`, never on its own.
            A card that borrowed the tag sentence would promise a column that
            never arrives.
          */}
          <Card>
            <CardHeader>
              <CardTitle>Work item types</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {workItemTypes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No types yet. Add one below, or name one in a plan&rsquo;s Types cell — turn the
                  column on from <strong>Columns</strong> to see it.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {workItemTypes.map((workItemType) => (
                    <li key={workItemType.id} className="flex items-center gap-2">
                      <Input
                        className={`${TAP} min-w-0 flex-1`}
                        aria-label={`Name of ${workItemType.name}`}
                        value={nameShown(workItemType)}
                        disabled={busy}
                        onChange={(event) => {
                          const typed = event.currentTarget.value;
                          setRenamed((current) => ({ ...current, [workItemType.id]: typed }));
                        }}
                        onBlur={() => {
                          commitRename('type', workItemType);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename('type', workItemType);
                          }
                          if (event.key === 'Escape') forgetDraft(workItemType.id);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className={TAP_SQUARE}
                        aria-label={`Remove ${workItemType.name}`}
                        disabled={busy}
                        onClick={() => {
                          askToRemove('type', workItemType);
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex items-center gap-2" onSubmit={submitNewWorkItemType}>
                <Input
                  className={`${TAP} min-w-0 flex-1`}
                  aria-label="New work item type"
                  placeholder="Name"
                  value={newWorkItemType}
                  disabled={busy}
                  onChange={(event) => {
                    setNewWorkItemType(event.currentTarget.value);
                  }}
                />
                <Button type="submit" className={TAP} disabled={busy}>
                  Add type
                </Button>
              </form>
            </CardContent>
          </Card>

          {/*
            Services: the third sibling, and it has the Tags card's shape for
            the Tags card's reason — **no capacity column and no membership
            chips**.

            The absence is a different one again, and it is the point of putting
            this card here rather than inside the Service teams card above.
            Nobody belongs to a service and a service is not a pool: it is what
            the work is *part of*, and who has the people is still a team. A
            reader who sees two columns here and three above has been taught
            Dany's 2026-08-20 23:16 ruling — service and team are independent —
            by the screen rather than by a sentence.

            Which services a team is **responsible for** is the one place the
            two meet, and it is edited on the team row above (task 7.5's second
            half), not here: an ownership map drawn on this card would read as a
            property of the service.
          */}
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
              {services.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No services yet. Add the first one below — the plan&rsquo;s Services column
                  appears once one exists.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {services.map((service) => (
                    <li key={service.id} className="flex items-center gap-2">
                      <Input
                        className={`${TAP} min-w-0 flex-1`}
                        aria-label={`Name of ${service.name}`}
                        value={nameShown(service)}
                        disabled={busy}
                        onChange={(event) => {
                          const typed = event.currentTarget.value;
                          setRenamed((current) => ({ ...current, [service.id]: typed }));
                        }}
                        onBlur={() => {
                          commitRename('service', service);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commitRename('service', service);
                          }
                          if (event.key === 'Escape') forgetDraft(service.id);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className={TAP_SQUARE}
                        aria-label={`Remove ${service.name}`}
                        disabled={busy}
                        onClick={() => {
                          askToRemove('service', service);
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="flex items-center gap-2" onSubmit={submitNewService}>
                <Input
                  className={`${TAP} min-w-0 flex-1`}
                  aria-label="New service"
                  placeholder="Name"
                  value={newService}
                  disabled={busy}
                  onChange={(event) => {
                    setNewService(event.currentTarget.value);
                  }}
                />
                <Button type="submit" className={TAP} disabled={busy}>
                  Add service
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      {/*
        Closing drops the confirmation rather than remembering it: the next
        removal asks again without a cascade, because a dialog somebody walked
        away from is not one they agreed to.
      */}
      <Modal
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
      >
        {confirming !== null && (
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Remove {confirming.name}?</ModalTitle>
              <ModalDescription>
                This is what would go with {confirming.name}. Nothing has been removed yet.
              </ModalDescription>
            </ModalHeader>
            {/*
              Scrolls inside itself. A usage naming forty work items would
              otherwise push the two buttons off the bottom of the surface, and
              a confirmation whose confirm cannot be reached is a dead end.
            */}
            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto text-sm">
              {confirming.usage.projects.map((project) => (
                <div key={project.id} className="flex flex-col gap-1">
                  <h3 className="font-semibold">{project.name}</h3>
                  <ul className="flex flex-col gap-1">
                    {project.workItems.map((workItem) => (
                      <li key={workItem.id}>
                        <span className="font-medium">
                          {workItem.number} {workItem.name}
                        </span>
                        <ul className="text-muted-foreground pl-4">
                          {workItem.effects.map((effect) => (
                            <li key={`${workItem.id}:${effect.kind}`}>
                              {effectSentence(effect, {
                                workItemId: workItem.id,
                                // The dimension the reader asked to remove.
                                // `label_removed` arrives for a tag and for a
                                // service alike and says which of the two
                                // nowhere, so the sentence takes it from here.
                                removing: confirming.kind,
                                // Named out of the **same project**, which is
                                // the only list a row id in this payload can
                                // mean: two projects may each hold a row
                                // numbered `010`, and resolving across all of
                                // them would name the wrong one.
                                rowNamed: (id) => {
                                  const named = project.workItems.find((each) => each.id === id);
                                  return named === undefined
                                    ? null
                                    : `${named.number} ${named.name}`;
                                },
                              })}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {confirming.usage.members.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">These people would lose a membership</h3>
                  <ul className="text-muted-foreground">
                    {confirming.usage.members.map((member) => (
                      <li key={member.id}>{member.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <ModalFooter>
              <Button
                type="button"
                variant="outline"
                className={TAP}
                disabled={busy}
                onClick={() => {
                  setConfirming(null);
                }}
              >
                Keep {confirming.name}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className={TAP}
                disabled={busy}
                onClick={confirmRemoval}
              >
                Remove {confirming.name} and all of that
              </Button>
            </ModalFooter>
          </ModalContent>
        )}
      </Modal>
    </>
  );
}
