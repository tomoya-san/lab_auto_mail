import crypto from "node:crypto";
import { env } from "./env";
import type { EmailDraft } from "./compose";

export const CALLBACK_PREFIX_SEND_AS_IS = "send:";
export const CALLBACK_PREFIX_CANCEL = "cancel:";

const TELEGRAM_API = "https://api.telegram.org";

type InlineKeyboardButton = { text: string; callback_data: string };

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function callTelegram<T = unknown>(
  method: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(
    `${TELEGRAM_API}/bot${env.telegram.botToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json()) as TelegramApiResponse<T>;
  if (!data.ok) {
    throw new Error(
      `Telegram ${method} failed: ${data.error_code ?? res.status} ${data.description ?? ""}`,
    );
  }
  return data.result as T;
}

export function verifyWebhookSecret(headerValue: string | null): boolean {
  if (!headerValue) return false;
  const expected = env.telegram.webhookSecret();
  const a = Buffer.from(expected);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildReviewText(eventSummary: string, draft: EmailDraft): string {
  const preview =
    draft.body.length > 400 ? `${draft.body.slice(0, 400)}…` : draft.body;
  return [
    `📬 *Morning email draft*`,
    `*${escapeMarkdownV2(eventSummary)}*`,
    ``,
    `*Subject:* ${escapeMarkdownV2(draft.subject)}`,
    ``,
    escapeMarkdownV2(preview),
  ].join("\n");
}

function escapeMarkdownV2(s: string): string {
  return s.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function sendReviewMessage(opts: {
  eventId: string;
  eventSummary: string;
  draft: EmailDraft;
}): Promise<{ messageId: number }> {
  const { eventId, eventSummary, draft } = opts;
  const keyboard: InlineKeyboardButton[][] = [
    [
      {
        text: "✅ Send as-is",
        callback_data: `${CALLBACK_PREFIX_SEND_AS_IS}${eventId}`,
      },
      {
        text: "❌ Do not send",
        callback_data: `${CALLBACK_PREFIX_CANCEL}${eventId}`,
      },
    ],
  ];

  const result = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: env.telegram.chatId(),
    text: buildReviewText(eventSummary, draft),
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: keyboard },
  });
  return { messageId: result.message_id };
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function editMessageAsSent(opts: {
  chatId: number;
  messageId: number;
  subject: string;
}): Promise<void> {
  await callTelegram("editMessageText", {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: `✅ *Sent:* ${escapeMarkdownV2(opts.subject)}`,
    parse_mode: "MarkdownV2",
  });
}

export async function editMessageAsCancelled(opts: {
  chatId: number;
  messageId: number;
  subject: string;
}): Promise<void> {
  await callTelegram("editMessageText", {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: `❌ *Not sent:* ${escapeMarkdownV2(opts.subject)}`,
    parse_mode: "MarkdownV2",
  });
}

export async function sendPlainMessage(text: string): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: env.telegram.chatId(),
    text,
  });
}
