import type {
  DirectoryApi,
  DirectoryRefusal,
  DirectoryRemoval,
  DirectoryWrite,
  PersonIdentityView,
  PersonKindView,
  PersonView,
  ServiceView,
  TagView,
  TeamView,
  WorkItemTypeView,
} from '@/lib/wbs-api';
import type { Store } from '@/modules/store';

/**
 * Which of the directory's five vocabularies an entry belongs to.
 *
 * Moved here from the directory page, where it was declared, exported, and
 * imported by nothing else.
 */
export type DirectoryKind = 'person' | 'team' | 'tag' | 'service' | 'type';

/**
 * Everything the directory holds for a reader, as one value.
 *
 * `busy` and `problem` are in here rather than in the page because they are the
 * observable half of this service's own write policy: a write raises `busy`,
 * clears `problem`, and either refuses in words or refetches.
 */
export interface DirectorySnapshot {
  readonly people: readonly PersonView[];
  readonly teams: readonly TeamView[];
  readonly tags: readonly TagView[];
  readonly services: readonly ServiceView[];
  readonly workItemTypes: readonly WorkItemTypeView[];
  /** True from the start of a write until its refetch has settled. */
  readonly busy: boolean;
  /** The last refusal, in the directory's own words, or null. */
  readonly problem: DirectoryRefusal | null;
}

/**
 * The account-wide directory: every person, team, tag, service and work item
 * type on this deployment, its staleness rule, and the one way a change to it is
 * run.
 *
 * A **resource**-service: one aggregate, its refresh, and the refusals it
 * models. It imports no React (rule F1) and exposes one store contract (F2). It
 * holds **no gesture**: which several operations make up one thing a person does
 * is the feature-service's knowledge. The plan pickers will share this resource,
 * which is why it is its own module.
 *
 * **Nothing here is optimistic.** Every write refetches and the snapshot is
 * replaced from what came back, so a refused change leaves the directory as the
 * server has it with the refusal beside it.
 *
 * **No socket.** This service opens no subscription. A reader sees somebody
 * else's change on the next read its caller asks for.
 */
export interface DirectoryResource extends Store<DirectorySnapshot> {
  /**
   * Reads all five vocabularies at once and installs them.
   *
   * Only the **newest** read may install. Three call sites fire this and none is
   * gated on the others, so an earlier read landing last would put a directory
   * older than what is on screen back on it, with nothing guaranteed to arrive
   * afterwards and repair it.
   *
   * @throws whatever the client throws. A failed read is never swallowed into an
   * empty directory; the caller reports it through `reportFailedRead`.
   */
  readonly read: () => Promise<void>;
  /** Records a failed read as the current problem, in the directory's words. */
  readonly reportFailedRead: (thrown: unknown) => void;
  /** Records a refusal the caller worked out for itself, such as an empty name. */
  readonly refuse: (refusal: DirectoryRefusal) => void;
  /**
   * Points the directory at a different client, **keeping everything it already
   * holds**.
   *
   * The page has always behaved this way: its vocabularies are component state
   * and its generation counter is a ref, so replacing the injected client
   * changed which client the next call used and cleared nothing. Rebuilding the
   * service instead would empty the panels for the length of the replacement's
   * first read, which is a behaviour change nobody asked for.
   */
  readonly replaceClient: (next: DirectoryApi) => void;
  /**
   * Runs one change: raise `busy`, clear `problem`, run it, turn a throw into a
   * refusal, then refetch either way, then lower `busy`.
   *
   * `change` is awaited **before** the refetch begins, so anything it calls — a
   * caller's completion callback included — lands where the page's own `attempt`
   * used to put it.
   */
  readonly runWrite: (change: () => Promise<void>) => Promise<void>;
  /**
   * The current write and its refetch, or an already-settled promise.
   *
   * A gesture is fired and not awaited, exactly as the page fires it, so this is
   * how a test reads the end of one without a timer. `busy` is the same fact
   * rendered.
   */
  readonly settled: () => Promise<void>;

  readonly renameEntry: (
    kind: DirectoryKind,
    id: string,
    name: string,
  ) => Promise<DirectoryWrite<{ id: string; name: string }>>;
  readonly removeEntry: (
    kind: DirectoryKind,
    id: string,
    cascade: boolean,
  ) => Promise<DirectoryRemoval>;

  readonly createPerson: (name: string) => Promise<PersonIdentityView>;
  readonly createTeam: (name: string) => Promise<TeamView>;
  readonly createTag: (name: string) => Promise<TagView>;
  readonly createService: (name: string) => Promise<ServiceView>;
  readonly createWorkItemType: (name: string) => Promise<WorkItemTypeView>;

  readonly setPersonKind: (id: string, kind: PersonKindView) => Promise<DirectoryWrite<PersonView>>;
  /** Sets exactly the teams a person belongs to — a full replacement, never a delta. */
  readonly setPersonTeams: (
    id: string,
    teamIds: readonly string[],
  ) => Promise<DirectoryWrite<PersonView>>;
  /** Sets exactly the services a team is responsible for — a full replacement. */
  readonly setTeamServices: (
    id: string,
    serviceIds: readonly string[],
  ) => Promise<DirectoryWrite<TeamView>>;
}
