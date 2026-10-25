import { Button, CONTROL_HEIGHT, Input } from '@ui/saas-01';
import { useEffect, useRef, useState } from 'react';

import { unitsWords } from '@/lib/compute-provider-words';
import { type DemandStatement, type ProjectResourcesView, WbsRequestError } from '@/lib/wbs-api';

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from './modal';
import {
  failureText,
  GONE,
  INVALID_REQUEST,
  isAmbiguousWriteFailure,
  refusalSentence,
} from './plan-refusal';
import { demandSummary, type RowDemand } from './resource-demand-words';

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
   * plan's Undo takes the edit back whole ({@link demandWriteOutcome}).
   */
  write: (statements: readonly DemandStatement[]) => Promise<DemandWriteOutcome>;
  onOpenChange: (open: boolean) => void;
}

/**
 * What a save came to: `landed`; `refused`, said in the panel alone with the
 * resource whose box be-01 refused when the refusal names its command; or
 * `reported`, a failure the plan writer toasts and rereads for (a row that is
 * gone, a body be-01 could not read, an outcome a transport left unknown), so
 * the panel adds nothing to it.
 */
export type DemandWriteOutcome =
  | { readonly kind: 'landed' }
  | { readonly kind: 'refused'; readonly sentence: string; readonly resourceId: string | null }
  | { readonly kind: 'reported' };

/**
 * How a thrown `setDemand` batch failure is reported: a refusal of the request
 * itself is the panel's to say ({@link DemandWriteOutcome} `refused`), once and
 * beside the box it names; everything that says the screen is behind stays the
 * writer's (`reported`). Unlike the Measures panel, which says a refusal in
 * place and lets the writer toast it too, this reports each failure once.
 */
export function demandWriteOutcome(
  thrown: unknown,
  statements: readonly DemandStatement[],
): DemandWriteOutcome {
  const code = failureText(thrown, '');
  // Proof: with `code === GONE` dropped, `hands a row a peer deleted to the
  // writer: toasted, reread, and the panel goes` failed: the panel said
  // `not_found` in place and nothing was toasted or read again; watched
  // 2026-10-25.
  if (
    !(thrown instanceof WbsRequestError) ||
    thrown.problem.kind !== 'refusal' ||
    isAmbiguousWriteFailure(thrown) ||
    code === GONE ||
    INVALID_REQUEST.has(code)
  )
    return { kind: 'reported' };
  const refusal: object = thrown.problem.refusal;
  const at = 'at' in refusal && typeof refusal.at === 'number' ? refusal.at : null;
  return {
    kind: 'refused',
    sentence: refusalSentence(thrown),
    resourceId: at === null ? null : (statements[at]?.resourceId ?? null),
  };
}

/** A typed units box: digits only, so `0x10`, `1e3` and `1.5` never reach a number. */
const WHOLE_UNITS = /^\d+$/;

/** One resource's draft: the typed units of a divisible one, whether an exclusive one is needed. */
type Draft = Readonly<Partial<Record<string, string | boolean>>>;

/**
 * The statements a draft makes against the demands the panel **opened with**
 * (`baseline`), one per resource whose box the reader changed: `null` takes a
 * demand off. Against the baseline and never the live row, so a peer's demand
 * that landed while the panel was open is sent back over only where the reader
 * changed that same box (there is no revision precondition on `setDemand`).
 * A divisible box that is not digits answers `invalid` naming the resource;
 * be-01 keeps the rest of the rule (at least 1, at most its bound), so `0` is
 * sent and answered there.
 */
export function demandStatements(
  workItemId: string,
  resources: readonly CatalogResource[],
  baseline: readonly RowDemand[],
  draft: Draft,
):
  | { readonly kind: 'statements'; readonly statements: DemandStatement[] }
  | { readonly kind: 'invalid'; readonly resourceName: string } {
  const held = new Map(baseline.map((each) => [each.resourceId, each.units] as const));
  const statements: DemandStatement[] = [];
  for (const resource of resources) {
    const answer = draft[resource.id];
    if (answer === undefined) continue;
    let units: number | null;
    if (typeof answer === 'boolean') units = answer ? 1 : null;
    else if (answer.trim() === '') units = null;
    else {
      // Proof: with this check removed, `says a box that is not a number in
      // place and sends nothing` (resource-demand-panel.test.tsx) failed: it
      // sent `units: NaN`, which JSON carries as `null`, a cleared demand;
      // watched 2026-10-25. With `Number.isFinite` in place of the digits
      // test, `refuses hexadecimal and exponent units in place` failed: `0x10`
      // went out as 16; watched 2026-10-25.
      if (!WHOLE_UNITS.test(answer.trim())) return { kind: 'invalid', resourceName: resource.name };
      units = Number(answer.trim());
      // Proof: without this check, `refuses hexadecimal and exponent units in
      // place` failed on 400 nines: `Number` read them as `Infinity`, which
      // JSON carries as `null`, a cleared demand; watched 2026-10-25.
      if (!Number.isSafeInteger(units)) return { kind: 'invalid', resourceName: resource.name };
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
  const [problem, setProblem] = useState<{
    readonly sentence: string;
    readonly resourceId: string | null;
  } | null>(null);
  /** The demands the open panel was seeded with, what a save is diffed against. */
  const [baseline, setBaseline] = useState<readonly RowDemand[]>([]);
  /**
   * Whether this reader's own last save was handed to the writer with its
   * outcome unknown (`reported`): the plan read that follows may hold that very
   * save, so the baseline follows the row from then on rather than calling the
   * difference somebody else's.
   */
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    if (uncertain) setBaseline(row.demands);
  }, [uncertain, row.demands]);
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
          setBaseline(seed.current);
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
    // Proof: diffed against the live `row.demands` again, `sends only what the
    // reader changed over a peer’s edit` failed: an untouched save wrote RAM
    // back to 2 and cleared staging; watched 2026-10-25.
    const planned = demandStatements(row.id, resources, baseline, draft);
    if (planned.kind === 'invalid') {
      const named = resources.find((each) => each.name === planned.resourceName);
      setProblem({
        sentence: `${planned.resourceName} takes a whole number of units, or blank for none.`,
        resourceId: named?.id ?? null,
      });
      return;
    }
    if (planned.statements.length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setProblem(null);
    const outcome = await write(planned.statements);
    setSaving(false);
    // Proof: with the refusal treated as landed, `says a refused save in
    // place and stays open` found no alert and a closed panel; watched 2026-10-25.
    if (outcome.kind === 'landed') onOpenChange(false);
    // Proof: without this, `says an unconfirmed save as the reader’s own, not
    // somebody else’s` read "Changed elsewhere since this opened" after the
    // reader's own save landed under an unknown outcome; watched 2026-10-25.
    else if (outcome.kind === 'reported') setUncertain(true);
    else {
      const named = resources.find((each) => each.id === outcome.resourceId);
      setProblem({
        sentence: named === undefined ? outcome.sentence : `${named.name}: ${outcome.sentence}`,
        resourceId: outcome.resourceId,
      });
    }
  }

  const peerChanged =
    !uncertain &&
    catalog.kind === 'ready' &&
    demandSummary(row.demands) !== demandSummary(baseline);

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
        {uncertain && (
          <p
            role="status"
            data-demands-uncertain
            className="bg-muted/50 m-0 rounded-md p-3 text-sm"
          >
            Your last save was not confirmed, so the plan was read again: now{' '}
            {row.demands.length === 0 ? 'none' : demandSummary(row.demands)}. Saving sends what
            differs from that.
          </p>
        )}
        {peerChanged && (
          <p role="status" data-demands-changed className="bg-muted/50 m-0 rounded-md p-3 text-sm">
            Changed elsewhere since this opened: now{' '}
            {row.demands.length === 0 ? 'none' : demandSummary(row.demands)}. Saving sends only the
            boxes you changed.
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
                const refused = problem?.resourceId === resource.id;
                const describedBy = refused
                  ? `${boxId}-note demand-problem-${row.id}`
                  : `${boxId}-note`;
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
                          aria-describedby={describedBy}
                          aria-invalid={refused ? true : undefined}
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
                          aria-describedby={describedBy}
                          aria-invalid={refused ? true : undefined}
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
              <p
                id={`demand-problem-${row.id}`}
                role="alert"
                className="text-destructive m-0 text-sm"
              >
                {problem.sentence}
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
