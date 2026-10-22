import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';
import { useMemo, useState } from 'react';

import type { TypedDependencyType } from '@/lib/wbs-api';
import type { DependencyLookup } from '@/modules/dependency-lookup/contract';

import { type DependencySelection, encodeDependencyEndpoint } from './dependency-selection';
import type { CommitOutcome } from './live-editing';
import { type DependencyEndpointEditor, ScopedDependencyEditor } from './typed-dependency-editor';
import { useDependencySearch } from './use-dependency-search';

/** Remote choices use only the selected stable project's candidate evidence; pages never invent a local row. */
export function RemoteDependencyEditor({
  selection,
  lookup,
  ownerProjectId,
  ownerId,
  successor,
  preferredCode,
  onSave,
  onCancel,
}: {
  selection: Extract<DependencySelection, { kind: 'remote' }>;
  lookup: DependencyLookup;
  ownerProjectId: string;
  ownerId: string;
  successor: DependencyEndpointEditor;
  preferredCode?: string | null;
  onSave: (
    source: ScopedDependencyEndpoint,
    target: ScopedDependencyEndpoint,
    type: TypedDependencyType,
  ) => Promise<CommitOutcome>;
  onCancel: () => void;
}) {
  const [expectedRevision, setExpectedRevision] = useState<string | undefined>(
    selection.addressRevision,
  );
  const search = useDependencySearch({
    lookup,
    projectId: ownerProjectId,
    ownerId: `customize:${ownerId}`,
    active: true,
    typed: `${selection.project.abbreviation}.${selection.candidate.number}`,
    setTyped: () => {
      throw new Error('Customize does not choose a different project');
    },
    localEntries: [],
    initialProject: selection.project,
    expectedRevision,
  });
  const choices = useMemo(
    () =>
      search.options.flatMap((option) => {
        if (
          option.kind !== 'endpoint' ||
          option.selection.kind !== 'remote' ||
          option.selection.endpoint.workItemId !== selection.endpoint.workItemId
        )
          return [];
        const { candidate, endpoint } = option.selection;
        return [
          {
            key: encodeDependencyEndpoint(endpoint),
            endpoint,
            label:
              endpoint.scope === 'whole'
                ? 'Whole work item'
                : `${candidate.step?.name ?? 'Unknown step'}${endpoint.scope === 'descendant-step' ? ' across all descendants' : ' step'}`,
            description:
              candidate.reference ??
              `${selection.project.abbreviation}.${candidate.number} · ${candidate.step?.name ?? candidate.name}`,
            step: candidate.step ?? null,
          },
        ];
      }),
    [search.options, selection],
  );
  const explicit = selection.endpoint.scope !== 'whole';
  const folded = successor.preferredKey !== 'whole';
  const matches =
    preferredCode == null ? [] : choices.filter((choice) => choice.step?.code === preferredCode);
  // Proof: bypassing completeness enabled Add before More; substituting the successor key left Add disabled after complete remote evidence (remote-dependency-editor.test.tsx, 2026-10-22).
  const preferredKey = explicit
    ? encodeDependencyEndpoint(selection.endpoint)
    : !folded
      ? encodeDependencyEndpoint(selection.endpoint)
      : search.complete && matches.length === 1
        ? (matches[0]?.key ?? null)
        : null;
  const predecessor: DependencyEndpointEditor = {
    heading: `${selection.project.abbreviation}.${selection.candidate.number} · ${selection.candidate.name}`,
    preferredKey,
    choices,
    unavailable: 'Choose predecessor scope; matching step is unavailable or ambiguous.',
  };
  return (
    <>
      {search.state === 'loading' && <p role="status">Loading predecessor scopes…</p>}
      {search.state === 'failure' && (
        <p role="alert">
          Could not load predecessor scopes.{' '}
          <button type="button" onClick={search.retry}>
            Retry scopes
          </button>
        </p>
      )}
      {search.state === 'refused' && <p role="alert">Lookup refused: {search.message}</p>}
      {search.state === 'stale' && (
        <p role="alert">
          Addresses changed; refresh choices.{' '}
          <button
            type="button"
            onClick={() => {
              setExpectedRevision(undefined);
              search.retry();
            }}
          >
            Refresh scopes
          </button>
        </p>
      )}
      {search.more !== null && (
        <button type="button" onClick={search.more}>
          More scopes
        </button>
      )}
      <ScopedDependencyEditor
        predecessor={predecessor}
        successor={successor}
        onSave={onSave}
        onCancel={onCancel}
      />
    </>
  );
}
