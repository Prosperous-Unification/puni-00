import { connect, type TLSSocket } from 'node:tls';

import type { EmailMessage } from '@wbs/core';
import { afterEach, expect, spyOn, test } from 'bun:test';
import SMTPConnection from 'nodemailer/lib/smtp-connection';

import { startSmtpRelay } from '../testing/smtp-relay';
import { createEmailDelivery } from './email-delivery';
import { readEmailDelivery } from './email-delivery-config';

const recipient = 'recipient@example.test';
const token = 'a'.repeat(64);
const message: EmailMessage = { purpose: 'verification', recipient, token };
const relays: Awaited<ReturnType<typeof startSmtpRelay>>[] = [];
async function refuses(submitted: Promise<void>, message: string): Promise<void> {
  let failure: unknown;
  try {
    await submitted;
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toHaveProperty('message', message);
  expect(failure).not.toHaveProperty('cause');
}

afterEach(async () => {
  for (const relay of relays.splice(0)) await relay.close();
});
async function fixture(mode: Parameters<typeof startSmtpRelay>[0] = 'accept') {
  const relay = await startSmtpRelay(mode);
  relays.push(relay);
  return relay;
}

test('disabled delivery refuses without transport work', async () => {
  await refuses(
    createEmailDelivery({ kind: 'disabled' }).deliver(message),
    'email submission disabled',
  );
});

test('configured SMTP refuses invitation purpose without opening a relay connection', async () => {
  const relay = await fixture();
  let connects = 0;
  await refuses(
    createEmailDelivery(relay.config, {
      connect: (options) => {
        connects++;
        return connect(options);
      },
    }).deliver({ ...message, purpose: 'invitation' }),
    'email submission disabled',
  );
  expect(connects).toBe(0);
  expect(relay.observed.connections).toBe(0);
  expect(relay.observed.bodies).toHaveLength(0);
});

for (const recipient of [
  'a@example.test,b@example.test',
  'a@example.test\r\nBcc:b@example.test',
  'Name <a@example.test>',
  'a@exämple.test',
  'A@example.test',
  'a..b@example.test',
  `${'x'.repeat(65)}@example.test`,
])
  test(`unsafe recipient cannot reach SMTP: ${JSON.stringify(recipient)}`, async () => {
    const relay = await fixture();
    await refuses(
      createEmailDelivery(relay.config).deliver({ ...message, recipient }),
      'email submission invalid_message',
    );
    expect(relay.observed.connections).toBe(0);
  });
for (const token of ['', 'a'.repeat(63), `${'a'.repeat(64)}\r\nBcc:b@example.test`, 'A'.repeat(64)])
  test(`invalid token length${String(token.length)} cannot reach SMTP`, async () => {
    const relay = await fixture();
    await refuses(
      createEmailDelivery(relay.config).deliver({ ...message, token }),
      'email submission invalid_message',
    );
    expect(relay.observed.connections).toBe(0);
  });

for (const auth of ['none', 'plain'] as const)
  test(`one fixed verification message receives final250 and native close with ${auth}`, async () => {
    const relay = await fixture();
    const config = readEmailDelivery({
      ...relay.env,
      WBS_SMTP_AUTH: auth,
      ...(auth === 'plain'
        ? { WBS_SMTP_USERNAME: 'fixture-user', WBS_SMTP_PASSWORD: 'fixture-password' }
        : {}),
    });
    let owned: TLSSocket | undefined;
    await createEmailDelivery(config, {
      connect: (options) => {
        owned = connect(options);
        return owned;
      },
    }).deliver(message);
    expect(owned?.closed).toBe(true);
    expect(relay.observed.connections).toBe(1);
    expect(relay.observed.auth).toBe(auth === 'plain' ? 1 : 0);
    expect(relay.observed.recipients).toEqual([`RCPT TO:<${recipient}>`]);
    expect(relay.observed.bodies).toHaveLength(1);
    const body = relay.observed.bodies.at(0);
    if (body === undefined) throw new Error('SMTP fixture body is absent');
    expect(body).toContain(`To: ${recipient}\r\n`);
    expect(body).toContain('Subject: Verify your WBS email\r\n');
    expect(body.split('\r\n\r\n')[0]).not.toContain(token);
    expect(body).toContain(`\r\n${token}\r\n`);
  });

test('final DATA refusal is sanitized and never resends', async () => {
  const relay = await fixture('reject');
  const delivery = createEmailDelivery(relay.config);
  await refuses(delivery.deliver(message), 'email submission refused');
  expect(relay.observed.connections).toBe(1);
  expect(relay.observed.bodies).toHaveLength(1);
});

test('withheld final ACK hits absolute cutoff and cannot resend after DATA', async () => {
  const relay = await fixture('withhold');
  const started = performance.now();
  await refuses(createEmailDelivery(relay.config).deliver(message), 'email submission timeout');
  expect(performance.now() - started).toBeGreaterThanOrEqual(8500);
  expect(relay.observed.connections).toBe(1);
  expect(relay.observed.bodies).toHaveLength(1);
  // The9s protocol cutoff is separate from bounded fixture/setup scheduling allowance.
}, 30000);

for (const fault of ['overflow', 'expired'] as const)
  test(`same-event ${fault} stops the later SMTP parser before authentication`, async () => {
    const relay = await fixture('silent');
    let shift = 0;
    let owned: TLSSocket | undefined;
    const delivery = createEmailDelivery(relay.config, {
      now: () => performance.now() + shift,
      connect: (options) => {
        const socket = connect(options);
        owned = socket;
        socket.once('resume', () => {
          if (fault === 'expired') shift = 9001;
          socket.emit(
            'data',
            Buffer.from(
              fault === 'overflow'
                ? `220 ${'x'.repeat(65537)}\r\n`
                : '220 synthetic immediate greeting\r\n',
            ),
          );
        });
        return socket;
      },
    });
    await refuses(
      delivery.deliver(message),
      `email submission ${fault === 'overflow' ? 'reply_limit' : 'timeout'}`,
    );
    expect(owned?.closed).toBe(true);
    expect(relay.observed.commands).toHaveLength(0);
    expect(relay.observed.bodies).toHaveLength(0);
  });

test('TLS name mismatch refuses before credentials or body', async () => {
  const relay = await fixture();
  const config = readEmailDelivery({ ...relay.env, WBS_SMTP_SERVER_NAME: 'wrong.test' });
  await refuses(createEmailDelivery(config).deliver(message), 'email submission transport');
  expect(relay.observed.auth).toBe(0);
  expect(relay.observed.bodies).toHaveLength(0);
});

for (const fault of ['wrong', 'multiple', 'rejected', 'non250'] as const)
  test(`client ${fault} acceptance is not success`, async () => {
    const relay = await fixture();
    const send = spyOn(SMTPConnection.prototype, 'send').mockImplementation(
      (_envelope, _body, done) => {
        done(null, {
          accepted:
            fault === 'wrong'
              ? ['other@example.test']
              : fault === 'multiple'
                ? [recipient, 'other@example.test']
                : [recipient],
          rejected: fault === 'rejected' ? [recipient] : [],
          response: fault === 'non250' ? '251 forwarded' : '250 queued',
          envelopeTime: 1,
          messageTime: 1,
          messageSize: 1,
        });
      },
    );
    try {
      await refuses(createEmailDelivery(relay.config).deliver(message), 'email submission refused');
    } finally {
      send.mockRestore();
    }
  });

test('accepted finalACK without observable native close is explicit cleanup failure', async () => {
  const relay = await fixture();
  let owned: TLSSocket | undefined;
  let restore: (() => void) | undefined;
  const delivery = createEmailDelivery(relay.config, {
    connect: (options) => {
      const socket = connect(options);
      owned = socket;
      const emit = socket.emit.bind(socket);
      const interception = spyOn(socket, 'emit').mockImplementation(
        (event: string | symbol, ...arguments_: unknown[]) =>
          event === 'close' ? false : emit(event, ...arguments_),
      );
      restore = () => {
        interception.mockRestore();
      };
      return socket;
    },
  });
  try {
    await refuses(delivery.deliver(message), 'email submission cleanup');
    expect(relay.observed.bodies).toHaveLength(1);
  } finally {
    restore?.();
    owned?.destroy();
  }
});

test('complete one-chunk overflow cannot forge success after captured DATA', async () => {
  const relay = await fixture('withhold');
  let owned: TLSSocket | undefined;
  const submitted = createEmailDelivery(relay.config, {
    connect: (options) => {
      owned = connect(options);
      return owned;
    },
  }).deliver(message);
  const until = performance.now() + 1500;
  while (relay.observed.bodies.length === 0 && performance.now() < until) await Bun.sleep(1);
  if (relay.observed.bodies.length !== 1 || owned === undefined)
    throw new Error('fixture DATA did not arrive');
  owned.emit('data', Buffer.from(`250 ${'x'.repeat(65537)}\r\n`));
  await refuses(submitted, 'email submission reply_limit');
  expect(owned.closed).toBe(true);
  expect(relay.observed.connections).toBe(1);
});

test('late finalACK cannot mark delivered when the timer callback has not fired yet', async () => {
  const relay = await fixture('withhold');
  let owned: TLSSocket | undefined;
  let shift = 0;
  const submitted = createEmailDelivery(relay.config, {
    now: () => performance.now() + shift,
    connect: (options) => {
      owned = connect(options);
      return owned;
    },
  }).deliver(message);
  const until = performance.now() + 1500;
  while (relay.observed.bodies.length === 0 && performance.now() < until) await Bun.sleep(1);
  if (relay.observed.bodies.length !== 1 || owned === undefined)
    throw new Error('fixture DATA did not arrive');
  shift = 9001;
  owned.emit('data', Buffer.from('250 late synthetic acknowledgement\r\n'));
  await refuses(submitted, 'email submission timeout');
  expect(owned.closed).toBe(true);
  expect(relay.observed.connections).toBe(1);
});

test('TLS untrusted configured CA refuses before credentials or body', async () => {
  const relay = await fixture();
  const other = await fixture();
  if (relay.config.kind !== 'smtp' || other.config.kind !== 'smtp')
    throw new Error('fixture SMTP configuration is disabled');
  await refuses(
    createEmailDelivery({ ...relay.config, ca: other.config.ca }).deliver(message),
    'email submission transport',
  );
  expect(relay.observed.auth).toBe(0);
  expect(relay.observed.bodies).toHaveLength(0);
});

test('owned native destruction closes even when client close does not close a socket', async () => {
  const relay = await fixture();
  let owned: TLSSocket | undefined;
  const close = spyOn(SMTPConnection.prototype, 'close').mockImplementation(() => undefined);
  try {
    await createEmailDelivery(relay.config, {
      connect: (options) => {
        owned = connect(options);
        return owned;
      },
    }).deliver(message);
    expect(owned?.closed).toBe(true);
    expect(relay.observed.bodies).toHaveLength(1);
  } finally {
    close.mockRestore();
    owned?.destroy();
  }
});

test('late connect callback cannot start auth or send after terminal failure', async () => {
  const relay = await fixture('silent');
  const connection = spyOn(SMTPConnection.prototype, 'connect').mockImplementation(function (
    this: SMTPConnection,
    ready,
  ) {
    this.emit('error', new Error('fixture failed connect'));
    setImmediate(() => ready?.());
  });
  const login = spyOn(SMTPConnection.prototype, 'login');
  const send = spyOn(SMTPConnection.prototype, 'send');
  try {
    await refuses(createEmailDelivery(relay.config).deliver(message), 'email submission refused');
    await Bun.sleep(1);
    expect(login).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  } finally {
    connection.mockRestore();
    login.mockRestore();
    send.mockRestore();
  }
});

test('late transport error cannot revoke final acceptance after native close', async () => {
  const relay = await fixture();
  let owned: TLSSocket | undefined;
  let restore: (() => void) | undefined;
  let injected = false;
  const delivery = createEmailDelivery(relay.config, {
    connect: (options) => {
      const socket = connect(options);
      owned = socket;
      const destroy = socket.destroy.bind(socket);
      const interception = spyOn(socket, 'destroy').mockImplementation((failure) => {
        if (!injected && relay.observed.bodies.length === 1) {
          injected = true;
          socket.emit('error', new Error('fixture late transport error'));
        }
        return destroy(failure);
      });
      restore = () => {
        interception.mockRestore();
      };
      return socket;
    },
  });
  try {
    await delivery.deliver(message);
    expect(injected).toBe(true);
    expect(owned?.closed).toBe(true);
  } finally {
    restore?.();
    owned?.destroy();
  }
});

test('configured PLAIN never falls back to server-only LOGIN', async () => {
  const relay = await fixture('login-only');
  const config = readEmailDelivery({
    ...relay.env,
    WBS_SMTP_AUTH: 'plain',
    WBS_SMTP_USERNAME: 'fixture-user',
    WBS_SMTP_PASSWORD: 'fixture-password',
  });
  await refuses(createEmailDelivery(config).deliver(message), 'email submission refused');
  expect(relay.observed.commands).toContain('AUTH PLAIN');
  expect(relay.observed.commands).not.toContain('AUTH OTHER');
  expect(relay.observed.bodies).toHaveLength(0);
});

test('fragmented aggregate cap remains independent when the client partial guard is broken', async () => {
  const relay = await fixture('withhold');
  const partialGuard = spyOn(SMTPConnection.prototype, 'connect').mockImplementation(function (
    this: SMTPConnection,
    ready,
  ) {
    // Deliberately break the public client option to exercise the independent wrapper cap.
    this.options.maxResponseSize = 1_000_000;
    partialGuard.mockRestore();
    this.connect(ready);
  });
  let owned: TLSSocket | undefined;
  try {
    const submitted = createEmailDelivery(relay.config, {
      connect: (options) => {
        owned = connect(options);
        return owned;
      },
    }).deliver(message);
    const until = performance.now() + 1500;
    while (relay.observed.bodies.length === 0 && performance.now() < until) await Bun.sleep(1);
    if (relay.observed.bodies.length !== 1 || owned === undefined)
      throw new Error('fixture DATA did not arrive');
    for (let index = 0; index < 17; index++)
      owned.emit('data', Buffer.from(`250-${'x'.repeat(4090)}\r\n`));
    owned.emit('data', Buffer.from('250 completed synthetic response\r\n'));
    await refuses(submitted, 'email submission reply_limit');
    expect(owned.closed).toBe(true);
  } finally {
    partialGuard.mockRestore();
    owned?.destroy();
  }
});

test('client partial-buffer guard refuses before aggregate bytes reach64KiB', async () => {
  const relay = await fixture('withhold');
  let owned: TLSSocket | undefined;
  const submitted = createEmailDelivery(relay.config, {
    connect: (options) => {
      owned = connect(options);
      return owned;
    },
  }).deliver(message);
  const until = performance.now() + 1500;
  while (relay.observed.bodies.length === 0 && performance.now() < until) await Bun.sleep(1);
  if (relay.observed.bodies.length !== 1 || owned === undefined)
    throw new Error('fixture DATA did not arrive');
  for (let index = 0; index < 3; index++)
    owned.emit('data', Buffer.from(`250-${'x'.repeat(4090)}\r\n`));
  owned.emit('data', Buffer.from('250 completed synthetic response\r\n'));
  await refuses(submitted, 'email submission refused');
  expect(owned.closed).toBe(true);
});

test('cleanup cannot obtain a fresh budget after the total deadline is exhausted', async () => {
  const relay = await fixture('silent');
  let shift = 0;
  const delivery = createEmailDelivery(relay.config, {
    now: () => performance.now() + shift,
    connect: (options) => {
      const socket = connect(options);
      socket.once('resume', () => {
        shift = 11001;
        socket.emit('data', Buffer.from('220 input after total deadline\r\n'));
      });
      return socket;
    },
  });
  await refuses(delivery.deliver(message), 'email submission cleanup');
  expect(relay.observed.commands).toHaveLength(0);
});

test('native close observed after its deadline cannot publish acceptance', async () => {
  const relay = await fixture();
  let shift = 0;
  let restore: (() => void) | undefined;
  const delivery = createEmailDelivery(relay.config, {
    now: () => performance.now() + shift,
    connect: (options) => {
      const socket = connect(options);
      const emit = socket.emit.bind(socket);
      const interception = spyOn(socket, 'emit').mockImplementation(
        (event: string | symbol, ...arguments_: unknown[]) => {
          if (event === 'close') shift = 11001;
          return emit(event, ...arguments_);
        },
      );
      restore = () => {
        interception.mockRestore();
      };
      return socket;
    },
  });
  try {
    await refuses(delivery.deliver(message), 'email submission cleanup');
    expect(relay.observed.bodies).toHaveLength(1);
  } finally {
    restore?.();
  }
});

test('DATA transition rechecks cutoff before releasing any message bytes', async () => {
  const relay = await fixture();
  let shift = 0;
  let crossed = false;
  const delivery = createEmailDelivery(relay.config, {
    now: () => performance.now() + shift,
    connect: (options) => {
      const socket = connect(options);
      // Registered before the adapter's secureConnect listener: after wrapper accounting,
      // before the maintained parser, advance time without running the cutoff timer.
      socket.once('secureConnect', () => {
        socket.on('data', (bytes: Buffer) => {
          if (bytes.toString().includes('354 continue')) {
            crossed = true;
            shift = 9001;
          }
        });
      });
      return socket;
    },
  });
  await refuses(delivery.deliver(message), 'email submission timeout');
  expect(crossed).toBe(true);
  expect(relay.observed.commands).toContain('DATA');
  expect(relay.observed.bodyBytes).toBe(0);
  expect(relay.observed.bodies).toHaveLength(0);
  expect(relay.observed.connections).toBe(1);
});
