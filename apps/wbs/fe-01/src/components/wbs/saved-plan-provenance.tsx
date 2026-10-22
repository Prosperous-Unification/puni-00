import { unreachable } from '../../lib/http';
import type { SavedPlanSideSummary } from '../../lib/saved-plan-api';

type Connected = Extract<SavedPlanSideSummary['provenance'], { kind: 'connected' }>;
type Stage = Connected['stages'][number];
type Variant = NonNullable<Stage['variants']>['pri'];

/** An objective's captured outcome; pending and retrying describe history, never live controls. */
function outcomeWords(variant: Variant): string {
  switch (variant.state) {
    case 'ready':
      return `ready; ${variant.proof}; chosen ${variant.chosen}; question ${variant.questionHash}`;
    case 'boundary-infeasible':
      return `boundary infeasible; ${variant.evidence}; question ${variant.questionHash}`;
    case 'plan-infeasible':
      return `whole plan infeasible; ${variant.items.map((bound) => `${bound.ownerWorkItemId} / ${bound.boundWorkItemId}: deadline offset ${String(bound.effectiveDeadlineOffset)}`).join('; ')}`;
    case 'pending':
      return 'pending at capture';
    case 'retrying':
      return 'retrying at capture';
    case 'idle':
      return 'idle at capture';
    case 'failed':
      return `failed; ${variant.reason}`;
    case 'corrupt':
      return `corrupt; ${variant.message}`;
    default:
      // Proof: returning unknown for an injected post-decode objective state failed
      // saved-plan-history.test.tsx's outcome Error Boundary assertion.
      return unreachable(variant);
  }
}

/** Preserves every modeled placement refusal without interpreting schedule availability from it. */
function placementWords(placement: Connected['placementState']): string {
  switch (placement.kind) {
    case 'scheduled':
      return 'scheduled';
    case 'dependency_calendar_missing':
      return `dependency calendars missing: ${placement.projects.map((project) => `${project.name} (${project.abbreviation})`).join(', ')}`;
    case 'engine_unavailable':
      return `${placement.engine} engine unavailable: ${placement.reason}; projects ${placement.projects.join(', ')}`;
    case 'unavailable':
      return `unavailable: ${placement.reason}`;
    default:
      // Proof: returning unknown for an injected post-decode placement kind failed
      // saved-plan-history.test.tsx's placement Error Boundary assertion.
      return unreachable(placement);
  }
}

function CapturedStage({ stage }: { stage: Stage }) {
  return (
    <li className="flex flex-col gap-1">
      <p>
        {stage.name} ({stage.abbreviation}): engine {stage.engine}; objective {stage.objective};
        selected {stage.selected ?? 'none'}.
      </p>
      {stage.observation === null ? (
        <p>No optimization observation captured.</p>
      ) : (
        <p>
          Observation: input {stage.observation.inputHash}; contract{' '}
          {stage.observation.contractVersion}; budget {stage.observation.budgetMs} ms; quantum{' '}
          {stage.observation.quantum}; wire {stage.observation.wireVersion}.
        </p>
      )}
      {stage.variants === null ? (
        <p>No objective outcomes captured.</p>
      ) : (
        <ul>
          <li>Priority: {outcomeWords(stage.variants.pri)}</li>
          <li>Time: {outcomeWords(stage.variants.time)}</li>
        </ul>
      )}
      <details>
        <summary>Captured stage boundary</summary>
        <p>
          Origin ordinal: {stage.boundary.originOrdinal}; project {stage.boundary.projectId}; format{' '}
          {stage.boundary.format}.
        </p>
        <pre className="max-h-40 overflow-auto break-all whitespace-pre-wrap">
          {stage.boundary.canonical}
        </pre>
        {stage.boundary.fixed.length === 0 ? (
          <p>No foreign intervals captured.</p>
        ) : (
          <ul>
            {stage.boundary.fixed.map((interval, ordinal) => (
              <li key={ordinal}>
                {interval.projectName} ({interval.projectAbbreviation}) / {interval.workItemName}
                {interval.stepName === null ? '' : ` / ${interval.stepName}`}: start offset{' '}
                {interval.start}; finish offset {interval.finish}. Project {interval.projectId};
                work item {interval.workItemId}; step {interval.stepId ?? 'none'}.
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function Provenance({ provenance }: { provenance: SavedPlanSideSummary['provenance'] }) {
  switch (provenance.kind) {
    case 'legacy-unknown':
      return <p>Legacy provenance unknown.</p>;
    case 'local':
      return <p>Local provenance.</p>;
    case 'connected':
      return (
        <details>
          <summary>Captured connected provenance ({provenance.mode})</summary>
          <p>
            Target project: {provenance.targetProjectId}; placement{' '}
            {placementWords(provenance.placementState)}.
          </p>
          <p>Captured component projects:</p>
          <ul>
            {provenance.projects.map((project) => (
              <li key={project.projectId}>
                {project.name} ({project.abbreviation})
              </li>
            ))}
          </ul>
          <p>Idle members:</p>
          {provenance.idleProjects.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {provenance.idleProjects.map((project) => (
                <li key={project.projectId}>
                  {project.name} ({project.abbreviation})
                </li>
              ))}
            </ul>
          )}
          <p>Captured stages:</p>
          {provenance.stages.length === 0 ? (
            <p>None.</p>
          ) : (
            <ol>
              {provenance.stages.map((stage) => (
                <CapturedStage key={stage.projectId} stage={stage} />
              ))}
            </ol>
          )}
        </details>
      );
    default:
      // Proof: dropping an injected post-decode provenance kind failed
      // saved-plan-history.test.tsx's provenance Error Boundary assertion.
      return unreachable(provenance);
  }
}

/** Frozen per-side context remains visible even when the diff is empty or shelf metadata changes. */
export function FrozenProvenance({
  title,
  summary,
  which,
}: {
  title: string;
  summary: SavedPlanSideSummary;
  which: 'left' | 'right';
}) {
  const source = summary.source;
  return (
    <section
      aria-label={`${which === 'left' ? 'Left' : 'Right'} frozen provenance`}
      className={`saved-plan-compare__side saved-plan-compare__side--${which} flex min-w-0 flex-col gap-1 text-xs`}
    >
      <h4 className="saved-plan-compare__side-name font-medium">{title}</h4>
      <p>{describeSource(source)}</p>
      {summary.schedule.present ? (
        <p>Schedule captured ({summary.schedule.algorithmId}).</p>
      ) : (
        <p className="saved-plan-compare__absent text-muted-foreground">
          {source.kind === 'current'
            ? 'the live plan cannot be scheduled'
            : 'no schedule was saved'}{' '}
          ({summary.schedule.absentReason})
        </p>
      )}
      <Provenance provenance={summary.provenance} />
    </section>
  );
}

/** Source identity is retained separately from the shelf's mutable title. */
function describeSource(source: SavedPlanSideSummary['source']): string {
  switch (source.kind) {
    case 'current':
      return 'Current plan at comparison capture.';
    case 'saved':
      return `Saved plan: ${source.savedPlanId}.`;
    default:
      // Proof: rendering unknown for an injected post-decode source kind failed
      // saved-plan-history.test.tsx's source Error Boundary assertion.
      return unreachable(source);
  }
}
