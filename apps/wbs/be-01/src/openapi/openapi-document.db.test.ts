import { expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
import { documentFromApp } from './document-from-app';

it('emits typed directory preview refusals and requires capacity provenance on new limits responses', async () => {
  const mounted = OrganizationHarness.openComposed();
  try {
    const paths = (await documentFromApp(mounted.app))['paths'];
    const json = ['responses', '200', 'content', 'application/json', 'schema'];
    const required: unknown = expect.arrayContaining([
      'error',
      'resourceId',
      'cap',
      'declared',
      'asked',
    ]);
    const properties: unknown = expect.objectContaining({ error: { const: 'capacity_limit' } });
    const refusal: unknown = expect.objectContaining({ required, properties });
    const anyOf: unknown = expect.arrayContaining([refusal, { type: 'null' }]);
    expect(paths).toHaveProperty(
      [
        '/api/organization/resources/{resourceId}/directory-capacity/preview',
        'post',
        ...json,
        'properties',
        'refusal',
      ],
      expect.objectContaining({ anyOf }),
    );
    expect(paths).toHaveProperty(
      [
        '/api/organization/limits',
        'get',
        ...json,
        'properties',
        'usage',
        'properties',
        'capacityUnits',
        'items',
        'required',
      ],
      expect.arrayContaining(['countedFrom']),
    );
  } finally {
    mounted.close();
  }
});
