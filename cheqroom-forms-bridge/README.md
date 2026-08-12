# Cheqroom Forms Bridge

A tiny Node service for creating Cheqroom self-service users from reviewed Microsoft Forms responses.

This exists because Power Automate's generic HTTP action requires Premium. With this bridge, Microsoft Forms or SharePoint can remain the review/approval place, while Render performs the Cheqroom API call without exposing the Cheqroom API key in Microsoft 365.

## Render settings

Create a Render Web Service with these settings:

- Repository: `amblackwell501/invetorycal`
- Root directory: `cheqroom-forms-bridge`
- Runtime: `Node`
- Build command: `npm install`
- Start command: `npm start`
- Plan: Free is enough for manual approvals

## Environment variables

Set these in Render, not in GitHub:

- `WEBHOOK_SECRET`: long approval secret staff enter on the approval page
- `CHEQROOM_API_KEY`: Cheqroom API key
- `CHEQROOM_LINKED_USER_ID`: Cheqroom linked user id
- `CHEQROOM_BASE_URL`: `https://app.cheqroom.com/api/v2_5`
- `CHEQROOM_WORKSPACE`: `uark`
- `CHEQROOM_AUTH_STYLE`: `linked-user-bearer`
- `CHEQROOM_TOKEN_TYPE`: `null`
- `CHEQROOM_ROLE`: `selfservice`
- `CHEQROOM_INVITE`: `true`
- `CHEQROOM_CREATE_CUSTOMER`: `true`
- `ALLOWED_EMAIL_DOMAIN`: `uark.edu`
- `MIN_SCORE`: `0` for staff-reviewed manual approvals

## Staff approval page

Open this shape of URL after replacing the Render hostname and query values:

```text
https://YOUR-RENDER-SERVICE.onrender.com/approve?name=FIRST%20LAST&email=USER%40uark.edu&phone=OPTIONAL&affiliation=OPTIONAL&score=OPTIONAL
```

The page asks for the approval secret before creating the Cheqroom user.

## API endpoints

Health check:

```text
GET /health
```

Create user with JSON:

```text
POST /forms/cheqroom-user
x-webhook-secret: WEBHOOK_SECRET
content-type: application/json
```

```json
{
  "name": "Test Student",
  "email": "test@uark.edu",
  "phone": "555-0100",
  "affiliation": "Undergraduate Student",
  "score": 34
}
```

Cheqroom diagnostic:

```text
POST /diagnostics/cheqroom
x-webhook-secret: WEBHOOK_SECRET
```
