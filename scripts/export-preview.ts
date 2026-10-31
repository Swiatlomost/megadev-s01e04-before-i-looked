import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out-dir' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: export-preview --out-dir <directory>');
  }
  const response = await createApp(loadConfig()).request('/digest/2026-10-28');
  if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
    throw new Error('Digest did not return an HTML success response');
  }
  const html = await response.text();
  if (!html.trim() || !/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error('Digest returned invalid HTML');
  }
  await mkdir(args[1], { recursive: true });
  await writeFile(join(args[1], 'index.html'), html, 'utf8');
}

main().catch(() => {
  // Do not print response bodies, configuration, paths or marker values.
  console.error('Preview export failed. Check arguments and digest availability.');
  process.exitCode = 1;
});
