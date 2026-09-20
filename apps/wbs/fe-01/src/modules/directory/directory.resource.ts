import { failureText } from '@/components/wbs/plan-refusal';
import type { DirectoryApi, DirectoryRemoval, DirectoryWrite } from '@/lib/wbs-api';

import type { DirectoryKind, DirectoryResource, DirectorySnapshot } from './contract';

const NOTHING_YET: DirectorySnapshot = {
  people: [],
  teams: [],
  tags: [],
  services: [],
  workItemTypes: [],
  busy: false,
  problem: null,
};

/** The fields the store contract's stability rule is judged over, by identity. */
const FIELDS = ['people', 'teams', 'tags', 'services', 'workItemTypes', 'busy', 'problem'] as const;

/** Builds the directory over one client. Nothing is read until `read` is called. */
export function createDirectory(client: DirectoryApi): DirectoryResource {
  // A `let` and not a parameter read directly, so `replaceClient` can point every
  // closure below at a different client without rebuilding any of them — which is
  // what keeps the snapshot across a replacement.
  let api = client;
  let shown: DirectorySnapshot = NOTHING_YET;
  const listeners = new Set<() => void>();

  /**
   * Replaces the snapshot and tells its subscribers, **if anything moved**.
   *
   * The identity comparison is the store contract's stability rule: without it a
   * write of the same values would wake every subscriber for nothing, and inside
   * a React render would fail the cached-snapshot check outright.
   */
  const show = (next: Partial<DirectorySnapshot>): void => {
    const merged: DirectorySnapshot = { ...shown, ...next };
    // Proof: deleting this early return made `a refusal that says nothing new
    // replaces no snapshot and wakes nobody` fail its object-identity assertion.
    // Watched 2026-09-20.
    if (FIELDS.every((field) => Object.is(merged[field], shown[field]))) return;
    shown = merged;
    for (const listen of [...listeners]) listen();
  };

  /** The newest read, and the only one entitled to install. */
  let latestRead = 0;

  /** The gesture in flight, for `settled`. */
  let inFlight: Promise<void> = Promise.resolve();

  /**
   * What renaming and removing mean for each vocabulary, in **one** place.
   *
   * A person's rename is a patch and so is a team's — both entities have a
   * second field on the same route — while a tag, a service and a type have
   * nothing but a name. That difference is the reason this is a map rather than
   * a naming convention.
   */
  const writesFor: Record<
    DirectoryKind,
    {
      rename: (id: string, name: string) => Promise<DirectoryWrite<{ id: string; name: string }>>;
      remove: (id: string, cascade: boolean) => Promise<DirectoryRemoval>;
    }
  > = {
    person: {
      rename: (id, name) => api.patchPerson(id, { name }),
      remove: (id, cascade) => api.removePerson(id, cascade),
    },
    team: {
      rename: (id, name) => api.patchTeam(id, { name }),
      remove: (id, cascade) => api.removeTeam(id, cascade),
    },
    tag: {
      rename: (id, name) => api.renameTag(id, name),
      remove: (id, cascade) => api.removeTag(id, cascade),
    },
    service: {
      rename: (id, name) => api.renameService(id, name),
      remove: (id, cascade) => api.removeService(id, cascade),
    },
    type: {
      rename: (id, name) => api.renameWorkItemType(id, name),
      remove: (id, cascade) => api.removeWorkItemType(id, cascade),
    },
  };

  const read = async (): Promise<void> => {
    const generation = latestRead + 1;
    latestRead = generation;
    const [foundPeople, foundTeams, foundTags, foundServices, foundWorkItemTypes] =
      await Promise.all([
        api.listPeople(),
        api.listTeams(),
        api.listTags(),
        api.listServices(),
        api.listWorkItemTypes(),
      ]);
    // Proof: this line deleted, `and only the newest read may write the screen`
    // alone failed, on `expected null not to be null` — a superseded read
    // putting the name somebody had just changed back on the panel. Watched
    // 2026-08-13.
    // Proof: deleting this guard made `only the newest read may install` fail
    // with expected `Stale` to be `Bo`. Watched 2026-09-20.
    if (generation !== latestRead) return;
    show({
      people: foundPeople,
      teams: foundTeams,
      tags: foundTags,
      services: foundServices,
      workItemTypes: foundWorkItemTypes,
    });
  };

  const reportFailedRead = (thrown: unknown): void => {
    show({ problem: { reason: 'refused', code: failureText(thrown, 'request_failed') } });
  };

  const runWrite = (change: () => Promise<void>): Promise<void> => {
    const ran = (async () => {
      show({ busy: true, problem: null });
      try {
        await change();
      } catch (thrown: unknown) {
        // Proof: removing this catch made `a write that throws becomes a refusal,
        // and still refetches` fail with the thrown `Error: offline`. Watched
        // 2026-09-20.
        show({ problem: { reason: 'refused', code: failureText(thrown, 'request_failed') } });
      }
      try {
        await read();
      } catch (thrown: unknown) {
        reportFailedRead(thrown);
      } finally {
        // Proof: removing this finally made `a refetch that throws becomes a
        // refusal, and busy still falls` and two other busy cases fail with
        // expected `true` to be `false`. Watched 2026-09-20.
        show({ busy: false });
      }
    })();
    inFlight = ran;
    return ran;
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    snapshot: () => shown,
    read,
    reportFailedRead,
    refuse: (refusal) => {
      show({ problem: refusal });
    },
    replaceClient: (next) => {
      // Proof: making this a no-op made `a replaced client keeps everything the
      // directory already held` fail with expected `Kat` to be `Bo`. Watched
      // 2026-09-20.
      api = next;
    },
    runWrite,
    settled: () => inFlight,

    renameEntry: (kind, id, name) => writesFor[kind].rename(id, name),
    removeEntry: (kind, id, cascade) => writesFor[kind].remove(id, cascade),

    createPerson: (name) => api.addPerson(name, []),
    createTeam: (name) => api.addTeam(name),
    createTag: (name) => api.addTag(name),
    createService: (name) => api.addService(name),
    createWorkItemType: (name) => api.addWorkItemType(name),

    setPersonKind: (id, kind) => api.patchPerson(id, { kind }),
    setPersonTeams: (id, teamIds) => api.patchPerson(id, { teamIds }),
    setTeamServices: (id, serviceIds) => api.patchTeam(id, { serviceIds }),
  };
}
