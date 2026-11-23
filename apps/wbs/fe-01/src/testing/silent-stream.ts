import type { WorkPackageStreamDeps } from '@/lib/work-package-stream';

/**
 * Every work package's socket stays connecting: it never opens, never closes and
 * sends nowhere.
 *
 * For suites about lifetimes rather than the stream. A session owner built
 * without `streamDeps` uses the browser's opener, which resolves its URL from
 * the page's address, so in the node tier every work package such a suite opened was
 * an unhandled `ReferenceError`, and under jsdom a real socket to the dev server.
 */
export const SILENT_STREAM: WorkPackageStreamDeps = {
  openSocket: () => ({ send: () => undefined, close: () => undefined }),
  schedule: () => 0,
  cancel: () => undefined,
  random: () => 0,
};
