function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requiredInt(name: string): number {
  const v = required(name);
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Env var ${name} must be an integer (got "${v}")`);
  return n;
}

export const env = {
  google: {
    clientId: () => required("GOOGLE_CLIENT_ID"),
    clientSecret: () => required("GOOGLE_CLIENT_SECRET"),
    refreshToken: () => required("GOOGLE_REFRESH_TOKEN"),
    calendarId: () => required("GOOGLE_CALENDAR_ID"),
  },
  smtp: {
    host: () => required("SMTP_HOST"),
    port: () => requiredInt("SMTP_PORT"),
    user: () => required("SMTP_USER"),
    pass: () => required("SMTP_PASS"),
    from: () => required("SMTP_FROM"),
  },
  telegram: {
    botToken: () => required("TELEGRAM_BOT_TOKEN"),
    chatId: () => required("TELEGRAM_CHAT_ID"),
    webhookSecret: () => required("TELEGRAM_WEBHOOK_SECRET"),
  },
  emailRecipient: () => required("EMAIL_RECIPIENT"),
  cronSecret: () => required("CRON_SECRET"),
};
