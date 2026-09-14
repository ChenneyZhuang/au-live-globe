import { normalizeQldFiresSnapshot } from './model.js';

/**
 * The dev/prod server proxies the upstream S3 feed at `/api/qld-fires`
 * because the origin sends no CORS headers (pattern matches /api/firms).
 * Allow an absolute override for QA harnesses.
 */
const PROXY_URL = '/api/qld-fires';

/**
 * Request and validate a complete QFD snapshot before it can replace
 * displayed warnings. Throws on transport failure or malformed payloads;
 * the layer turns that into its status line rather than rendering garbage.
 */
export function createQldFiresSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  url = PROXY_URL,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, { signal });
      if (!response.ok) throw new Error(`QLD fires proxy HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeQldFiresSnapshot(payload);
      if (!rows) throw new Error('Malformed QLD fires response');
      return rows;
    },
  };
}
