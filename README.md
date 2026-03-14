# school-digest

Weekly AI-summarized email digest from [Schoolity](https://www.schoolity.com) — a Swedish school platform.

Scrapes messages, assignments, notifications, attendance, and grades via Playwright, then uses Gemini to generate a concise parent-friendly summary and emails it via Gmail.

## How it works

1. **Playwright** opens Schoolity in a headless browser using a saved Google session
2. **Intercepts** all GWT-RPC responses (Schoolity uses Google Web Toolkit, not REST)
3. **Parses** the GWT binary format to extract readable text
4. **Gemini AI** summarizes everything into a short weekly digest
5. **Nodemailer** sends it via Gmail SMTP
6. **launchd** (macOS) runs it on a weekly schedule

## Setup

### 1. Install

```bash
git clone <this-repo> school-digest
cd school-digest
npm install
npx playwright install chromium
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

- **GOOGLE_EMAIL** — your Gmail address (used for Schoolity login and sending)
- **GMAIL_APP_PASSWORD** — generate at https://myaccount.google.com/apppasswords
- **DIGEST_TO** — comma-separated recipient emails
- **STUDENT_NAME / SCHOOL_NAME / CLASS_NAME** — shown in the email
- **GEMINI_API_KEY** — get one at https://aistudio.google.com/apikey

### 3. Login to Schoolity

```bash
node src/login.js
```

A browser window opens. Log in with Google. The session is saved in `auth/` for future runs.

### 4. Test

```bash
# Dry run — scrape + AI summary, but don't send email
node src/index.js --dry-run

# Full run — scrape + summarize + send email
node src/index.js
```

Check `preview.html` to see what the email looks like.

### 5. Schedule (macOS)

Create `~/Library/LaunchAgents/com.skoldigest.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.skoldigest</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/node</string>
        <string>/path/to/school-digest/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/school-digest</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>1</integer>
        <key>Hour</key>
        <integer>10</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/path/to/school-digest/cron.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/school-digest/cron.log</string>
</dict>
</plist>
```

Replace `/path/to/` with actual paths (`which node` for node path), then:

```bash
launchctl load ~/Library/LaunchAgents/com.skoldigest.plist
```

### Session expired?

If the Google session expires, you'll get an email with the subject "Skoldigest — Inloggning krävs". Fix it by running:

```bash
cd ~/school-digest && node src/login.js
```

## Data captured

Schoolity uses GWT-RPC. The scraper intercepts responses from these endpoints:

| Endpoint | Data |
|---|---|
| `loadMessagesByDate` | Board messages / announcements |
| `loadChildAssignmentPosts` | Homework and assignments |
| `notificationrpc/loadAll` | Notifications (messages + cancelled lessons) |
| `loadStudentAbsence` | Attendance per subject |
| `getCourseEvaluations` | Grades and evaluations |
| `loadAgendaIds` | Lesson agendas / schedule notes |

## Tech

- **Playwright** — browser automation
- **Nodemailer** — Gmail SMTP
- **Gemini 2.0 Flash** — AI summary
- **GWT-RPC parser** — custom parser for Google Web Toolkit's serialization format
