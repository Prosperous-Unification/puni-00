import type { RegistryS3Fetch } from './registry-s3-census';

export const scope = {
  endpoint: 'https://objects.example.invalid',
  bucket: 'registry-backup',
  prefix: 'backups/registry/',
  region: 'eu-test-1',
  credentials: { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' },
};
export const encodedPrefix = 'backups%2Fregistry%2F';
export const versioning =
  '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>';
export const versions = (children = '', tail = '<IsTruncated>false</IsTruncated>') =>
  `<ListVersionsResult><Name>registry-backup</Name><Prefix>${encodedPrefix}</Prefix><EncodingType>url</EncodingType>${children}${tail}</ListVersionsResult>`;
export const uploads = (children = '', tail = '<IsTruncated>false</IsTruncated>') =>
  `<ListMultipartUploadsResult><Bucket>registry-backup</Bucket><Prefix>${encodedPrefix}</Prefix><EncodingType>url</EncodingType>${children}${tail}</ListMultipartUploadsResult>`;
export const version = (key = 'a', id = 'v1', latest = 'true', size = '<Size>7</Size>') =>
  `<Version><Key>${encodedPrefix}${key}</Key><VersionId>${id}</VersionId><IsLatest>${latest}</IsLatest>${size}</Version>`;
export const marker = `<DeleteMarker><Key>${encodedPrefix}b</Key><VersionId>marker</VersionId><IsLatest>true</IsLatest></DeleteMarker>`;
export const upload = (key = 'c', id = 'upload-z') =>
  `<Upload><Key>${encodedPrefix}${key}</Key><UploadId>${id}</UploadId></Upload>`;
export const parts = (children = '', tail = '<IsTruncated>false</IsTruncated>') =>
  `<ListPartsResult><Bucket>registry-backup</Bucket><Key>backups/registry/c</Key><UploadId>upload-z</UploadId>${children}${tail}</ListPartsResult>`;
export const part = (number: number, size: number) =>
  `<Part><PartNumber>${String(number)}</PartNumber><Size>${String(size)}</Size></Part>`;
/** Actual SDK requests reach this controlled wire boundary; no network or credentials are read. */
export function createWire(responses: (string | Response | (() => Promise<Response>))[]) {
  const requests: Request[] = [];
  const fetch: RegistryS3Fetch = async (request) => {
    requests.push(request);
    const response = responses.shift();
    if (response === undefined) throw new Error('Unexpected extra wire request');
    if (typeof response === 'function') return response();
    return typeof response === 'string'
      ? new Response(response, { headers: { 'content-type': 'application/xml' } })
      : response;
  };
  return { fetch, requests, remaining: () => responses.length };
}
