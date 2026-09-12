import { describe, expect, it } from 'bun:test';

import { brokenSource, replaceMethod } from './broken-source';
import { createFaultControl, defineFault, recordFaultProof } from './faults';

class CounterPort {
  #count = 0;

  increment(): void {
    this.#count += 1;
  }

  read(): number {
    return this.#count;
  }
}

interface CounterSource {
  readonly port: CounterPort;
}

function counterFault() {
  const control = createFaultControl('counter-read');
  return defineFault({
    id: 'break:projects.create:steps',
    caseId: 'projects.create:steps',
    control,
    mutate(source: CounterSource) {
      return {
        port: replaceMethod(source.port, 'read', (read) => () => {
          const count = read();
          return control.reach('counter-read') ? count + 1 : count;
        }),
      };
    },
  });
}

describe('broken source proofs', () => {
  it('an armed fault reaches its named assertion', async () => {
    const fault = counterFault();
    const open = brokenSource((): CounterSource => ({ port: new CounterPort() }), fault);
    let observed = 0;

    const proof = await recordFaultProof(fault, {
      assertion: 'counter read remains one',
      setup: () => {
        const source = open();
        source.port.increment();
        if (source.port.read() !== 1) throw new Error('baseline counter was not one');
        return Promise.resolve(source);
      },
      exercise: (source) => {
        observed = source.port.read();
        return Promise.resolve();
      },
      assert: () => {
        if (observed !== 1) throw new Error(`expected 1, received ${String(observed)}`);
        return Promise.resolve();
      },
    });

    // Proof: removing the recorder's arm returned `phase-failed` / `fault did
    // not reach counter-read`; activating in setup returned `setup-failed` /
    // `baseline counter was not one` instead of this named assertion failure.
    expect(proof).toEqual({
      kind: 'observed',
      faultId: 'break:projects.create:steps',
      caseId: 'projects.create:steps',
      phase: 'counter-read',
      assertion: 'counter read remains one',
      observedFailure: 'expected 1, received 2',
    });
  });

  it('a class port keeps unmodified prototype methods', () => {
    const fault = counterFault();
    const open = brokenSource((): CounterSource => ({ port: new CounterPort() }), fault);
    const source = open();

    source.port.increment();

    // Proof: forwarding this prototype method with the Proxy as its receiver
    // failed above on `TypeError: Cannot access invalid private field`.
    expect(source.port.read()).toBe(1);
  });

  it('a pre-setup failure does not prove an atomicity check', async () => {
    const setupFault = counterFault();
    const setupProof = await recordFaultProof(setupFault, {
      assertion: 'atomic state is unchanged',
      setup: () => Promise.reject(new Error('fixture failed before setup verification')),
      exercise: () => Promise.resolve(),
      assert: () => Promise.reject(new Error('the named assertion failed')),
    });

    // Proof: accepting the setup rejection as proof received `kind: observed`
    // and `observedFailure: fixture failed before setup verification`.
    expect(setupProof).toEqual({
      kind: 'setup-failed',
      faultId: 'break:projects.create:steps',
      caseId: 'projects.create:steps',
      failure: 'fixture failed before setup verification',
    });
    expect(setupFault.control.isArmed()).toBe(false);

    const phaseFault = counterFault();
    const phaseProof = await recordFaultProof(phaseFault, {
      assertion: 'atomic state is unchanged',
      setup: () => Promise.resolve({ port: new CounterPort() }),
      exercise: () => Promise.reject(new Error('operation failed before counter-read')),
      assert: () => Promise.reject(new Error('the named assertion failed')),
    });

    // Proof: accepting the pre-phase operation error as proof received
    // `kind: observed` and that operation error as `observedFailure`.
    expect(phaseProof).toEqual({
      kind: 'phase-failed',
      faultId: 'break:projects.create:steps',
      caseId: 'projects.create:steps',
      phase: 'counter-read',
      failure: 'operation failed before counter-read',
    });
    expect(phaseFault.control.reached()).toBe(false);

    const bypassedFault = counterFault();
    const bypassedProof = await recordFaultProof(bypassedFault, {
      assertion: 'atomic state is unchanged',
      setup: () => Promise.resolve({ port: new CounterPort() }),
      exercise: () => Promise.resolve(),
      assert: () => Promise.reject(new Error('an unrelated assertion failed')),
    });

    // Proof: removing the reached-phase check accepted the unrelated assertion
    // as `kind: observed` instead of reporting the bypassed phase.
    expect(bypassedProof).toEqual({
      kind: 'phase-failed',
      faultId: 'break:projects.create:steps',
      caseId: 'projects.create:steps',
      phase: 'counter-read',
      failure: 'fault did not reach counter-read',
    });
  });
});
