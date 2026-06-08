import { NextResponse } from "next/server";
import { fetchEventById } from "@/lib/calendar";
import { composeDraft } from "@/lib/compose";
import { sendEmail } from "@/lib/mailer";
import {
  CALLBACK_PREFIX_CANCEL,
  CALLBACK_PREFIX_SEND_AS_IS,
  answerCallbackQuery,
  editMessageAsCancelled,
  editMessageAsSent,
  sendPlainMessage,
  verifyWebhookSecret,
} from "@/lib/telegram";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

export async function POST(request: Request) {
  if (
    !verifyWebhookSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
    )
  ) {
    return new NextResponse("Invalid secret", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const cq = update.callback_query;
  if (!cq) {
    return NextResponse.json({ ok: true });
  }

  const allowedChatId = Number(env.telegram.chatId());
  if (cq.from.id !== allowedChatId) {
    await answerCallbackQuery(cq.id, "Not authorized").catch(() => {});
    return NextResponse.json({ ok: true });
  }

  try {
    const data = cq.data ?? "";
    const isSend = data.startsWith(CALLBACK_PREFIX_SEND_AS_IS);
    const isCancel = data.startsWith(CALLBACK_PREFIX_CANCEL);
    if (!isSend && !isCancel) {
      await answerCallbackQuery(cq.id);
      return NextResponse.json({ ok: true });
    }

    const eventId = data.slice(
      (isSend ? CALLBACK_PREFIX_SEND_AS_IS : CALLBACK_PREFIX_CANCEL).length,
    );
    const event = await fetchEventById(eventId);
    if (!event) {
      await answerCallbackQuery(cq.id, "Event not found");
      return NextResponse.json({ ok: true });
    }

    const draft = composeDraft(event);

    if (isCancel) {
      await answerCallbackQuery(cq.id, "Not sent");
      if (cq.message) {
        await editMessageAsCancelled({
          chatId: cq.message.chat.id,
          messageId: cq.message.message_id,
          subject: draft.subject,
        }).catch(() => {});
      }
      return NextResponse.json({ ok: true });
    }

    await sendEmail(draft);
    await answerCallbackQuery(cq.id, "Sent");
    if (cq.message) {
      await editMessageAsSent({
        chatId: cq.message.chat.id,
        messageId: cq.message.message_id,
        subject: draft.subject,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram/webhook] failed", err);
    await answerCallbackQuery(
      cq.id,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
    ).catch(() => {});
    await sendPlainMessage(
      `Send failed: ${err instanceof Error ? err.message : String(err)}`,
    ).catch(() => {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
