#!/usr/bin/env node
/** Deep UX audit: AU layer geometry correctness, CCTV frame click, basemap switch, search flight, share link, FPS. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.QA_BASE_URL || 'http://localhost:4173';
const OUT = '/tmp/aulg-ux2';
fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` }).then(() => console.log('shot:', name));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE + '/?welcome=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__godsEyeView?.dataManager?._layerPanel, { timeout: 60000 });
await sleep(2000);

// ---- 1. Enable both AU layers, audit actual entity geometry ----
const enable = (id) =>
  page.evaluate((layerId) => {
    window.__godsEyeView.dataManager._toggleContainer
      .querySelector(`[data-layer-id="${layerId}"] .data-toggle-btn`).click();
  }, id);
await enable('nsw-fires');
await enable('qld-fires');
await page.waitForFunction(
  () => {
    const g = (id) => window.__godsEyeView.dataManager.layers.get(id)?.module?.status;
    return g('nsw-fires')?.count > 0 && g('qld-fires')?.count > 0;
  },
  { timeout: 90000, polling: 1000 },
);

const geo = await page.evaluate(async () => {
  const Cesium = (await import('/@id/cesium')).default ?? (await import('/@id/cesium'));
  const now = Cesium.JulianDate.now();
  const audit = (dsName) => {
    const ds = window.__godsEyeView.viewer.dataSources.getByName(dsName)[0];
    if (!ds) return null;
    const lons = [], lats = [];
    let points = 0, polygons = 0, badRings = 0;
    const push = (c) => {
      const carto = Cesium.Cartographic.fromCartesian(c);
      lons.push((carto.longitude * 180) / Math.PI);
      lats.push((carto.latitude * 180) / Math.PI);
    };
    for (const e of ds.entities.values) {
      if (e.position) { push(e.position.getValue(now)); points++; }
      if (e.polygon) {
        const hier = e.polygon.hierarchy.getValue(now);
        const positions = hier?.positions || [];
        if (positions.length < 3) badRings++;
        for (const p of positions) push(p);
        polygons++;
      }
    }
    return {
      points, polygons, badRings,
      lonMin: Math.min(...lons), lonMax: Math.max(...lons),
      latMin: Math.min(...lats), latMax: Math.max(...lats),
    };
  };
  return { nsw: audit('nsw-fires'), qld: audit('qld-fires') };
});
const inBox = (a, box) =>
  a && a.lonMin >= box.lon[0] && a.lonMax <= box.lon[1] && a.latMin >= box.lat[0] && a.latMax <= box.lat[1];
check('NSW entities inside NSW bbox', inBox(geo.nsw, { lon: [139, 156], lat: [-39, -24] }), JSON.stringify(geo.nsw));
check('QLD entities inside QLD bbox', inBox(geo.qld, { lon: [137, 156], lat: [-30, -9] }), JSON.stringify(geo.qld));
check('NSW has both points and polygons', geo.nsw?.points > 0 && geo.nsw?.polygons > 0);
check('QLD polygons have valid rings', geo.qld?.badRings === 0);
await shot(page, '01-both-layers');

// ---- 2. CCTV: enable at Sydney, count billboards via instanceof, click one ----
await page.evaluate(async () => {
  const Cesium = (await import('/@id/cesium')).default ?? (await import('/@id/cesium'));
  window.__godsEyeView.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(151.21, -33.87, 6000),
    orientation: { heading: 0, pitch: -0.85, roll: 0 },
    duration: 0,
  });
});
await sleep(800);
await enable('cctv');
let bbCount = 0;
for (let i = 0; i < 20 && bbCount === 0; i++) {
  await sleep(2500);
  bbCount = await page.evaluate(() => {
    const CesiumNS = window.__godsEyeView.viewer.scene.primitives;
    let n = 0;
    for (let i = 0; i < CesiumNS.length; i++) {
      const p = CesiumNS.get(i);
      // BillboardCollection instances (also subclass-safe)
      if (p && typeof p.length === 'number' && p.get && p.constructor?.name?.includes('Billboard')) n += p.length;
    }
    return n;
  });
}
check('CCTV billboards loaded near Sydney', bbCount > 0, `${bbCount} billboards`);
await shot(page, '02-cctv-sydney');
if (bbCount > 0) {
  const target = await page.evaluate(async () => {
    const Cesium = (await import('/@id/cesium')).default ?? (await import('/@id/cesium'));
    const scene = window.__godsEyeView.viewer.scene;
    const prims = scene.primitives;
    for (let i = 0; i < prims.length; i++) {
      const p = prims.get(i);
      if (!p || typeof p.length !== 'number' || !p.get || !p.constructor?.name?.includes('Billboard')) continue;
      for (let j = 0; j < p.length; j++) {
        const b = p.get(j);
        if (!b.show || !b.position) continue;
        const wc = scene.cartesianToCanvasCoordinates(b.position);
        if (wc && wc.x > 150 && wc.x < 1290 && wc.y > 150 && wc.y < 750) return { x: Math.round(wc.x), y: Math.round(wc.y) };
      }
    }
    return null;
  });
  if (target) {
    await page.mouse.click(target.x, target.y);
    await sleep(9000);
    const frame = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')]
        .filter((i) => i.offsetWidth > 100 && i.src)
        .map((i) => ({ host: new URL(i.src).host, src: i.src, w: i.naturalWidth, h: i.naturalHeight }));
      const text = document.body.innerText.replace(/\s+/g, ' ');
      return { imgs: imgs.slice(0, 3), hasCard: /LIVE TRAFFIC|camera|CAMERA|speed|SHADOW/i.test(text.slice(0, 4000)) };
    });
    const liveFrame = frame.imgs.some((i) => i.w >= 600 && i.h >= 400 && /\/api\/cctv\//.test(i.src || '') || i.w >= 600 && /transport\.nsw\.gov\.au/.test(i.host));
    check('CCTV camera card with live frame opened', liveFrame, JSON.stringify(frame.imgs));
    await shot(page, '03-cctv-card');
  } else {
    check('CCTV camera card with live frame opened', false, 'no on-screen billboard to click');
  }
}

// ---- 3. Search end-to-end: type + Enter → camera flies to Bondi ----
await page.evaluate(() => {
  const Cesium = window; // camera read below doesn't need Cesium
});
await page.evaluate(() => {
  const t = document.querySelector('#search-toggle');
  const i = document.querySelector('#location-search');
  if (i && i.offsetParent) { i.focus(); }
  else if (t) t.click();
  else if (i) { i.classList.add('expanded'); i.focus(); }
});
await sleep(700);
await page.evaluate(() => document.querySelector('#location-search')?.focus());
await page.type('#location-search', 'Bondi Beach', { delay: 60 });
await page.keyboard.press('Enter');
await sleep(9000);
const cam = await page.evaluate(() => {
  const c = window.__godsEyeView.viewer.camera.positionCartographic;
  return { lat: (c.latitude * 180) / Math.PI, lon: (c.longitude * 180) / Math.PI, alt: c.height };
});
check('search flies camera to Bondi Beach', cam.lat < -33.85 && cam.lat > -33.95 && cam.lon > 151.24 && cam.lon < 151.34 && cam.alt < 50000, `lat=${cam.lat.toFixed(3)} lon=${cam.lon.toFixed(3)} alt=${Math.round(cam.alt)}m`);
await shot(page, '04-search-bondi');

// ---- 4. Basemap switch (Esri Satellite chip) ----
const before = await page.evaluate(() => window.__godsEyeView.viewer.scene.imageryLayers.length);
const switched = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === 'Esri Satellite' && b.offsetParent);
  if (!btn) return false;
  btn.click();
  return true;
});
await sleep(5000);
const after = await page.evaluate(() => ({
  layers: window.__godsEyeView.viewer.scene.imageryLayers.length,
  active: [...document.querySelectorAll('button')].filter((b) => b.className.includes('active')).map((b) => b.textContent.trim()).slice(0, 3),
}));
check('basemap switch to Esri Satellite executed', switched && after.layers >= before, `before=${before} after=${after.layers}`);
await shot(page, '05-basemap-esri');

// ---- 5. Share link contains AU layer tokens ----
const share = await page.evaluate(async () => {
  // Prefer the real encode path the 🔗 button uses.
  const mod = await import('/src/data/layerState.js');
  const m = window.__godsEyeView.dataManager;
  const ids = [...m.layers.keys()].filter((id) => m.isEnabled(id));
  const params = new URLSearchParams([['v', '2']]);
  mod.encodeLayerStateParams(params, { enabledLayerIds: ids, options: {} });
  return params.toString();
});
check('share link encodes AU layer tokens', /[&^]l=.*n.*k|n.*k/.test(share) && share.includes('n') && share.includes('k'), share.slice(0, 60));

// ---- 6. FPS with all AU layers on ----
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < 2000) requestAnimationFrame(tick);
    else resolve(Math.round(frames / 2));
  };
  requestAnimationFrame(tick);
}));
check('rendering stays fluid with AU layers on', fps >= 24, `${fps} fps`);

console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
if (errors.length) failures++;
await browser.close();
process.exit(failures ? 1 : 0);
