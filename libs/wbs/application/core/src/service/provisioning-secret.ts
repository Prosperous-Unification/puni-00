/** A provisioning token as a SCIM client presents it: `wbs_scim_` and 43 base64url characters. */
export const PROVISIONING_SECRET = /^wbs_scim_[A-Za-z0-9_-]{43}$/;

/** A fresh provisioning token carrying 256 random bits. */
export function newProvisioningSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `wbs_scim_${base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

/** The lowercase hex SHA-256 of the whole token: the only form storage ever holds. */
export async function digestProvisioningSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
