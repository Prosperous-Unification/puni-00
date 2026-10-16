import * as packet from 'dns-packet';

import type {} from './codec';
import { DnsUnavailableError } from './failures';

interface NameSuffix {
  readonly length: number;
  readonly hops: number;
  readonly visits: number;
  readonly isHost: boolean;
}

/** Pinned codec fields made total by the checked wire shape and its fixed return contract. */
export type DnsStringAnswer = packet.BaseAnswer<'A' | 'AAAA' | 'NS' | 'CNAME' | 'DNAME', string> & {
  readonly class: 'IN';
};
export type DnsTxtAnswer = packet.BaseAnswer<'TXT', readonly Buffer[]> & { readonly class: 'IN' };
export type DnsAnswer =
  DnsStringAnswer | DnsTxtAnswer | (packet.SoaAnswer & { readonly class: 'IN' });

/** OPT is excluded by the raw type allowlist before codec dispatch. */
export interface DnsPacket {
  readonly id: number;
  readonly flags: number;
  readonly questions: readonly packet.Question[];
  readonly answers: readonly DnsAnswer[];
  readonly authorities: readonly DnsAnswer[];
  readonly additionals: readonly DnsAnswer[];
}

const supportedTypes = new Set([1, 2, 5, 6, 16, 28, 39]);
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Checks only a response envelope so a matching truncated datagram can request TCP. */
export function readQuestion(bytes: Buffer): {
  readonly id: number;
  readonly flags: number;
  readonly name: string;
  readonly type: number;
} {
  inspectHeader(bytes);
  const cursor = inspectName(bytes, 12, bytes.length, new Map(), { visits: 0 });
  // Proof: bypassing question envelope class failed
  // `refuses a truncated UDP question with wrong class before TCP fallback` (2026-10-16).
  if (cursor + 4 > bytes.length || bytes.readUInt16BE(cursor + 2) !== 1)
    throw new DnsUnavailableError('DNS question span or class refused');
  return {
    id: bytes.readUInt16BE(0),
    flags: bytes.readUInt16BE(2),
    name: packet.name.decode(bytes, 12),
    type: bytes.readUInt16BE(cursor),
  };
}

/** Bounds allocations before any codec entry point that allocates sections. */
function inspectHeader(bytes: Buffer): number {
  // Proof: bypassing packet size failed
  // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
  if (bytes.length < 12 || bytes.length > 65_535)
    throw new DnsUnavailableError('DNS packet size refused');
  const questions = bytes.readUInt16BE(4);
  const count = bytes.readUInt16BE(6) + bytes.readUInt16BE(8) + bytes.readUInt16BE(10);
  // Proof: bypassing preallocation count failed
  // `refuses oversized counts before allocating full decode` (2026-10-16).
  if (questions !== 1 || count > 256) throw new DnsUnavailableError('DNS section counts refused');
  return count;
}

/**
 * Validates only supported DNS framing before the pinned codec allocates or dispatches.
 * The 2026-10-16 codec boundary amendment in the change design defines this boundary.
 * Malformed, unsupported, ambiguous or excessive packets throw without packet content.
 */
export function decodePacket(bytes: Buffer): DnsPacket {
  const count = inspectHeader(bytes);
  const suffixes = new Map<number, NameSuffix>();
  const work = { visits: 0 };
  let cursor = inspectName(bytes, 12, bytes.length, suffixes, work);
  // Proof: bypassing question span failed
  // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
  if (cursor + 4 > bytes.length) throw new DnsUnavailableError('DNS question incomplete');
  // Proof: bypassing question packet class failed
  // `rejects a non-IN question before full packet decoding` (2026-10-16).
  if (bytes.readUInt16BE(cursor + 2) !== 1)
    throw new DnsUnavailableError('DNS question class refused');
  cursor += 4;
  for (let index = 0; index < count; index++) {
    cursor = inspectName(bytes, cursor, bytes.length, suffixes, work);
    // Proof: bypassing record header span failed
    // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
    if (cursor + 10 > bytes.length) throw new DnsUnavailableError('DNS record header incomplete');
    const type = bytes.readUInt16BE(cursor);
    // Proof: bypassing unsupported dispatch failed
    // `rejects unsupported record decoders before dispatch` (2026-10-16).
    if (!supportedTypes.has(type)) throw new DnsUnavailableError('DNS record type unsupported');
    // Proof: bypassing raw record class failed
    // `rejects mDNS class masking in unicast answers` (2026-10-16).
    if (bytes.readUInt16BE(cursor + 2) !== 1)
      throw new DnsUnavailableError('DNS record class refused');
    const start = cursor + 10;
    const end = start + bytes.readUInt16BE(cursor + 8);
    // Proof: bypassing record span failed
    // `rejects truncated RDATA and empty TXT as modeled protocol failures` (2026-10-16).
    if (end > bytes.length) throw new DnsUnavailableError('DNS record span incomplete');
    inspectRdata(bytes, start, end, type, suffixes, work);
    cursor = end;
  }
  // Proof: bypassing trailing bytes failed
  // `rejects a trailing payload and a missing question` (2026-10-16).
  if (cursor !== bytes.length) throw new DnsUnavailableError('DNS trailing payload refused');
  const decoded = packet.decode(bytes);
  // Proof: bypassing packet codec contract failed
  // `refuses a codec dependency that reports incorrect packet consumption` (2026-10-16).
  if (packet.decode.bytes !== bytes.length)
    throw new DnsUnavailableError('DNS codec consumption refused');
  // Boundary: dns-packet@5.6.1 always populates these fields; exact sections,
  // supported decoders and their byte spans have been checked above.
  return decoded as DnsPacket;
}

/** Validates spans and known label targets without replacing the codec's name decoder. */
function inspectName(
  bytes: Buffer,
  start: number,
  end: number,
  suffixes: Map<number, NameSuffix>,
  work: { visits: number },
  mailbox = false,
): number {
  const staged = new Map<number, NameSuffix>();
  const labels: { offset: number; width: number; isHost: boolean }[] = [];
  let cursor = start;
  let suffix: NameSuffix;
  for (;;) {
    // Proof: bypassing name span failed
    // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
    if (cursor >= end) throw new DnsUnavailableError('DNS name span incomplete');
    const width = bytes.readUInt8(cursor);
    if (width === 0) {
      suffix = { length: 1, hops: 0, visits: 1, isHost: true };
      staged.set(cursor++, suffix);
      break;
    }
    if ((width & 0xc0) === 0xc0) {
      // Proof: bypassing pointer span failed
      // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
      if (cursor + 2 > end) throw new DnsUnavailableError('DNS pointer span incomplete');
      const target = bytes.readUInt16BE(cursor) & 0x3fff;
      const prior = suffixes.get(target);
      // Proof: bypassing pointer target failed
      // `rejects pointers into bytes that never began a validated name` (2026-10-16).
      if (target >= cursor || prior === undefined)
        throw new DnsUnavailableError('DNS pointer target refused');
      // Proof: bypassing pointer hops failed
      // `bounds compression dereferences while accepting valid compressed names` (2026-10-16).
      if (prior.hops >= 128) throw new DnsUnavailableError('DNS pointer work refused');
      // Proof: bypassing mailbox pointer identity failed
      // `refuses an owner pointer into an escaped SOA mailbox label` (2026-10-16).
      if (!prior.isHost && !(mailbox && labels.length === 0))
        throw new DnsUnavailableError('DNS name identity refused');
      suffix = { ...prior, hops: prior.hops + 1, visits: prior.visits + 1 };
      staged.set(cursor, suffix);
      cursor += 2;
      break;
    }
    // Proof: bypassing label span failed
    // `refuses packet size, incomplete question, record headers and name spans as modeled faults` (2026-10-16).
    if ((width & 0xc0) !== 0 || cursor + 1 + width > end)
      throw new DnsUnavailableError('DNS label span refused');
    let isHost = true;
    for (let offset = cursor + 1; offset <= cursor + width; offset++) {
      const octet = bytes.readUInt8(offset);
      const hostOctet =
        (octet >= 48 && octet <= 57) ||
        (octet >= 65 && octet <= 90) ||
        (octet >= 97 && octet <= 122) ||
        octet === 45 ||
        octet === 95;
      if (!hostOctet) {
        isHost = false;
        // Proof: bypassing name label identity failed
        // `refuses embedded-dot owner identity confusion` (2026-10-16).
        if (!(mailbox && labels.length === 0 && octet >= 33 && octet <= 126 && octet !== 92))
          throw new DnsUnavailableError('DNS name identity refused');
      }
    }
    labels.push({ offset: cursor, width: width + 1, isHost });
    cursor += width + 1;
  }
  for (const label of labels.toReversed()) {
    suffix = {
      length: suffix.length + label.width,
      hops: suffix.hops,
      visits: suffix.visits + 1,
      isHost: suffix.isHost && label.isHost,
    };
    // Proof: bypassing expanded name bound failed
    // `bounds expansion before invoking the codec name decoder` (2026-10-16).
    if (suffix.length > 255) throw new DnsUnavailableError('DNS expanded name refused');
    staged.set(label.offset, suffix);
  }
  work.visits += suffix.visits;
  // Proof: bypassing aggregate name work failed
  // `bounds aggregate name work before the full packet decoder` (2026-10-16).
  if (work.visits > 131_072) throw new DnsUnavailableError('DNS packet name work refused');
  for (const [offset, completed] of staged) suffixes.set(offset, completed);
  // Boundary: the reviewed codec exposes this option but @types omits it.
  // Reflection returns unknown so the undocumented API does not leak a cast.
  const escaped: unknown = Reflect.apply(packet.name.decode, undefined, [
    bytes.subarray(0, end),
    start,
    { mail: true },
  ]);
  // Proof: bypassing name codec contract failed
  // `refuses a codec dependency that reports incorrect name consumption before full decode` (2026-10-16).
  if (typeof escaped !== 'string' || packet.name.decode.bytes !== cursor - start)
    throw new DnsUnavailableError('DNS name codec consumption refused');
  return cursor;
}

/** Checks supported RDATA before any high-level decoder sees it. */
function inspectRdata(
  bytes: Buffer,
  start: number,
  end: number,
  type: number,
  suffixes: Map<number, NameSuffix>,
  work: { visits: number },
): void {
  if (type === 1 || type === 28) {
    // Proof: bypassing address width failed
    // `rejects A and AAAA RDATA with incorrect fixed widths` (2026-10-16).
    if (end - start !== (type === 1 ? 4 : 16))
      throw new DnsUnavailableError('DNS address width refused');
    return;
  }
  if (type === 2 || type === 5 || type === 39) {
    // Proof: bypassing NS consumption failed
    // `rejects NS and SOA RDATA that cross declared boundaries` (2026-10-16).
    if (inspectName(bytes, start, end, suffixes, work) !== end)
      throw new DnsUnavailableError('DNS name RDATA consumption refused');
    return;
  }
  if (type === 6) {
    const next = inspectName(bytes, start, end, suffixes, work);
    // Proof: bypassing SOA consumption failed
    // `rejects NS and SOA RDATA that cross declared boundaries` (2026-10-16).
    if (inspectName(bytes, next, end, suffixes, work, true) + 20 !== end)
      throw new DnsUnavailableError('DNS SOA consumption refused');
    return;
  }
  let cursor = start;
  const fragments: Buffer[] = [];
  // Proof: bypassing TXT nonempty failed
  // `rejects truncated RDATA and empty TXT as modeled protocol failures` (2026-10-16).
  if (cursor === end) throw new DnsUnavailableError('DNS TXT has no character string');
  while (cursor < end) {
    const width = bytes.readUInt8(cursor++);
    // Proof: bypassing TXT span failed
    // `rejects TXT fragment overrun and invalid UTF-8 bytes` (2026-10-16).
    if (cursor + width > end) throw new DnsUnavailableError('DNS TXT fragment span refused');
    fragments.push(bytes.subarray(cursor, cursor + width));
    cursor += width;
  }
  // A UTF-8 code point may be split between wire fragments of the same RR.
  try {
    // Proof: bypassing TXT encoding failed
    // `rejects TXT fragment overrun and invalid UTF-8 bytes` (2026-10-16).
    utf8.decode(Buffer.concat(fragments));
  } catch {
    throw new DnsUnavailableError('DNS TXT encoding refused');
  }
}
