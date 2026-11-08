import hashlib
import os
import resource
import signal
import stat
import sys
import time

BUILDER_PATH = '/tmp/puni-staging110-prepare.py'
BUILDER_LIMIT = 49152


def expire(_number, _frame):
    raise RuntimeError('operator-work-timeout')


def require(predicate, category):
    if not predicate:
        raise RuntimeError(category)


def stable(observed):
    return (observed.st_dev, observed.st_ino, observed.st_uid, observed.st_mode,
            observed.st_nlink, observed.st_size, observed.st_blocks,
            observed.st_mtime_ns, observed.st_ctime_ns)


def main():
    # The short reviewed root -c launcher supplies this deadline before reading this file.
    # Proof: first-io-wall observes a live timer at the first builder open; omit-wall
    # removes this installation and the independent first-I/O assertion fails.
    require(type(OPERATOR_DEADLINE) is float and 3 < OPERATOR_DEADLINE - time.monotonic() <= 45,
            'operator-launcher-deadline')
    signal.signal(signal.SIGALRM, expire)
    signal.signal(signal.SIGINT, expire)
    signal.signal(signal.SIGTERM, expire)
    # Three seconds are reserved inside the same45s envelope for owned cleanup/capture.
    signal.setitimer(signal.ITIMER_REAL, OPERATOR_DEADLINE - 3 - time.monotonic())
    require(len(sys.argv) == 3 and len(sys.argv[1]) == 64
            and all(character in '0123456789abcdef' for character in sys.argv[1])
            and sys.argv[2] in ('prepare', 'review', 'launch'), 'operator-launcher-arguments')
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_FSIZE, (65536,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    before = os.lstat(BUILDER_PATH)
    # Proof: bootstrap-unsafe/absent/over refuse before any builder marker executes;
    # watched metadata/bound omissions execute the otherwise refused marker.
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.geteuid()
            and stat.S_IMODE(before.st_mode) == 0o600 and before.st_nlink == 1
            and 0 < before.st_size <= BUILDER_LIMIT, 'operator-builder-identity')
    descriptor = os.open(BUILDER_PATH, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        payload = os.read(descriptor, BUILDER_LIMIT + 1)
        require(len(payload) == before.st_size
                and stable(before) == stable(os.fstat(descriptor)) == stable(os.lstat(BUILDER_PATH)),
                'operator-builder-changed')
        checksum = hashlib.sha256(payload).hexdigest()
        # Proof: hash refuses changed private bytes before the unreviewed marker;
        # omit-hash executes it. same-buffer swaps the pathname after hashing;
        # only the captured reviewed buffer and its exact SHA reach execution.
        require(checksum == sys.argv[1], 'operator-builder-sha')
    finally:
        os.close(descriptor)
    sys.argv = [sys.argv[0], sys.argv[2]]
    exec(compile(payload, '<staging110-operator>', 'exec', dont_inherit=True),
         {'__name__': '__main__', 'BUILDER_SHA': checksum, 'OPERATOR_DEADLINE': OPERATOR_DEADLINE})


if __name__ == '__main__':
    main()
