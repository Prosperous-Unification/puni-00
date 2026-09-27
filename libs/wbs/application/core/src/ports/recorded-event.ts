/** One durable subscription event, with its monotonic sequence. */
export interface RecordedEvent {
  readonly subscription: string;
  readonly seq: number;
  readonly message: unknown;
  readonly createdAt: number;
}
