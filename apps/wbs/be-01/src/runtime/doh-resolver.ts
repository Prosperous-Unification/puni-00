import type { DomainResolver } from '@wbs/core';
import { type } from '@wbs/validation';

/**
 * The two public DNS-over-HTTPS JSON endpoints whose answers must agree:
 * Cloudflare at 1.1.1.1 and Google at 8.8.8.8, addressed by IP so neither
 * lookup depends on a prior DNS resolution.
 */
export const PUBLIC_DOH_RESOLVERS = [
  'https://1.1.1.1/dns-query',
  'https://8.8.8.8/resolve',
] as const;

/** Why a lookup produced no agreed answer; every case is a refusal, never a pass. */
export type DnsRefusalReason = 'resolver_failed' | 'malformed_answer' | 'disagreement';

/** A typed refusal from {@link dohDomainResolver}; callers answer it as DNS unavailable. */
export class DnsLookupRefused extends Error {
  constructor(
    readonly reason: DnsRefusalReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DnsLookupRefused';
  }
}

const TXT = 16;
const CNAME = 5;
const NOERROR = 0;
const NXDOMAIN = 3;
/** The only TXT records compared across resolvers and returned. */
const PROOF_PREFIX = 'wbs-domain-verification=';

const DohAnswer = type({
  Status: 'number.integer',
  'TC?': 'boolean',
  Question: type({ name: 'string', type: 'number.integer' }).array(),
  'Answer?': type({ name: 'string', type: 'number.integer', data: 'string' }).array(),
});

/** DNS names compare case-insensitively and with or without the root dot. */
function sameName(left: string, right: string): boolean {
  return left.replace(/\.$/, '').toLowerCase() === right.replace(/\.$/, '').toLowerCase();
}

/**
 * DNS TXT presentation data: one or more quoted character-strings joined into
 * one record, with `\"`, `\\` and `\DDD` escapes. Unquoted data is one
 * verbatim string. Unbalanced quoting throws.
 */
function decodeTxt(data: string): string {
  if (!data.startsWith('"')) return data;
  let text = '';
  let index = 0;
  while (index < data.length) {
    if (data[index] === ' ') {
      index += 1;
      continue;
    }
    if (data[index] !== '"') throw new Error('TXT data has text outside quotes');
    index += 1;
    let closed = false;
    while (index < data.length) {
      const char = data[index];
      if (char === '"') {
        closed = true;
        index += 1;
        break;
      }
      if (char === '\\') {
        const digits = /^\d{3}/.exec(data.slice(index + 1));
        if (digits !== null) {
          text += String.fromCharCode(Number(digits[0]));
          index += 4;
          continue;
        }
        if (index + 1 >= data.length) throw new Error('TXT data ends inside an escape');
        text += data[index + 1];
        index += 2;
        continue;
      }
      text += char;
      index += 1;
    }
    if (!closed) throw new Error('TXT data has an unterminated quote');
  }
  return text;
}

/** One resolver's TXT records, sorted; any failure is a typed refusal. */
async function queryTxt(
  fetchTxt: typeof fetch,
  endpoint: string,
  name: string,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const url = new URL(endpoint);
  url.searchParams.set('name', name);
  url.searchParams.set('type', 'TXT');
  let response: Response;
  try {
    // Proof: 2026-09-29, dropping `redirect: 'error'` made `asks both public
    // resolvers for TXT records and returns their agreed proof records` see an
    // undefined redirect mode; a redirect must not move the lookup to another host.
    response = await fetchTxt(url, {
      headers: { accept: 'application/dns-json' },
      redirect: 'error',
      signal,
    });
  } catch (error) {
    throw new DnsLookupRefused('resolver_failed', `${url.host} did not answer`, { cause: error });
  }
  if (!response.ok)
    throw new DnsLookupRefused(
      'resolver_failed',
      `${url.host} answered HTTP ${String(response.status)}`,
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new DnsLookupRefused('malformed_answer', `${url.host} answered non-JSON`, {
      cause: error,
    });
  }
  // Proof: 2026-09-28, returning `[]` for an unparsed body made `refuses
  // malformed answers rather than reading them as empty` fail its reason list.
  const parsed = DohAnswer(body);
  if (parsed instanceof type.errors)
    throw new DnsLookupRefused('malformed_answer', `${url.host}: ${parsed.summary}`);
  // Proof: 2026-09-28, deleting this NXDOMAIN branch made `answers no records
  // when both resolvers report NXDOMAIN` fail, and the one-sided NXDOMAIN case
  // received `resolver_failed` instead of `disagreement`.
  if (parsed.Status === NXDOMAIN) return [];
  // Proof: 2026-09-28, dropping the truncation and status checks made `refuses
  // when either resolver fails, even if the other answers` fail its reason list
  // (SERVFAIL and a truncated answer).
  if (parsed.Status !== NOERROR || parsed.TC === true)
    throw new DnsLookupRefused(
      'resolver_failed',
      `${url.host} answered status ${String(parsed.Status)}${parsed.TC === true ? ' truncated' : ''}`,
    );
  // Proof: 2026-09-29, deleting this question check made `refuses an answer to
  // a question it did not ask` fail its reason list for the foreign question.
  // A missing `Question` is refused by the schema above.
  const question = parsed.Question.length === 1 ? parsed.Question[0] : null;
  if (question?.type !== TXT || !sameName(question.name, name))
    throw new DnsLookupRefused('malformed_answer', `${url.host} answered another question`);
  const answers = parsed.Answer ?? [];
  const chain = [name];
  for (const record of answers)
    if (record.type === CNAME && chain.some((owner) => sameName(owner, record.name)))
      chain.push(record.data);
  try {
    return (
      answers
        // Proof: 2026-09-29, accepting TXT at any answer name made `joins
        // multi-string TXT data, decodes escapes and follows only the asked
        // CNAME chain` include the `unrelated.example.net.` record.
        .filter(
          (record) => record.type === TXT && chain.some((owner) => sameName(owner, record.name)),
        )
        .map((record) => decodeTxt(record.data))
        // Proof: 2026-09-29, comparing every TXT record made `asks both public
        // resolvers for TXT records and returns their agreed proof records`
        // fail over resolvers holding different foreign SPF and site records.
        .filter((text) => text.startsWith(PROOF_PREFIX))
        .sort()
    );
  } catch (error) {
    throw new DnsLookupRefused('malformed_answer', `${url.host} answered malformed TXT data`, {
      cause: error,
    });
  }
}

/**
 * A production {@link DomainResolver} over DNS-over-HTTPS that trusts an answer
 * only when both {@link PUBLIC_DOH_RESOLVERS} return the same multiset of WBS
 * proof records: TXT starting `wbs-domain-verification=` at the asked name or
 * its CNAME chain. Other TXT records are ignored, so their TTL skew cannot
 * refuse a lookup. Redirects are refused.
 *
 * Both are queried in parallel under the caller's signal. A failure,
 * malformed answer or disagreement from either rejects with
 * {@link DnsLookupRefused}; it never returns a partial or single-resolver
 * answer. NXDOMAIN at both is an agreed empty answer.
 */
export function dohDomainResolver(
  fetchTxt: typeof fetch,
  endpoints: readonly string[] = PUBLIC_DOH_RESOLVERS,
): DomainResolver {
  // Proof: 2026-09-28, deleting this guard made `refuses to trust fewer than
  // two resolvers` report that construction did not throw.
  if (endpoints.length < 2) throw new Error('dohDomainResolver needs two resolvers to agree');
  return {
    async lookupTxt(name, signal) {
      const answers = await Promise.allSettled(
        endpoints.map((endpoint) => queryTxt(fetchTxt, endpoint, name, signal)),
      );
      const agreed: (readonly string[])[] = [];
      // Proof: 2026-09-28, skipping rejected answers so the healthy one won
      // made the either-fails, malformed-answer and abort tests report
      // `lookup was not refused`.
      for (const answer of answers) {
        if (answer.status === 'rejected') {
          if (answer.reason instanceof DnsLookupRefused) throw answer.reason;
          throw new DnsLookupRefused('resolver_failed', 'DNS-over-HTTPS lookup failed', {
            cause: answer.reason,
          });
        }
        agreed.push(answer.value);
      }
      const [first, ...rest] = agreed;
      // Proof: 2026-09-28, skipping this comparison made `refuses when the two
      // resolvers disagree` and `refuses a record present at only one resolver`
      // report `lookup was not refused`, and mounted `verifies only when both
      // public resolvers agree on the exact TXT proof` verified on one resolver.
      if (rest.some((records) => JSON.stringify(records) !== JSON.stringify(first)))
        throw new DnsLookupRefused('disagreement', `public resolvers disagree about ${name}`);
      return first;
    },
  };
}
