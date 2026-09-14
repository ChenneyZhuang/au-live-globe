/**
 * Queensland Fire Department bushfire warning proxy with a small memory cache.
 * Upstream (no CORS headers, hence the proxy):
 * https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json
 *
 * The feed regenerates every 30 minutes upstream; a 10 minute TTL keeps
 * refreshes tight without hammering the origin. Single-flight refresh and
 * serve-stale-on-failure mirror the firmsProxy pattern.
 *
 * Route:
 *   GET /api/qld-fires → the upstream FeatureCollection, passed through as-is
 *
 * The production equivalent lives in functions/api/qld-fires.js (Cloudflare
 * Pages Function) so the static deployment keeps the same browser path.
 *
 * @returns {import('vite').Plugin}
 */
export function qldFiresProxy() {
  const TTL_MS = 10 * 60_000;
  const UPSTREAM_URL =
    'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json';

  /** @type {?{at: number, body: string}} */
  let mem = null;
  /** @type {?Promise<?{at: number, body: string}>} single-flight refresh */
  let inflight = null;

  async function refreshUpstream() {
    const res = await fetch(UPSTREAM_URL, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    const body = await res.text();
    // Validate before caching: never serve a non-GeoJSON error page onward.
    const parsed = JSON.parse(body);
    if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      throw new Error('upstream payload is not a FeatureCollection');
    }
    return { at: Date.now(), body };
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/qld-fires', async (_req, res) => {
      const sendJson = (status, obj) => {
        if (res.headersSent) return;
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(obj));
      };
      try {
        if (mem && Date.now() - mem.at < TTL_MS) {
          sendJson(200, JSON.parse(mem.body));
          return;
        }
        if (!inflight) {
          inflight = refreshUpstream()
            .then((fresh) => {
              mem = fresh;
              return fresh;
            })
            .catch((err) => {
              console.warn(
                `[qld-fires-proxy] refresh failed (${err?.message || err}) — serving cache if any`,
              );
              return null;
            })
            .finally(() => {
              inflight = null;
            });
        }
        const pending = inflight;
        const fresh = await pending;
        if (fresh) {
          sendJson(200, JSON.parse(fresh.body));
        } else if (mem) {
          sendJson(200, JSON.parse(mem.body)); // upstream down — stale beats empty
        } else {
          sendJson(502, { error: 'qld fires fetch failed and no cache available' });
        }
      } catch (err) {
        console.warn('[qld-fires-proxy] error:', err?.message || err);
        sendJson(500, { error: 'qld fires proxy error' });
      }
    });
  };
  return {
    name: 'qld-fires-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
