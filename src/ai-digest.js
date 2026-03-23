const { GoogleGenerativeAI } = require('@google/generative-ai');

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

async function generateDigest(data) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildPrompt(data);
  const result = await model.generateContent(prompt);
  let text = result.response.text();
  // Strip markdown code fences that Gemini sometimes wraps around HTML
  text = text.replace(/^```html\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return text;
}

function buildPrompt(data) {
  let sections = [];

  if (data.notifications.length > 0) {
    sections.push('## Notifikationer\n' +
      data.notifications.map(n => {
        let line = '';
        if (n.title) line += `**${n.title}**`;
        if (n.sender) line += ` (${n.sender})`;
        if (n.type === 'canceled_lesson') line += ' [INSTÄLLD LEKTION]';
        line += `\n${n.content}`;
        return line;
      }).join('\n\n'));
  }

  if (data.messages.length > 0) {
    sections.push('## Meddelanden från skolan\n' +
      data.messages.slice(0, 30).map(m => {
        let line = '';
        if (m.title) line += `**${m.title}**`;
        if (m.sender) line += ` (${m.sender})`;
        if (m.classTarget) line += ` [${m.classTarget}]`;
        line += `\n${m.content}`;
        return line;
      }).join('\n\n'));
  }

  if (data.assignments.length > 0) {
    sections.push('## Uppgifter & Läxor\n' +
      data.assignments.slice(0, 40).map(a => `- ${a.text}`).join('\n'));
  }

  if (data.absence && data.absence.subjects.length > 0) {
    sections.push('## Ämnen (frånvarostatistik finns för)\n' + data.absence.subjects.join(', '));
  }

  // Include extra data from other endpoints (grades, conversations, etc.)
  if (data.extraData && data.extraData.length > 0) {
    for (const extra of data.extraData) {
      sections.push(`## Extra: ${extra.method}\n` +
        extra.strings.map(s => `- ${s}`).join('\n'));
    }
  }

  const rawData = sections.join('\n\n---\n\n');

  const today = new Date();
  const dayNames = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
  const todayStr = today.toISOString().slice(0, 10);
  const todayDay = dayNames[today.getDay()];

  // Calculate coming week (Monday to Friday)
  const monday = new Date(today);
  monday.setDate(today.getDate() + ((1 - today.getDay() + 7) % 7 || 7));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const weekNum = getISOWeek(monday);
  const mondayStr = monday.toISOString().slice(0, 10);
  const fridayStr = friday.toISOString().slice(0, 10);

  return `Du är en hjälpsam assistent som sammanfattar skolinformation för föräldrar.

Nedan finns rå data som hämtats från skolplattformen Schoolity för eleven ${process.env.STUDENT_NAME} (${process.env.CLASS_NAME}, ${process.env.SCHOOL_NAME}).

Dagens datum: ${todayStr} (${todayDay})
Kommande vecka: v.${weekNum}, ${mondayStr} – ${fridayStr}

Skriv en kortfattad, lättläst veckosammanfattning på svenska. Fokusera på **kommande vecka** (v.${weekNum}). Formatera som HTML-fragment (inga <html>/<body>-taggar). Använd denna struktur:

1. **Viktigt kommande vecka** — saker som händer v.${weekNum} och som kräver åtgärd eller uppmärksamhet (prov, deadlines, event, möten)
2. **Meddelanden från skolan** — sammanfatta de viktigaste meddelandena, gruppera liknande. Skippa meddelanden som uppenbart är gamla/passerade.
3. **Läxor & uppgifter** — lista aktiva och kommande uppgifter kort
4. **Inställda lektioner** — om det finns några kommande vecka
5. **Övrigt** — allt annat värt att nämna

Regler:
- Skriv på svenska, vardaglig ton, som till en förälder
- Var kort och konkret — ingen fluff
- Skippa duplicerad info (samma meddelande förekommer ofta i flera format)
- Ignorera händelser och meddelanden som redan har passerat (före ${todayStr}), om de inte fortfarande är relevanta
- Använd HTML: <h3>, <ul>, <li>, <strong>, <p>
- Max 500 ord

---

${rawData}`;
}

module.exports = { generateDigest };
