// Full end-to-end test of the morning-mail loop against your LOCAL dev server,
// using an ngrok tunnel so the Telegram "Send as-is" button reaches localhost.
//
// What it exercises (the real route handlers, not a re-implementation):
//   1. cron:    GET /api/cron/morning  → Calendar → compose → Telegram review
//   2. webhook: button press → ngrok → POST /api/telegram/webhook → SMTP send
//
// Prereqs (two terminals):
//   - `npm run dev`            (Next dev server on :3000)
//   - `ngrok http 3000`        (public HTTPS tunnel to the dev server)
//
// Usage (Node >= 20.6 for --env-file):
//   npm run test-e2e                                  # auto-detect ngrok URL
//   npm run test-e2e -- --url https://abc.ngrok-free.app   # or pass it explicitly
//   npm run test-e2e -- --port 3001                   # dev server on a non-default port
//   npm run test-e2e -- --no-cron                     # only (re)point the webhook
//   npm run test-e2e -- --restore https://lab-auto-mail.vercel.app
//
// IMPORTANT: while this runs, your bot's webhook points at the ngrok tunnel, so
// production is effectively paused. When you're done, restore it to prod:
//   npm run set-webhook -- https://lab-auto-mail.vercel.app
// (or pass --restore <prod-url> to this script).

const WEBHOOK_PATH = "/api/telegram/webhook";
const CRON_PATH = "/api/cron/morning";
const NGROK_API = "http://127.0.0.1:4040/api/tunnels";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name} (run with --env-file=.env.local)`);
    process.exit(1);
  }
  return v;
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (flag) => process.argv.includes(flag);

const token = required("TELEGRAM_BOT_TOKEN");
const secret = required("TELEGRAM_WEBHOOK_SECRET");
const cronSecret = required("CRON_SECRET");

const port = argValue("--port") ?? "3000";
const localBase = `http://localhost:${port}`;
const restoreUrl = argValue("--restore");
const skipCron = hasFlag("--no-cron");

async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function detectNgrokUrl() {
  const explicit = argValue("--url");
  if (explicit) return explicit;
  try {
    const res = await fetch(NGROK_API);
    const data = await res.json();
    const https = (data.tunnels ?? []).find((t) =>
      t.public_url?.startsWith("https://"),
    );
    if (!https) throw new Error("no https tunnel found");
    return https.public_url;
  } catch (err) {
    console.error(
      `\n❌ Could not auto-detect an ngrok tunnel (${err.message ?? err}).\n` +
        `   Start one with:  ngrok http ${port}\n` +
        `   …or pass the URL: npm run test-e2e -- --url https://<id>.ngrok-free.app\n`,
    );
    process.exit(1);
  }
}

async function assertDevServerUp() {
  try {
    await fetch(localBase, { method: "HEAD" });
  } catch {
    console.error(
      `\n❌ Dev server not reachable at ${localBase}.\n` +
        `   Start it with:  npm run dev${port !== "3000" ? ` (on port ${port})` : ""}\n`,
    );
    process.exit(1);
  }
}

// --- Restore-only mode ----------------------------------------------------
if (restoreUrl && skipCron) {
  const url = `${new URL(restoreUrl).origin}${WEBHOOK_PATH}`;
  console.log(`\nRestoring webhook to ${url} …\n`);
  await callTelegram("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["callback_query"],
  });
  console.log("✅ Webhook restored.\n");
  process.exit(0);
}

// --- Full e2e -------------------------------------------------------------
await assertDevServerUp();
const tunnel = await detectNgrokUrl();
const webhookUrl = `${new URL(tunnel).origin}${WEBHOOK_PATH}`;

console.log(`\nDev server : ${localBase}`);
console.log(`Tunnel     : ${tunnel}`);
console.log(`Webhook    : ${webhookUrl}\n`);

// 1) Point Telegram at the tunnel so the button reaches localhost.
console.log("→ Pointing Telegram webhook at the tunnel…");
await callTelegram("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ["callback_query"],
});
const info = await callTelegram("getWebhookInfo");
console.log(`✅ Webhook set (pending_update_count=${info.pending_update_count}).\n`);

// 2) Trigger the cron route exactly as Vercel Cron would (Bearer auth).
if (!skipCron) {
  console.log("→ Triggering cron (GET " + CRON_PATH + ")…");
  const res = await fetch(`${localBase}${CRON_PATH}`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`\n❌ Cron returned ${res.status}: ${text}\n`);
    process.exit(1);
  }
  console.log(`✅ Cron responded ${res.status}: ${text}\n`);
}

console.log("───────────────────────────────────────────────────────────");
console.log("Now open Telegram and press “✅ Send as-is” on the draft.");
console.log("The button → ngrok → your local dev server → a REAL email send.");
console.log("Watch your `npm run dev` logs and your inbox to confirm.");
console.log("───────────────────────────────────────────────────────────\n");
console.log("⚠️  When finished, restore production routing:");
console.log("    npm run set-webhook -- https://lab-auto-mail.vercel.app\n");

process.exit(0);
