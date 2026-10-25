import { admitBuilderScratch } from '../../../tools/tool-fleet/src/registry-capacity';

const request: unknown = JSON.parse(await Bun.stdin.text());
if (
  typeof request !== 'object' ||
  request === null ||
  !('path' in request) ||
  !('receiptPath' in request) ||
  !('excludedPaths' in request) ||
  !('envelope' in request)
)
  throw new Error('Missing fixture request');
// This fixture transports deliberately malformed boundary inputs as well as enrolled requests.
console.log(
  JSON.stringify(await admitBuilderScratch(request as Parameters<typeof admitBuilderScratch>[0])),
);
