#!/usr/bin/env node
/** Browser smoke proof for the NSW RFS fires layer: registration, enable, live fetch, render. */
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    ...(process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-gpu']
      : ['--use-gl=angle', '--use-angle=swiftshader']),
  ],
});
const page = await browser.newPage();
let failures = 0;
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name, passed, detail = '') => {
  console.log(
    `[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`,
  );
  if (!passed) failures++;
};
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(
    `${process.env.QA_BASE_URL || 'http://localhost:4173'}/?welcome=0`,
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.waitForFunction(
    () => window.__godsEyeView?.dataManager?._layerPanel,
    {
      timeout: 60000,
    },
  );

  const registered = await page.evaluate(() => {
    const manager = window.__godsEyeView.dataManager;
    return {
      has: manager.layers.has('nsw-fires'),
      cameraLat:
        window.__godsEyeView?.viewer?.camera?.positionCartographic?.latitude,
      cameraLon:
        window.__godsEyeView?.viewer?.camera?.positionCartographic?.longitude,
    };
  });
  check('nsw-fires layer registered', registered.has);
  if (registered.cameraLat != null) {
    const lat = (registered.cameraLat * 180) / Math.PI;
    const lon = (registered.cameraLon * 180) / Math.PI;
    check(
      'startup camera over NSW',
      lat < -25 && lat > -40 && lon > 140 && lon < 154,
      `lat=${lat.toFixed(1)} lon=${lon.toFixed(1)}`,
    );
  }

  // Enable the layer through the panel row the way a user would.
  await page.evaluate(() => {
    const manager = window.__godsEyeView.dataManager;
    const container = manager._toggleContainer;
    container
      .querySelector('[data-layer-id="nsw-fires"] .data-toggle-btn')
      .click();
  });

  // Wait for the first successful live update (fetch + entity build).
  await page.waitForFunction(
    () => {
      const entry = window.__godsEyeView.dataManager.layers.get('nsw-fires');
      return entry?.module?.status?.count > 0;
    },
    { timeout: 45000 },
  );

  const status = await page.evaluate(() => {
    const entry = window.__godsEyeView.dataManager.layers.get('nsw-fires');
    return {
      enabled: entry.enabled,
      count: entry.module.status.count,
      lastError: entry.module.status.lastError,
      sources: window.__godsEyeView.viewer.dataSources.length,
    };
  });
  check('layer enabled', status.enabled === true);
  check('live incidents rendered', status.count > 0, `${status.count} shapes`);
  check('no layer error', !status.lastError, status.lastError || '');

  await new Promise((resolve) => setTimeout(resolve, 2500));
  await page.screenshot({ path: 'screenshots/smoke-nsw-fires.png' });
  console.log('screenshot: screenshots/smoke-nsw-fires.png');
} catch (error) {
  failures++;
  console.log(`[FAIL] smoke run — ${error.message}`);
}
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
process.exit(failures ? 1 : 0);
