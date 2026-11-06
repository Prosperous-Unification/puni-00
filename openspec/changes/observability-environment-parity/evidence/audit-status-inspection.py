import ctypes
import json
import os
import selectors
import stat
import sys
import time

LIBRARY = '/usr/lib/x86_64-linux-gnu/libaudit.so.1.0.0'
REPLY_SECONDS = 1.0
STREAM_BYTES = 65536
REPLY_COUNT = 4
AUDIT_GET = 1000
NLMSG_ERROR = 2


class Header(ctypes.Structure):
    _fields_ = [
        ('length', ctypes.c_uint32),
        ('kind', ctypes.c_uint16),
        ('flags', ctypes.c_uint16),
        ('sequence', ctypes.c_uint32),
        ('pid', ctypes.c_uint32),
    ]


class Message(ctypes.Structure):
    _fields_ = [('header', Header), ('payload', ctypes.c_char * 8970)]


class Reply(ctypes.Structure):
    # The final C union consists entirely of pointer alternatives.
    _fields_ = [
        ('kind', ctypes.c_int),
        ('length', ctypes.c_int),
        ('header', ctypes.POINTER(Header)),
        ('message', Message),
        ('pointer', ctypes.c_void_p),
    ]


class Status(ctypes.Structure):
    _fields_ = [
        (name, ctypes.c_uint32)
        for name in (
            'mask', 'enabled', 'failure', 'pid', 'rate_limit',
            'backlog_limit', 'lost', 'backlog', 'feature_bitmap',
            'backlog_wait_time', 'backlog_wait_time_actual',
        )
    ]


def unavailable(stage, number=None, **details):
    observation = {'state': 'unavailable', 'stage': stage, **details}
    if number is not None:
        observation['errno'] = number
        observation['reason'] = os.strerror(number)
    return observation


def emit(observation):
    encoded = (json.dumps(observation, sort_keys=True) + '\n').encode('utf-8')
    if len(encoded) > STREAM_BYTES:
        raise RuntimeError('diagnostic serialization exceeds65536-byte cap')
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def inspect_status():
    """Read kernel audit status once through the validated v3.1.2 ABI.

    linux-audit/audit-userspace v3.1.2 lib/libaudit.h lines492-520,
    576-579,614-615 declares the reply/function ABI; lib/libaudit.c lines115-121
    sends AUDIT_GET,NULL,0. lib/netlink.c defines audit_open, adjust_reply,
    audit_send and check_ack. Local linux/audit.h defines AUDIT_GET1000 and
    the44-byte status; linux/netlink.h defines the16-byte header.

    No setter, registration, multicast membership, rule listing or event API is
    used. Opening the library/interpreter and diagnostic output have unqualified
    startup, atime, allocation and logging effects. Successful audit_open reaches
    one explicit audit_close on normal exit; external termination reclaims FDs.
    """
    identity = os.stat(LIBRARY, follow_symlinks=False)
    if not stat.S_ISREG(identity.st_mode):
        return unavailable('library-not-regular', path=LIBRARY)
    if identity.st_uid != 0 or identity.st_mode & 0o022:
        return unavailable('library-owner-or-write-mode', path=LIBRARY)
    if ctypes.sizeof(Header) != 16 or ctypes.sizeof(Status) != 44:
        return unavailable('unexpected-uapi-structure-size')
    if ctypes.sizeof(Message) != 8988 or ctypes.sizeof(Reply) != 9016:
        return unavailable('unexpected-v3.1.2-reply-abi-size')

    audit = ctypes.CDLL(LIBRARY, use_errno=True)
    audit.audit_open.argtypes = []
    audit.audit_open.restype = ctypes.c_int
    audit.audit_close.argtypes = [ctypes.c_int]
    audit.audit_close.restype = None
    audit.audit_request_status.argtypes = [ctypes.c_int]
    audit.audit_request_status.restype = ctypes.c_int
    audit.audit_get_reply.argtypes = [
        ctypes.c_int, ctypes.POINTER(Reply), ctypes.c_int, ctypes.c_int,
    ]
    audit.audit_get_reply.restype = ctypes.c_int

    descriptor = audit.audit_open()
    if descriptor < 0:
        return unavailable('audit_open', ctypes.get_errno(), openReturn=descriptor)
    try:
        # Exactly one request. The native function sends AUDIT_GET,NULL,0.
        sequence = audit.audit_request_status(descriptor)
        if sequence < 0:
            return unavailable('audit_request_status', -sequence,
                               openReturn=descriptor, requestReturn=sequence)
        if sequence == 0:
            return unavailable('request-short-return', requestReturn=sequence)

        deadline = time.monotonic() + REPLY_SECONDS
        for _ in range(REPLY_COUNT):
            selector = selectors.DefaultSelector()
            try:
                selector.register(descriptor, selectors.EVENT_READ)
                ready = selector.select(max(0.0, deadline - time.monotonic()))
            finally:
                selector.close()
            if not ready:
                return unavailable('status-reply-timeout')

            reply = Reply()
            # GET_REPLY_NONBLOCKING=1; peek=0. Status/ACK only, no subscription.
            received = audit.audit_get_reply(descriptor, ctypes.byref(reply), 1, 0)
            if received < 0:
                return unavailable('audit_get_reply', -received)
            header = reply.message.header
            if (received < 16 or header.length < 16
                    or header.length > received or header.sequence != sequence):
                return unavailable('invalid-status-header')
            if header.kind == NLMSG_ERROR:
                if header.length < 20:
                    return unavailable('short-netlink-status-error')
                native_error = ctypes.c_int.from_address(
                    ctypes.addressof(reply.message) + 16
                ).value
                if native_error < 0:
                    return unavailable('kernel-status-response', -native_error)
                if native_error > 0:
                    return unavailable('invalid-positive-netlink-error')
                continue
            if header.kind != AUDIT_GET:
                return unavailable('unexpected-response-type',
                                   responseType=header.kind)
            if header.length < 16 + ctypes.sizeof(Status):
                return unavailable('short-audit-status')
            # The checked status frame is copied; pointer union is never read.
            status = Status.from_buffer_copy(ctypes.string_at(
                ctypes.addressof(reply.message) + 16, ctypes.sizeof(Status)
            ))
            return {
                'state': 'observed',
                'status': {name: getattr(status, name) for name, _ in Status._fields_},
            }
        return unavailable('status-response-count-cap')
    finally:
        # Each successful audit_open has one explicit close on normal exit.
        # If the external deadline terminates this process, the kernel reclaims its FD.
        audit.audit_close(descriptor)


def run_worker():
    try:
        observation = inspect_status()
    except OSError as fault:
        observation = unavailable('diagnostic-os-error', fault.errno)
    except Exception as fault:
        # Report bounded diagnostic failure, never substitute disabled/zero.
        observation = unavailable('diagnostic-error', exception=type(fault).__name__)
    emit({
        'purpose': 'status-only diagnostic; never operational qualification',
        'uid': os.getuid(), 'euid': os.geteuid(),
        'library': LIBRARY, 'subscription': False,
        **observation,
    })
    return 0 if observation['state'] == 'observed' else 2



if __name__ == '__main__':
    if sys.argv[1:]:
        emit(unavailable('unsupported-arguments'))
        sys.exit(2)
    sys.exit(run_worker())
