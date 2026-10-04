import React, { useEffect, useId, useRef, useState } from 'react';

export const siteOrigin = import.meta.env['VITE_SITE_ORIGIN'] ?? 'http://localhost:4321';

/** Sets the tab title for the current route or state. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · PUNI`;
  }, [title]);
}

/**
 * Moves focus to the page's h1 whenever `stateKey` changes, so keyboard and screen-reader users
 * land on the new state instead of a removed control. The h1 must carry `tabIndex={-1}`.
 * Focus does not scroll: on stacked mobile layouts the h1 can sit below the context panel, and
 * scrolling there during loading made the footer flash into view and shift (CLS 0.3 at 320px).
 */
export function useHeadingFocus(stateKey: string): React.RefObject<HTMLHeadingElement | null> {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [stateKey]);
  return heading;
}

function Wordmark() {
  return (
    <span className="wordmark">
      PUNI<span className="wordmark-dot" aria-hidden="true"></span>
    </span>
  );
}

const navigation = [
  { index: 1, label: 'Home', href: `${siteOrigin}/` },
  { index: 2, label: 'Build', href: '/' },
  { index: 3, label: 'Services', href: `${siteOrigin}/services/` },
  { index: 4, label: 'Blog', href: `${siteOrigin}/blog/` },
] as const;

/**
 * Public header: numbered navigation at left and a centered wordmark; the right column stays
 * empty so the wordmark holds the center. Below 900px the navigation collapses behind a Menu
 * disclosure that takes the right slot. `buildCurrent` marks Build as the current page
 * (`page`) or as the section the manual brief belongs to (`true`).
 */
export function SiteHeader({ buildCurrent }: { buildCurrent: 'page' | 'true' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* Brand precedes the toggle so mobile focus order matches the visual order; grid
          placement keeps it centered on desktop. Proof: moving it after the toggle made the
          screens.mjs tab-order-390 check report skip-link,menu-toggle,brand. */}
      <a className="brand" href={`${siteOrigin}/`} aria-label="PUNI home">
        <Wordmark />
      </a>
      <button
        ref={menuButton}
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {open ? 'Close' : 'Menu'}
        <span className="menu-glyph" aria-hidden="true" data-open={open}></span>
      </button>
      <nav aria-label="Primary" className="site-nav" id={panelId} data-open={open}>
        <ul>
          {navigation.map((entry) => (
            <li key={entry.index}>
              <a
                href={entry.href}
                aria-current={entry.label === 'Build' ? buildCurrent : undefined}
              >
                <span className="nav-index" aria-hidden="true">
                  [{entry.index}]
                </span>{' '}
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/** Private operator header: wordmark and workspace name only, without marketing navigation. */
export function OperatorHeader() {
  return (
    <header className="operator-header">
      <span className="brand" aria-label="PUNI">
        <Wordmark />
      </span>
      <span className="operator-label">Operator</span>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-lead">
          <Wordmark />
          <p>Clear software starts with a clear request.</p>
          <a className="button secondary" href={`${siteOrigin}/#request`}>
            Describe your project
          </a>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <div>
            <h2>Explore</h2>
            <a href={`${siteOrigin}/services/`}>Services</a>
            <a href={`${siteOrigin}/blog/`}>Blog</a>
          </div>
          <div>
            <h2>PUNI</h2>
            <a href={`${siteOrigin}/#request`}>Start a Request</a>
            <a href={`${siteOrigin}/privacy/`}>Privacy</a>
          </div>
        </nav>
      </div>
      <p className="footer-mark" aria-hidden="true">
        PUNI
      </p>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} PUNI</span>
        <span>A person reviews every request.</span>
      </div>
    </footer>
  );
}

export function OperatorFooter() {
  return (
    <footer className="operator-footer">
      <span>© {new Date().getFullYear()} PUNI</span>
      <span>Private operator workspace</span>
    </footer>
  );
}
