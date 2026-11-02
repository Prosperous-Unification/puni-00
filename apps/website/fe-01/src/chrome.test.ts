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

async function renderHeader(tone: 'light' | 'night' = 'night') {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { SiteHeader, siteOrigin } = await import('./chrome');
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(SiteHeader, { buildCurrent: 'page', tone }));
    await Promise.resolve();
  });
  return { container, root, act, siteOrigin };
}

describe('night site header', () => {
  test('lists four plain links and a decorative moon from the site origin', async () => {
    const { container, root, act, siteOrigin } = await renderHeader();
    const links = [...container.querySelectorAll('nav[aria-label="Primary"] a')].map((link) =>
      link.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(links).toEqual(['Home', 'Build', 'Services', 'Blog']);
    expect(container.querySelector('.nav-rail-label, .nav-index')).toBeNull();
    expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe('Build');
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

  test('Menu exposes its controlled links and Escape returns focus', async () => {
    const { container, root, act } = await renderHeader();
    const toggle = container.querySelector('button');
    if (!toggle) throw new Error('Menu button missing');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const panel = container.querySelector('nav');
    if (!panel) throw new Error('Primary navigation missing');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    act(() => {
      toggle.click();
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(dom.window.document.activeElement).toBe(toggle);
    expect(container.querySelector('.skip-link')?.getAttribute('href')).toBe('#main');
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

  test('the light tone keeps the same identity, links and Menu', async () => {
    const { container, root, act } = await renderHeader('light');
    expect(container.querySelector('header')?.className).toBe(
      'site-header site-header-light site-header-placement-flow',
    );
    expect(container.querySelector('.nav-rail-label, .nav-index')).toBeNull();
    expect(container.querySelector('a[aria-current="page"]')?.textContent).toBe('Build');
    expect(container.querySelectorAll('nav[aria-label="Primary"] a')).toHaveLength(4);
    expect(container.querySelector('.wordmark-moon img')).not.toBeNull();
    expect(container.querySelector('.menu-toggle')?.textContent).toBe('Menu☰');
    act(() => {
      root.unmount();
    });
  });
});

test('shared public footer and compact Build credit expose DB-IP attribution and licence details', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { SiteFooter, AnalyticsCredit, siteOrigin } = await import('./chrome');
  for (const component of [SiteFooter, AnalyticsCredit]) {
    const container = dom.window.document.createElement('div');
    container.innerHTML = renderToStaticMarkup(React.createElement(component));
    expect(container.querySelector('a[href="https://db-ip.com"]')?.textContent).toBe(
      'IP Geolocation by DB-IP',
    );
    expect(container.querySelector(`a[href="${siteOrigin}/privacy/"]`)?.textContent).toMatch(
      /Privacy|Source and licence/,
    );
  }
});
