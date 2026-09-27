import {
  listExternalSystems,
  listPeople,
  listServices,
  listTags,
  listTeams,
  listWorkItemTypes,
} from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { DirectoryService } from '../service/directory.service';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Reads the directory through the caller's organization access: the whole
 * deployment's before activation, the active organization's own after it.
 * Organization authority is resolved before any read, so an unbound or removed
 * caller learns nothing about the directory.
 * Proof: listing tags without resolving access made `refuses an unbound
 * session and a removed member on every list` in
 * `directory-organization.controller.db.test.ts` answer 200; watched 2026-09-27. Identity and
 * structural admission belong to the mounted declarations; service failures
 * propagate so an unavailable directory cannot appear empty.
 * Proof: catching listTeams as [] returned200 instead of500 in the mounted
 * damaged-directory case. Removing the external-systems binding returned404
 * instead of401 in the mounted identity/query case (directory.controller.db.test.ts).
 */
export function directoryRoutes(directory: DirectoryService, organizations: OrganizationAccess) {
  return [
    bind(listTeams, async ({ principal }): Promise<HttpReply<typeof listTeams>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { teams: await directory.listWithin('teams', resolved.access) },
      };
    }),
    bind(listPeople, async ({ principal }): Promise<HttpReply<typeof listPeople>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { people: await directory.listWithin('people', resolved.access) },
      };
    }),
    bind(listTags, async ({ principal }): Promise<HttpReply<typeof listTags>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { tags: await directory.listWithin('tags', resolved.access) },
      };
    }),
    bind(listServices, async ({ principal }): Promise<HttpReply<typeof listServices>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { services: await directory.listWithin('services', resolved.access) },
      };
    }),
    bind(listWorkItemTypes, async ({ principal }): Promise<HttpReply<typeof listWorkItemTypes>> => {
      const resolved = await organizations.resolve(principal.id);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      return {
        ok: true,
        status: 200,
        body: { workItemTypes: await directory.listWithin('workItemTypes', resolved.access) },
      };
    }),
    bind(
      listExternalSystems,
      async ({ principal }): Promise<HttpReply<typeof listExternalSystems>> => {
        const resolved = await organizations.resolve(principal.id);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        return {
          ok: true,
          status: 200,
          body: { externalSystems: await directory.listWithin('externalSystems', resolved.access) },
        };
      },
    ),
  ] as const;
}
