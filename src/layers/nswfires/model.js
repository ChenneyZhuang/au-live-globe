/**
 * NSW RFS majorIncidents normalisation.
 *
 * Upstream: https://www.rfs.nsw.gov.au/feeds/majorIncidents.json
 * (Transport for NSW / NSW Rural Fire Service open data, CC BY 4.0 —
 * attribution required; the layer registers its credit at init.)
 *
 * The feed is a GeoJSON FeatureCollection whose `geometry` values are nested
 * `GeometryCollection`s (points for the incident origin, polygons for the
 * affected area). `properties.category` carries the alert level.
 */

export const NSW_FIRES_OVERLAY_SOURCE_ID = 'nsw-fires';

const SEVERITY_BY_CATEGORY = new Map([
  ['emergency warning', 'emergency-warning'],
  ['watch and act', 'watch-and-act'],
  ['advice', 'advice'],
  ['planned burn', 'planned-burn'],
  ['not applicable', 'not-applicable'],
]);

/** Display colors per severity, as Cesium.Color constructor components. */
export const SEVERITY_COLORS = {
  'emergency-warning': { red: 1.0, green: 0.1, blue: 0.1, alpha: 0.5 },
  'watch-and-act': { red: 1.0, green: 0.55, blue: 0.0, alpha: 0.5 },
  'advice': { red: 1.0, green: 0.9, blue: 0.2, alpha: 0.5 },
  'planned-burn': { red: 0.55, green: 0.4, blue: 0.95, alpha: 0.5 },
  'not-applicable': { red: 0.7, green: 0.7, blue: 0.7, alpha: 0.5 },
};

const SEVERITY_PIXEL_SIZE = {
  'emergency-warning': 14,
  'watch-and-act': 12,
  'advice': 10,
  'planned-burn': 9,
  'not-applicable': 8,
};

export function severityColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS['not-applicable'];
}

export function severityPixelSize(severity) {
  return SEVERITY_PIXEL_SIZE[severity] || SEVERITY_PIXEL_SIZE['not-applicable'];
}

/** Stable per-incident id from the guid URL (`…/incidents/676231` → `676231`). */
function stableIdFromGuid(guid, fallback) {
  const match = typeof guid === 'string' ? guid.match(/\/incidents\/(\d+)/) : null;
  return match ? match[1] : fallback;
}

function collectGeometries(geometry, out) {
  if (!geometry || typeof geometry.type !== 'string') return;
  switch (geometry.type) {
    case 'GeometryCollection':
      for (const nested of geometry.geometries || []) collectGeometries(nested, out);
      break;
    case 'Point':
      out.points.push(geometry.coordinates);
      break;
    case 'MultiPoint':
      for (const coords of geometry.coordinates || []) out.points.push(coords);
      break;
    case 'Polygon':
      out.polygons.push(geometry.coordinates);
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates || []) out.polygons.push(polygon);
      break;
    default:
      break; // LineString et al. carry no fire-area meaning for v1.
  }
}

/**
 * Validate and normalise a complete RFS snapshot before it can replace
 * displayed incidents. Returns an array of display rows, or `null` when the
 * payload is not a FeatureCollection.
 */
export function normalizeNswFiresSnapshot(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    return null;
  }
  const rows = [];
  for (const feature of payload.features) {
    const props = feature?.properties || {};
    const title = typeof props.title === 'string' ? props.title : 'Untitled incident';
    const category = typeof props.category === 'string' ? props.category : '';
    const severity = SEVERITY_BY_CATEGORY.get(category.toLowerCase()) || 'not-applicable';
    const stableId = stableIdFromGuid(props.guid, `${title}|${props.pubDate || ''}`);
    const geometries = { points: [], polygons: [] };
    collectGeometries(feature?.geometry, geometries);
    for (const [lon, lat] of geometries.points) {
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      rows.push({
        kind: 'point',
        stableId,
        title,
        category,
        severity,
        pubDate: props.pubDate || '',
        link: props.link || '',
        description: props.description || '',
        lat,
        lon,
      });
    }
    for (const polygon of geometries.polygons) {
      const ring = Array.isArray(polygon?.[0]) ? polygon[0] : null;
      if (!ring || ring.length < 3) continue;
      rows.push({
        kind: 'polygon',
        stableId,
        title,
        category,
        severity,
        pubDate: props.pubDate || '',
        link: props.link || '',
        description: props.description || '',
        ring,
      });
    }
  }
  return rows;
}

/** One-line incident summary for the entity info box (bilingual labels). */
export function incidentDescription(row) {
  const link = row.link
    ? `<p><a href="${row.link}" target="_blank" rel="noopener">Fires Near Me 火灾地图</a></p>`
    : '';
  return [
    `<h3>${row.title}</h3>`,
    `<p><strong>Level 等级:</strong> ${row.category || '—'}</p>`,
    row.pubDate ? `<p><strong>Updated 更新:</strong> ${row.pubDate}</p>` : '',
    row.description ? `<p>${row.description}</p>` : '',
    link,
  ]
    .filter(Boolean)
    .join('\n');
}
