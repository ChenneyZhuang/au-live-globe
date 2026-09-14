/**
 * Queensland Fire Department bushfire warning feed normalisation.
 *
 * Upstream (served from data.qld.gov.au dataset
 * `queensland-fire-and-rescue-current-bushfire-incidents`, CC BY 4.0 —
 * attribution required; the layer registers its credit at init):
 * https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json
 *
 * The feed is a GeoJSON FeatureCollection of QFD warning areas:
 * - `geometry` is a plain Polygon (advice/alert areas) or Point (watch spots).
 * - `properties.WarningLevel` carries the alert level ("Emergency Warning",
 *   "Watch and Act", "Advice", "Information", "Preparation ...", ...).
 * - `properties.UniqueID` is the stable per-warning id (e.g. "WARN-550").
 * - `properties.ItemDateTimeLocal_ISO` / `PublishDateLocal_ISO` are ISO-8601
 *   local timestamps.
 *
 * The upstream S3 origin sends no CORS headers, so the browser cannot fetch
 * it directly — the layer reads through the `/api/qld-fires` proxy (dev:
 * vite middleware; production: Cloudflare Pages Function), which mirrors
 * the /api/firms proxy pattern already used for the keyless FIRMS layer.
 */

export const QLD_FIRES_OVERLAY_SOURCE_ID = 'qld-fires';

/** Official Queensland fire information page (verified reachable). */
export const QLD_FIRE_URL = 'https://www.fire.qld.gov.au/';

const SEVERITY_BY_LEVEL = new Map([
  ['emergency warning', 'emergency-warning'],
  ['watch and act', 'watch-and-act'],
  ['advice', 'advice'],
  ['information', 'information'],
  ['preparation', 'preparation'],
  ['prepared', 'preparation'],
]);

/** Display colors per severity, as Cesium.Color constructor components. */
export const SEVERITY_COLORS = {
  'emergency-warning': { red: 1.0, green: 0.1, blue: 0.1, alpha: 0.5 },
  'watch-and-act': { red: 1.0, green: 0.55, blue: 0.0, alpha: 0.5 },
  'advice': { red: 1.0, green: 0.9, blue: 0.2, alpha: 0.5 },
  'information': { red: 0.55, green: 0.75, blue: 1.0, alpha: 0.45 },
  'preparation': { red: 0.4, green: 0.8, blue: 0.55, alpha: 0.45 },
  'not-applicable': { red: 0.7, green: 0.7, blue: 0.7, alpha: 0.5 },
};

const SEVERITY_PIXEL_SIZE = {
  'emergency-warning': 14,
  'watch-and-act': 12,
  'advice': 10,
  'information': 8,
  'preparation': 8,
  'not-applicable': 8,
};

export function severityColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS['not-applicable'];
}

export function severityPixelSize(severity) {
  return SEVERITY_PIXEL_SIZE[severity] || SEVERITY_PIXEL_SIZE['not-applicable'];
}

/** True when the warning text marks a tested/regular hazard reduction. */
function isHazardReduction(title, text) {
  const haystack = `${title} ${text}`.toLowerCase();
  return /hazard reduction|prescribed burn|planned burn/.test(haystack);
}

/** Collect polygon rings from a plain GeoJSON geometry. */
function collectGeometries(geometry, out) {
  if (!geometry || typeof geometry.type !== 'string') return;
  switch (geometry.type) {
    case 'Point':
      out.points.push(geometry.coordinates);
      break;
    case 'MultiPoint':
      for (const coords of geometry.coordinates || []) out.points.push(coords);
      break;
    case 'Polygon':
      if (Array.isArray(geometry.coordinates?.[0])) out.polygons.push(geometry.coordinates);
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates || []) {
        if (Array.isArray(polygon?.[0])) out.polygons.push(polygon);
      }
      break;
    default:
      break; // LineString et al. carry no warning-area meaning for v1.
  }
}

/**
 * Validate and normalise a complete QFD snapshot before it can replace
 * displayed warnings. Returns an array of display rows, or `null` when the
 * payload is not a FeatureCollection.
 */
export function normalizeQldFiresSnapshot(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    return null;
  }
  const rows = [];
  for (const feature of payload.features) {
    const props = feature?.properties || {};
    const title = typeof props.WarningTitle === 'string' && props.WarningTitle
      ? props.WarningTitle
      : 'Untitled warning';
    const level = typeof props.WarningLevel === 'string' ? props.WarningLevel.trim() : '';
    const text = typeof props.WarningText === 'string' ? props.WarningText : '';
    const normalizedLevel = level.toLowerCase();
    let severity = SEVERITY_BY_LEVEL.get(normalizedLevel) || 'not-applicable';
    // QFD marks regular burns with an "Information" level and burn wording.
    if (severity === 'information' && isHazardReduction(title, text)) {
      severity = 'planned-burn';
    }
    const uniqueId = typeof props.UniqueID === 'string' ? props.UniqueID : '';
    const stableId = uniqueId || `${title}|${props.PublishDateLocal_ISO || ''}`;
    const updatedIso =
      props.ItemDateTimeLocal_ISO || props.PublishDateLocal_ISO || '';
    const geometries = { points: [], polygons: [] };
    collectGeometries(feature?.geometry, geometries);
    for (const coords of geometries.points) {
      const lon = coords?.[0];
      const lat = coords?.[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      rows.push({
        kind: 'point',
        stableId,
        title,
        category: level,
        severity,
        updatedIso,
        link: QLD_FIRE_URL,
        description: text,
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
        category: level,
        severity,
        updatedIso,
        link: QLD_FIRE_URL,
        description: text,
        ring: ring.map(([lon, lat]) => [lon, lat]),
      });
    }
  }
  return rows;
}

/** One-line warning summary for the entity info box (bilingual labels). */
export function incidentDescription(row) {
  const link = row.link
    ? `<p><a href="${row.link}" target="_blank" rel="noopener">Queensland Fire Department</a></p>`
    : '';
  return [
    `<h3>${row.title}</h3>`,
    `<p><strong>Level 等级:</strong> ${row.category || '—'}</p>`,
    row.updatedIso ? `<p><strong>Updated 更新:</strong> ${row.updatedIso}</p>` : '',
    row.description ? `<p>${row.description}</p>` : '',
    link,
  ]
    .filter(Boolean)
    .join('\n');
}
