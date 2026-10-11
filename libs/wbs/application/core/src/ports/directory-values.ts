import type { PersonKind } from '@wbs/domain';

import type { ExternalSystem, Service, Tag, WorkItemType } from './work-item-values';

export type { Assignment } from '@wbs/domain';

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
