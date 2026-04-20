export class ValidationError extends Error {
  override name = 'ValidationError' as const;
  readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
