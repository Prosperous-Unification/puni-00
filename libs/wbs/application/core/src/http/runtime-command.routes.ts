import {
  acquireRuntimeAuthority,
  applyProjectCommands,
  applyRuntimeCommands,
  type ClaimReceipt,
  commandParserRefusal,
  lookupRuntimeReceipt,
  readRuntimeState,
  type Refusal,
  type RuntimeCommandRefusal,
  type RuntimeReceipt,
  type RuntimeReply,
  type RuntimeState,
  validateSchema,
  type WriteReceipt,
} from '@wbs/contracts';

import type { PlanCommandRunner } from '../module/plan-commands/plan-commands.feature';
import type { RuntimeReceiver } from '../module/plan-commands/runtime-authority';
import type { OrganizationAccess } from '../ports/organization-access';
import { CommandNormalizationError, normalizeCommand } from '../service/command-normalizers';
import { hasRepeatedKey } from '../service/list-query';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Translates modeled runtime outcomes; trusted producer/store failures remain exceptions. */
async function answerRuntime<T extends RuntimeReceipt | RuntimeState>(outcome: RuntimeReply<T>) {
  if (outcome.ok) return { ok: true, status: 200, body: outcome.value } as const;
  if ('error' in outcome)
    return { ok: false, status: 403, body: { error: outcome.error } } as const;
  if ('at' in outcome) return answerCommandRefusal(outcome);
  switch (outcome.reason) {
    case 'runtime_scope_unavailable':
      return { ok: false, status: 403, body: { error: outcome.reason } } as const;
    case 'forbidden':
      return { ok: false, status: 403, body: { error: outcome.reason } } as const;
    case 'person_not_bound':
      return { ok: false, status: 403, body: { error: outcome.reason } } as const;
    case 'credential_not_for_person':
      return { ok: false, status: 403, body: { error: outcome.reason } } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: outcome.reason } } as const;
    case 'unknown_person':
      return { ok: false, status: 404, body: { error: outcome.reason } } as const;
    case 'runtime_receipt_not_found':
      return { ok: false, status: 404, body: { error: outcome.reason } } as const;
    case 'runtime_command_target_mismatch':
    case 'runtime_command_not_supported':
      return { ok: false, status: 400, body: { error: outcome.reason } } as const;
    case 'runtime_generation_conflict':
    case 'runtime_authority_stale':
    case 'runtime_revision_conflict':
    case 'runtime_claim_mismatch':
    case 'runtime_claim_unmanaged':
    case 'runtime_attempt_bound':
    case 'runtime_command_conflict':
    case 'runtime_ledger_mismatch':
      return { ok: false, status: 409, body: { error: outcome.reason } } as const;
  }
}

/** Existing closed declarations own the status and required holder/resource detail. */
async function answerCommandRefusal(
  outcome: RuntimeCommandRefusal,
): Promise<Extract<HttpReply<typeof applyProjectCommands>, { ok: false }>> {
  const body = { error: outcome.reason, at: outcome.at, kind: outcome.kind, ...outcome.detail };
  for (const declaration of applyProjectCommands.refusals) {
    const checked = await validateSchema<Refusal>(declaration.schema, body);
    // Proof: P6-14 bypassed this validation; malformed trusted holder detail
    // lost this producer diagnostic and reached the mounted response backstop.
    if (checked.issues === undefined) {
      // This heterogeneous table boundary has validated the body against the
      // very declaration supplying its status, preserving their correlation.
      return { ok: false, status: declaration.status, body: checked.value } as Extract<
        HttpReply<typeof applyProjectCommands>,
        { ok: false }
      >;
    }
  }
  throw new Error('invalid runtime command refusal producer');
}

/** The complete runtime channel shares ordinary current access, semantic parsers and admission. */
export function runtimeCommandRoutes(
  receiver: RuntimeReceiver,
  commands: PlanCommandRunner,
  organizations: OrganizationAccess,
) {
  return [
    bind(
      readRuntimeState,
      async ({
        params,
        query,
        principal,
        request: metadata,
      }): Promise<HttpReply<typeof readRuntimeState>> => {
        // Proof: P6-12 omitted this check; duplicate personId returned 200 instead of 400.
        if (hasRepeatedKey(metadata.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const { personId, ...request } = query;
        return answerRuntime(
          await receiver.readRuntimeState(
            { projectId: params.id, personId, actor: principal, access: resolved.access },
            request,
          ),
        );
      },
    ),
    bind(
      acquireRuntimeAuthority,
      async ({ params, body, principal }): Promise<HttpReply<typeof acquireRuntimeAuthority>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const { personId, ...request } = body;
        return answerRuntime(
          await receiver.acquireRuntimeAuthority(
            { projectId: params.id, personId, actor: principal, access: resolved.access },
            request,
          ),
        );
      },
    ),
    bind(
      applyRuntimeCommands,
      async ({ params, body, principal }): Promise<HttpReply<typeof applyRuntimeCommands>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // The mounted shape has validated the complete body before personId is removed.
        const { personId, ...request } = body;
        if (request.action.kind === 'write') {
          for (const [at, command] of request.action.commands.entries()) {
            try {
              normalizeCommand(command.kind, { ...command });
            } catch (cause) {
              if (!(cause instanceof CommandNormalizationError)) throw cause;
              const checked = await validateSchema(commandParserRefusal, {
                error: cause.reason,
                at,
                kind: command.kind,
              });
              // Proof: P6-15 omitted this guard; the unregistered-parser test
              // received the mounted response diagnostic instead of this one.
              if (checked.issues !== undefined)
                throw new Error('invalid runtime parser refusal', { cause });
              return { ok: false, status: 400, body: checked.value };
            }
          }
        }
        const context = {
          projectId: params.id,
          personId,
          actor: principal,
          access: resolved.access,
        };
        return answerRuntime<ClaimReceipt | WriteReceipt>(
          request.action.kind === 'claim'
            ? await commands.claimRuntime(context, { ...request, action: request.action })
            : await commands.writeRuntime(context, { ...request, action: request.action }),
        );
      },
    ),
    bind(
      lookupRuntimeReceipt,
      async ({
        params,
        query,
        principal,
        request: metadata,
      }): Promise<HttpReply<typeof lookupRuntimeReceipt>> => {
        // Proof: P6-13 omitted this check; duplicate receipt query returned 404 instead of 400.
        if (hasRepeatedKey(metadata.url))
          return { ok: false, status: 400, body: { error: 'invalid_query' } };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        return answerRuntime(
          await receiver.lookupRuntimeReceipt(
            {
              projectId: params.id,
              personId: query.personId,
              actor: principal,
              access: resolved.access,
            },
            { commandId: params.commandId, expectedLedgerId: query.expectedLedgerId },
          ),
        );
      },
    ),
  ] as const;
}
