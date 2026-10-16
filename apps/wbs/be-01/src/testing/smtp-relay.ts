import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type TLSSocket } from 'node:tls';

import { readEmailDelivery } from '../runtime/email-delivery-config';

export type RelayMode = 'accept' | 'reject' | 'withhold' | 'silent' | 'auth-refuse' | 'login-only';

/** Ephemeral loopback TLS relay with observable envelope/body and native socket lifetime. */
export async function startSmtpRelay(mode: RelayMode = 'accept') {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-smtp-relay-'));
  const certificatePath = join(directory, 'cert.pem');
  const keyPath = join(directory, 'key.pem');
  const generation = Bun.spawnSync([
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certificatePath,
    '-days',
    '2',
    '-subj',
    '/CN=relay.test',
    '-addext',
    'subjectAltName=DNS:relay.test',
  ]);
  if (generation.exitCode !== 0) throw new Error('SMTP fixture certificate generation failed');
  const peers = new Set<TLSSocket>();
  const observed = {
    connections: 0,
    closed: 0,
    auth: 0,
    commands: [] as string[],
    recipients: [] as string[],
    bodies: [] as string[],
    errors: [] as string[],
  };
  const server = createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certificatePath) },
    (socket) => {
      peers.add(socket);
      socket.on('error', (failure: Error) => observed.errors.push(failure.name));
      socket.on('close', () => {
        peers.delete(socket);
        observed.closed++;
      });
      let pending = '';
      let body = '';
      let inBody = false;
      socket.on('data', (bytes: Buffer) => {
        pending += bytes.toString();
        while (pending.includes('\r\n')) {
          const boundary = pending.indexOf('\r\n');
          const line = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (inBody) {
            if (line !== '.') {
              body += `${line}\r\n`;
              continue;
            }
            inBody = false;
            observed.bodies.push(body);
            if (mode === 'accept') socket.write('250 queued fixture\r\n');
            else if (mode === 'reject') socket.write('550 fixture-secret-token refusal\r\n');
            continue;
          }
          observed.commands.push(
            line.startsWith('AUTH PLAIN ')
              ? 'AUTH PLAIN'
              : line.startsWith('AUTH ')
                ? 'AUTH OTHER'
                : line,
          );
          if (line.startsWith('EHLO '))
            socket.write(
              mode === 'login-only'
                ? '250-relay.test\r\n250 AUTH LOGIN\r\n'
                : '250-relay.test\r\n250 AUTH LOGIN PLAIN\r\n',
            );
          else if (line.startsWith('AUTH PLAIN ')) {
            observed.auth++;
            socket.write(
              mode === 'auth-refuse' || mode === 'login-only'
                ? '535 fixture-credential-secret\r\n'
                : '235 authenticated\r\n',
            );
          } else if (line.startsWith('AUTH ')) socket.write('535 unsupported fixture auth\r\n');
          else if (line.startsWith('MAIL FROM:')) socket.write('250 sender\r\n');
          else if (line.startsWith('RCPT TO:')) {
            observed.recipients.push(line);
            socket.write('250 recipient\r\n');
          } else if (line === 'DATA') {
            inBody = true;
            socket.write('354 continue\r\n');
          } else throw new Error('unexpected SMTP fixture command');
        }
      });
      if (mode !== 'silent') socket.write('220 relay.test ready\r\n');
    },
  );
  server.on('connection', () => {
    observed.connections++;
  });
  server.on('tlsClientError', (failure: Error) => observed.errors.push(failure.name));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('SMTP fixture lacks port');
  const env = {
    WBS_SMTP_HOST: '127.0.0.1',
    WBS_SMTP_PORT: String(address.port),
    WBS_SMTP_TLS: 'implicit',
    WBS_SMTP_SERVER_NAME: 'relay.test',
    WBS_SMTP_CA_FILE: certificatePath,
    WBS_SMTP_EHLO: 'wbs.test',
    WBS_SMTP_FROM: 'sender@example.test',
    WBS_SMTP_AUTH: 'none',
  };
  return {
    env,
    observed,
    config: readEmailDelivery(env),
    async close() {
      for (const socket of peers) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((failure) => {
          if (failure) reject(failure);
          else resolve();
        }),
      );
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
