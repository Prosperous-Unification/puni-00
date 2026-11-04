import { dlopen, ptr } from 'bun:ffi';
import { afterEach, beforeEach } from 'bun:test';

import { installMaintenanceReaper } from './registry-maintenance-process';

function readMaintenanceReaper(): 0 | 1 {
  const native = dlopen('libc.so.6', {
    prctl: { args: ['i32', 'ptr', 'i32', 'i32', 'i32'], returns: 'i32' },
  });
  try {
    const flag = new Int32Array(1);
    if (native.symbols.prctl(37, ptr(flag), 0, 0, 0) !== 0)
      throw new Error('Cannot read test child ownership');
    const inherited = flag.at(0);
    if (inherited !== 0 && inherited !== 1) throw new Error('Unknown test child ownership');
    return inherited;
  } finally {
    native.close();
  }
}

/** Restore the runner's inherited subreaper state after each test has reaped its owned children; otherwise later daemon fixtures become the runner's unreaped children. */
export function scopeMaintenanceReaper(): void {
  let inherited: 0 | 1 | undefined;
  beforeEach(() => {
    inherited = readMaintenanceReaper();
    installMaintenanceReaper();
  });
  afterEach(() => {
    if (inherited === undefined) throw new Error('Missing inherited test child ownership');
    const native = dlopen('libc.so.6', {
      prctl: { args: ['i32', 'i32', 'i32', 'i32', 'i32'], returns: 'i32' },
    });
    try {
      // Proof: omitting native restoration leaves actual flag1 and fails both teardown and the independent same-runner assertion.
      if (native.symbols.prctl(36, inherited, 0, 0, 0) !== 0)
        throw new Error('Cannot restore test child ownership');
    } finally {
      native.close();
    }
    if (readMaintenanceReaper() !== inherited)
      throw new Error('Test child ownership was not restored');
    inherited = undefined;
  });
}
