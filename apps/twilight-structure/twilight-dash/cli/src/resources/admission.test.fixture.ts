import { resourceRuntimeAdmission } from '@wbs/contracts';

import type { ToolAnswer, WbsTools } from '../mcp/wbs-tools';

const ADMISSION_TOOL = 'putApiResourceAuthoritiesByAuthorityIdAdmissions';

/** be-01's receipt for one admission tool call's `input`, as mcp-01 relays it. */
export function admissionReceiptOf(input: Readonly<Record<string, unknown>>): {
  eventId: string;
  useId: string;
  incarnation: string;
} {
  const { authorityId, ...body } = input;
  if (typeof authorityId !== 'string') throw new Error('admission names no authority');
  const admission = resourceRuntimeAdmission.assert(body);
  return {
    eventId: admission.eventId,
    useId: admission.useId,
    incarnation: admission.incarnation,
  };
}

/** Provider-only fixtures stub WBS's tools; the composed smoke exercises actual admission. */
export const admitFixture: WbsTools = {
  call: (name, input): Promise<ToolAnswer> => {
    if (name !== ADMISSION_TOOL) throw new Error('provider fixture only supports admission');
    return Promise.resolve({ kind: 'answered', body: admissionReceiptOf(input) });
  },
  close: () => Promise.resolve(),
};
