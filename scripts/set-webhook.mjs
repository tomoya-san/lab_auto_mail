// Register (or update) the Telegram webhook so callback_query updates from the
// "Send as-is" button reach this app.
//
// You only need to run this:
//   - once after a prod deploy (against your *.vercel.app domain), or
//   - each time your local ngrok tunnel URL changes.
//
// Usage (requires Node >= 20.6 for --env-file support):
//
//   node --env-file=.env.local scripts/set-webhook.mjs <base-url>
//
// or via the npm script:
//
//   npm run set-webhook -- https://lab-auto-mail.vercel.app
//   npm run set-webhook -- https://abc123.ngrok-free.app
//
// <base-url> is the origin only (no path). The script appends
// /api/telegram/webhook for you.
//
// Prereqs:
//   - TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in .env.local.

const WEBHOOK_PATH = "/api/telegram/webhook";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name} (run with --env-file=.env.local)`);
    process.exit(1);
  }
  return v;
}

const token = required("TELEGRAM_BOT_TOKEN");
const secret = required("TELEGRAM_WEBHOOK_SECRET");

const baseArg = process.argv[2];
if (!baseArg) {
  console.error(
    "Usage: npm run set-webhook -- <base-url>\n" +
      "  e.g. npm run set-webhook -- https://lab-auto-mail.vercel.app",
  );
  process.exit(1);
}

let base;
try {
  base = new URL(baseArg);
} catch {
  console.error(`Not a valid URL: ${baseArg}`);
  process.exit(1);
}

if (base.protocol !== "https:") {
  console.error(
    `Telegram only accepts HTTPS webhook URLs (got "${base.protocol}//").`,
  );
  process.exit(1);
}

const webhookUrl = `${base.origin}${WEBHOOK_PATH}`;

async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(
      `${method} failed: ${res.status} ${JSON.stringify(data)}`,
    );
  }
  return data.result;
}

console.log(`\nSetting webhook to ${webhookUrl} …\n`);

try {
  await callTelegram("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["callback_query"],
  });
  console.log("✅ Webhook set.\n");

  const info = await callTelegram("getWebhookInfo");
  console.log("Current webhook info:");
  console.log(JSON.stringify(info, null, 2));
  console.log();
} catch (err) {
  console.error("\n❌ Failed:\n", err.message ?? err);
  process.exit(1);
}

process.exit(0);
