"""Linux supervisor checks with synthetic CLIs; no provider login or AI requests.

Run in Linux: python3 scripts/verify-wsl-helper.py packages/agent-adapters/src/wsl-helper.ts
The same helper source is embedded in the Windows package and sent to WSL python3.
"""
import http.server
import json
import os
import pathlib
import select
import subprocess
import sys
import tempfile
import threading
import time
import unittest

source = pathlib.Path(sys.argv.pop(1)).read_text(encoding='utf-8')
HELPER = source.split('String.raw`', 1)[1].rsplit('`;', 1)[0]


class WslHelperTests(unittest.TestCase):
    def start(self, code, **overrides):
        request = dict(executable=sys.executable, args=['-c', code], input='합성 질문', timeoutMs=5000)
        request.update(overrides)
        child = subprocess.Popen([sys.executable, '-u', '-c', HELPER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child.stdin.write((json.dumps(request) + '\n').encode())
        child.stdin.flush()
        def cleanup():
            if child.poll() is None:
                child.kill()
                child.wait(timeout=2)
            for pipe in (child.stdin, child.stdout, child.stderr):
                pipe.close()
        self.addCleanup(cleanup)
        return child

    def finish(self, child):
        # communicate() closes stdin, which deliberately means cancellation. Keep it open.
        events = []
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if select.select([child.stdout], [], [], 0.1)[0]:
                line = child.stdout.readline()
                if not line:
                    break
                events.append(json.loads(line))
        child.wait(timeout=2)
        stderr = child.stderr.read().decode()
        self.assertEqual(stderr, '')
        return events

    def test_unicode_paths_arguments_and_token(self):
        with tempfile.TemporaryDirectory(prefix='한글 공백-') as directory:
            child = self.start('import os,sys,json; print(json.dumps({"args":sys.argv[1:],"cwd":os.getcwd(),"prompt":sys.stdin.read(),"token":os.environ.get("TRIAGE_EVIDENCE_TOKEN")},ensure_ascii=False))', cwd=directory, token='synthetic-token', args=['-c', 'import os,sys,json; print(json.dumps({"args":sys.argv[1:],"cwd":os.getcwd(),"prompt":sys.stdin.read(),"token":os.environ.get("TRIAGE_EVIDENCE_TOKEN")},ensure_ascii=False))', '$(touch injected)', '한글 인수'])
            events = self.finish(child)
            result = json.loads(''.join(e['value'] for e in events if e['type'] == 'data'))
            self.assertEqual(result['cwd'], directory)
            self.assertEqual(result['args'], ['$(touch injected)', '한글 인수'])
            self.assertEqual(result['prompt'], '합성 질문')
            self.assertEqual(result['token'], 'synthetic-token')
            self.assertEqual(events[-1], dict(type='done', exitCode=0))

    def test_windows_paths_use_wslpath_for_cwd_and_file_arguments(self):
        with tempfile.TemporaryDirectory(prefix='wsl-path-') as directory:
            tool = pathlib.Path(directory) / 'wslpath'
            tool.write_text('#!' + sys.executable + '\nimport sys\nprint(' + repr(directory) + ' if sys.argv[-1].endswith("workspace") else ' + repr(directory + '/schema.json') + ')\n')
            tool.chmod(0o700)
            old = os.environ['PATH']
            os.environ['PATH'] = directory + os.pathsep + old
            try:
                child = self.start('import sys; print(sys.argv[-1])', cwd='C:\\workspace', args=['-c', 'import sys; print(sys.argv[-1])', 'C:\\schema.json'], pathIndexes=[2])
                events = self.finish(child)
                self.assertEqual(''.join(e['value'] for e in events if e['type'] == 'data').strip(), directory + '/schema.json')
                self.assertEqual(events[-1]['exitCode'], 0)
            finally:
                os.environ['PATH'] = old

    def test_cancellation_stops_agent_and_descendants(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = pathlib.Path(directory) / 'pids.json'
            code = 'import os,subprocess,sys,json,time; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]);open(' + repr(str(pidfile)) + ',"w").write(json.dumps([os.getpid(),p.pid]));time.sleep(60)'
            child = self.start(code)
            deadline = time.monotonic() + 5
            while not pidfile.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            pids = json.loads(pidfile.read_text())
            child.stdin.close()
            events = self.finish(child)
            self.assertIn(dict(type='error', code='CLI_CANCELLED'), events)
            for pid in pids:
                path = pathlib.Path('/proc') / str(pid) / 'stat'
                self.assertTrue(not path.exists() or path.read_text().split(') ', 1)[1].startswith('Z '))

    def test_timeout_and_missing_cli(self):
        self.assertIn(dict(type='error', code='CLI_CANCELLED'), self.finish(self.start('import time; time.sleep(60)', timeoutMs=1000)))
        self.assertIn(dict(type='error', code='WSL_AGENT_NOT_FOUND'), self.finish(self.start('', executable='/nonexistent/triage-cli')))

    def test_network_auth_probe_precedes_cli(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                ok = self.path == '/wsl-check' and self.headers.get('Authorization') == 'Bearer synthetic-token'
                self.send_response(200 if ok else 403)
                self.end_headers()
                self.wfile.write(b'{"ok":true}' if ok else b'no')
            def log_message(self, *_):
                pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = 'http://127.0.0.1:' + str(server.server_port) + '/wsl-check'
            events = self.finish(self.start('print("ok")', checkUrl=url, token='synthetic-token'))
            self.assertEqual(events[-1], dict(type='done', exitCode=0))
            events = self.finish(self.start('raise RuntimeError("must not run")', checkUrl=url, token='wrong'))
            self.assertEqual(events, [dict(type='error', code='WSL_NETWORK_UNAVAILABLE')])
        finally:
            server.shutdown()
            server.server_close()

    def test_parent_exit_cleans_background_children_and_output_limit(self):
        events = self.finish(self.start('import subprocess,sys; subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]); print("done")'))
        self.assertEqual(events[-1], dict(type='done', exitCode=0))
        events = self.finish(self.start('print("x" * (5 * 1024 * 1024))'))
        self.assertIn(dict(type='error', code='CLI_OUTPUT_TOO_LARGE'), events)


unittest.main()
