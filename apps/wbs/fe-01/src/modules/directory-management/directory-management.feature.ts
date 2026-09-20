import type { DirectoryWrite } from '@/lib/wbs-api';
import type { DirectoryResource } from '@/modules/directory/contract';

import type { DirectoryManagement, NameWrite } from './contract';

/** Builds the gestures over one directory. */
export function createDirectoryManagement(directory: DirectoryResource): DirectoryManagement {
  const nameRequired = (): void => {
    directory.refuse({ reason: 'refused', code: 'name_required' });
  };

  /**
   * Reports a `taken` name, the one refusal a directory write answers with words
   * rather than a throw — and it carries the **surviving** name, so a sentence
   * built from what was typed would read the wrong one back.
   */
  const sayTaken = (written: DirectoryWrite<unknown>): void => {
    if (!written.ok) {
      directory.refuse({ reason: 'taken', survivingName: written.survivingName });
    }
  };

  /**
   * The shape all five adds share: trim, refuse an empty name without a round
   * trip, otherwise send and tell the caller once it has answered.
   */
  const add = (
    typedName: string,
    make: (clean: string) => Promise<unknown>,
    whenAdded: () => void,
  ): NameWrite => {
    const clean = typedName.trim();
    // Proof: removing this guard made `an empty add is refused without a
    // request and keeps its box` fail with expected `sent` to be `empty`.
    // Watched 2026-09-20.
    if (clean === '') {
      nameRequired();
      return 'empty';
    }
    void directory.runWrite(async () => {
      await make(clean);
      whenAdded();
    });
    return 'sent';
  };

  return {
    subscribe: directory.subscribe,
    snapshot: directory.snapshot,
    read: directory.read,
    reportFailedRead: directory.reportFailedRead,
    replaceClient: directory.replaceClient,
    settled: directory.settled,

    renameEntry: (kind, entry, typedName, whenSent) => {
      const clean = typedName.trim();
      /**
       * Proof: this guard removed, `sends nothing when the name is whitespace
       * alone, and says so` failed on `Unable to find role="alert"`, with
       * `patchPerson` having been called `{ name: '' }`. Watched 2026-08-09.
       */
      // Proof: removing this guard made `a name of whitespace alone is never
      // sent, and says so` fail with expected `sent` to be `empty`. Watched
      // 2026-09-20.
      if (clean === '') {
        nameRequired();
        return 'empty';
      }
      if (clean === entry.name) return 'unchanged';
      void directory.runWrite(async () => {
        const written = await directory.renameEntry(kind, entry.id, clean);
        // Here and not after the refetch: this is where the page dropped the
        // name draft, and a draft left standing over a value that has just come
        // back would hold the box at what this browser typed.
        // Proof: moving this callback after an awaited read made `a rename is
        // trimmed, sent, and its caller told before the refetch` fail with
        // expected `0` to be `1` at `atRefetch`. Watched 2026-09-20.
        whenSent();
        sayTaken(written);
      });
      return 'sent';
    },

    addPerson: (typedName, whenAdded) => add(typedName, directory.createPerson, whenAdded),
    addTeam: (typedName, whenAdded) => add(typedName, directory.createTeam, whenAdded),
    addTag: (typedName, whenAdded) => add(typedName, directory.createTag, whenAdded),
    addService: (typedName, whenAdded) => add(typedName, directory.createService, whenAdded),
    addWorkItemType: (typedName, whenAdded) =>
      add(typedName, directory.createWorkItemType, whenAdded),

    chooseKind: (person, kind) => {
      if (kind === person.kind) return;
      void directory.runWrite(async () => {
        sayTaken(await directory.setPersonKind(person.id, kind));
      });
    },
    setMemberships: (person, teamIds) => {
      void directory.runWrite(async () => {
        sayTaken(await directory.setPersonTeams(person.id, teamIds));
      });
    },
    setOwnedServices: (team, serviceIds) => {
      void directory.runWrite(async () => {
        sayTaken(await directory.setTeamServices(team.id, serviceIds));
      });
    },

    addTeamForPerson: (person, name) => {
      void directory.runWrite(async () => {
        // Proof: patching before this create made `making a team for somebody
        // creates before it patches` fail with expected `[ 'patchPerson:p1' ]`
        // to equal `[]`. Watched 2026-09-20.
        const team = await directory.createTeam(name);
        sayTaken(await directory.setPersonTeams(person.id, [...person.teamIds, team.id]));
      });
    },
    addServiceForTeam: (team, name) => {
      void directory.runWrite(async () => {
        const service = await directory.createService(name);
        sayTaken(
          await directory.setTeamServices(team.id, [...(team.serviceIds ?? []), service.id]),
        );
      });
    },

    askToRemove: (kind, entry, whenRefused) => {
      void directory.runWrite(async () => {
        /**
         * Proof: the two `false`s here pinned to `true`, **six** cases failed —
         * five on `Unable to find role="dialog"` (no confirmation ever drawn) and
         * `removes an entry nothing points at on the first request` on
         * `expected [ [ 't2', true ] ] to deeply equal [ [ 't2', false ] ]`. The
         * fault `steps-panel` already knows. Watched 2026-08-09.
         */
        // Proof: pinning this cascade to `true` made `a removal is always asked
        // without a cascade first` and its no-usage sibling fail with expected
        // `[ [ 'p1', true ] ]` to equal `[ [ 'p1', false ] ]`. Watched 2026-09-20.
        const outcome = await directory.removeEntry(kind, entry.id, false);
        if (outcome.ok) return;
        whenRefused(outcome.usage);
      });
    },
    confirmRemoval: (kind, id, whenGone) => {
      void directory.runWrite(async () => {
        const outcome = await directory.removeEntry(kind, id, true);
        if (!outcome.ok) throw new Error('in_use');
        whenGone();
      });
    },
  };
}
