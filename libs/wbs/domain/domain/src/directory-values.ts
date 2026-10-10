import type { PersonKind } from './stored-vocabularies';
import type {
  ExternalSystem,
  LabelledWorkItem,
  Service,
  Tag,
  WorkItemType,
} from './work-item-values';

/**
 * A service or team work can be labelled with. Global, shared by every project.
 *
 * **No `size`.** The column is still in the table — blue and green share one
 * SQLite file and the outgoing release still selects it, which is `design.md`
 * D4 — but nothing in this release reads it, and this type is where that claim
 * is enforced rather than asserted. A team's capacity is a fact about one
 * project now: {@link CapacityStore}.
 *
 * It is also the shape `/api/teams` answers with, so leaving `size` here would
 * put the retired number back on the wire through an unqualified `select()`,
 * which is exactly how it got there before this type said no.
 */
export interface ServiceTeam {
  id: string;
  name: string;
}

/**
 * A team and the services it is **responsible for** — the ownership map, read
 * on the team's own row.
 *
 * {@link PersonWithTeams}' shape one dimension over, and the resemblance stops
 * at the shape: a person's `teamIds` says who they work with, and a team's
 * `serviceIds` says what it is accountable for. Neither labels a work item.
 *
 * Empty means a team that owns nothing, which is every team the day this ships
 * — the map starts with no data by design, because nothing may invent who owns
 * what.
 */
export interface TeamWithServices extends ServiceTeam {
  serviceIds: string[];
}

/**
 * Somebody who does work. Not an account on this tool.
 *
 * `kind` is **required, because every row read back carries one**: the column is
 * `NOT NULL DEFAULT 'person'` and the migration wrote `person` onto every row
 * that predates it, so there is no person in the database without a kind and no
 * read path that could produce one. It was optional between 2.1 and this
 * narrowing only because making it required means a separate input type for the
 * insert, which is {@link PersonInsert}.
 *
 * It is declared at all because it *arrives* at all: `DirectoryRepository`
 * spreads the Drizzle row, so `kind` reached the API response the moment the
 * column existed, and a type that denied it would have been a lie TypeScript
 * cannot catch — excess properties survive a spread. Required is the stronger
 * form of the same argument: a caller that reads a person and renders `kind`
 * now needs no `?? 'person'` fallback, and a fallback is where the two spellings
 * of "unknown kind" would have started to diverge.
 */
export interface Person {
  id: string;
  name: string;
  kind: PersonKind;
}

/** A person and the teams they belong to — empty means a free agent. */
export interface PersonWithTeams extends Person {
  teamIds: string[];
}

/** Who is doing one work item's work for one step. */
export interface Assignment {
  workItemId: string;
  stepId: string;
  personId: string;
}

/** The six directory catalogs a client lists, each under its list route's name. */
export interface DirectoryCatalogRows {
  people: PersonWithTeams[];
  teams: TeamWithServices[];
  services: Service[];
  tags: Tag[];
  workItemTypes: WorkItemType[];
  externalSystems: ExternalSystem[];
}

export type DirectoryCatalog = keyof DirectoryCatalogRows;

/** The catalogs a directory command creates and renames by name. */
export type NamedCatalog = Exclude<DirectoryCatalog, 'externalSystems'>;

/**
 * The rows a refused directory removal is described from, read in one place for
 * both the fast path and the transaction that decides.
 *
 * **Whole projects, not only the touched rows.** A work item's number is
 * derived from the tree it sits in, so naming `3.1` needs every sibling and
 * ancestor around it; reading only the rows that point at the entity would name
 * them by a number nobody's screen shows.
 *
 * `assignments` are every assignment in those projects rather than the ones
 * naming the entity, for the reason {@link StepUsageRows} gives: whether a work
 * item's **assumed assignee** moves depends on what it holds for the *other*
 * steps.
 */
export interface DirectoryUsageRows {
  /**
   * Labelled, because the usage is computed through `effectiveTeamsOf` — which
   * reads the join and never the column — and a row without its set would make
   * every effect the confirmation names come out empty.
   */
  workItems: readonly LabelledWorkItem[];
  projects: readonly { id: string; name: string }[];
  assignments: readonly Assignment[];
  steps: readonly { id: string; name: string }[];
  /** Every person an assignment above names, so an effect can say who rather than which id. */
  people: readonly Person[];
  /**
   * People whose membership the removal would drop, **other than the entity
   * being removed**. Empty for a person: their own memberships name nobody
   * else and go with them, so they force no confirmation.
   *
   * Named rather than {@link Person}, the shape `projects` and `steps` above
   * already use: the confirmation prints who loses the membership, and
   * `directory-usage.ts` narrows this to `{ id, name }` before it leaves the
   * service. Widening it to a whole person would mean reading a `kind` column
   * to satisfy a type, which is the tail wagging the query.
   */
  members: readonly { id: string; name: string }[];
  /**
   * What each project in this usage has stated about the team being removed, as
   * `projectId -> slots`. Empty when the usage is a person's.
   *
   * Carried because removing a team a project has **stated a capacity for** does
   * more than null a label: it takes a pool constraint away, and every row whose
   * effective team is this one moves. The reader cannot tell that from the work
   * items alone, and a confirmation that says only "the label goes" about a
   * removal that also moves every date is a confirmation of the wrong thing.
   *
   * **Per project, and that is the change `capacity-per-project` made here.** The
   * same team may be stated at four on one plan and unstated on the next, so a
   * single number for the whole confirmation would name a bound that does not
   * apply to half the rows it is printed on.
   */
  capacityOf: ReadonlyMap<string, number>;
}
