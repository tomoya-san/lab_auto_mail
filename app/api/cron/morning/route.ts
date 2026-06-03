import { NextResponse } from "next/server";
import { fetchTodaysEvents } from "@/lib/calendar";
import { composeDraft } from "@/lib/compose";
import { sendReviewMessage } from "@/lib/telegram";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const events = await fetchTodaysEvents();
    if (events.length === 0) {
      return NextResponse.json({ ok: true, posted: 0 });
    }

    let posted = 0;
    for (const event of events) {
      const draft = composeDraft(event);
      await sendReviewMessage({
        eventId: event.id,
        eventSummary: event.summary,
        draft,
      });
      posted++;
    }

    return NextResponse.json({ ok: true, posted });
  } catch (err) {
    console.error("[cron/morning] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
