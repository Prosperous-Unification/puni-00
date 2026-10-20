import type { Assignment, DirectoryStore, TeamWithServices } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

function byAssignment(assignments: Assignment[]): Assignment[] {
  return assignments.toSorted((left, right) =>
    [left.workItemId, left.stepId, left.personId]
      .join('\u0000')
      .localeCompare([right.workItemId, right.stepId, right.personId].join('\u0000')),
  );
}

function byPerson<Person extends { id: string }>(people: Person[]): Person[] {
  return people.toSorted((left, right) => left.id.localeCompare(right.id));
}

function byTeam(teams: TeamWithServices[]): TeamWithServices[] {
  return teams
    .map((team) => ({ ...team, serviceIds: team.serviceIds.toSorted() }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

function assignment(workItemId: string, stepId: string, personId: string): Assignment {
  return { workItemId, stepId, personId };
}

async function assignmentState(
  directory: DirectoryStore,
  workItemIds: readonly [string, string, string],
  projectIds: readonly [string, string],
) {
  const [firstItemId, secondItemId, otherProjectItemId] = workItemIds;
  const [firstProjectId, otherProjectId] = projectIds;
  const [first, second, otherProject, selected, subset, firstProject, projectB] = await Promise.all(
    [
      directory.assignmentsFor(firstItemId),
      directory.assignmentsFor(secondItemId),
      directory.assignmentsFor(otherProjectItemId),
      directory.assignmentsOf(workItemIds),
      directory.assignmentsOf([firstItemId, secondItemId]),
      directory.assignmentsInProject(firstProjectId),
      directory.assignmentsInProject(otherProjectId),
    ],
  );
  return {
    forItems: [
      { workItemId: firstItemId, assignments: byAssignment(first) },
      { workItemId: secondItemId, assignments: byAssignment(second) },
      { workItemId: otherProjectItemId, assignments: byAssignment(otherProject) },
    ],
    ofItems: byAssignment(selected),
    ofSubset: byAssignment(subset),
    inProjects: [
      {
        projectId: firstProjectId,
        assignments: byAssignment(firstProject.assignments),
        people: byPerson(firstProject.people),
      },
      {
        projectId: otherProjectId,
        assignments: byAssignment(projectB.assignments),
        people: byPerson(projectB.people),
      },
    ],
  };
}

/**
 * The person `directory.patchPerson:owned-binding` binds: each source seeds it
 * owned by this organization, with only the first owner as a member, through
 * whatever side tables it has (no port writes ownership).
 */
export const OWNED_BINDING = { personId: 'owned-person', organizationId: 'org-binding' } as const;

/**
 * The credential both sources pin for `directory.removePerson:pinned-credential`:
 * a fleet's `(issuer, subject)` linked to the seed's first owner and pinned to
 * `personId`, a person nothing else points at, so the pin alone is its usage.
 */
export const PINNED_CREDENTIAL = {
  personId: 'pinned-person',
  issuer: 'https://idp.example/',
  subject: 'fleet-m2m@clients',
} as const;

/** The original shared directory cases, retaining their stable case IDs. */
export function directoryRegistrations(open: OpenCase<'directory'>): readonly CaseRegistration[] {
  return [
    storeCase('directory', 'directory.addTag', open, async ({ port, seed }) => {
      await port.addTag({ id: 'tag-urgent', name: 'urgent' }, seed.stamps[0]);
      expect((await port.listTags()).map(({ name }) => name)).toContain('urgent');
    }),
    storeCase('directory', 'directory.assign:unknown_person', open, async ({ port, seed }) => {
      const workItemId = seed.workItemIds[0][0];
      const assigned = await port.assign(
        workItemId,
        seed.stepIds[0][0],
        'nobody-by-that-id',
        seed.stamps[0],
      );
      expect(assigned).toEqual({ ok: false, reason: 'unknown_person' });
      expect(await port.assignmentsFor(workItemId)).toEqual([]);
    }),
    storeCase('directory', 'directory.assign:scope-replace-clear', open, async ({ port, seed }) => {
      const [firstItemId, secondItemId] = seed.workItemIds[0];
      const otherProjectItemId = seed.workItemIds[1][0];
      const [firstStepId, secondStepId] = seed.stepIds[0];
      const otherProjectStepId = seed.stepIds[1][0];
      const [firstPersonId, secondPersonId] = seed.personIds;
      const sameItem = assignment(firstItemId, secondStepId, firstPersonId);
      const sameStep = assignment(secondItemId, firstStepId, firstPersonId);
      const otherProject = assignment(otherProjectItemId, otherProjectStepId, secondPersonId);
      const targetFor = (personId: string): Assignment =>
        assignment(firstItemId, firstStepId, personId);
      const expectedState = (personId: string | null) => {
        const projectA = [sameItem, sameStep];
        if (personId !== null) projectA.push(targetFor(personId));
        const firstItem = [sameItem];
        if (personId !== null) firstItem.push(targetFor(personId));
        return {
          forItems: [
            { workItemId: firstItemId, assignments: byAssignment(firstItem) },
            { workItemId: secondItemId, assignments: [sameStep] },
            { workItemId: otherProjectItemId, assignments: [otherProject] },
          ],
          ofItems: byAssignment([...projectA, otherProject]),
          // Proof: ignored-subset faults return the complete project-B row as
          // an extra record here while every seeded assignment remains stored.
          ofSubset: byAssignment(projectA),
          inProjects: [
            {
              projectId: seed.projectIds[0],
              assignments: byAssignment(projectA),
              people: byPerson([
                { id: firstPersonId, name: 'Person 1' },
                ...(personId === secondPersonId ? [{ id: secondPersonId, name: 'Person 2' }] : []),
              ]),
            },
            {
              projectId: seed.projectIds[1],
              assignments: [otherProject],
              people: [{ id: secondPersonId, name: 'Person 2' }],
            },
          ],
        };
      };

      expect(await port.assign(secondItemId, firstStepId, firstPersonId, seed.stamps[0])).toEqual({
        ok: true,
      });
      expect(await port.assign(firstItemId, secondStepId, firstPersonId, seed.stamps[0])).toEqual({
        ok: true,
      });
      expect(
        await port.assign(otherProjectItemId, otherProjectStepId, secondPersonId, seed.stamps[1]),
      ).toEqual({ ok: true });
      expect(await port.assign(firstItemId, firstStepId, firstPersonId, seed.stamps[0])).toEqual({
        ok: true,
      });
      expect(
        await assignmentState(
          port,
          [firstItemId, secondItemId, otherProjectItemId],
          seed.projectIds,
        ),
      ).toEqual(expectedState(firstPersonId));

      expect(await port.assign(firstItemId, firstStepId, secondPersonId, seed.stamps[1])).toEqual({
        ok: true,
      });
      // Proof: broad-replacement faults on both real sources remove the
      // complete same-step survivor from every public assignment view here.
      expect(
        await assignmentState(
          port,
          [firstItemId, secondItemId, otherProjectItemId],
          seed.projectIds,
        ),
      ).toEqual(expectedState(secondPersonId));

      expect(await port.assign(firstItemId, firstStepId, null, seed.stamps[1])).toEqual({
        ok: true,
      });
      expect(
        await assignmentState(
          port,
          [firstItemId, secondItemId, otherProjectItemId],
          seed.projectIds,
        ),
      ).toEqual(expectedState(null));
    }),
    storeCase('directory', 'directory.patchTeam:atomic-refusal', open, async ({ port, seed }) => {
      const [targetTeamId, otherTeamId] = seed.teamIds;
      const ownedServiceId = seed.serviceIds[0];
      const otherService = { id: 'directory-service-sentinel', name: 'Directory sentinel' };
      const originalTeams = byTeam([
        { id: targetTeamId, name: 'Directory original', serviceIds: [ownedServiceId] },
        { id: otherTeamId, name: 'Team 2', serviceIds: [otherService.id] },
      ]);
      await port.addService(structuredClone(otherService), seed.stamps[0]);
      expect(
        await port.patchTeam(
          targetTeamId,
          { name: 'Directory original', serviceIds: [ownedServiceId] },
          seed.stamps[0],
        ),
      ).toEqual({
        ok: true,
        team: originalTeams[0],
        projectIds: [],
      });
      expect(
        await port.patchTeam(otherTeamId, { serviceIds: [otherService.id] }, seed.stamps[0]),
      ).toEqual({
        ok: true,
        team: originalTeams[1],
        projectIds: [],
      });
      expect(byTeam(await port.listTeams())).toEqual(originalTeams);
      expect((await port.listServices()).toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
        [{ id: ownedServiceId, name: 'Service 1' }, otherService].toSorted((a, b) =>
          a.id.localeCompare(b.id),
        ),
      );

      expect(
        await port.patchTeam(
          targetTeamId,
          { name: 'Directory escaped', serviceIds: ['directory-unknown-service'] },
          seed.stamps[1],
        ),
      ).toEqual({ ok: false, reason: 'unknown_service' });
      // Proof: early-rename faults on both real sources retain the complete
      // owned set but expose Directory escaped as the received target name.
      expect(byTeam(await port.listTeams())).toEqual(originalTeams);
      expect((await port.listServices()).toSorted((a, b) => a.id.localeCompare(b.id))).toEqual(
        [{ id: ownedServiceId, name: 'Service 1' }, otherService].toSorted((a, b) =>
          a.id.localeCompare(b.id),
        ),
      );
    }),
    // `wbs-team-claims` D5: many persons to one account, at most one account
    // to a person, null unbinds, and a refused binding changes nothing.
    // Proof: the SQLite `accountMayBind` answering true failed this on the raw
    // foreign-key `Failed query: update "person"`; the memory fixture's
    // `accounts.has` check removed failed its `unknown_account` toEqual (watched 2026-10-19).
    storeCase(
      'directory',
      'directory.patchPerson:account-binding',
      open,
      async ({ port, seed }) => {
        const [first, second] = seed.personIds;
        const [account, otherAccount] = seed.ownerIds;
        const bound = await port.patchPerson(first, { accountId: account }, seed.stamps[0]);
        expect(bound.ok && bound.person.accountId).toBe(account);
        expect((await port.patchPerson(second, { accountId: account }, seed.stamps[0])).ok).toBe(
          true,
        );
        expect([await port.boundAccountOf(first), await port.boundAccountOf(second)]).toEqual([
          account,
          account,
        ]);
        expect(
          byPerson(await port.listPeople()).map(({ id, accountId }) => ({ id, accountId })),
        ).toEqual([
          { id: first, accountId: account },
          { id: second, accountId: account },
        ]);

        expect(
          await port.patchPerson(first, { accountId: 'no-such-account' }, seed.stamps[1]),
        ).toEqual({ ok: false, reason: 'unknown_account' });
        expect(await port.boundAccountOf(first)).toBe(account);

        expect(
          (await port.patchPerson(first, { accountId: otherAccount }, seed.stamps[1])).ok,
        ).toBe(true);
        expect(await port.boundAccountOf(first)).toBe(otherAccount);
        const unbound = await port.patchPerson(first, { accountId: null }, seed.stamps[1]);
        expect(unbound.ok && unbound.person.accountId).toBeNull();
        expect(await port.boundAccountOf(first)).toBeNull();
        expect(await port.boundAccountOf(second)).toBe(account);
        expect(
          await port.boundAccountOf('no-such-person').then(
            () => 'resolved',
            (error: unknown) => (error instanceof Error ? error.message : String(error)),
          ),
        ).toContain('no-such-person');
      },
    ),
    // An owned person binds only to a member of its organization, the rule
    // SQLite's `accountMayBind` and the memory membership map both keep.
    // Proof: either membership read answering true made this case fail its
    // `unknown_account` toEqual on that source (watched 2026-10-20).
    storeCase('directory', 'directory.patchPerson:owned-binding', open, async ({ port, seed }) => {
      const [member, stranger] = seed.ownerIds;
      expect(
        await port.patchPerson(OWNED_BINDING.personId, { accountId: stranger }, seed.stamps[0]),
      ).toEqual({ ok: false, reason: 'unknown_account' });
      expect(await port.boundAccountOf(OWNED_BINDING.personId)).toBeNull();
      const bound = await port.patchPerson(
        OWNED_BINDING.personId,
        { accountId: member },
        seed.stamps[0],
      );
      expect(bound.ok && bound.person.accountId).toBe(member);
      expect(await port.boundAccountOf(OWNED_BINDING.personId)).toBe(member);
    }),
    // No source writes a pin through a port (`link-credential-cli.ts` is
    // SQLite's only writer), so the shared case is the unlinked pair; pinned
    // reads are asserted per source beside their writers.
    storeCase('directory', 'directory.credentialPinOf:unlinked', open, async ({ port }) => {
      expect(await port.credentialPinOf('https://idp.example/', 'nobody')).toBeNull();
    }),
    storeCase('directory', 'directory.removePerson:claims-in-use', open, async ({ port, seed }) => {
      const [personId] = seed.personIds;
      const removal = await port.removePerson(personId, false, seed.stamps[1]);
      expect(removal).toMatchObject({
        ok: false,
        reason: 'in_use',
        usage: { claims: [{ workItemId: CLAIM_IN_USE.workItemId, stepId: null, personId }] },
      });
      expect(await port.removePerson(personId, true, seed.stamps[1])).toMatchObject({
        ok: true,
      });
      expect((await port.listPeople()).map(({ id }) => id)).not.toContain(personId);
    }),
    // A superagent's removal takes its workers' delegated claims by the parent
    // cascade, so its usage names them and its removal reports their work items.
    storeCase(
      'directory',
      'directory.removePerson:delegated-claims',
      open,
      async ({ port, seed }) => {
        const [superagent, worker] = DELEGATED_CLAIMS;
        const removal = await port.removePerson(superagent.personId, false, seed.stamps[1]);
        expect(removal).toMatchObject({ ok: false, reason: 'in_use' });
        if (removal.ok || removal.reason !== 'in_use')
          throw new Error('the removal was not refused');
        expect(removal.usage.claims).toEqual(
          DELEGATED_CLAIMS.map(({ workItemId, stepId, personId }) => ({
            workItemId,
            stepId,
            personId,
          })),
        );
        expect(await port.usageOfPerson(superagent.personId)).toMatchObject({
          claims: removal.usage.claims,
        });
        const removed = await port.removePerson(superagent.personId, true, seed.stamps[1]);
        if (!removed.ok) throw new Error('the confirmed removal was refused');
        expect([...removed.removal.workItemIds].sort()).toEqual(
          [superagent.workItemId, worker.workItemId].sort(),
        );
        expect(await port.usageOfPerson(worker.personId)).toMatchObject({ claims: [] });
      },
    ),
    // A credential pinned to a person is usage: an unconfirmed removal is
    // refused naming the count, and a confirmed one revokes the credential with
    // the person, never leaving a pin to a person that is gone (nor unpinning
    // it, which would let it claim as any person of its account).
    storeCase(
      'directory',
      'directory.removePerson:pinned-credential',
      open,
      async ({ port, seed }) => {
        const { personId, issuer, subject } = PINNED_CREDENTIAL;
        expect(await port.usageOfPerson(personId)).toMatchObject({ pinnedCredentials: 1 });
        expect(await port.removePerson(personId, false, seed.stamps[1])).toMatchObject({
          ok: false,
          reason: 'in_use',
          usage: { pinnedCredentials: 1, claims: [], assignments: [] },
        });
        expect(await port.credentialPinOf(issuer, subject)).toBe(personId);
        expect(await port.removePerson(personId, true, seed.stamps[1])).toMatchObject({
          ok: true,
        });
        expect((await port.listPeople()).map(({ id }) => id)).not.toContain(personId);
        expect(await port.credentialPinOf(issuer, subject)).toBeNull();
      },
    ),
  ];
}

/**
 * The claims both sources seed for `directory.removePerson:delegated-claims`:
 * the first person's subtree claim on one work item and the second person's
 * step claim delegated under it on another.
 */
export const DELEGATED_CLAIMS = [
  {
    id: 'claim-superagent',
    workItemId: 'work-a-one',
    stepId: null,
    personId: 'person-a',
    runId: null,
    parentClaimId: null,
    accountId: 'owner-a',
  },
  {
    id: 'claim-worker',
    workItemId: 'work-a-two',
    stepId: 'step-a-dev',
    personId: 'person-b',
    runId: 'agent:main:subagent:7f',
    parentClaimId: 'claim-superagent',
    accountId: 'owner-a',
  },
] as const;

/**
 * The claim both sources seed for `directory.removePerson:claims-in-use`: a
 * subtree claim of the seed's first person, so removing that person without
 * `cascade` is refused `in_use` rather than taking the claim silently.
 */
export const CLAIM_IN_USE = {
  id: 'claim-in-use',
  workItemId: 'work-a-one',
  stepId: null,
  personId: 'person-a',
  runId: null,
  parentClaimId: null,
  accountId: 'owner-a',
} as const;
