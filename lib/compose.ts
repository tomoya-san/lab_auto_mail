import type { CalendarEvent } from "./calendar";

export type EmailDraft = {
  subject: string;
  body: string;
};

export function composeDraft(event: CalendarEvent): EmailDraft {
  const subject = `[Lab] ${event.summary}`;
  const body = [
    `Hi,`,
    ``,
    `Today's item: ${event.summary}`,
    ``,
    event.description || "(no description)",
    ``,
    `Best,`,
  ].join("\n");
  return { subject, body };
}
