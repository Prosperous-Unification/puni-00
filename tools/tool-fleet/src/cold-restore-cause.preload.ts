import { appendFile } from 'node:fs/promises';

import { GetObjectCommand } from '@aws-sdk/client-s3';

export const injected = new Error(
  'f10-synthetic-private-body Credential=f10-synthetic-reader/ Signature=f10-synthetic-signature',
);

const faultReceipt = process.env['F10_TEST_FAULT_RECEIPT'];
if (!faultReceipt) throw new Error('Recorder fault fixture requires its private receipt path');

const resolveMiddleware = Reflect.get(GetObjectCommand.prototype, 'resolveMiddleware');
GetObjectCommand.prototype.resolveMiddleware = function (
  this: GetObjectCommand,
  stack,
  config,
  options,
) {
  if (
    this.input.Bucket === 'puni-cold-restore-fixture' &&
    this.input.Key === 'platform-local/captures/fixture-capture/publication.json' &&
    this.input.VersionId === undefined
  ) {
    this.middlewareStack.add(
      () => async () => {
        await appendFile(faultReceipt, 'publication GetObject fault\n');
        throw injected;
      },
      { step: 'initialize', priority: 'high', name: 'coldRestoreTestFault' },
    );
  }
  return resolveMiddleware.call(this, stack, config, options);
};
