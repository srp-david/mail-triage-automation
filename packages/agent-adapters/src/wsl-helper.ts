// The helper is passed as fixed python3 source, never composed with user shell text.
// Requests (including the short-lived evidence token) travel over stdin, not argv/files.
export const wslHelper=String.raw`
import codecs, json, os, pathlib, selectors, shutil, signal, subprocess, sys, time, urllib.request, urllib.parse

def emit(kind, **value):
    print(json.dumps(dict(type=kind, **value), ensure_ascii=True), flush=True)

def fail(code):
    emit('error', code=code)
    raise SystemExit(1)

def read_request():
    data = bytearray()
    while len(data) < 1048576:
        ch = os.read(0, 1)
        if not ch:
            fail('WSL_REQUEST_CLOSED')
        if ch == b'\n':
            return json.loads(data)
        data.extend(ch)
    fail('WSL_REQUEST_TOO_LARGE')

def linux_path(value):
    if value.startswith('/'):
        return value
    try:
        value = subprocess.check_output(['wslpath', '-u', value], stderr=subprocess.DEVNULL, timeout=5).decode().strip()
        if not value.startswith('/'):
            raise ValueError()
        return value
    except Exception:
        fail('WSL_PATH_UNAVAILABLE')

def evidence_check(url, token):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or parsed.path != '/wsl-check' or parsed.username or parsed.query:
        fail('WSL_NETWORK_UNAVAILABLE')
    try:
        # No proxies or redirects: a local probe must not disclose the token elsewhere.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token})
        with opener.open(req, timeout=5) as response:
            if response.status != 200 or response.read(100) != b'{"ok":true}':
                raise ValueError()
    except Exception:
        fail('WSL_NETWORK_UNAVAILABLE')

def main():
    request = read_request()
    if request.get('checkUrl'):
        evidence_check(request['checkUrl'], request.get('token', ''))
    cwd = linux_path(request['cwd']) if request.get('cwd') else str(pathlib.Path.home())
    if not os.path.isdir(cwd):
        fail('WSL_PATH_UNAVAILABLE')
    executable = request.get('executable', '')
    candidates = [executable] if executable.startswith('/') else [shutil.which(executable), str(pathlib.Path.home() / '.local/bin' / executable), str(pathlib.Path.home() / '.npm-global/bin' / executable)]
    executable = next((p for p in candidates if p and os.path.isfile(p) and os.access(p, os.X_OK)), None)
    if not executable:
        fail('WSL_AGENT_NOT_FOUND')
    args = list(request.get('args', []))
    for index in request.get('pathIndexes', []):
        args[index] = linux_path(args[index])
    env = dict(os.environ)
    env['PATH'] = str(pathlib.Path(executable).parent) + os.pathsep + env.get('PATH', '')
    if request.get('token'):
        env['TRIAGE_EVIDENCE_TOKEN'] = request['token']
    else:
        env.pop('TRIAGE_EVIDENCE_TOKEN', None)
    try:
        child = subprocess.Popen([executable] + args, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    except Exception:
        fail('WSL_AGENT_START_FAILED')
    def kill_group():
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    def interrupted(signum, frame):
        kill_group()
        raise SystemExit(1)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    selector = selectors.DefaultSelector()
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    size = 0
    deadline = time.monotonic() + max(1, min(request.get('timeoutMs', 10000) / 1000, 1800))
    try:
        prompt = request.get('input', '').encode('utf-8')
        # Keep control stdin separate from the child's prompt pipe. It remains open until
        # completion; EOF or any later byte means the Windows owner cancelled/disconnected.
        os.set_blocking(child.stdin.fileno(), False)
        selector.register(child.stdin, selectors.EVENT_WRITE, 'prompt')
        selector.register(0, selectors.EVENT_READ, 'control')
        selector.register(child.stdout, selectors.EVENT_READ, 'output')
        emit('ready')
        while True:
            if time.monotonic() >= deadline:
                kill_group()
                fail('CLI_CANCELLED')
            for key, _ in selector.select(0.1):
                if key.data == 'control':
                    os.read(0, 1024)
                    kill_group()
                    fail('CLI_CANCELLED')
                elif key.data == 'prompt':
                    try:
                        if prompt:
                            prompt = prompt[os.write(child.stdin.fileno(), prompt[:65536]):]
                    except BrokenPipeError:
                        prompt = b''
                    if not prompt:
                        selector.unregister(child.stdin)
                        child.stdin.close()
                else:
                    chunk = os.read(child.stdout.fileno(), 16384)
                    if not chunk:
                        selector.unregister(child.stdout)
                        tail = decoder.decode(b'', final=True)
                        if tail:
                            emit('data', value=tail)
                    else:
                        size += len(chunk)
                        if size > 4 * 1024 * 1024:
                            kill_group()
                            fail('CLI_OUTPUT_TOO_LARGE')
                        emit('data', value=decoder.decode(chunk))
            if child.poll() is not None:
                kill_group()
                if not any(k.data == 'output' for k in selector.get_map().values()):
                    emit('done', exitCode=child.returncode)
                    return
    finally:
        kill_group()
        child.wait(timeout=5)
        selector.close()

try:
    main()
except SystemExit:
    raise
except Exception:
    fail('WSL_HELPER_FAILED')
`;
