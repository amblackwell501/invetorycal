import "dotenv/config";
import { getConfig } from "./config";
import { CalendarFeedService } from "./calendar/service";
import { createApp } from "./app";

const config = getConfig();
const service = new CalendarFeedService(config);
const app = createApp(config, service);
const timer = service.startBackgroundRefresh();

const server = app.listen(config.port, () => {
  console.log(`[calendar] Listening on port ${config.port}`);
});

function shutdown(): void {
  clearInterval(timer);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
