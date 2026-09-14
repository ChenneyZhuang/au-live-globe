import * as Cesium from 'cesium';
import {
  QLD_FIRES_OVERLAY_SOURCE_ID,
  incidentDescription,
  severityColor,
  severityPixelSize,
} from './model.js';

export * from './model.js';
export { createQldFiresSource } from './source.js';

const SEVERITY_OUTLINE = {
  'emergency-warning': Cesium.Color.RED.withAlpha(1.0),
  'watch-and-act': Cesium.Color.ORANGE.withAlpha(1.0),
  'advice': Cesium.Color.YELLOW.withAlpha(0.95),
  'information': Cesium.Color.fromCssColorString('#8cd0ff').withAlpha(0.95),
  'preparation': Cesium.Color.fromCssColorString('#66cc8f').withAlpha(0.95),
  'planned-burn': Cesium.Color.fromCssColorString('#8c6bff').withAlpha(0.95),
  'not-applicable': Cesium.Color.GRAY.withAlpha(0.95),
};

/** Own one QLD fire display and its refresh lifecycle. */
export function createQldFiresLayer({ source, credits } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('QLD fires require a snapshot source');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  const layer = {
    id: 'qld-fires',
    // Bilingual row label: the original panel is English-only; new AU layers
    // carry a Chinese gloss for the bilingual audience.
    name: 'QLD Fires (QFD) 昆州火警',
    icon: '🔥',
    source: 'Queensland Fire Department',
    updateInterval: 600000,

    init(viewer) {
      if (_viewer) throw new Error('QLD fires layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('qld-fires');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      credits?.register?.(viewer, credits.credit);
      console.log('[Data:QLDFires] Initialized');
    },

    enable(viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
    },

    disable(viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
    },

    async update(viewer) {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;

        _dataSource.entities.removeAll();
        let count = 0;
        for (const row of rows) {
          const color = severityColor(row.severity);
          const fill = new Cesium.Color(color.red, color.green, color.blue, color.alpha);
          const outline = SEVERITY_OUTLINE[row.severity] || SEVERITY_OUTLINE['not-applicable'];
          const entityId = `qld-fire:${row.stableId}:${row.kind}:${count}`;
          const common = {
            id: entityId,
            description: incidentDescription(row),
          };
          if (row.kind === 'point') {
            _dataSource.entities.add({
              ...common,
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              point: {
                pixelSize: severityPixelSize(row.severity),
                color: fill,
                outline: true,
                outlineColor: outline,
                outlineWidth: 1.5,
              },
              label: {
                text: row.title,
                font: '12px sans-serif',
                fillColor: Cesium.Color.WHITE,
                showBackground: true,
                backgroundColor: Cesium.Color.fromCssColorString('#1b1b1b').withAlpha(0.72),
                pixelOffset: new Cesium.Cartesian2(0, -16),
                scale: 0.92,
                // Points stay visible at cruise altitude; text labels only
                // appear once the camera is close enough to read them.
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_000_000),
              },
            });
          } else {
            _dataSource.entities.add({
              ...common,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(
                  row.ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
                ),
                material: fill,
                outline: true,
                outlineColor: outline,
              },
            });
          }
          count++;
        }
        _count = count;
        _lastUpdate = Date.now();
        _lastError = null;
        console.log(`[Data:QLDFires] Updated: ${count} display shapes`);
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = String(error?.message || error);
        console.warn('[Data:QLDFires] update failed:', _lastError);
        return false;
      }
    },

    /** Introspection used by the toggle panel status line. */
    get status() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        lastError: _lastError,
        overlaySourceId: QLD_FIRES_OVERLAY_SOURCE_ID,
      };
    },
  };
  return layer;
}
