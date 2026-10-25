import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readPublicationEnrollment } from './registry-enrollment';

it('legacy selection is explicit absence; a selected missing or malformed enrollment never falls back', async () => {
  expect(await readPublicationEnrollment('https://registry.example', {})).toBeUndefined();
  expect(
    (
      await rejectionOf(
        readPublicationEnrollment('https://registry.example', {
          REGISTRY_PUBLICATION_ENROLLMENT: '',
        }),
      )
    ).message,
  ).not.toBe('');
  expect(
    (
      await rejectionOf(
        readPublicationEnrollment('https://registry.example', {
          REGISTRY_PUBLICATION_ENROLLMENT: '/absent-enrollment-task5',
        }),
      )
    ).message,
  ).not.toBe('');
  const directory = await scratchAsync('registry-enrollment-');
  try {
    const path = join(directory, 'enrollment.json');
    await writeFile(path, '{}');
    expect(
      (
        await rejectionOf(
          readPublicationEnrollment('https://registry.example', {
            REGISTRY_PUBLICATION_ENROLLMENT: path,
          }),
        )
      ).message,
    ).not.toBe('');
  } finally {
    await rm(directory, { recursive: true });
  }
});

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('Expected refusal');
}
