require('dotenv').config();
const { scrapeSchoolity } = require('./scraper');
const { generateDigest } = require('./ai-digest');
const { wrapDigestHtml, sendDigestEmail } = require('./email');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function sendErrorEmail(error) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GOOGLE_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const isSessionError = error.message.includes('SESSION_EXPIRED');

  await transporter.sendMail({
    from: `"Skoldigest" <${process.env.GOOGLE_EMAIL}>`,
    to: process.env.DIGEST_TO,
    subject: isSessionError
      ? 'Skoldigest — Inloggning krävs'
      : 'Skoldigest — Fel vid hämtning',
    html: isSessionError
      ? `<p>Google-sessionen för Schoolity har gått ut.</p>
         <p>Kör detta i terminalen för att logga in igen:</p>
         <pre>cd ~/school-digest && node src/login.js</pre>
         <p>Sedan kommer nästa veckas digest att fungera automatiskt.</p>`
      : `<p>Något gick fel vid hämtning av skoldata:</p>
         <pre>${error.message}</pre>`,
  });

  console.log('Felmail skickat.');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log(`=== Skoldigest — ${process.env.STUDENT_NAME} ===\n`);

  const data = await scrapeSchoolity();
  fs.writeFileSync(path.join(__dirname, '..', 'data-cache.json'), JSON.stringify(data, null, 2));

  console.log('\nGenererar AI-sammanfattning...');
  const aiContent = await generateDigest(data);

  const html = wrapDigestHtml(aiContent);
  fs.writeFileSync(path.join(__dirname, '..', 'preview.html'), html);
  console.log('Preview sparad: preview.html');

  if (dryRun) {
    console.log('\nDry run — mailet skickades inte.');
    return;
  }

  await sendDigestEmail(html);
  console.log('\nKlart!');
}

main().catch(async (err) => {
  console.error('Fel:', err.message);
  try {
    await sendErrorEmail(err);
  } catch (emailErr) {
    console.error('Kunde inte skicka felmail:', emailErr.message);
  }
  process.exit(1);
});
