import type { ProjectStreamDeps } from '@/lib/project-stream';

/**
 * Every project's socket stays connecting: it never opens, never closes and
 * sends nowhere.
 *
 * For suites about lifetimes rather than the stream. A session owner built
 * without `streamDeps` uses the browser's opener, which resolves its URL from
 * the page's address, so in the node tier every project such a suite opened was
 * an unhandled `ReferenceError`, and under jsdom a real socket to the dev server.
 */
export const SILENT_STREAM: ProjectStreamDeps = {
  openSocket: () => ({ send: () => undefined, close: () => undefined }),
  schedule: () => 0,
  cancel: () => undefined,
  random: () => 0,
};
