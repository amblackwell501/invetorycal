import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);

function env(name, fallback = '') {
  const value = process.env[name];
  return value == null || value === '' ? fallback : value;
}

function boolEnv(name, fallback) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(env(name, String(fallback)).toLowerCase());
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\'', '&#39;');
}

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  const contentType = String(req.headers['content-type'] || '');
  return accept.includes('text/html') || contentType.includes('application/x-www-form-urlencoded');
}

async function readPayload(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};

  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function first(body, keys) {
  for (const key of keys) {
    const value = body[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function requireSecret(req, body) {
  const configured = env('WEBHOOK_SECRET');
  if (!configured) {
    const error = new Error('WEBHOOK_SECRET is not configured.');
    error.status = 500;
    throw error;
  }

  const url = new URL(req.url, 'http://localhost');
  const provided = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || url.searchParams.get('secret') || body.secret;
  if (provided !== configured) {
    const error = new Error('Invalid approval secret.');
    error.status = 401;
    throw error;
  }
}

function normalizeSubmission(body) {
  const name = first(body, ['name', 'fullName', 'full_name', 'First and Last Name', 'firstAndLastName']);
  const email = first(body, ['email', 'uarkEmail', 'uark_email', 'UARK Email Address', 'responderEmail', 'Responder\'s Email', 'Responders\' Email']).toLowerCase();
  const phone = first(body, ['phone', 'phoneNumber', 'Phone Number']);
  const affiliation = first(body, ['affiliation', 'School of Art affiliation', 'schoolOfArtAffiliation']);
  const scoreText = first(body, ['score', 'quizScore', 'Score']);
  const score = scoreText === '' ? null : Number(scoreText);

  return {
    name,
    email,
    phone,
    affiliation,
    score: Number.isFinite(score) ? score : null,
    source: first(body, ['source', 'formName']) || 'Microsoft Forms'
  };
}

function validateSubmission(submission) {
  if (!submission.name || submission.name.length < 4) {
    const error = new Error('Missing or invalid name.');
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
    const error = new Error('Missing or invalid email.');
    error.status = 400;
    throw error;
  }

  const allowedDomain = env('ALLOWED_EMAIL_DOMAIN', 'uark.edu').toLowerCase();
  if (allowedDomain && !submission.email.endsWith(`@${allowedDomain}`)) {
    const error = new Error(`Email must be an @${allowedDomain} address.`);
    error.status = 400;
    throw error;
  }

  const minScore = Number(env('MIN_SCORE', '0'));
  if (Number.isFinite(minScore) && minScore > 0) {
    if (submission.score == null) {
      const error = new Error('Quiz score is required by MIN_SCORE but was not provided.');
      error.status = 400;
      throw error;
    }
    if (submission.score < minScore) {
      return { skip: true, reason: `Score ${submission.score} is below required minimum ${minScore}.` };
    }
  }

  return { skip: false };
}

function cheqroomUrl(collection, action = '') {
  const baseUrl = env('CHEQROOM_BASE_URL', 'https://app.cheqroom.com/api/v2_5').replace(/\/+$/, '');
  const apiKey = env('CHEQROOM_API_KEY');
  const linkedUserId = env('CHEQROOM_LINKED_USER_ID');
  const workspace = env('CHEQROOM_WORKSPACE', 'uark');
  const tokenType = env('CHEQROOM_TOKEN_TYPE', 'null');
  const authStyle = env('CHEQROOM_AUTH_STYLE', 'linked-user-bearer');
  const template = env('CHEQROOM_CREATE_URL_TEMPLATE');
  const suffix = action ? `/${action}` : '';

  if (template) {
    return template
      .replaceAll('{baseUrl}', baseUrl)
      .replaceAll('{workspace}', encodeURIComponent(workspace))
      .replaceAll('{linkedUserId}', encodeURIComponent(linkedUserId))
      .replaceAll('{apiKey}', encodeURIComponent(apiKey))
      .replaceAll('{tokenType}', encodeURIComponent(tokenType))
      .replaceAll('{collection}', encodeURIComponent(collection))
      .replaceAll('{action}', encodeURIComponent(action));
  }

  if (!apiKey) throw new Error('CHEQROOM_API_KEY is not configured.');

  if (authStyle === 'linked-user-bearer') {
    if (!linkedUserId) throw new Error('CHEQROOM_LINKED_USER_ID is required.');
    return `${baseUrl}/${encodeURIComponent(linkedUserId)}/null/jwt/${collection}${suffix}`;
  }

  if (authStyle === 'bearer') return `${baseUrl}/${collection}${suffix}`;

  return `${baseUrl}/${encodeURIComponent(workspace)}/${encodeURIComponent(apiKey)}/${encodeURIComponent(tokenType)}/${collection}${suffix}`;
}

function cheqroomHeaders() {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json'
  };

  if (['bearer', 'linked-user-bearer'].includes(env('CHEQROOM_AUTH_STYLE', 'linked-user-bearer'))) {
    headers.authorization = `Bearer ${env('CHEQROOM_API_KEY')}`;
  }

  return headers;
}

async function createCheqroomUser(submission) {
  const payload = {
    name: submission.name,
    email: submission.email,
    role: env('CHEQROOM_ROLE', 'selfservice'),
    invite: boolEnv('CHEQROOM_INVITE', true),
    createCustomer: boolEnv('CHEQROOM_CREATE_CUSTOMER', true)
  };

  const response = await fetch(cheqroomUrl('users', 'create'), {
    method: 'POST',
    headers: cheqroomHeaders(),
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = String(text || '').toLowerCase();
    if ((response.status === 400 || response.status === 422) && message.includes('email') && (message.includes('exist') || message.includes('duplicate'))) {
      return { status: 'already_exists', cheqroomStatus: response.status, cheqroom: data };
    }

    const error = new Error(`Cheqroom returned HTTP ${response.status}.`);
    error.status = 502;
    error.cheqroomStatus = response.status;
    error.cheqroomBody = data;
    throw error;
  }

  return { status: 'created', cheqroomStatus: response.status, cheqroom: data };
}

async function diagnoseCheqroom() {
  const response = await fetch(`${cheqroomUrl('users')}?_limit=1&_fields=_id,name,email,role`, {
    method: 'GET',
    headers: cheqroomHeaders()
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, bodySnippet: text.slice(0, 500) };
}

function resultPage(title, message, status = '') {
  return `<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>${esc(title)}</title>
  <style>
    body{margin:0;background:#f6f7f9;color:#172033;font-family:Arial,sans-serif}main{max-width:680px;margin:0 auto;padding:40px 18px}section{background:#fff;border:1px solid #dde2ea;border-radius:8px;padding:24px}h1{font-size:24px;margin:0 0 10px}p{line-height:1.45}code{background:#eef2f7;padding:2px 5px;border-radius:4px}
  </style>
</head>
<body><main><section><h1>${esc(title)}</h1><p>${esc(message)}</p>${status ? `<p>Status: <code>${esc(status)}</code></p>` : ''}</section></main></body>
</html>`;
}

function approvalPage(url) {
  const p = url.searchParams;
  const fields = {
    source: p.get('source') || 'School of Art Equipment Checkout Registration & Policy Quiz',
    name: p.get('name') || '',
    email: p.get('email') || '',
    phone: p.get('phone') || '',
    affiliation: p.get('affiliation') || '',
    score: p.get('score') || ''
  };

  return `<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>Create Cheqroom Account</title>
  <style>
    body{margin:0;background:#f6f7f9;color:#172033;font-family:Arial,sans-serif}main{max-width:720px;margin:0 auto;padding:32px 18px}form{background:#fff;border:1px solid #dde2ea;border-radius:8px;padding:22px}h1{font-size:24px;margin:0 0 6px}.hint{color:#526070;font-size:14px;line-height:1.45}label{display:block;font-weight:700;margin-top:14px}input{box-sizing:border-box;width:100%;margin-top:6px;padding:10px 12px;border:1px solid #c9d1de;border-radius:6px;font-size:16px}button{margin-top:20px;padding:11px 16px;border:0;border-radius:6px;background:#1d4ed8;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  </style>
</head>
<body>
  <main>
    <h1>Create Cheqroom Account</h1>
    <p class='hint'>Review the borrower details, enter the approval secret, then create the Cheqroom self-service account.</p>
    <form method='post' action='/forms/cheqroom-user'>
      <input type='hidden' name='source' value='${esc(fields.source)}'>
      <label>First and Last Name<input name='name' value='${esc(fields.name)}' required></label>
      <label>UARK Email Address<input name='email' type='email' value='${esc(fields.email)}' required></label>
      <label>Phone Number<input name='phone' value='${esc(fields.phone)}'></label>
      <label>School of Art affiliation<input name='affiliation' value='${esc(fields.affiliation)}'></label>
      <label>Quiz Score<input name='score' value='${esc(fields.score)}'></label>
      <label>Approval Secret<input name='secret' type='password' autocomplete='current-password' required></label>
      <button type='submit'>Create Cheqroom Account</button>
    </form>
  </main>
</body>
</html>`;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    return sendHtml(res, 200, resultPage('Cheqroom Forms Bridge', 'Use /approve with name and email query parameters to review and create a Cheqroom account.'));
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'cheqroom-forms-bridge' });
  }

  if (req.method === 'GET' && url.pathname === '/approve') {
    return sendHtml(res, 200, approvalPage(url));
  }

  if (req.method === 'POST' && url.pathname === '/forms/cheqroom-user') {
    const body = await readPayload(req);
    requireSecret(req, body);
    const submission = normalizeSubmission(body);
    const validation = validateSubmission(submission);

    if (validation.skip) {
      return sendJson(res, 202, { ok: true, status: 'skipped', reason: validation.reason, submission });
    }

    const result = await createCheqroomUser(submission);
    if (wantsHtml(req)) {
      return sendHtml(res, 200, resultPage('Cheqroom Account Request Complete', `${submission.name} (${submission.email}) was processed by Cheqroom.`, result.status));
    }

    return sendJson(res, 200, { ok: true, ...result, submission });
  }

  if (req.method === 'POST' && url.pathname === '/diagnostics/cheqroom') {
    const body = await readPayload(req);
    requireSecret(req, body);
    const result = await diagnoseCheqroom();
    return sendJson(res, result.ok ? 200 : 502, { ok: result.ok, cheqroomStatus: result.status, bodySnippet: result.bodySnippet });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found.' });
}

http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (wantsHtml(req)) return sendHtml(res, error.status || 500, resultPage('Request Failed', error.message));
    sendJson(res, error.status || 500, {
      ok: false,
      error: error.message,
      cheqroomStatus: error.cheqroomStatus,
      cheqroomBody: error.cheqroomBody
    });
  });
}).listen(PORT, () => {
  console.log(`cheqroom-forms-bridge listening on ${PORT}`);
});
