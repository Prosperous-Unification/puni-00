import { admitFixture } from './admission.test.fixture';

/** CLI provider fixture injects only its external admission transport. */
globalThis.fetch = Object.assign(
  async (input: Request | string | URL, init?: RequestInit) =>
    admitFixture(input instanceof Request ? input : new Request(input, init)),
  { preconnect: fetch.preconnect },
);
