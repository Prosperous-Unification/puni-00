import type {
  DirectoryApi,
  DirectoryUsage,
  PersonKindView,
  PersonView,
  TeamView,
} from '@/lib/wbs-api';
import type { DirectoryKind, DirectorySnapshot } from '@/modules/directory/contract';
import type { Store } from '@/modules/store';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a page
 * sees a feature-service and never the resource-service beneath it.
 */
export type { DirectoryKind, DirectorySnapshot };

/**
 * What became of a gesture that carries a typed name, answered **at once**.
 *
 * Synchronous, because the page's own handlers are: two of the three arms never
 * reach the network, and the third is fired and not awaited. Anything that has
 * to happen *after* the write arrives is the caller's completion callback, which
 * this service invokes at the exact point the page used to.
 *
 * - `empty`: the name was whitespace alone. Nothing was sent, the problem is
 *   `name_required`, and the caller keeps what was typed so it can be repaired.
 * - `unchanged`: the typed name equals the stored one. Nothing was sent, and the
 *   caller drops its draft itself.
 * - `sent`: a write is in flight. The completion callback runs when it answers,
 *   and does not run at all if it throws.
 *
 * So a draft is dropped on `unchanged` directly and on `sent` through the
 * callback, and kept on `empty`. An add gesture answers only `empty` or `sent`.
 */
export type NameWrite = 'empty' | 'unchanged' | 'sent';

/**
 * Everything a person does to the directory, as the gestures they would name.
 *
 * A **feature**-service: it coordinates one resource-service and holds the
 * knowledge the resource must not — that an empty name is refused without a
 * round trip, that a removal is always asked without a cascade first, and that
 * making a team for somebody is a create and a patch in one gesture.
 *
 * It re-exposes the store contract so the page never reaches past it.
 */
export interface DirectoryManagement extends Store<DirectorySnapshot> {
  readonly read: () => Promise<void>;
  readonly reportFailedRead: (thrown: unknown) => void;
  /** Points the directory at a different client, keeping what it holds. */
  readonly replaceClient: (next: DirectoryApi) => void;
  /** The current gesture and its refetch, for tests. */
  readonly settled: () => Promise<void>;

  /**
   * Sends the name typed over an entry's, if it says something different.
   *
   * `whenSent` runs after the write has answered and before the refetch begins —
   * where the page dropped its name draft — and does not run if the write threw.
   */
  readonly renameEntry: (
    kind: DirectoryKind,
    entry: { id: string; name: string },
    typedName: string,
    whenSent: () => void,
  ) => NameWrite;

  readonly addPerson: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addTeam: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addTag: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addService: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addWorkItemType: (typedName: string, whenAdded: () => void) => NameWrite;

  /** Marks somebody a person or an agent. Nothing is sent when they already are one. */
  readonly chooseKind: (person: PersonView, kind: PersonKindView) => void;
  readonly setMemberships: (person: PersonView, teamIds: readonly string[]) => void;
  readonly setOwnedServices: (team: TeamView, serviceIds: readonly string[]) => void;

  /** Creates a team and puts one person in it, as one gesture. */
  readonly addTeamForPerson: (person: PersonView, name: string) => void;
  /** Creates a service and makes one team responsible for it, as one gesture. */
  readonly addServiceForTeam: (team: TeamView, name: string) => void;

  /**
   * Asks for a removal **without** a cascade, which is always the first ask.
   *
   * `whenRefused` runs with the usage the server named, where the page opened its
   * confirmation. A removal that throws runs nothing and leaves the refusal in
   * the snapshot, which is what the page has always done.
   */
  readonly askToRemove: (
    kind: DirectoryKind,
    entry: { id: string; name: string },
    whenRefused: (usage: DirectoryUsage) => void,
  ) => void;
  /**
   * Repeats the removal **with** the cascade, after somebody has seen the usage.
   *
   * A second refusal is the server refusing what it just described. There is
   * nothing left to confirm against, so it is raised into the snapshot's problem
   * and `whenGone` does not run — the confirmation stays open with the refusal on
   * it, exactly as today.
   */
  readonly confirmRemoval: (kind: DirectoryKind, id: string, whenGone: () => void) => void;
}
