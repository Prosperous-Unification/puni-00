import type { SavedPlanRoutes } from '@/modules/saved-plans/contract';

/** Refuses whatever a node without the routes is asked, which nothing should ask. */
const notServed = () => Promise.reject(new Error('no saved plans on this node'));

/**
 * A node without saved plans: the capability question answers no, so the shelf
 * says so, subscribes to nothing and never lists.
 */
export const NO_SAVED_PLANS: SavedPlanRoutes = {
  available: () => Promise.resolve(false),
  list: notServed,
  save: notServed,
  rename: notServed,
  compare: notServed,
  subscribe: () => ({ unsubscribe: () => undefined }),
};
