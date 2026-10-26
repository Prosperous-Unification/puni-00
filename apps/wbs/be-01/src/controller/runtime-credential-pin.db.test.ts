import type {
  CredentialAuthentication,
  RuntimeClaimRequest,
  RuntimeState,
  RuntimeWriteRequest,
} from '@wbs/contracts';
import { AuthService } from '@wbs/core/module/authentication/authentication.feature';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';

import { addAgentPerson } from '../testing/machine-credential-fixture';
import { type Answer, OrganizationHarness } from '../testing/organization-harness';

for (const kind of ['machine', 'consent'] as const) {
  describe(`verified ${kind} runtime person pin`, () => {
    let harness: OrganizationHarness;
    let projectId: string;
    let pinnedPersonId: string;
    let restorePrincipal: (() => void) | undefined;

    beforeEach(async () => {
      restorePrincipal = undefined;
      harness = OrganizationHarness.openComposed();
      await harness.register('ada');
      harness.organization('org-a');
      harness.member('org-a', 'ada', 'admin');
      harness.bind('ada', 'org-a');
      harness.activate();
      const created = await harness.call('ada', 'POST', '/api/projects', {
        name: 'Runtime pins',
      });
      expect(created.status).toBe(200);
      projectId = (created.body as { project: { id: string } }).project.id;
      for (const personId of ['agent-a', 'agent-b'])
        addAgentPerson(harness.sqlite, personId, 'org-a', harness.userId('ada'));
      harness.sqlite.run(
        "INSERT INTO step (id, project_id, name, position, code) VALUES ('dev', ?, 'Develop', 100, 'pin-dev')",
        [projectId],
      );
      harness.sqlite.run(
        "INSERT INTO work_item (id, project_id, position, name, readiness) VALUES ('leaf', ?, 10, 'Leaf', 'ready')",
        [projectId],
      );
      pinnedPersonId = 'agent-a';
      // Verified-principal dependency seam only: the mounted routes, current admission,
      // runtime receiver, command runner and SQLite stay real. This does not test cryptography.
      const principal = spyOn(AuthService.prototype, 'authenticateOrRefuse').mockImplementation(
        (token) => {
          if (token !== 'verified-runtime-principal')
            throw new Error('unexpected verified runtime fixture token');
          const authentication: CredentialAuthentication =
            kind === 'machine'
              ? { kind, credentialId: 'verified-machine', personId: pinnedPersonId }
              : {
                  kind,
                  issuer: 'https://human.test',
                  subject: 'human',
                  credentialId: 'verified-consent',
                  personId: pinnedPersonId,
                };
          return Promise.resolve({
            id: harness.userId('ada'),
            username: 'ada',
            scopes: ['read', 'write'],
            authentication,
            delegation:
              kind === 'machine'
                ? { organizationId: 'org-a', audience: 'wbs-be-01/direct' }
                : {
                    organizationId: 'org-a',
                    audience: 'wbs-be-01/via-mcp-01',
                    client: 'test-mcp',
                    grant: 'verified-family',
                  },
          });
        },
      );
      restorePrincipal = () => {
        principal.mockRestore();
      };
    });

    afterEach(async () => {
      restorePrincipal?.();
      await harness.closeComposed();
    });

    function callRuntime(method: string, suffix: string, body?: unknown): Promise<Answer> {
      return harness.callWith(
        'verified-runtime-principal',
        method,
        `/api/projects/${projectId}/${suffix}`,
        body,
      );
    }

    async function readState(personId: string): Promise<RuntimeState> {
      const answer = await callRuntime('GET', `runtime-state?personId=${personId}`);
      expect(answer.status).toBe(200);
      return answer.body as RuntimeState;
    }

    function snapshotDatabase() {
      return harness.sqlite.serialize();
    }

    async function refuseRequest(method: string, suffix: string, body?: unknown) {
      const before = snapshotDatabase();
      expect(await callRuntime(method, suffix, body)).toEqual({
        status: 403,
        body: { error: 'credential_not_for_person' },
      });
      expect(snapshotDatabase()).toEqual(before);
    }

    async function acquireAuthority(personId: string) {
      const observed = await readState(personId);
      const request = {
        schemaVersion: 1 as const,
        commandId: `authority-${personId}`,
        personId,
        expectedLedgerId: observed.ledgerId,
        ownerId: 'owner',
        expectedGeneration: null,
      };
      const answer = await callRuntime('POST', 'runtime-authority', request);
      expect(answer.status).toBe(200);
      return { observed, request };
    }

    async function createClaimRequest(personId: string) {
      const { observed } = await acquireAuthority(personId);
      const request: RuntimeClaimRequest & { personId: string } = {
        schemaVersion: 1,
        commandId: `claim-${personId}`,
        personId,
        expectedLedgerId: observed.ledgerId,
        authority: { ownerId: 'owner', generation: 1 },
        expectedBasis: observed.basis,
        action: {
          kind: 'claim',
          workItemId: 'leaf',
          stepId: 'dev',
          parentClaimId: null,
          execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
        },
      };
      return request;
    }

    async function createWriteRequest(personId: string) {
      const claimRequest = await createClaimRequest(personId);
      const accepted = await callRuntime('POST', 'runtime-commands', claimRequest);
      expect(accepted.status).toBe(200);
      const receipt = accepted.body as {
        acceptance: { claim: RuntimeWriteRequest['action']['claim'] };
      };
      const request: RuntimeWriteRequest & { personId: string } = {
        schemaVersion: 1,
        commandId: `write-${personId}`,
        personId,
        expectedLedgerId: claimRequest.expectedLedgerId,
        authority: claimRequest.authority,
        expectedBasis: (await readState(personId)).basis,
        action: {
          kind: 'write',
          claim: receipt.acceptance.claim,
          commands: [{ kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' }],
        },
      };
      return { claimRequest, request };
    }

    test('reads the matching agent and refuses another bound agent before returning facts', async () => {
      expect((await readState('agent-a')).scope.personId).toBe('agent-a');
      await refuseRequest('GET', 'runtime-state?personId=agent-b');
    });

    test('refuses authority acquisition for another bound agent without reserving history', async () => {
      const observed = await readState('agent-a');
      await refuseRequest('POST', 'runtime-authority', {
        schemaVersion: 1,
        commandId: 'forbidden-authority',
        personId: 'agent-b',
        expectedLedgerId: observed.ledgerId,
        ownerId: 'owner',
        expectedGeneration: null,
      });
      expect((await acquireAuthority('agent-a')).request.personId).toBe('agent-a');
    });

    test('refuses another bound agent before authority lookup and historical acquisition replay', async () => {
      pinnedPersonId = 'agent-b';
      const { request } = await acquireAuthority('agent-b');
      expect((await callRuntime('POST', 'runtime-authority', request)).status).toBe(200);
      pinnedPersonId = 'agent-a';
      await refuseRequest(
        'GET',
        `runtime-commands/${request.commandId}?personId=agent-b&expectedLedgerId=${request.expectedLedgerId}`,
      );
      await refuseRequest('POST', 'runtime-authority', request);
    });

    test('refuses another bound agent before a new claim writes its binding or receipt', async () => {
      pinnedPersonId = 'agent-b';
      const request = await createClaimRequest('agent-b');
      pinnedPersonId = 'agent-a';
      await refuseRequest('POST', 'runtime-commands', request);
      pinnedPersonId = 'agent-b';
      expect((await callRuntime('POST', 'runtime-commands', request)).status).toBe(200);
    });

    test('refuses another bound agent before a claimed write changes progress or history', async () => {
      pinnedPersonId = 'agent-b';
      const { request } = await createWriteRequest('agent-b');
      pinnedPersonId = 'agent-a';
      await refuseRequest('POST', 'runtime-commands', request);
      pinnedPersonId = 'agent-b';
      expect((await callRuntime('POST', 'runtime-commands', request)).status).toBe(200);
    });

    test('refuses another bound agent before retained claim and write replay or lookup', async () => {
      pinnedPersonId = 'agent-b';
      const { claimRequest, request } = await createWriteRequest('agent-b');
      expect((await callRuntime('POST', 'runtime-commands', request)).status).toBe(200);
      expect((await callRuntime('POST', 'runtime-commands', claimRequest)).status).toBe(200);
      pinnedPersonId = 'agent-a';
      for (const retained of [claimRequest, request]) {
        await refuseRequest('POST', 'runtime-commands', retained);
        await refuseRequest(
          'GET',
          `runtime-commands/${retained.commandId}?personId=agent-b&expectedLedgerId=${retained.expectedLedgerId}`,
        );
      }
    });
  });
}
