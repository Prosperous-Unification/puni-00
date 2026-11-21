import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Drizzle } from './db';
import { organization, project, space, users } from './schema';

type Reader = Pick<Drizzle, 'select'>;

/** One saved actual project assignment; historical package-pair audit is never relabeled as its editor. */
export interface SavedSpaceMember {
  projectId: string;
  position: number;
}

/** One saved space: every `space` column and its members in display order. */
export interface SavedSpace {
  id: string;
  organizationId: string;
  name: string;
  revision: number;
  createdAt: number;
  updatedAt: number | null;
  createdBy: string;
  members: SavedSpaceMember[];
}

/**
 * Current project-assignment save format. Historical package-pair version1 is
 * deliberately refused instead of being reinterpreted as projects. This file
 * does not bypass the guarded settings/space transition downs.
 */
export interface SavedSpaces {
  format: 'space-save';
  version: 2;
  spaces: SavedSpace[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isInstantOrNull = (value: unknown): value is number | null =>
  value === null || isInteger(value);

function invalid(): never {
  throw new Error('invalid space save');
}

function readMember(candidate: unknown): SavedSpaceMember {
  if (!isRecord(candidate) || Object.keys(candidate).length !== 2) invalid();
  const { projectId, position } = candidate;
  if (!isString(projectId) || !isInteger(position)) invalid();
  return { projectId, position };
}

function readSpace(candidate: unknown): SavedSpace {
  if (!isRecord(candidate) || Object.keys(candidate).length !== 8) invalid();
  const { id, organizationId, name, revision, createdAt, updatedAt, createdBy, members } =
    candidate;
  if (
    !isString(id) ||
    !isString(organizationId) ||
    !isString(name) ||
    !isInteger(revision) ||
    !isInteger(createdAt) ||
    !isInstantOrNull(updatedAt) ||
    !isString(createdBy) ||
    !Array.isArray(members)
  ) {
    invalid();
  }
  return {
    id,
    organizationId,
    name,
    revision,
    createdAt,
    updatedAt,
    createdBy,
    members: members.map(readMember),
  };
}

/** Validates the versioned file at the CLI boundary, before any transaction. */
function readSavedSpaces(saved: unknown): SavedSpaces {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'space-save' ||
    saved['version'] !== 2 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['spaces'])
  ) {
    invalid();
  }
  return { format: 'space-save', version: 2, spaces: saved['spaces'].map(readSpace) };
}

/**
 * Historical version1 proof; current format retains this account check for the space author only.
 * Proof, observed 2026-09-29: answering true here made `refuses the whole
 * restore, naming it, when an author is no longer a user` receive drizzle's
 * `Failed query: insert into "space"` instead of the named refusal.
 */
function isUser(db: Reader, userId: string): boolean {
  return db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get() !== undefined;
}

function currentSpaces(db: Reader): SavedSpace[] {
  return db
    .select({
      id: space.id,
      organizationId: space.organizationId,
      name: space.name,
      revision: space.revision,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      createdBy: space.createdBy,
    })
    .from(space)
    .orderBy(asc(space.id))
    .all()
    .map((row) => ({
      ...row,
      members: db
        .select({ projectId: project.id, position: project.spacePosition })
        .from(project)
        .where(eq(project.spaceId, row.id))
        .orderBy(asc(project.spacePosition), asc(project.id))
        .all()
        .map((member) => {
          if (member.position === null || !Number.isSafeInteger(member.position))
            throw new Error('saved project assignment has malformed position');
          return { projectId: member.projectId, position: member.position };
        }),
    }));
}

const isSameMember = (left: SavedSpaceMember, right: SavedSpaceMember): boolean =>
  left.projectId === right.projectId && left.position === right.position;

const isSameSpace = (left: SavedSpace, right: SavedSpace): boolean =>
  left.id === right.id &&
  left.organizationId === right.organizationId &&
  left.name === right.name &&
  left.revision === right.revision &&
  left.createdAt === right.createdAt &&
  left.updatedAt === right.updatedAt &&
  left.createdBy === right.createdBy &&
  left.members.length === right.members.length &&
  left.members.every((member, index) => isSameMember(member, right.members[index]));

/** Captures every space and member, spaces in id order, members in display order. */
export function saveSpaces(db: Drizzle): SavedSpaces {
  return { format: 'space-save', version: 2, spaces: currentSpaces(db) };
}

/**
 * Deletes exactly the saved spaces and their members in one transaction,
 * refusing unless the save still equals everything stored: a space or member
 * written after the save would otherwise be dropped with no copy anywhere.
 * Answers the number of spaces removed.
 */
export function removeSavedSpaces(db: Drizzle, saved: unknown): number {
  const { spaces } = readSavedSpaces(saved);
  return db.transaction(
    (tx) => {
      const current = currentSpaces(tx);
      const expected = [...spaces].sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      );
      // Proof, observed 2026-09-29: reduced to comparing the number of
      // spaces, `refuses to remove a save that no longer matches, deleting
      // nothing` failed because the remove deleted both spaces; with
      // `isSameMember` answering true, `refuses to remove a save whose one
      // field differs` failed the same way.
      if (
        current.length !== expected.length ||
        current.some((row, index) => !isSameSpace(row, expected[index]))
      ) {
        throw new Error('space save does not match the stored spaces; save again first');
      }
      const ids = current.map(({ id }) => id);
      tx.update(project)
        .set({ spaceId: null, spacePosition: null })
        .where(inArray(project.spaceId, ids))
        .run();
      tx.delete(space).where(inArray(space.id, ids)).run();
      return current.length;
    },
    { behavior: 'immediate' },
  );
}

/**
 * Writes the saved spaces and members back after a later forward migration,
 * all or none. A saved organization that is gone, or a saved project its
 * organization no longer owns, refuses the whole restore naming it; the
 * ownership relation would refuse it too, but without saying which.
 */
export function restoreSpaces(db: Drizzle, saved: unknown): number {
  const { spaces } = readSavedSpaces(saved);
  return db.transaction(
    (tx) => {
      for (const saved of spaces) {
        const owner = tx
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, saved.organizationId))
          .get();
        if (owner === undefined) {
          throw new Error(
            `saved space ${saved.id} names organization ${saved.organizationId}, which is gone`,
          );
        }
        // Proof, observed 2026-09-29: with this read skipped, `refuses the
        // whole restore, naming it, over a name now taken` received drizzle's
        // `Failed query: insert into "space"` instead of the named refusal.
        const clash = tx
          .select({ id: space.id })
          .from(space)
          .where(and(eq(space.organizationId, saved.organizationId), eq(space.name, saved.name)))
          .get();
        if (clash !== undefined) {
          throw new Error(
            `saved space ${saved.id} is named ${saved.name}, which organization ${saved.organizationId} already holds`,
          );
        }
        if (!isUser(tx, saved.createdBy)) {
          throw new Error(
            `saved space ${saved.id} was created by ${saved.createdBy}, who is no longer a user`,
          );
        }
        tx.insert(space)
          .values({
            id: saved.id,
            organizationId: saved.organizationId,
            name: saved.name,
            revision: saved.revision,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            createdBy: saved.createdBy,
          })
          .run();
        for (const member of saved.members) {
          const owned = tx
            .select({ id: project.id, spaceId: project.spaceId })
            .from(project)
            .where(
              and(
                eq(project.id, member.projectId),
                eq(project.organizationId, saved.organizationId),
              ),
            )
            .get();
          if (owned === undefined)
            throw new Error(
              `saved space ${saved.id} holds project ${member.projectId}, which organization ${saved.organizationId} no longer owns`,
            );
          if (owned.spaceId !== null && owned.spaceId !== saved.id)
            throw new Error(
              `saved project ${member.projectId} already belongs to space ${owned.spaceId}`,
            );
          tx.update(project)
            .set({ spaceId: saved.id, spacePosition: member.position })
            .where(eq(project.id, member.projectId))
            .run();
        }
      }
      return spaces.length;
    },
    { behavior: 'immediate' },
  );
}
