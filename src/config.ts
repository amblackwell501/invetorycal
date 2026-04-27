type CalendarConfig = {
  cheqroomApiKey: string;
  cheqroomLinkedUserId: string;
  cheqroomUserId?: string;
  cheqroomBaseUrl: string;
  cheqroomTimestampsAsLocal: boolean;
  calendarFeedSecret: string;
  calendarTimezone: string;
  eventDurationMinutes: number;
  calendarStartDate: Date;
  refreshMinutes: number;
  lookaheadDays: number;
  port: number;
  nodeEnv: string;
};

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function readDate(name: string, fallbackIsoDate: string): Date {
  const raw = process.env[name] ?? fallbackIsoDate;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${name}: ${raw}`);
  }
  return date;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function getConfig(): CalendarConfig {
  return {
    cheqroomApiKey: readRequired("CHEQROOM_API_KEY"),
    cheqroomLinkedUserId: readRequired("CHEQROOM_LINKED_USER_ID"),
    cheqroomUserId: process.env.CHEQROOM_USER_ID?.trim() || undefined,
    cheqroomBaseUrl: (process.env.CHEQROOM_BASE_URL || "https://api.cheqroom.com/api/v2_5").replace(/\/$/, ""),
    cheqroomTimestampsAsLocal: readBoolean("CHEQROOM_TIMESTAMPS_AS_LOCAL", true),
    calendarFeedSecret: readRequired("CALENDAR_FEED_SECRET"),
    calendarTimezone: process.env.CALENDAR_TIMEZONE || "America/Chicago",
    eventDurationMinutes: readNumber("CALENDAR_EVENT_DURATION_MINUTES", 5),
    calendarStartDate: readDate("CALENDAR_START_DATE", "2026-04-01"),
    refreshMinutes: readNumber("CALENDAR_REFRESH_MINUTES", 60),
    lookaheadDays: readNumber("CALENDAR_LOOKAHEAD_DAYS", 365),
    port: readNumber("PORT", 3000),
    nodeEnv: process.env.NODE_ENV || "development"
  };
}

export type { CalendarConfig };
