import type {
  DirectoryApi,
  DirectoryRemoval,
  DirectoryUsage,
  DirectoryWrite,
  PersonPatch,
  PersonView,
  TeamPatch,
  TeamView,
} from '@/lib/wbs-api';

/** The person every case starts from. */
export const KAT: PersonView = { id: 'p1', name: 'Kat', kind: 'person', teamIds: [] };
/** The team every case starts from. */
export const PLATFORM: TeamView = { id: 't1', name: 'Platform', serviceIds: [] };

/** What the recorder answers beside the client's own members. */
export interface RecordedDirectory {
  /** Every call this client took, in the order it took them. */
  readonly log: string[];
  readonly readCount: () => number;
  readonly removals: [string, boolean][];
  readonly renames: [string, string][];
  readonly creates: string[];
  readonly personPatches: { id: string; patch: PersonPatch }[];
  readonly teamPatches: { id: string; patch: TeamPatch }[];
  readonly refuseRemovalWith: (usage: DirectoryUsage | null) => void;
  readonly throwOnRemoval: (thrown: Error | null) => void;
  /** Holds every create until `releaseCreates` is called. */
  readonly holdCreates: () => void;
  readonly releaseCreates: () => void;
}

/**
 * A `DirectoryApi` over two in-memory vocabularies, with every call recorded in
 * order.
 *
 * The refusals are set per case rather than derived: what is under test is what a
 * service does with an answer, and a fake that worked out for itself when a name
 * is taken would be a second server to keep in step.
 *
 * Nothing here is `async`; every member answers an already-resolved promise, so
 * the strict rule against an `async` function that never awaits is satisfied. A
 * case that needs a read to hang replaces one member with a promise it resolves
 * by hand.
 */
export function fakeDirectoryApi(): DirectoryApi & RecordedDirectory {
  const people: PersonView[] = [KAT];
  const teams: TeamView[] = [PLATFORM];
  let reads = 0;
  let removalUsage: DirectoryUsage | null = null;
  let removalThrows: Error | null = null;
  let createGate: Promise<void> | null = null;
  let openCreates: (() => void) | null = null;
  const log: string[] = [];
  const removals: [string, boolean][] = [];
  const renames: [string, string][] = [];
  const creates: string[] = [];
  const personPatches: { id: string; patch: PersonPatch }[] = [];
  const teamPatches: { id: string; patch: TeamPatch }[] = [];

  const removal = (id: string, cascade: boolean): Promise<DirectoryRemoval> => {
    log.push(`remove:${id}:${String(cascade)}`);
    removals.push([id, cascade]);
    if (removalThrows !== null) return Promise.reject(removalThrows);
    return Promise.resolve<DirectoryRemoval>(
      removalUsage === null ? { ok: true } : { ok: false, reason: 'in_use', usage: removalUsage },
    );
  };

  const renamed = (
    id: string,
    name: string,
  ): Promise<DirectoryWrite<{ id: string; name: string }>> => {
    log.push(`rename:${id}:${name}`);
    renames.push([id, name]);
    return Promise.resolve<DirectoryWrite<{ id: string; name: string }>>({
      ok: true,
      entry: { id, name },
    });
  };

  const created = async <T>(what: string, name: string, entry: T): Promise<T> => {
    if (createGate !== null) await createGate;
    log.push(`${what}:${name}`);
    creates.push(name);
    return entry;
  };

  return {
    listPeople: () => {
      reads += 1;
      log.push('listPeople');
      return Promise.resolve([...people]);
    },
    listTeams: () => Promise.resolve([...teams]),
    listTags: () => Promise.resolve([]),
    listServices: () => Promise.resolve([]),
    listWorkItemTypes: () => Promise.resolve([]),
    listExternalSystems: () => Promise.resolve([]),

    addPerson: (name) =>
      created('addPerson', name, { id: `new-${name}`, name, kind: 'person' as const }),
    addTeam: (name) => created('addTeam', name, { id: `new-${name}`, name, serviceIds: [] }),
    addTag: (name) => created('addTag', name, { id: `new-${name}`, name }),
    addService: (name) => created('addService', name, { id: `new-${name}`, name }),
    addWorkItemType: (name) => created('addWorkItemType', name, { id: `new-${name}`, name }),

    patchPerson: (id, patch) => {
      log.push(`patchPerson:${id}`);
      personPatches.push({ id, patch });
      if (patch.name !== undefined) renames.push([id, patch.name]);
      const entry: PersonView = {
        ...KAT,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        teamIds: patch.teamIds === undefined ? [...KAT.teamIds] : [...patch.teamIds],
      };
      return Promise.resolve<DirectoryWrite<PersonView>>({ ok: true, entry });
    },
    patchTeam: (id, patch) => {
      log.push(`patchTeam:${id}`);
      teamPatches.push({ id, patch });
      if (patch.name !== undefined) renames.push([id, patch.name]);
      const entry: TeamView = {
        ...PLATFORM,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        serviceIds: patch.serviceIds === undefined ? [] : [...patch.serviceIds],
      };
      return Promise.resolve<DirectoryWrite<TeamView>>({ ok: true, entry });
    },

    renameTag: renamed,
    renameService: renamed,
    renameWorkItemType: renamed,

    removePerson: removal,
    removeTeam: removal,
    removeTag: removal,
    removeService: removal,
    removeWorkItemType: removal,

    log,
    readCount: () => reads,
    removals,
    renames,
    creates,
    personPatches,
    teamPatches,
    refuseRemovalWith: (usage) => {
      removalUsage = usage;
    },
    throwOnRemoval: (thrown) => {
      removalThrows = thrown;
    },
    holdCreates: () => {
      createGate = new Promise<void>((resolve) => {
        openCreates = resolve;
      });
    },
    releaseCreates: () => {
      openCreates?.();
      createGate = null;
      openCreates = null;
    },
  };
}
