import { Input, Label } from '@ui/saas-01';
import { useEffect, useRef, useState } from 'react';

import type { SettingsSectionReport } from './teams-panel';
import { SectionProblem, useSettingsSection } from './use-settings-section';

export interface GeneralPanelProps extends SettingsSectionReport {
  abbreviation: string;
  /** Resolved package-read value managed at project level, without provenance metadata. */
  budgetFactor?: number;
  /** Returns the server's canonical code; refuses with its typed error code. */
  setAbbreviation: (abbreviation: string) => Promise<string>;
  /** Refreshes the existing catalog and this plan after a successful edit. */
  onChanged: () => Promise<void>;
}

/**
 * Edits the persisted work package address prefix on blur or Enter and displays
 * the resolved project-managed budget factor read-only. Older replies without
 * that optional value render an explicit unavailable state.
 * Catalog refreshes update the saved baseline while preserving a pending draft;
 * Escape restores the latest saved abbreviation.
 */
export function GeneralPanel({
  abbreviation,
  budgetFactor,
  setAbbreviation,
  onChanged,
  onDirtyChange,
  onBusyChange,
}: GeneralPanelProps) {
  const [edit, setEdit] = useState({ saved: abbreviation, draft: abbreviation });
  const { saved, draft } = edit;
  const current = useRef(true);
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  useEffect(() => {
    setEdit((previous) => ({
      saved: abbreviation,
      // Proof: unconditional draft replacement failed both mounted `General
      // settings catalog refresh` draft/refusal cases: 2PUNI/TAKEN became FRESH.
      // Watched 2026-10-22 before restoring this dirty-draft guard.
      draft: previous.draft === previous.saved ? abbreviation : previous.draft,
    }));
  }, [abbreviation]);
  const dirty = draft !== saved;
  const section = useSettingsSection({
    words: {
      sentences: {
        invalid_abbreviation:
          'Start with a letter, then use letters, digits, hyphens or underscores, up to 20 characters.',
        abbreviation_taken:
          'Another work package in this organization already uses that abbreviation. Choose another.',
      },
      otherwise: () => 'That abbreviation change did not land. Try again.',
    },
    dirty,
    onDirtyChange,
    ...(onBusyChange === undefined ? {} : { onBusyChange }),
    onChanged: async () => {
      // Proof: removing this guard failed `an old response after a workPackage switch
      // cannot overwrite or refresh the current field`: oldRefresh was called once
      // instead of never. Watched 2026-10-22.
      if (current.current) await onChanged();
    },
  });
  function apply(): void {
    if (!dirty || section.busy) return;
    // Proof: replacing this condition with false failed all seven mounted
    // `retains invalid draft` cases on missing role="alert". Watched 2026-10-22.
    if (!/^[A-Z][A-Z0-9_-]{0,19}$/i.test(draft)) {
      section.refuse('invalid_abbreviation');
      return;
    }
    if (draft.toUpperCase() === saved) {
      setEdit((previous) => ({ ...previous, draft: saved }));
      section.clear();
      return;
    }
    void section.attempt(async () => {
      const canonical = await setAbbreviation(draft);
      setEdit({ saved: canonical, draft: canonical });
    });
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The abbreviation prefixes this work package’s work item addresses, such as {saved}.080.39.
        Changing it keeps the work package and its relationships.
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">Budget factor</legend>
        <p className="text-muted-foreground text-xs">Managed at project level</p>
        <p className="text-sm">{budgetFactor ?? 'Budget factor is unavailable.'}</p>
      </fieldset>
      <SectionProblem problem={section.problem} />
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Label htmlFor="work-package-abbreviation">Work package abbreviation</Label>
        <Input
          id="work-package-abbreviation"
          autoComplete="off"
          spellCheck={false}
          readOnly={section.busy}
          value={draft}
          aria-describedby="work-package-abbreviation-hint"
          onChange={(event) => {
            const typed = event.currentTarget.value;
            setEdit((previous) => ({ ...previous, draft: typed }));
            section.clear();
          }}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
            if (event.key === 'Escape' && dirty) {
              setEdit((previous) => ({ ...previous, draft: saved }));
              section.clear();
            }
          }}
        />
        <p
          id="work-package-abbreviation-hint"
          className="text-muted-foreground text-xs"
          aria-live="polite"
        >
          Saved as {saved}. Press Enter or leave the box to apply.
        </p>
      </form>
    </div>
  );
}
