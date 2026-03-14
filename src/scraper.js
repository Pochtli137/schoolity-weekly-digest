const { chromium } = require('playwright');
const path = require('path');
const { parseMessages, parseNotifications, parseAssignments, parseAbsence, extractStringTable } = require('./gwt-parser');

const AUTH_DIR = path.join(__dirname, '..', 'auth');

/**
 * Launch browser, login to Schoolity via Google SSO,
 * systematically navigate ALL sections, intercept GWT-RPC responses.
 */
async function scrapeSchoolity() {
  const browser = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--window-position=-9999,-9999'],  // Off-screen — not visible
    viewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  // Collect ALL GWT-RPC responses by endpoint
  const rpcResponses = {};

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('schoolity.com') || !url.includes('method=')) return;

    try {
      const text = await response.text();
      if (!text || !text.startsWith('//OK') || text.length < 20) return;

      // Extract method name from URL
      const methodMatch = url.match(/method=([^&]+)/);
      if (!methodMatch) return;
      const method = methodMatch[1];

      // Store all responses, keep the largest one per method
      if (!rpcResponses[method] || text.length > rpcResponses[method].length) {
        rpcResponses[method] = text;
        console.log(`  Captured: ${method} (${text.length} chars)`);
      }
    } catch {
      // Response body may not be available
    }
  });

  // --- LOGIN ---
  console.log('Navigating to Schoolity...');
  await page.goto('https://www.schoolity.com', { waitUntil: 'networkidle' });

  // Wait for login — either already on /app or session expired
  const currentUrl = page.url();
  if (!currentUrl.includes('schoolity.com/app')) {
    // Wait up to 30s — if session is saved it redirects automatically
    try {
      await page.waitForURL(url => url.toString().includes('schoolity.com/app'), { timeout: 30_000 });
    } catch {
      await browser.close();
      throw new Error('SESSION_EXPIRED: Google-sessionen har gått ut. Kör "node src/login.js" för att logga in igen.');
    }
  }
  console.log('Inloggad!');

  // Wait for initial data load
  console.log('\nVäntar på initial dataladdning...');
  await page.waitForTimeout(5000);

  // --- SYSTEMATICALLY CLICK ALL NAVIGATION TABS ---
  console.log('\nKlickar igenom alla sektioner...');

  // Find all clickable navigation elements
  // Schoolity uses GWT widgets — tabs are typically <td> or <div> elements with specific classes
  const navStrategies = [
    // Try common Swedish tab names
    { text: 'Anslagstavlan', desc: 'Anslagstavlan (meddelanden)' },
    { text: 'Schema', desc: 'Schema' },
    { text: 'Uppgifter', desc: 'Uppgifter/läxor' },
    { text: 'Betyg', desc: 'Betyg' },
    { text: 'Omdömen', desc: 'Omdömen' },
    { text: 'Närvaro', desc: 'Närvaro/frånvaro' },
    { text: 'Frånvaro', desc: 'Frånvaro' },
    { text: 'Planering', desc: 'Planering' },
    { text: 'Ämnen', desc: 'Ämnen' },
    { text: 'Konversationer', desc: 'Konversationer' },
    { text: 'Meddelanden', desc: 'Meddelanden' },
    { text: 'Kalender', desc: 'Kalender' },
    { text: 'Dokument', desc: 'Dokument' },
    // English fallbacks
    { text: 'Board', desc: 'Board' },
    { text: 'Schedule', desc: 'Schedule' },
    { text: 'Assignments', desc: 'Assignments' },
    { text: 'Grades', desc: 'Grades' },
    { text: 'Attendance', desc: 'Attendance' },
  ];

  for (const nav of navStrategies) {
    try {
      // Look for elements containing this text (case-insensitive)
      const el = page.locator(`text="${nav.text}"`).first();
      if (await el.isVisible({ timeout: 1000 })) {
        console.log(`  Klickar: ${nav.desc}...`);
        await el.click();
        await page.waitForTimeout(3000);
        // Wait for any network activity to settle
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    } catch {
      // Tab doesn't exist — that's fine
    }
  }

  // Also try clicking on any subject/course links if visible
  try {
    const courseLinks = page.locator('a:has-text("Matematik"), a:has-text("Svenska"), a:has-text("Engelska")');
    const count = await courseLinks.count();
    if (count > 0) {
      console.log(`  Klickar igenom ${count} ämnes-länkar...`);
      // Just click the first few to trigger course-specific data
      for (let i = 0; i < Math.min(count, 3); i++) {
        try {
          await courseLinks.nth(i).click();
          await page.waitForTimeout(2000);
          await page.goBack();
          await page.waitForTimeout(1000);
        } catch {
          break;
        }
      }
    }
  } catch {
    // No course links found
  }

  // Final wait for any remaining responses
  await page.waitForTimeout(2000);

  // --- PARSE ALL COLLECTED DATA ---
  console.log('\nParsear insamlad data...');
  console.log(`Totalt ${Object.keys(rpcResponses).length} unika endpoints fångade:`);
  for (const [method, resp] of Object.entries(rpcResponses)) {
    console.log(`  ${method}: ${resp.length} chars`);
  }

  const data = {
    notifications: rpcResponses.loadAll ? parseNotifications(rpcResponses.loadAll) : [],
    messages: rpcResponses.loadMessagesByDate ? parseMessages(rpcResponses.loadMessagesByDate) : [],
    assignments: rpcResponses.loadChildAssignmentPosts ? parseAssignments(rpcResponses.loadChildAssignmentPosts) : [],
    absence: rpcResponses.loadStudentAbsence ? parseAbsence(rpcResponses.loadStudentAbsence) : null,
    // Store raw responses for debugging
    _rawEndpoints: Object.keys(rpcResponses),
    scrapedAt: new Date().toISOString(),
  };

  // Also extract any interesting data from other endpoints
  const extraData = [];
  for (const [method, resp] of Object.entries(rpcResponses)) {
    if (['loadAll', 'loadMessagesByDate', 'loadChildAssignmentPosts', 'loadStudentAbsence'].includes(method)) continue;
    // Skip metadata/login endpoints
    if (['loadLogin', 'verifyLogin', 'loadApplicationVersion', 'loadGeneralOnLogin',
         'getSchoolInfo', 'loadNamespacesForSessionEmailOrSsn', 'loadRoles',
         'loadUserPreferences', 'isOkProjectVersion', 'loadEntities',
         'loadAbsenceSettings', 'loadPushTokens', 'didRevokeAppAccess',
         'loadSettings', 'loadConcernSettings', 'getSparPreferences',
         'getSettings', 'loadSchedulePositions', 'loadSchools',
         'loadCustomPages', 'loadWarnings', 'loadCsn',
         'acknowledge', 'log', 'getCompactProject', 'loadProject',
         'loadTeacherData', 'loadCourses', 'loadStudentData',
         'getStudentSiteFolderId', 'loadStudentSemesterVisibility',
    ].includes(method)) continue;

    const strings = extractStringTable(resp);
    const readable = strings.filter(s =>
      s && s.length > 10 &&
      !s.match(/^(java|schoolutil|com\.google)\./) &&
      !s.match(/^[A-F0-9-]{36}$/) &&
      !s.startsWith('ahN')
    );
    if (readable.length > 0) {
      extraData.push({ method, strings: readable.slice(0, 20) });
    }
  }
  data.extraData = extraData;

  console.log(`\nResultat: ${data.notifications.length} notif, ${data.messages.length} msg, ${data.assignments.length} uppgifter`);
  if (extraData.length > 0) {
    console.log(`Extra data från: ${extraData.map(e => e.method).join(', ')}`);
  }

  await browser.close();
  return data;
}

module.exports = { scrapeSchoolity };
