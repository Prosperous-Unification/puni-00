import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type RefusalWords } from '@/lib/refusal';

import { failureText } from './plan-refusal';
import type { SettingsSectionReport } from './teams-panel';
import { SectionProblem, useSettingsSection } from './use-settings-section';

export interface TimezonePanelProps extends SettingsSectionReport {
  /**
   * The project's zone as the plan on screen was read in, or `null` from a
   * be-01 whose tree read predates it — the panel then says so and offers
   * nothing to change.
   */
  timezone: string | null;
  /** The zones this be-01 accepts, `UTC` included (`GET /api/timezones`). */
  listTimezones: () => Promise<string[]>;
  /** Writes the zone. Throws be-01's refusal code. */
  setTimezone: (timezone: string) => Promise<void>;
  /** Re-reads the plan, which is what reprints every attempt in the new zone. */
  onChanged: () => Promise<void>;
  /** Recovers after a failed request whose commit outcome is unknown. */
  onRefused?: (thrown: unknown) => Promise<void>;
}

/**
 * What a refused zone change says. `invalid_timezone` is the one be-01 has a
 * word for, and also the one this panel refuses on its own for a zone that is
 * not on the server's list — one table, so the two read alike.
 */
const TIMEZONE_REFUSALS: RefusalWords = {
  sentences: {
    invalid_timezone:
      'That is not a zone this server knows. Pick one from the list — Europe/Kyiv, America/New_York, UTC.',
  },
  otherwise: () => 'That change did not land. Try again.',
};

/** The server's list, as it is while it is asked for. */
type ZoneList =
  | { state: 'loading' }
  | { state: 'failed'; sentence: string }
  | { state: 'ready'; zones: readonly string[] };

/**
 * The project's timezone (`step-node-attempts` D3): the zone every day read
 * off a moment is read in — an attempt's start and end on a card, the day a
 * finished step fills in — whoever is looking.
 *
 * A searchable box over **the server's** list rather than the browser's:
 * `GET /api/timezones` answers the zones this be-01 validates against, so the
 * box can never offer one the PATCH refuses (a browser's `Intl` list may
 * differ). A `<datalist>` because there are four hundred zones and a reader
 * looking for Kyiv types `Kyiv`, which a native `<select>`'s prefix type-ahead
 * cannot find under `Europe/`.
 *
 * Saved by `Save timezone`, as the weights are: a zone typed one letter at a
 * time passes through names nobody means.
 */
export function TimezonePanel({
  timezone,
  listTimezones,
  setTimezone,
  onChanged,
  onRefused,
  onDirtyChange,
}: TimezonePanelProps) {
  const [draft, setDraft] = useState(timezone ?? '');
  const [list, setList] = useState<ZoneList>({ state: 'loading' });
  const [asked, setAsked] = useState(0);
  const dirty = timezone !== null && draft !== timezone;
  const section = useSettingsSection({
    words: TIMEZONE_REFUSALS,
    dirty,
    onDirtyChange,
    onChanged,
    ...(onRefused === undefined ? {} : { onRefused }),
  });

  // be-01's answer arriving as a prop, as the rounding's does one section
  // along: a saved zone, or a peer's, is what the box holds next.
  useEffect(() => {
    setDraft(timezone ?? '');
  }, [timezone]);

  useEffect(() => {
    let current = true;
    setList({ state: 'loading' });
    listTimezones().then(
      (zones) => {
        if (current) setList({ state: 'ready', zones });
      },
      (thrown: unknown) => {
        if (current) {
          setList({
            state: 'failed',
            sentence: `The list of zones could not be read (${failureText(thrown, 'request_failed')}).`,
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [listTimezones, asked]);

  if (timezone === null) {
    return (
      <p className="text-muted-foreground text-sm">
        This server does not keep a timezone for the project yet, so attempt times are not shown.
      </p>
    );
  }

  function save(): void {
    if (list.state !== 'ready') return;
    const typed = draft.trim();
    // Proof: this check narrowed to an empty box, `refuses a zone that is not
    // on the server’s list without sending it` failed on `Unable to find
    // role="alert"` — `Kyiv` went to the server; watched 2026-10-12.
    if (!list.zones.includes(typed)) {
      section.refuse('invalid_timezone');
      return;
    }
    void section.attempt(() => setTimezone(typed));
  }

  const listId = 'project-timezone-zones';
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Every day this plan reads off a moment — when an attempt started or ended, the day a
        finished step fills in — is read in this zone, whoever is looking and wherever they are.
      </p>

      <SectionProblem problem={section.problem} />

      {list.state === 'failed' ? (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-destructive text-sm">
            {list.sentence}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAsked((count) => count + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Label htmlFor="project-timezone">Timezone</Label>
          <div className="flex items-center gap-2">
            <Input
              id="project-timezone"
              className="h-8 flex-1"
              list={listId}
              autoComplete="off"
              spellCheck={false}
              placeholder="Search — Kyiv, New York, UTC"
              disabled={list.state === 'loading' || section.busy}
              value={draft}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                section.clear();
              }}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!dirty || list.state !== 'ready' || section.busy}
            >
              Save timezone
            </Button>
          </div>
          {list.state === 'ready' && (
            <datalist id={listId}>
              {list.zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          )}
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {list.state === 'loading'
              ? 'Reading the zones this server knows…'
              : dirty
                ? `Saved as ${timezone}. Save to read the plan in ${draft.trim() === '' ? 'the zone you pick' : draft.trim()}.`
                : `Saved as ${timezone}.`}
          </p>
        </form>
      )}
    </div>
  );
}
