#!/usr/bin/env python3
"""Browser acceptance against the real local server and the checked-in example nights."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
MARKER = 'E2E-TEST-MARKER'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    result = {'status': 'fail', 'checks': [], 'external_requests': [], 'browser_errors': []}
    server = None
    browser = None
    try:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        origin = f'http://127.0.0.1:{port}'
        env = {'PATH': os.environ.get('PATH', ''), 'HOME': os.environ.get('HOME', ''),
               'PORT': str(port), 'LANE_MARKER': MARKER}
        server = subprocess.Popen(['node', 'node_modules/tsx/dist/cli.mjs', 'src/server.ts'],
                                  cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError(f'server exited with {server.returncode}')
            try:
                with urllib.request.urlopen(origin, timeout=0.2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError('server did not become ready')
        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch()
                page = browser.new_page()
                page.on('pageerror', lambda error: result['browser_errors'].append(str(error)))
                page.on('console', lambda msg: result['browser_errors'].append(msg.text) if msg.type == 'error' else None)
                def route_request(route):
                    url = urlsplit(route.request.url)
                    if (url.scheme, url.hostname, url.port) != ('http', '127.0.0.1', port):
                        result['external_requests'].append(route.request.url)
                        route.abort()
                    else:
                        route.continue_()
                page.route('**/*', route_request)
                def check(condition, description):
                    if not condition:
                        raise AssertionError(description)
                    result['checks'].append(description)
                def common():
                    check(page.locator('header .marker').inner_text() == MARKER, 'test marker visible')
                    check(page.locator('script').count() == 0, 'no client scripts')
                page.goto(origin, wait_until='networkidle')
                common()
                check(page.locator('h1').inner_text() == 'status', 'status board')
                items = page.locator('main li')
                check(items.count() == 2, 'two nights listed')
                check('2026-10-28' in items.nth(0).inner_text() and 'ok: 10 · retry: 4 · fail: 1' in items.nth(0).inner_text(), 'newer night event counts')
                check('2026-10-27' in items.nth(1).inner_text() and 'ok: 7 · retry: 0 · fail: 0' in items.nth(1).inner_text(), 'older night event counts')
                for night in ('2026-10-28', '2026-10-27'):
                    page.get_by_role('link', name=night, exact=True).click()
                    check(page.url == f'{origin}/digest/{night}', f'clicked {night}')
                    common()
                    check(page.locator('h1').inner_text() == f'digest · {night}', f'heading {night}')
                    check(page.locator('thead th').all_inner_texts() == ['job', 'owner', 'runs', 'retries', 'failures', 'last status', 'last recorded error', 'first at', 'last at'], f'columns {night}')
                    rows = page.locator('tbody tr')
                    data = [r.locator('td').all_inner_texts() for r in rows.all()]
                    if night == '2026-10-28':
                        check(len(data) == 5 and 'bad lines: 1' in page.locator('main').inner_text(), 'newer rows and bad line')
                        check(data[0][0:7] == ['digest/render', '—', '1', '0', '0', 'ok', '—'], 'null owner')
                        check(data[1] == ['fixtures/refresh', 'rook', '4', '3 · high retries', '0', 'ok', 'upstream 503', '2026-10-29T01:30:00+01:00', '2026-10-29T01:37:00+01:00'], 'retry warning and retained upstream error after success')
                        check(rows.nth(1).locator('td').nth(3).locator('.warn').count() == 1, 'retry warning highlighted')
                        check(data[3][0:7] == ['notes/backup', 'lane-07', '1', '0', '1 · historical fail', 'fail', 'quota exceeded'], 'historical failure')
                        check(rows.nth(3).locator('td').nth(4).locator('.warn').count() == 1, 'failure warning highlighted')
                    else:
                        check(len(data) == 4 and 'bad lines: 0' in page.locator('main').inner_text(), 'older rows and bad line count')
                        check(data[0][0:7] == ['fixtures/refresh', 'rook', '1', '0', '0', 'ok', '—'], 'older night data')
                    page.go_back(wait_until='networkidle')
                check(not result['external_requests'], 'no external requests')
                check(not result['browser_errors'], 'no browser errors')
                result['status'] = 'pass'
            finally:
                if browser is not None:
                    browser.close()
    except Exception as error:
        result['error'] = f'{type(error).__name__}: {error}'
    finally:
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    raise SystemExit(main())
