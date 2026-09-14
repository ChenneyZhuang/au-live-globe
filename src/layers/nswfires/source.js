import { normalizeNswFiresSnapshot } from './model.js';

const API_URL = 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json';

/**
 * Request and validate a complete NSW RFS snapshot before it can replace
 * displayed incidents. The upstream serves `Access-Control-Allow-Origin: *`,
 * so the browser fetches directly — no server proxy involved.
 */
export function createNswFiresSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(API_URL, { signal });
      if (!response.ok) throw new Error(`NSW RFS HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      const rows = normalizeNswFiresSnapshot(payload);
      if (!rows) throw new Error('Malformed NSW RFS response');
      return rows;
    },
  };
}
