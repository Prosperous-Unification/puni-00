import { isIP } from 'node:net';

import type { ParticipantListener } from './dependency-participant-listener';
import type { ParticipantSnapshot } from './dependency-participant-transition';
import { readFields, readString } from './managed-cohort';

// Proof: bypassing the numeric parser admitted DNS with matching projected address/listener fields; endpoint numeric-parser watch missed its rejection.
/** Canonical numeric connect address only; this pure decoder grants no namespace, listener or readiness authority. */
export function parseParticipantAddress(value: string): {
  address: string;
  family: 'ipv4' | 'ipv6';
} {
  if (value.includes('%') || isIP(value) === 0)
    throw new Error('participant endpoint numeric address unavailable');
  const family = isIP(value) === 4 ? 'ipv4' : 'ipv6';
  const address = family === 'ipv4' ? value : new URL(`http://[${value}]`).hostname.slice(1, -1);
  // Proof: removing unsupported-address refusal returned a wildcard connect address when faulted namespace/network fields agreed; endpoint watch missed its rejection.
  if (address === '0.0.0.0' || address === '::' || address.startsWith('::ffff:'))
    throw new Error('participant endpoint address unsupported');
  return { address, family };
}

/** Selects only the original admitted network's assigned numeric address. It supplies no local-namespace, listener or readiness evidence and cannot substitute for the final HTTP endpoint join. */
export function selectParticipantNetworkAddress(
  original: Pick<ParticipantSnapshot, 'native'>,
  current: Pick<ParticipantSnapshot, 'native'>,
  network: string,
): Readonly<ReturnType<typeof parseParticipantAddress>> {
  const selected = (snapshot: Pick<ParticipantSnapshot, 'native'>) =>
    readFields(readFields(readFields(snapshot.native['NetworkSettings'])['Networks'])[network]);
  const admitted = selected(original);
  const observed = selected(current);
  // Proof: removing this join admitted a substituted selected NetworkID; endpoint network watch missed its rejection.
  if (readString(admitted['NetworkID']) !== readString(observed['NetworkID']))
    throw new Error('participant endpoint original network differs');
  const candidates: { address: string; family: 'ipv4' | 'ipv6' }[] = [];
  for (const [field, family] of [
    ['IPAddress', 'ipv4'],
    ['GlobalIPv6Address', 'ipv6'],
  ] as const) {
    const address = observed[field];
    if (typeof address !== 'string') throw new Error('participant endpoint network address absent');
    if (address === '') continue;
    const candidate = parseParticipantAddress(address);
    // Proof: removing family attribution admitted swapped Docker address-family fields; endpoint network-family watch missed its rejection.
    if (candidate.family !== family) throw new Error('participant endpoint address family differs');
    candidates.push(candidate);
  }
  // IPv4 is selected when explicitly assigned; no fallback to another address after a failed join or HTTP request.
  const candidate = candidates.at(0);
  if (candidate === undefined) throw new Error('participant endpoint candidate absent');
  return candidate;
}

/** Joins an already observed role listener to its original selected network and actual same-namespace local addresses. This pure comparison grants no process, owner or readiness authority. */
export function resolveParticipantHttpEndpoint(
  original: Pick<ParticipantSnapshot, 'native'>,
  current: Pick<ParticipantSnapshot, 'native'>,
  network: string,
  localAddresses: readonly string[],
  listeners: readonly ParticipantListener[],
  port: number,
): Readonly<ParticipantListener> {
  // Proof: removing port validation admitted a zero-port tuple with matching faulted listener metadata; endpoint port watch missed its rejection.
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('participant endpoint port unsupported');
  const candidate = selectParticipantNetworkAddress(original, current, network);
  // Proof: removing namespace address membership admitted an empty actual address set; endpoint local watch missed its rejection.
  if (!localAddresses.includes(candidate.address))
    throw new Error('participant endpoint is absent from the actual namespace');
  // Proof: separately omitting port, family or concrete/wildcard address matching admitted the respective listener fault; three endpoint listener watches missed their rejections.
  const owned = listeners.filter(
    (listener) =>
      listener.port === port &&
      listener.family === candidate.family &&
      (listener.address === candidate.address ||
        listener.address === (candidate.family === 'ipv4' ? '0.0.0.0' : '::')),
  );
  const listener = owned.at(0);
  // Proof: removing competing-listener refusal admitted a duplicated actual inode tuple; endpoint competing watch missed its rejection.
  if (listener === undefined || owned.length > 1)
    throw new Error('participant endpoint exact application listener unavailable');
  return Object.freeze({ ...listener, address: candidate.address });
}
