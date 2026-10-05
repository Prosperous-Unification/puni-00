import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4201/',
});
const globals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
};

beforeAll(() => {
  Object.assign(globalThis, globals, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterAll(() => {
  dom.window.close();
});

async function renderHeader() {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { SiteHeader, siteOrigin } = await import('./chrome');
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SiteHeader, { buildCurrent: 'page', tone: 'night' }));
    await Promise.resolve();
  });
  return { container, root, act, siteOrigin };
}

describe('night site header', () => {
  test('lists the four numbered links and a decorative moon from the site origin', async () => {
    const { container, root, act, siteOrigin } = await renderHeader();
    const links = [...container.querySelectorAll('nav[aria-label="Primary"] a')].map((link) =>
      link.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(links).toEqual(['[1] Home', '[2] Build', '[3] Services', '[4] Blog']);
    expect(container.querySelector('.nav-rail-label')?.textContent).toBe('[-] Navigation');
    const moon = container.querySelector('.wordmark-moon img');
    expect(moon?.getAttribute('alt')).toBe('');
    expect(moon?.getAttribute('src')).toBe(`${siteOrigin}/media/brand/moon.webp`);
    expect(container.querySelector('.wordmark-moon source')?.getAttribute('srcset')).toBe(
      `${siteOrigin}/media/brand/moon.avif`,
    );
    expect(container.querySelector('.wordmark-dot')).toBeNull();
    act(() => {
      root.unmount();
    });
  });

  test('swaps the moon for the dot when the image fails to load', async () => {
    const { container, root, act } = await renderHeader();
    const moon = container.querySelector('.wordmark-moon img');
    if (!moon) throw new Error('moon image missing');
    act(() => {
      moon.dispatchEvent(new dom.window.Event('error'));
    });
    expect(container.querySelector('.wordmark-moon')).toBeNull();
    expect(container.querySelector('.wordmark-dot')).not.toBeNull();
    expect(container.querySelector('.brand')?.textContent).toBe('PUNI');
    act(() => {
      root.unmount();
    });
  });
});
