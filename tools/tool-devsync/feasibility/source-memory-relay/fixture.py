import ctypes
import json
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time


def emit(record):
    print(json.dumps(record), flush=True)


def line_of(stream):
    if not select.select([stream], [], [], 3)[0]:
        raise RuntimeError('fixture event deadline')
    return stream.readline().decode().strip()


def serve(path, marker, counter, inherited):
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(path)
    listener.listen(4)
    emit({'listening': os.getpid()})
    connection, _ = listener.accept()
    listener.close()
    if inherited:
        sys.stdin.buffer.read(1)
        descendant = os.fork()
        if descendant:
            Path(counter + '.descendant').write_text(str(descendant))
            os._exit(0)
    payload = bytearray()
    while True:
        try:
            chunk = connection.recv(1531)
        except ConnectionResetError:
            break
        if not chunk:
            break
        payload.extend(chunk)
        Path(counter).write_text(str(len(payload)))
    response = marker.encode() + payload
    try:
        for position in range(0, len(response), 997):
            connection.sendall(response[position:position + 997])
        connection.shutdown(socket.SHUT_WR)
    except (BrokenPipeError, ConnectionResetError):
        pass
    connection.close()
    if inherited:
        os._exit(0)
    sys.stdin.buffer.read(1)


def client(path, mode, size):
    if mode == 'delay':
        time.sleep(0.5)
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    connection.connect(path)
    if mode == 'stall':
        time.sleep(20)
        return
    payload = b'x' * int(size)
    connection.sendall(payload)
    connection.shutdown(socket.SHUT_WR)
    response = bytearray()
    while True:
        chunk = connection.recv(1291)
        if not chunk:
            break
        response.extend(chunk)
    emit({'response': response[:1].decode(), 'valid': bytes(response[1:]) == payload})
    connection.close()
    if mode == 'linger':
        time.sleep(20)


def alive(pid):
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def run(executable, scenario):
    if ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError('fixture subreaper unavailable')
    with tempfile.TemporaryDirectory(prefix='relay-fixture-') as scratch:
        root = Path(scratch)
        endpoint = str(root / 'upstream.sock')
        counter = str(root / 'received')
        servers = []
        descendants = []
        relay = None
        child_pid = None
        private = None
        started = time.monotonic()
        try:
            server = subprocess.Popen([sys.executable, '-I', __file__, 'server', endpoint, 'A', counter, 'yes' if scenario == 'peer-death' else 'no'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            servers.append(server)
            event = json.loads(line_of(server.stdout))
            expected = os.getpid() if scenario == 'foreign-upstream' else event['listening']
            mode = 'delay' if scenario == 'foreign-child' else 'stall' if scenario == 'stall' else 'linger' if scenario == 'linger' else 'normal'
            size = '200000' if scenario == 'overflow' else '49152'
            relay = subprocess.Popen([executable, endpoint, str(expected), scratch, sys.executable, str(Path(__file__).resolve()), mode, size], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
            first = line_of(relay.stdout)
            transcript = [first]
            if first.startswith('BOUND '):
                private = first[6:]
                if scenario == 'replace-path':
                    os.unlink(endpoint)
                    replacement = subprocess.Popen([sys.executable, '-I', __file__, 'server', endpoint, 'B', str(root / 'replacement'), 'no'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    servers.append(replacement)
                    line_of(replacement.stdout)
                if scenario == 'replace-private':
                    os.unlink(private)
                    Path(private).write_text('foreign replacement')
                if scenario == 'peer-death':
                    server.stdin.write(b'R'); server.stdin.flush()
                    server.wait(timeout=2)
                    descendants.append(int(Path(counter + '.descendant').read_text()))
                try:
                    relay.stdin.write(b'R'); relay.stdin.flush()
                except BrokenPipeError:
                    # Peer death can cause refusal before the fixture release is sent.
                    release_closed = True
                second = line_of(relay.stdout)
                transcript.append(second)
                if second.startswith('CHILD '):
                    child_pid = int(second[6:])
                    if scenario == 'foreign-child':
                        foreign = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                        foreign.connect(private)
                        foreign.sendall(b'foreign-request')
                        foreign.shutdown(socket.SHUT_WR)
                        foreign.close()
            try:
                relay.stdin.close()
            except BrokenPipeError:
                release_closed = True
            relay.stdin = None
            try:
                stdout, stderr = relay.communicate(timeout=4)
            except subprocess.TimeoutExpired:
                os.killpg(relay.pid, signal.SIGKILL)
                stdout, stderr = relay.communicate(timeout=2)
            transcript.extend(stdout.decode().splitlines())
            response = ''
            for line in transcript:
                if line.startswith('{'):
                    observation = json.loads(line)
                    response = observation['response'] if observation['valid'] else 'invalid'
            time.sleep(0.03)
            count = int(Path(counter).read_text()) if Path(counter).exists() else 0
            emit({'exit': relay.returncode, 'upstreamBytes': count, 'response': response, 'childAlive': alive(child_pid), 'privateExists': Path(private).parent.exists() if private else False, 'foreignPreserved': Path(private).read_text() == 'foreign replacement' if private and scenario == 'replace-private' and Path(private).is_file() else False, 'elapsedMs': (time.monotonic() - started) * 1000, 'error': stderr.decode()})
        finally:
            if relay is not None:
                try:
                    os.killpg(relay.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                relay.wait(timeout=2)
            for server in servers:
                if server.poll() is None:
                    server.kill()
                server.wait(timeout=2)
            for pid in descendants:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            deadline = time.monotonic() + 2
            while True:
                try:
                    pid, _ = os.waitpid(-1, os.WNOHANG)
                except ChildProcessError:
                    break
                if pid == 0:
                    if time.monotonic() > deadline:
                        raise RuntimeError('fixture descendants not reaped')
                    time.sleep(0.005)


if sys.argv[1] == 'server':
    serve(*sys.argv[2:5], sys.argv[5] == 'yes')
elif sys.argv[1] == 'client':
    client(*sys.argv[2:5])
elif sys.argv[1] == 'run':
    run(*sys.argv[2:4])
else:
    raise RuntimeError('unknown fixture mode')
