import base64
import ctypes
import hashlib
import html
import http.server
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
PIN = '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639'

def group_exists(group):
    try:
        os.killpg(group, 0)
        return True
    except ProcessLookupError:
        return False

def stop_owned_group(child):
    if group_exists(child.pid):
        os.killpg(child.pid, signal.SIGKILL)
    child.wait(timeout=5)
    while True:
        try:
            os.waitpid(-child.pid, 0)
        except ChildProcessError:
            break
    if group_exists(child.pid):
        raise RuntimeError('Owned process group survived cleanup')

def run_owned(arguments, environment, archive, label):
    child = subprocess.Popen(arguments, env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    captured = {'stdout': bytearray(), 'stderr': bytearray()}
    deadline = time.monotonic() + 75
    try:
        with selectors.DefaultSelector() as selector:
            for name, pipe in [('stdout', child.stdout), ('stderr', child.stderr)]:
                selector.register(pipe, selectors.EVENT_READ, name)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Owned child exceeded watchdog')
                for ready, _ in selector.select(remaining):
                    chunk = os.read(ready.fd, 4096)
                    if not chunk:
                        selector.unregister(ready.fileobj)
                        ready.fileobj.close()
                        continue
                    output = captured[ready.data]
                    if len(output) + len(chunk) > 65536:
                        raise RuntimeError('Owned child output exceeds bound')
                    output.extend(chunk)
        child.wait(timeout=max(0.001, deadline - time.monotonic()))
    except BaseException:
        stop_owned_group(child)
        for name, output in captured.items():
            (archive / (label + '-failed.' + name + '.log')).write_bytes(output)
        raise
    stdout, stderr = (bytes(captured['stdout']), bytes(captured['stderr']))
    (archive / (label + '.stdout.log')).write_bytes(stdout)
    (archive / (label + '.stderr.log')).write_bytes(stderr)
    if group_exists(child.pid):
        stop_owned_group(child)
        raise RuntimeError('Owned descendants required repaired cleanup')
    if child.returncode != 0:
        raise RuntimeError('Owned ' + label + ' failed: ' + stderr.decode(errors='replace'))
    return stdout

def observe():
    bun, supplied = sys.argv[1:]
    binary = Path(supplied)
    if os.getuid() == 0 or hashlib.sha256(binary.read_bytes()).hexdigest() != PIN:
        raise RuntimeError('Ordinary-user pinned Restic required')
    if ctypes.CDLL('libc.so.6', use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError('Cannot establish owned descendant reaping')
    archive = Path(tempfile.mkdtemp(prefix='registry-store-retry-evidence-', dir='/tmp'))
    (archive / 'executed-fixture.py').write_bytes(Path(__file__).read_bytes())
    fixture = Path(__file__).with_suffix('.ts')
    (archive / 'executed-fixture.ts').write_bytes(fixture.read_bytes())
    (archive / 'executed-store.ts').write_bytes(fixture.with_name('registry-backup-store.ts').read_bytes())
    print('Owned retry evidence: ' + str(archive), file=sys.stderr, flush=True)
    with tempfile.TemporaryDirectory(prefix='registry-store-retry-', dir='/tmp') as owned:
        root = Path(owned)
        key, cert = (root / 'tls.key', root / 'tls.crt')
        generated = subprocess.run(['/usr/bin/openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key), '-out', str(cert), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], capture_output=True, timeout=15)
        if generated.returncode != 0:
            raise RuntimeError('Owned TLS certificate creation failed')
        key.chmod(384)
        versions = {}
        failures = []
        dropped = []
        methods = {}
        mutex = threading.Lock()
        requests = 0
        total_bytes = 0
        request_trace = []
        target = None

        class Receiver(http.server.BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def setup(self):
                super().setup()
                self.connection.settimeout(5)

            def log_message(self, *arguments):
                return

            def respond(self, status, body=b'', headers=None):
                self.observation['status'] = status
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Content-Type', 'application/xml')
                for name, value in (headers or {}).items():
                    self.send_header(name, value)
                self.end_headers()
                if self.command != 'HEAD' and body:
                    self.wfile.write(body)

            def error(self, status, code):
                self.respond(status, ('<Error><Code>' + code + '</Code><Message>owned fixture</Message></Error>').encode())

            def process_request(self):
                nonlocal requests, total_bytes, target
                parsed = urllib.parse.urlsplit(self.path)
                query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
                parts = parsed.path.split('/')
                category = parts[3] if len(parts) > 3 and parts[3] in ['config', 'keys', 'locks', 'data', 'index', 'snapshots'] else 'bucket-or-other'
                self.observation = {'method': self.command, 'category': category, 'queryKeys': sorted(query)}
                request_trace.append(self.observation)
                with mutex:
                    requests += 1
                    if requests > 256:
                        raise RuntimeError('Owned HTTP request limit exceeded')
                    methods[self.command] = methods.get(self.command, 0) + 1
                if not self.headers.get('Authorization', '').startswith('AWS4-HMAC-SHA256 '):
                    raise RuntimeError('Missing modeled SigV4 boundary')
                if parsed.path not in ['/fixture', '/fixture/'] and (not parsed.path.startswith('/fixture/repository/')):
                    raise RuntimeError('Foreign owned repository path')
                if parsed.path in ['/fixture', '/fixture/']:
                    if self.command == 'HEAD':
                        self.respond(200)
                        return
                    if self.command == 'GET' and 'location' in query:
                        self.respond(200, b'<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>')
                        return
                    if self.command == 'GET' and query.get('list-type') == ['2']:
                        prefix = query.get('prefix', [''])[0]
                        delimiter = query.get('delimiter', [''])[0]
                        contents = []
                        common = set()
                        for name, history in sorted(versions.items()):
                            if not name.startswith(prefix):
                                continue
                            suffix = name[len(prefix):]
                            if delimiter and delimiter in suffix:
                                common.add(prefix + suffix.split(delimiter, 1)[0] + delimiter)
                                continue
                            current = history[-1]
                            contents.append('<Contents><Key>' + html.escape(name) + '</Key><LastModified>2026-11-09T00:00:00.000Z</LastModified><ETag>&quot;' + current['md5'] + '&quot;</ETag><Size>' + str(len(current['body'])) + '</Size><StorageClass>STANDARD</StorageClass></Contents>')
                        common_xml = ''.join(('<CommonPrefixes><Prefix>' + html.escape(name) + '</Prefix></CommonPrefixes>' for name in sorted(common)))
                        body = ('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>fixture</Name><Prefix>' + html.escape(prefix) + '</Prefix><KeyCount>' + str(len(contents)) + '</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>' + ''.join(contents) + common_xml + '</ListBucketResult>').encode()
                        self.respond(200, body)
                        return
                    raise RuntimeError('Unsupported owned bucket operation')
                name = urllib.parse.unquote(parsed.path[len('/fixture/'):])
                if self.command == 'PUT':
                    length = int(self.headers.get('Content-Length', '-1'))
                    if length <= 0 or length > 1048576:
                        raise RuntimeError('Owned request body exceeds fixed limit')
                    body = self.rfile.read(length)
                    if len(body) != length:
                        raise RuntimeError('Owned PUT body truncated')
                    md5 = hashlib.md5(body).hexdigest()
                    expected_md5 = base64.b64encode(hashlib.md5(body).digest()).decode()
                    if self.headers.get('Content-MD5') != expected_md5:
                        raise RuntimeError('Expected exact known-length MD5 PUT profile')
                    with mutex:
                        total_bytes += len(body)
                        if total_bytes > 16 * 1024 ** 2:
                            raise RuntimeError('Owned version bytes exceed fixed limit')
                        history = versions.setdefault(name, [])
                        history.append({'body': body, 'md5': md5, 'sha256': hashlib.sha256(body).hexdigest()})
                        version = str(len(history))
                        if name.startswith('repository/data/') and target is None:
                            target = name
                        should_drop = name == target and len(history) <= 2
                        if should_drop:
                            dropped.append({'key': name, 'bytes': length})
                    if should_drop:
                        self.observation['status'] = 'lost-after-commit'
                        self.close_connection = True
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                    self.respond(200, headers={'ETag': '"' + md5 + '"', 'x-amz-version-id': version})
                    return
                if self.command in ['GET', 'HEAD']:
                    history = versions.get(name)
                    if not history:
                        self.error(404, 'NoSuchKey')
                        return
                    body = history[-1]['body']
                    headers = {'ETag': '"' + history[-1]['md5'] + '"', 'x-amz-version-id': str(len(history)), 'Last-Modified': 'Mon, 09 Nov 2026 00:00:00 GMT'}
                    requested = self.headers.get('Range')
                    if requested:
                        if not requested.startswith('bytes=') or ',' in requested:
                            raise RuntimeError('Unexpected owned range syntax')
                        first, last = requested[6:].split('-', 1)
                        start = int(first)
                        end = int(last) if last else len(body) - 1
                        if start < 0 or end < start or end >= len(body):
                            raise RuntimeError('Invalid owned range')
                        headers['Content-Range'] = 'bytes ' + str(start) + '-' + str(end) + '/' + str(len(body))
                        self.respond(206, body[start:end + 1], headers)
                        return
                    self.respond(200, body, headers)
                    return
                if self.command == 'DELETE':
                    versions.pop(name, None)
                    self.respond(204)
                    return
                raise RuntimeError('Unsupported owned object operation')

            def dispatch(self):
                try:
                    self.process_request()
                except BaseException as failure:
                    failures.append(type(failure).__name__ + ': ' + str(failure))
                    self.close_connection = True
            do_HEAD = dispatch
            do_GET = dispatch
            do_PUT = dispatch
            do_DELETE = dispatch
        receiver = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Receiver)
        receiver.daemon_threads = False
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(cert, key)
        receiver.socket = tls.wrap_socket(receiver.socket, server_side=True)
        worker = threading.Thread(target=receiver.serve_forever)
        worker.start()
        repository = 's3:https://localhost:' + str(receiver.server_port) + '/fixture/repository'
        environment = {'PATH': '/usr/bin:/bin', 'RESTIC_REPOSITORY': repository, 'RESTIC_PASSWORD': 'owned-disposable-retry-fixture', 'AWS_ACCESS_KEY_ID': 'owned-fixture-access', 'AWS_SECRET_ACCESS_KEY': 'owned-fixture-secret', 'AWS_DEFAULT_REGION': 'us-east-1'}
        relay_stderr = root / 'relay.stderr'
        relay_stderr.write_bytes(b'')
        wrapper = root / 'restic-relay'
        wrapper.write_text('#!' + bun + '\nimport { relayOwnedRestic } from ' + json.dumps(str(fixture)) + ';\nawait relayOwnedRestic(' + json.dumps({'binary': str(binary), 'certificate': str(cert), 'stderr': str(relay_stderr)}) + ');\n')
        wrapper.chmod(448)
        try:
            run_owned([str(binary), '--cacert', str(cert), '--no-cache', 'init'], environment, archive, 'init')
            completed = json.loads(run_owned([bun, str(fixture), json.dumps({'binary': str(wrapper), 'repository': repository})], {'PATH': '/usr/bin:/bin'}, archive, 'snapshot'))
            if failures:
                raise RuntimeError('Owned receiver failed: ' + repr(failures))
            if target is None or len(dropped) != 2:
                raise RuntimeError('Two owned lost-ack faults not reached')
            history = versions[target]
            notices = relay_stderr.read_text()
            (archive / 'relay.stderr.log').write_text(notices)
            if len(notices.encode()) > 65536:
                raise RuntimeError('Owned relay diagnostics exceed bound')
            observed = {'snapshotVerified': completed['snapshotVerified'] is True, 'committedVersions': len(history), 'identicalEncryptedBodies': len({entry['sha256'] for entry in history}) == 1, 'outerSaveRetries': len(re.findall('^Save\\(<data/[^>]+>\\) returned error, retrying after ', notices, re.M)), 'successAfterTwoRetries': bool(re.search('^Save\\(<data/[^>]+>\\) operation successful after 2 retries$', notices, re.M)), 'receiverClosed': False, 'descendantsAbsent': True}
        finally:
            receiver.shutdown()
            receiver.server_close()
            worker.join(5)
            (archive / 'http-summary.json').write_text(json.dumps({'requests': request_trace, 'receiverFailures': failures, 'lostReplies': dropped, 'selectedHistory': [] if target is None else [{'sha256': entry['sha256'], 'bytes': len(entry['body'])} for entry in versions[target]], 'receiverClosed': not worker.is_alive()}, indent=2) + '\n')
            if worker.is_alive() or receiver.socket.fileno() != -1:
                raise RuntimeError('Owned TLS receiver survived closure')
        observed['receiverClosed'] = True
    if root.exists():
        raise RuntimeError('Owned TLS material remained')
    (archive / 'receipt.json').write_text(json.dumps(observed, indent=2) + '\n')
    print(json.dumps(observed))

def interrupt_owned(signum, frame):
    raise RuntimeError('Owned retry fixture interrupted: ' + str(signum))
if __name__ == '__main__':
    signal.signal(signal.SIGALRM, interrupt_owned)
    signal.signal(signal.SIGTERM, interrupt_owned)
    signal.alarm(100)
    observe()
    signal.alarm(0)
