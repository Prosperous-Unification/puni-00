/**
 * The canonical name of the system a URL points at, or `null` when no pattern
 * matches and the reader has to say.
 *
 * **Every name this can answer must exist in `external_system`.** The seed in
 * `20260830020000_add_external_ref/migration.sql` and this list are one fact:
 * a URL that derives a name the table does not hold would be a paste that
 * types itself and then fails to store. `external-system.test.ts` asserts the
 * two agree rather than leaving it to be discovered.
 */
export const EXTERNAL_SYSTEMS = [
  'jira-issue',
  'github-pr',
  'github-issue',
  'confluence-page',
  'slack-message',
] as const;

export type ExternalSystemName = (typeof EXTERNAL_SYSTEMS)[number];

/**
 * One host+path rule. Ordered, and the order is load-bearing — see
 * {@link systemOfUrl}.
 */
interface SystemPattern {
  readonly name: ExternalSystemName;
  /** True when this rule claims the URL. Reads the parsed URL, never the string. */
  readonly claims: (url: URL) => boolean;
}

/** `example.atlassian.net` and `atlassian.net` both match; `notatlassian.net` does not. */
const hostIsOrEndsWith = (host: string, suffix: string): boolean =>
  host === suffix || host.endsWith(`.${suffix}`);

/** The path split on `/` with the empty leading and trailing segments dropped. */
const segmentsOf = (url: URL): readonly string[] => url.pathname.split('/').filter(Boolean);

/**
 * The ordered rules.
 *
 * **GitHub's two rules are separated by path and not by host**, and that
 * separation is the whole reason this list is ordered rather than a host map:
 * `github.com` serves pull requests and issues from the same host, and a rule
 * matching the host alone would type every GitHub URL as whichever arm came
 * first. A repository URL with neither segment matches neither rule and is left
 * to the reader, which is correct — it is a link to a repository, not to a PR.
 *
 * Confluence and Jira share `*.atlassian.net`, so they are separated the same
 * way: `/wiki/` is Confluence, `/browse/` is a Jira issue. An Atlassian URL that
 * is neither is left to the reader rather than guessed at.
 */
const PATTERNS: readonly SystemPattern[] = [
  {
    name: 'github-pr',
    claims: (url) => {
      const at = segmentsOf(url);
      return hostIsOrEndsWith(url.hostname, 'github.com') && at[2] === 'pull';
    },
  },
  {
    name: 'github-issue',
    claims: (url) => {
      const at = segmentsOf(url);
      return hostIsOrEndsWith(url.hostname, 'github.com') && at[2] === 'issues';
    },
  },
  {
    name: 'confluence-page',
    claims: (url) =>
      hostIsOrEndsWith(url.hostname, 'atlassian.net') && segmentsOf(url)[0] === 'wiki',
  },
  {
    name: 'jira-issue',
    claims: (url) =>
      hostIsOrEndsWith(url.hostname, 'atlassian.net') && segmentsOf(url)[0] === 'browse',
  },
  {
    name: 'slack-message',
    claims: (url) => hostIsOrEndsWith(url.hostname, 'slack.com'),
  },
];

/**
 * Which system a URL belongs to, or `null` for one no rule claims.
 *
 * **Runs at the write and its answer is stored** (design D1). Nothing derives on
 * read, and that is the change's one irreversible-by-accident rule: this list
 * will grow, and re-deriving on read would silently re-type every existing ref —
 * including ones a reader had corrected by hand — with no record that it had
 * happened. The stored value is what a reader sees, and an override is simply
 * that value differing from what this function would say today.
 *
 * A URL this cannot parse answers `null` rather than throwing. That is not a
 * softened invariant: a pasted string is external data at a boundary, "I do not
 * recognise this" is a modeled answer the editor already renders (the type
 * becomes the reader's to type), and a throw here would turn a typo into a 500.
 * The write path still refuses a ref with **no** system, which is where the
 * unknown is actually not OK.
 *
 * @returns the canonical name, or `null` for an unrecognised or unparseable URL.
 */
export function systemOfUrl(url: string): ExternalSystemName | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Only http(s) is claimed. A `javascript:` or `data:` URL is never a link to a
  // system, and typing one would put a scheme the renderer refuses behind a dot
  // that says it is followable.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return PATTERNS.find((pattern) => pattern.claims(parsed))?.name ?? null;
}
