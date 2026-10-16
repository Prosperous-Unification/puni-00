import { describe, expect, it, spyOn } from 'bun:test';
import * as packet from 'dns-packet';

import { DnsUnavailableError } from './failures';
import { decodePacket } from './packet';

const question = {
  name: '_wbs-verification.example.com',
  type: 'TXT' as const,
  class: 'IN' as const,
};

function encodeReply(answers: packet.Answer[] = []): Buffer {
  return packet.encode({
    type: 'response',
    id: 0x1234,
    flags: packet.AUTHORITATIVE_ANSWER,
    questions: [question],
    answers,
  });
}

function rejectReply(bytes: Buffer): void {
  expect(() => decodePacket(bytes)).toThrow(DnsUnavailableError);
}

function rejectBeforeDecode(bytes: Buffer): void {
  const decode = spyOn(packet, 'decode');
  try {
    rejectReply(bytes);
    expect(decode).not.toHaveBeenCalled();
  } finally {
    decode.mockRestore();
  }
}

describe('bounded authoritative DNS packet boundary', () => {
  it('refuses packet size, incomplete question, record headers and name spans as modeled faults', () => {
    rejectReply(Buffer.from([0]));
    rejectReply(Buffer.alloc(65_536));
    rejectReply(encodeReply().subarray(0, -2));
    const header = Buffer.from('123484000001000000000000', 'hex');
    for (const name of [Buffer.from([1, 97]), Buffer.from([0xc0]), Buffer.from([4, 97])])
      rejectReply(Buffer.concat([header, name]));
    const bytes = encodeReply([{ ...question, ttl: 60, data: [Buffer.from('proof')] }]);
    rejectReply(bytes.subarray(0, -8));
  });

  it('refuses an owner pointer into an escaped SOA mailbox label', () => {
    const bytes = encodeReply([
      {
        name: 'example.com',
        type: 'SOA',
        ttl: 60,
        data: {
          mname: 'ns.example.com',
          rname: '_wbs-verification\\.example.com',
          serial: 1,
          refresh: 2,
          retry: 3,
          expire: 4,
          minimum: 5,
        },
      },
    ]);
    bytes.writeUInt16BE(2, 6);
    const record = Buffer.from('c056001000010000003c00060570726f6f66', 'hex');
    rejectBeforeDecode(Buffer.concat([bytes, record]));
  });
  it('preserves independent TXT records and fragment bytes', () => {
    const reply = decodePacket(
      encodeReply([
        { ...question, ttl: 60, data: [Buffer.from('proof-'), Buffer.from('A')] },
        { ...question, ttl: 60, data: [Buffer.from('other')] },
      ]),
    );
    expect(reply.answers).toHaveLength(2);
    expect(reply.questions).toEqual([question]);
  });

  it('refuses embedded-dot owner identity confusion', () => {
    const bytes = encodeReply();
    bytes[30] = 11;
    bytes[38] = 46;
    rejectReply(bytes);
  });

  it('rejects cyclic compression and oversized declared sections', () => {
    rejectReply(Buffer.from('123480000001000000000000c00c00100001', 'hex'));
    const bytes = encodeReply();
    bytes.writeUInt16BE(257, 6);
    rejectReply(bytes);
  });

  it('refuses oversized counts before allocating full decode', () => {
    const bytes = encodeReply(
      Array.from({ length: 257 }, () => ({ ...question, ttl: 60, data: [Buffer.from('proof')] })),
    );
    const decode = spyOn(packet, 'decode');
    try {
      rejectReply(bytes);
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('bounds compression dereferences while accepting valid compressed names', () => {
    for (const hops of [128, 129]) {
      const header = encodeReply();
      header.writeUInt16BE(hops, 6);
      const records: Buffer[] = [header];
      let prior = 12;
      let cursor = header.length;
      for (let index = 0; index < hops; index++) {
        const record = Buffer.from('c00c000200010000003c00020000', 'hex');
        record.writeUInt16BE(0xc000 | prior, 12);
        prior = cursor + 12;
        cursor += record.length;
        records.push(record);
      }
      const bytes = Buffer.concat(records);
      if (hops === 128) expect(decodePacket(bytes).answers).toHaveLength(128);
      else rejectReply(bytes);
    }
  });

  it('preserves legal embedded dots in the SOA mailbox local part', () => {
    const reply = decodePacket(
      encodeReply([
        {
          name: 'example.com',
          type: 'SOA',
          ttl: 60,
          data: {
            mname: 'ns.example.com',
            rname: 'first\\.last.example.com',
            serial: 1,
            refresh: 2,
            retry: 3,
            expire: 4,
            minimum: 5,
          },
        },
      ]),
    );
    expect(reply.answers[0]).toMatchObject({
      type: 'SOA',
      data: { rname: 'first\\.last.example.com' },
    });
  });

  it('bounds aggregate name work before the full packet decoder', () => {
    for (const soaCount of [110, 129]) {
      const header = packet.encode({
        type: 'response',
        id: 0x1234,
        questions: [{ ...question, name: Array.from({ length: 127 }, () => 'a').join('.') }],
      });
      header.writeUInt16BE(127 + soaCount, 6);
      const records: Buffer[] = [header];
      let prior = 12;
      let cursor = header.length;
      for (let index = 0; index < 127; index++) {
        const record = Buffer.from('c00c000200010000003c00020000', 'hex');
        record.writeUInt16BE(0xc000 | prior, 12);
        prior = cursor + 12;
        cursor += record.length;
        records.push(record);
      }
      for (let index = 0; index < soaCount; index++) {
        const record = Buffer.alloc(36);
        record.writeUInt16BE(0xc000 | prior, 0);
        record.writeUInt16BE(6, 2);
        record.writeUInt16BE(1, 4);
        record.writeUInt16BE(24, 10);
        record.writeUInt16BE(0xc000 | prior, 12);
        record.writeUInt16BE(0xc000 | prior, 14);
        records.push(record);
      }
      const bytes = Buffer.concat(records);
      if (soaCount === 110) expect(decodePacket(bytes).answers).toHaveLength(237);
      else {
        const decode = spyOn(packet, 'decode');
        try {
          rejectReply(bytes);
          expect(decode).not.toHaveBeenCalled();
        } finally {
          decode.mockRestore();
        }
      }
    }
  });

  it('rejects pointers into bytes that never began a validated name', () => {
    const bytes = encodeReply();
    bytes[12] = 0xc0;
    bytes[13] = 4;
    rejectReply(bytes);
  });

  it('rejects a trailing payload and a missing question', () => {
    rejectBeforeDecode(Buffer.concat([encodeReply(), Buffer.from([0])]));
    rejectReply(Buffer.from('123480000000000000000000', 'hex'));
  });

  it('rejects unsupported record decoders before dispatch', () => {
    rejectReply(
      encodeReply([
        {
          name: question.name,
          type: 'PTR',
          ttl: 60,
          data: 'other.example.com',
        },
      ]),
    );
  });

  it('rejects mDNS class masking in unicast answers', () => {
    const bytes = encodeReply([
      { ...question, ttl: 60, flush: true, data: [Buffer.from('proof')] },
    ]);
    rejectReply(bytes);
  });
  it('rejects a non-IN question before full packet decoding', () => {
    const bytes = encodeReply();
    bytes.writeUInt16BE(3, 45);
    rejectBeforeDecode(bytes);
  });

  it('rejects NS and SOA RDATA that cross declared boundaries', () => {
    const ns = encodeReply([{ name: question.name, type: 'NS', ttl: 60, data: 'ns.example.com' }]);
    const rr = packet.question.encodingLength(question) + 12;
    const rdlength = rr + packet.name.encodingLength(question.name) + 8;
    ns.writeUInt16BE(ns.readUInt16BE(rdlength) + 1, rdlength);
    rejectBeforeDecode(Buffer.concat([ns, Buffer.from([0])]));
    const soa = encodeReply([
      {
        name: 'example.com',
        type: 'SOA',
        ttl: 60,
        data: {
          mname: 'ns.example.com',
          rname: 'hostmaster.example.com',
          serial: 1,
          refresh: 2,
          retry: 3,
          expire: 4,
          minimum: 5,
        },
      },
    ]);
    const soaLength = rr + packet.name.encodingLength('example.com') + 8;
    soa.writeUInt16BE(soa.readUInt16BE(soaLength) + 1, soaLength);
    rejectBeforeDecode(Buffer.concat([soa, Buffer.from([0])]));
  });

  it('rejects A and AAAA RDATA with incorrect fixed widths', () => {
    for (const [type, address] of [
      ['A', '8.8.8.8'],
      ['AAAA', '2606:4700:4700::1111'],
    ] as const) {
      const bytes = encodeReply([{ name: question.name, type, ttl: 60, data: address }]);
      const rdlength =
        12 +
        packet.question.encodingLength(question) +
        packet.name.encodingLength(question.name) +
        8;
      bytes.writeUInt16BE(bytes.readUInt16BE(rdlength) - 1, rdlength);
      rejectBeforeDecode(bytes.subarray(0, -1));
    }
  });

  it('rejects TXT fragment overrun and invalid UTF-8 bytes', () => {
    const bytes = encodeReply([{ ...question, ttl: 60, data: [Buffer.from('proof')] }]);
    bytes[bytes.length - 6] = 7;
    rejectBeforeDecode(bytes);
    rejectReply(encodeReply([{ ...question, ttl: 60, data: [Buffer.from([0xc3, 0x28])] }]));
  });

  it('rejects truncated RDATA and empty TXT as modeled protocol failures', () => {
    const bytes = encodeReply([{ ...question, ttl: 60, data: [Buffer.from('proof')] }]);
    const length =
      12 + packet.question.encodingLength(question) + packet.name.encodingLength(question.name) + 8;
    bytes.writeUInt16BE(bytes.readUInt16BE(length) + 1, length);
    rejectReply(bytes);
    rejectReply(encodeReply([{ ...question, ttl: 60, data: [] }]));
  });

  it('bounds expansion before invoking the codec name decoder', () => {
    const bytes = packet.encode({
      type: 'response',
      questions: [{ ...question, name: Array.from({ length: 5 }, () => 'a'.repeat(63)).join('.') }],
    });
    const decode = spyOn(packet.name, 'decode');
    try {
      rejectReply(bytes);
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });

  it('refuses a codec dependency that reports incorrect packet consumption', () => {
    const original = packet.decode;
    const decode = spyOn(packet, 'decode').mockImplementation(
      Object.assign(
        (bytes: Buffer) => {
          const reply = original(bytes);
          packet.decode.bytes = 0;
          return reply;
        },
        { bytes: 0 },
      ),
    );
    try {
      rejectReply(encodeReply());
    } finally {
      decode.mockRestore();
    }
  });

  it('refuses a codec dependency that reports incorrect name consumption before full decode', () => {
    const original = packet.name.decode;
    const decode = spyOn(packet.name, 'decode').mockImplementation(
      Object.assign(
        (bytes: Buffer, offset?: number) => {
          const name = original(bytes, offset);
          packet.name.decode.bytes = 0;
          return name;
        },
        { bytes: 0 },
      ),
    );
    try {
      rejectBeforeDecode(encodeReply());
    } finally {
      decode.mockRestore();
    }
  });
});
