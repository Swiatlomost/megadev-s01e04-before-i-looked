# Testing

The Vitest suite covers the digest reader, rendering, status and HTTP integration.
Run `pnpm test` and `pnpm typecheck` using the project's installed dependencies.

The browser acceptance test complements these with real navigation through the
status board and both example nights. It uses a real loopback-only Node server,
a fresh Chromium session and a test marker; it blocks external requests and
closes the browser and server on exit. The checked-in `runs/` examples must be
present and unchanged.

Requirements: Node.js and the project's installed dependencies, Python 3 with
Playwright for Python, and a Playwright-compatible Chromium installation with
its system libraries. Install these only according to your environment's policy.
Run from the repository root, providing a report path outside the repository:

```sh
python3 test/e2e.py --report /tmp/rig-e2e.json
```

The JSON report records the actual checks and any failure. This local test does
not verify a publicly hosted copy.
