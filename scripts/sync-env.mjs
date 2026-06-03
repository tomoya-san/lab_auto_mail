// Push the app's runtime secrets from .env.local into the linked Vercel
// project's PRODUCTION environment, so the deployed functions can read them at
// request time. (GitHub Actions secrets are NOT visible at Vercel runtime —
// these have to live in the Vercel project.)
//
// Idempotent: each var is removed (if present) and re-added, so re-running
// after editing .env.local just overwrites.
//
// Prereqs:
//   - `vercel link` has been run (so .vercel/project.json exists), AND
//   - a VERCEL_TOKEN is exported (create one at Vercel → Account Settings →
//     Tokens). Pass it via the environment, e.g.:
//
//       VERCEL_TOKEN=xxxxx npm run sync-env
//
// Usage:
//   VERCEL_TOKEN=xxxxx node --env-file=.env.local scripts/sync-env.mjs
//   VERCEL_TOKEN=xxxxx node --env-file=.env.local scripts/sync-env.mjs --dry-run

import { spawnSync } from "node:child_process";

// The exact set of runtime vars the app needs in production. CRON_SECRET is
// included so Vercel Cron can authenticate to /api/cron/morning.
const KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_ID",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "EMAIL_RECIPIENT",
  "CRON_SECRET",
];

const ENVIRONMENT = "production";
const dryRun = process.argv.includes("--dry-run");

if (!process.env.VERCEL_TOKEN) {
  console.error(
    "Missing VERCEL_TOKEN. Create one at Vercel → Account Settings → Tokens,\n" +
      "then run:  VERCEL_TOKEN=xxxxx npm run sync-env",
  );
  process.exit(1);
}

// Pass --token explicitly so this works without an interactive `vercel login`.
const TOKEN_ARGS = ["--token", process.env.VERCEL_TOKEN];

function vercel(args, { input } = {}) {
  return spawnSync("vercel", args, {
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
}

// Fail fast if the project isn't linked yet.
const who = vercel(["whoami", ...TOKEN_ARGS]);
if (who.status !== 0) {
  console.error("`vercel whoami` failed — is VERCEL_TOKEN valid?\n", who.stderr);
  process.exit(1);
}

const missing = KEYS.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `These vars are not set in .env.local (run with --env-file=.env.local):\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}

console.log(
  `\nSyncing ${KEYS.length} vars to Vercel "${ENVIRONMENT}"${dryRun ? " (dry run)" : ""}…\n`,
);

for (const key of KEYS) {
  const value = process.env[key];
  if (dryRun) {
    console.log(`would set ${key} (${value.length} chars)`);
    continue;
  }

  // Remove first so the add never errors on an existing var. Ignore failures
  // (the var may simply not exist yet).
  vercel(["env", "rm", key, ENVIRONMENT, "--yes", ...TOKEN_ARGS]);

  const add = vercel(["env", "add", key, ENVIRONMENT, ...TOKEN_ARGS], {
    input: value,
  });
  if (add.status !== 0) {
    console.error(`❌ failed to set ${key}:\n${add.stderr}`);
    process.exit(1);
  }
  console.log(`✅ ${key}`);
}

console.log(
  dryRun
    ? "\nDry run complete — nothing was changed.\n"
    : "\nDone. Trigger a redeploy for the new values to take effect.\n",
);
