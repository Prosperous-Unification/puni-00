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
    # Proof: invalid-size guard removal changes its production refusal category in the fault campaign.
    if (type(expected_bytes) is not int or expected_bytes <= 0
            or expected_bytes > MAX_BYTES or expected_bytes % ALIGNMENT):
        raise InspectionRefusal('raw-invalid-size')
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
        # Proof: allocation guard removal admits injected under/over/alignment/size observations; real sparse files also refuse.
        if (opened.st_size != expected_bytes or allocated_bytes < expected_bytes
                or allocated_bytes > expected_bytes + 1024**2 or allocated_bytes % ALIGNMENT):
            raise InspectionRefusal('raw-allocation-invalid')
        cursor = 0
        page_count = 0
        extent_count = 0
        metadata_bytes = 0
        digest = hashlib.sha256()
        while cursor < expected_bytes:
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
            # Proof: kernel fault campaign changes reserved/start/count; header/start/count/empty negatives fail when disabled.
            if (start != cursor or length != expected_bytes - cursor or flags != 0
                    or reserved != 0 or capacity != PAGE_EXTENTS or not 0 < count <= PAGE_EXTENTS):
                raise InspectionRefusal('raw-map-header')
            page_count += 1
            extent_count += count
            metadata_bytes += HEADER.size + count * EXTENT.size
            # Proof: projection-bound fault campaign disables predicate; metadata negative succeeds.
            if extent_count > MAX_EXTENTS or metadata_bytes > MAX_METADATA_BYTES:
                raise InspectionRefusal('raw-map-bound')
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
                # Proof: coverage fault campaign removes predicate; gap/overlap/beyond negatives succeed.
                if logical != cursor or end > expected_bytes:
                    raise InspectionRefusal('raw-map-coverage')
                # Proof: LAST fault campaign removes predicate; early-last/missing-last negatives succeed.
                if bool(extent_flags & 1) != (end == expected_bytes) or (end == expected_bytes and index != count - 1):
                    raise InspectionRefusal('raw-map-last')
                digest.update(packet[offset:offset + EXTENT.size])
                cursor = end
        after = os.fstat(descriptor)
        named = os.lstat(path)
        # Proof: identity fault campaign changes mtime during ioctl; disabling this comparison loses identity negative.
        if identify_file(opened) != identify_file(after) or identify_file(after) != identify_file(named):
            raise InspectionRefusal('raw-identity-changed')
        return {
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
