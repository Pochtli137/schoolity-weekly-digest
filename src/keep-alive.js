/**
 * Keep-alive — visits Schoolity headless to refresh the Google session.
 * Run daily via cron to prevent session expiry between weekly digests.
 *
 * Usage: node src/keep-alive.js
 */
const { chromium } = require('playwright');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth');

async function keepAlive() {
  const browser = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-9999,-9999'],
    viewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  await page.goto('https://www.schoolity.com/login/?autoinlog=true', { waitUntil: 'networkidle' });

  const url = page.url();
  if (url.includes('schoolity.com/app')) {
    console.log(`${new Date().toISOString()} — Session OK`);
  } else {
    try {
      await page.waitForURL(u => u.toString().includes('schoolity.com/app'), { timeout: 15_000 });
      console.log(`${new Date().toISOString()} — Session refreshed after redirect`);
    } catch {
      console.error(`${new Date().toISOString()} — Session expired! Run: node src/login.js`);
      await browser.close();
      process.exit(1);
    }
  }

  // Wait for cookies to be written to disk
  await page.waitForTimeout(2000);
  await browser.close();
}

keepAlive().catch((err) => {
  console.error(`${new Date().toISOString()} — Error: ${err.message}`);
  process.exit(1);
});
