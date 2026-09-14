import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeQldFiresSnapshot,
  severityColor,
  QLD_FIRE_URL,
} from './model.js';
import { createQldFiresSource } from './source.js';

const SAMPLE_COLLECTION = {
  type: 'FeatureCollection',
  name: 'QFDWarnings',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [150.605948841, -23.3851139664, 0],
            [150.6063779944, -23.3710202841, 0],
            [150.5930265525, -23.3508400751, 0],
            [150.605948841, -23.3851139664, 0],
          ],
        ],
      },
      properties: {
        OBJECTID: 3495,
        UniqueID: 'WARN-550',
        WarningTitle: 'STAY INFORMED - Mount Archer (Rockhampton) - fire as at 3:23pm Sunday, 13 September 2026',
        WarningLevel: 'Advice',
        CallToAction: 'Stay Informed',
        WarningText: 'A fire is burning in the Mount Archer National Park.',
        ItemDateTimeLocal_ISO: '2026-09-13T15:23:00',
        PublishDateLocal_ISO: '2026-09-13T15:30:00',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [145.4, -16.9, 0] },
      properties: {
        OBJECTID: 3501,
        UniqueID: 'WARN-551',
        WarningTitle: 'BE PREPARED - pseudo example point',
        WarningLevel: 'Watch and Act',
        WarningText: '',
        ItemDateTimeLocal_ISO: '2026-09-13T10:00:00',
      },
    },
  ],
};

test('normalizeQldFiresSnapshot rejects non-FeatureCollection payloads', () => {
  assert.equal(normalizeQldFiresSnapshot(null), null);
  assert.equal(normalizeQldFiresSnapshot({ type: 'Feature' }), null);
  assert.equal(normalizeQldFiresSnapshot({ features: [] }), null);
});

test('normalizeQldFiresSnapshot maps polygons and points to display rows', () => {
  const rows = normalizeQldFiresSnapshot(SAMPLE_COLLECTION);
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  const polygonRow = rows.find((r) => r.kind === 'polygon');
  assert.ok(polygonRow);
  assert.equal(polygonRow.stableId, 'WARN-550');
  assert.equal(polygonRow.ring.length, 4);
  assert.equal(polygonRow.ring[0].length, 2); // altitude stripped
  const pointRow = rows.find((r) => r.kind === 'point');
  assert.ok(pointRow);
  assert.equal(pointRow.lat, -16.9);
  assert.equal(pointRow.lon, 145.4);
  assert.equal(pointRow.link, QLD_FIRE_URL);
});

test('normalizeQldFiresSnapshot maps warning levels to severities', () => {
  const rows = normalizeQldFiresSnapshot(SAMPLE_COLLECTION);
  assert.equal(rows.find((r) => r.stableId === 'WARN-550').severity, 'advice');
  assert.equal(rows.find((r) => r.stableId === 'WARN-551').severity, 'watch-and-act');
});

test('normalizeQldFiresSnapshot falls back to not-applicable for unknown levels', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [146.0, -20.0] },
        properties: { WarningTitle: 'Mystery', WarningLevel: 'Something New' },
      },
    ],
  };
  const rows = normalizeQldFiresSnapshot(payload);
  assert.equal(rows[0].severity, 'not-applicable');
  assert.ok(rows[0].stableId.startsWith('Mystery|')); // fallback id
});

test('normalizeQldFiresSnapshot reclassifies Information hazard-reduction burns', () => {
  const payload = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [152.9, -27.4] },
        properties: {
          UniqueID: 'WARN-900',
          WarningTitle: 'Planned burn - D-Aguilar National Park',
          WarningLevel: 'Information',
          WarningText: 'A planned hazard reduction burn is underway.',
        },
      },
    ],
  };
  const rows = normalizeQldFiresSnapshot(payload);
  assert.equal(rows[0].severity, 'planned-burn');
});

test('severityColor always returns RGBA components', () => {
  for (const severity of [
    'emergency-warning',
    'watch-and-act',
    'advice',
    'information',
    'preparation',
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

test('source throws on proxy failure and validates payload', async () => {
  const failing = createQldFiresSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => failing.getSnapshot(), /QLD fires proxy HTTP 503/);

  const malformed = createQldFiresSource({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ nope: true }) }),
  });
  await assert.rejects(() => malformed.getSnapshot(), /Malformed QLD fires/);

  const good = createQldFiresSource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => SAMPLE_COLLECTION,
    }),
  });
  const rows = await good.getSnapshot();
  assert.equal(rows.length, 2);
});
