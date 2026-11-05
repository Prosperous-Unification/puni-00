/** Model the pinned provider's import-time FD inventory inside logical fixtures only.
 * libffi may retain a read-only trampoline FD to a built-in interpreter or its shared library.
 * Resolve the actual _ctypes libffi symbol's executable mapping, never a filename allowlist.
 * Validate every addition before closing any; retain preexisting and refuse unrelated FDs.
 * This neither admits host Python3.14 as a provider nor relaxes production FD checks.
 * Proof: startup runtime/mapped-other/lookalike controls fail when runtime identity is
 * omitted or its identity check is removed; missing/unreadable maps throw.
 * The nonexecuting-map control fails when the executable-mapping predicate is removed.
 * Existing interpreter/foreign/writable/path controls preserve the access boundary.
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
def fixture_runtime_identity():
    import ctypes,_ctypes
    module_path=getattr(_ctypes,'__file__',None)
    if module_path is None:
        executable=os.stat('/proc/self/exe')
        return executable.st_dev,executable.st_ino
    address=ctypes.cast(ctypes.CDLL(module_path).ffi_closure_alloc,ctypes.c_void_p).value
    with open('/proc/self/maps') as mappings:
        for mapping in mappings:
            bounds,permissions,offset,device,inode,*path=mapping.split(None,5)
            start,end=(int(part,16) for part in bounds.split('-'))
            # Proof: nonexecuting-map closes a forbidden FD when this execute check is removed.
            if start<=address<end and 'x' in permissions:
                major,minor=(int(part,16) for part in device.split(':'))
                return os.makedev(major,minor),int(inode)
    # Proof: missing-map and unreadable-map controls preserve the added FD on refusal.
    raise AssertionError('fixture-import-runtime')
def complete_provider_import(before):
    executable=os.stat('/proc/self/exe')
    identities={(executable.st_dev,executable.st_ino),fixture_runtime_identity()}
    added=fixture_descriptors()-before
    for descriptor in added:
        opened=os.fstat(descriptor);flags=fcntl.fcntl(descriptor,fcntl.F_GETFL)
        assert flags&os.O_ACCMODE==os.O_RDONLY and not flags&os.O_PATH,'fixture-import-access'
        # Proof: mapped-other/lookalike close foreign FDs if the identity predicate is removed.
        assert stat.S_ISREG(opened.st_mode) and (opened.st_dev,opened.st_ino) in identities,'fixture-import-identity'
    for descriptor in added:os.close(descriptor)
fixture_import_descriptors=fixture_descriptors()
`;
