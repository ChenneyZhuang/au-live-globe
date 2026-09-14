import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNswFiresSnapshot, severityColor } from './model.js';
import { createNswFiresSource } from './source.js';

const SAMPLE_COLLECTION = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [151.2, -33.8] },
          {
            type: 'Polygon',
            coordinates: [
              [
                [151.2, -33.8],
                [151.3, -33.8],
                [151.3, -33.9],
                [151.2, -33.8],
              ],
            ],
          },
        ],
      },
      properties: {
        title: 'Test Incident',
        link: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
        category: 'Emergency Warning',
        guid: 'https://incidents.rfs.nsw.gov.au/api/v1/incidents/676231',
        guid_isPermaLink: 'true',
        pubDate: '14/09/2026 3:34:00 AM',
        description: 'A test fire.',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [150.0, -35.5] },
      properties: {
        title: 'Planned Burn',
        category: 'Planned Burn',
        guid: 'https://incidents.rfs.nsw.gov.au/api/v1/incidents/676999',
        pubDate: '14/09/2026 5:00:00 AM',
        description: '',
      },
    },
  ],
};

test('normalizeNswFiresSnapshot rejects non-FeatureCollection payloads', () => {
  assert.equal(normalizeNswFiresSnapshot(null), null);
  assert.equal(normalizeNswFiresSnapshot({ type: 'Feature' }), null);
  assert.equal(normalizeNswFiresSnapshot({ features: [] }), null);
});

test('normalizeNswFiresSnapshot expands GeometryCollection into point + polygon rows', () => {
  const rows = normalizeNswFiresSnapshot(SAMPLE_COLLECTION);
  assert.ok(Array.isArray(rows));
  // First incident: 1 point + 1 polygon; second: 1 point.
  assert.equal(rows.length, 3);
  const pointRow = rows.find((r) => r.stableId === '676231' && r.kind === 'point');
  assert.ok(pointRow);
  assert.equal(pointRow.lat, -33.8);
  assert.equal(pointRow.lon, 151.2);
  const polygonRow = rows.find((r) => r.stableId === '676231' && r.kind === 'polygon');
  assert.ok(polygonRow);
  assert.equal(polygonRow.ring.length, 4);
});

test('normalizeNswFiresSnapshot maps categories to severities', () => {
  const rows = normalizeNswFiresSnapshot(SAMPLE_COLLECTION);
  const warning = rows.find((r) => r.title === 'Test Incident');
  assert.equal(warning.severity, 'emergency-warning');
  const burn = rows.find((r) => r.title === 'Planned Burn');
  assert.equal(burn.severity, 'planned-burn');
});

test('normalizeNswFiresSnapshot falls back to not-applicable for unknown categories', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [149.0, -35.0] },
        properties: { title: 'Mystery', category: 'Something New' },
      },
    ],
  };
  const rows = normalizeNswFiresSnapshot(payload);
  assert.equal(rows[0].severity, 'not-applicable');
});

test('severityColor always returns RGBA components', () => {
  for (const severity of [
    'emergency-warning',
    'watch-and-act',
    'advice',
    'planned-burn',
    'not-applicable',
    'bogus',
  ]) {
    const c = severityColor(severity);
    assert.equal(typeof c.red, 'number');
    assert.equal(typeof c.green, 'number');
    assert.equal(typeof c.blue, 'number');
    assert.equal(typeof c.alpha, 'number');
  }
});

test('source throws on upstream failure and validates payload', async () => {
  const failing = createNswFiresSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => failing.getSnapshot(), /NSW RFS HTTP 503/);

  const malformed = createNswFiresSource({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) }),
  });
  await assert.rejects(() => malformed.getSnapshot(), /Malformed NSW RFS/);

  const good = createNswFiresSource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => SAMPLE_COLLECTION,
    }),
  });
  const rows = await good.getSnapshot();
  assert.equal(rows.length, 3);
});
