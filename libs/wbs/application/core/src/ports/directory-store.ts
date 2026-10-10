import type { DirectoryUsageRows, PersonKind } from '@wbs/domain';

import type {
  Assignment,
  DirectoryCatalog,
  DirectoryCatalogRows,
  NamedCatalog,
  Person,
  PersonWithTeams,
  ServiceTeam,
  TeamWithServices,
} from './directory-values';
import type {
  AssignmentWritten,
  ExternalSystem,
  Service,
  ServiceWritten,
  Tag,
  TagWritten,
  WorkItemType,
  WorkItemTypeWritten,
} from './work-item-store';
import type { WriteStamp } from './write-stamp';
export type {
  Assignment,
  DirectoryCatalog,
  DirectoryCatalogRows,
  NamedCatalog,
  Person,
  PersonWithTeams,
  ServiceTeam,
  TeamWithServices,
} from './directory-values';
export type { DirectoryUsageRows } from '@wbs/domain';

/**
 * A change to one team: a new name, a new owned set, or both.
 *
 * `serviceIds` is a **full replacement**, exactly as {@link PersonPatch}'
 * `teamIds` is, so an absent field and an empty array mean different things:
 * absent leaves the map alone, empty makes the team own nothing. A patch
 * naming neither is refused rather than answered as a no-op.
 */
export interface TeamPatch {
  name?: string;
  serviceIds?: readonly string[];
}

/**
 * What an insert of a person may name, which is **not** what a read of one
 * carries: `kind` is optional here and required on {@link Person}.
 *
 * The asymmetry is the column's, not a convenience. `NOT NULL DEFAULT 'person'`
 * means a two-column insert is a legal insert — that is exactly what lets the
 * outgoing release keep writing people across a blue/green swap — while every
 * row that comes back out has a kind whether or not anybody sent one.
 *
 * `kind` is on the type rather than left off because the table takes it, not
 * because a caller sends it today: `DirectoryService.addPerson` omits it, and
 * the API's way to make an agent is `PATCH /people/:id` (4.4). A store method is
 * the table's contract, and `adds an agent when the insert names one` in
 * `directory.test.ts` holds the store to it.
 */
export interface PersonInsert {
  id: string;
  name: string;
  kind?: PersonKind;
}

/**
 * What a directory write answered.
 *
 * `taken` is the unique index on the name refusing a second row, translated
 * rather than thrown — two people renaming towards the same name is an ordinary
 * race, not a fault. `not_found` is an id the directory no longer holds, which
 * is the loser of two removals and a client working from a stale picker.
 */
type DirectoryWriteRefusal = 'not_found' | 'taken';

/**
 * Every project a directory write touched, collected **inside the write's own
 * transaction** — the projects holding a work item that carries the renamed
 * team or an assignment naming the renamed person.
 *
 * It rides on the outcome rather than being read again afterwards because the
 * rows it is read from are exactly the rows the write is about: a second read
 * would be answering a question about a directory that had already moved on.
 */
export type TouchedProjects = readonly string[];

/**
 * What a team patch answered.
 *
 * The team comes back **with its owned set**, for {@link PersonWritten}'s
 * reason: the caller has just replaced it, and a client that had to re-read the
 * directory to see what it wrote would render the set it sent rather than the
 * set that is there.
 *
 * `unknown_service` refuses the **whole** patch, rename included —
 * `team_service.service_id` is a foreign key, so the alternative is a raw
 * constraint failure, and a half-applied patch is not an observable state.
 */
export type ServiceTeamWritten =
  | { ok: true; team: TeamWithServices; projectIds: TouchedProjects }
  | { ok: false; reason: DirectoryWriteRefusal | 'unknown_service' };

/**
 * A change to one person: a new name, a new set of memberships, or both.
 *
 * `teamIds` is a **full replacement**, so an absent field and an empty array
 * mean different things: absent leaves the memberships alone, empty makes the
 * person a free agent.
 *
 * `kind` is how a person becomes an agent and back again, and patching it back
 * is the **only** undo it has: the directory journals nothing — no call to
 * `record` anywhere in `directory.service.ts` — and it cannot, because
 * `plan_event.project_id` is `NOT NULL REFERENCES project(id) ON DELETE
 * CASCADE` while the directory belongs to no project. A person's history would
 * have to be filed under an invented project and would vanish with it.
 * `openspec/changes/token-tracking/tasks.md` 4.4 carries the whole argument.
 */
export interface PersonPatch {
  name?: string;
  teamIds?: readonly string[];
  kind?: PersonKind;
}

export type PersonWritten =
  | { ok: true; person: PersonWithTeams; projectIds: TouchedProjects }
  | { ok: false; reason: DirectoryWriteRefusal | 'unknown_team' };

/**
 * What a create answered.
 *
 * `unknown_team` refuses the **whole** create rather than making the person and
 * dropping the membership: `person_team.service_team_id` is a foreign key, so
 * the alternative is not a partial success but a raw constraint failure — a 500
 * for a client whose picker was rendered a moment too early.
 */
export type PersonAdded = { ok: true; person: Person } | { ok: false; reason: 'unknown_team' };

/** What one confirmed directory removal took with it. */
export interface DirectoryRemoval {
  /** Every work item that lost an assignment or a label, and whose revision therefore moved. */
  workItemIds: readonly string[];
  /** Every project one of those work items sits in — who has to be told. */
  projectIds: readonly string[];
}

/**
 * What a removal's own transaction decided, which is the only answer that
 * counts.
 *
 * `in_use` carries the usage the **transaction** read, not the usage anybody
 * counted earlier: an assignment written between a caller's count and its
 * confirmation is what this refusal is for.
 */
export type DirectoryRemoved =
  | { ok: true; removal: DirectoryRemoval }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'in_use'; usage: DirectoryUsageRows };

/** What an organization-local rename answered; see {@link DirectoryStore.renameInOrganization}. */
export type OrganizationRenamed =
  { ok: true; projectIds: TouchedProjects } | { ok: false; reason: 'not_found' | 'taken' };

export interface DirectoryStore {
  /**
   * On an addressed miss, distinguish a missing/foreign entry from a present
   * trusted root whose ownership mapping is absent or conflicting. Optional
   * for older in-memory readers; persistent public writers provide it.
   * @throws for missing or conflicting trusted ownership of a present root.
   */
  inspectMissingOwnership?(catalog: NamedCatalog, resourceId: string): Promise<void>;
  /**
   * One catalog as one organization sees it: only the entries it owns, under
   * their organization-local display names, ordered by that name. A person's
   * teams and a team's services are the organization's own.
   *
   * @throws when a stored membership or team-service link crosses into another
   * organization. That is corrupt trusted state, and answering it would reveal
   * a foreign id.
   */
  listInOrganization<C extends DirectoryCatalog>(
    catalog: C,
    organizationId: string,
  ): Promise<DirectoryCatalogRows[C]>;
  /**
   * Maps a root that has just been created to `organizationId` under its
   * organization-local display name. The root itself carries an opaque name.
   *
   * @throws when the root is already mapped or another root of the
   * organization holds the name: the ownership freeze refuses both, and the
   * caller checked the name inside the same unit of work.
   */
  mapInOrganization(
    catalog: DirectoryCatalog,
    resourceId: string,
    organizationId: string,
    name: string,
  ): Promise<void>;
  /**
   * Renames one entry's organization-local display name; the root keeps its
   * opaque name. `not_found` for an entry the organization does not own, alike
   * for a foreign and an absent one; `taken` for a name another of its entries
   * holds. Answers the projects whose rows name the entry, for the
   * announcement.
   *
   * @throws when a project outside the organization names the entry: corrupt
   * trusted state, never a project to announce to.
   */
  renameInOrganization(
    catalog: NamedCatalog,
    resourceId: string,
    organizationId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<OrganizationRenamed>;
  /**
   * Every reference to one of the organization's entries from outside it:
   * a work item, assignment or capacity of a project the organization does
   * not own, a membership of a person or team it does not own, or a service
   * ownership by a team it does not own. Each as `relation:id`. Empty for an
   * entry only its organization reaches.
   */
  foreignReferencesTo(
    catalog: NamedCatalog,
    resourceId: string,
    organizationId: string,
  ): Promise<string[]>;
  /** Which of `projectIds` the organization does not own. */
  projectsOutside(projectIds: readonly string[], organizationId: string): Promise<string[]>;
  /** Every tag in the global directory, by name. */
  listTags(): Promise<Tag[]>;
  /**
   * Adds a tag idempotently **by name**, answering the row that is there — which
   * is the earlier one when two callers added the same name at once.
   */
  addTag(toAdd: Tag, stamp: WriteStamp): Promise<Tag>;
  /** Renames one tag, refusing a name another tag holds. */
  renameTag(tagId: string, name: string, stamp: WriteStamp): Promise<TagWritten>;
  /**
   * What points at one tag right now — a fast path for the confirmation, never
   * the authority for it. {@link DirectoryStore.removeTag} decides.
   */
  usageOfTag(tagId: string): Promise<DirectoryUsageRows>;
  /**
   * Counts what carries the tag, refuses an unconfirmed removal that would
   * unlabel anything, and otherwise deletes the tag — letting the cascade take
   * the labelling — all in one transaction, bumping every row that lost one.
   */
  removeTag(tagId: string, cascade: boolean, stamp: WriteStamp): Promise<DirectoryRemoved>;
  /** Every work item type in the global directory, by name. */
  listWorkItemTypes(): Promise<WorkItemType[]>;
  /**
   * Adds a work item type idempotently **by name**, answering the row that is
   * there — {@link DirectoryStore.addTag}'s rule and its reason: the list is
   * typed into by everybody, two people adding `Bug` at the same moment both
   * pass a check-then-insert, and only the unique index stops the second.
   */
  addWorkItemType(toAdd: WorkItemType, stamp: WriteStamp): Promise<WorkItemType>;
  /** Renames one work item type, refusing a name another type holds. */
  renameWorkItemType(typeId: string, name: string, stamp: WriteStamp): Promise<WorkItemTypeWritten>;
  /**
   * What points at one work item type right now — a fast path for the
   * confirmation, never the authority for it.
   * {@link DirectoryStore.removeWorkItemType} decides.
   */
  usageOfWorkItemType(typeId: string): Promise<DirectoryUsageRows>;
  /**
   * Counts what carries the type, refuses an unconfirmed removal that would
   * unlabel anything, and otherwise deletes the type — letting the cascade take
   * the labelling — all in one transaction, bumping every row that lost one.
   */
  removeWorkItemType(
    typeId: string,
    cascade: boolean,
    stamp: WriteStamp,
  ): Promise<DirectoryRemoved>;
  /**
   * Every external system in the global directory, by name.
   *
   * The vocabulary starts with the systems the URL classifier knows. Archival
   * import may add a name learned on another deployment, but there is no public
   * create route, rename or removal: removing a system takes every **link** with
   * it rather than a label off a row.
   */
  listExternalSystems(): Promise<ExternalSystem[]>;
  /**
   * Adds an external-system vocabulary row idempotently by name.
   *
   * The built-in URL classifiers seed their known systems, while an archival
   * import may carry a vocabulary name from another compatible deployment.
   */
  addExternalSystem(toAdd: ExternalSystem, stamp: WriteStamp): Promise<ExternalSystem>;
  /** Every service in the global directory, by name. */
  listServices(): Promise<Service[]>;
  /**
   * Adds a service idempotently **by name**, answering the row that is there —
   * {@link DirectoryStore.addTag}'s rule and its reason.
   */
  addService(toAdd: Service, stamp: WriteStamp): Promise<Service>;
  /** Renames one service, refusing a name another service holds. */
  renameService(serviceId: string, name: string, stamp: WriteStamp): Promise<ServiceWritten>;
  /**
   * What points at one service right now — a fast path for the confirmation,
   * never the authority for it. {@link DirectoryStore.removeService} decides.
   */
  usageOfService(serviceId: string): Promise<DirectoryUsageRows>;
  /**
   * Counts what names the service, refuses an unconfirmed removal that would
   * unlabel anything, and otherwise deletes the service — letting
   * `work_item.service_id`'s `ON DELETE SET NULL` clear the column and
   * `team_service`'s cascade take the ownership rows — all in one transaction,
   * bumping every row that lost its label.
   */
  removeService(serviceId: string, cascade: boolean, stamp: WriteStamp): Promise<DirectoryRemoved>;
  /**
   * Every team with the services it owns — the ownership map ships **whole**,
   * on the row where it is edited (design D4).
   *
   * One read rather than a second endpoint because both mismatch signals need
   * the map per row, and a client that had to ask twice would render a tree
   * against a map from a moment ago.
   */
  listTeams(): Promise<TeamWithServices[]>;
  /**
   * Adds a team, or returns the one that already has that name.
   *
   * Idempotent by name at the database rather than by asking first: this list
   * is typed into by everybody, and two people adding `Platform` at once both
   * pass a check-then-insert.
   */
  addTeam(team: ServiceTeam, stamp: WriteStamp): Promise<ServiceTeam>;
  /**
   * Renames one team and replaces the services it owns, in **one** transaction,
   * or says why it could not.
   *
   * A rename is refused by the unique index rather than by asking first,
   * exactly as {@link DirectoryStore.addTeam} is: two clients renaming towards
   * `Platform` at the same moment both pass a check-then-update. The owned set
   * is validated **before** anything is written, for
   * {@link DirectoryStore.patchPerson}'s reason: returning from a drizzle
   * transaction callback commits it, so a refusal decided after the name had
   * been set would answer `unknown_service` and leave the rename behind.
   */
  patchTeam(teamId: string, patch: TeamPatch, stamp: WriteStamp): Promise<ServiceTeamWritten>;
  listPeople(): Promise<PersonWithTeams[]>;
  /**
   * Adds a person, or returns the one with that name, joining them to
   * `teamIds` — the person and every membership in **one** transaction, with
   * the teams read inside it. See {@link PersonAdded}.
   *
   * Takes a {@link PersonInsert} rather than a {@link Person}: the kind may be
   * omitted on the way in and never is on the way out.
   */
  addPerson(
    toAdd: PersonInsert,
    teamIds: readonly string[],
    stamp: WriteStamp,
  ): Promise<PersonAdded>;
  /**
   * Renames a person and replaces their memberships, in **one** transaction.
   *
   * The two are one write because a caller may send both and the spec forbids
   * them being observable half-applied. A `teamIds` entry naming a team the
   * directory no longer holds refuses the whole patch as `unknown_team` and
   * writes nothing — the id is read in the same transaction as the writes, so
   * a team removed after some earlier check cannot slip between them.
   */
  patchPerson(personId: string, patch: PersonPatch, stamp: WriteStamp): Promise<PersonWritten>;
  /**
   * What points at this person right now — a **fast path** for the refusal,
   * never the authority for it. Between this answer and any delete, anybody may
   * assign them. {@link DirectoryStore.removePerson} is what decides.
   */
  usageOfPerson(personId: string): Promise<DirectoryUsageRows>;
  /** The same, for a team: the work items labelled with it and the people in it. */
  usageOfTeam(teamId: string): Promise<DirectoryUsageRows>;
  /**
   * Counts what points at the person, refuses an unconfirmed removal that would
   * take any of it, and otherwise drops their assignments, their memberships
   * and the person — all in **one** transaction, moving the revision of every
   * work item that lost an assignment.
   *
   * The count lives inside the transaction because it *is* the decision: a
   * caller that asked without `cascade` consented to nothing, so an assignment
   * written after that caller's own count must refuse the removal rather than
   * be deleted by it.
   */
  removePerson(personId: string, cascade: boolean, stamp: WriteStamp): Promise<DirectoryRemoved>;
  /**
   * The same for a team, and it **nulls the labels itself**:
   * `work_item.service_team_id` carries a foreign key with no `ON DELETE`
   * action, so deleting the team row while any work item still names it is
   * refused outright by SQLite. The join rows in `work_item_team` go the other
   * way and need no statement at all — they cascade.
   */
  /**
   * Stamped, unlike its four sibling removals, because this one **updates**
   * surviving rows as well as deleting: it nulls `work_item.serviceTeamId` on
   * every work item the team labelled. A delete has no column left to stamp; an
   * update to a row that stays does.
   */
  removeTeam(teamId: string, cascade: boolean, stamp: WriteStamp): Promise<DirectoryRemoved>;
  /** Assignments and their current person names, read together within one project. */
  assignmentsInProject(projectId: string): Promise<{
    assignments: Assignment[];
    people: { id: string; name: string }[];
  }>;
  /** Assignments on one work item, bounded by its indexed key. */
  assignmentsFor(workItemId: string): Promise<Assignment[]>;
  /** Subset consumer compatibility; each distinct work item uses its indexed key. */
  assignmentsOf(workItemIds: readonly string[]): Promise<Assignment[]>;
  /**
   * Sets, replaces or (with `null`) removes one work item's assignee for one
   * step, validating the person **inside the write's own transaction** — see
   * {@link AssignmentWritten}.
   */
  assign(
    workItemId: string,
    stepId: string,
    personId: string | null,
    stamp: WriteStamp,
  ): Promise<AssignmentWritten>;
}
