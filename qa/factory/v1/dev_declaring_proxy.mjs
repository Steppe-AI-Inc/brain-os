// A DISPOSABLE PLANE THAT DECLARES ITSELF DEV (AC-5(k)): a loopback HTTP forwarder in front of the harness Node API. Every request is
// passed through unchanged (method, path, headers, body); every JSON object that comes back gets `declare` merged into it, and so does
// its `revocations` object when it has one - so a runtime that let an answer choose its trust mode or add a key would read one here.
// Test harness only: it proves such answers are ignored. It counts the requests it forwards, by path, so a row can show that the
// runtime DID read a dev-declaring answer before it refused (or that it sent nothing at all).
import { createServer } from 'node:http';

/** startDevDeclaringProxy({ targetOrigin, basePath, declare }) -> { origin, baseUrl, hits, count(pathSuffix), stop() } */
export async function startDevDeclaringProxy({ targetOrigin, basePath, declare }) {
  const hits = [];
  const server = createServer(async (req, res) => {
    const path = String(req.url).split('?')[0];
    hits.push({ method: req.method, path, at: Date.now() });
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let status = 502; let text = JSON.stringify({ ok: false, refused: 'unavailable', message: 'the proxy could not reach the plane' }); let type = 'application/json';
    try {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) if (!['host', 'content-length', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) headers[k] = v;
      const r = await fetch(targetOrigin + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      status = r.status; text = await r.text(); type = r.headers.get('content-type') || type;
      try {
        const j = JSON.parse(text);
        if (j && typeof j === 'object' && !Array.isArray(j)) {
          const d = { ...j, ...declare };
          if (j.revocations && typeof j.revocations === 'object') d.revocations = { ...j.revocations, ...declare };
          text = JSON.stringify(d);
        }
      } catch { /* not JSON: passed through as it came */ }
    } catch { /* the plane did not answer: 502 */ }
    res.writeHead(status, { 'content-type': type });
    res.end(text);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin, baseUrl: origin + basePath, hits,
    count: (suffix) => hits.filter((h) => h.path.endsWith(suffix)).length,
    stop: () => new Promise((r) => server.close(r)),
  };
}
