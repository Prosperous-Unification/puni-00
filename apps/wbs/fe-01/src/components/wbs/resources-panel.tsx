import { Button, SELECT_CLASS } from '@ui/saas-01';
import {
  applyDirectoryCommands,
  applyProjectCommands,
  type ClientReply,
  listComputeProviders,
  readProjectResources,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type ComputeProvider } from '@/components/organization/compute-providers-panel';
import { providerKindName, readReport, unitsWords } from '@/lib/compute-provider-words';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { batchRefusalSentence } from './plan-refusal';
import type { SettingsSectionReport } from './teams-panel';

const RESOURCE_SHAPES = [
  readProjectResources,
  listComputeProviders,
  applyProjectCommands,
  applyDirectoryCommands,
] as const;

type ResourcesRead = Extract<ClientReply<typeof readProjectResources>, { kind: 'success' }>['body'];
/** One resource of the caller's directory as the project resources read answers it. */
export type ProjectResource = ResourcesRead['resources'][number];

/** How long a shown section waits before it reads the reports' ages again. */
const TICK_MS = 30_000;

/**
 * The organization's provider instances as this viewer may name them: listed
 * for an admin (`named`); never listed for a member or viewer, whose read is
 * refused `forbidden`, nor without organizations (`unnamed`); or a failed
 * read (`unavailable`), which leaves the references unnamed and unchangeable.
 */
type ProviderChoice =
  | { readonly kind: 'named'; readonly providers: readonly ComputeProvider[] }
  | { readonly kind: 'unnamed' }
  | { readonly kind: 'unavailable'; readonly message: string };

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | {
      kind: 'ready';
      resources: readonly ProjectResource[];
      declared: ReadonlyMap<string, number>;
      providers: ProviderChoice;
    };

/**
 * An adoption that landed. Held while the project's declared number is still
 * the adopted one: a reread that finds another number (someone else stated
 * it since) drops it, so Undo never writes the old number over theirs.
 */
interface Adoption {
  readonly resourceId: string;
  readonly name: string;
  readonly units: number;
  readonly unitLabel: string;
  /** What this project stated before, null when it was unstated. */
  readonly previous: number | null;
}

export interface ResourcesPanelProps extends SettingsSectionReport {
  projectId: string;
  /** Whether its tab is in front: the section reads its resources each time it is shown. */
  shown: boolean;
  /** Re-reads the plan after a capacity statement, which may move its dates. */
  onChanged: () => Promise<void>;
}

/**
 * The resources this project's directory holds (`compute-providers` P7, P12):
 * what the project declares of each, the compute provider instance that
 * fulfils it, and that instance's latest capacity report read on this
 * section's own clock, so a report goes stale here without a reread.
 *
 * **Declared wins** (P7). A report is shown, never planned with; the only way a
 * measurement reaches the plan is **Adopt**, an admin's explicit
 * `setResourceCapacity` with the measured units, offered on a fresh
 * measurement that differs from the declared number. `setResourceCapacity` is
 * not journalled, so the plan's Undo cannot take it back: this section's own
 * Undo writes the previous statement back, or clears it to unstated.
 *
 * Admin rights are read off the providers list, which be-01 answers only to
 * an admin: a `forbidden` there is a member or viewer, who sees each reference
 * unnamed and is offered neither the picker nor Adopt.
 *
 * Read only while shown, and again each time its tab comes to the front: the
 * section stays mounted and `hidden` like every other, and a plan nobody
 * opened Resources on sends no resources request.
 */
export function ResourcesPanel({
  projectId,
  shown,
  onChanged,
  onDirtyChange,
  onBusyChange,
}: ResourcesPanelProps): React.JSX.Element {
  const client = useResourceClient(RESOURCE_SHAPES);
  const scope = useResourceScope();
  const isOrganization = scope.organization.kind === 'active';
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [message, setMessage] = useState('');
  const [adoption, setAdoption] = useState<Adoption | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fault, setFault] = useState<Error | null>(null);
  const isPending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    onDirtyChange(busy);
    onBusyChange?.(busy);
  }, [busy, onDirtyChange, onBusyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      onBusyChange?.(false);
    },
    [onDirtyChange, onBusyChange],
  );

  const read = useCallback(
    async (version: number) => {
      const [listed, instances] = await Promise.all([
        client.getApiProjectsByIdResources({ params: { id: projectId } }),
        isOrganization ? client['getApiOrganizationCompute-providers']({}) : null,
      ]);
      if (version !== generation.current) return;
      switch (listed.kind) {
        case 'success':
          break;
        case 'failure':
          if (listed.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(listed.failure) });
          return;
        case 'refusal':
          setView({ kind: 'failure', message: resourcesReadSentence(listed.body) });
          return;
        default:
          return unreachable(listed);
      }
      let providers: ProviderChoice = { kind: 'unnamed' };
      if (instances !== null) {
        switch (instances.kind) {
          case 'success':
            providers = { kind: 'named', providers: instances.body.computeProviders };
            break;
          case 'failure':
            if (instances.failure.code === 'cancelled') return;
            providers = { kind: 'unavailable', message: failureMessage(instances.failure) };
            break;
          case 'refusal':
            // Proof: 2026-10-23, treating `forbidden` as unavailable failed
            // `shows a member each reference unnamed, with no picker and no adopt`:
            // a member saw a failure sentence for a read their role never makes.
            providers =
              instances.body.error === 'forbidden'
                ? { kind: 'unnamed' }
                : {
                    kind: 'unavailable',
                    message: 'Compute providers could not be read, so references cannot change.',
                  };
            break;
          default:
            return unreachable(instances);
        }
      }
      const declared = new Map(
        listed.body.capacities.map((entry) => [entry.resourceId, entry.units]),
      );
      setAdoption((current) =>
        current !== null && declared.get(current.resourceId) !== current.units ? null : current,
      );
      setNow(Date.now());
      setView({ kind: 'ready', resources: listed.body.resources, declared, providers });
    },
    [client, projectId, isOrganization],
  );

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setView((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    await read(version);
  }, [read]);

  const observe = useCallback((work: Promise<void>, what: string) => {
    void work.catch((cause: unknown) => {
      setFault(new Error(`Unexpected resources ${what} failure`, { cause }));
    });
  }, []);

  useEffect(() => {
    if (!shown) return;
    setMessage('');
    observe(refresh(), 'read');
    // Proof: 2026-10-23, without this interval `goes stale on its own clock
    // without a reread` kept reading `measured` 30 s past the boundary.
    const tick = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    const version = generation;
    return () => {
      clearInterval(tick);
      version.current++;
    };
  }, [shown, refresh, observe]);
  if (fault !== null) throw fault;

  /** Sends one batch, rereads on success, and says a refusal in place. */
  async function write(
    send: () => Promise<
      ClientReply<typeof applyProjectCommands> | ClientReply<typeof applyDirectoryCommands>
    >,
    after: { replans: boolean; resourceName: string },
  ): Promise<boolean> {
    // Proof: 2026-10-23, removing this admission sent two `setResourceCapacity`
    // in `adopts once however often it is clicked`.
    if (isPending.current) return false;
    isPending.current = true;
    setBusy(true);
    setMessage('');
    const version = ++generation.current;
    try {
      const reply = await send();
      switch (reply.kind) {
        case 'success':
          if (after.replans) await onChanged();
          if (version === generation.current) await read(version);
          return true;
        case 'failure':
          if (version === generation.current && reply.failure.code !== 'cancelled')
            setMessage(failureMessage(reply.failure));
          return false;
        case 'refusal':
          // Proof: 2026-10-23, treating a refused adopt as landed failed `says a
          // refused adopt in place and offers no undo`: the undo line appeared.
          if (version === generation.current)
            setMessage(batchRefusalSentence(reply.body, after.resourceName));
          return false;
        default:
          return unreachable(reply);
      }
    } finally {
      isPending.current = false;
      setBusy(false);
    }
  }

  function setCapacity(resource: ProjectResource, units: number | null) {
    return write(
      () =>
        client.postApiProjectsByIdCommands({
          params: { id: projectId },
          body: { commands: [{ kind: 'setResourceCapacity', resourceId: resource.id, units }] },
        }),
      { replans: true, resourceName: resource.name },
    );
  }

  async function adopt(resource: ProjectResource, units: number, previous: number | null) {
    setAdoption(null);
    if (await setCapacity(resource, units))
      setAdoption({
        resourceId: resource.id,
        name: resource.name,
        units,
        unitLabel: resource.unitLabel,
        previous,
      });
  }

  async function undo(adopted: Adoption, resource: ProjectResource) {
    if (await setCapacity(resource, adopted.previous)) setAdoption(null);
  }

  function setProvider(resource: ProjectResource, providerId: string | null) {
    setAdoption(null);
    observe(
      write(
        () =>
          client.postApiDirectoryCommands({
            body: {
              commands: [{ kind: 'patchResource', resourceId: resource.id, patch: { providerId } }],
            },
          }),
        { replans: false, resourceName: resource.name },
      ).then(() => undefined),
      'provider change',
    );
  }

  return (
    // No heading of its own: the tab names the section, as every other (F-122).
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground m-0 text-sm">
        What this project declares of each resource, beside what its compute provider last measured.
        The plan uses only the declared number; adopting a measurement states it.
        {view.kind === 'ready' && view.providers.kind === 'named' && (
          <>
            {' '}
            A resource’s compute provider is the directory’s: changing it here changes it for every
            project.
          </>
        )}
      </p>
      {(view.kind === 'idle' || view.kind === 'loading') && (
        <p className="text-sm">Loading resources…</p>
      )}
      {view.kind === 'failure' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive m-0 text-sm">
            {view.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => {
              observe(refresh(), 'retry');
            }}
          >
            Retry resources
          </Button>
        </div>
      )}
      {view.kind === 'ready' && view.providers.kind === 'unavailable' && (
        // Proof: 2026-10-23, reading a failed instances read as `unnamed`
        // failed `renders a failed instances read with retry, and recovers`.
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-destructive m-0 text-sm">
            {view.providers.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={busy}
            onClick={() => {
              observe(refresh(), 'retry');
            }}
          >
            Retry resources
          </Button>
        </div>
      )}
      {view.kind === 'ready' &&
        (view.resources.length === 0 ? (
          <p className="m-0 text-sm">
            This directory holds no resources yet. Agents add them with the{' '}
            <code>createResource</code> directory command.
          </p>
        ) : (
          <ul
            className="divide-border m-0 flex list-none flex-col divide-y p-0"
            aria-label="Resources"
          >
            {view.resources.map((resource) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                declared={view.declared.get(resource.id) ?? null}
                providers={view.providers}
                now={now}
                busy={busy}
                adoption={
                  // Proof: 2026-10-23, with both this comparison and the drop in
                  // `read` removed, `offers no undo once another writer stated a
                  // different number` showed Undo over the other writer's 20 GB.
                  adoption?.resourceId === resource.id &&
                  view.declared.get(resource.id) === adoption.units
                    ? adoption
                    : null
                }
                onAdopt={(units) => {
                  observe(adopt(resource, units, view.declared.get(resource.id) ?? null), 'adopt');
                }}
                onUndo={(adopted) => {
                  observe(undo(adopted, resource), 'undo');
                }}
                onProvider={(providerId) => {
                  setProvider(resource, providerId);
                }}
              />
            ))}
          </ul>
        ))}
      {message !== '' && (
        <p role="alert" className="text-destructive m-0 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

/** A refused resources read in words; every arm is a page fault or a lost organization. */
function resourcesReadSentence(
  refusal: Extract<ClientReply<typeof readProjectResources>, { kind: 'refusal' }>['body'],
): string {
  switch (refusal.error) {
    case 'not_found':
      return 'This project is no longer here — someone may have deleted it.';
    case 'unauthenticated':
      return 'Your session ended. Sign in again to see the resources.';
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return 'Your organization changed. Reload before reading the resources again.';
    case 'sso_required':
    case 'reauthentication_required':
      return 'Your organization asks you to sign in again before reading the resources.';
    case 'invalid_params':
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
      return 'The request could not be understood. Reload and try again.';
    default:
      return unreachable(refusal);
  }
}

/**
 * One resource: its declared number, the instance that fulfils it, and that
 * instance's latest report as {@link readReport} reads it at `now`.
 *
 * @throws When the report's outcome is a kind the contract does not have,
 * which reaches the Error Boundary (`compute-providers` P12).
 */
export function ResourceRow({
  resource,
  declared,
  providers,
  now,
  busy,
  adoption,
  onAdopt,
  onUndo,
  onProvider,
}: {
  resource: ProjectResource;
  declared: number | null;
  providers: ProviderChoice;
  now: number;
  busy: boolean;
  adoption: Adoption | null;
  onAdopt: (units: number) => void;
  onUndo: (adoption: Adoption) => void;
  onProvider: (providerId: string | null) => void;
}): React.JSX.Element {
  const isAdmin = providers.kind === 'named';
  const reading =
    resource.providerId === null ? null : readReport(resource.report, resource.unitLabel, now);
  const pickerId = `resource-provider-${resource.id}`;
  return (
    <li
      className="flex min-w-0 flex-col gap-2 py-3"
      aria-label={resource.name}
      data-report={reading?.state ?? 'none'}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium [overflow-wrap:anywhere]">{resource.name}</span>
        <span className="text-sm tabular-nums">
          {declared === null ? (
            <span className="text-muted-foreground">Unstated</span>
          ) : (
            <>
              <span className="text-muted-foreground">Declared </span>
              {unitsWords(declared, resource.unitLabel)}
            </>
          )}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {isAdmin ? (
          <>
            <label htmlFor={pickerId} className="text-muted-foreground">
              Compute provider
            </label>
            <select
              id={pickerId}
              aria-label={`Compute provider of ${resource.name}`}
              className={`${SELECT_CLASS} max-w-full`}
              value={resource.providerId ?? ''}
              disabled={busy}
              onChange={(event) => {
                onProvider(event.target.value === '' ? null : event.target.value);
              }}
            >
              <option value="">None</option>
              {providers.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({providerKindName(provider.kind)})
                </option>
              ))}
            </select>
          </>
        ) : resource.providerId === null ? (
          <span className="text-muted-foreground">No compute provider</span>
        ) : (
          // Unnamed: only an admin reads the instances, and the resources read
          // carries the id alone.
          <span className="text-muted-foreground" title={`Compute provider ${resource.providerId}`}>
            Fulfilled by a compute provider
          </span>
        )}
      </div>
      {reading !== null && (
        <div
          data-report-box=""
          className={
            reading.state === 'measured'
              ? 'bg-muted/40 flex min-w-0 flex-col gap-1 rounded-md px-3 py-2'
              : 'border-border flex min-w-0 flex-col gap-1 rounded-md border border-dashed px-3 py-2'
          }
        >
          <span
            className={
              reading.state === 'unreachable'
                ? 'text-destructive text-sm font-medium'
                : 'text-sm font-medium'
            }
          >
            {reading.headline}
          </span>
          <span className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
            {reading.detail}
          </span>
          {isAdmin &&
            reading.state === 'measured' &&
            reading.capacityUnits !== declared &&
            adoption === null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 self-start"
                disabled={busy}
                aria-label={`Adopt ${unitsWords(reading.capacityUnits, resource.unitLabel)} as the declared capacity of ${resource.name}`}
                onClick={() => {
                  onAdopt(reading.capacityUnits);
                }}
              >
                Adopt {unitsWords(reading.capacityUnits, resource.unitLabel)}
              </Button>
            )}
        </div>
      )}
      {adoption !== null && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Declared {unitsWords(adoption.units, adoption.unitLabel)} from the measurement (was{' '}
            {adoption.previous === null
              ? 'unstated'
              : unitsWords(adoption.previous, adoption.unitLabel)}
            ).
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label={`Undo adopting the measurement of ${adoption.name}`}
            onClick={() => {
              onUndo(adoption);
            }}
          >
            Undo
          </Button>
        </div>
      )}
    </li>
  );
}
