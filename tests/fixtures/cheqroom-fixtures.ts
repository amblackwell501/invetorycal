import type { CheqroomRecord } from "../../src/types";

// Real Cheqroom v2.5 field shapes (confirmed from live API):
//   status: "open" | "creating" | "closed"
//   started: ISO date — when equipment was picked up
//   due: ISO date — when equipment must be returned
//   customer: customer ID string (resolved via customerMap in tests)
//   itemSummary: human-readable item names

// Creating (draft/reservation not yet picked up) — past calendarStartDate so it appears
export const reservationCreating: CheqroomRecord = {
  _id: "res-1",
  status: "creating",
  started: "2026-04-10T14:00:00.000Z",  // scheduled pickup time
  due: "2026-04-17T14:00:00.000Z",
  customer: "cust-1",
  itemSummary: "Canon C70",
  number: "CHECK-OUT-001"
};

// Open (actively checked out) — due in the future, so NOT overdue
export const checkoutOpen: CheqroomRecord = {
  _id: "co-1",
  status: "open",
  started: "2026-04-06T09:00:00.000Z",
  due: "2026-04-30T16:30:00.000Z",
  customer: "cust-2",
  itemSummary: "Zoom F8",
  number: "CHECK-OUT-002"
};

// Open, but due date is in the past — should be treated as overdue
export const checkoutOverdue: CheqroomRecord = {
  _id: "co-1",
  status: "open",
  started: "2026-04-06T09:00:00.000Z",
  due: "2026-04-07T16:30:00.000Z",  // past due
  customer: "cust-2",
  itemSummary: "Zoom F8",
  number: "CHECK-OUT-002"
};

// Closed — should be excluded from calendar
export const orderClosed: CheqroomRecord = {
  _id: "order-closed",
  status: "closed",
  started: "2026-04-05T14:00:00.000Z",
  due: "2026-04-12T14:00:00.000Z",
  customer: "cust-1",
  itemSummary: "Some Gear"
};

// Unknown status — should be excluded
export const orderUnknown: CheqroomRecord = {
  _id: "order-unknown",
  status: "archived",
  started: "2026-04-05T14:00:00.000Z",
  due: "2026-04-12T14:00:00.000Z",
  customer: "cust-1",
  itemSummary: "Some Gear"
};

export const testCustomerMap = new Map([
  ["cust-1", { name: "Alex Artist", email: "alex@example.edu" }],
  ["cust-2", { name: "Jordan Borrower", email: "jordan@example.edu" }]
]);
