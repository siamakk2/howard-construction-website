// Lead capture endpoint for Howard Construction Inc.
//
// Two independent delivery paths, so a lead is never silently lost:
//   1. Persist to Upstash Redis (already configured for accounts.js).
//   2. Email to info@howardconstructioninc.com via Resend, if configured.
//
// The response reports what actually succeeded. The client only shows
// "received" when the server confirms the lead was captured somewhere.

const TO_EMAIL = 'info@howardconstructioninc.com';
const FROM_EMAIL = 'website@howardconstructioninc.com';

const FIELDS = [
  'firstName', 'lastName', 'phone', 'email', 'projectAddress',
  'projectType', 'budget', 'startDate', 'details', 'source',
];

function clean(v, max = 2000) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // Honeypot: real users never fill this. Return success so bots don't retry.
    if (clean(body.company)) return res.status(200).json({ ok: true });

    const data = {};
    for (const f of FIELDS) data[f] = clean(body[f], f === 'details' ? 5000 : 200);

    const missing = ['firstName', 'lastName', 'phone', 'email', 'projectAddress', 'projectType']
      .filter(f => !data[f]);
    if (missing.length) {
      return res.status(400).json({ ok: false, error: 'Please complete all required fields.', missing });
    }
    if (!EMAIL_RE.test(data.email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    data.submittedAt = new Date().toISOString();
    data.userAgent = clean(req.headers['user-agent'] || '', 300);
    data.ip = clean(
      (req.headers['x-forwarded-for'] || '').split(',')[0] || '', 60);

    const id = 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let stored = false;
    let emailed = false;

    // ---- 1. Persist ------------------------------------------------
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        const base = url.replace(/\/+$/, '');
        const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
        await fetch(base + '/set/' + id, {
          method: 'POST', headers: auth, body: JSON.stringify(data),
        });
        await fetch(base + '/lpush/hci_leads/' + encodeURIComponent(id), {
          method: 'POST', headers: auth,
        });
        stored = true;
      } catch (e) {
        console.error('lead store failed', e);
      }
    }

    // ---- 2. Email --------------------------------------------------
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const rows = [
        ['Name', data.firstName + ' ' + data.lastName],
        ['Phone', data.phone],
        ['Email', data.email],
        ['Project address', data.projectAddress],
        ['Project type', data.projectType],
        ['Budget', data.budget || '—'],
        ['Desired start', data.startDate || '—'],
        ['Submitted from', data.source || 'website'],
        ['Received', data.submittedAt],
      ].map(([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#4A5568;white-space:nowrap;">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#0A1628;font-weight:600;">${escapeHtml(v)}</td></tr>`
      ).join('');

      const html =
        `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:620px;">
           <h2 style="color:#0A1628;margin:0 0 4px;">New project request</h2>
           <p style="color:#4A5568;margin:0 0 18px;">From howardconstructioninc.com</p>
           <table style="border-collapse:collapse;font-size:15px;">${rows}</table>
           ${data.details ? `<h3 style="color:#0A1628;margin:22px 0 6px;">Project details</h3>
             <p style="color:#0A1628;line-height:1.6;white-space:pre-wrap;">${escapeHtml(data.details)}</p>` : ''}
           <p style="margin-top:24px;">
             <a href="tel:${escapeHtml(data.phone.replace(/[^0-9+]/g, ''))}"
                style="background:#F9A825;color:#0A1628;padding:11px 20px;border-radius:6px;
                       text-decoration:none;font-weight:700;">Call ${escapeHtml(data.firstName)}</a>
           </p>
         </div>`;

      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + resendKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Howard Construction Website <' + FROM_EMAIL + '>',
            to: [TO_EMAIL],
            reply_to: data.email,
            subject: `New ${data.projectType} request — ${data.firstName} ${data.lastName} (${data.projectAddress})`,
            html,
          }),
        });
        emailed = r.ok;
        if (!r.ok) console.error('resend failed', r.status, await r.text());
      } catch (e) {
        console.error('resend threw', e);
      }
    }

    if (!stored && !emailed) {
      // Nothing captured it. Tell the truth so the visitor can call instead.
      return res.status(500).json({
        ok: false,
        error: 'We could not submit your request. Please call (707) 578-6565.',
      });
    }

    return res.status(200).json({ ok: true, id, stored, emailed });
  } catch (err) {
    console.error('contact handler error', err);
    return res.status(500).json({
      ok: false,
      error: 'Something went wrong. Please call (707) 578-6565.',
    });
  }
};
