import type { CalendarConfig } from "../config";
import { buildCalendar } from "./ics";
import { CheqroomClient } from "../cheqroom/client";
import type { CustomerMap } from "../cheqroom/client";
import { normalizeOrders } from "../cheqroom/mapper";
import type { CalendarMoment } from "../types";

type CacheState = {
  moments: CalendarMoment[];
  generatedAt: Date;
  debugInfo: { totalOrders: number; statusCounts: Record<string, number> };
};

export class CalendarFeedService {
  private cache: CacheState | undefined;
  private refreshInFlight: Promise<void> | undefined;

  constructor(
    private readonly config: CalendarConfig,
    private readonly cheqroomClient: CheqroomClient = new CheqroomClient(config)
  ) {}

  private cacheIsFresh(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cache.generatedAt.getTime() < this.config.refreshMinutes * 60_000;
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const [orders, customerMap] = await Promise.all([
          this.cheqroomClient.fetchOpenOrders(),
          this.cheqroomClient.fetchCustomerMap()
        ]);

        const statusCounts: Record<string, number> = {};
        for (const row of orders) {
          const s = String((row as Record<string, unknown>).status ?? "unknown");
          statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        }
        console.info(`[calendar] Fetched ${orders.length} orders. Statuses:`, statusCounts);

        const moments = normalizeOrders(orders, { config: this.config, customerMap });
        moments.sort((a, b) => a.start.getTime() - b.start.getTime());

        console.info(`[calendar] Generated ${moments.length} calendar events.`);

        this.cache = {
          moments,
          generatedAt: new Date(),
          debugInfo: { totalOrders: orders.length, statusCounts }
        };
      } catch (error) {
        console.error("[calendar] Cheqroom refresh failed.", error);
        if (!this.cache) {
          this.cache = { moments: [], generatedAt: new Date(), debugInfo: { totalOrders: 0, statusCounts: {} } };
          console.warn("[calendar] Serving empty calendar — no successful cache yet.");
        }
      } finally {
        this.refreshInFlight = undefined;
      }
    })();

    return this.refreshInFlight;
  }

  getDebugInfo(): { cached: boolean; generatedAt?: Date; totalOrders?: number; statusCounts?: Record<string, number>; eventCount: number } {
    return {
      cached: !!this.cache,
      generatedAt: this.cache?.generatedAt,
      totalOrders: this.cache?.debugInfo?.totalOrders,
      statusCounts: this.cache?.debugInfo?.statusCounts,
      eventCount: this.cache?.moments.length ?? 0
    };
  }

  async getCalendarText(options?: { forceRefresh?: boolean }): Promise<string> {
    if ((options?.forceRefresh ?? false) || !this.cacheIsFresh()) {
      await this.refresh();
    }
    return buildCalendar(this.cache?.moments ?? [], this.config);
  }

  startBackgroundRefresh(): NodeJS.Timeout {
    void this.refresh();
    return setInterval(() => { void this.refresh(); }, this.config.refreshMinutes * 60_000);
  }
}
