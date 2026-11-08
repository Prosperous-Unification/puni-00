import hashlib
import importlib.util
import os
from pathlib import Path
import re
import resource
import signal
import sys
import tempfile
from contextlib import ExitStack


def require_refusal(producer, operation, category):
    try:
        operation()
    except producer.raw.PreparationRefusal as failure:
        assert str(failure) == category, str(failure)
    else:
        raise AssertionError('unsafe ISO accepted: ' + category)


def main():
    """Explicit private-tool control; fixture archives have no package or guest authority."""
    if len(sys.argv) != 2:
        raise RuntimeError('usage: lab-seed-preparation-control.py ORIGINAL_BASELINE_STATE')
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024**2,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    spec = importlib.util.spec_from_file_location('seed_control', Path(__file__).with_name('lab-seed-preparation.py'))
    if spec is None or spec.loader is None:
        raise RuntimeError('seed control source unavailable')
    producer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(producer)
    signal.signal(signal.SIGALRM, producer.raw.cancel)
    signal.setitimer(signal.ITIMER_REAL, 30)
    state = sys.argv[1]
    environment = producer.raw.clean_environment(state)
    with tempfile.TemporaryDirectory() as directory, ExitStack() as opened:
        members = {}
        for offset, name in enumerate(producer.MEMBERS):
            payload = ('controlled fixture ' + str(offset) + ' ' + name).encode()
            path = directory + '/' + name
            with open(path, 'xb') as stream:
                stream.write(payload)
            os.chmod(path, 0o400)
            descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC)
            opened.callback(os.close, descriptor)
            members[name] = {'path': path, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(),
                             'fd': descriptor, 'identity': producer.raw.stable_identity(os.fstat(descriptor))}
        path = directory + '/seed.iso'
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_CLOEXEC, 0o600)
        opened.callback(os.close, descriptor)
        tools = {}
        for name in ('genisoimage', 'isoinfo'):
            tools[name] = os.open(state + '/tools-root/usr/bin/' + name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            opened.callback(os.close, tools[name])
        original = producer.raw.identity(os.fstat(descriptor))
        artifact = producer.generate_iso(descriptor, path, original, members, tools, environment, lambda: None)
        assert 0 < artifact['bytes'] < 1024**2
        assert artifact['memberBytes'] == sum(member['bytes'] for member in members.values())
        original_stream = producer.stream_command
        extracted = 0
        def count_extraction(arguments, descriptors, environment, maximum, consume, monitor, **options):
            nonlocal extracted
            if '-x' in arguments:
                extracted += maximum
            return original_stream(arguments, descriptors, environment, maximum, consume, monitor, **options)
        producer.stream_command = count_extraction
        producer.inspect_iso(descriptor, path, original, members, tools['isoinfo'], environment, lambda: None)
        assert extracted == artifact['memberBytes'], 'member extraction exceeded one complete 64MiB pass'
        producer.stream_command = original_stream
        original_query = producer.raw.run_bounded
        def substitute_namespace(arguments, *arguments_, **options):
            payload = original_query(arguments, *arguments_, **options)
            if '-J' not in arguments or '-l' not in arguments:
                return payload
            lines = payload.decode().splitlines(keepends=True)
            for offset, line in enumerate(lines):
                if line.endswith('  user-data \n'):
                    lines[offset] = re.sub(r'\[\s*([0-9]+) 00\]',
                        lambda match: '[     ' + str(int(match.group(1)) + 1) + ' 00]', line)
            return ''.join(lines).encode()
        producer.raw.run_bounded = substitute_namespace
        require_refusal(producer, lambda: producer.inspect_iso(descriptor, path, original, members,
            tools['isoinfo'], environment, lambda: None), 'seed-iso-alias')
        producer.raw.run_bounded = original_query
        changed = {name: dict(member) for name, member in members.items()}
        changed['user-data']['sha256'] = 'a' * 64
        require_refusal(producer, lambda: producer.inspect_iso(descriptor, path, original, changed,
            tools['isoinfo'], environment, lambda: None), 'seed-member-digest')
        changed['user-data']['bytes'] = 64 * 1024**2
        require_refusal(producer, lambda: producer.inspect_iso(descriptor, path, original, changed,
            tools['isoinfo'], environment, lambda: None), 'seed-member-bound')
        os.pwrite(descriptor, b'X', 32769)
        require_refusal(producer, lambda: producer.inspect_iso(descriptor, path, original, members,
            tools['isoinfo'], environment, lambda: None), 'seed-iso-pvd')
    print('verified pinned tools: tiny ISO, three namespaces, one exact member pass, alias/hash/bound/PVD refusals; no guest authority')


if __name__ == '__main__':
    main()
