import { createContext, type ReactNode, useContext } from 'react';

import type { PlanRead } from '@/lib/wbs-api';

import type { CellElement } from './editable-grid';
import { LiveField } from './live-editing';
import { rowOfCellKey, stepOfCellKey } from './use-estimate-drafts';

/** One mounted project's opt-in hold for Plan fields while Board has focus. */
export class PlanInteractionScope {
  private faces = new Map<CellElement, LiveField>();
  private suspended = new Map<string, LiveField>();
  private mode: 'plan' | 'board' = 'plan';

  fieldFor(cellKey: string, value: string): LiveField {
    return this.suspended.get(cellKey) ?? new LiveField(cellKey, value);
  }

  attach(node: CellElement, field: LiveField): void {
    this.faces.set(node, field);
  }

  detach(node: CellElement): void {
    this.faces.delete(node);
  }

  suspend(field: LiveField): void {
    if (field.suspendUnsent()) this.suspended.set(field.cellKey, field);
  }

  suspendFocused(): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
      const field = this.faces.get(focused);
      if (field !== undefined) this.suspend(field);
    }
  }

  /** The selector's focus is a view handoff even before the reader activates it. */
  suspendBeforeLeave(field: LiveField, nextFocus: EventTarget | null): void {
    const enteringSelector =
      nextFocus instanceof Element && nextFocus.closest('[data-project-view-selector]') !== null;
    if (enteringSelector || this.mode === 'board' || field.isSuspended()) {
      this.suspend(field);
    }
  }

  resume(field: LiveField): void {
    if (this.suspended.get(field.cellKey) !== field) return;
    field.resumeUnsent();
    this.suspended.delete(field.cellKey);
  }

  select(view: 'plan' | 'board'): void {
    if (view === 'board') this.suspendFocused();
    // Returning to Plan leaves the hold until the field itself is refocused.
    // Proof: releasing every hold here made `keeps an unfocused draft through
    // Board and later peer trees until deliberate leave` show Peer two instead
    // of Draft build after the next delivery. Watched 2026-10-06.
    this.mode = view;
  }

  isPlanActive(): boolean {
    return this.mode === 'plan';
  }

  /** Remove holds whose row or project step no longer exists in the delivered tree. */
  prune(tree: PlanRead): void {
    const rows = new Set(tree.workItems.map((row) => row.id));
    const steps = new Set(tree.steps.map((step) => step.id));
    for (const cellKey of this.suspended.keys()) {
      const stepId = stepOfCellKey(cellKey);
      // Proof: omitting the step half made `forgets a suspended step field
      // when the authoritative tree drops its step` return the old LiveField
      // after the step vanished. Watched 2026-10-06.
      if (!rows.has(rowOfCellKey(cellKey)) || (stepId !== null && !steps.has(stepId))) {
        this.suspended.delete(cellKey);
      }
    }
  }

  dispose(): void {
    this.faces.clear();
    this.suspended.clear();
  }
}

const PlanInteractionContext = createContext<PlanInteractionScope | null>(null);

/** Hands the current runtime's scope to its Plan surface only. */
export function PlanInteractionProvider({
  scope,
  children,
}: {
  scope: PlanInteractionScope;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <PlanInteractionContext.Provider value={scope}>{children}</PlanInteractionContext.Provider>
  );
}

/** Null outside the selected runtime's opt-in Plan surface. */
export function usePlanInteractionScope(): PlanInteractionScope | null {
  return useContext(PlanInteractionContext);
}
