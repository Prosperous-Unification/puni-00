import { Button, CONTROL_HEIGHT, Input, SELECT_CLASS } from '@ui/saas-01';
import {
  applyDirectoryCommands,
  applyProjectCommands,
  type ClientReply,
  listComputeProviders,
  readProjectResources,
  readStartableWork,
} from '@wbs/contracts';
import { type SyntheticEvent, useCallback, useEffect, useId, useRef, useState } from 'react';

import { type ComputeProvider } from '@/components/organization/compute-providers-panel';
import { providerKindName, readReport, unitsWords } from '@/lib/compute-provider-words';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { type BatchRefusal, batchRefusalSentence } from './plan-refusal';
import { ResourceUsesPanel } from './resource-uses-panel';
import type { SettingsSectionReport } from './teams-panel';

const RESOURCE_SHAPES = [
  readProjectResources,
  readStartableWork,
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

/**
 * What claims hold of each stated resource right now, off the startable read
 * (`wbs-resources` R6): `read` with capacity, occupied and free units per
 * stated resource; `unreported` from a be-01 whose startable read carries no
 * `resources` (an outgoing one mid-swap); `unavailable` when that read failed.
 * Optional on purpose: the declared numbers stand without it, and the section
 * says the holdings are missing rather than showing none.
 */
type Occupancy =
  | {
      readonly kind: 'read';
      readonly byResource: ReadonlyMap<string, { occupied: number; free: number }>;
    }
  | { readonly kind: 'unreported' }
  | { readonly kind: 'unavailable' };

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | {
      kind: 'ready';
      resources: readonly ProjectResource[];
      declared: ReadonlyMap<string, number>;
      providers: ProviderChoice;
      occupancy: Occupancy;
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
 *
 * **Managing the directory's resources** (`wbs-resources` 1.5): Add creates
 * one (`createResource`, its kind fixed for life), Edit renames it or changes
 * its unit label (`patchResource`), Remove deletes it (`deleteResource`) and,
 * when demands, capacities or claims still name it, says so with the counts
 * and offers to remove it with them (`cascade`). The declared box states this
 * project's capacity by hand (`setResourceCapacity`, blank for unstated).
 * Every refusal is said in place, a role that may not change the directory
 * included; nothing is hidden by role but the provider picker, whose list
 * only an admin may read.
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
  /** A removal be-01 refused `in_use`, held until it is confirmed with cascade or kept. */
  const [removal, setRemoval] = useState<Removal | null>(null);
  /**
   * Where a removed resource stood in the list, so the keyboard lands on the
   * row that took its place (its Edit), or on the Add form's name when it was
   * the last, rather than on the page once its row unmounts.
   */
  const [removedAt, setRemovedAt] = useState<number | null>(null);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (removedAt === null || view.kind !== 'ready') return;
    const root = section.current;
    if (root === null) return;
    const edits = root.querySelectorAll<HTMLElement>('[data-resource-edit]');
    const target =
      removedAt < edits.length
        ? edits.item(removedAt)
        : root.querySelector<HTMLElement>('[data-new-resource-name]');
    target?.focus();
    setRemovedAt(null);
  }, [removedAt, view]);
  const [busy, setBusy] = useState(false);
  const [usesDirty, setUsesDirty] = useState(false);
  const [usesBusy, setUsesBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fault, setFault] = useState<Error | null>(null);
  const isPending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    onDirtyChange(busy || usesDirty);
    onBusyChange?.(busy || usesBusy);
  }, [busy, usesDirty, usesBusy, onDirtyChange, onBusyChange]);
  useEffect(
    () => () => {
      onDirtyChange(false);
      onBusyChange?.(false);
    },
    [onDirtyChange, onBusyChange],
  );

  const read = useCallback(
    async (version: number) => {
      const [listed, instances, startable] = await Promise.all([
        client.getApiProjectsByIdResources({ params: { id: projectId } }),
        isOrganization ? client['getApiOrganizationCompute-providers']({}) : null,
        client.getApiProjectsByIdStartable({ params: { id: projectId }, query: {} }),
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
      if (startable.kind === 'failure' && startable.failure.code === 'cancelled') return;
      // Proof: 2026-10-25, reading a failed startable read as `read` with no
      // entries failed `says the holdings are missing when the startable read
      // fails` on `Unable to find an element with the text: What claims hold…`:
      // the section said nothing was missing.
      // Proof: 2026-10-25, reading an absent `resources` as an empty list
      // failed `says a server that reports no holdings`: the rows read as if
      // nothing were held, with no word about it.
      const occupancy: Occupancy =
        startable.kind === 'success' && startable.body.resources === undefined
          ? { kind: 'unreported' }
          : startable.kind === 'success'
            ? {
                kind: 'read',
                byResource: new Map(
                  (startable.body.resources ?? []).map((each) => [
                    each.resourceId,
                    { occupied: each.occupied, free: each.free },
                  ]),
                ),
              }
            : { kind: 'unavailable' };
      setNow(Date.now());
      setView({
        kind: 'ready',
        resources: listed.body.resources,
        declared,
        providers,
        occupancy,
      });
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
    after: {
      replans: boolean;
      resourceName: string;
      /** Says a refusal this caller models itself; false leaves it to the generic sentence. */
      onRefusal?: (refusal: BatchRefusal) => boolean;
    },
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
          if (version === generation.current && after.onRefusal?.(reply.body) !== true)
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

  function directory(
    command: Parameters<typeof client.postApiDirectoryCommands>[0]['body']['commands'][number],
    resourceName: string,
    onRefusal?: (refusal: BatchRefusal) => boolean,
  ): Promise<boolean> {
    setAdoption(null);
    return write(() => client.postApiDirectoryCommands({ body: { commands: [command] } }), {
      replans: command.kind === 'deleteResource',
      resourceName,
      onRefusal: (refusal) => {
        if (onRefusal?.(refusal) === true) return true;
        const sentence = directoryRefusalSentence(refusal);
        if (sentence === null) return false;
        setMessage(sentence);
        return true;
      },
    });
  }

  async function create(draft: ResourceDraft): Promise<boolean> {
    return directory(
      {
        kind: 'createResource',
        name: draft.name.trim(),
        resourceKind: draft.kind,
        unitLabel: draft.unitLabel.trim(),
      },
      draft.name.trim(),
    );
  }

  function rename(resource: ProjectResource, name: string, unitLabel: string): Promise<boolean> {
    return directory(
      {
        kind: 'patchResource',
        resourceId: resource.id,
        patch: { name: name.trim(), unitLabel: unitLabel.trim() },
      },
      resource.name,
    );
  }

  /** Records where a removed resource stood, for the focus to land beside it. */
  function landAfterRemoving(resource: ProjectResource) {
    // Proof: 2026-10-25, without this, `lands on the next resource after a
    // removal` found the focus on the page body.
    if (view.kind === 'ready')
      setRemovedAt(view.resources.findIndex(({ id }) => id === resource.id));
  }

  /**
   * One step of removing a resource. `ask` only opens the confirm, which says
   * the removal cannot be undone. `confirm` sends the plain delete; be-01
   * refuses one still in use `in_use` with the counts and the projects using
   * it, which the row then shows. `cascade` re-checks first: it sends the
   * plain delete again and sends `cascade` only when be-01 answers the usage
   * that was shown, so nothing added since the reader looked is taken with it
   * unseen. be-01 has no conditional cascade, so a use landing between the two
   * requests is the one window left.
   */
  async function remove(resource: ProjectResource, step: 'ask' | 'confirm' | 'cascade') {
    // Proof: 2026-10-25, with `ask` sending the delete at once, `removes an
    // unused resource only after a confirm naming its provider link` failed:
    // one click removed it, with no word that it cannot be undone.
    if (step === 'ask') {
      setRemoval({ resourceId: resource.id, stage: 'confirm' });
      return;
    }
    const shown =
      removal?.resourceId === resource.id && removal.stage === 'in_use' ? removal : null;
    const answered: { inUse: InUse | null } = { inUse: null };
    const removed = await directory(
      { kind: 'deleteResource', resourceId: resource.id },
      resource.name,
      (refusal) => {
        // Proof: 2026-10-25, with this arm answering false, `names what still
        // uses a resource and removes it with them on confirm` failed on
        // `Unable to find role="alert"` in the row: only the generic sentence
        // stood below the list, with no counts and no confirm.
        if (refusal.error !== 'in_use' || refusal.counts === undefined) return false;
        answered.inUse = { counts: refusal.counts, usage: refusal.usage };
        return true;
      },
    );
    if (removed) {
      setRemoval(null);
      landAfterRemoving(resource);
      return;
    }
    const inUse = answered.inUse;
    if (inUse === null) return;
    if (step === 'cascade' && shown !== null && sameUse(shown, inUse)) {
      if (
        await directory(
          { kind: 'deleteResource', resourceId: resource.id, cascade: true },
          resource.name,
        )
      ) {
        setRemoval(null);
        landAfterRemoving(resource);
      }
      return;
    }
    // Proof: 2026-10-25, with the cascade sent without this re-check, `asks
    // again when what uses a resource changed since it was shown` failed: it
    // sent `cascade: true` over the newly added demand.
    setRemoval({
      resourceId: resource.id,
      stage: 'in_use',
      ...inUse,
      changed: step === 'cascade',
    });
  }

  function stateCapacity(resource: ProjectResource, typed: string): Promise<boolean> {
    const trimmed = typed.trim();
    // Proof: 2026-10-25, without this check `says a capacity that is not a
    // number in place` failed on `Unable to find role="alert"`: `NaN` went out
    // as JSON `null`, which clears the statement to unstated. With
    // `Number.isFinite` in place of the digits test, the same case's `0x10`
    // went out as 16; watched 2026-10-25.
    // Proof: 2026-10-25, without `isSafeInteger` the same case's 400 nines went
    // out as `Infinity`, which JSON carries as `null`: unstated.
    if (trimmed !== '' && (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)))) {
      setMessage(
        `The declared capacity of ${resource.name} is a whole number, or blank for unstated.`,
      );
      return Promise.resolve(false);
    }
    setAdoption(null);
    return setCapacity(resource, trimmed === '' ? null : Number(trimmed));
  }

  return (
    // No heading of its own: the tab names the section, as every other (F-122).
    <div ref={section} className="flex flex-col gap-3">
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
      {view.kind === 'ready' && view.occupancy.kind === 'unavailable' && (
        <p data-occupancy="unavailable" className="text-muted-foreground m-0 text-sm">
          What claims hold right now could not be read; the declared numbers below are current.
        </p>
      )}
      {view.kind === 'ready' && view.occupancy.kind === 'unreported' && (
        <p data-occupancy="unreported" className="text-muted-foreground m-0 text-sm">
          This server does not report what claims hold; the declared numbers below are current.
        </p>
      )}
      {view.kind === 'ready' &&
        (view.resources.length === 0 ? (
          <p className="m-0 text-sm">
            This directory holds no resources yet. Add a host’s RAM, a staging environment or agent
            slots below, then state on each row what its work needs.
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
                held={
                  view.occupancy.kind === 'read'
                    ? (view.occupancy.byResource.get(resource.id) ?? 'not_reported')
                    : null
                }
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
                removal={removal?.resourceId === resource.id ? removal : null}
                onRename={(name, unitLabel) => rename(resource, name, unitLabel)}
                projectId={projectId}
                onRemove={(step) => {
                  observe(remove(resource, step), 'removal');
                }}
                onKeep={() => {
                  setRemoval(null);
                }}
                onCapacity={(typed) => stateCapacity(resource, typed)}
              />
            ))}
          </ul>
        ))}
      {message !== '' && (
        <p role="alert" className="text-destructive m-0 text-sm">
          {message}
        </p>
      )}
      {view.kind === 'ready' && <NewResourceForm busy={busy} onCreate={create} />}
      <ResourceUsesPanel
        projectId={projectId}
        shown={shown}
        onDirtyChange={setUsesDirty}
        onBusyChange={setUsesBusy}
      />
    </div>
  );
}

/** What the Add form holds: a new resource's name, kind and unit label. */
interface ResourceDraft {
  readonly name: string;
  readonly kind: 'exclusive' | 'divisible';
  readonly unitLabel: string;
}

const EMPTY_DRAFT: ResourceDraft = { name: '', kind: 'divisible', unitLabel: '' };

type InUseRefusal = Extract<BatchRefusal, { error: 'in_use' }>;

/** What uses a resource, as be-01's `in_use` refusal names it. */
interface InUse {
  readonly counts: NonNullable<InUseRefusal['counts']>;
  readonly usage: InUseRefusal['usage'];
}

/**
 * A removal under way on one row: the plain confirm (`confirm`), or what be-01
 * said still uses it (`in_use`), `changed` when that differs from what the
 * reader was shown before.
 */
type Removal =
  | { readonly resourceId: string; readonly stage: 'confirm' }
  | (InUse & { readonly resourceId: string; readonly stage: 'in_use'; readonly changed: boolean });

/** Whether two `in_use` answers name the same uses. */
function sameUse(left: InUse, right: InUse): boolean {
  return (
    JSON.stringify([left.counts, left.usage.projects]) ===
    JSON.stringify([right.counts, right.usage.projects])
  );
}

/**
 * Where a resource is used, by project: `this project (2 work items)` first,
 * then each other project by name. Empty when no work item uses it.
 */
export function usagePlaces(usage: InUse['usage'], projectId: string): string {
  const items = (count: number) => `${String(count)} work item${count === 1 ? '' : 's'}`;
  const places = [...usage.projects]
    .sort((left, right) => Number(right.id === projectId) - Number(left.id === projectId))
    .map((project) =>
      project.id === projectId
        ? `this project (${items(project.workItems.length)})`
        : `“${project.name}” (${items(project.workItems.length)})`,
    );
  return places.length <= 1
    ? (places[0] ?? '')
    : `${places.slice(0, -1).join(', ')} and ${places.at(-1) ?? ''}`;
}

/**
 * A directory command's refusal in words where resources say it their own
 * way: a role that may not change the directory, a name already held, no name.
 * Null for the rest, which read as the plan says them.
 */
function directoryRefusalSentence(refusal: BatchRefusal): string | null {
  switch (refusal.error) {
    case 'forbidden':
      return 'Your role cannot change this organization’s resources. Ask an admin. Nothing was changed.';
    case 'taken':
      return `A resource named “${refusal.name}” already exists. Nothing was changed.`;
    case 'name_required':
      return 'A resource needs a name. Nothing was changed.';
    default:
      return null;
  }
}

/** `2 demands, 1 capacity and 0 claims`, the counts a removal would take with it. */
export function usageWords(counts: InUse['counts']): string {
  const each = (count: number, one: string, many: string) =>
    `${String(count)} ${count === 1 ? one : many}`;
  return `${each(counts.demands, 'demand', 'demands')}, ${each(counts.capacities, 'capacity', 'capacities')} and ${each(counts.occupancies, 'claim holding it', 'claims holding it')}`;
}

/**
 * Adds a resource to the directory. The form keeps what was typed until the
 * create lands, so a refused name can be corrected rather than retyped.
 */
function NewResourceForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (draft: ResourceDraft) => Promise<boolean>;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ResourceDraft>(EMPTY_DRAFT);
  // Labels point at their controls by id rather than wrapping them: a label
  // wrapping the kind picker named it with every option's words too.
  const ids = useId();
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (draft.name.trim() === '') return;
    void onCreate(draft).then((created) => {
      if (created) setDraft(EMPTY_DRAFT);
    });
  };
  return (
    <form
      aria-label="Add a resource"
      onSubmit={submit}
      className="border-border flex flex-col gap-2 rounded-md border border-dashed p-3"
    >
      <span className="text-sm font-medium">Add a resource</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <span className="flex min-w-0 flex-col gap-1 text-xs">
          <label htmlFor={`${ids}-name`} className="text-muted-foreground">
            Name
          </label>
          <Input
            data-new-resource-name=""
            id={`${ids}-name`}
            className={CONTROL_HEIGHT}
            value={draft.name}
            placeholder="h2puni ram"
            disabled={busy}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setDraft((current) => ({ ...current, name }));
            }}
          />
        </span>
        <span className="flex min-w-0 flex-col gap-1 text-xs">
          <label htmlFor={`${ids}-kind`} className="text-muted-foreground">
            Kind
          </label>
          <select
            id={`${ids}-kind`}
            className={`${SELECT_CLASS} w-full`}
            value={draft.kind}
            disabled={busy}
            onChange={(event) => {
              const kind = event.currentTarget.value === 'exclusive' ? 'exclusive' : 'divisible';
              setDraft((current) => ({ ...current, kind }));
            }}
          >
            <option value="divisible">Divisible</option>
            <option value="exclusive">Exclusive</option>
          </select>
        </span>
        <span className="flex min-w-0 flex-col gap-1 text-xs">
          <label htmlFor={`${ids}-unit`} className="text-muted-foreground">
            Unit
          </label>
          <Input
            id={`${ids}-unit`}
            className={CONTROL_HEIGHT}
            value={draft.unitLabel}
            placeholder={draft.kind === 'exclusive' ? 'env' : 'GB'}
            disabled={busy}
            onChange={(event) => {
              const unitLabel = event.currentTarget.value;
              setDraft((current) => ({ ...current, unitLabel }));
            }}
          />
        </span>
      </div>
      <p className="text-muted-foreground m-0 text-xs">
        Divisible: work takes some of its units, such as GB of RAM or agent slots. Exclusive: one
        work item at a time, such as a staging environment. The kind never changes once it is added.
      </p>
      <Button
        type="submit"
        variant="outline"
        className="self-start"
        disabled={busy || draft.name.trim() === ''}
      >
        Add resource
      </Button>
    </form>
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
  held = null,
  providers,
  now,
  busy,
  adoption,
  onAdopt,
  onUndo,
  onProvider,
  removal = null,
  projectId = '',
  onRename,
  onRemove,
  onKeep,
  onCapacity,
}: {
  resource: ProjectResource;
  declared: number | null;
  /**
   * What claims of this project hold of it now, against its stated capacity;
   * `not_reported` when the read lists no line for it; null when unread.
   */
  held?: { occupied: number; free: number } | 'not_reported' | null;
  providers: ProviderChoice;
  now: number;
  busy: boolean;
  adoption: Adoption | null;
  onAdopt: (units: number) => void;
  onUndo: (adoption: Adoption) => void;
  onProvider: (providerId: string | null) => void;
  /** A removal under way on this row, or null. */
  removal?: Removal | null;
  /** The project whose settings show the row, named `this project` in the usage. */
  projectId?: string;
  /** Renames the resource or changes its unit label; answers whether it landed. */
  onRename?: (name: string, unitLabel: string) => Promise<boolean>;
  /** Removes the resource; `cascade` takes what still uses it with it. */
  onRemove?: (step: 'ask' | 'confirm' | 'cascade') => void;
  onKeep?: () => void;
  /** States this project's capacity from the typed box, blank for unstated. */
  onCapacity?: (typed: string) => Promise<boolean>;
}): React.JSX.Element {
  const isAdmin = providers.kind === 'named';
  const [editing, setEditing] = useState<{ name: string; unitLabel: string } | null>(null);
  const editIds = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  /**
   * Where the keyboard goes once the control it was on unmounts: the edit
   * form's name, the Edit button after the form closes, Remove after a removal
   * is kept. A removal opening takes it to Keep, the harmless answer.
   */
  const [focusAfter, setFocusAfter] = useState<'name' | 'edit' | 'remove' | null>(null);
  useEffect(() => {
    const target =
      focusAfter === 'name'
        ? nameBox.current
        : focusAfter === 'edit'
          ? editButton.current
          : focusAfter === 'remove'
            ? removeButton.current
            : null;
    if (target === null) return;
    target.focus();
    setFocusAfter(null);
  }, [focusAfter, editing, removal]);
  const removalStage = removal?.stage ?? null;
  useEffect(() => {
    if (removalStage !== null) keepButton.current?.focus();
  }, [removalStage]);
  const [capacity, setCapacity] = useState<string | null>(null);
  const reading =
    resource.providerId === null ? null : readReport(resource.report, resource.unitLabel, now);
  const pickerId = `resource-provider-${resource.id}`;
  return (
    <li
      className="flex min-w-0 flex-col gap-2 py-3"
      aria-label={resource.name}
      data-report={reading?.state ?? 'none'}
    >
      {editing === null ? (
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span
              id={`resource-name-${resource.id}`}
              className="font-medium [overflow-wrap:anywhere]"
            >
              {resource.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {resource.kind === 'exclusive' ? 'Exclusive — one at a time' : 'Divisible'}
              {resource.unitLabel === '' ? '' : ` · ${resource.unitLabel}`}
            </span>
          </span>
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
      ) : (
        <form
          aria-label={`Edit ${resource.name}`}
          className="flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (onRename === undefined || editing.name.trim() === '') return;
            void onRename(editing.name, editing.unitLabel).then((renamed) => {
              if (!renamed) return;
              setFocusAfter('edit');
              setEditing(null);
            });
          }}
        >
          <span className="flex min-w-0 flex-1 basis-40 flex-col gap-1 text-xs">
            <label htmlFor={`${editIds}-name`} className="text-muted-foreground">
              Name
            </label>
            <Input
              ref={nameBox}
              id={`${editIds}-name`}
              className={CONTROL_HEIGHT}
              value={editing.name}
              disabled={busy}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setEditing((current) => (current === null ? null : { ...current, name }));
              }}
            />
          </span>
          <span className="flex w-28 flex-col gap-1 text-xs">
            <label htmlFor={`${editIds}-unit`} className="text-muted-foreground">
              Unit
            </label>
            <Input
              id={`${editIds}-unit`}
              className={CONTROL_HEIGHT}
              value={editing.unitLabel}
              disabled={busy}
              onChange={(event) => {
                const unitLabel = event.currentTarget.value;
                setEditing((current) => (current === null ? null : { ...current, unitLabel }));
              }}
            />
          </span>
          <Button type="submit" size="sm" disabled={busy || editing.name.trim() === ''}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setFocusAfter('edit');
              setEditing(null);
            }}
          >
            Cancel
          </Button>
        </form>
      )}
      {held === 'not_reported' && declared !== null && (
        <span data-held="not_reported" className="text-muted-foreground text-xs">
          No holdings were reported for it.
        </span>
      )}
      {held !== null && held !== 'not_reported' && declared !== null && (
        <div data-held={resource.id} className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap justify-between gap-x-2 text-xs tabular-nums">
            <span>
              {held.occupied === 0
                ? 'No claim holds any now'
                : `Claims hold ${unitsWords(held.occupied, resource.unitLabel)}`}
            </span>
            <span
              className={held.free === 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}
            >
              {unitsWords(held.free, resource.unitLabel)} free
            </span>
          </span>
          {declared > 0 && (
            <span aria-hidden="true" className="bg-muted block h-1.5 overflow-hidden rounded-full">
              <span
                className={`block h-full rounded-full ${held.free === 0 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${String(Math.min(100, (held.occupied / declared) * 100))}%` }}
              />
            </span>
          )}
        </div>
      )}
      {/* The project's number and the instance that fulfils it, side by side where they fit. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
        {onCapacity !== undefined && (
          <form
            className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (capacity === null) return;
              void onCapacity(capacity).then((stated) => {
                if (stated) setCapacity(null);
              });
            }}
          >
            <label
              id={`resource-capacity-label-${resource.id}`}
              htmlFor={`resource-capacity-${resource.id}`}
              className="text-muted-foreground"
            >
              This project may use
            </label>
            <Input
              id={`resource-capacity-${resource.id}`}
              inputMode="numeric"
              // The visible label first, then whose number it is (WCAG 2.5.3):
              // `This project may use h2puni ram`.
              aria-labelledby={`resource-capacity-label-${resource.id} resource-name-${resource.id}`}
              className={`${CONTROL_HEIGHT} w-24 text-right tabular-nums`}
              placeholder="unstated"
              value={capacity ?? (declared === null ? '' : String(declared))}
              disabled={busy}
              onChange={(event) => {
                setCapacity(event.currentTarget.value);
              }}
            />
            <span className="text-muted-foreground">{resource.unitLabel}</span>
            {capacity !== null && (
              <Button type="submit" size="sm" variant="outline" disabled={busy}>
                State
              </Button>
            )}
          </form>
        )}
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
            <span
              className="text-muted-foreground"
              title={`Compute provider ${resource.providerId}`}
            >
              Fulfilled by a compute provider
            </span>
          )}
        </div>
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
      {removal !== null && (
        <div
          role="alert"
          data-removal={removal.stage}
          className="border-destructive/40 bg-destructive/5 flex flex-col gap-2 rounded-md border px-3 py-2 text-sm"
        >
          {removal.stage === 'confirm' ? (
            <span>
              Remove {resource.name} from the directory? Every project loses it, and it cannot be
              undone: the plan’s Undo does not reach the directory
              {resource.providerId === null ? '' : ', and its compute provider link goes with it'}.
            </span>
          ) : (
            <span className="flex flex-col gap-1">
              {removal.changed && (
                <strong className="font-medium">
                  What uses {resource.name} changed since you were shown. Check it again.
                </strong>
              )}
              <span>
                {resource.name} is still used by {usageWords(removal.counts)}.
                {/* `usage` places demands only; capacities and claims are counted, not placed. */}
                {removal.usage.projects.length === 0
                  ? ''
                  : ` Its demands are in ${usagePlaces(removal.usage, projectId)}.`}{' '}
                Capacities and claims are counted across every project. Removing it with them takes
                all of these away, and cannot be undone.
              </span>
              {removal.counts.occupancies > 0 && (
                <span>
                  {removal.counts.occupancies === 1
                    ? '1 live claim holds it: its agent keeps the claim but no longer holds these units.'
                    : `${String(removal.counts.occupancies)} live claims hold it: their agents keep the claims but no longer hold these units.`}
                </span>
              )}
            </span>
          )}
          <span className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                onRemove?.(removal.stage === 'confirm' ? 'confirm' : 'cascade');
              }}
            >
              {removal.stage === 'confirm' ? `Remove ${resource.name}` : 'Remove with them'}
            </Button>
            <Button
              ref={keepButton}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setFocusAfter('remove');
                onKeep?.();
              }}
            >
              Keep {resource.name}
            </Button>
          </span>
        </div>
      )}
      {editing === null && (onRename !== undefined || onRemove !== undefined) && (
        <div className="flex flex-wrap gap-2">
          {onRename !== undefined && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              ref={editButton}
              data-resource-edit=""
              aria-label={`Edit ${resource.name}`}
              onClick={() => {
                setFocusAfter('name');
                setEditing({ name: resource.name, unitLabel: resource.unitLabel });
              }}
            >
              Edit
            </Button>
          )}
          {onRemove !== undefined && removal === null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              ref={removeButton}
              aria-label={`Remove ${resource.name}`}
              onClick={() => {
                onRemove('ask');
              }}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
