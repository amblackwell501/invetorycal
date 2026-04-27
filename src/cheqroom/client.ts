import type { CalendarConfig } from "../config";
import type { CheqroomRecord } from "../types";

export type CustomerMap = Map<string, { name: string; email?: string }>;

export class CheqroomClient {
  private readonly baseUrl: string;
  private readonly userScope: string;
  private readonly apiKey: string;

  constructor(private readonly config: CalendarConfig) {
    this.baseUrl = config.cheqroomBaseUrl;
    this.userScope = config.cheqroomLinkedUserId;
    this.apiKey = config.cheqroomApiKey;
  }

  private url(collection: string): string {
    return `${this.baseUrl}/${this.userScope}/x/jwt/${collection}`;
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cheqroom ${response.status}: ${body.slice(0, 300)}`);
    }
    return response.json();
  }

  private async paginate(collection: string, params: Record<string, string | number>): Promise<CheqroomRecord[]> {
    const pageSize = 100;
    let skip = 0;
    const rows: CheqroomRecord[] = [];
    const base = this.url(collection);

    while (true) {
      const u = new URL(base);
      for (const [k, v] of Object.entries({ ...params, _limit: pageSize, _skip: skip })) {
        u.searchParams.set(k, String(v));
      }
      const payload = await this.getJson(u.toString());
      if (!Array.isArray(payload)) {
        console.warn(`[calendar] ${collection}: unexpected payload shape.`);
        break;
      }
      rows.push(...(payload as CheqroomRecord[]));
      if (payload.length < pageSize) break;
      skip += pageSize;
    }
    return rows;
  }

  // Fetch only open/active orders. Status "open" covers currently checked-out equipment.
  // We also request "creating" to include any pending reservations not yet checked out.
  async fetchOpenOrders(): Promise<CheqroomRecord[]> {
    const [open, creating] = await Promise.all([
      this.paginate("orders", {
        status: "open",
        _fields: "_id,number,status,started,due,overdue,customer,itemSummary,notes"
      }),
      this.paginate("orders", {
        status: "creating",
        _fields: "_id,number,status,started,due,overdue,customer,itemSummary,notes"
      })
    ]);
    return [...open, ...creating];
  }

  // Build a customer ID → { name, email } lookup map.
  async fetchCustomerMap(): Promise<CustomerMap> {
    const rows = await this.paginate("customers", { _fields: "_id,name,email" });
    const map: CustomerMap = new Map();
    for (const row of rows) {
      const id = String((row as Record<string, unknown>)._id ?? "");
      const name = String((row as Record<string, unknown>).name ?? "").trim();
      const email = String((row as Record<string, unknown>).email ?? "").trim() || undefined;
      if (id && name) {
        map.set(id, { name, email });
      }
    }
    return map;
  }
}
