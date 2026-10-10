import { afterAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { AppErrorBoundary } from './build-page';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4201/manual',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
});
afterAll(() => {
  dom.window.close();
});

function ThrowingPage(): never {
  throw new Error('Invalid claim expiry: tomorrow');
}

test('a page that throws in render shows the boundary alert, not a blank page', () => {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  // React reports the caught render error to the console; the alert is what this test reads.
  const realError = console.error;
  console.error = () => undefined;
  try {
    act(() => {
      root.render(
        <AppErrorBoundary>
          <ThrowingPage />
        </AppErrorBoundary>,
      );
    });
  } finally {
    console.error = realError;
  }
  // Proof (production path): with parseDraft's expiry check removed and ManualPage rendered
  // without this boundary in main.tsx, the screens.mjs manual-malformed-draft capture never showed
  // an alert (waitFor timed out).
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('This page needs your attention.');
  expect(alert?.textContent).toContain('Invalid claim expiry: tomorrow');
  act(() => {
    root.unmount();
  });
});
