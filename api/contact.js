// Lead capture endpoint for Howard Construction Inc.
//
// Two independent delivery paths, so a lead is never silently lost:
//   1. Persist to Upstash Redis (already configured for accounts.js).
//   2. Email to info@howardconstructioninc.com via Resend, if configured.
//
// The response reports what actually succeeded. The client only shows
// "received" when the server confirms the lead was captured somewhere.

// Both are overridable by environment variable. If the sending domain is not
// yet verified in Resend, every send from website@howardconstructioninc.com is
// rejected — setting FROM_EMAIL=onboarding@resend.dev gets leads flowing
// immediately while DNS verification completes.
// Pasted environment values routinely carry trailing whitespace or newlines,
// especially from a phone. A newline inside a mail header is both invalid and
// a header-injection vector, so strip all CR/LF and surrounding whitespace.
function cleanAddr(v, fallback) {
  const s = String(v == null ? '' : v).replace(/[\r\n]+/g, '').trim();
  return s || fallback;
}
const TO_EMAIL = cleanAddr(process.env.LEAD_TO_EMAIL, 'info@howardconstructioninc.com');
const FROM_EMAIL = cleanAddr(process.env.LEAD_FROM_EMAIL, 'website@howardconstructioninc.com');

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

// Only our own origins may post to this endpoint. Blocks the trivial case of
// a third-party page scripting our form to send mail on our behalf.
const ALLOWED_ORIGINS = [
  'https://www.howardconstructioninc.com',
  'https://howardconstructioninc.com'
];

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// Fixed-window rate limit in Upstash: 5 submissions per IP per 10 minutes.
// Fails OPEN — if the store is unreachable we would rather accept a real lead
// than reject it, since this endpoint is the business's primary intake.
async function rateLimited(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const base = url.replace(/\/+$/, '');
    const auth = { Authorization: 'Bearer ' + token };
    const win = Math.floor(Date.now() / 600000);
    const key = 'rl:contact:' + win + ':' +
      require('crypto').createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 24);
    const r = await fetch(base + '/incr/' + key, { headers: auth });
    const out = await r.json();
    const hits = Number(out && out.result) || 0;
    if (hits === 1) {
      await fetch(base + '/expire/' + key + '/900', { headers: auth });
    }
    return hits > 5;
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  // Reject cross-site posts. Same-origin form submissions from our own pages
  // send a matching Origin; requests with no Origin at all are allowed through
  // so that non-browser clients and older browsers are not broken.
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) === -1) {
    return res.status(403).json({ ok: false, error: 'Forbidden.' });
  }

  if (await rateLimited(req)) {
    res.setHeader('Retry-After', '600');
    return res.status(429).json({
      ok: false,
      error: 'Too many requests. Please call (707) 578-6565 if this is urgent.'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // Honeypot: real users never fill this. Return success so bots don't retry.
    // Honeypot. Deliberately named so browser autofill has nothing to match:
    // the previous field was called "company" with a visible "Company" label,
    // which mobile autofill filled in for real users — silently discarding
    // their submission. Log every trigger so a false positive is never silent.
    if (clean(body.hp_ref_code)) {
      console.error('HONEYPOT TRIGGERED — submission discarded', JSON.stringify({
        ip: clean(req.headers['x-forwarded-for'] || '', 60),
        ua: clean(req.headers['user-agent'] || '', 120),
        firstName: clean(body.firstName, 40),
        email: clean(body.email, 60),
      }));
      return res.status(200).json({ ok: true });
    }

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
        const w1 = await fetch(base + '/set/' + id, {
          method: 'POST', headers: auth, body: JSON.stringify(data),
        });
        const w2 = await fetch(base + '/lpush/hci_leads/' + encodeURIComponent(id), {
          method: 'POST', headers: auth,
        });
        // fetch() does not throw on 4xx/5xx. Without checking .ok, a rejected
        // write (bad token, quota) still marked the lead as stored, which made
        // the handler report success while the lead was lost.
        stored = w1.ok && w2.ok;
        if (!stored) {
          console.error('lead store rejected', w1.status, w2.status, await w1.text());
        }
      } catch (e) {
        console.error('lead store failed', e);
      }
    } else {
      console.error('lead store skipped: UPSTASH env vars not configured');
    }

    // ---- 2. Email --------------------------------------------------
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error('EMAIL SKIPPED: RESEND_API_KEY not configured — lead not delivered');
    }
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
           <div style="background:#F9A825;color:#0A1628;padding:10px 16px;border-radius:6px;
                       font-weight:800;letter-spacing:.06em;font-size:13px;margin-bottom:18px;">
             WEBSITE LEAD &mdash; howardconstructioninc.com
           </div>
           <h2 style="color:#0A1628;margin:0 0 4px;">New project request</h2>
           <p style="color:#4A5568;margin:0 0 18px;">
             Submitted through the Free Estimate form on your website.
           </p>
           <table style="border-collapse:collapse;font-size:15px;">${rows}</table>
           ${data.details ? `<h3 style="color:#0A1628;margin:22px 0 6px;">Project details</h3>
             <p style="color:#0A1628;line-height:1.6;white-space:pre-wrap;">${escapeHtml(data.details)}</p>` : ''}
           <p style="margin-top:24px;">
             <a href="tel:${escapeHtml(data.phone.replace(/[^0-9+]/g, ''))}"
                style="background:#F9A825;color:#0A1628;padding:11px 20px;border-radius:6px;
                       text-decoration:none;font-weight:700;">Call ${escapeHtml(data.firstName)}</a>
           </p>
           <p style="color:#8A97A6;font-size:12px;margin-top:26px;border-top:1px solid #E2E8F0;padding-top:12px;">
             Reference ${escapeHtml(id)} &middot; Reply to this email to answer ${escapeHtml(data.firstName)} directly.
           </p>
         </div>`;

      // "[WEBSITE LEAD]" makes these unmistakable in the inbox and filterable.
      const subject =
        `[WEBSITE LEAD] ${data.projectType} — ${data.firstName} ${data.lastName} (${data.projectAddress})`;

      async function sendLead() {
        return fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + resendKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Howard Construction Website <' + FROM_EMAIL + '>',
            to: [TO_EMAIL],
            reply_to: data.email,
            subject,
            html,
          }),
        });
      }

      try {
        let r = await sendLead();
        if (!r.ok) {
          const detail = await r.text();
          console.error('resend failed', r.status, detail);
          // One retry — transient 429/5xx from the mail API should not lose a lead.
          if (r.status === 429 || r.status >= 500) {
            await new Promise(res2 => setTimeout(res2, 600));
            r = await sendLead();
            if (!r.ok) console.error('resend retry failed', r.status, await r.text());
          }
        }
        emailed = r.ok;
      } catch (e) {
        console.error('resend threw', e);
      }

      // Confirmation to the person who submitted, so they know it arrived.
      if (emailed) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + resendKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Howard Construction Inc. <' + FROM_EMAIL + '>',
              to: [data.email],
              reply_to: TO_EMAIL,
              subject: 'We received your request — Howard Construction Inc.',
              html:
                `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;color:#0A1628;">
                   <h2 style="margin:0 0 12px;">Thanks, ${escapeHtml(data.firstName)}.</h2>
                   <p style="color:#2D3748;line-height:1.6;">
                     We have your request for <strong>${escapeHtml(data.projectType)}</strong>
                     at ${escapeHtml(data.projectAddress)}. Philip Howard reviews every enquiry
                     personally and will call or email you within one business day.
                   </p>
                   <p style="color:#2D3748;line-height:1.6;">
                     If it's urgent, call him directly on
                     <a href="tel:+17075786565" style="color:#1565C0;font-weight:700;">(707) 578-6565</a>.
                   </p>
                   <p style="color:#8A97A6;font-size:12px;margin-top:26px;border-top:1px solid #E2E8F0;padding-top:12px;">
                     Howard Construction Inc. &middot; CA Lic. #836369 &middot; Santa Rosa, CA<br>
                     Reference ${escapeHtml(id)}
                   </p>
                 </div>`,
            }),
          });
        } catch (e) {
          console.error('confirmation email failed', e);   // non-fatal
        }
      }
    }

    // Email is the only channel Philip actually monitors. If it did not go out,
    // the lead is effectively lost even when it is sitting in storage — so say
    // so rather than showing a success message the visitor will act on.
    if (!emailed) {
      console.error('LEAD NOT DELIVERED', id, JSON.stringify({ stored, emailed }));
      return res.status(500).json({
        ok: false,
        error: 'We could not send your request. Please call (707) 578-6565 — we do not want to miss you.',
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
