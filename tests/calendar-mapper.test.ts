import { describe, expect, it } from "vitest";
import { normalizeOrders } from "../src/cheqroom/mapper";
import {
  reservationCreating,
  checkoutOpen,
  checkoutOverdue,
  orderClosed,
  orderUnknown,
  testCustomerMap
} from "./fixtures/cheqroom-fixtures";
import type { CalendarConfig } from "../src/config";

const config: CalendarConfig = {
  cheqroomApiKey: "redacted",
  cheqroomLinkedUserId: "linked-user",
  cheqroomUserId: "user",
  cheqroomBaseUrl: "https://api.cheqroom.com/api/v2_5",
  calendarFeedSecret: "test-secret",
  calendarTimezone: "America/Chicago",
  eventDurationMinutes: 5,
  calendarStartDate: new Date("2026-04-01T00:00:00.000Z"),
  refreshMinutes: 60,
  lookaheadDays: 365,
  port: 3000,
  nodeEnv: "test"
};

const opts = { config, customerMap: testCustomerMap };
// Fixed "now" in the past so checkoutOverdue (due 2026-04-07) is always overdue.
const pastNow = new Date("2026-04-27T00:00:00.000Z");
// Future "now" so checkoutOpen (due 2026-04-30) is not overdue.
const futureNow = new Date("2026-04-25T00:00:00.000Z");

describe("reservation mapping (creating status)", () => {
  it("creates pickup event for creating status", () => {
    const events = normalizeOrders([reservationCreating], opts);
    expect(events).toHaveLength(1);
    expect(events[0].title).toContain("Pickup:");
    expect(events[0].type).toBe("pickup");
    expect(events[0].sourceType).toBe("reservation");
  });

  it("includes borrower name in pickup event", () => {
    const [event] = normalizeOrders([reservationCreating], opts);
    expect(event.borrowerName).toBe("Alex Artist");
    expect(event.borrowerEmail).toBe("alex@example.edu");
  });

  it("includes item name from itemSummary", () => {
    const [event] = normalizeOrders([reservationCreating], opts);
    expect(event.itemNames[0]).toBe("Canon C70");
  });
});

describe("checkout mapping (open status)", () => {
  it("creates drop-off event for open (non-overdue) checkout", () => {
    const events = normalizeOrders([checkoutOpen], { ...opts, now: futureNow });
    expect(events).toHaveLength(1);
    expect(events[0].title).toContain("Drop Off:");
    expect(events[0].type).toBe("dropoff");
    expect(events[0].isOverdue).toBe(false);
  });

  it("creates overdue drop-off with flame when due date has passed", () => {
    const events = normalizeOrders([checkoutOverdue], { ...opts, now: pastNow });
    expect(events).toHaveLength(1);
    expect(events[0].title.startsWith("🔥 Overdue Drop Off:")).toBe(true);
    expect(events[0].isOverdue).toBe(true);
    expect(events[0].notes).toContain("OVERDUE");
  });

  it("includes borrower name and email in drop-off event", () => {
    const [event] = normalizeOrders([checkoutOpen], { ...opts, now: futureNow });
    expect(event.borrowerName).toBe("Jordan Borrower");
    expect(event.borrowerEmail).toBe("jordan@example.edu");
  });
});

describe("excluded statuses", () => {
  it("excludes closed orders", () => {
    const events = normalizeOrders([orderClosed], opts);
    expect(events).toHaveLength(0);
  });

  it("excludes unknown/archived orders", () => {
    const events = normalizeOrders([orderUnknown], opts);
    expect(events).toHaveLength(0);
  });
});

describe("duration and UID", () => {
  it("creates exactly 5-minute events", () => {
    const [pickup] = normalizeOrders([reservationCreating], opts);
    const [dropoff] = normalizeOrders([checkoutOpen], { ...opts, now: futureNow });
    expect((pickup.end.getTime() - pickup.start.getTime()) / 60000).toBe(5);
    expect((dropoff.end.getTime() - dropoff.start.getTime()) / 60000).toBe(5);
  });

  it("keeps UID stable regardless of overdue state (same order ID)", () => {
    const [notOverdue] = normalizeOrders([checkoutOpen], { ...opts, now: futureNow });
    const [overdue] = normalizeOrders([checkoutOverdue], { ...opts, now: pastNow });
    // Both have _id: "co-1"
    expect(notOverdue.id).toBe(overdue.id);
    expect(notOverdue.title).not.toBe(overdue.title);
  });
});
