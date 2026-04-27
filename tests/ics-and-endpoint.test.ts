import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildCalendar } from "../src/calendar/ics";
import { createApp } from "../src/app";
import { CalendarFeedService } from "../src/calendar/service";
import type { CalendarConfig } from "../src/config";
import type { CalendarMoment } from "../src/types";

const config: CalendarConfig = {
  cheqroomApiKey: "redacted",
  cheqroomLinkedUserId: "linked-user",
  cheqroomUserId: "user",
  cheqroomBaseUrl: "https://api.cheqroom.com/api/v2_5",
  calendarFeedSecret: "token123",
  calendarTimezone: "America/Chicago",
  eventDurationMinutes: 5,
  calendarStartDate: new Date("2026-04-01T00:00:00.000Z"),
  refreshMinutes: 60,
  lookaheadDays: 365,
  port: 3000,
  nodeEnv: "test"
};

const sampleMoment: CalendarMoment = {
  id: "cheqroom-reservation-res-1-pickup@soa-equipment",
  type: "pickup",
  isOverdue: false,
  title: "Pickup: Canon C70 - Alex Artist",
  start: new Date("2026-04-05T14:00:00.000Z"),
  end: new Date("2026-04-05T14:05:00.000Z"),
  borrowerName: "Alex Artist",
  borrowerEmail: "alex@example.edu",
  itemNames: ["Canon C70"],
  sourceType: "reservation",
  sourceId: "res-1",
  status: "Reserved",
  notes: "Type: Pickup"
};

class StubService {
  constructor(private readonly text: string) {}

  async getCalendarText(): Promise<string> {
    return this.text;
  }

  startBackgroundRefresh(): NodeJS.Timeout {
    return setInterval(() => undefined, 1000000);
  }
}

class EmptyCheqroomClient {
  async fetchReservations(): Promise<[]> {
    return [];
  }

  async fetchCheckouts(): Promise<[]> {
    return [];
  }
}

class FailingCheqroomClient {
  async fetchReservations(): Promise<[]> {
    throw new Error("boom");
  }

  async fetchCheckouts(): Promise<[]> {
    throw new Error("boom");
  }
}

describe("ics generator", () => {
  it("adds OPAQUE and Outlook busy fields", () => {
    const ics = buildCalendar([sampleMoment], config);
    expect(ics).toContain("TRANSP:OPAQUE");
    expect(ics).toContain("X-MICROSOFT-CDO-BUSYSTATUS:BUSY");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("returns valid VCALENDAR for empty input", () => {
    const ics = buildCalendar([], config);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics.includes("BEGIN:VEVENT")).toBe(false);
  });
});

describe("service fallback", () => {
  it("returns empty but valid calendar when first refresh fails", async () => {
    const service = new CalendarFeedService(config, new FailingCheqroomClient() as never);
    const text = await service.getCalendarText();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
  });

  it("returns valid calendar for empty cheqroom response", async () => {
    const service = new CalendarFeedService(config, new EmptyCheqroomClient() as never);
    const text = await service.getCalendarText();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("END:VCALENDAR");
  });
});

describe("endpoints", () => {
  it("protects calendar URLs with token", async () => {
    const app = createApp(config, new StubService("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n") as unknown as CalendarFeedService);
    const missing = await request(app).get("/calendar/cheqroom-reservations.ics");
    const wrong = await request(app).get("/calendar/cheqroom-reservations.ics?token=bad");
    expect([401, 403]).toContain(missing.status);
    expect([401, 403]).toContain(wrong.status);
  });

  it("returns identical content for .ics and .ical", async () => {
    const payload = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const app = createApp(config, new StubService(payload) as unknown as CalendarFeedService);

    const ics = await request(app).get("/calendar/cheqroom-reservations.ics?token=token123");
    const ical = await request(app).get("/calendar/cheqroom-reservations.ical?token=token123");

    expect(ics.status).toBe(200);
    expect(ical.status).toBe(200);
    expect(ics.text).toBe(ical.text);
  });
});
