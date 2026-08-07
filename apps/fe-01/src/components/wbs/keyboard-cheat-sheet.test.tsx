import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { altStyleOf, KEY_BINDINGS, showKeys, WHERE_ORDER } from './keyboard-bindings';
import { KeyboardCheatSheet, opensCheatSheet } from './keyboard-cheat-sheet';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** The mapping's key for one binding: unique, and short enough to read in a diff. */
const bindingKey = (where: string, keys: string): string => `${where}: ${keys}`;

/**
 * Which behaviour test proves each binding.
 *
 * This is the derivation, and it is worth being exact about what it derives.
 * The cheat sheet's prose comes from the registry, so the sheet cannot drift
 * from the registry. This table is what keeps the **registry** from drifting
 * from the code: every entry names tests in `wbs-table.test.tsx`, and the
 * check below reads that file and fails when a named test is not in it.
 *
 * Its honesty limit, stated rather than glossed: it proves the named test
 * **exists**, not that the test exercises that binding. A test renamed or
 * deleted breaks the sheet's claim, which is the drift that actually happens;
 * a test rewritten to assert something else does not, and the pairing stays a
 * human review judgement. See `verify.md` for the fault that was watched.
 */
const PROVEN_BY = new Map<string, readonly string[]>(
  // A Map, not an object literal: a lookup that misses has to come back
  // `undefined`, and an index signature would hand back a `string[]` for a
  // binding nothing was written for — the vacuous version of this check.
  Object.entries({
    'Editing: Enter': [
      'types a three-level breakdown without touching the mouse',
      'focuses a newly created row so the next keystroke lands in it',
    ],
    'Editing: Tab': [
      'types a three-level breakdown without touching the mouse',
      'tab inside the text walks to the next cell instead of indenting',
    ],
    'Editing: Shift + Tab': [
      'outdents with shift-tab',
      'shift-tab inside the text walks backwards instead of outdenting',
    ],
    'Editing: Backspace': [
      'backspace at the start of the name outdents the row',
      'backspace in an empty root row removes it and puts the focus above',
    ],
    'Editing: ↑ ↓ ← →': [
      'moves down a column of estimates',
      'moves along a row once the caret has run out',
      'leaves the caret alone in the middle of a word',
    ],
    'Moving rows: Alt + ↑ / Alt + ↓': [
      'swaps the row with the sibling below it',
      'swaps the row with the sibling above it',
    ],
    'Moving rows: Alt + →': ['indents from the middle of the text, where tab would not'],
    'Moving rows: Alt + ←': ['outdents from an estimate box'],
    'Estimates: 2/3/8': ['sends one estimate for the trio typed into the folded cell'],
    'Estimates: 5': ['takes one number as the estimator saying all three are the same'],
    'Estimates: Empty it': ['clears the stored trio when the cell is emptied'],
    'Pickers: Type': ['narrows the list by name as letters are typed'],
    'Pickers: ↑ ↓': [
      'arrows move the highlight and Enter takes it',
      'the arrows step over a greyed row',
    ],
    'Pickers: Enter': [
      'Enter adds the entry the typing narrowed to',
      'adds a team by typing a name the list does not have',
      'offers an existing team rather than adding a second one',
    ],
    'Pickers: Escape': ['Escape closes the list'],
    'Pickers: 010, 020': ['adds every number in one comma-separated list'],
    'Anywhere: ?': [
      'opens the sheet when ? is pressed outside a cell',
      'a question mark typed into a name stays a question mark',
    ],
    'Anywhere: Escape': [
      'closes on Escape and gives the focus back to what had it',
      'clearing the search puts the reader’s own collapse back',
    ],
  }),
);

/**
 * The behaviour tests' source, read rather than imported.
 *
 * Importing it would run 200 tests inside this one. The file is next to this
 * one and is required to be there: an unreadable file throws out of
 * `readFileSync` rather than being read as "no tests named", which would be
 * the vacuous version of this whole check.
 */
const behaviourTestSource = readFileSync(
  // Joined, not `new URL('./…', import.meta.url)`: Vite rewrites that exact
  // pattern into an asset URL served over http, and the read would be of
  // something that is not this directory.
  join(dirname(fileURLToPath(import.meta.url)), 'wbs-table.test.tsx'),
  'utf8',
);

describe('the key binding registry', () => {
  it('holds bindings, each one filled in', () => {
    expect(KEY_BINDINGS.length).toBeGreaterThan(0);
    for (const binding of KEY_BINDINGS) {
      expect(binding.keys.trim()).not.toBe('');
      expect(binding.does.trim()).not.toBe('');
      expect(WHERE_ORDER).toContain(binding.where);
    }
  });

  it('names every group in WHERE_ORDER, and no empty ones', () => {
    for (const where of WHERE_ORDER) {
      expect(KEY_BINDINGS.filter((binding) => binding.where === where).length).toBeGreaterThan(0);
    }
  });

  it('has one entry per keys-and-where, which is what the mapping is by', () => {
    const keys = KEY_BINDINGS.map((binding) => bindingKey(binding.where, binding.keys));
    expect(keys).toEqual([...new Set(keys)]);
  });
});

describe('the cheat sheet is cross-checked against the behaviour tests', () => {
  // Proof: `Escape closes the list` renamed to `Escape shuts the list` in the
  // mapping, this failed naming the entry and the missing test; and a
  // `Ctrl + K` binding added to the registry with nothing mapped to it failed
  // with `Anywhere: Ctrl + K names no behaviour test`. Both watched,
  // 2026-08-07.
  it('names, for every binding, a test that is in wbs-table.test.tsx', () => {
    const missing: string[] = [];
    for (const binding of KEY_BINDINGS) {
      const key = bindingKey(binding.where, binding.keys);
      const named = PROVEN_BY.get(key);
      if (named === undefined || named.length === 0) {
        missing.push(`${key} names no behaviour test`);
        continue;
      }
      for (const name of named) {
        // The declaration, not the words: a test name that only appears in a
        // comment or an assertion would pass a bare substring search.
        if (!behaviourTestSource.includes(`itDom('${name}'`)) {
          missing.push(`${key} names a test wbs-table.test.tsx does not have: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('maps nothing that is not a binding', () => {
    const registryKeys = new Set(
      KEY_BINDINGS.map((binding) => bindingKey(binding.where, binding.keys)),
    );
    expect([...PROVEN_BY.keys()].filter((key) => !registryKeys.has(key))).toEqual([]);
  });
});

describe('Alt on a Mac and on a PC', () => {
  it('reads a Mac from either the platform or the user agent', () => {
    expect(altStyleOf('MacIntel', '')).toBe('mac');
    expect(altStyleOf(undefined, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('reads anything it recognises as not a Mac as a PC', () => {
    expect(altStyleOf('Win32', '')).toBe('pc');
    expect(altStyleOf(undefined, 'Mozilla/5.0 (X11; Linux x86_64)')).toBe('pc');
  });

  it('says so when the browser will not say', () => {
    expect(altStyleOf(undefined, undefined)).toBe('unsure');
    expect(altStyleOf('', 'Mozilla/5.0 (something new)')).toBe('unsure');
  });

  it('labels Alt by that answer, and leaves the rest of the chord alone', () => {
    expect(showKeys('Alt + ↑ / Alt + ↓', 'mac')).toBe('⌥ + ↑ / ⌥ + ↓');
    expect(showKeys('Alt + ↑ / Alt + ↓', 'pc')).toBe('Alt + ↑ / Alt + ↓');
    // Both, rather than a guess: a sheet that says ⌥ to a Windows reader is
    // worse than one that says both and lets them pick their own keyboard.
    expect(showKeys('Alt + →', 'unsure')).toBe('⌥/Alt + →');
    expect(showKeys('Shift + Tab', 'mac')).toBe('Shift + Tab');
  });
});

describe('the cheat sheet overlay', () => {
  /** The sheet behind a control, so opening and closing is a real focus move. */
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Open
        </button>
        {open && (
          <KeyboardCheatSheet
            altStyle="pc"
            onClose={() => {
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }

  /** Opens the sheet from a control that really has the focus first. */
  const openFromControl = (): HTMLElement => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    // jsdom does not focus a clicked button; a real browser does, and the
    // element the focus goes back to is the whole point of these tests.
    opener.focus();
    fireEvent.click(opener);
    return opener;
  };

  itDom('is a labelled modal dialog', () => {
    openFromControl();

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  itDom('renders every binding, under its own group', () => {
    openFromControl();

    for (const where of WHERE_ORDER) {
      expect(screen.getByRole('heading', { name: where })).toBeDefined();
    }
    for (const binding of KEY_BINDINGS) {
      expect(screen.getByText(binding.does)).toBeDefined();
      expect(screen.getAllByText(showKeys(binding.keys, 'pc')).length).toBeGreaterThan(0);
    }
  });

  itDom('takes the focus on open and gives it back on close', () => {
    const opener = openFromControl();

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  itDom('closes on its ✕', () => {
    const opener = openFromControl();

    fireEvent.click(screen.getByRole('button', { name: 'Close the keyboard shortcuts' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  itDom('closes on a click away from it', () => {
    openFromControl();

    const backdrop = document.querySelector('[data-cheat-sheet-backdrop]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  itDom('stays open when the click lands inside it', () => {
    openFromControl();

    fireEvent.click(screen.getByRole('heading', { name: 'Keyboard shortcuts' }));

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

describe('what opens the sheet', () => {
  /** A question mark with no modifier, as the listener sees it. */
  const question = { key: '?', ctrlKey: false, metaKey: false, altKey: false };

  itDom('a question mark that is not going into a text box', () => {
    render(<p>nothing to type into</p>);

    expect(opensCheatSheet(question, screen.getByText('nothing to type into'))).toBe(true);
    // No target at all — the document itself has the keystroke.
    expect(opensCheatSheet(question, null)).toBe(true);
  });

  itDom('not one going into an input, a textarea or an editable element', () => {
    render(
      <>
        <input aria-label="a box" />
        <textarea aria-label="a bigger box" />
      </>,
    );
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);

    expect(opensCheatSheet(question, screen.getByLabelText('a box'))).toBe(false);
    expect(opensCheatSheet(question, screen.getByLabelText('a bigger box'))).toBe(false);
    // jsdom leaves `isContentEditable` undefined, so the attribute is read as
    // well — in a browser the two say the same thing.
    expect(opensCheatSheet(question, editable)).toBe(false);
    editable.remove();
  });

  itDom('not a question mark somebody else has claimed with a modifier', () => {
    expect(opensCheatSheet({ ...question, ctrlKey: true }, null)).toBe(false);
    expect(opensCheatSheet({ ...question, metaKey: true }, null)).toBe(false);
    expect(opensCheatSheet({ ...question, altKey: true }, null)).toBe(false);
    expect(opensCheatSheet({ ...question, key: 'a' }, null)).toBe(false);
  });
});
