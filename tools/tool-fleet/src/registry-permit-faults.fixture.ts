export const registryPermitFaults = [
  'trailing-content',
  'blank-second-line',
  'unterminated-suffix',
  'missing-newline',
  'double-space',
  'leading-space',
  'trailing-space',
  'embedded-nul',
  'trailing-nul',
] as const;
export type RegistryPermitFault = (typeof registryPermitFaults)[number];

/** Byte-preserving replay of the original pinned-container permit fault matrix. The fixture supplies a canonical ASCII record; no host clock or production guard is altered. */
export function corruptRegistryPermit(fault: RegistryPermitFault, record: Buffer): Buffer {
  switch (fault) {
    case 'trailing-content':
      return Buffer.concat([record, Buffer.from('CORRUPT\n')]);
    case 'blank-second-line':
      return Buffer.concat([record, Buffer.from('\n')]);
    case 'unterminated-suffix':
      return Buffer.concat([record, Buffer.from('CORRUPT')]);
    case 'missing-newline':
      return record.subarray(0, record.length - 1);
    case 'double-space':
      return Buffer.from(record.toString('ascii').replace(' ', '  '));
    case 'leading-space':
      return Buffer.concat([Buffer.from(' '), record]);
    case 'trailing-space':
      return Buffer.concat([record.subarray(0, record.length - 1), Buffer.from(' \n')]);
    case 'embedded-nul':
      return Buffer.from(record.toString('ascii').replace(' ', '\0 '));
    case 'trailing-nul':
      return Buffer.concat([record, Buffer.from([0])]);
  }
}
