import { type ClientReply, readActiveOrganization, selectActiveOrganization } from '@wbs/contracts';

import type { DisclosedFault } from '@/components/chrome/fault-disclosure';
import { browserClient, failureMessage, unreachable } from '@/lib/http';
import { LEGACY_ORGANIZATION, type OrganizationRefusal } from '@/lib/organization-context';
import type { Store } from '@/modules/store';

import type { SessionIdentity, SessionOwner, SessionRuntime } from './session-runtime';

export type CurrentOrganization = Extract<
  ClientReply<typeof readActiveOrganization>,
  { kind: 'success' }
>['body'];

/** Browser control operations remain independent of any selected resource context. */
export interface OrganizationRoutes {
  readonly discover: () => Promise<ClientReply<typeof readActiveOrganization>>;
  readonly select: (
    organizationId: string,
  ) => Promise<ClientReply<typeof selectActiveOrganization>>;
}

/** Resource publication follows confirmation; every other state withdraws all organization panels. */
export type OrganizationState =
  | { readonly kind: 'loading' | 'switching' | 'selection' }
  | { readonly kind: 'legacy'; readonly runtime: SessionRuntime; readonly generation: number }
  | {
      readonly kind: 'active';
      readonly organization: CurrentOrganization;
      readonly runtime: SessionRuntime;
      readonly generation: number;
    }
  | { readonly kind: 'lost'; readonly refusal: OrganizationRefusal }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'fatal'; readonly fault: DisclosedFault };

export type OrganizationTransition = 'published' | 'refused' | 'fatal' | 'overtaken' | 'pending';

/** One account's organization transitions, including the retirement of its resource runtime. */
export interface OrganizationOwner extends Store<OrganizationState> {
  readonly legacy: () => Promise<OrganizationTransition>;
  readonly refresh: () => Promise<OrganizationTransition>;
  readonly choose: (organizationId: string) => Promise<OrganizationTransition>;
  readonly notice: (message: unknown) => Promise<OrganizationTransition>;
  readonly lose: (refusal: OrganizationRefusal) => void;
  readonly leave: () => Promise<void>;
}

/** The actual cookie-authenticated browser control client, with no expected-organization header. */
export function browserOrganizationRoutes(): OrganizationRoutes {
  const client = browserClient([readActiveOrganization, selectActiveOrganization]);
  return {
    discover: () => client.getApiOrganizationActive({}),
    select: (organizationId) => client.postApiOrganizationActive({ body: { organizationId } }),
  };
}

/**
 * Withdraws before selection, waits for retirement, then confirms the exact intended
 * organization. Generations fence every awaited continuation, including sign-out.
 * Notices are invalidation only: their payload never becomes selection authority.
 */
export function createOrganizationOwner({
  identity,
  sessions,
  routes = browserOrganizationRoutes(),
  announce = () => undefined,
  allowLegacy = false,
}: {
  identity: Pick<SessionIdentity, 'userId' | 'credential'>;
  sessions: SessionOwner;
  routes?: OrganizationRoutes;
  announce?: () => void;
  allowLegacy?: boolean;
}): OrganizationOwner {
  let state: OrganizationState = { kind: 'loading' };
  let generation = 0;
  let selecting = false;
  const pendingReconciliations: {
    resolve: (transition: OrganizationTransition) => void;
    reject: (cause: unknown) => void;
  }[] = [];
  const listeners = new Set<() => void>();
  const publish = (next: OrganizationState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  // Proof: accepting stale generations failed late discovery and sign-out confirmation tests (c2-fault-generation).
  const current = (turn: number) => generation === turn;
  const fatal = (): boolean => {
    const lifetime = sessions.snapshot();
    if (lifetime.status !== 'fatal') return false;
    publish({ kind: 'fatal', fault: lifetime.fault });
    return true;
  };
  const begin = (kind: 'loading' | 'switching') => {
    const turn = ++generation;
    const retirement = sessions.leave();
    publish({ kind });
    return { turn, retirement };
  };
  const retire = async (
    turn: number,
    retirement: Promise<void>,
  ): Promise<OrganizationTransition | null> => {
    // Proof: swallowing disposal failure in the underlying lifetime slot failed `failed retirement cannot publish the next organization` (c2-fault-retirement).
    await retirement;
    if (!current(turn)) return 'overtaken';
    return fatal() ? 'fatal' : null;
  };
  const install = async (
    turn: number,
    organization: CurrentOrganization | null,
  ): Promise<OrganizationTransition> => {
    await sessions.open({
      ...identity,
      organization:
        organization === null
          ? LEGACY_ORGANIZATION
          : { kind: 'active', organizationId: organization.organizationId },
      onRefusal: (refusal) => {
        owner.lose(refusal);
      },
    });
    if (!current(turn)) return 'overtaken';
    // Proof: a notice during held confirmation failed `a peer notice invalidates a held B confirmation before it can publish` when this fence was absent.
    if (selecting && pendingReconciliations.length > 0) return 'overtaken';
    if (fatal()) return 'fatal';
    const lifetime = sessions.snapshot();
    if (lifetime.status !== 'live')
      throw new Error('confirmed organization has no live resource runtime');
    publish(
      organization === null
        ? { kind: 'legacy', runtime: lifetime.services, generation: turn }
        : { kind: 'active', organization, runtime: lifetime.services, generation: turn },
    );
    return 'published';
  };
  const refuseDiscovery = (
    reply: Extract<ClientReply<typeof readActiveOrganization>, { kind: 'refusal' }>,
  ): OrganizationTransition => {
    switch (reply.body.error) {
      case 'no_active_organization':
        publish({ kind: 'selection' });
        return 'refused';
      case 'not_a_member':
      case 'organization_context_changed':
      case 'unauthenticated':
      case 'sso_required':
      case 'reauthentication_required':
        publish({ kind: 'lost', refusal: reply.body });
        return 'refused';
      case 'onboarding_inactive':
      case 'insufficient_scope':
      case 'invalid_query':
      case 'invalid_body':
        publish({
          kind: 'failure',
          message: 'Could not confirm your organization. Reload or check your context again.',
        });
        return 'refused';
      default:
        return unreachable(reply.body);
    }
  };
  const discover = async (turn: number, expected?: string): Promise<OrganizationTransition> => {
    const reply = await routes.discover();
    if (!current(turn)) return 'overtaken';
    switch (reply.kind) {
      case 'failure':
        publish({ kind: 'failure', message: failureMessage(reply.failure) });
        return 'refused';
      case 'refusal':
        if (reply.body.error === 'onboarding_inactive' && allowLegacy && expected === undefined)
          return install(turn, null);
        return refuseDiscovery(reply);
      case 'success':
        // Proof: accepting mismatched confirmation failed `a mismatched confirmation cannot publish the intended or previous organization` (c2-fault-confirmation).
        if (expected !== undefined && reply.body.organizationId !== expected) {
          publish({
            kind: 'failure',
            message:
              'Your organization changed during selection. Choose again or check your current context.',
          });
          return 'refused';
        }
        return install(turn, reply.body);
      default:
        return unreachable(reply);
    }
  };
  const reconcile = async (expected?: string): Promise<OrganizationTransition> => {
    const { turn, retirement } = begin('loading');
    const refused = await retire(turn, retirement);
    return refused ?? discover(turn, expected);
  };
  const owner: OrganizationOwner = {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    legacy: async () => {
      const { turn, retirement } = begin('loading');
      const refused = await retire(turn, retirement);
      return refused ?? install(turn, null);
    },
    refresh: async () => {
      // Proof: eager discovery failed `focus reconciliation cannot publish old A while a B selection is in flight` and restored A before the held POST settled.
      if (selecting)
        return new Promise<OrganizationTransition>((resolve, reject) => {
          pendingReconciliations.push({ resolve, reject });
        });
      return reconcile();
    },
    choose: async (organizationId) => {
      if (selecting) return 'pending';
      selecting = true;
      let selected = false;
      const { turn, retirement } = begin('switching');
      try {
        const refused = await retire(turn, retirement);
        if (refused !== null) return refused;
        const reply = await routes.select(organizationId);
        if (!current(turn)) return 'overtaken';
        switch (reply.kind) {
          case 'success':
            if (reply.body.organizationId !== organizationId) {
              publish({
                kind: 'failure',
                message: 'Selection returned another organization. Check your current context.',
              });
              return 'refused';
            }
            selected = true;
            announce();
            return await discover(turn, organizationId);
          case 'failure':
            publish({ kind: 'failure', message: failureMessage(reply.failure) });
            return 'refused';
          case 'refusal':
            // Proof: flattening this body failed `preserves the complete company sign-in refusal during selection` (received generic failure, not the validated login link).
            if (
              reply.body.error === 'sso_required' ||
              reply.body.error === 'reauthentication_required'
            ) {
              publish({ kind: 'lost', refusal: reply.body });
              return 'refused';
            }
            publish({ kind: 'failure', message: selectionWords(reply.body.error) });
            return 'refused';
          default:
            return unreachable(reply);
        }
      } finally {
        selecting = false;
        const waiting = pendingReconciliations.splice(0);
        if (waiting.length > 0) {
          if (selected && current(turn)) {
            // Proof: reconciling without the chosen ID failed the held-confirmation test by publishing peer C as confirmation of B.
            void reconcile(organizationId).then(
              (transition) => {
                for (const request of waiting) request.resolve(transition);
              },
              (cause: unknown) => {
                for (const request of waiting) request.reject(cause);
              },
            );
          } else {
            for (const request of waiting) request.resolve(current(turn) ? 'refused' : 'overtaken');
          }
        }
      }
    },
    // Proof: selecting org-b from a notice failed `cross-tab payload cannot select authority` (c2-fault-payload).
    notice: (_message) => owner.refresh(),
    lose: (refusal) => {
      ++generation;
      for (const request of pendingReconciliations.splice(0)) request.resolve('overtaken');
      const retirement = sessions.leave();
      publish({ kind: 'lost', refusal });
      const turn = generation;
      void retirement.then(() => {
        if (current(turn)) fatal();
      });
    },
    leave: async () => {
      const { turn, retirement } = begin('loading');
      for (const request of pendingReconciliations.splice(0)) request.resolve('overtaken');
      await retire(turn, retirement);
    },
  };
  return owner;
}

function selectionWords(
  code: Extract<ClientReply<typeof selectActiveOrganization>, { kind: 'refusal' }>['body']['error'],
): string {
  switch (code) {
    case 'sso_required':
      return 'This organization requires its company sign-in.';
    case 'reauthentication_required':
      return 'Sign in again before selecting this organization.';
    case 'no_active_organization':
      return 'Choose an organization to continue.';
    case 'not_a_member':
      return 'You no longer belong to that organization.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again.';
    case 'onboarding_inactive':
    case 'insufficient_scope':
    case 'invalid_origin':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_query':
    case 'organization_context_changed':
      return 'Could not select your organization. Check your current context and try again.';
    default:
      return unreachable(code);
  }
}
