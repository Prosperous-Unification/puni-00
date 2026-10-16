import { randomUUID } from 'node:crypto';
import { connect as connectTls, type ConnectionOptions, type TLSSocket } from 'node:tls';

import type { EmailDelivery, EmailMessage } from '@wbs/core';
import SMTPConnection from 'nodemailer/lib/smtp-connection';

import { type EmailDeliveryConfig, isEmailMailbox } from './email-delivery-config';

type Refusal =
  'disabled' | 'invalid_message' | 'transport' | 'refused' | 'timeout' | 'reply_limit' | 'cleanup';
type SmtpConfig = Extract<EmailDeliveryConfig, { kind: 'smtp' }>;

/** Finite safe diagnostics: never retain a relay transcript, native cause or token. */
export class EmailSubmissionError extends Error {
  constructor(readonly reason: Refusal) {
    super(`email submission ${reason}`);
    this.name = 'EmailSubmissionError';
  }
}

/** Internal clock/socket seams; deployed composition always uses native implementations. */
export interface EmailRuntime {
  readonly now?: () => number;
  readonly connect?: (options: ConnectionOptions) => TLSSocket;
}

/** Explicit disabled production binding retained for unrelated compositions. */
export const refusingEmailDelivery: EmailDelivery = {
  deliver: () => Promise.reject(new EmailSubmissionError('disabled')),
};

/**
 * Enables only password verification; invitation/join submission remains refused.
 * Config comes from {@link readEmailDelivery}; callers supply no SMTP headers.
 * {@link submitVerification} owns the physical socket and absolute deadline.
 */
export function createEmailDelivery(
  config: EmailDeliveryConfig,
  runtime: EmailRuntime = {},
): EmailDelivery {
  return {
    async deliver(message) {
      // Proof: bypassing purpose dispatch made configured boot invitations/join return201/200 instead of503.
      if (config.kind === 'disabled' || message.purpose !== 'verification')
        throw new EmailSubmissionError('disabled');
      // Proof: removing recipient/token guards failed their pre-connect refusal cases.
      if (!isEmailMailbox(message.recipient) || !/^[a-f0-9]{64}$/.test(message.token))
        throw new EmailSubmissionError('invalid_message');
      // Proof: duplicating this await made fixed-message controls observe2 connections instead of1.
      await submitVerification(config, message, runtime);
    },
  };
}

/** Fixed ASCII serialization; token is confined to the body, never a header or URL. */
function serializeVerification(config: SmtpConfig, message: EmailMessage): string {
  return [
    `From: ${config.from}`,
    `To: ${message.recipient}`,
    'Subject: Verify your WBS email',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${config.ehlo}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=us-ascii',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Enter this code in WBS to verify your email address:',
    '',
    message.token,
    '',
    'If you did not request this code, do not use it.',
    '',
  ].join('\r\n');
}

/**
 * One maintained-client send over an owned, verified TLS socket. Work stops at
 * startedAt+9s; native close must be observed by min(closeStartedAt+1s,start+10s).
 * Final250 is relay acceptance only. Any unknown post-DATA outcome refuses with
 * no resend; caller compensation leaves the pending challenge unusable.
 * See docs/runbook-organization-email-delivery.md and the OpenSpec design for
 * operator authority and deadline semantics. Deadlines bound eligibility; OS
 * scheduling can delay an observable failure beyond the nominal allowance.
 */
function submitVerification(
  config: SmtpConfig,
  message: EmailMessage,
  runtime: EmailRuntime,
): Promise<void> {
  const body = serializeVerification(config, message);
  const now = runtime.now ?? (() => performance.now());
  const startedAt = now();
  const workUntil = startedAt + 9000;
  const totalUntil = startedAt + 10000;
  return new Promise<void>((resolve, reject) => {
    let socket: TLSSocket;
    try {
      // Proof: disabling verification accepted wrong-name/untrusted peers; replacing CA failed real-TLS success.
      socket = (runtime.connect ?? connectTls)({
        host: config.host,
        port: config.port,
        servername: config.serverName,
        ca: config.ca,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      });
    } catch {
      // Only the native socket-construction boundary is modeled here; no raw cause is retained.
      reject(new EmailSubmissionError('transport'));
      return;
    }
    socket.pause();
    let client: SMTPConnection | undefined;
    let terminal: Refusal | 'accepted' | undefined;
    let settled = false;
    let nativeClosed = false;
    let closeUntil = totalUntil;
    let receivedBytes = 0;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    // Proof: publishing finalACK before native close made the withheld-close case falsely succeed.
    const finish = (outcome: Refusal | 'accepted') => {
      if (settled) return;
      settled = true;
      clearTimeout(workTimer);
      clearTimeout(closeTimer);
      if (outcome === 'accepted') resolve();
      else reject(new EmailSubmissionError(outcome));
    };
    const terminate = (outcome: Refusal | 'accepted') => {
      // Proof: removing this freeze turned acknowledged acceptance into transport failure on a late error.
      if (terminal !== undefined) return;
      terminal = outcome;
      clearTimeout(workTimer);
      // Proof: unclipping this bound renewed cleanup after the total deadline was exhausted.
      closeUntil = Math.min(now() + 1000, totalUntil);
      closeTimer = setTimeout(
        () => {
          finish('cleanup');
        },
        Math.max(0, closeUntil - now()),
      );
      // Public close clears parser actions before a later listener for this same event runs.
      client?.close();
      // Proof: omitting destruction with a non-closing client failed owned-native-destruction on cleanup.
      socket.destroy();
      if (nativeClosed) finish(now() <= closeUntil ? outcome : 'cleanup');
    };
    const isWorking = () => {
      // Proof: omitting this state guard let a late connect callback call send after terminal failure.
      if (terminal !== undefined) return false;
      // Proof: removing this clock check accepted a late finalACK while the timer callback was delayed.
      if (now() >= workUntil) {
        terminate('timeout');
        return false;
      }
      return true;
    };
    socket.on('error', () => {
      terminate('transport');
    });
    socket.on('close', () => {
      nativeClosed = true;
      if (terminal === undefined) terminate('transport');
      // Proof: bypassing the publication clock accepted native close observed after its deadline.
      else finish(now() <= closeUntil ? terminal : 'cleanup');
    });
    socket.on('data', (bytes: Buffer) => {
      if (!isWorking()) return;
      // Proof: counting only the latest chunk accepted fragmented overflow with a broken client guard.
      receivedBytes += bytes.length;
      // Proof: removing this guard accepted a complete64KiB+1 final250 after captured DATA.
      if (receivedBytes > 65536) terminate('reply_limit');
    });
    // Proof: postponing this timer to60s changed the withheld-ACK timeout to a client refusal.
    const workTimer = setTimeout(
      () => {
        terminate('timeout');
      },
      Math.max(0, workUntil - now()),
    );
    socket.once('secureConnect', () => {
      if (!isWorking()) return;
      const smtp = new SMTPConnection({
        connection: socket,
        secured: true,
        secure: true,
        host: config.host,
        port: config.port,
        servername: config.serverName,
        name: config.ehlo,
        logger: false,
        debug: false,
        // Proof: raising this partial limit accepted the partial-buffer overflow control below64KiB.
        maxResponseSize: 8192,
        connectionTimeout: 9000,
        greetingTimeout: 9000,
        socketTimeout: 9000,
      });
      client = smtp;
      smtp.on('error', () => {
        terminate('refused');
      });
      smtp.on('end', () => {
        if (terminal === undefined) terminate('transport');
      });
      smtp.connect((failure) => {
        if (!isWorking()) return;
        if (failure) {
          terminate('refused');
          return;
        }
        const send = () => {
          if (!isWorking()) return;
          smtp.send({ from: config.from, to: [message.recipient] }, body, (failure, submission) => {
            if (!isWorking()) return;
            // Proof: separately omitting final250/count/recipient/rejection predicates accepted each broken-client fixture.
            if (
              failure ||
              !/^250(?:[ -]|$)/.test(submission.response) ||
              submission.accepted.length !== 1 ||
              submission.accepted[0] !== message.recipient ||
              submission.rejected.length !== 0
            )
              terminate('refused');
            else terminate('accepted');
          });
        };
        // Proof: skipping login failed the PLAIN auth-count oracle; omitting its method selected unauthorized LOGIN.
        if (config.auth.kind === 'none') send();
        else
          smtp.login(
            { method: 'PLAIN', user: config.auth.username, pass: config.auth.password },
            (failure) => {
              if (!isWorking()) return;
              if (failure) terminate('refused');
              else send();
            },
          );
      });
    });
  });
}
