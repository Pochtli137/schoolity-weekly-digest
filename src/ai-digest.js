const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateDigest(data) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = buildPrompt(data);
  const result = await model.generateContent(prompt);
  return result.response.text();
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

  return `Du är en hjälpsam assistent som sammanfattar skolinformation för föräldrar.

Nedan finns rå data som hämtats från skolplattformen Schoolity för eleven ${process.env.STUDENT_NAME} (${process.env.CLASS_NAME}, ${process.env.SCHOOL_NAME}).

Skriv en kortfattad, lättläst veckosammanfattning på svenska. Formatera som HTML-fragment (inga <html>/<body>-taggar). Använd denna struktur:

1. **Viktigt just nu** — saker som kräver åtgärd eller uppmärksamhet (prov, deadlines, event)
2. **Meddelanden från skolan** — sammanfatta de viktigaste meddelandena, gruppera liknande
3. **Läxor & uppgifter** — lista aktiva uppgifter kort
4. **Inställda lektioner** — om det finns några
5. **Övrigt** — allt annat värt att nämna

Regler:
- Skriv på svenska, vardaglig ton, som till en förälder
- Var kort och konkret — ingen fluff
- Skippa duplicerad info (samma meddelande förekommer ofta i flera format)
- Om data ser gammal ut eller irrelevant, nämn det kort istället för att lista allt
- Använd HTML: <h3>, <ul>, <li>, <strong>, <p>
- Max 500 ord

---

${rawData}`;
}

module.exports = { generateDigest };
