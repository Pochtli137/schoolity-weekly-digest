/**
 * Manual login script — opens a visible browser for Google SSO.
 * Run this when the session has expired.
 *
 * Usage: node src/login.js
 */
const { chromium } = require('playwright');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth');

async function login() {
  console.log('Öppnar browser för inloggning...');

  const browser = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  await page.goto('https://www.schoolity.com', { waitUntil: 'networkidle' });

  console.log('\nLogga in med Google i browserfönstret.');
  console.log('Väntar på att du loggar in...\n');

  await page.waitForURL(url => url.toString().includes('schoolity.com/app'), { timeout: 300_000 });
  console.log('Inloggad! Sessionen är sparad.');

  // Wait a moment to ensure session is fully saved
  await page.waitForTimeout(3000);
  await browser.close();

  console.log('Klart — stäng detta fönster. Nästa cron-körning kommer fungera.');
}

login().catch((err) => {
  console.error('Fel:', err.message);
  process.exit(1);
});
