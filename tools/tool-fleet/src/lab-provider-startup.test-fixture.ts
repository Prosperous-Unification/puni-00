/** Model the pinned provider's import-time FD inventory inside logical fixtures only.
 * Observed unsupported CPython3.14 `_ctypes` opens a read-only FD to its executable;
 * CPython3.12 does not. Close only that import-owned descriptor before worker faults.
 * This neither admits host Python3.14 as a provider nor relaxes production FD checks.
 * Proof: startup interpreter/foreign/writable/path controls failed against the no-op helper;
 * the real3.14 raw/seed workers reject the `_ctypes` FD when this cleanup is absent.
 */
export const providerStartup = String.raw`
import errno,fcntl,os,stat,sys
def fixture_descriptors():
    directory=os.open('/proc/self/fd',os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    try:
        descriptors=set()
        for name in os.listdir(directory):
            descriptor=int(name)
            if descriptor==directory:continue
            try:os.fstat(descriptor)
            except OSError as failure:
                if failure.errno!=errno.EBADF:raise
                continue
            descriptors.add(descriptor)
        return descriptors
    finally:os.close(directory)
def complete_provider_import(before):
    executable=os.stat('/proc/self/exe')
    added=fixture_descriptors()-before
    for descriptor in added:
        opened=os.fstat(descriptor);flags=fcntl.fcntl(descriptor,fcntl.F_GETFL)
        assert flags&os.O_ACCMODE==os.O_RDONLY and not flags&os.O_PATH,'fixture-import-access'
        assert stat.S_ISREG(opened.st_mode) and (opened.st_dev,opened.st_ino)==(executable.st_dev,executable.st_ino),'fixture-import-identity'
    for descriptor in added:os.close(descriptor)
fixture_import_descriptors=fixture_descriptors()
`;
