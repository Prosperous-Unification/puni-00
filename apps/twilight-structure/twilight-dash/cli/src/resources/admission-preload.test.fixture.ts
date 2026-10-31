import { fakeMcpFetch } from '../mcp/fake-mcp-fetch.test.fixture';
import { admissionReceiptOf } from './admission.test.fixture';

/** CLI provider fixture answers only admission, as WBS's tool through an in-process fake mcp-01. */
const answer = fakeMcpFetch((name, input) => {
  if (name !== 'putApiResourceAuthoritiesByAuthorityIdAdmissions')
    throw new Error('provider fixture only supports admission');
  return { text: JSON.stringify(admissionReceiptOf(input)) };
});
globalThis.fetch = Object.assign(answer, { preconnect: fetch.preconnect });
