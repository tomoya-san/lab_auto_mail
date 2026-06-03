import { google } from "googleapis";
import { env } from "./env";
import { getOAuth2Client } from "./google-auth";

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
};

export async function fetchTodaysEvents(now = new Date()): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: "v3", auth: getOAuth2Client() });

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const res = await calendar.events.list({
    calendarId: env.google.calendarId(),
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items ?? []).map((e) => ({
    id: e.id ?? "",
    summary: e.summary ?? "",
    description: e.description ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
  }));
}

export async function fetchEventById(eventId: string): Promise<CalendarEvent | null> {
  const calendar = google.calendar({ version: "v3", auth: getOAuth2Client() });
  const res = await calendar.events.get({
    calendarId: env.google.calendarId(),
    eventId,
  });
  const e = res.data;
  if (!e?.id) return null;
  return {
    id: e.id,
    summary: e.summary ?? "",
    description: e.description ?? "",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
  };
}
