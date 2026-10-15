import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RefusalWords } from '@/lib/refusal';

import { EstimatingPanel } from './estimating-panel';
import { PrioritiesPanel } from './priorities-panel';
import { StepsPanel } from './steps-panel';
import { INITIAL_HIDDEN_COLUMNS } from './table-frame';
import { TeamsPanel } from './teams-panel';
import { TimezonePanel } from './timezone-panel';
import { useSettingsSection } from './use-settings-section';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(cleanup);

/** A write that travels until the case lets it land. */
function travelling(): { write: () => Promise<void>; land: () => Promise<void> } {
  let resolve: () => void = () => undefined;
  const pending = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    write: () => pending,
    land: async () => {
      resolve();
      await act(async () => {
        await new Promise((resume) => setTimeout(resume, 0));
      });
    },
  };
}

const quiet = (): Promise<void> => Promise.resolve();

/**
 * The settings sections while a write travels (UI review F-066).
 *
 * Under the one commit model (D7) Enter in a box is how every section applies,
 * and every box used to be `disabled` while the write it sent was in the air —
 * which in a browser drops the focus onto the dialog's frame. jsdom does not
 * move the focus off a disabled box, so these cases hold the attribute the
 * browser acts on; `settings-layout.spec.ts` watches the focus itself.
 */
describe('a box whose write is travelling keeps the focus (F-066)', () => {
  // Proof (each case below): on 2026-10-14, against 85849d1f3, every one of them
  // failed on `expected true to be false` for `:disabled` — the box (the PERT
  // weights through their fieldset) was disabled while its write travelled.
  itDom('a band of the ladder', async () => {
    const { write, land } = travelling();
    render(
      <PrioritiesPanel
        bands={DEFAULT_PRIORITY_BANDS}
        setBands={write}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const band = screen.getByLabelText<HTMLInputElement>('Name of band 1');
    band.focus();
    fireEvent.change(band, { target: { value: 'Blocker' } });
    fireEvent.keyDown(band, { key: 'Enter' });

    expect(band.matches(':disabled')).toBe(false);
    expect(band.readOnly).toBe(true);
    expect(document.activeElement).toBe(band);
    await land();
    expect(band.readOnly).toBe(false);
  });

  itDom('a PERT weight', async () => {
    const { write, land } = travelling();
    render(
      <EstimatingPanel
        method="pert"
        pertWeights={{ optimistic: 1, realistic: 4, pessimistic: 1 }}
        estimateRounding="ceil"
        setArithmetic={write}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const weight = screen.getByLabelText<HTMLInputElement>('realistic');
    fireEvent.change(weight, { target: { value: '2' } });
    fireEvent.keyDown(weight, { key: 'Enter' });

    expect(weight.matches(':disabled')).toBe(false);
    expect(weight.readOnly).toBe(true);
    await land();
    expect(weight.readOnly).toBe(false);
  });

  itDom('a team’s capacity', async () => {
    const { write, land } = travelling();
    render(
      <TeamsPanel
        teams={[{ id: 't-backend', name: 'Backend', stated: 2, rows: 4 }]}
        setCapacity={write}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const box = screen.getByLabelText<HTMLInputElement>('How many of Backend at once');
    fireEvent.change(box, { target: { value: '3' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(box.matches(':disabled')).toBe(false);
    expect(box.readOnly).toBe(true);
    await land();
    expect(box.readOnly).toBe(false);
  });

  itDom('a step’s name, which a second Enter does not send again', async () => {
    let finish: () => void = () => undefined;
    const renameStep = vi.fn(
      () =>
        new Promise<{
          estimateUnit: 'workdays';
          id: string;
          name: string;
          allowancePercent: number;
        }>((done) => {
          finish = () => {
            done({ estimateUnit: 'workdays', id: 'step-dev', name: 'Build', allowancePercent: 0 });
          };
        }),
    );
    render(
      <StepsPanel
        steps={[{ id: 'step-dev', name: 'Dev', estimateUnit: 'workdays', allowancePercent: 0 }]}
        estimateCounts={{ 'step-dev': 0 }}
        setStepUnit={vi.fn()}
        depReach="whole-item"
        setDepReach={vi.fn()}
        frameState={{
          hasAnyNotBefore: false,
          deepestDepth: 0,
          numberingFrozen: false,
          widestDependencyChip: null,
          waitsForSeveral: false,
        }}
        hiddenColumnIds={INITIAL_HIDDEN_COLUMNS}
        numberOf={() => null}
        nameOf={() => null}
        addStep={vi.fn()}
        renameStep={renameStep}
        setStepAllowance={vi.fn()}
        removeStep={vi.fn()}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const name = screen.getByLabelText<HTMLInputElement>('Dev');
    fireEvent.change(name, { target: { value: 'Build' } });
    fireEvent.submit(name);
    fireEvent.submit(name);

    expect(name.matches(':disabled')).toBe(false);
    expect(name.readOnly).toBe(true);
    // Proof: on 2026-10-14, with the steps panel's one-write-at-a-time guard
    // removed, this failed on `expected "vi.fn()" to be called 1 times, but got
    // 2 times` — a readOnly box takes a second Enter, which sent the rename again.
    expect(renameStep).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await new Promise((resume) => setTimeout(resume, 0));
    });
  });
});

const WORDS: RefusalWords = { sentences: {}, otherwise: (code) => `refused (${code})` };

/** A section whose only control is a button disabled while its write travels. */
function ButtonSection({ write }: { write: () => Promise<void> }): React.ReactNode {
  const section = useSettingsSection({
    words: WORDS,
    dirty: false,
    onDirtyChange: () => undefined,
    onChanged: quiet,
  });
  return (
    <button
      type="button"
      disabled={section.busy}
      onClick={() => {
        void section.attempt(write);
        // What a browser does to a focused control once it is disabled.
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      Send
    </button>
  );
}

describe('a control disabled while its write travels', () => {
  itDom('gets the focus back once the write is over (F-066)', async () => {
    const { write, land } = travelling();
    render(<ButtonSection write={write} />);
    const send = screen.getByRole('button', { name: 'Send' });
    send.focus();
    fireEvent.click(send);
    expect(document.activeElement).toBe(document.body);
    await land();
    // Proof: on 2026-10-14, with the hook's focus-return effect removed, this
    // failed on `expected <body> to be <button>` — the focus stayed where the
    // disabled button had dropped it.
    expect(document.activeElement).toBe(send);
  });
});

describe('the zone typed while the list loads (F-069)', () => {
  itDom('takes typing, says it is waiting, and applies once the list lands', async () => {
    let listed: (zones: string[]) => void = () => undefined;
    const listTimezones = (): Promise<string[]> =>
      new Promise((done) => {
        listed = done;
      });
    const setTimezone = vi.fn(quiet);
    render(
      <TimezonePanel
        timezone="UTC"
        listTimezones={listTimezones}
        setTimezone={setTimezone}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const zone = screen.getByLabelText<HTMLInputElement>('Timezone');
    // Proof: on 2026-10-14, against 85849d1f3, this failed on `expected true to
    // be false` — the box was disabled for as long as the list was read.
    expect(zone.matches(':disabled')).toBe(false);
    fireEvent.change(zone, { target: { value: 'Europe/Kyiv' } });
    fireEvent.blur(zone);

    expect(setTimezone).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Reading the zones this server knows… Europe/Kyiv applies once they are read.',
      ),
    ).toBeTruthy();
    await act(async () => {
      listed(['UTC', 'Europe/Kyiv']);
      await new Promise((resume) => setTimeout(resume, 0));
    });
    expect(setTimezone).toHaveBeenCalledWith('Europe/Kyiv');
  });

  itDom('keeps the box and the typed zone beside a list that failed', async () => {
    let refuse: (thrown: Error) => void = () => undefined;
    const listTimezones = (): Promise<string[]> =>
      new Promise((_done, fail) => {
        refuse = fail;
      });
    render(
      <TimezonePanel
        timezone="UTC"
        listTimezones={listTimezones}
        setTimezone={vi.fn(quiet)}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />,
    );
    const zone = screen.getByLabelText<HTMLInputElement>('Timezone');
    fireEvent.change(zone, { target: { value: 'Europe/Kyiv' } });
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.submit(zone);
    await act(async () => {
      refuse(new Error('http_500'));
      await new Promise((resume) => setTimeout(resume, 0));
    });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    // Proof: on 2026-10-14, against 85849d1f3, this failed on `Unable to find a
    // label with the text of: Timezone` — the failed list took the box, and the
    // zone typed in it, away.
    expect(screen.getByLabelText<HTMLInputElement>('Timezone').value).toBe('Europe/Kyiv');
    expect(screen.getByText('Europe/Kyiv applies once the list of zones is read.')).toBeTruthy();
  });

  itDom('stops waiting when a peer saves the very zone that was typed (F-082)', async () => {
    let listed: (zones: string[]) => void = () => undefined;
    const listTimezones = (): Promise<string[]> =>
      new Promise((done) => {
        listed = done;
      });
    const setTimezone = vi.fn(quiet);
    const panel = (timezone: string) => (
      <TimezonePanel
        timezone={timezone}
        listTimezones={listTimezones}
        setTimezone={setTimezone}
        onChanged={quiet}
        onDirtyChange={() => undefined}
      />
    );
    const { rerender } = render(panel('UTC'));
    const zone = screen.getByLabelText<HTMLInputElement>('Timezone');
    fireEvent.change(zone, { target: { value: 'Europe/Kyiv' } });
    fireEvent.blur(zone);
    rerender(panel('Europe/Kyiv'));
    await act(async () => {
      listed(['UTC', 'Europe/Kyiv']);
      await new Promise((resume) => setTimeout(resume, 0));
    });

    expect(setTimezone).not.toHaveBeenCalled();
    expect(screen.getByText('Saved as Europe/Kyiv.')).toBeTruthy();
  });
});
