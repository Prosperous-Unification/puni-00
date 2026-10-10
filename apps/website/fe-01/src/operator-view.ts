/** Field readers for one operator API body, throwing that body's own contract error. */
export interface OperatorBodyReader {
  /** A non-negative safe integer. */
  readCount: (value: unknown, field: string) => number;
  /** A plain object (not null, not an array). */
  readRecord: (value: unknown, field: string) => Record<string, unknown>;
}

/**
 * Builds the boundary readers shared by the operator panels' parsers; each reader throws
 * `new Invalid(field)` instead of defaulting a missing or malformed field.
 */
export function createOperatorBodyReader(
  Invalid: new (field: string) => Error,
): OperatorBodyReader {
  return {
    readCount: (value, field) => {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new Invalid(field);
      return value;
    },
    readRecord: (value, field) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Invalid(field);
      return Object.fromEntries(Object.entries(value));
    },
  };
}
