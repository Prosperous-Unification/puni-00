import json
import os
from pathlib import Path
import select
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time


class Refusal(Exception):
    pass


def stop_process(process):
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=1)


def serve_fixture(endpoint, scenario):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
        listener.bind(endpoint)
        listener.listen(1)
        print('READY', flush=True)
        connection, _address = listener.accept()
        with connection:
            connection.settimeout(2)
            request = connection.recv(64)
            if scenario == 'bun-incompatibility':
                print(json.dumps({'requestBytes': len(request)}), flush=True)
                return
            if request != b'fixture-request':
                raise RuntimeError('fixture request')
            if scenario == 'active-peer-death':
                return
            if scenario == 'deadline':
                time.sleep(1)
                return
            payload = b'x' * 140000 if scenario == 'bytes' else b'fixture-response'
            length = len(payload) + (1 if scenario == 'truncated' else 0)
            connection.sendall(b'P' + struct.pack('!I', length) + payload)
            if scenario != 'truncated' and scenario != 'missing-status':
                connection.sendall(b'S' + struct.pack('!I', 1) + b'0')
            if scenario == 'late-control':
                time.sleep(.02)
                connection.sendall(b'C' + struct.pack('!I', 8) + b'control!')
            connection.shutdown(socket.SHUT_WR)
            connection.recv(1)


def authenticate_peer(connection, expected_pid, expected_uid):
    credentials = connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
    pid, uid, _gid = struct.unpack('3i', credentials)
    # Proof: identity-omission mutant launches wrong-pid/wrong-uid and fails the consuming observation.
    if (pid, uid) != (expected_pid, expected_uid):
        raise Refusal('peer-identity')
    # Linux SO_PEERPIDFD = 77; missing support throws, never falls back to PID lookup.
    reference = struct.unpack('i', connection.getsockopt(socket.SOL_SOCKET, 77, 4))[0]
    os.set_inheritable(reference, False)
    return reference


class DescriptorOwner:
    """Throwaway fixture owner. This is a synthetic protocol, not a CRI client."""

    def __init__(self, connection, reference):
        self.connection = connection
        self.reference = reference
        self.claimed = False
        self.deadline = time.monotonic() + .25
        self.bytes = 0

    def claim_socket(self):
        # Proof: claim-omission mutant accepts second-claim and fails its consuming observation.
        if self.claimed:
            raise Refusal('second-claim')
        self.claimed = True
        self.require_live()
        return self.connection

    def require_live(self):
        # Proof: liveness-omission mutant consumes a dead peer and fails peer-death.
        if select.select([self.reference], [], [], 0)[0]:
            raise Refusal('peer-death')

    def read_bytes(self, length):
        chunks = []
        while length > 0:
            self.require_live()
            remaining = self.deadline - time.monotonic()
            # Proof: deadline-omission mutant completes delayed input and fails deadline.
            if remaining <= 0:
                raise Refusal('deadline')
            readable = select.select([self.connection, self.reference], [], [], remaining)[0]
            if self.reference in readable:
                raise Refusal('peer-death')
            if self.connection not in readable:
                continue
            chunk = self.connection.recv(min(length, 4096))
            if not chunk:
                raise Refusal('truncated')
            self.bytes += len(chunk)
            # Proof: bytes-omission mutant accepts 140000 payload bytes and fails bytes.
            if self.bytes > 131072:
                raise Refusal('bytes')
            chunks.append(chunk)
            length -= len(chunk)
        return b''.join(chunks)

    def read_frame(self):
        header = self.read_bytes(5)
        return header[:1], self.read_bytes(struct.unpack('!I', header[1:])[0])

    def observe_response(self, scenario):
        self.claim_socket().sendall(b'fixture-request')
        if scenario == 'second-claim':
            self.claim_socket()
            return {'outcome': 'second-claim-accepted'}
        kind, payload = self.read_frame()
        if kind != b'P':
            raise Refusal('payload-frame')
        # Proof: status-omission mutant accepts missing-status and fails its consuming observation.
        kind, status = self.read_frame()
        if kind != b'S' or status != b'0':
            raise Refusal('status-frame')
        completion_bytes = self.bytes
        controls = 0
        if scenario == 'late-control':
            kind, control = self.read_frame()
            if kind != b'C' or control != b'control!':
                raise Refusal('control-frame')
            controls += 1
        return {'outcome': 'complete', 'payloadBytes': len(payload), 'completionBytes': completion_bytes, 'totalBytes': self.bytes, 'controls': controls}


def observe(scenario, bun, script):
    with tempfile.TemporaryDirectory(prefix='f9-connected-') as scratch:
        directory = Path(scratch)
        endpoint = directory / 'runtime.sock'
        server = subprocess.Popen([sys.executable, '-I', __file__, '--server', str(endpoint), scenario], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        reference = None
        connection = None
        trap = None
        client = None
        owner = None
        try:
            if not select.select([server.stdout], [], [], 2)[0] or server.stdout.readline() != 'READY\n':
                raise RuntimeError('server startup')
            connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            connection.connect(str(endpoint))
            expected = {'wrong-pid': 'peer-identity', 'wrong-uid': 'peer-identity', 'peer-death': 'peer-death', 'active-peer-death': 'peer-death', 'truncated': 'truncated', 'missing-status': 'truncated', 'second-claim': 'second-claim', 'deadline': 'deadline', 'bytes': 'bytes'}.get(scenario, 'complete')
            try:
                reference = authenticate_peer(connection, server.pid + (1 if scenario == 'wrong-pid' else 0), os.getuid() + (1 if scenario == 'wrong-uid' else 0))
                owner = DescriptorOwner(connection, reference)
                if scenario == 'peer-death':
                    stop_process(server)
                if scenario == 'replace-path':
                    endpoint.rename(directory / 'original.sock')
                    trap = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    trap.bind(str(endpoint))
                    trap.listen(1)
                if scenario == 'bun-incompatibility':
                    descriptor = connection.fileno()
                    client = subprocess.Popen([bun, str(script), str(descriptor)], pass_fds=(descriptor,), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    connection.close()
                    stdout, stderr = client.communicate(timeout=2)
                    assert client.returncode == 0 and stderr == '', (client.returncode, stdout, stderr)
                    observed = json.loads(stdout)
                    assert observed == {'inheritedSocket': True, 'outcome': 'Socket is closed'}, observed
                    assert select.select([server.stdout], [], [], 1)[0]
                    assert json.loads(server.stdout.readline()) == {'requestBytes': 0}
                    return {'scenario': scenario, **observed}
                observed = owner.observe_response(scenario)
            except Refusal as failure:
                observed = {'outcome': str(failure)}
            if scenario == 'active-peer-death':
                # Socket EOF can precede pidfd readiness during process exit. Both refuse.
                assert observed['outcome'] in ['peer-death', 'truncated'], observed
            else:
                assert observed['outcome'] == expected, (scenario, observed)
            assert (owner is None) == (scenario in ['wrong-pid', 'wrong-uid']), scenario
            if scenario == 'late-control':
                assert observed['controls'] == 1 and observed['completionBytes'] < observed['totalBytes'], observed
            if trap is not None:
                assert not select.select([trap], [], [], 0)[0], 'replacement endpoint contacted'
            return {'scenario': scenario, **observed}
        finally:
            if client is not None:
                stop_process(client)
                assert not Path(f'/proc/{client.pid}').exists(), 'client not reaped'
            stop_process(server)
            assert not Path(f'/proc/{server.pid}').exists(), 'server not reaped'
            if connection is not None:
                # Proof: cleanup-omission mutant leaves fileno open and fails this consuming assertion.
                connection.close()
                assert connection.fileno() == -1, 'owned socket not closed'
            if reference is not None:
                os.close(reference)
                assert not Path(f'/proc/self/fd/{reference}').exists(), 'pidfd not closed'
            if trap is not None:
                trap.close()


if len(sys.argv) > 1:
    if len(sys.argv) != 4 or sys.argv[1] != '--server':
        raise RuntimeError('fixture arguments')
    serve_fixture(sys.argv[2], sys.argv[3])
else:
    script = Path(os.environ.get('CONNECTED_PROBE_SCRIPT', Path(__file__).with_name('connected_http2.ts'))).resolve(strict=True)
    bun = shutil.which('bun')
    if bun is None:
        raise RuntimeError('missing bun')
    scenarios = ['complete', 'truncated', 'missing-status', 'late-control', 'replace-path', 'wrong-pid', 'wrong-uid', 'peer-death', 'active-peer-death', 'second-claim', 'deadline', 'bytes', 'bun-incompatibility']
    observations = [observe(scenario, bun, script) for scenario in scenarios]
    print(json.dumps({'scenarios': len(observations), 'observations': observations, 'criVerified': False}))
