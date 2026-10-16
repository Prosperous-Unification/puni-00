import { randomInt } from 'node:crypto';

import type { DomainResolver, Timers } from '@wbs/core';
import { systemTimers } from '@wbs/runtime-portable';
import * as packet from 'dns-packet';

import { canonicalizeIp, isPublicAuthority, parseResolvers } from './addresses';
import { DnsUnavailableError } from './failures';
import {
  decodePacket,
  type DnsPacket,
  type DnsStringAnswer,
  type DnsTxtAnswer,
  readQuestion,
} from './packet';
import { DnsCleanupError } from './transport';

export interface DnsExchange {
  readonly address: string;
  readonly protocol: 'udp' | 'tcp';
  readonly packet: Buffer;
  readonly signal: AbortSignal;
  readonly hardExpiresAt: number;
}
export interface DnsReply {
  readonly packet: Buffer;
  readonly peer: string;
  readonly port: number;
}
export interface DnsTransport {
  exchange(request: DnsExchange): Promise<DnsReply>;
}
interface LookupLifetime {
  readonly signal: AbortSignal;
  readonly workExpiresAt: number;
  readonly hardExpiresAt: number;
}

/**
 * Uses explicit recursive routing, then exact-owner authoritative TXT exchanges.
 * Refuses aliases, glue, prohibited destinations and malformed or incomplete evidence.
 * Each lookup owns a bounded lifetime; cleanup failure is terminal and never proof absence.
 * The deployment contract and dated address policy live in docs/runbook-organization-dns.md.
 */
export class AuthoritativeDnsResolver implements DomainResolver {
  private readonly resolvers: readonly string[];

  /** Configuration is immutable; each lookup owns its request IDs, timers and cancellation. */
  constructor(
    resolvers: readonly string[],
    private readonly transport: DnsTransport,
    private readonly timers: Timers = systemTimers,
  ) {
    const configured = parseResolvers(resolvers.join(','));
    this.resolvers = configured;
  }

  /** Queries the closest discovered zone directly; failures never become proof absence. */
  async lookupTxt(name: string, signal: AbortSignal): Promise<readonly string[]> {
    // Proof: bypassing verification owner failed
    // `rejects invalid owner input before any packet and refuses configured hostnames` (2026-10-16).
    if (
      !/^_wbs-verification\.(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
        name,
      ) ||
      name.length > 253 ||
      name.split('.').some((label) => label.length > 63)
    )
      throw new DnsUnavailableError('DNS verification owner refused');
    // Proof: bypassing pre abort failed
    // `sanitizes pre-abort reasons and sends no packets` (2026-10-16).
    if (signal.aborted) throw new DnsUnavailableError('DNS lookup cancelled');
    const started = this.timers.nowMs();
    const controller = new AbortController();
    const cancel = (): void => {
      controller.abort(new DnsUnavailableError('DNS caller cancelled'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    // Proof: bypassing total deadline failed
    // `shares five seconds across discovery and retries and releases every timer` (2026-10-16).
    const clear = this.timers.schedule(4_800, () => {
      controller.abort(new DnsUnavailableError('DNS lookup deadline exceeded'));
    });
    const lifetime = {
      signal: controller.signal,
      workExpiresAt: started + 4_800,
      hardExpiresAt: started + 4_900,
    };
    try {
      const authorities = await this.discoverAuthorities(name, lifetime);
      for (const address of authorities) {
        lifetime.signal.throwIfAborted();
        try {
          const values = await this.exchange(address, name, 'TXT', false, lifetime, (reply) =>
            readTxt(reply, name),
          );
          // Proof: removing the publication cutoff failed `refuses publication after final packet decoding crosses queued_deadline` (2026-10-16).
          if (this.timers.nowMs() >= lifetime.workExpiresAt)
            throw new DnsUnavailableError('DNS proof publication deadline exceeded');
          // Proof: removing the publication abort check failed `refuses publication after final packet decoding crosses queued_abort` (2026-10-16).
          lifetime.signal.throwIfAborted();
          return values;
        } catch (failure) {
          // Proof: bypassing empty on error failed
          // `distinguishes authoritative absence from unusable DNS evidence: outage` (2026-10-16).
          // Proof: bypassing required cleanup after abort failed
          // `cleanup failure after abort wins over the deadline and refuses fallback` (2026-10-16).
          if (!(failure instanceof DnsUnavailableError)) throw failure;
          lifetime.signal.throwIfAborted();
        }
      }
      throw new DnsUnavailableError('DNS authoritative TXT unavailable');
    } finally {
      clear();
      signal.removeEventListener('abort', cancel);
      controller.abort();
    }
  }

  /** Recursive routing material cannot advance to an ancestor after an unresolved exchange. */
  private async discoverAuthorities(
    owner: string,
    lifetime: LookupLifetime,
  ): Promise<readonly string[]> {
    const labels = owner.split('.');
    let names: readonly string[] | undefined;
    for (let index = 0; index < labels.length; index++) {
      const name = labels.slice(index).join('.');
      const reply = await this.recursive(name, 'NS', lifetime);
      const records = readRoutingRecords(reply, name, 'NS');
      if (records.length === 0) continue;
      const servers = new Set<string>();
      for (const record of records) {
        const server = record.data.toLowerCase();
        // Proof: bypassing NS identity failed
        // `refuses invalid recursive authority evidence: invalid_ns` (2026-10-16).
        if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(server))
          throw new DnsUnavailableError('DNS NS identity refused');
        servers.add(server);
      }
      // Proof: bypassing authority set limit failed
      // `rejects oversized authority sets: NS` (2026-10-16).
      if (servers.size > 8) throw new DnsUnavailableError('DNS authority count refused');
      names = [...servers].sort();
      break;
    }
    // Proof: bypassing NS absence failed
    // `reports validated NS absence and address absence without sending an authoritative packet` (2026-10-16).
    if (names === undefined) throw new DnsUnavailableError('DNS enclosing authority unavailable');
    const addresses = new Set<string>();
    for (const server of names) {
      for (const type of ['A', 'AAAA'] as const) {
        const reply = await this.recursive(server, type, lifetime);
        for (const record of readRoutingRecords(reply, server, type)) {
          const address = canonicalizeIp(record.data);
          if (!isPublicAuthority(address))
            throw new DnsUnavailableError('DNS authoritative destination refused');
          addresses.add(address);
          // Proof: bypassing endpoint set limit failed
          // `rejects oversized authority sets: A` (2026-10-16).
          if (addresses.size > 16) throw new DnsUnavailableError('DNS endpoint count refused');
        }
      }
    }
    return [...addresses].sort();
  }

  /** Uses only configured recursive IPs and treats errors separately from validated absence. */
  private async recursive(
    name: string,
    type: 'NS' | 'A' | 'AAAA',
    lifetime: LookupLifetime,
  ): Promise<DnsPacket> {
    for (const address of this.resolvers) {
      lifetime.signal.throwIfAborted();
      try {
        return await this.exchange(address, name, type, true, lifetime, (reply) => {
          readRoutingRecords(reply, name, type);
          return reply;
        });
      } catch (failure) {
        if (!(failure instanceof DnsUnavailableError)) throw failure;
        lifetime.signal.throwIfAborted();
      }
    }
    throw new DnsUnavailableError('DNS recursive discovery unavailable');
  }

  /** UDP, TCP fallback and synchronous evidence conversion share one attempt budget. */
  private async exchange<T>(
    address: string,
    name: string,
    type: 'NS' | 'A' | 'AAAA' | 'TXT',
    recursive: boolean,
    lifetime: LookupLifetime,
    accept: (reply: DnsPacket) => T,
  ): Promise<T> {
    lifetime.signal.throwIfAborted();
    const started = this.timers.nowMs();
    // Proof: bypassing delayed clock failed
    // `starts no new exchange after the clock passes a delayed lookup work timer` (2026-10-16).
    if (started >= lifetime.workExpiresAt)
      throw new DnsUnavailableError('DNS lookup work budget exhausted');
    // Proof: bypassing attempt deadline failed
    // `retries a timed-out authoritative peer after acknowledged cancellation` (2026-10-16).
    const workExpiresAt = Math.min(started + 900, lifetime.workExpiresAt);
    const hardExpiresAt = Math.min(started + 1_000, lifetime.hardExpiresAt);
    const controller = new AbortController();
    const attempt = controller.signal;
    const cancel = (): void => {
      controller.abort(new DnsUnavailableError('DNS lookup cancelled'));
    };
    lifetime.signal.addEventListener('abort', cancel, { once: true });
    const clear = this.timers.schedule(Math.max(0, workExpiresAt - started), () => {
      controller.abort(new DnsUnavailableError('DNS attempt deadline exceeded'));
    });
    try {
      const id = randomInt(65_536);
      const query = packet.encode({
        type: 'query',
        id,
        flags: recursive ? packet.RECURSION_DESIRED : 0,
        questions: [{ name, type, class: 'IN' }],
      });
      for (const protocol of ['udp', 'tcp'] as const) {
        attempt.throwIfAborted();
        const incoming = await this.joinTransport({
          address,
          protocol,
          packet: query,
          signal: attempt,
          hardExpiresAt,
        });
        if (this.timers.nowMs() >= workExpiresAt)
          controller.abort(new DnsUnavailableError('DNS attempt deadline exceeded'));
        attempt.throwIfAborted();
        // Proof: bypassing peer identity failed
        // `rejects unrelated DNS replies: peer` (2026-10-16).
        // Proof: bypassing peer port failed
        // `rejects unrelated DNS replies: port` (2026-10-16).
        if (canonicalizeIp(incoming.peer) !== address || incoming.port !== 53)
          throw new DnsUnavailableError('DNS response peer refused');
        let bytes = incoming.packet;
        if (protocol === 'tcp') {
          // Proof: bypassing TCP frame failed
          // `rejects incorrect TCP length even when its DNS payload matches` (2026-10-16).
          if (bytes.length < 2 || bytes.length !== bytes.readUInt16BE(0) + 2)
            throw new DnsUnavailableError('DNS TCP frame refused');
          bytes = bytes.subarray(2);
        }
        const question = readQuestion(bytes);
        const numericType = { A: 1, NS: 2, TXT: 16, AAAA: 28 }[type];
        // Proof: bypassing transaction ID failed
        // `rejects unrelated DNS replies: id` (2026-10-16).
        // Proof: bypassing response bit failed
        // `rejects unrelated DNS replies: query` (2026-10-16).
        if (
          question.id !== id ||
          (question.flags & 0x8000) === 0 ||
          // Proof: bypassing query opcode failed
          // `rejects unrelated DNS replies: opcode` (2026-10-16).
          (question.flags & 0x7800) !== 0 ||
          // Proof: bypassing question name failed
          // `rejects unrelated DNS replies: name` (2026-10-16).
          question.name.toLowerCase() !== name ||
          // Proof: bypassing question type failed
          // `rejects unrelated DNS replies: type` (2026-10-16).
          question.type !== numericType
        )
          throw new DnsUnavailableError('DNS response question refused');
        if ((question.flags & packet.TRUNCATED_RESPONSE) !== 0) {
          continue;
        }
        const accepted = accept(decodePacket(bytes));
        // Proof: removing the decoded work cutoff failed `refuses final text conversion after local attempt deadline` (2026-10-16).
        if (this.timers.nowMs() >= workExpiresAt)
          throw new DnsUnavailableError('DNS decoded response work budget exhausted');
        // Proof: removing the decoded attempt abort check failed `refuses final text conversion after local attempt cancellation` (2026-10-16).
        attempt.throwIfAborted();
        return accepted;
      }
      throw new DnsUnavailableError('DNS complete response unavailable');
    } finally {
      clear();
      lifetime.signal.removeEventListener('abort', cancel);
      controller.abort();
    }
  }

  /** Detects a transport that fails to acknowledge cancellation by the absolute hard bound. */
  private async joinTransport(request: DnsExchange): Promise<DnsReply> {
    let clear = (): void => undefined;
    const unconfirmed = new Promise<never>((_resolve, reject) => {
      clear = this.timers.schedule(Math.max(0, request.hardExpiresAt - this.timers.nowMs()), () => {
        // Proof: removing the hard join refusal failed `bounds one endpoint attempt and ignores late replies after abort` (2026-10-16).
        reject(new DnsCleanupError('DNS transport cleanup unconfirmed'));
      });
    });
    try {
      return await Promise.race([this.transport.exchange(request), unconfirmed]);
    } finally {
      clear();
    }
  }
}

/** Rejects aliases and contradictory recursive answers while preserving validated absence. */
function readRoutingRecords<T extends 'NS' | 'A' | 'AAAA'>(
  reply: DnsPacket,
  name: string,
  type: T,
): readonly (DnsStringAnswer & { readonly type: T })[] {
  const rcode = reply.flags & 15;
  // Proof: bypassing routing rcode failed
  // `tries the next configured recursive resolver only after modeled failure` (2026-10-16).
  if (rcode !== 0 && rcode !== 3) throw new DnsUnavailableError('DNS routing response unavailable');
  // Proof: bypassing routing alias failed
  // `refuses invalid recursive authority evidence: alias` (2026-10-16).
  if (
    [...reply.answers, ...reply.authorities, ...reply.additionals].some(
      (record) =>
        (record.type === 'CNAME' || record.type === 'DNAME') && encloses(record.name, name),
    )
  )
    throw new DnsUnavailableError('DNS alias substitution refused');
  // Proof: bypassing routing NXDOMAIN failed
  // `refuses invalid recursive authority evidence: nxdomain_answer` (2026-10-16).
  if (rcode === 3 && reply.answers.length > 0)
    throw new DnsUnavailableError('DNS contradictory routing negative refused');
  // Proof: bypassing routing owner failed
  // `refuses invalid recursive authority evidence: owner` (2026-10-16).
  if (reply.answers.some((record) => record.name.toLowerCase() !== name || record.type !== type))
    throw new DnsUnavailableError('DNS routing owner or type refused');
  // Boundary: the checks above classify every answer as the requested IN
  // routing type; the pinned codec decodes these checked RDATA spans to strings.
  return reply.answers as readonly (DnsStringAnswer & { readonly type: T })[];
}

/** Accepts only exact-owner TXT proof or SOA-backed authoritative absence. */
function readTxt(reply: DnsPacket, owner: string): readonly string[] {
  // Proof: bypassing AA failed
  // `requires authoritative exact-owner answers: aa` (2026-10-16).
  if ((reply.flags & packet.AUTHORITATIVE_ANSWER) === 0)
    throw new DnsUnavailableError('DNS authority flag absent');
  const rcode = reply.flags & 15;
  // Proof: bypassing authoritative rcode failed
  // `refuses a non-NOERROR authoritative proof with rcode 2` (2026-10-16).
  if (rcode !== 0 && rcode !== 3)
    throw new DnsUnavailableError('DNS authoritative response unavailable');
  // Proof: bypassing authoritative alias failed
  // `requires authoritative exact-owner answers: alias` (2026-10-16).
  if (
    [...reply.answers, ...reply.authorities, ...reply.additionals].some(
      (record) =>
        (record.type === 'CNAME' || record.type === 'DNAME') && encloses(record.name, owner),
    )
  )
    throw new DnsUnavailableError('DNS authoritative alias refused');
  // Proof: bypassing answer owner failed
  // `requires authoritative exact-owner answers: owner` (2026-10-16).
  if (reply.answers.some((record) => record.name.toLowerCase() !== owner || record.type !== 'TXT'))
    throw new DnsUnavailableError('DNS authoritative owner or type refused');
  // Proof: bypassing authoritative NXDOMAIN failed
  // `refuses a non-NOERROR authoritative proof with rcode 3` (2026-10-16).
  if (rcode === 3 && reply.answers.length > 0)
    throw new DnsUnavailableError('DNS contradictory authoritative negative refused');
  if (reply.answers.length > 0) {
    // Boundary: every answer was classified as exact-owner IN/TXT above;
    // the pinned codec always returns Buffer fragments for checked TXT RDATA.
    const records = reply.answers as readonly DnsTxtAnswer[];
    return records.map((record) => {
      // Proof: bypassing trusted TXT UTF8 failed
      // `rejects corrupted UTF-8 returned by the trusted codec after wire validation` (2026-10-16).
      // Proof: bypassing TXT BOM failed
      // `preserves BOM, whitespace, case and duplicate TXT records` (2026-10-16).
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        // Proof: bypassing TXT record boundary failed
        // `separate TXT records cannot be joined into the current proof` (2026-10-16).
        Buffer.concat(record.data),
      );
    });
  }
  // Proof: bypassing negative SOA failed
  // `accepts authoritative negative only with enclosing SOA: rcode 0` (2026-10-16).
  if (
    // Proof: bypassing authority TXT failed
    // `distinguishes authoritative absence from unusable DNS evidence: authority_txt` (2026-10-16).
    reply.authorities.some((record) => record.type === 'NS' || record.type === 'TXT') ||
    // Proof: bypassing additional TXT failed
    // `distinguishes authoritative absence from unusable DNS evidence: additional_txt` (2026-10-16).
    reply.additionals.some((record) => record.type === 'TXT') ||
    !reply.authorities.some((record) => record.type === 'SOA' && encloses(record.name, owner))
  )
    throw new DnsUnavailableError('DNS authoritative negative lacks enclosing SOA');
  return [];
}

/** DNS owner matching is case-insensitive and respects label boundaries. */
function encloses(zone: string, owner: string): boolean {
  const canonical = zone.toLowerCase();
  return canonical === '.' || owner === canonical || owner.endsWith(`.${canonical}`);
}
