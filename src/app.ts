import express, { Request, Response } from "express";
import type { CalendarConfig } from "./config";
import { CalendarFeedService } from "./calendar/service";

function isAuthorized(request: Request, secret: string): boolean {
  const token = request.query.token;
  return typeof token === "string" && token === secret;
}

function parseForceRefresh(request: Request): boolean {
  const value = request.query.forceRefresh ?? request.query.refresh;
  if (typeof value !== "string") {
    return false;
  }

  return ["1", "true", "yes"].includes(value.toLowerCase());
}

export function createApp(config: CalendarConfig, service: CalendarFeedService): express.Express {
  const app = express();

  app.get(["/calendar/cheqroom-reservations.ics", "/calendar/cheqroom-reservations.ical"], async (request: Request, response: Response) => {
    if (!isAuthorized(request, config.calendarFeedSecret)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const wantsForceRefresh = parseForceRefresh(request);
    if (wantsForceRefresh && config.nodeEnv === "production") {
      response.status(403).json({ error: "Force refresh is only allowed outside production." });
      return;
    }

    if (wantsForceRefresh) {
      // Manual cache bypass for local testing, still requiring a valid token.
      console.info("[calendar] Force refresh requested.");
    }

    const ics = await service.getCalendarText({ forceRefresh: wantsForceRefresh });
    response.setHeader("Content-Type", "text/calendar; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.status(200).send(ics);
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({ ok: true });
  });

  // Debug endpoint — blocked in production, protected by the same token.
  app.get("/debug/status", async (request: Request, response: Response) => {
    if (!isAuthorized(request, config.calendarFeedSecret)) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (config.nodeEnv === "production") {
      response.status(403).json({ error: "Debug is only available outside production." });
      return;
    }
    const forceRefresh = parseForceRefresh(request);
    if (forceRefresh) {
      await service.getCalendarText({ forceRefresh: true });
    }
    response.status(200).json(service.getDebugInfo());
  });

  // Sample a few raw orders for field mapping — local only.

  return app;
}
