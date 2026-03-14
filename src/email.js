const nodemailer = require('nodemailer');

function wrapDigestHtml(aiContent) {
  const now = new Date();
  const weekNum = getWeekNumber(now);
  const dateStr = now.toLocaleDateString('sv-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6; }
  h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; font-size: 24px; }
  h3 { color: #2980b9; margin-top: 28px; margin-bottom: 8px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  strong { color: #2c3e50; }
  p { margin: 8px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
</style>
</head>
<body>
<h1>Skoldigest — ${process.env.STUDENT_NAME}</h1>
<p style="color: #666;">Vecka ${weekNum} · ${dateStr}</p>

${aiContent}

<div class="footer">
  Genererat ${now.toLocaleString('sv-SE')} · AI-sammanfattning via Claude<br>
  ${process.env.STUDENT_NAME} — ${process.env.SCHOOL_NAME}, ${process.env.CLASS_NAME}
</div>
</body>
</html>`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

async function sendDigestEmail(html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GOOGLE_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const weekNum = getWeekNumber(new Date());

  await transporter.sendMail({
    from: `"Skoldigest" <${process.env.GOOGLE_EMAIL}>`,
    to: process.env.DIGEST_TO,
    subject: `Skoldigest v${weekNum} — ${process.env.STUDENT_NAME}`,
    html,
  });

  console.log(`Email sent to ${process.env.DIGEST_TO}`);
}

module.exports = { wrapDigestHtml, sendDigestEmail, getWeekNumber };
