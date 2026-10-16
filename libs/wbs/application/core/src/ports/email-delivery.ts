/** A single-recipient purpose-bound message; only the token's digest may enter durable storage. */
export interface EmailMessage {
  readonly purpose: 'verification' | 'invitation';
  readonly recipient: string;
  readonly token: string;
}

/** Submission rejects when disabled, refused or uncertain; success is not inbox delivery. */
export interface EmailDelivery {
  deliver(message: EmailMessage): Promise<void>;
}
