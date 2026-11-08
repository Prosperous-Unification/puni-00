import { posix } from 'node:path';

import { type } from 'arktype';

// Proof (actual decoder): errno/operation/path-schema/path-bound/file-extra removals admit errno13, read, NUL, oversized path and unknown file fields respectively.
const FilesystemFailure = type({
  Op: type.enumerated('open', 'write', 'mkdir'),
  Path: /^\/[A-Za-z0-9_./-]{1,511}$/,
  Err: '28',
  '+': 'reject',
});
// Proof (actual decoder): driver-name and driver-extra omissions admit foreign s3 or unknown wrapper fields.
const DriverFailure = type({
  DriverName: "'filesystem'",
  Enclosed: FilesystemFailure,
  '+': 'reject',
});
// Proof (actual decoder): code/message/tuple-count/error-extra/envelope-extra/schema-binding removals admit their named protocol negatives.
const Envelope = type({
  errors: [
    type({
      code: "'UNKNOWN'",
      message: "'unknown error'",
      detail: FilesystemFailure.or(DriverFailure),
      '+': 'reject',
    }),
  ],
  '+': 'reject',
});

/**
 * Validate the pinned Distribution2.8.3 filesystem error envelope inside an already-bounded
 * HTTP body or persisted failure message. The selected UUID is admitted by the owning request
 * boundary. Require Linux ENOSPC28, an allocation operation and a canonical path within that
 * exact pressure/full upload; return no error text or path. UNKNOWN text or an Err28 pattern
 * alone is insufficient. Distribution's errcode MarshalJSON retains structured error details;
 * driver/base can wrap a filesystem error while FileWriter operations can return it directly.
 * @see https://github.com/distribution/distribution/blob/v2.8.3/registry/api/errcode/errors.go
 * @see https://github.com/distribution/distribution/blob/v2.8.3/registry/storage/driver/base/base.go
 */
export function requireRegistryUploadEnospc(text: string, uploadId: string) {
  const encoded: unknown = JSON.parse(text);
  const [{ detail }] = Envelope.assert(encoded).errors;
  const failure = 'Enclosed' in detail ? detail.Enclosed : detail;
  const prefix =
    '/var/lib/puni-registry/registry/contents/docker/registry/v2/repositories/pressure/full/_uploads/' +
    uploadId +
    '/';
  // Proof (actual decoder): independent namespace/canonicality omissions admit a foreign upload or traversal within the textual prefix.
  if (!failure.Path.startsWith(prefix) || posix.normalize(failure.Path) !== failure.Path)
    throw new Error('Filesystem ENOSPC does not name the exact canonical selected upload');
  return { operation: failure.Op, errno: failure.Err };
}

/** Validate the actual managed transport's stored HTTP500 failure independently of its network response; a truncated/foreign/unrelated receipt cannot establish the upload failure. */
export function requireRegistryUploadFailureMessage(message: string, uploadId: string) {
  const prefix = 'Managed registry request failed with HTTP 500: ';
  // Proof (actual persisted-message decoder): omitted origin admits HTTP503; omitted shared validation admits unrelated errno13.
  if (!message.startsWith(prefix))
    throw new Error('Publication failure is not the managed HTTP500 response');
  return requireRegistryUploadEnospc(message.slice(prefix.length), uploadId);
}
