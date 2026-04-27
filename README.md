# InvetoryCal

## Cheqroom Outlook Calendar Feed

This service builds a live iCalendar feed from Cheqroom reservation and checkout data so Outlook can subscribe and display short busy windows for equipment pickup and drop-off moments.

### Feed URLs

- `/calendar/cheqroom-reservations.ics?token=YOUR_CALENDAR_FEED_SECRET`
- `/calendar/cheqroom-reservations.ical?token=YOUR_CALENDAR_FEED_SECRET`

Both URLs return identical calendar content.

### What The Feed Does

- Uses `America/Chicago` timezone by default.
- Includes records from `2026-04-01` onward.
- Creates exactly 5-minute events.
- Generates pickup events from Cheqroom orders with status `creating`.
- Generates drop-off events from Cheqroom orders with status `open`.
- Marks open orders as overdue when `due < now`.
- Removes excluded statuses from the live feed.
- Marks events as busy in Outlook with:
  - `STATUS:CONFIRMED`
  - `TRANSP:OPAQUE`
  - `X-MICROSOFT-CDO-BUSYSTATUS:BUSY`
- Uses stable UIDs so subscribed Outlook events update instead of duplicating.

### Security

- Feed URLs require the `token` query parameter.
- Missing/wrong token returns `401`.
- Secrets are loaded from environment variables.
- API keys are never logged.

### Refresh Behavior

- Server refreshes and caches Cheqroom data hourly (configurable).
- Endpoints can be requested anytime.
- Manual cache bypass for local testing only:
  - `?token=...&forceRefresh=1`
- `forceRefresh` is blocked in production.
- If Cheqroom fails, the service keeps serving the last successful cache.
- If no cache exists yet and fetch fails, service returns a valid empty calendar.

### Outlook Subscription Steps

1. Open Outlook Calendar.
2. Add calendar.
3. Subscribe from web.
4. Paste the full calendar URL with token.
5. Name it `SoA Equipment Checkout`.
6. Save.

Outlook controls subscription refresh timing. The server refreshes Cheqroom data every hour, but Outlook may not display changes immediately.

### Required Environment Variables

- `CHEQROOM_API_KEY`
- `CHEQROOM_LINKED_USER_ID`
- `CALENDAR_FEED_SECRET`

### Optional Environment Variables

- `CHEQROOM_USER_ID`
- `CHEQROOM_BASE_URL` (default: `https://api.cheqroom.com/api/v2_5`)
- `CHEQROOM_TIMESTAMPS_AS_LOCAL` (default: `true`)
- `CALENDAR_TIMEZONE` (default: `America/Chicago`)
- `CALENDAR_EVENT_DURATION_MINUTES` (default: `5`)
- `CALENDAR_START_DATE` (default: `2026-04-01`)
- `CALENDAR_REFRESH_MINUTES` (default: `60`)
- `CALENDAR_LOOKAHEAD_DAYS` (default: `365`)
- `PORT` (default: `3000`)

### Deploy + Custom Domain (andrewmacraeblackwell.com)

Use a subdomain for the calendar feed so your main website can stay as-is.

Recommended URL:

- `https://calendar.andrewmacraeblackwell.com/calendar/cheqroom-reservations.ics?token=YOUR_CALENDAR_FEED_SECRET`

#### 1. Deploy on Render

1. Push this repo to GitHub.
2. In Render, create a new **Web Service** from your repo.
3. Use these settings:
  - Build command: `npm ci && npm run build`
  - Start command: `npm start`
  - Runtime: `Node`
4. Add environment variables in Render dashboard:
  - `CHEQROOM_API_KEY`
  - `CHEQROOM_LINKED_USER_ID`
  - `CALENDAR_FEED_SECRET`
  - `CHEQROOM_BASE_URL=https://api.cheqroom.com/api/v2_5`
  - `CALENDAR_TIMEZONE=America/Chicago`
  - `CHEQROOM_TIMESTAMPS_AS_LOCAL=true`
5. Deploy. Confirm service health at:
  - `https://<your-render-service>.onrender.com/health`

#### 2. Attach your custom subdomain

1. In Render service settings, open **Custom Domains**.
2. Add `calendar.andrewmacraeblackwell.com`.
3. Render will give DNS target values.
4. In your DNS provider for `andrewmacraeblackwell.com`, create the record Render asks for (usually CNAME for `calendar`).
5. Wait for DNS/SSL to finish provisioning.

#### 3. Test the live ICS URL

After DNS is active, open:

- `https://calendar.andrewmacraeblackwell.com/calendar/cheqroom-reservations.ics?token=YOUR_CALENDAR_FEED_SECRET`

You should see plain calendar text starting with `BEGIN:VCALENDAR`.

#### 4. Subscribe in Outlook

1. Outlook Calendar -> Add calendar -> Subscribe from web.
2. Paste the HTTPS URL above.
3. Save.

Do not use `localhost` in Outlook web subscription. Outlook cannot reach your local machine.

### Local Run

```bash
npm install
npm run dev
```

Local test URLs (default port):

- `http://localhost:3000/calendar/cheqroom-reservations.ics?token=YOUR_CALENDAR_FEED_SECRET`
- `http://localhost:3000/calendar/cheqroom-reservations.ical?token=YOUR_CALENDAR_FEED_SECRET`
