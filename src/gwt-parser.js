/**
 * Parse GWT-RPC responses to extract human-readable data.
 *
 * GWT-RPC response format: //OK[values..., N, ["string1","string2",...], 0, 7]
 * The string table at the end contains all readable text (1-indexed).
 */

function extractStringTable(gwtResponse) {
  if (!gwtResponse || !gwtResponse.startsWith('//OK')) {
    return [];
  }

  const lastBracketEnd = gwtResponse.lastIndexOf('],0,7]');
  if (lastBracketEnd === -1) return [];

  let depth = 0;
  let tableStart = -1;
  for (let i = lastBracketEnd; i >= 0; i--) {
    if (gwtResponse[i] === ']') depth++;
    if (gwtResponse[i] === '[') {
      depth--;
      if (depth === 0) {
        tableStart = i;
        break;
      }
    }
  }

  if (tableStart === -1) return [];

  const tableStr = gwtResponse.substring(tableStart, lastBracketEnd + 1);

  try {
    return JSON.parse(tableStr);
  } catch {
    const strings = [];
    let inString = false;
    let current = '';
    let escaped = false;

    for (let i = 1; i < tableStr.length - 1; i++) {
      const ch = tableStr[i];
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        current += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        if (inString) {
          strings.push(current);
          current = '';
          inString = false;
        } else {
          inString = true;
        }
        continue;
      }
      if (inString) {
        current += ch;
      }
    }
    return strings;
  }
}

function isJunk(s) {
  if (!s || s.length === 0) return true;
  if (s.match(/^(java|schoolutil|com\.google)\./)) return true;
  if (s.match(/^[A-F0-9]{32}$/)) return true;
  if (s.startsWith('ahN')) return true;  // GAE datastore keys
  if (s.match(/^[A-F0-9-]{36}$/)) return true;  // UUIDs
  if (s.match(/^[A-F0-9-]{36}:/)) return true;  // UUID:id combos
  if (s === 'MESSAGE' || s === 'LESSON' || s === 'CANCELED_LESSON') return true;
  return false;
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|h[1-6]|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/\u003D/g, '=')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Extract notifications from notificationrpc/loadAll response.
 *
 * String table pattern (from real data):
 *   content, title - sender, namespace, UUID:id, content, title - sender, ...
 *   Then: CANCELED_LESSON entries with schedule strings
 */
function parseNotifications(gwtResponse) {
  const strings = extractStringTable(gwtResponse);
  const notifications = [];

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    if (isJunk(s)) continue;
    if (s === 'Maria_Elementar') continue;

    // Board message notifications: long text content followed by "title - sender"
    if (s.length > 30 && !s.includes('"') && !s.startsWith('Inställd lektion')) {
      const title = strings[i + 1] || '';
      // Title format is "Subject - Sender Name"
      if (title && title.includes(' - ') && !title.match(/^[A-F0-9-]{36}/)) {
        const [subject, sender] = title.split(' - ');
        notifications.push({
          content: s,
          title: subject.trim(),
          sender: sender ? sender.trim() : '',
          type: 'message',
        });
        i++; // skip title
      }
    }

    // Canceled lesson notifications
    if (s === 'Inställd lektion: ') {
      // The schedule string is typically a few positions back
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const sched = strings[j];
        if (sched && sched.includes('"') && sched.includes('Klass:')) {
          notifications.push({
            content: sched.replace(/"/g, ''),
            title: 'Inställd lektion',
            sender: '',
            type: 'canceled_lesson',
          });
          break;
        }
      }
    }
  }

  return notifications;
}

/**
 * Extract messages from loadMessagesByDate response.
 *
 * The string table has patterns of HTML content followed by class targets and sender names.
 * We look for distinct message blocks by finding HTML content and nearby metadata.
 */
function parseMessages(gwtResponse) {
  const strings = extractStringTable(gwtResponse);
  const messages = [];
  const seenContent = new Set();

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    if (!s) continue;
    if (isJunk(s)) continue;

    // Look for HTML message bodies (the actual message content)
    if (s.includes('<div') || s.includes('<p ') || s.includes('<br')) {
      const text = stripHtml(s);
      if (text.length < 20) continue;

      // Deduplicate (messages appear multiple times in different formats)
      const key = text.substring(0, 80);
      if (seenContent.has(key)) continue;
      seenContent.add(key);

      // Look backwards for sender name and class target
      let sender = '';
      let classTarget = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prev = strings[j];
        if (!prev) continue;
        if (prev.startsWith('Klass:')) {
          classTarget = prev;
        }
        // Sender names: first + last name pattern
        if (prev.match(/^[A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+$/) && prev.length < 40) {
          sender = prev;
        }
      }

      // Also look forward for sender
      if (!sender) {
        for (let j = i + 1; j <= Math.min(strings.length - 1, i + 3); j++) {
          const next = strings[j];
          if (next && next.match(/^[A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+$/) && next.length < 40) {
            sender = next;
            break;
          }
        }
      }

      // Look for a title-like string nearby (short, no HTML)
      let title = '';
      for (let j = i + 1; j <= Math.min(strings.length - 1, i + 3); j++) {
        const next = strings[j];
        if (next && next.length > 3 && next.length < 80 && !next.includes('<') &&
            next.match(/^[A-ZÅÄÖa-zåäö\uD800-\uDBFF]/) && !isJunk(next) &&
            next !== sender && !next.startsWith('Klass:') && !next.startsWith('t') ) {
          title = next;
          break;
        }
      }

      messages.push({
        content: text.substring(0, 500),
        sender,
        title,
        classTarget,
      });
    }
  }

  return messages;
}

/**
 * Extract assignment titles and descriptions from loadChildAssignmentPosts.
 *
 * Assignment strings in the string table include:
 * - Course names, assignment titles (e.g., "Matteläxa 13", "Läxa - words/verbs")
 * - HTML descriptions with homework details
 * - Score-related data
 */
function parseAssignments(gwtResponse) {
  const strings = extractStringTable(gwtResponse);
  const assignments = [];
  const seen = new Set();

  // Short ID patterns to skip
  const shortIdPattern = /^[a-zA-Z][a-zA-Z0-9_$]{5,12}$/;  // like "cX4875wJjfak", "g2WHXPq"

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    if (!s || isJunk(s)) continue;
    if (s === 'Maria_Elementar' || s === 'Maria_Elementar_concern') continue;
    if (s.match(/^cloudstorage\//)) continue;
    if (shortIdPattern.test(s) && !s.includes(' ')) continue; // Skip IDs like "uMxNEjR"
    if (s.match(/^\d{4}-\d{4}/)) continue;  // Semester IDs like "2025-2026-2"

    // Assignment titles: readable text, not HTML, not an ID
    if (s.length >= 5 && s.length < 200 && !s.includes('<') && s.includes(' ')) {
      if (!seen.has(s)) {
        seen.add(s);
        assignments.push({ text: s });
      }
    }

    // HTML descriptions (homework details)
    if (s.includes('<') && s.length > 30) {
      const text = stripHtml(s);
      if (text.length > 10 && !seen.has(text.substring(0, 60))) {
        seen.add(text.substring(0, 60));
        assignments.push({ text, isDescription: true });
      }
    }
  }

  return assignments;
}

/**
 * Extract absence subjects from loadStudentAbsence response.
 */
function parseAbsence(gwtResponse) {
  const strings = extractStringTable(gwtResponse);
  const subjects = [];

  // Known subject patterns from the real data
  const skipPatterns = [
    /^(java|schoolutil)\./,
    /^[A-F0-9-]{36}$/,
    /^[a-z][a-zA-Z0-9]{4,12}$/,  // short IDs like "tS56VQ4", "sqcfzDu"
    /^a[A-F0-9]{8}-/,  // IDs starting with 'a' followed by UUID
    /^(weekday|teacher|student|subject|type|partly|fullYear)/,
    /Absence|Minutes|Reports|Valids|Invalids|Parts|Count|Times/,
    /^[0-4]$/,
    /^Z/,  // Schoolity internal IDs
    /^\[Z/,
  ];

  for (const s of strings) {
    if (!s || s.length <= 2) continue;
    if (skipPatterns.some(p => p.test(s))) continue;

    // Subject names contain letters, possibly with parens/slashes
    if (s.match(/^[A-ZÅÄÖ]/) && s.length < 50) {
      subjects.push(s);
    }
  }

  return { subjects };
}

module.exports = {
  extractStringTable,
  parseMessages,
  parseNotifications,
  parseAssignments,
  parseAbsence,
};
