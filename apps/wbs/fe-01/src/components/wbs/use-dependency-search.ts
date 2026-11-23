import { parseWorkItemAddress } from '@wbs/domain/work-package-address';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  AddressWorkPackage,
  DependencyLookup,
  EndpointSearchReply,
  WorkPackageDiscoveryReply,
} from '@/modules/dependency-lookup/contract';

import type { PickerEntry } from './dep-picker';
import {
  buildRemoteDependencyOption,
  type DependencyOption,
  encodeDependencyEndpoint,
} from './dependency-selection';
import {
  consumeDependencyToken,
  type DependencyDraftCapture,
  type DependencyTokenObservation,
  encodeDependencyBindings,
  retainDependencyBindings,
} from './dependency-token-bindings';
import { currentDependencyToken, replaceDependencyToken } from './depends-input';

type LookupState =
  'local' | 'loading' | 'ready' | 'empty' | 'failure' | 'refused' | 'stale' | 'cancelled';
interface Observation {
  identity: string;
  lookup: DependencyLookup;
  state: LookupState;
  options: DependencyOption[];
  cursor: string | null;
  revision: string | null;
  message: string;
}

/** Retains per-occurrence work package authority through known consumption and debounced active-token lookup; every render fences incompatible evidence. */
export function useDependencySearch({
  lookup,
  workPackageId,
  ownerId,
  active,
  typed,
  setTyped,
  localEntries,
  boundWorkPackage,
  expectedRevision,
}: {
  /** Explicit Customize work package binding, independent of editable token spelling. */
  boundWorkPackage?: AddressWorkPackage;
  expectedRevision?: string;
  lookup: DependencyLookup;
  workPackageId: string;
  ownerId: string;
  active: boolean;
  typed: string;
  setTyped: (typed: string) => void;
  localEntries: readonly PickerEntry[];
}) {
  const selections = useRef(0);
  const { token, prefix } = currentDependencyToken(typed);
  const retained = useRef<{
    typed: string;
    lookup: DependencyLookup;
    bindings: DependencyTokenObservation[];
  }>({ typed, lookup, bindings: [] });
  const consumption = useRef<{
    previous: string;
    typed: string;
    lookup: DependencyLookup;
    previousBindings: string;
    bindings: DependencyTokenObservation[];
  } | null>(null);
  const consumed = consumption.current;
  // Proof: discarding this controlled transition made successful consumption of the second identical token invalidate the first stable work package (mounted round2 test).
  if (
    consumed !== null &&
    consumed.lookup === lookup &&
    consumed.previous === retained.current.typed &&
    consumed.typed === typed &&
    consumed.previousBindings === encodeDependencyBindings(retained.current.bindings)
  ) {
    retained.current = { typed, lookup, bindings: consumed.bindings };
    consumption.current = null;
  }
  // Proof: preserving binding authority across lookup replacement sent a scoped request before deliberate reselection (mounted round1 search test).
  if (retained.current.lookup !== lookup)
    retained.current = {
      ...retained.current,
      lookup,
      bindings: retained.current.bindings.map((binding) => ({
        ...binding,
        requiresReselection: true,
      })),
    };
  if (retained.current.typed !== typed) {
    consumption.current = null;
    retained.current = {
      typed,
      lookup,
      // Proof: dropping retained occurrences rebound a selected token after a delimiter (mounted round1 test).
      bindings: retainDependencyBindings(retained.current.typed, typed, retained.current.bindings),
    };
  }
  const activeBinding = retained.current.bindings.find(
    (binding) => binding.start === prefix.length && binding.token === token,
  );
  const selected =
    boundWorkPackage ??
    (activeBinding?.requiresReselection === true
      ? undefined
      : activeBinding?.observation.workPackage);
  const scoped = useMemo(
    () =>
      selected === undefined
        ? null
        : { workPackage: selected, prefix: `${selected.abbreviation.toUpperCase()}.` },
    [selected],
  );
  const parsed = parseWorkItemAddress(token);
  const query =
    scoped === null
      ? parsed.kind === 'qualified'
        ? parsed.abbreviation
        : token
      : token.slice(scoped.prefix.length);
  // Proof: bypassing the alphabetic gate sent discovery calls for numeric/local-step inputs in dependency-search.test.tsx (2026-10-22).
  const eligible = active && (scoped !== null || /^[A-Za-z]/.test(token));
  const identity = JSON.stringify([
    workPackageId,
    ownerId,
    active,
    typed,
    scoped?.workPackage.workPackageId ?? null,
    query.toLowerCase(),
    expectedRevision ?? null,
  ]);
  const current = useRef({ identity, lookup });
  current.current = { identity, lookup };
  const [observation, setObservation] = useState<Observation | null>(null);
  const [request, setRequest] = useState<{
    sequence: number;
    identity: string;
    cursor: string | null;
  }>({
    sequence: 0,
    identity: '',
    cursor: null,
  });
  const [fatal, setFatal] = useState<{ identity: string; failure: unknown } | null>(null);
  const selectedWorkPackageId = scoped?.workPackage.workPackageId ?? null;
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const cursor = request.identity === identity ? request.cursor : null;
    const timer = setTimeout(() => {
      setObservation((previous) => ({
        identity,
        lookup,
        state: 'loading',
        options:
          cursor !== null && previous?.identity === identity && previous.lookup === lookup
            ? previous.options
            : [],
        cursor: null,
        revision: cursor !== null && previous?.identity === identity ? previous.revision : null,
        message: '',
      }));
      const pending =
        selectedWorkPackageId === null
          ? lookup.discoverWorkPackages(query, cursor, controller.signal)
          : lookup.searchEndpoints(selectedWorkPackageId, query, cursor, controller.signal);
      void pending.then(
        (reply: WorkPackageDiscoveryReply | EndpointSearchReply) => {
          // Proof: removing this response fence erased the newer NEW option after an ignored-abort OLD answer (dependency-search.test.tsx, 2026-10-22).
          if (
            current.current.identity !== identity ||
            current.current.lookup !== lookup ||
            controller.signal.aborted
          )
            return;
          setObservation((previous): Observation => {
            const base: Observation = {
              identity,
              lookup,
              state: 'ready',
              options: [],
              cursor: null,
              revision: null,
              message: '',
            };
            if (reply.kind === 'cancelled') return { ...base, state: 'cancelled' };
            if (reply.kind === 'failure')
              return { ...base, state: 'failure', message: 'Could not load dependency choices.' };
            if (reply.kind === 'refusal')
              return {
                ...base,
                state:
                  reply.status === 409 && reply.body.error === 'stale_address_revision'
                    ? 'stale'
                    : 'refused',
                message: reply.body.error,
              };
            let incoming: DependencyOption[];
            let revision: string | null = null;
            if ('workPackages' in reply.body)
              incoming = reply.body.workPackages.map((workPackage) => ({
                kind: 'work_package',
                key: JSON.stringify(['work_package', workPackage.workPackageId]),
                workPackage,
              }));
            else {
              // Proof: bypassing work package identity accepted Reused address evidence instead of rendering Refresh choices (dependency-search.test.tsx, 2026-10-22).
              if (
                reply.body.workPackage.workPackageId !== selectedWorkPackageId ||
                reply.body.candidates.some(
                  (candidate) => candidate.workPackageId !== selectedWorkPackageId,
                )
              )
                return { ...base, state: 'stale', message: 'Work package identity changed.' };
              revision = reply.body.addressRevision;
              // Proof: bypassing the initial revision check enabled stale Customize scopes before explicit refresh (remote-dependency-editor.test.tsx, 2026-10-22).
              if (expectedRevision !== undefined && revision !== expectedRevision)
                return { ...base, state: 'stale', message: 'Addresses changed; refresh choices.' };
              // Proof: removing page revision comparison rendered r2 options under the r1 continuation instead of Refresh choices (dependency-search.test.tsx, 2026-10-22).
              if (cursor !== null && previous?.revision !== revision)
                return { ...base, state: 'stale', message: 'Addresses changed; refresh choices.' };
              const { workPackage, addressRevision } = reply.body;
              incoming = reply.body.candidates.map((candidate) =>
                buildRemoteDependencyOption(workPackage, addressRevision, candidate),
              );
            }
            const earlier =
              cursor !== null && previous?.identity === identity && previous.lookup === lookup
                ? previous.options
                : [];
            const options = [
              ...new Map([...earlier, ...incoming].map((option) => [option.key, option])).values(),
            ];
            return {
              ...base,
              options,
              revision,
              cursor: reply.body.nextCursor,
              state: options.length === 0 ? 'empty' : 'ready',
            };
          });
        },
        (failure: unknown) => {
          // Proof: removing this response fence erased the newer NEW option after an ignored-abort OLD answer (dependency-search.test.tsx, 2026-10-22).
          if (
            current.current.identity === identity &&
            current.current.lookup === lookup &&
            !controller.signal.aborted
          )
            setFatal({ identity, failure });
        },
      );
      // Proof: reducing 200ms to zero sent discovery before the 199ms assertion in dependency-search.test.tsx (2026-10-22).
    }, 200);
    return () => {
      clearTimeout(timer);
      // Proof: omitting abort left the mounted unmount test signal.aborted=false (dependency-search.test.tsx, 2026-10-22).
      controller.abort();
    };
  }, [eligible, identity, lookup, query, selectedWorkPackageId, request, expectedRevision]);
  if (fatal?.identity === identity) throw fatal.failure;
  // Proof: removing this render fence left PUNI options clickable immediately after typing OTHER (dependency-search.test.tsx, 2026-10-22).
  const visible =
    observation?.identity === identity && observation.lookup === lookup ? observation : null;
  const local = useMemo<DependencyOption[]>(
    () =>
      scoped !== null
        ? []
        : localEntries.map((entry) => {
            const endpoint = { workPackageId, workItemId: entry.id, scope: 'whole' as const };
            return {
              kind: 'endpoint',
              key: encodeDependencyEndpoint(endpoint),
              selection: { kind: 'local', endpoint },
              label: `${entry.number} - ${entry.name}`,
              detail: entry.name,
              ...(entry.refusal === undefined ? {} : { refusal: entry.refusal }),
              status: entry.status,
            };
          }),
    [localEntries, workPackageId, scoped],
  );
  if (activeBinding !== undefined && visible?.revision != null)
    activeBinding.observation = {
      workPackage: activeBinding.observation.workPackage,
      revision: visible.revision,
    };
  return {
    observations: retained.current.bindings,
    /** Success may clear only this captured occurrence, including its explicit work package selection. */
    captureDraft(draft = typed): DependencyDraftCapture {
      // Proof: removing the binding comparison erased newer identical-text selections in Customize and desktop/phone one-click round1 tests.
      const captured = encodeDependencyBindings(
        retainDependencyBindings(typed, draft, retained.current.bindings),
      );
      const matchesDraft = (currentTyped: string) =>
        currentTyped === draft &&
        retained.current.lookup === lookup &&
        encodeDependencyBindings(
          retainDependencyBindings(retained.current.typed, currentTyped, retained.current.bindings),
        ) === captured;
      return {
        matchesDraft,
        consumeToken(currentTyped) {
          // Proof: bypassing this capture guard erased newer same-text selections in mounted round2 consumption negatives.
          if (!matchesDraft(currentTyped)) return { kind: 'stale' };
          const next = consumeDependencyToken(
            currentTyped,
            retainDependencyBindings(
              retained.current.typed,
              currentTyped,
              retained.current.bindings,
            ),
          );
          consumption.current = {
            previous: retained.current.typed,
            typed: next.typed,
            lookup,
            previousBindings: encodeDependencyBindings(retained.current.bindings),
            bindings: next.bindings,
          };
          return { kind: 'consumed', typed: next.typed };
        },
      };
    },
    options: [...local, ...(eligible ? (visible?.options ?? []) : [])],
    state: !eligible ? ('local' as const) : (visible?.state ?? ('loading' as const)),
    message: visible?.message ?? '',
    more:
      visible?.cursor == null
        ? null
        : () => {
            setRequest((previous) => ({
              sequence: previous.sequence + 1,
              identity,
              cursor: visible.cursor,
            }));
          },
    retry: () => {
      setRequest((previous) => ({ sequence: previous.sequence + 1, identity, cursor: null }));
    },
    chooseWorkPackage(workPackage: AddressWorkPackage) {
      const next = replaceDependencyToken(typed, `${workPackage.abbreviation}.`);
      retained.current = {
        typed: next,
        lookup,
        bindings: [
          ...retained.current.bindings.filter((binding) => binding.start !== prefix.length),
          {
            start: prefix.length,
            end: next.length,
            token: `${workPackage.abbreviation}.`,
            observation: { workPackage, revision: null },
            selectionId: ++selections.current,
          },
        ],
      };
      setRequest((previous) => ({ sequence: previous.sequence + 1, identity, cursor: null }));
      setTyped(next);
    },
    selectedWorkPackage: scoped?.workPackage ?? null,
    revision: visible?.revision ?? null,
    complete: visible?.state === 'ready' && visible.cursor === null,
  };
}

export type DependencySearch = ReturnType<typeof useDependencySearch>;
