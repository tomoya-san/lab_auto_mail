import type { CalendarEvent } from "./calendar";

export type EmailDraft = {
  subject: string;
  body: string;
};

const TIME_ZONE = "Asia/Tokyo";

function formatParts(iso: string) {
  const date = new Date(iso);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...options }).format(date);
  return {
    month: format({ month: "numeric" }),
    day: format({ day: "numeric" }),
    time: format({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

export function composeDraft(event: CalendarEvent): EmailDraft {
  const start = formatParts(event.start);
  const end = formatParts(event.end);

  const subject = `Regular Meeting (${start.month}/${start.day})`;
  const body = [
    `Dear all,`,
    ``,
    `Today's lab meeting will be held as follows:`,
    ``,
    `- Time: ${start.time} - ${end.time}`,
    `- Place: ${event.location || "(TBD)"}`,
    `- Presenter: ${event.summary}`,
    ``,
    event.description || "(no description)",
    ``,
    `Best,`,
    `Tomoya Tanabu`,
  ].join("\n");
  return { subject, body };
}
