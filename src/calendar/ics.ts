import type { CalendarConfig } from "../config";
import type { CalendarMoment } from "../types";

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUtc(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`;
}

function formatInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}T${map.hour}${map.minute}${map.second}`;
}

export function buildCalendar(moments: CalendarMoment[], config: CalendarConfig): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//School of Art Equipment Checkout//Cheqroom Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SoA Equipment Checkout",
    `X-WR-TIMEZONE:${config.calendarTimezone}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${config.refreshMinutes >= 60 ? `${Math.round(config.refreshMinutes / 60)}H` : `${config.refreshMinutes}M`}`,
    `X-PUBLISHED-TTL:PT${config.refreshMinutes >= 60 ? `${Math.round(config.refreshMinutes / 60)}H` : `${config.refreshMinutes}M`}`
  ];

  for (const moment of moments) {
    const modified = formatUtc(now);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(moment.id)}`);
    lines.push(`DTSTAMP:${formatUtc(now)}`);
    lines.push(`DTSTART;TZID=${config.calendarTimezone}:${formatInTimeZone(moment.start, config.calendarTimezone)}`);
    lines.push(`DTEND;TZID=${config.calendarTimezone}:${formatInTimeZone(moment.end, config.calendarTimezone)}`);
    lines.push(`SUMMARY:${escapeIcsText(moment.title)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(moment.notes || "")}`);
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("X-MICROSOFT-CDO-BUSYSTATUS:BUSY");
    lines.push(`LAST-MODIFIED:${modified}`);
    lines.push(`SEQUENCE:${moment.isOverdue ? 1 : 0}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
