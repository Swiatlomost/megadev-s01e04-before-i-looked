import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/read-night.js';
import { lane } from '../lane.js';
import { DigestView } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));
    if (result.kind === 'ok') {
      return c.html(<Layout title="digest" lane={lane()}><DigestView digest={result.digest} /></Layout>);
    }
    const error = result.kind === 'invalid-night' ? { status: 400, message: 'Invalid night.' } as const
      : result.kind === 'not-found' ? { status: 404, message: 'Night not found.' } as const
        : { status: 500, message: 'Unable to read night.' } as const;
    return c.html(<Layout title="digest" lane={lane()}><h1>digest</h1><p>{error.message}</p></Layout>, error.status);
  });
}
