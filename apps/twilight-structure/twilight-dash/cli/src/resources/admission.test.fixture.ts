import { resourceRuntimeAdmission } from '@wbs/contracts';

/** Provider-only fixtures stub the WBS transport; the composed smoke exercises actual admission. */
export async function admitFixture(request: Request): Promise<Response> {
  if (request.method !== 'PUT' || !new URL(request.url).pathname.endsWith('/admissions'))
    throw new Error('provider fixture only supports admission');
  const admission = resourceRuntimeAdmission.assert(await request.json());
  return Response.json({
    eventId: admission.eventId,
    useId: admission.useId,
    incarnation: admission.incarnation,
  });
}
