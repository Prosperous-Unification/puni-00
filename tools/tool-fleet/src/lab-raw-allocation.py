import errno
import fcntl
import hashlib
import json
import os
import platform
import re
import signal
import stat
import struct
import sys
import time

ALIGNMENT = 4096
MAX_BYTES = 8 * 1024**3
MAX_PAGES = 128
PAGE_EXTENTS = 512
MAX_EXTENTS = 65536
# Explicit finite projection policy; not a measurement of filesystem or process memory.
MAX_METADATA_BYTES = 4 * 1024**2
MAX_SECONDS = 10
HEADER = struct.Struct('=QQIIII')
EXTENT = struct.Struct('=QQQQQIIII')
FIEMAP = 0xC020660B


class InspectionRefusal(Exception):
    """Fixed public category; private paths and kernel diagnostics never cross stdout."""


def identify_file(observation):
    """Include allocation and modification identity; atime may change on permitted reads."""
    return (observation.st_dev, observation.st_ino, observation.st_uid,
            observation.st_mode, observation.st_nlink, observation.st_size,
            observation.st_blocks, observation.st_mtime_ns, observation.st_ctime_ns)


def inspect_file(path, expected_bytes, *, require_initialized=False):
    """Read Linux FIEMAP without SYNC or contents; refuse unstable or nonprivate raw files.

    A native extent may cross a query boundary. This raw-file contract requires
    exact coverage through EOF and refuses extents extending beyond it.
    Guest admission opts into initialized extents; legacy preparation may retain
    allocated UNWRITTEN extents. Both modes return the same closed projection.
    https://docs.kernel.org/filesystems/fiemap.html
    """
    return _inspect_file(path, expected_bytes, require_initialized=require_initialized)


def observe_repair(path, expected_bytes):
    """Measure private sparse raw allocation without authorizing admission or repair.

    Mapped lengths include UNWRITTEN extents. Missing bytes are logical length
    minus mapped lengths, never a subtraction of st_blocks (which also counts
    allocation outside this query). The residual is unclassified inode allocation not
    represented by the queried logical range; it may include allocation beyond
    EOF and is at best a metadata upper bound, not identified metadata. It must
    fit the existing qualified 1MiB allowance, not a transient repair budget.
    An initial empty map proves all holes; continuation requires native LAST.
    Shares strict inspection's read-only descriptor, decoder and finite bounds.
    """
    return _inspect_file(path, expected_bytes, repair=True)


def observe_repair_ranges(path, expected_bytes):
    """Return exact ordered holes with the unchanged non-admitting repair observation.

    Each offset/length pair charges 16 additional projection bytes against the
    decoder's finite metadata policy. This is logical projection accounting,
    not a measurement of Python memory. No file contents or SYNC are requested.
    """
    return _inspect_file(path, expected_bytes, repair=True, collect_ranges=True)


def inspect_initialized_range(path, expected_bytes, offset_bytes, range_bytes):
    """Inspect full private allocation but certify initialization only in this range.

    Positive aligned integer geometry is checked before any native inspection.
    UNWRITTEN outside the selected range remains permitted; intersecting extents
    refuse. The explicit range-scoped projection grants no authority and cannot
    replace whole-file initialized inspection.
    """
    return _inspect_file(path, expected_bytes, initialized_range=(offset_bytes, range_bytes))


def _record_missing_range(missing_ranges, offset_bytes, range_bytes, metadata_bytes):
    """Bound each additional interval before growing the separate projection."""
    # Proof: raw-range-projection-bound fault accepts the oversized holes projection at a 160-byte cap.
    if metadata_bytes + (len(missing_ranges) + 1) * 16 > MAX_METADATA_BYTES:
        raise InspectionRefusal('raw-range-projection-bound')
    missing_ranges.append([offset_bytes, range_bytes])


def _inspect_file(path, expected_bytes, *, require_initialized=False, repair=False,
                  collect_ranges=False, initialized_range=None):
    """Walk one original descriptor; repair selects a non-admitting observation only."""
    # Proof: invalid-size guard removal changes its production refusal category in the fault campaign.
    if (type(expected_bytes) is not int or expected_bytes <= 0
            or expected_bytes > MAX_BYTES or expected_bytes % ALIGNMENT):
        raise InspectionRefusal('raw-invalid-size')
    if initialized_range is not None:
        offset_bytes, range_bytes = initialized_range
        # Proof: raw-invalid-range fault reaches the forbidden native-operation sentinel; guarded invalid bounds never inspect a path.
        if (type(offset_bytes) is not int or type(range_bytes) is not int
                or offset_bytes < 0 or range_bytes <= 0
                or offset_bytes % ALIGNMENT or range_bytes % ALIGNMENT
                or offset_bytes + range_bytes > expected_bytes):
            raise InspectionRefusal('raw-invalid-range')
    started = time.monotonic()
    descriptor = None
    try:
        before = os.lstat(path)
        # Proof: private-file fault campaign disables this predicate; mode/link/owner/kind negatives fail; real symlinks also encounter O_NOFOLLOW.
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid()
                or stat.S_IMODE(before.st_mode) != 0o600 or before.st_nlink != 1):
            if stat.S_IMODE(before.st_mode) & 0o400 == 0:
                raise InspectionRefusal('raw-input-unreadable')
            raise InspectionRefusal('raw-private-file-required')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
        opened = os.fstat(descriptor)
        # Proof: open-identity changes mtime between lstat/open; disabling this comparison loses its specific negative.
        if identify_file(before) != identify_file(opened):
            raise InspectionRefusal('raw-identity-changed')
        allocated_bytes = opened.st_blocks * 512
        # Proof: repair alignment fault removes this guard and accepts misaligned inode accounting; strict allocation negatives remain unchanged.
        if (opened.st_size != expected_bytes or allocated_bytes < 0
                or (not repair and allocated_bytes < expected_bytes)
                or allocated_bytes > expected_bytes + 1024**2 or allocated_bytes % ALIGNMENT):
            raise InspectionRefusal('raw-allocation-invalid')
        cursor = 0
        page_count = 0
        extent_count = 0
        metadata_bytes = 0
        missing_ranges = []
        mapped_bytes = 0
        unwritten_bytes = 0
        complete = False
        digest = hashlib.sha256()
        while cursor < expected_bytes and not complete:
            # Proof: bound fault campaign removes this predicate; pages/timeout negatives then succeed.
            if page_count >= MAX_PAGES or time.monotonic() - started >= MAX_SECONDS:
                raise InspectionRefusal('raw-inspection-bound')
            packet = bytearray(HEADER.size + PAGE_EXTENTS * EXTENT.size)
            HEADER.pack_into(packet, 0, cursor, expected_bytes - cursor, 0, 0, PAGE_EXTENTS, 0)
            fcntl.ioctl(descriptor, FIEMAP, packet, True)
            if time.monotonic() - started >= MAX_SECONDS:
                raise InspectionRefusal('raw-inspection-bound')
            # Proof: kernel fault campaign truncates packet; removing this guard loses truncated negative.
            if len(packet) != HEADER.size + PAGE_EXTENTS * EXTENT.size:
                raise InspectionRefusal('raw-map-truncated')
            start, length, flags, count, capacity, reserved = HEADER.unpack_from(packet)
            # Proof: repair header fault accepts a reserved header; strict empty-map refusal is preserved.
            if (start != cursor or length != expected_bytes - cursor or flags != 0
                    or reserved != 0 or capacity != PAGE_EXTENTS or not 0 <= count <= PAGE_EXTENTS
                    or (not repair and count == 0)):
                raise InspectionRefusal('raw-map-header')
            page_count += 1
            extent_count += count
            metadata_bytes += HEADER.size + count * EXTENT.size
            # Proof: projection-bound fault campaign disables predicate; metadata negative succeeds. Range page-cap fault also accepts a later page after prior interval charges.
            if extent_count > MAX_EXTENTS or metadata_bytes + len(missing_ranges) * 16 > MAX_METADATA_BYTES:
                raise InspectionRefusal('raw-map-bound')
            # Proof: repair completion fault accepts an empty continuation without LAST after a mapped extent.
            if repair and count == 0 and extent_count != 0:
                raise InspectionRefusal('raw-map-completion')
            if count == 0:
                complete = True
            for index in range(count):
                offset = HEADER.size + index * EXTENT.size
                logical, physical, extent_length, reserved1, reserved2, extent_flags, reserved3, reserved4, reserved5 = EXTENT.unpack_from(packet, offset)
                # Proof: kernel fault campaign corrupts reserved/physical/length/flags; corresponding negatives fail when disabled.
                if (reserved1 or reserved2 or reserved3 or reserved4 or reserved5
                        or physical <= 0 or physical % ALIGNMENT or extent_length <= 0
                        or extent_length % ALIGNMENT or extent_flags & ~0x801):
                    raise InspectionRefusal('raw-map-extent')
                # Proof: initialized guest inspection admits UNWRITTEN when this barrier is removed.
                if require_initialized and extent_flags & 0x800:
                    raise InspectionRefusal('raw-map-uninitialized')
                end = logical + extent_length
                # Proof: repair coverage fault accepts overlapping extents; strict gap/overlap/beyond checks remain active.
                if ((logical < cursor or logical % ALIGNMENT) if repair else logical != cursor) or end > expected_bytes:
                    raise InspectionRefusal('raw-map-coverage')
                # Proof: repair LAST fault accepts LAST before the final row; strict EOF completion stays exact.
                if ((bool(extent_flags & 1) and index != count - 1) or (end == expected_bytes and not extent_flags & 1)
                        if repair else bool(extent_flags & 1) != (end == expected_bytes) or (end == expected_bytes and index != count - 1)):
                    raise InspectionRefusal('raw-map-last')
                # Proof: raw-range-uninitialized fault logically accepts an intersecting UNWRITTEN extent, including range boundaries.
                if (initialized_range is not None and extent_flags & 0x800
                        and logical < offset_bytes + range_bytes and end > offset_bytes):
                    raise InspectionRefusal('raw-range-uninitialized')
                if collect_ranges and logical > cursor:
                    _record_missing_range(missing_ranges, cursor, logical - cursor, metadata_bytes)
                digest.update(packet[offset:offset + EXTENT.size])
                cursor = end
                mapped_bytes += extent_length
                if extent_flags & 0x800:
                    unwritten_bytes += extent_length
                complete = bool(extent_flags & 1)
        if collect_ranges and cursor < expected_bytes:
            _record_missing_range(missing_ranges, cursor, expected_bytes - cursor, metadata_bytes)
        # Proof: omitting the final interval refuses raw-range-incomplete; disabling this check with that omission logically accepts incomplete holes.
        if collect_ranges and sum(length for _, length in missing_ranges) != expected_bytes - mapped_bytes:
            raise InspectionRefusal('raw-range-incomplete')
        # Proof: repair accounting fault accepts mapped lengths larger than inode blocks; excess-residual and empty-map residual negatives use this same boundary.
        if repair and not 0 <= allocated_bytes - mapped_bytes <= 1024**2:
            raise InspectionRefusal('raw-map-accounting')
        after = os.fstat(descriptor)
        named = os.lstat(path)
        # Proof: identity fault campaign changes mtime during ioctl; disabling this comparison loses identity negative.
        if identify_file(opened) != identify_file(after) or identify_file(after) != identify_file(named):
            raise InspectionRefusal('raw-identity-changed')
        receipt = {
            'provider': 'linux-fiemap', 'inspectorVersion': 1,
            'observations': {'kernelRelease': platform.release(), 'pythonVersion': platform.python_version()},
            'identity': {'device': str(after.st_dev), 'inode': str(after.st_ino),
                         'owner': after.st_uid, 'mode': '0600', 'links': 1,
                         'mtimeNs': str(after.st_mtime_ns), 'ctimeNs': str(after.st_ctime_ns)},
            'expectedBytes': expected_bytes, 'allocatedBytes': allocated_bytes,
            'allocationOverheadBytes': allocated_bytes - expected_bytes,
            'coverageBytes': cursor, 'extentCount': extent_count, 'pageCount': page_count,
            'metadataBytes': metadata_bytes, 'mapDigest': digest.hexdigest(),
        }
        if repair:
            del receipt['allocationOverheadBytes']
            del receipt['coverageBytes']
            receipt.update({
                'observation': 'repair-source',
                'admissionAuthorized': False, 'repairAuthorized': False,
                'guestAuthorized': False, 'fullStackAuthorized': False,
                'mappedDataBytes': mapped_bytes, 'missingDataBytes': expected_bytes - mapped_bytes,
                'unwrittenBytes': unwritten_bytes, 'residualAllocatedBytes': allocated_bytes - mapped_bytes,
            })
        if collect_ranges:
            return {'observation': receipt, 'missingRanges': missing_ranges}
        if initialized_range is not None:
            return {
                'allocation': receipt, 'offsetBytes': offset_bytes, 'rangeBytes': range_bytes,
                'admissionAuthorized': False, 'repairAuthorized': False,
                'guestAuthorized': False, 'fullStackAuthorized': False,
            }
        return receipt
    except OSError as failure:
        if failure.errno == errno.ENOENT:
            raise InspectionRefusal('raw-input-absent') from failure
        if failure.errno in (errno.EACCES, errno.EPERM):
            raise InspectionRefusal('raw-input-unreadable') from failure
        raise InspectionRefusal('raw-kernel-refused') from failure
    finally:
        if descriptor is not None:
            os.close(descriptor)


def refuse_timeout(_signal, _frame):
    raise InspectionRefusal('raw-inspection-bound')


def main():
    """Source helper accepts only a path and decimal expected length; emits one closed projection."""
    try:
        if len(sys.argv) != 3 or not re.fullmatch(r'[1-9][0-9]{0,9}', sys.argv[2]):
            raise InspectionRefusal('raw-invalid-arguments')
        signal.signal(signal.SIGALRM, refuse_timeout)
        signal.setitimer(signal.ITIMER_REAL, MAX_SECONDS)
        try:
            receipt = inspect_file(sys.argv[1], int(sys.argv[2]))
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        print(json.dumps(receipt, separators=(',', ':')))
    except InspectionRefusal as failure:
        print(str(failure), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
