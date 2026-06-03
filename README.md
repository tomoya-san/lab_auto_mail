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

### 5. Deploy

```bash
vercel deploy --prod
```

### 6. Register the Telegram webhook

After the first prod deploy, point Telegram at the webhook (one-time). Replace
`<your-domain>` with your production origin, e.g. `lab-auto-mail.vercel.app`:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://<your-domain>/api/telegram/webhook\",
    \"secret_token\": \"$TELEGRAM_WEBHOOK_SECRET\",
    \"allowed_updates\": [\"callback_query\"]
  }"
```

Confirm with `curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo`.

## Cron schedule

`vercel.json` runs `/api/cron/morning` daily at **22:00 UTC** = 07:00 JST.
Change the `schedule` cron expression for your timezone (Vercel Cron uses UTC).

## Local dev

```bash
npm run dev
```

To test the cron endpoint locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/morning
```

The cron push works over plain localhost (it only calls out to Telegram). To
test the **Send as-is** button locally, Telegram needs to reach your machine
over HTTPS: run `ngrok http 3000` and re-run `setWebhook` against the ngrok URL.

## Customizing the email template

Edit `lib/compose.ts`. The function takes a `CalendarEvent` and returns
`{ subject, body }`. Pure template strings — no LLM, no external calls.
