import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { startRegistryPressureWriter } from './registry-pressure-writer.fixture';

interface RegistryPressureStopArm {
  uid: string;
  resourceVersion: string;
  instance: string;
  priorRequest: string;
}

/**
 * Coordinate one selected synthetic scheduler stop while PID1 retains the actual writer
 * capability. Bootstrap returns no pressure evidence. Arming records the pre-operation
 * request and fresh writer instance; the first matching stop consumes the arm synchronously,
 * before any await. A failed probe still closes that same writer and never produces a receipt.
 * The root-only socket adapter validates patch shape separately; no PID, command or path is
 * accepted from that request. This models Kubernetes termination, not a live scheduler.
 */
export function createRegistryPressureStop(
  writer: Awaited<ReturnType<typeof startRegistryPressureWriter>>,
  readRequest: () => Promise<string>,
  acknowledge: () => Promise<unknown>,
) {
  const Ack = type({
    instanceSha256: /^[a-f0-9]{64}$/,
    requestSha256: /^[a-f0-9]{64}$/,
    allocation: "'ENOSPC'",
    stage: "'open' | 'write'",
    '+': 'reject',
  });
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const requestShape = new RegExp('^' + uuid + ' ' + uuid + ' ' + uuid + '\\n$');
  const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

  let state:
    | { phase: 'bootstrap' }
    | { phase: 'armed'; arm: RegistryPressureStopArm }
    | { phase: 'consumed' } = {
    phase: 'bootstrap',
  };
  let receipt:
    | ({ scope: 'pressure' } & typeof Ack.infer & Awaited<ReturnType<typeof writer.close>>)
    | undefined;
  return {
    arm(arm: RegistryPressureStopArm) {
      // Proof (modeled caller): removing this refusal permits a second arm.
      if (state.phase !== 'bootstrap') throw new Error('Pressure stop can only be armed once');
      // Proof (modeled caller): omission accepts invalid UID/revision/prior request, or reaches read/close with an invalid instance.
      if (
        !/^[A-Za-z0-9-]{1,128}$/.test(arm.uid) ||
        !/^[1-9][0-9]{0,19}$/.test(arm.resourceVersion) ||
        !new RegExp('^' + uuid + ' ' + uuid + '\\n$').test(arm.instance) ||
        !requestShape.test(arm.priorRequest)
      )
        throw new Error('Pressure stop arm lacks current record bindings');
      state = { phase: 'armed', arm: { ...arm } };
    },
    async stop(selected: { uid: string; resourceVersion: string }) {
      if (state.phase === 'bootstrap') return { scope: 'bootstrap' as const };
      if (state.phase !== 'armed') throw new Error('Pressure stop is already consumed');
      const arm = state.arm;
      // Proof (modeled caller): omission accepts a foreign selected Deployment UID.
      if (selected.uid !== arm.uid || selected.resourceVersion !== arm.resourceVersion)
        throw new Error('Pressure stop patch differs from armed UID and revision');
      // Proof (modeled concurrent callers): omitting consumption permits two request reads before the independent release.
      state = { phase: 'consumed' };
      let closed = false;
      try {
        const request = await readRequest();
        // Proof (modeled caller): omission reaches live/probe effects for old, foreign-instance and malformed requests before later refusal.
        if (
          !requestShape.test(request) ||
          request === arm.priorRequest ||
          request.slice(37) !== arm.instance
        )
          throw new Error('Pressure stop requires a fresh current authority request');
        const live = await writer.assertLive();
        // Proof (modeled caller): omission accepts the wrong live writer identity.
        if (live.pid !== writer.pid || live.startTicks !== writer.startTicks)
          throw new Error('Pressure stop writer identity differs');
        // Proof (modeled caller): bypassing the schema accepts successful allocation and an extra receipt field.
        const acknowledgement = Ack.assert(await acknowledge());
        // Proof (modeled caller): omission accepts an ACK bound to the old request.
        if (
          acknowledgement.instanceSha256 !== hash(arm.instance) ||
          acknowledgement.requestSha256 !== hash(request)
        )
          throw new Error('Pressure ACK evidence differs from the selected current request');
        const terminal = await writer.close();
        closed = true;
        // Proof (modeled caller): omission accepts another terminal PID; group absence is established inside writer.close.
        if (terminal.pid !== writer.pid || terminal.startTicks !== writer.startTicks)
          throw new Error('Pressure stop lacks exact writer terminal evidence');
        receipt = { scope: 'pressure', ...acknowledgement, ...terminal };
        return receipt;
      } catch (cause) {
        if (!closed) {
          try {
            // Proof (modeled caller): omission loses owned closure after the probe fails.
            await writer.close();
          } catch (cleanup) {
            // Proof (modeled caller): replacing this aggregate with cleanup loses the original request failure.
            throw new AggregateError([cause, cleanup], 'Pressure stop and owned cleanup failed', {
              // Boundary: cleanup remains in errors while the original selected-stop refusal stays primary.
              // eslint-disable-next-line preserve-caught-error
              cause,
            });
          }
        }
        throw cause;
      }
    },
    receipt() {
      // Proof (modeled caller): removing this check returns undefined for an unarmed receipt.
      if (state.phase !== 'consumed' || receipt === undefined)
        throw new Error('Pressure stop has no completed current receipt');
      return receipt;
    },
  };
}
