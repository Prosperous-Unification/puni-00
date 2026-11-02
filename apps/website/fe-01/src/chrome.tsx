import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

import { locateHeroMedia, selectHeroLayer } from './hero-media';

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

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(reducedMotionQuery).matches;
}

/**
 * The site's background video as a fixed full-viewport layer under a dark scrim, painted behind
 * a `.night-shell` page whose own background is the night gradient. A load error switches the
 * class to `hero-media-gradient`, which hides the layer and leaves that gradient. The video has
 * no `crossorigin` attribute, so the site origin needs no CORS and receives no draft cookie.
 */
export function HeroMedia() {
  const isReducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion);
  const [isMediaFailed, setMediaFailed] = useState(false);
  const layer = selectHeroLayer(isReducedMotion, isMediaFailed);
  const media = locateHeroMedia(siteOrigin);
  function markFailed(): void {
    setMediaFailed(true);
  }
  // Proof: deleting both onError handlers made screens.mjs `build-media-failed` report "media
  // failure did not switch to the gradient" at all four widths.
  return (
    <div className={`hero-media hero-media-${layer}`} aria-hidden="true">
      {layer === 'video' && (
        <video
          src={media.video}
          poster={media.poster}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onError={markFailed}
        />
      )}
      {layer === 'poster' && <img src={media.poster} alt="" onError={markFailed} />}
      {layer !== 'gradient' && <div className="hero-scrim" />}
    </div>
  );
}

/**
 * The site's moon after the wordmark, served by the site origin. The image is decoration (empty
 * alt); when it fails to load, the wordmark falls back to the orange dot.
 */
function Moon() {
  const [isFailed, setFailed] = useState(false);
  // Proof: deleting this fallback branch made the chrome.test.ts dot case still find the picture.
  if (isFailed) return <span className="wordmark-dot" aria-hidden="true"></span>;
  return (
    <picture className="wordmark-moon">
      <source srcSet={`${siteOrigin}/media/brand/moon.avif`} type="image/avif" />
      <img
        src={`${siteOrigin}/media/brand/moon.webp`}
        alt=""
        width={96}
        height={96}
        decoding="async"
        onError={() => {
          setFailed(true);
        }}
      />
    </picture>
  );
}

/** The header wordmark: `PUNI` followed by the site's moon, at the site's size for each width. */
function Wordmark() {
  return (
    <span className="wordmark-header">
      PUNI
      <Moon />
    </span>
  );
}

/** The footer's static wordmark with the orange dot. */
function FooterWordmark() {
  return (
    <span className="wordmark">
      PUNI<span className="wordmark-dot" aria-hidden="true"></span>
    </span>
  );
}

/**
 * Header colours only; geometry and type are identical in both. `night` is the site's white-on-
 * dark header over a video band; `light` is the same header in ink on the operator's paper.
 */
export type HeaderTone = 'light' | 'night';

/** `flow` occupies a page row; `overlay` sits above the Build main's reserved top inset. */
export type HeaderPlacement = 'flow' | 'overlay';

const navigation = [
  { label: 'Home', href: `${siteOrigin}/` },
  { label: 'Build', href: '/' },
  { label: 'Services', href: `${siteOrigin}/services/` },
  { label: 'Blog', href: `${siteOrigin}/blog/` },
] as const;

/**
 * The measured landing masthead: left identity, right horizontal desktop links and a narrow
 * Menu. Escape closes the panel and restores toggle focus. `buildCurrent` marks Build as the
 * page or the manual brief's section; both tones share geometry. See browser/screens.mjs for
 * the live reference measurements and bounds. Overlay callers reserve the masthead inset.
 */
export function SiteHeader({
  buildCurrent,
  tone,
  placement = 'flow',
}: {
  buildCurrent?: 'page' | 'true';
  tone: HeaderTone;
  placement?: HeaderPlacement;
}) {
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
    <header className={`site-header site-header-${tone} site-header-placement-${placement}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* Proof: moving the identity after Menu failed screens.mjs tab-order-390. */}
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
        Menu
        <span className="menu-glyph" aria-hidden="true">
          ☰
        </span>
      </button>
      <nav aria-label="Primary" className="site-nav" id={panelId} data-open={open}>
        <ul>
          {navigation.map((entry) => (
            <li key={entry.label}>
              <a
                href={entry.href}
                aria-current={entry.label === 'Build' ? buildCurrent : undefined}
              >
                {entry.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/** Visible dataset attribution shared by the public app footers; source/licence live in privacy. */
export function AnalyticsCredit() {
  return (
    <span className="analytics-credit">
      {/* Proof: removing the linked credit failed shared public footer and compact Build credit. */}
      <a href="https://db-ip.com">IP Geolocation by DB-IP</a>
      {' · '}
      <a href={`${siteOrigin}/privacy/`}>Source and licence</a>
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer" className="footer-links">
        <div>
          <h2>Explore</h2>
          <a href={`${siteOrigin}/services/`}>Services</a>
          <a href={`${siteOrigin}/blog/`}>Blog</a>
        </div>
        <div>
          <h2>Get in touch</h2>
          <a href={`${siteOrigin}/#request`}>Start a Request</a>
          <a href={`${siteOrigin}/privacy/`}>Privacy</a>
        </div>
      </nav>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} PUNI</span>
        <AnalyticsCredit />
        <FooterWordmark />
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
