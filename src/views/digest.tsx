import type { NightDigest } from '../digest/types.js';

export function DigestView({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p>event counts: ok: {digest.counts.ok} · retry: {digest.counts.retry} · fail: {digest.counts.fail}</p>
      <p>bad lines: {digest.badLines}</p>
      {digest.rows.length === 0 && <p>{digest.badLines === 0 ? 'nothing ran' : 'no valid entries'}</p>}
      <table>
        <thead><tr><th>job</th><th>owner</th><th>runs</th><th>retries</th><th>failures</th><th>last status</th><th>last recorded error</th><th>first at</th><th>last at</th></tr></thead>
        <tbody>
          {digest.rows.map((row) => (
            <tr>
              <td>{row.job}</td><td>{row.owner ?? '—'}</td><td>{row.runs}</td>
              <td>{row.retries >= 3 ? <span class="warn">{row.retries} · high retries</span> : row.retries}</td>
              <td>{row.failures > 0 ? <span class="warn">{row.failures} · historical fail</span> : row.failures}</td>
              <td>{row.lastStatus}</td><td>{row.lastError ?? '—'}</td><td>{row.firstAt}</td><td>{row.lastAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
