import type { CalendarConfig } from "../config";
import type { CalendarMoment, CheqroomRecord } from "../types";
import type { CustomerMap } from "./client";

// Cheqroom real status values (confirmed from API):
//   open     = actively checked out (or reserved-not-yet-picked-up for creating orders)
//   creating = draft / being set up; treat as not-yet-confirmed reservation
//   closed   = returned
// Overdue is detected by due < now when status is still open.

function pickStr(record: CheqroomRecord, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = (record as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
}

function hasExplicitOffset(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function getTimeZoneOffsetMs(value: Date, timeZone: string): number {
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
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - value.getTime();
}

function parseCheqroomDate(value: string, config: CalendarConfig): Date | undefined {
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }

  // Cheqroom may return +00:00 while the clock value represents local business time.
  // In that mode, reinterpret the timestamp as wall-clock time in calendarTimezone.
  if (config.cheqroomTimestampsAsLocal && hasExplicitOffset(value)) {
    const offsetMs = getTimeZoneOffsetMs(parsed, config.calendarTimezone);
    return new Date(parsed.getTime() - offsetMs);
  }

  return parsed;
}

function pickDate(record: CheqroomRecord, config: CalendarConfig, ...keys: string[]): Date | undefined {
  for (const k of keys) {
    const v = (record as Record<string, unknown>)[k];
    if (!v) continue;
    const d = parseCheqroomDate(String(v), config);
    if (d) return d;
  }
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

export type NormalizeOptions = {
  config: CalendarConfig;
  customerMap: CustomerMap;
  now?: Date;
};

export function normalizeOrders(records: CheqroomRecord[], opts: NormalizeOptions): CalendarMoment[] {
  const { config, customerMap, now = new Date() } = opts;
  const moments: CalendarMoment[] = [];

  for (const record of records) {
    const status = pickStr(record, "status") ?? "";
    const id = pickStr(record, "_id", "id");

    // Exclude closed and unknown statuses.
    if (status === "closed" || !id) continue;

    const customerId = pickStr(record, "customer");
    const customerInfo = customerId ? customerMap.get(customerId) : undefined;
    const borrowerName = customerInfo?.name;
    const borrowerEmail = customerInfo?.email;
    const itemLabel = pickStr(record, "itemSummary", "name") ?? "Equipment";
    const orderNumber = pickStr(record, "number") ?? id;
    const notes = pickStr(record, "notes");
    const started = pickDate(record, config, "started");
    const due = pickDate(record, config, "due");

    if (status === "creating") {
      // Draft/reservation not yet checked out — create a pickup event at `started` (scheduled).
      // If no start date yet, skip.
      if (!started) continue;
      if (started < config.calendarStartDate) continue;

      const borrowerLabel = borrowerName ?? orderNumber;
      const title = `Pickup: ${itemLabel} - ${borrowerLabel}`;
      moments.push({
        id: `cheqroom-reservation-${id}-pickup@soa-equipment`,
        type: "pickup",
        isOverdue: false,
        title,
        start: started,
        end: addMinutes(started, config.eventDurationMinutes),
        borrowerName,
        borrowerEmail,
        itemNames: [itemLabel],
        sourceType: "reservation",
        sourceId: id,
        status,
        notes: buildDescription("pickup", borrowerName, borrowerEmail, itemLabel, orderNumber, false, notes)
      });
      continue;
    }

    if (status === "open") {
      // Active checkout — create a drop-off event at the due date.
      if (!due) {
        console.warn(`[calendar] Open order ${orderNumber} has no due date — skipping.`);
        continue;
      }
      // Do NOT filter open orders by calendarStartDate: if the equipment is still out,
      // it must appear in the calendar even if due date is in the past.
      const isOverdue = due < now;
      const borrowerLabel = borrowerName ?? orderNumber;
      const title = isOverdue
        ? `🔥 Overdue Drop Off: ${itemLabel} - ${borrowerLabel}`
        : `Drop Off: ${itemLabel} - ${borrowerLabel}`;

      moments.push({
        id: `cheqroom-checkout-${id}-dropoff@soa-equipment`,
        type: "dropoff",
        isOverdue,
        title,
        start: due,
        end: addMinutes(due, config.eventDurationMinutes),
        borrowerName,
        borrowerEmail,
        itemNames: [itemLabel],
        sourceType: "checkout",
        sourceId: id,
        status,
        notes: buildDescription("dropoff", borrowerName, borrowerEmail, itemLabel, orderNumber, isOverdue, notes)
      });
    }
  }

  return moments;
}

function buildDescription(
  type: "pickup" | "dropoff",
  borrowerName: string | undefined,
  borrowerEmail: string | undefined,
  itemLabel: string,
  orderNumber: string,
  isOverdue: boolean,
  notes: string | undefined
): string {
  const lines = [
    `Type: ${type === "pickup" ? "Pickup" : "Drop Off"}`,
    `Order: ${orderNumber}`,
    `Item(s): ${itemLabel}`
  ];
  if (borrowerName) lines.push(`Borrower: ${borrowerName}`);
  if (borrowerEmail) lines.push(`Email: ${borrowerEmail}`);
  if (isOverdue) lines.push("Status: OVERDUE");
  if (notes) lines.push(`Notes: ${notes}`);
  return lines.join("\\n");
}

// --- Legacy exports kept for backwards compat with tests ---
export function normalizeReservations(records: CheqroomRecord[], config: CalendarConfig): CalendarMoment[] {
  return normalizeOrders(records, { config, customerMap: new Map() });
}

export function normalizeCheckouts(records: CheqroomRecord[], config: CalendarConfig): CalendarMoment[] {
  return normalizeOrders(records, { config, customerMap: new Map() });
}
