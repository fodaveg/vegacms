"""Bounded capture; never store command stderr or export raw failures."""
import os
import selectors
import subprocess
import time

def capture_process(command, input=None, timeout=20, limit=1024 * 1024, env=None, cwd=None):
    """Bound stdout/stderr while streaming; terminate only this child on limit/timeout."""
    process = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=cwd)
    selector = selectors.DefaultSelector()
    output, error_bytes, offset = bytearray(), 0, 0
    deadline = time.monotonic() + timeout
    try:
        for stream, label in ((process.stdout, 'out'), (process.stderr, 'err')):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, label)
        if input is not None:
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, 'in')
        while selector.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('CAPTURE_LIMIT_OR_TIMEOUT')
            for key, event in selector.select(min(remaining, 1)):
                if key.data == 'in':
                    try:
                        offset += os.write(key.fd, input[offset:offset + 32768])
                    except BrokenPipeError:
                        offset = len(input)
                    if offset == len(input):
                        selector.unregister(key.fileobj); key.fileobj.close()
                    continue
                chunk = os.read(key.fd, 32768)
                if not chunk:
                    selector.unregister(key.fileobj); key.fileobj.close()
                elif key.data == 'out':
                    if len(output) + len(chunk) > limit:
                        raise RuntimeError('CAPTURE_LIMIT_OR_TIMEOUT')
                    output.extend(chunk)
                else:
                    error_bytes += len(chunk)
                    if error_bytes > 128 * 1024:
                        raise RuntimeError('CAPTURE_LIMIT_OR_TIMEOUT')
                    # Raw stderr is drained and discarded, never stored or projected.
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('CAPTURE_LIMIT_OR_TIMEOUT')
        try:
            exit_code = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            raise RuntimeError('CAPTURE_LIMIT_OR_TIMEOUT') from None
        return subprocess.CompletedProcess(command, exit_code, bytes(output), b'')
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                stream.close()
