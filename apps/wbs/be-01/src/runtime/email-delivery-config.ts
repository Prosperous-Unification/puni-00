import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';

export type EmailDeliveryConfig =
  | { readonly kind: 'disabled' }
  | {
      readonly kind: 'smtp';
      readonly host: string;
      readonly port: number;
      readonly serverName: string;
      readonly ehlo: string;
      readonly from: string;
      readonly ca: string;
      readonly auth:
        | { readonly kind: 'none' }
        | { readonly kind: 'plain'; readonly username: string; readonly password: string };
    };

const fields = [
  'WBS_SMTP_HOST',
  'WBS_SMTP_PORT',
  'WBS_SMTP_TLS',
  'WBS_SMTP_SERVER_NAME',
  'WBS_SMTP_CA_FILE',
  'WBS_SMTP_EHLO',
  'WBS_SMTP_FROM',
  'WBS_SMTP_AUTH',
  'WBS_SMTP_USERNAME',
  'WBS_SMTP_PASSWORD',
] as const;

/** Refuses configuration without retaining secret-bearing values or native causes. */
function invalid(field: string): never {
  throw new Error(`invalid email delivery configuration: ${field}`);
}

/** Accepts a canonical ASCII DNS name, without control bytes, ports or URL syntax. */
function isDnsName(value: string): boolean {
  // Proof: omitting DNS length/FQDN checks failed malformed server-name loader cases.
  return (
    value.length <= 253 &&
    value.includes('.') &&
    value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  );
}

/** A single canonical ASCII dot-atom mailbox; never a display name, header or address list. */
export function isEmailMailbox(value: string): boolean {
  // Proof: removing mailbox/local-part length limits failed oversized sender loader cases.
  if (value.length > 254 || value !== value.toLowerCase()) return false;
  const parts = value.split('@');
  const local = parts.at(0);
  const domain = parts.at(1);
  return (
    parts.length === 2 &&
    local !== undefined &&
    domain !== undefined &&
    local.length <= 64 &&
    /^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local) &&
    isDnsName(domain)
  );
}

/**
 * Reads optional SMTP authority once, before serving. All fields absent means
 * disabled; any present field requires complete implicit-TLS configuration.
 * Native read/PEM errors are sanitized so startup logging cannot disclose secrets.
 */
export function readEmailDelivery(
  env: Readonly<Record<string, string | undefined>>,
): EmailDeliveryConfig {
  // Proof: bypassing the absent-only branch failed the disabled configuration oracle.
  if (fields.every((field) => env[field] === undefined)) return { kind: 'disabled' };
  const required = (field: string): string => {
    const value = env[field];
    // Proof: omitting this boundary failed missing/empty-field loader cases.
    if (value === undefined || value.length === 0) invalid(field);
    return value;
  };
  const host = required('WBS_SMTP_HOST');
  // Proof: removing host validation admitted smtp://relay.test in the loader test.
  if (isIP(host) === 0 && !isDnsName(host)) invalid('WBS_SMTP_HOST');
  const portText = required('WBS_SMTP_PORT');
  const port = Number(portText);
  // Proof: removing port validation admitted zero,65536 and fractional ports.
  if (!/^[0-9]+$/.test(portText) || !Number.isSafeInteger(port) || port < 1 || port > 65535)
    invalid('WBS_SMTP_PORT');
  // Proof: removing the mode guard admitted starttls instead of explicit implicit TLS.
  if (required('WBS_SMTP_TLS') !== 'implicit') invalid('WBS_SMTP_TLS');
  const serverName = required('WBS_SMTP_SERVER_NAME');
  const ehlo = required('WBS_SMTP_EHLO');
  // Proof: removing each identity guard independently admitted malformed server-name/EHLO.
  if (!isDnsName(serverName)) invalid('WBS_SMTP_SERVER_NAME');
  if (!isDnsName(ehlo)) invalid('WBS_SMTP_EHLO');
  const from = required('WBS_SMTP_FROM');
  // Proof: bypassing this guard admitted injected/list/noncanonical senders.
  if (!isEmailMailbox(from)) invalid('WBS_SMTP_FROM');
  const mode = required('WBS_SMTP_AUTH');
  let auth: Extract<EmailDeliveryConfig, { kind: 'smtp' }>['auth'];
  if (mode === 'none') {
    // Proof: removing this guard admitted credentials under explicit unauthenticated mode.
    if (env['WBS_SMTP_USERNAME'] !== undefined || env['WBS_SMTP_PASSWORD'] !== undefined)
      invalid('WBS_SMTP_AUTH');
    auth = { kind: 'none' };
  } else if (mode === 'plain') {
    const username = required('WBS_SMTP_USERNAME');
    const password = required('WBS_SMTP_PASSWORD');
    // Proof: bypassing the bounds admitted NUL and4097-byte credential fixtures.
    if (
      username.length > 4096 ||
      password.length > 4096 ||
      /[\0\r\n]/.test(username) ||
      /[\0\r\n]/.test(password)
    )
      invalid('WBS_SMTP_AUTH');
    auth = { kind: 'plain', username, password };
    // Proof: defaulting unknown auth to none admitted auto and failed the loader refusal.
  } else invalid('WBS_SMTP_AUTH');
  const caFile = required('WBS_SMTP_CA_FILE');
  // Proof: removing this guard accepted a valid CA reached through a relative path.
  if (!isAbsolute(caFile)) invalid('WBS_SMTP_CA_FILE');
  let ca: string;
  try {
    // Proof: substituting a valid CA for this read admitted absent/unreadable/empty/malformed trust.
    ca = readFileSync(caFile, 'utf8');
    const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    // Proof: ignoring bytes outside PEM blocks accepted valid certificates plus untrusted extra text.
    if (
      certificates === null ||
      ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim() !== ''
    )
      invalid('WBS_SMTP_CA_FILE');
    // Proof: omitting X509 parsing accepted malformed DER inside a syntactic PEM block.
    for (const certificate of certificates) new X509Certificate(certificate);
  } catch {
    // Proof: rethrowing native read errors failed the no-credential/path-leak loader oracle.
    // This modeled startup refusal deliberately excludes the path and raw PEM from logging.
    invalid('WBS_SMTP_CA_FILE');
  }
  return { kind: 'smtp', host, port, serverName, ehlo, from, ca, auth };
}
