import { http, HttpResponse } from "msw";
import type { CalendarEvent } from "./schema.ts";

const BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/:calendarId/events";

const defaultEvents: CalendarEvent[] = [
  { summary: "Test Event", start: { dateTime: "2024-01-15T10:00:00" } },
];

export const calendarSuccess = (events: CalendarEvent[] = defaultEvents) =>
  http.get(BASE_URL, () => HttpResponse.json({ items: events }));

export const calendarEmpty = () => calendarSuccess([]);

export const calendarError = (status: number) =>
  http.get(BASE_URL, () => HttpResponse.json({ error: { message: "Error" } }, { status }));

export const calendarUnauthorized = () => calendarError(401);

export const calendarWithEvents = (...events: CalendarEvent[]) => calendarSuccess(events);
