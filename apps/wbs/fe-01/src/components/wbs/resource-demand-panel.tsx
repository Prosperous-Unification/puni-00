import { Button, CONTROL_HEIGHT, Input } from '@ui/saas-01';
import { useEffect, useRef, useState } from 'react';

import { unitsWords } from '@/lib/compute-provider-words';
import type { DemandStatement, ProjectResourcesView } from '@/lib/wbs-api';

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from './modal';
import { refusalSentence } from './plan-refusal';
import type { RowDemand } from './resource-demand-words';

type CatalogResource = ProjectResourcesView['resources'][number];

/**
 * Where the directory's resources stand for the open panel. Every arm is a
 * rendered state: `loading` before the read answers, `failed` with the
 * refusal's sentence and a retry, `ready` with the catalog and this project's
 * stated capacities.
 */
type Catalog =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly sentence: string }
  | {
      readonly kind: 'ready';
      readonly resources: readonly CatalogResource[];
      readonly capacities: ReadonlyMap<string, number>;
    };

/** The row fields the panel reads: its identity and its own demands off the tree. */
export interface DemandPanelRow {
  readonly id: string;
  readonly number: string;
  readonly name: string;
  readonly demands: readonly RowDemand[];
}

export interface DemandPanelProps {
  row: DemandPanelRow;
  /** The project's resources read (`readProjectResources`); rejects with be-01's code. */
  read: () => Promise<ProjectResourcesView>;
  /**
   * Sends the changed demands as one batch through the plan's writer, so the
   * plan's Undo takes the edit back whole, answering the refusal's sentence or
   * null when it landed.
   */
  write: (statements: readonly DemandStatement[]) => Promise<string | null>;
  onOpenChange: (open: boolean) => void;
}

/** One resource's draft: the typed units of a divisible one, whether an exclusive one is needed. */
type Draft = Readonly<Partial<Record<string, string | boolean>>>;

/**
 * The statements a draft makes against the row's demands, one per resource
 * whose answer changed: `null` takes a demand off. A divisible box that is not
 * a number answers `invalid` naming the resource; be-01 keeps the rest of the
 * rule (whole, at least 1, at most its bound), so `0` and `1.5` are sent and
 * answered there.
 */
export function demandStatements(
  workItemId: string,
  resources: readonly CatalogResource[],
  demands: readonly RowDemand[],
  draft: Draft,
):
  | { readonly kind: 'statements'; readonly statements: DemandStatement[] }
  | { readonly kind: 'invalid'; readonly resourceName: string } {
  const held = new Map(demands.map((each) => [each.resourceId, each.units] as const));
  const statements: DemandStatement[] = [];
  for (const resource of resources) {
    const answer = draft[resource.id];
    if (answer === undefined) continue;
    let units: number | null;
    if (typeof answer === 'boolean') units = answer ? 1 : null;
    else if (answer.trim() === '') units = null;
    else {
      units = Number(answer.trim());
      // Proof: with this check removed, `says a box that is not a number in
      // place and sends nothing` (resource-demand-panel.test.tsx) failed: it
      // sent `units: NaN`, which JSON carries as `null`, a cleared demand;
      // watched 2026-10-25.
      if (!Number.isFinite(units)) return { kind: 'invalid', resourceName: resource.name };
    }
    if ((held.get(resource.id) ?? null) !== units)
      statements.push({ workItemId, resourceId: resource.id, units });
  }
  return { kind: 'statements', statements };
}

/** The draft a row's demands open the panel with. */
function draftOf(resources: readonly CatalogResource[], demands: readonly RowDemand[]): Draft {
  const held = new Map(demands.map((each) => [each.resourceId, each.units] as const));
  return Object.fromEntries(
    resources.map((resource) => {
      const units = held.get(resource.id);
      return [
        resource.id,
        resource.kind === 'exclusive'
          ? units !== undefined
          : units === undefined
            ? ''
            : String(units),
      ];
    }),
  );
}

/** What the project states of one resource, in words beside its box. */
function capacityWords(resource: CatalogResource, stated: number | undefined): string {
  if (stated === undefined) return 'Unstated by this project: nothing waits for it.';
  if (stated === 0) return 'This project states none: dates ignore it and no claim can hold it.';
  return `This project states ${unitsWords(stated, resource.unitLabel)}.`;
}

/**
 * A leaf's demands (`wbs-resources` 1.5): every resource of the directory,
 * with what this work item holds of it while any of its steps runs. An
 * exclusive resource is needed or not; a divisible one takes a number of its
 * units, blank for none. Save sends only what changed, as one batch, so the
 * plan's Undo takes the whole edit back; a refusal is said in place and the
 * panel stays open.
 *
 * A modal and not an in-cell editor, as the Measures panel is: a phone reaches
 * it from the row's menu, and a list of resources with a box each is not a
 * cell. Resources themselves are created, renamed and removed in the
 * project settings' Resources section.
 */
export function DemandPanel({ row, read, write, onOpenChange }: DemandPanelProps) {
  const [catalog, setCatalog] = useState<Catalog>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The row's demands seed the draft once per read, through a ref: a peer's
  // edit landing while the panel is open must not take the reader's typing.
  const seed = useRef(row.demands);
  seed.current = row.demands;

  useEffect(() => {
    let current = true;
    setCatalog({ kind: 'loading' });
    // Inside a promise, so a read that throws before it returns one is the
    // same rendered `failed` state as one that rejects.
    Promise.resolve()
      .then(read)
      .then(
        (answer) => {
          if (!current) return;
          const resources = [...answer.resources].sort((left, right) =>
            left.name.localeCompare(right.name),
          );
          setCatalog({
            kind: 'ready',
            resources,
            capacities: new Map(answer.capacities.map((each) => [each.resourceId, each.units])),
          });
          setDraft(draftOf(resources, seed.current));
        },
        (thrown: unknown) => {
          // A read answered after the panel closed or retried is dropped.
          if (!current) return;
          setCatalog({ kind: 'failed', sentence: refusalSentence(thrown) });
        },
      );
    return () => {
      current = false;
    };
  }, [read, attempt]);

  async function save(resources: readonly CatalogResource[]) {
    const planned = demandStatements(row.id, resources, row.demands, draft);
    if (planned.kind === 'invalid') {
      setProblem(`${planned.resourceName} takes a whole number of units, or blank for none.`);
      return;
    }
    if (planned.statements.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setProblem(null);
    const sentence = await write(planned.statements);
    setSaving(false);
    // Proof: with the refusal treated as landed, `says a refused save in
    // place and stays open` found no alert and a closed panel; watched 2026-10-25.
    if (sentence === null) onOpenChange(false);
    else setProblem(sentence);
  }

  const title = `Resources for ${row.number}`;
  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-lg" data-demand-panel={row.id}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>
            {row.name === '' ? 'This work item' : row.name} — what it holds while any of its steps
            runs. Rows needing more than the project states wait for each other, and a claim holds
            these units until it is released.
          </ModalDescription>
        </ModalHeader>
        {catalog.kind === 'loading' && (
          <p role="status" className="text-muted-foreground text-sm">
            Reading this directory’s resources…
          </p>
        )}
        {catalog.kind === 'failed' && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-destructive m-0 text-sm">
              {catalog.sentence}
            </p>
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => {
                setAttempt((count) => count + 1);
              }}
            >
              Retry resources
            </Button>
          </div>
        )}
        {catalog.kind === 'ready' && catalog.resources.length === 0 && (
          <p
            data-demands-empty
            className="bg-muted/50 text-muted-foreground rounded-md p-3 text-sm"
          >
            This directory holds no resources yet. Add a host’s RAM, a staging environment or agent
            slots in Project settings → Resources, then state here what this work needs.
          </p>
        )}
        {catalog.kind === 'ready' && catalog.resources.length > 0 && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save(catalog.resources);
            }}
          >
            <ul
              className="divide-border m-0 flex list-none flex-col divide-y p-0"
              aria-label="Resources"
            >
              {catalog.resources.map((resource) => {
                const boxId = `demand-${row.id}-${resource.id}`;
                const answer = draft[resource.id];
                const note = capacityWords(resource, catalog.capacities.get(resource.id));
                return (
                  <li
                    key={resource.id}
                    aria-label={resource.name}
                    data-demand-resource={resource.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
                  >
                    <div className="flex min-w-0 flex-1 basis-48 flex-col">
                      <label
                        htmlFor={boxId}
                        className="text-sm font-medium [overflow-wrap:anywhere]"
                      >
                        {resource.name}
                      </label>
                      <span id={`${boxId}-note`} className="text-muted-foreground text-xs">
                        {resource.kind === 'exclusive' ? 'One at a time. ' : ''}
                        {note}
                      </span>
                    </div>
                    {resource.kind === 'exclusive' ? (
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <input
                          id={boxId}
                          type="checkbox"
                          aria-describedby={`${boxId}-note`}
                          aria-label={`${resource.name} needed by ${row.number}`}
                          className="size-4"
                          checked={answer === true}
                          disabled={saving}
                          onChange={(event) => {
                            const needed = event.currentTarget.checked;
                            setDraft((current) => ({ ...current, [resource.id]: needed }));
                          }}
                        />
                        Needed
                      </label>
                    ) : (
                      <span className="flex items-center gap-2 text-sm">
                        <Input
                          id={boxId}
                          inputMode="numeric"
                          aria-describedby={`${boxId}-note`}
                          aria-label={`${resource.name} units for ${row.number}`}
                          placeholder="none"
                          className={`${CONTROL_HEIGHT} w-24 text-right tabular-nums`}
                          value={typeof answer === 'string' ? answer : ''}
                          disabled={saving}
                          onChange={(event) => {
                            const typed = event.currentTarget.value;
                            setDraft((current) => ({ ...current, [resource.id]: typed }));
                          }}
                        />
                        <span className="text-muted-foreground min-w-8">{resource.unitLabel}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {problem !== null && (
              <p role="alert" className="text-destructive m-0 text-sm">
                {problem}
              </p>
            )}
            <ModalFooter>
              <ModalClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </ModalClose>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save resources'}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalContent>
    </Modal>
  );
}
