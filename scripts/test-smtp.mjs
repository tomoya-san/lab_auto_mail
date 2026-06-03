// One-off SMTP smoke test. Verifies the connection + auth, then optionally
// sends a real test email.
//
// Usage (Node >= 20.6 for --env-file):
//
//   node --env-file=.env.local scripts/test-smtp.mjs           # verify only
//   node --env-file=.env.local scripts/test-smtp.mjs --send     # also send a test email
//
// or via npm:
//
//   npm run test-smtp
//   npm run test-smtp -- --send

import nodemailer from "nodemailer";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name} (run with --env-file=.env.local)`);
    process.exit(1);
  }
  return v;
}

const host = required("SMTP_HOST");
const port = Number(required("SMTP_PORT"));
const user = required("SMTP_USER");
const pass = required("SMTP_PASS");
const from = required("SMTP_FROM");
const to = process.env.EMAIL_RECIPIENT || from;

const transport = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
  // Surface negotiation details so connection/TLS issues are obvious.
  logger: true,
  debug: true,
});

console.log(`\nConnecting to ${host}:${port} (secure=${port === 465}) as ${user}…\n`);

try {
  await transport.verify();
  console.log("\n✅ SMTP connection + auth OK.\n");
} catch (err) {
  console.error("\n❌ SMTP verify failed:\n", err);
  process.exit(1);
}

if (process.argv.includes("--send")) {
  console.log(`Sending a test email from ${from} to ${to}…\n`);
  const info = await transport.sendMail({
    from,
    to,
    subject: "lab_auto_mail SMTP test",
    text: "If you can read this, SMTP sending works.",
  });
  console.log(`✅ Sent. messageId=${info.messageId}\n`);
}

process.exit(0);
