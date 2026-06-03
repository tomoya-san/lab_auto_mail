# lab_auto_mail

Daily morning email tool with Telegram-based human approval.

Each morning, a Vercel Cron job reads today's events from a Google Calendar,
drafts an email per event, and sends a Telegram message with a **Send as-is**
button. One tap sends the email via your own SMTP server and edits the message
to "Sent".

No database. State lives in the Telegram message + the `eventId` carried in the
button's callback data.

## Architecture

```
Vercel Cron (daily)
  → GET /api/cron/morning
       → Google Calendar (today's events)
       → compose draft
       → Telegram: sendMessage with inline keyboard [Send as-is]

User taps "Send as-is" in Telegram
  → POST /api/telegram/webhook  (callback_query update, secret-token verified)
       → Google Calendar (re-fetch event by id)
       → SMTP: send
       → Telegram: answerCallbackQuery + editMessageText "✅ Sent: …"
```

## Project layout

```
app/
  api/cron/morning/route.ts        # daily handler
  api/telegram/webhook/route.ts    # callback_query ("send as-is")
lib/
  env.ts          # required env access
  google-auth.ts  # Google Calendar OAuth2 client (refresh-token based)
  calendar.ts     # fetch today's events / fetch by id
  compose.ts      # event → { subject, body }   (deterministic template)
  mailer.ts       # send email via SMTP (nodemailer)
  telegram.ts     # sendMessage / inline keyboard / secret-token verify
vercel.json       # cron schedule
```

## Setup

### 1. Google OAuth (Calendar, read-only)

1. Google Cloud Console → create a project (or reuse one).
2. Enable **Google Calendar API**.
3. **OAuth consent screen** → External; add yourself as a Test user; add scope
   `https://www.googleapis.com/auth/calendar.readonly`.
4. **Credentials → Create credentials → OAuth client ID** of type **Desktop app**.
   Copy `client_id` and `client_secret`.
5. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env.local`, then run:

   ```bash
   npm run get-refresh-token
   ```

   The script prints an auth URL, catches the redirect on `localhost:53682`,
   and prints the resulting `GOOGLE_REFRESH_TOKEN`. Add it to `.env.local`.

   Sign in during the flow as the account that has read access to the
   calendar you want to read (your personal account is fine if the calendar
   has been shared with it at "See all event details" level).

### 2. SMTP (sender)

Mail goes out via your own SMTP server (e.g. a lab/university mail server), not
Google. You need: host, port (usually 587 for STARTTLS, or 465 for TLS), the
username/password for the sending account, and a `From:` address (typically the
same as the username — most servers reject mismatches).

> **Heads-up on Vercel + university SMTP.** Many `.ac.jp`-style servers only
> accept connections from on-campus IPs / VPN ranges. Vercel runs functions on
> rotating cloud IPs. If you see connection timeouts after deploy, that's
> almost certainly why — ask IT, or host this on a fixed-IP box (small VPS,
> Raspberry Pi at home) instead.

### 3. Telegram bot

1. Open Telegram, message **@BotFather**, send `/newbot`, follow the prompts.
   Copy the bot token → `TELEGRAM_BOT_TOKEN`.
2. Open your new bot in Telegram and send `/start` (so it can DM you back).
3. Get your chat id: visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   and copy `result[].message.chat.id` (an integer) → `TELEGRAM_CHAT_ID`.
4. Pick a high-entropy webhook secret (`openssl rand -hex 32`) →
   `TELEGRAM_WEBHOOK_SECRET`.

### 4. Env vars

Copy `.env.example` → `.env.local` and fill in. For Vercel:

```bash
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
# …repeat for each
```

Generate `CRON_SECRET` with `openssl rand -hex 32`.

### 5. Deploy (automated via GitHub Actions)

Pushes to `main` deploy to production through `.github/workflows/deploy.yml`
(`vercel pull → build → deploy --prebuilt --prod`). The app's runtime secrets
live in the **Vercel project** — GitHub Secrets aren't visible at Vercel
runtime, so the functions read them from Vercel at request time. The pipeline
itself only needs credentials to talk to Vercel.

**One-time setup:**

1. Install + link (creates `.vercel/project.json` with your org/project IDs):

   ```bash
   npm i -g vercel@latest
   vercel login
   vercel link
   ```

2. Create a token at **Vercel → Account Settings → Tokens**.

3. Load the app secrets from `.env.local` into the Vercel project (production):

   ```bash
   VERCEL_TOKEN=xxxxx npm run sync-env        # add --dry-run to preview
   ```

   This pushes every required var (Google, SMTP, Telegram, `EMAIL_RECIPIENT`,
   `CRON_SECRET`) idempotently — re-run it whenever you rotate a secret.

4. Add three **GitHub repository secrets** (Settings → Secrets and variables →
   Actions). The org/project IDs are in `.vercel/project.json` after `vercel link`:

   | Secret | Value |
   |---|---|
   | `VERCEL_TOKEN` | the token from step 2 |
   | `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` |
   | `VERCEL_PROJECT_ID` | `projectId` in `.vercel/project.json` |

5. Push to `main` (or run the workflow manually from the Actions tab). The first
   successful deploy gives you your production URL, e.g.
   `https://lab-auto-mail.vercel.app`.

> The first deploy can also be done locally with `vercel deploy --prod` if you'd
> rather not wait for Actions — the project must be linked first.

### 6. Register the Telegram webhook

After the first prod deploy, point Telegram at the webhook (one-time). Pass your
production origin (no path — the script appends `/api/telegram/webhook`):

```bash
npm run set-webhook -- https://lab-auto-mail.vercel.app
```

The script reads `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` from
`.env.local`, registers the webhook with `allowed_updates: ["callback_query"]`,
and prints `getWebhookInfo` so you can confirm it took. A webhook persists
server-side at Telegram, so you only re-run this if the URL changes.

## Cron schedule

`vercel.json` runs `/api/cron/morning` daily at **22:00 UTC** = 07:00 JST.
Change the `schedule` cron expression for your timezone (Vercel Cron uses UTC).

## Local dev

```bash
npm run dev
```

### Test the full loop before deploying

The **Send as-is** button is the one leg you can't fake: Telegram can only call a
public HTTPS URL, and the callback id it sends is server-issued. So a true
end-to-end test needs an [ngrok](https://ngrok.com) tunnel that lets Telegram
reach your local dev server. `npm run test-e2e` wires this up in one command.

Open three terminals:

```bash
npm run dev          # 1. Next dev server on :3000
ngrok http 3000      # 2. public HTTPS tunnel to it
npm run test-e2e     # 3. drive the test
```

`test-e2e` then:

1. Checks the dev server is up.
2. Auto-detects the ngrok HTTPS URL (via ngrok's local API at `127.0.0.1:4040`).
3. Points the Telegram webhook at `<tunnel>/api/telegram/webhook`.
4. Triggers `GET /api/cron/morning` with the `Bearer CRON_SECRET` header, exactly
   as Vercel Cron does — running the real Calendar → compose → Telegram path.
5. Prints instructions to press **✅ Send as-is**.

Pressing the button routes Telegram → ngrok → your local webhook handler →
`fetchEventById` → `composeDraft` → a **real** SMTP send. Watch the `npm run dev`
logs and your inbox to confirm.

Useful flags:

```bash
npm run test-e2e -- --port 3001                        # non-default dev port
npm run test-e2e -- --url https://abc.ngrok-free.app   # skip ngrok auto-detect
npm run test-e2e -- --no-cron                          # only (re)point the webhook
```

> **⚠️ Restore production routing when done.** While testing, your bot's webhook
> points at the ngrok tunnel, so production is paused (and breaks once ngrok
> stops). Point it back at prod afterwards:
>
> ```bash
> npm run set-webhook -- https://lab-auto-mail.vercel.app
> ```

### Test just the cron leg

If you only want to exercise the cron push (no button), it works over plain
localhost since it only calls out to Telegram:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/morning
```

## Customizing the email template

Edit `lib/compose.ts`. The function takes a `CalendarEvent` and returns
`{ subject, body }`. Pure template strings — no LLM, no external calls.
