import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IMPORT_WITH_AI_GUIDE_URL, IMPORT_WITH_AI_PROMPT } from './import-with-ai';
import { ImportWithAiHelp } from './import-with-ai-help';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** Puts a clipboard on `navigator` for one test; `afterEach` takes it off again. */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('ImportWithAiHelp', () => {
  itDom('opens as a named dialog linking the canonical guide and closes by Escape', async () => {
    render(<ImportWithAiHelp />);
    // A native `<button>` in the tab order is what makes Enter and Space open it in a browser;
    // jsdom does not synthesize that click, so the click stands in for the key.
    const trigger = screen.getByRole('button', { name: 'Import with AI' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Import with AI' });
    // Proof: on 2026-09-27, pointing the link at `docs/import-with-ai.md` relative to the page
    // failed this with the relative href.
    expect(within(dialog).getByRole('link', { name: /Read the full guide/ })).toHaveAttribute(
      'href',
      IMPORT_WITH_AI_GUIDE_URL,
    );
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(5);
    expect(dialog).toHaveTextContent('fresh MCP authorization');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  itDom('copies exactly the guide’s prompt', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    render(<ImportWithAiHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy import prompt' }));

    // Proof: on 2026-09-27, copying `IMPORT_WITH_AI_PROMPT.trim().slice(1)` instead failed this
    // on the first-character diff.
    expect(writeText).toHaveBeenCalledWith(IMPORT_WITH_AI_PROMPT);
    await waitFor(() => {
      expect(screen.getByText('Copied.')).toBeInTheDocument();
    });
  });

  itDom('says so when the clipboard refuses or is absent', async () => {
    installClipboard(() => Promise.reject(new Error('denied')));
    const { unmount } = render(<ImportWithAiHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy import prompt' }));
    expect(await screen.findByText(/refused the clipboard/)).toBeInTheDocument();
    unmount();

    Reflect.deleteProperty(navigator, 'clipboard');
    render(<ImportWithAiHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy import prompt' }));
    expect(await screen.findByText(/has no clipboard/)).toBeInTheDocument();
  });

  itDom('shows the address as unpublished and no client as tested before live proof', async () => {
    // Proof: on 2026-09-27, forcing the verified-URL branch failed this on the missing
    // unpublished sentence.
    render(<ImportWithAiHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));

    const dialog = await screen.findByRole('dialog', { name: 'Import with AI' });
    expect(dialog).toHaveTextContent('The public MCP address is not published yet.');
    expect(dialog).toHaveTextContent('none is marked tested');
    expect(within(dialog).queryByRole('button', { name: 'Copy MCP URL' })).toBeNull();
  });

  itDom('copies a verified address once there is one', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    installClipboard(writeText);
    render(<ImportWithAiHelp verifiedMcpUrl="https://wbs.example/mcp" />);
    fireEvent.click(screen.getByRole('button', { name: 'Import with AI' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy MCP URL' }));

    expect(writeText).toHaveBeenCalledWith('https://wbs.example/mcp');
  });
});
