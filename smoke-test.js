/**
 * Playwright smoke-test for KeyPiano.
 * Launches the Electron app, waits for the renderer to stabilise,
 * captures a screenshot and checks for critical elements + JS errors.
 *
 * Usage: node smoke-test.js
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs   = require('fs');

(async () => {
  const errors = [];

  const app = await electron.launch({
    args: [path.join(__dirname, 'src', 'main.cjs')],
  });

  const page = await app.firstWindow();

  page.on('console', msg => {
    if (msg.type() === 'error') { errors.push(msg.text()); }
  });
  page.on('pageerror', err => { errors.push(err.message); });

  // Wait for the piano keys to render
  try {
    await page.waitForSelector('.white-key', { timeout: 8000 });
  } catch {
    errors.push('TIMEOUT: .white-key never appeared');
  }

  // Wait a tick for animations
  await page.waitForTimeout(800);

  // Screenshot
  const screenshotPath = path.join(__dirname, 'screenshot.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved: ${screenshotPath}`);

  // Check critical elements
  const checks = [
    '#control-panel',
    '#studio-area',
    '#quad-waveform',
    '#quad-osc',
    '#quad-env',
    '#quad-fx',
    '#piano-dock',
    '#piano',
    '#piano-viewport',
    '#sustain-strip',
    '#strip-track',
    '#octave-value',
    '#btn-down',
    '#btn-up',
    '#volume-slider',
    '.knob-cap',
    '#waveform-canvas',
  ];

  for (const sel of checks) {
    const el = await page.$(sel);
    if (!el) { errors.push(`MISSING element: ${sel}`); }
  }

  const keyCount = await page.$$eval('.white-key', els => els.length);
  if (keyCount < 35) { errors.push(`Too few white keys: ${keyCount}`); }

  const blackCount = await page.$$eval('.black-key', els => els.length);
  if (blackCount < 20) { errors.push(`Too few black keys: ${blackCount}`); }

  await app.close();

  if (errors.length) {
    console.error('\n❌ Smoke-test FAILED:');
    errors.forEach(e => console.error('  •', e));
    process.exit(1);
  } else {
    console.log(`✓ All checks passed — ${keyCount} white keys, ${blackCount} black keys`);
  }
})();
