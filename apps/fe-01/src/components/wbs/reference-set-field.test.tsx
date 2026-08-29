import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  REFERENCE_SET_EDGE_FADE,
  REFERENCE_SET_LINE_HEIGHT,
  type ReferenceSetAdapter,
  ReferenceSetSheet,
  ReferenceSetStrip,
} from './reference-set-field';

const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

const entries = [
  { id: 'team-1', name: 'Platform' },
  { id: 'team-2', name: 'QA' },
  { id: 'team-3', name: 'Release' },
];

function adapter(overrides: Partial<ReferenceSetAdapter> = {}): ReferenceSetAdapter {
  return {
    kind: 'team',
    entries,
    ownIds: ['team-1'],
    inheritedLabel: 'Core',
    replace: vi.fn().mockResolvedValue('landed'),
    create: vi.fn().mockResolvedValue('landed'),
    ...overrides,
  };
}

describe('ReferenceSetStrip', () => {
  itDom('renders one leading add path and own chips, and no line of its own', () => {
    render(<ReferenceSetStrip label="Teams" adapter={adapter()} />);

    expect(screen.getAllByRole('button', { name: 'Add a team' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add a team' }).tabIndex).toBe(-1);
    expect(document.querySelectorAll('[data-creatable-add]')).toHaveLength(0);
    expect(screen.getByText('Platform')).toBeInTheDocument();
    // Inherited context is the surface's to draw, and a table cell draws it in
    // its placeholder: the sheet's `Inherited:` line is `ReferenceSetSheet`'s.
    expect(document.querySelectorAll('[data-reference-inherited]')).toHaveLength(0);
  });

  itDom('omits selected entries and adds the chosen id to the whole own set', async () => {
    const model = adapter();
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Teams' });
    fireEvent.focus(box);
    expect(screen.queryByRole('option', { name: 'Platform' })).toBeNull();
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => {
      expect(model.replace).toHaveBeenCalledWith(['team-1', 'team-2']);
    });
  });

  itDom('retains a refused choice and blocks a pending double take', async () => {
    let answer!: (value: 'landed' | 'refused' | 'unsent') => void;
    const pending = new Promise<'landed' | 'refused' | 'unsent'>((resolve) => {
      answer = resolve;
    });
    const model = adapter({ replace: vi.fn().mockReturnValue(pending) });
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Teams' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Q' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(model.replace).toHaveBeenCalledTimes(1);
    expect(box).toBeDisabled();
    expect(box).toHaveValue('Q');

    await act(async () => {
      answer('refused');
      await pending;
    });
    expect(box).not.toBeDisabled();
    expect(box).toHaveValue('Q');
  });

  itDom('creates against the current whole set and preserves refused members', async () => {
    const model = adapter({ create: vi.fn().mockResolvedValue('refused') });
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Teams' });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'New team' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => {
      expect(model.create).toHaveBeenCalledWith('New team', ['team-1']);
    });
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(box).toHaveValue('New team');
  });

  itDom('removes one member and disables only that chip while the write is pending', async () => {
    let answer!: (value: 'landed' | 'refused' | 'unsent') => void;
    const pending = new Promise<'landed' | 'refused' | 'unsent'>((resolve) => {
      answer = resolve;
    });
    const model = adapter({ replace: vi.fn().mockReturnValue(pending) });
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    const remove = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Remove Platform team',
    });
    fireEvent.click(remove);
    expect(remove).toBeDisabled();
    expect(model.replace).toHaveBeenCalledWith([]);

    await act(async () => {
      answer('refused');
      await pending;
    });
    expect(remove).not.toBeDisabled();
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  itDom('blocks a second remove while the first whole-set write is pending', async () => {
    let answer!: (value: 'landed' | 'refused' | 'unsent') => void;
    const pending = new Promise<'landed' | 'refused' | 'unsent'>((resolve) => {
      answer = resolve;
    });
    const model = adapter({
      ownIds: ['team-1', 'team-2'],
      replace: vi.fn().mockReturnValue(pending),
    });
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Platform team' }));
    const second = screen.getByRole<HTMLButtonElement>('button', { name: 'Remove QA team' });
    expect(second).toBeDisabled();
    fireEvent.click(second);
    expect(model.replace).toHaveBeenCalledOnce();
    expect(model.replace).toHaveBeenCalledWith(['team-2']);

    await act(async () => {
      answer('landed');
      await pending;
    });
  });

  itDom('adds against the projected set after a removal lands before props refresh', async () => {
    let answer!: (value: 'landed' | 'refused' | 'unsent') => void;
    const pending = new Promise<'landed' | 'refused' | 'unsent'>((resolve) => {
      answer = resolve;
    });
    const replace = vi.fn().mockReturnValueOnce(pending).mockResolvedValue('landed');
    const model = adapter({ ownIds: ['team-1', 'team-2'], replace });
    render(<ReferenceSetStrip label="Teams" adapter={model} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Platform team' }));
    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Teams' });
    expect(box).toBeDisabled();

    await act(async () => {
      answer('landed');
      await pending;
    });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: 'Release' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() => {
      expect(replace).toHaveBeenLastCalledWith(['team-2', 'team-3']);
    });
  });

  itDom('the leading plus focuses the adjacent keyboard path', () => {
    render(<ReferenceSetStrip label="Teams" adapter={adapter()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a team' }));
    expect(screen.getByRole('combobox', { name: 'Teams' })).toHaveFocus();
  });

  itDom('forwards the table keyboard path through its combobox', () => {
    const calls: string[] = [];
    render(
      <ReferenceSetStrip
        label="Teams"
        adapter={adapter()}
        gridCell={{
          dataCell: 'row-1::team',
          onTabKey: (event) => calls.push(`tab:${event.key}`),
          onCommandKey: (event) => calls.push(`command:${event.key}`),
          onAltMove: (event) => calls.push(`alt:${event.key}`),
        }}
      />,
    );

    const box = screen.getByRole<HTMLInputElement>('combobox', { name: 'Teams' });
    expect(box.dataset.cell).toBe('row-1::team');
    fireEvent.keyDown(box, { key: 'Tab' });
    expect(calls).toEqual(['tab:Tab']);
  });
});

/**
 * Every node a reader can see saying `needle`: an element's own drawn text, or
 * a box's placeholder or value.
 *
 * Accessible names and `title` tooltips are deliberately not counted. The
 * duplicate this exists to catch is a **second visible node** — an
 * `Inherited: Core` span beside a `↳ Core` placeholder reads as one name to
 * the accessibility tree and as two lines to the eye, and a count of names
 * cannot see it (4b.3).
 */
function drawnSayings(root: HTMLElement, needle: string): string[] {
  return [...root.querySelectorAll<HTMLElement>('*')].flatMap((node) => {
    if (node instanceof HTMLInputElement) {
      return [node.placeholder, node.value].filter((said) => said.includes(needle));
    }
    const drawn = [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent ?? '')
      .join('');
    return drawn.includes(needle) ? [drawn] : [];
  });
}

/** The rendered strip, or a failure that says the render never made one. */
function strip(within: ParentNode = document): HTMLElement {
  const found = within.querySelector<HTMLElement>('[data-reference-strip]');
  if (found === null) throw new Error('no reference strip was rendered');
  return found;
}

function chipsOf(within: ParentNode = document): HTMLElement {
  const found = strip(within).querySelector<HTMLElement>('[data-reference-chips]');
  if (found === null) throw new Error('the strip rendered no chip group');
  return found;
}

/** The line the strip stands on, which keeps its height while the strip floats. */
function anchorOf(within: ParentNode = document): HTMLElement {
  const found = within.querySelector<HTMLElement>('[data-reference-anchor]');
  if (found === null) throw new Error('the strip rendered no anchor');
  return found;
}

function searchOf(within: ParentNode = document): HTMLElement {
  const found = strip(within).querySelector<HTMLElement>('[data-reference-search]');
  if (found === null) throw new Error('the strip rendered no search holder');
  return found;
}

describe('the reference strip on one rest line', () => {
  const crowded = () => adapter({ ownIds: ['team-1', 'team-2', 'team-3'] });

  itDom('rests every flex container of a crowded cell on one line', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    // Both, singly. One `nowrap` beside one `wrap` still wraps, so a check
    // that reads either container alone passes with the bug in the other.
    expect(getComputedStyle(strip()).flexWrap).toBe('nowrap');
    expect(getComputedStyle(chipsOf()).flexWrap).toBe('nowrap');
  });

  itDom('wraps both containers only while a crowded cell is edited', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    expect(getComputedStyle(strip()).flexWrap).toBe('wrap');
    expect(getComputedStyle(chipsOf()).flexWrap).toBe('wrap');
  });

  itDom('keeps an empty cell on one line while it is edited', () => {
    render(<ReferenceSetStrip label="Teams" adapter={adapter({ ownIds: [] })} />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    expect(getComputedStyle(strip()).flexWrap).toBe('nowrap');
  });

  itDom('leaves the whole rest line to the chips until the box is entered', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    expect(parseFloat(getComputedStyle(searchOf()).minWidth)).toBe(0);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    expect(parseFloat(getComputedStyle(searchOf()).minWidth)).toBe(72);
  });

  itDom('fades and clips the rest line, and does neither while editing', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    expect(strip().style.overflow).toBe('hidden');
    expect(strip().getAttribute('style')).toContain(REFERENCE_SET_EDGE_FADE);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    // The picker's list opens inside this element. A clip or a mask at that
    // moment cuts the directory somebody has just opened — the Depends-on
    // cell's own rule, and why both belong to rest alone.
    expect(strip().style.overflow).toBe('visible');
    expect(strip().getAttribute('style')).not.toContain(REFERENCE_SET_EDGE_FADE);
  });

  itDom('leaves the flow while it is edited, on a line the anchor keeps', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    // At rest the strip *is* the cell's line: in the flow, no paint of its own.
    expect(strip().style.position).toBe('');
    expect(strip().style.background).toBe('');
    // And the anchor holds that line whether or not the strip is standing in
    // it — which is what stops the row shrinking when the panel opens.
    expect(anchorOf().style.minHeight).toBe(`${String(REFERENCE_SET_LINE_HEIGHT)}px`);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));

    // Out of the flow, so the wrap above cannot grow the cell it is in; opaque
    // and above the rows, so the wrapped chips are readable rather than merely
    // present. Both halves, because either alone is the screenshot Dany sent:
    // in-flow chips grow the row, transparent chips draw over the row below.
    //
    // Proof, two faults, both watched 2026-08-29. The `position: 'absolute'`
    // removed, `three tags open the cell without moving a row` in
    // `e2e/reference-cells.spec.ts` failed in Chromium on the row's height,
    // and this failed on `expected '' to be 'absolute'`; the panel's paint
    // removed, this failed on `expected '' to be 'var(--popover)'`. jsdom
    // computes no layout, so the height half of that pair can only be a
    // browser's (`AGENTS.md`, R5 #14/#15).
    expect(strip().style.position).toBe('absolute');
    expect(strip().style.background).toBe('var(--popover)');
    expect(strip().style.zIndex).not.toBe('');
    // Still on the anchor's line, not somewhere else on the page.
    expect(strip().parentElement).toBe(anchorOf());
  });

  itDom('keeps the add button first in the strip, open or shut', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    const first = () => strip().firstElementChild;
    expect(first()?.getAttribute('data-reference-add')).toBe('');
    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    // The `+` vanishing from a cell full of chips is the third of the
    // 2026-08-29 screenshots — it was scrolled out of a cell the browser had
    // scrolled, not removed, and the cell cannot scroll any more (`CELL`).
    // This says the panel does not reorder it either.
    expect(first()?.getAttribute('data-reference-add')).toBe('');
  });

  itDom('keeps a clipped chip out of the tab order and the focus off its press', () => {
    render(<ReferenceSetStrip label="Teams" adapter={crowded()} />);

    const remove = screen.getByRole('button', { name: 'Remove Platform team' });
    expect(remove.tabIndex).toBe(-1);
    // `fireEvent` answers false when the handler called `preventDefault`. The
    // press must not focus this button: focus is what wraps the strip, and in
    // Chromium the wrap moved the ✕ out from under the pointer between
    // `mousedown` and `mouseup`, so no click ever landed.
    expect(fireEvent.mouseDown(remove)).toBe(false);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Teams' }));
    expect(screen.getByRole('button', { name: 'Remove Platform team' }).tabIndex).toBe(0);
  });

  itDom('draws an inherited set once, in the box it is shown but not stored in', () => {
    render(
      <ReferenceSetStrip
        label="Teams"
        adapter={adapter({ ownIds: [], inheritedLabel: 'Core' })}
        placeholder="↳ Core"
      />,
    );

    expect(drawnSayings(strip(), 'Core')).toEqual(['↳ Core']);
  });

  itDom('draws the sole own member once, as its chip', () => {
    render(
      <ReferenceSetStrip
        label="Teams"
        adapter={adapter({ ownIds: ['team-1'], inheritedLabel: undefined })}
        placeholder="add"
      />,
    );

    expect(drawnSayings(strip(), 'Platform')).toEqual(['Platform']);
  });
});

describe('ReferenceSetSheet', () => {
  itDom('uses the same set editor inside a labelled phone dialog', () => {
    const close = vi.fn();
    render(<ReferenceSetSheet label="Teams" adapter={adapter()} open onClose={close} />);

    expect(screen.getByRole('dialog', { name: 'Edit Teams' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Teams' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Teams' }));
    expect(close).toHaveBeenCalledOnce();
  });

  itDom('draws the inherited set once, as the roomy line a phone can afford', () => {
    render(
      <ReferenceSetSheet
        label="Teams"
        adapter={adapter({ ownIds: [], inheritedLabel: 'Core from 010' })}
        placeholder="search or add"
        open
        onClose={vi.fn()}
      />,
    );

    const sheet = screen.getByRole('dialog', { name: 'Edit Teams' });
    expect(drawnSayings(sheet, 'Core')).toEqual(['Inherited: Core from 010']);
  });
});
