import { Button } from '@ui/saas-01';
import { type ClientReply, readOrganizationLimits } from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { type AccessLoss, lostAccess, READ_ONLY, RELOAD } from './organization-access';
import type { OrganizationRole, RoleView } from './organization-role';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  LIST_CLASS,
  OrganizationSection,
  STATUS_CLASS,
} from './organization-section';

const LIMIT_SHAPES = [readOrganizationLimits] as const;

/** The read's answer: the three caps, their source, and the usage beside each. */
export type OrganizationLimitsRead = Extract<
  ClientReply<typeof readOrganizationLimits>,
  { kind: 'success' }
>['body'];
type Refusal = Extract<ClientReply<typeof readOrganizationLimits>, { kind: 'refusal' }>['body'];

/**
 * The panel's state. `absent` is the read's `forbidden`: a role that lost
 * admin between the role read and this one sees no panel, not an error (L14).
 */
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'absent' }
  | { kind: 'ready'; limits: OrganizationLimitsRead };

/**
 * Where a count stands against its cap. `over` is reachable: an operator may
 * lower a cap below what the organization already holds, and nothing held is
 * taken away (`organization-limits`, lowering a cap).
 */
type Standing = 'under' | 'at' | 'over';

function standingOf(used: number, cap: number): Standing {
  // Proof: 2026-10-22, comparing with `>=` failed `marks a count over its cap
  // exceeded and one at its cap as at the cap`: 8 of 8 read `Exceeded`.
  if (used > cap) return 'over';
  return used === cap ? 'at' : 'under';
}

/** Whether `role` reads the limits: admins and super-admins do, members and viewers never ask. */
export function readsLimits(role: OrganizationRole): boolean {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return true;
    case 'member':
    case 'viewer':
      return false;
    default:
      return unreachable(role);
  }
}

/**
 * The limits panel once the caller's role is known (`wbs-organization-limits`
 * L14): nothing without organizations or for a member or viewer, who send no
 * limits request at all; a rendered failure with retry when the role cannot be
 * read; the panel for an admin or super-admin. `role` is the page's one
 * {@link useOrganizationRole} read, shared with the machine credentials slot.
 */
export function LimitsSlot({
  role,
  onAccessLost,
}: {
  role: RoleView;
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  switch (role.kind) {
    case 'legacy':
    case 'withdrawn':
      return null;
    case 'loading':
      return <p className={STATUS_CLASS}>Loading organization limits…</p>;
    case 'failure':
      // Proof: 2026-10-22, rendering nothing here failed `renders a failed role
      // read with retry, and recovers`: no alert and no retry were drawn.
      return (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT_CLASS}>
            {role.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={role.retry}
          >
            Retry organization limits
          </Button>
        </div>
      );
    case 'ready':
      // Proof: 2026-10-22, rendering the panel for every role failed `sends no
      // limits request and renders no panel for a member or a viewer`: the
      // member's page sent `GET /api/organization/limits`.
      return readsLimits(role.role) ? <LimitsPanel onAccessLost={onAccessLost} /> : null;
    default:
      return unreachable(role);
  }
}

/**
 * The active organization's caps with usage beside each, read only
 * (`wbs-organization-limits` L8, L14): an operator changes them by CLI (L12),
 * so the panel offers a refresh and no edit control.
 */
export function LimitsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element | null {
  const client = useResourceClient(LIMIT_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);
  const requestVersion = useRef(0);

  const processRefusal = useCallback(
    (refusal: Refusal) => {
      switch (refusal.error) {
        case 'unauthenticated':
        case 'organization_context_changed':
        case 'no_active_organization':
        case 'not_a_member': {
          const outcome = lostAccess(refusal.error);
          if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
          onAccessLost(outcome.loss);
          return;
        }
        case 'sso_required':
        case 'reauthentication_required': {
          const outcome = lostAccess(refusal);
          if (outcome.kind !== 'lost') throw new Error('Unexpected credential outcome');
          onAccessLost(outcome.loss);
          return;
        }
        case 'forbidden':
          // Proof: 2026-10-22, rendering this as a failure failed `renders no
          // panel when the read answers forbidden`: the alert stood in its place.
          setView({ kind: 'absent' });
          return;
        case 'insufficient_scope':
          setView({ kind: 'failure', message: READ_ONLY });
          return;
        case 'invalid_query':
        case 'invalid_body':
          setView({ kind: 'failure', message: RELOAD });
          return;
        default:
          return unreachable(refusal);
      }
    },
    [onAccessLost],
  );

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setView({ kind: 'loading' });
    const reply = await client.getApiOrganizationLimits({});
    // Proof: 2026-10-22, removing this fence failed `never shows the previous
    // organization's numbers after a switch`: org-a's late 7 of 8 replaced
    // org-b's 1 of 8.
    if (version !== requestVersion.current) return;
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', limits: reply.body });
        return;
      case 'failure':
        if (reply.failure.code !== 'cancelled')
          setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal':
        processRefusal(reply.body);
        return;
      default:
        return unreachable(reply);
    }
  }, [client, processRefusal]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected organization limits read failure', { cause }));
    });
    const version = requestVersion;
    return () => {
      version.current++;
    };
  }, [refresh]);
  if (fault !== null) throw fault;
  if (view.kind === 'absent') return null;

  return (
    <OrganizationSection id="limits-heading" title="Organization limits">
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading organization limits…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && <LimitsReady limits={view.limits} />}
      <Button
        type="button"
        variant="outline"
        className={`self-start ${CONTROL_HEIGHT}`}
        disabled={view.kind === 'loading'}
        onClick={() => {
          void refresh().catch((cause: unknown) => {
            setFault(new Error('Unexpected organization limits refresh failure', { cause }));
          });
        }}
      >
        {view.kind === 'failure' ? 'Retry organization limits' : 'Refresh organization limits'}
      </Button>
    </OrganizationSection>
  );
}

/** Where the caps come from, in words. An unknown source is a contract fault and throws. */
function sourceSentence(source: OrganizationLimitsRead['source']): string {
  switch (source) {
    case 'default':
      return 'These are the deployment default limits: none are set for this organization.';
    case 'organization':
      return 'These limits are set for this organization.';
    default:
      // Proof: 2026-10-22, answering the default sentence here failed `routes
      // an impossible source to the Error Boundary`: the panel drew "deployment
      // default" for a source the contract does not have.
      return unreachable(source);
  }
}

/**
 * The ready panel: one row per cap, "7 of 8", and one line per resource the
 * organization states capacity of, each marked when at or over its cap.
 */
export function LimitsReady({ limits }: { limits: OrganizationLimitsRead }): React.JSX.Element {
  const capacityCap = limits.limits.maxCapacityUnitsPerResource;
  return (
    <>
      <p className={STATUS_CLASS}>{sourceSentence(limits.source)}</p>
      <ul className={`${LIST_CLASS} divide-border divide-y`} aria-label="Limits">
        <LimitRow
          label="Agent persons"
          used={limits.usage.agentPersons}
          cap={limits.limits.maxAgentPersons}
        />
        <LimitRow
          label="Concurrent claims"
          used={limits.usage.concurrentClaims}
          cap={limits.limits.maxConcurrentClaims}
        />
      </ul>
      <section aria-labelledby="limits-capacity-heading" className="flex flex-col gap-1">
        <h3 id="limits-capacity-heading" className="text-sm font-medium">
          Capacity units per resource (cap {capacityCap})
        </h3>
        {limits.usage.capacityUnits.length === 0 ? (
          <p className={STATUS_CLASS}>No project states a capacity of any resource yet.</p>
        ) : (
          <ul className={`${LIST_CLASS} divide-border divide-y`} aria-label="Capacity by resource">
            {limits.usage.capacityUnits.map((resource) => (
              <LimitRow
                key={resource.resourceId}
                label={resource.name}
                used={resource.units}
                cap={capacityCap}
                // A resource may carry an empty label; it then reads as a bare count.
                unit={resource.unitLabel === '' ? undefined : resource.unitLabel}
              />
            ))}
          </ul>
        )}
      </section>
      <p className="text-muted-foreground text-sm">
        An operator changes these limits; they cannot be edited here.
      </p>
    </>
  );
}

/** What a count at or over its cap is marked with. */
const STANDING_MARK: Record<Exclude<Standing, 'under'>, string> = {
  at: 'At the cap',
  over: 'Exceeded',
};

/** One cap's row: its name, "used of cap" with the unit when there is one, and its mark. */
function LimitRow({
  label,
  used,
  cap,
  unit,
}: {
  label: string;
  used: number;
  cap: number;
  /** The resource's unit label; absent for a count of persons or claims. */
  unit?: string;
}): React.JSX.Element {
  const standing = standingOf(used, cap);
  const amount = `${String(used)} of ${String(cap)}${unit === undefined ? '' : ` ${unit}`}`;
  return (
    <li
      className="flex flex-wrap items-baseline justify-between gap-2 py-2"
      data-standing={standing}
    >
      <span className="text-sm">{label}</span>
      <span className="flex items-baseline gap-2 text-sm tabular-nums">
        <span className={standing === 'over' ? 'text-destructive font-medium' : undefined}>
          {amount}
        </span>
        {standing !== 'under' && (
          <span
            className={
              standing === 'over'
                ? 'border-destructive text-destructive rounded border px-1.5 text-xs font-medium'
                : 'border-border text-muted-foreground rounded border px-1.5 text-xs'
            }
          >
            {STANDING_MARK[standing]}
          </span>
        )}
      </span>
    </li>
  );
}
